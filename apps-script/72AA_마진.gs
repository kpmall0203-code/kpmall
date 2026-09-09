/**
 * 72AA_마진.gs — 이 상품의 마진율은 몇인가 (한 곳에서만 답한다)
 *
 * ── 왜 한곳에 모으나 ────────────────────────────────────
 * 마진율이 틀리면 손익분기 CPC 가 틀리고, 그건 곧 입찰가이고 곧 돈이다.
 * 그런데 지금까지 트랙 A(72H)는 제 안에서 원가·바깥시트·가격대값을 골랐고,
 * 트랙 B(72O)는 원가가 없으면 바로 계정 기본값으로 갔다. 같은 상품에 두 답이 나왔다.
 *
 * 지금 여기로 오는 곳은 둘이다 — 광고확대후보(72AB)와 트랙 B 추천값(72O).
 * 트랙 A 재배분(72H)은 가격대별 마진율 사다리를 쓰므로 아직 제 것을 쓴다.
 * 그것까지 옮기면 이미 도는 트랙 A 의 입찰이 한꺼번에 바뀐다 — 따로 볼 일이다.
 *
 * ── 순서 (앞의 것이 이긴다) ─────────────────────────────
 *   ① 기준값 시트            바깥 시트의 '광고 기준값' 탭 — SKU, 없으면 ASIN 으로 맞댄다
 *   ② 후보 표에 적은 값       광고확대후보 표에서 직접 고친 값 (곧 ① 로 밀어 올린다)
 *   ③ 원가로 계산            원가(원)·배송비(엔)·사내환율·수수료로 낸 실측
 *   ④ 바깥 마진율 시트        '상품 목록' 의 일본어 상품명이 정확히 같을 때만
 *   ⑤ 기본값                위가 다 없을 때. 광고기준의 [기본 마진율] 을 쓴다 (지금 15%)
 *
 * ── 왜 기준값 시트가 맨 위인가 ──────────────────────────
 * 마진율과 판매가는 사람이 아는 값이고, 그 값은 한 곳에서 관리돼야 한다.
 * 표(광고확대후보)는 프로그램이 다시 세울 때마다 줄이 바뀌고 사라지기도 한다 —
 * 사람이 손으로 넣은 값이 그런 표에만 있으면 언젠가 잃는다. 그래서 바깥 시트의
 * 탭 하나에 SKU·ASIN 을 열쇠로 모아 두고, 표는 그것을 비춰 보이기만 한다.
 * 표에서 고친 값은 다음에 표를 세울 때 기준값 시트로 밀어 올린다 (72AB).
 *
 * SKU 가 맞으면 SKU 로, 없으면 ASIN 으로 맞댄다. ASIN 으로 적으면 그 ASIN 의
 * SKU 전부에 같은 값이 걸린다 — 같은 물건을 이름만 달리 올린 경우에 편하다.
 *
 * ── 바깥 시트를 이름으로 붙이는 것의 한계 ────────────────
 * 그 시트에는 SKU 도 ASIN 도 없고 일본어 상품명뿐이다. 공백·괄호만 지우고
 * 맞대면 리스팅 26,764개 중 2,707개(10%)가 붙는다. 앞 몇 글자만 같으면
 * 같다고 치면 더 붙지만 쓰지 않는다 — 틀린 마진율은 틀린 입찰가다.
 * 실제로 광고 후보(광고재배분 1,473개) 중 붙는 것은 153개(10%)뿐이라,
 * 대부분은 ④ 기본값으로 간다. 그래서 ① 을 쉽게 만드는 것이 이 파일의 목적이다.
 *
 * ── 퍼센트인가 비율인가 ─────────────────────────────────
 * 바깥 시트의 [마진율 (%)] 은 15.4 가 15.4% 다. 같은 줄의 [마진 (JPY)] 로 확인했다
 * (판매가 1,780 · 마진율 0.1 · 마진 ¥2 → 0.11%). 1 보다 작다는 이유로 10% 라고
 * 읽지 않는다 (기획서 C4).
 */

// 아무 근거가 없을 때 쓰는 값. 진짜 기준은 광고기준 시트의 [기본 마진율] 이고,
// 이것은 그 시트를 못 읽을 때의 마지막 대비다 — 둘이 어긋나지 않게 같은 값으로 둔다.
var MARGIN_DEFAULT_PCT = 15;

var MSRC_REF = '기준값 시트';        // 바깥 시트의 '광고 기준값' 탭 (SKU/ASIN)
var MSRC_REF_ASIN = '기준값 시트(ASIN)';
var MSRC_USER = '사용자 입력';
var MSRC_COST = '원가 계산';
var MSRC_SHEET = '마진율 시트';
var MSRC_DEFAULT = '기본값';
var MSRC_LOSS = '원가 계산(적자)';

