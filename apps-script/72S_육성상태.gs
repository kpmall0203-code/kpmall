/**
 * 72S_육성상태.gs — 트랙 B 상태 점검 (계산·표시만, 아마존을 건드리지 않는다)
 *
 * ── 이 걸음이 답하는 질문 ───────────────────────────────
 *   이 상품에 지금까지 얼마를 썼고, 그중 얼마를 실제로 잃었나
 *   승인된 한도 안에서 앞으로 얼마를 더 쓸 수 있나
 *   지금 어느 단계인가, 다음에 사람이 해야 할 일은 무엇인가
 *
 * ── 왜 '위험평가손실' 을 따로 세나 ──────────────────────
 * 손실 = 광고비 − 공헌이익인데, 광고매출은 클릭 뒤 며칠에 걸쳐 붙는다.
 * 아직 자라는 중인 매출로 손실을 깎으면 실제보다 안전해 보인다.
 * 그래서 위험평가에서는 성숙한 매출만 인정한다 — 늦게 붙을 이익은
 * 붙고 나서 세면 되지만, 이미 나간 광고비는 지금 나간 돈이다.
 *
 * ── 무엇을 하지 않나 ────────────────────────────────────
 * 입찰·예산을 바꾸지 않고 캠페인을 켜거나 끄지 않는다. 정책이 [자동운영]이 되고
 * 한도가 확정된 뒤에 실행 걸음을 따로 만든다. 지금은 사실을 보여 주는 것까지다.
 */

// 광고육성 표에 뒤로 붙일 칸. 머리글 이름으로 찾는다 (열 번호를 박지 않는다)
var ADGROW_EXT = [
  // 한도·모드 — 트랙 B 의 정책은 이 표에 산다 (광고운영정책은 트랙 A 만 쓴다).
  // 셋(마진율·전환율예측·주간허용손해)은 앞쪽 본문 칸에 이미 있고, 여기 것들은
  // 비워도 되는 칸이다: 모드는 자동운영, 최대 기간은 56일, 누적 한도는 없음.
  '최대 기간(일)', '누적 지출한도(JPY)', '누적 손실한도(JPY)', '정책버전', '한도지문',
  '정책ID', '정책상태',
  '마진출처', '마진확인일',
  '초기추정전환율(%)', '실제광고전환율(%)', '판단전환율(%)', '성숙클릭',
  '주문당공헌이익(JPY)', '손익분기클릭비용(JPY)', '목표클릭비용(JPY)',
  '기준키워드ID', '현재설정입찰(JPY)', '입찰차이',
  '단계',
  '주간지출(JPY)', '주간위험손실(JPY)', '주간여력(JPY)',
  '누적지출(JPY)', '누적위험손실(JPY)', '누적여력(JPY)',
  '미집계준비액(JPY)', '경과일', '자료기준일',
  '스스로버나',        // 성숙 기준으로 광고비를 공헌이익이 덮고 있나
  '최근7일노출', '최근7일클릭', '실제클릭비용(JPY)', '예산소진율(%)', '노출진단',
  '멈춤필요',          // '예' 면 작업 계획이 캠페인 멈춤 작업을 만들고, 관제가 하루 안에 잡는다
  '다음 행동'
];

/**
 * 수동 캠페인에 올린 기준키워드의 ID.
 *
 * 이것이 있으면 입찰은 광고그룹이 아니라 이 키워드에 걸어야 한다 —
 * 아마존은 키워드에 입찰이 있으면 광고그룹 기본입찰을 쓰지 않는다.
 * 이 칸이 비어 있으면 그룹 기본입찰이 곧 그 그룹의 입찰이다 (자동 캠페인).
 */
var ADGROW_KWID = '기준키워드ID';

/** 단계 (기획서 9.5) */
var BSTAGE_INPUT = '입력대기';
var BSTAGE_FIND = '키워드발견';
var BSTAGE_PREP = '수동준비';
var BSTAGE_GROW = '집중육성';
var BSTAGE_HOLD = '유지확인';
var BSTAGE_HANDOVER = 'A인계';
var BSTAGE_STOP = '보류/중단';

