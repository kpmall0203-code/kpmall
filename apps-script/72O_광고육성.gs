/**
 * 72O_광고육성.gs — 트랙 B: 새 상품을 광고로 키운다
 *
 * ── 트랙 A 와 무엇이 다른가 ─────────────────────────────
 *                    트랙 A (재배분)          트랙 B (키우기)
 *   목적             이미 팔리는 것을 수확     새 상품의 오가닉 순위를 만든다
 *   손해             허용하지 않는다           허용한다 — 단 주마다 정한 금액 안에서
 *   자료             판매실적(세션·전환율)     없다. 새 상품이라 이력이 없다
 *   그래서 입력      계산으로 다 나온다        사람이 마진율·목표 전환율을 준다
 *   끝나는 조건      채산성이 안 맞으면 탈락   졸업(순위 도달) 또는 예산 소진
 *
 * 트랙 A 는 "이 값에 사면 이익인가"를 묻는다. 트랙 B 는 "순위를 만드는 데 얼마까지
 * 쓸 것인가"를 묻는다. 후자는 계산으로 정할 수 없다 — 얼마를 잃어도 좋은지는
 * 사람이 정하는 값이다. 그래서 여기서는 추정하지 않고 받는다.
 *
 * ── 허용 손해에서 예산을 거꾸로 낸다 ────────────────────
 * 손해배수 r 로 입찰하면 (입찰 = CPC상한 × r):
 *
 *   광고 ACOS   = 입찰 ÷ (전환율 × 객단가) = 마진율 × r
 *   손해율      = ACOS − 마진율 = 마진율 × (r − 1)
 *   광고매출    = 광고비 ÷ ACOS = 광고비 ÷ (마진율 × r)
 *   주간 손해   = 광고매출 × 마진율 × (r − 1) = 광고비 × (r − 1) ÷ r
 *
 *   ⇒ 주간 광고비 = 주간 허용 손해 × r ÷ (r − 1)
 *
 * r = 1.5 면 광고비는 허용 손해의 3배, r = 2.0 이면 2배다.
 * 마진율도 객단가도 이 식에서 사라진다 — 잃는 돈의 비율은 오직 r 이 정한다.
 * r = 1 이면 손해가 0 이라 나눗셈이 안 된다 (그건 트랙 A 다).
 *
 * 단, 이 식은 '실제 전환율 = 목표 전환율' 일 때만 맞다. 전환율이 예상보다 나쁘면
 * 같은 광고비로 매출이 덜 나와 손해가 커진다. 그래서 매주 실측으로 다시 본다.
 *
 * ── 왜 광고생성계획에 줄을 밀어넣나 ─────────────────────
 * 캠페인 만들기·켜기·관제·대장은 이미 광고생성계획을 읽고 돈다. 트랙 B 가
 * 자기 실행 경로를 따로 만들면 그 넷을 전부 두 벌씩 갖게 된다.
 * 계산만 여기서 하고 결과는 그 표에 [트랙] 칸을 B 로 적어 넣는다 —
 * 그 뒤로는 트랙 A 와 똑같이 흐른다. 트랙 A 의 계획 다시 계산은 B 줄을 건드리지 않는다.
 */

var SHEET_ADGROW = '광고육성';
var ADGROW_HEADER = [
  'SKU', 'ASIN', '상품명', '기준키워드', '가격(JPY)',
  '마진율(%)', '목표전환율(%)', '주간허용손해(JPY)', '손해배수',
  '손익분기CPA(JPY)', 'CPC상한(JPY)', '시작입찰(JPY)', '주간광고비(JPY)', '하루예산(JPY)',
  '시작일', '지난주수', '누적광고비(JPY)', '누적광고매출(JPY)', '누적손해(JPY)',
  '오가닉순위', '목표순위',
  '판정', '사유', '승인', '캠페인명', '캠페인ID', '광고그룹ID', '결과'
];
// 0부터 세는 자리
var AG_SKU = 0, AG_ASIN = 1, AG_NAME = 2, AG_KW = 3, AG_PRICE = 4,
    AG_MARGIN = 5, AG_CVR = 6, AG_LOSS = 7, AG_MULT = 8,
    AG_BECPA = 9, AG_CAP = 10, AG_BID = 11, AG_WEEKLY = 12, AG_DAILY = 13,
    AG_START = 14, AG_WEEKS = 15, AG_COST = 16, AG_SALES = 17, AG_LOSSSUM = 18,
    AG_RANK = 19, AG_RANKGOAL = 20,
    AG_VERDICT = 21, AG_WHY = 22, AG_APPROVE = 23, AG_CAMP = 24, AG_CID = 25,
    AG_GID = 26, AG_RESULT = 27;
var ADGROW_ID_COLS = [26, 27];        // 1부터 — 캠페인ID·광고그룹ID 는 글자로

var ADGROW_MULT_DEFAULT = 1.5;        // 손해배수. 광고비 = 허용손해 × 3
var ADGROW_LOSS_DEFAULT = 3000;       // 주간 허용 손해 (엔). 사람이 고친다
var ADGROW_OVER_MULT = 1.5;           // 계획 손해의 이 배를 넘으면 중단
var ADGROW_MIN_WEEKS = 2;             // 이만큼은 지나야 실적으로 판단한다
var ADGROW_REPORT_WAIT_MS = 90 * 1000;
var PROP_ADGROW_REPORT = 'ADGROW_REPORT_ID';
var ADGROW_PAGE1_DEFAULT = 16;        // 광고기준의 [1페이지 순위] 가 없을 때 쓴다

/**
 * 이 상품이 이미 순위를 가졌나 — 그러면 트랙 B 가 아니다.
 *
 * 트랙 B 가 손해를 감수하는 것은 '아직 없는 순위' 를 사기 위해서다. 이미 첫 장에 있으면
 * 살 것이 없고, 손익분기를 넘겨 부르면 사는 것은 순위가 아니라 잠식이다 —
 * 어차피 오가닉으로 왔을 손님이 광고를 눌러, 공짜로 얻었을 주문에 돈을 내게 된다.
 *
 * 순위를 안 적었으면 막지 않는다. 모르는 것을 아는 척하지 않는다.
 * 순위는 검색어마다 다르므로, 여기서 보는 순위는 [기준키워드] 로 검색했을 때의 값이다 —
 * 기준키워드를 안 적었으면 'SKU 전체로 몇 위' 라는 뜻이 되어 한 단계 무른 근거다.
 *
 * @return {string} 막을 사유. 빈 문자열이면 통과
 */