/**
 * 마진을 물어볼 준비를 한다 (무거운 읽기는 여기서 한 번만).
 *
 * 원가표·환율·바깥 마진율 시트를 다 읽으므로 줄마다 부르면 안 된다.
 * 한 번 읽은 것은 이 실행 동안 그대로 쓴다 (fresh 를 주면 다시 읽는다).
 *
 * @param {boolean=} fresh 다시 읽기
 * @return {Object} 문맥. adMarginFor_ 에 그대로 넘긴다
 */
var AD_MARGIN_CTX_ = null;
function adMarginCtx_(fresh) {
  if (!fresh && AD_MARGIN_CTX_) return AD_MARGIN_CTX_;
  var made = adMarginCtxBuild_();
  AD_MARGIN_CTX_ = made;
  return made;
}

function adMarginCtxBuild_() {
  var basis = {};
  try { basis = adBasis_(); } catch (e) { basis = {}; }
  var ctx = {
    def: (Number(basis['기본 마진율']) > 0 ? Number(basis['기본 마진율']) * 100
                                          : MARGIN_DEFAULT_PCT),
    costs: {}, rate: 0, skuCost: {}, manual: {}, ext: {}, user: {},
    ref: { bySku: {}, byAsin: {}, n: 0 },
    nCost: 0, nExt: 0, nUser: 0
  };
  // 바깥 '광고 기준값' 탭 — 사람이 관리하는 원장. 가장 세다
  try {
    ctx.ref = adRefValues_(basis) || { bySku: {}, byAsin: {}, n: 0 };
  } catch (e) { ctx.ref = { bySku: {}, byAsin: {}, n: 0 }; }
  // 사람이 광고확대후보 표에 적어 둔 값 — 기준값 시트 다음으로 세다.
  // 여기에 실어야 멈춤 후보·트랙 B 추천도 같은 값을 본다 (표를 보는 곳마다 다른 마진을
  // 쓰면, 한 표는 늘리라 하고 다른 표는 멈추라 한다).
  try {
    ctx.user = adUserMarginMap_() || {};
    ctx.nUser = Object.keys(ctx.user).length;
  } catch (e) { ctx.user = {}; }
  try {
    ctx.costs = costMap_() || {};
    ctx.rate = Number(fxHouseRate_()) || 0;
    ctx.skuCost = skuCostMap_() || {};
    ctx.manual = costInfoMap_() || {};
    ctx.nCost = Object.keys(ctx.costs).length;
  } catch (e) { log_('ads', 'WARN', '원가를 못 읽었습니다: ' + String(e).substring(0, 120)); }
  try {
    ctx.ext = externalMarginMap_(basis) || {};
    ctx.nExt = Object.keys(ctx.ext).length;
  } catch (e) { log_('ads', 'WARN', '마진율 시트를 못 읽었습니다: ' + String(e).substring(0, 120)); }
  return ctx;
}

/**
 * 이 상품의 마진율(%) 과 그것을 어디서 얻었는지.
 *
 * @param {Object} ctx     adMarginCtx_()
 * @param {string} sku
 * @param {number} price   판매가(JPY)
 * @param {string} jpName  일본어 상품명 (바깥 시트와 맞대는 열쇠)
 * @param {*} userPct      표에 사람이 적은 마진율(%). 있으면 이것이 이긴다
 * @return {{pct:number, src:string, why:string}}
 */
function adMarginFor_(ctx, sku, price, jpName, userPct, asin) {
  // ① 기준값 시트 (SKU 먼저, 없으면 ASIN)
  var ref = adRefFor_(ctx, sku, asin);
  if (ref && isFinite(ref.margin) && ref.margin > 0 && ref.margin < 100) {
    return { pct: ref.margin, src: ref.byAsin ? MSRC_REF_ASIN : MSRC_REF,
             why: '바깥 시트 [' + AD_REF_TAB + '] 탭에 ' + (ref.byAsin ? 'ASIN ' + asin : 'SKU ' + sku) +
                  ' 로 적어 둔 값입니다 — 여기가 마진율의 원장입니다' +
                  (ref.memo ? ' (' + ref.memo + ')' : '') };
  }
  // ② 광고확대후보 표에 적은 값 (부르는 쪽이 준 것이 있으면 그것)
  var u = Number(userPct);
  if (!(isFinite(u) && u > 0)) u = Number((ctx.user || {})[sku]);
  if (isFinite(u) && u > 0 && u < 100) {
    return { pct: u, src: MSRC_USER,
             why: '사람이 [' + SHEET_EXPAND + '] 표에 직접 적은 값입니다 — 다음에 표를 세울 때 ' +
                  '바깥 [' + AD_REF_TAB + '] 탭으로 옮겨 둡니다' };
  }
  return adMarginProgram_(ctx, sku, price, jpName);
}

