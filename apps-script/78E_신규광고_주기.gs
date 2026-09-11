/**
 * 78E_신규광고_주기.gs — 매일 주기
 *
 * 순서는 기획서 §7 그대로다. 앞엣것이 뒤엣것을 막을 수 있으니 순서가 뜻을 가진다:
 *
 *   ① 보호      살 수 없는 것·판돈 떨어진 것·마진이 무너진 것을 먼저 멈춘다
 *   ② 결과불명  아마존이 아직 광고를 못 받아 준 줄을 다시 시도한다
 *   ③ 판정      성숙 자료로 수익운영 / 관찰 / 중단 을 가른다
 *   ④ 탐색 조정 판정이 안 나온 것 가운데 노출이 안 붙는 것만 상한 안에서 조금 올린다
 *   ⑤ 인계      근거가 쌓인 것을 EXPAND 에 넘긴다
 *
 * 기획서 §7 은 탐색 조정을 판정보다 앞에 뒀지만 코드는 뒤에 둔다 — 이미 팔리는 것
 * (수익운영·관찰)은 값을 올리지 않는 것이 기획서 §7.2 이고, 판정을 먼저 해야
 * 그 둘을 가려낼 수 있다. 판정이 안 나온 것만 조정 대상이 된다.
 *
 * ── 성숙한 자료만으로 판정한다 ──────────────────────────
 * 클릭일 + 16일이 지난 날만 센다. 어제 클릭에 붙을 주문이 아직 안 왔는데 '주문 0'
 * 이라고 멈추면, 팔릴 물건을 판단 착오로 버린다. 대신 판돈은 성숙과 무관하게 깎는다 —
 * 돈은 이미 나갔다.
 *
 * ── 멈출 때는 상품광고만 멈춘다 ─────────────────────────
 * 캠페인·광고그룹은 그대로 둔다. 그룹을 지우면 같은 SKU 를 다시 시작할 때 탐색비
 * 원장이 끊기고, 새 그룹으로 판돈이 초기화된다 (기획서 §7.1 마지막 줄).
 *
 * ── 돈이 드는 일은 모드가 자동운영일 때만 ───────────────
 * 입찰 인상은 돈을 더 쓰는 일이다. 모의운영이면 '이렇게 하겠다' 만 적는다.
 * 멈추는 것은 돈을 아끼는 일이라 모의운영에서도 적기만 하고 보내지 않는다 —
 * 보내지 않으면 돈이 계속 나가므로, 모의운영으로 오래 두면 안 된다고 알린다.
 */

var NA_LOWEXP_DAYS = 3;                  // 최근 완료일 몇 개로 저노출을 보나
var NA_LOWEXP_IM = 300;                  // 그 기간 노출이 이만큼 미만이고
var NA_LOWEXP_CK = 5;                    // 클릭도 이만큼 미만이면 저노출
var NA_RAISE_PCT = 0.15;                 // 한 번에 올릴 최대 비율
var NA_RAISE_EVERY_D = 3;                // 이만큼 날이 지나야 한 번 더 올린다 (기획서 72시간)
var NA_DEAD_IM = 1000;                   // 누적 노출이 이만큼인데
var NA_DEAD_CK = 0;                       // 클릭이 이만큼이면 관련성 없음으로 본다
var NAR_LOW_REL = 'LOW_RELEVANCE';
var NAR_EXPIRED = 'PROBE_EXPIRED';
var NAR_POT_OUT = 'POT_EXHAUSTED';
var NAR_HANDED = 'HANDED_TO_EXPAND';
var NAR_PROFIT = 'MATURE_PROFIT_POSITIVE';
var NAR_INELIGIBLE = 'AD_INELIGIBLE';
var NA_RETRY_EVERY_D = 3;                // 아마존이 안 받아 주면 며칠마다 다시
var NA_RETRY_UNTIL_D = 21;               // 언제까지 다시 (1~2주 걸린다고 확인됨)

/** 정기 작업: 매일 주기 */
function scheduledNewAdsCycle() {
  return adSchedRun_('scheduledNewAdsCycle', '신규 매일 주기', function () {
    var r = withLock_('신규 상품 광고 주기', function () { return naCycleRun_({ quiet: true }); });
    return r.ran ? '완료' : ADSPEND_PENDING;          // 잠금이 바쁘면 3분 뒤 다시
  });
}

