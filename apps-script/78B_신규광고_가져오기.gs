/**
 * 78B_신규광고_가져오기.gs — ① 광고할 물건 가져오기
 *
 * 바깥 '상품 목록' 에서 아직 안 본 SKU 를 읽어, 상품군으로 묶고, 마진으로 감당 가능한
 * 입찰을 셈하고, 무엇을 광고할지 정해 [상품통합]·[상품군광고] 에 적는다.
 * **아마존을 건드리지 않는다. 돈이 나가지 않는다.**
 *
 * ── 무엇으로 무엇을 확인하나 ────────────────────────────
 *   바깥 '상품 목록'   O열 SKU · C열 조달비(원) · I열 판매가 · A열 소싱URL · F열 수집일시
 *   운영 '리스팅'      아마존에 실제로 올라갔나 · 지금 판매가 · 재고 · 상태 (매일 04시 갱신)
 *   운영 '상품광고목록' 이미 광고 중인가 (사람이 tiktok 에 넣은 것 · EXPAND 가 보는 것)
 *   마진 사슬(72AA)    조달비로 실측 마진 → 주문당공헌이익 G
 *
 * ── 대표 옵션 하나만 ────────────────────────────────────
 * 옵션이 여섯이라고 탐색비를 여섯 배 주지 않는다. 상품군마다 하나를 고르고 나머지는
 * 옵션대기다. 근거가 없을 때 고르는 규칙은 구현 가능하게 못 박아 둔다 —
 * 가장 싼 적격 옵션의 [옵션 가격대] 안에 드는 것 중 G × q0 가 큰 것. 배수 상품이면
 * 대개 단품(-1)이 뽑힌다. 묶음이 절대 마진이 크다는 이유로 고가를 우선하지 않는다.
 *
 * ── 다시 눌러도 안전하다 ────────────────────────────────
 * 이미 본 SKU 는 새로 만들지 않고 바뀐 것(판매가·조달비·리스팅 상태)만 고친다.
 * 아직 시작 안 한 줄(가져옴·정보대기·옵션대기·예산대기·제외)은 누를 때마다 배분을 다시
 * 셈한다 — 아마존 등록이 며칠 늦어 '정보대기' 였던 것, 리스팅이 살아난 것이 저절로 옮겨 온다.
 * 이미 시작한 줄(소액운영 이후)은 값만 고치고 배분·상태는 매일 주기가 맡는다.
 * [소유] 가 NEW_ADS 가 아닌 줄은 사람이 잡은 것이다 — 아예 건드리지 않는다.
 * 6분에 걸리면 거기까지 적고 남은 수를 알린다. 새 상품군을 먼저 돌므로 다시 누르면 이어 간다
 * (같은 자리에서 매번 끊기지 않는다).
 */

/**
 * 정기 작업: 매일 10시 — 새 SKU 를 읽어 셈한다. 돈이 나가지 않으므로 조건 없이 돈다.
 *
 * 잠금이 바쁘면(다른 걸음이 20초 넘게 쥐고 있으면) 그날치를 버리지 않고 3분 뒤 다시 온다 —
 * withLock_ 은 건너뛰고, withLockOrRetry_ 는 매일 트리거까지 지우므로(rescheduleContinue_)
 * 둘 다 정기 작업엔 안 맞는다. adSchedRun_ 의 '리포트 준비 중' 되돌림을 그대로 쓴다
 */
function scheduledNewAdsImport() {
  return adSchedRun_('scheduledNewAdsImport', '신규 가져오기', function () {
    var r = withLock_('신규 상품 광고 가져오기', function () { return naImportRun_({ quiet: true }); });
    return r.ran ? '완료' : ADSPEND_PENDING;
  });
}

