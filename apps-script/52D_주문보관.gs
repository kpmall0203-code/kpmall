/**
 * 52D_주문보관.gs — 주문 탭 보관 기간과 요약
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 주문은 월 1만 행씩 쌓인다. 셀 개수 한도(1,000만)는 15년쯤 걸려 문제가 아닌데,
 * 진짜 벽은 '읽는 비용'이다. 주문 탭을 통째로 읽는 곳이 여덟 군데인데,
 * 24만 행쯤 되면 읽을 때마다 눈에 띄게 느려지고 36만 행에서는 메모리 한도에 걸린다.
 *
 * ── 무엇을 남기고 무엇을 접는가 ────────────────────────
 * 주문 탭에만 있는 고유한 값은 '주문번호 ↔ SKU' 하나다.
 * 청구서의 실측 배송비를 SKU에 붙일 때 쓴다. 판매량·매출은 이제 판매실적이 준다.
 *
 * 기준은 두 가지다 — 몇 달 전 청구서까지 다시 검증할 것인가, 그리고
 * 계절성을 보려면 몇 달이 필요한가.
 *
 * 계절성 쪽이 더 길다. 작년 8월과 올해 8월을 견주려면 같은 달이 두 번 들어와야 하고,
 * 그러려면 최소 24개월이다. 18개월이면 작년 같은 달이 없어 '작년보다 나은가'를
 * 아예 물을 수 없다. 그래서 기본을 24개월로 둔다.
 *
 * 그보다 오래된 주문은 지우기 전에 SKU×월 합계로 접어 '주문요약'에 넣는다.
 * 요약은 접혀도 월 단위라 계절성 계산에는 그대로 쓸 수 있다 —
 * 즉 24개월은 '낱개로 들고 있을 기간'이지 '기억하는 기간'이 아니다.
 *
 * 요약을 판매실적에 넣지 않고 따로 두는 이유:
 * 판매실적에 같은 달 리포트 행이 이미 있으면 두 번 세어진다.
 */

var SHEET_ORDSUM = '주문요약';
var ORDSUM_HEADER = ['연월', 'SKU', '수량', '금액(JPY)'];
var OS_MONTH = 0, OS_SKU = 1, OS_QTY = 2, OS_AMT = 3;

var PROP_ORD_KEEP_MONTHS = 'ORD_KEEP_MONTHS';
/**
 * 낱개(주문번호 단위)로 남길 기간.
 * 24개월이면 작년 같은 달이 들어와 계절성을 견줄 수 있다.
 * 이보다 오래된 것도 SKU×월 요약으로는 계속 남는다.
 */
var ORD_KEEP_MONTHS_DEFAULT = 24;

function ordersRetentionMonths_() {
  var v = parseInt(PropertiesService.getScriptProperties()
    .getProperty(PROP_ORD_KEEP_MONTHS) || '', 10);
  return (v >= 1 && v <= 120) ? v : ORD_KEEP_MONTHS_DEFAULT;
}

/**
 * 보관 기간을 넘긴 주문을 SKU×월 합계로 접고 주문 탭에서 지운다.
 * 수집이 끝날 때마다 자동으로 부른다.
 *
 * @return {string} 한 일 (없으면 '')
 */
