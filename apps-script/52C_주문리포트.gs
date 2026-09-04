/**
 * 52C_주문리포트.gs — 주문을 '리포트'로 받는다 (Orders API 크롤링 대체)
 *
 * ── 왜 바꾸는가 ─────────────────────────────────────────
 * Orders API는 주문 목록을 받은 뒤, 주문마다 getOrderItems를 또 불러야 SKU를 안다.
 * 그 호출이 초당 0.5회라 2만 건이면 순수 대기만 11시간이다.
 *
 * GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL 은
 * amazon-order-id · sku · quantity · item-price · purchase-date 를 한 파일에 담아준다.
 * 주문 탭에 필요한 다섯 칸이 그대로 다 있다. 요청은 30일에 한 번씩:
 *   18개월 = 18회.  (Orders API로는 수만 회)
 *
 * ── 30일 제한 ───────────────────────────────────────────
 * 이 리포트는 한 번에 30일까지만 된다. 그래서 기간을 30일씩 잘라 큐에 넣고
 * 하나씩 처리한다. 리포트 생성은 몇 분 걸리므로 6분 안에 못 끝내면 트리거로 이어간다.
 *
 * ── 얼마나 받아야 하는가 ────────────────────────────────
 * 주문 탭이 하는 유일한 고유 역할은 '청구서의 주문번호 → SKU' 다리다.
 * 판매량·매출은 판매실적이 더 정확하게 주므로 주문에서 볼 이유가 없다.
 *
 * 그러니 필요한 기간은 '청구서가 있는 기간'이지 '오래될수록 좋은 것'이 아니다.
 * 청구서에 없는 기간의 주문은 영원히 아무것과도 안 맞고, 탭만 무겁게 만들어
 * 매출기여·중복점검 같은 분석을 6분 한도로 밀어넣는다.
 * 그래서 기본값을 배송실적의 날짜 범위에서 자동으로 잡는다.
 *
 * ── 같은 창을 두 번 받지 않는다 ────────────────────────
 * 이 리포트에는 order-item-id 가 없다. 같은 주문에 같은 SKU가 두 줄로 들어오는 경우가
 * 있어서, 받은 줄만 보고는 '원래 두 줄'인지 '두 번 받은 것'인지 구분할 수 없다.
 * 그래서 중복 제거에 기대지 않고, 끝낸 30일 창을 기록해 두고 다시 받지 않는다.
 */

var ORDR_REPORT_TYPE = 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL';
var ORDR_WINDOW_DAYS = 30;              // 리포트가 허용하는 최대 기간
var PROP_ORDR_QUEUE = 'ORDR_QUEUE';     // 남은 창 ['from|to', ...]
var PROP_ORDR_DONE = 'ORDR_DONE';       // 끝낸 창
var PROP_ORDR_REPORT = 'ORDR_REPORT_ID';
var PROP_ORDR_DOC = 'ORDR_DOC_ID';
var ORDR_CONTINUE_HANDLER = 'continueOrdersReport';
var ORDR_SOFT_MS = 4 * 60 * 1000;
var ORDR_POLL_SLEEP_MS = 10000;
var ORDR_LEAD_DAYS = 30;   // 주문일과 출고일 사이 여유

