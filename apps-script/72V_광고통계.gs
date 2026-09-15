/**
 * 72V_광고통계.gs — 프로그램별로 "얼마 써서 얼마 벌었나" 를 날짜별 표와 그래프로
 *
 * 세 프로그램(🆕 신규 · 🔁 기존 · 🌱 새 상품 키우기)과 전체를 날마다 한 줄로 접는다:
 *   광고비 · 광고매출 · 매출(그 프로그램이 광고하는 SKU 의 전체 매출) · ACOS · TACOS · TACOS 7일
 *
 * ── 어디서 오나 ──────────────────────────────────────
 *   광고비·광고매출   지출 원장(광고캠페인일별, 매일 03시). 캠페인 → 프로그램은 계획 표의 [트랙]
 *                     (N=신규 · B=키우기 · 그 밖 + 우리가 안 만든 것=기존).
 *   매출              판매실적의 '하루짜리' 줄(기간시작=기간종료). 매일 03시 원장 뒤에
 *                     그제까지 빠진 날을 SKU별 하루 리포트로 받는다 (salesDailyAuto_).
 *   SKU → 프로그램    계획 표의 SKU목록과 상품광고목록의 캠페인으로. 한 SKU 가 여러 프로그램에
 *                     걸치면 신규 > 키우기 > 기존 순으로 하나에만 넣는다 (매출을 두 번 안 센다).
 *
 * ── 읽는 법 ──────────────────────────────────────────
 *   ACOS  = 광고비 ÷ 광고매출 (광고가 직접 만든 매출 대비)
 *   TACOS = 광고비 ÷ 매출     (그 프로그램 SKU 의 전체 매출 대비 — 광고가 안 붙은 판매까지)
 *   하루 TACOS 는 널뛴다 (매출 0 인 날은 빈칸). 흐름은 [TACOS 7일] 로 본다.
 *   '매출' 은 그 프로그램이 광고하는 SKU 의 판매 합이지 계정 전체가 아니다 — 전체는 [전체] 줄.
 *   최근 14일은 광고매출이 아직 다 안 붙은 '잠정' 이다 (귀속 14일 + 보고 지연 2일).
 */

var SHEET_ADSTAT = '광고통계';
var SHEET_ADCHART = '📈 광고 그래프';

var ADSTAT_PROGS = [
  { key: 'N', label: '🆕 신규' },
  { key: 'A', label: '🔁 기존' },
  { key: 'B', label: '🌱 키우기' },
  { key: 'T', label: '전체' }
];
var ADSTAT_COLS = ['광고비', '광고매출', '매출', 'ACOS%', 'TACOS%', 'TACOS 7일%', '클릭', '광고주문'];
var ADSTAT_PROG_SHEETS = { N: '📈 신규', A: '📈 기존', B: '📈 키우기' };   // 프로그램마다 따로 보는 탭
var ADSTAT_CAMP_HEADER = ['캠페인 (최근 30일)', '광고비', '광고매출', 'ACOS%', '클릭', '광고주문', '날 수'];
var ADSTAT_CAMP_MAX = 40;
var ADSTAT_NC = ADSTAT_COLS.length;
var ADSTAT_HEADER = (function () {
  var h = ['날짜'];
  for (var p = 0; p < ADSTAT_PROGS.length; p++) {
    for (var c = 0; c < ADSTAT_NC; c++) h.push(ADSTAT_PROGS[p].label + ' ' + ADSTAT_COLS[c]);
  }
  h.push('성숙', '매출자료');
  return h;
})();
var ADSTAT_ROLL_DAYS = 7;
var ADSTAT_SUM_HEADER = ['구간', '프로그램', '광고비', '광고매출', '매출 (자료 있는 날만)', 'ACOS%', 'TACOS% (그 날들만)', '광고주문', '캠페인 수', '매출 자료 있는 날'];

/** 계획 표의 [트랙] → 프로그램 키 */
function adStatProgOfTrack_(track) {
  var t = String(track || '').trim().toUpperCase();
  return t === 'N' ? 'N' : (t === 'B' ? 'B' : 'A');
}
var ADSTAT_RANK = { N: 3, B: 2, A: 1 };

/** 표 안에서 (프로그램, 칸) 의 0부터 세는 열 */
function adStatCol_(pIdx, cIdx) { return 1 + pIdx * ADSTAT_NC + cIdx; }

