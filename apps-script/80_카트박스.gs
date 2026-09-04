/**
 * 80_카트박스.gs — 카트박스를 뺏겨 잃고 있는 매출
 *
 * ── 왜 이것부터 보나 ────────────────────────────────────
 * 세션이 있는데 안 팔리는 이유 중 가장 싸게 고쳐지는 것이 카트박스다.
 * 상세페이지를 고치는 데는 며칠이 들고 리뷰는 몇 달이 걸리는데,
 * 카트박스는 대개 몇십 엔 차이로 갈린다.
 *
 * 카트박스를 못 가지면 그 페이지에 온 손님은 내 물건이 아니라
 * 남의 물건을 사고 간다. 세션은 그대로 잡히므로 '유입은 되는데 안 팔린다'로 보이고,
 * 상세페이지를 고치러 가게 된다 — 엉뚱한 곳이다.
 *
 * ── 얼마를 잃고 있는가 ──────────────────────────────────
 * 잃은 세션 = 세션 × (1 − 카트박스%)
 * 그 세션이 내 것이었다면 계정 평균 전환율만큼 팔렸을 것이다.
 *   잃은 매출 ≒ 잃은 세션 × 계정 평균 전환율 × 판매가
 *
 * 이건 상한이 아니라 근사다. 카트박스를 되찾아도 그 손님이 다 사지는 않는다.
 * 그래서 '이만큼 벌 수 있다'가 아니라 '이만큼이 걸려 있다'로 읽어야 한다.
 * 값을 내려서 되찾을지 판단할 때, 내려서 잃는 마진과 견주는 용도다.
 *
 * ── 값을 얼마나 내려야 하나 ────────────────────────────
 * 경쟁자 가격을 모르므로 정확한 답은 못 낸다. 대신 '이만큼 내려도 본전인 선'을 준다:
 *   내려도 되는 폭 = 잃은 매출 × 마진율 ÷ (지금 팔리는 수량)
 * 이보다 더 내리면 되찾은 매출보다 깎인 마진이 크다.
 */

var SHEET_BUYBOX = '카트박스';
var BUYBOX_HEADER = [
  'SKU', '상품명', '한글명', '카트박스%', '세션', '잃은 세션', '판매량', '전환율',
  '판매가(JPY)', '지금 매출(JPY)', '걸려 있는 매출(JPY)', '건당 마진(JPY)',
  '본전 인하폭(JPY)', '광고비(JPY)', '무엇을 하면 되나'
];
var BB_SKU = 0, BB_NAME = 1, BB_KR = 2, BB_RATE = 3, BB_SESS = 4, BB_LOSTSESS = 5,
    BB_QTY = 6, BB_CONV = 7, BB_PRICE = 8, BB_REV = 9, BB_LOSTREV = 10,
    BB_MARGIN = 11, BB_CUT = 12, BB_ADCOST = 13, BB_ACTION = 14;

/**
 * 이 아래면 '뺏기고 있다'고 본다.
 * 69의 BB_LOW(0.60)는 '전환율 얘기가 무의미해지는 선'이라 더 엄하다.
 * 여기서는 되찾을 값어치를 보는 것이므로 조금 넉넉히 잡아 0.90부터 훑는다.
 */
var BUYBOX_WATCH = 0.90;

/**
 * 무엇을 하면 되는지.
 * 카트박스를 잃는 이유는 값만이 아니다 — 재고 없음·배송 지연·계정 상태도 있다.
 * 자료로 구별되는 만큼만 갈라 적고, 나머지는 확인하라고 말한다.
 */
function buyboxAction_(rate, lostRev, cut, adCost, qty) {
  if (adCost > 0) {
    return '카트박스를 뺏긴 채 광고 중 — 광고비가 남의 카트로 갑니다. ' +
           '광고를 멈추거나 값부터 되찾으세요';
  }
  if (rate < 0.2) {
    return '거의 못 가지고 있습니다. 값 문제가 아닐 수 있습니다 — ' +
           '재고·배송일·계정 상태를 먼저 확인하세요';
  }
  if (!(cut > 0)) {
    return '되찾아도 마진이 안 남습니다. 값을 내리는 쪽은 아닙니다';
  }
  if (lostRev < qty * 100) {
    return '걸린 금액이 작습니다. 뒤로 미뤄도 됩니다';
  }
  return '건당 ' + Math.round(cut).toLocaleString() + '엔까지는 내려도 본전입니다 — ' +
         '경쟁가를 보고 그 안에서 맞추세요';
}