/** 메뉴 ①: 광고할 물건 가져오기 */
function naImport() {
  if (!adBusyGuard_('① 광고할 물건 가져오기')) return;
  var r = naImportRun_({ quiet: false });
  if (r.blocked) { ui_().alert('① 가져오기', r.blocked, ui_().ButtonSet.OK); return; }
  var pol = naPolicy_();
  ui_().alert('① 광고할 물건 가져오기',
    '소싱 시트에서 읽은 SKU ' + r.read + '개 (새로 ' + r.added + ' · 고침 ' + r.updated + ')\n' +
    '상품군 ' + r.fams + '개\n\n' +
    '배분:\n' +
    Object.keys(r.alloc).sort().map(function (k) { return '   ' + k + ' ' + r.alloc[k]; }).join('\n') +
    '\n\n' +
    (r.startable
      ? '지금 시작할 수 있는 상품군 ' + r.startable + '개 (주 한도 ' + pol.weekStarts + ')\n' +
        '시작 입찰: 중앙 ¥' + r.bidMid + ' · 가장 낮음 ¥' + r.bidLo + ' · 가장 높음 ¥' + r.bidHi + '\n\n'
      : '지금 시작할 수 있는 것이 없습니다.\n\n') +
    (r.left ? '⚠ 시간이 다 돼 ' + r.left + '개를 남겼습니다 — 다시 누르면 이어 갑니다.\n\n' : '') +
    naGateText_(pol) +
    '여기서는 아무것도 바꾸지 않았습니다. 셈해서 적었을 뿐입니다.\n' +
    '[' + NA_SHEET_ITEM + '] 표에서 [배분]·[사유] 를 보고, 맞으면 [② 실행하기] 를 누르세요.',
    ui_().ButtonSet.OK);
}

/**
 * @param {Object} opts {quiet, limit}
 * @return {{read,added,updated,fams,alloc,startable,bidLo,bidMid,bidHi,left,blocked}}
 */
