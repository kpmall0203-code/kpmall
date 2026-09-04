/**
 * 72H_광고재배분.gs — 트랙 A · 이미 팔리는 것의 노출을 마진 안에서 산다
 *
 * ── 이 트랙이 푸는 문제 ─────────────────────────────────
 * 지금은 SKU 종류와 무관하게 전부 같은 입찰가로 돌고 있다. 그런데 SKU마다
 * 낼 수 있는 돈이 수십 배 다르다. 상한이 6엔인 것과 300엔인 것에 같은 값을
 * 걸면, 앞의 것은 적자고 뒤의 것은 살 수 있는 노출을 안 사고 있는 것이다.
 * 그러니 이 트랙의 이득은 '입찰을 올리는 것'이 아니라 '다르게 매기는 것'이다.
 * 마진이 얇아도 성립한다 — 총액을 늘리지 않고 자리만 바꿔도 되기 때문이다.
 *
 * ── 광고 이력을 쓰지 않는 이유 ──────────────────────────
 * 지금 광고 자료는 '제대로 안 돌린 상태'의 기록이라, 거기서 기준을 뽑으면
 * 그 상태를 그대로 재생산한다. 그래서 기준을 두 가지에서만 뽑는다:
 *   ① 단가·원가·수수료·배송비 → 마진율 (산수다)
 *   ② 그 SKU의 오가닉 전환율 (광고 없이 팔린 실적. 광고 이력에 안 물든다)
 *
 *   낼 수 있는 CPC = 객단가 × 마진율 × 오가닉 전환율 × 목표비율
 *
 * 전환율이 이미 증명된 상품만 다루므로 CVR을 추정할 일이 없다.
 *
 * ── 왜 잠식을 빼고 목표를 잡는가 ────────────────────────
 * 광고로 판 것 중 일부는 광고가 없어도 팔렸을 것이다(잠식). 그만큼은 광고비를
 * 그냥 버린 것이라, 실질 ACOS = 명목 ÷ (1−잠식률) 이 된다.
 * 명목을 손익분기에 맞추면 잠식이 조금만 있어도 적자다. 그래서 목표를
 * 마진율의 65%로 낮춰 잡는다 — 잠식 30%까지는 적자가 안 난다.
 *
 * 여기서는 아무것도 바꾸지 않는다. 판정과 근거만 표로 낸다.
 */

var SHEET_ADBASIS = '광고기준';
var ADBASIS_HEADER = ['항목', '값', '설명'];

