/**
 * 69_마진기여.gs — 매출이 어디서 나오는가 · 무엇이 뜨고 있는가
 *
 * ── 왜 상위 100개 + 기타인가 ────────────────────────────
 * 실측: 2개월간 실제로 팔린 품목은 1,494개, 등록된 12,000개의 12.5%다.
 * 품목당 월 2.56건이 중위인데 상위 5개가 물량의 31%를 차지한다.
 * 이렇게 쏠린 분포에서 1,494줄을 다 보는 건 의미가 없다 — 꼬리는 한 줄로 접고
 * 실제로 매출을 만드는 앞쪽만 본다.
 *
 * ── 추세를 왜 통계로 거르는가 ───────────────────────────
 * 월 2~3건 팔리는 상품이 1건에서 3건이 되면 +200%다. 그런데 그건 그냥 우연이다.
 * 포아송 노이즈에서 구별되지 않는 변화를 '상승'이라고 표시하면, 매달 다른 상품이
 * 뜬 것처럼 보이고 그때마다 헛수고를 하게 된다.
 * 그래서 두 기간의 판매율 비가 2σ를 넘을 때만 상승/하락이라고 적고,
 * 나머지는 '—'로 둔다. 대부분의 SKU는 '—'가 나오는 게 정상이다.
 */

var SHEET_MARGIN = '매출기여';
var MARGIN_HEADER = [
  '순위', 'SKU', '상품명', '한글명', '판매량', '판매가(JPY)', '매출(JPY)',
  '매출비중', '누적비중', '배송비(JPY)', '배송비율', '배송비합계(JPY)', '배송판정',
  '최근30일', '이전30일', '증감', '추세',
  '세션', '전환율', '카트박스%', '유입진단'
];
var MG_RANK = 0, MG_SKU = 1, MG_NAME = 2, MG_KR = 3, MG_QTY = 4, MG_PRICE = 5,
    MG_REV = 6, MG_SHARE = 7, MG_CUM = 8, MG_SHIP = 9, MG_S = 10,
    MG_MSHIP = 11, MG_SVERDICT = 12,
    MG_N2 = 13, MG_N1 = 14, MG_CHG = 15, MG_TREND = 16,
    MG_SESS = 17, MG_CONV = 18, MG_BB = 19, MG_DIAG = 20;

/**
 * 배송비 비중 경보선.
 *
 * 실측 가중평균이 0.20이다. 그 두 배를 넘으면 가격 구조가 잘못된 것이고,
 * 환율 리프라이싱으로는 고쳐지지 않는다 — 묶음 판매나 포장 축소가 답이다.
 * 0.90을 넘으면 원가가 0원이어도 적자다 (판매가 × (1-수수료) < 배송비).
 */
var S_WARN = 0.30;      // 주의 — 평균의 1.5배
var S_BAD = 0.40;       // 심각 — 평균의 2배
var S_LOSS = 1 - DEFAULT_FEE_RATE;   // 0.90 — 여기부터는 원가와 무관하게 손해

function shipVerdict_(s) {
  if (!(s > 0)) return '';
  if (s >= S_LOSS) return '⛔ 확정손실';
  if (s >= S_BAD) return '⚠ 심각';
  if (s >= S_WARN) return '△ 주의';
  return '';
}

/** 이 순위까지만 낱개로 보여주고 나머지는 '기타'로 접는다 */
var MARGIN_TOP_N = 100;

// ── 유입 진단 (세션 대비 전환) ───────────────────────────
//
// 판매·트래픽 리포트에는 세션과 카트박스 점유율이 같이 온다.
// 이걸로 '왜 안 팔리는가'를 두 갈래로 나눌 수 있다:
//   사람은 오는데 안 산다  → 가격·상세·리뷰 문제 (또는 카트박스를 뺏겼거나)
//   사면서 사람이 안 온다  → 노출 문제. 광고를 늘릴 후보.
//
// 절대 기준(예: '전환율 5% 미만은 나쁨')은 쓰지 않는다. 카테고리마다 정상치가 달라서
// 남의 기준을 갖다 대면 전부 나쁘거나 전부 좋게 나온다. 내 계정의 중앙값과 견준다.

/** 이만큼은 봐야 전환율을 논한다. 세션 10에 판매 1이면 10%지만 아무 뜻이 없다 */
var CONV_MIN_SESS = 40;

