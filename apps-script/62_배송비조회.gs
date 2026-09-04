/**
 * 62_배송비조회.gs — SKU 목록을 주면 배송비를 채워 돌려준다
 *
 * 사입 검토 단계에서 "이 물건 보내면 배송비 얼마 나오지?"를 매번 손으로 찾는 건
 * 낭비다. 청구서에 실제로 나간 값이 이미 쌓여 있으니 SKU만 주면 붙여 줄 수 있다.
 *
 * 쓰는 길이 세 가지다:
 *   [파일]      Drive 폴더에 SKU가 든 xlsx/csv를 넣고 메뉴 실행 → 결과 탭 생성
 *   [붙여넣기]  '배송비조회' 탭 A열에 SKU를 붙여넣고 메뉴 실행
 *   [수식]      아무 셀에서 =실측배송비(A2) 처럼 직접 호출
 *
 * 실측이 없는 SKU는 무게·치수로 요율표 계산까지 해 보고, 그것도 없으면
 * 비워 둔다. 근거 열에 어느 방법을 썼는지 반드시 남긴다 —
 * 추정값을 실측인 줄 알고 쓰는 게 제일 위험하다.
 */

var SHEET_SHIPLOOKUP = '배송비조회';
var SHIPLOOKUP_HEADER = [
  'SKU', '배송비(JPY)', '근거', '배송건수', '실무게(KG)', '적용무게(KG)',
  '가로(cm)', '세로(cm)', '높이(cm)', '냉장', '최근가격(JPY)', 's(배송비/판매가)'
];

/** 메뉴: 조회 탭 만들기 (여기에 SKU를 붙여넣는다) */
function setupShipLookup() {
  var sh = ensureSheet_(SHEET_SHIPLOOKUP, SHIPLOOKUP_HEADER);
  if (sh.getLastRow() <= 1) {
    sh.getRange(1, 1, 1, SHIPLOOKUP_HEADER.length).setValues([SHIPLOOKUP_HEADER])
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 320);
    sh.getRange(2, 1).setNote(
      'A열에 SKU를 붙여넣고 메뉴 [배송비 채우기]를 실행하세요.\n' +
      '나머지 열은 청구서 실측에서 자동으로 채워집니다.');
  }
  toast_('배송비조회 탭 준비 완료 — A열에 SKU를 붙여넣으세요');
  try {
    ui_().alert('배송비 조회',
      'A열에 SKU를 붙여넣은 뒤 [배송비 채우기]를 실행하세요.\n\n' +
      '엑셀 파일로 조회하려면 청구서 폴더에 SKU가 든 xlsx/csv를 넣고\n' +
      '[파일로 배송비 조회]를 실행하면 됩니다.',
      ui_().ButtonSet.OK);
  } catch (e) {}
}

/** SKU 하나에 대한 조회 결과 행을 만든다 */
function shipLookupRow_(sku, skuCost, manual, priceOf) {
  var c = skuCost[sku];
  var m = manual[sku];
  var rs = resolveShipping_(sku, skuCost, manual);
  var price = priceOf[sku] || '';
  var grams = (m && m.grams) ? m.grams / 1000 : (c && c.actual ? c.actual : '');
  return [
    sku,
    rs.fee || '',
    rs.src,
    c ? c.n : 0,
    grams,
    c && c.weight ? c.weight : '',
    (m && m.w) ? m.w : (c && c.dw ? c.dw : ''),
    (m && m.h) ? m.h : (c && c.dh ? c.dh : ''),
    (m && m.d) ? m.d : (c && c.dd ? c.dd : ''),
    rs.cool,
    price,
    (price && rs.fee) ? Number((rs.fee / price).toFixed(3)) : ''
  ];
}

function shipLookupContext_() {
  clearCostSheetCache_(); clearCostCache_();
  var priceOf = {};
  var listSh = ss_().getSheetByName(SHEET_LISTING);
  if (listSh && listSh.getLastRow() > 1) {
    var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      var s = String(lv[i][L_SKU] || '').trim();
      if (s) priceOf[s] = Number(lv[i][L_PRICE]) || 0;
    }
  }
  return { skuCost: skuCostMap_(), manual: costInfoMap_(), priceOf: priceOf };
}

