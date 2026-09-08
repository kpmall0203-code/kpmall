/**
 * 72W_작업실행.gs — 큐를 아마존에 보내고, 따로 확인한다 (기획서 13.1 · 13.2)
 *
 * ── 보낸 것과 그렇게 된 것은 다르다 ─────────────────────
 * 아마존이 200 을 줬다고 그 값이 됐다는 뜻은 아니다. 그래서 실행과 검증을 가른다.
 *
 *   실행:  대기 → (보냄) → 검증대기
 *   검증:  검증대기 → (조회해 대조) → 완료 또는 재시도대기
 *
 * 실행 중에는 조회하지 않는다. 실행 안에서 읽기를 하면 6분을 넘긴다 —
 * 이 코드베이스에서만 네 번 그랬다. 검증은 제 걸음에서 한 번에 모아 조회한다.
 *
 * ── 결과불명은 다시 보내지 않는다 ───────────────────────
 * 보내다 끊기면 받았는지 알 수 없다. 다시 보내면 두 번 바뀌거나 두 개가 생긴다.
 * '결과불명' 으로 두고 검증이 실제 상태를 가져와 판단한다.
 *
 * ── 보내기 직전에 세 가지를 다시 본다 ───────────────────
 *   ① 정책이 아직 [자동운영] 이고 한도가 확정돼 있나
 *   ② 정책 버전이 작업을 만들 때와 같은가
 *   ③ 기대이전값이 지금 값과 같은가 (그 사이 누가 바꿨으면 덮지 않는다)
 * 오래된 계획이 새 마진이나 사람의 중단을 덮어쓰지 못하게 하는 자리다.
 */

var JOB_CONTINUE_HANDLER = 'continueAdJobs';
var JOB_MAX_TRIES = 3;
var JOB_ABORT_AFTER = 5;          // 잇달아 이만큼 실패하면 전체를 멈춘다

/** 되돌릴 수 없는 오류 — 다시 해도 같은 답이 온다 */
var JOB_FATAL = /invalid|malformed|notFound|not found|unauthor|forbidden|permission|eligibility|duplicateValue/i;

/** 큐를 읽어 쓸 수 있는 꼴로 */
function adJobRead_() {
  var sh = ss_().getSheetByName(SHEET_JOB);
  if (!sh || sh.getLastRow() < 2) return null;
  var map = ensureCols_(sh, JOB_HEADER);
  var width = Math.max(sh.getLastColumn(), JOB_HEADER.length);
  return { sh: sh, map: map, width: width,
           rows: sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues() };
}

/**
 * 이 작업을 지금 보내도 되나. 안 되면 왜 안 되는지.
 * @return {string} 빈 문자열이면 보내도 된다
 */
function adJobBlocked_(row, map, pol, curValue) {
  var pid = String(cellOf_(row, map, '정책ID', ''));
  var track = String(cellOf_(row, map, '소유트랙', ''));
  var sku = String(cellOf_(row, map, '상품키', ''));
  var p = adPolicyFor_(pol, track, sku);
  if (!p) return '정책이 없어졌습니다 (' + track + ' · ' + sku + ')';
  if (p.id !== pid) return '정책ID 가 ' + pid + ' → ' + p.id + ' 로 바뀌었습니다';
  var protective = String(cellOf_(row, map, '동작', '')) === '상태변경' &&
                   String(cellOf_(row, map, '목표값', '')) === 'PAUSED';
  // 멈추는 것은 돈을 쓰는 일이 아니라 그만 쓰는 일이다 — 정책 모드·한도를 따지지 않는다
  if (!protective) {
    if (!p.ready) return '정책이 미확정으로 돌아갔습니다: ' + p.miss.join(' · ');
    if (!p.canAuto) return '정책이 ' + p.mode + ' 입니다 — 보내지 않습니다';
  }
  var ver = Number(cellOf_(row, map, '정책버전', 0)) || 0;
  if (p.ver !== ver) return '정책 버전이 ' + ver + ' → ' + p.ver + ' 로 바뀌었습니다';
  var want = cellOf_(row, map, '기대이전값', '');
  if (want !== '' && curValue !== null && Math.abs(Number(want) - Number(curValue)) > 0.001) {
    return '그 사이 값이 바뀌었습니다 (계획할 때 ' + want + ' · 지금 ' + curValue + ')';
  }
  return '';
}

