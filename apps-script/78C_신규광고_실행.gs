/**
 * 78C_신규광고_실행.gs — ② 실행하기
 *
 * ① 이 적어 둔 배분대로 캠페인·광고그룹·상품광고를 만든다. **여기서 돈이 나간다.**
 *
 * ── 돈이 나가기 전에 지나야 하는 문 ─────────────────────
 *   ① [신규 · 모드] 가 '자동운영' 이어야 한다 (기본은 모의운영 — 계획만 적는다)
 *   ② [신규 · 최대 유효입찰] 이 있어야 한다 (비면 아예 시작하지 않는다)
 *   ③ 이번 주 실지출 + 미집계 준비액 < [탐색 주간 지출한도]
 *   ④ 이번 주 시작 수 < [주간 시작 상품군 수]
 *   ⑤ 상품군의 남은 판돈 > 0
 * ③ 이 걸리면 새로 시작만 멈춘다 — 이미 도는 광고는 끄지 않는다 (수익 광고도, 탐색 중인 것도).
 *
 * ── 캠페인 구조 (기획서 §9.1) ───────────────────────────
 *   캠페인 = KP NEW B{k}-{n}   k = 가격선(¥2 × 1.5^k) · n = 풀 번호
 *   광고그룹 = SKU 하나        그룹 기본입찰 = 그 SKU 의 시작 유효입찰
 *   캠페인당 그룹 [풀 캠페인당 그룹 수]개 (기본 20) · 넘치면 n+1
 *
 * 가격선으로 묶는 이유는 승격(72AH)과 같다 — 비슷한 값을 부를 것끼리 일예산을 나눠 쓴다.
 * 그룹을 SKU 하나로 두는 이유는 입찰이 SKU 마다 다르고(¥3.4~27.7 로 벌어진다),
 * 나중에 EXPAND 사다리가 그룹 단위로 값을 올리기 때문이다.
 *
 * ── 새 풀은 첫 바퀴에 한 줄만 ───────────────────────────
 * 72J 는 캠페인ID 가 빈 줄을 보면 캠페인을 만들고, 채워진 줄을 보면 그 캠페인에
 * 광고그룹만 더한다. 그래서 아직 없는 풀에 스무 줄을 한꺼번에 넣으면 같은 이름의
 * 캠페인이 스무 개 생긴다. 새 풀에는 한 줄(= 캠페인을 만드는 줄)만 넣고, 나머지는
 * POOL_WAIT 로 다음 바퀴에 넣는다 — 그때는 캠페인ID 를 알기 때문이다.
 *
 * ── 되돌아와도 안전하다 ─────────────────────────────────
 * 맨 먼저 계획 표의 트랙 N 줄에서 캠페인ID·광고그룹ID·결과를 [상품통합] 으로 옮겨 적는다.
 * 그래서 6분에 끊겨도, 모의운영으로 계획만 적어 뒀다가 나중에 자동운영으로 바꿔도,
 * 사람이 계획 표에서 직접 승인해 만들었어도, 다음 실행이 그 사실을 알아본다.
 */

var NA_POOL_PREFIX = 'KP NEW B';         // + k + '-' + n
var NA_BAND_BASE = 2;                    // 가격선 기준점 (승격과 같다)
var NA_BAND_MULT = 1.5;
var NA_CLICKS_PER_DAY = 5;               // 일예산을 셀 때 가정하는 그룹 하루 클릭 수
var NA_BUDGET_SAFETY = 2;                // 일예산 = 합 × 이것 (아마존 일예산은 평균값이다)
var NA_BUDGET_MIN = 100;                 // 아마존 최소 일예산
var NAR_POOL_WAIT = 'POOL_WAIT';         // 풀 캠페인이 아직 안 만들어졌다
var NAR_WEEK_SPEND = 'WEEKLY_SPEND_CAP';
var NAR_NO_POT = 'FAMILY_BUDGET_EXHAUSTED';
var NA_MAX_PASSES = 8;                   // 한 번 눌렀을 때 도는 최대 바퀴 수
var NA_TAIL_QUOTA = 0.10;                // 시작 슬롯의 이만큼은 G×q 하위에도 준다

/**
 * 정기 작업: 매일 11시 — 배분대로 시작한다.
 * 모드가 모의운영이면 계획만 적는다. 사람이 안 눌러도 아마존에 안 간다.
 */
function scheduledNewAdsStart() {
  return adSchedRun_('scheduledNewAdsStart', '신규 시작', function () {
    var r = withLock_('신규 상품 광고 시작', function () { return naRunStep_({ quiet: true }); });
    return r.ran ? '완료' : ADSPEND_PENDING;          // 잠금이 바쁘면 3분 뒤 다시
  });
}