/** 메뉴: 매일 주기를 지금 한 번 */
function naCycle() {
  if (!adBusyGuard_('신규 상품 광고 — 매일 주기')) return;
  var r = naCycleRun_({ quiet: false });
  if (r.blocked) { ui_().alert('매일 주기', r.blocked, ui_().ButtonSet.OK); return; }
  ui_().alert('신규 상품 광고 — 매일 주기',
    '돌아가는 상품군 ' + r.live + '개\n' +
    (r.perfLast ? '실적 자료 마지막 날 ' + r.perfLast + ' (성숙 판정은 ' + r.matureTo + ' 까지)\n\n'
                : '⚠ [' + NA_SHEET_PERF + '] 이 비어 있습니다 — [광고비 수집] 을 먼저 돌리세요.\n\n') +
    '① 보호로 멈춤 ' + r.guard + '개' + (r.guardWhy ? ' (' + r.guardWhy + ')' : '') + '\n' +
    '② 다시 시도 ' + r.retried + '개' + (r.gaveUp ? ' · 그만둠 ' + r.gaveUp : '') + '\n' +
    '③ 입찰 올림 ' + r.raised + '개' + (r.lowRel ? ' · 관련성 없음 ' + r.lowRel : '') + '\n' +
    '④ 판정 — 수익운영 ' + r.profit + ' · 관찰 ' + r.watch + ' · 중단 ' + r.stopped + '\n' +
    '⑤ EXPAND 로 인계 ' + r.handed + '개 · 다시 켬 ' + r.resumed + '개\n\n' +
    (r.sent ? '아마존에 보낸 것: 멈춤 ' + r.sentStop + '개 · 다시 켬 ' + r.sentResume + '개 · 입찰 ' + r.sentBid + '개\n\n'
            : naGateText_(r.pol) +
              '⚠ 모의운영이라 아마존에 아무것도 보내지 않았습니다.\n' +
              '   멈춰야 할 광고가 있으면 그동안 계속 돈이 나갑니다.\n\n') +
    (r.left ? '시간이 다 돼 ' + r.left + '개를 남겼습니다 — 다시 누르면 이어 갑니다.\n' : ''),
    ui_().ButtonSet.OK);
}

/**
 * @param {Object} opts {quiet}
 * @return {Object}
 */
