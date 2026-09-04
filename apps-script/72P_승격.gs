/**
 * 72P_승격.gs — 판 검색어를 제 캠페인으로 졸업시킨다
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 자동 캠페인은 '무슨 말로 사는지'를 찾아 주는 도구다. 찾고 나면 그 말은
 * 자동에 둘 이유가 없다 — 자동 그룹의 기본입찰 하나가 그 그룹의 모든 겨냥에
 * 함께 걸려서, 판 말에만 더 부르고 못 판 말에는 덜 부를 수가 없기 때문이다.
 *
 * 그래서 판 검색어는 수동 캠페인으로 옮긴다. 거기서는 키워드마다 값을 따로 부른다.
 * 옮긴 뒤에는 원래 자동 그룹에 그 말을 부정 정확 일치로 막는다 —
 * 안 막으면 같은 말에 우리 캠페인 둘이 서로 값을 올린다.
 *
 * ── 무엇이 막고 있었나 ──────────────────────────────────
 * 검색어 리포트(spSearchTerm)는 캠페인·광고그룹까지만 준다. 어느 SKU 가 팔았는지는
 * 알려주지 않는다. 그룹에 SKU 가 하나면 답이 하나뿐이라 알 수 있지만,
 * 옛 캠페인들은 한 그룹에 수천 개를 몰아넣어 두어서 알 길이 없다.
 *
 * 추정하지 않는다. 그룹의 SKU 가 정확히 하나일 때만 졸업시키고,
 * 나머지는 [승격SKU] 칸에 '(SKU 모름)' 이라 적어 그대로 남긴다.
 * 억지로 귀속을 추정해 넣으면, 몇 달 뒤 원인 모를 손해가 된다.
 *
 * 실제 자료(2026-09-04): 승격 1,754줄 중 SKU 를 아는 것 6줄.
 * 적어 보이지만 이 길은 앞을 보고 만든 것이다 — 우리가 만든 전용 캠페인(KP …)은
 * SKU 하나짜리라, 거기서 나오는 승격은 전부 졸업할 수 있다.
 *
 * ── 흐름 ───────────────────────────────────────────────
 *   ① 검색어 수집·판정 (72L)      승격/부정을 가른다
 *   ② 승격 캠페인 계획 (여기)      SKU 를 아는 승격줄 → 광고생성계획에 수동 캠페인 줄
 *   ③ 승인분 캠페인 생성 (72J)     MANUAL 로 만든다 (유형 칸이 '수동')
 *   ④ 검색어 승인분 반영 (72M)     키워드는 새 수동 그룹에, 부정은 원래 자동 그룹에
 *
 * 실행 경로를 두 벌 만들지 않는다. 트랙 B 와 마찬가지로 계획 표에 밀어넣기만 하면
 * 생성·켜기·관제·대장이 이미 있는 길로 흐른다.
 */

// 광고생성계획의 [트랙] 값. A = 재배분 · B = 육성 · M = 승격(수동).
// 관제(72N)는 B 만 따로 보고 나머지는 트랙 A 로 셈한다 — 승격도 마진 안에서 도는 것이라 맞다.
var ADPLAN_TRACK_M = 'M';
var ADPROMO_KIND = '승격';          // 계획 표의 [방식] 칸
var ADPROMO_MARK_UNKNOWN = '(SKU 모름)';
/**
 * 트랙 B(육성) 그룹의 승격은 지금 옮기지 않는다.
 *
 * 그 말은 이미 육성 캠페인이 손해배수를 얹어 사고 있다 — 그것이 트랙 B 다.
 * 여기서 손익분기 셈으로 만든 수동 캠페인에 같은 말을 올리면, 사려던 순위를
 * 제 캠페인 둘이 나눠 사면서 값만 올린다. 졸업해서 트랙 A 로 넘어온 뒤에 옮긴다.
 */
var ADPROMO_MARK_GROW = '(트랙 B — 졸업 뒤에)';

/**
 * 광고그룹 → 그 그룹이 광고하는 SKU. 정확히 하나일 때만 답한다.
 *
 * 시트만 읽는다 (광고생성계획 · 광고그룹 · 광고상품). API 를 부르지 않는다 —
 * 판단 단계에서 API 를 읽다가 타임아웃 난 것이 이 코드베이스에서만 네 번이다.
 */
