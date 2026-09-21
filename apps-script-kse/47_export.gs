/**
 * [근석이] 시트를 아마존 주문 리포트 양식(32컬럼 CSV)으로 내려받는다.
 *
 * [근석이] 시트 자체는 [주문] 과 같은 양식을 그대로 쓴다 — 사람이 [주문] 에서
 * 손으로 행을 옮기는 경우가 있어서 두 시트의 칸이 어긋나면 안 된다.
 * 양식 변환은 내려받을 때만 한다.
 *
 * 박스 1행 → 상품 1행으로 되펼친다 (아마존 리포트는 주문상품 단위라서).
 */

// 사용자가 올려준 파일과 같은 순서·같은 이름
var AMZ_EXPORT_COLUMNS = [
  'order-id', 'order-item-id', 'purchase-date', 'payments-date', 'reporting-date',
  'promise-date', 'days-past-promise', 'buyer-email', 'buyer-name', 'buyer-phone-number',
  'sku', 'product-name', 'quantity-purchased', 'quantity-shipped', 'quantity-to-ship',
  'ship-service-level', 'recipient-name', 'ship-address-1', 'ship-address-2',
  'ship-address-3', 'ship-city', 'ship-state', 'ship-postal-code', 'ship-country',
  'payment-method', 'cod-collectible-amount', 'already-paid', 'payment-method-fee',
  'is-business-order', 'price-designation', 'verge-of-cancellation', 'verge-of-lateShipment'
];

// 원본에 값이 없을 때 채우는 기본값 (없는 값을 지어내지 않는 칸은 여기 없다)
var AMZ_EXPORT_FALLBACK = {
  'ship-service-level': 'Standard',
  'is-business-order': 'false',
  'verge-of-cancellation': 'false',
  'verge-of-lateShipment': 'false'
};

/** 모든 값을 따옴표로 감싼다 — 올려준 파일과 같은 방식 */
function csvField_(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}

/** 한 상품을 32컬럼 한 줄로 */
function amzExportRow_(it, box) {
  var a = it.amz || {};
  var get = function (name) {
    var v = a[name];
    return v == null ? '' : String(v);
  };

  // 사람이 시트에서 고쳐 넣는 칸은 시트 값이 이긴다 (붉은 칸을 손으로 채우는 흐름)
  var sheetAddr = String(box.address || '').trim();
  // 시트 주소는 병합이 joinAddrParts_ 로 만든다 — 같은 식으로 만들어야 '안 고쳤다' 를 알아본다
  var origAddr = joinAddrParts_([
    get('ship-state'), get('ship-city'),
    get('ship-address-1'), get('ship-address-2'), get('ship-address-3')
  ]);
  var addrEdited = sheetAddr && origAddr && sheetAddr !== origAddr;

  var out = {};
  AMZ_EXPORT_COLUMNS.forEach(function (name) {
    out[name] = get(name) || (AMZ_EXPORT_FALLBACK[name] || '');
  });

  if (!out['order-id']) out['order-id'] = String(it.orderId || box.orderId || '');
  if (!out['order-item-id']) out['order-item-id'] = String(it.orderItemId || '');
  if (!out['purchase-date']) out['purchase-date'] = String(it.purchaseDate || box.orderTime || '');
  // 결제일·집계일은 원본에서 주문일시와 같은 값이라, 없으면 주문일시로 채운다
  if (!out['payments-date']) out['payments-date'] = out['purchase-date'];
  if (!out['reporting-date']) out['reporting-date'] = out['purchase-date'];
  if (!out['sku']) out['sku'] = String(it.skuRaw || it.sku || '');
  if (!out['product-name']) out['product-name'] = String(it.titleEn || '');

  var qty = parseInt(it.qty, 10) || 1;
  if (!out['quantity-purchased']) out['quantity-purchased'] = String(qty);
  // 아직 안 보낸 주문이므로 출하 0 / 출하대기 = 주문수량
  if (!out['quantity-shipped']) out['quantity-shipped'] = '0';
  if (!out['quantity-to-ship']) out['quantity-to-ship'] = String(qty);

  // 사람이 시트에서 고친 칸만 시트 값으로 바꾼다.
  // 안 고친 칸은 원본 표기를 그대로 둔다 — 우편번호 하이픈(162-0813)처럼
  // 시트에 담을 때 다듬은 형태가 그대로 나가면 양식이 어긋난다.
  var prefer = function (name, sheetVal, norm) {
    var sv = String(sheetVal == null ? '' : sheetVal).trim();
    if (!sv) return;
    var ov = out[name];
    if (ov && norm(ov) === norm(sv)) return;   // 안 고쳤다 → 원본 유지
    out[name] = sv;
  };
  var same = function (x) { return String(x).replace(/\s+/g, ''); };
  prefer('recipient-name', box.receiver, same);
  prefer('buyer-phone-number', box.tel, function (x) { return digits_(x); });
  prefer('ship-postal-code', box.zip, function (x) { return zipJP_(x); });
  prefer('ship-country', box.country, function (x) { return String(x).toUpperCase(); });
  if (!out['recipient-name']) out['recipient-name'] = String(box.receiver || '');

  // 원본 조각을 그대로 내보낼 때도 겹치는 머리는 뗀다 — 아마존이 address-1 에 도도부현·시를
  // 또 넣어 주는 경우가 있어, 받는 쪽이 state + address 로 붙이면 두 번 나간다 (00_config.gs)
  var fr = cleanAddrFrags_(out['ship-state'], out['ship-city'],
    out['ship-address-1'], out['ship-address-2'], out['ship-address-3']);
  out['ship-city'] = fr.city;
  out['ship-address-1'] = fr.a1;
  out['ship-address-2'] = fr.a2;
  out['ship-address-3'] = fr.a3;

  if (addrEdited || !origAddr) {
    // 주소를 손으로 고쳤거나 원본 주소가 없으면 시트 주소를 1번 칸에 넣는다.
    // ship-state · ship-city 는 따로 나가는 칸이라, 주소 앞머리에 같은 이름이
    // 들어 있으면 떼어낸다 (받는 쪽에서 두 번 붙는 것을 막는다).
    if (!out['ship-state']) out['ship-state'] = findPrefecture_(sheetAddr);
    out['ship-address-1'] = stripAddrHead_(sheetAddr, [out['ship-state'], out['ship-city']]);
    out['ship-address-2'] = '';
    out['ship-address-3'] = '';
  }

  return AMZ_EXPORT_COLUMNS.map(function (name) { return csvField_(out[name]); }).join(',');
}