/** 광고그룹의 지금 기본입찰 — 시트에서 읽는다 (실행 중에는 조회하지 않는다) */
function adGroupBidNow_(gid) {
  var sh = ss_().getSheetByName(SHEET_ADGRP);
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][9] || '').trim() !== String(gid)) continue;
    var b = Number(v[i][4]);
    return isFinite(b) ? b : null;
  }
  return null;
}

/**
 * 키워드의 지금 입찰 — 광고구조 수집이 가져다 놓은 값 (시트만 읽는다).
 *
 * 아마존은 키워드에 입찰이 있으면 광고그룹 기본입찰을 쓰지 않는다.
 * 그래서 수동 캠페인의 실제 클릭 값은 여기에 있다.
 */
function adKeywordBidNow_(kid) {
  var sh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (!sh || sh.getLastRow() < 2) return null;
  var map = hdrMap_(sh);
  if (map['대상ID'] === undefined || map['입찰(JPY)'] === undefined) return null;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(cellOf_(v[i], map, '대상ID', '')).trim() !== String(kid)) continue;
    var b = Number(cellOf_(v[i], map, '입찰(JPY)', ''));
    return isFinite(b) && b > 0 ? b : null;
  }
  return null;
}

/** 이 작업이 겨누는 대상의 지금 값 (시트만 읽는다) */
function adJobCurValue_(action, kind, tid) {
  if (action !== '입찰변경') return null;
  if (kind === '광고그룹') return adGroupBidNow_(tid);
  if (kind === '키워드') return adKeywordBidNow_(tid);
  return null;
}

/**
 * 메뉴: 트랙 B 한 바퀴 — 계산 · 상태 점검 · 작업 계획 · 실행.
 *
 * 앞의 셋은 시트만 읽는 계산이라 순서대로 무조건 같이 돈다. 실행은 정책이
 * [자동운영] 인 것과 보호 멈춤만 보낸다 — 나머지는 '모의' 로 남아 아무 데도 안 간다.
 * 지출 원장 수집과 검증은 API 를 읽는 걸음이라 따로 둔다.
 */
function runAdGrowCycle(opts) {
  /**
   * quiet — 시간 트리거가 부르는 길 (72X). 사람에게 묻지 않는다.
   *
   * 묻지 않아도 되는 이유는 "창이 없어서" 가 아니라 승낙이 이미 있어서다:
   * 보낼 수 있는 작업은 정책이 [자동운영] 이고 한도가 다 차고 승인된 대상의 것뿐이다
   * (planAdGrowJobs 가 나머지는 '모의' 로 둔다). 아래의 확인 창은 손으로 누를 때의
   * 예의지 승인 장치가 아니다 — 승인 장치는 광고운영정책 표다.
   *
   * 트리거가 이 함수를 곧바로 부르면 이벤트 객체가 opts 로 들어와 quiet 이 거짓이 된다.
   * 그때는 창을 찾다 '아니오' 를 받아 아무것도 안 보낸다 — 안전한 쪽으로 넘어진다.
   */
  var quiet = !!(opts && opts.quiet);
  if (!adBusyGuard_('트랙 B 한 바퀴')) return null;
  adGrowCalcAll_(true);
  reviewAdGrowState({ quiet: true });
  var plan = planAdGrowJobs({ quiet: true });
  if (!plan) return null;                 // 표를 방금 만들었다 — 다시 누르라고 이미 알렸다
  var q = adJobRead_();
  var nWait = 0;
  if (q) for (var i = 0; i < q.rows.length; i++) {
    var st = String(cellOf_(q.rows[i], q.map, '상태', ''));
    if (st === JOB_WAIT || st === JOB_RETRY) nWait++;
  }
  var head = '새 작업 ' + plan.added + '건' +
             (plan.pause ? ' · 보호 멈춤 ' + plan.pause : '') +
             (plan.dry ? ' · 모의 ' + plan.dry : '');
  if (!nWait) {
    var none = '한 바퀴 — ' + head + ' · 보낼 것 없음';
    log_('ads', 'INFO', none);
    if (quiet) return none;
    showSheet_(SHEET_ADGROW);
    ui_().alert('트랙 B 한 바퀴',
      '계산 · 상태 점검 · 작업 계획을 했습니다.\n' + head + '\n\n' +
      '아마존에 보낼 것은 없습니다 — 정책이 [' + POLICY_MODE_AUTO + '] 이 아니면 계산만 합니다.\n' +
      '광고육성 표의 [단계]·[다음 행동]·[목표클릭비용] 을 보세요.', ui_().ButtonSet.OK);
    return none;
  }
  if (!quiet) {
    var ok = ui_().alert('트랙 B 한 바퀴',
      '계산 · 상태 점검 · 작업 계획을 했습니다.\n' + head + '\n\n' +
      JOB_WAIT + ' ' + nWait + '건을 아마존에 보냅니다. 계속할까요?', ui_().ButtonSet.OK_CANCEL);
    if (ok !== ui_().Button.OK) return null;
    toast_('작업 실행 중…');
  }
  return '한 바퀴 — ' + head + ' · ' + adJobRunStep_(!quiet);
}