function naCycleRun_(opts) {
  var out = { blocked: '', pol: null, live: 0, guard: 0, guardWhy: '', retried: 0, gaveUp: 0,
              raised: 0, lowRel: 0, profit: 0, watch: 0, stopped: 0, handed: 0, resumed: 0,
              sent: false, sentStop: 0, sentResume: 0, sentBid: 0, left: 0, perfLast: '', matureTo: '' };
  var t0 = Date.now();
  var pol = naPolicy_();
  out.pol = pol;
  naMigrate_();

  var ish = naSheet_(NA_SHEET_ITEM, NA_ITEM_HEADER);
  if (ish.getLastRow() < 2) { out.blocked = '[' + NA_SHEET_ITEM + '] 이 비어 있습니다.'; return out; }
  var rows = ish.getRange(2, 1, ish.getLastRow() - 1, NA_ITEM_HEADER.length).getValues();
  var fsh = naSheet_(NA_SHEET_FAM, NA_FAM_HEADER);
  var fams = fsh.getLastRow() > 1
    ? fsh.getRange(2, 1, fsh.getLastRow() - 1, NA_FAM_HEADER.length).getValues() : [];
  var famAt = {};
  for (var f = 0; f < fams.length; f++) famAt[String(fams[f][NA_F_KEY] || '').trim()] = f;

  var today = ymd_(new Date());
  var perf = naPerfBySku_();
  out.perfLast = perf.last;
  out.matureTo = naMatureTo_(today);
  var listing = naListingMap_();
  var units = {};
  try { units = adUnitMap_(); } catch (e) { log_('newads', 'WARN', '상품광고목록을 못 읽었습니다'); }
  var ctx = adMarginCtx_(true);

  var live = naLiveStates_();
  var work = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][NA_I_OWNER] || '').trim() !== NA_OWNER) continue;
    var st = String(rows[i][NA_I_STATE] || '');
    if (st === NAS_PROBE || st === NAS_WATCH || st === NAS_PROFIT) { work.push(i); out.live++; }
    else if ((st === NAS_STOP || st === NAS_COOL) && String(rows[i][NA_I_GID] || '').trim()) work.push(i);
  }

  // 판돈 원장을 먼저 새로 센다 — 보호·판정이 다 이 값을 본다
  naPotUpdate_(rows, fams, famAt, perf, ctx);

  var stopIds = [], bidJobs = [], resumeIds = [];
  for (var w = 0; w < work.length; w++) {
    if (Date.now() - t0 > NA_SOFT_MS) { out.left = work.length - w; break; }
    var ri = work[w];
    var r = rows[ri];
    var sku = String(r[NA_I_SKU] || '').trim();
    var fam = fams[famAt[String(r[NA_I_FAM] || '').trim()]];
    var o = perf.bySku[sku] || null;
    var st0 = String(r[NA_I_STATE] || '');
    if (st0 === NAS_STOP || st0 === NAS_COOL) {
      // 멈춘 것 — 다시 켤 수 있나만 본다
      var rs = naResume_(r, fam, listing[sku], ctx, pol, today);
      if (rs.resume) {
        var ids0 = naAdIdsFor_(units, sku, String(r[NA_I_GID] || ''), 'PAUSED', r[NA_I_ADIDS]);
        for (var k0 = 0; k0 < ids0.length; k0++) resumeIds.push(ids0[k0]);
        r[NA_I_STATE] = NAS_PROBE; r[NA_I_ALLOC] = NAA_START; r[NA_I_WHY] = rs.why; r[NA_I_NEXT] = today;
        if (fam) { fam[NA_F_STATE] = NAS_PROBE; fam[NA_F_WHY] = ''; fam[NA_F_COOL] = ''; }
        out.resumed++;
      } else if (rs.why && rs.why !== String(r[NA_I_WHY])) r[NA_I_WHY] = rs.why;
      continue;
    }
    var d = naDecide_(r, fam, o, listing[sku], ctx, pol, today);

    if (d.stop) {
      r[NA_I_STATE] = NAS_STOP;
      r[NA_I_ALLOC] = NAA_EXCLUDE;
      r[NA_I_WHY] = d.why;
      r[NA_I_NEXT] = naPlusDays_(today, d.cool || 0);
      if (fam) {
        fam[NA_F_STATE] = d.cool ? NAS_COOL : NAS_STOP;
        fam[NA_F_WHY] = d.why;
        if (d.cool) fam[NA_F_COOL] = naPlusDays_(today, d.cool);
      }
      var ids = naAdIdsFor_(units, sku, String(r[NA_I_GID] || ''), 'ENABLED', r[NA_I_ADIDS]);
      for (var k = 0; k < ids.length; k++) stopIds.push(ids[k]);
      if (d.guard) { out.guard++; if (!out.guardWhy) out.guardWhy = d.tag; }
      else out.stopped++;
      continue;
    }
    if (d.hand) {
      r[NA_I_OWNER] = 'EXPAND';
      r[NA_I_STATE] = NAS_HANDED;
      r[NA_I_WHY] = d.why;
      r[NA_I_NEXT] = today;
      if (fam) { fam[NA_F_STATE] = NAS_HANDED; fam[NA_F_WHY] = d.why; }
      out.handed++;
      continue;
    }
    if (d.raise) {
      bidJobs.push({ gid: String(r[NA_I_GID] || ''), to: d.bid, sku: sku, ri: ri });
      r[NA_I_WHY] = d.why;
      r[NA_I_NEXT] = naPlusDays_(today, d.wait || NA_RAISE_EVERY_D);
      out.raised++;
      continue;
    }
    if (d.state && d.state !== String(r[NA_I_STATE])) {
      r[NA_I_STATE] = d.state;
      r[NA_I_WHY] = d.why;
      r[NA_I_NEXT] = today;
      if (d.state === NAS_PROFIT) out.profit++;
      else if (d.state === NAS_WATCH) out.watch++;
      if (fam) { fam[NA_F_STATE] = d.state; fam[NA_F_WHY] = ''; }
      continue;
    }
    if (d.tag === NAR_LOW_REL) out.lowRel++;
    if (d.why && d.why !== String(r[NA_I_WHY])) r[NA_I_WHY] = d.why;
  }

  // ② 아마존이 아직 안 받아 준 줄을 다시 시도한다
  var rt = naRetryIneligible_(today);
  out.retried = rt.retried; out.gaveUp = rt.gaveUp;

  // 보내기 — 모드가 자동운영일 때만
  if (pol.canAuto && (stopIds.length || bidJobs.length || resumeIds.length)) {
    out.sent = true;
    out.sentStop = naSendState_(stopIds, 'PAUSED');
    out.sentResume = naSendState_(resumeIds, 'ENABLED');
    out.sentBid = naSendBids_(bidJobs, rows);
  }

  if (rows.length) ish.getRange(2, 1, rows.length, NA_ITEM_HEADER.length).setValues(rows);
  if (fams.length) fsh.getRange(2, 1, fams.length, NA_FAM_HEADER.length).setValues(fams);
  log_('newads', 'INFO', '매일 주기 — 도는 것 ' + out.live + ' · 보호 ' + out.guard +
       ' · 중단 ' + out.stopped + ' · 수익 ' + out.profit + ' · 관찰 ' + out.watch +
       ' · 인계 ' + out.handed + ' · 인상 ' + out.raised + ' · 재개 ' + out.resumed +
       (out.sent ? ' · 보냄(멈춤 ' + out.sentStop + '/재개 ' + out.sentResume + '/입찰 ' + out.sentBid + ')' : ' · 모의') +
       (out.left ? ' · 남음 ' + out.left : ''));
  return out;
}

/** 성숙 판정에 쓸 수 있는 마지막 날짜 */
function naMatureTo_(todayYmd) {
  return naPlusDays_(todayYmd, -(SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS));
}