function adGrowRankBlock_(rank, goal, page1) {
  var r = Number(rank) || 0;
  if (!(r > 0)) return '';                       // 안 적었으면 판단하지 않는다
  var g = Number(goal) || 0;
  if (g > 0 && r <= g) {
    return '이미 오가닉 ' + r + '위 — 목표 ' + g + '위에 들어 있습니다. ' +
           '순위가 이미 있으니 트랙 B 로 더 쓸 것이 없습니다 (트랙 A 로 가세요)';
  }
  var p1 = Number(page1) || ADGROW_PAGE1_DEFAULT;
  if (r <= p1) {
    return '이미 오가닉 ' + r + '위 — 1페이지(' + p1 + '위) 안입니다. ' +
           '여기서 손익분기를 넘겨 사면 순위가 아니라 잠식을 삽니다 (트랙 A 로 가세요)';
  }
  return '';
}

// ── 계산 ────────────────────────────────────────────────

/**
 * 한 줄의 값을 낸다. API 를 부르지 않는다 — 시트에 있는 값만 쓴다.
 * @return {{ok:boolean, why:string, beCpa,cap,bid,weekly,daily}}
 */
function adGrowCalc_(price, marginPct, cvrPct, weeklyLoss, mult) {
  var m = Number(marginPct) / 100, cvr = Number(cvrPct) / 100;
  var r = Number(mult) || ADGROW_MULT_DEFAULT;
  var loss = Number(weeklyLoss) || 0;
  if (!(price > 0)) return { ok: false, why: '가격이 없습니다 (리스팅에서 못 찾았거나 0)' };
  if (!(m > 0 && m < 1)) return { ok: false, why: '마진율을 1~99 사이로 적으세요 (퍼센트)' };
  if (!(cvr > 0 && cvr < 1)) return { ok: false, why: '목표 전환율을 0.1~99 사이로 적으세요 (퍼센트)' };
  if (!(r > 1)) return { ok: false, why: '손해배수는 1보다 커야 합니다 (1 이면 손해가 0 — 그건 트랙 A)' };
  if (!(loss > 0)) return { ok: false, why: '주간 허용 손해를 적으세요 (얼마까지 잃어도 좋은지)' };

  var beCpa = price * m;            // 한 건 팔아 남는 돈
  var cap = beCpa * cvr;            // 이 위로 사면 팔수록 손해 (트랙 A 의 상한과 같다)
  var bid = cap * r;                // 일부러 상한을 넘겨 산다 — 그것이 트랙 B 다
  var weekly = loss * r / (r - 1);  // 위 유도식
  var daily = weekly / 7;
  return { ok: true, why: '', beCpa: beCpa, cap: cap,
           bid: Math.max(2, Math.floor(bid)),
           weekly: Math.round(weekly), daily: Math.max(100, Math.round(daily)) };
}

/**
 * 돌고 있는 육성 광고그룹 → 그 줄의 잣대. 시트만 읽는다.
 *
 * 검색어 판정(72L)이 이것을 봐야 한다. 트랙 B 는 일부러 손익분기를 넘겨 사므로,
 * 손익분기로 재면 육성 캠페인의 검색어가 구조적으로 전부 '부정' 이 된다 —
 * 순위를 사려고 돈을 쓰던 바로 그 말을 스스로 막게 된다.
 *
 * @return {Object} 광고그룹ID → {mult, beCpa, sku, camp}
 */
function adGrowGroups_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADGROW);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var gid = String(v[i][AG_GID] || '').trim();
    if (!gid) continue;
    // 졸업·중단한 줄은 더 이상 트랙 B 의 잣대로 보지 않는다 — 손해를 그만 보기로 한 것이다
    var vd = String(v[i][AG_VERDICT] || '');
    if (vd === '졸업' || vd === '중단') continue;
    out[gid] = { mult: Number(v[i][AG_MULT]) || ADGROW_MULT_DEFAULT,
                 beCpa: Number(v[i][AG_BECPA]) || 0,
                 sku: String(v[i][AG_SKU] || ''), camp: String(v[i][AG_CAMP] || '') };
  }
  return out;
}

/** 이 계정에서 권할 만한 목표 전환율 — 추정이 아니라 참고용 중앙값 */
function adGrowSuggestCvr_() {
  var sh = ss_().getSheetByName(SHEET_REALLOC);
  if (!sh || sh.getLastRow() < 2) return 0;
  var v = sh.getRange(2, 7, sh.getLastRow() - 1, 1).getValues();   // 오가닉전환율
  var a = [];
  for (var i = 0; i < v.length; i++) { var x = Number(v[i][0]); if (x > 0) a.push(x); }
  if (!a.length) return 0;
  a.sort(function (p, q) { return p - q; });
  return a[Math.floor(a.length / 2)] * 100;
}

// ── 시트 ────────────────────────────────────────────────