/**
 * 시장가 대비 우리 입찰이 어디에 있나 (기획서 6장 '예산 소진율').
 *
 * 아마존은 '이 말의 시장가' 를 알려주지 않는다. 그러나 우리가 실제로 낸 값과
 * 예산을 얼마나 썼는지는 원장에 있다. 그 둘을 겹쳐 보면 답이 나온다:
 *
 *   예산을 다 못 쓰는데 낸 값이 목표에 붙어 있다 → 시장가가 우리 천장 위다.
 *      더 내지 않는 한 살 수 있는 노출이 적다 (그런데 더 내면 손해가 커진다)
 *   예산을 다 못 쓰는데 낸 값이 목표보다 한참 아래다 → 값 문제가 아니라
 *      살 물건이 적은 것이다 (겨냥이 좁거나 검색량이 적다)
 *   예산이 다 나간다 → 값은 통한다. 더 사려면 예산을 올려야 한다
 *
 * 여기서 입찰을 스스로 올리지 않는다. 천장은 마진과 전환율이 정한 값이고,
 * 그 위는 순위를 사는 값이 아니라 그냥 손해다 — 넘길지 말지는 사람이 정한다.
 */
var REACH_BURN_LOW = 0.4;         // 예산을 이만큼도 못 쓰면 '못 사고 있다'
var REACH_BURN_FULL = 0.9;        // 이만큼 쓰면 예산이 한계다
var REACH_CPC_NEAR = 0.9;         // 낸 값이 목표의 이만큼이면 천장에 붙은 것
var REACH_MIN_DAYS = 3;           // 이만큼은 돌아 봐야 말할 수 있다

var REACH_NONE = '노출 없음';
var REACH_CEIL = '천장에 막힘';
var REACH_THIN = '노출이 모자람';
var REACH_FULL = '예산이 한계';
var REACH_OK = '정상';

/**
 * @param {Object} o {days, im, clicks, cost, daily, target}
 * @return {{state:string, note:string}} state 가 '' 이면 아직 말하지 않는다
 */
function adGrowReach_(o) {
  if (!(o.days >= REACH_MIN_DAYS) || !(o.daily > 0)) {
    return { state: '', note: '' };      // 자료가 모자라면 진단하지 않는다
  }
  var burn = o.cost / (o.daily * o.days);
  var cpc = o.clicks > 0 ? o.cost / o.clicks : 0;
  if (!o.im) {
    return { state: REACH_NONE,
             note: '최근 ' + o.days + '일 노출 0 — 입찰이 시장가보다 낮거나 상품 자격 문제입니다' };
  }
  if (burn >= REACH_BURN_FULL) {
    return { state: REACH_FULL,
             note: '예산을 다 쓰고 있습니다 (소진율 ' + Math.round(burn * 100) + '%). ' +
                   '더 사려면 하루 예산을 올려야 합니다' };
  }
  if (burn < REACH_BURN_LOW) {
    if (o.target > 0 && cpc >= o.target * REACH_CPC_NEAR) {
      return { state: REACH_CEIL,
               note: '낸 값 ¥' + Math.round(cpc * 10) / 10 + ' 이 목표 ¥' +
                     Math.round(o.target * 10) / 10 + ' 에 붙었는데 예산은 ' +
                     Math.round(burn * 100) + '% 만 썼습니다 — 시장가가 우리 천장 위입니다. ' +
                     '마진율이 맞는지 보고, 아니면 손해배수를 올릴지 이 상품을 뺄지 정해 주세요' };
    }
    return { state: REACH_THIN,
             note: '예산을 ' + Math.round(burn * 100) + '% 만 썼는데 낸 값은 ¥' +
                   Math.round(cpc * 10) / 10 + ' 로 목표보다 낮습니다 — ' +
                   '값 문제가 아니라 살 노출이 적은 것입니다 (겨냥이 좁거나 검색량이 적음)' };
  }
  return { state: REACH_OK, note: '' };
}

/** 이 육성 줄이 쓰는 캠페인ID 전부 (지금 것 + 갈아타며 버린 것) */
function adGrowCids_(row) {
  var out = {};
  var cur = String(row[AG_CID] || '').trim();
  if (cur) out[cur] = true;
  var prev = String(row[AG_PREVCID] || '').split(',');
  for (var i = 0; i < prev.length; i++) {
    var p = prev[i].trim();
    if (p) out[p] = true;
  }
  return out;
}

/**
 * 단계와 다음 행동을 정한다.
 * 막는 것이 먼저다 — 돈이 나가는 것을 멈출 이유가 있으면 그것이 단계다.
 */
