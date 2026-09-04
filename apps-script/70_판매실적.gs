/**
 * 70_판매실적.gs — 판매·트래픽 리포트로 SKU별 실적을 한 번에 받는다
 *
 * ── 왜 Orders API 대신 이걸 쓰는가 ──────────────────────
 * Orders API는 주문 목록을 받은 뒤 주문마다 getOrderItems를 또 불러야 SKU를 안다.
 * 이 호출이 초당 0.5회(건당 2초) 제한이라, 2만 건이면 순수 API 시간만 11시간이다.
 * 하루 자동 실행 한도가 90분이니 일주일 넘게 걸린다.
 *
 * GET_SALES_AND_TRAFFIC_REPORT 는 asinGranularity=SKU 로 요청하면
 * SKU별 판매수량·판매금액을 리포트 한 장에 담아준다. 기간도 요청할 때 지정한다.
 * 리포트 생성 몇 분이면 끝이라 비교가 안 된다.
 *
 * 덤으로 세션·페이지뷰·카트박스 점유율이 같이 온다. 주문 데이터로는 알 수 없는
 * 값이라 '안 팔리는 이유'(노출이 없나, 전환이 안 되나)를 나눠 볼 수 있다.
 *
 * ── 주의 ────────────────────────────────────────────────
 * 이 리포트는 '판매 분석' 권한이 따로 필요하다. 이 계정은 주문 리포트가 403이었으므로
 * 열려 있다고 단정할 수 없다 — 실제로 요청해 보고 판단한다.
 * 막혀 있으면 Orders API 수집을 그대로 쓰면 된다 (느릴 뿐 결과는 같다).
 *
 * 주문이 0건인 SKU는 리포트에 나오지 않는다. '안 팔린 것'과 '데이터가 없는 것'을
 * 구분할 수 없으므로, 리스팅에 있는데 여기 없으면 판매 0으로 본다.
 */

var SHEET_SALES = '판매실적';
var SALES_HEADER = [
  '기간시작', '기간종료', 'SKU', 'ASIN', '판매수량', '판매금액(JPY)',
  '세션', '페이지뷰', '카트박스%', '수집일시'
];
var SL_FROM = 0, SL_TO = 1, SL_SKU = 2, SL_ASIN = 3, SL_QTY = 4, SL_AMT = 5,
    SL_SESS = 6, SL_PV = 7, SL_BB = 8, SL_AT = 9;

var SHEET_DAILY = '일별실적';
var DAILY_HEADER = ['날짜', '판매수량', '매출(JPY)', '주문건수', '세션', '페이지뷰', '전환율'];

var SALES_REPORT_TYPE = 'GET_SALES_AND_TRAFFIC_REPORT';
var PROP_SALES_REPORT = 'SALES_REPORT_ID';
var PROP_SALES_DOC = 'SALES_DOC_ID';
var PROP_SALES_RANGE = 'SALES_RANGE';        // 지금 받고 있는 한 구간 'from|to'
var SALES_CONTINUE_HANDLER = 'continueSalesReport';
var SALES_POLL_MS = 2.5 * 60 * 1000;

/**
 * 남은 구간 목록 ['2025-01-01|2025-01-31', ...].
 *
 * ── 왜 통째로 안 받고 달마다 쪼개나 ────────────────────
 * 두 가지 이유가 있는데 둘 다 크다.
 *
 * ① 통째로 받으면 결과가 쓸모없다.
 *    이 리포트의 SKU별 집계(salesAndTrafficByAsin)는 '요청한 기간 전체의 합계'다.
 *    18개월을 한 번에 요청하면 SKU마다 18개월 합계 한 줄이 나온다 —
 *    기간 목록에 '2025-02-01~2026-07-31' 하나만 생기고, 매출기여·광고배치·
 *    카트박스는 전부 18개월 평균만 보게 된다. 달별로 견줄 수가 없다.
 *
 * ② 한 실행에 못 끝낸다.
 *    18개월치 문서는 내려받기·JSON 해석·적재만으로 6분을 넘긴다.
 *    실제로 넘겼다 (2026-08-06).
 *
 * 달 단위로 끊으면 기간이 18개 생기고, 각 구간은 1~2분에 끝난다.
 */
var PROP_SALES_QUEUE = 'SALES_QUEUE';

/**
 * 다음 구간까지 쉬는 시간 (초).
 * 이 리포트는 생성 요청이 5분에 3회로 묶여 있다. 연달아 던지면 429가 나고,
 * 그러면 남은 구간이 통째로 밀린다. 넉넉히 두고 트리거에 맡긴다.
 */
var SALES_NEXT_DELAY_SEC = 120;

/** 429에 걸렸을 때 물러나 있을 시간 (초). 제한 창이 5분이라 그보다 길게 잡는다 */
var SALES_RATELIMIT_DELAY_SEC = 360;

/** 이 시간을 넘기면 남은 구간은 다음 실행으로 넘긴다 (한도 6분) */
var SALES_SOFT_MS = 4 * 60 * 1000;

/**
 * 기간을 달 단위 구간으로 쪼갠다.
 * 양 끝은 요청한 날짜에 맞춰 자른다 — 달 경계를 넘겨 받으면 안 되기 때문이다.
 */
function salesWindows_(from, to) {
  var out = [], guard = 0;
  var cur = from;
  while (cur <= to && guard++ < 400) {
    var y = Number(cur.substring(0, 4)), m = Number(cur.substring(5, 7));
    var last = ymd_(new Date(y, m, 0));        // 다음 달 0일 = 이번 달 말일
    if (last > to) last = to;
    out.push(cur + '|' + last);
    cur = addDays_(last, 1);
  }
  return out;
}

/** 진행 중인 수집을 전부 지운다 */
function salesClearRun_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_SALES_QUEUE);
  props.deleteProperty(PROP_SALES_REPORT);
  props.deleteProperty(PROP_SALES_DOC);
  props.deleteProperty(PROP_SALES_RANGE);
  salesScheduleContinue_(false);
}

function salesQueue_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties()
      .getProperty(PROP_SALES_QUEUE) || '[]') || [];
  } catch (e) { return []; }
}

/**
 * 메뉴: 판매실적 수집.
 * 기간을 물어보고 리포트를 요청한다. 생성이 오래 걸리면 이어실행으로 넘긴다.
 */
