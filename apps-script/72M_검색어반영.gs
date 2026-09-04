/**
 * 72M_검색어반영.gs — 검색어 판정을 아마존에 옮긴다
 *
 * ── 왜 이 단계가 따로 있나 ───────────────────────────────
 * 72L 은 받아서 판정만 적는다. 판정과 반영을 한 함수에 넣으면 사람이 눈으로
 * 보기 전에 계정이 바뀐다. 키워드를 올리고 막는 일은 되돌리기가 번거로우므로
 * (부정 키워드는 지워도 그 사이 잃은 노출이 돌아오지 않는다) 사이에 승인 칸을 둔다.
 *
 * ── 무엇을 하나 ─────────────────────────────────────────
 *   승격  →  그 광고그룹에 수동 '정확 일치' 키워드로 올린다
 *   부정  →  그 광고그룹에 '부정 정확 일치' 로 막는다
 *
 * 왜 정확 일치인가: 자동 캠페인이 찾아 준 것은 '이 말로 검색한 사람이 샀다' 는
 * 한 문장이다. 넓게 잡으면 그 문장이 보증하지 않는 검색어까지 딸려 온다.
 * 넓힐지는 정확 일치가 실제로 팔고 난 뒤에 따로 판단할 일이다.
 *
 * ── 올릴 때 얼마를 부르나 ───────────────────────────────
 *   상한  = 손익분기CPA × 이 검색어의 실제 전환율     (여기를 넘으면 팔수록 손해)
 *   희망  = 상한 × 목표ACOS비율
 *   덮개  = 지금 이 검색어가 실제로 물어 온 CPC × 1.5
 *   입찰  = min(희망, 덮개) 를 [2엔, 상한] 안으로 밀어넣은 값
 *
 * 덮개가 필요한 이유: 클릭 1회에 주문 1건이면 전환율이 100% 로 잡힌다.
 * 그 값을 그대로 믿으면 손익분기CPA 의 65% 를 부르게 되는데, 이미 훨씬 싼 값에
 * 클릭을 사고 있었다면 올릴 이유가 없다. 실제로 이긴 값에서 반 발짝만 올린다.
 */

var ADTERM_APPLY_CONTINUE = 'continueAdTermApply';
var ADTERM_APPLY_BATCH = 100;      // 한 번에 보낼 키워드 수
var ADTERM_BID_MIN = 2;            // 아마존 JP 최소 입찰
var ADTERM_BID_CAP_MULT = 1.5;     // 이미 이긴 CPC 에서 이만큼까지만

/** 승격 줄에 부를 값을 정한다 */
function adTermBid_(row, ratio) {
  var beCpa = Number(row[AT_BECPA]) || 0;
  var cvr = Number(row[AT_CVR]) || 0;
  var cpc = Number(row[AT_CPC]) || 0;
  if (!(beCpa > 0) || !(cvr > 0)) return 0;
  var ceil = beCpa * cvr;                       // 이 검색어의 CPC 상한
  var want = ceil * (ratio || 0.65);
  var cap = cpc > 0 ? cpc * ADTERM_BID_CAP_MULT : want;
  var bid = Math.min(want, cap);
  if (bid > ceil) bid = ceil;
  // 엔은 소수점을 쓰지 않는다 — 다른 곳(권장CPC·예산)과 같이 정수로 맞춘다.
  // 내림으로 한다: 반올림하면 상한을 반 엔 넘길 수 있고, 상한을 넘기면 팔수록 손해다
  bid = Math.floor(bid);
  if (bid < ADTERM_BID_MIN) bid = ADTERM_BID_MIN;
  return bid;
}

