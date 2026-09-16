/**
 * 시트 정렬 — [오류확인] 은 오류 유형별로, [주문] 은 같은 상품끼리 모은다.
 *
 * 값을 읽어 다시 쓰지 않는다. 임시 열에 정렬키를 넣고 시트 자체 정렬(Range.sort)을
 * 쓴 뒤 그 열을 지운다. 이렇게 하면 배경색·글자색·숫자서식이 셀과 함께 움직여서
 * 전화번호·우편번호처럼 숫자로 들어간 칸이 상하지 않는다.
 */

var SORT_KEY_COL = COL_COUNT + 1;   // 임시 정렬키 열 (26)

var ERR_NAME = 16;
var ERR_ADDR = 8;
var ERR_PHONE = 4;
var ERR_PRICE = 2;
var ERR_ITEM = 1;      // 통관 금지 상품명

/**
 * 오류를 뜻하는 색이 칠해져 있는가.
 * 법인주문 바탕색(연한 초록)은 오류가 아니므로 제외한다 —
 * 안 그러면 법인주문 행이 이름·주소·전화·가격 오류로 잘못 잡힌다.
 */
function bgSet_(color) {
  var c = String(color || '').toLowerCase();
  return !!c && c !== '#ffffff' && c !== 'white' && c !== BG_BIZ.toLowerCase();
}

/** 완전히 빈 행인가 */
function rowBlank_(v) {
  for (var i = 0; i < v.length; i++) {
    if (String(v[i] == null ? '' : v[i]).trim()) return false;
  }
  return true;
}

/**
 * 정렬키를 임시 열에 넣고 시트 정렬을 돌린 뒤 열을 지운다.
 * @param sh 시트
 * @param keyOf function(값배열, 배경색배열, 원래인덱스) → 숫자 (작을수록 위)
 */
function sortSheetByKey_(sh, keyOf) {
  if (!sh || sh.getLastRow() < 3) return 0;

  var n = sh.getLastRow() - 1;
  if (sh.getMaxColumns() < SORT_KEY_COL) {
    sh.insertColumnsAfter(sh.getMaxColumns(), SORT_KEY_COL - sh.getMaxColumns());
  }

  var rng = sh.getRange(2, 1, n, COL_COUNT);
  var vals = rng.getValues();
  var bgs = rng.getBackgrounds();

  var keys = [];
  for (var i = 0; i < n; i++) keys.push([keyOf(vals[i], bgs[i], i)]);

  var keyRng = sh.getRange(2, SORT_KEY_COL, n, 1);
  keyRng.setValues(keys);
  sh.getRange(2, 1, n, SORT_KEY_COL).sort({ column: SORT_KEY_COL, ascending: true });
  keyRng.clearContent();
  SpreadsheetApp.flush();
  return n;
}

// ── [오류확인] — 오류 유형별 ────────────────────────────────────────────
//
// 확장 프로그램(amazon-jp-lister-v38)의 ordSortErrorRows 규칙을 그대로 옮겼다.
//  · 이름 → 주소 → 전화번호 → 가격 순으로 모은다
//  · 오류가 2종 이상인 행은 그 유형 그룹의 '끝'에 붙인다
//  · 중복 그룹 안에서는 오류 조합이 같은 것끼리 인접시킨다

/** 한 행의 오류 유형 — 칠해진 칸 또는 빈 칸으로 판정한다 */
function errBitsOfRow_(v, bg) {
  var colored = function (col) { return bgSet_(bg[col - 1]); };
  var empty = function (col) { return !String(v[col - 1] == null ? '' : v[col - 1]).trim(); };

  var bits = 0;
  if (colored(COL.RECEIVER) || empty(COL.RECEIVER)) bits |= ERR_NAME;
  // 우편번호는 주소 문제로 같이 본다
  if (colored(COL.ADDRESS) || empty(COL.ADDRESS) ||
      colored(COL.ZIP) || digits_(v[COL.ZIP - 1]).length !== 7) bits |= ERR_ADDR;
  if (colored(COL.TEL) || empty(COL.TEL)) bits |= ERR_PHONE;
  if (colored(COL.TOTAL) || empty(COL.TOTAL)) bits |= ERR_PRICE;
  if (colored(COL.TITLE_EN) || colored(COL.TITLE_KSE)) bits |= ERR_ITEM;
  return bits;
}