function fetchSalesReport() {
  var props = PropertiesService.getScriptProperties();
  var left = salesQueue_().length;
  if (left || props.getProperty(PROP_SALES_REPORT) || props.getProperty(PROP_SALES_DOC)) {
    var r0 = ui_().alert('판매실적 수집',
      '이미 진행 중입니다' + (left ? ' — 남은 구간 ' + left + '개' : '') + '.\n\n' +
      '[예] 이어받기   [아니오] 버리고 새로 시작',
      ui_().ButtonSet.YES_NO_CANCEL);
    if (r0 === ui_().Button.CANCEL) return;
    if (r0 === ui_().Button.YES) { salesStep_(true); return; }
    salesClearRun_();
  }

  var res = ui_().prompt('판매실적 수집 — 기간',
    '조회할 기간을 입력하세요.\n\n' +
    '  2026-06            한 달\n' +
    '  2026-04~2026-06    여러 달\n' +
    '  2026-06-01~2026-06-15   날짜 지정\n' +
    '  30                 최근 30일\n\n' +
    '달 단위로 나눠 받습니다 — 통째로 받으면 SKU마다 기간 전체 합계 한 줄만\n' +
    '나와서 달별로 견줄 수가 없습니다.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var range = parseSalesRange_(String(res.getResponseText()).trim());
  if (!range) {
    ui_().alert('기간을 알아듣지 못했습니다.\n예: 2026-06 · 2026-04~2026-06 · 30');
    return;
  }

  var wins = salesWindows_(range.from, range.to);
  if (wins.length > 1) {
    // 리포트 생성이 5분에 3회로 묶여 있어 구간 수가 그대로 시간이 된다.
    // 18개월이면 40분 넘게 걸린다 — 먼저 말해주고 시작한다.
    var mins = Math.ceil(wins.length * SALES_NEXT_DELAY_SEC / 60);
    var ok = ui_().alert('판매실적 수집',
      range.from + ' ~ ' + range.to + '\n' +
      '달 단위 ' + wins.length + '개 구간 · 예상 ' + mins + '분 안팎\n\n' +
      '한 번에 다 못 받습니다 (실행 한도 6분, 리포트 요청은 5분에 3회).\n' +
      '구간마다 트리거로 이어 달립니다 — 창을 닫아두셔도 됩니다.\n\n' +
      '진행 상황은 [🔄 데이터 갱신 → 수집 상태]에서 볼 수 있고,\n' +
      '거기서 중단할 수도 있습니다.\n\n시작할까요?',
      ui_().ButtonSet.YES_NO);
    if (ok !== ui_().Button.YES) return;
  }

  salesClearRun_();
  props.setProperty(PROP_SALES_QUEUE, JSON.stringify(wins));
  log_('sales', 'INFO', '판매실적 수집 시작 — ' + range.from + '~' + range.to +
       ' · 구간 ' + wins.length + '개');
  salesStep_(true);
}

// ── 일별 SKU 판매 (Sales API) ────────────────────────────
//
// 판매·트래픽 리포트로도 날짜별을 만들 수는 있다 — 하루짜리 기간으로 여러 번
// 요청하면 된다. 그런데 그 리포트는 생성이 5분에 3회로 묶여 있어 30일이면 50분이다.
//
// Sales API 는 반대로 쪼갠다: SKU 하나를 지정하고 기간을 통째로 주면
// 그 SKU의 날짜별 수량·매출이 한 번에 온다. 초당 0.5회라 SKU당 2초.
//   리포트  30일 = 30회 요청 = 50분   (전 SKU)
//   Sales   50개 SKU = 50회 = 2분     (고른 SKU만)
// 추적하려는 건 어차피 상위 몇 개라, 이쪽이 훨씬 낫다.
//
// 필요한 역할은 '셀링 파트너 인사이트'다 (판매 분석과는 별개).

var PROP_SKUD_QUEUE = 'SKUD_QUEUE';      // 남은 SKU
var PROP_SKUD_RANGE = 'SKUD_RANGE';      // 'from|to'
var SKUD_CONTINUE_HANDLER = 'continueSkuDaily';
var SKUD_SLEEP_MS = 2100;                // 0.5 req/s 준수 (여유 100ms)
var SKUD_SOFT_MS = 3.5 * 60 * 1000;
var SKUD_MAX_SKU = 300;
var SKUD_FLUSH_EVERY = 10;   // 이만큼 받을 때마다 시트에 넣고 큐를 저장한다
var SKUD_FAIL_STREAK = 3;    // 연속 실패가 이만큼이면 전체가 막힌 것으로 본다
var PROP_SKUD_DEDUP = 'SKUD_DEDUP';      // '1' = 마무리 정리만 남았다

/**
 * 메뉴: 일별 SKU 판매 수집.
 * 상위 N개 또는 직접 고른 SKU의 날짜별 판매를 받는다.
 */
function fetchSalesDaily() {
  var props = PropertiesService.getScriptProperties();
  var running = JSON.parse(props.getProperty(PROP_SKUD_QUEUE) || 'null');
  if (running && running.length) {
    var r0 = ui_().alert('일별 SKU 판매 수집',
      '진행 중입니다 — 남은 SKU ' + running.length + '개 (예상 ' +
      Math.ceil(running.length * SKUD_SLEEP_MS / 60000) + '분)\n\n' +
      '[예] 지금 이어서 진행\n[아니오] 중단하고 새로 시작\n[취소] 그냥 닫기',
      ui_().ButtonSet.YES_NO_CANCEL);
    if (r0 === ui_().Button.CANCEL) return;
    if (r0 === ui_().Button.YES) { skuDailyChunk_(true); return; }
    props.deleteProperty(PROP_SKUD_QUEUE);
    skuDailyScheduleContinue_(false);
  }

  var res = ui_().prompt('일별 SKU 판매 수집 — 기간',
    'SKU별로 "어느 날 몇 개 팔렸는지"를 받습니다.\n' +
    'SKU 추적과 가격변경 전후 비교에 쓰입니다.\n\n' +
    '기간을 입력하세요.\n' +
    '  90                 최근 90일\n' +
    '  2026-06            한 달\n' +
    '  2026-04~2026-06    여러 달\n\n' +
    '기간이 길어도 시간은 늘지 않습니다 —\n' +
    'SKU 하나당 요청 한 번으로 기간 전체를 받습니다.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var range = parseSalesRange_(String(res.getResponseText()).trim());
  if (!range) { ui_().alert('기간을 알아듣지 못했습니다.\n예: 90 · 2026-06'); return; }

  var pick = ui_().prompt('어떤 SKU를 받을까요',
    '숫자를 넣으면 판매량 상위 그만큼을 받습니다 (기본 50).\n' +
    'SKU를 직접 넣으려면 쉼표로 구분해 적으세요.\n\n' +
    '  50            판매 상위 50개\n' +
    '  SKU-A,SKU-B   직접 지정\n\n' +
    'SKU당 약 2초 걸립니다 (50개 ≈ 2분). 최대 ' + SKUD_MAX_SKU + '개.',
    ui_().ButtonSet.OK_CANCEL);
  if (pick.getSelectedButton() !== ui_().Button.OK) return;

  var raw = String(pick.getResponseText()).trim();
  var skus;
  if (raw === '' || /^\d+$/.test(raw)) {
    var n = raw === '' ? 50 : parseInt(raw, 10);
    if (!(n >= 1 && n <= SKUD_MAX_SKU)) {
      ui_().alert('1 ~ ' + SKUD_MAX_SKU + ' 사이로 넣으세요.'); return;
    }
    skus = topSkusByQty_(n);
    if (!skus) {
      ui_().alert('순위를 매길 자료가 없습니다.\n\n' +
        '[🔄 데이터 갱신 → 판매실적 수집 (기간 합계)]을 먼저 받거나,\n' +
        'SKU를 직접 적어 주세요.');
      return;
    }
  } else {
    skus = [];
    var parts2 = raw.split(/[,\n]/);
    for (var i = 0; i < parts2.length; i++) {
      var s = parts2[i].trim();
      if (s) skus.push(s);
    }
    if (!skus.length) { ui_().alert('SKU를 못 읽었습니다.'); return; }
    if (skus.length > SKUD_MAX_SKU) {
      ui_().alert('한 번에 ' + SKUD_MAX_SKU + '개까지입니다.'); return;
    }
  }

  var ok = ui_().alert('일별 SKU 판매 수집',
    range.from + ' ~ ' + range.to + ' (' + (daysBetween_(range.from, range.to) + 1) + '일)\n' +
    'SKU ' + skus.length + '개 · 예상 ' +
      Math.ceil(skus.length * SKUD_SLEEP_MS / 60000) + '분\n\n' +
    '판매량이 많은 순으로 받습니다.\n중간에 멈춰도 받은 데까지 남습니다.\n\n시작할까요?',
    ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  props.setProperty(PROP_SKUD_RANGE, range.from + '|' + range.to);
  props.setProperty(PROP_SKUD_QUEUE, JSON.stringify(skus));
  toast_('일별 수집 시작 — SKU ' + skus.length + '개');
  skuDailyChunk_(true);
}

/** 트리거용 이어실행 */
function continueSkuDaily() {
  withLockOrRetry_('일별 SKU 수집', SKUD_CONTINUE_HANDLER, function () {
    try { skuDailyChunk_(false); } catch (e) { log_('sales', 'ERROR', String(e)); }
  });
}

/**
 * 한 SKU의 날짜별 판매를 받아 '판매실적'에 하루짜리 행으로 넣는다.
 * @return {Array} [[from,to,sku,'',qty,amt,'','','',now], ...]
 */
function skuDailyFetch_(token, sku, from, to) {
  // Day 단위로 쪼갤 때는 어느 시간대의 하루인지 지정해야 한다 (JP 기준)
  var interval = from + 'T00:00:00+09:00--' + to + 'T23:59:59+09:00';
  var path = '/sales/v1/orderMetrics?marketplaceIds=' + MARKETPLACE_JP +
             '&interval=' + encodeURIComponent(interval) +
             '&granularity=Day&granularityTimeZone=' + encodeURIComponent('Asia/Tokyo') +
             '&sku=' + encodeURIComponent(sku);
  var j = spapi_(token, 'get', path);
  var list = j.payload || [];
  var now = new Date();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var d = String(e.interval || '').substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    var qty = Number(e.unitCount) || 0;
    var amt = (e.totalSales && Number(e.totalSales.amount)) || 0;
    if (!qty && !amt) continue;              // 안 팔린 날은 행을 만들지 않는다
    out.push([d, d, sku, '', qty, amt, '', '', '', now]);
  }
  return out;
}

function skuDailyChunk_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_SKUD_QUEUE) || '[]');
  var rangeRaw = (props.getProperty(PROP_SKUD_RANGE) || '').split('|');
  var from = rangeRaw[0], to = rangeRaw[1];
  if (!from || !to) throw new Error('기간이 없습니다. [일별 SKU 판매 수집]을 다시 실행하세요.');

  // 받는 건 끝났고 마무리 정리만 남은 상태 — 새 실행의 6분을 통째로 쓴다
  if (!queue.length && props.getProperty(PROP_SKUD_DEDUP) === '1') {
    dedupSalesDaily_();
    props.deleteProperty(PROP_SKUD_DEDUP);
    skuDailyScheduleContinue_(false);
    log_('sales', 'INFO', '일별 수집 — 중복 정리 완료');
    return '완료';
  }
  if (!queue.length) { skuDailyScheduleContinue_(false); return '완료'; }

  var token = getLwaToken_();
  var rows = [], done = 0, failed = [], written = 0, lastErr = null;
  var streakSkus = [];

  // 받은 것을 끝에 몰아서 쓰면, 그 한 번의 쓰기가 6분을 넘길 때
  // 그때까지 받은 게 전부 날아간다. 큐 저장도 그 뒤라 진행도 안 남는다 —
  // 다시 돌려도 같은 자리에서 또 죽는 무한 반복이 된다.
  // 그래서 몇 개마다 끊어서 저장한다. 최악이라도 SKUD_FLUSH_EVERY개만 잃는다.
  function flush_() {
    if (rows.length) { appendSalesRows_(rows); written += rows.length; rows = []; }
    props.setProperty(PROP_SKUD_QUEUE, JSON.stringify(queue));
  }

  while (queue.length && Date.now() - t0 < SKUD_SOFT_MS) {
    var sku = queue.shift();
    try {
      var got = skuDailyFetch_(token, sku, from, to);
      for (var i = 0; i < got.length; i++) rows.push(got[i]);
      done++; streakSkus = [];
    } catch (e) {
      if (isRateLimited_(e)) { queue.unshift(sku); break; }   // 다시 큐에 넣고 접는다
      failed.push(sku);
      streakSkus.push(sku);
      log_('sales', 'WARN', sku + ' 일별 조회 실패: ' + e);
      // 연달아 실패하면 그 SKU가 아니라 전체가 막힌 것이다 (토큰 만료·권한·통신).
      // 그대로 두면 남은 SKU를 전부 '실패'로 태우고 빈손으로 끝난다.
      if (streakSkus.length >= SKUD_FAIL_STREAK) {
        // 연속 실패분을 통째로 되돌린다. 이것들은 SKU가 나빠서가 아니라
        // 막힌 동안 걸린 것뿐이라, 안 돌려놓으면 다시 실행해도 영영 빠진다.
        for (var b = streakSkus.length - 1; b >= 0; b--) queue.unshift(streakSkus[b]);
        lastErr = e;
        break;
      }
    }
    if (done % SKUD_FLUSH_EVERY === 0) flush_();
    Utilities.sleep(SKUD_SLEEP_MS);
  }
  flush_();

  // 덧붙이기만 했으므로 같은 (날짜, SKU)가 겹칠 수 있다.
  // 전체를 다시 쓰는 비싼 일이라 다 받은 뒤 한 번만 한다.
  if (!queue.length) {
    if (Date.now() - t0 < SKUD_SOFT_MS) {
      dedupSalesDaily_();
    } else {
      props.setProperty(PROP_SKUD_DEDUP, '1');   // 시간이 빠듯하면 다음 실행으로 넘긴다
    }
  }

  if (lastErr) {
    var why = 'SKU를 연달아 ' + SKUD_FAIL_STREAK + '개 못 받아 중단했습니다.\n' +
              '(개별 SKU 문제가 아니라 자격증명·권한·통신 문제로 보입니다)\n\n' +
              '마지막 오류: ' + lastErr + '\n\n' +
              '남은 ' + queue.length + '개는 그대로 두었습니다. ' +
              '원인을 고친 뒤 [일별 SKU 판매 수집]을 다시 실행하면 이어서 받습니다.';
    log_('sales', 'ERROR', '일별 수집 중단 — ' + lastErr);
    skuDailyScheduleContinue_(false);          // 계속 재시도해서 한도를 태우지 않는다
    if (interactive) { ui_().alert('일별 SKU 판매 수집 — 중단', why, ui_().ButtonSet.OK); }
    else { notifyAlert_('일별 SKU 판매 수집 중단', why); }
    return why;
  }

  var msg = 'SKU ' + done + '개 처리 · 행 ' + written +
            (failed.length ? ' · 실패 ' + failed.length : '') +
            (queue.length ? ' · 남음 ' + queue.length : ' · 완료');
  log_('sales', 'INFO', '일별 수집 — ' + msg);
  toast_(msg);

  if (queue.length || props.getProperty(PROP_SKUD_DEDUP) === '1') {
    skuDailyScheduleContinue_(true);
    if (interactive) {
      ui_().alert('일별 SKU 판매 수집 — 진행 중',
        msg + '\n\n예상 ' + Math.ceil(queue.length * SKUD_SLEEP_MS / 60000) + '분 남았습니다.\n' +
        '1분 간격으로 자동 진행됩니다. 창을 닫아두셔도 됩니다.', ui_().ButtonSet.OK);
    }
  } else {
    skuDailyScheduleContinue_(false);
    if (interactive) {
      ui_().alert('일별 SKU 판매 수집 완료',
        msg + '\n\n기간: ' + from + ' ~ ' + to + '\n\n' +
        '[📊 분석 → SKU 추적]에서 일별 그래프를 볼 수 있습니다.' +
        (failed.length ? '\n\n실패한 SKU:\n  ' + failed.slice(0, 5).join('\n  ') : ''),
        ui_().ButtonSet.OK);
    }
  }
  return msg;
}