/** [근석이] 한 행 → 박스 정보 + 상품 목록 */
function pickRowToBox_(v) {
  var box = {
    orderId: v[COL.ORDER_ID - 1],
    orderTime: v[COL.ORDER_TIME - 1],
    receiver: v[COL.RECEIVER - 1],
    tel: v[COL.TEL - 1],
    zip: v[COL.ZIP - 1],
    address: v[COL.ADDRESS - 1],
    country: v[COL.COUNTRY - 1]
  };

  var raw = String(v[COL.RAW - 1] || '');
  if (raw) {
    try {
      var g = JSON.parse(raw);
      if (g && g.items && g.items.length) {
        // 시트에서 앞의 0이 떨어진 번호는 원본으로 되돌린다
        box.tel = keepZeros_(box.tel, g.tel);
        box.zip = zipJP_(keepZeros_(box.zip, g.zip)) || box.zip;
        return { box: box, items: g.items, full: true };
      }
    } catch (e) { /* 아래 폴백 */ }
  }

  // _원본JSON 이 없는 행 (사람이 보이는 칸만 복사해 옮긴 경우) — 칸에서 되만든다
  var split = function (c) { return String(v[c - 1] || '').split('\n'); };
  var ids = split(COL.ORDER_IDS);
  var skus = split(COL.SKU);
  var titles = split(COL.TITLE_EN);
  var qtys = split(COL.QTY);
  var n = Math.max(skus.length, titles.length, qtys.length, 1);
  var items = [];
  for (var i = 0; i < n; i++) {
    items.push({
      orderId: ids[i] || ids[0] || box.orderId,
      orderItemId: '',
      purchaseDate: box.orderTime,
      sku: skus[i] || '',
      skuRaw: skus[i] || '',
      titleEn: titles[i] || '',
      qty: parseInt(qtys[i], 10) || 1
    });
  }
  return { box: box, items: items, full: false };
}

