/**
 * 72K_광고상태.gs — 다시 해보기 · 그만두기 · 지금 무엇이 도는지
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 캠페인 여든 개를 만드는 일은 6분 한도 때문에 1분 간격으로 이어 달린다.
 * 그 사이 사람은 창을 닫고 다른 일을 한다. 그래서 두 가지가 없으면 곤란하다:
 *   ① 지금 어디까지 갔는지 물어볼 곳 — 74 의 [지금 무엇이 도는가 · 멈추기] 에 합쳐져 있다
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
    '[가격관리 → 지금 무엇이 도는가 · 멈추기] 로 무엇이 도는지 보고,\n' +
    '끝난 뒤에 다시 하세요. 급하면 거기서 멈출 수 있습니다.',
    ui_().ButtonSet.OK);
  return false;
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
  var cid = '', gid = '', name = '';
  adPlanEachRow_(function (row) {
    if (cid) return;
    if (String(row[AP_RESULT - 1]).indexOf('성공') !== 0) return;
    if (String(row[AP_ACTION - 1]) !== '생성') return;
    var c = String(row[AP_CID - 1] || '').trim();
    if (!c) return;
    cid = c; gid = String(row[AP_GID - 1] || '').trim(); name = String(row[AP_NAME - 1]);
  });
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


// ── 수집 메뉴가 공통으로 쓰는 대화 ─────────────────────
//
// 처음에는 셋(광고비·키워드·검색어)이 각자 '[예] 이어서 / [아니오] 새로 / [취소]' 를
// 물었다. 예·아니오에 서로 다른 동사가 실려 있어 사람이 뭘 누르면 뭐가 되는지
// 몰랐다 — 실제로 "예 아니오 눌렀을 때 되는 것이" 직관적이지 않다는 말을 들었다.
// 그래서 한 자리에 모으고, 버튼은 [확인]=하겠다 / [취소]=안 하겠다 둘로 줄인다.
// '새로 시작' 은 여기서 안 묻는다 — 멈추는 일은 [지금 무엇이 도는가 · 멈추기] 한 곳에서만 한다.

/**
 * 남은 구간이 있으면 이어받을지 묻는다.
 * @return {boolean} true = 이어받아서 이미 처리했음 (호출한 쪽은 그냥 return)
 */
function adResumeIfQueued_(label, queueKey, stepFn) {
  var q = JSON.parse(PropertiesService.getScriptProperties().getProperty(queueKey) || 'null');
  if (!q || !q.length) return false;
  var r = ui_().alert(label + ' — 하다 만 것이 있습니다',
    '남은 구간 ' + q.length + '개가 있습니다.\n\n' +
    '[확인]  이어서 받는다\n' +
    '[취소]  닫는다\n\n' +
    '처음부터 새로 받으려면 [가격관리 → 지금 무엇이 도는가 · 멈추기] 에서\n' +
    '먼저 멈춘 뒤 다시 누르세요.',
    ui_().ButtonSet.OK_CANCEL);
  if (r === ui_().Button.OK) stepFn(true);
  return true;
}

/**
 * 몇 주치를 받을지 한 번만 묻고 바로 시작한다.
 * 예전엔 주 수를 묻고 → 구간을 보여 주고 → 또 '시작할까요' 를 물었다. 두 번째 물음은
 * 첫 물음의 되풀이다. [확인] 이 곧 시작이다.
 * @return {string[]|null} 주 구간 목록. 취소면 null
 */
function adAskWeeks_(label, what, defWeeks, maxWeeks) {
  var res = ui_().prompt(label,
    what + '\n\n' +
    '몇 주치를 받을까요? 최근 주부터 받고, 한 주에 1~2분 걸립니다.\n' +
    '중간에 멈춰도 받은 주는 남습니다.\n\n' +
    '숫자만 넣고 [확인]  (비우면 ' + defWeeks + '주 · 최대 ' + maxWeeks + '주)',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return null;
  var n = parseInt(String(res.getResponseText()).trim(), 10);
  if (!(n >= 1 && n <= maxWeeks)) n = defWeeks;
  var wins = adkwWeeks_(n);
  toast_(label + ' 시작 — ' + wins[wins.length - 1].split('|')[0] + ' ~ ' +
         wins[0].split('|')[1] + ' (주 ' + wins.length + '개)');
  return wins;
}