function naImportRun_(opts) {
  var quiet = !!(opts && opts.quiet);
  var out = { read: 0, added: 0, updated: 0, fams: 0, alloc: {}, startable: 0,
              bidLo: 0, bidMid: 0, bidHi: 0, left: 0, blocked: '' };
  var t0 = Date.now();
  var pol = naPolicy_();

  // ① 소싱 시트 — SKU 가 채워진 줄만
  var src;
  try { src = naSourceRows_(); } catch (e) { out.blocked = String(e); return out; }
  if (!src.length) {
    out.blocked = '바깥 [상품 목록] 에 SKU 가 채워진 줄이 없습니다.\n' +
      'O열(머리글 없는 열)에 아마존 SKU 가 들어와야 이 프로그램이 볼 수 있습니다.';
    return out;
  }
  out.read = src.length;

  // ② 운영 시트에서 확인할 것들
  var listing = naListingMap_();                 // SKU → {asin, price, stock, state}
  var onAd = {};
  try {
    var units = adUnitMap_();
    for (var s0 in units) if (units[s0].on > 0) onAd[s0] = true;
  } catch (e) { log_('newads', 'WARN', '상품광고목록을 못 읽었습니다: ' + String(e).substring(0, 120)); }
  var ctx = adMarginCtx_(true);

  // ③ 이미 본 것
  var ish = naSheet_(NA_SHEET_ITEM, NA_ITEM_HEADER);
  var have = {}, rows = [];
  if (ish.getLastRow() > 1) {
    rows = ish.getRange(2, 1, ish.getLastRow() - 1, NA_ITEM_HEADER.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var k = String(rows[i][NA_I_SKU] || '').trim();
      if (k) have[k] = i;
    }
  }
  var today = ymd_(new Date());
  // 이미 시작한 줄(mine)과 사람이 잡은 줄(hold). 둘 다 그 상품군의 대표로 남는다 —
  // 다른 옵션을 대표로 새로 뽑아 ② 가 한 상품군에 둘을 시작하는 일을 막는다
  var live = naLiveStates_();
  var mine = {}, hold = {};
  for (var s1 in have) {
    var r1 = rows[have[s1]];
    if (String(r1[NA_I_OWNER] || '').trim() !== NA_OWNER) { hold[s1] = true; mine[s1] = NAR_HOLD; }
    else if (live[String(r1[NA_I_STATE] || '')]) mine[s1] = String(r1[NA_I_STATE]);
  }

  // ④ 상품군 단위로 셈한다 — 새 상품군을 먼저, 옵션은 붙여서 (시간이 다 되면 상품군 사이에서 끊는다)
  var groups = naOrderGroups_(src, have);
  var calc = {}, add = [], touched = {};
  for (var g = 0; g < groups.length; g++) {
    if (Date.now() - t0 > NA_SOFT_MS) {
      for (var g2 = g; g2 < groups.length; g2++) out.left += groups[g2].rows.length;
      break;
    }
    var grp = groups[g];
    for (var r2 = 0; r2 < grp.rows.length; r2++) {
      var it = grp.rows[r2];
      (touched[grp.key] || (touched[grp.key] = [])).push(it.sku);
      if (hold[it.sku]) continue;                       // 사람이 잡은 줄은 셈하지 않는다
      calc[it.sku] = naCalcOne_(it, listing, onAd, ctx, pol, mine);
    }
  }

  // ⑤ 상품군마다 대표를 고른다
  var famRep = {};
  for (var f in touched) {
    famRep[f] = naPickRep_(touched[f], calc, pol, mine);
  }

  // ⑥ 표에 반영 — 새 줄은 붙이고, 이미 있는 줄은 바뀐 칸만 고친다
  var dirty = false;
  for (var h in hold) if (touched[naFamilyKey_(h)]) out.alloc['사람이 잡음'] = (out.alloc['사람이 잡음'] || 0) + 1;
  for (var sku in calc) {
    var c = calc[sku], rep = (famRep[c.fam] === sku);
    var alloc = naAllocOf_(c, rep, pol);
    var bucket = mine[sku] ? '운영 중 · ' + mine[sku] : alloc.a;
    out.alloc[bucket] = (out.alloc[bucket] || 0) + 1;
    if (have[sku] === undefined) {
      add.push(naItemRow_(c, rep, alloc, today));
      out.added++;
    } else {
      var row = rows[have[sku]];
      if (naItemUpdate_(row, c, rep, alloc, today, live)) { out.updated++; dirty = true; }
    }
  }
  if (dirty) ish.getRange(2, 1, rows.length, NA_ITEM_HEADER.length).setValues(rows);
  if (add.length) {
    var at = Math.max(ish.getLastRow(), 1) + 1;
    if (ish.getMaxRows() < at + add.length - 1) {
      ish.insertRowsAfter(ish.getMaxRows(), at + add.length - 1 - ish.getMaxRows());
    }
    ish.getRange(at, 1, add.length, NA_ITEM_HEADER.length).setValues(add);
  }

  // ⑦ 상품군 표
  out.fams = naFamWrite_(touched, calc, famRep, pol, today, live);

  // ⑧ 시작할 수 있는 것 셈 (실제 시작은 ② 가 한다)
  var bids = [];
  for (var s2 in calc) {
    if (famRep[calc[s2].fam] !== s2 || mine[s2]) continue;
    if (naAllocOf_(calc[s2], true, pol).a !== NAA_START) continue;
    out.startable++;
    if (calc[s2].bid > 0) bids.push(calc[s2].bid);
  }
  bids.sort(function (a, b) { return a - b; });
  if (bids.length) {
    out.bidLo = bids[0]; out.bidHi = bids[bids.length - 1];
    out.bidMid = bids[Math.floor(bids.length / 2)];
  }
  naItemNotes_();
  log_('newads', 'INFO', '① 가져오기 — 읽음 ' + out.read + ' · 새로 ' + out.added +
       ' · 고침 ' + out.updated + ' · 상품군 ' + out.fams + ' · 시작가능 ' + out.startable +
       (out.left ? ' · 남음 ' + out.left : ''));
  return out;
}

/**
 * 바깥 '상품 목록' 에서 SKU 가 채워진 줄. 같은 SKU 가 여럿이면 마지막 줄을 쓴다.
 * @return {Array<{sku,krw,price,margin,ship,name,url,at}>}
 */