/** 판정 문턱 (2σ) — 추세와 같은 기준 */
var CONV_K = 2.0;

/** 카트박스를 이만큼도 못 가지면 전환율 얘기가 무의미하다 */
var BB_LOW = 0.60;

/**
 * 한 SKU의 유입 상태를 판정한다.
 *
 * @param {number} k 판매수량
 * @param {number} n 세션
 * @param {number} p 계정 전체 전환율 (가중평균)
 * @param {number} medSess 세션 중앙값 — '노출이 많은 편인가'의 기준
 * @param {number} bb 카트박스 점유율 (0~1, 없으면 0)
 * @return {string}
 */
function trafficVerdict_(k, n, p, medSess, bb) {
  if (!(n >= CONV_MIN_SESS) || !(p > 0)) return '';

  // 카트박스를 못 가졌으면 전환율이 낮은 게 당연하다.
  // 이걸 '상세페이지가 나쁘다'로 읽으면 엉뚱한 곳을 고치게 된다.
  if (bb > 0 && bb < BB_LOW) return '⚠ 카트박스 열세 ' + Math.round(bb * 100) + '%';

  // 이항분포: 세션 n번 중 k번 팔릴 확률이 계정 평균 p와 다른가
  var z = (k / n - p) / Math.sqrt(p * (1 - p) / n);
  if (z <= -CONV_K) {
    // 노출이 평균 이상인데 전환이 떨어진다 = 고칠 여지가 큰 쪽
    return n >= medSess ? '🔍 유입 많은데 전환↓' : '전환↓';
  }
  if (z >= CONV_K) {
    // 전환이 좋은데 노출이 적다 = 광고를 태울 후보
    return n < medSess ? '📈 전환↑ 노출 적음 (광고 후보)' : '전환↑';
  }
  return '';
}

/** 추세 비교 창 (일) */
var TREND_WINDOW_DAYS = 30;

/** 두 창을 합쳐 이만큼은 팔려야 추세를 논한다 */
var TREND_MIN_OBS = 8;

/** 추세 판정 문턱 (2σ) */
var TREND_K = 2.0;

/** 요약에서 짚어볼 구간 */
var MARGIN_MARKS = [10, 20, 50, 100];

/**
 * 두 기간의 판매 건수로 추세를 판정한다.
 * 0을 다루기 위해 연속성 보정(+0.5)을 넣는다.
 * @return {{trend:string, change:number}}
 */
function salesTrend_(nPrior, nRecent) {
  if (nPrior + nRecent < TREND_MIN_OBS) {
    return { trend: '—', change: (nPrior > 0 ? nRecent / nPrior - 1 : 0) };
  }
  var a = nPrior + 0.5, b = nRecent + 0.5;
  var change = nPrior > 0 ? nRecent / nPrior - 1 : (nRecent > 0 ? 1 : 0);
  var z = Math.abs(Math.log(b / a)) / Math.sqrt(1 / a + 1 / b);
  if (z < TREND_K) return { trend: '—', change: change };
  return { trend: (b > a ? '▲ 상승' : '▼ 하락'), change: change };
}

/**
 * 주문 탭에서 최근/이전 창의 SKU별 건수를 센다.
 *
 * 필요한 건 마지막 60일뿐인데, 주문 탭은 보관 기간(기본 24개월)만큼 계속 커진다.
 * 통째로 읽으면 24개월 × 월 1만 건 = 24만 행 × 5칸 = 90만 셀을 들고 와서
 * 그중 90%를 버리게 된다 — 여기서 6분 한도를 넘겼다.
 *
 * 그래서 두 번에 나눠 읽는다:
 *   ① 날짜 칸 하나만 (1/5 비용) → 창이 어디서 시작하는지 찾는다
 *   ② 거기서 끝까지만 전체 칸을 읽는다
 * 주문은 오래된 구간부터 덧붙이므로 최근 것이 뒤에 몰려 있다.
 * 순서가 섞여 있어도 '가장 이른 해당 행'부터 읽으므로 결과는 같다.
 */
