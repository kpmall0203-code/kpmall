/**
 * 72L_검색어.gs — 자동 캠페인이 물어온 검색어 (spSearchTerm)
 *
 * ── 이 단계가 하는 일 ───────────────────────────────────
 * 자동 캠페인은 아마존이 알아서 검색어를 고른다. 그중에는 잘 팔리는 것과
 * 클릭만 먹고 안 팔리는 것이 섞여 있다. 그 둘을 갈라서
 *   팔리는 검색어 → 수동 정확 일치 키워드로 올린다 (값을 정확히 매길 수 있다)
 *   안 팔리는 검색어 → 부정 키워드로 막는다 (돈이 새는 것을 잠근다)
 * 이 갈라내기가 '자동으로 찾아 수동으로 굳힌다'는 사다리의 가운데 칸이다.
 *
 * ── 판정 기준을 어디서 가져오는가 ───────────────────────
 * 광고 이력에서 뽑은 CVR 을 쓰지 않는다. 그 자료는 '제대로 안 돌린 광고'의
 * 기록이라 기준으로 삼으면 그 상태를 되풀이한다. 대신 채산성에서 뽑는다:
 *
 *   손익분기 CPA = 객단가 × 마진율          (주문 하나에 낼 수 있는 최대)
 *   필요 CVR     = 그 검색어 CPC ÷ 손익분기 CPA   (본전 되려면 필요한 전환율)
 *   N(판정 최소 클릭 수) = 3 ÷ 필요 CVR      (주문 3건이 나왔어야 할 클릭 수)
 *
 * N 만큼 클릭했는데 주문이 0이면 우연이 아니다. 그때 막는다.
 * 이 정의의 좋은 점은 판정 비용이 CPC 와 무관하게 '손익분기 주문 3건어치'로
 * 일정하다는 것이다 — 비싼 클릭이면 적게, 싼 클릭이면 많이 사면 된다.
 *
 * 여기서는 아무것도 바꾸지 않는다. 받아서 판정만 적는다.
 */

var SHEET_ADTERM = '광고검색어';
var ADTERM_HEADER = [
  '기간시작', '기간종료', '잠정', '캠페인', '광고그룹', '검색어', '겨냥',
  'SKU', 'ASIN', '노출', '클릭', '광고비(JPY)', '광고매출(JPY)', '주문',
  'CTR', 'CVR', 'CPC(JPY)', 'ACOS',
  '손익분기CPA(JPY)', '필요CVR', 'N(판정최소클릭)', '판정', '사유',
  '캠페인ID', '광고그룹ID', '수집일시', '승인', '반영결과'
];
// 0부터 세는 자리. 뒤의 둘은 사람이 채우는 칸이라 수집이 덮어쓰면 안 된다
var AT_FROM = 0, AT_TO = 1, AT_TERM = 5, AT_CLICKS = 10, AT_COST = 11,
    AT_ORDERS = 13, AT_CVR = 15, AT_CPC = 16, AT_BECPA = 18,
    AT_VERDICT = 21, AT_WHY = 22, AT_CID = 23, AT_GID = 24,
    AT_APPROVE = 26, AT_APPLIED = 27;
var ADTERM_ID_COLS = [24, 25];

var ADTERM_REPORT_TYPE = 'spSearchTerm';
var PROP_ADTERM_QUEUE = 'ADTERM_QUEUE';
var PROP_ADTERM_REPORT = 'ADTERM_REPORT_ID';
var PROP_ADTERM_LEVEL = 'ADTERM_COL_LEVEL';
var ADTERM_CONTINUE_HANDLER = 'continueAdTerms';
var ADTERM_WEEKS_DEFAULT = 2;      // 한 번에 받을 주 수. 이미 받은 주는 다시 안 받는다
var ADTERM_KEEP_WEEKS = 8;         // 주간 원본 보관. 한 주 1만 줄 × 12칸 — 8주면 셀 100만
var ADTERM_REPORT_WAIT_MS = 90 * 1000;   // 한 실행에서 리포트를 기다리는 최대. 넘으면 1분 뒤 다시
var ADTERM_ROLLUP = 'ROLLUP';      // 큐의 마지막 항목 — 원본을 합쳐 판정한다

/**
 * 주간 원본. 받은 그대로 덧붙이기만 한다 — 절대 통째로 다시 쓰지 않는다.
 * 처음엔 판정 표 하나에 주마다 1만 줄을 얹고 매번 전체를 정렬해 다시 썼다.
 * 4주가 되니 123만 셀을 주마다 다시 쓰는 꼴이 됐고, 그것이 타임아웃이었다.
 */
var SHEET_ADTERM_RAW = '광고검색어주간';
var ADTERM_RAW_HEADER = ['기간시작', '기간종료', '캠페인ID', '광고그룹ID', '검색어', '겨냥',
                         '노출', '클릭', '광고비(JPY)', '광고매출(JPY)', '주문', '수집일시'];