/** 메뉴 ②: 실행하기 */
function naRun() {
  if (!adBusyGuard_('② 신규 상품 광고 실행')) return;
  var r = naRunStep_({ quiet: false });
  if (r.blocked) { ui_().alert('② 실행하기', r.blocked, ui_().ButtonSet.OK); return; }
  var pol = r.pol;
  ui_().alert(r.made ? '② 실행하기 — 시작했습니다' : '② 실행하기',
    (r.synced ? '먼저 계획 표에서 ' + r.synced + '줄의 결과를 [' + NA_SHEET_ITEM + '] 로 옮겼습니다.\n\n' : '') +
    '이번 주: 시작 ' + r.weekStarts + ' / ' + pol.weekStarts + ' 상품군 · ' +
    '실지출 ' + fmtYen_(r.weekSpend) + (r.pending ? ' (+준비액 ' + fmtYen_(r.pending) + ')' : '') +
    ' / ' + fmtYen_(pol.weekSpend) + '\n' +
    '시작할 수 있는 자리 ' + r.slots + '개 · 후보 ' + r.cand + '개\n\n' +
    (r.approved ? '모의운영 때 적어 둔 ' + r.approved + '줄을 승인했습니다.\n' : '') +
    (r.planned
      ? '계획 표 [' + SHEET_ADPLAN + '] 에 ' + r.planned + '줄을 넣었습니다 (트랙 ' + NA_TRACK + ').\n' +
        '   캠페인 ' + r.pools + '개 · 새로 만든 캠페인 ' + r.newPools + '개 · ' + r.passes + '바퀴\n' +
        '   일예산 합 ' + fmtYen_(r.daily) + ' · 판돈 합 ' + fmtYen_(r.pot) + '\n\n'
      : '계획에 넣을 것이 없습니다.\n\n') +
    (r.waits ? '⏳ ' + r.waits + '개는 풀 캠페인이 만들어진 뒤 다음 바퀴에 들어갑니다 (' + NAR_POOL_WAIT + ')\n\n' : '') +
    (r.why ? '⛔ ' + r.why + '\n\n' : '') +
    (r.made
      ? '아마존에 보냈습니다 — 성공 ' + r.ok + (r.fail ? ' · 실패 ' + r.fail : '') +
        (r.pend ? ' · 아직 안 보낸 줄 ' + r.pend : '') + '\n' +
        (r.fail || r.pend
          ? '   ⚠ [' + SHEET_ADPLAN + '] 의 [결과] 칸을 보세요. 잇달아 ' + ADEXEC_ABORT_AFTER +
            '줄 실패하면 그 바퀴를 멈춥니다 — 고친 뒤 ② 를 다시 누르면 실패한 줄부터 잇습니다.\n'
          : '') +
        (r.stopped ? '옛 광고 ' + r.stopped + '개를 멈췄습니다 (사람이 tiktok 에도 넣어 둔 것)\n' : '') +
        '\n지금부터 이 상품군들에 광고비가 나갑니다.\n'
      : naGateText_(pol) + '계획만 적었습니다 — 아마존에 아무것도 보내지 않았습니다.\n') +
    (r.left ? '\n⚠ 시간이 다 돼 남겼습니다 — 다시 누르면 이어 갑니다.\n' : ''),
    ui_().ButtonSet.OK);
}

/**
 * @param {Object} opts {quiet}
 * @return {Object}
 */