function naSourceRows_() {
  var id = String(adBasis_()['마진율 시트 ID'] || '').trim();
  if (!id) throw new Error('광고기준에 [마진율 시트 ID] 가 비어 있습니다 — 소싱 시트를 읽을 수 없습니다.');
  var sh;
  try { sh = SpreadsheetApp.openById(id).getSheetByName(SRCCOST_TAB); }
  catch (e) { throw new Error('소싱 시트를 열 수 없습니다: ' + String(e).substring(0, 150)); }
  if (!sh || sh.getLastRow() < 2) throw new Error('소싱 시트의 [' + SRCCOST_TAB + '] 이 비어 있습니다.');
  var n = sh.getLastRow() - 1;
  var v = sh.getRange(2, 1, n, SRCCOST_COL_SHIP).getValues();
  var by = {};
  for (var i = 0; i < n; i++) {
    var sku = String(v[i][SRCCOST_COL_SKU - 1] || '').trim();
    if (!sku) continue;                                   // O열이 생기기 전 줄
    var krw = srcKrw_(v[i][SRCCOST_COL_KRW - 1]);
    if (!(krw > 0)) continue;
    by[sku] = { sku: sku, krw: krw,
      price: Number(String(v[i][SRCCOST_COL_PRICE - 1]).replace(/,/g, '')) || 0,
      margin: Number(String(v[i][SRCCOST_COL_MJPY - 1]).replace(/,/g, '')) || 0,
      ship: String(v[i][SRCCOST_COL_SHIP - 1] || '').trim(),
      name: String(v[i][6] || '').trim(),                 // G 일본어 상품명
      url: String(v[i][0] || '').trim(),                  // A 소싱URL
      at: adYmd_(v[i][5]) };                              // F 수집 일시
  }
  var out = [];
  for (var k in by) out.push(by[k]);
  return out;
}

/**
 * 소싱 줄을 상품군으로 묶고, 아직 [상품통합] 에 없는 SKU 가 든 상품군을 앞에 둔다.
 * 시간이 다 돼 끊겨도 다음에 누르면 새 것부터 다시 도니 매번 같은 자리에서 멈추지 않는다.
 * @return {Array<{key, rows, fresh}>}
 */
function naOrderGroups_(src, have) {
  var by = {}, order = [];
  for (var i = 0; i < src.length; i++) {
    var f = naFamilyKey_(src[i].sku);
    var g = by[f];
    if (!g) { g = by[f] = { key: f, rows: [], fresh: false, seq: order.length }; order.push(g); }
    g.rows.push(src[i]);
    if (have[src[i].sku] === undefined) g.fresh = true;
  }
  order.sort(function (a, b) {
    if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
    return a.seq - b.seq;
  });
  return order;
}

/** 이미 시작한 뒤의 상태 — 가져오기가 배분·상태를 덮지 않는다 */
function naLiveStates_() {
  var live = {};
  live[NAS_PROBE] = 1; live[NAS_WATCH] = 1; live[NAS_PROFIT] = 1;
  live[NAS_HANDED] = 1; live[NAS_MATURE] = 1; live[NAS_STOP] = 1; live[NAS_COOL] = 1;
  return live;
}

/** 리스팅 → SKU: {asin, price, stock, state} */
function naListingMap_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_LISTING);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, LISTING_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var k = String(v[i][0] || '').trim();
    if (!k) continue;
    out[k] = { asin: String(v[i][1] || '').trim(), price: Number(v[i][6]) || 0,
               stock: Number(v[i][7]) || 0, state: String(v[i][8] || '').trim() };
  }
  return out;
}

/**
 * 한 SKU 의 셈. 시트를 쓰지 않는다.
 * @return {Object} {sku, fam, asin, name, url, krw, jpy, price, mpct, msrc, G, q, cap, bid, block, why, listed}
 */
