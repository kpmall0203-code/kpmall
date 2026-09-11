/**
 * 78D_신규광고_실적.gs — 신규 SKU 의 날짜별 실적
 *
 * ── 왜 리포트를 또 부르지 않나 ──────────────────────────
 * 기획서 §10 은 '트랙 N 캠페인만 걸러 하루 한 번 따로 받는다' 고 적었다. 실제 코드를
 * 보니 그럴 필요가 없었다 — `spAdvertisedProduct` 리포트는 **광고한 SKU 를 전부**
 * 돌려주고, `campaignName`·`campaignId` 칸까지 이미 받고 있다 (72_광고 ADS_COLUMNS).
 * 상위 N 개만 남는 것은 받을 때가 아니라 **적을 때**다 (parseAdsReport_ 의 keepSku) —
 * 셀 한도 때문에 낱개 줄을 상위 몇 개로 줄이는 것이다.
 *
 * 그러니 같은 리포트를 한 번 더 부를 이유가 없다. 이미 손에 든 줄에서 트랙 N 것만
 * 골라 새 파일에 적는다. 리포트 요청이 하나 늘지 않고, 두 수집이 서로 어긋날 수도 없다.
 *
 * ── 무엇으로 트랙 N 을 알아보나 ─────────────────────────
 * 캠페인 이름이 'KP NEW B' 로 시작하거나, 계획 표(트랙 N)에 적힌 캠페인ID 와 같으면
 * 우리 것이다. 이름만 보면 안 되는 이유: 아마존이 `campaignName` 칸을 거절하면
 * 72_광고 가 `campaignId` 만 받는 단계로 물러선다 (ADS_LEVEL_COLS). 그때는 이름이 없다.
 *
 * ── 성숙 ────────────────────────────────────────────────
 * 클릭일 + 14일(귀속) + 2일(보고 지연) = 16일. 그 전 날짜는 '잠정' 이고 판정에 쓰지 않는다.
 * EXPAND 와 같은 잣대다 (SPEND_ATTRIB_DAYS · SPEND_REPORT_LAG_DAYS).
 */

var NA_SHEET_PERF = '신규광고일별';
var NA_PERF_HEADER = ['날짜', 'SKU', 'ASIN', '캠페인', '광고비(JPY)', '광고매출(JPY)',
                      '노출', '클릭', '주문', '성숙', '수집일시'];
var NA_P_DATE = 0, NA_P_SKU = 1, NA_P_ASIN = 2, NA_P_CAMP = 3, NA_P_COST = 4,
    NA_P_SALES = 5, NA_P_IM = 6, NA_P_CK = 7, NA_P_OD = 8, NA_P_MATURE = 9, NA_P_AT = 10;

/**
 * 트랙 N 캠페인을 알아보는 잣대. 이름 앞머리와 계획 표의 캠페인ID 둘 다 본다.
 * @return {{prefix:string, cids:Object}}
 */
function naOurCampaigns_() {
  var out = { prefix: NA_POOL_PREFIX, cids: {} };
  try {
    var sh = ss_().getSheetByName(SHEET_ADPLAN);
    if (!sh || sh.getLastRow() < 2) return out;
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][AP_TRACK - 1]).trim() !== NA_TRACK) continue;
      var cid = String(v[i][AP_CID - 1] || '').trim();
      if (cid) out.cids[cid] = true;
    }
  } catch (e) { log_('newads', 'WARN', '계획 표를 못 읽어 캠페인ID 로는 못 가릅니다: ' + String(e).substring(0, 100)); }
  return out;
}

/** 이 리포트 줄이 우리 것인가 */
function naIsOurs_(ours, campName, campId) {
  if (campId && ours.cids[String(campId).trim()]) return true;
  var n = String(campName || '').trim();
  return !!(n && n.indexOf(ours.prefix) === 0);
}

/**
 * 리포트에서 골라낸 트랙 N 줄을 새 파일에 적는다.
 * 같은 기간을 다시 받으면 그 기간을 갈아끼운다 (72_광고 writeAdsRows_ 와 같은 방식).
 * @param {Array} rows [[날짜,SKU,ASIN,캠페인,광고비,광고매출,노출,클릭,주문], ...]
 * @return {number} 적은 줄 수
 */
