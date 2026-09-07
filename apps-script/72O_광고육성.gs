/**
 * 72O_광고육성.gs — 트랙 B: 새 상품을 광고로 키운다
 *
 * ── 트랙 A 와 무엇이 다른가 ─────────────────────────────
 *                    트랙 A (재배분)          트랙 B (키우기)
 *   목적             이미 팔리는 것을 수확     새 상품의 오가닉 순위를 만든다
 *   손해             허용하지 않는다           허용한다 — 단 주마다 정한 금액 안에서
 *   자료             판매실적(세션·전환율)     없다. 새 상품이라 이력이 없다
 *   그래서 입력      계산으로 다 나온다        사람이 마진율·목표 전환율을 준다
 *   끝나는 조건      채산성이 안 맞으면 탈락   스스로 벌기 시작하거나 한도 소진
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
  '마진율(%)', '전환율예측(%)', '주간허용손해(JPY)', '손해배수',
  '손익분기CPA(JPY)', 'CPC상한(JPY)', '시작입찰(JPY)', '주간광고비(JPY)', '하루예산(JPY)',
  '시작일', '지난주수', '누적광고비(JPY)', '누적광고매출(JPY)', '누적손해(JPY)',
  '판정', '사유', '승인', '캠페인명', '캠페인ID', '광고그룹ID', '결과',
  '이전캠페인ID들'   // 자동→수동으로 갈아타며 버린 캠페인. 누적 손해는 이어서 센다
];
// 0부터 세는 자리
var AG_SKU = 0, AG_ASIN = 1, AG_NAME = 2, AG_KW = 3, AG_PRICE = 4,
    AG_MARGIN = 5, AG_CVR = 6, AG_LOSS = 7, AG_MULT = 8,
    AG_BECPA = 9, AG_CAP = 10, AG_BID = 11, AG_WEEKLY = 12, AG_DAILY = 13,
    AG_START = 14, AG_WEEKS = 15, AG_COST = 16, AG_SALES = 17, AG_LOSSSUM = 18,
    AG_VERDICT = 19, AG_WHY = 20, AG_APPROVE = 21, AG_CAMP = 22, AG_CID = 23,
    AG_GID = 24, AG_RESULT = 25, AG_PREVCID = 26;
var ADGROW_ID_COLS = [24, 25, 27];    // 1부터 — 캠페인ID·광고그룹ID·이전캠페인ID들 은 글자로

/**
 * 갈아탄 줄의 옛 계획 줄에 남기는 표시.
 * 관제가 이 표시를 보고, 아직 켜져 있으면 멈춘다 (마지막 그물).
 */
var ADGROW_SWITCHED_MARK = '· 수동으로 갈아탐';

/** [전환율예측(%)] 칸의 이름. 여러 곳에서 사람에게 보여 주므로 한곳에 둔다 */
var AG_CVR_NAME = '전환율예측(%)';

/**
 * 사람이 안 적어도 되는 값들의 기본치.
 * 필수는 셋뿐이다 — 마진율 · 전환율예측 · 주간허용손해.
 */
var ADGROW_MAXDAYS_DEFAULT = 56;      // 최대 기간을 비우면 이 값 (8주)
var ADGROW_PAYBACK_ORDERS = 10;       // 추천 주간허용손해 = 주문당 공헌이익 × 이 건수
var ADGROW_MIN_DAILY = 100;           // 아마존이 캠페인을 돌리는 최소 하루 예산