function naCalcOne_(it, listing, onAd, ctx, pol, mine) {
  var o = { sku: it.sku, fam: naFamilyKey_(it.sku), name: it.name, url: it.url,
            krw: it.krw, jpy: 0, price: 0, mpct: 0, msrc: '', G: 0, q: pol.q0,
            cap: 0, bid: 0, block: '', why: '', note: '', listed: false, at: it.at,
            asin: '', stock: 0 };
  var L = listing[it.sku];
  if (!L) {
    o.block = NAR_NOT_LISTED;
    o.why = '아직 아마존 리스팅에 없습니다 — 등록이 끝나면 다음 가져오기에 잡힙니다';
    return o;
  }
  o.listed = true; o.asin = L.asin; o.stock = L.stock;
  // 판매가는 리스팅의 지금 값이 먼저 (매일 리프라이싱한다). 없으면 소싱 시트의 값
  o.price = L.price > 0 ? L.price : it.price;
  if (!(o.price > 0)) {
    o.block = NAR_MARGIN_MISSING; o.why = '판매가를 모릅니다'; return o;
  }
  // 상태는 정확히 맞춘다 — 'Inactive' 에도 'active' 가 들어 있다
  if (!NA_LISTING_OK[String(L.state || '').trim().toLowerCase()]) {
    o.block = NAR_LISTING_OFF;
    o.why = '리스팅 상태가 "' + (L.state || '(빈칸)') + '" 입니다 — 살 수 없는 것에는 광고하지 않습니다';
    return o;
  }
  if (!(L.stock > 0)) {
    o.block = NAR_NO_STOCK;
    o.why = '리스팅 재고가 0 입니다 — 살 수 없는 것에는 광고하지 않습니다';
    return o;
  }
  // 광고가 붙어 있어도 그것이 NEW_ADS 가 시작한 것이면 '이미 광고 중' 이 아니다
  if (onAd[it.sku] && !(mine && mine[it.sku])) {
    o.block = NAR_ALREADY;
    o.why = '이미 광고 중입니다 — 다른 프로그램이나 사람이 넣은 것입니다. NEW_ADS 는 손대지 않습니다';
    return o;
  }
  // 마진 — 72AA 사슬 (기준값 시트 > 표 > 원가 탭 > 소싱 조달비 > 이름 > 기본값)
  var m = adMarginFor_(ctx, it.sku, o.price, it.name, null, o.asin);
  o.mpct = Number(m.pct) || 0; o.msrc = String(m.src || '');
  if (o.msrc === MSRC_DEFAULT) {
    o.block = NAR_MARGIN_MISSING;
    o.why = '조달비를 몰라 마진을 셀 수 없습니다 — 신규 상품에는 기본 마진율을 쓰지 않습니다';
    return o;
  }
  // 바깥 시트의 마진율은 표시·검증용 — 같은 판매가에서 우리 셈과 크게 어긋나면 사유에 적는다
  if (it.margin && it.price > 0 && Math.abs(it.price - o.price) < 1) {
    var sp = it.margin / it.price * 100;
    if (Math.abs(sp - o.mpct) >= NA_MISMATCH_PP) {
      o.note = '⚠ 바깥 시트 마진율 ' + sp.toFixed(1) + '% 와 ' + Math.abs(sp - o.mpct).toFixed(1) +
               '%p 어긋남 (' + NAR_MARGIN_MISMATCH + ') — 배송비·수수료·환율 가운데 한쪽이 다릅니다';
    }
  }
  if (!(o.mpct > 0)) {
    o.block = NAR_LOSS;
    o.why = m.why || '이 값·조달비로는 팔수록 손해입니다';
    return o;
  }
  if (ctx.rate > 0) o.jpy = it.krw / ctx.rate;
  o.G = o.price * o.mpct / 100;
  o.cap = o.G * o.q * pol.beta;
  if (pol.maxBid > 0) o.cap = Math.min(o.cap, pol.maxBid);
  o.bid = Math.floor(o.cap * pol.startFrac * 100) / 100;
  if (o.cap < NA_MIN_BID) {
    o.block = NAR_BELOW_MIN;
    o.why = '감당 가능한 입찰이 ¥' + (Math.round(o.cap * 100) / 100) + ' 로 아마존 최소 ¥' +
            NA_MIN_BID + ' 에 못 미칩니다 — 마진으로는 광고할 수 없는 상품입니다';
    return o;
  }
  if (o.bid < NA_MIN_BID) o.bid = NA_MIN_BID;
  o.why = '주문당공헌이익 ¥' + Math.round(o.G) + ' × 판단주문율 ' + (o.q * 100).toFixed(1) +
          '% × ' + pol.beta + ' = 허용 ¥' + (Math.round(o.cap * 100) / 100) +
          ' · 시작 ¥' + o.bid + ' (' + o.msrc + ')';
  return o;
}

/**
 * 상품군의 대표 옵션. 근거가 없을 때의 규칙을 못 박는다 —
 * 적격인 것 중 가장 싼 것의 [옵션 가격대] 안에 드는 것들 중 G × q0 가 큰 것.
 * 배수 상품이면 대개 단품이 뽑힌다. 동률은 SKU 문자열 순 (매번 대표가 바뀌지 않게).
 */
