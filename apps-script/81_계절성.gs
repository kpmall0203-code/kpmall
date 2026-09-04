/**
 * 81_계절성.gs — 언제 팔리는가, 그래서 언제 사와야 하는가
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 사입 시점과 냉장 전환 시점을 지금은 감으로 정하고 있다.
 * 주문이 24개월 쌓이면 작년 같은 달이 들어오므로 자료로 정할 수 있다.
 *
 * ── 왜 '작년 같은 달과 비교'가 아니라 이동평균인가 ─────
 * 작년 8월 대비 올해 8월이 +30%라고 해서 8월이 성수기인 것은 아니다.
 * 장사 자체가 커졌으면 모든 달이 오른다 — 성장과 계절이 섞여 있다.
 *
 * 그래서 고전적인 '이동평균 대비 비율'을 쓴다:
 *   ① 중심 12개월 이동평균을 낸다        → 이게 그 시점의 '평상시 수준'(추세)
 *   ② 그 달 실적 ÷ 추세 = 그 달의 비율
 *   ③ 같은 달끼리 평균 = 계절지수
 * 12개월로 평균을 내면 계절 성분이 상쇄되므로, 남는 것이 추세다.
 * 그 추세로 나누면 성장이 빠지고 계절만 남는다.
 *
 * 지수 1.30 = 그 달은 평상시보다 30% 더 팔린다는 뜻이다.
 *
 * ── 몇 달이 있어야 하나 ─────────────────────────────────
 * 중심 12개월 이동평균은 앞뒤로 6개월씩을 먹는다. 그래서 13개월이 있어야
 * 지수가 딱 한 점 나온다. 24개월이면 13점 — 달마다 1~2번씩이다.
 * 관측이 1번뿐인 달은 '잠정'이라고 적는다. 우연과 구별이 안 되기 때문이다.
 *
 * ── 냉장은 왜 따로 보나 ─────────────────────────────────
 * 판매량 계절성과 냉장 필요 시점은 다른 이야기다.
 * 냉장은 판매가 아니라 기온을 따라간다. 그런데 기온 자료는 없고,
 * 대신 '실제로 냉장으로 보낸 비율'이 청구서에 달마다 찍혀 있다.
 * 작년에 몇 월부터 냉장이 늘었는지 그대로 읽으면 된다.
 */

var SHEET_SEASON = '계절성';
var SEASON_HEADER = [
  '월', '계절지수', '판정', '관측 횟수', '평균 수량', '평균 매출(JPY)',
  '냉장 비율', '사입 안내'
];
var SN_MON = 0, SN_IDX = 1, SN_VERDICT = 2, SN_N = 3, SN_QTY = 4, SN_AMT = 5,
    SN_COOL = 6, SN_NOTE = 7;

/** SKU별 성수기 블록 (같은 탭 아래쪽) */
var SEASON_SKU_HEADER = [
  'SKU', '상품명', '한글명', '성수기', '성수기 지수', '비수기', '연간 수량', '판정'
];

/** 중심 이동평균 창 (개월) */
var SEASON_WINDOW = 12;

/** 지수가 이만큼 벗어나야 성수기·비수기라고 부른다 */
var SEASON_HIGH = 1.15;
var SEASON_LOW = 0.85;

/** SKU별 성수기를 논하려면 이만큼은 팔려야 한다 */
var SEASON_SKU_MIN_QTY = 24;

/** SKU별로 보여줄 수 */
var SEASON_SKU_TOP = 100;

var MONTH_NAME = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월',
                  '9월', '10월', '11월', '12월'];

/**
 * 월별 주문 합계 — 주문 탭에서.
 *
 * 주문 탭(낱개)과 주문요약(접힌 달)을 합친다. 같은 달이 양쪽에 있으면
 * 낱개 쪽만 쓴다 — 요약은 낱개를 접어 만든 것이라 더하면 두 번 센다.
 *
 * 주문 탭은 24개월이면 24만 행이다. 필요한 칸은 수량·금액·주문일뿐이라
 * 붙어 있는 3칸만 읽는다 (전체를 읽으면 40%를 더 들고 온다).
 *
 * @return {{months:Object, skuMon:Object}} months: '2026-08' -> {qty, amt}
 */
