/**
 * 72AH_승격.gs — 몰아넣기 그룹에 갇힌 상품을 가격대 캠페인으로 꺼낸다
 *
 * ── 무엇을 푸는가 ───────────────────────────────────────
 * 아마존에서 입찰가는 상품이 아니라 광고그룹에 걸린다. 그런데 지금 큰 그룹 하나에
 * 1만 7천 개가 함께 들어 있다 — 한 상품 때문에 값을 올리면 나머지 전부가 같이 올라간다.
 * 그래서 계산상 '더 써도 되는' 자리를 알면서도 손댈 수가 없었다 ('분리 필요' 107개).
 *
 * ── 어떻게 푸나: 상품마다 캠페인이 아니라 '가격선' 묶음 ──
 * 107개에 캠페인 107개를 만들면 아마존 자원도 관제도 감당이 안 되고, 각각 예산이
 * 붙어 돈이 흩어진다. 대신 목표 클릭비용이 비슷한 것끼리 한 캠페인에 담는다 —
 * 같은 값을 불러도 되는 것들이니 한 그룹에 있어도 손해가 없다.
 *
 *   가격선 = 기준점(¥2) × 배수(1.5)^k  →  ¥2 · 3 · 4.5 · 6.8 · 10.1 · 15.2 · 22.8 …
 *   그 상품의 목표 CPC 가 어느 칸에 떨어지는지로 정한다 (트랙 A 묶음과 같은 사다리다)
 *
 * ── 처음 입찰을 얼마로 두나 ─────────────────────────────
 * 목표선으로 바로 올리면 지금 ¥7 짜리가 ¥17 이 된다. 2.5배는 한 번에 뛸 폭이 아니고,
 * 그렇게 올리면 좋아지든 나빠지든 그것이 '자리를 옮겨서' 인지 '값을 올려서' 인지 알 수 없다.
 * 그래서 세 가지 중 가장 낮은 값으로 시작한다:
 *   · 그 가격선 (구간의 시작값 — 칸의 위쪽이 아니라 아래쪽을 쓴다)
 *   · 지금 실제로 내던 값 × [확대 · 승격 첫 배수] (광고기준, 기본 1.5배)
 *   · [확대 · 최대 유효입찰] (적어 두었으면)
 *
 * 승격은 값을 맞추는 일이 아니라 '값을 부를 수 있는 자리로 옮기는' 일이다. 목표선까지는
 * 옮긴 뒤에 평범한 증액 시험(한 번에 10%씩 · 14일 · 대조군)이 한 계단씩 올린다 —
 * 계단마다 이익이 정말 늘었는지를 보고 오르므로, 안 느는 곳에서 저절로 멈춘다.
 *
 * ── 반반 시험: 첫 배수 자체를 잰다 ──────────────────────
 * 그 '첫 배수' 도 근거 없이 정한 값이다. 그래서 가격선마다 캠페인을 둘 만든다 —
 *   KP EXPAND B5   값 그대로 (지금 내던 중앙값)          = 대조군
 *   KP EXPAND B5T  첫 배수를 건 값                        = 시험군
 * 같은 ASIN 은 같은 편에 넣는다 (씨앗으로 정하므로 다시 세워도 같다). 두 캠페인이
 * 만들어지면 시험 표에 시험군·대조군 줄로 올라가고, 그 뒤는 평범한 시험과 같다 —
 * 14일 뒤 시험편을 대조편 값으로 되돌리고, 성숙 뒤 판정하고, 좋았으면 다시 올린다.
 * 두 편은 서로 다른 상품이라 같은 경매에서 제 값을 제가 올리는 일은 없다.
 *
 * ── 옛 그룹에서는 멈춘다 ────────────────────────────────
 * 같은 상품이 두 곳에서 입찰하면 제 값을 제가 올린다. 캠페인 만들기(72J)가
 * 새 그룹에 담은 뒤 옛 그룹의 그 상품 광고를 PAUSED 로 바꾼다 — 지우지는 않는다.
 *
 * ── 돈 ──────────────────────────────────────────────────
 * 승격은 돈을 새로 쓰는 일이 아니라 이미 쓰던 돈의 자리를 옮기는 일이다. 새 캠페인의
 * 일예산은 '그 상품들이 지금 하루에 쓰던 돈 × [일예산 여유 배수]' 로 잡는다 — 예산은
 * 천장이지 지출이 아니다. 실제로 더 나가는 돈은 입찰이 올라간 만큼이라,
 *
 *   한 주에 더 쓸 것으로 보는 돈 = 지금 하루 광고비 × (처음 입찰 ÷ 지금 값 − 1) × 7
 *
 * 로 셈해 [확대 · 시험 주간 지출한도] 와 견준다 — 증액 시험과 같은 주머니다.
 * 그 한도가 비어 있으면 제한을 걸지 않는다. 그때 승격을 막는 것은 ② 시작의 확인창
 * 하나뿐이므로, 확인창에 하루 예산 합계와 주간 추가액을 함께 적는다.
 */

