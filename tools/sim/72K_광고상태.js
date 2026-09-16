/**
 * 72K_광고상태.gs — 다시 해보기 · 그만두기 · 지금 무엇이 도는지
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 캠페인 여든 개를 만드는 일은 6분 한도 때문에 1분 간격으로 이어 달린다.
 * 그 사이 사람은 창을 닫고 다른 일을 한다. 그래서 두 가지가 없으면 곤란하다:
 *   ① 지금 어디까지 갔는지 물어볼 곳
 *   ② 잘못됐을 때 스스로 멈추는 장치
 *
 * 멈추는 장치가 없으면 1분마다 같은 실패를 영원히 되풀이한다.
 * 아마존이 잠깐 막은 것인지, 값이 틀려 영영 안 되는 것인지를 갈라야 한다 —
 * 앞의 것은 다시 해보면 되고, 뒤의 것은 몇 번을 해도 안 된다.
 */

// 잠깐 뒤에 다시 하면 되는 것만 다시 한다.
// 400·403 은 값이나 권한이 틀린 것이라 백 번을 해도 같다 — 바로 넘긴다.
var ADS_RETRY_TRANSIENT = /\b(429|500|502|503|504)\b|throttl|too\s*many|timeout|timed out|rate.?limit/i;
var ADS_RETRY_WAITS = [2000, 5000, 12000];

/** 잠깐 걸린 것이면 몇 번 더 해본다 */
function adsApiRetry_(token, method, path, body, ct, accept) {
  var last;
  for (var i = 0; i <= ADS_RETRY_WAITS.length; i++) {
    try { return adsApi_(token, method, path, body, ct, accept); }
    catch (e) {
      last = e;
      if (!ADS_RETRY_TRANSIENT.test(String(e))) throw e;
      if (i === ADS_RETRY_WAITS.length) break;
      log_('ads', 'INFO', '잠깐 걸려 ' + (ADS_RETRY_WAITS[i] / 1000) + '초 뒤 다시 (' +
           path + ') — ' + String(e).substring(0, 90));
      Utilities.sleep(ADS_RETRY_WAITS[i]);
    }
  }
  throw last;
}

/**
 * 아마존이 주는 오류 이름은 사람이 읽을 수 있는 것이 아니다.
 * adEligibilityError 만 덜렁 남으면 우리 코드가 잘못한 줄 알고 한참 뒤진다.
 * 무엇을 해야 하는지까지 적어 둔다.
 */
var ADS_ERROR_KR = [
  [/adEligibility/i, '아마존이 이 상품의 광고를 허용하지 않습니다. 코드 문제가 아닙니다 — ' +
    '리스팅 자격(카테고리 제한·상품명 규정·이미지 등)을 셀러 센트럴에서 확인하세요.'],
  [/malformedValue/i, '보낸 값의 형식이 틀렸습니다. 이름에 아스키가 아닌 글자가 있는지 보세요.'],
  [/duplicateValue/i, '같은 이름이 이미 있습니다. [광고 구조 수집]을 다시 해서 있는 것을 찾게 하세요.'],
  [/entityStateConflict/i, '이미 그 상태입니다. 그대로 두어도 됩니다.'],
  [/range|invalidArgument|outOfBound/i, '값이 아마존이 받는 범위를 벗어났습니다 (예산·입찰가를 보세요).'],
  [/notFound|entityNotFound/i, '아마존에 그 대상이 없습니다. 지워졌거나 ID가 낡았습니다 — [광고 구조 수집]을 다시 하세요.'],
  [/\b40[13]\b|accessDenied|unauthorized/i, '권한이 없습니다. 광고 계정에서 이 사용자의 역할을 확인하세요.']
];

/** 오류 문구 뒤에 사람이 읽을 설명을 붙인다 */
function adErrorText_(msg) {
  var t = String(msg == null ? '' : msg).trim();
  for (var i = 0; i < ADS_ERROR_KR.length; i++) {
    if (ADS_ERROR_KR[i][0].test(t)) return t + ' → ' + ADS_ERROR_KR[i][1];
  }
  return t;
}

// ── 줄마다 몇 번 해봤나 ─────────────────────────────────
var ADEXEC_MAX_TRIES = 3;      // 이만큼 해보고 안 되면 그 줄은 그만둔다
var ADEXEC_ABORT_AFTER = 5;    // 한 번 도는 동안 이만큼 잇달아 실패하면 전체를 멈춘다