/** 메뉴: 배송비조회 탭 A열의 SKU를 채운다 */
function fillShipLookup() {
  var sh = ss_().getSheetByName(SHEET_SHIPLOOKUP);
  if (!sh || sh.getLastRow() < 2) {
    throw new Error('"' + SHEET_SHIPLOOKUP + '" 탭 A열에 SKU를 먼저 붙여넣으세요.\n' +
      '(탭이 없으면 [배송비 조회 탭 만들기]를 실행하세요)');
  }
  var n = sh.getLastRow() - 1;
  var skus = sh.getRange(2, 1, n, 1).getValues();
  var ctx = shipLookupContext_();

  var rows = [], hit = 0;
  for (var i = 0; i < n; i++) {
    var sku = String(skus[i][0] || '').trim();
    if (!sku) { rows.push(new Array(SHIPLOOKUP_HEADER.length).fill('')); continue; }
    var r = shipLookupRow_(sku, ctx.skuCost, ctx.manual, ctx.priceOf);
    if (r[3] > 0) hit++;
    rows.push(r);
  }
  writeShipLookup_(sh, rows, hit);
  var msg = '배송비 조회 ' + rows.length + '건 · 실측 확보 ' + hit + '건';
  toast_(msg);
  return msg;
}

/** 메뉴: Drive 폴더의 엑셀/CSV에서 SKU를 읽어 조회 */
function lookupShippingFromFile() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(PROP_INVOICE_FOLDER);
  if (!folderId) throw new Error('먼저 [청구서 폴더 지정]을 실행하세요.');

  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var cands = [];
  while (files.hasNext()) {
    var f = files.next();
    var nm = f.getName();
    // 청구서·주문보고서·피드는 제외 — 조회용 파일만 고른다
    if (/청구서|price_feed|optimize_feed|ROLLBACK|UNDO/i.test(nm)) continue;
    if (/\.(xlsx|csv|tsv|txt)$/i.test(nm)) cands.push(f);
  }
  if (!cands.length) {
    // "파일이 없다"는 말만 하면 원인을 알 수 없다. 폴더에 실제로 뭐가 있는지 보여준다.
    var seen = [], it2 = folder.getFiles();
    while (it2.hasNext() && seen.length < 15) seen.push(it2.next().getName());
    throw new Error('조회할 파일이 없습니다.\n\n' +
      '폴더: ' + folder.getName() + '\n' +
      '폴더 안 파일 ' + seen.length + '개\n  ' + (seen.join('\n  ') || '(비어 있음)') + '\n\n' +
      '청구서·피드 파일은 조회 대상에서 자동 제외됩니다.\n' +
      'SKU 목록이 든 xlsx/csv를 따로 올려주세요.\n' +
      '(파일명에 "청구서"가 들어가면 제외되니 다른 이름으로 저장하세요)');
  }

  var lines = cands.map(function (f, i) { return (i + 1) + ') ' + f.getName(); }).join('\n');
  var res = ui_().prompt('배송비 조회할 파일 선택', lines + '\n\n번호를 입력하세요',
                         ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var pick = parseInt(res.getResponseText().trim(), 10);
  if (!(pick >= 1 && pick <= cands.length)) throw new Error('잘못된 번호입니다.');
  var file = cands[pick - 1];

  var skus = /\.xlsx$/i.test(file.getName())
    ? readSkusFromXlsx_(file)
    : readSkusFromText_(file.getBlob().getDataAsString('UTF-8'));
  if (!skus.length) throw new Error('파일에서 SKU를 찾지 못했습니다: ' + file.getName());

  var ctx = shipLookupContext_();
  var rows = [], hit = 0;
  for (var i = 0; i < skus.length; i++) {
    var r = shipLookupRow_(skus[i], ctx.skuCost, ctx.manual, ctx.priceOf);
    if (r[3] > 0) hit++;
    rows.push(r);
  }

  var sh = ensureSheet_(SHEET_SHIPLOOKUP, SHIPLOOKUP_HEADER);
  sh.clear();
  writeShipLookup_(sh, rows, hit, file.getName());

  var msg = file.getName() + ' → ' + rows.length + '건 조회 · 실측 확보 ' + hit + '건';
  log_('lookup', 'INFO', msg);
  try {
    ui_().alert('배송비 조회 완료',
      msg + '\n\n' +
      '"' + SHEET_SHIPLOOKUP + '" 탭에서 확인하세요.\n' +
      '[근거] 열이 실측인지 추정인지 알려줍니다 —\n' +
      '추정값을 실측으로 오해하지 않도록 꼭 확인하세요.',
      ui_().ButtonSet.OK);
  } catch (e) {}
  return msg;
}