var AR_FROM = 0, AR_TO = 1, AR_CID = 2, AR_GID = 3, AR_TERM = 4, AR_MATCH = 5,
    AR_IM = 6, AR_CLICKS = 7, AR_COST = 8, AR_SALES = 9, AR_ORDERS = 10, AR_AT = 11;
var ADTERM_JUDGE_ORDERS = 3;      // 판정에 필요한 손익분기 주문 수
var ADTERM_PROMOTE_ORDERS = 2;    // 이만큼 팔렸으면 표본이 작아도 올린다

var ADTERM_COLS = ['searchTerm', 'campaignId', 'adGroupId',
                   'impressions', 'clicks', 'cost', 'purchases14d', 'sales14d'];
/** 있으면 좋은 칸. 거절당하면 한 단계씩 줄인다 — 이름은 광고구조에서 붙일 수 있다 */
var ADTERM_LEVEL_COLS = [
  ['campaignName', 'adGroupName', 'keyword', 'matchType'],
  ['campaignName', 'keyword'],
  []
];

/** 리포트 요청 (칸 이름이 거절당하면 줄여서 재시도) */
function adTermReport_(token, from, to) {
  var props = PropertiesService.getScriptProperties();
  var mk = function (level) {
    return { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['searchTerm'],
             columns: ADTERM_COLS.concat(ADTERM_LEVEL_COLS[level]),
             reportTypeId: ADTERM_REPORT_TYPE, timeUnit: 'SUMMARY', format: 'GZIP_JSON' };
  };
  var start = parseInt(props.getProperty(PROP_ADTERM_LEVEL) || '', 10);
  if (!(start >= 0 && start < ADTERM_LEVEL_COLS.length)) start = 0;
  for (var lv = start; lv < ADTERM_LEVEL_COLS.length; lv++) {
    try {
      var r = adsRunReport_(token, PROP_ADTERM_REPORT, mk(lv), from, to, '검색어');
      if (lv !== start) props.setProperty(PROP_ADTERM_LEVEL, String(lv));
      return r;
    } catch (e) {
      var msg = String(e);
      var isColumn = /column|metric|field/i.test(msg) && !/groupBy/i.test(msg);
      if (!isColumn || lv === ADTERM_LEVEL_COLS.length - 1) throw e;
      props.deleteProperty(PROP_ADTERM_REPORT);
      log_('ads', 'WARN', '검색어 리포트 칸을 줄여 재시도 — ' + msg.substring(0, 130));
    }
  }
  throw new Error('검색어 리포트를 요청하지 못했습니다.');
}

/** 광고그룹ID → 그 그룹이 광고하는 SKU 들의 채산성 (가장 빡빡한 것에 맞춘다) */
/**
 * 광고그룹마다 '이 그룹의 검색어를 판정할 채산성' 을 만든다.
 *
 * 광고그룹에 어떤 SKU 가 들었는지는 두 곳에서 온다:
 *   ① 광고상품 — 아마존에 물어 본 것. 다만 그룹당 앞의 몇 개만 떠 본 표본이라 성기다.
 *   ② 광고생성계획 — 우리가 만든 캠페인. 무엇을 넣었는지 우리가 정확히 안다.
 * ② 를 얹지 않으면 우리가 만든 여든여섯 개가 전부 '판정 안 함' 으로 떨어진다.
 *
 * 한 그룹의 검색어는 그 그룹 SKU 전부에 걸리므로, 손익분기 CPA 는
 * 가장 낮은 SKU 를 따른다 — 그것을 넘기면 그 SKU 는 팔수록 손해다.
 */