function pruneOrders_() {
  var months = ordersRetentionMonths_();
  var sh = ss_().getSheetByName(SHEET_ORDERS);
  if (!sh || sh.getLastRow() < 2) return '';

  var cutoff = monthsAgo_(months);          // 이 날짜보다 오래된 것을 접는다
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ORDERS_HEADER.length).getValues();

  var keep = [], agg = {}, oldCount = 0, undated = 0;
  for (var i = 0; i < v.length; i++) {
    var d = v[i][OD_DATE];
    var ds = (d instanceof Date) ? ymd_(d) : String(d || '').substring(0, 10);
    // 날짜를 모르는 줄은 접지 않는다. 언제 것인지 모르는 걸 지우면 되돌릴 수 없다.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) { keep.push(v[i]); undated++; continue; }
    if (ds >= cutoff) { keep.push(v[i]); continue; }

    var sku = String(v[i][OD_SKU] || '').trim();
    if (!sku) { oldCount++; continue; }      // SKU 없는 옛날 줄은 접을 값이 없다
    var key = ds.substring(0, 7) + '|' + sku;
    if (!agg[key]) agg[key] = { qty: 0, amt: 0 };
    agg[key].qty += Number(v[i][OD_QTY]) || 0;
    agg[key].amt += Number(v[i][OD_PRICE]) || 0;
    oldCount++;
  }
  if (!oldCount) return '';

  var keys = Object.keys(agg);
  if (keys.length) {
    var sum = ensureSheet_(SHEET_ORDSUM, ORDSUM_HEADER);
    // 이미 접어둔 달과 겹치면 '더한다'.
    // 접은 줄은 주문 탭에서 지우므로 같은 주문이 두 번 접힐 수 없다.
    // 겹친다는 건 그 달의 다른 주문이 뒤늦게 들어왔다는 뜻이라, 갈아끼우면 앞의 것이 사라진다.
    var prev = {};
    if (sum.getLastRow() > 1) {
      var sv = sum.getRange(2, 1, sum.getLastRow() - 1, ORDSUM_HEADER.length).getValues();
      for (var s = 0; s < sv.length; s++) {
        var k2 = String(sv[s][OS_MONTH]).trim() + '|' + String(sv[s][OS_SKU]).trim();
        if (agg[k2]) {
          agg[k2].qty += Number(sv[s][OS_QTY]) || 0;
          agg[k2].amt += Number(sv[s][OS_AMT]) || 0;
        } else {
          prev[k2] = sv[s];
        }
      }
    }
    var rows = [];
    for (var p in prev) rows.push(prev[p]);
    for (var k = 0; k < keys.length; k++) {
      var parts = keys[k].split('|');
      rows.push([parts[0], parts[1], agg[keys[k]].qty, agg[keys[k]].amt]);
    }
    rows.sort(function (a, b) {
      return String(a[OS_MONTH]) < String(b[OS_MONTH]) ? -1 : 1;
    });
    writeTable_(sum, ORDSUM_HEADER, rows);
  }

  writeTable_(sh, ORDERS_HEADER, keep);
  var msg = months + '개월 지난 주문 ' + oldCount.toLocaleString() + '행을 ' +
            keys.length.toLocaleString() + '행 요약으로 접었습니다' +
            (undated ? ' (날짜 없는 ' + undated + '행은 그대로 둠)' : '');
  log_('orders', 'INFO', msg);
  return msg;
}

/**
 * 머리글 + 본문으로 시트를 다시 쓴다.
 *
 * ── clear() 를 먼저 부르지 않는 이유 ────────────────────
 * 비우고 나서 쓰는 도중에 6분 한도에 걸리면 표가 통째로 사라진다.
 * 수만 행짜리 표에서는 실제로 일어난다.
 *
 * 그래서 제자리에 덮어쓰고, 남는 꼬리만 마지막에 한 번 지운다.
 * 어느 순간에 죽어도 표는 '옛 자료 + 새 자료'이지 빈 표가 아니다.
 */
/**
 * 머리글에 칸을 하나 붙이면 그 표에 줄을 만드는 곳도 전부 같이 고쳐야 한다.
 * 실제로 광고검색어에 두 칸을 붙이고 만드는 쪽을 안 늘려
 * "데이터의 열 수는 26개인데 범위의 열 수는 28개" 로 수집이 통째로 멈췄다.
 *
 * 모자란 줄은 빈칸으로 채운다 — 뒤에 붙인 칸은 어차피 비어 있는 게 맞다.
 * 넘치는 줄은 채우지 않고 알린다 — 잘라 내면 자료가 조용히 사라지고,
 * 그건 멈추는 것보다 나쁘다.
 */
function fitRows_(name, header, rows) {
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.length === header.length) continue;
    if (r.length > header.length) {
      throw new Error('"' + name + '" 표의 ' + (i + 2) + '번째 줄이 칸을 넘습니다 — ' +
        '줄 ' + r.length + '칸 · 머리글 ' + header.length + '칸.\n' +
        '줄을 만드는 코드와 머리글이 어긋났습니다.');
    }
    while (r.length < header.length) r.push('');
  }
  return rows;
}

/**
 * 시트가 머리글보다 좁으면 넓힌다.
 *
 * 새 시트는 26칸으로 시작한다. 머리글에 칸을 붙이다 그 수를 넘기면
 * getRange 가 "범위를 벗어남" 한 줄만 던져서, 원인이 칸 수라는 것을 알기 어렵다.
 */
function fitCols_(sh, n) {
  var have = sh.getMaxColumns();
  if (have < n) sh.insertColumnsAfter(have, n - have);
  return sh;
}

function writeTable_(sh, header, rows) {
  fitRows_(sh.getName(), header, rows);
  fitCols_(sh, header.length);
  var before = sh.getLastRow();
  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  var CH = 2000;
  for (var i = 0; i < rows.length; i += CH) {
    var part = rows.slice(i, i + CH);
    sh.getRange(2 + i, 1, part.length, header.length).setValues(part);
  }
  // 줄어든 만큼 꼬리를 지운다 (deleteRows 는 호출 수가 비용이라 한 번에)
  var after = rows.length + 1;
  if (before > after) sh.deleteRows(after + 1, before - after);
  sh.setFrozenRows(1);
}