function naPlusDays_(ymd, n) {
  var p = String(ymd).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + Number(n || 0));
  return ymd_(d);
}

/**
 * 상품군 원장을 새로 센다.
 *
 *   누적 탐색비 = 그 상품군 SKU 들의 광고비 합 (성숙과 무관하다 — 돈은 이미 나갔다)
 *   위험손실   = max(0, 누적 탐색비 − 성숙 광고귀속 공헌이익)
 *   남은 판돈  = min(판돈 − 누적 탐색비, 판돈 − 위험손실)
 *
 * 공헌이익을 성숙한 것만 인정하는 이유: 아직 안 익은 매출로 손실을 깎으면
 * 실제로는 잃고 있는데 '아직 여유 있다' 고 말하게 된다 (EXPAND 와 같은 잣대).
 */
function naPotUpdate_(rows, fams, famAt, perf, ctx) {
  var agg = {};
  for (var i = 0; i < rows.length; i++) {
    var sku = String(rows[i][NA_I_SKU] || '').trim();
    var o = perf.bySku[sku];
    if (!o) continue;
    var fk = String(rows[i][NA_I_FAM] || '').trim();
    var a = agg[fk] || (agg[fk] = { cost: 0, mSales: 0, mOd: 0, pct: 0 });
    a.cost += o.cost;
    a.mSales += o.mSales;
    a.mOd += o.mOd;
    var pct = Number(rows[i][NA_I_MPCT]) || 0;
    if (pct > a.pct) a.pct = pct;                 // 상품군 안에서 가장 높은 마진율로 본다
  }
  for (var fk2 in agg) {
    var at = famAt[fk2];
    if (at === undefined) continue;
    var fam = fams[at], a2 = agg[fk2];
    var pot = Number(fam[NA_F_POT]) || 0;
    var profit = a2.mSales * (a2.pct / 100);
    var risk = Math.max(0, a2.cost - profit);
    fam[NA_F_SPENT] = Math.round(a2.cost);
    fam[NA_F_RISK] = Math.round(risk);
    // 남은 판돈 — 성숙 주문이 하나라도 있으면 손실만 깎는다 (naDecide_ 의 잣대와 같다).
    // 탐색 중에만 누적 광고비로도 깎는다. 표의 숫자와 멈추는 규칙이 같은 셈이어야 사람이 읽는다
    fam[NA_F_LEFT] = pot > 0
      ? Math.round(a2.mOd >= 1 ? pot - risk : Math.min(pot - a2.cost, pot - risk)) : '';
  }
}

/**
 * 한 SKU 를 어떻게 할까. 시트도 아마존도 건드리지 않는다 — 판단만 한다.
 * @return {Object} {stop,guard,hand,raise,bid,state,why,tag,cool}
 */