/** 결과 칸에서 '몇 번 실패했나'를 읽는다 */
function adTriesOf_(s) {
  var m = /실패\s*(\d+)회/.exec(String(s == null ? '' : s));
  return m ? Number(m[1]) : 0;
}

/** 그만둔 줄인가 (더 해봐야 소용없다고 판단한 것) */
function adIsGivenUp_(s) {
  return String(s == null ? '' : s).indexOf('중단') === 0;
}

/**
 * 실패를 결과 칸에 적는다. 정해진 횟수를 넘기면 '중단'으로 바꿔 다시 안 하게 한다.
 * @return {boolean} 그만뒀으면 true
 */
function adMarkFail_(sh, rowNo, col, prev, why) {
  var n = adTriesOf_(prev) + 1;
  var txt = String(why).substring(0, 180);
  if (n >= ADEXEC_MAX_TRIES) {
    sh.getRange(rowNo, col).setValue('중단(' + n + '회 실패): ' + txt);
    return true;
  }
  sh.getRange(rowNo, col).setValue('실패 ' + n + '회: ' + txt);
  return false;
}

/**
 * 잇달아 실패하면 이어달리기를 끊고 알린다.
 * 1분마다 같은 실패를 되풀이하며 아무도 안 보는 것이 가장 나쁘다.
 */
function adAbortRun_(what, handler, detail) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(ts[i]);
  }
  log_('ads', 'ERROR', what + ' 중단 — ' + detail);
  notifyAlert_(what + ' 중단', what + ' 을(를) 멈췄습니다.\n\n' + detail +
    '\n\n잇달아 ' + ADEXEC_ABORT_AFTER + '번 실패해 더 진행하지 않았습니다.\n' +
    '원인을 고친 뒤 다시 실행하면 실패한 줄부터 잇습니다.');
}

/**
 * 메뉴에서 손으로 부른 작업이 트리거와 겹치지 않게 막는다.
 *
 * 1분짜리 이어달리기가 도는 동안 사람이 메뉴를 누르면 둘이 같은 스프레드시트를
 * 함께 두드린다. 그러면 '스프레드시트 서비스가 타임아웃되었습니다' 가 뜬다 —
 * 실제로 떴다. 트리거 쪽은 잠금에 걸리면 1분 뒤로 미루지만,
 * 메뉴 쪽은 사람이 기다리고 있으므로 미루지 않고 그 자리에서 알린다.
 *
 * @return {boolean} 진행해도 되면 true
 */
function adBusyGuard_(what) {
  var busy = false;
  try {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(2000)) lock.releaseLock(); else busy = true;
  } catch (e) { return true; }        // 잠금을 못 쓰면 그냥 진행한다
  if (!busy) return true;
  ui_().alert(what + ' — 지금은 안 됩니다',
    '다른 작업이 돌고 있습니다.\n\n' +
    '같은 시트를 둘이 함께 건드리면 "스프레드시트 서비스가 타임아웃되었습니다" 가 뜹니다.\n\n' +
    '[📊 분석 → 지금 무엇이 도는가] 로 무엇이 도는지 보고,\n' +
    '끝난 뒤에 다시 하세요. 급하면 [이어달리기 전부 멈추기].',
    ui_().ButtonSet.OK);
  return false;
}

/**
 * 메뉴: 이어달리기 전부 멈추기.
 * 무언가 어긋나 1분마다 헛돌 때 사람이 끊을 수 있어야 한다.
 */