var PROMO_PREFIX = 'EXPAND';           // 캠페인 이름에 쓸 말 (아마존은 아스키만 받는다)
var PROMO_MIN_SKUS = 1;
var PROMO_TRACK = 'X';                 // 계획 표 [트랙] 칸 — 확대가 만든 줄이라는 표시
var PROP_PROMO_CLEAN = 'PROMO_STOPOLD_CLEAN';   // 뒷정리가 "이 목록으로는 끝" 이라고 확인한 가격선들

/** 확대가 만든 가격선 캠페인인가 (이름으로 안다). 72D 가 '전용가능' 을 매길 때도 쓴다 */
function adIsBandCamp_(name) {
  return new RegExp('\\b' + PROMO_PREFIX + ' B\\d+T?\\b').test(String(name || ''));
}

/** 반반 시험에서 이 상품군이 어느 편인가 — 같은 ASIN 은 같은 편 (씨앗으로 정한다) */
function adPromoteArm_(asin, sku, seed) {
  var s = String(asin || sku) + '|' + seed + '|promo', h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return (h % 1000) < 500 ? XARM_CTRL : XARM_TEST;
}

/** 목표 CPC 가 떨어지는 가격선. @return {{i:number, lo:number, hi:number}} */
function adPromoBand_(target, base, mult) {
  var b = Number(base) > 0 ? Number(base) : 2;
  var m = Number(mult) > 1 ? Number(mult) : 1.5;
  var t = Number(target) || 0;
  if (!(t > 0)) return null;
  if (t < b) return { i: 0, lo: b, hi: b * m };      // 기준점보다 낮으면 첫 칸
  var i = Math.floor(Math.log(t / b) / Math.log(m));
  if (!isFinite(i) || i < 0) i = 0;
  if (i > 12) i = 12;
  var lo = b * Math.pow(m, i);
  return { i: i, lo: Math.round(lo * 100) / 100, hi: Math.round(lo * m * 100) / 100 };
}

/**
 * 승격 계획을 세운다 — 광고생성계획 표에 줄을 넣는다. 아마존은 건드리지 않는다.
 *
 * @param {Object} opts {skus: {sku:true} 한정, quiet, dry: 표에 쓰지 않고 셈만}
 * @return {{rows:number, skus:number, daily:number, week:number, over:number,
 *           bands:Object, blocked:string}}
 */
