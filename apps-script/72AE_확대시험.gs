/**
 * 72AE_확대시험.gs — 더 사 보는 시험을 계획하고, 돌리고, 되돌린다 (기획서 4·5·7장)
 *
 * ── 왜 '시험' 인가 ──────────────────────────────────────
 * 입찰을 올리면 광고매출은 거의 언제나 는다. 그런데 그것이 이익이 늘었다는 뜻은
 * 아니다 — 원래 그냥 팔릴 것을 광고로 사 온 것일 수도 있고, 그 주가 좋았을 수도 있다.
 * 그래서 올리는 것을 '결정' 이 아니라 '시험' 으로 다룬다.
 *
 *   기준 14일 → 올린 값으로 14일 → 원래 값으로 되돌림 → 성숙 16일 대기 → 판정
 *
 * 되돌리는 것이 핵심이다. 되돌리지 않으면 다음 시험의 기준이 오염되고,
 * "그래서 지금 얼마를 부르고 있는가" 를 아무도 모르게 된다. 계속 올린 값으로
 * 두는 것은 판정이 '확대유지' 로 나온 뒤에 따로 정하는 일이다.
 *
 * ── 대조군 ──────────────────────────────────────────────
 * 적격 상품군의 20%는 일부러 안 바꾸고 둔다. 그 20%가 같은 기간에 얼마나 변했는지를
 * 빼야 "올려서 늘었다" 를 말할 수 있다. 배정은 상품군키(ASIN)와 씨앗으로 정해
 * 언제 다시 계산해도 같게 나온다.
 *
 * ── 여기서 돈이 나가는 자리 ─────────────────────────────
 * 계획 세우기는 아무것도 바꾸지 않는다. 실제로 값을 올리는 것은
 * [③ 승인분 시험 시작] 하나뿐이고, 그것도
 *   · 광고기준의 돈 관련 넷(동시 시험 수 · 주간 지출한도 · 손실한도 · 최대 입찰)이 차 있고
 *   · [확대 · 모드] 가 자동운영이며
 *   · 그 줄의 [승인] 이 켜져 있을 때만
 * 나간다. 되돌리기와 보호중단은 값을 내리는 방향이라 사람을 기다리지 않는다.
 */

var SHEET_EXTEST = '광고확대시험';
var EXTEST_HEADER = [
  '시험ID', '만든날', 'SKU', 'ASIN', '상품군키', '배정', '증액유형',
  '자원종류', '자원ID', '자원이름',
  '시험전값', '시험값', '목표상한', '기준시작', '기준종료',
  '운영시작', '운영종료', '복원일', '성숙예정일',
  '예약액(JPY)', '상태', '승인', '결과', '사유'
];
var XT_ID = 0, XT_MADE = 1, XT_SKU = 2, XT_ASIN = 3, XT_FAM = 4, XT_ARM = 5, XT_TYPE = 6,
    XT_RKIND = 7, XT_RID = 8, XT_RNAME = 9, XT_FROM = 10, XT_TO = 11, XT_CAP = 12,
    XT_BFROM = 13, XT_BTO = 14, XT_RUNFROM = 15, XT_RUNTO = 16, XT_BACK = 17, XT_MATURE = 18,
    XT_HOLD = 19, XT_STATE = 20, XT_APPROVE = 21, XT_RESULT = 22, XT_WHY = 23;
var EXTEST_APPROVE_COL = 22, EXTEST_ID_COLS = [9];

/** 배정 */
var XARM_TEST = '시험군';
var XARM_CTRL = '대조군';

/** 증액 유형 (기획서 4.2) */
var XTYPE_BID = '입찰';
var XTYPE_BUDGET = '예산';
var XTYPE_SPLIT = '구조준비';

/** 상태 (기획서 7.1) */
var XS_PLAN = '계획';
var XS_WAIT = '대기';            // 한도·용량에 걸려 아직 못 시작
var XS_RUN = '시험중';
var XS_MATURE = '성숙대기';
var XS_DONE = '평가완료';
var XS_GUARD = '보호중단';
var XS_CANCEL = '취소';

/** 사유 코드 (기획서 7.3) */
var XR_SPLIT = 'MIXED_GROUP_REQUIRES_SPLIT';
var XR_NOROOM = 'NO_SPEND_HEADROOM';
var XR_BIDOK = 'BID_TEST_ELIGIBLE';
var XR_BUDGET = 'BUDGET_CONSTRAINED';
var XR_LOWEV = 'LOW_EVIDENCE';
var XR_MARGIN = 'MARGIN_INVALID';