function seasonMonthly_() {
  var months = {}, skuMon = {}, daily = {};

  var sh = ss_().getSheetByName(SHEET_ORDERS);
  if (sh && sh.getLastRow() > 1) {
    // OD_QTY(2) · OD_PRICE(3) · OD_DATE(4) 는 붙어 있다
    var v = sh.getRange(2, OD_QTY + 1, sh.getLastRow() - 1, 3).getValues();
    var skuCol = sh.getRange(2, OD_SKU + 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < v.length; i++) {
      var d = v[i][2];
      var ds = (d instanceof Date) ? ymd_(d) : String(d || '').substring(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
      var mon = ds.substring(0, 7);
      daily[mon] = true;
      var q = Number(v[i][0]) || 1;
      var a = Number(v[i][1]) || 0;
      if (!months[mon]) months[mon] = { qty: 0, amt: 0 };
      months[mon].qty += q; months[mon].amt += a;
      var sku = String(skuCol[i][0] || '').trim();
      if (sku) {
        if (!skuMon[sku]) skuMon[sku] = {};
        skuMon[sku][mon] = (skuMon[sku][mon] || 0) + q;
      }
    }
  }

  // 접힌 달 — 낱개가 있는 달은 건너뛴다
  var sum = ss_().getSheetByName(SHEET_ORDSUM);
  if (sum && sum.getLastRow() > 1) {
    var sv = sum.getRange(2, 1, sum.getLastRow() - 1, ORDSUM_HEADER.length).getValues();
    for (var j = 0; j < sv.length; j++) {
      var m2 = String(sv[j][OS_MONTH] || '').trim();
      if (!/^\d{4}-\d{2}$/.test(m2) || daily[m2]) continue;
      var q2 = Number(sv[j][OS_QTY]) || 0;
      var a2 = Number(sv[j][OS_AMT]) || 0;
      if (!months[m2]) months[m2] = { qty: 0, amt: 0 };
      months[m2].qty += q2; months[m2].amt += a2;
      var sk2 = String(sv[j][OS_SKU] || '').trim();
      if (sk2) {
        if (!skuMon[sk2]) skuMon[sk2] = {};
        skuMon[sk2][m2] = (skuMon[sk2][m2] || 0) + q2;
      }
    }
  }
  return { months: months, skuMon: skuMon };
}

/**
 * 월별 합계 — 판매실적 탭에서.
 *
 * ── 왜 두 번째 자료원이 필요한가 ───────────────────────
 * 계절성은 원래 주문 탭만 봤다. 그런데 주문은 SP-API가 30일씩만 주고 보관도
 * 24개월로 끊는데, 판매실적은 달 단위로 통째로 받아 쌓아둔다.
 * 판매실적 18개월을 받아두고도 계절성이 "자료 부족"이라고 하는 일이
 * 실제로 있었다 — 주문 탭이 짧았기 때문이다.
 *
 * 두 자료원의 숫자는 같은 것을 센다 (그 달에 팔린 수량·금액).
 * 그래서 둘 중 달 수가 많은 쪽을 쓴다. 섞지는 않는다 —
 * 한 달을 양쪽에서 가져오면 어느 쪽이 맞는지 알 수 없고, 합치면 두 배가 된다.
 *
 * 달을 통째로 덮는 기간만 쓴다. '6월 1일~6월 15일' 같은 반달짜리를 한 달로
 * 세면 그 달만 반토막으로 나와 계절지수가 통째로 뒤틀린다.
 *
 * @return {{months:Object, skuMon:Object}}
 */
function seasonFromSales_() {
  var months = {}, skuMon = {};
  var v = salesTable_();
  for (var i = 0; i < v.length; i++) {
    var f = v[i][SL_FROM] instanceof Date ? ymd_(v[i][SL_FROM]) : String(v[i][SL_FROM] || '');
    var t = v[i][SL_TO] instanceof Date ? ymd_(v[i][SL_TO]) : String(v[i][SL_TO] || '');
    if (!/^\d{4}-\d{2}-01$/.test(f)) continue;          // 1일에 시작하지 않으면 한 달이 아니다
    var y = Number(f.substring(0, 4)), m = Number(f.substring(5, 7));
    if (t !== ymd_(new Date(y, m, 0))) continue;        // 말일에 끝나지 않으면 반달짜리다

    var mon = f.substring(0, 7);
    var sku = String(v[i][SL_SKU] || '').trim();
    var q = Number(v[i][SL_QTY]) || 0;
    var a = Number(v[i][SL_AMT]) || 0;
    if (!months[mon]) months[mon] = { qty: 0, amt: 0 };
    months[mon].qty += q; months[mon].amt += a;
    if (sku) {
      if (!skuMon[sku]) skuMon[sku] = {};
      skuMon[sku][mon] = (skuMon[sku][mon] || 0) + q;
    }
  }
  return { months: months, skuMon: skuMon };
}

/**
 * 달 수가 많은 자료원을 고른다.
 * @return {{months:Object, skuMon:Object, source:string, n:number}}
 */
function seasonPickSource_() {
  var ord = seasonMonthly_();
  var sal = seasonFromSales_();
  var nOrd = Object.keys(ord.months).length;
  var nSal = Object.keys(sal.months).length;
  if (nSal > nOrd) {
    return { months: sal.months, skuMon: sal.skuMon, source: '판매실적',
             n: nSal, other: '주문', otherN: nOrd };
  }
  return { months: ord.months, skuMon: ord.skuMon, source: '주문',
           n: nOrd, other: '판매실적', otherN: nSal };
}

/**
 * 이동평균 대비 비율로 계절지수를 낸다.
 *
 * @param {Array<{mon:string, qty:number}>} series 연월 오름차순
 * @return {{idx:Array<number|null>, n:Array<number>, points:number}}
 *         idx[0..11] = 1월~12월 지수 (못 내면 null)
 */
function seasonIndex_(series) {
  var idx = [], nObs = [];
  for (var m = 0; m < 12; m++) { idx.push(null); nObs.push(0); }
  var N = series.length;
  var half = SEASON_WINDOW / 2;
  if (N < SEASON_WINDOW + 1) return { idx: idx, n: nObs, points: 0 };

  // ── 추세 (중심 12개월 이동평균) ──────────────────────────
  var trend = [];
  for (var z = 0; z < N; z++) trend.push(null);
  var lo = -1, hi = -1;
  for (var i = half; i <= N - 1 - half; i++) {
    // 양 끝을 반씩 넣어야 중심이 맞는다
    var s = (series[i - half].qty + series[i + half].qty) / 2;
    for (var j = i - half + 1; j <= i + half - 1; j++) s += series[j].qty;
    var tv = s / SEASON_WINDOW;
    if (!(tv > 0)) continue;
    trend[i] = tv;
    if (lo < 0) lo = i;
    hi = i;
  }
  if (lo < 0) return { idx: idx, n: nObs, points: 0, edge: 0 };

  // ── 양 끝 6개월을 버리지 않는다 ─────────────────────────
  //
  // 중심 이동평균은 앞뒤로 6개월씩을 먹는다. 18개월을 받아도 가운데 6개월만
  // 지수가 나오고 나머지 반은 '자료 부족'이 된다 — 받아둔 자료의 3분의 2를
  // 안 쓰는 셈이다.
  //
  // 그래서 계산된 추세의 기울기로 양 끝을 늘린다.
  // 추세는 '장사가 커지고 있는 속도'라 몇 달 사이에 방향이 뒤집히지 않는다.
  // 평평하게 늘리면 안 된다 — 성장 중이면 끝쪽 지수가 부풀려진다.
  //
  // 늘려서 얻은 점은 가운데 것보다 약하므로 따로 세어 표에 밝힌다.
  var slope = function (a, b) {
    // a→b 방향으로 한 달당 얼마나 오르는가 (가까운 3점까지만 본다)
    var k = Math.min(3, Math.abs(b - a));
    if (k < 1) return 0;
    var far = a + (b > a ? k : -k);
    return (trend[far] - trend[a]) / (far - a);
  };
  var sLo = slope(lo, hi), sHi = slope(hi, lo);
  var edgeAt = {};
  for (var p = lo - 1; p >= 0; p--) {
    var vLo = trend[lo] + sLo * (p - lo);
    trend[p] = vLo > 0 ? vLo : trend[lo];      // 음수로 내려가면 늘리기를 멈춘다
    edgeAt[p] = true;
  }
  for (var q = hi + 1; q < N; q++) {
    var vHi = trend[hi] + sHi * (q - hi);
    trend[q] = vHi > 0 ? vHi : trend[hi];
    edgeAt[q] = true;
  }

  var acc = [], accEdge = [];
  for (var k2 = 0; k2 < 12; k2++) { acc.push([]); accEdge.push(0); }
  for (var r = 0; r < N; r++) {
    if (!(trend[r] > 0)) continue;
    var mo = Number(series[r].mon.substring(5, 7)) - 1;
    acc[mo].push(series[r].qty / trend[r]);
    if (edgeAt[r]) accEdge[mo]++;
  }

  var points = 0, edge = 0, sum = 0, cnt = 0;
  for (var t = 0; t < 12; t++) {
    nObs[t] = acc[t].length;
    if (!acc[t].length) continue;
    var a2 = 0;
    for (var u = 0; u < acc[t].length; u++) a2 += acc[t][u];
    idx[t] = a2 / acc[t].length;
    sum += idx[t]; cnt++; points += acc[t].length; edge += accEdge[t];
  }
  // 12달 평균이 1이 되도록 맞춘다 — 그래야 '1.30 = 30% 더'로 읽힌다
  if (cnt > 0) {
    var mean = sum / cnt;
    if (mean > 0) for (var w = 0; w < 12; w++) if (idx[w] !== null) idx[w] /= mean;
  }
  return { idx: idx, n: nObs, points: points, edge: edge, edgeByMonth: accEdge };
}

function seasonVerdict_(v, n, nEdge) {
  if (v === null) return '자료 부족';
  var tag = v >= SEASON_HIGH ? '▲ 성수기' : v <= SEASON_LOW ? '▼ 비수기' : '· 평상';
  // 관측이 하나뿐이거나, 그 하나가 추세를 늘려 얻은 것이면 약한 판정이다
  if (n < 2) return tag + ' (잠정)';
  if (nEdge >= n) return tag + ' (끝자락 추정)';
  return tag;
}

/**
 * 달마다 냉장으로 나간 비율.
 * 기온 자료가 없으니, 실제로 냉장으로 보낸 비율을 그대로 읽는다.
 * @return {Array<number|null>} 1월~12월
 */
function seasonCoolRatio_() {
  var out = [], hit = [], tot = [];
  for (var m = 0; m < 12; m++) { out.push(null); hit.push(0); tot.push(0); }
  var sh = ss_().getSheetByName(SHEET_SHIPMENTS);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, SHIP_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var d = v[i][SP_DATE];
    var ds = (d instanceof Date) ? ymd_(d) : String(d || '').substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
    var mo = Number(ds.substring(5, 7)) - 1;
    if (!(mo >= 0 && mo < 12)) continue;
    tot[mo]++;
    if (String(v[i][SP_COOL] || '').trim()) hit[mo]++;
  }
  for (var k = 0; k < 12; k++) if (tot[k] > 0) out[k] = hit[k] / tot[k];
  return out;
}