function adGrowStage_(o) {
  if (!o.marginOk) {
    return { stage: BSTAGE_INPUT,
             next: '이 상품의 마진율을 광고육성 표에 적어 주세요 (원가·수수료·배송비를 뺀 값)' };
  }
  if (!o.policy) {
    return { stage: BSTAGE_INPUT,
             next: '운영 정책에 이 SKU 줄이 없습니다 — [운영 정책 만들기·정비]를 누르세요' };
  }
  if (!o.policy.ready) {
    return { stage: BSTAGE_INPUT,
             next: '정책에서 안 정한 것: ' + o.policy.miss.join(' · ') };
  }
  if (o.policy.mode === POLICY_MODE_HOLD) {
    // 일시정지는 '새 변경을 멈춘다' 지 광고를 끄는 것이 아니다 (기획서 4.3)
    return { stage: BSTAGE_STOP, pause: false, next: '정책이 일시정지입니다 — 새 변경을 하지 않습니다' };
  }
  if (o.expired) {
    return { stage: BSTAGE_STOP, pause: true,
             next: '최대 기간 ' + o.policy.maxDays + '일을 넘겼습니다 (' + o.days + '일째). ' +
                   '정책을 다시 승인하지 않으면 늘리지 않습니다' };
  }
  if (o.total.over) {
    return { stage: BSTAGE_STOP, pause: true,
             next: '누적 한도 소진 — 지출 ' + fmtYen_(o.total.cost) + ' / ' +
                   fmtYen_(o.policy.totalSpend) + ' · 위험손실 ' + fmtYen_(o.total.risk) +
                   ' / ' + fmtYen_(o.policy.totalLoss) };
  }
  if (o.week.over) {
    return { stage: BSTAGE_STOP, pause: true,
             next: '이번 주 한도 소진 — 다음 주에 누적 한도 안에서 다시 돕니다' };
  }
  if (o.pending === null) {
    return { stage: BSTAGE_STOP,
             next: '지출 자료가 없어 남은 여력을 계산할 수 없습니다 — [지출 원장 수집]을 먼저 하세요' };
  }
  if (!o.keyword) {
    return { stage: BSTAGE_FIND,
             next: '자동으로 검색어를 찾는 중입니다. 매주 [검색어 수집·판정]을 보고 ' +
                   '살 말이 보이면 [기준키워드]에 적으세요' };
  }
  if (!o.manual) {
    return { stage: BSTAGE_PREP,
             next: '기준키워드가 정해졌습니다 — [자동 → 수동 갈아타기] 로 수동 캠페인을 만드세요' };
  }
  /**
   * 육성이 끝났는지는 '스스로 버나' 로 본다.
   *
   * 오가닉 순위로 판정하던 것을 걷어냈다 — 아마존이 순위를 주지 않아 사람이
   * 손으로 적어야 했고, 검색어·지역·기기·시각마다 흔들려 변수만 늘렸다.
   * 대신 원장에 이미 있는 사실을 쓴다: 성숙한 공헌이익이 광고비를 덮으면
   * 이 상품은 더 이상 손해를 보며 사는 것이 아니다. 그것이 육성의 끝이다.
   *
   * 표본이 모자랄 때 우연히 덮은 것을 졸업으로 읽지 않으려고, 성숙 클릭이
   * 사전클릭(판단전환율의 무게)만큼은 쌓인 뒤에만 본다.
   */
  if (o.selfPay) {
    return { stage: BSTAGE_HOLD,
             next: '광고가 스스로 법니다 (성숙 클릭 ' + o.matureClicks + '회 · 위험손실 0). ' +
                   '바로 끄지 않고 손해배수를 걷어 손익분기로 낮춘 뒤 유지되는지 봅니다. ' +
                   '그대로 유지되면 트랙 A 로 옮기세요' };
  }
  return { stage: BSTAGE_GROW,
           next: '아직 손해를 보며 사는 중입니다 (성숙 클릭 ' + o.matureClicks + '회' +
                 (o.matureClicks < o.needClicks
                   ? ' — ' + o.needClicks + '회는 돼야 스스로 버는지 판정합니다' : '') + '). ' +
                 '남은 여력 ' + (o.room >= 0 ? fmtYen_(o.room) : '계산 불가') };
}

function fmtYen_(n) {
  var v = Math.round(Number(n) || 0);
  return '¥' + v.toLocaleString();
}

/**
 * 메뉴: 트랙 B 상태 점검.
 * 시트만 읽고 시트에만 쓴다 — API 를 부르지 않는다.
 */