var EXTEST_BUDGET_DAYS = 7;      // 예산 제약 신호를 며칠에서 볼까
var EXTEST_BUDGET_HITS = 3;      // 그중 며칠이 90% 를 넘으면 '예산제약의심'
var EXTEST_BUDGET_FULL = 0.9;
var EXTEST_MIN_BID = 2;          // 아마존 최소 입찰
var EXPAND_MODE_AUTO = '자동운영';

/** 광고기준에서 확대 설정만 뽑는다 */
function adExpandPolicy_() {
  var b = adBasis_();
  var num = function (k, d) { var v = Number(b['확대 · ' + k]); return isFinite(v) && v > 0 ? v : d; };
  var money = function (k) { var v = Number(b['확대 · ' + k]); return isFinite(v) && v > 0 ? v : 0; };
  var p = {
    mode: String(b['확대 · 모드'] || '모의운영').trim(),
    step: num('1회 인상폭', 0.10),
    keep: num('이익보존계수', 0.65),
    baseDays: Math.round(num('기준기간(일)', 14)),
    runDays: Math.round(num('운영기간(일)', 14)),
    holdout: num('대조군 비율', 0.20),
    seed: Math.round(num('대조군 seed', 20260908)),
    minFam: Math.round(num('최소 상품군 수', 30)),
    boot: Math.round(num('부트스트랩 횟수', 1000)),
    level: num('구간 수준', 0.90),
    minGain: Number(b['확대 · 최소 유의미 이익(JPY/상품군/일)']),
    maxConcurrent: money('최대 동시 시험 수'),
    weekSpend: money('시험 주간 지출한도(JPY)'),
    lossCap: money('시험 손실한도(JPY)'),
    maxBid: money('최대 유효입찰(JPY)'),
    cooldown: Math.round(num('실패 냉각기간(일)', 28))
  };
  p.need = [];
  if (!p.maxConcurrent) p.need.push('최대 동시 시험 수');
  if (!p.weekSpend) p.need.push('시험 주간 지출한도(JPY)');
  if (!p.lossCap) p.need.push('시험 손실한도(JPY)');
  if (!p.maxBid) p.need.push('최대 유효입찰(JPY)');
  p.ready = !p.need.length;
  p.canAuto = p.ready && p.mode === EXPAND_MODE_AUTO;
  return p;
}

/**
 * 대조군인가 — 상품군키와 씨앗만으로 정한다.
 * 같은 씨앗이면 언제 다시 계산해도 같은 답이 나온다 (기획서 5.3).
 */
function adExpandIsControl_(famKey, pol) {
  var s = String(famKey) + '|' + pol.seed, h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return (h % 1000) < Math.round(pol.holdout * 1000);
}

/**
 * 메뉴 ①: 시험 계획 세우기.
 * 아마존을 건드리지 않는다 — 무엇을 얼마에서 얼마로 바꿀 것인지만 적는다 (기획서 7.2).
 */