function stopAllContinuations() {
  var ts = ScriptApp.getProjectTriggers(), killed = [];
  for (var i = 0; i < ts.length; i++) {
    var fn = ts[i].getHandlerFunction();
    if (fn.indexOf('continue') !== 0) continue;
    ScriptApp.deleteTrigger(ts[i]);
    killed.push(ADWORK_NAMES[fn] || fn);
  }
  var props = PropertiesService.getScriptProperties();
  var qs = [[PROP_ADKW_QUEUE, '키워드 실적'], [PROP_ADS_QUEUE, '광고비'],
            [PROP_ADTERM_QUEUE, '검색어']];
  var cleared = [];
  for (var q = 0; q < qs.length; q++) {
    var raw = props.getProperty(qs[q][0]);
    if (!raw || raw === '[]') continue;
    try { cleared.push(qs[q][1] + ' ' + JSON.parse(raw).length + '구간'); } catch (e) {}
  }
  if (!killed.length && !cleared.length) {
    ui_().alert('멈출 것이 없습니다.', '이어서 도는 작업이 없습니다.', ui_().ButtonSet.OK);
    return;
  }
  var ok = ui_().alert('이어달리기 전부 멈추기',
    '멈출 것: ' + (killed.join(', ') || '없음') + '\n' +
    (cleared.length ? '남아 있던 구간: ' + cleared.join(', ') + '\n' : '') + '\n' +
    '받다 만 자료는 그대로 남습니다 (지우지 않습니다).\n' +
    '남은 구간까지 지울까요?\n\n' +
    '[예] 트리거도 끊고 남은 구간도 지운다 (처음부터 다시)\n' +
    '[아니오] 트리거만 끊는다 (나중에 이어받을 수 있게 구간은 남김)',
    ui_().ButtonSet.YES_NO_CANCEL);
  if (ok === ui_().Button.CANCEL) return;
  if (ok === ui_().Button.YES) {
    for (var q2 = 0; q2 < qs.length; q2++) props.deleteProperty(qs[q2][0]);
  }
  log_('ads', 'INFO', '이어달리기 멈춤 — ' + (killed.join(', ') || '없음') +
       (ok === ui_().Button.YES ? ' · 남은 구간 지움' : ''));
  ui_().alert('멈췄습니다',
    (killed.length ? killed.length + '개를 끊었습니다.\n' : '') +
    (ok === ui_().Button.YES ? '남은 구간도 지웠습니다.\n' : '남은 구간은 두었습니다 — 다시 실행하면 이어받습니다.\n') +
    '\n받아 둔 자료는 그대로 있습니다.', ui_().ButtonSet.OK);
}

// ── 지금 무엇이 도는가 ──────────────────────────────────

/** 이어달리기 함수 이름 → 사람이 읽는 이름 */
var ADWORK_NAMES = {
  'continueAdPlanExec': '캠페인 만들기',
  'continueAdEnable': '캠페인 켜기·멈추기',
  'continueAdKeywords': '키워드 실적 수집',
  'continueAdsReport': '광고비 수집',
  'continueSync': '아마존 동기화',
  'continueOrdersReport': '주문 수집',
  'continueSalesReport': '판매실적 수집'
};

/** 표 한 장에서 결과 칸을 세어 본다 */
function adCountResults_(name, header, col) {
  var out = { total: 0, done: 0, fail: 0, stop: 0, todo: 0, on: 0, off: 0 };
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, header.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var r = String(v[i][col - 1] || '');
    out.total++;
    if (r.indexOf('성공') === 0) {
      out.done++;
      if (r.indexOf('· 켬') >= 0) out.on++;
      else if (r.indexOf('· 멈춤') >= 0) out.off++;
    } else if (adIsGivenUp_(r)) out.stop++;
    else if (r.indexOf('실패') === 0) out.fail++;
    else out.todo++;
  }
  return out;
}

/** 메뉴: 지금 무엇이 도는가 */
function adWorkStatus() {
  var props = PropertiesService.getScriptProperties();
  var busy = false;
  try {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(500)) lock.releaseLock(); else busy = true;
  } catch (e) {}

  var ts = ScriptApp.getProjectTriggers(), running = [];
  for (var i = 0; i < ts.length; i++) {
    var fn = ts[i].getHandlerFunction();
    if (fn.indexOf('continue') === 0) {
      running.push(ADWORK_NAMES[fn] || fn);
    }
  }

  var lines = [];
  lines.push(busy ? '■ 지금 무언가 실행 중입니다 — 끝날 때까지 다른 메뉴를 누르지 마세요.'
                  : '■ 지금 실행 중인 것은 없습니다.');
  lines.push('');
  lines.push(running.length
    ? '이어서 도는 중 (1분 간격)\n   · ' + running.join('\n   · ')
    : '이어서 도는 작업 없음');

  // 캠페인 만들기
  var p = adCountResults_(SHEET_ADPLAN, ADPLAN_HEADER, AP_RESULT);
  if (p.total) {
    lines.push('');
    lines.push('▬ 캠페인 만들기 (' + SHEET_ADPLAN + ' ' + p.total + '줄)');
    lines.push('   만듦 ' + p.done + ' · 아직 ' + p.todo +
               (p.fail ? ' · 실패(다시 시도함) ' + p.fail : '') +
               (p.stop ? ' · 중단 ' + p.stop : ''));
    if (p.done) lines.push('   그중 켬 ' + p.on + ' · 멈춤 ' + p.off +
                           ' · 표시 없음 ' + (p.done - p.on - p.off));
    if (p.stop) lines.push('   ⚠ 중단된 줄은 [결과] 칸에 사유가 있습니다. 고친 뒤 그 칸을 비우면 다시 시도합니다.');
  }

  // 리포트 큐
  var q = function (key, label) {
    try {
      var a = JSON.parse(props.getProperty(key) || '[]');
      if (a && a.length) lines.push('   · ' + label + ' 남은 구간 ' + a.length + '개');
    } catch (e2) {}
  };
  var before = lines.length;
  lines.push('');
  lines.push('▬ 받는 중인 자료');
  q(PROP_ADKW_QUEUE, '키워드 실적');
  q(PROP_ADS_QUEUE, '광고비');
  if (lines.length === before + 2) lines.push('   없음');

  // 최근 로그
  var logSh = ss_().getSheetByName(SHEET_LOG);
  if (logSh && logSh.getLastRow() > 1) {
    var n = Math.min(6, logSh.getLastRow() - 1);
    var lv = logSh.getRange(logSh.getLastRow() - n + 1, 1, n, LOG_HEADER.length).getValues();
    lines.push('');
    lines.push('▬ 최근 기록');
    for (var k = lv.length - 1; k >= 0; k--) {
      lines.push('   ' + (lv[k][2] === 'ERROR' ? '⛔ ' : lv[k][2] === 'WARN' ? '⚠ ' : '') +
                 String(lv[k][3]).substring(0, 70));
    }
  }

  ui_().alert('지금 무엇이 도는가', lines.join('\n'), ui_().ButtonSet.OK);
}

