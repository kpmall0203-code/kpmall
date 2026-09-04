/**
 * 60_설정.gs — 자동화 개별 제어 · SKU 제외 목록
 *
 * 자동화를 전부 켜거나 전부 끄는 방식은 실전에서 안 맞는다.
 * "환율은 자동으로 받되 주문 수집은 아직 안 켠다" 같은 상태가 필요하다.
 * 그래서 항목별 체크박스로 바꾸고, 체크 상태에 맞춰 트리거를 붙였다 뗀다.
 *
 * 제외 목록이 리프라이싱 전용인 이유:
 *   리프라이싱은 기본으로 전 SKU가 대상이라 '빼는' 장치가 필요하다(opt-out).
 *   최적화는 반대로 '원가' 탭에서 체크한 것만 들어온다(opt-in). 기본이 해제라
 *   따로 뺄 이유가 없고, 두 곳에서 제어하면 어디를 봐야 할지 헷갈린다.
 */

var SHEET_CONFIG = '자동화설정';
var CONFIG_HEADER = ['사용', '자동화', '실행시각', '하는 일', '켜기 전 필요한 것'];
var CF_ON = 0, CF_NAME = 1, CF_TIME = 2, CF_DESC = 3, CF_REQ = 4;

// 리프라이싱만 제외 목록이 필요하다. 방향이 반대이기 때문이다:
//   리프라이싱 — 기본으로 전 SKU가 대상이라 '빼는' 장치가 있어야 한다 (opt-out)
//   최적화     — 기본으로 아무것도 대상이 아니고 '원가' 탭에서 체크한 것만 들어온다 (opt-in)
// 최적화까지 여기서 또 제외하게 두면 같은 걸 두 군데서 제어하게 되어 헷갈린다.
var SHEET_EXCLUDE = '리프라이싱제외';
var EXCLUDE_HEADER = ['SKU', '제외', '사유', '등록일'];
var EX_SKU = 0, EX_REPRICE = 1, EX_REASON = 2, EX_AT = 3;

// 자동화에서 뺀 핸들러. 이미 걸려 있던 트리거를 확실히 거둬내기 위해 남겨둔다.
//
// 신규 등록 감사는 배송비 파일을 받아 넣어야만 판정이 의미를 갖는다.
// 파일이 들어오는 시점이 정해져 있지 않으니 매일 돌면 추정값 노이즈만 쌓인다.
// 메뉴에서 수동으로는 그대로 쓸 수 있다.
// Orders API 수집은 판매·트래픽 리포트로 갈음하기로 해 메뉴에서 뺐다.
// 코드는 남겨 두되(청구서↔SKU 연결이 아직 여기 의존한다) 자동 실행은 멈춘다.
// continueOrders 는 이어실행 체인이라, 이것까지 지워야 진행 중인 수집이 멎는다.
var AUTOMATIONS_RETIRED = ['scheduledAudit', 'scheduledOrdersSync', 'continueOrders'];

// 체크박스 이름 → 트리거 핸들러 / 실행 시각
var AUTOMATIONS = [
  { name: '환율 자동갱신', handler: 'scheduledFxUpdate', hour: 6,
    desc: '기준시세와 송금받을때를 매일 기록. 리프라이싱의 r1과 권장가가 여기서 나온다',
    req: '없음 — 가장 먼저 켜도 된다', dflt: true },
  { name: '환율 괴리 알림', handler: 'scheduledFxDrift', hour: 7,
    desc: '직전 리프라이싱 기준에서 ±3% 벌어지면 메일. "지금 돌릴 때"를 알려준다',
    req: '알림 메일 주소 설정', dflt: true }
];

/** 메뉴: 자동화 설정 탭 생성 */
function setupAutomationSheet() {
  buildAutomationSheet_();
  toast_('자동화 설정 탭 준비 완료');
  try {
    ui_().alert('자동화 설정',
      '"' + SHEET_CONFIG + '" 탭에서 켤 항목만 체크하세요.\n\n' +
      '체크를 바꾼 뒤 [자동화 설정 적용]을 실행해야 실제 트리거가 붙습니다.\n\n' +
      '리프라이싱은 이 목록에 없습니다 —\n' +
      '가격 변경은 절대 자동으로 실행되지 않고, 항상 사람이 승인합니다.',
      ui_().ButtonSet.OK);
  } catch (e) {}
}