function adPromoSkuByGroup_() {
  var out = {};

  // ① 우리가 만든 것 — 계획 표가 곧 답이다. 가장 믿을 만하므로 먼저 넣는다
  //    두 표를 다 본다 (트랙 A·M 은 광고생성계획, 트랙 B 는 광고육성계획)
  adPlanEachRow_(function (row) {
    var pg = String(row[AP_GID - 1] || '').trim();
    var lst = String(row[AP_SKUS - 1] || '').split(',')
                .map(function (x) { return x.trim(); })
                .filter(function (x) { return x; });
    if (pg && lst.length === 1) out[pg] = lst[0];
  });

  // ② 옛 캠페인 — 광고그룹의 [SKU수] 가 1 인 것만. '25개 넘음' 같은 글자는 숫자가 아니라 걸러진다
  var gsh = ss_().getSheetByName(SHEET_ADGRP);
  if (!gsh || gsh.getLastRow() < 2) return out;
  var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
  var solo = {};
  for (var g = 0; g < gv.length; g++) {
    if (Number(gv[g][5]) !== 1) continue;
    var gid = String(gv[g][9] || '').trim();
    if (gid && !out[gid]) solo[gid] = true;
  }

  // 그 그룹의 SKU 는 광고상품에서 찾는다. 한 그룹에 후보가 둘 이상이면 답하지 않는다 —
  // 광고상품의 [광고그룹ID들]은 앞 6개만 남기므로 자를 때 겹칠 수 있다
  var dsh = ss_().getSheetByName(SHEET_ADPROD);
  if (!dsh || dsh.getLastRow() < 2) return out;
  var dv = dsh.getRange(2, 1, dsh.getLastRow() - 1, ADPROD_HEADER.length).getValues();
  var cand = {};
  for (var d = 0; d < dv.length; d++) {
    var ids = String(dv[d][6] || '').split(',');
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i].trim();
      if (!id || !solo[id]) continue;
      (cand[id] || (cand[id] = [])).push(String(dv[d][0]));
    }
  }
  for (var ck in cand) if (cand[ck].length === 1) out[ck] = cand[ck][0];
  return out;
}

/** 승격 캠페인 이름. 아마존은 아스키만 받으므로 ASIN 을 쓰고, 없으면 SKU 로 만든 번호 */
function adPromoCampName_(prefix, sku, asin) {
  var a = String(asin || '').trim();
  if (/^[A-Za-z0-9]{6,20}$/.test(a)) return prefix + ' EXACT ' + a;
  return prefix + ' EXACT SKU' + adShortHash_(sku);
}

/** 이미 만들어 둔 승격 캠페인 이름 → 그 캠페인·광고그룹 ID (72M 이 여기로 키워드를 올린다) */
function adPromoTargets_() {
  var out = {};
  adPlanEachRow_(function (row) {
    if (String(row[ADPLAN_HEADER.length - 1]) !== ADPLAN_TRACK_M) return;
    var nm = String(row[AP_NAME - 1] || '').trim();
    if (!nm) return;
    out[nm] = { cid: String(row[AP_CID - 1] || '').trim(),
                gid: String(row[AP_GID - 1] || '').trim(),
                approved: row[AP_APPROVE - 1] === true,
                result: String(row[AP_RESULT - 1] || '') };
  });
  return out;
}

/**
 * 메뉴: 승격 검색어 → 수동 캠페인 계획.
 *
 * 광고검색어의 [승격SKU]·[승격캠페인] 칸을 채우고, SKU 마다 수동 캠페인 한 줄을
 * 광고생성계획에 넣는다. 한 SKU 의 승격 검색어가 여럿이면 캠페인은 하나다 —
 * 키워드를 여러 개 담는 것이 수동 캠페인이 하는 일이다.
 */
