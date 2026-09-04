/**
 * 72B_광고보관.gs — 광고실적 보관 기간과 요약
 *
 * ── 왜 주문보다 급한가 ──────────────────────────────────
 * 광고실적은 '날짜 × 광고한 SKU' 한 줄씩이라 가장 빨리 큰다.
 * 실측(2026-08-06): 30일 남짓 받았는데 벌써 148,471행 — 주문(41,050)의 3.6배다.
 * 이대로 몇 달 받으면 백만 행이 된다.
 *
 * ── 무엇을 잃고 무엇을 지키는가 ────────────────────────
 * 지금 광고 자료를 쓰는 곳은 adsSpendIn_ 하나뿐이고, 하는 일은
 * '고른 기간 동안 SKU별로 광고비·광고매출·노출·클릭·주문을 더하기'다.
 * 날짜별로 쪼개 보는 기능은 없다 — 즉 오래된 구간은 월 단위로 접어도
 * TACOS·ACOS 계산 결과가 똑같다.
 *
 * 그래서 최근 것만 날짜별로 두고, 그보다 오래된 건 SKU×월 합계로 접는다.
 * 접힌 달을 포함한 기간을 분석하면 요약에서 꺼내 쓰므로 숫자가 비지 않는다.
 */

var SHEET_ADSUM = '광고요약';
var ADSUM_HEADER = ['연월', 'SKU', '캠페인 수', '광고비(JPY)', '광고매출(JPY)',
                    '노출', '클릭', '광고주문'];
var AS_MONTH = 0, AS_SKU = 1, AS_NCAMP = 2, AS_COST = 3, AS_SALES = 4,
    AS_IMPR = 5, AS_CLICK = 6, AS_ORD = 7;

var PROP_ADS_KEEP_DAYS = 'ADS_KEEP_DAYS';

/**
 * 날짜별로 남길 기간 (일).
 *
 * 90일이면 실측 기준 약 45만 행이다. 더 짧게 잡아도 분석 결과는 같고
 * (요약이 대신하므로) 표만 가벼워진다.
 */
var ADS_KEEP_DAYS_DEFAULT = 90;

function adsRetentionDays_() {
  var v = parseInt(PropertiesService.getScriptProperties()
    .getProperty(PROP_ADS_KEEP_DAYS) || '', 10);
  return (v >= 7 && v <= 1095) ? v : ADS_KEEP_DAYS_DEFAULT;
}

/**
 * 보관 기간을 넘긴 광고 행을 SKU×월 합계로 접고 광고실적에서 지운다.
 * 광고비 수집이 끝날 때마다 자동으로 부른다.
 *
 * @return {string} 한 일 (없으면 '')
 */