/** 기본값. 광고기준 탭에서 고치면 그 값이 우선한다 */
var ADBASIS_DEFAULTS = [
  ['기본 마진율', 0.17, '원가가 입력되지 않은 SKU에 쓴다. 실제로 남는 비율(수수료·배송비 뺀 뒤)'],
  ['목표 ACOS 비율', 0.65, '목표 ACOS = 마진율 × 이 값. 0.65면 잠식 30%까지 적자가 안 난다'],
  ['인상 중단 비율', 0.75, '실측 ACOS가 마진율 × 이 값을 넘으면 더 올리지 않는다'],
  ['인하 비율', 0.85, '이 선을 넘으면 입찰을 내린다'],
  ['정지 비율', 1.00, '마진율과 같다 = 손익분기. 넘으면 판 만큼 손해다'],
  ['최소 세션', 200, '이보다 적으면 전환율이 우연과 구별되지 않아 판정하지 않는다'],
  ['최소 카트박스', 0.90, '카트박스를 뺏기고 있으면 전환율이 낮은 게 광고 탓이 아니다'],
  ['최소 오가닉 전환율', 0.01, '이보다 낮으면 안 보여서가 아니라 안 사는 것이다 — 광고로 못 고친다'],
  ['시장 CPC', 7.7, '실제로 지불하고 있는 평균 CPC. 상한이 이보다 낮으면 광고가 성립하지 않는다'],
  ['한 번에 올릴 최대 배수', 3.0, '지금 입찰이 시장가에서 멀어 첫 조정 폭이 크다. 그래도 한 번에 이 배수까지만'],
  ['전용 캠페인 상위 개수', 30, '오가닉 매출 상위 이만큼은 SKU 하나에 캠페인 하나를 준다'],
  ['묶음당 최대 SKU', 20, '나머지는 권장 CPC 가 비슷한 것끼리 이 수만큼 묶는다'],
  ['묶음 CPC 배수', 1.5, '한 묶음 안의 권장 CPC 차이를 이 배수 안으로 제한한다'],
  ['묶음 CPC 기준점', 2, '구간을 이 값에서 시작해 배수로 쌓는다. 바꾸면 기존 묶음과 어긋난다'],
  ['일예산 여유 배수', 2.0, '판정에 드는 최소 예산에 이만큼 곱한다. 클릭을 놓치지 않으려는 여유'],
  ['손댈 것 없는 줄도 표에 넣기', '', 'TRUE 로 하면 판정 안 함·제외도 표에 남긴다 (행이 배로 는다)'],
  ['최소 일예산', 100, '아마존이 받는 하루 예산 하한'],
  ['주간 광고비 한도(JPY)', '', '우리가 만든 캠페인 전체가 7일에 쓸 수 있는 돈. 비우면 승인 ✓ 일예산 합 × 7. ' +
                              '넘으면 관제가 전부 멈추고 메일. 트랙 B 의 한 주 허용 손해도 여기에'],
  ['한도 경고 비율', 0.8, '한도의 이 비율에 닿으면 미리 메일 (아직 멈추지는 않음)'],
  ['한도 넘으면 자동 멈춤', 'TRUE', 'FALSE 로 하면 넘어도 메일만 보내고 멈추지 않는다 — 권하지 않음'],
  ['캠페인 이름 앞머리', '사입', '만든 캠페인을 한눈에 알아보려고 붙인다'],
  ['마진율 시트 ID', '1ZOgOkmI53oebHB_8rkiYNV4Fk67el6P9SYGOtq2M6-4',
   '새 상품의 마진율이 적히는 바깥 시트. 비우면 안 읽는다'],
  ['마진율 시트 탭', '상품 목록', '그 시트에서 읽을 탭 이름'],
  ['마진율 ~2000', '', '가격대별 마진율 (선택). 비워두면 기본 마진율을 쓴다'],
  ['마진율 2000~5000', '', ''],
  ['마진율 5000~10000', '', ''],
  ['마진율 10000~', '', '']
];

var SHEET_REALLOC = '광고재배분';
var REALLOC_HEADER = [
  'SKU', '상품명', '재고', '가격(JPY)', '객단가(JPY)', '세션', '오가닉전환율', '카트박스',
  '마진율', '마진출처', '손익분기CPA(JPY)', '권장CPC(JPY)', 'CPC상한(JPY)',
  '광고중', '공유SKU수', '현재실입찰(JPY)', '권장/현재',
  '판정', '사유', '월매출(JPY)', 'ASIN', '승인'
];
// ASIN 을 월매출 뒤에 넣은 것은 앞 칸들의 번호를 밀지 않으려는 것이다.
// 캠페인 이름에 쓸 ASCII 이름이 필요한데 SKU 는 한글이라 아마존이 거절한다.
var RA_APPROVE = 22;

/**
 * 표에 남길 판정.
 *
 * 처음에는 전부 담고 3,000행에서 잘랐는데, 그 상한에 근거가 없었다.
 * 실제로 3,654행이 나와 654행이 말없이 사라졌다.
 *
 * '판정 안 함'(세션이 모자라 전환율을 못 믿는 것)과 '제외'(재고 없음·카트박스)는
 * 손댈 것이 없어서, 남겨봐야 볼 것을 가린다. 대신 알림에 몇 개인지 적는다.
 * 그것까지 보고 싶으면 광고기준에서 켠다.
 */
var REALLOC_KEEP = { '인하': 1, '인상': 1, '캠페인 분리': 1, '신규 캠페인': 1,
                     '성립 불가': 1, '유지': 1 };

