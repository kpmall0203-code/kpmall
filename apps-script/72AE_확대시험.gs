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
 * ── 어디까지 올리나: 순이익 증가분이 0 이 되는 곳까지 ──────
 * 한 번 올려 보고 끝이 아니다. 판정이 '확대유지' 면 그 값을 채택하고(다시 그 값으로
 * 올려 두고), 다음 계획에서 거기서 또 10% 를 올려 본다. 그러다
 *   · 판정이 '효과없음' 이나 '악화' 로 나오면 — 직전 값에 머문다 (증가분이 0 이 된 것이다)
 *   · 목표 상한에 닿으면 — 더 올릴 자리가 없다
 * 이렇게 한 계단씩 오르다 멈추는 것이 "순이익이 더 안 느는 구간" 을 찾는 방법이다.
 * 한 번에 뛰지 않는 이유는, 크게 흔들면 무엇 때문에 변했는지 알 수 없기 때문이다.
 *
 * 대조군은 회차마다 바뀐다. 씨앗에 그 상품군의 회차를 더해 정하므로, 이번에 대조군이던
 * 상품은 다음 회차에 시험군이 될 수 있다 — 한 번 대조군이 영원히 대조군이 아니다.
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
var XS_ADOPT = '채택';           // 판정이 좋아 그 값을 그대로 쓰기로 함 — 다음 계단의 바닥이 된다
var XS_STAY = '머묾';            // 판정이 좋지 않아 직전 값에 머문다 — 여기가 순이익 증가분 0 이다

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
    cooldown: Math.round(num('실패 냉각기간(일)', 28)),
    base: Number(b['묶음 CPC 기준점']) || 2,          // 가격선 사다리 (승격이 쓴다)
    mult: Number(b['묶음 CPC 배수']) || 1.5,
    promoCap: Number(b['확대 · 승격 일예산 상한(JPY)']) || 0,
    perItem: String(b['확대 · 상품별로 판단해 이어가기'] || '').toUpperCase() === 'TRUE'
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
 * 대조군인가 — 상품군키 · 씨앗 · 그 상품군의 회차로 정한다.
 * 같은 회차라면 언제 다시 계산해도 같은 답이 나온다 (기획서 5.3).
 * 회차가 바뀌면 배정도 바뀐다 — 그래서 한 번 대조군이 영원히 대조군이 아니다.
 */
function adExpandIsControl_(famKey, pol, round) {
  var s = String(famKey) + '|' + pol.seed + '|' + (round || 0), h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return (h % 1000) < Math.round(pol.holdout * 1000);
}

/**
 * 계획에 필요한 것을 한 번에 읽어 든다.
 *
 * 시험 표의 지난 기록에서 세 가지를 뽑는다 —
 *   busy  지금 돌고 있어 새 계획을 만들면 안 되는 SKU
 *   cool  효과가 없어 냉각기간 중인 SKU
 *   round 상품군마다 몇 번째 회차인가 (대조군 배정을 돌리는 데 쓴다)
 * 채택된 시험은 막지 않는다 — 그 값이 다음 계단의 바닥이다.
 */
function adExpandPlanCtx_() {
  var pol = adExpandPolicy_();
  var pc = { pol: pol, busy: {}, cool: {}, round: {}, keepOk: {}, live: [], nOpen: 0,
             units: adUnitMap_(), grp: adExpandGroupIndex_(), burn: adExpandBudgetSignal_(),
             unitAt: adUnitCollectedAt_(), today: ymd_(new Date()) };
  var sh = ss_().getSheetByName(SHEET_EXTEST);
  if (!sh || sh.getLastRow() < 2) return pc;
  var width = Math.max(sh.getLastColumn(), EXTEST_HEADER.length);
  var old = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  for (var o = 0; o < old.length; o++) {
    var st = String(old[o][XT_STATE] || '');
    var sk = String(old[o][XT_SKU] || '').trim();
    var fam = String(old[o][XT_FAM] || sk).trim();
    if (!sk) continue;
    if (st === XS_RUN || st === XS_MATURE) {
      pc.busy[sk] = st; pc.nOpen++; pc.live.push(old[o].slice(0, EXTEST_HEADER.length));
    } else if (st === XS_DONE || st === XS_GUARD || st === XS_CANCEL || st === XS_ADOPT || st === XS_STAY) {
      pc.live.push(old[o].slice(0, EXTEST_HEADER.length));
      if (st !== XS_CANCEL) pc.round[fam] = (pc.round[fam] || 0) + 1;
      var back = String(old[o][XT_BACK] || '').substring(0, 10);
      if ((st === XS_DONE || st === XS_GUARD || st === XS_STAY) && back &&
          daysBetween_(back, pc.today) < pol.cooldown) {
        pc.cool[sk] = back;                                   // 효과 없던 것은 냉각기간 동안 쉰다
      }
      if (st === XS_ADOPT && adRowApproved_(old[o][XT_APPROVE])) pc.keepOk[sk] = true;   // 이어가기
    } else if (adRowApproved_(old[o][XT_APPROVE])) {
      pc.keepOk[sk] = true;                                    // 계획·대기 줄의 승인은 살린다
    }
  }
  return pc;
}