var ADGROW_MULT_DEFAULT = 1.5;        // 손해배수. 광고비 = 허용손해 × 3
var ADGROW_LOSS_DEFAULT = 3000;       // 주간 허용 손해 (엔). 사람이 고친다
var ADGROW_OVER_MULT = 1.5;           // 계획 손해의 이 배를 넘으면 중단
var ADGROW_MIN_WEEKS = 2;             // 이만큼은 지나야 실적으로 판단한다
var ADGROW_REPORT_WAIT_MS = 90 * 1000;
var PROP_ADGROW_REPORT = 'ADGROW_REPORT_ID';

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
  var map = hdrMap_(sh);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues();
  for (var i = 0; i < v.length; i++) {
    var gid = String(v[i][AG_GID] || '').trim();
    if (!gid) continue;
    // 멈췄거나 넘긴 줄은 더 이상 트랙 B 의 잣대로 보지 않는다 — 손해를 그만 보기로 한 것이다
    var stg = String(cellOf_(v[i], map, '단계', ''));
    if (stg === BSTAGE_STOP || stg === BSTAGE_HANDOVER) continue;
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

/**
 * 얼마를 넣으면 좋은지 셈해서 알려 준다 (사람이 고칠 수 있는 추천값).
 *
 * ── 마진율 ──────────────────────────────────────────────
 * 이 시스템은 이미 SKU 마다 원가(원)·배송비(엔)·사내환율·판매수수료율을 안다.
 * 그래서 추정이 아니라 계산이다:
 *   건당 이익(원) = (판매가 × (1 − 수수료) − 배송비) × 환율 − 원가
 *   마진율 = 건당 이익 ÷ 환율 ÷ 판매가
 * 원가가 없는 SKU 는 계산이 안 된다 — 그때는 계정 기본 마진율을 권하되
 * '확인 필요' 라고 적는다. 지어낸 값을 승인된 값처럼 보이게 두지 않는다.
 *
 * ── 전환율예측 ──────────────────────────────────────────
 * 새 상품은 이력이 없다. 계정에서 이미 팔리는 상품들의 오가닉 전환율 중앙값을 권한다.
 * 이것은 '이 상품이 이만큼 팔린다' 가 아니라 '모르면 계정 평균에서 시작한다' 는 뜻이고,
 * 실제 클릭이 쌓이면 판단전환율이 실측으로 갈아탄다.
 *
 * ── 주간 허용 손해 ──────────────────────────────────────
 * 이 값만은 계산으로 나오지 않는다 — 얼마를 잃어도 좋은지는 사람의 결정이다.
 * 그래서 '이 상품 몇 건 판 이익만큼' 이라는 눈금으로 권한다:
 *   추천 = 주문당 공헌이익 × 선불건수(기본 10)
 * 열 건어치 이익을 먼저 태워 순위를 산다는 뜻이다. 다만 두 가지로 다듬는다:
 *   · 하루 예산이 ¥100 밑이면 아마존이 캠페인을 안 돌린다 → 그만큼은 올린다
 *   · 계정 주간 광고비의 5% 를 넘지 않게 → 한 상품이 계정을 흔들지 않게
 *
 * @return {{margin:{v,why}, cvr:{v,why}, loss:{v,why}}}
 */
function adGrowRecommend_(sku, priceJpy, marginPct, multiple) {
  var out = {};
  var price = Number(priceJpy) || 0;
  var basis = adBasis_();
  var mult = Number(multiple) || ADGROW_MULT_DEFAULT;

  // ① 마진율 — 원가가 있으면 계산, 없으면 계정 기본값
  var m = null, mWhy = '';
  try {
    var costs = costMap_();
    var rate = fxHouseRate_();
    var cost = Number(costs[sku]) || 0;
    if (cost > 0 && rate > 0 && price > 0) {
      var ship = 0, shipWhy = '';
      try {
        var r = resolveShipping_(sku, skuCostMap_(), costInfoMap_());
        ship = Number(r.fee) || 0; shipWhy = r.src;
      } catch (e2) { ship = 0; shipWhy = '배송비 모름'; }
      var profitKrw = unitProfitKrw_(price, ship, cost, rate, DEFAULT_FEE_RATE);
      var pct = profitKrw / rate / price * 100;
      if (pct > 0 && pct < 100) {
        m = Math.round(pct * 10) / 10;
        mWhy = '원가 ' + Math.round(cost).toLocaleString() + '원 · 배송비 ¥' + Math.round(ship) +
               ' (' + shipWhy + ') · 수수료 ' + Math.round(DEFAULT_FEE_RATE * 100) + '% · 환율 ' +
               rate.toFixed(2) + ' 로 계산';
      } else if (pct <= 0) {
        m = 0;
        mWhy = '⛔ 이 값·원가로는 팔수록 손해입니다 (건당 ' +
               Math.round(profitKrw).toLocaleString() + '원). 광고로 키울 상품이 아닙니다';
      }
    }
  } catch (e) { m = null; }
  if (m === null) {
    m = Math.round((Number(basis['기본 마진율']) || 0.17) * 1000) / 10;
    mWhy = '원가를 몰라 계정 기본값을 넣었습니다 — 실제 마진율로 고치세요 (원가 탭에 이 SKU 를 넣으면 계산합니다)';
  }
  out.margin = { v: m, why: mWhy };

  // ② 전환율예측 — 계정 중앙값
  var q = adGrowSuggestCvr_();
  out.cvr = q > 0
    ? { v: Math.round(q * 10) / 10, why: '계정에서 팔리는 상품들의 오가닉 전환율 중앙값' }
    : { v: 2, why: '계정 자료가 없어 2% 로 시작합니다 (실제 클릭이 쌓이면 실측으로 바뀝니다)' };

  // ③ 주간 허용 손해 — 사람의 결정에 눈금을 준다
  var useMargin = (Number(marginPct) > 0 ? Number(marginPct) : m) / 100;
  var G = price * useMargin;
  var base = G * ADGROW_PAYBACK_ORDERS;
  var why = '주문당 공헌이익 ¥' + Math.round(G) + ' × ' + ADGROW_PAYBACK_ORDERS + '건';
  // 하루 예산 바닥 — 주간광고비 = 손해 × r/(r−1)
  var minLoss = ADGROW_MIN_DAILY * 7 * (mult - 1) / mult;
  if (base < minLoss) {
    base = minLoss;
    why += ' → 하루 예산이 ¥' + ADGROW_MIN_DAILY + ' 은 돼야 아마존이 캠페인을 돌려서 올림';
  }
  // 계정 대비 상한
  var cap = 0;
  try {
    var led = adSpendRead_();
    if (led.has) {
      var to = ymd_(new Date()), from = addDays_(to, -27);
      var sum = 0;
      for (var i = 0; i < led.rows.length; i++) {
        if (led.rows[i].d >= from && led.rows[i].d <= to) sum += led.rows[i].cost;
      }
      if (sum > 0) cap = sum / 4 * 0.05;          // 최근 4주 평균 주간 광고비의 5%
    }
  } catch (e3) { cap = 0; }
  if (cap > 0 && base > cap) {
    base = cap;
    why += ' → 계정 주간 광고비의 5% 로 낮춤 (한 상품이 계정을 흔들지 않게)';
  }
  // 100엔 단위로 다듬되, 바닥(하루 예산이 도는 최소) 밑으로는 내려가지 않게 올림한다
  var v100 = Math.round(base / 100) * 100;
  if (v100 < minLoss) v100 = Math.ceil(minLoss / 100) * 100;
  out.loss = { v: Math.max(100, v100), why: why };
  return out;
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

  var add = [], miss = [], dup = 0, recWhy = [];
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
    /**
     * 추천값을 넣어 둔다 — 빈칸을 주고 "알아서 적으세요" 하면 사람이 거기서 멈춘다.
     * 근거를 [사유] 에 적으므로 납득이 안 되면 그 자리에서 고치면 된다.
     */
    var rec = adGrowRecommend_(sku, row[AG_PRICE], 0, ADGROW_MULT_DEFAULT);
    row[AG_MARGIN] = rec.margin.v;
    row[AG_CVR] = rec.cvr.v;
    row[AG_LOSS] = rec.loss.v;
    row[AG_VERDICT] = '값 확인 필요';
    row[AG_WHY] = '추천값입니다 — 마진율: ' + rec.margin.why + ' / 허용손해: ' + rec.loss.why;
    recWhy.push(sku + ' — 마진율 ' + rec.margin.v + '% · 전환율예측 ' + rec.cvr.v +
                '% · 주간허용손해 ' + fmtYen_(rec.loss.v));
    add.push(row);
  }
  if (add.length) {
    var at = Math.max(sh.getLastRow(), 1) + 1;
    var need = at + add.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    // ID 칸은 글자 서식으로 — 숫자로 바뀌면 뒷자리가 반올림돼 다른 ID 가 된다
    for (var fc = 0; fc < ADGROW_ID_COLS.length; fc++) {
      sh.getRange(at, ADGROW_ID_COLS[fc], add.length, 1).setNumberFormat('@');
    }
    fitCols_(sh, ADGROW_HEADER.length);
    sh.getRange(at, 1, add.length, ADGROW_HEADER.length).setValues(add);
    sh.getRange(at, AG_APPROVE + 1, add.length, 1).insertCheckboxes();
  }
  sh.setFrozenRows(1);

  showSheet_(SHEET_ADGROW);
  ui_().alert('① 등록했습니다',
    add.length + '개를 넣었습니다' + (dup ? ' (이미 있는 ' + dup + '개는 건너뜀)' : '') + '.\n' +
    (miss.length ? '\n⚠ 리스팅에 없어 가격을 못 채운 SKU ' + miss.length + '개:\n   ' +
                   miss.slice(0, 5).join(', ') + (miss.length > 5 ? ' 외' : '') +
                   '\n   가격을 직접 적으세요.\n' : '') +
    (recWhy.length ? '\n추천값을 넣어 두었습니다 (그대로 써도 되고 고쳐도 됩니다):\n   ' +
                     recWhy.slice(0, 5).join('\n   ') +
                     '\n   왜 그 값인지는 표의 [사유] 칸에 있습니다.\n' : '') +
    '\n다음 두 가지만 하면 됩니다:\n' +
    '  · 표에서 마진율 · ' + AG_CVR_NAME + ' · 주간허용손해 를 확인하고 (이 셋만 필수)\n' +
    '  · [② 값 확인하고 승인] 에서 [승인] 체크\n\n' +
    '그 뒤 [③ 시작] 을 누르면 나머지는 전부 저절로 돕니다 —\n' +
    '계산 · 캠페인 만들기 · 겨냥 · 검색어에서 기준키워드 고르기 ·\n' +
    '수동으로 갈아타기 · 켜기 · 입찰 조정 · 한도를 넘으면 멈추기.',
    ui_().ButtonSet.OK);
}