/** 메뉴: 광고 기준 설정 탭 만들기 (있으면 빠진 항목만 채운다) */
function setupAdBasis() {
  var sh = ensureSheet_(SHEET_ADBASIS, ADBASIS_HEADER);
  var have = {};
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < v.length; i++) have[String(v[i][0]).trim()] = true;
  }
  var add = [];
  for (var d = 0; d < ADBASIS_DEFAULTS.length; d++) {
    if (!have[ADBASIS_DEFAULTS[d][0]]) add.push(ADBASIS_DEFAULTS[d]);
  }
  if (add.length) {
    var start = Math.max(sh.getLastRow(), 1) + 1;
    var need = start + add.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(start, 1, add.length, 3).setValues(add);
  }
  sh.getRange(1, 1, 1, 3).setValues([ADBASIS_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  showSheet_(SHEET_ADBASIS);
  ui_().alert('광고 기준',
    (add.length ? add.length + '개 항목을 채웠습니다.\n\n' : '이미 다 있습니다.\n\n') +
    '값을 고치면 [광고 재배분 계산]이 그 값을 씁니다.\n' +
    '원가가 입력된 SKU는 실측 마진율을 쓰고, 없으면 여기 값을 씁니다.',
    ui_().ButtonSet.OK);
}

/** 광고기준 탭 → {항목: 값} */
function adBasis_() {
  var out = {};
  for (var d = 0; d < ADBASIS_DEFAULTS.length; d++) out[ADBASIS_DEFAULTS[d][0]] = ADBASIS_DEFAULTS[d][1];
  var sh = ss_().getSheetByName(SHEET_ADBASIS);
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < v.length; i++) {
      var k = String(v[i][0]).trim();
      if (!k) continue;
      var x = v[i][1];
      if (x === '' || x === null) continue;
      var n = Number(x);
      out[k] = isNaN(n) ? x : n;
    }
  }
  return out;
}

/**
 * 이름을 맞대보기 위해 다듬는다.
 *
 * 바깥 마진율 시트에는 SKU도 ASIN도 없고 일본어 상품명뿐이다. 그대로 맞대면
 * 6%밖에 안 붙는데, 공백과 괄호·구두점만 지워도 65%가 붙는다 — 같은 상품인데
 * 【 】나 띄어쓰기만 다른 경우가 대부분이기 때문이다.
 *
 * 앞 몇 글자만 같으면 같은 것으로 치는 방법은 74%까지 오르지만 쓰지 않는다.
 * 마진율이 틀리면 입찰가가 틀리고, 그건 바로 돈이다. 못 붙은 것은 기본 마진율로 둔다.
 */
function normName_(s) {
  return String(s == null ? '' : s)
    .replace(/[\s\u3000]+/g, '')
    .replace(/[\[\]【】（）()／\/,、。・:：]/g, '')
    .toLowerCase();
}

/**
 * 바깥 시트의 일본어 상품명 → 마진율(비율).
 *
 * 그 시트의 칸은 '마진율 (%)' 이라 15.4 가 15.4% 를 뜻한다 (같은 줄의
 * '마진 (JPY)' 칸으로 확인했다). 100 으로 나눠 비율로 바꿔 쓴다.
 * 못 읽어도 죽지 않는다 — 기본 마진율로 돌아간다.
 */
function externalMarginMap_(basis) {
  var out = {}, id = String(basis['마진율 시트 ID'] || '').trim();
  if (!id) return out;
  try {
    var sh = SpreadsheetApp.openById(id)
      .getSheetByName(String(basis['마진율 시트 탭'] || '').trim());
    if (!sh || sh.getLastRow() < 2) return out;
    var w = sh.getLastColumn();
    var hdr = sh.getRange(1, 1, 1, w).getValues()[0];
    var cName = -1, cRate = -1;
    for (var h = 0; h < hdr.length; h++) {
      var t = String(hdr[h]);
      if (cName < 0 && t.indexOf('상품명') >= 0 && t.indexOf('일본어') >= 0) cName = h;
      if (cRate < 0 && t.indexOf('마진율') >= 0) cRate = h;
    }
    if (cName < 0 || cRate < 0) {
      log_('ads', 'WARN', '마진율 시트에서 칸을 못 찾았습니다 (상품명(일본어)/마진율)');
      return out;
    }
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues();
    for (var i = 0; i < v.length; i++) {
      var nm = normName_(v[i][cName]);
      var r = Number(v[i][cRate]);
      if (!nm || !isFinite(r) || r <= 0) continue;
      out[nm] = r / 100;
    }
  } catch (e) {
    log_('ads', 'WARN', '마진율 시트를 못 읽었습니다: ' + String(e).substring(0, 150));
  }
  return out;
}