function pruneAds_() {
  var days = adsRetentionDays_();
  var sh = ss_().getSheetByName(SHEET_ADS);
  if (!sh || sh.getLastRow() < 2) return '';

  var cutoff = ymd_(new Date(Date.now() - days * 86400000));
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADS_HEADER.length).getValues();

  var keep = [], agg = {}, oldCount = 0, undated = 0;
  for (var i = 0; i < v.length; i++) {
    var d = v[i][AD_DATE];
    var ds = (d instanceof Date) ? ymd_(d) : String(d || '').substring(0, 10);
    // 날짜를 모르는 줄은 접지 않는다 — 어느 달로 보낼지 알 수 없다
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) { keep.push(v[i]); undated++; continue; }
    if (ds >= cutoff) { keep.push(v[i]); continue; }

    var sku = String(v[i][AD_SKU] || '').trim();
    if (!sku) { oldCount++; continue; }
    var key = ds.substring(0, 7) + '|' + sku;
    if (!agg[key]) agg[key] = { cost: 0, sales: 0, impr: 0, click: 0, ord: 0, camp: {} };
    var cp = String(v[i][AD_CAMP] || '').trim();
    if (cp) agg[key].camp[cp] = true;
    // adsNum_ — 날짜 서식이 잘못 걸린 칸을 숫자로 되돌린다.
    // 접어 넣은 요약은 되돌릴 수 없으므로 여기서 틀리면 영구히 틀린다.
    agg[key].cost += adsNum_(v[i][AD_COST]);
    agg[key].sales += adsNum_(v[i][AD_SALES]);
    agg[key].impr += adsNum_(v[i][AD_IMPR]);
    agg[key].click += adsNum_(v[i][AD_CLICK]);
    agg[key].ord += adsNum_(v[i][AD_ORD]);
    oldCount++;
  }
  if (!oldCount) return '';

  var keys = Object.keys(agg);
  if (keys.length) {
    var sum = ensureSheet_(SHEET_ADSUM, ADSUM_HEADER);
    // 이미 접어둔 달과 겹치면 더한다.
    // 접은 줄은 원본에서 지우므로 같은 행이 두 번 접힐 수 없다 —
    // 겹친다는 건 그 달의 다른 날이 뒤늦게 들어왔다는 뜻이다.
    var prev = {};
    if (sum.getLastRow() > 1) {
      var sv = sum.getRange(2, 1, sum.getLastRow() - 1, ADSUM_HEADER.length).getValues();
      for (var s = 0; s < sv.length; s++) {
        var k2 = String(sv[s][AS_MONTH]).trim() + '|' + String(sv[s][AS_SKU]).trim();
        if (agg[k2]) {
          agg[k2].cost += Number(sv[s][AS_COST]) || 0;
          agg[k2].sales += Number(sv[s][AS_SALES]) || 0;
          agg[k2].impr += Number(sv[s][AS_IMPR]) || 0;
          agg[k2].click += Number(sv[s][AS_CLICK]) || 0;
          agg[k2].ord += Number(sv[s][AS_ORD]) || 0;
        } else {
          prev[k2] = sv[s];
        }
      }
    }
    var rows = [];
    for (var p in prev) rows.push(prev[p]);
    for (var k = 0; k < keys.length; k++) {
      var parts = keys[k].split('|');
      var a = agg[keys[k]];
      rows.push([parts[0], parts[1], countKeys_(a.camp) || '',
                 Math.round(a.cost), Math.round(a.sales), a.impr, a.click, a.ord]);
    }
    rows.sort(function (x, y) {
      return String(x[AS_MONTH]) < String(y[AS_MONTH]) ? -1 : 1;
    });
    writeTable_(sum, ADSUM_HEADER, rows);
  }

  writeTable_(sh, ADS_HEADER, keep);
  var msg = days + '일 지난 광고 ' + oldCount.toLocaleString() + '행을 ' +
            keys.length.toLocaleString() + '행 요약으로 접었습니다' +
            (undated ? ' (날짜 없는 ' + undated + '행은 그대로 둠)' : '');
  log_('ads', 'INFO', msg);
  return msg;
}

/**
 * 접어둔 요약에서 기간에 드는 달을 꺼낸다.
 *
 * 요약은 월 단위라 '그 달이 통째로 기간 안에 드는 경우'만 쓴다.
 * 반쯤 걸치면 넣을지 뺄지 정할 근거가 없어, 넣으면 과대·빼면 과소가 된다.
 *
 * @return {{cost, sales, impr, clicks, ord, months:Array<string>}}
 */