/** 기준값 시트에서 이 상품의 줄 — SKU 가 먼저, 없으면 ASIN */
function adRefFor_(ctx, sku, asin) {
  var r = ctx && ctx.ref ? ctx.ref : null;
  if (!r) return null;
  var k = String(sku || '').trim();
  if (k && r.bySku[k]) return r.bySku[k];
  var a = String(asin || '').trim().toUpperCase();
  if (a && r.byAsin[a]) { var o = r.byAsin[a]; o.byAsin = true; return o; }
  return null;
}

/** 기준값 시트가 정한 판매가 (없으면 0) */
function adRefPrice_(ctx, sku, asin) {
  var r = adRefFor_(ctx, sku, asin);
  var p = r ? Number(r.price) : 0;
  return isFinite(p) && p > 0 ? p : 0;
}

/**
 * 사람이 적은 값을 빼고, 프로그램만으로 낼 수 있는 마진율.
 *
 * 확대후보 표는 이 값도 함께 적어 둔다. 그래야 다음에 다시 셀 때
 * "이 칸이 그때 내가 쓴 값 그대로인가, 사람이 고쳤나" 를 알 수 있다 —
 * 사람이 마진율만 고치고 [마진출처] 는 그대로 두는 것이 자연스럽기 때문이다.
 */
function adMarginProgram_(ctx, sku, price, jpName) {
  // ② 원가로 계산 (원가·배송비·환율·수수료)
  var cost = Number((ctx.costs || {})[sku]) || 0;
  if (cost > 0 && ctx.rate > 0 && price > 0) {
    var fee = 0, fsrc = '배송비 모름';
    try {
      var rs = resolveShipping_(sku, ctx.skuCost, ctx.manual);
      fee = Number(rs.fee) || 0; fsrc = rs.src;
    } catch (e) {}
    var unit = unitProfitKrw_(price, fee, cost, ctx.rate, DEFAULT_FEE_RATE);
    var pct = unit / ctx.rate / price * 100;
    if (pct > 0 && pct < 100) {
      return { pct: Math.round(pct * 10) / 10, src: MSRC_COST,
               why: '원가 ' + Math.round(cost).toLocaleString() + '원 · 배송비 ¥' + Math.round(fee) +
                    ' (' + fsrc + ') · 수수료 ' + Math.round(DEFAULT_FEE_RATE * 100) + '% · 환율 ' +
                    ctx.rate.toFixed(2) };
    }
    if (pct <= 0) {
      return { pct: 0, src: MSRC_LOSS,
               why: '⛔ 이 값·원가로는 팔수록 손해입니다 (건당 ' +
                    Math.round(unit).toLocaleString() + '원). 광고를 늘릴 상품이 아닙니다' };
    }
  }

  // ③ 바깥 마진율 시트 (일본어 상품명이 정확히 같을 때만)
  var key = '';
  try { key = normName_(jpName); } catch (e) { key = ''; }
  var ex = key ? Number((ctx.ext || {})[key]) : 0;
  if (ex > 0) {
    return { pct: Math.round(ex * 1000) / 10, src: MSRC_SHEET,
             why: '바깥 "상품 목록" 시트에서 일본어 상품명이 정확히 같은 줄을 찾았습니다' };
  }

  // ④ 기본값
  return { pct: ctx.def, src: MSRC_DEFAULT,
           why: '원가도 없고 바깥 시트에도 없어 기본값 ' + ctx.def + '% 를 씁니다 — ' +
                '실제 마진율을 아시면 표의 [마진율(%)] 에 적어 주세요 (그것이 가장 셉니다)' };
}

/**
 * SKU → 일본어 상품명 (바깥 마진율 시트를 이름으로 맞대는 열쇠).
 *
 * 리스팅은 2만 6천 줄이라 줄마다 찾으면 안 된다 — 한 번만 읽어 들고 있는다.
 * 리스팅이 없으면 빈 표를 준다 (그러면 ③ 을 건너뛰고 기본값으로 간다).
 */
var AD_JPNAME_MAP_ = null;
function adJpNameMap_(fresh) {
  if (!fresh && AD_JPNAME_MAP_) return AD_JPNAME_MAP_;
  var out = {};
  try {
    var sh = ss_().getSheetByName(SHEET_LISTING);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();   // SKU · ASIN · 일본어상품명
      for (var i = 0; i < v.length; i++) {
        var k = String(v[i][0] || '').trim();
        if (k) out[k] = String(v[i][2] || '');
      }
    }
  } catch (e) {
    log_('ads', 'WARN', '리스팅에서 상품명을 못 읽었습니다: ' + String(e).substring(0, 120));
  }
  AD_JPNAME_MAP_ = out;
  return out;
}