/**
 * 끝에 덧붙이기만 한다 — 시트가 몇 만 행이든 걸리는 시간이 같다.
 * (갈아끼우기는 매번 전체를 다시 써서 행이 늘수록 느려지고, 결국 6분을 넘긴다)
 */
function appendSalesRows_(rows) {
  if (!rows.length) return 0;
  var sh = ensureSheet_(SHEET_SALES, SALES_HEADER);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, SALES_HEADER.length).setValues([SALES_HEADER])
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, SALES_HEADER.length).setValues(rows);
  salesCacheClear_();
  return rows.length;
}

/**
 * 같은 (날짜, SKU)가 여러 번 들어갔으면 마지막 것만 남긴다.
 *
 * 덧붙이기만 하다 보면 중간에 끊겼다 다시 받은 SKU가 겹친다.
 * 전체를 다시 쓰는 비싼 일이라 다 받은 뒤 한 번만 부른다.
 * 기간 합계 행(기간시작 ≠ 기간종료)은 손대지 않는다.
 */
function dedupSalesDaily_() {
  var sh = ss_().getSheetByName(SHEET_SALES);
  if (!sh || sh.getLastRow() < 3) return 0;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, SALES_HEADER.length).getValues();

  var lastAt = {};                       // '날짜|SKU' -> 마지막으로 나온 위치
  for (var i = 0; i < v.length; i++) {
    var f = v[i][SL_FROM] instanceof Date ? ymd_(v[i][SL_FROM]) : String(v[i][SL_FROM]);
    var t = v[i][SL_TO] instanceof Date ? ymd_(v[i][SL_TO]) : String(v[i][SL_TO]);
    if (f !== t) continue;               // 기간 합계는 중복 판정에서 뺀다
    lastAt[f + '|' + String(v[i][SL_SKU]).trim()] = i;
  }
  var keep = [], dropped = 0;
  for (var k = 0; k < v.length; k++) {
    var f2 = v[k][SL_FROM] instanceof Date ? ymd_(v[k][SL_FROM]) : String(v[k][SL_FROM]);
    var t2 = v[k][SL_TO] instanceof Date ? ymd_(v[k][SL_TO]) : String(v[k][SL_TO]);
    if (f2 === t2 && lastAt[f2 + '|' + String(v[k][SL_SKU]).trim()] !== k) { dropped++; continue; }
    keep.push(v[k]);
  }
  if (!dropped) return 0;

  sh.getRange(2, 1, v.length, SALES_HEADER.length).clearContent();
  var CH = 2000;
  for (var s = 0; s < keep.length; s += CH) {
    var part = keep.slice(s, s + CH);
    sh.getRange(2 + s, 1, part.length, SALES_HEADER.length).setValues(part);
  }
  salesCacheClear_();
  log_('sales', 'INFO', '일별 중복 정리 ' + dropped + '행');
  return dropped;
}

function skuDailyScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === SKUD_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(SKUD_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/**
 * 판매량 상위 SKU 목록.
 *
 * 리포트는 날짜 단위로만 요청할 수 있어 '상위 N개만 받기'는 불가능하다.
 * 대신 '상위 N개만 저장'은 된다 — 일별 자료는 날마다 팔린 SKU 수만큼 쌓이므로
 * 그냥 두면 30일에 수만 행이 되고 시트가 눈에 띄게 느려진다.
 *
 * 순위는 이미 받아둔 판매실적으로 매기고, 없으면 주문 탭으로 대신한다.
 */
function topSkusByQty_(n) {
  var qty = salesQtyMap_();
  var list = Object.keys(qty);
  if (!list.length) return null;                 // 순위를 못 매기면 부르는 쪽이 판단한다
  list.sort(function (a, b) { return qty[b] - qty[a]; });
  return list.slice(0, n);
}

/**
 * SKU별 판매수량 — 판매량 순위가 필요한 모든 곳의 단일 창구.
 *
 * 판매실적(리포트/Sales API)을 우선하고, 없으면 주문 탭으로 대신한다.
 * 주문 수집을 메뉴에서 내린 뒤로 주문 탭은 점점 낡으므로,
 * 새 자료가 있으면 그쪽을 봐야 순위가 현재와 맞는다.
 *
 * @return {{sku: number}} 비어 있을 수 있다
 */
function salesQtyMap_() {
  var qty = {};
  var v = salesTable_();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][SL_SKU] || '').trim();
    if (!sku) continue;
    qty[sku] = (qty[sku] || 0) + (Number(v[i][SL_QTY]) || 0);
  }
  if (Object.keys(qty).length) return qty;
  var m = monthlySalesMap_();
  for (var k in m) qty[k] = m[k];
  // 보관 기간을 넘겨 접어둔 옛날 판매도 순위에 넣는다 (둘 다 월평균이라 더할 수 있다)
  var old = ordersSummaryMonthly_();
  for (var k2 in old) qty[k2] = (qty[k2] || 0) + old[k2];
  return qty;
}