function adTermEconomics_() {
  var out = {};
  var byGroup = adGroupSkus_();          // ① 72J — 광고상품 표본
  var rec = {}, be = {}, asin = {};
  var sh = ss_().getSheetByName(SHEET_REALLOC);
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, REALLOC_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var sku = String(v[i][0] || '').trim();
      if (!sku) continue;
      if (Number(v[i][10]) > 0) be[sku] = Number(v[i][10]);   // 손익분기 CPA
      if (Number(v[i][11]) > 0) rec[sku] = Number(v[i][11]);
      if (v[i][20]) asin[sku] = String(v[i][20]);
    }
  }

  // ② 우리가 만든 캠페인 — 넣은 SKU 를 그대로 얹는다
  var pl = ss_().getSheetByName(SHEET_ADPLAN);
  if (pl && pl.getLastRow() > 1) {
    var pv = pl.getRange(2, 1, pl.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
    for (var p = 0; p < pv.length; p++) {
      if (String(pv[p][AP_RESULT - 1]).indexOf('성공') !== 0) continue;
      var gd2 = String(pv[p][AP_GID - 1] || '').trim();
      if (!gd2) continue;
      var list = String(pv[p][AP_SKUS - 1] || '').split(',');
      var box = (byGroup[gd2] || (byGroup[gd2] = []));
      for (var q = 0; q < list.length; q++) {
        var sk2 = list[q].trim();
        // '외 5개' 같은 꼬리는 SKU 가 아니다 — 재배분 표에 있는 이름만 받는다
        if (sk2 && be[sk2] > 0 && box.indexOf(sk2) < 0) box.push(sk2);
      }
    }
  }

  for (var gd in byGroup) {
    var mem = byGroup[gd], lo = 0, skus = [], asins = [];
    for (var m = 0; m < mem.length; m++) {
      if (skus.indexOf(mem[m]) >= 0) continue;
      skus.push(mem[m]);
      if (asin[mem[m]]) asins.push(asin[mem[m]]);
      if (be[mem[m]] > 0 && (!lo || be[mem[m]] < lo)) lo = be[mem[m]];
    }
    out[gd] = { beCpa: lo, skus: skus, asins: asins };
  }
  return out;
}

/**
 * 광고그룹의 채산성을 그 그룹이 실제로 판 실적에서 뽑는다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 채산성은 원래 SKU 마다 안다 (광고 재배분). 그런데 옛 캠페인은 한 광고그룹에
 * 수천 SKU 가 들어 있는 '몰아넣기' 구조라 어떤 SKU 가 그 검색어에 걸렸는지 알 수 없다.
 * 실제로 첫 수집에서 검색어 스물두만 줄이 전부 '판정 안 함' 으로 나왔다 —
 * 나온 광고그룹 열여섯 개 중 열둘이 우리가 SKU 를 아는 그룹이 아니었다.
 *
 * ── 어떻게 푸나 ─────────────────────────────────────────
 * 어떤 SKU 인지는 몰라도, 그 그룹이 얼마짜리를 팔았는지는 리포트가 말해 준다.
 *
 *     객단가      = 광고매출 ÷ 주문         (그 그룹이 실제로 판 값)
 *     손익분기CPA = 객단가 × 마진율          (한 건 팔아 남는 돈)
 *
 * 추정이 아니라 그 그룹이 실제로 낸 숫자다. SKU 별로 아는 쪽이 언제나 낫지만,
 * 모를 때 '판정 안 함' 으로 버리는 것보다는 이쪽이 훨씬 쓸모 있다.
 * 주문이 없는 그룹은 객단가를 모르므로 여전히 판정하지 않는다 — 지어내지 않는다.
 */
function adTermGroupBasis_(rep, margin) {
  var g = {};
  for (var i = 0; i < rep.length; i++) {
    var gd = String(rep[i].adGroupId || '');
    if (!gd) continue;
    var a = g[gd] || (g[gd] = { sales: 0, orders: 0 });
    a.sales += Number(rep[i].sales14d) || 0;
    a.orders += Number(rep[i].purchases14d) || 0;
  }
  var out = {};
  for (var k in g) {
    if (!(g[k].orders > 0) || !(g[k].sales > 0)) continue;
    out[k] = { aov: g[k].sales / g[k].orders,
               beCpa: (g[k].sales / g[k].orders) * margin };
  }
  return out;
}

/**
 * 이미 부정으로 막아둔 검색어 (그 그룹에서) — 두 번 올리지 않으려고 본다.
 * 광고구조 시트에서 읽는다. 처음엔 여기서 API 로 계정의 부정 키워드를 전부 받았는데,
 * 검색어를 한 주 판정할 때마다 그 짓을 되풀이했다. 수집은 [광고 구조 수집] 이 하고
 * 여기서는 시트만 본다 — 실행 단계에서 API 를 읽지 않는다.
 */
function adTermNegatives_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][7]) !== ADSTRUCT_KIND_NEG) continue;
    var gd = String(v[i][14] || '').trim();
    var t = String(v[i][8] || '').trim().toLowerCase();
    if (gd && t) (out[gd] || (out[gd] = {}))[t] = true;
  }
  return out;
}

/** 이미 올려둔(수동) 키워드 — 같은 것을 또 올리지 않으려고 본다 */
function adTermExistingKw_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][7]) !== '키워드') continue;
    var t = String(v[i][8] || '').trim().toLowerCase();
    if (t) out[t] = true;
  }
  return out;
}

// ── 판정 ────────────────────────────────────────────────