/** 메뉴: 카트박스 손실 */
function analyzeBuyBox() {
  ensureData_(['listing', 'sales'], ['ads'], '카트박스 손실');

  var src = pickSalesSource_();
  if (src && src.cancel) return;
  if (!src || !src.isPeriod) {
    ui_().alert('카트박스 손실',
      '카트박스 점유율은 [판매실적 수집]으로 받은 기간 자료에만 들어 있습니다.\n\n' +
      '[🔄 데이터 갱신 → 판매실적 수집]으로 기간을 하나 받은 뒤 다시 실행하세요.',
      ui_().ButtonSet.OK);
    return;
  }

  var rows = buyBoxRows_(src);
  if (!rows.length) {
    ui_().alert('카트박스 손실',
      '카트박스를 ' + Math.round(BUYBOX_WATCH * 100) + '% 미만으로 가진 SKU가 없습니다.\n\n' +
      '(카트박스%가 통째로 비어 있다면 그 기간 리포트에 값이 안 온 것입니다)',
      ui_().ButtonSet.OK);
    return '';
  }

  var lostRev = 0, nSevere = 0, nAd = 0, adCost = 0, nCuttable = 0;
  for (var i = 0; i < rows.length; i++) {
    lostRev += Number(rows[i][BB_LOSTREV]) || 0;
    if (rows[i][BB_RATE] < BB_LOW) nSevere++;
    if (rows[i][BB_ADCOST] > 0) { nAd++; adCost += Number(rows[i][BB_ADCOST]) || 0; }
    if (rows[i][BB_CUT] > 0) nCuttable++;
  }

  writeBuyBox_(rows, src.label);

  var msg = src.label + ' · ' + rows.length.toLocaleString() + '개 · 걸린 매출 ' +
            Math.round(lostRev).toLocaleString() + '엔';
  log_('buybox', 'INFO', msg);

  showSheet_(SHEET_BUYBOX);
  ui_().alert('카트박스 손실 — ' + SHEET_BUYBOX + ' 탭',
    src.label + '\n\n' +
    '카트박스 ' + Math.round(BUYBOX_WATCH * 100) + '% 미만: ' +
      rows.length.toLocaleString() + '개\n' +
    '  그중 ' + Math.round(BB_LOW * 100) + '% 미만 (심각): ' + nSevere + '개\n\n' +
    '이 기간에 걸려 있는 매출: ' + Math.round(lostRev).toLocaleString() + '엔\n' +
    '  = 잃은 세션 × 계정 평균 전환율 × 판매가\n' +
    '  되찾으면 다 벌리는 돈이 아니라, 값을 내려 되찾을지 판단할 때\n' +
    '  깎이는 마진과 견주라고 내놓는 숫자입니다.\n\n' +
    (nAd ? '⚠ 카트박스를 뺏긴 채 광고를 태우는 SKU ' + nAd + '개 (광고비 ' +
           Math.round(adCost).toLocaleString() + '엔)\n' +
           '   광고비가 남의 카트로 갑니다 — 여기부터 보세요.\n\n' : '') +
    '■ 값을 내려 되찾을 여지가 있는 것: ' + nCuttable + '개\n' +
    '   [본전 인하폭] 칸이 "이만큼 내려도 손해가 아닌 선"입니다.\n' +
    '   경쟁가를 보고 그 안에서 맞추면 됩니다.\n\n' +
    '※ 카트박스를 잃는 이유가 값만은 아닙니다 —\n' +
    '   재고 없음·배송일·계정 상태도 원인이 됩니다.\n' +
    '   점유율이 20% 아래인 것은 값보다 그쪽을 먼저 보세요.',
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * 카트박스를 뺏기고 있는 SKU와 걸린 금액.
 * @param {Object} src pickSalesSource_ 결과
 */
function buyBoxRows_(src) {
  var jp = {}, kr = {}, price = {};
  var ls = ss_().getSheetByName(SHEET_LISTING);
  if (ls && ls.getLastRow() > 1) {
    var lv = ls.getRange(2, 1, ls.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      var k = String(lv[i][L_SKU] || '').trim();
      if (!k) continue;
      jp[k] = lv[i][L_JP]; kr[k] = lv[i][L_KR];
      price[k] = Number(lv[i][L_PRICE]) || 0;
    }
  }

  // 계정 평균 전환율 (가중평균). '내 것이었다면 얼마나 팔렸을까'의 기준이다
  var totQty = 0, totSess = 0;
  for (var s in src.sess) {
    var se = Number(src.sess[s]) || 0;
    if (se <= 0) continue;
    totSess += se;
    totQty += Number(src.qty[s]) || 0;
  }
  var convAvg = totSess > 0 ? totQty / totSess : 0;
  if (!(convAvg > 0)) return [];

  // 실측 배송비가 있으면 마진을 정확히 낸다. 없으면 기본 s로 추정한다
  var ship = {};
  var cs = ss_().getSheetByName(SHEET_SKUCOST);
  if (cs && cs.getLastRow() > 1) {
    var cv = cs.getRange(2, 1, cs.getLastRow() - 1, SKUCOST_HEADER.length).getValues();
    for (var j = 0; j < cv.length; j++) {
      var ck = String(cv[j][SC_SKU] || '').trim();
      if (ck) ship[ck] = Number(cv[j][SC_FEEMED]) || 0;
    }
  }

  var ads = { cost: {} };
  try { ads = adsSpendIn_(src.from, src.to); } catch (e) {}

  var out = [];
  for (var sku in src.bb) {
    var rate = Number(src.bb[sku]) || 0;
    if (!(rate > 0) || rate >= BUYBOX_WATCH) continue;

    var sess = Number(src.sess[sku]) || 0;
    if (sess < CONV_MIN_SESS) continue;          // 근거가 없다

    var qty = Number(src.qty[sku]) || 0;
    var rev = Number(src.amt[sku]) || 0;
    // 리포트의 실제 주문금액에서 단가를 낸다. 없으면 리스팅 현재가로 갈음한다
    var unit = qty > 0 ? rev / qty : (price[sku] || 0);
    if (!(unit > 0)) continue;

    var lostSess = sess * (1 - rate);
    var lostRev = lostSess * convAvg * unit;

    // 건당 마진 = 판매가 × (1 − 수수료) − 배송비.  원가는 아직 안 뺀 값이다
    var sh2 = ship[sku] > 0 ? ship[sku] : unit * DEFAULT_S;
    var margin = unit * (1 - DEFAULT_FEE_RATE) - sh2;

    // 본전 인하폭: 되찾을 매출의 마진분을 지금 팔리는 수량으로 나눈다.
    // 값을 내리면 이미 팔리던 것까지 싸게 나가므로 그쪽이 비용이다.
    var cut = (qty > 0 && margin > 0)
      ? (lostRev * (margin / unit)) / qty
      : 0;
    // 마진을 넘겨 내리면 팔수록 손해다 — 거기서 자른다
    if (cut > margin) cut = margin;

    var adCost = Number(ads.cost[sku]) || 0;

    out.push([
      sku, jp[sku] || '', kr[sku] || '',
      rate, sess, Math.round(lostSess), Number(qty.toFixed(1)),
      sess > 0 ? qty / sess : '', Math.round(unit), Math.round(rev),
      Math.round(lostRev), Math.round(margin),
      cut > 0 ? Math.round(cut) : '', Math.round(adCost),
      buyboxAction_(rate, lostRev, cut, adCost, qty)
    ]);
  }

  // 걸린 금액이 큰 것부터 — 점유율이 낮은 순이 아니다.
  // 5%밖에 못 가졌어도 아무도 안 보는 상품이면 고칠 값어치가 없다.
  out.sort(function (a, b) { return b[BB_LOSTREV] - a[BB_LOSTREV]; });
  return out;
}

function writeBuyBox_(rows, label) {
  var sh = ensureSheet_(SHEET_BUYBOX, BUYBOX_HEADER);
  sh.clear();

  var lost = 0;
  for (var i = 0; i < rows.length; i++) lost += Number(rows[i][BB_LOSTREV]) || 0;

  sh.getRange(1, 1).setValue(
    '[' + label + ']  카트박스 ' + Math.round(BUYBOX_WATCH * 100) + '% 미만 ' +
    rows.length.toLocaleString() + '개  ·  걸려 있는 매출 ' +
    Math.round(lost).toLocaleString() + '엔' +
    '   |   걸린 금액 큰 순 (점유율 낮은 순이 아닙니다)')
    .setFontWeight('bold');

  sh.getRange(2, 1, 1, BUYBOX_HEADER.length).setValues([BUYBOX_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');

  var CH = 2000;
  for (var s = 0; s < rows.length; s += CH) {
    var part = rows.slice(s, s + CH);
    sh.getRange(3 + s, 1, part.length, BUYBOX_HEADER.length).setValues(part);
  }

  sh.setFrozenRows(2);
  var n = rows.length;
  sh.getRange(3, BB_RATE + 1, n, 1).setNumberFormat('0%');
  sh.getRange(3, BB_SESS + 1, n, 2).setNumberFormat('#,##0');
  sh.getRange(3, BB_CONV + 1, n, 1).setNumberFormat('0.0%');
  sh.getRange(3, BB_PRICE + 1, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, BB_REV + 1, n, 4).setNumberFormat('#,##0');
  sh.getRange(3, BB_ADCOST + 1, n, 1).setNumberFormat('#,##0');

  var bg = [];
  for (var k = 0; k < n; k++) {
    var r = rows[k][BB_RATE];
    bg.push([r < 0.2 ? '#f4c7c3' : r < BB_LOW ? '#fce8e6' : '#fff4d6']);
  }
  if (n) sh.getRange(3, BB_RATE + 1, n, 1).setBackgrounds(bg);

  headerNotes_(sh, 2, BUYBOX_HEADER, {
    '카트박스%': '그 기간 동안 내가 카트박스를 가지고 있던 비율.\n' +
                 '못 가진 동안 온 손님은 남의 물건을 사고 갑니다.',
    '잃은 세션': '세션 × (1 − 카트박스%). 내 페이지에 왔지만 내 물건을 못 산 횟수.',
    '걸려 있는 매출(JPY)': '잃은 세션 × 계정 평균 전환율 × 판매가.\n' +
                           '되찾으면 다 벌리는 돈이 아니라, 값을 내려 되찾을지 ' +
                           '판단할 때 깎이는 마진과 견주는 숫자입니다.',
    '건당 마진(JPY)': '판매가 × (1 − 수수료 ' + Math.round(DEFAULT_FEE_RATE * 100) +
                      '%) − 배송비.\n원가는 아직 빼지 않았습니다.',
    '본전 인하폭(JPY)': '이만큼 내려도 되찾은 매출과 깎인 마진이 맞먹는 선입니다.\n' +
                        '값을 내리면 이미 팔리던 것까지 싸게 나가므로 그쪽이 비용입니다.\n' +
                        '경쟁가를 보고 이 안에서 맞추세요.',
    '광고비(JPY)': '이 값이 0이 아니면 카트박스를 뺏긴 채 광고를 태우는 중입니다.'
  });

  writeLegend_(sh, 3 + n + 2, [
    ['이 표를 어떻게 쓰나', ''],
    ['왜 이것부터 보나',
     '세션이 있는데 안 팔리는 이유 중 가장 싸게 고쳐지는 것입니다. ' +
     '상세페이지는 며칠, 리뷰는 몇 달이 걸리는데 카트박스는 대개 몇십 엔 차이입니다.'],
    ['상세페이지를 고치러 가면 안 된다',
     '카트박스를 못 가지면 세션은 그대로 잡히면서 판매만 없습니다. ' +
     '"유입은 되는데 안 팔린다"로 보여 엉뚱한 곳을 고치게 됩니다.'],
    ['점유율 20% 미만',
     '값 문제가 아닐 수 있습니다. 재고 없음·배송일·계정 상태를 먼저 확인하세요.'],
    ['광고비가 0이 아닌 줄',
     '내 광고비로 남의 카트에 손님을 보내는 중입니다. 여기부터 봅니다.'],
    ['걸린 금액 큰 순으로 정렬',
     '점유율이 낮은 순이 아닙니다. 5%밖에 못 가졌어도 아무도 안 보는 상품이면 ' +
     '고칠 값어치가 없습니다.']
  ]);

  for (var c = 1; c <= 3; c++) sh.autoResizeColumn(c);
  sh.setColumnWidth(BB_ACTION + 1, 360);
  sh.getRange(3, BB_ACTION + 1, n, 1).setWrap(true);
}
