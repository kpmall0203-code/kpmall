/**
 * 72AD_멈춤후보.gs — 돈만 새는 광고를 낱개로 멈춘다 (EXPAND 2단계)
 *
 * ── 왜 멈추기가 먼저인가 ────────────────────────────────
 * 확대는 못 하는 자리가 많다. 후보의 대부분은 몰아넣기 그룹에 들어 있어
 * 입찰이 그룹 전체에 함께 걸리기 때문이다. 그런데 멈추기는 지금 구조로도 된다 —
 * 상품광고(productAd)는 낱개로 끌 수 있다. 그리고 성숙 30일 기준으로
 * 주문 0 인데 돈만 쓴 SKU 가 100개 넘는다. 늘리기 전에 새는 곳을 막는 것이
 * 순서로도 맞고, 돈으로도 먼저 나온다.
 *
 * ── 무엇을 근거로 "안 팔린다" 고 하나 ────────────────────
 * 주문이 0이라고 다 멈추면 안 된다. 클릭이 열 번뿐이라면 안 팔린 것이 아니라
 * 아직 모르는 것이다. 그래서 '이만큼 봤는데도 안 팔렸다면 앞으로도 손익분기에
 * 못 미친다' 는 것을 셈으로 말한다.
 *
 *   필요 주문율 = 클릭비용 ÷ (판매가 × 마진율)      ← 이만큼은 팔려야 본전
 *   기대 주문율 = (주문 + 1) ÷ (클릭 + 2)           ← 지금까지 본 것으로 보면 이쯤일 것이다
 *   주문율 상한 = (주문 + 2√(주문+1) + 1) ÷ 클릭     ← 운이 좋았다 쳐도 이보다 높기 어렵다
 *
 * 그래서 멈출 근거를 두 층으로 나눈다.
 *
 *   확실   상한 < 본전 — "이 값으로는 못 판다" 고 잘라 말할 수 있다
 *   기대값 평균 < 본전 — 잘라 말하진 못해도, 계속 사면 밑질 쪽이 더 크다
 *
 * 왜 둘로 나누나. 상한만 쓰면 거의 아무것도 못 멈춘다 — 실제 자료로 재 보니
 * 316개 중 4개(¥6,078)뿐이었다. 마진 17% · CPC ¥5 짜리 상품은 주문 0으로
 * 클릭이 100회는 넘어야 상한이 본전 밑으로 내려가기 때문이다. 반면 기대값까지
 * 넣으면 32개 · ¥48,105 가 걸린다. 그 둘은 성격이 다르니 판정도 따로 적고,
 * 승인도 따로 하시라고 나눠 둔다.
 *
 * 멈추는 것은 되돌릴 수 있다 (아마존 화면에서 다시 켜면 된다). '한 번 멈추면 끝'
 * 이 아니므로, 확실한 것만 기다리다 매달 몇 만 엔을 흘리는 것보다 낫다.
 *
 * ── 사람이 승인해야 나간다 ──────────────────────────────
 * 돈에 손대는 일은 승인 없이 하지 않는다. 표를 만들고, 사람이 [승인] 을 켜고,
 * 그때 [승인분 멈추기] 를 눌러야 아마존에 나간다. 트랙 B 가 키우는 중인 SKU 는
 * 아예 후보에서 뺀다 — 그건 일부러 손해를 보며 사는 중이다.
 */

var SHEET_ADSTOP = '광고멈춤후보';
var ADSTOP_HEADER = [
  'SKU', '상품명', '판매가(JPY)', '마진율(%)', '마진출처',
  '성숙클릭', '성숙주문', '광고비(JPY)', '광고매출(JPY)',
  '실제클릭비용(JPY)', '필요주문율(%)', '기대주문율(%)', '주문율상한(%)', '손실(JPY)',
  '판정', '사유', '켜진 광고', '캠페인', '광고ID들', '승인', '결과', '자료기간'
];
var AS_SKU = 0, AS_APPROVE = 19, AS_RESULT = 20, AS_IDS = 18, AS_VERDICT = 14, AS_LOSS = 13;
var ADSTOP_APPROVE_COL = 20;          // 1부터
var ADSTOP_ID_COL = 19;

