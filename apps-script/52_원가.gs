/**
 * 52_원가.gs — SKU별 실측 배송원가 · s · w 산출
 *
 * s = 배송비 / 판매가.  w = 1 − s/(1−f).
 *
 * w가 뜻하는 것:
 *   판매가 중 '실제로 환율에 노출된 비중'. 배송비는 엔화 요율표라 환율이 움직여도
 *   엔화 기준 원가가 그대로다. 그 몫까지 환율 조정하면 이중청구가 된다.
 *   그래서 환율 변동분에 w를 곱해서만 가격에 전가한다.
 *
 * 청구서에는 SKU가 없고 주문번호만 있다. 주문 탭(주문번호↔SKU)을 거쳐 잇는다.
 * 실측 단일품목 주문이 97.5%라 배분 로직은 소수 건에만 필요하다.
 */

function rebuildSkuCosts() {
  var shipSh = getSheetOrThrow_(SHEET_SHIPMENTS);
  var lastShip = shipSh.getLastRow();
  if (lastShip < 2) throw new Error('배송실적이 비어 있습니다. 먼저 [청구서 적재]를 실행하세요.');

  // 필요한 주문은 '청구서가 있는 기간'뿐이다 — 그 밖의 주문번호는 어차피
  // 어느 청구서와도 안 맞는다. 통읽기 대신 그 기간 블록만 읽는다.
  var needR = ordersNeededRange_();
  var ov = needR ? ordersInRange_(needR.from, needR.to) : [];
  var orderMap = {};   // 주문번호 → [{sku, price}]
  var haveOrders = ov.length > 0;
  for (var i = 0; i < ov.length; i++) {
    var oid = String(ov[i][OD_ORDER] || '').trim();
    var sku = String(ov[i][OD_SKU] || '').trim();
    if (!oid || !sku) continue;
    if (!orderMap[oid]) orderMap[oid] = [];
    orderMap[oid].push({ sku: sku, price: Number(ov[i][OD_PRICE]) || 0 });
  }

  var sv = shipSh.getRange(2, 1, lastShip - 1, SHIP_HEADER.length).getValues();
  var per = {};   // sku → {fees:[], ss:[], weights:[], cool:0, total:0}
  var matched = 0, unmatched = 0;

  for (var r = 0; r < sv.length; r++) {
    var v = sv[r];
    var fee = Number(v[SP_FEE]) || 0;
    if (fee <= 0) continue;
    var oid2 = String(v[SP_ORDER] || '').trim();
    var lines = haveOrders ? orderMap[oid2] : null;
    if (!lines || !lines.length) { unmatched++; continue; }
    matched++;

    var total = Number(v[SP_TOTAL]) || 0;
    var lineSum = 0;
    for (var L = 0; L < lines.length; L++) lineSum += lines[L].price;
    var base = total > 0 ? total : lineSum;
    if (!(base > 0)) continue;
    var sOrder = fee / base;
    var wapp = Number(v[SP_WAPP]) || 0;
    var wact = Number(v[SP_WACT]) || 0;
    var isCool = v[SP_COOL] === true;
    var dw = Number(v[SP_DW]) || 0, dh = Number(v[SP_DH]) || 0, dd = Number(v[SP_DD]) || 0;

    for (var m = 0; m < lines.length; m++) {
      // 복수 SKU 주문이면 라인 금액 비례로 배분. 금액이 없으면 균등 분배.
      var share = 1;
      if (lines.length > 1) {
        share = lineSum > 0 ? (lines[m].price / lineSum) : (1 / lines.length);
      }
      var sku2 = lines[m].sku;
      if (!per[sku2]) {
        per[sku2] = { fees: [], ss: [], weights: [], actual: [], cool: 0,
                      dw: [], dh: [], dd: [] };
      }
      per[sku2].fees.push(fee * share);
      per[sku2].ss.push(sOrder);
      if (wapp > 0) per[sku2].weights.push(wapp);
      if (wact > 0) per[sku2].actual.push(wact);
      if (dw > 0) { per[sku2].dw.push(dw); per[sku2].dh.push(dh); per[sku2].dd.push(dd); }
      if (isCool) per[sku2].cool++;
    }
  }

  var now = new Date();
  var rows = [];
  for (var sku3 in per) {
    var p = per[sku3];
    var medS = median_(p.ss);
    var w = 1 - medS / (1 - DEFAULT_FEE_RATE);
    w = Math.max(W_MIN, Math.min(W_MAX, w));
    rows.push([
      sku3, p.fees.length,
      Math.round(median_(p.fees)),
      Math.round(Math.max.apply(null, p.fees)),
      Number(medS.toFixed(4)),
      Number(w.toFixed(4)),
      p.weights.length ? median_(p.weights) : '',
      p.actual.length ? Number(median_(p.actual).toFixed(3)) : '',
      p.dw.length ? Number(median_(p.dw).toFixed(1)) : '',
      p.dh.length ? Number(median_(p.dh).toFixed(1)) : '',
      p.dd.length ? Number(median_(p.dd).toFixed(1)) : '',
      // 과반이 냉장 요율로 나갔으면 그 SKU는 냉장으로 본다
      p.cool > p.fees.length / 2,
      now
    ]);
  }
  rows.sort(function (a, b) { return b[SC_N] - a[SC_N]; });

  var sh = ensureSheet_(SHEET_SKUCOST, SKUCOST_HEADER);
  sh.clear();
  sh.getRange(1, 1, 1, SKUCOST_HEADER.length).setValues([SKUCOST_HEADER]).setFontWeight('bold');
  if (rows.length) {
    var CH = 2000;
    for (var s2 = 0; s2 < rows.length; s2 += CH) {
      var part = rows.slice(s2, s2 + CH);
      sh.getRange(2 + s2, 1, part.length, SKUCOST_HEADER.length).setValues(part);
    }
  }
  sh.setFrozenRows(1);

  var msg = 'SKU원가 ' + rows.length + '건 산출 (배송 매칭 ' + matched + ' / 미매칭 ' + unmatched + ')';
  if (!haveOrders) {
    msg += '\n\n※ "주문" 탭이 비어 있어 SKU별 s를 못 구했습니다.\n' +
           '셀러센트럴 [주문 > 주문 보고서]를 받아 [주문 보고서 적재]를 먼저 실행하세요.\n' +
           '그전까지 리프라이싱은 전 SKU 기본값 s=' + DEFAULT_S + '로 계산됩니다.';
  }
  log_('cost', 'INFO', 'SKU원가 ' + rows.length + '건 / 매칭 ' + matched);
  toast_('SKU원가 ' + rows.length + '건 산출');
  try { ui_().alert(msg); } catch (e) {}
  return msg;
}