/** 메뉴: 주문 수집 (리포트) */
function fetchOrdersReport() {
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_ORDR_QUEUE) || 'null');
  if (queue && queue.length) {
    var r0 = ui_().alert('주문 수집',
      '진행 중입니다 — 남은 구간 ' + queue.length + '개\n\n' +
      '[예] 이어서 진행\n[아니오] 중단하고 새로 시작\n[취소] 그냥 닫기',
      ui_().ButtonSet.YES_NO_CANCEL);
    if (r0 === ui_().Button.CANCEL) return;
    if (r0 === ui_().Button.YES) { ordersReportStep_(true); return; }
    ordrClearRun_();
  }

  var done = JSON.parse(props.getProperty(PROP_ORDR_DONE) || '[]');
  var need = ordersNeededRange_();

  var res = ui_().prompt('주문 수집 — 기간',
    '주문번호와 SKU를 함께 받습니다.\n' +
    '청구서의 실측 배송비를 SKU에 붙이는 데만 쓰입니다.\n\n' +
    (need
      ? '■ 권장: ' + need.from + ' ~ ' + need.to + '\n' +
        '   지금 있는 청구서 ' + need.n.toLocaleString() + '건이 그 기간입니다.\n' +
        '   그 밖의 주문은 붙일 청구서가 없어 받아도 쓰이지 않습니다.\n' +
        '   (그냥 [확인]을 누르면 이 기간으로 받습니다)\n\n'
      : '■ 청구서가 아직 없습니다.\n' +
        '   먼저 [🔄 데이터 갱신 → 환율·청구서·원가]로 청구서를 넣으면\n' +
        '   필요한 기간을 자동으로 잡아줍니다.\n\n') +
    '직접 지정하려면:\n' +
    '  90                 최근 90일\n' +
    '  2026-06            한 달\n' +
    '  2025-03~2026-08    여러 달\n\n' +
    '30일씩 나눠 받습니다 (구간당 2~5분).\n' +
    '이미 받은 구간은 건너뜁니다' +
    (done.length ? ' — 지금까지 ' + done.length + '구간 완료' : '') + '.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var raw0 = String(res.getResponseText()).trim();
  var range = raw0 ? parseSalesRange_(raw0) : need;
  if (!range) {
    ui_().alert(raw0 ? '기간을 알아듣지 못했습니다.\n예: 90 · 2026-06'
                     : '청구서가 없어 기간을 잡을 수 없습니다.\n기간을 직접 입력하세요.');
    return;
  }

  var wins = ordrWindows_(range.from, range.to);
  var todo = [];
  for (var i = 0; i < wins.length; i++) {
    if (done.indexOf(wins[i]) < 0) todo.push(wins[i]);
  }
  if (!todo.length) {
    ui_().alert('주문 수집',
      '그 기간은 이미 다 받았습니다.\n\n' +
      '다시 받으려면 [⚙ 설정 → 주문 수집 기록 지우기]를 먼저 실행하세요.',
      ui_().ButtonSet.OK);
    return;
  }

  var skipped = wins.length - todo.length;
  var ok = ui_().alert('주문 수집',
    range.from + ' ~ ' + range.to + '\n' +
    '구간 ' + todo.length + '개' + (skipped ? ' (이미 받은 ' + skipped + '개 제외)' : '') + '\n' +
    '예상 ' + todo.length * 3 + '분 내외\n\n' +
    '중간에 멈춰도 받은 구간은 남습니다.\n시작할까요?',
    ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  props.setProperty(PROP_ORDR_QUEUE, JSON.stringify(todo));
  toast_('주문 수집 시작 — 구간 ' + todo.length + '개');
  ordersReportStep_(true);
}

/**
 * 실제로 필요한 주문 기간.
 *
 * 주문 탭이 하는 유일한 고유 역할은 '청구서의 주문번호 → SKU' 다리다.
 * 그러니 청구서(배송실적)에 없는 기간의 주문은 영원히 아무것과도 안 맞는다 —
 * 받아봐야 탭만 무거워지고 분석이 느려진다.
 *
 * 출고는 주문보다 며칠 뒤라, 가장 이른 출고일에서 여유를 두고 시작한다.
 *
 * @return {{from:string, to:string, n:number}|null} 청구서가 없으면 null
 */
function ordersNeededRange_() {
  var sh = ss_().getSheetByName(SHEET_SHIPMENTS);
  if (!sh || sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, SP_DATE + 1, sh.getLastRow() - 1, 1).getValues();
  var lo = '', hi = '', n = 0;
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0];
    if (!d) continue;
    var ds = (d instanceof Date) ? ymd_(d) : String(d).substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
    if (!lo || ds < lo) lo = ds;
    if (!hi || ds > hi) hi = ds;
    n++;
  }
  if (!n) return null;
  return { from: addDays_(lo, -ORDR_LEAD_DAYS), to: hi, n: n };
}

/** 기간을 30일짜리 창으로 자른다. @return {Array<string>} ['from|to', ...] */
function ordrWindows_(from, to) {
  var out = [];
  var cur = from;
  var guard = 0;
  while (cur <= to && guard++ < 200) {
    var end = addDays_(cur, ORDR_WINDOW_DAYS - 1);
    if (end > to) end = to;
    out.push(cur + '|' + end);
    cur = addDays_(end, 1);
  }
  return out;
}

function addDays_(ymdStr, n) {
  var p = ymdStr.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + n);
  return ymd_(d);
}

/** 트리거용 이어실행 */
function continueOrdersReport() {
  withLockOrRetry_('주문 수집', ORDR_CONTINUE_HANDLER, function () {
    try { ordersReportStep_(false); } catch (e) { log_('orders', 'ERROR', String(e)); }
  });
}