/** 검색어 한 줄을 판정한다 */
function adTermVerdict_(o, basis) {
  var lim = Number(basis['목표 ACOS 비율']) || 0.65;
  if (!(o.beCpa > 0)) {
    return { v: '판정 안 함',
             why: '이 광고그룹의 채산성을 모릅니다 — SKU 도 모르고, 이 기간에 판 것도 없습니다' };
  }
  // 근거가 SKU 인지 그룹 실적인지는 사유에 남긴다. 뒤의 것은 한 단계 무른 근거다
  var src = o.src === 'group' ? ' [그룹 실적 기준]' : '';
  var cpc = o.clicks > 0 ? o.cost / o.clicks : 0;
  // 지금 이 값에 사려면 필요한 전환율. 못 넘으면 팔수록 손해다
  var needCvr = cpc > 0 ? cpc / o.beCpa : 0;
  var N = needCvr > 0 ? Math.ceil(ADTERM_JUDGE_ORDERS / needCvr) : 0;
  var cvr = o.clicks > 0 ? o.orders / o.clicks : 0;

  if (o.orders >= ADTERM_PROMOTE_ORDERS) {
    return { v: '승격', why: '주문 ' + o.orders + '건 — 표본이 작아도 우연으로 보기 어렵습니다' + src,
             cpc: cpc, needCvr: needCvr, N: N };
  }
  if (o.orders >= 1 && cvr >= needCvr) {
    return { v: '승격', why: '전환율 ' + pct1_(cvr) + ' ≥ 필요 ' + pct1_(needCvr) + src,
             cpc: cpc, needCvr: needCvr, N: N };
  }
  if (o.orders === 0 && N > 0 && o.clicks >= N) {
    return { v: '부정', why: '클릭 ' + o.clicks + '회(판정선 ' + N + ') 인데 주문 0' + src,
             cpc: cpc, needCvr: needCvr, N: N };
  }
  /**
   * 클릭 수가 아니라 쓴 돈으로 보는 갈래.
   *
   * 처음에는 '손익분기 주문 두 건어치'로 뒀는데, N × CPC = 손익분기CPA × 3 이므로
   * 두 건어치는 언제나 N 의 3분의 2 지점이다. 그러면 이 규칙이 항상 먼저 걸려
   * 클릭 규칙이 죽고, 판정선이 통계로 정한 자리보다 앞당겨진다.
   * 그래서 같은 3건어치로 맞춘다 — 두 규칙이 같은 자리를 가리키고,
   * 이쪽은 기간 안에서 CPC 가 오르내려 클릭 수와 금액이 어긋날 때를 받아 준다.
   */
  if (o.orders === 0 && o.cost >= o.beCpa * ADTERM_JUDGE_ORDERS) {
    return { v: '부정',
             why: '광고비 ' + Math.round(o.cost) + '엔(손익분기 주문 ' +
                  ADTERM_JUDGE_ORDERS + '건어치) 쓰고 주문 0',
             cpc: cpc, needCvr: needCvr, N: N };
  }
  if (o.orders === 0) {
    return { v: '더 봄', why: '클릭 ' + o.clicks + '회 — 판정선 ' + (N || '?') + ' 에 못 미칩니다' + src,
             cpc: cpc, needCvr: needCvr, N: N };
  }
  return { v: '더 봄', why: '전환율 ' + pct1_(cvr) + ' < 필요 ' + pct1_(needCvr) + ' — 표본을 더 봅니다' + src,
           cpc: cpc, needCvr: needCvr, N: N };
}

// ── 주간 원본 쓰기 (덧붙이기만) ─────────────────────────

/** 원본 표에서 기간별로 몇 줄째부터 몇 줄인지 (A·B 두 칸만 읽는다 — 싸다) */
function adTermRawBlocks_(sh) {
  var n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  var v = sh.getRange(2, 1, n, 2).getValues();
  for (var i = 0; i < v.length; i++) {
    var f = v[i][0] instanceof Date ? ymd_(v[i][0]) : String(v[i][0]);
    var t = v[i][1] instanceof Date ? ymd_(v[i][1]) : String(v[i][1]);
    var k = f + '|' + t;
    if (!out[k]) out[k] = { start: i + 2, n: 0, from: f, to: t };
    out[k].n++;
  }
  return out;
}

/**
 * 한 주치를 덧붙인다. 같은 주가 이미 있으면 그 덩어리만 지우고, 보관 기간을 넘긴 주도 지운다.
 * 덩어리 단위로만 지우므로 지운 뒤에도 나머지는 붙어 있다.
 */