function planAdPromoteBands(opts) {
  var only = (opts && opts.skus) || null;
  var dry = !!(opts && opts.dry);
  var out = { rows: 0, skus: 0, daily: 0, week: 0, over: 0, bands: {}, arms: { ctrl: 0, test: 0 }, blocked: '' };
  var basis = adBasis_();
  var split = String(basis['확대 · 승격 반반 시험'] || 'TRUE').toUpperCase() !== 'FALSE';
  var seed = Math.round(Number(basis['확대 · 대조군 seed']) || 20260908);
  // 주간 지출한도가 비어 있으면 제한 없음 — 증액 시험과 같은 주머니를 쓴다
  var week = Number(basis['확대 · 시험 주간 지출한도(JPY)']) || 0;
  var used = week ? adExpandWeekUsed_() : 0;

  var csh = ss_().getSheetByName(SHEET_EXPAND);
  if (!csh || csh.getLastRow() < 2) { out.blocked = '확대 후보 표가 비어 있습니다'; return out; }
  var map = hdrMap_(csh);
  var v = csh.getRange(2, 1, csh.getLastRow() - 1, Math.max(csh.getLastColumn(), 1)).getValues();

  var firstMult = Number(basis['확대 · 승격 첫 배수']) || 1.5;
  var room = Number(basis['일예산 여유 배수']) || 2;
  var minDaily = Number(basis['최소 일예산']) || 100;
  var maxBid = Number(basis['확대 · 최대 유효입찰(JPY)']) || 0;
  var pre = String(basis['캠페인 이름 앞머리'] || 'KP').trim() || 'KP';

  // ① 분리 필요한 줄을 가격선으로 모은다
  var by = {};
  for (var i = 0; i < v.length; i++) {
    if (String(cellOf_(v[i], map, '판정', '')) !== EXA_SPLIT) continue;
    var sku = String(cellOf_(v[i], map, 'SKU', '')).trim();
    if (!sku || (only && !only[sku])) continue;
    var target = Number(cellOf_(v[i], map, '목표클릭비용(JPY)', 0)) || 0;
    var cpc = Number(cellOf_(v[i], map, '실제클릭비용(JPY)', 0)) || 0;
    var cost = Number(cellOf_(v[i], map, '광고비(JPY)', 0)) || 0;
    var band = adPromoBand_(target, basis['묶음 CPC 기준점'], basis['묶음 CPC 배수']);
    if (!band || !(cpc > 0)) continue;
    var g = by[band.i] || (by[band.i] = { band: band, skus: [], cpc: [], daily: 0, be: 0, amt: 0 });
    var asin = String(cellOf_(v[i], map, 'ASIN', ''));
    var wd = adSpanDays_(cellOf_(v[i], map, '자료기간', ''));
    g.skus.push({ sku: sku, asin: asin, cpc: cpc, daily: cost / wd,
                  amt: Number(cellOf_(v[i], map, '광고매출(JPY)', 0)) || 0,
                  arm: split ? adPromoteArm_(asin, sku, seed) : XARM_TEST });
    g.cpc.push(cpc);
    g.daily += cost / wd;                                     // 지금 하루에 쓰던 돈
    var be = Number(cellOf_(v[i], map, '손익분기클릭비용(JPY)', 0)) || 0;
    if (!g.be || be < g.be) g.be = be;
    g.amt += Number(cellOf_(v[i], map, '광고매출(JPY)', 0)) || 0;
  }

  // ② 가격선마다 (반반이면 두 편에) 한 줄. 쓰던 돈이 큰 칸부터 넣다가 주간 한도에 닿으면 멈춘다
  var keys = Object.keys(by).sort(function (a, b) { return by[b].daily - by[a].daily; });
  var rows = [];              // used 는 위에서 이미 '이미 예약한 돈' 으로 열었다 — 다시 0 으로 두면 안 된다
  for (var k = 0; k < keys.length; k++) {
    var g2 = by[keys[k]];
    if (g2.skus.length < PROMO_MIN_SKUS) continue;
    // 두 편이 같은 잣대를 갖도록 중앙값은 칸 전체로 잰다
    var med = g2.cpc.slice().sort(function (x, y) { return x - y; })[Math.floor(g2.cpc.length / 2)];
    // 두 편의 값을 먼저 정한다 — 대조편은 값 그대로, 시험편은 가격선 · 첫 배수 · 최대 유효입찰 중 낮은 쪽.
    // 계획 표는 입찰을 정수로 적는다 — 반올림하면 가격선 위로 넘어간다 (¥6.75 → ¥7).
    // 상한 이하 방향으로 내린다 (기획서 4.3 과 같은 규칙).
    var ctrlBid = Math.max(EXTEST_MIN_BID, Math.floor(maxBid > 0 ? Math.min(med, maxBid) : med));
    var testBid = g2.band.lo;
    if (med > 0) testBid = Math.min(testBid, med * firstMult);          // 한 번에 뛰는 폭을 막는다
    if (maxBid > 0) testBid = Math.min(testBid, maxBid);
    testBid = Math.max(EXTEST_MIN_BID, Math.floor(testBid));
    // 두 편으로 가를 수 있는가 — 정수로 내리고 나니 두 편이 같은 값이면 잴 것이 없고,
    // 한 편이 비어도(상품이 한둘뿐이라) 견줄 것이 없다. 그때는 값 그대로 옮기기만 한다:
    // 재지 않은 채 올리는 일은 하지 않는다
    var subs = {};
    subs[XARM_CTRL] = g2.skus.filter(function (x) { return x.arm === XARM_CTRL; });
    subs[XARM_TEST] = g2.skus.filter(function (x) { return x.arm === XARM_TEST; });
    var pair = split && testBid > ctrlBid && subs[XARM_CTRL].length > 0 && subs[XARM_TEST].length > 0;
    var arms = pair ? [XARM_CTRL, XARM_TEST] : [XARM_TEST];
    for (var a0 = 0; a0 < arms.length; a0++) {
      var arm = arms[a0];
      var sub = pair ? subs[arm] : g2.skus;
      if (!sub.length) continue;
      var subDaily = 0, subAmt = 0;
      for (var q0 = 0; q0 < sub.length; q0++) { subDaily += sub[q0].daily; subAmt += sub[q0].amt; }
      var bid = arm === XARM_CTRL ? ctrlBid : (pair ? testBid : (split ? ctrlBid : testBid));
      var daily = Math.max(minDaily, Math.round(subDaily * room));
      // 더 나가는 돈은 예산이 아니라 입찰이 올라간 만큼이다 (예산은 천장일 뿐). 대조편은 0
      var more = med > 0 ? Math.max(0, Math.round(subDaily * (bid / med - 1) * EXTEST_WEEK_DAYS)) : 0;
      if (week && used + more > week) { out.over += sub.length; continue; }
      used += more; out.week += more;
      var nm = pre + ' ' + PROMO_PREFIX + ' B' + g2.band.i + (pair && arm === XARM_TEST ? 'T' : '');
      var row = adPlanRow_({
        action: '생성', kind: '가격선', name: nm, daily: daily, bid: bid,
        skus: sub, exist: 0, band: '¥' + g2.band.lo + '~' + g2.band.hi,
        beMin: g2.be, amt: subAmt,
        why: (pair ? (arm === XARM_CTRL ? '[반반 시험 · 대조편] ' : '[반반 시험 · 시험편] ')
                   : (split ? '[반반 시험 없음 — ' + (testBid > ctrlBid ? '한 편이 비어 견줄 수 없음' : '첫 배수를 걸어도 정수로는 같은 값') + '] ' : '')) +
             '몰아넣기 그룹에서 꺼낸다 — 목표 클릭비용이 ¥' + g2.band.lo + '~' + g2.band.hi +
             ' 인 ' + sub.length + '개를 한 캠페인에. 처음 입찰 ¥' + bid +
             (arm === XARM_CTRL
               ? ' (지금 중앙값 ¥' + (Math.round(med * 100) / 100) + ' 그대로 — 자리만 옮긴다)'
               : ' (가격선 ¥' + g2.band.lo + ' · 지금 중앙값 ¥' + (Math.round(med * 100) / 100) +
                 ' 의 ' + firstMult + '배 중 낮은 쪽). 목표선까지는 증액 시험이 한 계단씩 올린다') +
             '. 옛 그룹에서는 멈춘다'
      });
      if (split && !pair) { arm = XARM_CTRL; }                 // 값 그대로 옮긴 것은 대조편으로 센다
      row[AP_TRACK - 1] = PROMO_TRACK;                          // 만들 때 켠다 (옛 광고를 멈추므로)
      rows.push(row);
      out.bands[g2.band.lo] = (out.bands[g2.band.lo] || 0) + sub.length;
      out.skus += sub.length;
      if (arm === XARM_CTRL) out.arms.ctrl += sub.length; else out.arms.test += sub.length;
    }
  }
  out.rows = rows.length;
  for (var dd = 0; dd < rows.length; dd++) out.daily += Number(rows[dd][AP_DAILY - 1]) || 0;
  if (!rows.length || dry) return out;

  // ③ 계획 표에 넣는다.
  //    같은 이름의 캠페인이 이미 만들어져 있으면(지난 승격) 새로 만들지 않고 그 광고그룹에
  //    '추가' 한다 — 캠페인ID·광고그룹ID 를 채워 두면 72J 가 만들기를 건너뛰고 상품만 넣는다.
  //    이것이 없으면 뒤늦게 '분리 필요' 가 된 상품은 그 가격선이 이미 있다는 이유로 영영 못 옮긴다.
  //    아직 만들어지지 않은(결과가 성공이 아닌) 같은 이름 줄이 있으면 그대로 둔다 — 그 줄이 만들 것이다.
  var made = makeOneSheet_([{ name: SHEET_ADPLAN, header: ADPLAN_HEADER }]);
  var psh = ss_().getSheetByName(SHEET_ADPLAN);
  var have = {}, placed = {};
  if (psh.getLastRow() > 1) {
    var pv = psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
    for (var p = 0; p < pv.length; p++) {
      var pn = String(pv[p][AP_NAME - 1]);
      var pOk = String(pv[p][AP_RESULT - 1]).indexOf('성공') === 0;
      var pGid = String(pv[p][AP_GID - 1] || '').trim(), pCid = String(pv[p][AP_CID - 1] || '').trim();
      if (pOk && pGid && pCid) placed[pn] = { gid: pGid, cid: pCid, bid: Number(pv[p][AP_BID - 1]) || 0 };
      else have[pn] = true;                                    // 아직 만드는 중인 줄
      // 이미 그 캠페인에 들어간 SKU 는 다시 넣지 않는다
      if (pOk) {
        var pl = adSkuListSplit_(pv[p][AP_SKUS - 1]);
        for (var q1 = 0; q1 < pl.length; q1++) placed[pn + '|' + pl[q1]] = true;
      }
    }
  }
  var add = [];
  for (var r = 0; r < rows.length; r++) {
    var nm0 = rows[r][AP_NAME - 1];
    if (have[nm0]) continue;
    if (placed[nm0]) {
      var left = adSkuListSplit_(rows[r][AP_SKUS - 1]).filter(function (x) { return !placed[nm0 + '|' + x]; });
      if (!left.length) continue;
      rows[r][AP_ACTION - 1] = '기존에 추가';
      rows[r][AP_SKUS - 1] = adSkuListJoin_(left);
      rows[r][7] = left.length;                                  // SKU수
      rows[r][AP_GID - 1] = placed[nm0].gid;
      rows[r][AP_CID - 1] = placed[nm0].cid;
      rows[r][AP_BID - 1] = placed[nm0].bid || rows[r][AP_BID - 1];   // 그 그룹이 지금 부르는 값
      rows[r][14] = '[이미 있는 가격선 캠페인에 추가] ' + rows[r][14];
    }
    add.push(rows[r]);
  }
  if (add.length) {
    for (var a = 0; a < add.length; a++) add[a][AP_APPROVE - 1] = true;   // ② 시작이 승인한 것이다
    var at = Math.max(psh.getLastRow(), 1) + 1;
    var need = at + add.length - 1;
    if (psh.getMaxRows() < need) psh.insertRowsAfter(psh.getMaxRows(), need - psh.getMaxRows());
    psh.getRange(at, 1, add.length, ADPLAN_HEADER.length).setValues(add);
  }
  out.rows = add.length;
  log_('ads', 'INFO', '승격 계획 — 가격선 ' + add.length + '개 · SKU ' + out.skus +
       ' · 하루 예산 ' + out.daily + '엔 · 주간 추가 ' + out.week + '엔' +
       (out.over ? ' · 주간 한도에 걸려 미룸 ' + out.over : ''));
  return out;
}