/** 메뉴: 판정대로 승인 칸을 채운다 */
function approveAdTerms() {
  var sh = getSheetOrThrow_(SHEET_ADTERM);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADTERM + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADTERM_HEADER.length).getValues();

  var up = 0, neg = 0, done = 0;
  for (var i = 0; i < v.length; i++) {
    var t = String(v[i][AT_VERDICT]);
    if (String(v[i][AT_APPLIED] || '').indexOf('성공') === 0) { done++; continue; }
    if (t === '승격') up++; else if (t === '부정') neg++;
  }
  if (!up && !neg) {
    ui_().alert('반영할 판정이 없습니다.',
      '승격·부정으로 판정된 줄이 없습니다.' +
      (done ? '\n(이미 반영한 줄 ' + done + '개는 셈에서 뺐습니다.)' : ''),
      ui_().ButtonSet.OK);
    return;
  }

  var ans = ui_().alert('검색어 판정 승인',
    '승격 ' + up + '개 · 부정 ' + neg + '개' + (done ? ' (이미 반영 ' + done + '개 제외)' : '') + '\n\n' +
    '[예]    승격만 체크 — 파는 말을 키우는 쪽. 먼저 이것부터 하는 것이 안전합니다\n' +
    '[아니오] 승격 + 부정 둘 다 체크\n' +
    '[취소]  아무것도 안 함\n\n' +
    '체크만 합니다. 아마존에는 [검색어 승인분 반영]에서 올라갑니다.',
    ui_().ButtonSet.YES_NO_CANCEL);
  if (ans === ui_().Button.CANCEL) return;
  var withNeg = (ans === ui_().Button.NO);

  var col = [], n = 0;
  for (var j = 0; j < v.length; j++) {
    var vd = String(v[j][AT_VERDICT]);
    var already = String(v[j][AT_APPLIED] || '').indexOf('성공') === 0;
    var pick = !already && (vd === '승격' || (withNeg && vd === '부정'));
    col.push([pick ? true : false]);
    if (pick) n++;
  }
  sh.getRange(2, AT_APPROVE + 1, col.length, 1).setValues(col);
  showSheet_(SHEET_ADTERM);
  ui_().alert('체크했습니다', n + '줄을 승인했습니다.\n\n' +
    '표를 보고 뺄 것은 체크를 풀어도 됩니다.\n' +
    '그 다음 [검색어 승인분 반영]을 실행하세요.', ui_().ButtonSet.OK);
}

/** 메뉴: 승인한 검색어를 아마존에 올린다 */
function applyAdTerms() {
  if (!adBusyGuard_('검색어 반영')) return;
  var sh = getSheetOrThrow_(SHEET_ADTERM);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADTERM + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADTERM_HEADER.length).getValues();

  var up = 0, neg = 0, skip = 0;
  for (var i = 0; i < v.length; i++) {
    if (!adRowApproved_(v[i][AT_APPROVE])) continue;
    if (String(v[i][AT_APPLIED] || '').indexOf('성공') === 0) { skip++; continue; }
    var vd = String(v[i][AT_VERDICT]);
    if (vd === '승격') up++; else if (vd === '부정') neg++;
  }
  if (!up && !neg) {
    ui_().alert('반영할 줄이 없습니다.',
      '승인 ✓ 이면서 아직 안 올린 줄이 없습니다.' +
      (skip ? '\n이미 반영한 줄 ' + skip + '개는 다시 올리지 않습니다.' : '') +
      '\n\n[검색어 판정 승인]으로 먼저 체크하세요.', ui_().ButtonSet.OK);
    return;
  }

  var ok = ui_().alert('검색어 승인분 반영',
    '올릴 것: 수동 정확 일치 키워드 ' + up + '개\n' +
    '막을 것: 부정 정확 일치 ' + neg + '개\n' +
    (skip ? '건너뜀: 이미 반영한 ' + skip + '개\n' : '') + '\n' +
    '키워드를 올리면 그 말에 돈이 나가기 시작합니다.\n' +
    '부정은 지워도 그 사이 놓친 노출은 돌아오지 않습니다.\n\n' +
    '계속할까요?', ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return;

  toast_('검색어 반영 중…');
  adTermApplyStep_(true);
}