function reviewAdGrowState(opts) {
  var quiet = !!(opts && opts.quiet);
  var made = makeOneSheet_([{ name: SHEET_INBOX, header: INBOX_HEADER }]);
  if (madeSheetStop_(made, '상태 점검')) return null;
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var map = ensureCols_(sh, ADGROW_EXT);
  var width = Math.max(sh.getLastColumn(), ADGROW_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();

  var led = adSpendRead_();
  // 정책 칸의 기본값·버전을 먼저 굳힌다 — 그래야 이번 걸음이 읽는 정책이 지금 값이다
  var newPol = adGrowPolicySeed_(sh, map);
  var pol = adPolicyAll_();
  var basis = adBasis_();
  var prior = Number(basis['판단전환율 사전클릭']) || CVR_PRIOR_CLICKS;
  var today = ymd_(new Date());
  var wkFrom = weekStart_(today);
  var stat = {}, req = [], nOver = 0, sumWeek = 0, sumTotal = 0, sumRisk = 0;

  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][AG_SKU] || '').trim();
    if (!sku) continue;

    // 마진 — B 는 사람이 준다. 없으면 17% 로 메우지 않는다
    var marginPct = Number(v[i][AG_MARGIN]);
    var marginOk = isFinite(marginPct) && marginPct > 0 && marginPct < 100;
    var margin = marginOk ? marginPct / 100 : 0;
    setCell_(v[i], map, '마진출처', marginOk ? '사용자 입력' : '없음');
    if (!marginOk) {
      req.push({ kind: 'B마진', target: sku,
                 what: '이 상품의 광고비를 빼기 전 마진율은 몇 %인가요? ' +
                       '원가·수수료·배송비를 반영한 값을 광고육성 표의 [마진율(%)] 에 적어 주세요',
                 now: v[i][AG_MARGIN] === '' ? '(빈칸)' : String(v[i][AG_MARGIN]) });
    } else {
      adInboxClose_('B마진', sku);
    }

    var p = adPolicyFor_(pol, 'B', sku);
    setCell_(v[i], map, '정책ID', p ? p.id : '');
    setCell_(v[i], map, '정책상태', p ? (p.ready ? '유효 · ' + p.mode : '미확정') : '없음');

    // 지출·손실 — 원장 하나에서만 센다
    var cids = adGrowCids_(v[i]);
    var start = v[i][AG_START] instanceof Date ? ymd_(v[i][AG_START])
                                               : String(v[i][AG_START] || '').substring(0, 10);
    var wk = adSpendSum_(led, cids, wkFrom, today);
    var w7 = adSpendSum_(led, cids, addDays_(today, -6), today);
    var tt = adSpendSum_(led, cids, start || '', today);
    var daily = Number(v[i][AG_DAILY]) || 0;
    var pending = adPendingSpend_(led.last, daily, today);
    var weekLedger = adLossLedger_(wk, margin, p ? p.weekSpend : 0, p ? p.weekLoss : 0, pending || 0);
    var totalLedger = adLossLedger_(tt, margin, p ? p.totalSpend : 0, p ? p.totalLoss : 0, pending || 0);

    // 전환율 — 초기 추정은 보존하고, 실제와 판단을 따로 적는다
    var initCvr = Number(v[i][AG_CVR]) || 0;               // [목표전환율(%)] 이 초기 추정이다
    var b = adBlendedCvr_(tt.matureOrd, tt.matureCk, initCvr / 100, prior);
    setCell_(v[i], map, '초기추정전환율(%)', initCvr || '');
    setCell_(v[i], map, '실제광고전환율(%)', b.actual === null ? '' : Math.round(b.actual * 10000) / 100);
    setCell_(v[i], map, '판단전환율(%)', Math.round(b.cvr * 10000) / 100);
    setCell_(v[i], map, '성숙클릭', b.n);

    var days = start ? daysBetween_(start, today) + 1 : 0;
    var expired = !!(p && p.maxDays > 0 && days > p.maxDays);
    /**
     * 스스로 버나 — 성숙한 공헌이익이 광고비를 덮고 있나 (누적 기준).
     * totalLedger.risk 는 max(0, 광고비 − 성숙 공헌이익) 이므로 0 이면 덮은 것이다.
     * 표본이 적을 때의 우연을 졸업으로 읽지 않게 성숙 클릭이 사전클릭만큼은 쌓여야 한다.
     */
    var selfPay = (b.n >= prior) && (totalLedger.risk <= 0) && tt.cost > 0;
    setCell_(v[i], map, '스스로버나',
             selfPay ? '예' : (b.n >= prior ? '아니오' : '아직 모름 (성숙 클릭 ' + b.n + '/' + prior + ')'));
    var keyword = String(v[i][AG_KW] || '').trim();

    /**
     * 모의운영 — 지금 자료로 계산하면 입찰이 얼마여야 하나 (기획서 9.2).
     * 아직 아마존에 보내지 않는다. 사람이 한도를 정할 때 보라고 적어 두는 값이다.
     *
     *   주문당 공헌이익 G = 판매가 × 마진율   (주문 매출 실측이 없을 때의 초기값)
     *   손익분기 클릭비용 = G × 판단전환율
     *   육성 목표 클릭비용 = 손익분기 × 육성배수
     */
    var price = Number(v[i][AG_PRICE]) || 0;
    var mult = Number(v[i][AG_MULT]) || ADGROW_MULT_DEFAULT;
    var G = marginOk ? price * margin : 0;
    var breakEven = G * b.cvr;
    /**
      * 지금 실제로 걸려 있는 입찰. [시작입찰] 은 처음 한 번 정한 값이라
     * 그 뒤 프로그램이 바꾼 값을 모른다 — 수집해 둔 실제 값이 있으면 그것을 쓴다.
     * 키워드 입찰이 있으면 그것이 우선이다 (그룹 기본입찰은 이때 안 쓰인다).
     */
    var kid = String(cellOf_(v[i], map, ADGROW_KWID, '')).trim();
    var gidNow = String(v[i][AG_GID] || '').trim();
    var live = null, bidSrc = '';
    if (kid) { live = adKeywordBidNow_(kid); if (live !== null) bidSrc = '키워드 수집값'; }
    if (live === null && gidNow) {
      live = adGroupBidNow_(gidNow);
      if (live !== null) bidSrc = kid ? '광고그룹 수집값 (키워드는 아직 수집 전)' : '광고그룹 수집값';
    }
    var curBid = live !== null ? live : (Number(v[i][AG_BID]) || 0);
    if (live === null) bidSrc = '시작입찰 (아직 수집 전)';
    // 수동 캠페인인가 — 계획 표의 [유형] 이 답이다
    var manual = adGrowIsManual_(String(v[i][AG_CAMP] || '').trim());

    var st = adGrowStage_({
      marginOk: marginOk, policy: p, expired: expired, days: days,
      week: weekLedger, total: totalLedger, pending: pending,
      keyword: keyword, manual: manual,
      selfPay: selfPay, matureClicks: b.n, needClicks: prior,
      room: Math.min(weekLedger.room < 0 ? Infinity : weekLedger.room,
                     totalLedger.room < 0 ? Infinity : totalLedger.room)
    });

    setCell_(v[i], map, '단계', st.stage);
    setCell_(v[i], map, '멈춤필요', st.pause ? '예' : '');
    setCell_(v[i], map, '다음 행동', st.next);

    /**
     * 목표 클릭비용은 단계를 안 뒤에 낸다.
     * 유지확인이면 손해배수를 걷고 손익분기(트랙 A 수익 기준)로 낮춘다 —
     * 목표에 닿았으면 더 잃을 이유가 없고, 바로 끄지도 않는다 (기획서 9.7).
     */
    var useMult = (st.stage === BSTAGE_HOLD) ? 1 : mult;
    var target = breakEven * useMult;
    setCell_(v[i], map, '주문당공헌이익(JPY)', G ? Math.round(G) : '');
    setCell_(v[i], map, '손익분기클릭비용(JPY)', breakEven ? Math.round(breakEven * 100) / 100 : '');
    setCell_(v[i], map, '목표클릭비용(JPY)', target ? Math.round(target * 100) / 100 : '');
    setCell_(v[i], map, '현재설정입찰(JPY)', curBid || '');
    setCell_(v[i], map, '입찰차이', (target > 0 && curBid > 0)
      ? ((Math.abs(curBid - target) < 0.5 ? '같음'
          : (curBid > target ? '설정이 ¥' + (Math.round((curBid - target) * 10) / 10) + ' 높다'
                             : '설정이 ¥' + (Math.round((target - curBid) * 10) / 10) + ' 낮다')) +
         ' · ' + bidSrc)
      : '');

    /**
     * 시장가 대비 — 낸 값과 예산 소진율로 본다. 입찰을 스스로 올리지는 않는다.
     * 천장을 넘길지는 사람이 정할 일이라 요청함으로 올린다.
     */
    var days7 = Object.keys(w7.days).length;
    var reach = adGrowReach_({ days: days7, im: w7.im, clicks: w7.ck, cost: w7.cost,
                               daily: daily, target: target });
    setCell_(v[i], map, '최근7일노출', days7 ? w7.im : '');
    setCell_(v[i], map, '최근7일클릭', days7 ? w7.ck : '');
    setCell_(v[i], map, '실제클릭비용(JPY)', w7.ck > 0 ? Math.round(w7.cost / w7.ck * 10) / 10 : '');
    setCell_(v[i], map, '예산소진율(%)',
             (days7 && daily > 0) ? Math.round(w7.cost / (daily * days7) * 100) : '');
    setCell_(v[i], map, '노출진단', reach.state);
    if (reach.note && st.stage !== BSTAGE_STOP && st.stage !== BSTAGE_INPUT) {
      setCell_(v[i], map, '다음 행동', reach.note + ' / ' + st.next);
    }
    if (reach.state === REACH_CEIL || reach.state === REACH_NONE) {
      req.push({ kind: '시장가', target: sku, what: reach.note,
                 now: '목표 클릭비용 ¥' + (Math.round(target * 10) / 10 || '?') +
                      ' · 낸 값 ¥' + (w7.ck > 0 ? Math.round(w7.cost / w7.ck * 10) / 10 : '?') +
                      ' · 소진율 ' + (daily > 0 && days7 ? Math.round(w7.cost / (daily * days7) * 100) : '?') + '%' });
    } else if (reach.state) {
      adInboxClose_('시장가', sku);
    }

    // 옛 누적 칸도 원장에서 채운다 — 옛 주간 판정이 없어져 이것 말고는 채울 곳이 없다
    v[i][AG_WEEKS] = days ? Math.max(1, Math.ceil(days / 7)) : '';
    v[i][AG_COST] = Math.round(tt.cost);
    v[i][AG_SALES] = Math.round(tt.sales);
    v[i][AG_LOSSSUM] = Math.round(totalLedger.loss);
    setCell_(v[i], map, '주간지출(JPY)', Math.round(wk.cost));
    setCell_(v[i], map, '주간위험손실(JPY)', Math.round(weekLedger.risk));
    setCell_(v[i], map, '주간여력(JPY)', weekLedger.room < 0 ? '한도 미정' : Math.round(weekLedger.room));
    setCell_(v[i], map, '누적지출(JPY)', Math.round(tt.cost));
    setCell_(v[i], map, '누적위험손실(JPY)', Math.round(totalLedger.risk));
    // 누적 한도는 비워도 되는 칸이다 — 비었으면 '따로 제한 없음' 이지 '못 정했다' 가 아니다
    setCell_(v[i], map, '누적여력(JPY)',
             totalLedger.room < 0 ? '제한 없음 (주간·기간이 가둠)' : Math.round(totalLedger.room));
    setCell_(v[i], map, '미집계준비액(JPY)', pending === null ? '자료 없음' : pending);
    setCell_(v[i], map, '경과일', days || '');
    setCell_(v[i], map, '자료기준일', led.last || '(없음)');

    stat[st.stage] = (stat[st.stage] || 0) + 1;
    if (weekLedger.over || totalLedger.over) nOver++;
    sumWeek += wk.cost; sumTotal += tt.cost; sumRisk += totalLedger.risk;
  }

  sh.getRange(2, 1, v.length, width).setValues(v);
  adGrowStateNotes_(sh);
  var nReq = adInboxAdd_(req);

  var line = Object.keys(stat).map(function (k) { return k + ' ' + stat[k]; }).join(' · ');
  log_('ads', 'INFO', '트랙 B 상태 — ' + line);
  if (quiet) return { line: line, nReq: nReq, nOver: nOver, bumped: newPol.bumped.length };
  showSheet_(SHEET_ADGROW);
  ui_().alert('트랙 B 상태 점검',
    (led.has ? '지출 자료 기준일 ' + led.last : '⛔ 지출 원장이 비어 있습니다 — [지출 원장 수집]을 먼저 하세요') +
    '\n이번 주 시작 ' + wkFrom + '\n\n' +
    line + '\n\n' +
    '이번 주 지출 ' + fmtYen_(sumWeek) + ' · 누적 지출 ' + fmtYen_(sumTotal) +
    ' · 누적 위험손실 ' + fmtYen_(sumRisk) + '\n' +
    (nOver ? '⛔ 한도를 넘긴 상품 ' + nOver + '개\n' : '') +
    (newPol.bumped.length ? '한도가 바뀌어 정책버전을 올린 상품 ' + newPol.bumped.length + '개: ' +
                            newPol.bumped.slice(0, 3).join(', ') + '\n' : '') +
    (nReq ? '요청함에 ' + nReq + '건 넣었습니다\n' : '') + '\n' +
    '여기서는 아무것도 바꾸지 않았습니다. 표의 [단계]와 [다음 행동]을 보세요.',
    ui_().ButtonSet.OK);
}