/**
 * 후보 하나의 시험 계획 (기획서 4.2 · 4.3). 시트를 쓰지 않는다.
 *
 * @param {Object} c   adExpandCandRows_ 의 항목 {sku, asin, G, q, dailyCost}
 * @param {Object} pc  adExpandPlanCtx_
 * @return {{skip:string, arm, type, res, from, to, cap, state, why, hold, fam, round}}
 */
function adExpandPlanOne_(c, pc) {
  var pol = pc.pol;
  if (pc.busy[c.sku]) return { skip: '이미 진행 중', state: pc.busy[c.sku] };
  if (pc.cool[c.sku]) return { skip: '냉각기간', state: '냉각기간 (' + pc.cool[c.sku] + ' 부터 ' + pol.cooldown + '일)' };

  var fam = c.asin || c.sku;
  var round = pc.round[fam] || 0;
  var arm = adExpandIsControl_(fam, pol, round) ? XARM_CTRL : XARM_TEST;
  var res = adExpandResource_(c.sku, pc.units, pc.grp);
  var o = { arm: arm, fam: fam, round: round, res: res, from: 0, to: 0, cap: 0, hold: 0 };

  if (!res.own) {
    o.type = XTYPE_SPLIT; o.state = XS_WAIT;
    o.why = XR_SPLIT + ' — ' + (res.why || '이 SKU 만 값을 부를 자리가 없습니다') +
            '. 몰아넣기 그룹의 입찰은 그 그룹의 모든 상품에 함께 걸리므로, ' +
            '먼저 이 상품을 제 캠페인으로 분리해야 시험할 수 있습니다';
    return o;
  }
  // 목표 상한 = 주문당 공헌이익 × 판단주문율 × 이익보존계수 (기획서 4.3)
  o.cap = Math.min(c.G * c.q * pol.keep, pol.maxBid || Infinity);
  var bud = pc.burn[res.cid] || { hits: 0, days: 0 };
  if (bud.hits >= EXTEST_BUDGET_HITS) {
    o.type = XTYPE_BUDGET; o.from = res.budget;
    o.to = Math.floor(o.from * (1 + pol.step));                   // 일예산은 정수 엔
    o.why = XR_BUDGET + ' — 최근 ' + EXTEST_BUDGET_DAYS + '일 중 ' + bud.hits + '일 일예산의 ' +
            Math.round(EXTEST_BUDGET_FULL * 100) + '% 이상을 썼습니다. 입찰은 그대로 두고 예산만 ' +
            Math.round(pol.step * 100) + '% 올려 봅니다';
  } else {
    o.type = XTYPE_BID; o.from = res.bid;
    // 입찰은 0.01 단위 (아마존도 162.71 같은 값을 준다). 1엔 단위로 내리면 ¥5 는 10% 를 올려도 ¥5 다
    o.to = Math.floor(Math.min(o.from * (1 + pol.step), o.cap) * 100) / 100;
    o.why = XR_BIDOK + ' — 예산은 남는데(최근 ' + EXTEST_BUDGET_DAYS + '일 중 ' + bud.hits +
            '일만 소진) 값이 목표(¥' + (Math.round(o.cap * 10) / 10) + ') 보다 낮습니다. 값을 ' +
            Math.round(pol.step * 100) + '% 올려 더 살 수 있는지 봅니다' +
            (round ? ' (' + (round + 1) + '번째 계단)' : '');
  }
  if (!(o.from > 0)) {
    o.state = XS_WAIT; o.type = XTYPE_SPLIT;
    o.why = 'DATA_PARTIAL — 지금 값을 모릅니다 (광고 자료 갱신을 먼저 하세요)';
  } else if (!(o.to > o.from)) {
    o.state = XS_CANCEL;                                          // 무의미한 작업은 만들지 않는다
    o.why = XR_NOROOM + ' — 더 올릴 자리가 없습니다 (지금 ¥' + o.from + ' · 상한 ¥' +
            (Math.round(o.cap * 10) / 10) + '). 여기가 이 상품의 천장입니다';
  } else if (arm === XARM_CTRL) {
    o.state = XS_PLAN; o.to = o.from;                             // 대조군은 바꾸지 않는다 (시작 때 등록만)
    o.why = '대조군 (' + (round + 1) + '회차) — 일부러 바꾸지 않습니다. 이 줄이 있어야 "올려서 늘었다" 를 말할 수 있습니다';
  } else {
    o.state = XS_PLAN;
    o.hold = Math.round(c.dailyCost * (1 + pol.step) * pol.runDays);   // 예약액
  }
  return o;
}