/** 메뉴: 육성 상품 등록 (SKU 를 붙여넣으면 나머지를 채운다) */
function addAdGrowSku() {
  var sh = ensureSheet_(SHEET_ADGROW, ADGROW_HEADER);
  var res = ui_().prompt('트랙 B — 키울 상품 등록',
    '키울 SKU 를 줄바꿈이나 쉼표로 넣으세요.\n' +
    'ASIN·상품명·가격은 리스팅에서 자동으로 채웁니다.\n\n' +
    '그 뒤 표에서 이 셋을 직접 적으세요:\n' +
    '   마진율(%)          이 상품이 실제로 남기는 비율\n' +
    '   목표전환율(%)      이 정도는 팔리겠다 싶은 값' +
    (function () { var s = adGrowSuggestCvr_();
      return s ? ' (계정 중앙값 ' + s.toFixed(1) + '%)' : ''; })() + '\n' +
    '   주간허용손해(JPY)  한 주에 얼마까지 잃어도 좋은가\n' +
    '   기준키워드         순위를 사려는 말 (비우면 자동 캠페인)',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var want = String(res.getResponseText()).split(/[\n,]/)
    .map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  if (!want.length) return;

  // 리스팅에서 채운다 (시트 → 시트, API 없음)
  var lsh = ss_().getSheetByName(SHEET_LISTING);
  var info = {};
  if (lsh && lsh.getLastRow() > 1) {
    var lv = lsh.getRange(2, 1, lsh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      var s = String(lv[i][L_SKU] || '').trim();
      if (s) info[s] = { asin: String(lv[i][L_ASIN] || ''), name: String(lv[i][L_JP] || ''),
                         price: Number(lv[i][L_PRICE]) || 0 };
    }
  }
  var have = {};
  if (sh.getLastRow() > 1) {
    var ev = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var e = 0; e < ev.length; e++) have[String(ev[e][0]).trim()] = true;
  }

  var add = [], miss = [], dup = 0;
  for (var w = 0; w < want.length; w++) {
    var sku = want[w];
    if (have[sku]) { dup++; continue; }
    var f = info[sku];
    if (!f) miss.push(sku);
    var row = new Array(ADGROW_HEADER.length).fill('');
    row[AG_SKU] = sku;
    row[AG_ASIN] = f ? f.asin : '';
    row[AG_NAME] = f ? f.name : '';
    row[AG_PRICE] = f ? f.price : '';
    row[AG_MULT] = ADGROW_MULT_DEFAULT;
    row[AG_LOSS] = ADGROW_LOSS_DEFAULT;
    row[AG_VERDICT] = '값 입력 필요';
    row[AG_WHY] = '마진율 · 목표전환율 · 주간허용손해를 적고 [트랙 B 계산]을 누르세요';
    add.push(row);
  }
  if (add.length) {
    var at = Math.max(sh.getLastRow(), 1) + 1;
    var need = at + add.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(at, ADGROW_ID_COLS[0], add.length, 2).setNumberFormat('@');
    sh.getRange(at, 1, add.length, ADGROW_HEADER.length).setValues(add);
    sh.getRange(at, AG_APPROVE + 1, add.length, 1).insertCheckboxes();
  }
  sh.setFrozenRows(1);
  showSheet_(SHEET_ADGROW);
  ui_().alert('트랙 B — 등록',
    add.length + '개를 넣었습니다' + (dup ? ' (이미 있는 ' + dup + '개는 건너뜀)' : '') + '.\n' +
    (miss.length ? '\n⚠ 리스팅에 없어 가격을 못 채운 SKU ' + miss.length + '개:\n   ' +
                   miss.slice(0, 5).join(', ') + (miss.length > 5 ? ' 외' : '') +
                   '\n   가격을 직접 적으세요.\n' : '') +
    '\n표에서 마진율 · 목표전환율 · 주간허용손해 · 기준키워드를 적은 뒤\n[트랙 B 계산]을 누르세요.',
    ui_().ButtonSet.OK);
}

/** 메뉴: 트랙 B 계산 — 입찰·예산을 낸다. API 안 부름 */
function calcAdGrow() {
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다. [키울 상품 등록]을 먼저 하세요.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  var basis = adBasis_();
  var page1 = Number(basis['1페이지 순위']) || ADGROW_PAGE1_DEFAULT;

  var ok = 0, bad = 0, blocked = 0, totWeekly = 0, totLoss = 0;
  for (var i = 0; i < v.length; i++) {
    if (!String(v[i][AG_SKU]).trim()) continue;

    // 이미 순위가 있으면 계산 자체를 하지 않는다. 값이 남아 있으면 실수로 켜게 된다
    var block = adGrowRankBlock_(v[i][AG_RANK], v[i][AG_RANKGOAL], page1);
    if (block && String(v[i][AG_RESULT]).indexOf('성공') !== 0) {
      blocked++;
      v[i][AG_BID] = ''; v[i][AG_WEEKLY] = ''; v[i][AG_DAILY] = '';
      v[i][AG_VERDICT] = '트랙 A 로'; v[i][AG_WHY] = block;
      continue;
    }
    var c = adGrowCalc_(v[i][AG_PRICE], v[i][AG_MARGIN], v[i][AG_CVR], v[i][AG_LOSS], v[i][AG_MULT]);
    if (!c.ok) {
      bad++;
      v[i][AG_BECPA] = ''; v[i][AG_CAP] = ''; v[i][AG_BID] = '';
      v[i][AG_WEEKLY] = ''; v[i][AG_DAILY] = '';
      v[i][AG_VERDICT] = '값 입력 필요'; v[i][AG_WHY] = c.why;
      continue;
    }
    ok++;
    totWeekly += c.weekly; totLoss += Number(v[i][AG_LOSS]) || 0;
    v[i][AG_BECPA] = Math.round(c.beCpa);
    v[i][AG_CAP] = Math.round(c.cap * 10) / 10;
    v[i][AG_BID] = c.bid;
    v[i][AG_WEEKLY] = c.weekly;
    v[i][AG_DAILY] = c.daily;
    if (!String(v[i][AG_CAMP]).trim()) {
      v[i][AG_CAMP] = adGrowName_(String(v[i][AG_ASIN]), String(v[i][AG_SKU]));
    }
    // 이미 돌고 있는 줄은 주간 판정이 판정을 쓴다. 아직 안 만든 줄만 여기서 적는다
    if (!String(v[i][AG_RESULT]).trim()) {
      v[i][AG_VERDICT] = '준비됨';
      v[i][AG_WHY] = '입찰 ¥' + c.bid + ' (상한 ¥' + (Math.round(c.cap * 10) / 10) +
                     ' × 손해배수 ' + (Number(v[i][AG_MULT]) || ADGROW_MULT_DEFAULT) + ') · ' +
                     '주간 ¥' + c.weekly.toLocaleString() + ' 써서 ¥' +
                     Number(v[i][AG_LOSS]).toLocaleString() + ' 를 잃는다';
    }
  }
  sh.getRange(2, 1, v.length, ADGROW_HEADER.length).setValues(v);
  adGrowNotes_(sh);
  showSheet_(SHEET_ADGROW);
  ui_().alert('트랙 B 계산',
    '계산됨 ' + ok + '개' + (bad ? ' · 값이 모자란 줄 ' + bad + '개' : '') +
    (blocked ? ' · 이미 순위가 있어 뺀 줄 ' + blocked + '개' : '') + '\n\n' +
    (blocked ? '⚠ ' + blocked + '개는 이미 1페이지(' + page1 + '위) 안이라 트랙 B 에서 뺐습니다.\n' +
               '   순위가 있으면 손익분기를 넘겨 사도 잠식만 삽니다 — [② 광고 재배분 계산]으로 가세요.\n\n' : '') +
    (ok ? '주간 광고비 합계 ¥' + totWeekly.toLocaleString() + '\n' +
          '그중 잃기로 한 돈 ¥' + totLoss.toLocaleString() +
          ' (나머지는 팔려서 돌아옵니다)\n\n' +
          '⚠ 이 금액이 [광고기준 → 주간 광고비 한도] 안에 들어가는지 보세요.\n' +
          '   넘으면 관제가 트랙 A 까지 전부 멈춥니다.\n\n' : '') +
    '승인 ✓ 를 체크한 뒤 [트랙 B 계획에 넣기]를 누르세요.',
    ui_().ButtonSet.OK);
}