/**
 * 기간 문자열 해석. 'YYYY-MM' / 'YYYY-MM~YYYY-MM' / 'YYYY-MM-DD~YYYY-MM-DD' / 'N'(최근 N일)
 * @return {{from:string, to:string}|null}
 */
function parseSalesRange_(raw) {
  if (!raw) return null;
  var s = raw.replace(/\s/g, '').replace(/[~〜–—]/g, '~');

  if (/^\d{1,3}$/.test(s)) {                       // 최근 N일
    var n = parseInt(s, 10);
    if (!(n >= 1 && n <= 730)) return null;
    var to = new Date();
    var from = new Date(to.getTime() - (n - 1) * 86400000);
    return { from: ymd_(from), to: ymd_(to) };
  }
  var parts = s.split('~');
  var a = expandRangeEnd_(parts[0], false);
  var b = expandRangeEnd_(parts.length > 1 ? parts[1] : parts[0], true);
  if (!a || !b || a > b) return null;
  return { from: a, to: b };
}

/** 'YYYY-MM' → 시작이면 01일, 끝이면 말일. 'YYYY-MM-DD' 는 그대로 */
function expandRangeEnd_(tok, isEnd) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) return tok;
  if (/^\d{4}-\d{2}$/.test(tok)) {
    if (!isEnd) return tok + '-01';
    var y = parseInt(tok.substring(0, 4), 10), m = parseInt(tok.substring(5, 7), 10);
    return ymd_(new Date(y, m, 0));          // 다음 달 0일 = 이번 달 말일
  }
  if (/^\d{4}$/.test(tok)) return isEnd ? tok + '-12-31' : tok + '-01-01';
  return null;
}

/** 트리거용 이어실행 */
function continueSalesReport() {
  withLockOrRetry_('판매실적 수집', SALES_CONTINUE_HANDLER, function () {
    try { salesStep_(false); } catch (e) { log_('sales', 'ERROR', String(e)); }
  });
}