function adStatPct_(num, den) {
  return den > 0 ? Math.round(num / den * 1000) / 10 : '';
}

/**
 * SKU → 프로그램 키. 계획 표(만든 즉시 안다)와 상품광고목록(주 1회, 우리가 안 만든 캠페인까지) 둘 다.
 * @return {Object} sku → 'N'|'B'|'A'
 */
function adStatSkuProg_(ownById) {
  var out = {};
  var put = function (sku, key) {
    if (!sku || !key) return;
    if (!out[sku] || ADSTAT_RANK[key] > ADSTAT_RANK[out[sku]]) out[sku] = key;
  };
  try {
    adPlanEachRow_(function (row) {
      if (String(row[AP_RESULT - 1]).indexOf('성공') !== 0) return;
      if (!String(row[AP_CID - 1] || '').trim()) return;
      var key = adStatProgOfTrack_(row[AP_TRACK - 1]);
      var skus = adPlanSkus_(row);
      for (var i = 0; i < skus.length; i++) put(skus[i], key);
    });
  } catch (e) { log_('ads', 'WARN', '광고통계 — 계획 표를 못 읽었습니다: ' + String(e).substring(0, 120)); }
  try {
    var units = adUnitMap_();
    for (var sku in units) {
      var ads = units[sku].ads;
      for (var a = 0; a < ads.length; a++) {
        var own = ownById[String(ads[a].cid || '').trim()];
        put(sku, own ? adStatProgOfTrack_(own.track) : 'A');
      }
    }
  } catch (e2) { log_('ads', 'WARN', '광고통계 — 상품광고목록을 못 읽었습니다: ' + String(e2).substring(0, 120)); }
  return out;
}

/**
 * 판매실적의 하루짜리 줄 → 날짜 → SKU → 판매금액. 리포트로 받은 날만 '자료 있음' 으로 친다
 * (Sales API 로 상위 몇 개만 받은 날은 세션 칸이 비어 있다 — 그 날은 전체 매출이 아니다).
 * @return {{byDay:Object, full:Object}}
 */
function adStatSalesDaily_() {
  var out = { byDay: {}, full: {} };
  var v = salesTable_();
  for (var i = 0; i < v.length; i++) {
    var f = adYmd_(v[i][SL_FROM]), t = adYmd_(v[i][SL_TO]);
    if (!f || f !== t) continue;
    var sku = String(v[i][SL_SKU] || '').trim();
    if (!sku) continue;
    var d = out.byDay[f] || (out.byDay[f] = {});
    d[sku] = (d[sku] || 0) + (Number(v[i][SL_AMT]) || 0);
    if (String(v[i][6]) !== '') out.full[f] = true;     // 세션 칸 — 리포트로 받은 줄에만 있다
  }
  return out;
}

/**
 * 표를 세운다. 시트만 읽는다 (API 없음).
 * @return {{blocked:string, days:number, last:string, salesDays:number, sum:Array}}
 */