/** 자동화설정 탭에 없어진 항목이 남아 있는가 (기능을 걷어내면 행만 남는다) */
function automationSheetIsStale_() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh || sh.getLastRow() < 4) return false;
  var known = {};
  for (var a = 0; a < AUTOMATIONS.length; a++) known[AUTOMATIONS[a].name] = true;
  var v = sh.getRange(4, 1, sh.getLastRow() - 3, CONFIG_HEADER.length).getValues();
  var live = 0;
  for (var i = 0; i < v.length; i++) {
    var nm = String(v[i][CF_NAME] || '').trim();
    if (!nm) continue;
    if (!known[nm]) return true;      // 목록에 없는 항목이 남아 있다
    live++;
  }
  return live !== AUTOMATIONS.length; // 새로 생긴 항목이 빠져 있다
}

/** 체크 상태를 보존하며 다시 그린다 (알림 없음) */
function buildAutomationSheet_() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  var prev = {};
  if (sh && sh.getLastRow() > 1) {
    var old = sh.getRange(2, 1, sh.getLastRow() - 1, CONFIG_HEADER.length).getValues();
    for (var i = 0; i < old.length; i++) prev[String(old[i][CF_NAME])] = old[i][CF_ON] === true;
  }
  sh = ensureSheet_(SHEET_CONFIG, CONFIG_HEADER);
  sh.clear();
  sh.getRange(1, 1).setValue('자동화 설정 — 체크한 것만 자동으로 돕니다')
    .setFontWeight('bold').setFontSize(12);
  sh.getRange(2, 1).setValue(
    '체크를 바꾼 뒤 반드시 메뉴 [자동화 설정 적용]을 실행하세요. 체크만으로는 반영되지 않습니다.')
    .setFontColor('#c5221f');
  sh.getRange(3, 1, 1, CONFIG_HEADER.length).setValues([CONFIG_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');

  var rows = AUTOMATIONS.map(function (a) {
    var on = (a.name in prev) ? prev[a.name] : a.dflt;
    return [on, a.name, '매일 ' + pad2_(a.hour) + ':00', a.desc, a.req];
  });
  sh.getRange(4, 1, rows.length, CONFIG_HEADER.length).setValues(rows);
  sh.getRange(4, 1, rows.length, 1).insertCheckboxes();
  sh.setFrozenRows(3);
  sh.setColumnWidth(1, 50);
  sh.setColumnWidth(2, 130);
  sh.setColumnWidth(3, 90);
  sh.setColumnWidth(4, 420);
  sh.setColumnWidth(5, 220);
}

/** 메뉴: 체크 상태를 실제 트리거에 반영 */
function applyAutomationSettings() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh || sh.getLastRow() < 4) {
    throw new Error('먼저 [자동화 설정 탭 만들기]를 실행하세요.');
  }
  var vals = sh.getRange(4, 1, sh.getLastRow() - 3, CONFIG_HEADER.length).getValues();
  var want = {};
  for (var i = 0; i < vals.length; i++) {
    want[String(vals[i][CF_NAME])] = vals[i][CF_ON] === true;
  }

  // 기존 트리거를 이름 기준으로 모두 거둬낸 뒤, 체크된 것만 새로 건다
  var managed = {};
  for (var a = 0; a < AUTOMATIONS.length; a++) managed[AUTOMATIONS[a].handler] = true;
  for (var rt = 0; rt < AUTOMATIONS_RETIRED.length; rt++) managed[AUTOMATIONS_RETIRED[rt]] = true;
  var ts = ScriptApp.getProjectTriggers();
  for (var t = 0; t < ts.length; t++) {
    if (managed[ts[t].getHandlerFunction()]) ScriptApp.deleteTrigger(ts[t]);
  }

  var on = [], off = [];
  for (var k = 0; k < AUTOMATIONS.length; k++) {
    var au = AUTOMATIONS[k];
    if (want[au.name]) {
      ScriptApp.newTrigger(au.handler).timeBased().atHour(au.hour).everyDays(1).create();
      on.push('· ' + au.name + ' (매일 ' + pad2_(au.hour) + '시)');
    } else {
      off.push('· ' + au.name);
    }
  }

  var msg = '자동화 ' + on.length + '개 켜짐 / ' + off.length + '개 꺼짐';
  log_('config', 'INFO', msg);
  toast_(msg);
  try {
    ui_().alert('자동화 설정 적용됨',
      (on.length ? '켜진 것:\n' + on.join('\n') + '\n\n' : '켜진 자동화가 없습니다.\n\n') +
      (off.length ? '꺼진 것:\n' + off.join('\n') : ''),
      ui_().ButtonSet.OK);
  } catch (e) {}
  return msg;
}