/** 판정 */
var ASV_STOP = '멈춤 · 확실';
var ASV_STOP_EV = '멈춤 · 기대값';
var ASV_WATCH = '더 봄';
var ASV_KEEP = '팔림';
var ASV_NOHANDLE = '손잡이 없음';
var ASV_GROW = '트랙 B (건드리지 않음)';

var ADSTOP_MIN_CLICKS = 30;           // 이보다 적으면 아무 말도 안 한다
var ADSTOP_MIN_COST = 100;            // 이보다 적게 쓴 것은 굳이 줄 세우지 않는다
var ADSTOP_BATCH = 100;               // 한 번에 멈출 광고 수

/**
 * 메뉴: 멈춤 후보 표 만들기.
 * 계산해서 적을 뿐, 아무것도 멈추지 않는다.
 */
function buildAdStopCandidates() {
  var made = makeOneSheet_([{ name: SHEET_ADSTOP, header: ADSTOP_HEADER }]);
  if (madeSheetStop_(made, '멈춤 후보 만들기')) return;

  var units = adUnitMap_();
  if (!Object.keys(units).length) {
    ui_().alert('상품광고 목록이 없습니다',
      '어느 SKU 의 광고가 어느 것인지 알아야 낱개로 멈출 수 있습니다.\n\n' +
      '[🛑 멈추기 → ① 상품광고 목록 수집] 을 먼저 하세요.', ui_().ButtonSet.OK);
    return;
  }

  var perf = adPerfBySku_(EXPAND_WINDOW_DAYS);
  if (!perf.days) { ui_().alert('셀 수 있는 날이 없습니다', adMatureHelp_(perf), ui_().ButtonSet.OK); return; }

  // 사람이 이미 승인해 둔 줄은 그대로 살린다 (다시 만들어도 체크가 풀리지 않게)
  var sh = ss_().getSheetByName(SHEET_ADSTOP);
  var keep = {};
  if (sh.getLastRow() > 1) {
    var old = sh.getRange(2, 1, sh.getLastRow() - 1, ADSTOP_HEADER.length).getValues();
    for (var o = 0; o < old.length; o++) {
      var k0 = String(old[o][AS_SKU] || '').trim();
      if (k0) keep[k0] = { ok: adRowApproved_(old[o][AS_APPROVE]), res: String(old[o][AS_RESULT] || '') };
    }
  }

  var grow = adStopGrowSkus_();
  var info = adStopListing_();
  var ctx = adMarginCtx_(true);       // 방금 확대후보에 적힌 값까지 새로 읽는다
  var rows = [], cnt = {}, sumLoss = 0, sumCost = 0, nStop = 0, nEv = 0;

  for (var sku in perf.sku) {
    var a = perf.sku[sku];
    if (a.cost < ADSTOP_MIN_COST) continue;
    var u = units[sku];
    var inf = info[sku] || { asin: a.asin, jp: '', price: 0 };
    var aov = a.od > 0 ? a.sales / a.od : 0;
    var price = inf.price || aov;
    var m = adMarginFor_(ctx, sku, price, inf.jp, null);
    var sv = adStopVerdict_(a, m, price, u, !!grow[sku]);
    cnt[sv.v] = (cnt[sv.v] || 0) + 1;
    if (sv.v === ASV_STOP) nStop++;
    if (sv.v === ASV_STOP_EV) nEv++;
    if (adStopCanStop_(sv.v)) { sumLoss += sv.loss; sumCost += a.cost; }
    var k = keep[sku] || {};
    rows.push([sku, String(inf.jp || '').substring(0, 60), Math.round(price),
      m.pct, m.src,
      Math.round(a.ck), Math.round(a.od), Math.round(a.cost), Math.round(a.sales),
      Math.round(sv.cpc * 100) / 100, Math.round(sv.need * 1000) / 10, Math.round(sv.ev * 1000) / 10,
      Math.round(sv.hi * 1000) / 10,
      Math.round(sv.loss), sv.v, sv.why,
      u ? u.on : 0, u && u.ads.length ? u.ads[0].camp : '', sv.ids.join(','),
      (adStopCanStop_(sv.v) && k.ok) ? true : false, k.res || '', perf.span]);
  }

  // 0 은 거짓이라 || 로 거르면 1순위가 꼴찌로 간다 — undefined 만 뒤로 보낸다
  var order = {}; order[ASV_STOP] = 0; order[ASV_STOP_EV] = 1; order[ASV_WATCH] = 2;
  order[ASV_KEEP] = 3; order[ASV_NOHANDLE] = 4; order[ASV_GROW] = 5;
  var rank = function (v) { var r = order[v]; return r === undefined ? 9 : r; };
  rows.sort(function (x, y) {
    var d = rank(x[AS_VERDICT]) - rank(y[AS_VERDICT]);
    if (d) return d;
    return (Number(y[AS_LOSS]) || 0) - (Number(x[AS_LOSS]) || 0);      // 손실 큰 순
  });

  writeTable_(sh, ADSTOP_HEADER, rows);
  sh.getRange(1, 1, 1, ADSTOP_HEADER.length).setValues([ADSTOP_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  if (rows.length) {
    sh.getRange(2, ADSTOP_ID_COL, rows.length, 1).setNumberFormat('@');
    sh.getRange(2, ADSTOP_APPROVE_COL, rows.length, 1).insertCheckboxes();
  }
  adStopNotes_(sh);
  showSheet_(SHEET_ADSTOP);

  ui_().alert('멈춤 후보',
    '상품 ' + rows.length + '개 · 센 기간 ' + perf.span + '\n' +
    Object.keys(cnt).map(function (x) { return x + ' ' + cnt[x]; }).join(' · ') + '\n\n' +
    ((nStop + nEv)
      ? '멈출 근거 — 확실 ' + nStop + '개 · 기대값 ' + nEv + '개.\n' +
        '이 ' + (nStop + nEv) + '개가 센 기간에 ' + fmtYen_(sumCost) + ' 를 쓰고 ' +
        fmtYen_(sumLoss) + ' 를 잃었습니다.\n\n' +
        '"확실" 은 잘라 말할 수 있는 것이고, "기대값" 은 계속 사면 밑질 쪽이 큰 것입니다.\n' +
        '멈춰도 되돌릴 수 있으니(아마존 화면에서 다시 켜면 됩니다) 둘 다 켜도 됩니다.\n\n' +
        '[승인] 을 켠 줄만 멈춥니다. 그 다음 [🛑 멈추기 → ③ 승인분 멈추기].'
      : '멈출 근거가 있는 것은 없습니다. 여기서는 아무것도 바꾸지 않았습니다.'),
    ui_().ButtonSet.OK);
}

/** 트랙 B 가 키우는 중인 SKU (여기서 멈추면 안 된다) */
function adStopGrowSkus_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADGROW);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) {
    var s = String(v[i][0] || '').trim();
    if (s) out[s] = true;
  }
  return out;
}

