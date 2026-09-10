/**
 * 64B_가격반영_마진동기.gs — 리프라이싱으로 판매가가 바뀌면 바깥 [상품 목록] 의 판매가·마진율도 따라 고친다
 *
 * ── 왜 ───────────────────────────────────────────────────
 * 신규 상품의 마진은 바깥 시트(마진율 시트)의 [상품 목록] 에서 온다 — O열 SKU · C열 조달비(KRW) ·
 * I열 판매가(JPY) · L열 마진율(%) · M열 마진(JPY). 그 값은 등록 시점의 것이다. 리프라이싱이
 * 매일 판매가를 바꾸면 그 줄의 판매가·마진은 곧 옛 값이 되고, 그것을 읽는 쪽(신규 광고 ·
 * 확대 후보)은 틀린 마진으로 입찰 상한을 셈한다. 가격을 바꾼 바로 그 자리에서 고쳐 둔다.
 *
 * ── 어떻게: 그 줄이 갖고 있던 배송비를 그대로 살린다 ─────────
 * 바깥 시트의 마진 식은 우리 것과 구조가 같다 (실측: 판매가 − 마진 − 조달비 ≈ 판매가 × 14% + ¥658).
 * 다만 배송비가 상품마다 달라 우리가 다시 셈하면 몇 %p 어긋난다. 그래서 식을 새로 세우지 않고,
 * 그 줄이 지금 갖고 있는 값에서 배송비를 거꾸로 꺼내 그대로 쓴다:
 *
 *   기타(옛)  = 판매가(옛) − 마진(옛) − 조달비(JPY)        ← 수수료 + 배송비
 *   배송비    = 기타(옛) − 판매가(옛) × 수수료율             ← 이 줄의 배송비 (가격과 무관)
 *   마진(새)  = 판매가(새) × (1 − 수수료율) − 배송비 − 조달비(JPY)
 *
 * 바뀐 것은 판매가뿐이니 수수료만 다시 셈하고 배송비·조달비는 그대로다. 조달비를 모르는 줄은
 * 판매가만 고치고 마진은 두며, 몇 줄이었는지 기록에 남긴다.
 *
 * ── 언제 ─────────────────────────────────────────────────
 * 가격반영(64)의 실반영 묶음이 끝날 때마다, ACCEPTED 로 돌아온 SKU 만. 여기서 무엇이 실패해도
 * 가격반영은 멈추지 않는다 (try/catch 로 감싼다).
 */

var SRC_TAB = '상품 목록';
var SRC_COL_KRW = 3, SRC_COL_PRICE = 9, SRC_COL_MPCT = 12, SRC_COL_MJPY = 13, SRC_COL_SKU = 15;   // 1부터

/** "8,000원" → 8000. 숫자가 아니면 0 */
function srcKrw_(x) {
  var m = String(x == null ? '' : x).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

/**
 * @param {Array<{sku:string, price:number}>} items 반영된 SKU 와 새 판매가
 * @return {{updated:number, noCost:number, missing:number, msg:string}}
 */
function sourceMarginSync_(items) {
  var out = { updated: 0, noCost: 0, missing: 0, msg: '' };
  if (!items || !items.length) return out;
  var id = String(adBasis_()['마진율 시트 ID'] || '').trim();
  if (!id) { out.msg = '마진율 시트 ID 없음'; return out; }
  var sh;
  try { sh = SpreadsheetApp.openById(id).getSheetByName(SRC_TAB); }
  catch (e) { out.msg = '바깥 시트를 못 열었습니다: ' + String(e).substring(0, 100); return out; }
  if (!sh || sh.getLastRow() < 2) { out.msg = SRC_TAB + ' 이 비어 있습니다'; return out; }

  var rate = fxReceiveRate_();                       // KRW / JPY
  var fee = DEFAULT_FEE_RATE;
  var n = sh.getLastRow() - 1;
  var skuCol = sh.getRange(2, SRC_COL_SKU, n, 1).getValues();
  var krwCol = sh.getRange(2, SRC_COL_KRW, n, 1).getValues();
  var priceCol = sh.getRange(2, SRC_COL_PRICE, n, 1).getValues();
  var mBlock = sh.getRange(2, SRC_COL_MPCT, n, 2).getValues();     // L:M

  var rowsOf = {};
  for (var i = 0; i < n; i++) {
    var s = String(skuCol[i][0] || '').trim();
    if (s) (rowsOf[s] || (rowsOf[s] = [])).push(i);
  }
  var dirtyP = false, dirtyM = false;
  for (var k = 0; k < items.length; k++) {
    var sku = String(items[k].sku || '').trim(), p1 = Number(items[k].price);
    var rows = rowsOf[sku];
    if (!rows || !(p1 > 0)) { out.missing++; continue; }
    for (var r = 0; r < rows.length; r++) {
      var i2 = rows[r];
      var p0 = Number(priceCol[i2][0]) || 0;
      var m0 = Number(String(mBlock[i2][1]).replace(/,/g, '')) || 0;
      var krw = srcKrw_(krwCol[i2][0]);
      if (Math.abs(p0 - p1) < 0.5) continue;                       // 값이 같으면 손대지 않는다
      priceCol[i2][0] = p1; dirtyP = true;
      if (!(krw > 0) || !(rate > 0) || !(p0 > 0)) { out.noCost++; continue; }
      var costJ = krw / rate;
      var ship = (p0 - m0 - costJ) - p0 * fee;                      // 이 줄의 배송비
      if (ship < 0) ship = 0;
      var m1 = p1 * (1 - fee) - ship - costJ;
      mBlock[i2][0] = Math.round(m1 / p1 * 1000) / 10;              // 마진율(%) 소수 1자리
      mBlock[i2][1] = Math.round(m1);                               // 마진(JPY)
      dirtyM = true;
    }
    out.updated++;
  }
  if (dirtyP) sh.getRange(2, SRC_COL_PRICE, n, 1).setValues(priceCol);
  if (dirtyM) sh.getRange(2, SRC_COL_MPCT, n, 2).setValues(mBlock);
  out.msg = '상품 목록 갱신 ' + out.updated + '건' +
            (out.noCost ? ' · 조달비 없어 판매가만 ' + out.noCost : '') +
            (out.missing ? ' · 목록에 없음 ' + out.missing : '');
  log_('apply', 'INFO', '리프라이싱 마진 동기 — ' + out.msg);
  return out;
}
