/**
 * [shipnergy] 시트 → Shipnergy 주문 업로드 양식(34컬럼 xlsx).
 *
 * [근석이] 와 같은 구조다. 시트 자체는 [주문] 과 같은 25칸 양식을 그대로 써서
 * 사람이 [주문] 에서 손으로 행을 옮길 수 있게 하고, 양식 변환은 내려받을 때만 한다.
 *
 * 박스 1행 → 상품 1행으로 되펼친다.
 * Shipnergy 안내: "동일한 주문번호(order-id)가 연속으로 입력된 경우 합쳐져서
 * 1개의 주문건으로 업로드 됩니다" → 같은 박스의 줄을 붙여서 내보낸다.
 */

// 업로드 템플릿(amazon_jp.xlsx) 1행과 같은 순서·같은 이름
var SHIP_COLUMNS = [
  'order-id', 'order-item-id', 'purchase-date', 'payments-date',
  'buyer-email', 'buyer-name', 'buyer-phone-number',
  'sku', 'product-name', 'quantity-purchased',
  'currency', 'item-price', 'item-tax', 'shipping-price', 'shipping-tax',
  'ship-service-level', 'recipient-name', 'recipient-name-yomigana',
  'ship-address-1', 'ship-address-2', 'ship-address-3',
  'ship-city', 'ship-state', 'ship-postal-code', 'ship-country',
  'ship-phone-number',
  'delivery-start-date', 'delivery-end-date', 'delivery-time-zone',
  'delivery-Instructions', 'USER1', 'USER2', 'USER3', 'purchase-url'
];

/** Shipnergy 주문이 모이는 시트 — [주문] 과 같은 양식 */
function shipSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_SHIP);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SHIP);
    sh.getRange(1, 1, 1, COL_COUNT).setValues([HEADERS_ORDERS])
      .setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    applyTextFormat_(sh);
    if (sh.getMaxColumns() >= COL.RAW) sh.hideColumns(COL.RAW);
    sh.setColumnWidth(COL.ADDRESS, 280);
    sh.setColumnWidth(COL.TITLE_EN, 240);
    sh.getRange('A1').setNote(
      '[' + SHEET_ORDERS + '] 에서 Shipnergy 로 보낼 행을 이 시트로 옮기세요.\n' +
      '칸 구성은 [' + SHEET_ORDERS + '] 과 같아서 행을 그대로 복사·이동하면 됩니다.\n' +
      '메뉴의 [shipnergy 다운] 을 누르면 Shipnergy 업로드 양식(34컬럼)으로 바꿔 내려줍니다.');
  }
  return sh;
}

/**
 * Shipnergy 로 넘길 상품명 — 한국어 + 일본어 (KSE상품명 칸과 같은 모양).
 *
 * 사람이 [shipnergy] 시트의 KSE상품명 칸을 고쳤으면 그 줄을 쓴다
 * (여러 상품이면 줄 수가 상품 수와 같을 때만 줄별로 맞춘다). 아니면 번역값으로 만든다.
 */
function shipTitle_(it, sheetLine, cfg) {
  var line = String(sheetLine == null ? '' : sheetLine).trim();
  if (line) return line;
  var sep = cfg.상품명구분자 === undefined ? ' / ' : cfg.상품명구분자;
  var ko = String(it.titleKo || '').trim();
  var ja = String(it.titleEn || '').trim();
  if (!ko) return ja;
  if (!ja) return ko;
  return ko + sep + ja;
}

