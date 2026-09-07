/**
 * 72X_광고자동.gs — 매일 저절로 도는 트랙 B (기획서 13.3)
 *
 * ── 왜 걸음을 나눠 거는가 ───────────────────────────────
 * 앱스 스크립트는 한 실행이 6분을 넘기면 잘린다. 원장 수집(아마존이 리포트를
 * 만들 때까지 기다림) · 구조 수집(수천 줄 페이징) · 한 바퀴 · 검증을 한 실행에
 * 몰아넣으면 중간에서 죽고, 어디까지 됐는지 모르는 채로 다음 날을 맞는다.
 * 그래서 한 시간씩 떨어뜨려 네 번 건다. 앞 걸음이 실패해도 뒤 걸음은 제 일을 한다
 * (뒤 걸음은 어제 자료로 계산하고, 자료가 늦었다는 것을 표에 적는다).
 *
 * ── 순서에 뜻이 있다 ────────────────────────────────────
 *   3시 지출 원장 — 얼마 썼나. 이것이 없으면 여력을 셀 수 없다
 *   4시 광고 구조 — 지금 입찰이 얼마인가. 이것이 없으면 무엇을 바꿀지 모른다
 *   5시 한 바퀴  — 계산 → 상태 점검 → 작업 계획 → 보내기
 *   6시 작업 검증 — 어제 보낸 것이 실제로 그렇게 됐나
 * 앞의 둘이 오늘 것이라야 5시의 판단이 오늘 것이 된다.
 *
 * ── 트리거는 사람을 대신하지 않는다 ─────────────────────
 * 이 걸음들은 '이미 정해진 것을 그대로 하는 일' 만 한다. 새 캠페인을 만들거나
 * 켜지 않고, 사람에게 묻는 창이 뜨는 일은 하지 않는다 (창이 없으면 '아니오' 다).
 * 돈이 새로 나가기 시작하는 자리는 사람이 누른다.
 */

/** 매일 거는 걸음. 이름은 사람이 읽는 것, handler 는 트리거가 부르는 것 */
var AD_AUTOMATIONS = [
  { name: '광고 · 지출 원장 수집', handler: 'scheduledAdSpend', hour: 3,
    why: '얼마 썼나 — 여력 계산의 바탕' },
  { name: '광고 · 구조 수집', handler: 'scheduledAdStructure', hour: 4,
    why: '지금 입찰이 얼마인가 — 무엇을 바꿀지 · 바뀌었는지의 바탕' },
  { name: '광고 · 트랙 B 한 바퀴', handler: 'scheduledAdGrowCycle', hour: 5,
    why: '계산 → 상태 점검 → 작업 계획 → 자동운영인 것만 보내기' },
  { name: '광고 · 작업 검증', handler: 'scheduledAdVerify', hour: 6,
    why: '보낸 것이 실제로 그렇게 됐나' }
];

var ADSCHED_RETRY_PROP = 'ADSCHED_TRY_';
var ADSCHED_RETRY_MAX = 4;             // 리포트가 늦을 때 몇 번까지 다시 올 것인가
var ADSCHED_RETRY_MIN = 3;             // 몇 분 뒤에

/** 이 핸들러로 걸린 트리거를 모두 거둔다 */
function adSchedDrop_(handler) {
  var ts = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === handler) { ScriptApp.deleteTrigger(ts[i]); n++; }
  }
  return n;
}

/**
 * 몇 분 뒤 같은 걸음을 다시 건다 (아마존 리포트가 아직일 때).
 * 몇 번까지만 — 안 되는 것을 하루 종일 두드리지 않는다.
 * @return {boolean} 다시 걸었나
 */
function adSchedRetry_(handler) {
  var props = PropertiesService.getScriptProperties();
  var key = ADSCHED_RETRY_PROP + handler;
  var n = (Number(props.getProperty(key)) || 0) + 1;
  if (n > ADSCHED_RETRY_MAX) {
    props.deleteProperty(key);
    log_('ads', 'WARN', handler + ' — ' + ADSCHED_RETRY_MAX + '번 기다렸는데 아직입니다. ' +
         '오늘은 그만합니다 (내일 제 시각에 다시 옵니다)');
    return false;
  }
  props.setProperty(key, String(n));
  ScriptApp.newTrigger(handler).timeBased().after(ADSCHED_RETRY_MIN * 60 * 1000).create();
  log_('ads', 'INFO', handler + ' — 리포트가 아직이라 ' + ADSCHED_RETRY_MIN + '분 뒤 다시 (' +
       n + '/' + ADSCHED_RETRY_MAX + ')');
  return true;
}

function adSchedClear_(handler) {
  PropertiesService.getScriptProperties().deleteProperty(ADSCHED_RETRY_PROP + handler);
}

/**
 * 트리거 걸음 하나를 감싼다.
 *
 * · 창을 찾지 않게 하고 (사람이 없다)
 * · 터져도 다음 날 걸음을 죽이지 않게 잡아서 로그·메일로 남기고
 * · 다시 오라는 뜻('리포트 준비 중')이면 몇 분 뒤로 다시 건다
 */
function adSchedRun_(handler, label, fn) {
  uiSilent_(true);
  try {
    var r = fn();
    if (r === ADSPEND_PENDING) { adSchedRetry_(handler); return r; }
    adSchedClear_(handler);
    log_('ads', 'INFO', '자동 · ' + label + ' 끝');
    return r;
  } catch (e) {
    log_('ads', 'ERROR', '자동 · ' + label + ' 실패: ' + String(e).substring(0, 300));
    notifyAlert_('광고 자동 걸음 실패 — ' + label,
      String(e).substring(0, 800) + '\n\n' +
      '이 걸음만 실패했습니다. 나머지 걸음은 제 시각에 그대로 돕니다.\n' +
      '고치기 전까지는 표의 [자료기준일]이 뒤처지고, 그만큼 여력이 줄어듭니다.');
    return null;
  } finally {
    uiSilent_(false);
  }
}