/**
 * 한 창을 처리한다. 리포트 요청 → 생성 대기 → 내려받아 적재.
 * 6분 안에 못 끝내면 그 자리에서 접고 트리거로 이어간다.
 */
function ordersReportStep_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_ORDR_QUEUE) || '[]');
  if (!queue.length) { ordrScheduleContinue_(false); return '완료'; }

  var token = getLwaToken_();
  var win = queue[0].split('|');
  var from = win[0], to = win[1];
  var docId = props.getProperty(PROP_ORDR_DOC);

  // ── 1단계: 리포트 준비 ──
  if (!docId) {
    var reportId = props.getProperty(PROP_ORDR_REPORT);
    if (!reportId) {
      toast_('주문 리포트 요청 중… (' + from + '~' + to + ')');
      var created;
      try {
        created = spapi_(token, 'post', '/reports/2021-06-30/reports', {
          reportType: ORDR_REPORT_TYPE,
          marketplaceIds: [MARKETPLACE_JP],
          dataStartTime: from + 'T00:00:00Z',
          dataEndTime: to + 'T23:59:59Z'
        });
      } catch (e) {
        ordrScheduleContinue_(false);
        if (isRateLimited_(e)) {
          throw new Error('잠시 뒤 다시 시도하세요.\n\n' +
            '리포트 요청이 호출 제한에 걸렸습니다 (권한 문제가 아닙니다).\n\n' + String(e));
        }
        throw new Error('주문 리포트를 요청할 수 없습니다.\n\n' + String(e) + '\n\n' +
          '이 리포트에는 "재고 및 주문 추적" 역할이 필요합니다.\n' +
          '[⚙ 설정 → SP-API 권한 진단]으로 확인하세요.');
      }
      reportId = created.reportId;
      props.setProperty(PROP_ORDR_REPORT, reportId);
      log_('orders', 'INFO', '주문 리포트 생성 ' + reportId + ' (' + from + '~' + to + ')');
    }

    while (Date.now() - t0 < ORDR_SOFT_MS) {
      var info = spapi_(token, 'get', '/reports/2021-06-30/reports/' + reportId);
      if (info.processingStatus === 'DONE') { docId = info.reportDocumentId; break; }
      if (info.processingStatus === 'FATAL' || info.processingStatus === 'CANCELLED') {
        props.deleteProperty(PROP_ORDR_REPORT);
        ordrScheduleContinue_(true);
        throw new Error('리포트 처리 실패: ' + info.processingStatus + ' (' + from + '~' + to + ')');
      }
      Utilities.sleep(ORDR_POLL_SLEEP_MS);
    }
    if (!docId) {
      ordrScheduleContinue_(true);
      log_('orders', 'INFO', '리포트 생성 대기 — 1분 뒤 자동 재시도');
      if (interactive) {
        ui_().alert('주문 수집 — 리포트 준비 중',
          '아마존이 리포트를 만들고 있습니다 (오류 아님).\n\n' +
          '남은 구간 ' + queue.length + '개\n' +
          '1분 뒤 자동으로 이어받습니다. 창을 닫아두셔도 됩니다.',
          ui_().ButtonSet.OK);
      }
      return;
    }
    props.setProperty(PROP_ORDR_DOC, docId);
    props.deleteProperty(PROP_ORDR_REPORT);
  }

  // ── 2단계: 내려받아 적재 ──
  var doc = spapi_(token, 'get', '/reports/2021-06-30/documents/' + docId);
  var blob = UrlFetchApp.fetch(doc.url, { muteHttpExceptions: true }).getBlob();
  var text = (doc.compressionAlgorithm === 'GZIP')
    ? Utilities.ungzip(blob.setContentType('application/x-gzip')).getDataAsString('UTF-8')
    : blob.getDataAsString('UTF-8');

  var rows = parseOrdersReport_(text);
  if (rows.length) appendOrderRows_(rows);

  // 창을 끝냈다고 기록한 뒤에 큐에서 뺀다.
  // 순서가 반대면 '큐에서는 빠졌는데 끝낸 기록도 없는' 창이 생겨 영영 안 받는다.
  var done = JSON.parse(props.getProperty(PROP_ORDR_DONE) || '[]');
  if (done.indexOf(queue[0]) < 0) done.push(queue[0]);
  props.setProperty(PROP_ORDR_DONE, JSON.stringify(done));
  queue.shift();
  props.setProperty(PROP_ORDR_QUEUE, JSON.stringify(queue));
  props.deleteProperty(PROP_ORDR_DOC);

  var msg = from + '~' + to + ' — 주문 ' + rows.length + '행' +
            (queue.length ? ' · 남은 구간 ' + queue.length : ' · 완료');
  log_('orders', 'INFO', '주문 리포트 — ' + msg);
  toast_(msg);

  if (queue.length) {
    ordrScheduleContinue_(true);
    if (interactive) {
      ui_().alert('주문 수집 — 진행 중', msg + '\n\n' +
        '1분 간격으로 자동 진행됩니다. 창을 닫아두셔도 됩니다.', ui_().ButtonSet.OK);
    }
    return msg;
  }

  ordrScheduleContinue_(false);
  var pruned = pruneOrders_();          // 보관 기간을 넘긴 주문은 요약으로 접는다
  if (interactive) {
    ui_().alert('주문 수집 완료', msg +
      (pruned ? '\n\n' + pruned : '') + '\n\n' +
      '[🔄 데이터 갱신 → 환율·청구서·원가]를 실행하면\n' +
      '실측 배송비가 SKU에 붙습니다.', ui_().ButtonSet.OK);
  }
  return msg;
}