/** 캠페인 이름 — 트랙 A 와 구별되게 GROW 를 붙인다 (아스키만) */
function adGrowName_(asin, sku) {
  var base = adAsciiName_(asin, '');
  if (!base) base = 'SKU' + adShortHash_(sku);
  return 'KP GROW ' + base;
}

/** 머리글 설명 */
function adGrowNotes_(sh) {
  headerNotes_(sh, 1, ADGROW_HEADER, {
    '마진율(%)': '이 상품이 실제로 남기는 비율. 수수료·배송비를 뺀 뒤입니다.\n트랙 B 는 바깥 시트를 읽지 않습니다 — 여기에 직접 적으세요.',
    '목표전환율(%)': '이 정도는 팔리겠다 싶은 값. 새 상품이라 이력이 없어 사람이 정합니다.\n너무 높게 잡으면 입찰이 높아져 손해가 커집니다.',
    '주간허용손해(JPY)': '한 주에 얼마까지 잃어도 좋은가. 이 값에서 광고비를 거꾸로 냅니다.',
    '손해배수': '입찰 = CPC상한 × 이 값. 1.5 면 손익분기보다 50% 비싸게 삽니다.\n주간 광고비 = 허용손해 × 배수 ÷ (배수 − 1). 1.5 면 3배, 2.0 이면 2배.',
    'CPC상한(JPY)': '손익분기CPA × 목표전환율. 트랙 A 라면 이 위로 안 삽니다.\n트랙 B 는 일부러 넘깁니다 — 그것이 순위를 사는 값입니다.',
    '주간광고비(JPY)': '허용손해 × 손해배수 ÷ (손해배수 − 1). 실제 전환율이 목표보다 나쁘면 손해가 더 큽니다.',
    '기준키워드': '순위를 사려는 말. 이 말로 검색했을 때의 순위를 [오가닉순위]에 적습니다.\n' +
      '적으면 그 말 하나만 사는 수동(MANUAL) 캠페인을 만듭니다 — 트랙 B 가 사려는 것이 바로 그 순위입니다.\n' +
      '비우면 자동(AUTO) 캠페인이 되어 아마존이 고른 말에 손해배수 입찰이 나갑니다.\n' +
      '어느 말로 팔릴지 아직 모를 때만 비우세요.',
    '오가닉순위': '아마존이 API 로 주지 않습니다. 직접 보고 적으세요.\n' +
      '순위는 검색어마다 다릅니다 — [기준키워드] 로 검색했을 때의 순위를 적으세요.\n' +
      '이미 1페이지(광고기준의 [1페이지 순위]) 안이면 트랙 B 에서 뺍니다 — ' +
      '순위가 있으면 손익분기를 넘겨 사도 잠식만 삽니다.\n목표순위에 닿으면 졸업입니다.',
    '누적손해(JPY)': '누적광고비 − 누적광고매출 × 마진율. 실측입니다.',
    '판정': '준비됨 → 계획에 넣을 수 있음\n돌고 있음 → 계획대로 진행 중\n' +
      '트랙 A 로 → 이미 1페이지라 육성 대상이 아닙니다\n' +
      '졸업 → 순위 도달, 트랙 A 로 넘기세요\n중단 → 손해가 계획을 넘었습니다',
    '승인': '체크한 줄만 [계획에 넣기]가 광고생성계획으로 보냅니다.'
  });
}

// ── 계획 표로 밀어넣기 ──────────────────────────────────

