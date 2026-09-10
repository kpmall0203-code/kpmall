/**
 * 72AG_광고시작.gs — 앞에 있는 단추는 둘뿐이다: ① 후보 찾기·확인 → ② 시작
 *
 * ── 왜 둘뿐인가 ─────────────────────────────────────────
 * 사람이 정할 것은 "무엇을 승인하나" 하나다. 멈추기·증액 시험·감액·대조군 등록·
 * 되돌리기·판정·채택·다음 계단은 전부 그 승인에서 당연히 따라오는 일이라 사람에게
 * 다시 묻지 않는다. 트랙 B 와 같은 생각이다 — 자동으로 돌린다고 정한 순간
 * 그 다음 걸음들은 정해진 것이다.
 *
 * ── ② 시작이 하는 일 (순서대로) ─────────────────────────
 *   1. 승인 ✓ 인 [멈춤] 줄 — 그 상품의 광고를 멈춘다 (캠페인·그룹은 그대로)
 *   2. 승인 ✓ 인 [감액] 줄 — 입찰을 목표 쪽으로 한 계단 내린다 (시험 불필요)
 *   3. 승인 ✓ 인 [증액 시험] 줄과 [대조군] 줄 — 확대시험 표에 줄을 세우고 시험군만 값을 올린다
 *   4. 승인 ✓ 인 [분리 필요] 줄 — 목표 클릭비용이 비슷한 것끼리 가격선 캠페인으로 꺼낸다 (승격)
 *   5. 매일·매주 도는 걸음을 건다 (되돌림 · 판정 · 채택 · 다음 계단 · 자료 갱신 · 후보 다시 세우기)
 * 돈이 나가는 것은 1~3 뿐이고, 그것도 이 표의 [승인] 이 켜진 줄만이다.
 * 증액은 여기에 더해 광고기준의 한도 넷과 [확대 · 모드] 가 자동운영이라야 나간다.
 */