function adStatBuild_(opts) {
  var quiet = !!(opts && opts.quiet);
  var out = { blocked: '', days: 0, last: '', salesDays: 0, sum: [], salesLast: '' };
  var led = adSpendRead_();
  if (!led.has) {
    out.blocked = '지출 원장이 비어 있습니다 — [🔄 데이터 갱신 → 지출 원장 수집] 을 먼저 하세요 (매일 03시 자동).';
    return out;
  }
  var ours = adWatchOurs_(), ownById = {};
  for (var i = 0; i < ours.length; i++) ownById[ours[i].cid] = ours[i];
  var skuProg = adStatSkuProg_(ownById);
  var sales = adStatSalesDaily_();

  // 날짜 × 프로그램 합
  var byDay = {}, today = ymd_(new Date());
  var blank = function () {
    var o = {};
    for (var p = 0; p < ADSTAT_PROGS.length; p++) o[ADSTAT_PROGS[p].key] = { cost: 0, ads: 0, ord: 0, ck: 0, rev: 0, camps: {} };
    return o;
  };
  for (var r = 0; r < led.rows.length; r++) {
    var x = led.rows[r];
    var o = byDay[x.d] || (byDay[x.d] = blank());
    var own = ownById[x.cid];
    var key = own ? adStatProgOfTrack_(own.track) : 'A';
    o[key].cost += x.cost; o[key].ads += x.sales; o[key].ord += x.ord; o[key].ck += x.ck || 0; o[key].camps[x.cid] = true;
    o.T.cost += x.cost; o.T.ads += x.sales; o.T.ord += x.ord; o.T.ck += x.ck || 0; o.T.camps[x.cid] = true;
  }
  var days = Object.keys(byDay).sort();
  for (var d = 0; d < days.length; d++) {
    var dd = days[d], o2 = byDay[dd];
    o2.hasSales = !!sales.full[dd];
    if (o2.hasSales) {
      var m = sales.byDay[dd];
      for (var sku in m) {
        var pk = skuProg[sku];
        if (pk) o2[pk].rev += m[sku];
        o2.T.rev += m[sku];                       // 전체는 광고 안 하는 SKU 까지 — 진짜 TACOS
      }
      out.salesDays++;
      if (dd > out.salesLast) out.salesLast = dd;
    }
  }

  // 표 줄 — TACOS 7일은 '매출 자료가 있는 최근 7일' 의 광고비 ÷ 매출
  var rows = [];
  for (var k = 0; k < days.length; k++) {
    var dk = days[k], ok = byDay[dk];
    var row = [dk];
    for (var p = 0; p < ADSTAT_PROGS.length; p++) {
      var pkey = ADSTAT_PROGS[p].key, g = ok[pkey];
      var rc = 0, rr = 0, n = 0;
      for (var b = k; b >= 0 && n < ADSTAT_ROLL_DAYS; b--) {
        var ob = byDay[days[b]];
        if (!ob.hasSales) continue;
        rc += ob[pkey].cost; rr += ob[pkey].rev; n++;
      }
      row.push(Math.round(g.cost), Math.round(g.ads),
               ok.hasSales ? Math.round(g.rev) : '',
               adStatPct_(g.cost, g.ads),
               ok.hasSales ? adStatPct_(g.cost, g.rev) : '',
               n ? adStatPct_(rc, rr) : '', g.ck, g.ord);
    }
    row.push(adSpendMature_(dk, today) ? '성숙' : '잠정', ok.hasSales ? '있음' : '');
    rows.push(row);
  }
  var sh = ensureSheet_(SHEET_ADSTAT, ADSTAT_HEADER);
  writeTable_(sh, ADSTAT_HEADER, rows);
  try {
    if (rows.length) {
      sh.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
      for (var p2 = 0; p2 < ADSTAT_PROGS.length; p2++) {
        sh.getRange(2, adStatCol_(p2, 0) + 1, rows.length, 3).setNumberFormat('#,##0');
        sh.getRange(2, adStatCol_(p2, 3) + 1, rows.length, 3).setNumberFormat('0.0');
        sh.getRange(2, adStatCol_(p2, 6) + 1, rows.length, 2).setNumberFormat('#,##0');
      }
    }
    sh.setFrozenColumns(1);
  } catch (eF) {}
  out.days = rows.length; out.last = led.last;

  // 구간 요약
  var last = led.last;
  var wins = [['최근 7일', addDays_(last, -6), last],
              ['최근 30일', addDays_(last, -29), last],
              ['이번 달', last.substring(0, 8) + '01', last]];
  for (var w = 0; w < wins.length; w++) {
    for (var p3 = 0; p3 < ADSTAT_PROGS.length; p3++) {
      var pk3 = ADSTAT_PROGS[p3].key;
      var sc = 0, sa = 0, sr = 0, so = 0, cps = {}, nd = 0, scRev = 0;
      for (var q = 0; q < days.length; q++) {
        var dq = days[q];
        if (dq < wins[w][1] || dq > wins[w][2]) continue;
        var oq = byDay[dq][pk3];
        sc += oq.cost; sa += oq.ads; so += oq.ord;
        for (var c in oq.camps) cps[c] = true;
        if (byDay[dq].hasSales) { sr += oq.rev; scRev += oq.cost; nd++; }
      }
      out.sum.push([wins[w][0] + ' (' + wins[w][1] + '~' + wins[w][2] + ')', ADSTAT_PROGS[p3].label,
                    Math.round(sc), Math.round(sa), nd ? Math.round(sr) : '',
                    adStatPct_(sc, sa), nd ? adStatPct_(scRev, sr) : '',
                    so, countKeys_(cps), nd]);
    }
  }
  // 프로그램 안에서 캠페인별로 — 최근 30일
  out.camps = { N: [], A: [], B: [] };
  var c30 = {}, from30 = wins[1][1];
  for (var r2 = 0; r2 < led.rows.length; r2++) {
    var x2 = led.rows[r2];
    if (x2.d < from30 || x2.d > last) continue;
    var own2 = ownById[x2.cid];
    var key2 = own2 ? adStatProgOfTrack_(own2.track) : 'A';
    var cc = c30[x2.cid] || (c30[x2.cid] = { key: key2, name: x2.name || (own2 && own2.name) || x2.cid,
                                              cost: 0, ads: 0, ck: 0, ord: 0, days: {} });
    cc.cost += x2.cost; cc.ads += x2.sales; cc.ck += x2.ck; cc.ord += x2.ord; cc.days[x2.d] = true;
  }
  for (var cid in c30) {
    var e = c30[cid];
    out.camps[e.key].push([e.name, Math.round(e.cost), Math.round(e.ads), adStatPct_(e.cost, e.ads),
                           e.ck, e.ord, countKeys_(e.days)]);
  }
  for (var kk in out.camps) out.camps[kk].sort(function (a, b) { return b[1] - a[1]; });

  // 그래프 탭은 하나씩 따로 시도한다 — 큰 통합문서에서는 시트 서비스가 이따금 '타임아웃' 을
  // 던진다 (실측 2026-09-14). 한 탭이 실패해도 표와 나머지 탭은 남기고, 한 번은 바로 다시 해 본다.
  SpreadsheetApp.flush();
  out.failed = [];
  adStatTry_(SHEET_ADCHART, out, function () { adStatCharts_(sh, rows.length, out); });
  for (var p4 = 0; p4 < ADSTAT_PROGS.length; p4++) {
    var key4 = ADSTAT_PROGS[p4].key;
    if (!ADSTAT_PROG_SHEETS[key4]) continue;
    (function (pi) { adStatTry_(ADSTAT_PROG_SHEETS[key4], out, function () { adStatProgTab_(sh, rows.length, out, pi); }); })(p4);
  }
  log_('ads', 'INFO', '광고통계 — ' + rows.length + '일 (~' + led.last + ') · 매출 자료 ' + out.salesDays + '일' +
       (out.salesLast ? ' (~' + out.salesLast + ')' : '') +
       (out.failed.length ? ' · 못 만든 탭 ' + out.failed.join(', ') : ''));
  if (!quiet) toast_('광고통계 ' + rows.length + '일 · 그래프 갱신');
  return out;
}