function bitCount_(bits) {
  var n = 0;
  for (var b = bits; b; b >>= 1) if (b & 1) n++;
  return n;
}

/** 유형 순위 — 오류가 2종 이상이면 첫 유형 그룹의 끝(sub=1)으로 */
function errRank_(bits) {
  var first = (bits & ERR_NAME) ? 0
    : (bits & ERR_ADDR) ? 1
      : (bits & ERR_PHONE) ? 2
        : (bits & ERR_PRICE) ? 3
          : (bits & ERR_ITEM) ? 4 : 5;
  return { rank: first, sub: bitCount_(bits) >= 2 ? 1 : 0 };
}

function 오류확인_정렬_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ERROR);
  return sortSheetByKey_(sh, function (v, bg, i) {
    if (rowBlank_(v)) return 9e11 + i;                 // 빈 행은 맨 아래
    var bits = errBitsOfRow_(v, bg);
    var r = errRank_(bits);
    // rank → sub → 오류조합 → 원래순서 (안정 정렬)
    return ((r.rank * 10 + r.sub) * 100 + bits) * 100000 + i;
  });
}

/** 오류 유형별 건수 — 요약 문구에 쓴다 */
function 오류확인_요약_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ERROR);
  if (!sh || sh.getLastRow() < 2) return '';

  var n = sh.getLastRow() - 1;
  var rng = sh.getRange(2, 1, n, COL_COUNT);
  var vals = rng.getValues();
  var bgs = rng.getBackgrounds();

  var count = { 이름: 0, 주소: 0, 전화번호: 0, 가격: 0, 금지상품명: 0, 법인주문: 0, 중복: 0 };
  for (var i = 0; i < n; i++) {
    if (rowBlank_(vals[i])) continue;
    var bits = errBitsOfRow_(vals[i], bgs[i]);
    if (bits & ERR_NAME) count.이름++;
    if (bits & ERR_ADDR) count.주소++;
    if (bits & ERR_PHONE) count.전화번호++;
    if (bits & ERR_PRICE) count.가격++;
    if (bits & ERR_ITEM) count.금지상품명++;
    if (isBizRow_(vals[i])) count.법인주문++;
    if (bitCount_(bits) >= 2) count.중복++;
  }

  var parts = [];
  ['이름', '주소', '전화번호', '가격', '금지상품명', '법인주문'].forEach(function (k) {
    if (count[k]) parts.push(k + ' ' + count[k]);
  });
  if (count.중복) parts.push('오류 2종 이상 ' + count.중복);
  return parts.join(' / ');
}

// ── [주문] — 같은 상품끼리 ──────────────────────────────────────────────
//
// 확장 프로그램과 같은 생각으로 정렬한다.
//  · 상품 하나인 박스 → 상품명 기준 (같은 물건끼리 붙는다)
//  · 합배송 박스(상품 2개 이상) → 맨 아래에 모아 수취인별로
// 상품명은 글자 그대로 비교하면 순서가 흔들려서, 정렬키로 쓸 숫자를 만들어 쓴다.

/** 정렬 비교용 정규화 — 앞뒤·전각 공백 차이를 없앤다 */
function sortKeyText_(s) {
  return String(s == null ? '' : s).replace(/[\s　]+/g, ' ').trim().toLowerCase();
}

/**
 * 문자열 목록을 사전순으로 0,1,2… 번호를 매긴 표로 바꾼다.
 * (Range.sort 는 숫자 한 칸으로만 정렬하므로 문자열을 순위 숫자로 바꿔야 한다)
 */