function naPerfWrite_(rows, from, to) {
  if (!rows || !rows.length) return 0;
  var sh = naSheet_(NA_SHEET_PERF, NA_PERF_HEADER);
  var today = ymd_(new Date()), now = new Date();
  var keep = [];
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, NA_PERF_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var d = adYmd_(v[i][NA_P_DATE]);
      if (!d) continue;
      if (from && to && d >= from && d <= to) continue;      // 이번에 받은 기간은 버린다
      keep.push(v[i]);
    }
  }
  var add = [];
  for (var r = 0; r < rows.length; r++) {
    var x = rows[r], d2 = String(x[0]).substring(0, 10);
    add.push([d2, x[1], x[2], x[3], x[4], x[5], x[6], x[7], x[8],
              adSpendMature_(d2, today) ? '성숙' : '잠정', now]);
  }
  var all = keep.concat(add);
  all.sort(function (a, b) { return String(a[NA_P_DATE]) < String(b[NA_P_DATE]) ? -1 : 1; });
  writeTable_(sh, NA_PERF_HEADER, all);
  try {
    sh.getRange(2, NA_P_SKU + 1, all.length, 3).setNumberFormat('@');   // SKU·ASIN·캠페인
    sh.getRange(2, NA_P_DATE + 1, all.length, 1).setNumberFormat('yyyy-mm-dd');
  } catch (e) {}
  log_('newads', 'INFO', '신규 실적 — ' + add.length + '줄 (' + from + '~' + to + ')');
  return add.length;
}

/**
 * 신규광고일별 → SKU 별 합계. 성숙한 것과 전부를 따로 센다 —
 * 판정은 성숙한 것만 본다. 아직 안 익은 매출로 '벌고 있다' 고 하지 않는다.
 * @return {{bySku:Object, last:string, has:boolean}}
 */
function naPerfBySku_() {
  var out = { bySku: {}, last: '', has: false };
  var sh = naSS_().getSheetByName(NA_SHEET_PERF);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, NA_PERF_HEADER.length).getValues();
  var today = ymd_(new Date());
  for (var i = 0; i < v.length; i++) {
    var d = adYmd_(v[i][NA_P_DATE]);
    var sku = String(v[i][NA_P_SKU] || '').trim();
    if (!d || !sku) continue;
    var o = out.bySku[sku] || (out.bySku[sku] = {
      cost: 0, sales: 0, im: 0, ck: 0, od: 0,
      mCost: 0, mSales: 0, mIm: 0, mCk: 0, mOd: 0, days: {}, last: '', first: '' });
    var cost = Number(v[i][NA_P_COST]) || 0, sales = Number(v[i][NA_P_SALES]) || 0;
    var im = Number(v[i][NA_P_IM]) || 0, ck = Number(v[i][NA_P_CK]) || 0, od = Number(v[i][NA_P_OD]) || 0;
    o.cost += cost; o.sales += sales; o.im += im; o.ck += ck; o.od += od;
    o.days[d] = { im: im, ck: ck, cost: cost };
    if (!o.first || d < o.first) o.first = d;
    if (d > o.last) o.last = d;
    // 성숙은 날짜로 다시 센다 — 시트의 [성숙] 칸은 적은 날 기준이라 시간이 지나면 낡는다
    if (adSpendMature_(d, today)) {
      o.mCost += cost; o.mSales += sales; o.mIm += im; o.mCk += ck; o.mOd += od;
    }
    if (d > out.last) out.last = d;
  }
  out.has = out.last !== '';
  return out;
}

/** 최근 완료일 n 개의 노출·클릭 합 (오늘과 어제는 자료가 덜 찼으니 뺀다) */
function naRecent_(o, nDays, todayYmd) {
  var ds = [];
  for (var d in o.days) if (daysBetween_(d, todayYmd) >= 2) ds.push(d);
  ds.sort(); ds = ds.slice(-Math.max(1, nDays));
  var s = { im: 0, ck: 0, cost: 0, days: ds.length };
  for (var i = 0; i < ds.length; i++) {
    s.im += o.days[ds[i]].im; s.ck += o.days[ds[i]].ck; s.cost += o.days[ds[i]].cost;
  }
  return s;
}