function salesStep_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var token = getLwaToken_();

  // 지금 받을 구간을 정한다. 큐가 우선이고, 큐가 비면 예전 방식(단일 기간)도 받아준다
  var queue = salesQueue_();
  var rangeRaw = props.getProperty(PROP_SALES_RANGE) || '';
  if (!rangeRaw && queue.length) {
    rangeRaw = queue[0];
    props.setProperty(PROP_SALES_RANGE, rangeRaw);
  }
  var parts = rangeRaw.split('|');
  var from = parts[0] || '', to = parts[1] || '';
  if (!from || !to) throw new Error('기간이 지정되지 않았습니다. [판매실적 수집]을 다시 실행하세요.');

  // ── 넘어지기 전에 일어설 준비부터 한다 ──────────────────
  //
  // 예전에는 마지막에야 트리거를 손봤다. 그래서 내려받기·적재에서 6분을 넘기면
  // 잡아둔 트리거가 없어 아무도 이어받지 않았다 — 사람이 다시 누르기 전까지
  // 수집이 통째로 멈춰 있었다 (2026-08-06 18개월 수집).
  //
  // 이제 위험한 일을 하기 *전에* 재개 트리거를 걸어둔다.
  // 성공하면 아래에서 다시 걸거나 지운다. 죽으면 그 트리거가 살려낸다.
  salesScheduleContinue_(true, SALES_NEXT_DELAY_SEC);

  var docId = props.getProperty(PROP_SALES_DOC);

  // ── 1단계: 리포트 준비 ──
  if (!docId) {
    var reportId = props.getProperty(PROP_SALES_REPORT);
    if (!reportId) {
      toast_('판매 리포트 요청 중…');
      var created;
      try {
        created = spapi_(token, 'post', '/reports/2021-06-30/reports', {
          reportType: SALES_REPORT_TYPE,
          marketplaceIds: [MARKETPLACE_JP],
          dataStartTime: from + 'T00:00:00Z',
          dataEndTime: to + 'T23:59:59Z',
          reportOptions: { dateGranularity: 'DAY', asinGranularity: 'SKU' }
        });
      } catch (e) {
        // 429(호출 제한)와 403(권한)은 원인이 전혀 다르다.
        // 이 리포트는 5분에 3회가 한계라, 버튼을 몇 번 누르면 바로 걸린다.
        if (isRateLimited_(e)) {
          // 제한은 기다리면 풀린다 — 여기서 멈추면 남은 구간이 통째로 죽는다.
          // 트리거를 걸어둔 채로 물러난다.
          salesScheduleContinue_(true, SALES_RATELIMIT_DELAY_SEC);
          log_('sales', 'WARN', '호출 제한 — ' +
               Math.round(SALES_RATELIMIT_DELAY_SEC / 60) + '분 뒤 자동 재시도 (' + from + ')');
          if (!interactive) return '';       // 트리거 실행이면 조용히 물러난다
          throw new Error(
            '판매 리포트는 5분에 3회까지만 요청할 수 있습니다.\n' +
            '권한 문제가 아니라 호출 제한에 걸린 것입니다.\n\n' +
            Math.round(SALES_RATELIMIT_DELAY_SEC / 60) + '분 뒤 자동으로 다시 시도합니다 — ' +
            '그냥 두셔도 됩니다.\n\n' + String(e));
        }
        // 권한·요청 자체가 잘못된 것은 기다려도 안 풀린다. 여기서 멈춘다.
        salesScheduleContinue_(false);
        throw new Error(
          '판매 리포트를 요청할 수 없습니다.\n\n' + String(e) + '\n\n' +
          salesPermHint_() + '\n\n' +
          '자세히 보려면 [⚙ 설정 → SP-API 권한 진단]을 실행하세요.');
      }
      reportId = created.reportId;
      props.setProperty(PROP_SALES_REPORT, reportId);
      log_('sales', 'INFO', '판매 리포트 생성 ' + reportId + ' (' + from + '~' + to + ')');
    }

    while (Date.now() - t0 < SALES_POLL_MS) {
      var info = spapi_(token, 'get', '/reports/2021-06-30/reports/' + reportId);
      if (info.processingStatus === 'DONE') { docId = info.reportDocumentId; break; }
      if (info.processingStatus === 'FATAL' || info.processingStatus === 'CANCELLED') {
        props.deleteProperty(PROP_SALES_REPORT);
        // 이 구간 하나가 깨졌다고 나머지를 버리지 않는다.
        // 건너뛰고 다음 구간으로 넘어간 뒤, 무엇을 못 받았는지 로그에 남긴다.
        var qF = salesQueue_();
        if (qF.length && qF[0] === from + '|' + to) qF.shift();
        props.deleteProperty(PROP_SALES_RANGE);
        log_('sales', 'ERROR', '리포트 처리 실패 (' + info.processingStatus + ') — ' +
             from + '~' + to + ' 건너뜀' +
             (qF.length ? ' · 남은 구간 ' + qF.length + '개' : ''));
        if (qF.length) {
          props.setProperty(PROP_SALES_QUEUE, JSON.stringify(qF));
          salesScheduleContinue_(true, SALES_NEXT_DELAY_SEC);
          if (!interactive) return '';
        } else {
          props.deleteProperty(PROP_SALES_QUEUE);
          salesScheduleContinue_(false);
        }
        throw new Error('리포트 처리 실패: ' + info.processingStatus + ' (' + from + '~' + to + ')\n' +
                        '이 구간은 건너뛰었습니다' +
                        (qF.length ? ' — 남은 ' + qF.length + '개는 계속 받습니다.' : '.') +
                        '\n권한이 없거나 그 기간에 자료가 없을 수 있습니다.');
      }
      Utilities.sleep(10000);
    }
    if (!docId) {
      // 아마존이 아직 만들고 있다. 맨 위에서 걸어둔 트리거를 짧게 다시 잡는다
      salesScheduleContinue_(true, 60);
      log_('sales', 'INFO', '리포트 생성 대기 — 1분 뒤 자동 재시도 (' + from + ')');
      if (interactive) {
        ui_().alert('판매실적 — 리포트 준비 중',
          '아마존이 리포트를 만들고 있습니다 (오류 아님).\n\n' +
          '1분 뒤 자동으로 이어받습니다. 창을 닫아두셔도 됩니다.',
          ui_().ButtonSet.OK);
      }
      return;
    }
    props.setProperty(PROP_SALES_DOC, docId);
    props.deleteProperty(PROP_SALES_REPORT);
  }

  // ── 2단계: 내려받아 적재 ──
  var doc = spapi_(token, 'get', '/reports/2021-06-30/documents/' + docId);
  var blob = UrlFetchApp.fetch(doc.url, { muteHttpExceptions: true }).getBlob();
  var text = (doc.compressionAlgorithm === 'GZIP')
    ? Utilities.ungzip(blob.setContentType('application/x-gzip')).getDataAsString('UTF-8')
    : blob.getDataAsString('UTF-8');

  var rows = parseSalesReport_(text, from, to);
  var daily = parseSalesByDate_(text);
  props.deleteProperty(PROP_SALES_DOC);

  // 같은 리포트에 날짜별 집계도 들어 있다. SKU별로는 안 쪼개지지만
  // '전체가 어느 날 얼마나 팔렸는가'는 이것 말고 받을 데가 없다.
  if (daily.length) writeDailyRows_(daily);
  if (rows.length) writeSalesRows_(rows, from, to);

  // 이 구간은 끝났다 — 큐에서 뺀다.
  // 적재까지 끝난 뒤에 빼야 중간에 죽어도 같은 구간을 다시 받는다.
  var q2 = salesQueue_();
  if (q2.length && q2[0] === from + '|' + to) q2.shift();
  props.deleteProperty(PROP_SALES_RANGE);

  var qty = 0, amt = 0;
  for (var i = 0; i < rows.length; i++) { qty += rows[i].qty; amt += rows[i].amt; }
  var msg = from + '~' + to + ' · SKU ' + rows.length.toLocaleString() +
            '개 · 판매 ' + Math.round(qty).toLocaleString() + '개 · ' +
            Math.round(amt).toLocaleString() + '엔';

  if (q2.length) {
    // 아직 남았다. 판매가 0인 달이 있어도 멈추지 않는다 —
    // 18개월 중 한 달이 비었다고 나머지 17개월을 버릴 이유가 없다.
    props.setProperty(PROP_SALES_QUEUE, JSON.stringify(q2));
    salesScheduleContinue_(true, SALES_NEXT_DELAY_SEC);
    log_('sales', 'INFO', '판매실적 적재 — ' + msg + ' · 남은 구간 ' + q2.length + '개');
    toast_(msg + ' · 남은 구간 ' + q2.length + '개');
    if (interactive) {
      ui_().alert('판매실적 수집 — 이어서 진행합니다',
        msg + '\n\n남은 구간 ' + q2.length + '개 · 약 ' +
        Math.ceil(q2.length * SALES_NEXT_DELAY_SEC / 60) + '분\n\n' +
        '자동으로 이어 달립니다. 창을 닫아두셔도 됩니다.\n' +
        '진행 상황은 [🔄 데이터 갱신 → 수집 상태]에서 볼 수 있습니다.',
        ui_().ButtonSet.OK);
    }
    return msg;
  }

  props.deleteProperty(PROP_SALES_QUEUE);
  salesScheduleContinue_(false);

  if (!rows.length) {
    throw new Error('리포트가 비어 있습니다.\n' +
      '그 기간에 판매가 없었거나, SKU 단위 데이터가 제공되지 않았습니다.');
  }

  log_('sales', 'INFO', '판매실적 적재 — ' + msg);
  toast_(msg);
  if (interactive) {
    ui_().alert('판매실적 수집 완료 — ' + SHEET_SALES + ' 탭',
      msg + '\n\n' +
      '이제 [■ 매출 기여도 · 추세]에서 이 기간을 골라 비중을 볼 수 있습니다.\n\n' +
      '※ 판매 0건인 SKU는 리포트에 나오지 않습니다.',
      ui_().ButtonSet.OK);
  }
  return msg;
}

/** 리포트(JSON) → [{sku, asin, qty, amt, sessions, pv, bb}] */
function parseSalesReport_(text, from, to) {
  var j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('리포트를 해석할 수 없습니다: ' + e); }
  var list = j.salesAndTrafficByAsin || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e2 = list[i];
    // SKU 단위로 요청했으면 sku가 온다. 혹시 없으면 childAsin으로라도 식별한다.
    var sku = String(e2.sku || '').trim();
    var asin = String(e2.childAsin || e2.parentAsin || '').trim();
    if (!sku && !asin) continue;
    var s = e2.salesByAsin || {};
    var t = e2.trafficByAsin || {};
    var amount = (s.orderedProductSales && Number(s.orderedProductSales.amount)) || 0;
    out.push({
      sku: sku, asin: asin,
      qty: Number(s.unitsOrdered) || 0,
      amt: amount,
      sessions: Number(t.sessions) || 0,
      pv: Number(t.pageViews) || 0,
      bb: Number(t.buyBoxPercentage) || 0
    });
  }
  return out;
}

