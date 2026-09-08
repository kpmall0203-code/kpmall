/**
 * 82_품절판매.gs — 팔리던 물건인데 재고가 0 인 것 (재입고 후보)
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 재고가 0 이면 아마존은 그 상품을 팔지 않는다. 광고를 하든 순위가 있든 소용없다.
 * 그런데 2만 6천 개 중 어느 것이 '팔리던 것' 인지는 리스팅 표만 봐서는 모른다 —
 * 팔린 기록(판매실적)과 지금 재고(리스팅)를 맞대야 보인다.
 *
 * ── 셈 ──────────────────────────────────────────────────
 *   재고 = 0 이고, 판매실적에 판매수량이 있는 SKU
 *   팔린 양 · 팔린 돈 · 마지막으로 팔린 날 · 최근 30일에 팔린 양을 함께 적는다
 *   많이 팔리던 순(판매금액)으로 세운다 — 위부터 채우면 된다
 *
 * ── 여기서는 아무것도 바꾸지 않는다 ─────────────────────
 * 보는 표다. 재고를 넣는 것은 사람의 일이다.
 */

var SHEET_OOS = '품절인데팔림';
var OOS_HEADER = [
  'SKU', 'ASIN', '한글명', '일본어상품명', '판매가(JPY)', '재고', '상태',
  '판매수량(합)', '판매금액(JPY·합)', '마지막 판매(기간종료)', '마지막 달 수량', '하루 평균(마지막 달)',
  '자료 기간', '켜진 광고', '원가 있음', '할 일'
];