/** 상품 하나를 Shipnergy 한 줄로 */
function shipRow_(it, box, cfg, sheetTitle) {
  var a = it.amz || {};
  var get = function (name) {
    var v = a[name];
    return v == null ? '' : String(v);
  };

  var out = {};
  SHIP_COLUMNS.forEach(function (name) { out[name] = get(name); });

  // 원본 리포트에 없는 칸은 우리가 아는 값으로 채운다
  if (!out['order-id']) out['order-id'] = String(it.orderId || box.orderId || '');
  if (!out['order-item-id']) out['order-item-id'] = String(it.orderItemId || '');
  if (!out['purchase-date']) out['purchase-date'] = String(it.purchaseDate || box.orderTime || '');
  if (!out['payments-date']) out['payments-date'] = out['purchase-date'];
  if (!out['sku']) out['sku'] = String(it.sku || '');
  // 상품명은 한국어 + 일본어로 넘긴다 (원본 리포트의 일본어만이 아니라)
  out['product-name'] = shipTitle_(it, sheetTitle, cfg);
  if (!out['ship-service-level']) out['ship-service-level'] = 'Standard';

  var qty = parseInt(it.qty, 10) || 1;
  out['quantity-purchased'] = String(qty);
  if (!out['currency']) out['currency'] = cfg.KSE_통화 || 'JPY';
  // item-price 는 아마존 리포트와 같이 '줄 합계' 로 넣는다
  var line = num_(it.unitPrice, 0) > 0 ? round_(num_(it.unitPrice, 0) * qty, 2)
    : num_(it.linePrice, 0);
  if (line > 0) out['item-price'] = String(line);

  // 사람이 시트에서 고친 칸만 시트 값으로 바꾼다 (안 고쳤으면 원본 표기를 지킨다)
  var same = function (x) { return String(x).replace(/\s+/g, ''); };
  var prefer = function (name, sheetVal, norm) {
    var sv = String(sheetVal == null ? '' : sheetVal).trim();
    if (!sv) return;
    var ov = out[name];
    if (ov && norm(ov) === norm(sv)) return;
    out[name] = sv;
  };
  prefer('recipient-name', box.receiver, same);
  prefer('ship-postal-code', b2Zip_(box.zip), function (x) { return digits_(x); });
  prefer('ship-country', box.country, function (x) { return String(x).toUpperCase(); });
  if (!out['recipient-name']) out['recipient-name'] = String(box.receiver || '');

  // 수취인 전화번호 — Shipnergy 는 ship-phone-number 를 따로 받는다
  var tel = b2Tel_(box.tel);
  if (tel) out['ship-phone-number'] = tel;
  if (!out['buyer-phone-number']) out['buyer-phone-number'] = tel;

  // 주소 — 손으로 고쳤거나 원본 조각이 없으면 시트 주소를 1번 칸에 통째로
  var sheetAddr = String(box.address || '').trim();
  var origAddr = dedupePrefecture_([
    get('ship-state'), get('ship-city'),
    get('ship-address-1'), get('ship-address-2'), get('ship-address-3')
  ].filter(function (s) { return s; }).join(' '));
  if (!origAddr || (sheetAddr && sheetAddr !== origAddr)) {
    // Shipnergy 는 ship-state · ship-city 를 주소 앞에 다시 붙여 배송지를 만든다.
    // 시트 주소는 '도도부현 + 시 + 번지' 한 덩어리라, 그대로 넣으면 도도부현·시가
    // 두 번 나간다 ('千葉県 千葉県 茂原市…'). 그래서 앞머리를 떼고 넣는다.
    if (!out['ship-state']) out['ship-state'] = findPrefecture_(sheetAddr);
    out['ship-address-1'] = stripAddrHead_(sheetAddr, [out['ship-state'], out['ship-city']]);
    out['ship-address-2'] = '';
    out['ship-address-3'] = '';
  }

  return SHIP_COLUMNS.map(function (name) { return out[name]; });
}

// ── xlsx 만들기 ─────────────────────────────────────────────────────────
//
// Shipnergy 업로드 양식이 xlsx 라서 xlsx 로 내려준다.
// 시트 하나 + 문자열 인라인(inlineStr)만 쓰는 최소 구조로 직접 만든다.
// (Drive API 를 쓰지 않으므로 추가 권한이 필요 없다)

function xmlEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // 엑셀이 받지 않는 제어문자는 뺀다
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** 0 → A, 25 → Z, 26 → AA */
function colLetter_(i) {
  var s = '';
  var n = i + 1;
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

var XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
var XLSX_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** 2차원 배열 → xlsx Blob */
function xlsxBlob_(sheetName, rows, fileName) {
  var xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="' + XLSX_NS + '"><sheetData>'];
  for (var r = 0; r < rows.length; r++) {
    xml.push('<row r="' + (r + 1) + '">');
    for (var c = 0; c < rows[r].length; c++) {
      var v = rows[r][c];
      if (v === '' || v === null || v === undefined) continue;
      // 값은 모두 문자열로 넣는다 (주문번호·우편번호가 숫자로 바뀌어 0이 떨어지는 것을 막는다)
      xml.push('<c r="' + colLetter_(c) + (r + 1) + '" t="inlineStr"><is><t xml:space="preserve">' +
        xmlEsc_(v) + '</t></is></c>');
    }
    xml.push('</row>');
  }
  xml.push('</sheetData></worksheet>');

  var parts = [
    ['[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>'],
    ['_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + XLSX_R + '/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'],
    ['xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="' + XLSX_NS + '" xmlns:r="' + XLSX_R + '">' +
      '<sheets><sheet name="' + xmlEsc_(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>'],
    ['xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + XLSX_R + '/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>'],
    ['xl/worksheets/sheet1.xml', xml.join('')]
  ];

  var blobs = parts.map(function (p) {
    return Utilities.newBlob('', 'application/xml', p[0]).setDataFromString(p[1], 'UTF-8');
  });
  return Utilities.zip(blobs, fileName);
}

// ── 다운로드 ────────────────────────────────────────────────────────────

/** 다이얼로그가 부르는 서버 함수 */
function prepareShipnergy() {
  var cfg = getConfig();
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SHIP);
  if (!sh || sh.getLastRow() < 2) {
    return { count: 0, message: '[' + SHEET_SHIP + '] 시트에 내려받을 주문이 없습니다.\n\n' +
      '[' + SHEET_ORDERS + '] 에서 보낼 행을 옮긴 뒤 다시 실행하세요.' };
  }

  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COL_COUNT).getValues();
  var rows = [SHIP_COLUMNS.slice()];
  var boxes = 0;
  var partial = 0;
  var splitBoxes = 0;

  vals.forEach(function (v) {
    if (!String(v[COL.ORDER_ID - 1] || '').trim() && !String(v[COL.RECEIVER - 1] || '').trim()) return;
    var r = pickRowToBox_(v);
    boxes++;
    if (!r.full) partial++;

    // 같은 박스인데 주문번호가 서로 다르면 Shipnergy 는 따로 올린다 (안내용으로만 센다)
    var ids = {};
    r.items.forEach(function (it) { ids[String(it.orderId || '')] = true; });
    if (Object.keys(ids).length > 1) splitBoxes++;

    // 시트의 KSE상품명(한국어 / 일본어) — 줄 수가 상품 수와 같을 때만 줄별로 쓴다
    var kseLines = String(v[COL.TITLE_KSE - 1] || '').split('\n');
    var useLines = kseLines.length === r.items.length;
    r.items.forEach(function (it, idx) {
      rows.push(shipRow_(it, r.box, cfg, useLines ? kseLines[idx] : ''));
    });
  });

  if (boxes === 0) {
    return { count: 0, message: '[' + SHEET_SHIP + '] 시트에 내려받을 주문이 없습니다.' };
  }

  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
  var name = 'shipnergy_' + stamp + '.xlsx';
  var blob = xlsxBlob_('Sheet1', rows, name);

  log_('shipnergy', '박스 ' + boxes + '건 → ' + (rows.length - 1) + '행 / ' + name +
    (partial ? ' / 원본JSON 없는 행 ' + partial : '') +
    (splitBoxes ? ' / 주문번호 다른 합배송 ' + splitBoxes : ''));

  return {
    count: rows.length - 1,
    boxes: boxes,
    partial: partial,
    splitBoxes: splitBoxes,
    columns: SHIP_COLUMNS.length,
    name: name,
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function shipnergy_다운() {
  var html = HtmlService.createHtmlOutputFromFile('shipnergy')
    .setWidth(480).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html, 'shipnergy 다운');
}

/** [shipnergy] → [주문] 되돌리기 */
function shipnergy_되돌리기() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(SHEET_SHIP + ' → ' + SHEET_ORDERS + ' 으로 되돌리기',
    '되돌릴 대표주문번호를 콤마로 구분해 적어주세요.\n예: 250-5587398-0612618',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var ids = res.getResponseText().split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; });
  if (!ids.length) return;

  var want = {};
  ids.forEach(function (id) { want[id] = true; });

  var sh = shipSheet_();
  if (sh.getLastRow() < 2) { ui.alert('[' + SHEET_SHIP + '] 시트가 비어 있습니다.'); return; }

  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COL_COUNT).getValues();
  var picked = [];
  for (var i = 0; i < vals.length; i++) {
    if (want[String(vals[i][COL.ORDER_ID - 1]).trim()]) picked.push({ row: i + 2, v: vals[i] });
  }
  if (!picked.length) {
    ui.alert('[' + SHEET_SHIP + '] 시트에서 해당 주문번호를 찾지 못했습니다.');
    return;
  }

  var orders = ordersSheet_();
  var oStart = orders.getLastRow() + 1;
  var back = picked.map(function (p) {
    var v = p.v.slice();
    v[COL.STATUS - 1] = ST.READY;
    var biz = isBizRow_(v) ? NOTE_BIZ + ' / ' : '';
    v[COL.NOTE - 1] = biz + SHEET_SHIP + '에서 되돌림 ' + nowStr_();
    return v;
  });
  writeRows_(orders, oStart, back);
  markBizRows_(orders, oStart, back);

  deleteRowsAt_(sh, picked.map(function (p) { return p.row; }));
  SpreadsheetApp.flush();

  log_('되돌리기', SHEET_SHIP + ' → ' + SHEET_ORDERS + ' ' + picked.length + '건');
  ui.alert(picked.length + '건을 [' + SHEET_ORDERS + '] 시트로 되돌렸습니다.');
}

/** [shipnergy] 시트를 만들고 열어준다 */
function shipnergy_시트_열기() {
  var sh = shipSheet_();
  SpreadsheetApp.getActive().setActiveSheet(sh);
}
