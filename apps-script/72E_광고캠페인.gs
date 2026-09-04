/**
 * 72E_광고캠페인.gs — 캠페인 단위 실적 · 정리 후보 판정
 *
 * ── 왜 광고실적으로는 못 하는가 ─────────────────────────
 * 광고실적 탭은 '추적 SKU'만 담는다 (기본 상위 100개). 전체 7천여 SKU 중
 * 66개만 들어 있으므로, 거기서 실적이 안 보이는 캠페인은 두 가지가 섞여 있다:
 *   ① 진짜 안 도는 캠페인
 *   ② 도는데 그 SKU가 추적 밖이라 안 보이는 캠페인
 * 이 둘을 못 가르면 멀쩡한 캠페인을 끄게 된다. 그래서 캠페인 단위 리포트를
 * 따로 받는다 — 이건 SKU로 거르지 않아 계정 전체가 그대로 들어온다.
 *
 * ── 재고가 없어 멈춘 캠페인은 남긴다 ────────────────────
 * 아마존은 '왜 멈췄는지'를 알려주지 않는다. 멈춘 캠페인은 전부 똑같이 PAUSED 다.
 * 그래서 광고가 아니라 재고 쪽을 본다 — 그 캠페인이 광고하는 SKU를
 * productAds 로 알아내고, 리스팅 탭의 재고·상태와 맞춰 본다.
 * 전부 재고가 없으면 '재고 때문에 멈춘 것'으로 보고 정리 후보에서 뺀다.
 * 재고가 들어오면 다시 돌려야 하는 캠페인이라 지우면 손해다.
 *
 * ── 여기서는 아무것도 끄지 않는다 ───────────────────────
 * 판정과 근거만 표로 낸다. 실제로 멈추는 것은 사람이 승인 칸을 체크한 뒤
 * 따로 실행한다. 아마존의 보관(ARCHIVED)은 되돌릴 수 없다.
 */

var SHEET_ADCAMP = '광고캠페인';
var ADCAMP_HEADER = [
  '캠페인', '유형', '상태', '일예산(JPY)', '대상수', 'SKU수', '재고있는SKU',
  '노출', '클릭', '광고비(JPY)', '광고매출(JPY)', '주문',
  'CTR', 'CVR', 'CPC(JPY)', 'ACOS', '광고비비중', '매출비중',
  '판정', '사유', '승인', '캠페인ID'
];
var AC_APPROVE = 21;      // 승인 칸 (1부터)
var AC_ID = 22;           // 캠페인ID 칸 — 글자로 못 박는다

var ADSW_CT_PRODUCTAD = 'application/vnd.spProductAd.v3+json';

var ADCAMP_REPORT_TYPE = 'spCampaigns';
var PROP_ADCAMP_REPORT = 'ADCAMP_REPORT_ID';
var ADCAMP_DAYS_DEFAULT = 30;

// 이 몫에 못 미치면 '있으나 없으나'로 본다. 광고비와 광고매출 둘 다 밑돌 때만이다 —
// 돈은 쓰는데 매출이 없는 캠페인은 '미미'가 아니라 '주문 0'으로 따로 잡아야 한다.
var ADCAMP_MIN_SHARE = 0.01;

var ADCAMP_COLS = ['campaignId', 'campaignName', 'campaignStatus',
                   'impressions', 'clicks', 'cost', 'purchases14d', 'sales14d'];
// 있으면 좋지만 계정에 따라 거절당하는 칸. 이것 때문에 수집 전체가 멈추면 안 된다.
var ADCAMP_COLS_OPT = ['topOfSearchImpressionShare'];

/**
 * 리포트 하나를 요청 → 대기 → 내려받는다.
 * 시간 안에 안 끝나면 리포트 번호를 남기고 null 을 준다 (다시 실행하면 이어받는다).
 */