function writeShipLookup_(sh, rows, hit, srcName) {
  sh.getRange(1, 1, 1, SHIPLOOKUP_HEADER.length).setValues([SHIPLOOKUP_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 320);
  if (rows.length) {
    var CH = 2000;
    for (var s = 0; s < rows.length; s += CH) {
      var part = rows.slice(s, s + CH);
      sh.getRange(2 + s, 1, part.length, SHIPLOOKUP_HEADER.length).setValues(part);
    }
    // 근거가 실측이 아니면 눈에 띄게 — 추정을 실측으로 오해하면 사입 판단이 틀어진다
    var colors = rows.map(function (r) {
      var src = String(r[2] || '');
      return [src.indexOf('실측') === 0 ? '#e6f4ea'
            : src.indexOf('직접') === 0 ? '#e8f0fe'
            : src ? '#fef7e0' : '#ffffff'];
    });
    sh.getRange(2, 3, rows.length, 1).setBackgrounds(colors);
  }
  sh.autoResizeColumns(2, SHIPLOOKUP_HEADER.length - 1);
  sh.getRange(1, 3).setNote(
    '실측(n건) — 청구서에서 실제로 나간 요금. 가장 믿을 만함\n' +
    '직접입력 — 원가 탭에 사람이 못 박은 값\n' +
    '무게계산 — 무게·치수로 요율표에서 계산\n' +
    '추정(0.5kg) — 아무 정보가 없어 기본값을 쓴 것. 신뢰도 낮음' +
    (srcName ? '\n\n출처: ' + srcName : ''));
}

/** xlsx → SKU 배열 (Drive로 구글시트 변환 후 읽고 사본 삭제) */
function readSkusFromXlsx_(file) {
  var copyId = null;
  try {
    var copy = Drive.Files.copy(
      { name: '__tmp_lookup_' + file.getId(), mimeType: 'application/vnd.google-apps.spreadsheet' },
      file.getId());
    copyId = copy.id;
  } catch (e) {
    throw new Error('xlsx를 읽지 못했습니다: ' + file.getName() + '\n\n' +
      '원인: ' + e + '\n\n' +
      'Apps Script 편집기 왼쪽 [서비스 +] 에서 "Drive API"를 버전 v3로\n' +
      '추가했는지 확인하세요.\n' +
      'csv로 저장해 올리면 이 변환 없이 바로 읽습니다.');
  }
  try {
    var src = SpreadsheetApp.openById(copyId);
    var sheet = src.getSheets()[0];
    var vals = sheet.getDataRange().getValues();
    return pickSkuColumn_(vals);
  } finally {
    if (copyId) { try { Drive.Files.remove(copyId); } catch (e2) {} }
  }
}

function readSkusFromText_(text) {
  var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
  var delim = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
  var vals = lines.map(function (l) {
    return l.split(delim).map(function (c) { return c.replace(/^"|"$/g, '').trim(); });
  });
  return pickSkuColumn_(vals);
}

/**
 * 2차원 값에서 SKU 열을 골라낸다.
 * 머리글에 SKU류 이름이 있으면 그 열, 없으면 첫 열을 쓴다.
 */
function pickSkuColumn_(vals) {
  if (!vals.length) return [];
  var hdr = vals[0].map(function (h) { return String(h).replace(/^﻿/, '').trim().toLowerCase(); });
  var names = ['sku', 'seller-sku', 'seller_sku', '출품자sku', '出品者sku', '상품코드'];
  var col = -1;
  for (var i = 0; i < names.length && col < 0; i++) {
    var at = hdr.indexOf(names[i]);
    if (at >= 0) col = at;
  }
  var start = 1;
  if (col < 0) { col = 0; start = 0; }   // 머리글이 없으면 첫 행부터 데이터로 본다

  var out = [], seen = {};
  for (var r = start; r < vals.length; r++) {
    var v = String((vals[r] || [])[col] || '').trim();
    if (!v || seen[v]) continue;
    seen[v] = true;
    out.push(v);
  }
  return out;
}

/**
 * 커스텀 함수: 그 SKU의 배송비(JPY). 실측 > 무게계산 > 추정 순으로 정한다.
 * @param {string} sku SKU
 * @return {number} 배송비 JPY
 * @customfunction
 */
function 실측배송비(sku) {
  if (!sku) return '';
  var ctx = { skuCost: skuCostMap_(), manual: costInfoMap_() };
  return resolveShipping_(String(sku).trim(), ctx.skuCost, ctx.manual).fee;
}

/**
 * 커스텀 함수: 그 배송비가 어디서 나왔는지 (실측/직접입력/무게계산/추정)
 * @param {string} sku SKU
 * @return {string} 근거
 * @customfunction
 */
function 배송비근거(sku) {
  if (!sku) return '';
  var ctx = { skuCost: skuCostMap_(), manual: costInfoMap_() };
  return resolveShipping_(String(sku).trim(), ctx.skuCost, ctx.manual).src;
}