/** 메뉴(뒤): 승격 계획만 세우기 */
function planAdPromoteBandsMenu() {
  var r = planAdPromoteBands();
  if (r.blocked) {
    ui_().alert('승격 계획', '아직 세울 수 없습니다 — ' + r.blocked + '.', ui_().ButtonSet.OK);
    return;
  }
  showSheet_(SHEET_ADPLAN);
  ui_().alert('승격 계획',
    '가격선 ' + r.rows + '개 · SKU ' + r.skus + '개\n' +
    '하루 예산 합계 ' + fmtYen_(r.daily) + ' (천장 — 지금 쓰던 돈의 ' +
    (Number(adBasis_()['일예산 여유 배수']) || 2) + '배)\n' +
    '한 주에 더 쓸 것으로 보는 돈 ' + fmtYen_(r.week) + '\n' +
    Object.keys(r.bands).map(function (b) { return '   ¥' + b + ' 선 — ' + r.bands[b] + '개'; }).join('\n') +
    (r.over ? '\n\n주간 지출한도에 걸려 미룬 SKU ' + r.over + '개 (다음에 다시 계획됩니다)' : '') +
    '\n\n[' + SHEET_ADPLAN + '] 표에 넣었습니다. [⑤ 승인분 캠페인 생성] 이 만듭니다.',
    ui_().ButtonSet.OK);
}