function naRunStep_(opts) {
  var quiet = !!(opts && opts.quiet);
  var out = { blocked: '', pol: null, synced: 0, weekStarts: 0, weekSpend: 0, pending: 0,
              slots: 0, cand: 0, planned: 0, pools: 0, newPools: 0, waits: 0, approved: 0,
              daily: 0, pot: 0, made: false, ok: 0, fail: 0, pend: 0, stopped: 0, left: 0, why: '',
              poolNames: {}, passes: 0 };
  var t0 = Date.now();
  var pol = naPolicy_();
  out.pol = pol;
  if (!pol.ready) {
    out.blocked = naGateText_(pol) + '값을 채운 뒤 다시 누르세요.';
    return out;
  }
  naMigrate_();

  var ish = naSheet_(NA_SHEET_ITEM, NA_ITEM_HEADER);
  if (ish.getLastRow() < 2) {
    out.blocked = '[' + NA_SHEET_ITEM + '] 이 비어 있습니다 — 먼저 [① 광고할 물건 가져오기] 를 누르세요.';
    return out;
  }
  var rows = ish.getRange(2, 1, ish.getLastRow() - 1, NA_ITEM_HEADER.length).getValues();
  var fsh = naSheet_(NA_SHEET_FAM, NA_FAM_HEADER);
  var fams = fsh.getLastRow() > 1
    ? fsh.getRange(2, 1, fsh.getLastRow() - 1, NA_FAM_HEADER.length).getValues() : [];
  var famAt = {};
  for (var f = 0; f < fams.length; f++) famAt[String(fams[f][NA_F_KEY] || '').trim()] = f;
  var today = ymd_(new Date());

  // ① 계획 표의 결과를 먼저 거둔다 — 끊겼거나 사람이 직접 승인했어도 알아본다
  var plan = naPlanRead_();
  out.synced = naSyncFromPlan_(rows, fams, famAt, plan, today);

  // ② 주간 문 — 개수와 돈을 따로 센다
  var wk = naWeekUsed_(fams, plan, today);
  out.weekStarts = wk.starts; out.weekSpend = wk.spend; out.pending = wk.pending;
  // 계획에 넣었지만 아직 안 만들어진 줄도 자리를 차지한다 — 안 그러면 모의운영으로 적어 둔
  // 줄이 승인되는 날 그 수만큼 한도를 넘긴다
  out.slots = Math.max(0, pol.weekStarts - wk.starts - wk.queued);
  if (pol.weekSpend > 0 && wk.spend + wk.pending >= pol.weekSpend) {
    out.slots = 0;
    out.why = '이번 주 실지출 ' + fmtYen_(wk.spend + wk.pending) + ' 이 한도 ' +
              fmtYen_(pol.weekSpend) + ' 에 닿았습니다 (' + NAR_WEEK_SPEND + ') — ' +
              '새로 시작하는 것만 멈춥니다. 이미 도는 광고는 그대로 둡니다';
  } else if (!out.slots) {
    out.why = '이번 주 시작 수 ' + wk.starts + ' 가 한도 ' + pol.weekStarts + ' 에 닿았습니다 (' +
              NAR_WEEKLY + ') — 다음 주 월요일에 다시 엽니다';
  }

  // ③~⑤ 를 몇 바퀴 돈다.
  //
  // 왜 한 바퀴로 안 되나: 아직 없는 풀 캠페인에는 한 줄(= 캠페인을 만드는 줄)만
  // 넣을 수 있다. 그러니 한 바퀴만 돌면 '가격선 수' 만큼만 시작한다 — 실자료로는
  // 132개 가운데 6개다. 만든 뒤에는 그 풀의 캠페인ID 를 알므로 이어서 채울 수 있다.
  // 그래서 [넣기 → 만들기 → 결과 거두기] 를 시간이 남는 한 되돌린다.
  var passes = 0;
  while (passes < NA_MAX_PASSES) {
    passes++;
    var cand = naCandidates_(rows, fams, famAt, plan, today);
    if (passes === 1) out.cand = cand.length;
    var w = { planned: 0, pools: 0, newPools: 0, waits: 0, daily: 0, pot: [], left: 0 };
    if (cand.length && out.slots > 0) {
      var pick = naPickOrder_(cand, out.slots);
      // 뽑히지 않은 후보도 왜 기다리는지 적는다
      var picked = {};
      for (var p0 = 0; p0 < pick.length; p0++) picked[pick[p0].sku] = 1;
      for (var c1 = 0; c1 < cand.length; c1++) {
        if (picked[cand[c1].sku]) continue;
        naSetWait_(rows, cand[c1], NAA_BUDWAIT, NAS_BUDWAIT,
          '이번 주 시작 자리 ' + pol.weekStarts + '개가 찼습니다 (' + NAR_WEEKLY +
          ') — 다음 주 월요일에 다시 줄 섭니다', today);
      }
      w = naPlanWrite_(pick, pools_(), pol, plan, today, t0, rows);
      out.slots -= w.planned;
    } else if (cand.length && !out.slots) {
      // 왜 안 시작했는지 그 줄에 적어 둔다 — 표만 보고도 알 수 있어야 한다
      for (var c0 = 0; c0 < cand.length; c0++) {
        naSetWait_(rows, cand[c0], NAA_BUDWAIT, NAS_BUDWAIT, out.why, today);
      }
    }
    out.planned += w.planned; out.newPools += w.newPools;
    out.waits = w.waits; out.left += w.left;
    for (var s2 = 0; s2 < w.pot.length; s2++) out.pot += w.pot[s2];
    for (var nm in w.names) out.poolNames[nm] = 1;

    // ⑤ 자동운영이면 실제로 만든다.
    // 모의운영 때 적어 둔 줄도 여기서 승인한다 — 사람이 모드를 바꿔 다시 누른 것이
    // '그때 본 그 계획을 만들라' 는 뜻이다. 안 그러면 그 줄들은 영영 안 만들어진다
    var approved = pol.canAuto ? naApprovePending_(plan) : 0;
    out.approved += approved;
    if (!pol.canAuto || !(w.planned || approved)) break;

    // 표와 트랙 울타리를 속성에 적고 되돌리지 않는다 — 6분에 끊기면 이어실행 트리거가
    // 그 속성을 보고 이어받는다. 다른 시작점(사람의 [승인분 만들기]·승격·키우기)은 제 울타리를 스스로 적는다
    try {
      adPlanOnlySet_(SHEET_ADPLAN);
      adPlanTrackSet_(NA_TRACK);                           // 우리 줄만 — 승격(X) 줄은 승격 주기가 맡는다
      var msg = adPlanExecStep_(false);
      out.made = true;
      var m1 = /성공 (\d+)/.exec(String(msg)); if (m1) out.ok += Number(m1[1]);
      var m2 = /실패 (\d+)/.exec(String(msg)); if (m2) out.fail += Number(m2[1]);
    } catch (e) {
      log_('newads', 'ERROR', '② 캠페인 생성 실패: ' + String(e).substring(0, 200));
      out.why = (out.why ? out.why + ' · ' : '') + '캠페인 생성에서 막혔습니다: ' + String(e).substring(0, 120);
      break;
    }
    // 만든 결과를 거둔다 — 캠페인ID·광고그룹ID 가 이때 생긴다
    plan = naPlanRead_();
    out.synced += naSyncFromPlan_(rows, fams, famAt, plan, today);
    // 실제로 만들어진 그룹 수에 맞춰 풀 일예산을 올린다 (실패한 줄 몫은 안 준다)
    try { naPoolBudgetSync_(plan); } catch (eB) { log_('newads', 'WARN', '일예산 맞추기 건너뜀: ' + String(eB).substring(0, 120)); }
    if (!out.waits || !out.slots) break;                   // 더 넣을 것이 없다
    if (Date.now() - t0 > NA_SOFT_MS) { out.left += out.waits; break; }
  }
  out.pools = 0;
  for (var pn in out.poolNames) out.pools++;
  out.passes = passes;
  // 알림에 적을 일예산 합 — 실제로 만들어진 캠페인의 값만 (계획한 것이 아니라)
  out.daily = 0;
  var seenCid = {};
  for (var d2 = 0; d2 < plan.rows.length; d2++) {
    var pr = plan.rows[d2];
    if (!pr.ok || !pr.cid || seenCid[pr.cid]) continue;
    seenCid[pr.cid] = 1;
    out.daily += Number(pr.v[AP_DAILY - 1]) || 0;
  }
  // 계획에 있고 아직 안 만들어진 줄 (실패했거나 중단에 걸려 손도 못 댄 것)
  out.pend = 0;
  for (var q2 = 0; q2 < plan.rows.length; q2++) {
    if (!plan.rows[q2].ok && !adIsGivenUp_(plan.rows[q2].res)) out.pend++;
  }

  // 같은 SKU 가 옛 그룹에도 켜져 있으면 멈춘다 (사람이 tiktok 에 넣어 둔 것)
  if (out.made) {
    try {
      var so = adPromoteStopOld_({ quiet: true, track: NA_TRACK });
      out.stopped = so.paused || 0;
    } catch (e2) { log_('newads', 'WARN', '옛 광고 멈추기 건너뜀: ' + String(e2).substring(0, 120)); }
  }

  naSaveBoth_(ish, rows, fsh, fams);
  log_('newads', 'INFO', '② 실행 — 바퀴 ' + passes + ' · 계획 ' + out.planned + '줄 · 캠페인 ' +
       out.pools + '(새 ' + out.newPools + ') · 대기 ' + out.waits +
       (out.made ? ' · 만듦 ' + out.ok + (out.fail ? '/실패 ' + out.fail : '') : ' · 모의') +
       ' · 이번주 ' + out.weekStarts + '/' + pol.weekStarts);
  return out;

  /** 바퀴마다 풀을 다시 읽는다 — 방금 만든 캠페인ID 가 들어와야 이어 채운다 */
  function pools_() { return naPools_(plan); }
}

