/**
 * 73_냉장전환.gs — 계절이 풀린 냉장 상품을 일반 배송으로 되돌린다
 *
 * ── 무엇이 문제인가 ─────────────────────────────────────
 * 여름에 냉장으로 보낸 건은 청구서에 냉장 요금으로 찍힌다. 실측 배송비는 그 청구서에서
 * 나오므로, 계절이 풀려 일반으로 보내기 시작해도 시스템은 계속 냉장 요금을 쓴다.
 * 새 청구서가 몇 달 쌓여 중앙값이 넘어갈 때까지 여름 요금이 겨울까지 따라온다.
 *
 * 무게는 그대로다. 바뀌는 건 요율표뿐이라, 같은 적용무게를 일반 표에서 다시 읽으면 된다.
 *   냉장 2.5kg = 1,900엔  →  일반 2.5kg = 980엔
 *
 * ── 리프라이싱과의 관계 ─────────────────────────────────
 * 배송비가 내려가면 그만큼 마진이 늘어난다. 마진을 그대로 두려면 가격을 내려야 하는데,
 * 얼마나 내릴지는 대장을 뒤질 필요가 없다. 마진 식에서 바로 나온다:
 *
 *   이익(원) = (P×(1−f) − S) × r − C
 *   S가 ΔS만큼 줄 때 이익을 같게 하려면  P_new = P_old − ΔS/(1−f)
 *
 * 지난 리프라이싱을 소급해 고칠 일은 없다. 여름의 냉장 배송비는 실제로 나간 돈이고,
 * 그때 계산은 그때 기준으로 맞았다. 지금 필요한 건 '수준 한 번 조정'뿐이다.
 * 앞으로의 환율 리프라이싱은 s가 낮아지면서 w가 커져 자동으로 반영된다.
 *
 * 다만 대장에는 반드시 남겨야 한다. r0(가격에 박힌 환율)를 대장의 마지막 반영
 * 기록에서 읽기 때문이다. 가격만 바꾸고 기록을 안 남기면, 다음 환율 리프라이싱이
 * 이미 지나간 환율 변동을 한 번 더 적용한다. 그래서 가격 조정은 직접 쓰지 않고
 * 리프라이싱 탭에 제안으로 올려 기존 승인·반영·대장 경로를 그대로 타게 한다.
 */

var SHEET_COOLSW = '냉장전환';
var COOLSW_HEADER = [
  '전환', 'SKU', '상품명', '적용무게(kg)', '냉장배송비', '일반배송비', '절감액',
  '판매가', '현재 배송비율', '전환후 배송비율', '권장 인하폭', '월 절감(JPY)',
  '배송건수', '전환일'
];
var CW_ON = 0, CW_SKU = 1, CW_NAME = 2, CW_KG = 3, CW_COOL = 4, CW_NORM = 5,
    CW_SAVE = 6, CW_PRICE = 7, CW_S0 = 8, CW_S1 = 9, CW_CUT = 10, CW_MSAVE = 11,
    CW_N = 12, CW_SINCE = 13;

/**
 * 냉장전환 대장 — 무엇을 언제 어떻게 바꿨는가.
 *
 * ── 왜 탭의 [전환일] 칸만으로는 부족한가 ────────────────
 * 세 가지가 안 된다.
 *
 * ① 되돌릴 수 없다. 체크를 잘못 끄고 [적용]을 누르면 전환일이 지워지고 끝이다.
 *    무엇이 켜져 있었는지 알 방법이 없다.
 *
 * ② 목록을 다시 만들면 조용히 사라진다. [냉장 SKU 목록 만들기]는 표를 새로 그리는데,
 *    새 청구서가 들어와 그 SKU가 더는 '냉장으로 청구된 것'이 아니게 되면
 *    후보 목록에서 빠지고 전환일도 같이 없어진다. 그러면 배송비가 말없이
 *    냉장 요금으로 되돌아가 배송비율·손익분기가 통째로 흔들린다.
 *
 * ③ 언제 무엇을 왜 바꿨는지 남지 않는다.
 *
 * 그래서 가격변경 대장과 같은 방식으로 간다 — 표는 '고치는 자리'이고,
 * 대장이 '기록'이다. 지우지 않고 덧붙이기만 한다.
 * 되돌리기도 지우는 게 아니라 반대 동작을 한 줄 더 적는 것이다.
 */