/** 탭 하나 만들기를 두 번까지 — 시트 서비스 타임아웃은 대개 곧 풀린다 */
function adStatTry_(label, out, fn) {
  for (var t = 0; t < 2; t++) {
    try { fn(); SpreadsheetApp.flush(); return true; }
    catch (e) {
      log_('ads', 'WARN', '광고통계 — ' + label + ' 탭 ' + (t ? '두 번째도 ' : '') + '실패: ' + String(e).substring(0, 150));
      if (t) { out.failed.push(label); return false; }
      Utilities.sleep(4000);
    }
  }
}

/** 그래프 하나를 탭에 앉힌다 — 만들다 죽어도 표는 남게 */
function adStatPutChart_(csh, chart, row, colNo) {
  try {
    csh.insertChart(chart.setPosition(row, colNo, 0, 0).setOption('width', 620).setOption('height', 300).build());
  } catch (e) { log_('ads', 'WARN', '그래프 생성 실패: ' + String(e).substring(0, 120)); }
}

/** 프로그램 하나만 따로 — 요약 · 캠페인별 표 왼쪽, 그래프 오른쪽 */
function adStatProgTab_(ssh, n, st, pIdx) {
  var prog = ADSTAT_PROGS[pIdx], key = prog.key;
  var csh = ensureSheet_(ADSTAT_PROG_SHEETS[key], ADSTAT_SUM_HEADER);
  var charts = csh.getCharts();
  for (var i = 0; i < charts.length; i++) csh.removeChart(charts[i]);
  csh.clear();
  var W = ADSTAT_SUM_HEADER.length;
  var pad = function (arr) { while (arr.length < W) arr.push(''); return arr; };
  var rows = [
    pad([prog.label + ' — 광고비 얼마 써서 얼마 벌었나']),
    pad(['자료 기준', '원장 ~' + st.last + ' · 매출(하루치) ' + (st.salesLast ? '~' + st.salesLast + ' · ' + st.salesDays + '일' : '아직 없음')]),
    pad(['읽는 법', 'ACOS = 광고비÷광고매출 · TACOS = 광고비÷매출(이 프로그램이 광고하는 SKU 의 전체 판매) · 최근 14일 광고매출은 잠정']),
    ADSTAT_SUM_HEADER.slice()
  ];
  for (var s = 0; s < st.sum.length; s++) if (st.sum[s][1] === prog.label) rows.push(st.sum[s].slice());
  var sumN = rows.length - 4;
  rows.push(pad(['']));
  var campHdrRow = rows.length + 1;
  rows.push(pad(ADSTAT_CAMP_HEADER.slice()));
  var camps = (st.camps && st.camps[key]) || [];
  for (var c = 0; c < camps.length && c < ADSTAT_CAMP_MAX; c++) rows.push(pad(camps[c].slice()));
  if (!camps.length) rows.push(pad(['(최근 30일에 이 프로그램의 지출이 없습니다)']));
  csh.getRange(1, 1, rows.length, W).setValues(rows);
  csh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  csh.getRange(4, 1, 1, W).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  csh.getRange(campHdrRow, 1, 1, W).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  if (sumN) { csh.getRange(5, 3, sumN, 3).setNumberFormat('#,##0'); csh.getRange(5, 6, sumN, 2).setNumberFormat('0.0'); }
  if (camps.length) {
    var cn = Math.min(camps.length, ADSTAT_CAMP_MAX);
    csh.getRange(campHdrRow + 1, 2, cn, 2).setNumberFormat('#,##0');
    csh.getRange(campHdrRow + 1, 4, cn, 1).setNumberFormat('0.0');
  }
  try { csh.setColumnWidth(1, 260); csh.setColumnWidth(2, 110); } catch (eW) {}
  if (!n) return;

  var col = function (cIdx) { return ssh.getRange(1, adStatCol_(pIdx, cIdx) + 1, n + 1, 1); };
  var dateCol = ssh.getRange(1, 1, n + 1, 1);
  var C = W + 2;                                  // 그래프는 표 오른쪽
  adStatPutChart_(csh, csh.newChart().asComboChart()
    .addRange(dateCol).addRange(col(0)).addRange(col(1)).addRange(col(5)).setNumHeaders(1)
    .setOption('title', prog.label + ' — 하루 광고비 · 광고매출 · TACOS 7일')
    .setOption('series', { 0: { type: 'bars', targetAxisIndex: 0 }, 1: { type: 'line', targetAxisIndex: 0 },
                           2: { type: 'line', targetAxisIndex: 1, lineDashStyle: [4, 4] } })
    .setOption('vAxes', { 0: { title: 'JPY' }, 1: { title: 'TACOS %' } })
    .setOption('legend', { position: 'top' }), 1, C);
  adStatPutChart_(csh, csh.newChart().asLineChart()
    .addRange(dateCol).addRange(col(3)).addRange(col(4)).addRange(col(5)).setNumHeaders(1)
    .setOption('title', prog.label + ' — ACOS · TACOS · TACOS 7일 (%)')
    .setOption('legend', { position: 'top' }), 17, C);
  adStatPutChart_(csh, csh.newChart().asComboChart()
    .addRange(dateCol).addRange(col(6)).addRange(col(7)).setNumHeaders(1)
    .setOption('title', prog.label + ' — 하루 클릭 · 광고주문')
    .setOption('series', { 0: { type: 'bars', targetAxisIndex: 0 }, 1: { type: 'line', targetAxisIndex: 1 } })
    .setOption('vAxes', { 0: { title: '클릭' }, 1: { title: '주문' } })
    .setOption('legend', { position: 'top' }), 33, C);
}

