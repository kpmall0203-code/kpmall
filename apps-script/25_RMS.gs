/**
 * 25_RMS.gs — 라쿠텐 RMS(스토어 운영) API 연동: 상품 등록/수정/조회
 *
 * SP-API와 가장 다른 점: 라쿠텐 이치바에 실제 입점한 판매자(RMS 계정)만
 * 쓸 수 있다. 인증도 OAuth가 아니라 서비스시크릿+라이선스키를 합쳐 만든
 * 고정 헤더(ESA 방식)라 토큰 갱신이 필요 없는 대신, 두 값이 그대로
 * 만료 없는 비밀번호나 마찬가지다 — 유출되면 RMS에서 즉시 재발급해야 한다.
 *
 * 자격증명 발급 위치: RMS 관리화면 → 서비스 관리 → WEB SERVICE 연동설정
 *   - serviceSecret: 개발자(계정) 단위로 발급
 *   - licenseKey:    스토어(샵) 단위로 발급
 *
 * ※ RMS Web Service API(상품API)는 버전이 종종 바뀐다. 아래 RMS_BASE와
 *   엔드포인트 경로는 Item API 2.0 기준이며, 실사용 전 RMS 웹서비스 포털
 *   (webservice.rms.rakuten.co.jp)에서 최신 스펙을 반드시 확인할 것.
 */

function getRmsAuthHeader_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty(PROP_RMS_SERVICE_SECRET);
  var license = props.getProperty(PROP_RMS_LICENSE_KEY);
  if (!secret || !license) {
    throw new Error('라쿠텐 RMS 자격증명이 없습니다. 메뉴 [라쿠텐 RMS 자격증명 설정]을 먼저 실행하세요.');
  }
  return 'ESA ' + Utilities.base64Encode(secret + ':' + license);
}

/** 범용 RMS 요청 래퍼. SPAPI 쪽 spapi_()와 동일한 형태. */
function rms_(method, path, payload) {
  var opt = {
    method: method,
    headers: { 'Authorization': getRmsAuthHeader_(), 'Accept': 'application/json' },
    muteHttpExceptions: true
  };
  if (payload) {
    opt.contentType = 'application/json; charset=utf-8';
    opt.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(RMS_BASE + path, opt);
  var text = res.getContentText();
  var json = text ? JSON.parse(text) : {};
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    var msg = (json.errors && json.errors[0] && json.errors[0].message) || json.message || code;
    throw new Error(method + ' ' + path + ' 실패(' + code + '): ' + msg);
  }
  return json;
}

/**
 * 상품 등록/수정 (upsert).
 *
 * manageNumber: 스토어 내에서 유일한 관리번호. SKU를 그대로 써도 된다.
 * item: 라쿠텐 Item API 스펙에 맞는 객체. 실제 필수 필드(카테고리ID,
 *   가격, 재고, 배송템플릿 등)는 RMS 문서를 보고 채워야 하며, 여기서는
 *   임의로 기본값을 채우지 않는다 — 잘못된 값으로 실제 매장에 상품이
 *   등록되는 사고를 막기 위해서다.
 */
function upsertRmsItem_(manageNumber, item) {
  if (!manageNumber) throw new Error('manageNumber가 없습니다.');
  return rms_('put', '/items/manage-numbers/' + encodeURIComponent(manageNumber), item);
}

function getRmsItem_(manageNumber) {
  return rms_('get', '/items/manage-numbers/' + encodeURIComponent(manageNumber));
}

function deleteRmsItem_(manageNumber) {
  return rms_('delete', '/items/manage-numbers/' + encodeURIComponent(manageNumber));
}

/**
 * 서비스시크릿/라이선스키를 Script Properties에 저장한다 (시트에는 남기지 않는다).
 * 두 칸 모두 '비워두면 그대로 유지'다.
 */
function setupRmsCredentials() {
  var ui = ui_();
  var props = PropertiesService.getScriptProperties();
  var cur = {
    secret: props.getProperty(PROP_RMS_SERVICE_SECRET) || '',
    license: props.getProperty(PROP_RMS_LICENSE_KEY) || ''
  };
  var tail = function (v) { return v ? '현재: …' + v.slice(-6) + '\n(비워두고 확인 = 그대로 유지)' : ''; };

  var a = ui.prompt('라쿠텐 RMS 자격증명 1/2 — 서비스시크릿(serviceSecret)',
    'RMS 관리화면 → 서비스 관리 → WEB SERVICE 연동설정에서 발급\n\n' + tail(cur.secret),
    ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var b = ui.prompt('라쿠텐 RMS 자격증명 2/2 — 라이선스키(licenseKey)',
    '스토어(샵) 단위로 발급되는 키\n\n' + tail(cur.license),
    ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;

  var nsecret = a.getResponseText().trim() || cur.secret;
  var nlicense = b.getResponseText().trim() || cur.license;
  if (!nsecret || !nlicense) {
    ui.alert('두 값이 모두 있어야 합니다.\n(처음 설정이라면 빈칸으로 둘 수 없습니다)');
    return;
  }
  if (nsecret === cur.secret && nlicense === cur.license) {
    ui.alert('바뀐 값이 없습니다.');
    return;
  }

  props.setProperty(PROP_RMS_SERVICE_SECRET, nsecret);
  props.setProperty(PROP_RMS_LICENSE_KEY, nlicense);
  ui.alert('저장 완료.\n\n다음: [라쿠텐 연결 진단]으로 인증이 통과하는지 확인하세요.');
}

/**
 * 연결 진단. 존재하지 않는 관리번호를 조회해서
 *   404(없는 상품) → 인증은 통과했다는 뜻
 *   401/403        → 자격증명이 틀렸거나 권한이 없다는 뜻
 * 으로 구분한다. 실제 상품을 건드리지 않고 자격증명만 확인할 때 쓴다.
 */
function diagnoseRmsAuth() {
  var probeId = '__kpmall_connection_test__';
  try {
    getRmsItem_(probeId);
    ui_().alert('✅ 인증 통과 — 테스트용 관리번호가 우연히 존재하는 상품과 겹쳤습니다.');
  } catch (e) {
    var msg = String(e.message || e);
    if (msg.indexOf('(404)') >= 0 || msg.toLowerCase().indexOf('not found') >= 0) {
      ui_().alert('✅ 인증 통과 — 없는 상품이라 404가 정상적으로 돌아왔습니다.');
    } else if (msg.indexOf('(401)') >= 0 || msg.indexOf('(403)') >= 0) {
      ui_().alert('❌ 인증 실패:\n' + msg + '\n\n서비스시크릿/라이선스키를 다시 확인하세요.');
    } else {
      ui_().alert('확인 필요 — 예상 밖 응답입니다:\n' + msg);
    }
  }
}