function naDecide_(r, fam, o, L, ctx, pol, today) {
  var sku = String(r[NA_I_SKU] || '').trim();
  var no = function (tag, why, cool, guard) {
    return { stop: true, guard: !!guard, tag: tag, why: why, cool: cool || 0 };
  };

  // ── ① 보호 ──────────────────────────────────────────────
  if (!L) return no(NAR_NOT_LISTED, '리스팅에서 사라졌습니다 — 멈춥니다', 0, true);
  if (!NA_LISTING_OK[String(L.state || '').trim().toLowerCase()]) {
    return no(NAR_LISTING_OFF, '리스팅 상태가 "' + (L.state || '(빈칸)') +
              '" 입니다 — 살 수 없는 것에 돈을 쓰지 않습니다', 0, true);
  }
  if (!(L.stock > 0)) {
    return no(NAR_NO_STOCK, '재고가 0 입니다 — 들어오면 다시 시작합니다', 0, true);
  }
  // 값·조달비가 바뀌어 마진이 무너졌나 — 상한을 다시 센다
  var price = L.price > 0 ? L.price : (Number(r[NA_I_PRICE]) || 0);
  var m = adMarginFor_(ctx, sku, price, String(r[NA_I_NAME] || ''), null, String(r[NA_I_ASIN] || ''));
  var pct = Number(m.pct) || 0;
  if (!(pct > 0)) {
    return no(NAR_LOSS, m.why || '이 값·조달비로는 팔수록 손해입니다 — 멈춥니다', pol.cooldown, true);
  }
  var G = price * pct / 100;
  var q = naQOf_(o, pol);
  var cap = G * q * pol.beta;
  if (pol.maxBid > 0) cap = Math.min(cap, pol.maxBid);
  if (cap < NA_MIN_BID) {
    return no(NAR_BELOW_MIN, '마진이 줄어 감당 가능한 입찰이 ¥' + (Math.round(cap * 100) / 100) +
              ' 가 됐습니다 (아마존 최소 ¥' + NA_MIN_BID + ') — 멈춥니다', pol.cooldown, true);
  }
  /**
   * 판돈 검사 — 상태에 따라 잣대가 다르다.
   *   탐색(소액운영)     남은 판돈 = min(판돈 − 누적, 판돈 − 위험손실) 이 0 이면 멈춘다 (§8.3)
   *   관찰·수익운영      판돈 − 위험손실 만 본다. 누적 광고비가 판돈을 넘어도 벌고 있으면 두는 것 —
   *                     "수익을 내는 광고는 끄지 않는다" (사용자). 판돈은 탐색비 한도지 이익 한도가 아니다
   */
  var stNow = String(r[NA_I_STATE] || '');
  // 성숙 주문이 하나라도 있으면 '탐색' 이 아니다 — 판돈은 손실만 막는다. 이 검사를 판정보다
  // 먼저 하므로, 상태가 아직 소액운영인 채로 잘 팔리는 것을 누적 광고비 때문에 멈추면 안 된다
  // (실자료로 돌려 보니 하루 한 건씩 팔리는 것 17개가 그렇게 멈췄다 — 2026-09-11)
  var hasSale = !!(o && o.mOd >= 1);
  if (fam && Number(fam[NA_F_POT]) > 0) {
    var pot = Number(fam[NA_F_POT]), spent = Number(fam[NA_F_SPENT]) || 0, risk = Number(fam[NA_F_RISK]) || 0;
    var probing = stNow === NAS_PROBE && !hasSale;
    var leftNow = probing ? Math.min(pot - spent, pot - risk) : pot - risk;
    if (!(leftNow > 0)) {
      return no(NAR_POT_OUT, '상품군 판돈 ¥' + Math.round(pot) + ' 을 ' +
                (probing ? '다 썼습니다' : '손실로 다 깎았습니다') +
                ' (누적 ¥' + Math.round(spent) + ' · 위험손실 ¥' + Math.round(risk) + ') — 멈춥니다',
                pol.cooldown);
    }
  }

  // 자료가 아직 하나도 없으면 아무것도 하지 않는다 (방금 시작한 것)
  if (!o) {
    return { why: '시작했습니다 — 실적 자료를 기다립니다 (허용 ¥' +
             (Math.round(cap * 100) / 100) + ')', tag: '' };
  }

  // ── ⑤ 인계 — 성숙 자료로 근거가 쌓였나 ──────────────────
  var mProfit = o.mSales * (pct / 100) - o.mCost;
  if (o.mCk >= pol.handClicks && o.mOd >= pol.handOrders && mProfit > 0) {
    if (!pol.handover) {
      return { state: NAS_PROFIT, tag: NAR_PROFIT,
               why: '넘길 근거는 됐지만 [신규 · 인계 켜기] 가 꺼져 있습니다 — 수익운영으로 둡니다 ' +
                    '(클릭 ' + o.mCk + ' · 주문 ' + o.mOd + ' · 이익 ¥' + Math.round(mProfit) + ')' };
    }
    if (naExpandReady_()) {
      return { hand: true, tag: NAR_HANDED,
               why: '성숙 클릭 ' + o.mCk + ' · 주문 ' + o.mOd + ' · 공헌이익 ¥' +
                    Math.round(mProfit) + ' — EXPAND 에 넘깁니다 (' + NAR_HANDED + ')' };
    }
    return { state: NAS_PROFIT, tag: NAR_PROFIT,
             why: '넘길 근거는 됐지만 EXPAND 가 자동운영이 아닙니다 — 수익운영으로 둡니다 ' +
                  '(클릭 ' + o.mCk + ' · 주문 ' + o.mOd + ' · 이익 ¥' + Math.round(mProfit) + ')' };
  }

  // ── ④ 판정 ──────────────────────────────────────────────
  var spent2 = fam ? Number(fam[NA_F_SPENT]) || 0 : o.cost;
  var potGone = fam && Number(fam[NA_F_POT]) > 0 && spent2 >= Number(fam[NA_F_POT]);
  var age = o.first ? daysBetween_(o.first, today) : 0;
  var expired = age >= pol.probeDays;
  var matureDone = o.last ? adSpendMature_(o.last, today) : false;

  if (o.mOd >= pol.keepOrders && mProfit > 0) {
    var realCpc = o.mCk > 0 ? o.mCost / o.mCk : 0;
    if (realCpc <= cap) {
      return { state: NAS_PROFIT, tag: NAR_PROFIT,
               why: '성숙 주문 ' + o.mOd + ' · 공헌이익 ¥' + Math.round(mProfit) +
                    ' · 실제 CPC ¥' + (Math.round(realCpc * 100) / 100) + ' ≤ 허용 ¥' +
                    (Math.round(cap * 100) / 100) + ' — 그대로 둡니다' };
    }
  }
  if ((expired || potGone) && matureDone) {
    if (o.mOd === 0) {
      return no(expired ? NAR_EXPIRED : NAR_POT_OUT,
                (expired ? '탐색 ' + pol.probeDays + '일' : '판돈') +
                ' 이 끝났고 성숙 자료에 주문이 0 입니다 (클릭 ' + o.mCk + ' · 광고비 ¥' +
                Math.round(o.mCost) + ') — 멈추고 ' + pol.cooldown + '일 뒤 다시 봅니다',
                pol.cooldown);
    }
    if (mProfit < 0) {
      return no(NAR_LOSS, '성숙 자료로 손해가 확인됐습니다 (광고비 ¥' + Math.round(o.mCost) +
                ' · 공헌이익 ¥' + Math.round(mProfit + o.mCost) + ' → 순 ¥' + Math.round(mProfit) +
                ') — 멈추고 ' + pol.cooldown + '일 뒤 다시 봅니다', pol.cooldown);
    }
  }
  if (o.mOd >= 1) {
    return { state: NAS_WATCH, tag: '',
             why: '성숙 주문 ' + o.mOd + '건 — 한도 안에서 지켜봅니다 (클릭 ' + o.mCk + ')' };
  }

  // ── ③ 탐색 조정 — 노출이 안 붙는 것만 올린다 ────────────
  if (o.im >= NA_DEAD_IM && o.ck <= NA_DEAD_CK) {
    return { tag: NAR_LOW_REL,
             why: '노출 ' + o.im + '에 클릭 ' + o.ck + ' — 값을 올려도 안 팔립니다 (' +
                  NAR_LOW_REL + '). 더 올리지 않고 탐색 기간을 채운 뒤 판정합니다' };
  }
  var rec = naRecent_(o, NA_LOWEXP_DAYS, today);
  var bid = Number(r[NA_I_BID]) || 0;
  if (rec.days > 0 && rec.im < NA_LOWEXP_IM && rec.ck < NA_LOWEXP_CK && bid > 0 && bid < cap) {
    // [다음평가일] 이 오늘 이후면 아직 올릴 때가 아니다. 올릴 때마다 그 날짜를 사흘 뒤로
    // 미룬다 — 올린 값이 노출을 사는지 보려면 완료일이 며칠 쌓여야 한다
    var next = adYmd_(r[NA_I_NEXT]);
    if (!next || next <= today) {
      var want = Math.min(cap, Math.floor(bid * (1 + NA_RAISE_PCT) * 100) / 100);
      if (want > bid) {
        return { raise: true, bid: want, tag: '', wait: NA_RAISE_EVERY_D,
                 why: '최근 ' + rec.days + '일 노출 ' + rec.im + ' · 클릭 ' + rec.ck +
                      ' — 입찰 ¥' + bid + ' → ¥' + want + ' (허용 ¥' +
                      (Math.round(cap * 100) / 100) + ' 안)' };
      }
    }
  }
  return { why: '탐색 중 — 클릭 ' + o.ck + ' · 주문 ' + o.od + ' (성숙 주문 ' + o.mOd +
           ') · 광고비 ¥' + Math.round(o.cost) + ' / 판돈 ¥' +
           Math.round(fam ? Number(fam[NA_F_POT]) || 0 : 0), tag: '' };
}