/** 계획 표의 트랙 N 줄 */
function naPlanRead_() {
  var out = { rows: [], sh: null, byName: {}, bySku: {}, maxId: 0 };
  var sh = ensureSheet_(SHEET_ADPLAN, ADPLAN_HEADER);
  out.sh = sh;
  if (sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var id = String(v[i][0] || '');
    var m = /^N(\d+)$/.exec(id);
    if (m) out.maxId = Math.max(out.maxId, Number(m[1]));
    if (String(v[i][AP_TRACK - 1]).trim() !== NA_TRACK) continue;
    var o = { at: i + 2, v: v[i], name: String(v[i][AP_NAME - 1] || '').trim(),
              cid: String(v[i][AP_CID - 1] || '').trim(),
              gid: String(v[i][AP_GID - 1] || '').trim(),
              res: String(v[i][AP_RESULT - 1] || ''),
              adIds: String(v[i][AP_ADIDS - 1] || '').trim(),
              skus: adPlanSkus_(v[i]) };
    o.ok = o.res.indexOf('성공') === 0;
    out.rows.push(o);
    if (o.name) (out.byName[o.name] || (out.byName[o.name] = [])).push(o);
    for (var s = 0; s < o.skus.length; s++) out.bySku[o.skus[s]] = o;
  }
  return out;
}

/**
 * 계획 표의 결과를 [상품통합]·[상품군광고] 로 옮긴다.
 * 이것이 ② 를 몇 번 눌러도 안전하게 만드는 자리다 — 아마존에 이미 있는 것을 또 만들지 않는다.
 * @return {number} 고친 줄 수
 */
function naSyncFromPlan_(rows, fams, famAt, plan, today) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    var sku = String(rows[i][NA_I_SKU] || '').trim();
    if (!sku) continue;
    if (String(rows[i][NA_I_OWNER] || '').trim() !== NA_OWNER) continue;   // 사람이 잡은 줄
    var p = plan.bySku[sku];
    if (!p || !p.ok || !p.gid) continue;
    if (String(rows[i][NA_I_GID] || '').trim() === p.gid) continue;        // 이미 옮김
    rows[i][NA_I_CAMP] = p.name;
    rows[i][NA_I_CID] = p.cid;
    rows[i][NA_I_GID] = p.gid;
    rows[i][NA_I_ADIDS] = p.adIds;
    if (!String(rows[i][NA_I_START] || '').trim()) rows[i][NA_I_START] = today;
    rows[i][NA_I_STATE] = NAS_PROBE;
    rows[i][NA_I_WHY] = '광고그룹 ' + p.gid + ' 에서 탐색 중입니다 (' + p.name + ')';
    rows[i][NA_I_NEXT] = today;
    n++;
    var fk = String(rows[i][NA_I_FAM] || '').trim();
    var at = famAt[fk];
    if (at !== undefined) {
      fams[at][NA_F_STATE] = NAS_PROBE;
      if (!String(fams[at][NA_F_START] || '').trim()) fams[at][NA_F_START] = today;
      fams[at][NA_F_CAMP] = p.name;
      fams[at][NA_F_WHY] = '';
    }
  }
  return n;
}

