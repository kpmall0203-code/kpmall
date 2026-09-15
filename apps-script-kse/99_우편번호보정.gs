/**
 * 99_우편번호보정.gs — 「아마존 KSE Shipnergy 자동 등록」 시트용
 *
 * ── 문제 ───────────────────────────────────────────────
 * 일본 우편번호는 7자리이고 홋카이도·도호쿠는 0으로 시작한다 (예: 014-0063).
 * 시트에 "0140063" 을 그냥 쓰면 숫자로 해석돼 140063 이 되고,
 * 그걸 다시 읽은 스크립트는 7자리가 아니라며 "우편번호 없음" 으로 판정한다.
 * 전화번호(090…)도 같은 이유로 앞의 0이 사라진다.
 *
 * ── 해결 ───────────────────────────────────────────────
 * 1) 값을 만들 때는 숫자 변환 없이 문자열로만 다루고, 7자리 미만이면 0을 채운다.
 *    → zipJP_() / telJP_()
 * 2) 시트에 쓰기 전에 그 열의 표시 형식을 '일반 텍스트'(@) 로 고정한다.
 *    → protectTextColumns_()
 * 3) 이미 잘려 들어간 행은 _원본JSON 에서 되살린다.
 *    → fixZipAndTelColumns()  (메뉴나 편집기에서 한 번 실행)
 *
 * ── 붙이는 곳 ──────────────────────────────────────────
 *  · 주문을 rows 로 만들어 setValues 하는 함수:
 *        protectTextColumns_(sh, startRow, rows.length);   // setValues 바로 앞
 *  · zip / tel 을 만드는 곳과 KSE 전송 payload 를 만드는 곳:
 *        zip: zipJP_(amz['ship-postal-code']),  tel: telJP_(amz['buyer-phone-number'])
 *  · 필수값 검사:
 *        if (!zipJP_(row[KSE_COL_ZIP - 1])) → 우편번호 없음
 */

var KSE_COL_TEL = 7;    // 전화번호 (G)
var KSE_COL_ZIP = 8;    // 우편번호 (H)
var KSE_COL_JSON = 25;  // _원본JSON (Y)
var KSE_ZIP_LEN = 7;    // 일본 우편번호 자릿수

/** 일본 우편번호 → 하이픈 없는 7자리 문자열. 0이 빠진 숫자(140063)도 복구. 없으면 ''. */
function zipJP_(raw) {
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  while (d.length < KSE_ZIP_LEN) d = '0' + d;
  return d;
}

/** 전화번호 → 숫자만. 일본 번호(10~11자리)인데 0으로 시작하지 않으면 0을 붙인다. */
function telJP_(raw) {
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  if ((d.length === 9 || d.length === 10) && d.charAt(0) !== '0') d = '0' + d;
  return d;
}

/** setValues 직전에 호출: 전화번호·우편번호 열을 텍스트 형식으로 고정한다. */
function protectTextColumns_(sh, startRow, numRows) {
  if (numRows < 1) return;
  sh.getRange(startRow, KSE_COL_TEL, numRows, 1).setNumberFormat('@');
  sh.getRange(startRow, KSE_COL_ZIP, numRows, 1).setNumberFormat('@');
}

/**
 * 이미 들어간 행 복구 — 모든 탭을 돌며 헤더에 '우편번호'가 있는 시트를 고친다.
 * 편집기에서 이 함수를 선택해 실행하면 된다. 여러 번 실행해도 안전하다.
 */
function fixZipAndTelColumns() {
  var ss = SpreadsheetApp.getActive();
  var sheets = ss.getSheets();
  var fixed = 0, touched = [];
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    if (sh.getLastRow() < 2 || sh.getLastColumn() < KSE_COL_ZIP) continue;
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var cZip = header.indexOf('우편번호') + 1;
    var cTel = header.indexOf('전화번호') + 1;
    var cJson = header.indexOf('_원본JSON') + 1;
    if (!cZip) continue;

    var n = sh.getLastRow() - 1;
    var zipR = sh.getRange(2, cZip, n, 1);
    var zips = zipR.getValues();
    var tels = cTel ? sh.getRange(2, cTel, n, 1).getValues() : null;
    var jsons = cJson ? sh.getRange(2, cJson, n, 1).getValues() : null;

    for (var i = 0; i < n; i++) {
      var src = null;
      if (jsons && jsons[i][0]) { try { src = JSON.parse(jsons[i][0]); } catch (e) {} }
      var zipNew = zipJP_(src && src.zip ? src.zip : zips[i][0]);
      if (zipNew !== String(zips[i][0])) fixed++;
      zips[i][0] = zipNew;
      if (tels) tels[i][0] = telJP_(src && src.tel ? src.tel : tels[i][0]);
    }
    zipR.setNumberFormat('@').setValues(zips);
    if (tels) sh.getRange(2, cTel, n, 1).setNumberFormat('@').setValues(tels);
    // 앞으로 추가될 행까지 텍스트로 고정
    sh.getRange(2, cZip, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    if (cTel) sh.getRange(2, cTel, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    touched.push(sh.getName());
  }
  SpreadsheetApp.getActive().toast(
    '우편번호 ' + fixed + '건 복구 — 탭: ' + touched.join(', '), '우편번호 보정');
}