function adsRunReport_(token, propKey, config, from, to, name) {
  var props = PropertiesService.getScriptProperties();
  var t0 = Date.now();
  var reportId = props.getProperty(propKey);

  if (!reportId) {
    var created = adsApi_(token, 'post', '/reporting/reports', {
      name: name, startDate: from, endDate: to, configuration: config
    }, 'application/vnd.createasyncreportrequest.v3+json');
    reportId = created.reportId;
    if (!reportId) throw new Error('리포트 번호를 못 받았습니다: ' +
      JSON.stringify(created).substring(0, 200));
    props.setProperty(propKey, reportId);
    log_('ads', 'INFO', name + ' 리포트 생성 ' + reportId);
  }

  var url = '';
  while (Date.now() - t0 < ADS_SOFT_MS) {
    var info = adsApi_(token, 'get', '/reporting/reports/' + reportId);
    var st = String(info.status || '').toUpperCase();
    if (st === 'COMPLETED' || st === 'SUCCESS') { url = info.url; break; }
    if (st === 'FAILURE' || st === 'CANCELLED') {
      props.deleteProperty(propKey);
      throw new Error(name + ' 리포트 실패: ' + st +
        (info.failureReason ? '\n' + info.failureReason : ''));
    }
    Utilities.sleep(15000);
  }
  if (!url) return null;                       // 아직 만드는 중

  var blob = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getBlob();
  var text = Utilities.ungzip(blob.setContentType('application/x-gzip'))
                      .getDataAsString('UTF-8');
  props.deleteProperty(propKey);
  return JSON.parse(text);
}

/** 캠페인 리포트. 선택 칸이 거절당하면 빼고 다시 부른다 */
function adcampReport_(token, from, to) {
  var mk = function (cols) {
    return { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['campaign'],
             columns: cols, reportTypeId: ADCAMP_REPORT_TYPE,
             timeUnit: 'SUMMARY', format: 'GZIP_JSON' };
  };
  try {
    return adsRunReport_(token, PROP_ADCAMP_REPORT,
      mk(ADCAMP_COLS.concat(ADCAMP_COLS_OPT)), from, to, '캠페인실적');
  } catch (e) {
    var msg = String(e);
    if (!/column|metric|field/i.test(msg)) throw e;
    log_('ads', 'WARN', '캠페인 리포트 선택 칸을 빼고 재시도 — ' + msg.substring(0, 150));
    PropertiesService.getScriptProperties().deleteProperty(PROP_ADCAMP_REPORT);
    return adsRunReport_(token, PROP_ADCAMP_REPORT, mk(ADCAMP_COLS), from, to, '캠페인실적');
  }
}

/** SKU → {qty, status} (리스팅 탭) */
function listingStock_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_LISTING);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, LISTING_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][L_SKU] || '').trim();
    if (!sku) continue;
    out[sku] = { qty: Number(v[i][L_QTY]) || 0,
                 status: String(v[i][L_STATUS] || '').trim() };
  }
  return out;
}