function planAdExpandTests() {
  var made = makeOneSheet_([{ name: SHEET_EXTEST, header: EXTEST_HEADER }]);
  if (madeSheetStop_(made, '확대 시험 계획')) return;

  var csh = ss_().getSheetByName(SHEET_EXPAND);
  if (!csh || csh.getLastRow() < 2) {
    ui_().alert('확대 후보가 없습니다',
      '[📈 확대 후보] 를 먼저 만드세요.', ui_().ButtonSet.OK);
    return;
  }
  var pol = adExpandPolicy_();
  var sh = ss_().getSheetByName(SHEET_EXTEST);
  var width = Math.max(sh.getLastColumn(), EXTEST_HEADER.length);
  var old = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues() : [];

  /**
   * 이미 '돌고 있는' 시험만 막는다 (기획서 7.2 — 평가 중인 상품에 새 계획 금지).
   *
   * 아직 안 나간 줄(계획·대기)까지 막으면 다시 계획할 때 제 계획에 제가 막혀
   * 표가 텅 빈다. 그 줄들은 다시 세우되, 사람이 켜 둔 [승인] 은 살린다.
   * 끝난 시험은 냉각기간 동안 다시 만들지 않는다.
   */
  var busy = {}, nOpen = 0, cool = {}, keepOk = {}, live = [];
  var today = ymd_(new Date());
  for (var o = 0; o < old.length; o++) {
    var st = String(old[o][XT_STATE] || '');
    var sk = String(old[o][XT_SKU] || '').trim();
    if (!sk) continue;
    if (st === XS_RUN || st === XS_MATURE) { busy[sk] = st; nOpen++; live.push(old[o].slice(0, EXTEST_HEADER.length)); }
    else if (st === XS_DONE || st === XS_GUARD || st === XS_CANCEL) {
      live.push(old[o].slice(0, EXTEST_HEADER.length));      // 지난 기록은 지우지 않는다
      var back = String(old[o][XT_BACK] || '').substring(0, 10);
      if ((st === XS_DONE || st === XS_GUARD) && back && daysBetween_(back, today) < pol.cooldown) {
        cool[sk] = back;
      }
    } else if (adRowApproved_(old[o][XT_APPROVE])) {
      keepOk[sk] = true;                                     // 계획·대기 줄의 승인은 살린다
    }
  }

  var cand = adExpandCandRows_(csh);
  var units = adUnitMap_();
  var grp = adExpandGroupIndex_();
  var burn = adExpandBudgetSignal_();
  var rows = [], cnt = {}, nCtrl = 0, hold = 0;
  var running = nOpen;

  for (var i = 0; i < cand.length; i++) {
    var c = cand[i];
    if (busy[c.sku]) { cnt['이미 진행 중'] = (cnt['이미 진행 중'] || 0) + 1; continue; }
    if (cool[c.sku]) { cnt['냉각기간'] = (cnt['냉각기간'] || 0) + 1; continue; }

    var fam = c.asin || c.sku;
    var arm = adExpandIsControl_(fam, pol) ? XARM_CTRL : XARM_TEST;

    // 자원 찾기 — 그 SKU 만 값을 부를 수 있는 자리가 있는가 (기획서 4.2 · 6장)
    var res = adExpandResource_(c.sku, units, grp);
    var type, why, from = 0, to = 0, cap = 0, state, hold0 = 0;
    if (!res.own) {
      type = XTYPE_SPLIT; state = XS_WAIT;
      why = XR_SPLIT + ' — ' + (res.why || '이 SKU 만 값을 부를 자리가 없습니다') +
            '. 몰아넣기 그룹의 입찰은 그 그룹의 모든 상품에 함께 걸리므로, ' +
            '먼저 이 상품을 제 캠페인으로 분리해야 시험할 수 있습니다';
    } else {
      // 목표 상한 = 주문당 공헌이익 × 판단주문율 × 이익보존계수 (기획서 4.3)
      cap = Math.min(c.G * c.q * pol.keep, pol.maxBid || Infinity);
      var bud = burn[res.cid] || { hits: 0, days: 0 };
      if (bud.hits >= EXTEST_BUDGET_HITS) {
        // 예산이 막혀 있으면 입찰을 올려도 살 수 없다 — 예산 쪽을 시험한다
        type = XTYPE_BUDGET;
        from = res.budget;
        to = Math.floor(from * (1 + pol.step));      // 일예산은 정수 엔
        why = XR_BUDGET + ' — 최근 ' + EXTEST_BUDGET_DAYS + '일 중 ' + bud.hits +
              '일 일예산의 ' + Math.round(EXTEST_BUDGET_FULL * 100) + '% 이상을 썼습니다. ' +
              '입찰은 그대로 두고 예산만 ' + Math.round(pol.step * 100) + '% 올려 봅니다';
      } else {
        type = XTYPE_BID;
        from = res.bid;
        // 입찰은 0.01 단위다 (아마존이 실제로 그렇게 준다 — 예: 기본입찰 162.71).
        // 1엔 단위로 내리면 ¥5 짜리는 10% 를 올려도 ¥5 라 시험 자체가 성립하지 않는다.
        to = Math.floor(Math.min(from * (1 + pol.step), cap) * 100) / 100;
        why = XR_BIDOK + ' — 예산은 남는데(최근 ' + EXTEST_BUDGET_DAYS + '일 중 ' + bud.hits +
              '일만 소진) 값이 목표(¥' + (Math.round(cap * 10) / 10) + ') 보다 낮습니다. ' +
              '값을 ' + Math.round(pol.step * 100) + '% 올려 더 살 수 있는지 봅니다';
      }
      if (!(from > 0)) {
        state = XS_WAIT; type = XTYPE_SPLIT;
        why = 'DATA_PARTIAL — 지금 값을 모릅니다 (광고 구조 수집을 먼저 하세요)';
      } else if (!(to > from)) {
        // 반올림 후 지금보다 커지지 않으면 무의미한 작업을 만들지 않는다 (기획서 4.3)
        state = XS_CANCEL;
        why = XR_NOROOM + ' — 올릴 자리가 없습니다 (지금 ¥' + from + ' · 상한 ¥' +
              (Math.round(cap * 10) / 10) + ')';
      } else {
        state = XS_PLAN;
        hold0 = Math.round(c.dailyCost * (1 + pol.step) * pol.runDays);   // 예약액
      }
    }
    if (arm === XARM_CTRL && state === XS_PLAN) {
      // 대조군은 바꾸지 않는다. 같은 기간을 견주려고 줄만 남긴다
      state = XS_RUN; to = from; hold0 = 0;
      why = '대조군 — 일부러 바꾸지 않습니다. 이 줄이 있어야 "올려서 늘었다" 를 말할 수 있습니다';
      nCtrl++;
    }
    if (state === XS_PLAN) {
      running++;
      if (pol.maxConcurrent && running > pol.maxConcurrent) {
        state = XS_WAIT;
        why = '동시 시험 수 상한(' + pol.maxConcurrent + '개)에 걸렸습니다 — 앞의 시험이 끝나면 다시 계획됩니다';
      } else {
        hold += hold0;
        if (pol.weekSpend && hold > pol.weekSpend) {
          state = XS_WAIT; hold -= hold0;
          why = '시험 주간 지출한도(' + fmtYen_(pol.weekSpend) + ')를 넘습니다 — 다음 차례로 미룹니다';
        }
      }
    }

    var runFrom = (state === XS_RUN) ? today : '';
    var runTo = (state === XS_RUN) ? addDays_(today, pol.runDays) : '';
    cnt[state + (state === XS_PLAN ? ' · ' + type : '')] =
      (cnt[state + (state === XS_PLAN ? ' · ' + type : '')] || 0) + 1;
    rows.push([
      'X' + fam + '|' + today, today, c.sku, c.asin, fam, arm, type,
      res.kind || '', res.rid || '', res.rname || '',
      from || '', to || '', cap ? Math.round(cap * 100) / 100 : '',
      addDays_(today, -pol.baseDays), addDays_(today, -1),
      runFrom, runTo, '', '',
      hold0 || '', state, (state === XS_PLAN && keepOk[c.sku]) ? true : false, '', why
    ]);
  }

  rows = live.concat(rows);        // 돌고 있는 시험과 지난 기록을 먼저, 새 계획을 뒤에
  writeTable_(sh, EXTEST_HEADER, rows);
  sh.getRange(1, 1, 1, EXTEST_HEADER.length).setValues([EXTEST_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  if (rows.length) {
    for (var ic = 0; ic < EXTEST_ID_COLS.length; ic++) {
      sh.getRange(2, EXTEST_ID_COLS[ic], rows.length, 1).setNumberFormat('@');
    }
    sh.getRange(2, EXTEST_APPROVE_COL, rows.length, 1).insertCheckboxes();
  }
  adExpandTestNotes_(sh);
  showSheet_(SHEET_EXTEST);

  ui_().alert('확대 시험 계획',
    '줄 ' + rows.length + '개\n' +
    Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ') + '\n\n' +
    (pol.ready
      ? (pol.canAuto ? '' : '⚠ [확대 · 모드] 가 "' + pol.mode + '" 입니다 — 계획만 세우고 보내지 않습니다.\n' +
                            '   실제로 올리려면 광고기준에서 "' + EXPAND_MODE_AUTO + '" 으로 바꾸세요.\n\n')
      : '⚠ 광고기준에 아직 없는 값이 있어 시험을 시작할 수 없습니다:\n   ' +
        pol.need.join(' · ') + '\n   (돈이 걸린 값이라 프로그램이 지어내지 않습니다)\n\n') +
    '대조군 ' + nCtrl + '개는 일부러 바꾸지 않습니다.\n' +
    '여기서는 아무것도 바꾸지 않았습니다 — [승인] 을 켜고 [③ 승인분 시험 시작] 을 눌러야 나갑니다.',
    ui_().ButtonSet.OK);
}

/** 확대후보 표에서 '확대검토' 줄만 읽어 셈에 필요한 것만 뽑는다 */
function adExpandCandRows_(csh) {
  var map = hdrMap_(csh);
  var v = csh.getRange(2, 1, csh.getLastRow() - 1, Math.max(csh.getLastColumn(), 1)).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (String(cellOf_(v[i], map, '분류', '')) !== EXC_GROW) continue;
    var price = Number(cellOf_(v[i], map, '판매가(JPY)', 0)) || 0;
    var m = Number(cellOf_(v[i], map, '마진율(%)', 0)) || 0;
    var q = Number(cellOf_(v[i], map, '판단주문율(%)', 0)) / 100;
    var cost = Number(cellOf_(v[i], map, '광고비(JPY)', 0)) || 0;
    if (!(price > 0) || !(m > 0) || !(q > 0)) continue;
    out.push({
      sku: String(cellOf_(v[i], map, 'SKU', '')).trim(),
      asin: String(cellOf_(v[i], map, 'ASIN', '')).trim(),
      G: price * m / 100, q: q,
      room: Number(cellOf_(v[i], map, '여유배수', 0)) || 0,
      clicks: Number(cellOf_(v[i], map, '성숙클릭', 0)) || 0,
      dailyCost: cost / EXPAND_WINDOW_DAYS
    });
  }
  // 여유가 큰 것부터 (기획서 4.1 — 우선점수는 여유 × 근거 가중치)
  out.sort(function (a, b) {
    var pa = Math.max(0, a.room - 1) * (a.clicks / (a.clicks + EXPAND_PRIOR));
    var pb = Math.max(0, b.room - 1) * (b.clicks / (b.clicks + EXPAND_PRIOR));
    if (pb !== pa) return pb - pa;
    return a.sku < b.sku ? -1 : 1;
  });
  return out;
}

/** 광고그룹ID → {SKU수, 전용, 캠페인ID, 기본입찰, 이름, 일예산} */
function adExpandGroupIndex_() {
  var out = {};
  var gsh = ss_().getSheetByName(SHEET_ADGRP);
  if (gsh && gsh.getLastRow() > 1) {
    var v = gsh.getRange(2, 1, gsh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var gid = String(v[i][9] || '').trim();
      if (!gid) continue;
      out[gid] = { camp: String(v[i][0] || ''), type: String(v[i][1] || ''),
                   name: String(v[i][2] || ''), bid: Number(v[i][4]) || 0,
                   n: Number(v[i][5]) || 0, own: String(v[i][6]).trim() === 'O',
                   cid: String(v[i][8] || '').trim() };
    }
  }
  // 캠페인 일예산은 광고구조 표에 있다
  var ssh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (ssh && ssh.getLastRow() > 1) {
    var m2 = hdrMap_(ssh);
    var w = ssh.getRange(2, 1, ssh.getLastRow() - 1, Math.max(ssh.getLastColumn(), 1)).getValues();
    var bud = {};
    for (var j = 0; j < w.length; j++) {
      var cid = String(cellOf_(w[j], m2, '캠페인ID', '')).trim();
      if (cid && !bud[cid]) bud[cid] = Number(cellOf_(w[j], m2, '일예산(JPY)', 0)) || 0;
    }
    for (var g in out) out[g].budget = bud[out[g].cid] || 0;
  }
  return out;
}

/**
 * 이 SKU 만 값을 부를 수 있는 자리를 찾는다.
 *
 * 몰아넣기 그룹은 입찰 하나가 수천 상품에 함께 걸린다 — 거기서는 시험이 성립하지 않는다
 * (기획서 4.2 마지막 문단 · 9장 검증 6번).
 */
function adExpandResource_(sku, units, grp) {
  var u = units[sku];
  if (!u || !u.ads.length) return { own: false, why: '상품광고 목록에 없습니다' };
  var best = null;
  for (var i = 0; i < u.ads.length; i++) {
    var g = grp[u.ads[i].gid];
    if (!g || !g.own) continue;                       // 전용 그룹이 아니면 못 쓴다
    if (!best || g.n < best.n) best = g;
    if (best) { best.gid = u.ads[i].gid; }
  }
  if (!best) {
    return { own: false, why: '이 SKU 가 든 그룹이 모두 몰아넣기 그룹입니다 (' +
             u.ads.length + '개 광고)' };
  }
  return { own: true, kind: '광고그룹', rid: best.gid, rname: best.name,
           bid: best.bid, budget: best.budget || 0, cid: best.cid, n: best.n };
}

/**
 * 캠페인별 예산 소진 신호 — 최근 7일 중 며칠이나 일예산의 90% 를 넘겼나.
 * 이것만으로 예산 제약을 확정하지 않는다 (기획서 4.2).
 */
function adExpandBudgetSignal_() {
  var out = {};
  var led = null;
  try { led = adSpendRead_(); } catch (e) { return out; }
  if (!led || !led.rows) return out;
  var grp = adExpandGroupIndex_(), budget = {};
  for (var g in grp) if (grp[g].cid) budget[grp[g].cid] = grp[g].budget || 0;
  var to = ymd_(new Date()), from = addDays_(to, -(EXTEST_BUDGET_DAYS - 1));
  for (var i = 0; i < led.rows.length; i++) {
    var r = led.rows[i];
    if (r.d < from || r.d > to) continue;
    var b = budget[r.cid];
    if (!(b > 0)) continue;
    var o = out[r.cid] || (out[r.cid] = { hits: 0, days: 0 });
    o.days++;
    if (r.cost >= b * EXTEST_BUDGET_FULL) o.hits++;
  }
  return out;
}

/**
 * 메뉴 ③: 승인분 시험 시작 — 여기서만 값이 올라간다.
 */
function startAdExpandTests() {
  if (!adBusyGuard_('확대 시험 시작')) return;
  var pol = adExpandPolicy_();
  if (!pol.ready) {
    ui_().alert('아직 시작할 수 없습니다',
      '광고기준에 이 값들이 비어 있습니다:\n   ' + pol.need.join('\n   ') + '\n\n' +
      '돈이 걸린 값이라 프로그램이 지어내지 않습니다. 채우고 다시 누르세요.',
      ui_().ButtonSet.OK);
    return;
  }
  if (!pol.canAuto) {
    ui_().alert('모의운영입니다',
      '[확대 · 모드] 가 "' + pol.mode + '" 이라 아마존에 보내지 않습니다.\n' +
      '광고기준에서 "' + EXPAND_MODE_AUTO + '" 으로 바꾸면 승인한 줄이 나갑니다.',
      ui_().ButtonSet.OK);
    return;
  }
  var sh = getSheetOrThrow_(SHEET_EXTEST);
  if (sh.getLastRow() < 2) { ui_().alert('시험 계획이 비어 있습니다.'); return; }
  var width = Math.max(sh.getLastColumn(), EXTEST_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();

  var pick = [], hold = 0;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][XT_STATE]) !== XS_PLAN) continue;
    if (!adRowApproved_(v[i][XT_APPROVE])) continue;
    if (String(v[i][XT_ARM]) !== XARM_TEST) continue;
    if (!(Number(v[i][XT_TO]) > Number(v[i][XT_FROM]))) continue;
    pick.push(i); hold += Number(v[i][XT_HOLD]) || 0;
  }
  if (!pick.length) {
    ui_().alert('보낼 것이 없습니다',
      '[승인] 이 켜져 있고 상태가 "' + XS_PLAN + '" 인 시험군 줄만 나갑니다.', ui_().ButtonSet.OK);
    return;
  }
  var ok = ui_().alert('승인분 시험 시작',
    '시험 ' + pick.length + '개를 시작합니다.\n' +
    '예약액(운영 ' + pol.runDays + '일 예상 지출) 합계 ' + fmtYen_(hold) + '\n' +
    '주간 지출한도 ' + fmtYen_(pol.weekSpend) + ' · 손실한도 ' + fmtYen_(pol.lossCap) + '\n\n' +
    pol.runDays + '일 뒤 자동으로 원래 값으로 되돌립니다.\n' +
    '손실한도를 넘으면 기다리지 않고 즉시 되돌립니다.\n\n' +
    '보낼까요?', ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  var token = adsToken_(), logBuf = adLogBuffer_(20);
  var today = ymd_(new Date()), done = 0, failed = 0;
  for (var p = 0; p < pick.length; p++) {
    var r = v[pick[p]];
    var kind = String(r[XT_TYPE]) === XTYPE_BUDGET ? '캠페인' : '광고그룹';
    var act = String(r[XT_TYPE]) === XTYPE_BUDGET ? '예산변경' : '입찰변경';
    var tid = String(r[XT_RID]);
    try {
      var res = adJobSend_(token, act, kind, tid, Number(r[XT_TO]));
      if (!res.ok) throw new Error(res.msg || '실패');
      r[XT_STATE] = XS_RUN;
      r[XT_RUNFROM] = today;
      r[XT_RUNTO] = addDays_(today, pol.runDays);
      r[XT_RESULT] = '시작 ' + today + ' · ¥' + r[XT_FROM] + ' → ¥' + r[XT_TO];
      done++;
      logBuf.push([adLogRow_({ kind: '확대시험', camp: String(r[XT_RNAME]), sku: String(r[XT_SKU]),
        item: act, from: r[XT_FROM], to: r[XT_TO],
        why: '확대 시험 시작 (' + pol.runDays + '일 뒤 되돌림)', by: '승인',
        gid: kind === '광고그룹' ? tid : '', cid: kind === '캠페인' ? tid : '' })]);
    } catch (e) {
      failed++;
      r[XT_RESULT] = '실패 — ' + adErrorText_(String(e).substring(0, 120));
    }
  }
  logBuf.flush();
  sh.getRange(2, 1, v.length, width).setValues(v);
  log_('ads', 'INFO', '확대 시험 시작 — ' + done + '개' + (failed ? ' · 실패 ' + failed : ''));
  ui_().alert('확대 시험 시작',
    done + '개를 시작했습니다' + (failed ? ' · 실패 ' + failed + '개' : '') + '.\n\n' +
    '운영 ' + pol.runDays + '일 → 되돌림 → 성숙 ' +
    (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) + '일 대기 → 판정 순으로 저절로 갑니다.\n' +
    '[확대 시험] 표의 [상태] 와 [성숙예정일] 을 보시면 됩니다.',
    ui_().ButtonSet.OK);
}