/** 이 캠페인이 수동인가 — 육성 계획 표의 [유형] 을 본다 (시트만 읽는다) */
/**
 * 정책 칸의 기본값과 버전을 굳힌다 (광고육성 표 안에서).
 *
 * 모드가 비면 자동운영으로 본다 — 승낙은 [승인] 체크이고, 모드는
 * "잠깐 멈춰 두고 싶다" 를 위한 칸이다. 한도(마진율·전환율예측·허용손해·배수·
 * 기간·누적)가 바뀌면 버전을 올려, 옛 한도로 승인돼 아직 안 나간 작업이 취소되게 한다.
 *
 * 상태 점검이 표를 읽기 전에 부른다 — 그래야 이번 걸음이 지금 값으로 판단한다.
 * @return {{added:number, bumped:Array}}
 */
function adGrowPolicySeed_(sh, map) {
  var out = { added: 0, bumped: [] };
  if (sh.getLastRow() < 2) return out;
  var width = Math.max(sh.getLastColumn(), ADGROW_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  var dirty = false;

  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][AG_SKU] || '').trim();
    if (!sku) continue;
    if (!String(v[i][AG_MODE] || '').trim()) {
      v[i][AG_MODE] = POLICY_MODE_AUTO; dirty = true; out.added++;
    }
    var fp = [v[i][AG_MARGIN], v[i][AG_CVR], v[i][AG_LOSS], v[i][AG_MULT],
              cellOf_(v[i], map, '최대 기간(일)', ''),
              cellOf_(v[i], map, '누적 지출한도(JPY)', ''),
              cellOf_(v[i], map, '누적 손실한도(JPY)', '')].join('|');
    var oldFp = String(cellOf_(v[i], map, '한도지문', ''));
    var ver = Number(cellOf_(v[i], map, '정책버전', 0)) || 0;
    if (!ver) { ver = 1; setCell_(v[i], map, '정책버전', ver); dirty = true; }
    else if (oldFp && oldFp !== fp) {
      ver += 1;
      setCell_(v[i], map, '정책버전', ver);
      out.bumped.push(sku);
      dirty = true;
      log_('ads', 'INFO', sku + ' 한도가 바뀌어 정책버전 ' + ver + ' (안 나간 작업은 취소됩니다)');
    }
    if (oldFp !== fp) { setCell_(v[i], map, '한도지문', fp); dirty = true; }
  }
  if (dirty) sh.getRange(2, 1, v.length, width).setValues(v);
  // 드롭다운은 값이 안 바뀌어도 늘 걸어 둔다 — 골라 넣는 칸인 줄 알아야 고른다
  try {
    sh.getRange(2, AG_MODE + 1, Math.max(v.length, 1), 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(POLICY_MODES, true)
        .setAllowInvalid(false).build());
  } catch (e) {}
  return out;
}