/**
 * 만들어진 가격선 캠페인을 시험 표에 올린다 — 반반 시험의 두 편.
 *
 * 캠페인 만들기(72J)는 6분에 걸려 몇 번에 나눠 돌 수 있다. 그래서 ② 시작 직후와
 * 매일 [확대 시험 주기]에서 부른다 — 이미 올라간 SKU 는 건너뛴다.
 * 시험편(…T)과 대조편이 둘 다 만들어진 가격선만 올린다. 한쪽만 있으면 견줄 것이 없다.
 * 올라간 줄은 평범한 시험처럼 굴러간다: 14일 뒤 시험편을 대조편 값으로 되돌리고,
 * 성숙 뒤 판정하고, 좋았으면 다시 올린다.
 *
 * @return {{test:number, ctrl:number}}
 */
function adPromoteRegister_() {
  var out = { test: 0, ctrl: 0 };
  var psh = ss_().getSheetByName(SHEET_ADPLAN);
  if (!psh || psh.getLastRow() < 2) return out;
  var pv = psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  var byName = {};
  for (var i = 0; i < pv.length; i++) {
    if (String(pv[i][AP_TRACK - 1]) !== PROMO_TRACK) continue;
    byName[String(pv[i][AP_NAME - 1])] = pv[i];
  }
  var names = Object.keys(byName).filter(function (n) { return /T$/.test(n); });
  if (!names.length) return out;

  makeOneSheet_([{ name: SHEET_EXTEST, header: EXTEST_HEADER }]);
  var tsh = ss_().getSheetByName(SHEET_EXTEST);
  var have = {};
  if (tsh.getLastRow() > 1) {
    var tv = tsh.getRange(2, 1, tsh.getLastRow() - 1,
                          Math.max(tsh.getLastColumn(), EXTEST_HEADER.length)).getValues();
    for (var t = 0; t < tv.length; t++) {
      if (String(tv[t][XT_TYPE]) === XTYPE_PROMO) have[String(tv[t][XT_SKU]).trim()] = true;
    }
  }
  var pol = adExpandPolicy_(), basis = adBasis_();
  var room = Number(basis['일예산 여유 배수']) || 2;
  var asinMap = adSkuAsin_();
  var today = ymd_(new Date()), rows = [];
  var made = function (r) { return String(r[AP_RESULT - 1]).indexOf('성공') === 0 && !!String(r[AP_GID - 1]).trim(); };

  for (var n = 0; n < names.length; n++) {
    var tr = byName[names[n]], cr = byName[names[n].slice(0, -1)];
    if (!cr || !made(tr) || !made(cr)) continue;         // 둘 다 만들어져야 같은 날부터 잰다
    var from = Number(cr[AP_BID - 1]) || 0, to = Number(tr[AP_BID - 1]) || 0;
    var pairs = [[tr, XARM_TEST], [cr, XARM_CTRL]];
    for (var p = 0; p < pairs.length; p++) {
      var row = pairs[p][0], arm = pairs[p][1];
      var skus = adSkuListSplit_(row[AP_SKUS - 1]);
      var gid = String(row[AP_GID - 1]).trim(), name = String(row[AP_NAME - 1]);
      var daily = Number(row[AP_DAILY - 1]) || 0;
      // 예약액 — 시험편이 한 주에 더 쓸 것으로 보는 돈을 상품 수로 나눈 몫. 대조편은 0
      var hold = (arm === XARM_TEST && from > 0 && skus.length)
        ? Math.max(1, Math.round((daily / room) * (to / from - 1) * EXTEST_WEEK_DAYS / skus.length)) : 0;
      for (var s = 0; s < skus.length; s++) {
        if (have[skus[s]]) continue;
        var asin = asinMap[skus[s]] || '';
        rows.push([
          'P' + (asin || skus[s]) + '|' + today, today, skus[s], asin, asin || skus[s], arm, XTYPE_PROMO,
          '광고그룹', gid, name,
          from, arm === XARM_TEST ? to : from, '',
          addDays_(today, -pol.baseDays), addDays_(today, -1),
          today, addDays_(today, pol.runDays), '', '',
          hold || '', XS_RUN, true,
          (arm === XARM_TEST ? '승격 시험편 ' + today + ' · ¥' + from + ' → ¥' + to
                             : '승격 대조편 ' + today + ' (값 그대로 ¥' + from + ')'),
          '승격 반반 시험 — 같은 가격선에서 절반은 값 그대로(' + names[n].slice(0, -1) +
          '), 절반은 첫 배수(' + names[n] + '). 첫 배수가 정말 버는지를 잰다'
        ]);
        have[skus[s]] = true;
        if (arm === XARM_TEST) out.test++; else out.ctrl++;
      }
    }
  }
  if (rows.length) {
    var at = Math.max(tsh.getLastRow(), 1) + 1;
    if (tsh.getMaxRows() < at + rows.length - 1) tsh.insertRowsAfter(tsh.getMaxRows(), at + rows.length - 1 - tsh.getMaxRows());
    // ID 와 날짜 칸은 글자로 둔다 — 시트가 숫자·날짜로 바꾸면 자릿수가 깎이거나 견줌이 어긋난다
    for (var ic = 0; ic < EXTEST_ID_COLS.length; ic++) {
      tsh.getRange(at, EXTEST_ID_COLS[ic], rows.length, 1).setNumberFormat('@');
    }
    tsh.getRange(at, XT_BFROM + 1, rows.length, XT_MATURE - XT_BFROM + 1).setNumberFormat('@');
    tsh.getRange(at, 1, rows.length, EXTEST_HEADER.length).setValues(rows);
    tsh.getRange(at, EXTEST_APPROVE_COL, rows.length, 1).insertCheckboxes();
    log_('ads', 'INFO', '승격 반반 시험 등록 — 시험편 ' + out.test + ' · 대조편 ' + out.ctrl);
  }
  return out;
}


