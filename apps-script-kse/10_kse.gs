/**
 * KSE OMS API 클라이언트 (KSE-API Guide v1.6.0).
 *
 *   배송등록     POST {base}/createOrders/kr   JSON  {"DataList":[...]}  1회 최대 500건(권장 20)
 *   배송등록조회 POST {base}/getOrders/kr      plaintext "K...,K..."     1회 최대 500건(권장 20)
 *   배송추적조회 POST {base}/tracking/kr       plaintext "K...,K..."     1회 최대 20건
 *
 * 인증은 헤더 `KSE-APIKey`. 발신 IP 제한이 없어서 Apps Script에서도 호출된다.
 */

function kseCall_(api, body) {
  var isJson = (body !== null && typeof body === 'object');
  var payload = isJson ? JSON.stringify(body) : String(body);

  var res = UrlFetchApp.fetch(kseBaseUrl_() + '/' + api + '/kr', {
    method: 'post',
    contentType: (isJson ? 'application/json' : 'text/plain') + '; charset=UTF-8',
    headers: { 'KSE-APIKey': kseApiKey_() },
    payload: Utilities.newBlob(payload, isJson ? 'application/json' : 'text/plain').getBytes(),
    muteHttpExceptions: true
  });

  var text = res.getContentText('UTF-8');
  var code = res.getResponseCode();

  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('KSE ' + api + ' 응답 파싱 실패 (HTTP ' + code + '): ' + text.slice(0, 400));
  }

  // 배송추적조회는 최상위 Code 없이 배송등록번호를 키로 하는 객체를 돌려준다
  if (Object.prototype.hasOwnProperty.call(data, 'Code')) {
    var top = String(data.Code);
    // 0 = 전체성공, 9903010 = 일부성공(건별로 확인해야 함)
    if (top !== '0' && top !== '9903010') {
      throw new Error('KSE ' + api + ' 오류 [' + top + '] ' + (data.Message || text.slice(0, 300)));
    }
  }
  return data;
}

function kseCreateOrders_(packages) {
  return kseCall_('createOrders', { DataList: packages });
}

function kseTracking_(trackingNos) {
  return kseCall_('tracking', trackingNos.join(','));
}

/**
 * 묶음(배송지 그룹) 하나 → KSE createOrders 의 DataList 요소 1개.
 *
 * 아마존은 order-item-id 단위 행이라 여러 주문·여러 상품이 한 배송지로 묶인다.
 *
 * 두 번호가 어디로 가는지는 [설정] KSE_장바구니번호 로 정한다.
 *  · 주문상품ID (기본) — 장바구니번호=order-item-id / 상품별 주문번호=order-id
 *  · 주문번호        — 장바구니번호=order-id / 상품별 주문번호=order-item-id
 * 기본값으로 두면 KSE 화면의 주문번호 칸에 셀러센트럴에서 그대로 찾을 수 있는
 * order-id 가 보인다.
 */
/**
 * 시트 한 행 → KSE 로 보낼 묶음 객체.
 *
 * _원본JSON 을 뼈대로 쓰고 사람이 시트에서 고친 값을 덮어씌운다.
 * 그래서 붉은 칸을 채우거나 단가·이름을 고친 것이 그대로 접수된다.
 *
 * 줄 단위 칸(수량·단가·상품명·SKU)은 상품이 여러 개인 박스에서 줄 순서가
 * 상품 순서와 맞아야 한다. 줄 수가 상품 수와 다르면 어느 상품의 값인지 알 수 없어
 * 아무것도 반영하지 않고 사유를 돌려준다 (엉뚱한 상품에 값이 붙는 것을 막는다).
 *
 * @return {{g: Object, warn: string[]}}
 */
function rowToGroup_(v) {
  var g = JSON.parse(String(v[COL.RAW - 1] || 'null'));
  if (!g || !g.items || !g.items.length) throw new Error('_원본JSON 이 없거나 비어 있습니다');

  var warn = [];
  var txt = function (col) { return String(v[col - 1] == null ? '' : v[col - 1]).trim(); };

  // 박스 단위 — 시트에 값이 있으면 그것을 쓴다
  if (txt(COL.RECEIVER)) g.receiver = txt(COL.RECEIVER);
  // 시트에서 앞의 0이 떨어진 번호는 원본으로 되돌린다
  if (txt(COL.TEL)) g.tel = keepZeros_(txt(COL.TEL), g.tel);
  if (txt(COL.ZIP)) g.zip = zipJP_(keepZeros_(txt(COL.ZIP), g.zip)) || g.zip;
  if (txt(COL.ADDRESS)) g.address = txt(COL.ADDRESS);
  if (txt(COL.COUNTRY)) g.country = txt(COL.COUNTRY);
  var w = num_(v[COL.WEIGHT - 1], 0);
  if (w > 0) g.weight = w;

  // 줄 단위
  var n = g.items.length;
  var apply = function (col, label, fn) {
    var s = String(v[col - 1] == null ? '' : v[col - 1]);
    if (s === '') return;
    var arr = s.split('\n');
    if (arr.length !== n) {
      warn.push(label + ' ' + arr.length + '줄 ≠ 상품 ' + n + '개');
      return;
    }
    for (var i = 0; i < n; i++) fn(g.items[i], String(arr[i]).trim());
  };
  apply(COL.QTY, '수량', function (it, s) {
    var q = parseInt(num_(s, 0), 10);
    if (q > 0) it.qty = q;
  });
  apply(COL.UNIT_PRICE, '단가', function (it, s) {
    if (s !== '') it.unitPrice = num_(s, it.unitPrice);
  });
  apply(COL.TITLE_EN, '상품명(영문)', function (it, s) { if (s) it.titleEn = s; });
  apply(COL.TITLE_KSE, 'KSE상품명', function (it, s) { if (s) it.titleKse = s; });
  apply(COL.SKU, 'SKU', function (it, s) { if (s) it.sku = s; });

  return { g: g, warn: warn };
}