/** 그래프 탭 — 요약 표 위, 그래프 아래. 그래프는 광고통계 탭의 열을 그대로 본다 */
function adStatCharts_(ssh, n, st) {
  var csh = ensureSheet_(SHEET_ADCHART, ADSTAT_SUM_HEADER);
  var charts = csh.getCharts();
  for (var i = 0; i < charts.length; i++) csh.removeChart(charts[i]);
  csh.clear();

  var info = [
    ['광고비 얼마 써서 얼마 벌었나 — 프로그램별', '', '', '', '', '', '', '', '', ''],
    ['자료 기준', '원장 ~' + st.last + ' · 매출(하루치) ' + (st.salesLast ? '~' + st.salesLast + ' · ' + st.salesDays + '일' : '아직 없음 — 매일 03시부터 쌓입니다'),
     '', '', '', '', '', '', '', ''],
    ['읽는 법', 'ACOS = 광고비÷광고매출 · TACOS = 광고비÷매출(그 프로그램이 광고하는 SKU 전체 판매) · 최근 14일 광고매출은 잠정 · 하루 TACOS 는 널뛰니 7일 선으로 보세요',
     '', '', '', '', '', '', '', ''],
    ADSTAT_SUM_HEADER
  ];
  var top = info.concat(st.sum);
  csh.getRange(1, 1, top.length, ADSTAT_SUM_HEADER.length).setValues(top);
  csh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  csh.getRange(4, 1, 1, ADSTAT_SUM_HEADER.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  if (st.sum.length) {
    csh.getRange(5, 3, st.sum.length, 3).setNumberFormat('#,##0');
    csh.getRange(5, 6, st.sum.length, 2).setNumberFormat('0.0');
    // 프로그램 넷씩 한 구간 — 구간 사이에 옅은 줄
    for (var r = 0; r < st.sum.length; r += ADSTAT_PROGS.length) {
      csh.getRange(5 + r, 1, ADSTAT_PROGS.length, ADSTAT_SUM_HEADER.length)
         .setBackground(((r / ADSTAT_PROGS.length) % 2) ? '#f6f6fb' : '#ffffff');
    }
  }
  try { csh.setColumnWidth(1, 220); csh.setColumnWidth(2, 110); } catch (eW) {}
  if (!n) return;

  var anchor = top.length + 2;
  var col = function (pIdx, cIdx) { return ssh.getRange(1, adStatCol_(pIdx, cIdx) + 1, n + 1, 1); };
  var dateCol = ssh.getRange(1, 1, n + 1, 1);
  var put = function (chart, row, c) { adStatPutChart_(csh, chart, row, c); };
  // ① 프로그램마다 — 광고비(막대) · 광고매출(선) · TACOS 7일(오른쪽 축)
  for (var p = 0; p < ADSTAT_PROGS.length; p++) {
    var ch = csh.newChart().asComboChart()
      .addRange(dateCol).addRange(col(p, 0)).addRange(col(p, 1)).addRange(col(p, 5))
      .setNumHeaders(1)
      .setOption('title', ADSTAT_PROGS[p].label + ' — 하루 광고비 · 광고매출 · TACOS 7일')
      .setOption('series', { 0: { type: 'bars', targetAxisIndex: 0 },
                             1: { type: 'line', targetAxisIndex: 0 },
                             2: { type: 'line', targetAxisIndex: 1, lineDashStyle: [4, 4] } })
      .setOption('vAxes', { 0: { title: 'JPY' }, 1: { title: 'TACOS %' } })
      .setOption('legend', { position: 'top' });
    put(ch, anchor + Math.floor(p / 2) * 16, (p % 2) ? 8 : 1);
  }
  // ② TACOS 7일 — 넷을 한 그래프에
  var tc = csh.newChart().asLineChart().addRange(dateCol);
  for (var p2 = 0; p2 < ADSTAT_PROGS.length; p2++) tc.addRange(col(p2, 5));
  tc.setNumHeaders(1).setOption('title', 'TACOS 7일 — 프로그램 비교 (%)').setOption('legend', { position: 'top' });
  put(tc, anchor + 32, 1);
  // ③ 광고비 비중 — 쌓은 막대
  var sc = csh.newChart().asColumnChart().addRange(dateCol);
  for (var p3 = 0; p3 < ADSTAT_PROGS.length - 1; p3++) sc.addRange(col(p3, 0));
  sc.setNumHeaders(1).setStacked().setOption('title', '하루 광고비 — 어느 프로그램이 쓰나 (JPY)').setOption('legend', { position: 'top' });
  put(sc, anchor + 32, 8);
}

/** 메뉴: 광고 그래프 */
function showAdCharts() {
  var r = adStatBuild_({ quiet: false });
  if (r.blocked) { ui_().alert('광고 그래프', r.blocked, ui_().ButtonSet.OK); return; }
  showSheet_(SHEET_ADCHART);
  // 빠진 하루치 판매가 있으면 지금 걸어 둔다 — 매일 03시까지 안 기다려도 되게
  var kicked = '';
  try { kicked = salesDailyAuto_(); } catch (eK) { kicked = '판매 하루치 못 걸음: ' + String(eK).substring(0, 100); }
  var lines = [];
  for (var i = 0; i < r.sum.length && i < ADSTAT_PROGS.length; i++) {
    var s = r.sum[i];
    lines.push(s[1] + '  광고비 ' + fmtYen_(s[2]) + ' → 광고매출 ' + fmtYen_(s[3]) +
               (s[4] !== '' ? ' · 매출 ' + fmtYen_(s[4]) : '') +
               (s[5] !== '' ? ' · ACOS ' + s[5] + '%' : '') + (s[6] !== '' ? ' · TACOS ' + s[6] + '%' : ''));
  }
  ui_().alert('광고 그래프 — ' + SHEET_ADCHART,
    '최근 7일 (원장 ~' + r.last + ')\n' + lines.join('\n') + '\n\n' +
    '표 ' + r.days + '일 · 매출 자료 ' + r.salesDays + '일' +
    (r.salesDays ? '' : ' — 매출·TACOS 는 매일 03시 하루치 판매가 쌓이면 채워집니다') + '\n' +
    (r.failed && r.failed.length ? '⚠ 시트 서비스가 느려 못 만든 탭: ' + r.failed.join(', ') + ' — 잠시 뒤 다시 누르면 됩니다.\n' : '') +
    '넷을 견주는 그래프는 ' + SHEET_ADCHART + ' 탭, 하나씩 따로는 ' + ADSTAT_PROG_SHEETS.N + ' · ' +
    ADSTAT_PROG_SHEETS.A + ' · ' + ADSTAT_PROG_SHEETS.B + ' 탭(캠페인별 30일 표 포함), 날짜별 숫자는 ' + SHEET_ADSTAT + ' 탭.\n' +
    (kicked ? '판매 하루치: ' + kicked + ' (받히면 다음 갱신 때 매출·TACOS 가 찹니다)' : ''),
    ui_().ButtonSet.OK);
}

// ── 하루치 판매 자동 수집 ───────────────────────────────

var SALES_AUTO_LAG_DAYS = 2;      // 오늘·어제는 아직 덜 찼다 — 그제까지
var SALES_AUTO_BACK_DAYS = 10;    // 이만큼 거슬러 빠진 날을 채운다
var SALES_AUTO_MAX_DAYS = 3;      // 한 번에 몇 날까지 (리포트는 5분에 3회 — 이어받기가 2분씩 띄운다)

/**
 * 판매실적에 없는 '하루치' 를 SKU별 리포트로 걸어 둔다 — 광고통계의 매출·TACOS 가 여기서 나온다.
 * 기존 수집 기계(salesStep_ · 이어받기 트리거)를 그대로 쓴다: 큐에 'd|d' 를 넣고 1분 뒤 트리거.
 * 사람이 돌린 수집이 진행 중이면 건드리지 않는다.
 */
function salesDailyAuto_() {
  var props = PropertiesService.getScriptProperties();
  if (salesQueue_().length || props.getProperty(PROP_SALES_RANGE)) return '판매 수집이 도는 중이라 건너뜀';
  var full = adStatSalesDaily_().full;
  var to = addDays_(ymd_(new Date()), -SALES_AUTO_LAG_DAYS);
  var todo = [];
  for (var i = SALES_AUTO_BACK_DAYS - 1; i >= 0; i--) {
    var d = addDays_(to, -i);
    if (!full[d]) todo.push(d + '|' + d);
  }
  if (!todo.length) return '받을 날 없음 (~' + to + ')';
  todo = todo.slice(-SALES_AUTO_MAX_DAYS);          // 최근 날부터 — 그래프의 끝이 먼저 찬다
  props.setProperty(PROP_SALES_QUEUE, JSON.stringify(todo));
  salesScheduleContinue_(true, 60);
  return '하루치 ' + todo.length + '일 걸어 둠 (' + todo[0].split('|')[0] + '~' + todo[todo.length - 1].split('|')[0] + ')';
}