/** SKU → {asin, jp, price} */
function adStopListing_() {
  var info = {};
  var sh = ss_().getSheetByName(SHEET_LISTING);
  if (!sh || sh.getLastRow() < 2) return info;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, LISTING_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var s = String(v[i][0] || '').trim();
    if (s) info[s] = { asin: String(v[i][1] || ''), jp: String(v[i][2] || ''),
                       price: Number(v[i][6]) || 0 };
  }
  return info;
}

/**
 * 메뉴: 승인분 멈추기 — 승인 ✓ 이고 판정이 '멈춤 근거 있음' 인 줄만.
 *
 * 아마존에 실제로 나가는 유일한 걸음이다. 무엇을 멈출지 먼저 세어 보여주고,
 * 사람이 한 번 더 예라고 해야 보낸다.
 */
function applyAdStopApproved() {
  if (!adBusyGuard_('승인분 멈추기')) return;
  var sh = getSheetOrThrow_(SHEET_ADSTOP);
  if (sh.getLastRow() < 2) { ui_().alert('멈춤 후보 표가 비어 있습니다.'); return; }
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSTOP_HEADER.length).getValues();

  var pick = [], nAds = 0;
  for (var i = 0; i < v.length; i++) {
    if (!adRowApproved_(v[i][AS_APPROVE])) continue;
    if (!adStopCanStop_(String(v[i][AS_VERDICT]))) continue;
    var ids = String(v[i][AS_IDS] || '').split(',').map(function (x) { return x.trim(); })
                .filter(function (x) { return x; });
    if (!ids.length) continue;
    pick.push({ row: i, sku: String(v[i][AS_SKU]), ids: ids, camp: String(v[i][17] || ''),
                cost: Number(v[i][7]) || 0, v: String(v[i][AS_VERDICT]) });
    nAds += ids.length;
  }
  if (!pick.length) {
    ui_().alert('멈출 것이 없습니다',
      '[승인] 이 켜져 있고 판정이 "' + ASV_STOP + '" 이나 "' + ASV_STOP_EV + '" 인 줄만 멈춥니다.\n' +
      '표에서 승인 칸을 켜고 다시 누르세요.', ui_().ButtonSet.OK);
    return;
  }
  var save = 0;
  for (var p0 = 0; p0 < pick.length; p0++) save += pick[p0].cost;
  var ok = ui_().alert('승인분 멈추기',
    'SKU ' + pick.length + '개 · 광고 ' + nAds + '개를 멈춥니다.\n' +
    '이 상품들이 지난 ' + EXPAND_WINDOW_DAYS + '일에 쓴 광고비는 ' + fmtYen_(save) + ' 입니다.\n\n' +
    '캠페인이나 광고그룹은 건드리지 않습니다 — 그 상품의 광고만 멈춥니다.\n' +
    '되돌리려면 아마존 화면에서 다시 켜면 됩니다.\n\n' +
    '보낼까요?', ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  var token = adsToken_();
  var logBuf = adLogBuffer_(20);
  var t0 = Date.now(), done = 0, failed = 0, left = 0, dirty = false;
  for (var p = 0; p < pick.length; p++) {
    if (Date.now() - t0 > ADS_SOFT_MS) { left = pick.length - p; break; }
    var it = pick[p], bad = '';
    for (var b = 0; b < it.ids.length; b += ADSTOP_BATCH) {
      var part = it.ids.slice(b, b + ADSTOP_BATCH);
      try {
        var r = adsApiRetry_(token, 'put', '/sp/productAds',
          { productAds: part.map(function (x) { return { adId: x, state: 'PAUSED' }; }) },
          ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
        var rr = adsCreated_(r, 'productAds', 'adId');
        if (!rr.ok && !/entityStateConflict/i.test(rr.msg || '')) bad = rr.msg || '실패';
      } catch (e) { bad = String(e).substring(0, 120); }
    }
    dirty = true;
    if (bad) {
      failed++;
      v[it.row][AS_RESULT] = '실패 — ' + adErrorText_(bad);
    } else {
      done++;
      v[it.row][AS_RESULT] = '멈춤 ' + it.ids.length + '개 · ' + ymd_(new Date());
      logBuf.push([adLogRow_({ kind: '상품', camp: it.camp, sku: it.sku, item: '상태',
        from: 'ENABLED', to: 'PAUSED',
        why: '성숙 ' + EXPAND_WINDOW_DAYS + '일 동안 본전 주문율에 못 미침 (' + it.v + ' · 승인)',
        by: '승인' })]);
    }
  }
  logBuf.flush();
  if (dirty) sh.getRange(2, 1, v.length, ADSTOP_HEADER.length).setValues(v);
  log_('ads', 'INFO', '멈춤 후보 반영 — 멈춤 ' + done + ' · 실패 ' + failed +
       (left ? ' · 남음 ' + left : ''));

  ui_().alert('승인분 멈추기',
    'SKU ' + done + '개를 멈췄습니다' + (failed ? ' · 실패 ' + failed + '개' : '') +
    (left ? '\n시간이 다 되어 ' + left + '개가 남았습니다 — 한 번 더 누르세요.' : '') + '\n\n' +
    '결과는 표의 [결과] 칸과 ' + SHEET_ADLOG + ' 에 남았습니다.\n' +
    '다음 [광고비 수집] 뒤에는 이 상품들의 광고비가 줄어 있어야 합니다.',
    ui_().ButtonSet.OK);
}

function adStopNotes_(sh) {
  headerNotes_(sh, 1, ADSTOP_HEADER, {
    '필요주문율(%)': '= 클릭비용 ÷ (판매가 × 마진율). 광고비를 뽑으려면 이만큼은 팔려야 합니다.',
    '기대주문율(%)': '= (주문 + 1) ÷ (클릭 + 2). 지금까지 본 것으로 보면 이쯤일 것이라는 값입니다.',
    '주문율상한(%)': '= (주문 + 2√(주문+1) + 1) ÷ 클릭.\n' +
      '"운이 나빴을 뿐" 이라고 쳐도 이보다 높기는 어렵다는 선입니다.\n' +
      '주문 0 · 클릭 50 이면 6%, 클릭 10 이면 30% — 그래서 클릭이 적으면 아무 말도 못 합니다.',
    '판정': ASV_STOP + ' = 상한도 본전에 못 미침 — 잘라 말할 수 있다\n' +
      ASV_STOP_EV + ' = 기대값이 본전에 못 미침 — 계속 사면 밑질 쪽이 크다\n' +
      ASV_WATCH + ' = 표본이 얇거나, 밑지지만 멈출 근거까지는 아님\n' +
      ASV_KEEP + ' = 본전을 넘겨 팔고 있음\n' +
      ASV_NOHANDLE + ' = 광고ID 를 몰라 손댈 수 없음 (목록 수집 필요)\n' +
      ASV_GROW + ' = 트랙 B 가 키우는 중 — 일부러 손해 보는 자리라 뺍니다',
    '켜진 광고': '이 SKU 의 상품광고 중 지금 켜져 있는 것의 수. 멈추면 이만큼이 꺼집니다.',
    '승인': '켜면 [③ 승인분 멈추기] 때 이 줄이 나갑니다 (판정이 멈춤인 줄만).\n' +
      '멈춰도 되돌릴 수 있습니다 — 아마존 화면에서 그 상품광고를 다시 켜면 됩니다.',
    '광고ID들': '실제로 멈출 광고들. 캠페인·광고그룹은 건드리지 않습니다.',
    '자료기간': '실제로 센 날 (성숙한 날만).'
  });
}


/** 이 판정이면 승인 시 나가는가 */
function adStopCanStop_(v) { return v === ASV_STOP || v === ASV_STOP_EV; }

/** 마진율이 기본값이면 그렇다고 덧붙인다 — 판정이 뒤집힐 수 있는 줄이다 */
function adStopDefNote_(m) {
  return m.src === MSRC_DEFAULT
    ? ' (마진율이 기본 ' + m.pct + '% 라 실제 마진을 [광고확대후보] 에 적으면 달라질 수 있습니다)' : '';
}


/**
 * 멈출 근거가 있는가 — 순수 셈. 시트를 읽지 않는다.
 *
 * 확대후보 표(72AB)와 멈춤후보 표가 같은 셈을 쓰려고 떼어 두었다. 두 표가
 * 다른 셈을 쓰면 한 표는 늘리라 하고 다른 표는 멈추라 한다.
 *
 * @param {Object} a      성숙 창 실적 {ck, od, cost, sales}
 * @param {Object} m      adMarginFor_ 의 결과 {pct, src}
 * @param {number} price  판매가(JPY)
 * @param {Object} u      adUnitMap_ 의 항목 (없으면 손잡이 없음)
 * @param {boolean} isGrow 트랙 B 가 키우는 중인가
 * @return {{v:string, why:string, need:number, ev:number, hi:number, loss:number, cpc:number, ids:Array}}
 */
function adStopVerdict_(a, m, price, u, isGrow) {
  var cpc = a.ck > 0 ? a.cost / a.ck : 0;
  var need = (price > 0 && m.pct > 0) ? cpc / (price * m.pct / 100) : 0;      // 손익분기 주문율
  var ev = (a.od + 1) / (a.ck + 2);                                           // 기대 주문율
  var hi = a.ck > 0 ? (a.od + 2 * Math.sqrt(a.od + 1) + 1) / a.ck : 1;        // 주문율 상한
  var loss = a.cost - a.sales * m.pct / 100;                                   // 광고비 − 공헌이익
  var ids = u ? u.ads.filter(function (x) { return x.state === 'ENABLED'; })
                     .map(function (x) { return x.id; }) : [];
  var v, why;
  if (isGrow) {
    v = ASV_GROW;
    why = '트랙 B 가 키우는 중입니다 — 일부러 손해를 보며 사는 자리라 여기서 멈추지 않습니다';
  } else if (!u || !u.on) {
    v = ASV_NOHANDLE;
    why = u ? '이 SKU 의 광고가 이미 다 멈춰 있습니다'
            : '상품광고 목록에 이 SKU 가 없습니다 — [광고 자료 갱신] 을 다시 하세요';
  } else if (a.ck < ADSTOP_MIN_CLICKS) {
    v = ASV_WATCH;
    why = '클릭 ' + Math.round(a.ck) + '회로는 안 팔린다고 말할 수 없습니다 (최소 ' +
          ADSTOP_MIN_CLICKS + '회). 주문율 상한이 ' + pct1_(hi) + ' 나 됩니다';
  } else if (!need) {
    v = ASV_WATCH;
    why = '판매가나 마진율을 몰라 손익분기 주문율을 셀 수 없습니다';
  } else if (hi < need) {
    v = ASV_STOP;
    why = '클릭 ' + Math.round(a.ck) + '회에 주문 ' + Math.round(a.od) + '건. ' +
          '잘 봐줘도 주문율이 ' + pct1_(hi) + ' 를 넘기 어려운데, ' +
          '본전이 되려면 ' + pct1_(need) + ' 는 팔려야 합니다. ' +
          '이 창에서 ' + fmtYen_(loss) + ' 손해' + adStopDefNote_(m);
  } else if (ev < need) {
    v = ASV_STOP_EV;
    why = '클릭 ' + Math.round(a.ck) + '회에 주문 ' + Math.round(a.od) + '건이면 ' +
          '주문율은 ' + pct1_(ev) + ' 쯤으로 봅니다. 본전은 ' + pct1_(need) + ' 입니다 — ' +
          '잘라 말할 정도는 아니지만(상한 ' + pct1_(hi) + ') 계속 사면 밑질 쪽이 큽니다. ' +
          '이 창에서 ' + fmtYen_(loss) + ' 손해' + adStopDefNote_(m);
  } else if (a.od > 0 && loss > 0) {
    v = ASV_WATCH;
    why = '팔리기는 하는데 밑집니다 (' + fmtYen_(loss) + '). 다만 기대 주문율 ' +
          pct1_(ev) + ' 가 본전 ' + pct1_(need) + ' 를 넘어서, 멈출 자리가 아니라 ' +
          '값을 낮출 자리입니다';
  } else {
    v = ASV_KEEP;
    why = '본전을 넘겨 팔고 있습니다 (주문율 ' + pct1_(a.od / a.ck) + ' · 본전 ' + pct1_(need) + ')';
  }
  return { v: v, why: why, need: need, ev: ev, hi: hi, loss: loss, cpc: cpc, ids: ids };
}