/** 가격대별 마진율 (없으면 기본값) */
function marginForPrice_(basis, price) {
  var key = price < 2000 ? '마진율 ~2000'
          : price < 5000 ? '마진율 2000~5000'
          : price < 10000 ? '마진율 5000~10000' : '마진율 10000~';
  var m = basis[key];
  if (typeof m === 'number' && m > 0 && m < 1) return { m: m, src: '가격대' };
  return { m: basis['기본 마진율'], src: '기본값' };
}

/**
 * SKU → {gids, minN, ded}
 *
 * minN 은 그 SKU 가 걸린 광고그룹 중 가장 작은 것의 SKU 수다. 이게 크면
 * 그 SKU 만 골라 입찰가를 못 바꾼다 — 같은 입찰이 그룹의 모든 SKU 에 함께 걸리고,
 * 결국 그중 채산성이 가장 나쁜 것에 맞출 수밖에 없다.
 */
function adProdIndex_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADPROD);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPROD_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][0] || '').trim();
    if (!sku) continue;
    out[sku] = { minN: Number(v[i][4]) || 0, ded: String(v[i][5]).trim() === 'O',
                 gids: String(v[i][6] || '').split(',') };
  }
  return out;
}

/** 광고그룹ID → 그 그룹 대상들의 실입찰 목록 (광고구조) */
function adGroupBids_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var gid = String(v[i][14] || '').trim();
    var bid = Number(v[i][12]);
    if (!gid || !(bid > 0)) continue;
    (out[gid] || (out[gid] = [])).push(bid);
  }
  return out;
}

// median_ 은 52_원가.gs 의 것을 그대로 쓴다 (같은 것을 두 번 정의하면
// 나중에 로드되는 쪽이 조용히 덮어써서, 한쪽만 고칠 때 다른 쪽이 함께 바뀐다)

/** 판매실적 → SKU별 {qty, amt, sessions, bb} (기간 여러 개를 합친다) */
function organicBySku_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_SALES);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, SALES_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][2] || '').trim();
    if (!sku) continue;
    var o = out[sku] || (out[sku] = { qty: 0, amt: 0, ses: 0, bbSum: 0, n: 0 });
    o.qty += Number(v[i][4]) || 0;
    o.amt += Number(v[i][5]) || 0;
    o.ses += Number(v[i][6]) || 0;
    o.bbSum += Number(v[i][8]) || 0;
    o.n++;
  }
  return out;
}