function trendCounts_() {
  var out = { prior: {}, recent: {}, from: '', mid: '', to: '' };
  var sh = ss_().getSheetByName(SHEET_ORDERS);
  if (!sh || sh.getLastRow() < 2) return out;
  var last = sh.getLastRow();

  // ① 날짜만 훑는다
  var dcol = sh.getRange(2, OD_DATE + 1, last - 1, 1).getValues();
  var norm = function (d) {
    if (!d) return '';
    var s = (d instanceof Date) ? ymd_(d) : String(d).substring(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };

  // 기준은 '오늘'이 아니라 '자료의 마지막 날'이다.
  // 수집이 며칠 밀려 있으면 오늘 기준 최근 30일이 통째로 비어 버린다.
  var maxD = '';
  for (var i = 0; i < dcol.length; i++) {
    var ds = norm(dcol[i][0]);
    if (ds && ds > maxD) maxD = ds;
  }
  if (!maxD) return out;

  var end = new Date(maxD + 'T00:00:00');
  out.to = maxD;
  out.mid = ymd_(new Date(end.getTime() - TREND_WINDOW_DAYS * 86400000));
  out.from = ymd_(new Date(end.getTime() - 2 * TREND_WINDOW_DAYS * 86400000));

  // 창에 드는 가장 이른 행을 찾는다
  var firstIdx = -1;
  for (var j = 0; j < dcol.length; j++) {
    var d2 = norm(dcol[j][0]);
    if (d2 && d2 > out.from) { firstIdx = j; break; }
  }
  if (firstIdx < 0) return out;              // 창에 드는 주문이 없다

  // ② 필요한 구간만 전체 칸으로
  var n = dcol.length - firstIdx;
  var v = sh.getRange(2 + firstIdx, 1, n, ORDERS_HEADER.length).getValues();
  for (var k = 0; k < v.length; k++) {
    var sku = String(v[k][OD_SKU] || '').trim();
    if (!sku) continue;
    var s = norm(v[k][OD_DATE]);
    if (!s || s <= out.from) continue;
    var q = Number(v[k][OD_QTY]) || 1;
    if (s > out.mid) out.recent[sku] = (out.recent[sku] || 0) + q;
    else out.prior[sku] = (out.prior[sku] || 0) + q;
  }
  return out;
}

/**
 * 어느 자료로 볼지 고른다.
 *
 * 판매실적(리포트)이 있으면 기간을 골라 그걸 쓴다 — 실제 주문금액이라 더 정확하고
 * 기간을 좁혀 볼 수 있다. 없으면 주문 탭에서 월평균으로 계산한다.
 * @return {{qty:Object, amt:Object, label:string, isPeriod:boolean}|null}
 */
function pickSalesSource_() {
  var periods = salesPeriods_();
  if (!periods.length) return null;

  var lines = periods.slice(0, 9).map(function (p, i) {
    return '  ' + (i + 1) + ') ' + p.from + ' ~ ' + p.to + '  (' + p.n.toLocaleString() + ' SKU)';
  }).join('\n');
  var res = ui_().prompt('어느 기간으로 볼까요',
    '판매실적으로 받아둔 기간:\n\n' + lines + '\n\n' +
    '번호를 입력하세요.\n' +
    '(0 = 주문 탭 기준 월평균 — 기간 구분 없음)',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return { cancel: true };

  var pick = parseInt(String(res.getResponseText()).trim(), 10);
  if (pick === 0) return null;
  if (!(pick >= 1 && pick <= Math.min(periods.length, 9))) {
    throw new Error('잘못된 번호입니다.');
  }
  var p = periods[pick - 1];
  var agg = salesForPeriod_(p.from, p.to);
  if (!agg) throw new Error('그 기간의 자료를 찾지 못했습니다.');
  return { qty: agg.qty, amt: agg.amt, sess: agg.sess, bb: agg.bb,
           label: p.from + ' ~ ' + p.to,
           from: p.from, to: p.to, isPeriod: true };
}

/** 메뉴: 매출 기여도 + 추세 */
function analyzeMarginShare() {
  // 필요한 자료가 있는지 먼저 본다. 없으면 여기서 받아온다 —
  // '수집 → 분석' 순서를 사람이 외우고 있어야 하는 구조를 없앤다.
  ensureData_(['listing'], ['sales', 'invoice'], '매출 기여도');

  clearCostSheetCache_(); clearCostCache_(); fxClearCache_();

  var src = pickSalesSource_();
  if (src && src.cancel) return;

  var sales, amtOf = null, periodLabel = '전체 기간 (주문 탭 · 월평균)';
  if (src) {
    sales = src.qty; amtOf = src.amt;
    periodLabel = src.label + ' (판매실적 리포트)';
  } else {
    sales = monthlySalesMap_();
    if (!Object.keys(sales).length) {
      throw new Error('판매 데이터가 없습니다.\n\n' +
        '[🔄 데이터 갱신 → 판매실적 수집]으로 기간을 지정해 리포트를 받거나,\n' +
        '[🔄 데이터 갱신 → 일별 SKU 판매 수집]으로 날짜별 자료를 받으세요.');
    }
  }
  var listSh = getSheetOrThrow_(SHEET_LISTING);
  if (listSh.getLastRow() < 2) {
    throw new Error('"리스팅"이 비어 있습니다. [🔄 데이터 갱신 → 아마존 동기화]를 실행하세요.');
  }

  var manual = costInfoMap_();
  var skuCost = skuCostMap_();
  var tc = trendCounts_();

  var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
  var rows = [];
  var noSale = 0, noPrice = 0;

  for (var i = 0; i < lv.length; i++) {
    var sku = String(lv[i][L_SKU] || '').trim();
    if (!sku) continue;
    var qty = sales[sku] || 0;
    if (!(qty > 0)) { noSale++; continue; }        // 안 팔린 상품은 비중이 없다
    var price = Number(lv[i][L_PRICE]);
    if (!(price > 0)) { noPrice++; continue; }

    var ship = resolveShipping_(sku, skuCost, manual).fee;
    var s = price > 0 ? ship / price : 0;
    var n1 = tc.prior[sku] || 0, n2 = tc.recent[sku] || 0;
    var tr = salesTrend_(n1, n2);

    // 리포트에는 실제 주문금액이 들어 있다. 그게 있으면 '가격 × 수량' 추정보다 정확하다
    // (기간 중 가격이 바뀌었거나 할인이 걸렸으면 추정이 어긋난다)
    var revenue = (amtOf && amtOf[sku] > 0) ? amtOf[sku] : price * qty;

    rows.push([0, sku, String(lv[i][L_JP] || ''), String(lv[i][L_KR] || ''),
               Number(qty.toFixed(1)), price, Math.round(revenue),
               0, 0, ship, s, Math.round(ship * qty), shipVerdict_(s),
               n2, n1, tr.trend === '—' ? '' : tr.change, tr.trend,
               (src && src.sess && src.sess[sku]) || '',
               '', (src && src.bb && src.bb[sku]) || '', '']);
  }
  if (!rows.length) throw new Error('판매 이력이 있는 SKU를 찾지 못했습니다.');

  rows.sort(function (a, b) { return b[MG_REV] - a[MG_REV]; });

  var total = 0;
  for (var t = 0; t < rows.length; t++) total += rows[t][MG_REV];

  var cum = 0;
  for (var r = 0; r < rows.length; r++) {
    rows[r][MG_RANK] = r + 1;
    var share = total ? rows[r][MG_REV] / total : 0;
    cum += share;
    rows[r][MG_SHARE] = share;
    rows[r][MG_CUM] = cum;
  }

  // 유입 진단 — 세션이 있을 때만. 기준은 남의 업계 평균이 아니라 내 계정 중앙값이다.
  var sumK = 0, sumN = 0, sessList = [];
  for (var e = 0; e < rows.length; e++) {
    var nS = Number(rows[e][MG_SESS]) || 0;
    if (nS <= 0) continue;
    sumK += Number(rows[e][MG_QTY]) || 0;
    sumN += nS;
    sessList.push(nS);
  }
  var convAvg = sumN > 0 ? sumK / sumN : 0;
  var medSess = median_(sessList);
  var nDiag = { low: 0, high: 0, bb: 0 };
  if (convAvg > 0) {
    for (var g = 0; g < rows.length; g++) {
      var n2s = Number(rows[g][MG_SESS]) || 0;
      if (n2s <= 0) continue;
      rows[g][MG_CONV] = (Number(rows[g][MG_QTY]) || 0) / n2s;
      var vd = trafficVerdict_(Number(rows[g][MG_QTY]) || 0, n2s, convAvg, medSess,
                               Number(rows[g][MG_BB]) || 0);
      rows[g][MG_DIAG] = vd;
      if (vd.indexOf('카트박스') >= 0) nDiag.bb++;
      else if (vd.indexOf('전환↓') >= 0) nDiag.low++;
      else if (vd.indexOf('전환↑') >= 0) nDiag.high++;
    }
  }

  // 광고비·TACOS는 [📊 분석 → TACOS · 광고 효율]로 분리했다.
  // 광고실적 통읽기가 여기 얹혀 있으면 매출 기여도가 그만큼 느려진다.

  writeMarginSheet_(rows, total, noSale, noPrice, tc, periodLabel, !!src);

  var marks = [];
  for (var m = 0; m < MARGIN_MARKS.length; m++) {
    var n = MARGIN_MARKS[m];
    if (n > rows.length) break;
    marks.push('  상위 ' + String(n) + '개 → 매출의 ' +
               (rows[n - 1][MG_CUM] * 100).toFixed(1) + '%');
  }
  var half = 0;
  for (var h = 0; h < rows.length; h++) { if (rows[h][MG_CUM] >= 0.5) { half = h + 1; break; } }

  var up = rows.filter(function (x) { return x[MG_TREND] === '▲ 상승'; });
  var down = rows.filter(function (x) { return x[MG_TREND] === '▼ 하락'; });
  up.sort(function (a, b) { return b[MG_CHG] - a[MG_CHG]; });

  // 배송비가 새는 곳 — 상위 100 밖에 있어도 잡아야 하므로 전체에서 센다.
  // 순위는 '비율'이 아니라 '월 배송비 총액'으로 매긴다. 비율만 보면
  // 한 달에 한 개 팔리는 상품이 맨 위에 올라와 실제 손실 규모를 가린다.
  var warn = rows.filter(function (x) { return x[MG_S] >= S_WARN; });
  var bad = rows.filter(function (x) { return x[MG_S] >= S_BAD; });
  var loss = rows.filter(function (x) { return x[MG_S] >= S_LOSS; });
  var shipSorted = warn.slice().sort(function (a, b) { return b[MG_MSHIP] - a[MG_MSHIP]; });
  var totalShip = 0;
  for (var v = 0; v < rows.length; v++) totalShip += rows[v][MG_MSHIP];
  var warnShip = 0;
  for (var w = 0; w < warn.length; w++) warnShip += warn[w][MG_MSHIP];

  var unit = src ? '매출' : '월매출';
  var msg = periodLabel + '\n' +
            '판매 이력 ' + rows.length.toLocaleString() + '개 · ' + unit + ' ' +
            Math.round(total).toLocaleString() + '엔';
  log_('margin', 'INFO', msg + ' · 상승 ' + up.length + ' / 하락 ' + down.length);

  showSheet_(SHEET_MARGIN);
  ui_().alert('매출 기여도 — ' + SHEET_MARGIN + ' 탭',
    msg + '\n\n' +
    '■ 누적 비중\n' + marks.join('\n') + '\n' +
    '  매출의 절반을 만드는 SKU: ' + half.toLocaleString() + '개\n\n' +
    '■ 배송비 과다 (실측 평균 ' + Math.round(DEFAULT_S * 100) + '%)\n' +
    '  △ 주의 ' + Math.round(S_WARN * 100) + '%↑ : ' + warn.length.toLocaleString() + '개\n' +
    '  ⚠ 심각 ' + Math.round(S_BAD * 100) + '%↑ : ' + bad.length.toLocaleString() + '개\n' +
    (loss.length ? '  ⛔ 확정손실 ' + Math.round(S_LOSS * 100) + '%↑ : ' +
                   loss.length.toLocaleString() + '개 (원가가 0원이어도 적자)\n' : '') +
    '  이들이 쓰는 월 배송비: ' + Math.round(warnShip).toLocaleString() + '엔 / 전체 ' +
      Math.round(totalShip).toLocaleString() + '엔 (' +
      (totalShip ? Math.round(warnShip / totalShip * 100) : 0) + '%)\n' +
    (shipSorted.length
      ? '\n  배송비를 가장 많이 쓰는 것 (비율 높은 것 중)\n' +
        shipSorted.slice(0, 5).map(function (x) {
          return '   ' + (x[MG_KR] || x[MG_NAME]).substring(0, 18) +
                 '  비율 ' + Math.round(x[MG_S] * 100) + '% · 월 ' +
                 Math.round(x[MG_MSHIP]).toLocaleString() + '엔';
        }).join('\n') + '\n'
      : '') +
    '\n※ 배송비 비중은 환율 리프라이싱으로 안 고쳐집니다.\n' +
    '   묶음 판매나 포장 축소로 무게 구간을 낮춰야 합니다.\n\n' +
    (convAvg > 0
      ? '■ 유입 (계정 평균 전환율 ' + (convAvg * 100).toFixed(1) + '% · 세션 중앙값 ' +
        Math.round(medSess) + ')\n' +
        '  🔍 유입 많은데 전환↓ : ' + nDiag.low + '개  — 가격·상세·리뷰를 볼 자리\n' +
        '  📈 전환↑ 노출 적음 : ' + nDiag.high + '개  — 광고를 태울 후보\n' +
        (nDiag.bb ? '  ⚠ 카트박스 열세 : ' + nDiag.bb + '개  — 전환이 아니라 가격 문제\n' : '') +
        '  (세션 ' + CONV_MIN_SESS + ' 미만은 판정하지 않습니다 — 우연과 구별이 안 됩니다)\n\n'
      : '■ 유입 진단은 판매실적 기간을 골라야 나옵니다 (세션이 그 자료에만 있습니다)\n\n') +
    '■ 추세 (' + tc.from + ' ~ ' + tc.mid + '  vs  ' + tc.mid + ' ~ ' + tc.to + ')\n' +
    '  ▲ 상승 ' + up.length + '개 / ▼ 하락 ' + down.length + '개\n' +
    (up.length
      ? '\n  가장 많이 오른 것\n' + up.slice(0, 5).map(function (x) {
          return '   ' + (x[MG_KR] || x[MG_NAME]).substring(0, 20) +
                 '  ' + x[MG_N1] + '→' + x[MG_N2] + '건 (' + pct_(x[MG_CHG]) + ')';
        }).join('\n') + '\n'
      : '\n  통계적으로 구별되는 상승은 없습니다.\n') +
    '\n※ 대부분의 SKU는 판매가 적어 추세 판정이 "—"로 나옵니다.\n' +
    '   우연한 증감을 상승으로 읽지 않기 위한 것입니다.\n' +
    (noSale ? '\n· 판매 이력 없어 제외: ' + noSale.toLocaleString() + '개' : ''),
    ui_().ButtonSet.OK);
  return msg;
}

function writeMarginSheet_(rows, total, noSale, noPrice, tc, periodLabel, isPeriod) {
  var sh = ensureSheet_(SHEET_MARGIN, MARGIN_HEADER);
  sh.clear();

  var half = 0;
  for (var h = 0; h < rows.length; h++) { if (rows[h][MG_CUM] >= 0.5) { half = h + 1; break; } }
  sh.getRange(1, 1).setValue(
    '[' + (periodLabel || '전체') + ']  판매 이력 ' + rows.length.toLocaleString() +
    '개 · ' + (isPeriod ? '매출 ' : '월매출 ') +
    Math.round(total).toLocaleString() + '엔 · 매출 절반을 만드는 SKU ' +
    half.toLocaleString() + '개' +
    (noSale ? ' · 무판매 ' + noSale.toLocaleString() + '개 제외' : '') +
    '   |   추세 비교: ' + (tc.from || '-') + '~' + (tc.mid || '-') +
    ' vs ' + (tc.mid || '-') + '~' + (tc.to || '-') +
    '')
    .setFontWeight('bold');

  sh.getRange(2, 1, 1, MARGIN_HEADER.length).setValues([MARGIN_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');

  var top = rows.slice(0, MARGIN_TOP_N);
  var rest = rows.slice(MARGIN_TOP_N);

  var CH = 2000;
  for (var s = 0; s < top.length; s += CH) {
    var part = top.slice(s, s + CH);
    sh.getRange(3 + s, 1, part.length, MARGIN_HEADER.length).setValues(part);
  }

  var lastRow = 2 + top.length;
  if (rest.length) {
    var rQty = 0, rRev = 0, rN1 = 0, rN2 = 0, rShip = 0, rBad = 0;
    var rSess = 0;
    for (var k = 0; k < rest.length; k++) {
      rQty += rest[k][MG_QTY]; rRev += rest[k][MG_REV];
      rN1 += rest[k][MG_N1]; rN2 += rest[k][MG_N2];
      rShip += rest[k][MG_MSHIP];
      rSess += Number(rest[k][MG_SESS]) || 0;
      if (rest[k][MG_S] >= S_WARN) rBad++;
    }
    lastRow++;
    sh.getRange(lastRow, 1, 1, MARGIN_HEADER.length).setValues([[
      '기타', rest.length + '개', '상위 ' + MARGIN_TOP_N + '위 밖 전체', '',
      Number(rQty.toFixed(1)), '', Math.round(rRev),
      total ? rRev / total : 0, 1, '', rRev ? rShip / rRev : 0, Math.round(rShip),
      rBad ? '배송과다 ' + rBad + '개' : '', rN2, rN1, '', '',
      rSess || '', (rSess && rQty) ? rQty / rSess : '', '', ''
    ]]);
    sh.getRange(lastRow, 1, 1, MARGIN_HEADER.length)
      .setFontWeight('bold').setBackground('#eceff1');
  }

  sh.setFrozenRows(2);
  var n = lastRow - 2;
  sh.getRange(3, MG_SHARE + 1, n, 2).setNumberFormat('0.00%');
  sh.getRange(3, MG_S + 1, n, 1).setNumberFormat('0.0%');
  sh.getRange(3, MG_CHG + 1, n, 1).setNumberFormat('+0%;-0%');
  sh.getRange(3, MG_QTY + 1, n, 1).setNumberFormat('#,##0.0');
  sh.getRange(3, MG_REV + 1, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, MG_MSHIP + 1, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, MG_SESS + 1, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, MG_CONV + 1, n, 1).setNumberFormat('0.0%');
  sh.getRange(3, MG_BB + 1, n, 1).setNumberFormat('0%');

  // 추세·상위구간·배송비를 색으로 — 숫자만 보면 어디까지가 '상위'인지 안 잡힌다
  var tbg = [], cbg = [], sbg = [];
  for (var i = 0; i < top.length; i++) {
    var tv = String(top[i][MG_TREND]);
    tbg.push([tv === '▲ 상승' ? '#e6f4ea' : tv === '▼ 하락' ? '#fce8e6' : '#ffffff']);
    var c = top[i][MG_CUM];
    cbg.push([c <= 0.5 ? '#e8f0fe' : c <= 0.8 ? '#f1f5fd' : '#ffffff']);
    var sv = top[i][MG_S];
    sbg.push([sv >= S_LOSS ? '#f4c7c3' : sv >= S_BAD ? '#fce8e6'
            : sv >= S_WARN ? '#fff4d6' : '#ffffff']);
  }
  if (top.length) {
    sh.getRange(3, MG_TREND + 1, top.length, 1).setBackgrounds(tbg);
    sh.getRange(3, MG_CUM + 1, top.length, 1).setBackgrounds(cbg);
    sh.getRange(3, MG_S + 1, top.length, 1).setBackgrounds(sbg);
    sh.getRange(3, MG_SVERDICT + 1, top.length, 1).setBackgrounds(sbg);
  }
  for (var c2 = 1; c2 <= 4; c2++) sh.autoResizeColumn(c2);

  // 기호만 있고 설명이 없으면 '🔍'가 무슨 뜻인지 매번 물어야 한다.
  // 표 아래에 풀어 쓰고, 머리글에도 마우스오버 메모를 단다.
  headerNotes_(sh, 2, MARGIN_HEADER, marginNotes_());
  writeLegend_(sh, lastRow + 2, marginLegend_());
}

/** 머리글에 붙이는 설명 (마우스를 올리면 뜬다) */
function marginNotes_() {
  return {
    '누적비중': '위에서부터 더한 매출 비중.\n0.5까지가 매출의 절반을 만드는 SKU다.',
    '배송비율': 's = 배송비 ÷ 판매가.\n실측 가중평균 ' + Math.round(DEFAULT_S * 100) + '%.\n' +
                '이 값이 크면 환율 리프라이싱으로 못 고친다 — 무게를 줄여야 한다.',
    '배송판정': '△ 주의 ' + Math.round(S_WARN * 100) + '%↑ / ⚠ 심각 ' +
                Math.round(S_BAD * 100) + '%↑ / ⛔ 확정손실 ' + Math.round(S_LOSS * 100) + '%↑',
    '추세': '최근 30일과 이전 30일의 판매율을 포아송으로 견준다.\n' +
            '2σ를 넘을 때만 ▲▼를 적는다. 대부분 "—"가 정상이다.',
    '세션': '그 SKU 페이지를 본 횟수 (판매실적 리포트에서 온다).\n' +
            '기간을 골라 [판매실적 수집]을 해야 채워진다.',
    '전환율': '판매량 ÷ 세션. 100명이 보고 몇 명이 샀는가.',
    '카트박스%': '그 기간 동안 내가 카트박스를 가지고 있던 비율.\n' +
                 Math.round(BB_LOW * 100) + '% 아래면 전환율 얘기가 무의미하다 — 값이 문제다.',
    '유입진단': '전환율을 내 계정 평균과 견줘 판정한다 (남의 업계 기준을 쓰지 않는다).\n' +
                '세션 ' + CONV_MIN_SESS + ' 미만은 우연과 구별이 안 되므로 판정하지 않는다.'
  };
}

/** 표 아래에 붙이는 기호 풀이 */
function marginLegend_() {
  return [
    ['유입진단 — 무슨 뜻인가', ''],
    ['🔍 유입 많은데 전환↓',
     '사람은 평균보다 많이 오는데 사는 비율이 계정 평균보다 2σ 낮다. ' +
     '고칠 여지가 가장 큰 자리 — 가격·대표이미지·상세·리뷰를 본다.'],
    ['전환↓',
     '전환은 낮지만 유입 자체가 평균 이하다. 고쳐도 효과가 작다. 뒤로 미룬다.'],
    ['📈 전환↑ 노출 적음 (광고 후보)',
     '오는 사람은 잘 산다. 그런데 유입이 적다. 광고를 태우면 그대로 매출이 된다.'],
    ['전환↑',
     '잘 사고 유입도 이미 평균 이상이다. 그냥 두면 된다.'],
    ['⚠ 카트박스 열세 N%',
     '카트박스를 ' + Math.round(BB_LOW * 100) + '% 미만으로 가졌다. ' +
     '전환이 낮은 게 당연하므로 상세페이지 탓이 아니다 — 가격이나 배송 조건 문제다.'],
    ['(빈칸)',
     '세션 ' + CONV_MIN_SESS + ' 미만이거나, 계정 평균과 통계적으로 구별되지 않는다. ' +
     '대부분이 여기 들어오는 게 정상이다.'],
    ['', ''],
    ['배송판정 — 무슨 뜻인가', ''],
    ['△ 주의 (배송비율 ' + Math.round(S_WARN * 100) + '%↑)',
     '실측 평균 ' + Math.round(DEFAULT_S * 100) + '%의 1.5배. 마진이 얇아진다.'],
    ['⚠ 심각 (' + Math.round(S_BAD * 100) + '%↑)',
     '평균의 2배. 값을 올려도 배송비가 같이 먹으므로 리프라이싱으로 안 고쳐진다.'],
    ['⛔ 확정손실 (' + Math.round(S_LOSS * 100) + '%↑)',
     '판매가 × (1 − 수수료) < 배송비. 원가가 0원이어도 적자다. 묶음 판매나 포장 축소가 답이다.'],
    ['', ''],
    ['추세 — 무슨 뜻인가', ''],
    ['▲ 상승 / ▼ 하락',
     '두 30일 구간의 판매율 비가 2σ를 넘었다. 우연으로 보기 어렵다.'],
    ['—',
     '구별되지 않는다. 월 2~3건 팔리는 상품이 1건→3건이 되면 +200%지만 그냥 우연이다.']
  ];
}

/**
 * 표 아래에 기호 풀이를 적는다.
 * @param {Sheet} sh
 * @param {number} atRow 시작 행
 * @param {Array<Array<string>>} lines [기호, 설명]
 */
function writeLegend_(sh, atRow, lines) {
  if (!lines || !lines.length) return;
  var need = atRow + lines.length + 2;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(atRow, 1, lines.length, 2).setValues(lines);
  for (var i = 0; i < lines.length; i++) {
    if (lines[i][1] === '' && lines[i][0] !== '') {
      sh.getRange(atRow + i, 1).setFontWeight('bold').setBackground('#eceff1');
    }
  }
  sh.getRange(atRow, 1, lines.length, 2).setFontSize(9).setWrap(true);
  sh.setColumnWidth(2, Math.max(sh.getColumnWidth(2), 420));
}