/** 메뉴: 트랙 B 계산 — 입찰·예산을 낸다. API 안 부름 */
/**
 * 메뉴: 계산 + 상태 점검을 한 번에.
 *
 * 둘 다 시트만 읽는 순수 계산이라 순서대로 무조건 같이 도는 걸음이었다 —
 * 버튼을 둘로 나눠 둘 이유가 없다. 계산(시작입찰·예산)이 먼저, 상태(단계·여력·목표)가 뒤.
 */
function refreshAdGrow() {
  adGrowCalcAll_(true);
  reviewAdGrowState();
}

/** 옛 메뉴 이름 — 새 진입점으로 보낸다 */
function calcAdGrow() { refreshAdGrow(); }

/** 시작입찰·주간광고비·하루예산을 낸다. quiet 면 창을 띄우지 않는다 */
function adGrowCalcAll_(quiet) {
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다. [키울 상품 등록]을 먼저 하세요.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  var ok = 0, bad = 0, totWeekly = 0, totLoss = 0;
  for (var i = 0; i < v.length; i++) {
    if (!String(v[i][AG_SKU]).trim()) continue;

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
    // 이미 돌고 있는 줄은 상태 점검이 [단계]를 쓴다. 아직 안 만든 줄만 여기서 적는다
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
  if (quiet) return { ok: ok, bad: bad };
  showSheet_(SHEET_ADGROW);
  ui_().alert('트랙 B 계산',
    '계산됨 ' + ok + '개' + (bad ? ' · 값이 모자란 줄 ' + bad + '개' : '') + '\n\n' +
    (ok ? '주간 광고비 합계 ¥' + totWeekly.toLocaleString() + '\n' +
          '그중 잃기로 한 돈 ¥' + totLoss.toLocaleString() +
          ' (나머지는 팔려서 돌아옵니다)\n\n' +
          '이 금액이 그대로 트랙 B 의 한도가 됩니다 — 광고기준의 [주간 광고비 한도]는\n' +
          '   트랙 A 만 보는 값이라 여기에 얹히지 않습니다.\n' +
          '   줄마다 제 [주간광고비]를 넘기면 관제가 그 줄만 멈춥니다.\n\n' : '') +
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
    '기준키워드': '이 상품이 팔리게 하려는 말 하나.\n' +
      '적으면 그 말 하나만 사는 수동(MANUAL) 캠페인을 만듭니다.\n' +
      '비우면 자동(AUTO) 캠페인이 되어 아마존이 고른 말에 손해배수 입찰이 나갑니다 —\n' +
      '어느 말로 팔릴지 아직 모를 때 그렇게 시작하고, 검색어 자료가 쌓이면 채웁니다.',
    '누적손해(JPY)': '누적광고비 − 누적광고매출 × 마진율. 실측입니다.\n' +
      '자동에서 수동으로 갈아탔으면 옛 캠페인에 쓴 것까지 합쳐서 셉니다 —\n' +
      '캠페인이 바뀌어도 그 상품에 쓴 돈은 그 상품에 쓴 돈입니다.',
    '이전캠페인ID들': '자동에서 수동으로 갈아타며 버린 캠페인. [자동 → 수동 갈아타기]가 적습니다.\n' +
      '상태 점검이 이 캠페인들의 지출까지 합쳐 누적 손실을 셉니다.',
    '판정': '만들기 전의 상태만 적습니다 (준비됨 · 값 입력 필요 · 돌고 있음).\n' +
      '돌기 시작한 뒤의 판단은 [단계]와 [다음 행동] 이 합니다 — 상태 점검이 매일 다시 씁니다.',
    '승인': '체크한 줄만 [계획에 넣기]가 광고생성계획으로 보냅니다.'
  });
}

// ── 계획 표로 밀어넣기 ──────────────────────────────────