/** 메뉴: 계절성 (언제 팔리나 · 언제 사올까) */
function analyzeSeasonality() {
  // 주문과 판매실적 둘 중 아무거나 있으면 된다 — 둘 다 없을 때만 막는다
  ensureData_([], ['orders', 'sales'], '계절성');

  var agg = seasonPickSource_();
  var keys = Object.keys(agg.months).sort();
  if (keys.length < 2) {
    ui_().alert('계절성',
      '월별로 나눌 자료가 없습니다.\n\n' +
      '계절성은 두 자료원 중 달 수가 많은 쪽을 씁니다:\n' +
      '   · 주문 : ' + (agg.source === '주문' ? agg.n : agg.otherN) + '개월\n' +
      '   · 판매실적 (달 단위로 받은 것만) : ' +
        (agg.source === '판매실적' ? agg.n : agg.otherN) + '개월\n\n' +
      '판매실적을 여러 달 받아두셨는데 0개월로 나온다면,\n' +
      '한 기간으로 통째로 받으신 것입니다 — 달마다 한 줄이어야 셉니다.\n' +
      '[🔄 데이터 갱신 → 판매실적 수집]에 여러 달을 넣으면 달 단위로 나눠 받습니다.',
      ui_().ButtonSet.OK);
    return;
  }

  var series = [];
  for (var i = 0; i < keys.length; i++) {
    series.push({ mon: keys[i], qty: agg.months[keys[i]].qty, amt: agg.months[keys[i]].amt });
  }

  var si = seasonIndex_(series);
  var cool = seasonCoolRatio_();

  // 달별 평균 실적 (지수와 별개로, 절대 규모를 보려고)
  var mq = [], ma = [];
  for (var z = 0; z < 12; z++) { mq.push([]); ma.push([]); }
  for (var s = 0; s < series.length; s++) {
    var mo = Number(series[s].mon.substring(5, 7)) - 1;
    mq[mo].push(series[s].qty); ma[mo].push(series[s].amt);
  }
  var avg = function (arr) {
    if (!arr.length) return '';
    var t = 0;
    for (var i2 = 0; i2 < arr.length; i2++) t += arr[i2];
    return Math.round(t / arr.length);
  };

  // 사입 안내: 성수기 두 달 전이 '슬슬 사와야 하는 달'이다.
  // 정확한 리드타임은 모르므로 '준비'라고만 적는다.
  var prep = {};
  for (var h = 0; h < 12; h++) {
    if (si.idx[h] !== null && si.idx[h] >= SEASON_HIGH) {
      prep[(h + 10) % 12] = (prep[(h + 10) % 12] || []).concat([MONTH_NAME[h]]);
    }
  }

  var rows = [];
  for (var m2 = 0; m2 < 12; m2++) {
    var note = '';
    if (prep[m2]) note = prep[m2].join('·') + ' 성수기 준비 — 사입을 시작할 달';
    if (cool[m2] !== null && cool[m2] >= 0.5) {
      note = (note ? note + ' / ' : '') + '작년 이 달은 절반 넘게 냉장으로 나갔습니다';
    }
    rows.push([
      MONTH_NAME[m2],
      si.idx[m2] === null ? '' : Number(si.idx[m2].toFixed(3)),
      seasonVerdict_(si.idx[m2], si.n[m2], (si.edgeByMonth || [])[m2] || 0),
      si.n[m2] || '',
      avg(mq[m2]), avg(ma[m2]),
      cool[m2] === null ? '' : cool[m2],
      note
    ]);
  }

  // SKU별 성수기
  var skuRows = seasonSkuRows_(agg.skuMon, si.idx);

  writeSeason_(rows, skuRows, series, si, agg);

  var hi = [], lo = [];
  for (var q = 0; q < 12; q++) {
    if (si.idx[q] === null) continue;
    if (si.idx[q] >= SEASON_HIGH) hi.push(MONTH_NAME[q] + ' ' + si.idx[q].toFixed(2));
    if (si.idx[q] <= SEASON_LOW) lo.push(MONTH_NAME[q] + ' ' + si.idx[q].toFixed(2));
  }
  var coolMon = [];
  for (var r = 0; r < 12; r++) if (cool[r] !== null && cool[r] >= 0.5) coolMon.push(MONTH_NAME[r]);

  var msg = agg.source + ' ' + series.length + '개월 · 지수 ' + si.points + '점';
  log_('season', 'INFO', msg);

  showSheet_(SHEET_SEASON);
  ui_().alert('계절성 — ' + SHEET_SEASON + ' 탭',
    '자료: ' + agg.source + ' ' + series[0].mon + ' ~ ' +
      series[series.length - 1].mon + ' (' + series.length + '개월)\n' +
    '   달 수가 많은 쪽을 씁니다 — ' + agg.other + '은 ' + agg.otherN + '개월이라 안 썼습니다.\n' +
    '   필요한 것은 SKU마다 18개월이 아니라 "계정 전체가 몇 달 있는가"입니다.\n\n' +
    (si.points === 0
      ? '■ 계절지수를 낼 수 없습니다\n' +
        '   중심 12개월 이동평균은 앞뒤로 6개월씩을 먹습니다.\n' +
        '   최소 13개월이 있어야 지수가 한 점 나옵니다 (지금 ' + series.length + '개월).\n\n' +
        '   지금은 월별 합계만 표에 적었습니다.\n\n'
      : '■ 계절지수 (1.00 = 평상시)\n' +
        (hi.length ? '   ▲ 성수기 : ' + hi.join(' · ') + '\n' : '   ▲ 성수기로 볼 달이 없습니다\n') +
        (lo.length ? '   ▼ 비수기 : ' + lo.join(' · ') + '\n' : '') +
        '   관측 ' + si.points + '점 — 1점뿐인 달은 "잠정"으로 적었습니다.\n' +
        (si.edge
          ? '   그중 ' + si.edge + '점은 자료 양 끝 6개월이라 추세를 늘려 냈습니다.\n' +
            '   ("끝자락 추정" 표시 — 한 해 더 쌓이면 저절로 없어집니다)\n'
          : '') +
        '\n   성장과 계절을 갈라내려고 이동평균 대비 비율을 씁니다.\n' +
        '   작년 대비 +30%는 장사가 커진 것일 수도 있어 그대로 못 씁니다.\n\n') +
    (coolMon.length
      ? '■ 냉장 (실제로 냉장으로 나간 비율)\n' +
        '   절반 넘게 냉장이던 달: ' + coolMon.join(' · ') + '\n' +
        '   기온 자료가 아니라 청구서에 찍힌 실적입니다.\n' +
        '   이 달들의 앞뒤가 냉장 전환·해제를 정할 자리입니다.\n\n'
      : '■ 냉장 자료가 없습니다 (청구서를 먼저 받으세요)\n\n') +
    (skuRows.length
      ? '■ SKU별 성수기 : ' + skuRows.length + '개\n' +
        '   연간 ' + SEASON_SKU_MIN_QTY + '개 미만은 뺐습니다 — 어느 달에 팔렸는지가 우연입니다.\n\n'
      : '') +
    '※ 사입 안내는 성수기 두 달 전을 짚습니다.\n' +
    '   리드타임은 모르므로 "준비할 달"로만 적었습니다 — 실제 조달 기간에 맞춰 당기세요.',
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * SKU별로 어느 달이 성수기인가.
 * 전체 지수로 나눠 '계정 전체가 잘 팔리는 달'의 효과를 뺀다 —
 * 안 그러면 모든 SKU의 성수기가 계정 성수기와 같아진다.
 */
function seasonSkuRows_(skuMon, allIdx) {
  var jp = {}, kr = {};
  var ls = ss_().getSheetByName(SHEET_LISTING);
  if (ls && ls.getLastRow() > 1) {
    var lv = ls.getRange(2, 1, ls.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      var k = String(lv[i][L_SKU] || '').trim();
      if (!k) continue;
      jp[k] = lv[i][L_JP]; kr[k] = lv[i][L_KR];
    }
  }

  var out = [];
  for (var sku in skuMon) {
    var byMo = [], total = 0;
    for (var m = 0; m < 12; m++) byMo.push({ sum: 0, n: 0 });
    for (var mon in skuMon[sku]) {
      var mo = Number(mon.substring(5, 7)) - 1;
      if (!(mo >= 0 && mo < 12)) continue;
      byMo[mo].sum += skuMon[sku][mon];
      byMo[mo].n++;
      total += skuMon[sku][mon];
    }
    if (total < SEASON_SKU_MIN_QTY) continue;

    // 달별 평균을, 계정 전체 지수로 나눠 보정한다
    var adj = [], have = 0, sumAdj = 0;
    for (var t = 0; t < 12; t++) {
      if (!byMo[t].n) { adj.push(null); continue; }
      var a = byMo[t].sum / byMo[t].n;
      if (allIdx[t] && allIdx[t] > 0) a = a / allIdx[t];
      adj.push(a); have++; sumAdj += a;
    }
    if (have < 6) continue;                    // 반년도 안 되면 성수기를 못 고른다
    var mean = sumAdj / have;
    if (!(mean > 0)) continue;

    var best = -1, worst = -1, bestV = -1, worstV = 1e18;
    for (var u = 0; u < 12; u++) {
      if (adj[u] === null) continue;
      var r = adj[u] / mean;
      if (r > bestV) { bestV = r; best = u; }
      if (r < worstV) { worstV = r; worst = u; }
    }
    if (best < 0) continue;

    out.push([
      sku, jp[sku] || '', kr[sku] || '',
      MONTH_NAME[best], Number(bestV.toFixed(2)),
      worst >= 0 ? MONTH_NAME[worst] : '',
      Math.round(total),
      bestV >= SEASON_HIGH ? '▲ 뚜렷' : '· 평평 (계절 타지 않음)'
    ]);
  }

  // 뚜렷한 것부터, 그 안에서 물량 큰 순
  out.sort(function (a, b) {
    var d = b[4] - a[4];
    if (Math.abs(d) > 0.001) return d;
    return b[6] - a[6];
  });
  return out.slice(0, SEASON_SKU_TOP);
}

function writeSeason_(rows, skuRows, series, si, agg) {
  var sh = ensureSheet_(SHEET_SEASON, SEASON_HEADER);
  sh.clear();

  sh.getRange(1, 1).setValue(
    '[' + ((agg && agg.source) || '주문') + ' ' + series[0].mon + ' ~ ' +
    series[series.length - 1].mon + ']  ' +
    series.length + '개월  ·  계절지수 관측 ' + si.points + '점' +
    (si.edge ? ' (끝자락 ' + si.edge + '점)' : '') +
    (si.points === 0 ? '  (13개월이 있어야 지수가 나옵니다)' : '') +
    '   |   1.00 = 평상시 · 이동평균 대비 비율(성장 제거)')
    .setFontWeight('bold');

  sh.getRange(2, 1, 1, SEASON_HEADER.length).setValues([SEASON_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.getRange(3, 1, rows.length, SEASON_HEADER.length).setValues(rows);

  sh.setFrozenRows(2);
  sh.getRange(3, SN_IDX + 1, 12, 1).setNumberFormat('0.00');
  sh.getRange(3, SN_QTY + 1, 12, 2).setNumberFormat('#,##0');
  sh.getRange(3, SN_COOL + 1, 12, 1).setNumberFormat('0%');

  var bg = [];
  for (var i = 0; i < rows.length; i++) {
    var v = rows[i][SN_IDX];
    bg.push([v === '' ? '#ffffff'
           : v >= SEASON_HIGH ? '#e6f4ea' : v <= SEASON_LOW ? '#fce8e6' : '#ffffff']);
  }
  sh.getRange(3, SN_IDX + 1, rows.length, 1).setBackgrounds(bg);
  sh.getRange(3, SN_VERDICT + 1, rows.length, 1).setBackgrounds(bg);

  headerNotes_(sh, 2, SEASON_HEADER, {
    '계절지수': '1.00 = 평상시. 1.30 이면 그 달은 평상시보다 30% 더 팔립니다.\n' +
                '중심 12개월 이동평균으로 나눠 성장분을 뺀 값입니다.',
    '관측 횟수': '그 달의 지수를 몇 번의 관측으로 냈는가.\n' +
                 '1이면 우연과 구별이 안 되므로 "잠정"으로 적습니다.',
    '냉장 비율': '그 달에 실제로 냉장으로 나간 출고의 비율 (청구서 기준).\n' +
                 '기온 자료가 아니라 작년에 내가 한 일입니다.',
    '사입 안내': '성수기 두 달 전을 짚습니다. 리드타임은 모르므로 실제 조달 기간에 맞춰 당기세요.'
  });

  var at = 3 + rows.length + 2;

  // SKU별 성수기 — 같은 탭 아래에 둔다. 탭을 늘리는 것보다 한눈에 본다
  if (skuRows.length) {
    sh.getRange(at, 1).setValue('SKU별 성수기 (연간 ' + SEASON_SKU_MIN_QTY +
      '개 이상 · 계정 전체 계절성을 뺀 값 · 상위 ' + SEASON_SKU_TOP + '개)')
      .setFontWeight('bold').setBackground('#eceff1');
    at++;
    sh.getRange(at, 1, 1, SEASON_SKU_HEADER.length).setValues([SEASON_SKU_HEADER])
      .setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff');
    at++;
    sh.getRange(at, 1, skuRows.length, SEASON_SKU_HEADER.length).setValues(skuRows);
    sh.getRange(at, 5, skuRows.length, 1).setNumberFormat('0.00');
    sh.getRange(at, 7, skuRows.length, 1).setNumberFormat('#,##0');
    at += skuRows.length + 2;
  }

  writeLegend_(sh, at, [
    ['이 표를 어떻게 읽나', ''],
    ['계절지수 1.00',
     '그 달은 평상시만큼 팔린다는 뜻입니다. 1.30이면 30% 더, 0.70이면 30% 덜.'],
    ['왜 작년 같은 달과 직접 비교하지 않나',
     '작년 8월 대비 +30%라고 8월이 성수기인 것은 아닙니다. 장사가 커졌으면 모든 달이 오릅니다. ' +
     '중심 12개월 이동평균으로 나누면 계절 성분이 상쇄되고 추세만 남아, ' +
     '그걸로 나눠 성장을 뺍니다.'],
    ['"잠정"이 붙은 달',
     '관측이 한 번뿐입니다. 한 해의 특이한 일(품절·이벤트)이 그대로 지수가 됐을 수 있습니다. ' +
     '한 해 더 쌓이면 저절로 없어집니다.'],
    ['"끝자락 추정"',
     '자료 양 끝 6개월은 앞뒤가 모자라 이동평균을 못 냅니다. 버리면 18개월을 받아도 ' +
     '가운데 6개월만 남으므로, 계산된 추세의 기울기로 늘려 채웁니다. ' +
     '가운데 구간보다 약한 값이니 참고로만 보세요 — 한 해 더 쌓이면 없어집니다.'],
    ['"자료 부족"',
     '그 달의 자료가 아예 없습니다. 받아둔 기간에 그 달이 안 들어 있는 경우입니다.'],
    ['몇 달이 있어야 하나',
     'SKU마다 18개월이 필요한 게 아니라, 계정 전체 월 수입니다. ' +
     '13개월이면 지수가 나오기 시작하고, 24개월이면 달마다 두 번씩 관측됩니다.'],
    ['어느 자료를 보나',
     '주문 탭과 판매실적(달 단위로 받은 것) 중 달 수가 많은 쪽을 씁니다. ' +
     '섞지 않습니다 — 같은 달을 양쪽에서 가져오면 두 배가 됩니다.'],
    ['냉장 비율',
     '기온이 아니라 청구서에 찍힌 실적입니다 — 작년에 내가 몇 월부터 냉장으로 보냈는가. ' +
     '이 달들의 앞뒤가 전환·해제를 정할 자리입니다.'],
    ['SKU별 성수기 "평평"',
     '그 SKU는 계절을 타지 않고, 계정 전체 흐름을 따라갈 뿐입니다. 사입을 앞당길 이유가 없습니다.'],
    ['사입 안내',
     '성수기 두 달 전을 짚습니다. 조달이 더 걸리면 그만큼 더 당기세요 — ' +
     '리드타임은 이 시트가 모릅니다.']
  ]);

  sh.setColumnWidth(SN_NOTE + 1, 380);
  sh.getRange(3, SN_NOTE + 1, 12, 1).setWrap(true);
}
