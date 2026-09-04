/**
 * 40_웹앱.gs — 크롬 확장이 읽어갈 JSON 엔드포인트
 *
 *   GET ?token=<공유토큰>            → SKU별 검색어 목록
 *   GET ?token=<공유토큰>&sku=<SKU>  → 한 건만 조회
 *
 * 검색어 우선순위: 검색어(수동) > 한글명(자동번역)
 * 개인정보는 담기지 않는다 (SKU·ASIN·상품명·검색어뿐).
 *
 * 배포: 편집기 → 배포 → 새 배포 → 유형: 웹 앱
 *       실행: 나 / 액세스 권한: 링크가 있는 모든 사용자 → 배포 → URL 복사
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var expected = PropertiesService.getScriptProperties().getProperty(PROP_SHARE_TOKEN) || '';
  if (!expected || String(params.token || '') !== expected) {
    return jsonOut_({ ok: false, error: 'unauthorized' });
  }
  try {
    var sh = ss_().getSheetByName(SHEET_LISTING);
    if (!sh || sh.getLastRow() < 2) return jsonOut_({ ok: true, count: 0, items: [] });

    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    var wanted = String(params.sku || '').trim();
    var items = [];
    for (var r = 0; r < vals.length; r++) {
      var sku = String(vals[r][L_SKU] || '').trim();
      if (!sku) continue;
      if (wanted && sku !== wanted) continue;
      var manual = String(vals[r][L_MANUAL] || '').trim();
      var auto = String(vals[r][L_KR] || '').trim();
      var q = manual || auto;
      if (!q) continue; // 검색어가 없는 행은 보내지 않는다
      items.push({
        s: sku,
        a: String(vals[r][L_ASIN] || '').trim(),
        q: q,
        m: manual ? 1 : 0,            // 1=사람이 지정, 0=자동번역
        j: String(vals[r][L_JP] || '').trim()
      });
    }
    return jsonOut_({
      ok: true,
      generatedAt: new Date().toISOString(),
      count: items.length,
      items: items
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 메뉴: 웹앱 토큰 생성/확인 */
function setupShareToken() {
  var props = PropertiesService.getScriptProperties();
  var cur = props.getProperty(PROP_SHARE_TOKEN);
  if (!cur) {
    cur = Utilities.getUuid().replace(/-/g, '');
    props.setProperty(PROP_SHARE_TOKEN, cur);
  }
  ui_().alert(
    '웹앱 공유 토큰\n\n' + cur + '\n\n' +
    '이 토큰과 배포된 웹앱 URL을 크롬 확장 설정에 입력하세요.\n' +
    '배포: 편집기 → 배포 → 새 배포 → 유형: 웹 앱 → 액세스: 링크가 있는 모든 사용자'
  );
}