function adGrowIsManual_(campName) {
  if (!campName) return false;
  var sh = ss_().getSheetByName(SHEET_ADPLAN_GROW);
  if (!sh || sh.getLastRow() < 2) return false;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][AP_NAME - 1]).trim() !== campName) continue;
    return String(v[i][4] || '').indexOf('수동') === 0;
  }
  return false;
}

/**
 * 설명은 머리글 '이름' 으로 단다.
 * headerNotes_ 에 ADGROW_EXT 를 넘기면 1번 칸(SKU)부터 덮어쓴다 —
 * 그 배열의 순서를 곧 열 번호로 보기 때문이다. 뒤에 덧붙인 칸에는 쓸 수 없다.
 */
function adGrowStateNotes_(sh) {
  notesByName_(sh, {
    '정책상태': '운영 정책의 한도·모드·승인이 다 있어야 "유효".\n미확정이면 이 상품은 켜지지도 증액되지도 않는다.',
    '기준키워드ID': '수동 캠페인에 올린 기준키워드의 ID.\n' +
      '이 칸이 차 있으면 입찰을 광고그룹이 아니라 이 키워드에 건다 —\n' +
      '아마존은 키워드에 입찰이 있으면 광고그룹 기본입찰을 쓰지 않는다.\n' +
      '자동에서 수동으로 갈아탈 때 비운다 (옛 캠페인의 키워드니까).',
    '현재설정입찰(JPY)': '지금 실제로 걸려 있는 값. 광고 구조 수집이 가져온 것을 쓴다.\n' +
      '수집 전이면 [시작입찰] — 그때는 [입찰차이] 에 "아직 수집 전" 이라 적는다.',
    '초기추정전환율(%)': '[목표전환율(%)] 에 적은 값. 실적이 쌓여도 덮어쓰지 않는다.',
    '실제광고전환율(%)': '성숙한 광고주문 ÷ 성숙한 광고클릭. 표본이 없으면 빈칸.',
    '판단전환율(%)': '입찰 계산에 쓰는 값.\n= (성숙주문 + 사전클릭 × 초기추정) ÷ (성숙클릭 + 사전클릭)\n' +
      '표본이 적으면 초기 추정 쪽으로, 쌓이면 실제값으로 간다 — ' +
      '클릭 1회 주문 1건을 100% 로 받아 과입찰하지 않으려는 것이다.',
    '주간위험손실(JPY)': '= max(0, 주간 광고비 − 성숙한 공헌이익).\n' +
      '아직 자라는 중인 매출로 손실을 깎지 않는다.',
    '주간여력(JPY)': '= min(지출한도 − 쓴 광고비, 손실한도 − 위험손실) − 미집계준비액.\n' +
      '주간과 누적 중 작은 쪽이 실제 여력이다.',
    '누적여력(JPY)': '누적 한도를 적었으면 남은 몫, 비웠으면 "제한 없음".\n' +
      '비워도 총량은 갇혀 있다 — 주간 한도 × (최대 기간 ÷ 7) 이 최악의 노출이다.',
    '미집계준비액(JPY)': '마지막 지출 자료일 이후 아직 안 잡힌 지출의 추정.\n' +
      '= 지난 날 수 × 하루예산 × ' + SPEND_OVERSPEND_MULT + ' (아마존 일예산은 평균값이라 더 쓸 수 있다)',
    '주문당공헌이익(JPY)': '= 판매가 × 마진율. 주문 하나가 남기는 돈 (광고비 빼기 전).\n' +
      '실제 주문 매출이 쌓이면 그 값으로 바꾼다 — 지금은 판매가 기준의 초기값이다.',
    '손익분기클릭비용(JPY)': '= 주문당공헌이익 × 판단전환율. 클릭 하나에 이만큼까지 쓰면 본전이다.',
    '목표클릭비용(JPY)': '= 손익분기클릭비용 × 손해배수. 육성이 겨냥하는 값이다.\n' +
      '아직 아마존에 보내지 않는다 — 한도가 정해지고 정책이 [자동운영]이 된 뒤에 보낸다.',
    '입찰차이': '지금 아마존에 걸린 설정 입찰과 목표의 차이.\n' +
      '판단전환율이 실제로 움직이면 목표도 따라 움직인다.',
    '노출진단': '낸 값과 예산 소진율로 본 시장가 대비 우리 자리.\n' +
      REACH_NONE + ' = 최근 ' + REACH_MIN_DAYS + '일 노출 0\n' +
      REACH_CEIL + ' = 목표에 붙여 부르는데도 예산을 못 씀 — 시장가가 우리 천장 위\n' +
      REACH_THIN + ' = 값은 여유 있는데 살 노출이 적음 (겨냥·검색량)\n' +
      REACH_FULL + ' = 예산이 한계 — 더 사려면 예산을 올려야\n' +
      '입찰을 스스로 올리지는 않는다. 천장 위는 순위가 아니라 손해라서, 넘길지는 사람이 정한다.',
    '실제클릭비용(JPY)': '최근 7일 광고비 ÷ 클릭. 우리가 실제로 낸 값이다.\n' +
      '목표 클릭비용에 붙어 있으면 경매가 우리 천장 근처라는 뜻.',
    '예산소진율(%)': '최근 7일 광고비 ÷ (하루예산 × 자료가 있는 날 수).\n' +
      '낮으면 계획한 손해도 안 나고 살 것도 못 사는 상태다.',
    '스스로버나': '성숙한 공헌이익이 광고비를 덮고 있나 (= 누적 위험손실 0).\n' +
      '덮으면 육성이 끝난 것이다 — 손해배수를 걷고 손익분기로 입찰을 낮춰 유지되는지 본다.\n' +
      '성숙 클릭이 사전클릭만큼 쌓이기 전에는 "아직 모름" — 우연을 졸업으로 읽지 않는다.',
    '멈춤필요': '"예" 면 한도·기간 때문에 멈춰야 한다. [작업 계획]이 캠페인 멈춤 작업을 만들고,\n' +
      '관제가 하루 안에 한 번 더 본다. 일시정지 정책은 여기 안 걸린다 — 새 변경만 멈춘다.',
    '단계': BSTAGE_INPUT + ' → ' + BSTAGE_FIND + ' → ' + BSTAGE_PREP + ' → ' +
            BSTAGE_GROW + ' → ' + BSTAGE_HOLD + ' → ' + BSTAGE_HANDOVER + '\n' +
            BSTAGE_STOP + ' 은 한도·기간·정책 때문에 멈춘 것이다.',
    '다음 행동': '사람이 다음에 할 일. 이 칸이 비면 프로그램이 알아서 갈 수 있다는 뜻이다.'
  });
}