function adTermRawAppend_(rows, from, to) {
  var sh = ensureSheet_(SHEET_ADTERM_RAW, ADTERM_RAW_HEADER);
  var blocks = adTermRawBlocks_(sh);
  var oldest = addDays_(ymd_(new Date()), -7 * ADTERM_KEEP_WEEKS);
  // 아래쪽부터 지워야 위 덩어리의 줄 번호가 안 흔들린다
  var kill = [];
  for (var k in blocks) {
    if (k === from + '|' + to || blocks[k].from < oldest) kill.push(blocks[k]);
  }
  kill.sort(function (x, y) { return y.start - x.start; });
  for (var d = 0; d < kill.length; d++) sh.deleteRows(kill[d].start, kill[d].n);

  if (!rows.length) return 0;
  fitRows_(SHEET_ADTERM_RAW, ADTERM_RAW_HEADER, rows);
  var at = sh.getLastRow() + 1;
  var need = at + rows.length - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(at, AR_CID + 1, rows.length, 2).setNumberFormat('@');
  var CH = 2000;
  for (var i = 0; i < rows.length; i += CH) {
    var part = rows.slice(i, i + CH);
    sh.getRange(at + i, 1, part.length, ADTERM_RAW_HEADER.length).setValues(part);
  }
  return rows.length;
}

/** 원본 표에 이미 있는 주 */
function adTermRawWeeks_() {
  var sh = ss_().getSheetByName(SHEET_ADTERM_RAW);
  if (!sh || sh.getLastRow() < 2) return {};
  return adTermRawBlocks_(sh);
}

// ── 메뉴 · 이어달리기 ───────────────────────────────────

/** 메뉴: 검색어 수집 */
function fetchAdSearchTerms() {
  if (!adBusyGuard_('검색어 수집')) return;
  if (adResumeIfQueued_('검색어 수집', PROP_ADTERM_QUEUE, adTermStepLocked_)) return;
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_ADS_PROFILE)) adsPickProfile_();
  if (!ss_().getSheetByName(SHEET_REALLOC)) {
    throw new Error('"' + SHEET_REALLOC + '" 이 없습니다.\n' +
      '판정에 손익분기 CPA 가 필요합니다 — [📣 광고 → ② 광고 재배분 계산]을 먼저 실행하세요.');
  }
  var have = adTermRawWeeks_();
  var nHave = Object.keys(have).length;
  var wins = adAskWeeks_('검색어 수집',
    '자동 캠페인이 어떤 검색어로 노출·클릭·판매됐는지 주 단위로 받습니다.\n' +
    '받은 주는 원본(' + SHEET_ADTERM_RAW + ')에 쌓이고, 끝나면 최근 ' + ADTERM_KEEP_WEEKS +
    '주를 합쳐 검색어마다 한 줄로 판정합니다 — 클릭이 주를 넘어 쌓여야 판정선에 닿습니다.\n' +
    (nHave ? '이미 받아 둔 주 ' + nHave + '개는 건너뜁니다.' : ''),
    ADTERM_WEEKS_DEFAULT, ADTERM_KEEP_WEEKS);
  if (!wins) return;
  // 이미 있는 주는 다시 안 받는다 — 한 주에 1만 줄이다
  var todo = wins.filter(function (w) { return !have[w]; });
  todo.push(ADTERM_ROLLUP);
  props.setProperty(PROP_ADTERM_QUEUE, JSON.stringify(todo));
  toast_('받을 주 ' + (todo.length - 1) + '개' + (todo.length === 1 ? ' — 바로 판정만 다시 합니다' : ''));
  adTermStepLocked_(true);
}

/** 메뉴: 검색어 판정 다시 계산 (원본은 그대로, 합치기·판정만) */
function rollupAdTerms() {
  if (!adBusyGuard_('검색어 판정')) return;
  if (!ss_().getSheetByName(SHEET_ADTERM_RAW)) {
    ui_().alert('원본이 없습니다.', '[검색어 수집]을 먼저 하세요.', ui_().ButtonSet.OK);
    return;
  }
  PropertiesService.getScriptProperties().setProperty(PROP_ADTERM_QUEUE, JSON.stringify([ADTERM_ROLLUP]));
  adTermStepLocked_(true);
}

/**
 * 메뉴에서 부른 한 걸음도 잠금을 잡고 돈다.
 * 실제로 같은 주가 두 번 기록됐다 (11:29 · 11:30) — 메뉴 실행과 1분 트리거가 나란히 돈 것이다.
 * adBusyGuard_ 는 들어올 때 한 번 볼 뿐 잡고 있지는 않아서 그 틈이 있었다.
 */
function adTermStepLocked_(interactive) {
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (e) { return adTermStep_(interactive); }
  if (!lock.tryLock(10000)) {
    ui_().alert('검색어 수집 — 지금은 안 됩니다', '다른 작업이 돌고 있습니다. 잠시 뒤 다시 하세요.',
                ui_().ButtonSet.OK);
    return;
  }
  try { return adTermStep_(interactive); } finally { try { lock.releaseLock(); } catch (e2) {} }
}