/** 이 SKU 의 판단주문율 — 실적이 쌓이면 시드에서 실측으로 옮겨 간다 */
function naQOf_(o, pol) {
  if (!o || !(o.mCk > 0)) return pol.q0;
  var K = 50;                              // 사전 클릭 (EXPAND 의 EXPAND_PRIOR 와 같은 뜻)
  return (o.mOd + K * pol.q0) / (o.mCk + K);
}

/** EXPAND 가 실제로 받을 수 있나 — 모의운영이면 넘기지 않는다 */
function naExpandReady_() {
  try {
    var p = adExpandPolicy_ ? adExpandPolicy_() : null;
    if (p) return !!p.canAuto;
  } catch (e) {}
  try {
    var b = adBasis_();
    return String(b['확대 · 모드'] || '').trim() === '자동운영';
  } catch (e2) {}
  return false;
}

/**
 * 그 SKU 의 상품광고 ID (state 인 것만). 우리 그룹 것을 먼저, 없으면 전부.
 *
 * [상품광고목록] 에 아직 없으면 (주 1회 수집이라 새 광고는 최대 7일 비어 있다) 만들 때
 * 받아 둔 [광고ID들] 을 쓴다. 이것이 없으면 시트는 '중단' 인데 아마존은 켜진 채 남는다 —
 * 실자료로 돌려 보니 멈춘 50줄이 전부 그랬다 (2026-09-11).
 */