function naPickRep_(skus, calc, pol, mine) {
  // 이미 시작한 옵션이나 사람이 잡은 옵션이 있으면 그것이 대표다 — 새로 뽑지 않는다
  var held = [];
  for (var h = 0; h < skus.length; h++) if (mine && mine[skus[h]]) held.push(skus[h]);
  if (held.length) { held.sort(); return held[0]; }
  var ok = [];
  for (var i = 0; i < skus.length; i++) {
    var c = calc[skus[i]];
    if (c && !c.block && c.bid >= NA_MIN_BID) ok.push(c);
  }
  if (!ok.length) return '';
  var lo = 0;
  for (var j = 0; j < ok.length; j++) if (!lo || ok[j].price < lo) lo = ok[j].price;
  var band = ok.filter(function (c) { return c.price <= lo * pol.priceBand; });
  if (!band.length) band = ok;
  band.sort(function (a, b) {
    var d = (b.G * b.q) - (a.G * a.q);
    if (Math.abs(d) > 0.0001) return d;
    return a.sku < b.sku ? -1 : (a.sku > b.sku ? 1 : 0);
  });
  return band[0].sku;
}

/** 이 SKU 의 배분과 사유 */
function naAllocOf_(c, isRep, pol) {
  if (c.block === NAR_NOT_LISTED || c.block === NAR_MARGIN_MISSING) {
    return { a: NAA_INFO, why: c.why, state: NAS_INFO };
  }
  var note = c.note ? ' · ' + c.note : '';
  if (c.block) return { a: NAA_EXCLUDE, why: c.why + note, state: NAS_EXCLUDE };
  if (!isRep) {
    return { a: NAA_VARWAIT,
             why: '같은 상품군의 대표 옵션을 먼저 봅니다 (' + NAR_VARWAIT + ')' + note,
             state: NAS_VARWAIT };
  }
  return { a: NAA_START, why: c.why + note, state: NAS_NEW };
}

function naItemRow_(c, isRep, alloc, today) {
  var r = new Array(NA_ITEM_HEADER.length).fill('');
  r[NA_I_SKU] = c.sku; r[NA_I_ASIN] = c.asin; r[NA_I_FAM] = c.fam;
  r[NA_I_NAME] = c.name; r[NA_I_URL] = c.url;
  r[NA_I_KRW] = c.krw; r[NA_I_JPY] = c.jpy ? Math.round(c.jpy) : '';
  r[NA_I_PRICE] = c.price || ''; r[NA_I_MPCT] = c.mpct || ''; r[NA_I_MSRC] = c.msrc;
  r[NA_I_G] = c.G ? Math.round(c.G) : '';
  r[NA_I_Q] = c.q ? Math.round(c.q * 1000) / 10 : '';
  r[NA_I_CAP] = c.cap ? Math.round(c.cap * 100) / 100 : '';
  r[NA_I_BID] = c.bid || '';
  r[NA_I_REP] = isRep ? 'O' : '';
  r[NA_I_ALLOC] = alloc.a; r[NA_I_WHY] = alloc.why; r[NA_I_STATE] = alloc.state;
  r[NA_I_OWNER] = NA_OWNER;
  r[NA_I_AT] = c.at; r[NA_I_IN] = today; r[NA_I_NEXT] = today;
  return r;
}

/**
 * 이미 있는 줄을 고친다. 사람이나 다음 걸음이 만든 상태는 덮지 않는다 —
 * 이미 시작한 것(소액운영 이후)의 배분·상태를 다시 '가져옴' 으로 되돌리면
 * ② 가 같은 상품을 또 시작한다.
 * @return {boolean} 바뀐 것이 있나
 */
function naItemUpdate_(row, c, isRep, alloc, today, live) {
  if (!live) live = naLiveStates_();
  if (String(row[NA_I_OWNER] || '').trim() !== NA_OWNER) return false;   // 사람이 잡은 줄
  var st = String(row[NA_I_STATE] || '');
  var dirty = false;
  var set = function (i, v) {
    if (String(row[i]) !== String(v)) { row[i] = v; dirty = true; }
  };
  // 값은 언제나 새로 적는다 (가격·조달비·마진은 바뀌는 것이 정상이다)
  set(NA_I_ASIN, c.asin); set(NA_I_FAM, c.fam);
  if (c.name) set(NA_I_NAME, c.name);
  set(NA_I_KRW, c.krw);
  set(NA_I_JPY, c.jpy ? Math.round(c.jpy) : '');
  set(NA_I_PRICE, c.price || '');
  set(NA_I_MPCT, c.mpct || ''); set(NA_I_MSRC, c.msrc);
  set(NA_I_G, c.G ? Math.round(c.G) : '');
  set(NA_I_CAP, c.cap ? Math.round(c.cap * 100) / 100 : '');
  set(NA_I_AT, c.at);
  // 배분·상태는 아직 시작 안 한 줄만
  if (!live[st]) {
    set(NA_I_Q, c.q ? Math.round(c.q * 1000) / 10 : '');
    set(NA_I_BID, c.bid || '');
    set(NA_I_REP, isRep ? 'O' : '');
    set(NA_I_ALLOC, alloc.a); set(NA_I_WHY, alloc.why); set(NA_I_STATE, alloc.state);
    if (dirty) row[NA_I_NEXT] = today;
  }
  return dirty;
}

