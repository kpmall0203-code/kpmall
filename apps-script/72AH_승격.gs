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
  var out = { rows: 0, skus: 0, daily: 0, week: 0, over: 0, bands: {}, blocked: '' };
  var basis = adBasis_();
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
    g.skus.push({ sku: sku, asin: String(cellOf_(v[i], map, 'ASIN', '')) });
    g.cpc.push(cpc);
    g.daily += cost / EXPAND_WINDOW_DAYS;                     // 지금 하루에 쓰던 돈
    var be = Number(cellOf_(v[i], map, '손익분기클릭비용(JPY)', 0)) || 0;
    if (!g.be || be < g.be) g.be = be;
    g.amt += Number(cellOf_(v[i], map, '광고매출(JPY)', 0)) || 0;
  }

  // ② 가격선마다 한 줄. 쓰던 돈이 큰 칸부터 넣다가 주간 한도에 닿으면 멈춘다
  var keys = Object.keys(by).sort(function (a, b) { return by[b].daily - by[a].daily; });
  var rows = [];              // used 는 위에서 이미 '이미 예약한 돈' 으로 열었다 — 다시 0 으로 두면 안 된다
  for (var k = 0; k < keys.length; k++) {
    var g2 = by[keys[k]];
    if (g2.skus.length < PROMO_MIN_SKUS) continue;
    var med = g2.cpc.slice().sort(function (x, y) { return x - y; })[Math.floor(g2.cpc.length / 2)];
    var bid = g2.band.lo;
    if (med > 0) bid = Math.min(bid, med * firstMult);         // 한 번에 뛰는 폭을 막는다
    if (maxBid > 0) bid = Math.min(bid, maxBid);
    // 계획 표는 입찰을 정수로 적는다 — 반올림하면 가격선 위로 넘어간다 (¥6.75 → ¥7).
    // 상한 이하 방향으로 내린다 (기획서 4.3 과 같은 규칙).
    bid = Math.max(EXTEST_MIN_BID, Math.floor(bid));
    var daily = Math.max(minDaily, Math.round(g2.daily * room));
    // 더 나가는 돈은 예산이 아니라 입찰이 올라간 만큼이다 (예산은 천장일 뿐)
    var more = Math.max(0, Math.round(g2.daily * (bid / med - 1) * EXTEST_WEEK_DAYS));
    if (week && used + more > week) { out.over += g2.skus.length; continue; }
    used += more; out.week += more;
    var nm = pre + ' ' + PROMO_PREFIX + ' B' + g2.band.i;
    rows.push(adPlanRow_({
      action: '생성', kind: '가격선', name: nm, daily: daily, bid: bid,
      skus: g2.skus, exist: 0, band: '¥' + g2.band.lo + '~' + g2.band.hi,
      beMin: g2.be, amt: g2.amt,
      why: '몰아넣기 그룹에서 꺼낸다 — 목표 클릭비용이 ¥' + g2.band.lo + '~' + g2.band.hi +
           ' 인 ' + g2.skus.length + '개를 한 캠페인에. 처음 입찰 ¥' + bid +
           ' (가격선 ¥' + g2.band.lo + ' · 지금 중앙값 ¥' + (Math.round(med * 100) / 100) +
           ' 의 ' + firstMult + '배 중 낮은 쪽). 목표선까지는 증액 시험이 한 계단씩 올린다. ' +
           '옛 그룹에서는 멈춘다'
    }));
    out.bands[g2.band.lo] = g2.skus.length;
    out.skus += g2.skus.length;
  }
  out.rows = rows.length;
  for (var dd = 0; dd < rows.length; dd++) out.daily += Number(rows[dd][AP_DAILY - 1]) || 0;
  if (!rows.length || dry) return out;

  // ③ 계획 표에 넣는다 (이미 같은 이름의 줄이 있으면 건드리지 않는다)
  var made = makeOneSheet_([{ name: SHEET_ADPLAN, header: ADPLAN_HEADER }]);
  var psh = ss_().getSheetByName(SHEET_ADPLAN);
  var have = {};
  if (psh.getLastRow() > 1) {
    var pv = psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
    for (var p = 0; p < pv.length; p++) have[String(pv[p][AP_NAME - 1])] = true;
  }
  var add = [];
  for (var r = 0; r < rows.length; r++) if (!have[rows[r][AP_NAME - 1]]) add.push(rows[r]);
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