var SHEET_COOLLOG = '냉장전환대장';
var COOLLOG_HEADER = [
  '일시', '실행ID', 'SKU', '동작', '적용무게(kg)',
  '냉장배송비', '일반배송비', '절감액', '사유'
];
var CL_AT = 0, CL_RUN = 1, CL_SKU = 2, CL_ACT = 3, CL_KG = 4,
    CL_COOL = 5, CL_NORM = 6, CL_SAVE = 7, CL_REASON = 8;

var COOL_ON = '전환';        // 냉장 → 일반
var COOL_OFF = '해제';       // 일반 → 냉장 (되돌림)

var _coolSwCache = null;

/**
 * 일반 배송으로 돌린 SKU 집합.
 *
 * 대장의 마지막 동작으로 판정한다 — 표가 아니라. 표는 다시 그려지지만
 * 대장은 안 지워지므로, 후보 목록에서 빠진 SKU도 전환 상태를 그대로 지킨다.
 */
function coolSwitchSet_() {
  if (_coolSwCache) return _coolSwCache;
  coolLogSeed_();

  var last = {};
  var sh = ss_().getSheetByName(SHEET_COOLLOG);
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, COOLLOG_HEADER.length).getValues();
    // 덧붙이기만 하므로 아래로 갈수록 새 기록이다. 그대로 훑으며 덮어쓰면 마지막이 남는다
    for (var i = 0; i < v.length; i++) {
      var sku = String(v[i][CL_SKU] || '').trim();
      if (!sku) continue;
      last[sku] = String(v[i][CL_ACT] || '').trim();
    }
  }
  var out = {};
  for (var k in last) if (last[k] === COOL_ON) out[k] = true;
  _coolSwCache = out;
  return out;
}

/**
 * 대장이 없던 시절의 [전환일]을 대장으로 옮긴다 (최초 1회).
 * 이미 전환해둔 것을 잃지 않으려는 것이라, 대장이 비었을 때만 돈다.
 */
function coolLogSeed_() {
  var lg = ss_().getSheetByName(SHEET_COOLLOG);
  if (lg && lg.getLastRow() > 1) return 0;         // 이미 대장이 있다
  var sh = ss_().getSheetByName(SHEET_COOLSW);
  if (!sh || sh.getLastRow() < 3) return 0;

  var v = sh.getRange(3, 1, sh.getLastRow() - 2, COOLSW_HEADER.length).getValues();
  var rows = [], runId = 'SEED_' + ymd_(new Date()).replace(/-/g, '');
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][CW_SKU] || '').trim();
    if (!sku || !v[i][CW_SINCE]) continue;
    rows.push([v[i][CW_SINCE], runId, sku, COOL_ON, v[i][CW_KG],
               v[i][CW_COOL], v[i][CW_NORM], v[i][CW_SAVE], '이전 기록에서 옮김']);
  }
  if (!rows.length) return 0;
  coolLogAppend_(rows);
  log_('coolsw', 'INFO', '냉장전환 대장 생성 — 기존 전환 ' + rows.length + '건을 옮겼습니다');
  return rows.length;
}

/**
 * 겹치지 않는 실행ID.
 *
 * 초 단위 시각만 쓰면 같은 초에 두 번 적용했을 때 두 실행이 한 덩어리가 된다.
 * 되돌리기는 이 ID로 '그때 한 일'을 묶어 찾으므로, 뭉치면 엉뚱한 것까지 되돌린다.
 * 이미 있는 ID면 뒤에 번호를 붙인다.
 */
function coolRunId_(now) {
  var base = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var used = {};
  var sh = ss_().getSheetByName(SHEET_COOLLOG);
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, CL_RUN + 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < v.length; i++) used[String(v[i][0]).trim()] = true;
  }
  if (!used[base]) return base;
  for (var k = 2; k < 100; k++) {
    if (!used[base + '-' + k]) return base + '-' + k;
  }
  return base + '-' + Math.floor(Math.random() * 100000);
}