/** 메뉴: 캠페인 점검 · 정리 후보 */
function reviewAdCampaigns() {
  var props = PropertiesService.getScriptProperties();
  var token = adsToken_();
  if (!props.getProperty(PROP_ADS_PROFILE)) adsPickProfile_();

  var res = ui_().prompt('캠페인 점검 — 기간',
    '캠페인마다 노출·클릭·광고비·매출을 받아 정리 후보를 가립니다.\n' +
    '(광고실적 탭과 달리 추적 SKU로 거르지 않습니다 — 계정 전체입니다)\n\n' +
    '며칠치를 볼까요? (그냥 [확인]이면 ' + ADCAMP_DAYS_DEFAULT + '일)',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var days = parseInt(String(res.getResponseText()).trim(), 10);
  if (!(days >= 1 && days <= 365)) days = ADCAMP_DAYS_DEFAULT;

  // 어제까지로 끊는다 — 오늘치는 아직 다 안 모여 매번 다른 값이 나온다
  var to = ymd_(new Date(Date.now() - 86400000));
  var from = ymd_(new Date(Date.now() - days * 86400000));

  toast_('캠페인 실적 요청 중…');
  var rep = adcampReport_(token, from, to);
  if (rep === null) {
    ui_().alert('캠페인 점검 — 리포트 준비 중',
      '아마존이 리포트를 만들고 있습니다 (오류 아님).\n\n' +
      '1~2분 뒤 [캠페인 점검 · 정리 후보]를 다시 실행하면\n' +
      '만들어 둔 리포트를 그대로 이어받습니다.', ui_().ButtonSet.OK);
    return;
  }

  /**
   * 캠페인 목록과 상품은 시트에서 읽는다. 처음엔 여기서 API 로 계정의 상품 광고를
   * 전부 받았다 — 몰아넣기 그룹 하나에 만 개가 넘어 그 자리에서 시간을 다 썼다.
   * 목록은 [광고 구조 수집] 이 광고그룹·광고구조·광고상품에 받아 둔다.
   * 여기서는 그것을 읽고, 이 함수가 API 로 하는 일은 실적 리포트 하나뿐이다.
   */
  var stock = listingStock_();
  var live = {}, skuOf = {}, skuCount = {}, probed = {};

  var gSh = ss_().getSheetByName(SHEET_ADGRP);
  if (!gSh || gSh.getLastRow() < 2) {
    throw new Error('"' + SHEET_ADGRP + '" 이 없습니다.\n' +
      '[📣 광고 → 자료 받기 → 광고 구조 수집]을 먼저 실행하세요.');
  }
  var gv = gSh.getRange(2, 1, gSh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
  for (var g = 0; g < gv.length; g++) {
    var gcid = String(gv[g][8] || '').trim();
    if (!gcid) continue;
    if (!live[gcid]) live[gcid] = { name: String(gv[g][0] || '(이름 없음)'),
                                   type: String(gv[g][1] || ''), state: '', budget: '' };
    skuCount[gcid] = (skuCount[gcid] || 0) + (Number(gv[g][5]) || 0);
  }
  // 캠페인 상태·예산은 광고구조에 있다 (대상이 하나라도 있는 캠페인만)
  var stSh0 = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (stSh0 && stSh0.getLastRow() > 1) {
    var sv0 = stSh0.getRange(2, 1, stSh0.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
    for (var s0 = 0; s0 < sv0.length; s0++) {
      var scid = String(sv0[s0][13] || '').trim();
      if (!scid || !live[scid]) continue;
      if (!live[scid].state) live[scid].state = String(sv0[s0][2] || '');
      if (live[scid].budget === '' && sv0[s0][3] !== '') live[scid].budget = sv0[s0][3];
    }
  }
  // 어떤 SKU 인지는 광고상품(그룹당 앞 몇 개만 떠 본 표본)에서. 재고 판정에만 쓴다
  var pSh = ss_().getSheetByName(SHEET_ADPROD);
  if (pSh && pSh.getLastRow() > 1) {
    var gid2cid = {};
    for (var g2 = 0; g2 < gv.length; g2++) gid2cid[String(gv[g2][9] || '').trim()] = String(gv[g2][8] || '').trim();
    var pv = pSh.getRange(2, 1, pSh.getLastRow() - 1, ADPROD_HEADER.length).getValues();
    for (var pi = 0; pi < pv.length; pi++) {
      var psku = String(pv[pi][0] || '').trim();
      var gids = String(pv[pi][6] || '').split(',');
      for (var gi = 0; gi < gids.length; gi++) {
        var pc = gid2cid[gids[gi].trim()];
        if (!pc || !psku) continue;
        (skuOf[pc] || (skuOf[pc] = {}))[psku] = true;
        probed[pc] = true;
      }
    }
  }

  // 광고구조에서 캠페인별 대상(키워드·타깃) 수를 센다
  var nTarget = {};
  var stSh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (stSh && stSh.getLastRow() > 1) {
    var sv = stSh.getRange(2, 1, stSh.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
    for (var s = 0; s < sv.length; s++) {
      var k = String(sv[s][13] || '');
      if (k) nTarget[k] = (nTarget[k] || 0) + 1;
    }
  }

  // 실적을 캠페인ID로 모은다 (리포트에 없는 캠페인 = 그 기간에 노출 0)
  var perf = {}, tCost = 0, tSales = 0;
  for (var r = 0; r < rep.length; r++) {
    var row = rep[r];
    var cid = String(row.campaignId || '');
    if (!cid) continue;
    var p = perf[cid] || (perf[cid] = { im: 0, ck: 0, cost: 0, sales: 0, ord: 0, name: '' });
    p.im += Number(row.impressions) || 0;
    p.ck += Number(row.clicks) || 0;
    p.cost += Number(row.cost) || 0;
    p.sales += Number(row.sales14d) || 0;
    p.ord += Number(row.purchases14d) || 0;
    if (row.campaignName) p.name = String(row.campaignName);
  }
  for (var id in perf) { tCost += perf[id].cost; tSales += perf[id].sales; }

  // 리포트에 있는 것 + 목록에 있는 것을 합친다.
  // 한쪽에만 있는 캠페인이 진짜 봐야 할 것들이다 (안 도는 것 · 보관된 것)
  var ids = {};
  for (var i1 in perf) ids[i1] = true;
  for (var i2 in live) ids[i2] = true;

  var rows = [], nCand = 0, nKeep = 0, candCost = 0;
  for (var id2 in ids) {
    var L = live[id2], P = perf[id2] || { im: 0, ck: 0, cost: 0, sales: 0, ord: 0, name: '' };
    var skus = skuOf[id2] ? Object.keys(skuOf[id2]) : [];
    var nSku = skuCount[id2] || skus.length;         // 그룹의 SKU수 합 (정확) · 표본보다 크면 표본은 일부
    var inStock = 0;
    for (var q = 0; q < skus.length; q++) {
      var st2 = stock[skus[q]];
      if (st2 && st2.qty > 0 && st2.status === 'Active') inStock++;
    }
    // '전부 재고 없음' 은 표본이 그룹 전체를 덮을 때만 말할 수 있다
    var fullyProbed = probed[id2] && skus.length >= nSku;

    var costShare = tCost > 0 ? P.cost / tCost : 0;
    var salesShare = tSales > 0 ? P.sales / tSales : 0;

    var verdict, why;
    if (!L) {
      verdict = '조치 불필요'; why = '이미 보관·삭제됨';
    } else if (fullyProbed && skus.length > 0 && inStock === 0) {
      verdict = '보존'; why = '광고 상품 ' + skus.length + '개가 전부 재고 없음 — 재고 들어오면 다시 씀';
    } else if (P.im === 0) {
      verdict = '정리 후보'; why = days + '일간 노출 0 (' + (L.state || '') + ')';
    } else if (!nSku) {
      verdict = '정리 후보'; why = '광고 중인 상품이 없음 (빈 캠페인)';
    } else if (P.ord === 0 && P.cost > 0) {
      verdict = '정리 후보'; why = '광고비 ' + Math.round(P.cost).toLocaleString() + '엔 쓰고 주문 0';
    } else if (costShare < ADCAMP_MIN_SHARE && salesShare < ADCAMP_MIN_SHARE) {
      verdict = '정리 후보';
      why = '광고비 ' + pct1_(costShare) + ' · 매출 ' + pct1_(salesShare) + ' (둘 다 ' +
            pct1_(ADCAMP_MIN_SHARE) + ' 미만)';
    } else {
      verdict = '유지'; why = '매출 ' + pct1_(salesShare) + ' 기여';
    }
    if (verdict === '정리 후보') { nCand++; candCost += P.cost; }
    if (verdict === '보존') nKeep++;

    rows.push([
      L ? L.name : (P.name || '(이름 없음)'), L ? L.type : '', L ? L.state : '보관됨',
      L && L.budget !== '' ? L.budget : '',
      nTarget[id2] || 0, nSku, inStock,
      P.im, P.ck, Math.round(P.cost), Math.round(P.sales), P.ord,
      P.im > 0 ? P.ck / P.im : '', P.ck > 0 ? P.ord / P.ck : '',
      P.ck > 0 ? P.cost / P.ck : '', P.sales > 0 ? P.cost / P.sales : '',
      costShare, salesShare,
      verdict, why, false, String(id2)
    ]);
  }

  // 정리 후보를 위로, 그 안에서는 광고비 큰 것부터 (돈이 새는 곳부터 본다)
  var rank = { '정리 후보': 0, '보존': 1, '유지': 2, '조치 불필요': 3 };
  rows.sort(function (x, y) {
    var d = rank[x[18]] - rank[y[18]];
    return d !== 0 ? d : (y[9] - x[9]);
  });

  var sh = ensureSheet_(SHEET_ADCAMP, ADCAMP_HEADER);
  var need = Math.max(rows.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(2, AC_ID, need - 1, 1).setNumberFormat('@');
  writeTable_(sh, ADCAMP_HEADER, rows);
  if (rows.length) {
    sh.getRange(2, AC_APPROVE, rows.length, 1).insertCheckboxes();
    sh.getRange(2, 13, rows.length, 2).setNumberFormat('0.00%');   // CTR · CVR
    sh.getRange(2, 16, rows.length, 3).setNumberFormat('0.0%');    // ACOS · 비중 둘
    sh.getRange(2, 15, rows.length, 1).setNumberFormat('#,##0.0'); // CPC
  }
  headerNotes_(sh, 1, ADCAMP_HEADER, {
    '재고있는SKU': '리스팅 탭 기준 재고 > 0 이고 상태 Active 인 SKU 수.\n0이면 재고 때문에 멈춘 것으로 보고 정리 후보에서 뺀다.',
    '판정': '정리 후보 = 안 돌거나 기여가 없다\n보존 = 재고가 없어 멈춘 것 (재고 들어오면 다시 씀)\n조치 불필요 = 이미 보관·삭제됨',
    '승인': '체크해도 지금은 아무 일도 일어나지 않는다.\n확인한 뒤 정리 실행을 따로 붙인다.',
    '매출비중': '이 캠페인 광고매출 ÷ 전체 광고매출'
  });

  var msg = '캠페인 점검 ' + from + '~' + to + ' — 캠페인 ' + rows.length +
            '개 · 정리 후보 ' + nCand + ' · 재고보존 ' + nKeep;
  log_('ads', 'INFO', msg);
  toast_('정리 후보 ' + nCand + '개');
  showSheet_(SHEET_ADCAMP);

  ui_().alert('캠페인 점검 · 정리 후보',
    from + ' ~ ' + to + ' (' + days + '일)\n\n' +
    '캠페인 ' + rows.length + '개\n' +
    '   정리 후보 ' + nCand + '개 — 이 기간 광고비 ' +
      Math.round(candCost).toLocaleString() + '엔 (전체의 ' +
      pct1_(tCost > 0 ? candCost / tCost : 0) + ')\n' +
    '   재고 없어 멈춘 것 ' + nKeep + '개 — 남깁니다\n\n' +
    '전체 광고비 ' + Math.round(tCost).toLocaleString() + '엔 · ' +
    '광고매출 ' + Math.round(tSales).toLocaleString() + '엔\n\n' +
    '지금은 아무것도 끄지 않았습니다.\n' +
    '표의 [사유]를 보시고 맞는지 확인해 주세요.',
    ui_().ButtonSet.OK);
  return msg;
}

/** 0.0123 → '1.2%' */
function pct1_(x) {
  if (!isFinite(x)) return '—';
  return (x * 100).toFixed(1) + '%';
}