/** 다이얼로그가 부르는 서버 함수 — CSV 를 만들어 base64 로 돌려준다 */
function preparePickCsv() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PICK);
  if (!sh || sh.getLastRow() < 2) {
    return { count: 0, message: '[' + SHEET_PICK + '] 시트에 내려받을 주문이 없습니다.' };
  }

  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COL_COUNT).getValues();
  var lines = [AMZ_EXPORT_COLUMNS.map(csvField_).join(',')];
  var boxes = 0;
  var partial = 0;
  var ids = [];          // 내려받기를 누르면 이 박스들을 [완료] 로 옮긴다

  vals.forEach(function (v) {
    if (!String(v[COL.ORDER_ID - 1] || '').trim() && !String(v[COL.RECEIVER - 1] || '').trim()) return;
    var r = pickRowToBox_(v);
    boxes++;
    if (String(v[COL.ORDER_ID - 1] || '').trim()) ids.push(String(v[COL.ORDER_ID - 1]).trim());
    if (!r.full) partial++;
    r.items.forEach(function (it) { lines.push(amzExportRow_(it, r.box)); });
  });

  if (boxes === 0) {
    return { count: 0, message: '[' + SHEET_PICK + '] 시트에 내려받을 주문이 없습니다.' };
  }

  // 올려준 파일과 같이 — UTF-8 BOM + CRLF + 모든 값 따옴표
  var text = '﻿' + lines.join('\r\n') + '\r\n';
  var blob = Utilities.newBlob(text, 'text/csv');

  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
  var name = 'amazon_orders_Sheet1_' + stamp + '.csv';

  log_('근석이 다운', '아마존 양식 / 박스 ' + boxes + '건 → ' + (lines.length - 1) + '행 / ' + name +
    (partial ? ' / 원본JSON 없는 행 ' + partial + '건은 시트 칸으로 채움' : ''));

  return {
    format: '아마존',
    count: lines.length - 1,
    boxes: boxes,
    partial: partial,
    cut: 0,
    missing: [],
    header: true,
    columns: AMZ_EXPORT_COLUMNS.length,
    name: name,
    ids: ids,
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

/**
 * 다이얼로그가 '내려받기' 를 눌렀을 때 부른다 — 내려받은 박스를 [완료] 로 옮긴다.
 * 파일만 만들고 닫으면 아무것도 움직이지 않는다. 같은 창에서 '다시 내려받기' 는 다시 옮기지 않는다.
 */
function pickDownloaded(ids) {
  return { moved: moveToDoneFrom_(SHEET_PICK, ids || [], DONE_VIA_PICK) };
}

/**
 * 다이얼로그가 부르는 서버 함수 — [설정] 근석이_양식 에 따라 갈라진다.
 *  B2    → 야마토 B2 클라우드 95컬럼 (송장을 바로 뽑는다)
 *  아마존 → 아마존 주문 리포트 32컬럼 (원본을 그대로 넘긴다)
 */
function preparePickFile() {
  var mode = String(getConfig().근석이_양식 || 'B2').trim();
  if (mode === '아마존' || mode.toLowerCase() === 'amazon') return preparePickCsv();
  return preparePickB2();
}

function 근석이_시트_다운() {
  var mode = String(getConfig().근석이_양식 || 'B2').trim();
  var html = HtmlService.createHtmlOutputFromFile('pickcsv')
    .setWidth(500).setHeight(440);
  SpreadsheetApp.getUi().showModalDialog(html,
    SHEET_PICK + ' 시트 다운 (' + (mode === '아마존' ? '아마존 32컬럼' : '야마토 B2 95컬럼') + ')');
}

// ── 아마존 발송확인(주문완료) 파일 ─────────────────────────────────────
//
// 아마존은 KSE 접수번호(K…)를 추적번호로 받는 양식이 있다.
// 일본 국내 배송사(사가와 등)와 국내 송장번호를 넣으면 안 된다.
//
// 합배송이 문제다. 배송지가 같은 주문 3건을 한 박스로 묶으면 KSE 는 접수 1건 /
// 접수번호 1개를 준다. KSE 가 내려주는 파일에는 대표주문번호만 있으므로, 그 파일을
// 그대로 아마존에 올리면 나머지 2건은 발송 처리가 되지 않는다.
// 그래서 여기서 박스를 다시 주문상품 단위로 펼치고, 같은 접수번호를 각 줄에 붙인다.

var AMZ_SHIP_COLUMNS = [
  'order-id', 'order-item-id', 'quantity', 'ship-date',
  'carrier-code', 'carrier-name', 'tracking-number', 'ship-method'
];

/** 다이얼로그가 부르는 서버 함수 */
function prepareShipConfirm() {
  var cfg = getConfig();

  // ② 배송등록이 끝나면 송장번호를 받은 건은 바로 [완료] 로 넘어간다.
  // 그래서 [주문] 만 보면 방금 접수한 건이 빠진다 → 두 시트를 함께 본다.
  // [완료] 는 오래된 건까지 다시 올리지 않도록 최근 며칠만 본다.
  var days = Math.max(0, num_(cfg.발송확인_완료조회일수, 2));
  var cut = new Date(Date.now() - days * 86400000);

  var vals = [];
  var sh = ordersSheet_();
  if (sh.getLastRow() >= 2) {
    vals = vals.concat(sh.getRange(2, 1, sh.getLastRow() - 1, COL_COUNT).getValues());
  }
  var dsh = SpreadsheetApp.getActive().getSheetByName(SHEET_DONE);
  if (dsh && dsh.getLastRow() >= 2) {
    dsh.getRange(2, 1, dsh.getLastRow() - 1, COL_COUNT).getValues().forEach(function (v) {
      var at = String(v[COL.DONE_AT - 1] || '').trim();
      if (!at) { vals.push(v); return; }
      var d = new Date(at.replace(/-/g, '/'));
      if (isNaN(d.getTime()) || d >= cut) vals.push(v);
    });
  }
  if (!vals.length) {
    return { count: 0, message: '[' + SHEET_ORDERS + '] / [' + SHEET_DONE + '] 에 주문이 없습니다.' };
  }
  var shipDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var carrier = sanitize_(cfg.아마존_배송사코드) || 'KSE';
  var carrierName = sanitize_(cfg.아마존_배송사명);
  var method = sanitize_(cfg.아마존_배송방법) || 'Standard';

  // 아마존에는 KSE 접수번호(K…)를 넣는다. 국내 송장번호가 아니다.
  var useInvoice = String(cfg.아마존_송장기준 || '').trim() === '송장번호';
  var trackCol = useInvoice ? COL.INVOICE : COL.KSE_NO;
  var trackName = useInvoice ? '송장번호' : 'KSE접수번호';

  var lines = [AMZ_SHIP_COLUMNS.join('\t')];
  var boxes = 0;
  var noInvoice = 0;
  var noItemId = 0;
  var merged = 0;

  vals.forEach(function (v) {
    // 근석이·shipnergy 로 내려받아 끝난 건은 KSE 를 안 거쳐 접수번호가 없다 — 그쪽 송장으로 따로 한다
    var note = String(v[COL.NOTE - 1] || '');
    if (note.indexOf(DONE_VIA_PICK) >= 0 || note.indexOf(DONE_VIA_SHIP) >= 0) return;
    var inv = String(v[trackCol - 1] || '').trim();
    if (!inv) { if (String(v[COL.ORDER_ID - 1] || '').trim()) noInvoice++; return; }

    var r = pickRowToBox_(v);
    boxes++;
    if (r.items.length > 1) merged++;

    r.items.forEach(function (it) {
      var itemId = String(it.orderItemId || '').trim();
      if (!itemId) noItemId++;
      lines.push([
        String(it.orderId || v[COL.ORDER_ID - 1] || ''),
        itemId,
        String(parseInt(it.qty, 10) || 1),
        shipDate,
        carrier,
        carrierName,
        inv,
        method
      ].join('\t'));
    });
  });

  if (boxes === 0) {
    return {
      count: 0,
      message: trackName + '가 채워진 주문이 없습니다.' +
        (noInvoice ? '\n\n(' + trackName + ' 없는 주문 ' + noInvoice + '건 — ' +
          (useInvoice ? '점검 > 배송상태 새로고침 을 먼저 실행하세요'
            : '② KSE 배송등록 을 먼저 실행하세요') + ')' : '')
    };
  }

  var text = lines.join('\r\n') + '\r\n';
  var blob = Utilities.newBlob(text, 'text/tab-separated-values');
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
  var name = 'amazon_ship_confirm_' + stamp + '.txt';

  log_('발송확인', '박스 ' + boxes + '건 → ' + (lines.length - 1) + '행 (합배송 ' + merged +
    ') / 추적번호=' + trackName + ' / ' + trackName + '없음 ' + noInvoice +
    ' / 주문상품ID없음 ' + noItemId);

  return {
    count: lines.length - 1,
    boxes: boxes,
    merged: merged,
    noInvoice: noInvoice,
    noItemId: noItemId,
    carrier: carrier,
    carrierName: carrierName,
    method: method,
    shipDate: shipDate,
    trackName: trackName,
    sample: lines.length > 1 ? lines[1].split('\t')[6] : '',
    name: name,
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function 아마존_발송확인_다운() {
  var html = HtmlService.createHtmlOutputFromFile('shipconfirm')
    .setWidth(500).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, '아마존 발송확인 파일');
}