/** 메뉴: 승인한 육성 줄을 광고생성계획에 트랙 B 줄로 넣는다 */
function pushAdGrowToPlan(opts) {
  var quiet = !!(opts && opts.quiet);
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  var pick = [];
  for (var i = 0; i < v.length; i++) {
    if (!adRowApproved_(v[i][AG_APPROVE])) continue;
    if (!(Number(v[i][AG_BID]) > 0)) continue;              // 계산 안 된 줄
    if (String(v[i][AG_RESULT]).indexOf('성공') === 0) continue;  // 이미 만든 줄
    pick.push({ row: i, v: v[i] });
  }
  if (!pick.length) {
    if (quiet) return { added: 0, updated: 0, autoOk: 0 };
    ui_().alert('넣을 줄이 없습니다.',
      '승인 ✓ 이면서 계산이 끝났고 아직 안 만든 줄이 없습니다.\n' +
      '[트랙 B 계산]을 먼저 하고 승인 칸을 체크하세요.', ui_().ButtonSet.OK);
    return null;
  }

  var psh = ensureSheet_(SHEET_ADPLAN_GROW, ADPLAN_HEADER);
  var pv = psh.getLastRow() > 1
    ? psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues() : [];
  var byName = {};
  for (var p = 0; p < pv.length; p++) byName[String(pv[p][AP_NAME - 1]).trim()] = p;
  var polAll = adPolicyAll_();

  var added = 0, updated = 0, daily = 0, autoOk = 0;
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
    // 정책이 [자동운영] 이고 한도가 확정됐으면 그것이 곧 돈의 승인이다 — 계획 표에서
    // 한 번 더 체크하게 하지 않는다. 정책이 없거나 미확정이면 옛대로 사람이 체크한다
    var bpol = adPolicyFor_(polAll, 'B', String(g[AG_SKU]).trim());
    row[AP_APPROVE - 1] = !!(bpol && bpol.canAuto);
    row[ADPLAN_HEADER.length - 1] = 'B';      // 트랙

    daily += Number(g[AG_DAILY]) || 0;
    if (row[AP_APPROVE - 1]) autoOk++;
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

  if (quiet) return { added: added, updated: updated, autoOk: autoOk };
  showSheet_(SHEET_ADPLAN_GROW);
  ui_().alert('계획에 넣었습니다',
    '새로 ' + added + '개' + (updated ? ' · 값 갱신 ' + updated + '개' : '') + '\n' +
    '하루 예산 합계 ¥' + daily.toLocaleString() + '\n\n' +
    (autoOk ? '정책이 자동운영인 ' + autoOk + '줄은 계획 승인을 자동으로 채웠습니다.\n' : '') +
    '다음:\n' +
    '  ① ' + SHEET_ADPLAN_GROW + ' 에서 [승인] 확인' + (autoOk ? ' (자동운영 줄은 이미 ✓)' : '') + '\n' +
    '  ② [③ 승인분 캠페인 생성] — 멈춤 상태로 만들어집니다\n' +
    '  ③ [④ 캠페인 겨냥 맞추기] — 자동이면 상품 겨냥을 끄고,\n' +
    '      기준키워드가 있으면 그것을 올립니다 (한 단추가 둘 다 봅니다)\n' +
    '  ④ [⑤ 켜기 — 승인 ✓ 만] — 여기서부터 돈이 나갑니다\n\n' +
    '한도는 트랙마다 따로입니다 — 이 줄들의 [주간광고비] 합이 트랙 B 의 한도이고,\n' +
    '광고기준의 [주간 광고비 한도]는 트랙 A 만 봅니다.\n' +
    '한쪽이 넘쳐도 다른 쪽은 안 멈춥니다 (애써 키우던 상품이 남의 사고로 죽지 않게).',
    ui_().ButtonSet.OK);
  return { added: added, updated: updated, autoOk: autoOk };
}

// ── 자동 겨냥 좁히기 ────────────────────────────────────

/**
 * 자동 캠페인은 네 겨냥으로 돈다. 겨냥마다 상태와 입찰을 따로 준다.
 *
 *   유사검색어(QUERY_HIGH_REL_MATCHES)   내 리스팅의 말과 가까운 검색어
 *   넓은검색어(QUERY_BROAD_REL_MATCHES)  느슨하게 관련된 검색어
 *   대체상품(ASIN_SUBSTITUTE_RELATED)    비슷한 남의 상품 페이지
 *   보완상품(ASIN_ACCESSORY_RELATED)     같이 쓰는 남의 상품 페이지
 *
 * 뒤의 둘은 검색 결과가 아니라 남의 상품 페이지에 붙는 광고다 —
 * 검색어 순위와 아무 상관이 없다. 트랙 B 가 사려는 것이 '어떤 말의 순위' 인데
 * 그 둘은 거기에 한 푼도 기여하지 않는다. 그래서 기본으로 끈다.
 *
 * 이것이 부정 키워드보다 나은 이유: 부정은 반응형이라 한 번은 사 봐야 막을 수 있다.
 * 이 계정 4주치를 재보면 클릭 4.3번마다 처음 보는 검색어가 하나씩 나오고,
 * 클릭 1~3회짜리 꼬리가 광고비의 27.7% 다 — 막는 속도가 나오는 속도를 못 따라간다.
 * 겨냥을 끄는 것은 한 번의 호출로 그 갈래를 통째로 닫는 일이라 따라잡기가 필요 없다.
 */
var ADGROW_AUTO_CLAUSES = ['QUERY_HIGH_REL_MATCHES', 'QUERY_BROAD_REL_MATCHES',
                           'ASIN_SUBSTITUTE_RELATED', 'ASIN_ACCESSORY_RELATED'];

/** 광고기준의 [트랙 B 자동 겨냥] → 살릴 겨냥들 */
function adGrowWantClauses_(mode) {
  var m = String(mode || '').trim();
  if (m === '전부') return ADGROW_AUTO_CLAUSES.slice();
  if (m === '유사검색어만') return ['QUERY_HIGH_REL_MATCHES'];
  return ['QUERY_HIGH_REL_MATCHES', 'QUERY_BROAD_REL_MATCHES'];   // 검색어만 (기본)
}

/** 겨냥 이름을 사람 말로 (72D 의 표와 같은 말을 쓴다) */
function adGrowClauseName_(type) {
  return String(AUTO_TARGET_KR[type] || type).replace('자동:', '');
}

/**
 * 메뉴: 트랙 B 자동 캠페인의 겨냥을 좁힌다.
 *
 * 지금 무엇이 켜져 있는지는 아마존에게 물어본다 — 캠페인을 만들 때 아마존이
 * 알아서 넣어 주는 것이라 우리 시트에는 없다. 트랙 B 는 몇 줄뿐이라
 * 그룹마다 한 번 묻는 것이 시간에 걸리지 않는다 (수집·실행을 가르는 규칙의 허용 예외).
 */