/** SKU원가 탭 → {sku: {n, feeMed, feeMax, s, w, weight}} */
var _skuCostCache = null;
function skuCostMap_() {
  if (_skuCostCache) return _skuCostCache;
  var map = {};
  var sh = ss_().getSheetByName(SHEET_SKUCOST);
  if (sh && sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, SKUCOST_HEADER.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var sku = String(vals[i][SC_SKU] || '').trim();
      if (!sku) continue;
      map[sku] = {
        n: Number(vals[i][SC_N]) || 0,
        feeMed: Number(vals[i][SC_FEEMED]) || 0,
        feeMax: Number(vals[i][SC_FEEMAX]) || 0,
        s: Number(vals[i][SC_S]) || 0,
        w: Number(vals[i][SC_W]) || 0,
        weight: Number(vals[i][SC_WAPP]) || 0,      // 적용무게(청구 기준)
        actual: Number(vals[i][SC_WACT]) || 0,      // 실무게
        dw: Number(vals[i][SC_DW]) || 0,
        dh: Number(vals[i][SC_DH]) || 0,
        dd: Number(vals[i][SC_DD]) || 0,
        cool: vals[i][SC_COOL] === true
      };
    }
  }
  _skuCostCache = map;
  return map;
}

function clearCostCache_() { _skuCostCache = null; }

/**
 * SKU의 (w, s, 배송건수, 예상배송비)를 돌려준다.
 * 배송 이력이 MIN_SHIP_N 미만이면 전체 평균 s를 쓴다 — 표본 1건은 우연일 수 있다.
 */
function wForSku_(sku, costMap) {
  var c = costMap[sku];
  if (c && c.n >= MIN_SHIP_N && c.s > 0) {
    return { w: c.w, s: c.s, n: c.n, fee: c.feeMed };
  }
  var defW = 1 - DEFAULT_S / (1 - DEFAULT_FEE_RATE);
  return {
    w: Math.max(W_MIN, Math.min(W_MAX, defW)),
    s: DEFAULT_S,
    n: c ? c.n : 0,
    fee: c ? c.feeMed : 0
  };
}

function median_(arr) {
  if (!arr || !arr.length) return 0;
  var a = arr.slice().sort(function (x, y) { return x - y; });
  var mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function pad2_(n) { return String(n).length < 2 ? '0' + n : String(n); }