// ── 트리거가 부르는 네 걸음 ─────────────────────────────
// 한 줄짜리인 것에 뜻이 있다. 트리거용 길을 따로 만들면 사람이 누르는 길과
// 갈라져 서로 다르게 동작하기 시작한다. 같은 함수를 그대로 부른다.

function scheduledAdSpend() {
  return adSchedRun_('scheduledAdSpend', '지출 원장 수집', fetchAdSpendDaily);
}

function scheduledAdStructure() {
  return adSchedRun_('scheduledAdStructure', '광고 구조 수집', fetchAdStructure);
}

function scheduledAdGrowCycle() {
  // quiet — 묻지 않고 보낸다. 승낙은 광고운영정책 표에 이미 있다 (자동운영 + 한도 + 승인).
  // 정책이 그렇지 않은 대상의 작업은 애초에 '모의' 라 여기서도 안 나간다.
  return adSchedRun_('scheduledAdGrowCycle', '트랙 B 한 바퀴',
                     function () { return runAdGrowCycle({ quiet: true }); });
}

function scheduledAdVerify() {
  return adSchedRun_('scheduledAdVerify', '작업 검증', verifyAdJobs);
}

// ── 켜고 끄기 ───────────────────────────────────────────

/** 메뉴: 매일 저절로 돌게 한다 */
function setupAdGrowTriggers() {
  var had = 0;
  for (var d = 0; d < AD_AUTOMATIONS.length; d++) had += adSchedDrop_(AD_AUTOMATIONS[d].handler);

  var lines = [];
  for (var i = 0; i < AD_AUTOMATIONS.length; i++) {
    var au = AD_AUTOMATIONS[i];
    ScriptApp.newTrigger(au.handler).timeBased().atHour(au.hour).everyDays(1).create();
    lines.push('· ' + pad2_(au.hour) + '시  ' + au.name + '\n      ' + au.why);
  }

  // 관제(매일 아침)는 따로 켠다 — 이미 켜져 있는지 알려만 준다
  var watchOn = false;
  var ts = ScriptApp.getProjectTriggers();
  for (var t = 0; t < ts.length; t++) {
    if (ts[t].getHandlerFunction() === ADWATCH_HANDLER) watchOn = true;
  }

  log_('ads', 'INFO', '광고 자동 걸음 ' + AD_AUTOMATIONS.length + '개 켬' +
       (had ? ' (옛 것 ' + had + '개 거둠)' : ''));
  ui_().alert('매일 자동으로 돌립니다',
    lines.join('\n') + '\n\n' +
    (watchOn ? '· 08시  광고 관제 (이미 켜져 있습니다)\n\n'
             : '⚠ 광고 관제는 아직 꺼져 있습니다 — [캠페인 점검]에서 켜면\n' +
               '   매일 아침 이상한 캠페인을 잡아 줍니다.\n\n') +
    '이제 사람이 매일 누를 것은 없습니다.\n\n' +
    '다만 이것은 여전히 사람이 정해야 다음 단계로 갑니다:\n' +
    '  · [기준키워드] — 어떤 말로 팔리게 할 것인가\n' +
    '  · [자동 → 수동 갈아타기] 와 그 뒤의 ③ 생성 · ⑤ 켜기\n\n' +
    '무엇을 정해야 하는지는 [요청함]과 표의 [다음 행동] 에 쌓입니다.',
    ui_().ButtonSet.OK);
}

/** 메뉴: 자동으로 도는 것을 멈춘다 (표와 캠페인은 그대로 둔다) */
function stopAdGrowTriggers() {
  var n = 0;
  for (var i = 0; i < AD_AUTOMATIONS.length; i++) n += adSchedDrop_(AD_AUTOMATIONS[i].handler);
  for (var j = 0; j < AD_AUTOMATIONS.length; j++) adSchedClear_(AD_AUTOMATIONS[j].handler);
  log_('ads', 'INFO', '광고 자동 걸음 ' + n + '개 끔');
  ui_().alert('자동으로 도는 것을 멈췄습니다',
    n + '개를 거뒀습니다.\n\n' +
    '켜져 있는 광고는 그대로 돕니다 — 멈춘 것은 "매일 저절로 계산하고 보내는 일" 뿐입니다.\n' +
    '광고를 멈추려면 [🔀 스위치 → 전부 멈추기] 를 쓰세요.',
    ui_().ButtonSet.OK);
}

/** 지금 무엇이 걸려 있나 (사람이 확인용) */
function showAdTriggers() {
  var ts = ScriptApp.getProjectTriggers();
  var mine = {};
  for (var i = 0; i < ts.length; i++) {
    var h = ts[i].getHandlerFunction();
    mine[h] = (mine[h] || 0) + 1;
  }
  var lines = [];
  for (var a = 0; a < AD_AUTOMATIONS.length; a++) {
    var au = AD_AUTOMATIONS[a];
    lines.push((mine[au.handler] ? '✅ ' : '⬜ ') + pad2_(au.hour) + '시  ' + au.name);
  }
  lines.push((mine[ADWATCH_HANDLER] ? '✅ ' : '⬜ ') + '08시  광고 관제');
  ui_().alert('광고 자동 걸음', lines.join('\n') + '\n\n' +
    '⬜ 는 꺼져 있는 것입니다. [매일 자동으로 돌리기 — 켜기] 로 한꺼번에 켭니다.',
    ui_().ButtonSet.OK);
}