/**
 * 메뉴(뒤): 시험 계획 표를 세운다. 아마존을 건드리지 않는다 (기획서 7.2).
 * 앞에서는 [① 후보 찾기·확인] 이 같은 셈을 확대후보 표에 함께 적는다.
 */
function planAdExpandTests(opts) {
  var quiet = !!(opts && opts.quiet);
  var made = makeOneSheet_([{ name: SHEET_EXTEST, header: EXTEST_HEADER }]);
  if (made) { if (!quiet) madeSheetStop_(made, '확대 시험 계획'); return null; }

  var csh = ss_().getSheetByName(SHEET_EXPAND);
  if (!csh || csh.getLastRow() < 2) {
    if (!quiet) ui_().alert('확대 후보가 없습니다', '[① 후보 찾기·확인] 을 먼저 하세요.', ui_().ButtonSet.OK);
    return null;
  }
  var pc = adExpandPlanCtx_(), pol = pc.pol;
  var cand = adExpandCandRows_(csh);
  var rows = [], cnt = {}, nCtrl = 0, hold = 0, running = pc.nOpen;

  for (var i = 0; i < cand.length; i++) {
    var c = cand[i];
    var o = adExpandPlanOne_(c, pc);
    if (o.skip) { cnt[o.skip] = (cnt[o.skip] || 0) + 1; continue; }
    var state = o.state;
    if (o.arm === XARM_CTRL && state === XS_PLAN) nCtrl++;
    if (state === XS_PLAN && o.arm === XARM_TEST) {
      running++;
      if (pol.maxConcurrent && running > pol.maxConcurrent) {
        state = XS_WAIT;
        o.why = '동시 시험 수 상한(' + pol.maxConcurrent + '개)에 걸렸습니다 — 앞의 시험이 끝나면 다시 계획됩니다';
      } else {
        hold += o.hold;
        if (pol.weekSpend && hold > pol.weekSpend) {
          state = XS_WAIT; hold -= o.hold;
          o.why = '시험 주간 지출한도(' + fmtYen_(pol.weekSpend) + ')를 넘습니다 — 다음 차례로 미룹니다';
        }
      }
    }
    var key = state + (state === XS_PLAN ? ' · ' + o.type : '');
    cnt[key] = (cnt[key] || 0) + 1;
    rows.push(adExpandTestRow_(c, o, state, pc, (state === XS_PLAN && pc.keepOk[c.sku]) ? true : false));
  }

  rows = pc.live.concat(rows);          // 돌고 있는 시험과 지난 기록을 먼저, 새 계획을 뒤에
  var sh = ss_().getSheetByName(SHEET_EXTEST);
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
  if (quiet) return { rows: rows.length, cnt: cnt };
  showSheet_(SHEET_EXTEST);
  ui_().alert('확대 시험 계획',
    '줄 ' + rows.length + '개\n' +
    Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ') + '\n\n' +
    adExpandGateText_(pol) +
    '대조군 ' + nCtrl + '개는 일부러 바꾸지 않습니다.\n' +
    '여기서는 아무것도 바꾸지 않았습니다.', ui_().ButtonSet.OK);
  return { rows: rows.length, cnt: cnt };
}

/** 시험 표 한 줄 */
function adExpandTestRow_(c, o, state, pc, approved) {
  var pol = pc.pol, today = pc.today;
  var runFrom = '', runTo = '';
  return [
    'X' + o.fam + '|' + today + '|' + (o.round + 1), today, c.sku, c.asin, o.fam, o.arm, o.type,
    o.res.kind || '', o.res.rid || '', o.res.rname || '',
    o.from || '', o.to || '', o.cap ? Math.round(o.cap * 100) / 100 : '',
    addDays_(today, -pol.baseDays), addDays_(today, -1),
    runFrom, runTo, '', '',
    o.hold || '', state, approved, '', o.why
  ];
}