/**
 * 옮긴 상품이 옛 그룹에서 아직 켜져 있으면 멈춘다 — 승격의 뒷정리.
 *
 * ── 왜 따로 있나 ─────────────────────────────────────────
 * 캠페인 만들기(72J)는 옛 광고를 찾을 때 아마존에 SKU 로 물었는데(skuFilter), 그 물음이
 * 거의 아무것도 돌려주지 않았다 — 152개를 옮기고 4개만 멈췄다. 그동안 같은 상품이 두 곳에서
 * 입찰한다. 그런데 옛 광고의 ID 는 [상품광고목록] 에 이미 전부 있다. 그것을 쓴다.
 *
 * ── 무엇을 멈추나 ────────────────────────────────────────
 * 새 그룹에 '실제로 들어간' SKU 만. 새 그룹의 광고 목록은 그룹 ID 로 묻는다 — 이 물음은
 * 믿을 수 있다. 등록에 실패한 SKU (자격 오류 등)는 옛 자리가 유일한 자리라 건드리지 않는다.
 * 멈춘 광고는 [상품광고목록] 의 상태도 PAUSED 로 고쳐 둔다 — 안 그러면 다음 수집 전까지
 * 매일 같은 것을 또 멈추려 든다.
 *
 * 같은 김에 계획 표의 [광고ID들] 도 새 그룹의 진짜 목록으로 다시 적는다 — 시트가 그 칸을
 * 숫자로 읽어 4.4e+269 같은 값으로 망가뜨린 줄이 있다.
 *
 * @param {Object} opts {quiet, dry}
 * @return {{rows:number, skus:number, paused:number, fixedIds:number, left:number, msg:string}}
 */