/** 메뉴: 승인한 육성 줄을 광고생성계획에 트랙 B 줄로 넣는다 */
function pushAdGrowToPlan() {
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  // 계산 뒤에 순위를 적었을 수 있다. 돈이 나가기 직전에 한 번 더 본다
  var page1b = Number(adBasis_()['1페이지 순위']) || ADGROW_PAGE1_DEFAULT;
  var pick = [], skipRank = [];
  for (var i = 0; i < v.length; i++) {
    if (!adRowApproved_(v[i][AG_APPROVE])) continue;
    if (!(Number(v[i][AG_BID]) > 0)) continue;              // 계산 안 된 줄
    if (String(v[i][AG_RESULT]).indexOf('성공') === 0) continue;  // 이미 만든 줄
    if (adGrowRankBlock_(v[i][AG_RANK], v[i][AG_RANKGOAL], page1b)) {
      skipRank.push(String(v[i][AG_SKU])); continue;
    }
    pick.push({ row: i, v: v[i] });
  }
  if (!pick.length) {
    ui_().alert('넣을 줄이 없습니다.',
      '승인 ✓ 이면서 계산이 끝났고 아직 안 만든 줄이 없습니다.\n' +
      (skipRank.length ? '\n이미 1페이지 안이라 뺀 줄 ' + skipRank.length + '개: ' +
                         skipRank.slice(0, 5).join(', ') + '\n' : '') +
      '[트랙 B 계산]을 먼저 하고 승인 칸을 체크하세요.', ui_().ButtonSet.OK);
    return;
  }

  var psh = ensureSheet_(SHEET_ADPLAN, ADPLAN_HEADER);
  var pv = psh.getLastRow() > 1
    ? psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues() : [];
  var byName = {};
  for (var p = 0; p < pv.length; p++) byName[String(pv[p][AP_NAME - 1]).trim()] = p;

  var added = 0, updated = 0, daily = 0;
  for (var k = 0; k < pick.length; k++) {
    var g = pick[k].v;
    var name = String(g[AG_CAMP]).trim();
    var row = new Array(ADPLAN_HEADER.length).fill('');
    row[0] = 'B' + (k + 1);
    row[AP_ACTION - 1] = '생성';
    row[2] = '육성';                          // 방식
    row[AP_NAME - 1] = name;
    /**
     * 기준키워드가 있으면 수동(MANUAL). 트랙 B 가 사려는 것은 '그 말의 순위' 인데,
     * 자동 캠페인은 아마존이 고른 말에 손해배수 입찰을 쓴다 — 사려던 순위가 아니라
     * 엉뚱한 말의 노출을 손해 보며 사게 된다. 아직 어느 말로 팔릴지 모르면 비워 두고
     * 자동으로 찾게 한다 (그때는 검색어 판정이 트랙 B 잣대로 골라 준다).
     */
    var kw = String(g[AG_KW] || '').trim();
    row[4] = kw ? '수동' : '자동';            // 유형 — 72J 가 이 칸을 보고 MANUAL/AUTO
    row[AP_DAILY - 1] = Number(g[AG_DAILY]) || 0;
    row[AP_BID - 1] = Number(g[AG_BID]) || 0;
    row[7] = 1;                               // SKU수
    row[8] = 0;                               // 기존SKU수
    row[9] = String(g[AG_SKU]);               // 대표SKU
    row[10] = '육성';                         // CPC구간
    row[11] = Math.round(Number(g[AG_BECPA]) || 0);
    row[12] = '';                             // 월매출합 — 새 상품이라 없다
    row[13] = '실행 시 확인';
    row[14] = '트랙 B — 순위를 만들려고 상한(¥' + g[AG_CAP] + ')을 배수 ' +
              (g[AG_MULT] || ADGROW_MULT_DEFAULT) + ' 로 넘겨 산다. ' +
              '주간 허용 손해 ¥' + Number(g[AG_LOSS]).toLocaleString() +
              (kw ? ' · 기준키워드 "' + kw + '"' : ' · 기준키워드 없음 (자동으로 찾는다)');
    row[AP_SKUS - 1] = String(g[AG_SKU]);
    row[AP_APPROVE - 1] = false;              // 계획 표에서 한 번 더 승인해야 켜진다
    row[ADPLAN_HEADER.length - 1] = 'B';      // 트랙

    daily += Number(g[AG_DAILY]) || 0;
    if (byName[name] !== undefined) {
      var at = byName[name];
      // 이미 만든 것이면 ID·결과·승인은 그대로 두고 값만 갱신한다
      row[AP_GID - 1] = pv[at][AP_GID - 1];
      row[AP_CID - 1] = pv[at][AP_CID - 1];
      row[AP_RESULT - 1] = pv[at][AP_RESULT - 1];
      row[AP_APPROVE - 1] = pv[at][AP_APPROVE - 1];
      row[AP_ADIDS - 1] = pv[at][AP_ADIDS - 1];
      row[0] = pv[at][0];
      pv[at] = row; updated++;
    } else {
      pv.push(row); added++;
    }
  }

  var need = Math.max(pv.length + 1, 2);
  if (psh.getMaxRows() < need) psh.insertRowsAfter(psh.getMaxRows(), need - psh.getMaxRows());
  psh.getRange(2, AP_GID, need - 1, 1).setNumberFormat('@');
  psh.getRange(2, AP_CID, need - 1, 1).setNumberFormat('@');
  writeTable_(psh, ADPLAN_HEADER, pv);
  if (pv.length) psh.getRange(2, AP_APPROVE, pv.length, 1).insertCheckboxes();

  showSheet_(SHEET_ADPLAN);
  ui_().alert('계획에 넣었습니다',
    '새로 ' + added + '개' + (updated ? ' · 값 갱신 ' + updated + '개' : '') +
    (skipRank.length ? ' · 이미 1페이지라 뺀 줄 ' + skipRank.length + '개' : '') + '\n' +
    '하루 예산 합계 ¥' + daily.toLocaleString() + '\n\n' +
    '다음:\n' +
    '  ① 광고생성계획에서 이 줄들의 [승인] 을 체크\n' +
    '  ② [⑤ 승인분 캠페인 생성] — 멈춤 상태로 만들어집니다\n' +
    '  ③ [④ 기준키워드 올리기] — 수동 캠페인에 그 말을 넣습니다 (기준키워드를 적은 줄만)\n' +
    '  ④ [켜기 — 승인 ✓ 만] — 여기서부터 돈이 나갑니다\n\n' +
    '⚠ 켜기 전에 [광고기준 → 주간 광고비 한도]가 트랙 A + B 를 합쳐\n' +
    '   감당할 값인지 확인하세요. 넘으면 관제가 전부 멈춥니다.',
    ui_().ButtonSet.OK);
}

// ── 기준키워드 올리기 ───────────────────────────────────