function planAdPromote() {
  var sh = getSheetOrThrow_(SHEET_ADTERM);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADTERM + '" 이 비어 있습니다. 먼저 검색어를 수집하세요.');
  // [승격SKU]·[승격캠페인] 은 나중에 붙인 칸이라, 옛 표는 아직 좁을 수 있다
  fitCols_(sh, ADTERM_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADTERM_HEADER.length).getValues();

  var basis = adBasis_();
  var prefix = adAsciiName_(basis['캠페인 이름 앞머리'] || 'KP', 'KP');
  var byGroup = adPromoSkuByGroup_();
  var asinMap = adSkuAsin_();

  // 재배분 표에서 그 SKU 의 채산성을 가져온다 (예산·기본입찰용)
  var eco = {};
  var rsh = ss_().getSheetByName(SHEET_REALLOC);
  if (rsh && rsh.getLastRow() > 1) {
    var rv = rsh.getRange(2, 1, rsh.getLastRow() - 1, REALLOC_HEADER.length).getValues();
    for (var r = 0; r < rv.length; r++) {
      var rk = String(rv[r][0] || '').trim();
      if (rk) eco[rk] = { beCpa: Number(rv[r][10]) || 0, rec: Number(rv[r][11]) || 0,
                          cap: Number(rv[r][12]) || 0, amt: Number(rv[r][19]) || 0,
                          asin: String(rv[r][20] || '') };
    }
  }

  var growGrp = adGrowGroups_();
  var bySku = {}, nKnown = 0, nUnknown = 0, nDone = 0, nGrow = 0;
  var colSku = [], colCamp = [];
  for (var i = 0; i < v.length; i++) {
    var isPromo = String(v[i][AT_VERDICT]) === '승격';
    if (!isPromo) { colSku.push(['']); colCamp.push(['']); continue; }
    var gid = String(v[i][AT_GID] || '').trim();
    if (growGrp[gid]) {
      nGrow++;
      colSku.push([ADPROMO_MARK_GROW]); colCamp.push(['']);
      continue;
    }
    var sku = byGroup[gid] || '';
    if (!sku) {
      nUnknown++;
      colSku.push([ADPROMO_MARK_UNKNOWN]); colCamp.push(['']);
      continue;
    }
    var asin = asinMap[sku] || (eco[sku] && eco[sku].asin) || '';
    var name = adPromoCampName_(prefix, sku, asin);
    nKnown++;
    colSku.push([sku]); colCamp.push([name]);
    if (String(v[i][AT_APPLIED] || '').indexOf('성공') === 0) nDone++;
    var b = bySku[sku] || (bySku[sku] = { sku: sku, asin: asin, name: name, terms: [], beCpa: 0, maxBid: 0 });
    b.terms.push(String(v[i][AT_TERM] || ''));
    var bc = Number(v[i][AT_BECPA]) || 0;
    if (bc > 0 && (!b.beCpa || bc < b.beCpa)) b.beCpa = bc;
    // 재배분 표에 그 SKU 가 없을 때 쓸 기본입찰 — 올릴 키워드 중 가장 비싼 값
    var tb = adTermBid_(v[i], Number(basis['목표 ACOS 비율']) || 0.65);
    if (tb > b.maxBid) b.maxBid = tb;
  }

  sh.getRange(2, AT_PROMO_SKU + 1, colSku.length, 1).setValues(colSku);
  sh.getRange(2, AT_PROMO_CAMP + 1, colCamp.length, 1).setValues(colCamp);

  var skus = [];
  for (var sk in bySku) skus.push(bySku[sk]);
  if (!skus.length) {
    showSheet_(SHEET_ADTERM);
    ui_().alert('졸업시킬 줄이 없습니다.',
      '승격 판정 중 어느 SKU 가 판 것인지 아는 줄이 없습니다.' +
      (nGrow ? '\n\n트랙 B(육성) 그룹의 승격 ' + nGrow + '줄은 옮기지 않습니다 — ' +
               '이미 육성 캠페인이 그 말을 사고 있습니다. 졸업 뒤에 옮깁니다.' : '') +
      (nUnknown ? '\n\nSKU 모름 ' + nUnknown.toLocaleString() + '줄 — 한 광고그룹에 SKU 를 ' +
                  '여러 개 담은 옛 캠페인입니다.\n검색어 리포트는 그룹까지만 알려주므로, ' +
                  '어느 상품이 팔았는지 알 수 없습니다.\n추정하지 않고 그대로 둡니다.' : '') +
      '\n\n우리가 만든 전용 캠페인(' + prefix + ' …)에서 승격이 나오면 여기서 잡힙니다.',
      ui_().ButtonSet.OK);
    return;
  }

  // 계획 표에 넣는다 (트랙 B 와 같은 방식)
  var psh = ensureSheet_(SHEET_ADPLAN, ADPLAN_HEADER);
  var pv = psh.getLastRow() > 1
    ? psh.getRange(2, 1, psh.getLastRow() - 1, ADPLAN_HEADER.length).getValues() : [];
  var byName = {};
  for (var p2 = 0; p2 < pv.length; p2++) byName[String(pv[p2][AP_NAME - 1]).trim()] = p2;

  var added = 0, updated = 0, daily = 0;
  for (var s = 0; s < skus.length; s++) {
    var o = skus[s];
    var e = eco[o.sku] || { beCpa: 0, rec: 0, cap: 0, amt: 0 };
    var beCpa = e.beCpa || o.beCpa;
    // 수동 캠페인은 키워드마다 값을 따로 부른다. 그룹 기본입찰은 키워드에 값이 없을 때만
    // 쓰이는 받침이라, 재배분의 권장 CPC 를 쓰고 없으면 올릴 키워드 중 가장 비싼 값을 쓴다
    var bid = Math.round(e.rec || o.maxBid || 0);
    if (bid < ADTERM_BID_MIN) bid = ADTERM_BID_MIN;
    if (e.cap > 0 && bid > e.cap) bid = Math.floor(e.cap);   // 상한을 넘기면 팔수록 손해다
    var d = adPlanDaily_(beCpa, e.amt, basis);

    var row = new Array(ADPLAN_HEADER.length).fill('');
    row[0] = 'M' + (s + 1);
    row[AP_ACTION - 1] = '생성';
    row[2] = ADPROMO_KIND;                    // 방식
    row[AP_NAME - 1] = o.name;
    row[4] = '수동';                          // 유형 — 72J 가 이 칸을 보고 MANUAL 로 만든다
    row[AP_DAILY - 1] = d;
    row[AP_BID - 1] = bid;
    row[7] = 1;                               // SKU수
    row[8] = 0;                               // 기존SKU수
    row[9] = o.sku;                           // 대표SKU
    row[10] = ADPROMO_KIND;                   // CPC구간
    row[11] = Math.round(beCpa) || '';
    row[12] = Math.round(e.amt) || '';
    row[13] = '실행 시 확인';
    row[14] = '자동 캠페인에서 판 검색어 ' + o.terms.length + '개를 정확 일치로 옮긴다: ' +
              o.terms.slice(0, 3).map(function (t) { return '"' + t + '"'; }).join(', ') +
              (o.terms.length > 3 ? ' 외 ' + (o.terms.length - 3) + '개' : '');
    row[AP_SKUS - 1] = o.sku;
    row[AP_APPROVE - 1] = false;              // 돈이 나가는 것은 언제나 사람이 한 번 더
    row[ADPLAN_HEADER.length - 1] = ADPLAN_TRACK_M;

    daily += d;
    if (byName[o.name] !== undefined) {
      var at = byName[o.name];
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

  log_('ads', 'INFO', '승격 캠페인 계획 — 상품 ' + skus.length + '개 · 검색어 ' +
       nKnown + '줄 · SKU 모름 ' + nUnknown + '줄');
  showSheet_(SHEET_ADPLAN);
  ui_().alert('승격 캠페인 계획',
    '수동 캠페인 ' + skus.length + '개 (새로 ' + added +
    (updated ? ' · 값 갱신 ' + updated : '') + ') · 하루 예산 합계 ¥' + daily.toLocaleString() + '\n' +
    '옮길 검색어 ' + nKnown + '줄' + (nDone ? ' (이미 올린 ' + nDone + '줄 포함)' : '') + '\n' +
    (nUnknown ? 'SKU 모름 ' + nUnknown.toLocaleString() + '줄 — 그대로 둡니다\n' : '') +
    (nGrow ? '트랙 B ' + nGrow + '줄 — 졸업 뒤에 옮깁니다\n' : '') + '\n' +
    '다음:\n' +
    '  ① 광고생성계획에서 이 줄들의 [승인] 을 체크\n' +
    '  ② [⑤ 승인분 캠페인 생성] — 멈춤 상태로 만들어집니다\n' +
    '  ③ [매주 ③ 검색어 판정 승인] → [매주 ④ 검색어 승인분 반영]\n' +
    '      키워드는 새 수동 그룹에 올라가고, 원래 자동 그룹에는 같은 말이 부정으로 막힙니다\n' +
    '  ④ [켜기 — 승인 ✓ 만] — 키워드를 넣은 다음에 켜세요. 빈 캠페인을 켜면 아무 일도 안 일어납니다',
    ui_().ButtonSet.OK);
}

/**
 * 승격 한 줄이 갈 곳. 없으면 name 이 빈 값이다.
 *
 * 줄마다 계획 표를 다시 읽으면 2만 줄에 2만 번이라 한 번만 읽고 들고 있는다.
 * 한 실행 안에서만 사는 값이라 도중에 시트가 바뀌어도 문제가 없다 —
 * 실행 중에는 어차피 adBusyGuard_ 가 다른 작업을 막는다.
 */
var ADPROMO_TARGET_CACHE = null;
function adTermPromoTarget_(row) {
  var name = String(row[AT_PROMO_CAMP] || '').trim();
  if (!name) return { name: '', cid: '', gid: '' };
  if (!ADPROMO_TARGET_CACHE) ADPROMO_TARGET_CACHE = adPromoTargets_();
  var t = ADPROMO_TARGET_CACHE[name] || {};
  return { name: name, cid: String(t.cid || ''), gid: String(t.gid || '') };
}