/** 메뉴: 광고 재배분 계산 */
function analyzeAdReallocation() {
  var basis = adBasis_();
  if (!ss_().getSheetByName(SHEET_ADBASIS)) setupAdBasis();

  var organic = organicBySku_();
  if (!countKeys_(organic)) {
    throw new Error('"' + SHEET_SALES + '" 탭이 비어 있습니다.\n' +
      '[🔄 데이터 갱신 → 판매실적 수집]을 먼저 실행하세요.');
  }
  var prod = adProdIndex_(), gbids = adGroupBids_();

  // 원가가 있는 SKU는 실측 마진율을 쓴다 (없으면 가격대·기본값)
  var costs = {}, rate = 0, skuCost = {}, manual = {};
  try {
    costs = costMap_(); rate = fxReceiveRate_();
    skuCost = skuCostMap_(); manual = costInfoMap_();
  } catch (e) { log_('ads', 'WARN', '원가 자료를 못 읽어 기본 마진율을 씁니다: ' + e); }

  var extM = externalMarginMap_(basis);
  var nExt = countKeys_(extM), nExtHit = 0;

  var listSh = getSheetOrThrow_(SHEET_LISTING);
  var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();

  var minSes = basis['최소 세션'], minBB = basis['최소 카트박스'];
  var minCvr = basis['최소 오가닉 전환율'], mkt = basis['시장 CPC'];
  var kTarget = basis['목표 ACOS 비율'], maxUp = basis['한 번에 올릴 최대 배수'];

  var rows = [], stat = {};
  var bump = function (k) { stat[k] = (stat[k] || 0) + 1; };

  for (var i = 0; i < lv.length; i++) {
    var sku = String(lv[i][L_SKU] || '').trim();
    if (!sku) continue;
    var o = organic[sku];
    var advertised = !!prod[sku];
    if (!o && !advertised) continue;                 // 자료도 광고도 없으면 볼 것이 없다
    o = o || { qty: 0, amt: 0, ses: 0, bbSum: 0, n: 1 };

    var price = Number(lv[i][L_PRICE]) || 0;
    var qty2 = Number(lv[i][L_QTY]) || 0;
    var status = String(lv[i][L_STATUS] || '').trim();
    var cvr = o.ses > 0 ? o.qty / o.ses : 0;
    var aov = o.qty > 0 ? o.amt / o.qty : price;
    var bb = o.n > 0 ? (o.bbSum / o.n) / 100 : 0;    // 판매실적은 백분율로 들어온다

    // 마진율 — 원가가 있으면 실측, 없으면 가격대·기본값
    var m, msrc;
    if (costs[sku] && rate > 0 && price > 0) {
      var rs = resolveShipping_(sku, skuCost, manual);
      var unit = unitProfitKrw_(price, rs.fee, costs[sku], rate, DEFAULT_FEE_RATE);
      m = unit / (price * rate); msrc = '원가입력';
      if (!(m > 0)) { m = 0; msrc = '원가입력(적자)'; }
    } else if (extM[normName_(lv[i][L_JP])] > 0) {
      m = extM[normName_(lv[i][L_JP])]; msrc = '마진율시트'; nExtHit++;
    } else {
      var mp = marginForPrice_(basis, price); m = mp.m; msrc = mp.src;
    }

    var beCpa = aov * m;                 // 주문 하나에 낼 수 있는 최대 (손익분기)
    var capCpc = beCpa * cvr;            // 손익분기 CPC
    var recCpc = capCpc * kTarget;       // 목표 ACOS 기준 권장 CPC

    var pinfo = prod[sku];
    var gids = pinfo ? pinfo.gids : [];
    var cur = [];
    for (var g = 0; g < gids.length; g++) {
      var gk = String(gids[g]).trim();
      if (gbids[gk]) cur = cur.concat(gbids[gk]);
    }
    var curBid = median_(cur);
    var shared = pinfo ? pinfo.minN : 0;

    var verdict, why;
    if (qty2 <= 0 || status !== 'Active') {
      verdict = '제외';
      why = (qty2 <= 0 ? '재고 0' : '') + (qty2 <= 0 && status !== 'Active' ? ' · ' : '') +
            (status !== 'Active' ? '리스팅 상태 ' + status : '');
    } else if (m <= 0) {
      verdict = '성립 불가'; why = '마진이 없다 (' + msrc + ')';
    } else if (o.ses < minSes) {
      verdict = '판정 안 함'; why = '세션 ' + Math.round(o.ses) + ' < ' + minSes + ' — 전환율을 믿을 수 없다';
    } else if (bb < minBB) {
      verdict = '제외'; why = '카트박스 ' + pct1_(bb) + ' — 전환 문제가 아니라 값 문제다';
    } else if (cvr < minCvr) {
      verdict = '성립 불가'; why = '오가닉 전환율 ' + pct1_(cvr) + ' — 보여줘도 안 산다';
    } else if (capCpc <= mkt) {
      verdict = '성립 불가';
      why = '손익분기 CPC ¥' + capCpc.toFixed(1) + ' ≤ 시장가 ¥' + mkt + ' — 사면 살수록 손해';
    } else if (!advertised) {
      verdict = '신규 캠페인'; why = '권장 ¥' + Math.round(recCpc) + ' 로 시작 (지금 광고 안 함)';
    } else if (!pinfo.ded) {
      // 입찰가는 키워드에 걸리는데 그 키워드가 이 그룹의 SKU 전부를 함께 담당한다.
      // 여기서 입찰을 올리면 나머지 SKU 도 같이 올라가므로 그 SKU 만 손댈 수가 없다.
      verdict = '캠페인 분리';
      why = '같은 광고그룹에 SKU ' + shared.toLocaleString() + '개 — 이 SKU 만 입찰을 못 바꾼다. ' +
            '전용 캠페인으로 빼면 ¥' + Math.round(recCpc);
    } else if (curBid > capCpc) {
      verdict = '인하';
      why = '지금 ¥' + curBid.toFixed(1) + ' > 손익분기 ¥' + capCpc.toFixed(1);
    } else if (curBid > 0 && recCpc > curBid * 1.25) {
      var to = Math.min(recCpc, curBid * maxUp);
      verdict = '인상';
      why = '¥' + curBid.toFixed(1) + ' → ¥' + Math.round(to) +
            (recCpc > curBid * maxUp ? ' (한 번에 ' + maxUp + '배까지)' : '');
    } else {
      verdict = '유지'; why = '권장 ¥' + Math.round(recCpc) + ' · 지금 ¥' + curBid.toFixed(1);
    }
    bump(verdict);

    rows.push([
      sku, String(lv[i][L_KR] || lv[i][L_JP] || '').substring(0, 40), qty2, price,
      Math.round(aov), Math.round(o.ses), cvr, bb,
      m, msrc, Math.round(beCpa), Math.round(recCpc), Math.round(capCpc),
      advertised ? 'O' : '', shared || '', curBid || '', (curBid > 0 ? recCpc / curBid : ''),
      verdict, why, Math.round(o.amt), String(lv[i][L_ASIN] || ''), false
    ]);
  }

  // 손댈 것부터 위로, 그 안에서 매출 큰 것부터
  var rank = { '인하': 0, '인상': 1, '캠페인 분리': 2, '신규 캠페인': 3, '성립 불가': 4,
               '유지': 5, '판정 안 함': 6, '제외': 7 };
  var RA_V = 17, RA_AMT = 19;
  rows.sort(function (a, b) {
    var d = (rank[a[RA_V]] === undefined ? 9 : rank[a[RA_V]]) -
            (rank[b[RA_V]] === undefined ? 9 : rank[b[RA_V]]);
    return d !== 0 ? d : (b[RA_AMT] - a[RA_AMT]);
  });
  // 손댈 것 없는 줄은 빼고 쓴다 (개수는 알림에 남는다)
  var showAll = String(basis['손댈 것 없는 줄도 표에 넣기']).toUpperCase() === 'TRUE';
  var hidden = 0;
  if (!showAll) {
    var keep = [];
    for (var h2 = 0; h2 < rows.length; h2++) {
      if (REALLOC_KEEP[rows[h2][RA_V]]) keep.push(rows[h2]); else hidden++;
    }
    rows = keep;
  }

  var sh = ensureSheet_(SHEET_REALLOC, REALLOC_HEADER);
  var need = Math.max(rows.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  writeTable_(sh, REALLOC_HEADER, rows);
  if (rows.length) {
    sh.getRange(2, RA_APPROVE, rows.length, 1).insertCheckboxes();
    sh.getRange(2, 7, rows.length, 2).setNumberFormat('0.00%');    // 전환율 · 카트박스
    sh.getRange(2, 9, rows.length, 1).setNumberFormat('0.0%');     // 마진율
    sh.getRange(2, 16, rows.length, 1).setNumberFormat('#,##0.0'); // 현재 실입찰
    sh.getRange(2, 17, rows.length, 1).setNumberFormat('#,##0.0"배"');
  }
  headerNotes_(sh, 1, REALLOC_HEADER, {
    '오가닉전환율': '광고 없이 팔린 실적 (판매수량 ÷ 세션).\n광고 이력에 물들지 않은 유일한 전환율이라 이것만 쓴다.',
    '손익분기CPA(JPY)': '객단가 × 마진율. 주문 하나에 낼 수 있는 최대 금액.',
    '권장CPC(JPY)': '손익분기 CPC × 목표 ACOS 비율.\n잠식(광고 없어도 팔렸을 몫)을 감안해 낮춰 잡은 값.',
    'CPC상한(JPY)': '객단가 × 마진율 × 오가닉전환율. 이걸 넘겨 사면 팔수록 손해.',
    '공유SKU수': '이 SKU 가 걸린 광고그룹 중 가장 작은 것의 SKU 수.\n1~5 면 그 SKU 에 맞춘 입찰을 걸 수 있고,\n크면 같은 입찰이 그 SKU 들에 함께 걸려 따로 못 바꾼다.',
    '판정': '인하 = 상한을 넘겨 사고 있다\n인상 = 살 수 있는 노출을 안 사고 있다\n캠페인 분리 = 광고 중이지만 다른 SKU 와 입찰을 공유해 따로 못 바꾼다\n신규 캠페인 = 팔리는데 광고를 안 한다\n성립 불가 = 상한이 시장가보다 낮아 원리상 안 된다',
    '승인': '체크해도 지금은 아무 일도 일어나지 않는다. 확인한 뒤 반영을 따로 붙인다.'
  });

  var msg = '광고 재배분 — ' + rows.length + '행 · ' +
            ['인하', '인상', '캠페인 분리', '신규 캠페인', '성립 불가'].map(function (k) {
              return k + ' ' + (stat[k] || 0); }).join(' · ');
  log_('ads', 'INFO', msg);
  toast_(msg);
  showSheet_(SHEET_REALLOC);

  var newSales = 0, splitSales = 0;
  for (var r2 = 0; r2 < rows.length; r2++) {
    if (rows[r2][RA_V] === '신규 캠페인') newSales += rows[r2][RA_AMT];
    if (rows[r2][RA_V] === '캠페인 분리') splitSales += rows[r2][RA_AMT];
  }
  ui_().alert('광고 재배분 계산',
    '기본 마진율 ' + pct1_(basis['기본 마진율']) + ' · 목표 ACOS ' +
      pct1_(basis['기본 마진율'] * kTarget) + ' · 시장 CPC ¥' + mkt + '\n' +
    '마진율 시트에서 ' + nExt.toLocaleString() + '개를 읽어 ' +
      nExtHit.toLocaleString() + '개 SKU에 붙였습니다 (나머지는 기본 마진율)\n\n' +
    '  인하 ' + (stat['인하'] || 0) + '개 — 손익분기를 넘겨 사고 있다 (바로 반영 가능)\n' +
    '  인상 ' + (stat['인상'] || 0) + '개 — 살 수 있는 노출을 안 사고 있다 (바로 반영 가능)\n' +
    '  캠페인 분리 ' + (stat['캠페인 분리'] || 0) + '개 — 광고 중이나 입찰을 다른 SKU 와 공유해\n' +
    '     따로 못 바꾼다. 전용 캠페인으로 빼야 한다 (오가닉 매출 ' +
      Math.round(splitSales).toLocaleString() + '엔)\n' +
    '  신규 캠페인 ' + (stat['신규 캠페인'] || 0) + '개 — 팔리는데 광고를 안 한다 (오가닉 매출 ' +
      Math.round(newSales).toLocaleString() + '엔)\n' +
    '  성립 불가 ' + (stat['성립 불가'] || 0) + '개 — 광고가 원리상 안 된다\n' +
    '  판정 안 함 ' + (stat['판정 안 함'] || 0) + ' · 제외 ' + (stat['제외'] || 0) + '\n\n' +
    (hidden ? '표에는 손댈 것이 있는 ' + rows.length.toLocaleString() +
              '행만 넣었습니다 (나머지 ' + hidden.toLocaleString() +
              '행은 판정 안 함·제외).\n' +
              '전부 보시려면 광고기준의 [손댈 것 없는 줄도 표에 넣기]를 TRUE 로.\n\n' : '') +
    '아무것도 바꾸지 않았습니다. [사유] 칸을 보시고 맞는지 확인해 주세요.',
    ui_().ButtonSet.OK);
  return msg;
}