function monthsAgo_(n) {
  var d = new Date();
  d.setMonth(d.getMonth() - n);
  return ymd_(d);
}

/** 메뉴: 주문 보관 정리 */
function pruneOrdersMenu() {
  var months = ordersRetentionMonths_();
  var sh = ss_().getSheetByName(SHEET_ORDERS);
  var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;

  var res = ui_().prompt('주문 보관 정리',
    '현재 주문 탭: ' + n.toLocaleString() + '행\n' +
    '보관 기간: ' + months + '개월\n\n' +
    '기간을 넘긴 주문은 SKU×월 합계로 접어 "주문요약"에 넣고\n' +
    '주문 탭에서 지웁니다. 판매 추이는 남고 탭은 가벼워집니다.\n\n' +
    '접고 나면 그 기간 청구서는 주문번호로 SKU를 못 찾습니다.\n\n' +
    '보관할 개월 수를 넣으세요 (그냥 [확인]이면 ' + months + '개월):',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var raw = String(res.getResponseText()).trim();
  if (raw) {
    var m = parseInt(raw, 10);
    if (!(m >= 1 && m <= 120)) { ui_().alert('1 ~ 120 사이로 넣으세요.'); return; }
    PropertiesService.getScriptProperties().setProperty(PROP_ORD_KEEP_MONTHS, String(m));
    months = m;
  }

  var msg = pruneOrders_();
  ui_().alert('주문 보관 정리',
    msg || (months + '개월 안쪽 주문뿐이라 접을 것이 없습니다.'), ui_().ButtonSet.OK);
}

/**
 * 주문 탭에서 '기간 안의 행만' 읽는다.
 *
 * 분석은 늘 특정 기간을 대상으로 하는데, 주문 탭은 보관 기간(4만+ 행)만큼 크다.
 * 통읽기 대신 날짜 칸 하나(1/5 비용)를 먼저 훑어 구간의 처음과 끝을 찾고,
 * 그 블록만 전체 폭으로 읽는다. 주문은 30일 창 단위로 이어 붙어 대체로
 * 날짜순이라 블록이 기간 크기에 비례한다 — 표가 커져도 읽기는 안 커진다.
 *
 * @param {string} from 'YYYY-MM-DD' (비우면 처음부터)
 * @param {string} to   'YYYY-MM-DD' (비우면 끝까지)
 * @return {Array} ORDERS_HEADER 폭의 행 (기간 밖·날짜 없는 행은 걸러짐)
 */
function ordersInRange_(from, to) {
  var sh = ss_().getSheetByName(SHEET_ORDERS);
  if (!sh || sh.getLastRow() < 2) return [];
  var n = sh.getLastRow() - 1;
  var dcol = sh.getRange(2, OD_DATE + 1, n, 1).getValues();

  var norm = function (d) {
    if (!d) return '';
    var s = (d instanceof Date) ? ymd_(d) : String(d).substring(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };
  var lo = -1, hi = -1;
  for (var i = 0; i < n; i++) {
    var ds = norm(dcol[i][0]);
    if (!ds) continue;
    if ((from && ds < from) || (to && ds > to)) continue;
    if (lo < 0) lo = i;
    hi = i;
  }
  if (lo < 0) return [];

  var v = sh.getRange(2 + lo, 1, hi - lo + 1, ORDERS_HEADER.length).getValues();
  var out = [];
  for (var k = 0; k < v.length; k++) {
    var ds2 = norm(v[k][OD_DATE]);
    if (!ds2) continue;                          // 블록 안에 섞인 밖 행 거르기
    if ((from && ds2 < from) || (to && ds2 > to)) continue;
    out.push(v[k]);
  }
  return out;
}

/**
 * 접어둔 요약에서 SKU별 '월평균' 판매수량.
 *
 * 합계가 아니라 월평균으로 돌려주는 게 중요하다.
 * 이 값은 monthlySalesMap_(월평균)과 합쳐져 판매량 순위를 만드는데,
 * 한쪽은 합계 한쪽은 평균이면 오래 판 SKU가 무조건 위로 올라가 순위가 뒤틀린다.
 *
 * 나눗셈의 분모는 요약에 들어 있는 서로 다른 달의 수다.
 * 그 달에 안 팔린 SKU도 분모에는 들어가야 '월평균'이 된다.
 */
function ordersSummaryMonthly_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ORDSUM);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ORDSUM_HEADER.length).getValues();
  var months = {}, total = {};
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][OS_SKU] || '').trim();
    var mon = String(v[i][OS_MONTH] || '').trim();
    if (!sku || !mon) continue;
    months[mon] = true;
    total[sku] = (total[sku] || 0) + (Number(v[i][OS_QTY]) || 0);
  }
  var nMon = Object.keys(months).length || 1;
  for (var k in total) out[k] = total[k] / nMon;
  return out;
}
