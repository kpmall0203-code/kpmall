/**
 * 20_SPAPI.gs — 아마존 SP-API에서 전체 리스팅을 받아 "리스팅" 탭에 기록
 *
 * 기존 행의 한글명·검색어(수동)는 보존한다. SKU가 키.
 */

function getLwaToken_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_LWA_ID);
  var secret = props.getProperty(PROP_LWA_SECRET);
  var refresh = props.getProperty(PROP_LWA_REFRESH);
  if (!id || !secret || !refresh) {
    throw new Error('LWA 자격증명이 없습니다. 메뉴 [사입도우미 → SP-API 자격증명 설정]을 먼저 실행하세요.');
  }
  var res = UrlFetchApp.fetch('https://api.amazon.com/auth/o2/token', {
    method: 'post',
    payload: {
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: id,
      client_secret: secret
    },
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('LWA 토큰 실패: ' + (body.error_description || body.error || res.getResponseCode()));
  }
  return body.access_token;
}

function spapi_(token, method, path, payload) {
  var opt = {
    method: method,
    headers: { 'x-amz-access-token': token, 'Accept': 'application/json' },
    muteHttpExceptions: true
  };
  if (payload) {
    opt.contentType = 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(SPAPI_BASE + path, opt);
  var text = res.getContentText();
  var json = text ? JSON.parse(text) : {};
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    var msg = (json.errors && json.errors[0] && json.errors[0].message) || code;
    throw new Error(method + ' ' + path + ' 실패: ' + msg);
  }
  return json;
}

/** 헤더 이름 목록 중 먼저 찾히는 컬럼 위치 */
function colIndex_(header, names) {
  for (var i = 0; i < names.length; i++) {
    for (var c = 0; c < header.length; c++) {
      if (String(header[c]).trim().toLowerCase() === names[i].toLowerCase()) return c;
    }
  }
  return -1;
}

/** 리포트 TSV → [{sku, asin, jp, price, qty, status}] */
function parseListingReport_(text) {
  var lines = text.split('\n').filter(function (l) { return l.trim(); });
  if (!lines.length) return [];
  var header = lines[0].split('\t').map(function (h) {
    return String(h).replace(/^﻿/, '').trim();
  });
  var cSku = colIndex_(header, HDR_SKU);
  var cName = colIndex_(header, HDR_NAME);
  var cPid = colIndex_(header, HDR_PID);
  var cPrice = colIndex_(header, HDR_PRICE);
  var cQty = colIndex_(header, HDR_QTY);
  var cStatus = colIndex_(header, HDR_STATUS);
  // 등록일도 같은 리포트에 들어 있다. 따로 리포트를 또 뽑으면 6분 한도를 넘긴다.
  var cOpen = colIndex_(header, ['open-date', '出品日', 'オープン日']);
  if (cSku < 0 || cName < 0) {
    throw new Error('리포트에서 SKU/상품명 컬럼을 못 찾음: ' + header.join(', '));
  }

  var out = [];
  for (var i = 1; i < lines.length; i++) {
    var f = lines[i].split('\t');
    var g = function (idx) { return (idx >= 0 && idx < f.length) ? String(f[idx]).trim() : ''; };
    var sku = g(cSku);
    if (!sku) continue;
    var pid = g(cPid);
    var od = g(cOpen);
    var dm = od ? od.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/) : null;
    out.push({
      sku: sku,
      // 商品IDタイプ가 JAN/EAN이면 ASIN이 아니다. 형식으로 판별.
      asin: /^B[0-9A-Z]{9}$/.test(pid) ? pid : '',
      jp: g(cName),
      price: g(cPrice),
      qty: g(cQty),
      status: g(cStatus),
      openDate: dm ? (dm[1] + '-' + pad2_(dm[2]) + '-' + pad2_(dm[3])) : ''
    });
  }
  return out;
}