function adsSummaryIn_(from, to) {
  var out = { cost: {}, sales: {}, impr: {}, clicks: {}, ord: {}, months: [] };
  var sh = ss_().getSheetByName(SHEET_ADSUM);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSUM_HEADER.length).getValues();
  var seen = {};

  for (var i = 0; i < v.length; i++) {
    var mon = String(v[i][AS_MONTH] || '').trim();
    var sku = String(v[i][AS_SKU] || '').trim();
    if (!/^\d{4}-\d{2}$/.test(mon) || !sku) continue;

    // 그 달의 1일과 말일이 둘 다 기간 안에 들어야 쓴다
    var first = mon + '-01';
    var y = Number(mon.substring(0, 4)), m = Number(mon.substring(5, 7));
    var last = ymd_(new Date(y, m, 0));            // 다음 달 0일 = 이번 달 말일
    if (from && first < from) continue;
    if (to && last > to) continue;

    if (!seen[mon]) { seen[mon] = true; out.months.push(mon); }
    out.cost[sku] = (out.cost[sku] || 0) + (Number(v[i][AS_COST]) || 0);
    out.sales[sku] = (out.sales[sku] || 0) + (Number(v[i][AS_SALES]) || 0);
    out.impr[sku] = (out.impr[sku] || 0) + (Number(v[i][AS_IMPR]) || 0);
    out.clicks[sku] = (out.clicks[sku] || 0) + (Number(v[i][AS_CLICK]) || 0);
    out.ord[sku] = (out.ord[sku] || 0) + (Number(v[i][AS_ORD]) || 0);
  }
  out.months.sort();
  return out;
}

/**
 * 요약에서 고른 달만 SKU별로 더한다.
 * @param {Object} pick {'2026-06': true, ...}
 */
function adsSummaryMonths_(pick) {
  var out = { cost: {}, sales: {}, impr: {}, clicks: {}, ord: {} };
  var sh = ss_().getSheetByName(SHEET_ADSUM);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSUM_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var mon = String(v[i][AS_MONTH] || '').trim();
    var sku = String(v[i][AS_SKU] || '').trim();
    if (!pick[mon] || !sku) continue;
    out.cost[sku] = (out.cost[sku] || 0) + (Number(v[i][AS_COST]) || 0);
    out.sales[sku] = (out.sales[sku] || 0) + (Number(v[i][AS_SALES]) || 0);
    out.impr[sku] = (out.impr[sku] || 0) + (Number(v[i][AS_IMPR]) || 0);
    out.clicks[sku] = (out.clicks[sku] || 0) + (Number(v[i][AS_CLICK]) || 0);
    out.ord[sku] = (out.ord[sku] || 0) + (Number(v[i][AS_ORD]) || 0);
  }
  return out;
}

/** 메뉴: 광고 보관 정리 */
function pruneAdsMenu() {
  var days = adsRetentionDays_();
  var sh = ss_().getSheetByName(SHEET_ADS);
  var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
  var sum = ss_().getSheetByName(SHEET_ADSUM);
  var sn = sum ? Math.max(sum.getLastRow() - 1, 0) : 0;

  var res = ui_().prompt('광고 보관 정리',
    '광고실적: ' + n.toLocaleString() + '행  (날짜 × SKU 한 줄씩이라 가장 빨리 큽니다)\n' +
    '광고요약: ' + sn.toLocaleString() + '행\n' +
    '현재 보관: ' + days + '일\n\n' +
    '기간을 넘긴 줄은 SKU×월 합계로 접어 "광고요약"에 넣습니다.\n' +
    'TACOS·ACOS는 기간 합계로 계산하므로 접어도 결과가 같습니다\n' +
    '(달 단위로 딱 떨어지는 기간을 볼 때).\n\n' +
    '보관할 일수를 넣으세요 (그냥 [확인]이면 ' + days + '일):',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var raw = String(res.getResponseText()).trim();
  if (raw) {
    var d = parseInt(raw, 10);
    if (!(d >= 7 && d <= 1095)) { ui_().alert('7 ~ 1095 사이로 넣으세요.'); return; }
    PropertiesService.getScriptProperties().setProperty(PROP_ADS_KEEP_DAYS, String(d));
    days = d;
  }

  var msg = pruneAds_();
  ui_().alert('광고 보관 정리',
    msg || (days + '일 안쪽 자료뿐이라 접을 것이 없습니다.'), ui_().ButtonSet.OK);
  return msg;
}