function adPromoteStopOld_(opts) {
  var quiet = !!(opts && opts.quiet), dry = !!(opts && opts.dry);
  // 어느 트랙의 줄을 뒷정리할까. 승격(X)이 기본이고 신규(N)도 같은 뒷정리가 필요하다 —
  // 둘 다 '새 그룹으로 옮겼으니 옛 그룹에서 멈춘다' 가 할 일이다
  var track = String((opts && opts.track) || PROMO_TRACK);
  var out = { rows: 0, skus: 0, paused: 0, fixedIds: 0, left: 0, msg: '' };
  var psh = ss_().getSheetByName(SHEET_ADPLAN);
  if (!psh || psh.getLastRow() < 2) { out.msg = '계획 표가 없습니다'; return out; }
  var pv = psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  var units = adUnitMap_();
  if (!Object.keys(units).length) { out.msg = '[상품광고목록] 이 비어 있습니다 — 먼저 받으세요'; return out; }

  // 싼 검사 먼저: 옮긴 SKU 중 옛 그룹에 켜진 광고가 하나라도 있나 (없으면 아마존을 안 부른다).
  // 등록에 실패한 SKU 는 옛 광고가 영영 켜져 있는 것이 맞다 — 그 줄을 매일 다시 물어보지 않도록,
  // "이 목록 스냅샷으로는 더 할 것이 없다" 고 확인한 줄은 목록을 새로 받을 때까지 건너뛴다.
  var props = PropertiesService.getScriptProperties();
  var unitAt = '';
  try { unitAt = String(adUnitCollectedAt_() || ''); } catch (e0) { unitAt = ''; }
  var clean = {};
  try { clean = JSON.parse(props.getProperty(PROP_PROMO_CLEAN) || '{}') || {}; } catch (e1) { clean = {}; }
  var work = [];
  for (var i = 0; i < pv.length; i++) {
    if (String(pv[i][AP_TRACK - 1]).trim() !== track) continue;
    if (String(pv[i][AP_RESULT - 1]).indexOf('성공') !== 0) continue;
    var gid = String(pv[i][AP_GID - 1] || '').trim();
    if (!gid) continue;
    if (unitAt && clean[String(pv[i][AP_NAME - 1])] === unitAt) continue;   // 이 스냅샷으로는 이미 확인함
    var skus = adSkuListSplit_(pv[i][AP_SKUS - 1]), any = false;
    for (var s = 0; s < skus.length && !any; s++) {
      var u = units[skus[s]];
      if (!u) continue;
      for (var a = 0; a < u.ads.length; a++) if (u.ads[a].state === 'ENABLED' && u.ads[a].gid !== gid) { any = true; break; }
    }
    if (any) work.push({ row: i + 2, name: String(pv[i][AP_NAME - 1]), gid: gid, cid: String(pv[i][AP_CID - 1] || ''), skus: skus });
  }
  if (!work.length) { out.msg = '옛 그룹에 켜진 것이 없습니다'; return out; }

  var token = adsToken_(), logBuf = adLogBuffer_(20), pausedIds = [], t0 = Date.now();
  for (var w = 0; w < work.length; w++) {
    var W = work[w];
    if (Date.now() - t0 > ADS_SOFT_MS) { out.left++; continue; }
    // ① 새 그룹에 실제로 든 SKU — 그룹 ID 로 묻는다
    var inNew = {}, newIds = [], next = null, guard = 0;
    try {
      do {
        var body = { maxResults: 500, adGroupIdFilter: { include: [W.gid] },
                     stateFilter: { include: ['ENABLED', 'PAUSED'] } };
        if (next) body.nextToken = next;
        var r = adsApiRetry_(token, 'post', '/sp/productAds/list', body, ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
        var arr = (r && r.productAds) || [];
        for (var k = 0; k < arr.length; k++) {
          inNew[String(arr[k].sku || '')] = true;
          newIds.push(String(arr[k].adId || ''));
        }
        next = r && r.nextToken ? r.nextToken : null;
      } while (next && guard++ < 20);
    } catch (e) {
      log_('ads', 'WARN', '승격 뒷정리 — 새 그룹 조회 실패 (' + W.name + '): ' + String(e).substring(0, 120));
      out.left++; continue;
    }
    // ② 그 SKU 들의 옛 광고 — 상품광고목록에서
    var ids = [], hit = [];
    for (var s2 = 0; s2 < W.skus.length; s2++) {
      var sk = W.skus[s2];
      if (!inNew[sk]) continue;                          // 새 자리에 없으면 옛 자리를 끄면 안 된다
      var u2 = units[sk];
      if (!u2) continue;
      for (var a2 = 0; a2 < u2.ads.length; a2++) {
        if (u2.ads[a2].state === 'ENABLED' && u2.ads[a2].gid !== W.gid) { ids.push(u2.ads[a2].id); hit.push(sk); }
      }
    }
    out.rows++; out.skus += hit.length;
    if (dry) { out.paused += ids.length; continue; }
    if (!ids.length) { if (unitAt) clean[W.name] = unitAt; continue; }   // 남은 것이 실패 SKU 뿐 — 다음 목록까지 조용히
    // ③ 멈춘다
    var bad = ids.length ? adPauseAds_(token, ids) : '';
    if (bad) { log_('ads', 'WARN', '승격 뒷정리 — 멈춤 실패 (' + W.name + '): ' + bad); out.left++; continue; }
    out.paused += ids.length; pausedIds = pausedIds.concat(ids);
    if (ids.length) {
      logBuf.push([adLogRow_({ kind: '상품', camp: W.name, group: W.name, sku: adSkuText_(hit, 3),
        target: ids.length + '개', item: '옛 그룹에서 멈춤', from: 'ENABLED', to: 'PAUSED',
        why: '승격 뒷정리 — 옮긴 상품이 옛 그룹에서 아직 켜져 있었다 (두 곳에서 입찰하면 자기끼리 값을 올림)',
        by: '자동', cid: W.cid, gid: W.gid })]);
    }
    // ④ 계획 표의 [광고ID들] 을 진짜 목록으로 (글자로 고정해서)
    if (newIds.length) {
      psh.getRange(W.row, AP_ADIDS).setNumberFormat('@').setValue(newIds.join(','));
      out.fixedIds++;
    }
  }
  logBuf.flush();
  if (pausedIds.length) adUnitMarkPaused_(pausedIds);
  if (!dry) { try { props.setProperty(PROP_PROMO_CLEAN, JSON.stringify(clean)); } catch (e2) {} }
  out.msg = '가격선 ' + out.rows + '개 · 옛 그룹에서 멈춤 ' + out.paused + '개 (SKU ' + out.skus + ')' +
            (out.fixedIds ? ' · 광고ID 다시 적음 ' + out.fixedIds + '줄' : '') +
            (out.left ? ' · 못 한 줄 ' + out.left + ' (다음 주기가 이어서)' : '');
  log_('ads', out.left ? 'WARN' : 'INFO', '승격 뒷정리 — ' + out.msg);
  return out;
}

/** 메뉴(뒤): 승격 뒷정리 — 옮긴 상품을 옛 그룹에서 멈춘다 */
function promoteStopOldMenu() {
  if (!adBusyGuard_('승격 뒷정리')) return;
  var pre = adPromoteStopOld_({ dry: true, quiet: true });
  if (!pre.paused) { ui_().alert('승격 뒷정리', pre.msg + '.', ui_().ButtonSet.OK); return; }
  var ok = ui_().alert('승격 뒷정리',
    '옮긴 상품 ' + pre.skus + '개가 옛 그룹에서 아직 켜져 있습니다 — 광고 ' + pre.paused + '개.\n' +
    '같은 상품이 두 곳에서 입찰하면 자기끼리 값을 올립니다.\n\n옛 그룹에서 멈출까요? (새 캠페인은 그대로)',
    ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;
  var r = adPromoteStopOld_({ quiet: true });
  ui_().alert('승격 뒷정리', r.msg + '\n\n' + SHEET_ADLOG + ' 에 남겼습니다.', ui_().ButtonSet.OK);
}