// ── 켜기·멈추기가 정말 되는가 (한 개만 실험) ─────────────
//
// 여든 개를 한꺼번에 건드리기 전에 하나로 확인한다.
// 읽기 → 반대로 바꾸기 → 다시 읽기 → 되돌리기 → 다시 읽기.
// 네 번의 왕복을 전부 보여 주므로, 안 되면 어느 단계에서 안 되는지가 바로 보인다.
// 끝나면 원래 상태로 되돌려 놓으므로 광고비가 나가지 않는다.

/** 캠페인 하나의 지금 상태를 아마존에게 물어본다 */
function adCampaignState_(token, cid) {
  var r = adsApiRetry_(token, 'post', '/sp/campaigns/list',
    { campaignIdFilter: { include: [String(cid)] }, maxResults: 10 },
    ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
  var arr = (r && r.campaigns) || [];
  if (!arr.length) return null;
  return { state: String(arr[0].state || ''), name: String(arr[0].name || '') };
}

/** 메뉴: 켜기·멈추기 한 개 실험 */
function testCampaignToggle() {
  if (!adBusyGuard_('켜기·멈추기 실험')) return;

  // 우리가 만든 캠페인 중 첫 줄을 고른다 — 남의 캠페인은 실험 대상이 아니다
  var sh = getSheetOrThrow_(SHEET_ADPLAN);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADPLAN + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  var cid = '', gid = '', name = '';
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][AP_RESULT - 1]).indexOf('성공') !== 0) continue;
    if (String(v[i][AP_ACTION - 1]) !== '생성') continue;
    var c = String(v[i][AP_CID - 1] || '').trim();
    if (!c) continue;
    cid = c; gid = String(v[i][AP_GID - 1] || '').trim(); name = String(v[i][AP_NAME - 1]);
    break;
  }
  if (!cid) {
    ui_().alert('실험할 캠페인이 없습니다.',
      '우리가 만든 캠페인(결과가 "성공", 할 일이 "생성")이 있어야 합니다.',
      ui_().ButtonSet.OK);
    return;
  }

  var lines = [], token = adsToken_();

  // ① 지금 상태를 읽는다
  var now0 = adCampaignState_(token, cid);
  if (!now0) {
    ui_().alert('아마존에 그 캠페인이 없습니다.',
      '캠페인ID ' + cid + ' 를 못 찾았습니다.\n' +
      '지워졌거나 ID가 낡았습니다 — [광고 구조 수집]을 다시 하세요.', ui_().ButtonSet.OK);
    return;
  }
  lines.push('① 읽기        → ' + now0.state + '  (' + now0.name + ')');
  var orig = now0.state === 'ENABLED' ? 'ENABLED' : 'PAUSED';
  var flip = orig === 'ENABLED' ? 'PAUSED' : 'ENABLED';

  var ok = ui_().alert('켜기·멈추기 한 개 실험',
    '캠페인: ' + name + '\nID: ' + cid + '\n지금 상태: ' + orig + '\n\n' +
    '이렇게 해 봅니다:\n' +
    '  ' + orig + ' → ' + flip + ' 으로 바꾸고 다시 읽어 확인\n' +
    '  다시 ' + flip + ' → ' + orig + ' 으로 되돌리고 확인\n\n' +
    '끝나면 원래 상태(' + orig + ')로 돌아갑니다 — 광고비는 나가지 않습니다.\n\n' +
    '해 볼까요?', ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return;

  var report = function (title, body) {
    log_('ads', 'INFO', '켜기·멈추기 실험 — ' + lines.join(' / '));
    ui_().alert(title, body + '\n\n' + lines.join('\n'), ui_().ButtonSet.OK);
  };

  // ② 반대로 바꾼다
  var put1;
  try {
    put1 = adsCreated_(adsApiRetry_(token, 'put', '/sp/campaigns',
      { campaigns: [{ campaignId: cid, state: flip }] },
      ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN), 'campaigns', 'campaignId');
  } catch (e) {
    lines.push('② ' + flip + ' 쓰기 → 예외: ' + String(e).substring(0, 160));
    report('❌ 안 됩니다', '상태 바꾸기(PUT)가 아예 실패했습니다.\n' +
      adErrorText_(String(e).substring(0, 200)));
    return;
  }
  if (!put1.ok) {
    lines.push('② ' + flip + ' 쓰기 → 거부: ' + put1.msg);
    report('❌ 아마존이 거부했습니다', adErrorText_(put1.msg) +
      '\n\n원래 상태(' + orig + ')는 그대로입니다.');
    return;
  }
  lines.push('② ' + flip + ' 쓰기  → 받음 (campaignId ' + (put1.ids[0] || cid) + ')');

  // ③ 정말 바뀌었는지 다시 읽는다 — 받았다고 해서 바뀐 것은 아니다
  Utilities.sleep(1500);
  var now1 = adCampaignState_(token, cid);
  var changed = now1 && now1.state === flip;
  lines.push('③ 다시 읽기  → ' + (now1 ? now1.state : '못 읽음') +
             (changed ? '  ✅ 바뀜' : '  ⚠ 아직 ' + (now1 ? now1.state : '?')));

  // ④ 되돌린다 — 실험 때문에 광고가 켜져 있으면 안 된다
  var back = false;
  try {
    back = adsCreated_(adsApiRetry_(token, 'put', '/sp/campaigns',
      { campaigns: [{ campaignId: cid, state: orig }] },
      ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN), 'campaigns', 'campaignId').ok;
  } catch (e2) { back = false; }
  Utilities.sleep(1500);
  var now2 = adCampaignState_(token, cid);
  lines.push('④ ' + orig + ' 로 되돌림 → ' + (now2 ? now2.state : '못 읽음') +
             (now2 && now2.state === orig ? '  ✅ 원래대로' : '  ⚠ 확인 필요'));

  adLogWrite_([adLogRow_({
    kind: '캠페인', camp: name, group: name, item: '상태(실험)',
    from: orig, to: orig,
    sum: '켜기·멈추기 실험 — ' + (changed ? '됨' : '안 됨') + ' · ' + name,
    why: orig + '→' + flip + '→' + orig + ' 왕복 확인',
    cid: cid, gid: gid
  })]);

  if (changed && now2 && now2.state === orig) {
    report('✅ 됩니다', 'API 로 캠페인 상태를 바꿀 수 있습니다.\n' +
      '바꾸고, 확인하고, 되돌리는 것까지 전부 됐습니다.\n' +
      '이제 [만든 캠페인 켜기 · 멈추기]를 그대로 쓰면 됩니다.');
  } else if (!changed) {
    report('⚠ 받기는 했는데 안 바뀌었습니다',
      '아마존이 요청은 받았지만(207 성공) 다시 읽으니 ' +
      (now1 ? now1.state : '?') + ' 입니다.\n' +
      '반영이 늦는 것일 수 있습니다 — 1분 뒤 [광고 구조 수집]으로 다시 보세요.');
  } else {
    report('⚠ 되돌리기를 확인 못 했습니다',
      '바꾸기는 됐는데 원래대로 돌아왔는지 확인이 안 됩니다.\n' +
      '지금 상태: ' + (now2 ? now2.state : '못 읽음') + ' — 직접 확인하세요.');
  }
}