/**
 * 매일 도는 걸음 — 되돌리기 · 보호중단 · 평가.
 *
 * 값을 내리는 방향이라 사람에게 묻지 않는다. 묻는 사이에 한도를 넘기면
 * 그 돈은 이미 나간 것이다.
 */
function adExpandCycle(opts) {
  var quiet = !!(opts && opts.quiet);
  var sh = ss_().getSheetByName(SHEET_EXTEST);
  if (!sh || sh.getLastRow() < 2) return '시험이 없습니다';
  var pol = adExpandPolicy_();
  var width = Math.max(sh.getLastColumn(), EXTEST_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  var today = ymd_(new Date());
  var token = null, logBuf = adLogBuffer_(20);
  var back = 0, guard = 0, evald = 0, dirty = false;

  // 지금까지의 시험 손실 — 한도를 넘으면 전부 되돌린다
  var loss = adExpandLossNow_(v);
  var over = pol.lossCap > 0 && loss > pol.lossCap;

  for (var i = 0; i < v.length; i++) {
    var st = String(v[i][XT_STATE]);
    if (st === XS_RUN && String(v[i][XT_ARM]) === XARM_TEST) {
      var due = String(v[i][XT_RUNTO] || '').substring(0, 10);
      var must = over || (due && today >= due);
      if (!must) continue;
      if (!token) token = adsToken_();
      var kind = String(v[i][XT_TYPE]) === XTYPE_BUDGET ? '캠페인' : '광고그룹';
      var act = String(v[i][XT_TYPE]) === XTYPE_BUDGET ? '예산변경' : '입찰변경';
      try {
        var res = adJobSend_(token, act, kind, String(v[i][XT_RID]), Number(v[i][XT_FROM]));
        if (!res.ok) throw new Error(res.msg || '실패');
        v[i][XT_BACK] = today;
        v[i][XT_MATURE] = addDays_(today, SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS);
        v[i][XT_STATE] = over ? XS_GUARD : XS_MATURE;
        v[i][XT_RESULT] = (over ? '손실한도 초과로 즉시 되돌림 ' : '운영 끝 · 되돌림 ') + today;
        if (over) { v[i][XT_WHY] = '시험 손실 ' + fmtYen_(loss) + ' 이 한도 ' +
                                   fmtYen_(pol.lossCap) + ' 을 넘었습니다'; guard++; }
        else back++;
        dirty = true;
        logBuf.push([adLogRow_({ kind: '확대시험', camp: String(v[i][XT_RNAME]),
          sku: String(v[i][XT_SKU]), item: act, from: v[i][XT_TO], to: v[i][XT_FROM],
          why: over ? '손실한도 초과 — 즉시 복원' : '운영 기간이 끝나 복원', by: '자동' })]);
      } catch (e) {
        v[i][XT_RESULT] = '복원 실패 — ' + adErrorText_(String(e).substring(0, 120));
        dirty = true;
      }
    } else if (st === XS_RUN && String(v[i][XT_ARM]) === XARM_CTRL) {
      var due2 = String(v[i][XT_RUNTO] || '').substring(0, 10);
      if (due2 && today >= due2) {                  // 대조군은 되돌릴 것이 없다
        v[i][XT_BACK] = today;
        v[i][XT_MATURE] = addDays_(today, SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS);
        v[i][XT_STATE] = XS_MATURE;
        dirty = true;
      }
    } else if (st === XS_MATURE) {
      var m = String(v[i][XT_MATURE] || '').substring(0, 10);
      if (m && today >= m) { v[i][XT_STATE] = XS_DONE; evald++; dirty = true; }
    }
  }
  logBuf.flush();
  if (dirty) sh.getRange(2, 1, v.length, width).setValues(v);

  var msg = '되돌림 ' + back + (guard ? ' · 보호중단 ' + guard : '') +
            (evald ? ' · 성숙 완료 ' + evald : '');
  if (evald) { try { msg += ' | ' + buildAdExpandResults({ quiet: true }); } catch (e2) {} }
  log_('ads', 'INFO', '확대 시험 주기 — ' + msg);
  if (!quiet) ui_().alert('확대 시험 주기', msg, ui_().ButtonSet.OK);
  return msg;
}

/** 지금까지 시험이 낸 손실 (광고비 − 광고귀속 공헌이익) */
function adExpandLossNow_(rows) {
  var perf = null;
  try { perf = adPerfWindow_(); } catch (e) { return 0; }
  if (!perf) return 0;
  var ctx = adMarginCtx_(), sum = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][XT_STATE]) !== XS_RUN) continue;
    if (String(rows[i][XT_ARM]) !== XARM_TEST) continue;
    var from = String(rows[i][XT_RUNFROM] || '').substring(0, 10);
    if (!from) continue;
    var a = perf(String(rows[i][XT_SKU]), from, ymd_(new Date()));
    if (!a || !a.cost) continue;
    var m = adMarginFor_(ctx, String(rows[i][XT_SKU]), a.od ? a.sales / a.od : 0, '', null);
    sum += a.cost - a.sales * m.pct / 100;
  }
  return Math.max(0, Math.round(sum));
}