// ── 바깥 '광고 기준값' 탭 ────────────────────────────────
//
// 사람이 아는 값(실제 마진율 · 실제 판매가)을 모아 두는 원장이다. 광고 표들은
// 이것을 비춰 보일 뿐이고, 표를 다시 세워도 값은 여기 남는다.
// 열쇠는 SKU 와 ASIN 둘 다 받는다 — 같은 물건을 이름만 달리 올린 경우 ASIN 한 줄로 끝난다.

var AD_REF_TAB = '광고 기준값';
var AD_REF_HEADER = ['SKU', 'ASIN', '상품명(참고)', '마진율(%)', '판매가(JPY)', '메모', '수정일'];

/** 기준값 시트를 읽는다. @return {{bySku:Object, byAsin:Object, n:number}} */
function adRefValues_(basis) {
  var out = { bySku: {}, byAsin: {}, n: 0 };
  var b = basis || adBasis_();
  var id = String(b['마진율 시트 ID'] || '').trim();
  if (!id) return out;
  var sh;
  try {
    sh = SpreadsheetApp.openById(id).getSheetByName(AD_REF_TAB);
  } catch (e) {
    log_('ads', 'WARN', '기준값 시트를 못 열었습니다: ' + String(e).substring(0, 120));
    return out;
  }
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, AD_REF_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][0] || '').trim();
    var asin = String(v[i][1] || '').trim().toUpperCase();
    var m = Number(v[i][3]), p = Number(v[i][4]);
    if (!sku && !asin) continue;
    var o = { margin: (isFinite(m) && m > 0) ? m : NaN, price: (isFinite(p) && p > 0) ? p : 0,
              memo: String(v[i][5] || ''), row: i + 2, byAsin: false };
    if (!(o.margin > 0) && !(o.price > 0)) continue;
    if (sku) out.bySku[sku] = o;
    else if (asin) out.byAsin[asin] = o;      // SKU 가 비어 있는 줄만 ASIN 열쇠로 쓴다
    out.n++;
  }
  return out;
}

/**
 * 표에서 고친 값을 기준값 시트로 밀어 올린다 (있으면 고치고, 없으면 붙인다).
 *
 * 이렇게 해야 값이 한 곳에 모인다 — 표는 다시 세우면 줄이 바뀌지만 이 시트는 남는다.
 * @param {Array<{sku,asin,name,margin,price}>} items
 * @return {{updated:number, added:number}}
 */
function adRefPush_(items) {
  var out = { updated: 0, added: 0 };
  if (!items || !items.length) return out;
  var id = String(adBasis_()['마진율 시트 ID'] || '').trim();
  if (!id) return out;
  var ss2, sh;
  try {
    ss2 = SpreadsheetApp.openById(id);
    sh = ss2.getSheetByName(AD_REF_TAB);
    if (!sh) {
      sh = ss2.insertSheet(AD_REF_TAB);
      sh.getRange(1, 1, 1, AD_REF_HEADER.length).setValues([AD_REF_HEADER])
        .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  } catch (e) {
    log_('ads', 'WARN', '기준값 시트에 못 썼습니다: ' + String(e).substring(0, 120));
    return out;
  }
  var last = sh.getLastRow();
  var v = last > 1 ? sh.getRange(2, 1, last - 1, AD_REF_HEADER.length).getValues() : [];
  var idx = {};
  for (var i = 0; i < v.length; i++) {
    var k = String(v[i][0] || '').trim();
    if (k) idx[k] = i;
  }
  var today = ymd_(new Date()), add = [], dirty = false;
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    if (!it.sku) continue;
    var row = idx[it.sku];
    if (row === undefined) {
      add.push([it.sku, it.asin || '', String(it.name || '').substring(0, 60),
                it.margin > 0 ? it.margin : '', it.price > 0 ? it.price : '',
                '광고 표에서 옮김', today]);
      out.added++;
    } else {
      var changed = false;
      if (it.margin > 0 && Math.abs(Number(v[row][3]) - it.margin) > 0.005) { v[row][3] = it.margin; changed = true; }
      if (it.price > 0 && Math.abs(Number(v[row][4]) - it.price) > 0.5) { v[row][4] = it.price; changed = true; }
      if (changed) { v[row][6] = today; out.updated++; dirty = true; }
    }
  }
  if (dirty && v.length) sh.getRange(2, 1, v.length, AD_REF_HEADER.length).setValues(v);
  if (add.length) {
    var at = Math.max(sh.getLastRow(), 1) + 1;
    var need = at + add.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(at, 1, add.length, AD_REF_HEADER.length).setValues(add);
  }
  return out;
}