function coolLogAppend_(rows) {
  if (!rows || !rows.length) return;
  var sh = ensureSheet_(SHEET_COOLLOG, COOLLOG_HEADER);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COOLLOG_HEADER.length).setValues([COOLLOG_HEADER])
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  var CH = 2000;
  for (var s = 0; s < rows.length; s += CH) {
    var part = rows.slice(s, s + CH);
    sh.getRange(sh.getLastRow() + 1, 1, part.length, COOLLOG_HEADER.length).setValues(part);
  }
  _coolSwCache = null;
}

/**
 * 대장에 남은 실행 목록 (최근 것부터).
 * @return {Array<{id, at, on, off, skus:Array}>}
 */
function coolRuns_() {
  var sh = ss_().getSheetByName(SHEET_COOLLOG);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, COOLLOG_HEADER.length).getValues();
  var by = {}, order = [];
  for (var i = 0; i < v.length; i++) {
    var id = String(v[i][CL_RUN] || '').trim();
    var sku = String(v[i][CL_SKU] || '').trim();
    if (!id || !sku) continue;
    if (!by[id]) {
      by[id] = { id: id, at: v[i][CL_AT], on: 0, off: 0, rows: [] };
      order.push(id);
    }
    var act = String(v[i][CL_ACT] || '').trim();
    if (act === COOL_ON) by[id].on++; else by[id].off++;
    by[id].rows.push(v[i]);
  }
  var out = [];
  for (var j = order.length - 1; j >= 0; j--) out.push(by[order[j]]);
  return out;
}

function clearCoolSwitchCache_() { _coolSwCache = null; }

/** 이 SKU를 일반 배송으로 돌렸는가 */
function coolSwitched_(sku) { return coolSwitchSet_()[sku] === true; }