/**
 * 이번 주에 쓴 개수와 돈.
 *
 * 개수는 [상품군광고] 의 시작일로, 돈은 광고캠페인일별에서 트랙 N 캠페인만 골라 센다.
 * 예약액을 쌓지 않는다 — 판돈은 상품군마다 제 원장에서 지키므로(§8.3) 주머니에서 미리
 * 뺄 필요가 없다. 대신 리포트가 아직 안 잡은 날들은 준비액으로 떼어 둔다.
 */
function naWeekUsed_(fams, plan, today) {
  var mon = weekStart_(today);
  var out = { starts: 0, queued: 0, spend: 0, pending: 0, mon: mon };
  for (var i = 0; i < fams.length; i++) {
    var d = adYmd_(fams[i][NA_F_START]);
    if (d && d >= mon) out.starts++;
  }
  // 트랙 N 이 만든 캠페인ID 묶음. 일예산은 풀마다 가장 큰 값 — 같은 풀의 줄은 나중 것이
  // 그 풀의 총합을 들고 있다 (naPlanWrite_)
  var cids = {}, budget = {};
  for (var p = 0; p < plan.rows.length; p++) {
    var r = plan.rows[p];
    if (!r.ok) { if (!adIsGivenUp_(r.res)) out.queued++; continue; }
    if (!r.cid) continue;
    cids[r.cid] = true;
    budget[r.cid] = Math.max(budget[r.cid] || 0, Number(r.v[AP_DAILY - 1]) || 0);
  }
  var daily = 0;
  for (var c in budget) daily += budget[c];
  if (!Object.keys(cids).length) return out;                 // 아직 만든 것이 없다
  var led;
  try { led = adSpendRead_(); } catch (e) { return out; }
  if (!led.has) {
    // 자료가 아예 없으면 이번 주 지출을 알 수 없다. 일예산으로 최악을 가정한다 —
    // 모르는 것을 0 으로 보면 한도를 넘긴 채 '여유 있음' 이라고 말하게 된다
    out.pending = Math.round(daily * (daysBetween_(mon, today) + 1) * SPEND_OVERSPEND_MULT);
    return out;
  }
  var s = adSpendSum_(led, cids, mon, today);
  out.spend = Math.round(s.cost);
  var pend = adPendingSpend_(led.last < mon ? mon : led.last, daily, today);
  out.pending = pend === null ? Math.round(daily * SPEND_OVERSPEND_MULT) : pend;
  return out;
}

/** 시작할 수 있는 후보 — 대표 · 시작 대기 · 아직 안 붙음 · 판돈 남음 · 냉각 지남 */
function naCandidates_(rows, fams, famAt, plan, today) {
  var out = [];
  var live = naLiveStates_();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[NA_I_OWNER] || '').trim() !== NA_OWNER) continue;
    if (String(r[NA_I_REP] || '').trim() !== 'O') continue;
    if (String(r[NA_I_ALLOC]) !== NAA_START && String(r[NA_I_ALLOC]) !== NAA_BUDWAIT) continue;
    if (live[String(r[NA_I_STATE])]) continue;                       // 이미 도는 것
    if (String(r[NA_I_GID] || '').trim()) continue;                  // 이미 붙었다
    // 계획 표에 이미 줄이 있으면 또 넣지 않는다 — 모의운영으로 두 번 눌러도 겹치지 않는다.
    // 72J 가 그만둔 줄도 다시 넣지 않는다 — 같은 이유로 또 실패할 줄을 매일 하나씩 늘리게 된다.
    // 사람이 계획 표의 [결과] 를 비우면 72J 가 다시 시도한다 (72J 의 규칙)
    var have = plan.bySku[String(r[NA_I_SKU] || '').trim()];
    if (have) {
      if (adIsGivenUp_(have.res) && String(r[NA_I_WHY]).indexOf('그만뒀습니다') < 0) {
        r[NA_I_WHY] = '계획 표 ' + String(have.v[0]) + ' 이 그만뒀습니다: ' + have.res.substring(0, 140) +
                      ' — [' + SHEET_ADPLAN + '] 의 [결과] 를 비우면 다시 시도합니다';
      }
      continue;
    }
    var bid = Number(r[NA_I_BID]) || 0;
    if (!(bid >= NA_MIN_BID)) continue;
    var fk = String(r[NA_I_FAM] || '').trim();
    var at = famAt[fk];
    if (at === undefined) continue;
    var fam = fams[at];
    var cool = adYmd_(fam[NA_F_COOL]);
    if (cool && cool > today) continue;                              // 아직 냉각 중
    var left = Number(fam[NA_F_LEFT]);
    if (!(left > 0)) continue;                                       // 판돈이 없다
    out.push({ i: i, at: at, sku: String(r[NA_I_SKU]).trim(), bid: bid,
               G: Number(r[NA_I_G]) || 0, q: Number(r[NA_I_Q]) || 0,
               pot: Number(fam[NA_F_POT]) || 0, fam: fk,
               waited: adYmd_(r[NA_I_IN]) || today });
  }
  return out;
}