function continueAdTerms() {
  withLockOrRetry_('검색어 수집', ADTERM_CONTINUE_HANDLER, function () {
    try { adTermStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

function adTermScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADTERM_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ADTERM_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/**
 * 리포트를 잠깐만 기다린다. 한 실행에서 4분을 기다리면 남는 시간에 1만 줄을 못 쓴다.
 * 준비가 안 됐으면 null — 1분 뒤 트리거가 같은 리포트 번호로 이어받는다.
 */
function adTermReportShort_(token, from, to) {
  var saved = ADS_SOFT_MS;
  ADS_SOFT_MS = ADTERM_REPORT_WAIT_MS;
  try { return adTermReport_(token, from, to); }
  finally { ADS_SOFT_MS = saved; }
}

/** 큐의 맨 앞 하나를 처리한다 — 주 하나, 또는 마지막의 합치기 */
function adTermStep_(interactive) {
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_ADTERM_QUEUE) || '[]');
  if (!queue.length) { adTermScheduleContinue_(false); return '완료'; }

  if (queue[0] === ADTERM_ROLLUP) {
    var r = adTermRollup_();
    queue.shift();
    props.setProperty(PROP_ADTERM_QUEUE, JSON.stringify(queue));
    adTermScheduleContinue_(false);
    showSheet_(SHEET_ADTERM);
    log_('ads', 'INFO', '검색어 판정 — ' + r.msg);
    toast_(r.msg);
    if (interactive) {
      ui_().alert('검색어 판정 완료', r.msg + '\n\n' +
        '승격 = 수동 정확 일치로 올릴 검색어\n' +
        '부정 = 클릭만 먹고 안 팔려 막을 검색어\n' +
        '더 봄 = 아직 표본이 모자란 것\n\n' +
        '검색어마다 한 줄이고, 최근 ' + r.weeks + '주가 합쳐진 값입니다.\n' +
        '아직 아무것도 바꾸지 않았습니다 — [검색어 판정 승인]으로 고르세요.', ui_().ButtonSet.OK);
    }
    return r.msg;
  }

  var token = adsToken_();
  var win = queue[0].split('|'), from = win[0], to = win[1];
  toast_('검색어 리포트 요청 중… (' + from + '~' + to + ')');
  var rep = adTermReportShort_(token, from, to);
  if (rep === null) {
    adTermScheduleContinue_(true);
    log_('ads', 'INFO', '검색어 리포트 준비 대기 — 1분 뒤 재시도 (' + from + '~' + to + ')');
    if (interactive) {
      ui_().alert('검색어 수집 — 리포트 준비 중',
        '아마존이 리포트를 만들고 있습니다 (오류 아님).\n\n' +
        '남은 주 ' + (queue.length - 1) + '개\n1분 뒤 자동으로 이어받습니다. 창을 닫아도 됩니다.',
        ui_().ButtonSet.OK);
    }
    return;
  }

  var now = new Date(), rows = [];
  for (var i = 0; i < rep.length; i++) {
    var x = rep[i];
    var term = String(x.searchTerm || '').trim();
    if (!term) continue;
    rows.push([from, to, String(x.campaignId || ''), String(x.adGroupId || ''), term,
               String(x.keyword || x.matchType || ''),
               Number(x.impressions) || 0, Number(x.clicks) || 0,
               Math.round(Number(x.cost) || 0), Math.round(Number(x.sales14d) || 0),
               Number(x.purchases14d) || 0, now]);
  }
  var n = adTermRawAppend_(rows, from, to);

  queue.shift();
  props.setProperty(PROP_ADTERM_QUEUE, JSON.stringify(queue));
  props.deleteProperty(PROP_ADTERM_REPORT);

  var left = queue.length - 1;          // 마지막 ROLLUP 은 주가 아니다
  var msg = from + '~' + to + ' — 검색어 ' + n + '줄 받음' +
            (left > 0 ? ' · 남은 주 ' + left : ' · 다음은 합쳐서 판정');
  log_('ads', 'INFO', '검색어 — ' + msg);
  toast_(msg);
  adTermScheduleContinue_(true);
  if (interactive) {
    ui_().alert('검색어 수집 — 진행 중',
      msg + '\n\n1분 간격으로 자동 진행됩니다. 창을 닫아도 됩니다.', ui_().ButtonSet.OK);
  }
  return msg;
}

// ── 합치기 · 판정 ───────────────────────────────────────

/**
 * 원본 8주를 검색어+광고그룹으로 합쳐 한 줄씩 판정한다.
 *
 * 왜 합치나: 판정선 N 은 보통 200 클릭 안팎이다. 한 주에 그만큼 클릭하는 검색어는 드물어
 * 주 단위로 보면 '더 봄' 만 1만 줄이 나온다 (실제로 부정이 0~1 이었다).
 * 주를 넘어 쌓여야 판정이 선다. "몇 주 지났냐" 가 아니라 "어떤 신호가 먼저 뜨냐" 다.
 *
 * 한 실행에서 하는 일: 원본 읽기(8만×12) · 판정 표 읽기(승인·반영결과 이어붙이려고) ·
 * 판정 표 쓰기(1.5만×28). 주를 받는 걸음과 따로 도니 시간이 넉넉하다.
 */
function adTermRollup_() {
  var raw = ss_().getSheetByName(SHEET_ADTERM_RAW);
  if (!raw || raw.getLastRow() < 2) return { msg: '원본이 비어 있습니다', weeks: 0 };
  var rv = raw.getRange(2, 1, raw.getLastRow() - 1, ADTERM_RAW_HEADER.length).getValues();

  // 검색어+그룹으로 합친다. 그룹 합계도 같이 (SKU 를 모르는 그룹의 채산성용)
  var agg = {}, gsum = {}, weeks = {}, newestTo = '';
  for (var i = 0; i < rv.length; i++) {
    var r = rv[i];
    var gid = String(r[AR_GID] || '').trim(), term = String(r[AR_TERM] || '').trim();
    if (!gid || !term) continue;
    var f = r[AR_FROM] instanceof Date ? ymd_(r[AR_FROM]) : String(r[AR_FROM]);
    var t = r[AR_TO] instanceof Date ? ymd_(r[AR_TO]) : String(r[AR_TO]);
    weeks[f + '|' + t] = true;
    if (t > newestTo) newestTo = t;
    var k = gid + ' ' + term.toLowerCase();
    var a = agg[k] || (agg[k] = { gid: gid, cid: String(r[AR_CID] || ''), term: term,
      match: String(r[AR_MATCH] || ''), im: 0, clicks: 0, cost: 0, sales: 0, orders: 0, from: f, to: t });
    a.im += Number(r[AR_IM]) || 0; a.clicks += Number(r[AR_CLICKS]) || 0;
    a.cost += Number(r[AR_COST]) || 0; a.sales += Number(r[AR_SALES]) || 0;
    a.orders += Number(r[AR_ORDERS]) || 0;
    if (f < a.from) a.from = f;
    if (t > a.to) a.to = t;
    var g = gsum[gid] || (gsum[gid] = { adGroupId: gid, sales14d: 0, purchases14d: 0 });
    g.sales14d += Number(r[AR_SALES]) || 0; g.purchases14d += Number(r[AR_ORDERS]) || 0;
  }
  var nWeeks = Object.keys(weeks).length;
  var prov = newestTo && daysBetween_(newestTo, ymd_(new Date())) < ADKW_PROVISIONAL_DAYS;

  var basis = adBasis_();
  var eco = adTermEconomics_(), negs = adTermNegatives_(), have = adTermExistingKw_();
  var gbase = adTermGroupBasis_(Object.keys(gsum).map(function (k) { return gsum[k]; }),
                                Number(basis['기본 마진율']) || 0.17);
  var gname = {}, cname = {};
  var stSh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (stSh && stSh.getLastRow() > 1) {
    var sv = stSh.getRange(2, 1, stSh.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
    for (var s = 0; s < sv.length; s++) {
      var gd0 = String(sv[s][14] || '');
      if (gd0 && !gname[gd0]) { gname[gd0] = String(sv[s][4]); cname[gd0] = String(sv[s][0]); }
    }
  }

  // 승인 ✓ · 반영결과는 사람이 찍고 기계가 채운 칸 — 다시 만들 때 잃으면 두 번 올린다
  var sh = ensureSheet_(SHEET_ADTERM, ADTERM_HEADER);
  var mark = {};
  if (sh.getLastRow() > 1) {
    var pv = sh.getRange(2, 1, sh.getLastRow() - 1, ADTERM_HEADER.length).getValues();
    for (var m = 0; m < pv.length; m++) {
      var mk = adTermKey_(pv[m]);
      if (mk && (pv[m][AT_APPROVE] || pv[m][AT_APPLIED])) mark[mk] = [pv[m][AT_APPROVE], pv[m][AT_APPLIED]];
    }
  }

  var now = new Date(), rows = [], stat = {};
  for (var k2 in agg) {
    var o0 = agg[k2];
    var e = eco[o0.gid] || { beCpa: 0, skus: [], asins: [] };
    var src = '', beCpa = e.beCpa;
    if (!(beCpa > 0) && gbase[o0.gid]) { beCpa = gbase[o0.gid].beCpa; src = 'group'; }
    var o = { clicks: o0.clicks, cost: o0.cost, orders: o0.orders, beCpa: beCpa, src: src };
    var d = adTermVerdict_(o, basis);
    var low = o0.term.toLowerCase();
    if (d.v === '부정' && negs[o0.gid] && negs[o0.gid][low]) d = { v: '이미 막음', why: '이 그룹에 부정 키워드로 있습니다' };
    if (d.v === '승격' && have[low]) d = { v: '이미 올림', why: '같은 키워드가 이미 있습니다' };
    stat[d.v] = (stat[d.v] || 0) + 1;
    var row = [
      o0.from, o0.to, prov ? '잠정' : '', cname[o0.gid] || '', gname[o0.gid] || '',
      o0.term, o0.match, adSkuText_(e.skus, 3), adSkuText_(e.asins, 3),
      o0.im, o0.clicks, Math.round(o0.cost), Math.round(o0.sales), o0.orders,
      o0.im > 0 ? o0.clicks / o0.im : '', o0.clicks > 0 ? o0.orders / o0.clicks : '',
      d.cpc || '', o0.sales > 0 ? o0.cost / o0.sales : '',
      Math.round(beCpa) || '', d.needCvr || '', d.N || '',
      d.v, d.why, o0.cid, o0.gid, now, '', ''
    ];
    var got = mark[adTermKey_(row)];
    if (got) { row[AT_APPROVE] = got[0]; row[AT_APPLIED] = got[1]; }
    rows.push(row);
  }
  // 판정 순(승격 → 부정 → 더 봄 …), 그 안에서 클릭 많은 것부터
  var rank = { '승격': 0, '부정': 1, '더 봄': 2, '이미 올림': 3, '이미 막음': 4, '판정 안 함': 5 };
  rows.sort(function (a, b) {
    // 승격의 순위가 0 이라 `|| 9` 를 쓰면 맨 뒤로 간다 — 실제로 그랬다
    var ra = rank.hasOwnProperty(a[AT_VERDICT]) ? rank[a[AT_VERDICT]] : 9;
    var rb = rank.hasOwnProperty(b[AT_VERDICT]) ? rank[b[AT_VERDICT]] : 9;
    var d0 = ra - rb;
    return d0 !== 0 ? d0 : (b[AT_CLICKS] || 0) - (a[AT_CLICKS] || 0);
  });

  var need = Math.max(rows.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  for (var c = 0; c < ADTERM_ID_COLS.length; c++) sh.getRange(2, ADTERM_ID_COLS[c], need - 1, 1).setNumberFormat('@');
  writeTable_(sh, ADTERM_HEADER, rows);
  if (rows.length) {
    sh.getRange(2, 15, rows.length, 2).setNumberFormat('0.00%');
    sh.getRange(2, 17, rows.length, 1).setNumberFormat('#,##0.0');
    sh.getRange(2, 18, rows.length, 1).setNumberFormat('0.0%');
    sh.getRange(2, 20, rows.length, 1).setNumberFormat('0.00%');
    sh.getRange(2, AT_APPROVE + 1, rows.length, 1).insertCheckboxes();
  }
  headerNotes_(sh, 1, ADTERM_HEADER, {
    '기간시작': '이 검색어가 원본에 처음 나온 주. 최근 ' + ADTERM_KEEP_WEEKS + '주를 합친 값입니다.',
    '필요CVR': '지금 이 검색어의 CPC 로 본전이 되려면 필요한 전환율.\n= CPC ÷ 손익분기CPA. 광고 이력이 아니라 채산성에서 나온 값이다.',
    'N(판정최소클릭)': '필요CVR 에서 주문 3건이 나왔어야 할 클릭 수.\n이만큼 클릭하고 주문 0이면 우연이 아니다.',
    '판정': '승격 = 수동 정확 일치 키워드로 올릴 것\n부정 = 막을 것\n더 봄 = 아직 표본이 모자람',
    '잠정': '광고매출은 클릭 후 14일까지 붙는다. 이 표시가 있으면 최근 주가 아직 늘어난다.',
    '승인': '체크한 줄만 아마존에 반영한다.\n승격 → 수동 정확 일치 키워드로 올림\n부정 → 부정 정확 일치로 막음',
    '반영결과': '[검색어 승인분 반영]이 채운다. 성공한 줄은 다시 올리지 않는다.'
  });
  var msg = nWeeks + '주 합침 · 검색어 ' + rows.length.toLocaleString() + '개 · ' +
            ['승격', '부정', '더 봄', '판정 안 함'].map(function (k) { return k + ' ' + (stat[k] || 0); }).join(' · ');
  return { msg: msg, weeks: nWeeks, stat: stat };
}

/** 검색어 한 줄을 가리키는 이름표 — 같은 그룹의 같은 검색어는 같은 줄이다 */
function adTermKey_(row) {
  var t = String(row[AT_TERM] == null ? '' : row[AT_TERM]).trim().toLowerCase();
  var g = String(row[AT_GID] == null ? '' : row[AT_GID]).trim();
  return (t && g) ? (g + ' ' + t) : '';
}