/** 메뉴: 냉장 SKU 목록 만들기 */
function buildCoolSwitchSheet() {
  clearCostCache_(); clearCostSheetCache_(); clearCoolSwitchCache_();
  var skuCost = skuCostMap_();
  var manual = costInfoMap_();

  // 전환 상태는 대장에서 읽는다 — 표가 아니라.
  // 표에서 읽으면, 후보 목록에서 빠진 SKU의 전환일이 표를 다시 그릴 때 사라지고
  // 배송비가 말없이 냉장 요금으로 되돌아간다.
  var switched = coolSwitchSet_();
  var since = {};
  var prev = ss_().getSheetByName(SHEET_COOLSW);
  if (prev && prev.getLastRow() > 2) {
    var pv = prev.getRange(3, 1, prev.getLastRow() - 2, COOLSW_HEADER.length).getValues();
    for (var p = 0; p < pv.length; p++) {
      var ps = String(pv[p][CW_SKU] || '').trim();
      if (ps && pv[p][CW_SINCE]) since[ps] = pv[p][CW_SINCE];   // 언제 전환했는지만 가져온다
    }
  }
  var today0 = ymd_(new Date());
  for (var sw in switched) if (!since[sw]) since[sw] = today0;

  var priceOf = {}, nameOf = {};
  var listSh = ss_().getSheetByName(SHEET_LISTING);
  if (listSh && listSh.getLastRow() > 1) {
    var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      var s = String(lv[i][L_SKU] || '').trim();
      if (!s) continue;
      priceOf[s] = Number(lv[i][L_PRICE]) || 0;
      nameOf[s] = String(lv[i][L_KR] || lv[i][L_JP] || '');
    }
  }
  var monthly = salesQtyMap_();

  var rows = [], seen = {};
  for (var sku in skuCost) {
    var c = skuCost[sku];
    seen[sku] = true;
    // 냉장으로 청구된 것이 후보다. 다만 이미 전환한 SKU는 청구가 일반으로 바뀌었어도
    // 목록에 남긴다 — 표에서 사라지면 되돌릴 체크박스가 없어진다.
    if (!c.cool && !switched[sku]) continue;
    if (!(c.weight > 0)) continue;         // 적용무게를 모르면 일반 요율을 못 읽는다

    // 전환 뒤에는 청구가 일반 요금으로 찍히므로 feeMed 를 '냉장 요금'으로 쓰면 안 된다.
    // 그럴 때는 요율표에서 같은 무게의 냉장 요금을 읽는다.
    var coolFee = (c.cool && c.feeMed > 0) ? c.feeMed : shippingFeeFor_(c.weight, true);
    var normFee = shippingFeeFor_(c.weight, false);
    var save = coolFee - normFee;
    if (!(save > 0) && !switched[sku]) continue;

    var price = priceOf[sku] || 0;
    var qty = monthly[sku] || 0;
    rows.push([
      !!switched[sku], sku, nameOf[sku] || '', c.weight,
      Math.round(coolFee), Math.round(normFee), Math.round(save),
      price,
      price > 0 ? coolFee / price : '',
      price > 0 ? normFee / price : '',
      Math.round(save / (1 - DEFAULT_FEE_RATE)),      // 마진 유지하려면 이만큼 인하
      Math.round(save * qty),
      c.n,
      since[sku] || ''
    ]);
  }
  if (!rows.length) {
    throw new Error('냉장으로 청구된 SKU가 없습니다.\n\n' +
      '[🔄 데이터 갱신 → 환율·청구서·원가]로 청구서를 먼저 적재하세요.\n' +
      '(냉장 여부는 메모가 아니라 청구 금액으로 판정합니다)');
  }
  rows.sort(function (a, b) { return b[CW_MSAVE] - a[CW_MSAVE]; });

  // 전환해뒀는데 SKU원가에서 아예 사라진 것 — 표에 못 올리지만 상태는 살아 있다.
  // 말없이 두면 '왜 배송비가 저 값이지'를 영영 못 찾는다.
  var orphan = [];
  for (var ow in switched) if (!seen[ow]) orphan.push(ow);

  var sh = ensureSheet_(SHEET_COOLSW, COOLSW_HEADER);
  sh.clear();
  var already = rows.filter(function (r) { return r[CW_ON]; }).length;
  sh.getRange(1, 1).setValue(
    '냉장 SKU ' + rows.length + '개 · 이미 전환 ' + already + '개' +
    (orphan.length ? ' · 표 밖 전환 ' + orphan.length + '개' : '') +
    '   |   [전환] 칸을 켜고 [냉장전환 적용]을 실행하세요' +
    '   |   기록은 ' + SHEET_COOLLOG + ' 탭 · 통째 되돌리기는 [냉장전환 되돌리기]')
    .setFontWeight('bold');
  sh.getRange(2, 1, 1, COOLSW_HEADER.length).setValues([COOLSW_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.getRange(3, 1, rows.length, COOLSW_HEADER.length).setValues(rows);
  sh.getRange(3, CW_ON + 1, rows.length, 1).insertCheckboxes();
  sh.getRange(3, CW_COOL + 1, rows.length, 3).setNumberFormat('#,##0');
  sh.getRange(3, CW_PRICE + 1, rows.length, 1).setNumberFormat('#,##0');
  sh.getRange(3, CW_S0 + 1, rows.length, 2).setNumberFormat('0.0%');
  sh.getRange(3, CW_CUT + 1, rows.length, 2).setNumberFormat('#,##0');
  sh.setFrozenRows(2);

  var totalSave = 0;
  for (var t = 0; t < rows.length; t++) totalSave += rows[t][CW_MSAVE];
  var msg = '냉장 SKU ' + rows.length + '개 · 전부 전환 시 월 ' +
            Math.round(totalSave).toLocaleString() + '엔 절감';
  log_('coolsw', 'INFO', msg);
  toast_(msg);
  showSheet_(SHEET_COOLSW);
  ui_().alert('냉장 → 일반 전환 후보',
    msg + '\n\n' +
    '"' + SHEET_COOLSW + '" 탭에서 일반으로 보낼 SKU의 [전환] 칸을 켜고\n' +
    '[⚙ 설정 → 냉장전환 적용]을 실행하세요.\n\n' +
    '■ 적용하면 바뀌는 것\n' +
    '   배송비가 같은 무게의 일반 요율로 바뀝니다.\n' +
    '   배송비율·손익분기·수익성이 전부 따라 내려갑니다.\n' +
    '   앞으로의 환율 리프라이싱도 낮아진 배송비로 계산됩니다.\n\n' +
    '■ 가격은 자동으로 안 내립니다\n' +
    '   [권장 인하폭]은 마진을 여름과 똑같이 두는 값입니다.\n' +
    '   그대로 두면 그만큼 마진이 늘어납니다 — 어느 쪽이든 장사 판단입니다.\n' +
    '   내리기로 했다면 [▶ 리프라이싱 → 냉장해제 가격 조정]으로 제안을 만드세요.\n\n' +
    '■ 되돌릴 수 있습니다\n' +
    '   적용할 때마다 [' + SHEET_COOLLOG + '] 탭에 기록이 남습니다.\n' +
    '   실수했으면 [⚙ 설정 → 🗂 자료 관리 → 냉장전환 되돌리기]에서\n' +
    '   그 실행을 통째로 되돌리세요 (체크를 일일이 되짚을 필요 없습니다).' +
    (orphan.length
      ? '\n\n■ 표에 없지만 전환 상태인 SKU ' + orphan.length + '개\n' +
        '   ' + orphan.slice(0, 5).join(', ') +
        (orphan.length > 5 ? ' 외 ' + (orphan.length - 5) + '개' : '') + '\n' +
        '   청구서에서 사라져 후보 목록에 안 잡힙니다. 전환 상태는 그대로 살아 있고\n' +
        '   배송비도 일반 요율로 계산됩니다 — 되돌리려면 [냉장전환 되돌리기]를 쓰세요.'
      : ''),
    ui_().ButtonSet.OK);
  return msg;
}

/** 메뉴: 체크한 SKU를 전환/해제한다 */
function applyCoolSwitch() {
  var sh = ss_().getSheetByName(SHEET_COOLSW);
  if (!sh || sh.getLastRow() < 3) {
    throw new Error('"' + SHEET_COOLSW + '" 탭이 없습니다.\n' +
      '[⚙ 설정 → 냉장 SKU 목록 만들기]를 먼저 실행하세요.');
  }
  var n = sh.getLastRow() - 2;
  var v = sh.getRange(3, 1, n, COOLSW_HEADER.length).getValues();
  var today = ymd_(new Date());
  var now = new Date();
  var runId = coolRunId_(now);
  var on = 0, off = 0, keep = 0;
  var sinceCol = [], logRows = [], offList = [];

  for (var i = 0; i < n; i++) {
    var want = v[i][CW_ON] === true;
    var had = !!v[i][CW_SINCE];
    var sku = String(v[i][CW_SKU] || '').trim();
    if (want && !had) {
      sinceCol.push([today]); on++;
      logRows.push([now, runId, sku, COOL_ON, v[i][CW_KG],
                    v[i][CW_COOL], v[i][CW_NORM], v[i][CW_SAVE], '냉장전환 적용']);
    } else if (!want && had) {
      sinceCol.push(['']); off++;
      offList.push(sku);
      logRows.push([now, runId, sku, COOL_OFF, v[i][CW_KG],
                    v[i][CW_COOL], v[i][CW_NORM], v[i][CW_SAVE], '냉장전환 적용 (체크 해제)']);
    } else {
      sinceCol.push([v[i][CW_SINCE] || '']); if (want) keep++;
    }
  }
  if (!on && !off) {
    ui_().alert('바뀐 것이 없습니다.\n[전환] 칸을 켜거나 끄고 다시 실행하세요.');
    return;
  }

  var ans = ui_().alert('냉장전환 적용',
    '일반 배송으로 전환: ' + on + '개\n' +
    '냉장으로 되돌림: ' + off + '개\n' +
    '(유지 ' + keep + '개)\n\n' +
    (off ? '⚠ 되돌리는 ' + off + '개는 배송비가 냉장 요금으로 올라갑니다.\n' +
           '   ' + offList.slice(0, 5).join(', ') +
           (offList.length > 5 ? ' 외 ' + (offList.length - 5) + '개' : '') + '\n\n' : '') +
    '배송비가 바로 바뀝니다. 가격은 건드리지 않습니다.\n' +
    '기록은 [' + SHEET_COOLLOG + ']에 남아, 통째로 되돌릴 수 있습니다.\n\n계속할까요?',
    ui_().ButtonSet.YES_NO);
  if (ans !== ui_().Button.YES) return;

  // 대장을 먼저 쓴다 — 표만 바뀌고 기록이 없으면 되돌릴 수단이 사라진다
  coolLogAppend_(logRows);
  sh.getRange(3, CW_SINCE + 1, n, 1).setValues(sinceCol);
  clearCoolSwitchCache_();

  var msg = '냉장전환 — 전환 ' + on + '개 · 해제 ' + off + '개 (' + runId + ')';
  log_('coolsw', 'INFO', msg);
  toast_(msg);
  ui_().alert('냉장전환 적용 완료', msg + '\n\n' +
    '배송비가 바뀌었으므로 아래 결과도 다시 뽑아야 최신입니다:\n' +
    '   [📊 분석 → 매출 기여도]  (배송비율·배송판정)\n' +
    '   [📊 분석 → 📦 배송비 · 원가 → 수익성 분석]  (손익분기)\n\n' +
    '가격을 내리려면 [▶ 리프라이싱 → 냉장해제 가격 조정].\n\n' +
    '잘못 눌렀으면 [⚙ 설정 → 🗂 자료 관리 → 냉장전환 되돌리기]에서\n' +
    '이 실행(' + runId + ')을 통째로 되돌릴 수 있습니다.',
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * 메뉴: 냉장전환 되돌리기.
 *
 * 기록을 지우지 않는다. 그 실행이 한 일의 반대를 한 줄씩 더 적는다 —
 * 가격 되돌리기와 같은 방식이다. 그래야 '되돌린 것을 다시 되돌리기'도 되고,
 * 무슨 일이 있었는지가 대장에 그대로 남는다.
 */
function rollbackCoolSwitch() {
  coolLogSeed_();
  var runs = coolRuns_();
  if (!runs.length) {
    ui_().alert('냉장전환 되돌리기',
      '되돌릴 기록이 없습니다.\n\n' +
      '[⚙ 설정 → 냉장전환 적용]을 한 번이라도 실행하면 여기에 쌓입니다.',
      ui_().ButtonSet.OK);
    return;
  }

  var show = runs.slice(0, 9);
  var lines = show.map(function (r, i) {
    var at = r.at instanceof Date
      ? Utilities.formatDate(r.at, Session.getScriptTimeZone(), 'MM-dd HH:mm')
      : String(r.at).substring(0, 16);
    return '  ' + (i + 1) + ') ' + at + '  전환 ' + r.on + ' · 해제 ' + r.off +
           '   [' + r.id + ']';
  }).join('\n');

  var res = ui_().prompt('냉장전환 되돌리기',
    '어느 실행을 되돌릴까요?\n\n' + lines + '\n\n' +
    '고른 실행이 한 일의 반대를 합니다 —\n' +
    '그때 전환한 것은 냉장으로, 해제한 것은 다시 일반으로 돌립니다.\n\n' +
    '번호를 입력하세요.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var pick = parseInt(String(res.getResponseText()).trim(), 10);
  if (!(pick >= 1 && pick <= show.length)) {
    ui_().alert('1 ~ ' + show.length + ' 사이로 넣으세요.');
    return;
  }
  var run = show[pick - 1];

  // 지금 상태와 견줘 실제로 바뀔 것만 센다.
  // 그 뒤에 다른 실행이 같은 SKU를 또 건드렸으면 이미 원하는 상태일 수 있다.
  var cur = coolSwitchSet_();
  var now = new Date();
  var newId = coolRunId_(now).replace(/^/, 'UNDO_' + run.id + '@');
  var logRows = [], nOn = 0, nOff = 0, already = 0;
  for (var i = 0; i < run.rows.length; i++) {
    var r = run.rows[i];
    var sku = String(r[CL_SKU] || '').trim();
    if (!sku) continue;
    var was = String(r[CL_ACT] || '').trim();
    var want = (was === COOL_ON) ? COOL_OFF : COOL_ON;   // 반대로
    var isOn = cur[sku] === true;
    if ((want === COOL_ON) === isOn) { already++; continue; }
    logRows.push([now, newId, sku, want, r[CL_KG], r[CL_COOL], r[CL_NORM], r[CL_SAVE],
                  '되돌리기 → ' + run.id]);
    if (want === COOL_ON) nOn++; else nOff++;
  }

  if (!logRows.length) {
    ui_().alert('냉장전환 되돌리기',
      '이미 그 상태입니다 — 바꿀 것이 없습니다.\n' +
      '(그 뒤 실행이 같은 SKU를 다시 손댔을 수 있습니다)',
      ui_().ButtonSet.OK);
    return;
  }

  var ans = ui_().alert('냉장전환 되돌리기',
    '[' + run.id + ']을 되돌립니다.\n\n' +
    '   일반으로 돌림 : ' + nOn + '개\n' +
    '   냉장으로 돌림 : ' + nOff + '개\n' +
    (already ? '   이미 그 상태라 건너뜀 : ' + already + '개\n' : '') + '\n' +
    '배송비가 바로 바뀝니다.\n' +
    '기록은 지우지 않고 반대 동작을 대장에 덧붙입니다.\n\n' +
    '⚠ 가격은 안 돌아갑니다.\n' +
    '   [냉장해제 가격 조정]으로 이미 값을 내렸다면,\n' +
    '   그건 [▶ 리프라이싱 → ↩ 되돌리기]에서 따로 되돌려야 합니다.\n\n계속할까요?',
    ui_().ButtonSet.YES_NO);
  if (ans !== ui_().Button.YES) return;

  coolLogAppend_(logRows);
  clearCoolSwitchCache_();
  coolSyncSheet_();

  var msg = '냉장전환 되돌리기 [' + run.id + '] — 일반 ' + nOn + ' · 냉장 ' + nOff;
  log_('coolsw', 'INFO', msg);
  toast_(msg);
  showSheet_(SHEET_COOLLOG);
  ui_().alert('냉장전환 되돌리기 완료', msg + '\n\n' +
    '배송비가 바뀌었으므로 아래도 다시 뽑아야 최신입니다:\n' +
    '   [📊 분석 → 매출 기여도]\n' +
    '   [📊 분석 → 📦 배송비 · 원가 → 수익성 분석]\n\n' +
    '이 되돌리기 자체도 대장에 남아 있어 다시 되돌릴 수 있습니다.',
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * 대장 상태를 냉장전환 탭의 체크·전환일에 맞춰 다시 그린다.
 * 되돌린 뒤 표가 옛 상태로 남아 있으면, 다음에 [적용]을 누를 때
 * 그 옛 체크가 그대로 반영돼 되돌리기가 무효가 된다.
 */
function coolSyncSheet_() {
  var sh = ss_().getSheetByName(SHEET_COOLSW);
  if (!sh || sh.getLastRow() < 3) return 0;
  var on = coolSwitchSet_();
  var n = sh.getLastRow() - 2;
  var v = sh.getRange(3, 1, n, COOLSW_HEADER.length).getValues();
  var today = ymd_(new Date());
  var chk = [], since = [], changed = 0;
  for (var i = 0; i < n; i++) {
    var sku = String(v[i][CW_SKU] || '').trim();
    var isOn = !!on[sku];
    if (isOn !== (v[i][CW_ON] === true)) changed++;
    chk.push([isOn]);
    since.push([isOn ? (v[i][CW_SINCE] || today) : '']);
  }
  sh.getRange(3, CW_ON + 1, n, 1).setValues(chk);
  sh.getRange(3, CW_SINCE + 1, n, 1).setValues(since);
  return changed;
}

/**
 * 메뉴: 냉장해제분 가격 조정 제안.
 *
 * 리프라이싱 탭에 제안으로 올린다 — 직접 반영하지 않는다.
 * 승인 → 반영 → 대장 → 검증 경로를 그대로 타야 r0가 오늘 환율로 다시 박히고,
 * 스냅샷·되돌리기도 붙는다.
 */
function proposeCoolPriceCuts() {
  clearCostCache_(); clearCostSheetCache_(); clearCoolSwitchCache_();
  var switched = coolSwitchSet_();
  if (!Object.keys(switched).length) {
    throw new Error('전환된 SKU가 없습니다.\n' +
      '[⚙ 설정 → 냉장 SKU 목록 만들기] → [냉장전환 적용]을 먼저 하세요.');
  }
  var sh0 = ss_().getSheetByName(SHEET_COOLSW);
  var cut = {}, saveOf = {};
  var cv = sh0.getRange(3, 1, sh0.getLastRow() - 2, COOLSW_HEADER.length).getValues();
  for (var c = 0; c < cv.length; c++) {
    var cs = String(cv[c][CW_SKU] || '').trim();
    if (cs && switched[cs]) {
      cut[cs] = Number(cv[c][CW_CUT]) || 0;
      saveOf[cs] = Number(cv[c][CW_SAVE]) || 0;
    }
  }

  var r1 = fxHouseRate_();
  if (!r1) throw new Error('사내환율이 없습니다. [🔄 데이터 갱신 → 환율·청구서·원가]를 먼저 실행하세요.');
  var rateRecv = fxReceiveRate_();
  var costs = costMap_();
  var skuCost = skuCostMap_();
  var manual = costInfoMap_();
  var exclude = excludeMap_();

  var snap = takePriceSnapshot_('냉장해제');
  var runId = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var now = new Date();
  var listSh = getSheetOrThrow_(SHEET_LISTING);
  var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();

  var rows = [], logRows = [], stat = { apply: 0, review: 0, skip: 0, hold_down: 0 };
  for (var i = 0; i < lv.length; i++) {
    var sku = String(lv[i][L_SKU] || '').trim();
    if (!sku || !switched[sku]) continue;
    if (exclude[sku] && exclude[sku].reprice) continue;
    var p0 = Number(lv[i][L_PRICE]);
    if (!(p0 > 0) || !(cut[sku] > 0)) continue;

    // 마진을 여름과 똑같이 두는 가격. 절상은 하지 않는다 — 내리는 쪽이라 내림이 맞다.
    var p1 = Math.floor((p0 - cut[sku]) / 10) * 10;
    if (!(p1 > 0)) continue;

    var ship = resolveShipping_(sku, skuCost, manual).fee;
    var floor = costFloorFor_(sku, ship, rateRecv, costs);
    // 인하 제안이므로 allowDown = true. 하한(손익분기)은 그대로 걸린다.
    var d = decideAction_(p0, p1, DEFAULT_FEE_RATE, ship, true, floor);
    stat[d.action]++;

    rows.push([
      d.action === 'apply', sku, lv[i][L_ASIN], p0, p1, p1 / p0 - 1,
      d.action, '냉장해제 ' + saveOf[sku] + '엔↓ · ' + d.reason,
      Number(r1.toFixed(4)), Number(r1.toFixed(4)),
      '', ship / p0, skuCost[sku] ? skuCost[sku].n : 0,
      '냉장해제', lv[i][L_STATUS]
    ]);
    if (d.action === 'apply') {
      logRows.push([now, sku, p0, p1, p1 / p0 - 1, '냉장해제',
                    Number(r1.toFixed(4)), '', runId, false]);
    }
  }
  if (!rows.length) {
    throw new Error('제안할 것이 없습니다.\n' +
      '전환된 SKU가 리스팅에 없거나, 인하폭이 0입니다.');
  }
  rows.sort(function (a, b) { return a[RP_DELTA] - b[RP_DELTA]; });

  writeRepriceSheet_(rows, r1, runId, true, stat, '냉장해제');
  cleanupStalePriceLog_('냉장해제');
  appendPriceLog_(logRows);

  var msg = '냉장해제 가격 조정 ' + rows.length + '건 · 반영대상 ' + stat.apply +
            ' / 검토 ' + stat.review + ' / 스킵 ' + stat.skip;
  log_('coolsw', 'INFO', msg);
  toast_(msg);
  showSheet_(SHEET_REPRICE);
  ui_().alert('냉장해제 가격 조정 — ' + SHEET_REPRICE + ' 탭',
    msg + '\n\n' +
    '■ 인하폭은 어떻게 나왔나\n' +
    '   배송비가 ΔS만큼 줄면, 마진을 그대로 두는 가격은\n' +
    '   P_new = P_old − ΔS ÷ (1−수수료) 입니다.\n' +
    '   즉 아낀 배송비를 전부 가격에 돌려주는 값입니다.\n\n' +
    '■ 꼭 내려야 하는 건 아닙니다\n' +
    '   안 내리면 그만큼 마진이 늘어납니다. 판매량이 얼마나 늘지는\n' +
    '   이 물량(품목당 월 2~3건)에서는 측정이 안 됩니다.\n' +
    '   승인 칸에서 원하는 것만 남기세요.\n\n' +
    '■ 백업 — 스냅샷 ' + snap.id + ' (' + snap.n.toLocaleString() + '건)\n\n' +
    '확인 후 [▶ 리프라이싱 → ② 승인분 아마존 반영]을 실행하세요.',
    ui_().ButtonSet.OK);
  return msg;
}