function kseBuildPackage_(g, cfg) {
  var sep = cfg.상품명구분자;
  var defaultWeight = num_(cfg.기본무게, 0.1);
  var goods = [];
  var weight = 0;

  // 장바구니번호에 주문상품ID를 쓰면, 상품별 주문번호에는 주문번호가 들어간다
  var cartIsItemId = String(cfg.KSE_장바구니번호 || '주문상품ID').trim() !== '주문번호';

  for (var i = 0; i < g.items.length; i++) {
    var it = g.items[i];
    var sku = String(it.sku || '').trim();
    // 상품마스터를 없애서 무게는 [설정]의 기본무게만 쓴다 (물류센터 입고 시 재측정된다)
    weight += defaultWeight * (it.qty || 1);

    goods.push({
      GoodsOrderNo: sanitize_(cartIsItemId
        ? (it.orderId || it.orderItemId)
        : (it.orderItemId || it.orderId)),
      GoodsCode: goodsCode_(sku),
      // 상품명은 병합할 때 번역해 _원본JSON 에 넣어둔 값을 쓴다 (여기서 다시 번역하지 않는다)
      // 시트에서 KSE상품명을 고쳤으면 그 글자를 그대로 보낸다
      Title: it.titleKse ? sanitize_(it.titleKse) : kseTitle_(it.titleKo, it.titleEn, sep),
      // TitleEng 은 통관신고용이라 가이드상 영문·숫자만 받는다
      TitleEng: sanitize_(it.titleEng),
      SKU: goodsCode_(sku),
      HSCODE: sanitize_(cfg.기본HS코드),
      Qty: parseInt(it.qty, 10) || 1,
      UnitPrice: round_(num_(it.unitPrice, 0), 2),
      Currency: cfg.KSE_통화 || 'JPY',
      Origin: sanitize_(cfg.기본원산지) || 'KR',
      Material: sanitize_(cfg.기본재질),
      ItemType: 'main',
      Market: cfg.KSE_마켓명 || 'Amazon'
    });
  }

  return {
    // 장바구니번호는 패키지마다 달라야 한다 (중복이면 KSE 9903014)
    PackageNo: sanitize_(cartIsItemId
      ? ((g.items[0] && g.items[0].orderItemId) || g.orderId)
      : g.orderId),
    DeliveryServiceCode: cfg.KSE_배송서비스코드 || 'KSE',
    TrackingNo: '',                    // 비우면 KSE가 K로 시작하는 14자리를 발번
    ToCountry: 'JP',                   // 가이드상 JP 고정
    ReceiverName: sanitize_(g.receiver),
    ReceiverNameYomigana: '',          // 아마존 자료에 요미가나가 없다
    ReceiverTelNo: sanitize_(g.tel),
    ReceiverTelNo2: '',
    ReceiverZipCode: zipJP_(g.zip).slice(0, 10),
    ReceiverFullAddr: sanitize_(g.address),
    // 시트에서 무게를 고쳤으면 그 값을 쓴다
    RealWeight: Math.max(round_(num_(g.weight, 0) > 0 ? num_(g.weight, 0) : weight, 3), 0.001),
    WeightMeasure: 'KG',
    Market: cfg.KSE_마켓명 || 'Amazon',
    GoodsList: goods
  };
}

/** 인증이 통과하는지만 확인. '조회 결과 없음'이 정상이다. */
function KSE_연결테스트() {
  try {
    var r = kseCall_('getOrders', 'K00000000000000');
    SpreadsheetApp.getUi().alert('KSE 연결 OK\n' + kseBaseUrl_() +
      '\nCode=' + r.Code + ' / ' + (r.Message || ''));
  } catch (e) {
    var s = String(e);
    if (s.indexOf('9002004') >= 0 || s.indexOf('9002006') >= 0) {
      SpreadsheetApp.getUi().alert('KSE 연결 OK\n' + kseBaseUrl_() + '\n조회 결과 없음 = 인증 통과');
      return;
    }
    SpreadsheetApp.getUi().alert('KSE 연결 실패\n' + s);
  }
}