/**
 * 403이 났을 때 무엇을 확인해야 하는지.
 *
 * 역할을 추가해도 기존 Refresh Token에는 옛 권한만 담겨 있다.
 * 재승인해서 새 토큰을 받지 않으면 계속 403이다 — 여기서 대부분 막힌다.
 */
/** 호출 제한(429)인가 — 권한 문제와 섞어 보면 엉뚱한 곳을 고치게 된다 */
function isRateLimited_(e) {
  var m = String(e || '');
  return m.indexOf('429') >= 0 ||
         m.toLowerCase().indexOf('quota') >= 0 ||
         m.toLowerCase().indexOf('too many requests') >= 0 ||
         m.indexOf('rate') >= 0 && m.toLowerCase().indexOf('exceed') >= 0;
}

function salesPermHint_() {
  var tokenLine = '  (토큰을 언제 넣었는지는 기록하지 않습니다 — 직접 확인하세요)';

  return '이 리포트는 Brand Analytics 역할이 필요합니다.\n' +
    '역할을 추가하셨다면 아래 중 빠진 게 있는지 보세요:\n\n' +
    '  1) 개발자 프로필에서 역할이 "승인됨"인가 (신청만 한 상태가 아닌가)\n' +
    '  2) 앱 편집 화면에서도 그 역할을 체크하고 저장했는가\n' +
    '     (프로필과 앱은 별개입니다 — 프로필만 하면 안 됩니다)\n' +
    '  3) ★ 재승인해서 새 Refresh Token을 받아 넣었는가\n' +
    '     역할을 추가해도 옛 토큰에는 옛 권한만 들어 있습니다.\n' +
    tokenLine + '\n\n' +
    '새 토큰은 [사입도우미 → ① SP-API 자격증명 설정]에서\n' +
    'Refresh Token 칸에만 넣으면 됩니다 (나머지는 비워두면 유지).';
}

/**
 * 메뉴: SP-API 권한 진단.
 * 리포트 API 자체가 되는지와 판매 리포트만 막힌 건지를 갈라준다.
 * 조회·생성 요청만 하고 아무것도 바꾸지 않는다.
 */
function diagnoseSalesPermission() {
  var token = getLwaToken_();
  var lines = [];
  var okList = false, okSales = false;

  // 1) 리포트 API 자체가 되는가 (이미 쓰고 있는 리스팅 리포트로 확인)
  try {
    spapi_(token, 'get', '/reports/2021-06-30/reports?reportTypes=' + REPORT_TYPE + '&pageSize=1');
    okList = true;
    lines.push('✅ 리포트 API 자체는 정상 (리스팅 리포트 조회 성공)');
  } catch (e) {
    lines.push('❌ 리포트 API 조회부터 실패 — ' + String(e).substring(0, 90));
  }

  // 2) 판매 리포트를 실제로 요청해 본다 (하루치라 부담이 없다)
  var y = Utilities.formatDate(new Date(Date.now() - 2 * 86400000),
                               'UTC', 'yyyy-MM-dd');
  try {
    var created = spapi_(token, 'post', '/reports/2021-06-30/reports', {
      reportType: SALES_REPORT_TYPE,
      marketplaceIds: [MARKETPLACE_JP],
      dataStartTime: y + 'T00:00:00Z',
      dataEndTime: y + 'T23:59:59Z',
      reportOptions: { dateGranularity: 'DAY', asinGranularity: 'SKU' }
    });
    okSales = true;
    lines.push('✅ 판매 리포트 요청 성공 (reportId ' + created.reportId + ')');
  } catch (e2) {
    if (isRateLimited_(e2)) {
      lines.push('⏳ 호출 제한에 걸렸습니다 (5분에 3회) — 권한 문제가 아닙니다');
      ui_().alert('SP-API 권한 진단',
        lines.join('\n') + '\n\n' +
        '5분쯤 기다렸다가 다시 진단하세요.\n' +
        '지금은 권한이 열렸는지 판단할 수 없습니다.', ui_().ButtonSet.OK);
      return null;
    }
    lines.push('❌ 판매 리포트 요청 실패 — ' + String(e2).substring(0, 90));
  }

  // 3) 주문 리포트 — 열려 있으면 Orders API 크롤링(11시간)을 갈아치울 수 있다.
  //    청구서의 주문번호를 SKU에 붙이려면 '주문번호 ↔ SKU'가 필요한데,
  //    판매 리포트에는 주문번호가 없어서 그것만은 대체가 안 된다.
  try {
    spapi_(token, 'post', '/reports/2021-06-30/reports', {
      reportType: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
      marketplaceIds: [MARKETPLACE_JP],
      dataStartTime: y + 'T00:00:00Z',
      dataEndTime: y + 'T23:59:59Z'
    });
    lines.push('✅ 주문 리포트 — 주문 수집을 리포트로 바꿀 수 있습니다');
  } catch (e3) {
    lines.push(isRateLimited_(e3)
      ? '⏳ 주문 리포트 — 호출 제한이라 판단 불가'
      : '❌ 주문 리포트 — 막혀 있습니다 (Orders API 수집을 계속 써야 합니다)');
  }

  var verdict;
  if (okSales) {
    verdict = '권한이 열렸습니다.\n[🔄 데이터 갱신 → 판매실적 수집]을 실행하세요.';
  } else if (okList) {
    verdict = '리포트 API는 되는데 판매 리포트만 막혔습니다.\n' +
              '→ 인증 문제가 아니라 역할(Brand Analytics) 문제입니다.\n\n' + salesPermHint_();
  } else {
    verdict = '리포트 API 자체가 안 됩니다.\n' +
              '자격증명이나 토큰 문제일 수 있습니다 —\n' +
              '[사입도우미 → ① SP-API 자격증명 설정]에서 토큰을 확인하세요.';
  }

  log_('sales', 'INFO', '권한 진단 · 리포트API ' + (okList ? 'OK' : 'NG') +
                        ' / 판매리포트 ' + (okSales ? 'OK' : 'NG'));
  ui_().alert('SP-API 권한 진단', lines.join('\n') + '\n\n' + verdict, ui_().ButtonSet.OK);
  return okSales;
}

/** 리포트의 날짜별 집계 (계정 전체) → [{date, qty, amt, sessions, pv}] */
function parseSalesByDate_(text) {
  var j;
  try { j = JSON.parse(text); } catch (e) { return []; }
  var list = j.salesAndTrafficByDate || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var d = String(e.date || '').substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    var s = e.salesByDate || {};
    var t = e.trafficByDate || {};
    out.push({
      date: d,
      qty: Number(s.unitsOrdered) || 0,
      amt: (s.orderedProductSales && Number(s.orderedProductSales.amount)) || 0,
      orders: Number(s.totalOrderItems) || 0,
      sessions: Number(t.sessions) || 0,
      pv: Number(t.pageViews) || 0
    });
  }
  return out;
}