/** 메뉴(분석): 품절인데 팔리던 SKU */
function analyzeOutOfStockSellers() {
  ensureData_(['listing', 'sales'], [], '품절인데 팔리던 SKU');
  var made = makeOneSheet_([{ name: SHEET_OOS, header: OOS_HEADER }]);
  if (madeSheetStop_(made, '품절인데 팔리던 SKU')) return;

  var r = oosRows_();
  if (!r.rows.length) {
    ui_().alert('품절인데 팔리던 SKU',
      '재고가 0 이면서 판매 기록이 있는 SKU 가 없습니다.\n' +
      (r.nSales ? '' : '\n판매실적이 비어 있습니다 — [🔄 데이터 갱신 → 판매실적 수집] 을 먼저 하세요.'),
      ui_().ButtonSet.OK);
    return '';
  }
  var sh = ss_().getSheetByName(SHEET_OOS);
  writeTable_(sh, OOS_HEADER, r.rows);
  sh.getRange(1, 1, 1, OOS_HEADER.length).setValues([OOS_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.getRange(2, 9, r.rows.length, 1).setNumberFormat('#,##0');
  headerNotes_(sh, 1, OOS_HEADER, {
    '재고': '리스팅 표의 지금 재고. 0 이면 아마존이 팔지 않습니다 (광고도 나가지 않습니다).',
    '판매수량(합)': '판매실적의 한 달짜리 줄만 더한 값. 이 표에는 같은 판매가 하루·한 달·전체 기간으로 ' +
                   '겹쳐 들어 있어, 다 더하면 서너 번 센 값이 됩니다. [자료 기간] 이 그 범위입니다.',
    '마지막 달 수량': '자료의 마지막 달(' + (r.lastMonth || '') + ')에 판 수량. 지금도 팔리던 것인지 봅니다.',
    '마지막 판매(기간종료)': '하루·한 달짜리 줄 중 팔린 것의 가장 늦은 기간종료. 달 단위면 그 달 말일로 나옵니다.',
    '켜진 광고': '상품광고목록에서 지금 ENABLED 인 광고 수. 재고 0 이면 아마존이 알아서 안 내보내지만, ' +
                '재고가 들어오는 순간 다시 나갑니다.',
    '할 일': '많이 팔리던 것부터 재입고. 상태가 Inactive/Incomplete 면 재고만 넣어서는 안 살아납니다.'
  });
  showSheet_(SHEET_OOS);

  var top = r.rows.slice(0, 5).map(function (x) {
    return '  ' + String(x[0]).substring(0, 22) + ' — 수량 ' + x[7] + ' · ¥' + Number(x[8]).toLocaleString();
  }).join('\n');
  log_('sales', 'INFO', '품절인데 팔림 — ' + r.rows.length + '개 · ¥' + Math.round(r.sumAmt).toLocaleString());
  ui_().alert('품절인데 팔리던 SKU — ' + SHEET_OOS + ' 탭',
    '재고 0 · 판매 기록 있음: ' + r.rows.length + '개\n' +
    '그동안 판 돈 ¥' + Math.round(r.sumAmt).toLocaleString() + ' (자료 ' + r.span + ')\n' +
    (r.nRecent ? '그중 마지막 달(' + r.lastMonth + ')에도 팔리던 것 ' + r.nRecent + '개\n' : '') +
    '\n많이 팔리던 순 5개:\n' + top + '\n\n' +
    '위부터 재입고하면 됩니다. 여기서는 아무것도 바꾸지 않았습니다.',
    ui_().ButtonSet.OK);
  return r.rows.length + '개';
}

/**
 * 표 줄을 만든다 — 시트를 읽기만 한다.
 * @return {{rows:Array, sumAmt:number, nRecent:number, span:string, nSales:number}}
 */
function oosRows_() {
  var out = { rows: [], sumAmt: 0, nRecent: 0, span: '', nSales: 0 };

  // ① 판매실적을 SKU 로 모은다.
  //
  // 이 표에는 같은 판매가 여러 줄로 들어 있다 — 하루짜리 · 한 달짜리 · 일곱 달짜리 · 전체 기간.
  // 다 더하면 같은 주문을 서너 번 센다 (실제로 그렇게 세어 보니 최상위 상품이 3배로 나왔다).
  // 그래서 한 달짜리(28~31일) 줄만 더한다: 서로 겹치지 않고, 처음부터 끝까지 이어져 있다.
  // 마지막 판매일은 31일 이하 줄(하루·한 달)의 기간종료 중 가장 늦은 것이다 —
  // 전체 기간 줄의 기간종료는 '언제 팔렸나' 를 말해 주지 않는다.
  var agg = {}, last = '', first = '', lastMonth = '';
  var v = salesTable_();
  out.nSales = v.length;
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][SL_SKU] || '').trim();
    var qty = Number(v[i][SL_QTY]) || 0;
    if (!sku || qty <= 0) continue;
    var f = v[i][SL_FROM] instanceof Date ? ymd_(v[i][SL_FROM]) : String(v[i][SL_FROM] || '').substring(0, 10);
    var d = v[i][SL_TO] instanceof Date ? ymd_(v[i][SL_TO]) : String(v[i][SL_TO] || '').substring(0, 10);
    var span = (f && d) ? daysBetween_(f, d) + 1 : 0;
    var monthly = span >= 28 && span <= 31;
    var a = agg[sku] || (agg[sku] = { qty: 0, amt: 0, last: '', recent: 0, asin: '', months: {} });
    if (!a.asin && v[i][SL_ASIN]) a.asin = String(v[i][SL_ASIN]);
    if (span >= 1 && span <= 31 && d > a.last) a.last = d;
    if (!monthly) continue;
    a.qty += qty;
    a.amt += Number(v[i][SL_AMT]) || 0;
    a.months[f] = (a.months[f] || 0) + qty;
    if (d > last) last = d;
    if (!first || f < first) first = f;
    if (f > lastMonth) lastMonth = f;
  }
  if (!v.length) {
    var m = {};
    try { m = monthlySalesMap_(); } catch (e) { m = {}; }
    for (var k in m) if (m[k] > 0) agg[k] = { qty: m[k], amt: 0, last: '', recent: 0, asin: '', months: {} };
    out.nSales = Object.keys(agg).length;
  }
  // '최근' = 마지막 달의 수량 (한 달짜리 줄이 없으면 0)
  for (var s in agg) agg[s].recent = (agg[s].months || {})[lastMonth] || 0;
  out.span = first ? (first + '~' + last + ' (달 단위)') : '(주문 탭 월 합계)';
  out.lastMonth = lastMonth ? lastMonth.substring(0, 7) : '';

  // ② 리스팅과 맞댄다 — 재고 0 인 것만
  var lsh = ss_().getSheetByName(SHEET_LISTING);
  if (!lsh || lsh.getLastRow() < 2) return out;
  var lv = lsh.getRange(2, 1, lsh.getLastRow() - 1, LISTING_HEADER.length).getValues();
  var units = {};
  try { units = adUnitMap_(); } catch (e2) { units = {}; }
  var costs = {};
  try { costs = costMap_(); } catch (e3) { costs = {}; }

  for (var l = 0; l < lv.length; l++) {
    var sk = String(lv[l][0] || '').trim();
    if (!sk || !agg[sk]) continue;
    var stock = lv[l][7];
    var n = Number(stock);
    if (!(stock === 0 || stock === '0' || (isFinite(n) && n === 0 && String(stock).trim() !== ''))) continue;
    var a2 = agg[sk];
    var status = String(lv[l][8] || '');
    var todo = a2.recent > 0 ? '지금도 팔리던 것 — 먼저 재입고' : '재입고 검토';
    if (/inactive|incomplete/i.test(status)) todo += ' (상태 ' + status + ' — 재고만 넣어서는 안 살아납니다)';
    out.rows.push([sk, String(lv[l][1] || a2.asin || ''), String(lv[l][3] || '').substring(0, 40),
      String(lv[l][2] || '').substring(0, 60), Number(lv[l][6]) || '', 0, status,
      a2.qty, Math.round(a2.amt), a2.last || '', a2.recent,
      a2.recent ? Math.round(a2.recent / 30 * 100) / 100 : 0,
      out.span, units[sk] ? units[sk].on : '', costs[sk] > 0 ? 'O' : '', todo]);
    out.sumAmt += a2.amt;
    if (a2.recent > 0) out.nRecent++;
  }
  // 최근에 팔리던 것을 위로, 그 안에서는 판 돈 순
  out.rows.sort(function (x, y) {
    if ((y[10] > 0) !== (x[10] > 0)) return y[10] > 0 ? 1 : -1;
    return (Number(y[8]) || 0) - (Number(x[8]) || 0);
  });
  return out;
}