/** 왜 지금 못 나가는가 — 사람에게 보여줄 한 덩어리 */
function adExpandGateText_(pol) {
  if (!pol.ready) {
    return '⚠ 광고기준에 아직 없는 값이 있어 시험을 시작할 수 없습니다:\n   ' +
           pol.need.join(' · ') + '\n   (돈이 걸린 값이라 프로그램이 지어내지 않습니다)\n\n';
  }
  if (!pol.canAuto) {
    return '⚠ [확대 · 모드] 가 "' + pol.mode + '" 입니다 — 계획만 세우고 보내지 않습니다.\n' +
           '   실제로 올리려면 광고기준에서 "' + EXPAND_MODE_AUTO + '" 으로 바꾸세요.\n\n';
  }
  return '';
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
 * 시험 하나를 실제로 시작한다 — 여기서만 값이 올라간다.
 * @param {Array} r  시험 표의 한 줄 (제자리에서 고친다)
 * @return {string} '' 이면 성공, 아니면 실패 사유
 */
function adExpandStartRow_(token, r, pol, logBuf) {
  var kind = String(r[XT_TYPE]) === XTYPE_BUDGET ? '캠페인' : '광고그룹';
  var act = String(r[XT_TYPE]) === XTYPE_BUDGET ? '예산변경' : '입찰변경';
  var tid = String(r[XT_RID]), today = ymd_(new Date());
  try {
    var res = adJobSend_(token, act, kind, tid, Number(r[XT_TO]));
    if (!res.ok) throw new Error(res.msg || '실패');
  } catch (e) {
    r[XT_RESULT] = '실패 — ' + adErrorText_(String(e).substring(0, 120));
    return r[XT_RESULT];
  }
  r[XT_STATE] = XS_RUN;
  r[XT_RUNFROM] = today;
  r[XT_RUNTO] = addDays_(today, pol.runDays);
  r[XT_RESULT] = '시작 ' + today + ' · ¥' + r[XT_FROM] + ' → ¥' + r[XT_TO];
  logBuf.push([adLogRow_({ kind: '확대시험', camp: String(r[XT_RNAME]), sku: String(r[XT_SKU]),
    item: act, from: r[XT_FROM], to: r[XT_TO],
    why: '확대 시험 시작 (' + pol.runDays + '일 뒤 되돌림)', by: '승인',
    gid: kind === '광고그룹' ? tid : '', cid: kind === '캠페인' ? tid : '' })]);
  return '';
}

/**
 * 승인 ✓ 인 계획 줄을 전부 시작한다 (② 시작이 부른다).
 * @return {{done:number, failed:number, hold:number, blocked:string}}
 */
function adExpandStartApproved_(opts) {
  var pol = adExpandPolicy_();
  var out = { done: 0, failed: 0, hold: 0, blocked: '' };
  if (!pol.ready) { out.blocked = '광고기준의 ' + pol.need.join(' · ') + ' 이 비어 있습니다'; return out; }
  if (!pol.canAuto) { out.blocked = '[확대 · 모드] 가 "' + pol.mode + '" 입니다'; return out; }
  var sh = ss_().getSheetByName(SHEET_EXTEST);
  if (!sh || sh.getLastRow() < 2) return out;
  var width = Math.max(sh.getLastColumn(), EXTEST_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  var token = null, logBuf = adLogBuffer_(20), dirty = false;
  var today = ymd_(new Date());
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][XT_STATE]) !== XS_PLAN) continue;
    if (!adRowApproved_(v[i][XT_APPROVE])) continue;
    if (String(v[i][XT_ARM]) === XARM_CTRL) {
      // 대조군은 아마존에 아무것도 보내지 않는다 — 같은 기간을 재려고 줄만 연다
      v[i][XT_STATE] = XS_RUN; v[i][XT_RUNFROM] = today; v[i][XT_RUNTO] = addDays_(today, pol.runDays);
      v[i][XT_RESULT] = '대조군 등록 ' + today + ' (바꾸지 않음)';
      out.ctrl = (out.ctrl || 0) + 1; dirty = true;
      continue;
    }
    if (!(Number(v[i][XT_TO]) > Number(v[i][XT_FROM]))) continue;
    if (!token) token = adsToken_();
    var err = adExpandStartRow_(token, v[i], pol, logBuf);
    if (err) out.failed++; else { out.done++; out.hold += Number(v[i][XT_HOLD]) || 0; }
    dirty = true;
  }
  logBuf.flush();
  if (dirty) sh.getRange(2, 1, v.length, width).setValues(v);
  if (out.done || out.failed) log_('ads', 'INFO', '확대 시험 시작 — ' + out.done + '개' + (out.failed ? ' · 실패 ' + out.failed : ''));
  return out;
}