function naAdIdsFor_(units, sku, gid, state, fallback) {
  var u = units[sku];
  var mine = [], all = [];
  if (u && u.ads) {
    for (var i = 0; i < u.ads.length; i++) {
      var a = u.ads[i];
      if (a.state !== state) continue;
      all.push(a.id);
      if (gid && String(a.gid) === String(gid)) mine.push(a.id);
    }
  }
  if (mine.length) return mine;
  if (all.length) return all;
  var fb = String(fallback || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  return fb;
}

/**
 * 아마존이 아직 광고를 못 받아 준 줄을 다시 시도한다.
 *
 * 리스팅이 Active 여도 광고 자격(바이박스·색인)은 뒤늦게 붙는다 — 사용자 실측으로
 * 1~2주 걸린다. 그때 [결과] 에 남은 거절 메시지를 비워 주면 72J 가 다시 보낸다.
 * 사흘에 한 번, 3주까지. 그 뒤에는 그만두고 사람이 볼 수 있게 남긴다.
 */
function naRetryIneligible_(today) {
  var out = { retried: 0, gaveUp: 0 };
  var sh = ss_().getSheetByName(SHEET_ADPLAN);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][AP_TRACK - 1]).trim() !== NA_TRACK) continue;
    var res = String(v[i][AP_RESULT - 1] || '');
    if (!res || res.indexOf('성공') === 0) continue;
    // 72J 가 실제로 남기는 말: 'adEligibilityError → 아마존이 이 상품의 광고를 허용하지 않습니다'
    if (!/eligib|허용하지 않|자격/i.test(res)) continue;
    // 첫 거절 날짜는 [근거] 칸에 남긴다 — [결과] 는 다시 시도할 때 비우므로 거기 두면 잃는다
    var why0 = String(v[i][14] || '');
    var mark = /\[(\d{4}-\d{2}-\d{2})\s*첫거절\]/.exec(why0);
    var first = mark ? mark[1] : today;
    var age = daysBetween_(first, today);
    if (age >= NA_RETRY_UNTIL_D) {
      if (res.indexOf(NAR_INELIGIBLE + ' 그만둠') < 0) {
        sh.getRange(i + 2, AP_RESULT).setValue(
          NAR_INELIGIBLE + ' 그만둠 — ' + first + ' 부터 ' + age + '일째 아마존이 안 받아 줍니다. ' +
          '리스팅·바이박스를 보고 [결과] 를 비우면 다시 시도합니다');
        out.gaveUp++;
      }
      continue;
    }
    if (age % NA_RETRY_EVERY_D !== 0 && mark) continue;      // 사흘에 한 번
    // 결과를 비워 72J 가 다시 보내게 한다. 첫 거절 날짜는 근거 칸에 남긴다
    sh.getRange(i + 2, AP_RESULT).setValue('');
    var why = why0;
    if (why.indexOf('첫거절') < 0) {
      sh.getRange(i + 2, 15).setValue(why + ' · [' + first + ' 첫거절] ' + NAR_INELIGIBLE +
        ' — 아마존이 아직 이 상품의 광고를 안 받습니다. ' + NA_RETRY_EVERY_D +
        '일마다 ' + NA_RETRY_UNTIL_D + '일까지 다시 시도합니다');
    }
    out.retried++;
  }
  return out;
}

/**
 * 멈춘 것을 다시 켤 수 있나.
 *
 *   보호로 멈춘 것(냉각 없음)   원인이 사라지면 바로 — 재고가 들어왔다 · 리스팅이 살아났다
 *   판정으로 멈춘 것(냉각 28일) 냉각이 끝나고 G 가 20% 이상 달라졌을 때만 (기획서 §7.3).
 *                             날짜만으로 다시 켜지 않는다 — 같은 조건이면 같은 결과다.
 *                             달라졌으면 판돈을 새 G 로 다시 세고, 누적은 그대로 잇는다
 * 같은 광고그룹의 상품광고를 다시 켠다 — 새 그룹을 만들면 탐색비 원장이 끊긴다 (§7.1)
 */