/**
 * 메뉴: 만들어진 육성 캠페인에 [기준키워드] 를 정확 일치로 올린다.
 *
 * 왜 따로 한 걸음인가: 캠페인 만들기(72J)는 계획 표만 읽고 상품만 담는다.
 * 거기에 키워드까지 끼워 넣으면 트랙 A 의 실행 경로가 트랙 B 를 알아야 한다.
 * 승격(72M)이 그렇듯 키워드는 제 걸음에서 올린다 — 실패해도 캠페인은 남는다.
 *
 * 입찰은 [시작입찰] 을 그대로 쓴다. 그것이 트랙 B 가 정한 값이다
 * (CPC상한 × 손해배수 — 일부러 손익분기를 넘긴 값).
 */
function applyAdGrowKeyword() {
  if (!adBusyGuard_('기준키워드 올리기')) return;
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  var pick = [], noCamp = 0, noKw = 0, done = 0;
  for (var i = 0; i < v.length; i++) {
    var kw = String(v[i][AG_KW] || '').trim();
    if (!kw) { noKw++; continue; }
    var gid = String(v[i][AG_GID] || '').trim(), cid = String(v[i][AG_CID] || '').trim();
    if (!gid || !cid) { noCamp++; continue; }
    if (String(v[i][AG_RESULT] || '').indexOf('키워드') >= 0) { done++; continue; }
    var bid = Number(v[i][AG_BID]) || 0;
    if (!(bid > 0)) { noCamp++; continue; }
    if (kw.length > 80) {
      v[i][AG_RESULT] = String(v[i][AG_RESULT] || '') + ' · 키워드 실패: ' + kw.length +
                        '자 — 아마존 한도 80자';
      continue;
    }
    pick.push({ row: i, kw: kw, bid: bid, cid: cid, gid: gid,
                sku: String(v[i][AG_SKU] || ''), asin: String(v[i][AG_ASIN] || ''),
                camp: String(v[i][AG_CAMP] || '') });
  }

  if (!pick.length) {
    showSheet_(SHEET_ADGROW);
    ui_().alert('올릴 기준키워드가 없습니다.',
      (done ? '이미 올린 줄 ' + done + '개\n' : '') +
      (noKw ? '기준키워드가 빈 줄 ' + noKw + '개 — 자동 캠페인이라 키워드가 없습니다\n' : '') +
      (noCamp ? '캠페인이 아직 없거나 입찰이 안 나온 줄 ' + noCamp + '개\n' : '') +
      '\n[③ 계획에 넣기] → 광고생성계획 승인 → [⑤ 승인분 캠페인 생성] 을 먼저 하세요.',
      ui_().ButtonSet.OK);
    return;
  }

  var ok = ui_().alert('기준키워드 올리기',
    pick.map(function (x) { return '· "' + x.kw + '" → ' + x.camp + ' · ¥' + x.bid; }).join('\n') +
    '\n\n이 값은 손익분기를 일부러 넘긴 값입니다 — 그것이 순위를 사는 값입니다.\n' +
    '켜기 전까지는 돈이 나가지 않습니다.\n\n계속할까요?', ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return;

  var token = adsToken_(), okN = 0, failN = 0, logs = [];
  for (var b = 0; b < pick.length; b += 50) {
    var part = pick.slice(b, b + 50);
    var res;
    try {
      res = adTermSend_(token, '승격', part.map(function (x) {
        return { payload: { campaignId: x.cid, adGroupId: x.gid, keywordText: x.kw,
                            matchType: 'EXACT', state: 'ENABLED', bid: x.bid } };
      }));
    } catch (e) {
      res = part.map(function () { return { ok: false, msg: String(e).substring(0, 140) }; });
    }
    for (var j = 0; j < part.length; j++) {
      var it = part[j], r = res[j] || { ok: false, msg: '응답 없음' };
      if (r.ok) {
        okN++;
        v[it.row][AG_RESULT] = String(v[it.row][AG_RESULT] || '') + ' · 키워드 ' + (r.id || '');
        logs.push(adLogRow_({ kind: '키워드', camp: it.camp, group: it.camp, target: it.kw,
          item: '입찰', from: '', to: it.bid, sku: it.sku, asin: it.asin,
          sum: '기준키워드 올림 · "' + it.kw + '" · ' + it.camp + ' · ' + it.bid + '엔',
          why: '트랙 B — 이 말의 순위를 사려고 손익분기를 넘겨 부른다',
          cid: it.cid, gid: it.gid, tid: r.id || '' }));
      } else {
        failN++;
        v[it.row][AG_RESULT] = String(v[it.row][AG_RESULT] || '') + ' · 키워드 실패: ' +
                               adErrorText_(r.msg).substring(0, 120);
      }
    }
  }
  sh.getRange(2, 1, v.length, ADGROW_HEADER.length).setValues(v);
  if (logs.length) adLogWrite_(logs);

  log_('ads', failN ? 'WARN' : 'INFO', '기준키워드 올리기 — ' + okN + '개 성공' +
       (failN ? ' · ' + failN + '개 실패' : ''));
  showSheet_(SHEET_ADGROW);
  ui_().alert(failN ? '일부 실패' : '올렸습니다',
    okN + '개 성공' + (failN ? ' · ' + failN + '개 실패 ([결과] 칸에 사유)' : '') + '\n\n' +
    (okN ? '다음: [켜기 — 승인 ✓ 만] — 여기서부터 돈이 나갑니다.\n' +
           '⚠ 켜기 전에 관제의 트랙 B 한도를 한 번 보세요.' : ''),
    ui_().ButtonSet.OK);
}

/**
 * 판정만 하고 멈추지 않으면 판정이 아무 일도 안 한 것이다.
 *
 * 처음엔 "캠페인을 멈추세요" 라고 안내만 했다. 그런데 [전부 멈추기]는 트랙 A 까지
 * 죽이고, 한 줄만 멈추려면 관제 표에서 손으로 체크해야 한다 — 손해가 계획을
 * 넘었다고 적어 놓고 돈은 계속 나가는 자리였다. 멈추는 것은 돈을 쓰는 일이 아니라
 * 그만 쓰는 일이라, 승인 칸을 두지 않고 여기서 바로 멈춘다 (관제와 같은 규칙).
 *
 * @param {Array} v     육성 표 (제자리에서 [결과] 칸을 고친다)
 * @param {Array} live  볼 줄의 자리 번호
 * @return {string[]} 멈춘 캠페인 이름
 */
function adGrowStopDecided_(v, live, interactive) {
  var stopList = [], stopWhy = {};
  var ours = adWatchOurs_(), byName = {};
  for (var w = 0; w < ours.length; w++) byName[ours[w].name.trim()] = ours[w];
  for (var q = 0; q < live.length; q++) {
    var gg = v[live[q]];
    var vd = String(gg[AG_VERDICT]);
    if (vd !== '졸업' && vd !== '중단') continue;
    if (String(gg[AG_RESULT] || '').indexOf('멈춤') >= 0) continue;   // 이미 멈춘 줄
    var oc = byName[String(gg[AG_CAMP]).trim()];
    if (!oc) continue;
    stopList.push(oc); stopWhy[oc.name] = vd;
    gg[AG_RESULT] = String(gg[AG_RESULT] || '') + ' · 멈춤(' + vd + ')';
    v[live[q]] = gg;
  }
  if (!stopList.length) return [];

  var okStop = !interactive || ui_().alert('멈출 캠페인 ' + stopList.length + '개',
    stopList.map(function (c) { return '· ' + c.name + ' — ' + stopWhy[c.name]; }).join('\n') +
    '\n\n졸업 = 목표 순위에 닿았습니다. 더 잃을 이유가 없습니다.\n' +
    '중단 = 손해가 계획을 넘었습니다.\n\n지금 멈출까요?',
    ui_().ButtonSet.OK_CANCEL) === ui_().Button.OK;
  if (!okStop) {
    // 안 멈추기로 했으면 표시도 되돌린다 — 표가 거짓말을 하면 안 된다
    for (var u = 0; u < live.length; u++) {
      v[live[u]][AG_RESULT] = String(v[live[u]][AG_RESULT] || '')
        .replace(/ · 멈춤\((졸업|중단)\)$/, '');
    }
    return [];
  }

  // 졸업과 중단은 이유가 다르다 — 대장에 뭉뚱그리지 않고 따로 적는다
  var tk = adsToken_(), stopped = [], kinds = ['졸업', '중단'];
  for (var k = 0; k < kinds.length; k++) {
    var part = stopList.filter(function (c) { return stopWhy[c.name] === kinds[k]; });
    if (!part.length) continue;
    stopped = stopped.concat(adWatchPause_(tk, part,
      kinds[k] === '졸업' ? '목표 순위에 닿았습니다 — 더 잃을 이유가 없습니다'
                          : '누적 손해가 계획을 넘었습니다',
      '트랙 B 주간 판정'));
  }
  return stopped;
}

// ── 주간 판정 ───────────────────────────────────────────

/**
 * 메뉴: 트랙 B 주간 판정.
 * 시작일부터 어제까지의 실적을 받아 누적 손해를 실측하고 졸업·중단을 가른다.
 * 캠페인이 몇 개뿐이라 리포트 한 번이면 된다.
 */
function reviewAdGrow() { return adGrowReview_(true); }

function adGrowReview_(interactive) {
  if (!adBusyGuard_('트랙 B 판정')) return;
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  // 돌고 있는 줄 (캠페인ID 가 있는 것) 만 본다
  var live = [], oldest = '';
  for (var i = 0; i < v.length; i++) {
    var cid = String(v[i][AG_CID] || '').trim();
    if (!cid) continue;
    live.push(i);
    var st = v[i][AG_START] instanceof Date ? ymd_(v[i][AG_START]) : String(v[i][AG_START] || '');
    if (st && (!oldest || st < oldest)) oldest = st;
  }
  if (!live.length) {
    if (interactive) ui_().alert('돌고 있는 육성 캠페인이 없습니다.',
      '캠페인을 만들고 켠 뒤에 판정할 수 있습니다.', ui_().ButtonSet.OK);
    return null;
  }

  var to = ymd_(new Date(Date.now() - 86400000));
  var from = oldest || addDays_(to, -27);
  var saved = ADS_SOFT_MS;
  ADS_SOFT_MS = ADGROW_REPORT_WAIT_MS;
  var rep;
  try {
    rep = adsRunReport_(adsToken_(), PROP_ADGROW_REPORT,
      { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['campaign'], columns: ADCAMP_COLS,
        reportTypeId: ADCAMP_REPORT_TYPE, timeUnit: 'SUMMARY', format: 'GZIP_JSON' },
      from, to, '육성');
  } finally { ADS_SOFT_MS = saved; }
  if (rep === null) {
    if (interactive) ui_().alert('트랙 B 판정 — 리포트 준비 중',
      '아마존이 실적을 만들고 있습니다 (오류 아님).\n1~2분 뒤 다시 누르면 이어받습니다.',
      ui_().ButtonSet.OK);
    return { pending: true };
  }
  var perf = {};
  for (var r = 0; r < rep.length; r++) {
    var cid0 = String(rep[r].campaignId || '');
    if (!cid0) continue;
    var pp = perf[cid0] || (perf[cid0] = { ck: 0, cost: 0, sales: 0, ord: 0 });
    pp.ck += Number(rep[r].clicks) || 0; pp.cost += Number(rep[r].cost) || 0;
    pp.sales += Number(rep[r].sales14d) || 0; pp.ord += Number(rep[r].purchases14d) || 0;
  }

  var stat = {};
  for (var q = 0; q < live.length; q++) {
    var ix = live[q], g = v[ix];
    var p = perf[String(g[AG_CID]).trim()] || { ck: 0, cost: 0, sales: 0, ord: 0 };
    var st2 = g[AG_START] instanceof Date ? ymd_(g[AG_START]) : String(g[AG_START] || '');
    var weeks = st2 ? Math.max(1, Math.ceil((daysBetween_(st2, to) + 1) / 7)) : 1;
    var m = Number(g[AG_MARGIN]) / 100;
    var lossSum = p.cost - p.sales * m;               // 실측 손해
    var planned = (Number(g[AG_LOSS]) || 0) * weeks;  // 계획대로면 이만큼

    g[AG_WEEKS] = weeks;
    g[AG_COST] = Math.round(p.cost);
    g[AG_SALES] = Math.round(p.sales);
    g[AG_LOSSSUM] = Math.round(lossSum);

    var d = adGrowVerdict_(g, p, weeks, lossSum, planned);
    g[AG_VERDICT] = d.v; g[AG_WHY] = d.why;
    stat[d.v] = (stat[d.v] || 0) + 1;
    v[ix] = g;
  }
  var stopped = adGrowStopDecided_(v, live, interactive);

  sh.getRange(2, 1, v.length, ADGROW_HEADER.length).setValues(v);
  showSheet_(SHEET_ADGROW);

  var line = Object.keys(stat).map(function (k) { return k + ' ' + stat[k]; }).join(' · ');
  log_('ads', 'INFO', '트랙 B 판정 — ' + from + '~' + to + ' · ' + line +
       (stopped.length ? ' · 멈춤 ' + stopped.length : ''));
  if (!interactive) return { from: from, to: to, line: line, stopped: stopped };
  ui_().alert('트랙 B 판정', from + ' ~ ' + to + '\n\n' + line + '\n\n' +
    (stopped.length ? '멈춤 ' + stopped.length + '개: ' + stopped.join(', ') + '\n\n' : '') +
    (!stopped.length && (stat['졸업'] || stat['중단']) ? '멈추지 않았습니다.\n\n' : '') +
    '졸업 = 목표 순위에 닿았습니다. 트랙 A(재배분)가 다음 계산에서 이 상품을 잡습니다.\n' +
    '중단 = 손해가 계획을 넘었습니다.\n\n' +
    '오가닉 순위는 아마존이 API 로 주지 않습니다 — 직접 보고 [오가닉순위] 칸에 적으세요.',
    ui_().ButtonSet.OK);
}

/**
 * 한 줄을 판정한다.
 * 졸업이 맨 위인 이유: 순위를 만들었으면 더 잃을 이유가 없다.
 */
function adGrowVerdict_(g, p, weeks, lossSum, planned) {
  var rank = Number(g[AG_RANK]) || 0, goal = Number(g[AG_RANKGOAL]) || 0;
  if (goal > 0 && rank > 0 && rank <= goal) {
    return { v: '졸업', why: '오가닉 순위 ' + rank + '위 — 목표 ' + goal + '위에 닿았습니다. ' +
             '캠페인을 멈추고 트랙 A(재배분)로 넘기세요' };
  }
  if (planned > 0 && lossSum > planned * ADGROW_OVER_MULT) {
    return { v: '중단', why: '누적 손해 ¥' + Math.round(lossSum).toLocaleString() +
             ' > 계획 ¥' + Math.round(planned).toLocaleString() + ' 의 ' + ADGROW_OVER_MULT + '배. ' +
             '목표 전환율이 너무 높았거나 상품이 안 팔립니다' };
  }
  if (weeks < ADGROW_MIN_WEEKS) {
    return { v: '돌고 있음', why: weeks + '주차 — ' + ADGROW_MIN_WEEKS + '주는 지나야 판단합니다 (' +
             '광고비 ¥' + Math.round(p.cost).toLocaleString() + ' · 주문 ' + p.ord + ')' };
  }
  var cvr = p.ck > 0 ? p.ord / p.ck : 0;
  var want = Number(g[AG_CVR]) / 100;
  if (p.ck >= 50 && want > 0 && cvr < want / 2) {
    return { v: '중단', why: '실제 전환율 ' + pct1_(cvr) + ' — 목표 ' + pct1_(want) +
             ' 의 절반에 못 미칩니다 (클릭 ' + p.ck + '). 이 값에 사면 손해만 커집니다' };
  }
  if (p.ck >= 50 && want > 0 && cvr > want * 1.2) {
    return { v: '돌고 있음 (좋음)', why: '실제 전환율 ' + pct1_(cvr) + ' > 목표 ' + pct1_(want) +
             ' · 누적 손해 ¥' + Math.round(lossSum).toLocaleString() +
             ' (계획 ¥' + Math.round(planned).toLocaleString() + ')' +
             (rank ? ' · 순위 ' + rank + '위' : ' · 순위를 적으면 졸업을 판정합니다') };
  }
  return { v: '돌고 있음', why: weeks + '주차 · 클릭 ' + p.ck + ' · 주문 ' + p.ord +
           ' · 누적 손해 ¥' + Math.round(lossSum).toLocaleString() +
           ' (계획 ¥' + Math.round(planned).toLocaleString() + ')' +
           (rank ? ' · 순위 ' + rank + '위' : ' · 순위를 적으면 졸업을 판정합니다') };
}

/**
 * 캠페인을 만든 뒤 그 ID 와 시작일을 육성 표에 돌려 적는다 (72J 가 부른다).
 * 주간 판정이 캠페인ID 로 실적을 찾으므로 이것이 없으면 판정이 안 돈다.
 * 시작일은 '만든 날' 이 아니라 비어 있을 때만 적는다 — 다시 만들어도 주차가 안 밀린다.
 */
function adGrowStamp_(campName, cid, gid) {
  var sh = ss_().getSheetByName(SHEET_ADGROW);
  if (!sh || sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var v = sh.getRange(2, 1, n, ADGROW_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][AG_CAMP]).trim() !== String(campName).trim()) continue;
    sh.getRange(i + 2, AG_CID + 1).setValue(String(cid));
    sh.getRange(i + 2, AG_GID + 1).setValue(String(gid));
    sh.getRange(i + 2, AG_RESULT + 1).setValue('성공 · ' + ymd_(new Date()));
    if (!String(v[i][AG_START]).trim()) sh.getRange(i + 2, AG_START + 1).setValue(ymd_(new Date()));
    if (String(v[i][AG_VERDICT]) === '준비됨') {
      sh.getRange(i + 2, AG_VERDICT + 1).setValue('돌고 있음');
      sh.getRange(i + 2, AG_WHY + 1).setValue('캠페인을 만들었습니다 — [켜기]로 켜야 돈이 나갑니다');
    }
    return;
  }
}