/** 날짜별 실적 — 같은 날짜는 새 것으로 갈아끼운다 */
function writeDailyRows_(daily) {
  var sh = ensureSheet_(SHEET_DAILY, DAILY_HEADER);
  var keep = [];
  var fresh = {};
  for (var i = 0; i < daily.length; i++) fresh[daily[i].date] = true;

  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, DAILY_HEADER.length).getValues();
    for (var k = 0; k < v.length; k++) {
      var d = v[k][0] instanceof Date ? ymd_(v[k][0]) : String(v[k][0]);
      if (fresh[d]) continue;
      keep.push(v[k]);
    }
  }
  var add = daily.map(function (r) {
    return [r.date, r.qty, r.amt, r.orders, r.sessions, r.pv,
            r.sessions > 0 ? r.qty / r.sessions : ''];
  });
  var all = keep.concat(add);
  all.sort(function (a, b) {
    var x = a[0] instanceof Date ? ymd_(a[0]) : String(a[0]);
    var y = b[0] instanceof Date ? ymd_(b[0]) : String(b[0]);
    return x < y ? -1 : 1;
  });

  // clear() 로 비우고 쓰지 않는다 — 쓰는 도중에 죽으면 표가 통째로 사라진다
  writeTable_(sh, DAILY_HEADER, all);
  if (all.length) {
    sh.getRange(2, 3, all.length, 1).setNumberFormat('#,##0');
    sh.getRange(2, 7, all.length, 1).setNumberFormat('0.0%');
  }
  return add.length;
}

/** 같은 기간·SKU는 덮어쓰고 나머지는 남긴다 (여러 기간을 모아둘 수 있게) */
function writeSalesRows_(rows, from, to) {
  var sh = ensureSheet_(SHEET_SALES, SALES_HEADER);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, SALES_HEADER.length).setValues([SALES_HEADER])
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  var keep = [];
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, SALES_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var f = v[i][SL_FROM] instanceof Date ? ymd_(v[i][SL_FROM]) : String(v[i][SL_FROM]);
      var t = v[i][SL_TO] instanceof Date ? ymd_(v[i][SL_TO]) : String(v[i][SL_TO]);
      if (f === from && t === to) continue;     // 같은 기간은 새로 받은 것으로 교체
      keep.push(v[i]);
    }
  }
  var now = new Date();
  var fresh = rows.map(function (r) {
    return [from, to, r.sku, r.asin, r.qty, r.amt, r.sessions, r.pv, r.bb, now];
  });
  var all = keep.concat(fresh);

  // clear() 로 비우고 쓰지 않는다 — 18개월치면 수만 행이라,
  // 쓰는 도중에 6분 한도에 걸리면 받아둔 것이 통째로 사라진다
  writeTable_(sh, SALES_HEADER, all);
  salesCacheClear_();
  return fresh.length;
}

function salesScheduleContinue_(more, delaySec) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === SALES_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) {
    ScriptApp.newTrigger(SALES_CONTINUE_HANDLER).timeBased()
      .after((delaySec || 60) * 1000).create();
  }
}

/**
 * 판매실적 전체 — 한 실행에 한 번만 읽는다.
 *
 * 이 탭을 읽는 함수가 다섯이다 (기간 목록·기간 집계·판매량 순위·일별 유무·SKU 일별).
 * 각자 시트를 통읽기하면 매출 기여도 한 번에 같은 3만 행을 서너 번 가져온다 —
 * 목(mock)에서는 공짜지만 실제 시트에서는 그 중복이 분 단위로 쌓여 6분을 넘겼다.
 * 그래서 여기서 한 번 읽어 실행이 끝날 때까지 나눠 쓴다. 쓰는 쪽이 비운다.
 */
var _salesTblCache = null;
function salesTable_() {
  if (_salesTblCache) return _salesTblCache;
  var sh = ss_().getSheetByName(SHEET_SALES);
  if (!sh || sh.getLastRow() < 2) { _salesTblCache = []; return _salesTblCache; }
  _salesTblCache = sh.getRange(2, 1, sh.getLastRow() - 1, SALES_HEADER.length).getValues();
  return _salesTblCache;
}
function salesCacheClear_() { _salesTblCache = null; }

/** 판매실적 탭에 들어 있는 기간 목록 (최근 것부터) */
function salesPeriods_() {
  var v = salesTable_();
  var seen = {}, out = [];
  for (var i = 0; i < v.length; i++) {
    var f = v[i][SL_FROM] instanceof Date ? ymd_(v[i][SL_FROM]) : String(v[i][SL_FROM]);
    var t = v[i][SL_TO] instanceof Date ? ymd_(v[i][SL_TO]) : String(v[i][SL_TO]);
    if (!f || !t) continue;
    // 하루짜리 행은 '기간'이 아니다. 일별 수집을 90일 돌리면 하루짜리 기간이 90개 생겨
    // 정작 골라야 할 월 단위 기간이 목록 밖으로 밀려난다.
    if (f === t) continue;
    var k = f + '|' + t;
    if (seen[k]) { seen[k].n++; continue; }
    seen[k] = { from: f, to: t, n: 1 };
    out.push(seen[k]);
  }
  out.sort(function (a, b) { return a.to < b.to ? 1 : -1; });
  return out;
}

/**
 * 특정 기간의 SKU별 판매 집계.
 * @return {{qty:Object, amt:Object, sess:Object, days:number}|null}
 */
function salesForPeriod_(from, to) {
  var v = salesTable_();
  if (!v.length) return null;
  var qty = {}, amt = {}, sess = {}, bb = {}, bbN = {};
  var hit = 0;
  for (var i = 0; i < v.length; i++) {
    var f = v[i][SL_FROM] instanceof Date ? ymd_(v[i][SL_FROM]) : String(v[i][SL_FROM]);
    var t = v[i][SL_TO] instanceof Date ? ymd_(v[i][SL_TO]) : String(v[i][SL_TO]);
    if (f !== from || t !== to) continue;
    var sku = String(v[i][SL_SKU] || '').trim();
    if (!sku) continue;
    qty[sku] = (qty[sku] || 0) + (Number(v[i][SL_QTY]) || 0);
    amt[sku] = (amt[sku] || 0) + (Number(v[i][SL_AMT]) || 0);
    sess[sku] = (sess[sku] || 0) + (Number(v[i][SL_SESS]) || 0);
    // 카트박스는 비율이라 더하면 안 된다 — 평균을 내려고 건수를 따로 센다
    var b = Number(v[i][SL_BB]);
    if (b > 0) { bb[sku] = (bb[sku] || 0) + b; bbN[sku] = (bbN[sku] || 0) + 1; }
    hit++;
  }
  if (!hit) return null;
  var bbAvg = {};
  for (var k in bb) bbAvg[k] = bb[k] / bbN[k];
  return { qty: qty, amt: amt, sess: sess, bb: bbAvg,
           days: daysBetween_(from, to) + 1 };
}
