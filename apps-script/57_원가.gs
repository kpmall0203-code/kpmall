/**
 * 57_원가.gs — SKU 원가 입력 · 정확한 손익분기 · 실이익 계산
 *
 * 원가가 들어오면 시스템의 성격이 바뀐다.
 *
 *   원가 없을 때 : "잔여액이 300엔 미만이면 위험" — 휴리스틱. 추정일 뿐이다.
 *   원가 있을 때 : "이 SKU는 건당 1,240원 손해" — 정확한 금액.
 *
 * 그리고 최적화 알고리즘의 목적함수(원화 이익)가 비로소 계산 가능해진다.
 * 매출이나 판매량을 최대화하면 안 되고 이익을 최대화해야 하는데,
 * 이익은 원가 없이는 정의되지 않는다.
 *
 * 건당 원화 이익 = ( 판매가 × (1−수수료율) − 엔화배송비 ) × 환율 − 원가
 *   판매가·수수료는 아마존, 배송비는 청구서 실측, 환율은 송금받을때, 원가는 여기.
 */

var SHEET_COST = '원가';
// COST_HEADER / CO_* 인덱스는 01_설정_가격관리.gs 에 있다 (탭 스키마를 한곳에 모아둔다)

var SHEET_PROFIT = '수익성';
var PROFIT_HEADER = [
  'SKU', '판매가(JPY)', '원가(KRW)', '배송비(JPY)', '배송근거',
  '건당이익(KRW)', '이익률', '손익분기가(JPY)', '최저권장가(JPY)', '판정', '월판매', '월이익(KRW)'
];

var BREAKEVEN_SAFETY = 1.10;   // 손익분기보다 10%는 위에 있어야 최저권장가로 본다