function adExpandTestNotes_(sh) {
  headerNotes_(sh, 1, EXTEST_HEADER, {
    '배정': XARM_TEST + ' = 값을 올려 보는 쪽 · ' + XARM_CTRL + ' = 일부러 그대로 두는 쪽.\n' +
      '대조군이 없으면 "올려서 늘었다" 와 "그 주가 좋았다" 를 구별할 수 없습니다.\n' +
      '누가 대조군인지는 상품군키와 씨앗으로 정해져, 다시 계산해도 같습니다.',
    '증액유형': XTYPE_BID + ' = 예산은 남는데 값이 낮아 못 사는 것 같을 때\n' +
      XTYPE_BUDGET + ' = 값은 맞는데 예산이 먼저 떨어질 때 (입찰은 그대로)\n' +
      XTYPE_SPLIT + ' = 몰아넣기 그룹이라 이 상품만 값을 부를 수 없음 — 먼저 분리해야 합니다',
    '목표상한': '= 주문당 공헌이익 × 판단주문율 × 이익보존계수. 이 위로는 어떤 경우에도 안 올립니다.',
    '시험값': '한 번에 올리는 폭은 정책값(기본 10%)까지이고, 상한 이하 방향으로 내림합니다.\n' +
      '반올림해서 지금 값보다 커지지 않으면 아예 줄을 만들지 않습니다.',
    '성숙예정일': '되돌린 날 + ' + (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) + '일.\n' +
      '마지막 클릭의 주문이 다 붙어야 결과를 셀 수 있습니다.',
    '예약액(JPY)': '이 시험이 운영 기간에 더 쓸 것으로 보는 돈. 주간 지출한도에 함께 셉니다.',
    '상태': XS_PLAN + ' → ' + XS_RUN + ' → ' + XS_MATURE + ' → ' + XS_DONE + '\n' +
      XS_WAIT + ' = 한도·용량·구조 때문에 아직 · ' + XS_GUARD + ' = 손실한도를 넘겨 즉시 복원 · ' +
      XS_CANCEL + ' = 올릴 자리가 없음',
    '승인': '켜야 [③ 승인분 시험 시작] 때 나갑니다. 되돌리기는 승인 없이 저절로 합니다 (값을 내리는 쪽이라).'
  });
}