/**
 * 고르는 순서 — G × 판단주문율 큰 순. 다만 슬롯의 [NA_TAIL_QUOTA] 는 하위에도 준다.
 *
 * 왜 전부 큰 순이 아닌가: q0 는 아직 시드값(2%)이라 순위가 사실상 G 순이다. G 가 큰 것만
 * 계속 시험하면 값싼 물건이 팔리는지는 영영 모른다. 하위 몫을 조금 섞어 그것도 재 본다.
 */
function naPickOrder_(cand, slots) {
  var a = cand.slice();
  a.sort(function (x, y) {
    var d = (y.G * y.q) - (x.G * x.q);
    if (Math.abs(d) > 0.0001) return d;
    if (x.waited !== y.waited) return x.waited < y.waited ? -1 : 1;   // 오래 기다린 순
    return x.sku < y.sku ? -1 : (x.sku > y.sku ? 1 : 0);
  });
  if (a.length <= slots) return a;
  var tail = Math.min(Math.floor(slots * NA_TAIL_QUOTA), a.length - slots);
  var head = a.slice(0, slots - tail);
  return tail > 0 ? head.concat(a.slice(a.length - tail)) : head;
}

/** 가격선 — 승격과 같은 계단 (¥2 × 1.5^k) */
function naBandOf_(bid) {
  var b = adPromoBand_(bid, NA_BAND_BASE, NA_BAND_MULT);
  return b ? b.i : 0;
}

/** 캠페인 일예산 — 그룹들의 (입찰 × 하루 클릭) 합 × 안전배수, 최소 ¥100 */
function naBudgetFor_(bids) {
  var sum = 0;
  for (var i = 0; i < bids.length; i++) sum += (Number(bids[i]) || 0) * NA_CLICKS_PER_DAY;
  return Math.max(NA_BUDGET_MIN, Math.round(sum * NA_BUDGET_SAFETY));
}

/**
 * 지금 있는 풀 — 가격선마다 [{name, n, cid, used, bids}].
 *
 * 두 곳을 본다: 계획 표(트랙 N)와 광고그룹 표. 계획 표만 보면 사람이 지운 줄을 못 보고,
 * 광고그룹 표만 보면 오늘 만든 것(아직 수집 안 된 것)을 못 본다.
 */
function naPools_(plan) {
  var by = {};
  var add = function (name, cid, bid) {
    var m = new RegExp('^' + NA_POOL_PREFIX + '(\\d+)-(\\d+)$').exec(String(name || '').trim());
    if (!m) return;
    var k = Number(m[1]), n = Number(m[2]);
    var arr = by[k] || (by[k] = {});
    var p = arr[n] || (arr[n] = { name: name.trim(), k: k, n: n, cid: '', used: 0, bids: [] });
    if (cid && !p.cid) p.cid = String(cid).trim();
    p.used++;
    if (bid > 0) p.bids.push(bid);
  };
  for (var i = 0; i < plan.rows.length; i++) {
    var r = plan.rows[i];
    add(r.name, r.cid, Number(r.v[AP_BID - 1]) || 0);
  }
  // 광고그룹 표 — 계획 표에 없는 것(사람이 지운 줄 등)도 자리를 차지한다
  try {
    var sh = ss_().getSheetByName(SHEET_ADGRP);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
      var seen = {};
      for (var g = 0; g < v.length; g++) {
        var nm = String(v[g][0] || '').trim();
        if (nm.indexOf(NA_POOL_PREFIX) !== 0) continue;
        var key = nm + '|' + String(v[g][9] || '');
        if (seen[key]) continue;
        seen[key] = 1;
        // 계획 표에서 이미 센 그룹은 두 번 세지 않는다
        var gid = String(v[g][9] || '').trim();
        var dup = false;
        for (var p2 = 0; p2 < plan.rows.length && !dup; p2++) if (plan.rows[p2].gid === gid) dup = true;
        if (dup) continue;
        add(nm, String(v[g][8] || ''), Number(v[g][4]) || 0);
      }
    }
  } catch (e) { log_('newads', 'WARN', '광고그룹 표를 못 읽었습니다: ' + String(e).substring(0, 120)); }
  return by;
}

/**
 * 계획 줄을 넣는다. 아마존은 건드리지 않는다.
 *
 * 새 풀에는 한 줄만 넣는다 — 캠페인ID 가 빈 줄이 곧 '캠페인을 만들라' 는 뜻이라
 * 여러 줄을 넣으면 같은 이름의 캠페인이 여러 개 생긴다 (파일 머리글 참고).
 */