/** 메뉴: 원가 탭 생성 (SKU 수동 입력 전용 탭) */
function setupCostSheet() {
  var sh = ss_().getSheetByName(SHEET_COST);
  var existing = null;
  if (sh && sh.getLastRow() > 1) {
    // 구버전(4열)일 수 있으니 기존 SKU·원가를 살려서 새 스키마로 옮긴다
    var old = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 2)).getValues();
    existing = [];
    for (var i = 0; i < old.length; i++) {
      var s = String(old[i][0] || '').trim();
      var c = Number(old[i][1]);
      if (s) existing.push([s, c > 0 ? c : '']);
    }
    if (sh.getLastColumn() >= COST_HEADER.length &&
        String(sh.getRange(1, CO_OPT + 1).getValue()).trim() === COST_HEADER[CO_OPT]) {
      toast_('원가 탭이 이미 최신 형식입니다 (' + (sh.getLastRow() - 1) + '행)');
      return;
    }
  }

  sh = ensureSheet_(SHEET_COST, COST_HEADER);
  sh.clear();
  sh.getRange(1, 1, 1, COST_HEADER.length).setValues([COST_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(CO_SKU + 1, 320);

  var N = 500;
  if (existing && existing.length) {
    for (var j = 0; j < existing.length; j++) {
      sh.getRange(2 + j, 1, 1, 2).setValues([existing[j]]);
    }
    N = Math.max(N, existing.length + 100);
  }
  sh.getRange(2, CO_COOL + 1, N, 1).insertCheckboxes();
  sh.getRange(2, CO_OPT + 1, N, 1).insertCheckboxes();

  sh.getRange(2, 1).setNote(
    '전부 채울 필요 없습니다. 채운 항목만 그 SKU에서 추정을 대체합니다.\n\n' +
    '원가 = 매입가 + 국내배송 등 원화 지출 (마진 제외, 국제배송비 제외)\n' +
    '무게·치수 = 배송비 계산용. 치수를 넣으면 부피무게까지 반영됩니다.\n' +
    '배송비직접 = 요율표 계산을 무시하고 이 금액을 씁니다.\n' +
    '냉장 = 체크하면 냉장 요율표를 씁니다 (일반의 2배 이상).\n' +
    '최적화 = 체크한 SKU만 가격 최적화 실험 대상이 됩니다.');
  sh.getRange(1, CO_OPT + 1).setNote(
    '가격 최적화는 원가를 알아야 이익을 계산할 수 있습니다.\n' +
    '체크한 SKU만 실험 대상이 됩니다. 기본값은 해제입니다.');

  toast_('원가 탭 준비 완료');
  try {
    ui_().alert('원가 탭 생성 완료',
      '한 탭에서 SKU별 수동 입력을 다 받습니다. 전부 채울 필요 없습니다.\n\n' +
      '· 원가(KRW) — 매입가 + 국내배송 등 원화 지출. 국제배송비는 제외\n' +
      '· 무게(g)·치수 — 배송비 계산용. 없으면 0.5kg으로 추정합니다\n' +
      '· 배송비직접 — 요율표를 무시하고 이 금액을 씁니다\n' +
      '· 냉장 — 체크 시 냉장 요율 (0.5kg 기준 605엔 → 1,330엔)\n' +
      '· 최적화 — 체크한 SKU만 가격 최적화 실험에 들어갑니다 (기본 해제)\n\n' +
      '배송비 우선순위: 배송비직접 > 청구서 실측 > 무게·치수 계산 > 기본 추정',
      ui_().ButtonSet.OK);
  } catch (e) {}
}

/**
 * 메뉴: 판매량 상위 N개 SKU를 원가 탭에 채워 넣는다.
 *
 * 원가 입력은 손이 많이 가는 일이라 순서가 중요하다. 판매량 큰 순으로 넣으면
 * 적은 입력으로 물량 대부분이 커버된다 (실측: 상위 50개 = 전체 물량의 52.9%,
 * 상위 300개 = 77.9%).
 *
 * 이미 입력한 값은 SKU를 키로 전부 보존하고, 판매량 순으로 재정렬만 한다.
 */
function fillTopSkusForCost() {
  // 판매실적이 있으면 그걸 쓴다 — 주문 탭은 수집을 내린 뒤로 낡아간다
  var sales = salesQtyMap_();
  if (!Object.keys(sales).length) {
    // 왜 비었는지 알려준다. "수집하세요"만으로는 어디가 막혔는지 알 수 없다.
    var salSh = ss_().getSheetByName(SHEET_SALES);
    var ordSh = ss_().getSheetByName(SHEET_ORDERS);
    var ns = salSh ? Math.max(salSh.getLastRow() - 1, 0) : -1;
    var no = ordSh ? Math.max(ordSh.getLastRow() - 1, 0) : -1;
    throw new Error('판매량 순위를 만들 수 없습니다.\n\n' +
      '"판매실적" 탭: ' + (ns < 0 ? '없음' : ns.toLocaleString() + '행') + '\n' +
      '"주문" 탭:     ' + (no < 0 ? '없음' : no.toLocaleString() + '행') + '\n\n' +
      '[🔄 데이터 갱신 → 판매실적 수집 (기간 합계)]을 먼저 받으세요.');
  }

  var res = ui_().prompt('원가 입력 대상 채우기',
    '판매량 상위 몇 개 SKU를 넣을까요?\n\n' +
    '실측 참고 — 상위 50개 = 전체 물량의 52.9%, 상위 300개 = 77.9%\n' +
    '현재 판매 이력이 있는 SKU: ' + Object.keys(sales).length.toLocaleString() + '개',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var n = parseInt(res.getResponseText().trim(), 10);
  if (!(n > 0)) n = 100;

  var ranked = Object.keys(sales).sort(function (a, b) { return sales[b] - sales[a]; });
  var top = {};
  for (var i = 0; i < Math.min(n, ranked.length); i++) top[ranked[i]] = true;

  // 기존 입력값 보존 (원가 탭에 이미 있는 SKU는 상위권이 아니어도 남긴다)
  clearCostSheetCache_();
  var existing = costInfoMap_();
  for (var k in existing) top[k] = true;

  var skuCost = skuCostMap_();
  var listSh = ss_().getSheetByName(SHEET_LISTING);
  var priceOf = {};
  if (listSh && listSh.getLastRow() > 1) {
    var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var j = 0; j < lv.length; j++) {
      var s = String(lv[j][L_SKU] || '').trim();
      if (s) priceOf[s] = Number(lv[j][L_PRICE]) || 0;
    }
  }

  var keys = Object.keys(top).sort(function (a, b) {
    return (sales[b] || 0) - (sales[a] || 0);
  });

  var rows = [], nNew = 0, nMeasured = 0;
  for (var q = 0; q < keys.length; q++) {
    var sku = keys[q];
    var e = existing[sku];
    var c = skuCost[sku];
    if (!e) nNew++;

    // 무게·치수·냉장은 청구서 실측이라 사람이 다시 재지 않아도 된다. 채워 넣는다.
    // (직접 입력한 값이 이미 있으면 그쪽을 존중한다)
    var grams = (e && e.grams) ? e.grams : (c && c.actual > 0 ? Math.round(c.actual * 1000) : '');
    var dw = (e && e.w) ? e.w : (c && c.dw > 0 ? c.dw : '');
    var dh = (e && e.h) ? e.h : (c && c.dh > 0 ? c.dh : '');
    var dd = (e && e.d) ? e.d : (c && c.dd > 0 ? c.dd : '');
    if (c && c.actual > 0) nMeasured++;

    var bits = [];
    if (sales[sku]) bits.push('월 ' + sales[sku].toFixed(1) + '건');
    if (priceOf[sku]) bits.push('현재가 ' + priceOf[sku] + '엔');
    if (c && c.feeMed > 0) bits.push('실측배송 ' + Math.round(c.feeMed) + '엔(' + c.n + '건)');
    var memo = bits.join(' · ');

    rows.push([
      sku,
      e ? (e.cost || '') : '',
      grams, dw, dh, dd,
      e ? e.cool : !!(c && c.cool),
      e ? (e.shipFix || '') : '',
      e ? e.opt : false,
      '',
      memo
    ]);
  }

  var sh = ensureSheet_(SHEET_COST, COST_HEADER);
  sh.clear();
  sh.getRange(1, 1, 1, COST_HEADER.length).setValues([COST_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(CO_SKU + 1, 320);
  sh.setColumnWidth(CO_MEMO + 1, 260);
  if (rows.length) {
    var CH = 2000;
    for (var s2 = 0; s2 < rows.length; s2 += CH) {
      var part = rows.slice(s2, s2 + CH);
      sh.getRange(2 + s2, 1, part.length, COST_HEADER.length).setValues(part);
    }
    sh.getRange(2, CO_COOL + 1, rows.length, 1).insertCheckboxes();
    sh.getRange(2, CO_OPT + 1, rows.length, 1).insertCheckboxes();
    // 사람이 넣을 칸(원가~높이, 배송비직접)은 흰색으로 남겨 눈에 띄게 한다
    sh.getRange(2, CO_COST + 1, rows.length, 5).setBackground('#ffffff');
    sh.getRange(2, CO_SHIPFIX + 1, rows.length, 1).setBackground('#ffffff');
    sh.getRange(2, CO_MEMO + 1, rows.length, 1).setFontColor('#888888');
  }
  clearCostSheetCache_();

  var msg = '원가 탭에 ' + rows.length + '건 (신규 ' + nNew + '건) · 실측 무게·치수 ' +
            nMeasured + '건 자동 입력';
  log_('cost', 'INFO', msg);
  toast_(msg);
  try {
    ui_().alert('원가 입력 준비 완료',
      msg + '\n\n' +
      '판매량 많은 순으로 정렬돼 있습니다. 위에서부터 채우세요.\n\n' +
      '■ 자동으로 채운 것 (청구서 실측)\n' +
      '   무게(g) · 가로/세로/높이 · 냉장 — ' + nMeasured + '건\n' +
      '   4·5월에 실제로 나간 값이라 다시 재실 필요 없습니다. 수정은 가능합니다.\n\n' +
      '■ 직접 넣으실 것\n' +
      '   B열 [원가(KRW)] — 이것만 채워도 손익분기·수익성 분석이 켜집니다.\n' +
      '   [최적화] — 가격 실험을 돌릴 SKU만 체크 (기본 해제)\n\n' +
      '※ [배송비직접]은 비워 두는 걸 권합니다. 비워두면 청구서 실측값을\n' +
      '   자동으로 쓰고, 새 청구서가 들어올 때마다 알아서 갱신됩니다.\n' +
      '   값을 넣으면 그 값이 고정되어 실측 갱신을 막습니다.',
      ui_().ButtonSet.OK);
  } catch (e) {}
  return msg;
}

/**
 * 원가 탭 → {sku: {cost, grams, w, h, d, cool, shipFix, opt}}
 * 원가만 있는 행, 무게만 있는 행 등 부분 입력도 그대로 받는다.
 */
var _costCache = null;
function costInfoMap_() {
  if (_costCache) return _costCache;
  var map = {};
  var sh = ss_().getSheetByName(SHEET_COST);
  if (sh && sh.getLastRow() > 1) {
    var nCol = Math.max(sh.getLastColumn(), COST_HEADER.length);
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, nCol).getValues();
    for (var i = 0; i < vals.length; i++) {
      var sku = String(vals[i][CO_SKU] || '').trim();
      if (!sku) continue;
      map[sku] = {
        cost: Number(vals[i][CO_COST]) || 0,
        grams: Number(vals[i][CO_GRAMS]) || 0,
        w: Number(vals[i][CO_W]) || 0,
        h: Number(vals[i][CO_H]) || 0,
        d: Number(vals[i][CO_D]) || 0,
        cool: vals[i][CO_COOL] === true,
        shipFix: Number(vals[i][CO_SHIPFIX]) || 0,
        opt: vals[i][CO_OPT] === true
      };
    }
  }
  _costCache = map;
  return map;
}

/** 하위호환: 원가만 필요한 곳 (원가가 0인 SKU는 넣지 않는다) */
function costMap_() {
  var info = costInfoMap_();
  var out = {};
  for (var k in info) if (info[k].cost > 0) out[k] = info[k].cost;
  return out;
}

function clearCostSheetCache_() { _costCache = null; }

/**
 * 그 SKU의 배송비를 정한다. 우선순위가 이 시스템의 핵심 규칙이다.
 *   1) 배송비직접   — 사람이 못 박은 값이 가장 세다
 *   2) 청구서 실측  — 실제로 나간 요금
 *   3) 무게·치수    — 요율표로 계산 (냉장 여부 반영)
 *   4) 기본 추정    — 0.5kg 일반. 최후의 수단이라 근거가 약하다고 표시한다
 * @return {{fee:number, cool:boolean, src:string}}
 */
function resolveShipping_(sku, skuCost, manual) {
  var m = manual[sku];
  var c = skuCost[sku];
  var cool = (m && m.cool) || (c && c.cool) || false;

  if (m && m.shipFix > 0) return { fee: m.shipFix, cool: cool, src: '직접입력' };

  // 계절이 풀려 일반 배송으로 돌린 SKU.
  // 실측은 여름 냉장 청구서에서 나온 값이라 그대로 두면 겨울까지 냉장 요금을 문다.
  // 무게는 그대로니 같은 적용무게를 일반 요율표에서 다시 읽는다.
  if (cool && c && c.weight > 0 && coolSwitched_(sku)) {
    return { fee: shippingFeeFor_(c.weight, false), cool: false,
             src: '냉장해제(' + c.weight + 'kg 일반)' };
  }
  if (c && c.feeMed > 0) return { fee: c.feeMed, cool: cool, src: '실측(' + c.n + '건)' };
  if (m && (m.grams > 0 || (m.w > 0 && m.h > 0 && m.d > 0))) {
    var e = estimateShipping_(m.grams, m.w, m.h, m.d, cool);
    return { fee: e.fee, cool: cool, src: '무게계산(' + e.applied + 'kg' + (cool ? '/냉장' : '') + ')' };
  }
  return { fee: shippingFeeFor_(0.5, cool), cool: cool, src: '추정(0.5kg' + (cool ? '/냉장' : '') + ')' };
}

// ── 순수 계산부 (단위 테스트 대상) ───────────────────────

/**
 * 건당 원화 이익.
 * @param {number} priceJpy 판매가
 * @param {number} shipJpy 엔화 배송비
 * @param {number} costKrw 원가(원)
 * @param {number} rate 송금받을때 환율 (KRW/JPY)
 * @param {number} feeRate 판매수수료율
 */
function unitProfitKrw_(priceJpy, shipJpy, costKrw, rate, feeRate) {
  var netJpy = priceJpy * (1 - feeRate) - shipJpy;
  return netJpy * rate - costKrw;
}

/** 이익이 정확히 0이 되는 판매가 (JPY) */
function breakevenPriceJpy_(shipJpy, costKrw, rate, feeRate) {
  if (!(rate > 0) || feeRate >= 1) return 0;
  return (costKrw / rate + shipJpy) / (1 - feeRate);
}

// ── 수익성 분석 ──────────────────────────────────────────

/**
 * 원가가 입력된 SKU에 대해 정확한 건당 이익 / 손익분기 / 월이익을 산출한다.
 * 원가가 없는 SKU는 아예 표에 넣지 않는다 — 추정 이익은 최적화를 오염시킨다.
 */
function analyzeProfitability() {
  ensureData_(['listing', 'fx'], ['invoice'], '수익성 분석');

  clearCostSheetCache_(); clearCostCache_();
  var costs = costMap_();
  var nCost = Object.keys(costs).length;
  if (!nCost) {
    throw new Error('"원가" 탭이 비어 있습니다.\n' +
      '메뉴 [⚙ 설정 → 처음 설정]를 실행하고 SKU·원가를 채운 뒤 다시 시도하세요.');
  }

  var rate = fxReceiveRate_();
  if (!rate) throw new Error('환율이 없습니다. [🔄 데이터 갱신 → 환율·청구서·원가]을 먼저 실행하세요.');

  var skuCost = skuCostMap_();          // 청구서 실측 배송비
  var manual = costInfoMap_();          // 사람이 넣은 무게·치수·직접배송비
  var sales = monthlySalesMap_();       // 월평균 판매량
  var listSh = getSheetOrThrow_(SHEET_LISTING);
  var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();

  var rows = [];
  var totMonthly = 0, lossCount = 0;
  for (var i = 0; i < lv.length; i++) {
    var sku = String(lv[i][L_SKU] || '').trim();
    if (!sku || !costs[sku]) continue;
    var price = Number(lv[i][L_PRICE]);
    if (!(price > 0)) continue;

    var rs = resolveShipping_(sku, skuCost, manual);
    var ship = rs.fee, shipSrc = rs.src;

    var cost = costs[sku];
    var unit = unitProfitKrw_(price, ship, cost, rate, DEFAULT_FEE_RATE);
    var be = breakevenPriceJpy_(ship, cost, rate, DEFAULT_FEE_RATE);
    var floor = roundUpJpy_(be * BREAKEVEN_SAFETY);
    var qty = sales[sku] || 0;
    var monthly = unit * qty;
    totMonthly += monthly;

    var verdict;
    if (unit < 0) { verdict = '적자'; lossCount++; }
    else if (price < floor) verdict = '위험(손익분기 근접)';
    else if (unit / (price * rate) < 0.10) verdict = '저마진';
    else verdict = '정상';

    rows.push([sku, price, cost, Math.round(ship), shipSrc,
               Math.round(unit), unit / (price * rate),
               roundUpJpy_(be), floor, verdict,
               Number(qty.toFixed(1)), Math.round(monthly)]);
  }

  rows.sort(function (a, b) { return a[11] - b[11]; });   // 월이익 낮은 순 = 문제부터

  var sh = ensureSheet_(SHEET_PROFIT, PROFIT_HEADER);
  sh.clear();
  sh.getRange(1, 1).setValue(
    '수익성 분석 · 원가 보유 ' + nCost.toLocaleString() + 'SKU 중 ' + rows.length +
    '건 분석 · 적자 ' + lossCount + '건 · 합계 월이익 ' +
    Math.round(totMonthly).toLocaleString() + '원  (환율 ' + rate.toFixed(2) + ')')
    .setFontWeight('bold');
  sh.getRange(2, 1, 1, PROFIT_HEADER.length).setValues([PROFIT_HEADER]).setFontWeight('bold');
  if (rows.length) {
    var CH = 2000;
    for (var s = 0; s < rows.length; s += CH) {
      var part = rows.slice(s, s + CH);
      sh.getRange(3 + s, 1, part.length, PROFIT_HEADER.length).setValues(part);
    }
    sh.getRange(3, 7, rows.length, 1).setNumberFormat('0.0%');
    var colors = rows.map(function (r) {
      return [r[9] === '적자' ? '#fce8e6'
            : r[9] === '위험(손익분기 근접)' ? '#fef7e0'
            : r[9] === '저마진' ? '#f1f3f4' : '#e6f4ea'];
    });
    sh.getRange(3, 10, rows.length, 1).setBackgrounds(colors);
  }
  sh.setFrozenRows(2);
  sh.autoResizeColumns(2, PROFIT_HEADER.length - 1);

  var msg = '수익성 분석 ' + rows.length + '건 · 적자 ' + lossCount +
            '건 · 월이익 합계 ' + Math.round(totMonthly).toLocaleString() + '원';
  log_('cost', 'INFO', msg);
  toast_(msg);
  try { ui_().alert(msg); } catch (e) {}
  return msg;
}

/** 주문 탭 → {sku: 월평균 판매수량} */
function monthlySalesMap_() {
  var map = {};
  var sh = ss_().getSheetByName(SHEET_ORDERS);
  if (!sh || sh.getLastRow() < 2) return map;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, ORDERS_HEADER.length).getValues();
  var minD = null, maxD = null;
  var qty = {};
  for (var i = 0; i < vals.length; i++) {
    var sku = String(vals[i][OD_SKU] || '').trim();
    if (!sku) continue;
    qty[sku] = (qty[sku] || 0) + (Number(vals[i][OD_QTY]) || 1);
    var d = vals[i][OD_DATE];
    if (d) {
      var ds = (d instanceof Date) ? ymd_(d) : String(d).substring(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
        if (!minD || ds < minD) minD = ds;
        if (!maxD || ds > maxD) maxD = ds;
      }
    }
  }
  // 주문일이 비어 있으면(Orders API 수집분) 기간을 알 수 없으므로 청구서 기간으로 대체
  var months = 1;
  if (minD && maxD) {
    months = Math.max(daysBetween_(minD, maxD) / 30.0, 0.5);
  } else {
    var shipSh = ss_().getSheetByName(SHEET_SHIPMENTS);
    if (shipSh && shipSh.getLastRow() > 1) {
      var mv = shipSh.getRange(2, SP_MONTH + 1, shipSh.getLastRow() - 1, 1).getValues();
      var ms = {};
      for (var k = 0; k < mv.length; k++) if (mv[k][0]) ms[mv[k][0]] = 1;
      months = Math.max(Object.keys(ms).length, 1);
    }
  }
  for (var s in qty) map[s] = qty[s] / months;
  return map;
}