/** 메뉴에서 호출: 리스팅 전체 갱신 */
function updateListings() {
  var t0 = Date.now();
  toast_('SP-API 리포트 요청 중…');
  var token = getLwaToken_();

  var created = spapi_(token, 'post', '/reports/2021-06-30/reports', {
    reportType: REPORT_TYPE,
    marketplaceIds: [MARKETPLACE_JP]
  });
  var reportId = created.reportId;
  log_('spapi', 'INFO', '리포트 생성 reportId=' + reportId);

  // 폴링 (실행 시간 한도 안에서)
  var docId = null;
  while (Date.now() - t0 < 4 * 60 * 1000) {
    Utilities.sleep(10000);
    var info = spapi_(token, 'get', '/reports/2021-06-30/reports/' + reportId);
    if (info.processingStatus === 'DONE') { docId = info.reportDocumentId; break; }
    if (info.processingStatus === 'FATAL' || info.processingStatus === 'CANCELLED') {
      throw new Error('리포트 처리 실패: ' + info.processingStatus);
    }
  }
  if (!docId) {
    throw new Error('리포트 처리가 4분 안에 끝나지 않았습니다. 잠시 후 다시 실행하세요. (reportId=' + reportId + ')');
  }

  toast_('리포트 다운로드 중…');
  var doc = spapi_(token, 'get', '/reports/2021-06-30/documents/' + docId);
  var res = UrlFetchApp.fetch(doc.url, { muteHttpExceptions: true });
  var blob = res.getBlob();
  var text;
  if (doc.compressionAlgorithm === 'GZIP') {
    text = Utilities.ungzip(blob.setContentType('application/x-gzip')).getDataAsString('UTF-8');
  } else {
    text = blob.getDataAsString('UTF-8');
  }

  var items = parseListingReport_(text);
  if (!items.length) throw new Error('리포트에 데이터가 없습니다.');

  writeListings_(items);
  var msg = '리스팅 ' + items.length + '건 갱신 완료 (' + Math.round((Date.now() - t0) / 1000) + '초)';
  log_('spapi', 'INFO', msg);
  toast_(msg);
  try { ui_().alert(msg + '\n\n다음: 메뉴 [사입도우미 → ③ 한글 번역 시작]를 실행하세요.'); } catch (e) {}
}

/** 시트에 기록 — 기존 한글명/수동검색어는 보존 */
function writeListings_(items) {
  var sh = ensureSheet_(SHEET_LISTING, LISTING_HEADER);
  var last = sh.getLastRow();
  var prev = {};
  if (last > 1) {
    var old = sh.getRange(2, 1, last - 1, LISTING_HEADER.length).getValues();
    for (var r = 0; r < old.length; r++) {
      var sku = String(old[r][L_SKU] || '').trim();
      if (sku) prev[sku] = old[r];
    }
  }

  var rows = items.map(function (it) {
    var p = prev[it.sku];
    return [
      it.sku,
      it.asin,
      it.jp,
      p ? p[L_KR] : '',        // 번역 결과 보존
      p ? p[L_MANUAL] : '',    // 수동 검색어 보존
      p ? p[L_TRAT] : '',
      it.price,
      it.qty,
      it.status
    ];
  });

  // 일본어 상품명이 바뀐 상품은 번역을 무효화한다 (상품이 교체된 경우)
  var invalidated = 0;
  for (var i = 0; i < rows.length; i++) {
    var p = prev[rows[i][L_SKU]];
    if (p && String(p[L_JP]) !== String(rows[i][L_JP]) && rows[i][L_KR]) {
      rows[i][L_KR] = '';
      rows[i][L_TRAT] = '';
      invalidated++;
    }
  }

  sh.clearContents();
  sh.getRange(1, 1, 1, LISTING_HEADER.length).setValues([LISTING_HEADER]);
  // 대량 기록은 나눠서
  var CH = 2000;
  for (var s = 0; s < rows.length; s += CH) {
    var part = rows.slice(s, s + CH);
    sh.getRange(2 + s, 1, part.length, LISTING_HEADER.length).setValues(part);
  }
  sh.setFrozenRows(1);
  if (invalidated) log_('spapi', 'INFO', '상품명이 바뀌어 번역 무효화: ' + invalidated + '건');
}