function naResume_(r, fam, L, ctx, pol, today) {
  var sku = String(r[NA_I_SKU] || '').trim();
  var cool = fam ? adYmd_(fam[NA_F_COOL]) : '';
  if (cool && cool > today) return { why: String(r[NA_I_WHY] || '') };
  if (!L) return { why: '리스팅에 없습니다 — 올라오면 다시 켭니다' };
  if (!NA_LISTING_OK[String(L.state || '').trim().toLowerCase()]) {
    return { why: '리스팅 상태가 "' + (L.state || '(빈칸)') + '" 입니다 — 살아나면 다시 켭니다' };
  }
  if (!(L.stock > 0)) return { why: '재고가 0 입니다 — 들어오면 다시 켭니다' };
  var price = L.price > 0 ? L.price : (Number(r[NA_I_PRICE]) || 0);
  var m = adMarginFor_(ctx, sku, price, String(r[NA_I_NAME] || ''), null, String(r[NA_I_ASIN] || ''));
  var pct = Number(m.pct) || 0;
  if (!(pct > 0)) return { why: '아직 팔수록 손해입니다 — 값·조달비가 바뀌면 다시 봅니다' };
  var G = price * pct / 100;
  var cap = Math.min(pol.maxBid > 0 ? pol.maxBid : Infinity, G * pol.q0 * pol.beta);
  if (cap < NA_MIN_BID) return { why: '감당 가능한 입찰이 ¥' + (Math.round(cap * 100) / 100) + ' 라 아직 못 켭니다' };

  if (cool) {
    // 판정으로 멈춘 것 — G 가 달라져야 다시 본다
    var G0 = Number(r[NA_I_G]) || 0;
    var moved = G0 > 0 ? Math.abs(G - G0) / G0 : 1;
    if (moved < 0.20) {
      return { why: '냉각이 끝났지만 주문당공헌이익이 ¥' + Math.round(G0) + ' → ¥' + Math.round(G) +
                    ' (' + Math.round(moved * 100) + '%) 로 거의 그대로입니다 — 같은 조건이면 같은 결과라 다시 켜지 않습니다' };
    }
    if (fam) {
      var pot2 = Math.min(pol.famPot, Math.round(G * pol.famMult));
      var spent = Number(fam[NA_F_SPENT]) || 0, risk = Number(fam[NA_F_RISK]) || 0;
      var left2 = Math.min(pot2 - spent, pot2 - risk);
      if (!(left2 > 0)) {
        return { why: 'G 가 ¥' + Math.round(G0) + ' → ¥' + Math.round(G) + ' 로 달라졌지만 새 판돈 ¥' + pot2 +
                      ' 도 이미 쓴 ¥' + Math.round(spent) + ' 에 못 미칩니다 — 다시 켜지 않습니다' };
      }
      fam[NA_F_POT] = pot2; fam[NA_F_LEFT] = Math.round(left2);
    }
    r[NA_I_G] = Math.round(G); r[NA_I_MPCT] = pct; r[NA_I_CAP] = Math.round(cap * 100) / 100;
    return { resume: true, why: '냉각이 끝나고 주문당공헌이익이 ¥' + Math.round(G0) + ' → ¥' + Math.round(G) +
                                ' 로 달라져 다시 켭니다 (판돈 ¥' + (fam ? fam[NA_F_POT] : '') + ')' };
  }
  return { resume: true, why: '멈춘 원인이 사라져 다시 켭니다 (재고 ' + L.stock + ' · ' + L.state + ')' };
}

/** 상품광고 상태를 바꾼다 (PAUSED / ENABLED) */
function naSendState_(ids, state) {
  if (!ids || !ids.length) return 0;
  var token, done = 0;
  try { token = adsToken_(); } catch (e) { return 0; }
  for (var i = 0; i < ids.length; i += 100) {
    var part = ids.slice(i, i + 100);
    try {
      var res = adsApiRetry_(token, 'put', '/sp/productAds',
        { productAds: part.map(function (x) { return { adId: String(x), state: state }; }) },
        ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
      var st = adsCreated_(res, 'productAds', 'adId');
      if (st.ok) {
        done += st.ids.length;
        if (state === 'PAUSED') { try { adUnitMarkPaused_(st.ids); } catch (e2) {} }
      } else log_('newads', 'WARN', '광고 ' + state + ' 실패: ' + st.msg);
    } catch (e3) { log_('newads', 'WARN', '광고 ' + state + ' 실패: ' + String(e3).substring(0, 120)); }
  }
  if (done) log_('newads', 'INFO', '상품광고 ' + done + '개를 ' + (state === 'PAUSED' ? '멈췄습니다' : '다시 켰습니다'));
  return done;
}

/** 광고그룹 기본입찰을 올린다 */
function naSendBids_(jobs, rows) {
  if (!jobs.length) return 0;
  var token, done = 0;
  try { token = adsToken_(); } catch (e) { return 0; }
  for (var i = 0; i < jobs.length; i++) {
    var j = jobs[i];
    if (!j.gid) continue;
    try {
      var res = adsApiRetry_(token, 'put', '/sp/adGroups',
        { adGroups: [{ adGroupId: String(j.gid), defaultBid: Number(j.to) }] },
        ADSW_CT_ADGROUP, ADSW_CT_ADGROUP);
      if (adsCreated_(res, 'adGroups', 'adGroupId').ok) {
        done++;
        rows[j.ri][NA_I_BID] = j.to;                  // 보낸 뒤에만 적는다
      } else {
        log_('newads', 'WARN', '입찰 못 올렸습니다 ' + j.sku);
      }
    } catch (e2) { log_('newads', 'WARN', '입찰 못 올렸습니다 ' + j.sku + ': ' + String(e2).substring(0, 120)); }
  }
  if (done) log_('newads', 'INFO', '광고그룹 입찰 ' + done + '개를 올렸습니다');
  return done;
}