/** 메뉴: 대기 중인 작업을 아마존에 보낸다 (한 바퀴 안에 들어 있다. 따로 누를 때) */
function runAdJobs() {
  if (!adBusyGuard_('작업 실행')) return;
  var q = adJobRead_();
  if (!q) { ui_().alert('작업이 없습니다.', '[작업 계획]을 먼저 하세요.', ui_().ButtonSet.OK); return; }

  var nWait = 0, nDry = 0;
  for (var i = 0; i < q.rows.length; i++) {
    var st = String(cellOf_(q.rows[i], q.map, '상태', ''));
    if (st === JOB_WAIT || st === JOB_RETRY) nWait++;
    else if (st === JOB_DRY) nDry++;
  }
  if (!nWait) {
    ui_().alert('보낼 작업이 없습니다.',
      (nDry ? JOB_DRY + ' ' + nDry + '건은 정책이 [' + POLICY_MODE_AUTO + '] 이 아니라 보내지 않습니다.\n' +
              '광고운영정책에서 한도를 정하고 모드를 바꾸면 다음 [작업 계획]에서 ' +
              JOB_WAIT + ' 로 들어옵니다.\n\n' : '') +
      '지금 아마존에 보낼 것은 없습니다.', ui_().ButtonSet.OK);
    return;
  }

  var ok = ui_().alert('작업 실행',
    JOB_WAIT + ' ' + nWait + '건을 아마존에 보냅니다.\n' +
    (nDry ? JOB_DRY + ' ' + nDry + '건은 보내지 않습니다.\n' : '') + '\n' +
    '보내기 직전에 정책·버전·기대이전값을 다시 봅니다.\n' +
    '보낸 뒤에는 [작업 검증]으로 실제로 그 값이 됐는지 확인해야 완료가 됩니다.\n\n' +
    '계속할까요?', ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return;

  toast_('작업 실행 중…');
  adJobRunStep_(true);
}

function continueAdJobs() {
  withLockOrRetry_('작업 실행', JOB_CONTINUE_HANDLER, function () {
    try { adJobRunStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

function adJobScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === JOB_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(JOB_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/** 작업 하나를 아마존에 보낸다. 조회하지 않는다 — 쓰기만 */
function adJobSend_(token, action, targetKind, targetId, to) {
  if (action === '입찰변경' && targetKind === '광고그룹') {
    var res = adsApiRetry_(token, 'put', '/sp/adGroups',
      { adGroups: [{ adGroupId: String(targetId), defaultBid: Number(to) }] },
      ADSW_CT_ADGROUP, ADSW_CT_ADGROUP);
    return adsCreated_(res, 'adGroups', 'adGroupId');
  }
  if (action === '입찰변경' && targetKind === '키워드') {
    /**
     * 키워드 입찰. 수동 캠페인에서는 이것이 실제로 사는 값이다 —
     * 그룹 기본입찰만 바꾸면 아마존은 그것을 보지 않는다.
     */
    var rk = adsApiRetry_(token, 'put', '/sp/keywords',
      { keywords: [{ keywordId: String(targetId), bid: Number(to) }] },
      ADSW_CT_KEYWORD, ADSW_CT_KEYWORD);
    return adsCreated_(rk, 'keywords', 'keywordId');
  }
  if (action === '예산변경' && targetKind === '캠페인') {
    /**
     * 캠페인 일예산. 확대 시험이 '값은 맞는데 예산이 먼저 떨어진다' 고 볼 때 쓴다.
     * ⚠ 예산은 그 캠페인의 모든 상품에 함께 걸린다 — 계획을 세우는 쪽(72AE)이
     * 전용 그룹인지 먼저 가린다. 여기서는 시키는 대로 보낼 뿐이다.
     */
    var rb = adsApiRetry_(token, 'put', '/sp/campaigns',
      { campaigns: [{ campaignId: String(targetId),
                      budget: { budget: Number(to), budgetType: 'DAILY' } }] },
      ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
    return adsCreated_(rb, 'campaigns', 'campaignId');
  }
  if (action === '상태변경' && targetKind === '캠페인') {
    var r2 = adsApiRetry_(token, 'put', '/sp/campaigns',
      { campaigns: [{ campaignId: String(targetId), state: String(to) }] },
      ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
    return adsCreated_(r2, 'campaigns', 'campaignId');
  }
  return { ok: false, ids: [], msg: '모르는 동작 (' + action + ' · ' + targetKind + ')' };
}

/** 시간이 찰 때까지 보낸다 */
function adJobRunStep_(interactive) {
  var t0 = Date.now();
  var q = adJobRead_();
  if (!q) return '작업 표가 없습니다';
  var pol = adPolicyAll_();
  var token = adsToken_();
  var logBuf = adLogBuffer_(ADEXEC_FLUSH_EVERY);

  var okN = 0, blockN = 0, failN = 0, unknownN = 0, left = 0;
  var timeUp = false, aborted = '', streak = 0, dirty = false;
  var now = new Date();

  for (var i = 0; i < q.rows.length; i++) {
    var row = q.rows[i];
    var st = String(cellOf_(row, q.map, '상태', ''));
    if (st !== JOB_WAIT && st !== JOB_RETRY) continue;
    if (aborted) { left++; continue; }
    if (Date.now() - t0 > ADS_SOFT_MS) { timeUp = true; left++; continue; }

    var action = String(cellOf_(row, q.map, '동작', ''));
    var kind = String(cellOf_(row, q.map, '대상종류', ''));
    var tid = String(cellOf_(row, q.map, '대상ID', ''));
    var to = cellOf_(row, q.map, '목표값', '');

    // 보내기 직전에 다시 본다 — 오래된 계획이 새 정책을 덮지 못하게
    var curVal = adJobCurValue_(action, kind, tid);
    var why = adJobBlocked_(row, q.map, pol, curVal);
    if (why) {
      dirty = true; blockN++;
      setCell_(row, q.map, '상태', JOB_CANCEL);
      setCell_(row, q.map, '결과', why);
      setCell_(row, q.map, '마지막시각', now);
      continue;
    }

    var tries = (Number(cellOf_(row, q.map, '시도', 0)) || 0) + 1;
    setCell_(row, q.map, '시도', tries);
    setCell_(row, q.map, '상태', JOB_RUNNING);
    setCell_(row, q.map, '마지막시각', now);
    dirty = true;

    var r;
    try {
      r = adJobSend_(token, action, kind, tid, to);
    } catch (e) {
      /**
       * 보내다 터졌다. 받았는지 안 받았는지 알 수 없다 —
       * 다시 보내면 두 번 바뀐다. 결과불명으로 두고 검증에 맡긴다.
       */
      unknownN++; streak++;
      setCell_(row, q.map, '상태', JOB_UNKNOWN);
      setCell_(row, q.map, '결과', '보내다 끊겼습니다 — 받았는지 알 수 없어 다시 보내지 않습니다: ' +
                                   adErrorText_(String(e)).substring(0, 140));
      if (streak >= JOB_ABORT_AFTER) aborted = '잇달아 ' + streak + '건 실패';
      continue;
    }

    if (r.ok) {
      okN++; streak = 0;
      setCell_(row, q.map, '상태', JOB_VERIFY);
      setCell_(row, q.map, '결과', '아마존이 받았습니다 — [작업 검증]으로 확인하세요');
      logBuf.push([adLogRow_({
        at: now, kind: kind, camp: String(cellOf_(row, q.map, '대상이름', '')),
        group: String(cellOf_(row, q.map, '대상이름', '')),
        sku: String(cellOf_(row, q.map, '상품키', '')),
        item: action, from: cellOf_(row, q.map, '기대이전값', ''), to: to,
        sum: action + ' · ' + cellOf_(row, q.map, '대상이름', '') + ' · ' +
             cellOf_(row, q.map, '기대이전값', '') + ' → ' + to,
        why: String(cellOf_(row, q.map, '근거', '')),
        by: '작업 큐 · 정책 ' + cellOf_(row, q.map, '정책ID', '') +
            ' v' + cellOf_(row, q.map, '정책버전', ''),
        gid: kind === '광고그룹' ? tid : '', cid: kind === '캠페인' ? tid : '',
        tid: kind === '키워드' ? tid : ''
      })]);
    } else {
      failN++; streak++;
      var fatal = JOB_FATAL.test(String(r.msg || ''));
      var give = fatal || tries >= JOB_MAX_TRIES;
      setCell_(row, q.map, '상태', fatal ? JOB_BADINPUT : (give ? JOB_ABORT : JOB_RETRY));
      setCell_(row, q.map, '결과', (fatal ? '고치기 전에는 다시 해도 같습니다: '
                                          : tries + '회 실패: ') + adErrorText_(r.msg));
      if (streak >= JOB_ABORT_AFTER) aborted = '잇달아 ' + streak + '건 실패';
    }
  }

  if (dirty) q.sh.getRange(2, 1, q.rows.length, q.width).setValues(q.rows);
  logBuf.flush();

  var msg = '작업 실행 — 보냄 ' + okN +
            (blockN ? ' · 취소 ' + blockN : '') +
            (failN ? ' · 실패 ' + failN : '') +
            (unknownN ? ' · 결과불명 ' + unknownN : '') +
            (left ? ' · 남음 ' + left : ' · 완료');
  if (aborted) { adAbortRun_('작업 실행', JOB_CONTINUE_HANDLER, aborted); timeUp = false; }
  else log_('ads', (failN || unknownN) ? 'WARN' : 'INFO', msg);
  toast_(msg);
  adJobScheduleContinue_(timeUp);

  if (interactive) {
    showSheet_(SHEET_JOB);
    ui_().alert(aborted ? '멈췄습니다' : (timeUp ? '진행 중' : '보냈습니다'), msg + '\n\n' +
      (aborted ? '⛔ ' + aborted + '\n더 진행하지 않았습니다.\n\n' : '') +
      (timeUp ? '1분 간격으로 자동으로 이어집니다.\n\n' : '') +
      (unknownN ? '⚠ 결과불명 ' + unknownN + '건은 다시 보내지 않습니다.\n' +
                  '   [광고 구조 수집] → [작업 검증] 으로 실제 상태를 확인하세요.\n\n' : '') +
      (okN ? '보낸 것은 아직 ' + JOB_VERIFY + ' 입니다.\n' +
             '[광고 구조 수집] 뒤 [작업 검증]을 해야 ' + JOB_DONE + ' 이 됩니다 —\n' +
             '"보냈다" 와 "그렇게 됐다" 는 다릅니다.' : ''),
      ui_().ButtonSet.OK);
  }
  return msg;
}

/**
 * 메뉴: 보낸 작업이 실제로 그렇게 됐는지 확인한다.
 *
 * 광고구조 수집이 가져다 놓은 지금 상태와 목표값을 맞대 본다.
 * 시트만 읽는다 — 수집이 최근 것이어야 뜻이 있으므로 자료 날짜를 같이 보여 준다.
 */
function verifyAdJobs() {
  var q = adJobRead_();
  if (!q) { ui_().alert('작업이 없습니다.', '', ui_().ButtonSet.OK); return; }

  // 언제 수집한 자료와 맞대 보는 것인가 — 그룹과 구조는 같은 걸음이 함께 가져온다
  var collected = '';
  var gsh = ss_().getSheetByName(SHEET_ADGRP);
  if (gsh && gsh.getLastRow() > 1) {
    var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
    for (var c = 0; c < gv.length; c++) {
      var at = adLogYmd_(gv[c][10]);
      if (at && at > collected) collected = at;
    }
  }
  var ssh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (ssh && ssh.getLastRow() > 1) {
    var smap = hdrMap_(ssh);
    var sv = ssh.getRange(2, 1, ssh.getLastRow() - 1, Math.max(ssh.getLastColumn(), 1)).getValues();
    for (var c2 = 0; c2 < sv.length; c2++) {
      var at2 = adLogYmd_(cellOf_(sv[c2], smap, '수집일시', ''));
      if (at2 && at2 > collected) collected = at2;
    }
  }

  var done = 0, back = 0, still = 0, noData = 0, dirty = false;
  var now = new Date();
  for (var i = 0; i < q.rows.length; i++) {
    var row = q.rows[i];
    var st = String(cellOf_(row, q.map, '상태', ''));
    if (st !== JOB_VERIFY && st !== JOB_UNKNOWN) continue;
    var kind = String(cellOf_(row, q.map, '대상종류', ''));
    var action = String(cellOf_(row, q.map, '동작', ''));
    var tid = String(cellOf_(row, q.map, '대상ID', ''));
    var to = Number(cellOf_(row, q.map, '목표값', 0));

    var cur = adJobCurValue_(action, kind, tid);
    dirty = true;
    if (cur === null) {
      noData++;
      setCell_(row, q.map, '검증결과', '광고구조 수집에 이 대상이 없습니다 — 수집을 먼저 하세요');
      continue;
    }
    if (Math.abs(cur - to) < 0.01) {
      done++;
      setCell_(row, q.map, '상태', JOB_DONE);
      setCell_(row, q.map, '검증결과', '확인 ' + (collected || '?') + ' · 실제 ' + cur);
      setCell_(row, q.map, '마지막시각', now);
    } else if (st === JOB_UNKNOWN) {
      /**
       * 보냈는지 몰랐는데 안 됐다 — 그러면 안 간 것이다. 다시 보내도 안전하다.
       * 이 갈래가 있어서 결과불명을 그냥 다시 보내지 않아도 된다.
       */
      back++;
      setCell_(row, q.map, '상태', JOB_WAIT);
      setCell_(row, q.map, '검증결과', '안 갔습니다 (실제 ' + cur + ' · 목표 ' + to + ') — 다시 보냅니다');
    } else {
      still++;
      setCell_(row, q.map, '상태', JOB_RETRY);
      setCell_(row, q.map, '검증결과', '보냈는데 값이 다릅니다 (실제 ' + cur + ' · 목표 ' + to + ')');
    }
  }
  if (dirty) q.sh.getRange(2, 1, q.rows.length, q.width).setValues(q.rows);

  showSheet_(SHEET_JOB);
  var msg = '작업 검증 — 완료 ' + done + (back ? ' · 안 간 것 ' + back : '') +
            (still ? ' · 값이 다름 ' + still : '') + (noData ? ' · 자료 없음 ' + noData : '');
  log_('ads', 'INFO', msg);
  ui_().alert('작업 검증', msg + '\n\n' +
    '광고구조 수집 기준일: ' + (collected || '(없음)') + '\n' +
    (collected ? '' : '⚠ [광고 구조 수집]을 먼저 해야 실제 상태를 알 수 있습니다.\n') +
    (back ? '\n"안 간 것" 은 결과불명이었는데 실제로 안 바뀐 줄입니다.\n' +
            '   다시 보내도 안전하므로 ' + JOB_WAIT + ' 로 돌렸습니다.\n' : '') +
    (still ? '\n"값이 다름" 은 보냈는데 그렇게 안 된 줄입니다.\n' +
             '   수집이 오래됐거나 아마존이 안 받은 것입니다.\n' : ''),
    ui_().ButtonSet.OK);
}