function rankTable_(list) {
  var uniq = [];
  var seen = {};
  list.forEach(function (s) {
    if (!seen[s]) { seen[s] = true; uniq.push(s); }
  });
  uniq.sort(function (a, b) {
    if (!a) return 1;               // 빈값은 뒤로
    if (!b) return -1;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  var rank = {};
  uniq.forEach(function (s, i) { rank[s] = i; });
  return rank;
}

/**
 * 발송기한 — 급한 것을 위로 올리는 기준.
 * 아마존 리포트의 promise-date(발송 약속일)를 쓰고, 없으면 주문일시로 본다.
 * 박스에 상품이 여러 개면 그중 가장 이른 기한을 쓴다.
 */
function rowDueKey_(v) {
  var best = '';
  var raw = String(v[COL.RAW - 1] || '');
  if (raw) {
    try {
      var g = JSON.parse(raw);
      (g.items || []).forEach(function (it) {
        var a = it.amz || {};
        var p = String(a['promise-date'] || a['promise_date'] || '').trim();
        if (p && (!best || p < best)) best = p;
      });
    } catch (e) { /* 아래 폴백 */ }
  }
  if (!best) best = String(v[COL.ORDER_TIME - 1] || '');
  return best;
}

function 주문_정렬_() {
  var sh = ordersSheet_();
  if (sh.getLastRow() < 3) return 0;

  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, 1, n, COL_COUNT).getValues();

  var titles = [], recvs = [], dues = [];
  for (var i = 0; i < n; i++) {
    titles.push(sortKeyText_(vals[i][COL.TITLE_EN - 1]));
    recvs.push(sortKeyText_(vals[i][COL.RECEIVER - 1]));
    dues.push(rowDueKey_(vals[i]));
  }
  var tRank = rankTable_(titles);
  var rRank = rankTable_(recvs);
  var dRank = rankTable_(dues);          // 기한이 이른 것이 작은 번호

  return sortSheetByKey_(sh, function (v, bg, i) {
    if (rowBlank_(v)) return 9e11 + i;
    var lines = String(v[COL.TITLE_EN - 1] || '').split('\n').length;
    var mergedBox = lines > 1 || String(v[COL.ORDER_IDS - 1] || '').indexOf('\n') >= 0;
    // 합배송은 맨 아래(1) — 수취인 기준, 상품 하나는 위(0) — 상품명 기준.
    // 같은 묶음 안에서는 발송기한이 이른(급한) 것을 위로.
    var group = mergedBox ? 1 : 0;
    var main = mergedBox ? rRank[recvs[i]] : tRank[titles[i]];
    return ((group * 100000 + main) * 100000 + dRank[dues[i]]) * 10000 + i;
  });
}

function 주문_정렬() {
  var n = 주문_정렬_();
  SpreadsheetApp.getUi().alert(
    n ? '[' + SHEET_ORDERS + '] ' + n + '행을 정렬했습니다.\n\n' +
      '상품 하나인 박스는 상품명 기준으로 같은 물건끼리 모았고,\n' +
      '같은 상품 안에서는 발송기한이 급한 것을 위로 올렸습니다.\n' +
      '합배송 박스는 맨 아래에 수취인별로 모았습니다.\n\n' +
      '④ KSE 배송등록은 이 시트의 아래 행부터 접수합니다 — 급한 건이 마지막에\n' +
      '접수돼, 접수 목록·송장을 뽑을 때 앞 장에 옵니다.'
      : '[' + SHEET_ORDERS + '] 시트에 정렬할 행이 없습니다.');
}

function 오류확인_정렬() {
  var n = 오류확인_정렬_();
  var sum = 오류확인_요약_();
  SpreadsheetApp.getUi().alert(
    n ? '[' + SHEET_ERROR + '] ' + n + '행을 오류 유형별로 모았습니다.\n\n' +
      '순서: 이름 → 주소 → 전화번호 → 가격 → 금지 상품명\n' +
      '오류가 2종 이상인 행은 그 유형 그룹의 끝에 붙였습니다.' +
      (sum ? '\n\n' + sum : '')
      : '[' + SHEET_ERROR + '] 시트에 정렬할 행이 없습니다.');
}