function narrowAdGrowTargets(opts) {
  var quiet = !!(opts && opts.quiet);
  if (!quiet && !adBusyGuard_('자동 겨냥 좁히기')) return null;
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  // 어느 줄이 자동 캠페인인가 — 계획 표의 [유형] 이 답이다 (시트만 읽는다)
  var psh = ss_().getSheetByName(SHEET_ADPLAN_GROW);
  var typeOf = {};
  if (psh && psh.getLastRow() > 1) {
    var pv = psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
    for (var p = 0; p < pv.length; p++) typeOf[String(pv[p][AP_NAME - 1]).trim()] = String(pv[p][4] || '');
  }

  var want = adGrowWantClauses_(adBasis_()['트랙 B 자동 겨냥']);
  var wantSet = {};
  for (var w = 0; w < want.length; w++) wantSet[want[w]] = true;

  var pick = [], manual = 0, notMade = 0;
  for (var i = 0; i < v.length; i++) {
    var cid = String(v[i][AG_CID] || '').trim(), gid = String(v[i][AG_GID] || '').trim();
    var name = String(v[i][AG_CAMP] || '').trim();
    if (!cid || !gid) { notMade++; continue; }
    if (String(typeOf[name] || '').indexOf('수동') === 0) { manual++; continue; }
    pick.push({ row: i, cid: cid, gid: gid, name: name,
                sku: String(v[i][AG_SKU] || ''), asin: String(v[i][AG_ASIN] || '') });
  }
  if (!pick.length) {
    if (quiet) return { msg: '자동 겨냥 — 할 것 없음', n: 0 };
    showSheet_(SHEET_ADGROW);
    ui_().alert('좁힐 자동 캠페인이 없습니다.',
      (manual ? '수동 캠페인 ' + manual + '개는 겨냥이 없습니다 (키워드로 돕니다)\n' : '') +
      (notMade ? '아직 캠페인을 안 만든 줄 ' + notMade + '개\n' : ''),
      ui_().ButtonSet.OK);
    return null;
  }

  var ok = quiet ? ui_().Button.OK : ui_().alert('자동 겨냥 좁히기',
    '살릴 겨냥: ' + want.map(adGrowClauseName_).join(' · ') + '\n' +
    '끌 겨냥: ' + ADGROW_AUTO_CLAUSES.filter(function (t) { return !wantSet[t]; })
                    .map(adGrowClauseName_).join(' · ') + '\n\n' +
    pick.map(function (x) { return '· ' + x.name; }).join('\n') + '\n\n' +
    '대체상품·보완상품은 남의 상품 페이지에 붙는 광고라 검색어 순위와 상관이 없습니다.\n' +
    '바꾸려면 광고기준의 [트랙 B 자동 겨냥] 을 고치세요.\n\n계속할까요?',
    ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return null;

  var token = adsToken_(), onN = 0, offN = 0, newN = 0, failN = 0, logs = [];
  for (var k = 0; k < pick.length; k++) {
    var x = pick[k];
    var have = {};
    try {
      var lr = adsApiRetry_(token, 'post', '/sp/targets/list',
        { adGroupIdFilter: { include: [x.gid] }, maxResults: 100,
          stateFilter: { include: ['ENABLED', 'PAUSED'] } },
        ADSW_CT_TARGET, ADSW_CT_TARGET);
      var arr = (lr && lr.targetingClauses) || [];
      for (var a = 0; a < arr.length; a++) {
        var ex = arr[a].expression || [];
        var ty = ex.length ? String(ex[0].type || '') : '';
        if (ty) have[ty] = { id: String(arr[a].targetId || ''), state: String(arr[a].state || '') };
      }
    } catch (e) {
      failN++;
      v[x.row][AG_RESULT] = String(v[x.row][AG_RESULT] || '') + ' · 겨냥 조회 실패: ' +
                            adErrorText_(String(e)).substring(0, 80);
      continue;
    }

    var put = [], post = [], did = [];
    for (var c = 0; c < ADGROW_AUTO_CLAUSES.length; c++) {
      var ty2 = ADGROW_AUTO_CLAUSES[c], cur = have[ty2];
      var to = wantSet[ty2] ? 'ENABLED' : 'PAUSED';
      if (!cur) {
        // 살려야 하는데 아예 없으면 만든다. 꺼야 하는데 없으면 할 일이 없다
        if (to === 'ENABLED') {
          post.push({ campaignId: x.cid, adGroupId: x.gid, expressionType: 'AUTO',
                      expression: [{ type: ty2 }], state: 'ENABLED' });
          did.push(adGrowClauseName_(ty2) + ' 만듦');
        }
        continue;
      }
      if (cur.state === to) continue;                    // 이미 그 상태
      put.push({ targetId: cur.id, state: to });
      did.push(adGrowClauseName_(ty2) + (to === 'ENABLED' ? ' 켬' : ' 끔'));
      if (to === 'ENABLED') onN++; else offN++;
    }

    var bad = '';
    try {
      if (put.length) {
        var pr = adsApiRetry_(token, 'put', '/sp/targets', { targetingClauses: put },
                              ADSW_CT_TARGET, ADSW_CT_TARGET);
        if (!adsCreated_(pr, 'targetingClauses', 'targetId').ok) bad = '상태 바꾸기';
      }
      if (!bad && post.length) {
        var cr = adsApiRetry_(token, 'post', '/sp/targets', { targetingClauses: post },
                              ADSW_CT_TARGET, ADSW_CT_TARGET);
        var made = adsCreated_(cr, 'targetingClauses', 'targetId');
        if (made.ok) newN += made.ids.length; else bad = '만들기 — ' + made.msg;
      }
    } catch (e2) { bad = String(e2).substring(0, 120); }

    if (bad) {
      failN++;
      v[x.row][AG_RESULT] = String(v[x.row][AG_RESULT] || '') + ' · 겨냥 실패: ' +
                            adErrorText_(bad).substring(0, 80);
    } else if (did.length) {
      v[x.row][AG_RESULT] = String(v[x.row][AG_RESULT] || '') + ' · 겨냥 ' +
                            want.map(adGrowClauseName_).join('+');
      logs.push(adLogRow_({ kind: '타깃', camp: x.name, group: x.name, item: '겨냥',
        to: want.map(adGrowClauseName_).join('+'), sku: x.sku, asin: x.asin,
        sum: '자동 겨냥 좁힘 · ' + x.name + ' · ' + did.join(', '),
        why: '트랙 B 는 검색어 순위를 산다 — 상품 겨냥은 거기에 기여하지 않는다',
        cid: x.cid, gid: x.gid }));
    }
  }
  sh.getRange(2, 1, v.length, ADGROW_HEADER.length).setValues(v);
  if (logs.length) adLogWrite_(logs);

  var msg = '자동 겨냥 좁히기 — 끔 ' + offN + ' · 켬 ' + onN +
            (newN ? ' · 새로 만듦 ' + newN : '') + (failN ? ' · 실패 ' + failN : '');
  log_('ads', failN ? 'WARN' : 'INFO', msg);
  if (quiet) return { msg: msg, n: pick.length, fail: failN };
  showSheet_(SHEET_ADGROW);
  ui_().alert(failN ? '일부 실패' : '좁혔습니다', msg + '\n\n' +
    (failN ? '실패한 줄은 [결과] 칸에 사유가 있습니다.\n\n' : '') +
    '이제 이 캠페인의 광고비는 ' + want.map(adGrowClauseName_).join(' · ') + ' 에만 나갑니다.\n' +
    '검색어 판정(매주 ②)이 트랙 B 잣대로 남은 낭비를 부정으로 걸러 줍니다.',
    ui_().ButtonSet.OK);
}

/**
 * 메뉴: 캠페인 겨냥 맞추기 — 줄마다 제 것을 한다.
 *
 *   자동 캠페인 → 겨냥 좁히기 (상품 겨냥을 끈다)
 *   수동 캠페인 → 기준키워드 올리기
 *
 * 둘은 한 줄에서 서로 배타적이라 사람이 고를 것이 없다. 버튼을 둘로 나눴더니
 * "어느 것을 누르지" 부터 물어야 했다. 한 창에 두 동사를 넣은 것이 아니다 —
 * 동사는 하나(겨냥 맞추기)고, 방법이 캠페인 유형을 따라간다.
 */
function setupAdGrowTargets() {
  if (!adBusyGuard_('캠페인 겨냥 맞추기')) return;
  var ok = ui_().alert('캠페인 겨냥 맞추기',
    '만들어진 육성 캠페인마다:\n' +
    '   자동 캠페인 → 상품 겨냥(대체상품·보완상품)을 끕니다\n' +
    '   수동 캠페인 → [기준키워드]를 정확 일치로 올립니다\n\n' +
    '켜기 전까지는 돈이 나가지 않습니다. 이미 맞춘 줄은 건너뜁니다.\n\n계속할까요?',
    ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return;
  var a = narrowAdGrowTargets({ quiet: true }) || { msg: '자동 겨냥 — 안 함', n: 0 };
  var b = applyAdGrowKeyword({ quiet: true }) || { msg: '기준키워드 — 안 함', n: 0 };
  showSheet_(SHEET_ADGROW);
  ui_().alert('캠페인 겨냥 맞추기', a.msg + '\n' + b.msg + '\n\n' +
    ((b.handed && b.handed.length) ? '옛 자동 캠페인 ' + b.handed.length + '개를 멈췄습니다: ' +
                                     b.handed.join(', ') + '\n\n' : '') +
    ((a.fail || b.fail) ? '실패한 줄은 [결과] 칸에 사유가 있습니다.\n\n' : '') +
    '다음: [켜기 — 승인 ✓ 만].', ui_().ButtonSet.OK);
}

// ── 자동 → 수동 갈아타기 ────────────────────────────────

/**
 * 메뉴: 자동으로 시작한 줄에 기준키워드가 생기면 수동 캠페인으로 갈아탄다.
 *
 * ── 왜 갈아타야 하나 ─────────────────────────────────────
 * 어느 말로 팔릴지 모를 때는 자동으로 시작하는 것이 맞다. 두어 주 돌리면
 * 검색어 판정이 트랙 B 잣대로 골라 준다. 그러면 그 말을 [기준키워드]에 적는데,
 * 아마존은 만들어진 캠페인의 유형(AUTO/MANUAL)을 바꿔 주지 않는다 —
 * 새 캠페인을 만드는 수밖에 없다.
 *
 * ── 무엇을 하나 ─────────────────────────────────────────
 *   ① 광고육성계획에 수동 캠페인 줄을 새로 넣는다 (이름 뒤에 KW)
 *   ② 육성 표의 [캠페인명]을 새 이름으로 바꾸고, 옛 캠페인ID 는
 *      [이전캠페인ID들] 에 옮겨 적는다
 *   ③ 옛 계획 줄의 승인을 풀고 결과에 표시를 남긴다
 *
 * 옛 캠페인은 여기서 바로 멈추지 않는다 — 새 캠페인을 만들고 켜기까지 며칠 걸리는데
 * 그 사이 순위 쌓기가 끊긴다. [기준키워드 올리기]가 끝나는 자리(새 캠페인이 다 갖춰진
 * 자리)에서 멈추고, 그때 못 멈췄으면 관제가 하루 안에 잡는다.
 *
 * 시작일과 누적은 그대로 이어진다. 자동으로 돈 두 주도 순위에 기여했고,
 * 그 SKU 에 쓴 돈은 캠페인이 바뀌어도 그 SKU 에 쓴 돈이다 —
 * 여기서 0 으로 되돌리면 이미 ¥9,000 을 잃고도 "1주차, 더 봅시다" 가 된다.
 */
function switchAdGrowToManual(opts) {
  var quiet = !!(opts && opts.quiet);
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  fitCols_(sh, ADGROW_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  // 계획 표에서 지금 유형이 무엇인지 본다 (시트만 읽는다)
  var psh = ensureSheet_(SHEET_ADPLAN_GROW, ADPLAN_HEADER);
  var pv = psh.getLastRow() > 1
    ? psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues() : [];
  var planAt = {};
  for (var p = 0; p < pv.length; p++) planAt[String(pv[p][AP_NAME - 1]).trim()] = p;

  var pick = [], noKw = 0, already = 0, notMade = 0, clearKw = {};
  for (var i = 0; i < v.length; i++) {
    var kw = String(v[i][AG_KW] || '').trim();
    if (!kw) { noKw++; continue; }
    var oldName = String(v[i][AG_CAMP] || '').trim();
    var at = planAt[oldName];
    if (at === undefined) { notMade++; continue; }
    if (String(pv[at][AP_RESULT - 1]).indexOf('성공') !== 0) { notMade++; continue; }
    if (String(pv[at][4] || '').indexOf('수동') === 0) { already++; continue; }   // 이미 수동
    pick.push({ row: i, at: at, kw: kw, oldName: oldName,
                oldCid: String(pv[at][AP_CID - 1] || '').trim(),
                newName: oldName + ' KW' });
  }

  if (!pick.length) {
    if (quiet) return { n: 0 };
    showSheet_(SHEET_ADGROW);
    ui_().alert('갈아탈 줄이 없습니다.',
      (already ? '이미 수동인 줄 ' + already + '개\n' : '') +
      (noKw ? '기준키워드가 빈 줄 ' + noKw + '개 — 먼저 [기준키워드]를 적으세요\n' : '') +
      (notMade ? '아직 캠페인을 안 만든 줄 ' + notMade + '개 — 그 줄은 갈아탈 것 없이 ' +
                 '[② 계획에 넣기]부터 다시 하면 처음부터 수동으로 만들어집니다\n' : ''),
      ui_().ButtonSet.OK);
    return;
  }

  var ok = quiet ? ui_().Button.OK : ui_().alert('자동 → 수동 갈아타기',
    pick.map(function (x) {
      return '· ' + x.oldName + '\n    → ' + x.newName + ' · 기준키워드 "' + x.kw + '"';
    }).join('\n') + '\n\n' +
    '아마존은 만든 캠페인의 유형을 못 바꿉니다 — 새 캠페인을 만듭니다.\n' +
    '시작일과 누적 손해는 이어집니다 (자동으로 쓴 돈도 이 상품에 쓴 돈입니다).\n' +
    '옛 캠페인은 새 캠페인이 다 갖춰진 뒤([④ 캠페인 겨냥 맞추기])에 멈춥니다 —\n' +
    '지금 멈추면 그 사이 순위 쌓기가 끊깁니다.\n\n계속할까요?',
    ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return;

  var swPolAll = adPolicyAll_();
  for (var k = 0; k < pick.length; k++) {
    var x = pick[k];
    // ① 새 수동 줄 — 옛 줄의 값을 그대로 물려받되 ID·결과는 비운다
    var row = pv[x.at].slice();
    row[0] = String(row[0] || '') + 'KW';
    row[AP_ACTION - 1] = '생성';
    row[AP_NAME - 1] = x.newName;
    row[4] = '수동';
    row[14] = String(row[14] || '') + ' · 자동에서 갈아탐 (기준키워드 "' + x.kw + '")';
    row[AP_GID - 1] = ''; row[AP_CID - 1] = ''; row[AP_RESULT - 1] = '';
    row[AP_ADIDS - 1] = '';
    /**
     * 새 수동 줄의 승인은 정책이 정한다 — 계획 넣기와 같은 규칙이다.
     * 자동운영이면 채우고(자동 걸음이 이어서 만들고 켠다), 아니면 비운다.
     * 갈아타기는 새 돈이 아니라 같은 상품의 예산이 옮겨 가는 것이고,
     * 한도는 옛 캠페인 지출까지 합쳐 세므로 울타리가 그대로 걸린다.
     */
    var swPol = adPolicyFor_(swPolAll, 'B', String(v[x.row][AG_SKU] || '').trim());
    row[AP_APPROVE - 1] = !!(swPol && swPol.canAuto);
    pv.push(row);

    // ② 옛 줄 — 승인을 풀고 표시를 남긴다. 관제가 이 표시를 보고 멈춘다
    pv[x.at][AP_APPROVE - 1] = false;
    pv[x.at][AP_RESULT - 1] = String(pv[x.at][AP_RESULT - 1] || '') + ' ' +
                              ADGROW_SWITCHED_MARK + ' → ' + x.newName;

    // ③ 육성 표 — 새 캠페인을 가리키고, 옛 ID 는 누적을 위해 남긴다
    var prev = String(v[x.row][AG_PREVCID] || '').split(',')
                 .map(function (t) { return t.trim(); }).filter(function (t) { return t; });
    if (x.oldCid && prev.indexOf(x.oldCid) < 0) prev.push(x.oldCid);
    v[x.row][AG_PREVCID] = prev.join(',');
    v[x.row][AG_CAMP] = x.newName;
    v[x.row][AG_CID] = ''; v[x.row][AG_GID] = '';
    v[x.row][AG_RESULT] = '';
    v[x.row][AG_WHY] = '자동에서 수동으로 갈아타는 중 — 새 캠페인을 만들고 켜세요';
    // 새 캠페인에는 아직 키워드가 없다. 옛 키워드ID 를 남겨 두면
    // 작업 큐가 이미 멈춘 캠페인의 키워드에 입찰을 걸게 된다
    clearKw[x.row] = '';
  }

  var need = Math.max(pv.length + 1, 2);
  if (psh.getMaxRows() < need) psh.insertRowsAfter(psh.getMaxRows(), need - psh.getMaxRows());
  psh.getRange(2, AP_GID, need - 1, 1).setNumberFormat('@');
  psh.getRange(2, AP_CID, need - 1, 1).setNumberFormat('@');
  writeTable_(psh, ADPLAN_HEADER, pv);
  if (pv.length) psh.getRange(2, AP_APPROVE, pv.length, 1).insertCheckboxes();
  sh.getRange(2, 1, v.length, ADGROW_HEADER.length).setValues(v);
  adGrowKwIdWrite_(sh, clearKw, v.length);

  log_('ads', 'INFO', '트랙 B 자동→수동 갈아타기 ' + pick.length + '줄');
  if (quiet) return { n: pick.length, names: pick.map(function (x) { return x.newName; }) };
  showSheet_(SHEET_ADPLAN_GROW);
  ui_().alert('갈아탈 준비가 됐습니다',
    pick.length + '줄 · 새 수동 캠페인 줄을 ' + SHEET_ADPLAN_GROW + ' 에 넣었습니다.\n\n' +
    '다음:\n' +
    '  ① ' + SHEET_ADPLAN_GROW + ' 에서 새 줄(이름 끝이 KW)의 [승인] 체크\n' +
    '  ② [③ 승인분 캠페인 생성]\n' +
    '  ③ [④ 캠페인 겨냥 맞추기] — 여기서 옛 자동 캠페인이 멈춥니다\n' +
    '  ④ [⑤ 켜기 — 승인 ✓ 만]\n\n' +
    '옛 줄은 승인을 풀어 두었습니다. ③까지 못 가더라도 관제가 하루 안에 멈춥니다.',
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
function applyAdGrowKeyword(opts) {
  var quiet = !!(opts && opts.quiet);
  if (!quiet && !adBusyGuard_('기준키워드 올리기')) return null;
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
                camp: String(v[i][AG_CAMP] || ''),
                prev: String(v[i][AG_PREVCID] || '').split(',')
                        .map(function (t) { return t.trim(); })
                        .filter(function (t) { return t; }) });
  }

  if (!pick.length) {
    if (quiet) return { msg: '기준키워드 — 올릴 것 없음', n: 0 };
    showSheet_(SHEET_ADGROW);
    ui_().alert('올릴 기준키워드가 없습니다.',
      (done ? '이미 올린 줄 ' + done + '개\n' : '') +
      (noKw ? '기준키워드가 빈 줄 ' + noKw + '개 — 자동 캠페인이라 키워드가 없습니다\n' : '') +
      (noCamp ? '캠페인이 아직 없거나 입찰이 안 나온 줄 ' + noCamp + '개\n' : '') +
      '\n[② 계획에 넣기] → ' + SHEET_ADPLAN_GROW + ' 승인 → [③ 승인분 캠페인 생성] 을 먼저 하세요.',
      ui_().ButtonSet.OK);
    return null;
  }

  var ok = quiet ? ui_().Button.OK : ui_().alert('기준키워드 올리기',
    pick.map(function (x) { return '· "' + x.kw + '" → ' + x.camp + ' · ¥' + x.bid; }).join('\n') +
    '\n\n이 값은 손익분기를 일부러 넘긴 값입니다 — 그것이 순위를 사는 값입니다.\n' +
    '켜기 전까지는 돈이 나가지 않습니다.\n\n계속할까요?', ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return null;

  var token = adsToken_(), okN = 0, failN = 0, logs = [], kwIds = {};
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
        kwIds[it.row] = String(r.id || '');
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
  adGrowKwIdWrite_(sh, kwIds, v.length);
  if (logs.length) adLogWrite_(logs);

  // 갈아탄 줄이면 이제 옛 자동 캠페인을 멈춘다.
  // 여기가 가장 이른 안전한 자리다 — 새 캠페인이 상품·키워드까지 다 갖춘 순간이라,
  // 더 일찍 멈추면 그 사이 순위 쌓기가 끊기고 더 늦게 멈추면 같은 말에 둘이 입찰한다.
  var handed = adGrowHandOff_(v, sh);

  var kmsg = '기준키워드 올리기 — ' + okN + '개 성공' +
             (failN ? ' · ' + failN + '개 실패' : '') +
             (handed.length ? ' · 옛 자동 캠페인 멈춤 ' + handed.length : '');
  log_('ads', failN ? 'WARN' : 'INFO', kmsg);
  if (quiet) return { msg: kmsg, n: okN, fail: failN, handed: handed };
  showSheet_(SHEET_ADGROW);
  ui_().alert(failN ? '일부 실패' : '올렸습니다',
    okN + '개 성공' + (failN ? ' · ' + failN + '개 실패 ([결과] 칸에 사유)' : '') + '\n' +
    (handed.length ? '옛 자동 캠페인 ' + handed.length + '개를 멈췄습니다: ' +
                     handed.join(', ') + '\n' : '') + '\n' +
    (okN ? '다음: [켜기 — 승인 ✓ 만] — 여기서부터 돈이 나갑니다.\n' +
           '⚠ 켜기 전에 관제의 트랙 B 한도를 한 번 보세요.' : ''),
    ui_().ButtonSet.OK);
}

/**
 * [기준키워드ID] 칸을 쓴다 (뒤에 붙는 칸이라 본문 배열과 따로 쓴다).
 *
 * 이 ID 가 있어야 작업 큐가 광고그룹이 아니라 키워드에 입찰을 건다.
 * 자릿수가 길어 지수 표기로 뭉개지지 않게 글자 서식으로 못 박는다.
 *
 * @param {Object} byRow  줄번호(0부터) → 키워드ID. 빈 글자면 지운다
 */
function adGrowKwIdWrite_(sh, byRow, nRows) {
  var keys = Object.keys(byRow || {});
  if (!keys.length || !(nRows > 0)) return;
  var map = ensureCols_(sh, [ADGROW_KWID]);
  var rng = sh.getRange(2, map[ADGROW_KWID] + 1, nRows, 1);
  var cur = rng.getValues();
  for (var i = 0; i < keys.length; i++) {
    var r = Number(keys[i]);
    if (r >= 0 && r < nRows) cur[r][0] = byRow[keys[i]];
  }
  rng.setNumberFormat('@').setValues(cur);
}

/**
 * 갈아탄 줄의 옛 자동 캠페인을 멈춘다. @return 멈춘 캠페인 이름
 *
 * 옛 캠페인은 아직 광고육성계획에 제 줄로 남아 있다 (승인은 풀린 채로).
 * 그 줄을 찾아 관제와 같은 길로 멈춘다 — 계획 표 표시와 대장이 함께 맞는다.
 */
function adGrowHandOff_(v, sh) {
  var want = {};
  for (var i = 0; i < v.length; i++) {
    // 새 캠페인이 만들어진 줄만 — 아직 없으면 옛것을 멈출 때가 아니다
    if (!String(v[i][AG_GID] || '').trim()) continue;
    var prev = String(v[i][AG_PREVCID] || '').split(',')
                 .map(function (t) { return t.trim(); }).filter(function (t) { return t; });
    for (var q = 0; q < prev.length; q++) want[prev[q]] = true;
  }
  if (!Object.keys(want).length) return [];

  var list = [];
  adPlanEachRow_(function (row, sh0, rowNo, tab) {
    var cid = String(row[AP_CID - 1] || '').trim();
    if (!cid || !want[cid]) return;
    if (String(row[AP_RESULT - 1]).indexOf(ADENABLE_MARK.PAUSED) >= 0) return;  // 이미 멈춤
    list.push({ tab: tab, row: rowNo, cid: cid, name: String(row[AP_NAME - 1]) });
  });
  if (!list.length) return [];
  return adWatchPause_(adsToken_(), list,
    '수동 캠페인으로 갈아탔습니다 — 같은 말에 둘이 입찰하지 않게', '트랙 B 갈아타기');
}

/**
 * 옛 [주간 판정]은 없앴다. 그 일은 셋으로 갈라졌다:
 *   누적 손해·단계 → 상태 점검(72S, 원장 기준)
 *   멈춤          → 작업 계획(72V)이 '상태변경' 작업으로 만들고 실행(72W)이 보낸다
 *   마지막 그물    → 관제(72N)가 [멈춤필요] 를 보고 하루 안에 잡는다
 * 리포트를 따로 받던 것도 없어졌다 — 지출 원장 하나만 본다.
 */
function reviewAdGrow() { refreshAdGrow(); }

/**
 * 캠페인을 만든 뒤 그 ID 와 시작일을 육성 표에 돌려 적는다 (72J 가 부른다).
 * 상태 점검·작업 큐가 캠페인ID 로 지출과 켜짐을 찾으므로 이것이 없으면 안 돈다.
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