/** 메뉴(뒤): 승인분 시험 시작 — 묻고 나서 보낸다 */
function startAdExpandTests() {
  if (!adBusyGuard_('확대 시험 시작')) return;
  var pol = adExpandPolicy_();
  if (!pol.canAuto) {
    ui_().alert('아직 시작할 수 없습니다', adExpandGateText_(pol), ui_().ButtonSet.OK);
    return;
  }
  var ok = ui_().alert('승인분 시험 시작',
    '[승인] ✓ 인 시험군 계획을 전부 시작합니다.\n' +
    pol.runDays + '일 뒤 자동으로 원래 값으로 되돌리고, 손실한도를 넘으면 즉시 되돌립니다.\n\n보낼까요?',
    ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;
  var r = adExpandStartApproved_();
  ui_().alert('확대 시험 시작',
    r.done + '개를 시작했습니다' + (r.failed ? ' · 실패 ' + r.failed + '개' : '') +
    (r.done ? '\n예약액 합계 ' + fmtYen_(r.hold) : '') + '\n\n' +
    '운영 ' + pol.runDays + '일 → 되돌림 → 성숙 ' + (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) +
    '일 → 판정 → 좋으면 채택하고 다음 계단.', ui_().ButtonSet.OK);
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
  // 판정을 기다리는 줄이 하나라도 있으면 판정하고 채택/머묾을 정한다
  // (오늘 성숙한 것뿐 아니라, 지난번에 판정을 못 낸 것도 — 표가 없어 못 냈을 수 있다)
  var pending = false;
  for (var k = 0; k < v.length; k++) if (String(v[k][XT_STATE]) === XS_DONE) { pending = true; break; }
  if (pending) {
    try { msg += ' | ' + buildAdExpandResults({ quiet: true }); } catch (e2) { log_('ads', 'WARN', '판정 실패: ' + e2); }
    try { msg += ' | ' + adExpandAdopt_(pol); } catch (e3) { log_('ads', 'WARN', '채택 실패: ' + e3); }
  }
  log_('ads', 'INFO', '확대 시험 주기 — ' + msg);
  if (!quiet) ui_().alert('확대 시험 주기', msg, ui_().ButtonSet.OK);
  return msg;
}

/**
 * 판정이 좋은 시험은 그 값을 채택한다 — 다음 계단의 바닥이 된다.
 *
 * '확대유지' 는 대조군까지 견줘 근거를 갖춘 것이고, [상품별로 판단해 이어가기] 가 켜져
 * 있으면 '관측개선_미확정' 이라도 그 상품의 대조군 보정 변화가 기준을 넘으면 채택한다
 * (기획서는 이것을 '검증된 확대' 라 부르지 않는다 — 그래서 기본은 꺼져 있다).
 * 채택은 되돌려 둔 값을 다시 시험값으로 올리는 것이라 돈이 나간다. 그래서
 * 자동운영 + 한도 + 그 줄의 승인이 다 있을 때만 한다. 채택 뒤 다음 주 계획이
 * 거기서 또 한 계단을 세운다.
 */
function adExpandAdopt_(pol) {
  if (!pol.canAuto) return '채택 없음 (모의운영)';
  var tsh = ss_().getSheetByName(SHEET_EXTEST), rsh = ss_().getSheetByName(SHEET_EXRESULT);
  if (!tsh || !rsh || tsh.getLastRow() < 2 || rsh.getLastRow() < 2) return '채택 없음';
  var rmap = hdrMap_(rsh);
  var rv = rsh.getRange(2, 1, rsh.getLastRow() - 1, Math.max(rsh.getLastColumn(), 1)).getValues();
  var verdict = {};
  for (var r = 0; r < rv.length; r++) {
    verdict[String(cellOf_(rv[r], rmap, '시험ID', ''))] = {
      v: String(cellOf_(rv[r], rmap, '판정', '')),
      mine: Number(cellOf_(rv[r], rmap, '내 변화(일)', 0)) || 0,
      ctrl: Number(cellOf_(rv[r], rmap, '대조군 변화(일)', 0)) || 0 };
  }
  var minGain = isFinite(Number(pol.minGain)) ? Number(pol.minGain) : 0;
  var width = Math.max(tsh.getLastColumn(), EXTEST_HEADER.length);
  var v = tsh.getRange(2, 1, tsh.getLastRow() - 1, width).getValues();
  var token = null, logBuf = adLogBuffer_(20), n = 0, stay = 0, dirty = false;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][XT_STATE]) !== XS_DONE) continue;
    if (String(v[i][XT_ARM]) !== XARM_TEST) continue;
    var vd = verdict[String(v[i][XT_ID])];
    if (!vd) continue;
    var good = vd.v === XV_KEEP ||
               (pol.perItem && vd.v === XV_MAYBE && (vd.mine - vd.ctrl) > minGain);
    if (!good) {
      // 여기가 이 상품의 '순이익 증가분 0' 이다 — 직전 값에 머문다 (냉각기간은 계획이 본다).
      // 미확정(표본 부족)도 머문다 — 근거 없이 올린 값을 두지 않는다
      if (vd.v === XV_NONE || vd.v === XV_BAD || vd.v === XV_MAYBE) {
        v[i][XT_STATE] = XS_STAY;
        v[i][XT_RESULT] = '판정 ' + vd.v + ' — 직전 값 ¥' + v[i][XT_FROM] + ' 에 머뭅니다';
        stay++; dirty = true;
      }
      continue;
    }
    if (!adRowApproved_(v[i][XT_APPROVE])) {
      v[i][XT_STATE] = XS_STAY;
      v[i][XT_RESULT] = '판정 ' + vd.v + ' — 좋았지만 승인이 없어 채택하지 않았습니다';
      dirty = true; continue;
    }
    if (!token) token = adsToken_();
    var kind = String(v[i][XT_TYPE]) === XTYPE_BUDGET ? '캠페인' : '광고그룹';
    var act = String(v[i][XT_TYPE]) === XTYPE_BUDGET ? '예산변경' : '입찰변경';
    try {
      var res = adJobSend_(token, act, kind, String(v[i][XT_RID]), Number(v[i][XT_TO]));
      if (!res.ok) throw new Error(res.msg || '실패');
      v[i][XT_STATE] = XS_ADOPT;
      v[i][XT_RESULT] = '채택 ' + ymd_(new Date()) + ' · ¥' + v[i][XT_FROM] + ' → ¥' + v[i][XT_TO] +
                        ' (' + vd.v + ')';
      n++; dirty = true;
      logBuf.push([adLogRow_({ kind: '확대시험', camp: String(v[i][XT_RNAME]), sku: String(v[i][XT_SKU]),
        item: act, from: v[i][XT_FROM], to: v[i][XT_TO],
        why: '판정 ' + vd.v + ' — 시험값 채택. 다음 계획이 여기서 한 계단 더 본다', by: '자동' })]);
    } catch (e) {
      v[i][XT_RESULT] = '채택 실패 — ' + adErrorText_(String(e).substring(0, 120)); dirty = true;
    }
  }
  logBuf.flush();
  if (dirty) tsh.getRange(2, 1, v.length, width).setValues(v);
  return '채택 ' + n + (stay ? ' · 머묾 ' + stay : '');
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
    var m = adMarginFor_(ctx, String(rows[i][XT_SKU]), a.od ? a.sales / a.od : 0, '', null,
                         String(rows[i][XT_ASIN] || ''));
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
    '상태': XS_PLAN + ' → ' + XS_RUN + ' → ' + XS_MATURE + ' → ' + XS_DONE + ' → ' + XS_ADOPT + ' 또는 ' + XS_STAY + '\n' +
      XS_ADOPT + ' = 판정이 좋아 그 값을 다시 올려 둠 (다음 계획이 거기서 한 계단 더)\n' +
      XS_STAY + ' = 판정이 좋지 않아 직전 값에 머묾 — 여기가 이 상품의 순이익 증가분 0 이다 (냉각 뒤 다시 봄)\n' +
      XS_WAIT + ' = 한도·용량·구조 때문에 아직 · ' + XS_GUARD + ' = 손실한도를 넘겨 즉시 복원 · ' +
      XS_CANCEL + ' = 올릴 자리가 없음',
    '승인': '켜야 [③ 승인분 시험 시작] 때 나갑니다. 되돌리기는 승인 없이 저절로 합니다 (값을 내리는 쪽이라).'
  });
}