/** 메뉴 ②: 시작 */
function startAdActions() {
  if (!adBusyGuard_('② 시작')) return;
  var sh = ss_().getSheetByName(SHEET_EXPAND);
  if (!sh || sh.getLastRow() < 2) {
    ui_().alert('② 시작', '[① 후보 찾기·확인] 을 먼저 하세요.', ui_().ButtonSet.OK);
    return;
  }
  var width = Math.max(sh.getLastColumn(), EXPAND_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  var pol = adExpandPolicy_();

  // ① 무엇을 보낼지 먼저 센다 — 사람이 마지막으로 한 번 본다
  var plan = { stop: [], down: [], test: [], ctrl: [], split: [] };
  for (var i = 0; i < v.length; i++) {
    if (!adRowApproved_(v[i][EX_APPROVE])) continue;
    var ex = adExec_(v[i][EX_EXEC]);
    if (!ex) continue;
    if (ex.k === 'stop') plan.stop.push({ i: i, ex: ex });
    else if (ex.k === 'down') plan.down.push({ i: i, ex: ex });
    else if (ex.k === 'test') plan.test.push({ i: i, ex: ex });
    else if (ex.k === 'ctrl') plan.ctrl.push({ i: i, ex: ex });
    else if (ex.k === 'split') plan.split.push({ i: i, ex: ex });
  }
  var nAll = plan.stop.length + plan.down.length + plan.test.length + plan.split.length;
  if (!nAll && !plan.ctrl.length) {
    ui_().alert('② 시작', '[승인] 이 켜진 줄이 없습니다.\n' +
      '[판정] 과 [바꿀 것] 을 보고 [승인] 을 켠 뒤 다시 누르세요.', ui_().ButtonSet.OK);
    return;
  }
  var lines = [];
  if (plan.stop.length) lines.push('· 멈춤 ' + plan.stop.length + '개 (그 상품의 광고만)');
  if (plan.down.length) lines.push('· 감액 ' + plan.down.length + '개 (바로 내림)');
  if (plan.test.length) {
    lines.push('· 증액 시험 ' + plan.test.length + '개' +
      (pol.canAuto ? ' (' + pol.runDays + '일 뒤 자동 되돌림)' : ' — ⚠ ' + adExpandGateText_(pol).trim().split('\n')[0]));
  }
  if (plan.ctrl.length) lines.push('· 대조군 등록 ' + plan.ctrl.length + '개 (바꾸지 않음)');
  var pre = null;
  if (plan.split.length) {
    // 승격은 이 프로그램에서 가장 큰 돈이 걸린 걸음이다. 주간 지출한도를 비워 두면
    // 막는 것이 이 확인창뿐이라, 얼마가 걸리는지 여기서 먼저 셈해 보여 준다 (표는 안 건드린다).
    var want0 = {};
    for (var s5 = 0; s5 < plan.split.length; s5++) want0[String(v[plan.split[s5].i][EX_SKU])] = true;
    try { pre = planAdPromoteBands({ skus: want0, dry: true }); } catch (e0) { pre = null; }
    lines.push('· 승격(가격선 캠페인으로 꺼내기) ' + plan.split.length + '개' +
      (pre && pre.rows
        ? ' → 캠페인 ' + pre.rows + '개 · 하루 예산 합계 ' + fmtYen_(pre.daily) +
          ' · 한 주에 더 쓸 것으로 보는 돈 ' + fmtYen_(pre.week) +
          (pre.arms && pre.arms.ctrl
            ? '\n     반반 시험: 값 그대로 ' + pre.arms.ctrl + '개 · 첫 배수 ' + pre.arms.test + '개 (30일 뒤 판정)'
            : '')
        : pre && pre.blocked ? ' — ⚠ ' + pre.blocked : ''));
  }
  var ok = ui_().alert('② 시작',
    lines.join('\n') + '\n\n' +
    '보낸 뒤에는 되돌림 · 판정 · 채택 · 다음 계단 · 자료 갱신이 저절로 돕니다.\n' +
    '결과는 이 표의 [결과] 칸과 ' + SHEET_ADLOG + ' 에 남습니다.\n\n보낼까요?',
    ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  var token = adsToken_(), logBuf = adLogBuffer_(20), today = ymd_(new Date());
  var done = { stop: 0, down: 0, test: 0, ctrl: 0, split: 0 }, failed = 0;
  var promo = null, st2 = null;

  // ② 멈춤
  for (var s0 = 0; s0 < plan.stop.length; s0++) {
    var ps = plan.stop[s0], r = v[ps.i];
    var bad = adPauseAds_(token, ps.ex.ids);
    if (bad) { failed++; r[EX_RESULT] = '멈춤 실패 — ' + bad; continue; }
    done.stop++;
    r[EX_RESULT] = '멈춤 ' + ps.ex.ids.length + '개 · ' + today;
    logBuf.push([adLogRow_({ kind: '상품', camp: ps.ex.camp || '', sku: String(r[EX_SKU]), item: '상태',
      from: 'ENABLED', to: 'PAUSED', why: String(r[EX_ACT]) + ' — ' + String(r[EX_WHY_]) , by: '승인' })]);
  }
  // ③ 감액
  for (var d0 = 0; d0 < plan.down.length; d0++) {
    var pd = plan.down[d0], rd = v[pd.i];
    try {
      var res = adJobSend_(token, '입찰변경', '광고그룹', String(pd.ex.rid), Number(pd.ex.to));
      if (!res.ok) throw new Error(res.msg || '실패');
      done.down++;
      rd[EX_RESULT] = '감액 ¥' + pd.ex.from + ' → ¥' + pd.ex.to + ' · ' + today;
      logBuf.push([adLogRow_({ kind: '광고그룹', camp: pd.ex.rname || '', sku: String(rd[EX_SKU]),
        item: '입찰변경', from: pd.ex.from, to: pd.ex.to, why: '목표보다 높아 한 계단 내림 (감액 승인)',
        by: '승인', gid: String(pd.ex.rid) })]);
    } catch (e) { failed++; rd[EX_RESULT] = '감액 실패 — ' + adErrorText_(String(e).substring(0, 120)); }
  }
  logBuf.flush();

  // ④ 증액 시험 · 대조군 — 시험 표에 줄을 세우고(승인을 넘겨서) 시험군만 올린다
  if (plan.test.length || plan.ctrl.length) {
    var want = {};
    for (var t0 = 0; t0 < plan.test.length; t0++) want[String(v[plan.test[t0].i][EX_SKU])] = true;
    for (var c0 = 0; c0 < plan.ctrl.length; c0++) want[String(v[plan.ctrl[c0].i][EX_SKU])] = true;
    adExpandPlanFromFront_(want);
    var st = pol.canAuto ? adExpandStartApproved_() : { done: 0, failed: 0, blocked: adExpandGateText_(pol).trim() };
    st2 = st;
    done.test = st.done; failed += st.failed; done.ctrl = st.ctrl || 0;
    for (var t1 = 0; t1 < plan.test.length; t1++) {
      v[plan.test[t1].i][EX_RESULT] = st.blocked
        ? '시험 계획만 세움 — ' + st.blocked.split('\n')[0]
        : '시험 시작 ' + today + ' (' + SHEET_EXTEST + ' 참고)' +
          (st.left ? ' · 일부는 다음 걸음이 이어서' : '');
    }
    for (var c1 = 0; c1 < plan.ctrl.length; c1++) v[plan.ctrl[c1].i][EX_RESULT] = '대조군 등록 ' + today;
  }
  // ⑤ 승격 — 목표 클릭비용이 비슷한 것끼리 가격선 캠페인으로. 만드는 것은 72J 가 한다
  if (plan.split.length) {
    var want2 = {};
    for (var s3 = 0; s3 < plan.split.length; s3++) want2[String(v[plan.split[s3].i][EX_SKU])] = true;
    promo = planAdPromoteBands({ skus: want2 });
    for (var s4 = 0; s4 < plan.split.length; s4++) {
      v[plan.split[s4].i][EX_RESULT] = promo.blocked
        ? '승격 못 함 — ' + promo.blocked
        : '승격 계획 ' + today + ' (' + SHEET_ADPLAN + ' 참고)';
    }
    done.split = promo.blocked ? 0 : promo.skus;
  }
  sh.getRange(2, 1, v.length, width).setValues(v);
  var reg = null;
  if (promo && promo.rows) {
    try { adPlanExecStep_(false); } catch (e5) { log_('ads', 'WARN', '승격 만들기: ' + e5); }
    // 두 편이 다 만들어졌으면 바로 시험 표에 올린다 (덜 만들어졌으면 매일 주기가 이어서 올린다)
    try { reg = adPromoteRegister_(); } catch (e6) { log_('ads', 'WARN', '승격 등록: ' + e6); }
  }

  // ⑥ 걸음을 건다 (이미 걸려 있으면 다시 건다 — 곱절이 되지 않는다)
  var nTrig = adInstallAutomations_();

  log_('ads', 'INFO', '② 시작 — 멈춤 ' + done.stop + ' · 감액 ' + done.down + ' · 시험 ' + done.test +
       ' · 대조군 ' + done.ctrl + (failed ? ' · 실패 ' + failed : ''));
  ui_().alert('② 시작',
    '멈춤 ' + done.stop + ' · 감액 ' + done.down + ' · 증액 시험 ' + done.test + ' · 대조군 ' + done.ctrl +
    (done.split ? ' · 승격 ' + done.split : '') + (failed ? ' · 실패 ' + failed : '') + '\n' +
    (promo && promo.rows
      ? '가격선 캠페인 ' + promo.rows + '개를 만드는 중입니다 (하루 예산 합계 ' + fmtYen_(promo.daily) + ').\n' +
        '  ' + Object.keys(promo.bands).map(function (b) { return '¥' + b + ' 선 ' + promo.bands[b] + '개'; }).join(' · ') +
        (promo.over ? '\n  주간 한도에 걸려 미룬 것 ' + promo.over + '개 — 다음에 다시 계획됩니다' : '') +
        (promo.arms && promo.arms.ctrl
          ? '\n  반반 시험 — 값 그대로 ' + promo.arms.ctrl + '개 · 첫 배수 ' + promo.arms.test + '개' +
            (reg && (reg.test || reg.ctrl)
              ? ' (시험 표에 올림 ' + (reg.test + reg.ctrl) + '줄)'
              : ' (다 만들어지면 매일 주기가 시험 표에 올립니다)')
          : '') + '\n'
      : '') + '\n' +
    (st2 && st2.left ? '시간이 다 돼 못 보낸 시험 ' + st2.left + '개는 [확대 시험 주기](매일)가 이어서 시작합니다.\n' : '') +
    '걸음 ' + nTrig + '개가 걸렸습니다 — 되돌림·판정·채택·다음 계단·자료 갱신·후보 다시 세우기.\n' +
    '이제 사람이 할 일은 가끔 [① 후보 찾기·확인] 을 열어 새 줄의 [승인] 을 켜는 것뿐입니다.\n\n' +
    '어디까지 갔는지는 [📊 광고 운영 현황] 과 ' + SHEET_EXTEST + ' 의 [상태] 에 있습니다.',
    ui_().ButtonSet.OK);
}

var EX_WHY_ = 21;      // 사유 칸 (72AB 의 순서와 같다)

/** 실행자료 칸을 읽는다 — 사람이 손댔거나 비어 있으면 null */
function adExec_(cell) {
  try { var o = JSON.parse(String(cell || '')); return o && o.k ? o : null; } catch (e) { return null; }
}

/** 상품광고를 멈춘다. @return {string} '' 이면 성공 */
function adPauseAds_(token, ids) {
  for (var b = 0; b < ids.length; b += ADSTOP_BATCH) {
    var part = ids.slice(b, b + ADSTOP_BATCH);
    try {
      var r = adsApiRetry_(token, 'put', '/sp/productAds',
        { productAds: part.map(function (x) { return { adId: x, state: 'PAUSED' }; }) },
        ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
      var rr = adsCreated_(r, 'productAds', 'adId');
      if (!rr.ok && !/entityStateConflict/i.test(rr.msg || '')) return adErrorText_(rr.msg || '실패');
    } catch (e) { return adErrorText_(String(e).substring(0, 120)); }
  }
  return '';
}

/**
 * 앞 표에서 승인한 SKU 만으로 시험 표를 세운다 (계획 줄에 승인을 넘긴다).
 * 시험 표의 나머지(돌고 있는 것 · 지난 기록)는 그대로 둔다.
 */
function adExpandPlanFromFront_(want) {
  var made = makeOneSheet_([{ name: SHEET_EXTEST, header: EXTEST_HEADER }]);
  var csh = ss_().getSheetByName(SHEET_EXPAND);
  var pc = adExpandPlanCtx_();
  var cand = adExpandCandRows_(csh).filter(function (c) { return want[c.sku]; });
  var rows = [], nCtrl = 0;
  for (var i = 0; i < cand.length; i++) {
    var o = adExpandPlanOne_(cand[i], pc);
    if (o.skip) continue;
    if (o.state === XS_RUN) nCtrl++;
    rows.push(adExpandTestRow_(cand[i], o, o.state, pc, o.state === XS_PLAN));
  }
  rows = pc.live.concat(rows);
  var sh = ss_().getSheetByName(SHEET_EXTEST);
  writeTable_(sh, EXTEST_HEADER, rows);
  if (rows.length) sh.getRange(2, EXTEST_APPROVE_COL, rows.length, 1).insertCheckboxes();
  adExpandTestNotes_(sh);
  return { rows: rows.length, ctrl: nCtrl };
}

/** 광고 걸음을 전부 건다 (트랙 B 의 ③ 과 같은 것을 부른다). @return {number} 건 수 */
function adInstallAutomations_() {
  var n = 0;
  for (var t = 0; t < AD_AUTOMATIONS.length; t++) adSchedDrop_(AD_AUTOMATIONS[t].handler);
  for (var u = 0; u < AD_AUTOMATIONS.length; u++) {
    var au = AD_AUTOMATIONS[u];
    if (au.weekly) {
      ScriptApp.newTrigger(au.handler).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(au.hour).create();
    } else {
      ScriptApp.newTrigger(au.handler).timeBased().atHour(au.hour).everyDays(1).create();
    }
    n++;
  }
  return n;
}