/**
 * 리포트(TSV)를 주문 탭 행으로 바꾼다.
 * 칸 이름으로 찾는다 — 리포트마다 칸 순서가 다를 수 있다.
 */
function parseOrdersReport_(text) {
  var lines = String(text).split(/\r?\n/);
  if (lines.length < 2) return [];
  var head = lines[0].split('\t');
  var idx = {};
  for (var h = 0; h < head.length; h++) idx[head[h].trim().toLowerCase()] = h;

  var cOrder = idx['amazon-order-id'];
  var cSku = idx['sku'];
  var cQty = idx['quantity'];
  var cPrice = idx['item-price'];
  var cDate = idx['purchase-date'];
  var cStatus = idx['item-status'];
  if (cOrder === undefined || cSku === undefined) {
    throw new Error('주문 리포트 형식이 예상과 다릅니다.\n' +
      '받은 칸: ' + head.slice(0, 8).join(', '));
  }

  var out = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    var f = lines[i].split('\t');
    var oid = String(f[cOrder] || '').trim();
    var sku = String(f[cSku] || '').trim();
    if (!oid || !sku) continue;
    // 취소된 줄은 팔린 게 아니다. 그대로 넣으면 판매량이 부풀고,
    // 청구서에는 없는 주문번호가 다리에 섞인다.
    var st = cStatus === undefined ? '' : String(f[cStatus] || '').trim().toLowerCase();
    if (st === 'cancelled' || st === 'canceled') continue;

    var d = cDate === undefined ? '' : String(f[cDate] || '').substring(0, 10);
    out.push([
      oid,
      sku,
      cQty === undefined ? 1 : (Number(f[cQty]) || 0),
      cPrice === undefined ? 0 : (Number(f[cPrice]) || 0),
      /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
    ]);
  }
  return out;
}

/** 주문 탭 끝에 덧붙인다 (전체를 다시 읽지 않는다) */
function appendOrderRows_(rows) {
  if (!rows.length) return 0;
  var sh = ensureSheet_(SHEET_ORDERS, ORDERS_HEADER);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ORDERS_HEADER.length).setValues(rows);
  return rows.length;
}

function ordrScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ORDR_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ORDR_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

function ordrClearRun_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_ORDR_QUEUE);
  props.deleteProperty(PROP_ORDR_REPORT);
  props.deleteProperty(PROP_ORDR_DOC);
  ordrScheduleContinue_(false);
}


/** 메뉴: 주문 수집 기록 지우기 (같은 기간을 다시 받고 싶을 때) */
function ordersReportResetDone() {
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty(PROP_ORDR_DONE) || '[]');
  var ans = ui_().alert('주문 수집 기록 지우기',
    '지금까지 받은 구간 ' + done.length + '개의 기록을 지웁니다.\n\n' +
    '주문 탭의 자료는 지우지 않습니다 —\n' +
    '같은 기간을 다시 받으면 그 기간이 두 번 들어갑니다.\n' +
    '(이 리포트에는 줄을 구분할 고유번호가 없어 자동으로 못 거릅니다)\n\n' +
    '계속할까요?', ui_().ButtonSet.YES_NO);
  if (ans !== ui_().Button.YES) return;
  props.deleteProperty(PROP_ORDR_DONE);
  toast_('수집 기록을 지웠습니다.');
}