// ── 제외 목록 ────────────────────────────────────────────

/** 메뉴: 리프라이싱 제외 목록 탭 생성 */
function setupExcludeSheet() {
  var sh = ss_().getSheetByName(SHEET_EXCLUDE);
  if (sh && sh.getLastRow() > 1) {
    toast_('제외 목록이 이미 있습니다 (' + (sh.getLastRow() - 1) + '건)');
    return;
  }
  sh = ensureSheet_(SHEET_EXCLUDE, EXCLUDE_HEADER);
  sh.getRange(1, 1, 1, EXCLUDE_HEADER.length).setFontWeight('bold')
    .setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(EX_SKU + 1, 320);
  sh.setColumnWidth(EX_REASON + 1, 260);
  sh.getRange(2, EX_REPRICE + 1, 500, 1).insertCheckboxes();
  sh.getRange(2, 1).setNote(
    'SKU를 넣고 [제외]에 체크하면 환율 리프라이싱 대상에서 빠집니다.\n' +
    '체크된 SKU는 리프라이싱 표에 아예 뜨지 않습니다.\n\n' +
    '프로모션 중, 최저가 경쟁 중, 재고 소진 예정인 SKU에 쓰세요.\n\n' +
    '※ 가격 최적화는 여기가 아니라 "원가" 탭의 [최적화] 체크로 정합니다.\n' +
    '   (기본이 해제라 따로 뺄 필요가 없습니다)');
  toast_('리프라이싱 제외 목록을 만들었습니다.');
  try {
    ui_().alert('리프라이싱 제외 목록',
      'A열에 SKU를 넣고 [제외]에 체크하세요.\n' +
      '체크된 SKU는 리프라이싱 표에 아예 나타나지 않습니다.\n\n' +
      '가격 최적화는 여기서 관리하지 않습니다 —\n' +
      '"원가" 탭의 [최적화] 체크박스로 정하며, 기본값이 해제입니다.\n' +
      '두 곳에서 같은 걸 제어하면 헷갈리므로 한쪽으로 몰았습니다.',
      ui_().ButtonSet.OK);
  } catch (e) {}
}

/** {sku: {reprice:bool}} — 구버전 3열 탭도 그대로 읽는다 */
var _excludeCache = null;
function excludeMap_() {
  if (_excludeCache) return _excludeCache;
  var map = {};
  var sh = ss_().getSheetByName(SHEET_EXCLUDE) || ss_().getSheetByName('자동화제외');
  if (sh && sh.getLastRow() > 1) {
    var nCol = Math.max(sh.getLastColumn(), EXCLUDE_HEADER.length);
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, nCol).getValues();
    for (var i = 0; i < vals.length; i++) {
      var sku = String(vals[i][EX_SKU] || '').trim();
      if (!sku) continue;
      map[sku] = { reprice: vals[i][EX_REPRICE] === true };
    }
  }
  _excludeCache = map;
  return map;
}

function clearExcludeCache_() { _excludeCache = null; }

/** 메뉴: 선택한 셀의 SKU를 제외 목록에 추가 */
function excludeSelectedSku() {
  var sel = ss_().getActiveRange();
  if (!sel) throw new Error('SKU가 있는 셀을 선택한 뒤 실행하세요.');
  var vals = sel.getValues();
  var skus = [];
  for (var r = 0; r < vals.length; r++) {
    for (var c = 0; c < vals[r].length; c++) {
      var v = String(vals[r][c] || '').trim();
      // SKU처럼 보이는 값만 (짧은 숫자나 빈 값 제외)
      if (v && v.length >= 4 && !/^[\d.,%\s-]+$/.test(v)) skus.push(v);
    }
  }
  if (!skus.length) throw new Error('선택 영역에서 SKU를 찾지 못했습니다.');

  var sh = ensureSheet_(SHEET_EXCLUDE, EXCLUDE_HEADER);
  var existing = excludeMap_();
  var now = new Date();
  var rows = [];
  for (var i = 0; i < skus.length; i++) {
    if (existing[skus[i]]) continue;
    rows.push([skus[i], true, '수동 추가', now]);
  }
  if (!rows.length) { toast_('이미 전부 제외 목록에 있습니다.'); return; }
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, EXCLUDE_HEADER.length).setValues(rows);
  sh.getRange(start, EX_REPRICE + 1, rows.length, 1).insertCheckboxes();
  clearExcludeCache_();
  toast_(rows.length + '개 SKU를 제외 목록에 추가했습니다.');
}