function continueAdTermApply() {
  withLockOrRetry_('검색어 반영', ADTERM_APPLY_CONTINUE, function () {
    try { adTermApplyStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

function adTermApplyScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADTERM_APPLY_CONTINUE) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ADTERM_APPLY_CONTINUE).timeBased().after(60 * 1000).create();
}

/**
 * 한 뭉치를 보낸다.
 *
 * 아마존은 일괄 응답(207)으로 줄마다 성공·실패를 따로 준다. 보낸 차례와
 * 받은 차례가 같다는 보장이 없으므로 index 로 되짚는다 — 그래야 어느 줄이
 * 실패했는지 어긋나지 않는다.
 */
function adTermSend_(token, kind, items) {
  var spec = (kind === '승격')
    ? { path: '/sp/keywords', ct: ADSW_CT_KEYWORD, key: 'keywords', idf: 'keywordId' }
    : { path: '/sp/negativeKeywords', ct: ADSW_CT_NEGKEYWORD, key: 'negativeKeywords', idf: 'keywordId' };
  var body = {};
  body[spec.key] = items.map(function (x) { return x.payload; });
  var res = adsApiRetry_(token, 'post', spec.path, body, spec.ct, spec.ct);
  var box = (res && res[spec.key]) || {};
  var out = items.map(function () { return { ok: false, msg: '응답에 없음' }; });
  var succ = box.success || [], errs = box.error || [];
  for (var s = 0; s < succ.length; s++) {
    var si = Number(succ[s].index);
    if (si >= 0 && si < out.length) out[si] = { ok: true, id: String(succ[s][spec.idf] || '') };
  }
  for (var e = 0; e < errs.length; e++) {
    var ei = Number(errs[e].index);
    var er = (errs[e].errors && errs[e].errors[0]) || {};
    var m = (er.errorType || '') + ' ' + String(er.message || '').substring(0, 120);
    if (ei >= 0 && ei < out.length) out[ei] = { ok: false, msg: m.trim() || '거부' };
  }
  return out;
}

/** 시간이 찰 때까지 승인분을 올린다 */
function adTermApplyStep_(interactive) {
  var t0 = Date.now();
  var sh = getSheetOrThrow_(SHEET_ADTERM);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADTERM_HEADER.length).getValues();
  var basis = adBasis_();
  var ratio = Number(basis['목표 ACOS 비율']) || 0.65;
  var token = adsToken_();

  var col = [];
  for (var c0 = 0; c0 < v.length; c0++) col.push([v[c0][AT_APPLIED]]);
  var dirty = false;
  var flushCol = function () {
    if (!dirty) return;
    sh.getRange(2, AT_APPLIED + 1, col.length, 1).setValues(col);
    dirty = false;
  };
  var logBuf = adLogBuffer_(ADEXEC_FLUSH_EVERY);

  // 같은 종류끼리 모아 보낸다 — 한 줄씩 부르면 백 번을 부른다
  var pend = { '승격': [], '부정': [] };
  var okN = 0, failN = 0, left = 0, timeUp = false, aborted = '', streak = 0;

  var send = function (kind) {
    var items = pend[kind];
    if (!items.length) return;
    pend[kind] = [];
    var res;
    try { res = adTermSend_(token, kind, items); }
    catch (e) {
      res = items.map(function () { return { ok: false, msg: String(e).substring(0, 140) }; });
    }
    var rows = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], r = res[i] || { ok: false, msg: '응답 없음' };
      dirty = true;
      if (r.ok) {
        okN++; streak = 0;
        col[it.row][0] = '성공 · ' + (kind === '승격' ? '키워드' : '부정') +
                         ' ' + (r.id || '') + (kind === '승격' ? ' · ' + it.bid + '엔' : '');
        rows.push(adLogRow_({
          kind: kind === '승격' ? '키워드' : '부정키워드',
          camp: it.camp, group: it.group, target: it.text, item: kind === '승격' ? '입찰' : '차단',
          from: '', to: kind === '승격' ? it.bid : '차단',
          sku: it.sku, asin: it.asin,
          sum: (kind === '승격' ? '올림 · ' : '막음 · ') + '"' + it.text + '" · ' + it.group +
               (kind === '승격' ? ' · ' + it.bid + '엔' : ''),
          why: it.why, cid: it.cid, gid: it.gid, tid: r.id || ''
        }));
      } else {
        failN++; streak++;
        var tries = adTriesOf_(String(v[it.row][AT_APPLIED])) + 1;
        col[it.row][0] = (tries >= ADEXEC_MAX_TRIES ? '중단(' : '실패 ') + tries +
                         (tries >= ADEXEC_MAX_TRIES ? '회 실패): ' : '회: ') +
                         adErrorText_(r.msg).substring(0, 200);
        if (streak >= ADEXEC_ABORT_AFTER) {
          aborted = '잇달아 ' + streak + '줄 실패 (마지막: "' + it.text + '")';
        }
      }
    }
    if (rows.length) logBuf.push(rows);
    flushCol(); logBuf.flush();
  };

  for (var i2 = 0; i2 < v.length; i2++) {
    if (!adRowApproved_(v[i2][AT_APPROVE])) continue;
    var prev = String(v[i2][AT_APPLIED] || '');
    if (prev.indexOf('성공') === 0) continue;
    if (prev.indexOf('중단(') === 0) continue;
    var vd = String(v[i2][AT_VERDICT]);
    if (vd !== '승격' && vd !== '부정') continue;
    if (aborted) { left++; continue; }
    if (Date.now() - t0 > ADS_SOFT_MS) { timeUp = true; left++; continue; }

    var text = String(v[i2][AT_TERM] || '').trim();
    var cid = String(v[i2][AT_CID] || '').trim();
    var gid = String(v[i2][AT_GID] || '').trim();
    if (!text || !cid || !gid) {
      dirty = true; failN++;
      col[i2][0] = '중단(값 없음): 검색어·캠페인ID·광고그룹ID 중 빈 칸이 있습니다';
      continue;
    }
    // 아마존은 검색어를 80자까지 받는다. 넘으면 통째로 거부되므로 미리 걸러 알린다
    if (text.length > 80) {
      dirty = true; failN++;
      col[i2][0] = '중단(너무 김): 검색어가 ' + text.length + '자 — 아마존 한도 80자';
      continue;
    }

    var payload = { campaignId: cid, adGroupId: gid, keywordText: text, state: 'ENABLED' };
    var bid = 0;
    if (vd === '승격') {
      payload.matchType = 'EXACT';
      bid = adTermBid_(v[i2], ratio);
      if (!(bid > 0)) {
        dirty = true; failN++;
        col[i2][0] = '중단(값 없음): 손익분기CPA·전환율이 없어 입찰가를 못 정합니다';
        continue;
      }
      payload.bid = bid;
    } else {
      payload.matchType = 'NEGATIVE_EXACT';
    }

    pend[vd].push({
      row: i2, payload: payload, text: text, bid: bid,
      camp: String(v[i2][3] || ''), group: String(v[i2][4] || ''),
      sku: String(v[i2][7] || ''), asin: String(v[i2][8] || ''),
      why: String(v[i2][AT_WHY] || ''), cid: cid, gid: gid
    });
    if (pend[vd].length >= ADTERM_APPLY_BATCH) send(vd);
  }
  send('승격'); send('부정');
  flushCol(); logBuf.flush();

  var msg = '검색어 반영 — ' + okN + '개 성공' + (failN ? ' · ' + failN + '개 실패' : '') +
            (left ? ' · 남음 ' + left : ' · 완료');
  if (aborted) {
    adAbortRun_('검색어 반영', ADTERM_APPLY_CONTINUE, aborted);
    timeUp = false;
  } else {
    log_('ads', failN ? 'WARN' : 'INFO', msg);
  }
  toast_(msg);
  adTermApplyScheduleContinue_(timeUp);

  if (interactive) {
    showSheet_(SHEET_ADTERM);
    ui_().alert(aborted ? '멈췄습니다' : (timeUp ? '진행 중' : '완료'), msg + '\n\n' +
      (aborted ? '⛔ ' + aborted + '\n더 진행하지 않았습니다.\n\n' : '') +
      (timeUp ? '1분 간격으로 자동으로 이어집니다. 창을 닫아도 됩니다.\n\n' : '') +
      (failN ? '실패한 줄은 [반영결과] 칸에 사유가 있습니다.\n' +
               '"이미 있음(duplicateValue)" 은 손댈 것이 없다는 뜻입니다.\n\n' : '') +
      (okN ? '올린 키워드는 [광고 구조 수집]을 다시 하면 표에 잡힙니다.' : ''),
      ui_().ButtonSet.OK);
  }
  return msg;
}