function naPlanWrite_(pick, pools, pol, plan, today, t0, rows) {
  var out = { planned: 0, pools: 0, newPools: 0, waits: 0, daily: 0, pot: [], left: 0, names: {} };
  var cap = Math.max(1, pol.poolGroups);
  var add = [], touched = {}, nextId = plan.maxId;

  for (var i = 0; i < pick.length; i++) {
    if (Date.now() - t0 > NA_SOFT_MS) { out.left = pick.length - i; break; }
    var c = pick[i];
    var k = naBandOf_(c.bid);
    var arr = pools[k] || (pools[k] = {});
    // 자리가 남은 풀 — 번호가 작은 것부터.
    // 캠페인ID 가 없는 풀은 '아직 만들어지지 않은 것' 이다. 그 가격선에는 새 풀을 또
    // 만들지 않는다 — 만들면 모의운영으로 두 번 누를 때마다 빈 풀이 하나씩 늘고,
    // 자동운영으로 바꾸는 순간 같은 가격선에 캠페인이 여럿 생긴다
    var target = null, maxN = 0, pending = '';
    for (var n in arr) {
      maxN = Math.max(maxN, Number(n));
      if (!arr[n].cid) { pending = arr[n].name; continue; }
      if (arr[n].used < cap && (!target || arr[n].n < target.n)) target = arr[n];
    }
    if (!target) {
      if (pending) {
        out.waits++;
        naSetWait_(rows, c, NAA_START, NAS_NEW,
          '가격선 B' + k + ' 의 풀 캠페인(' + pending + ')이 아직 안 만들어졌습니다 — ' +
          '만들어지면 다음 바퀴에 들어갑니다 (' + NAR_POOL_WAIT + ')', today);
        continue;
      }
      target = arr[maxN + 1] = { name: NA_POOL_PREFIX + k + '-' + (maxN + 1), k: k, n: maxN + 1,
                                 cid: '', used: 0, bids: [], fresh: true };
      out.newPools++;
    }
    nextId++;
    var row = new Array(ADPLAN_HEADER.length).fill('');
    row[0] = 'N' + nextId;
    row[AP_ACTION - 1] = target.cid ? '기존에 추가' : '생성';
    row[2] = '신규';                                  // 방식
    row[AP_NAME - 1] = target.name;
    row[4] = '자동';                                  // 유형 — 어느 말로 팔릴지 모른다
    row[AP_BID - 1] = c.bid;
    row[7] = 1;                                       // SKU수
    row[8] = 0;                                       // 기존SKU수
    row[9] = c.sku;                                   // 대표SKU
    row[10] = '신규 B' + k;
    row[11] = c.q > 0 ? Math.round(c.G) : '';         // 손익분기CPA 대신 주문당공헌이익
    row[12] = '';                                     // 월매출합 — 새 상품이라 없다
    row[13] = '실행 시 확인';
    row[14] = '신규 탐색 — 주문당공헌이익 ¥' + Math.round(c.G) + ' × 판단주문율 ' +
              c.q + '% · 시작 ¥' + c.bid + ' · 상품군 판돈 ¥' + Math.round(c.pot) +
              ' (' + c.fam + ')';
    row[AP_SKUS - 1] = adSkuListJoin_([c.sku]);
    row[AP_CID - 1] = target.cid;                     // 비어 있으면 72J 가 캠페인을 만든다
    // [모드] 가 자동운영이면 그것이 곧 돈의 승인이다 — 계획 표에서 또 체크하게 하지 않는다
    row[AP_APPROVE - 1] = !!pol.canAuto;
    row[ADPLAN_HEADER.length - 1] = NA_TRACK;

    target.used++; target.bids.push(c.bid);
    // 캠페인을 만들 때 들어가는 일예산은 '이 한 그룹치' 로 둔다 (최소 ¥100).
    // 스물 그룹치를 미리 넣으면, 뒤 열아홉 줄이 실패했을 때 한 그룹이 스물치 예산을
    // 하루에 태울 수 있다. 실제로 만들어진 그룹 수에 맞춰 exec 뒤에 올린다 (naPoolBudgetSync_)
    row[AP_DAILY - 1] = naBudgetFor_([c.bid]);
    touched[target.name] = target;
    add.push(row);
    out.planned++;
    out.pot.push(c.pot);
    // 아직 아마존에 없다 — 결과를 거둘 때 소액운영으로 바뀐다 (naSyncFromPlan_)
    rows[c.i][NA_I_CAMP] = target.name;
    rows[c.i][NA_I_ALLOC] = NAA_START;
    rows[c.i][NA_I_WHY] = '계획 표 [' + SHEET_ADPLAN + '] 에 넣었습니다 — ' + target.name +
                          ' · 입찰 ¥' + c.bid + (pol.canAuto ? '' : ' (모의운영: 아직 안 만듭니다)');
    rows[c.i][NA_I_NEXT] = today;
  }
  if (!add.length) return out;
  for (var nm in touched) { out.pools++; out.names[nm] = 1; }

  var sh = plan.sh;
  var at = Math.max(sh.getLastRow(), 1) + 1;
  if (sh.getMaxRows() < at + add.length - 1) {
    sh.insertRowsAfter(sh.getMaxRows(), at + add.length - 1 - sh.getMaxRows());
  }
  sh.getRange(at, 1, add.length, ADPLAN_HEADER.length).setValues(add);
  // 16자리 ID 는 숫자로 두면 끝자리가 깎인다 (2026-09-10 에 실제로 깎였다)
  sh.getRange(at, AP_CID, add.length, 1).setNumberFormat('@');
  sh.getRange(at, AP_GID, add.length, 1).setNumberFormat('@');
  sh.getRange(at, AP_ADIDS, add.length, 1).setNumberFormat('@');

  return out;
}