/**
 * 상품군 표. 판돈은 상품군에 하나 — min(설정 상한, 대표의 G × 탐색배수).
 * 누적 탐색비·위험손실은 아직 광고가 없으므로 0 으로 열고, 매일 주기가 채운다.
 * @return {number} 상품군 수
 */
function naFamWrite_(touched, calc, famRep, pol, today, live) {
  if (!live) live = naLiveStates_();
  var sh = naSheet_(NA_SHEET_FAM, NA_FAM_HEADER);
  var have = {}, rows = [];
  if (sh.getLastRow() > 1) {
    rows = sh.getRange(2, 1, sh.getLastRow() - 1, NA_FAM_HEADER.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var k = String(rows[i][NA_F_KEY] || '').trim();
      if (k) have[k] = i;
    }
  }
  var add = [], dirty = false, n = 0;
  for (var f in touched) {
    n++;
    var rep = famRep[f] || '';
    var c = rep ? calc[rep] : null;
    var pot = c && c.G > 0 ? Math.min(pol.famPot, Math.round(c.G * pol.famMult)) : 0;
    if (have[f] === undefined) {
      var r = new Array(NA_FAM_HEADER.length).fill('');
      r[NA_F_KEY] = f; r[NA_F_N] = touched[f].length; r[NA_F_REP] = rep;
      r[NA_F_NAME] = c ? c.name : '';
      r[NA_F_POT] = pot || ''; r[NA_F_SPENT] = 0; r[NA_F_RISK] = 0; r[NA_F_LEFT] = pot || '';
      r[NA_F_STATE] = rep ? NAS_NEW : NAS_INFO;
      r[NA_F_WHY] = rep ? '' : '적격 옵션이 없습니다';
      r[NA_F_IN] = today;
      add.push(r);
    } else {
      var row = rows[have[f]];
      var set = function (i, v) { if (String(row[i]) !== String(v)) { row[i] = v; dirty = true; } };
      set(NA_F_N, touched[f].length);
      if (rep && String(row[NA_F_REP]) !== rep) {
        // 대표가 바뀌면 이전 대표를 남긴다. 판돈은 늘리지 않는다 (같은 상품군의 누적을 이어받는다)
        set(NA_F_PREV, String(row[NA_F_REP] || ''));
        set(NA_F_REP, rep);
      }
      if (c && c.name) set(NA_F_NAME, c.name);
      if (!(Number(row[NA_F_POT]) > 0) && pot) { set(NA_F_POT, pot); set(NA_F_LEFT, pot); }
      // 아직 시작 안 한 상품군은 대표가 생기면 '가져옴', 없어지면 '정보대기' 로 따라간다
      if (!live[String(row[NA_F_STATE] || '')]) {
        set(NA_F_STATE, rep ? NAS_NEW : NAS_INFO);
        set(NA_F_WHY, rep ? '' : '적격 옵션이 없습니다');
      }
    }
  }
  if (dirty) sh.getRange(2, 1, rows.length, NA_FAM_HEADER.length).setValues(rows);
  if (add.length) {
    var at = Math.max(sh.getLastRow(), 1) + 1;
    if (sh.getMaxRows() < at + add.length - 1) {
      sh.insertRowsAfter(sh.getMaxRows(), at + add.length - 1 - sh.getMaxRows());
    }
    sh.getRange(at, 1, add.length, NA_FAM_HEADER.length).setValues(add);
  }
  return n;
}