/**
 * 아직 안 만들어진 트랙 N 줄의 [승인] 을 켠다.
 *
 * [신규 · 모드] 가 자동운영이면 그것이 곧 돈의 승인이다 — 계획 표에서 한 번 더
 * 체크하게 하지 않는다 (트랙 B 도 같은 규칙이다). 그만둔 줄은 건드리지 않는다 —
 * 사람이 [결과] 를 비워야 다시 시도한다.
 * @return {number} 켠 줄 수
 */
function naApprovePending_(plan) {
  var n = 0;
  for (var i = 0; i < plan.rows.length; i++) {
    var r = plan.rows[i];
    if (r.ok || r.v[AP_APPROVE - 1] === true) continue;
    if (adIsGivenUp_(r.res)) continue;
    plan.sh.getRange(r.at, AP_APPROVE).setValue(true);
    r.v[AP_APPROVE - 1] = true;
    n++;
  }
  return n;
}

/** 왜 기다리는지 그 줄에 적는다. 배분·상태를 바꾸지만 값은 손대지 않는다 */
function naSetWait_(rows, c, alloc, state, why, today) {
  var r = rows[c.i];
  if (String(r[NA_I_ALLOC]) === alloc && String(r[NA_I_WHY]) === why) return;
  r[NA_I_ALLOC] = alloc;
  r[NA_I_STATE] = state;
  r[NA_I_WHY] = why;
  r[NA_I_NEXT] = today;
}

/**
 * 풀 캠페인의 일예산을 **실제로 만들어진 그룹** 에 맞춘다.
 *
 * 계획에 넣은 스물 줄 가운데 몇이 실패할 수 있다 (자격·이름 충돌). 계획한 수로 예산을
 * 잡아 두면 살아남은 한 그룹이 스물치 예산을 하루에 태운다. 그래서 exec 뒤에, 성공해
 * gid 를 받은 줄만 세어 올린다.
 *
 * 올린 값은 그 줄들의 [일예산] 칸에 되적는다 — 다음 바퀴에 "이미 이만큼 올렸다" 를 알아
 * 같은 PUT 을 되풀이하지 않게. 내리지는 않는다 (사람이 손으로 올려 둔 것을 깎지 않는다).
 * @param {Object} plan naPlanRead_() 결과 (exec 뒤에 다시 읽은 것)
 * @return {number} 바꾼 캠페인 수
 */
function naPoolBudgetSync_(plan) {
  var pools = {};
  for (var i = 0; i < plan.rows.length; i++) {
    var r = plan.rows[i];
    if (!r.cid) continue;                                     // 아직 캠페인이 없는 줄은 만들 때 정한다
    var p = pools[r.cid] || (pools[r.cid] = { name: r.name, bids: [], have: 0, rows: [] });
    // 보낸 값은 이 풀의 모든 줄에 되적혀 있다 — 실패한 줄의 값도 아마존에 갔을 수 있다
    p.have = Math.max(p.have, Number(r.v[AP_DAILY - 1]) || 0);
    p.rows.push(r);
    if (r.ok && r.gid) p.bids.push(Number(r.v[AP_BID - 1]) || 0);   // 실제로 만들어진 그룹만 센다
  }
  var token = null, n = 0;
  for (var cid in pools) {
    var q = pools[cid];
    var want = naBudgetFor_(q.bids);
    // 올리기도 내리기도 한다. 내리는 쪽이 중요하다 — 스물 줄을 계획했다가 열아홉이 실패하면
    // 살아남은 한 그룹이 스물치 예산을 하루에 태운다 (2026-09-12 에 실제로 그렇게 됐다).
    // 사람이 손으로 올려 둔 값을 깎는 걱정은 없다: 이 값은 우리가 보낸 값과만 견준다
    if (want === q.have) continue;
    if (!token) { try { token = adsToken_(); } catch (e) { return n; } }
    try {
      var res = adsApiRetry_(token, 'put', '/sp/campaigns',
        { campaigns: [{ campaignId: String(cid), budget: { budget: want, budgetType: 'DAILY' } }] },
        ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
      if (!adsCreated_(res, 'campaigns', 'campaignId').ok) {
        log_('newads', 'WARN', '풀 일예산 못 바꿨습니다 ' + q.name); continue;
      }
      n++;
      for (var k = 0; k < q.rows.length; k++) {
        q.rows[k].v[AP_DAILY - 1] = want;
        plan.sh.getRange(q.rows[k].at, AP_DAILY).setValue(want);
      }
      log_('newads', 'INFO', '풀 일예산 ' + q.name + ' ' + fmtYen_(q.have) +
           (want > q.have ? ' ↑ ' : ' ↓ ') + fmtYen_(want) +
           ' (만들어진 그룹 ' + q.bids.length + ' / 계획 ' + q.rows.length + ')');
    } catch (e2) {
      log_('newads', 'WARN', '풀 일예산 못 바꿨습니다 ' + q.name + ': ' + String(e2).substring(0, 120));
    }
  }
  return n;
}

/** 두 표를 한 번에 저장한다 */
function naSaveBoth_(ish, rows, fsh, fams) {
  if (rows.length) ish.getRange(2, 1, rows.length, NA_ITEM_HEADER.length).setValues(rows);
  if (fams.length) fsh.getRange(2, 1, fams.length, NA_FAM_HEADER.length).setValues(fams);
}
