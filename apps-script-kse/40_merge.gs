/**
 * ① 아마존 주문자료 + 가격자료 병합 → 배송지별로 묶어 [주문] 시트에.
 *
 * 아마존은 주문 리포트에 금액이 없고 가격자료를 따로 준다. 둘을 order-item-id 로 잇는다.
 * 가격을 못 찾은 행은 [가격없음] 시트로 분리한다 — 단가 없이 통관신고를 보낼 수 없으므로
 * KSE로 내보내지 않는다.
 */

/** 아마존 주문 리포트 컬럼명 (리포트 종류에 따라 이름이 조금씩 달라 후보를 둔다) */
/**
 * 원본 리포트 행을 헤더이름→값 으로 담아둔다.
 * [근석이] 를 아마존 양식으로 되내보낼 때 쓴다 (구매자 이메일·결제수단처럼
 * 시트 칸에 없는 값까지 그대로 살리기 위해). 빈 값은 넣지 않는다.
 */
function amzRow_(row, index) {
  var out = {};
  for (var name in index) {
    var i = index[name];
    if (i === undefined || i < 0 || i >= row.length) continue;
    var v = String(row[i] == null ? '' : row[i]).trim();
    if (v) out[name] = v;
  }
  return out;
}

function amzCols_(index) {
  return {
    orderId: findCol_(index, 'order-id', 'amazon-order-id', 'order_id'),
    orderItemId: findCol_(index, 'order-item-id', 'order_item_id'),
    purchaseDate: findCol_(index, 'purchase-date', 'purchase_date'),
    sku: findCol_(index, 'sku', 'seller-sku'),
    titleEn: findCol_(index, 'product-name', 'item-name', 'title'),
    qty: findCol_(index, 'quantity-purchased', 'quantity', 'quantity-to-ship'),
    recipient: findCol_(index, 'recipient-name', 'buyer-name'),
    tel: findCol_(index, 'ship-phone-number', 'buyer-phone-number'),
    zip: findCol_(index, 'ship-postal-code', 'ship-zip'),
    country: findCol_(index, 'ship-country'),
    itemPrice: findCol_(index, 'item-price')
  };
}

/** [설정] 주소조립순서 대로 주소 컬럼을 이어 붙인다 (빈 칸은 건너뜀) */
function buildAddress_(row, index, cfg) {
  var order = String(cfg.주소조립순서 || '').split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s; });
  var parts = [];
  for (var i = 0; i < order.length; i++) {
    var idx = index[order[i]];
    if (idx === undefined) continue;
    var v = cellAt_(row, idx);
    if (v) parts.push(v);
  }
  return dedupePrefecture_(parts.join(' '));
}

/**
 * 업로드 다이얼로그가 부른다. 어느 파일이 무엇인지 알아서 가른다.
 * google.script.run 이 함수 이름을 문자열로 넘기므로 ASCII 이름을 쓴다.
 *
 * @param {Array} files [{ name, b64 }, ...]
 */
function mergeAmazonFiles(files) {
  if (!files || !files.length) return { added: 0, message: '파일이 없습니다.' };

  var parsed = files.map(function (f) {
    var rep = readReport_(Utilities.base64Decode(f.b64));
    rep.name = f.name;
    rep.hasPrice = findCol_(rep.index, 'item-price', 'item_price') >= 0 &&
                   findCol_(rep.index, 'order-item-id', 'order_item_id') >= 0;
    rep.hasShipTo = findCol_(rep.index, 'recipient-name', 'buyer-name') >= 0 &&
                    findCol_(rep.index, 'ship-postal-code', 'ship-address-1') >= 0;
    return rep;
  });

  var priced = parsed.filter(function (r) { return r.hasPrice; });
  if (!priced.length) {
    return { added: 0, message: 'item-price 가 있는 파일이 없습니다.\n' +
      parsed.map(function (r) { return '· ' + r.name + ' — ' + r.header.slice(0, 8).join(', '); }).join('\n') };
  }

  // 가격자료: 가격이 있는 파일. 주소가 없는 순수 가격 리포트를 먼저,
  // 다 주소를 갖고 있으면 행이 많은 쪽(결제 리포트가 더 긴 기간을 담는다)을 고른다.
  var pureP = priced.filter(function (r) { return !r.hasShipTo; });
  var prc = (pureP.length ? pureP : priced.slice().sort(function (a, b) {
    return b.rows.length - a.rows.length;
  }))[0];

  // 주문자료 = 실제로 보낼 목록. 가격이 없는(=미출하) 리포트가 이쪽이다.
  // 가격 리포트에도 주소가 들어있지만 거기엔 보낼 대상이 아닌 과거 주문까지 섞여 있어
  // 주문 목록으로 쓰지 않는다.
  var ordCands = parsed.filter(function (r) { return !r.hasPrice && r.hasShipTo; });
  if (!ordCands.length) {
    return { added: 0, message: '보낼 주문 목록 파일이 없습니다.\n' +
      '가격이 없는 주문 리포트(미출하 주문)를 같이 올려주세요.\n\n' +
      parsed.map(function (r) {
        return '· ' + r.name + (r.hasPrice ? ' — 가격자료' : ' — 수취인·주소 없음');
      }).join('\n') };
  }
  var ord = ordCands[0];
  var label = '주문 ' + ord.name + ' / 가격 ' + prc.name;
  log_('병합', '파일 판별 — ' + label);
  return mergeReports_(ord, prc, label);
}

/** 판별이 끝난 두 리포트를 병합한다. */
function mergeReports_(ord, prc, names) {
  var cfg = getConfig();
  if (!ord.rows.length) return { added: 0, message: '주문자료에서 읽은 행이 없습니다.' };

  var oc = amzCols_(ord.index);
  if (oc.orderItemId < 0) {
    return { added: 0, message: '주문자료에 order-item-id 컬럼이 없습니다.' };
  }

  // Shift-JIS 로 내려온 리포트는 한글 SKU가 공백으로 날아간다.
  // ('민티드 고체치약 90정' → '            90')
  // SKU 는 KSE 필수값이 아니고 마스터 매칭에만 쓰이므로 막지는 않고, 몇 건인지만 알린다.
  // 손상된 SKU 는 아래에서 마스터에 등록하지 않고 빈값으로 보낸다.
  var skuBrokenCount = 0;
  if (oc.sku >= 0) {
    ord.rows.forEach(function (r) {
      if (cellAt_(r, oc.orderItemId) && !skuUsable_(r[oc.sku])) skuBrokenCount++;
    });
  }

  // 가격자료: order-item-id → { price, tel, currency }
  //
  // 가격자료(결제 리포트)에는 주문자료(미출하 리포트)에 없는 값이 더 들어있다 —
  // ship-phone-number 와 currency. 주문자료 쪽이 비면 여기서 끌어다 쓴다.
  var pItemId = findCol_(prc.index, 'order-item-id', 'order_item_id');
  var pPrice = findCol_(prc.index, 'item-price', 'item_price', 'price');
  if (pItemId < 0 || pPrice < 0) {
    return { added: 0, message: '가격자료(' + (prc.name || '') + ')에서 order-item-id 또는 ' +
      'item-price 컬럼을 찾지 못했습니다.\n읽은 컬럼: ' + prc.header.slice(0, 15).join(', ') };
  }
  // 가격자료에서는 item-price 만 쓴다. 나머지 컬럼(주소·전화·수량 등)은
  // 보낼 대상이 아닌 과거 주문까지 섞여 있어 쓰지 않는다.
  var priceMap = {};
  prc.rows.forEach(function (r) {
    var k = cellAt_(r, pItemId);
    if (k && priceMap[k] === undefined) priceMap[k] = cellAt_(r, pPrice);
  });

  // 이미 들어온 주문번호 — [주문]과 [완료] 양쪽을 본다
  var seen = {};
  function collectSeen(sheetName) {
    var sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, COL.ORDER_IDS, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      String(r[0] || '').split('\n').forEach(function (id) {
        var t = id.trim();
        if (t) seen[t] = true;
      });
    });
  }
  collectSeen(SHEET_ORDERS);
  collectSeen(SHEET_DONE);

  var noPrice = [];      // 가격 못 찾은 원본 행
  var items = [];        // 병합 성공 행
  var skippedDup = 0;
  var dupIds = [];       // 중복으로 뺀 주문번호 — 로그에 남긴다

  ord.rows.forEach(function (r) {
    var orderId = cellAt_(r, oc.orderId);
    var itemId = cellAt_(r, oc.orderItemId);
    if (!orderId && !itemId) return;

    if (seen[orderId]) {
      skippedDup++;
      if (dupIds.indexOf(orderId) < 0) dupIds.push(orderId);
      return;
    }

    // 가격을 못 찾은 행도 빼지 않고 같이 묶는다.
    // 배송지가 같으면 한 박스이므로, 가격 없는 상품만 따로 떼어놓으면
    // 같은 박스의 나머지 상품이 가격만 있는 반쪽 박스로 나가버린다.
    var priceRaw = priceMap[itemId];
    var hasPrice = !(priceRaw === undefined || String(priceRaw).trim() === '');
    if (!hasPrice) noPrice.push(r);

    var qty = parseInt(num_(cellAt_(r, oc.qty), 1), 10) || 1;
    var linePrice = hasPrice ? num_(priceRaw, 0) : 0;
    var unit = String(cfg.단가기준 || '').trim() === '그대로'
      ? linePrice
      : round_(linePrice / (qty || 1), 2);

    var address = buildAddress_(r, ord.index, cfg);
    // 우편번호 칸이 비고 주소 안에 들어가 있는 자료가 섞여 있다.
    // KSE는 ReceiverZipCode가 필수라서, 비면 주소에서 7자리를 찾아 채운다.
    var zip = zipJP_(cellAt_(r, oc.zip));
    if (zip.length !== 7) {
      var found = findZip_(address);
      if (found) zip = found;
    }

    items.push({
      orderId: orderId,
      orderItemId: itemId,
      purchaseDate: cellAt_(r, oc.purchaseDate),
      sku: cellAt_(r, oc.sku),
      skuRaw: (oc.sku >= 0 && oc.sku < r.length) ? r[oc.sku] : '',
      titleEn: cellAt_(r, oc.titleEn),
      qty: qty,
      linePrice: linePrice,
      unitPrice: unit,
      noPrice: !hasPrice,
      receiver: cellAt_(r, oc.recipient),
      tel: cellAt_(r, oc.tel),
      zip: zip,
      address: address,
      country: cellAt_(r, oc.country),
      amz: amzRow_(r, ord.index),
      // 아마존 리포트의 is-business-order (법인/사업자 주문)
      business: /^(true|1|y|yes)$/i.test(String(cellAt_(r, findCol_(ord.index,
        'is-business-order', 'is_business_order')) || ''))
    });
  });

  if (!items.length) {
    var msg = '새로 넣을 주문이 없습니다.' +
      (skippedDup ? ' (이미 등록 ' + skippedDup + '행)' : '') +
      (noPrice.length ? ' / 가격없음 ' + noPrice.length + '행' : '');
    log_('병합', msg);
    return { added: 0, message: msg };
  }

  // ── 배송지(수취인+주소)로 묶기 ─────────────────────────────────────────
  var byGroup = {};
  var groupOrder = [];
  var byShipTo = String(cfg.합배송기준 || '배송지').trim() !== '주문';

  items.forEach(function (it) {
    var key = byShipTo
      ? (normKey_(it.receiver) + '|' + normKey_(it.zip) + '|' + normKey_(it.address))
      : ('order|' + it.orderId);
    if (!byGroup[key]) {
      byGroup[key] = {
        key: key,
        receiver: it.receiver,
        tel: it.tel,
        zip: it.zip,
        address: it.address,
        country: it.country,
        orderIds: [],
        items: []
      };
      groupOrder.push(key);
    }
    var g = byGroup[key];
    g.items.push(it);
    if (g.orderIds.indexOf(it.orderId) < 0) g.orderIds.push(it.orderId);
    // 전화번호는 비어 있는 행도 있어서, 채워진 값이 나오면 그걸 쓴다
    if (!g.tel && it.tel) g.tel = it.tel;
  });

  // 손상된 SKU는 KSE 상품코드로 못 쓴다. 빈값으로 두고 표시만 남긴다.
  items.forEach(function (it) {
    if (!skuUsable_(it.skuRaw)) {
      it.skuBroken = !!String(it.sku || '').trim();
      it.sku = '';
    }
  });

  // 상품명을 여기서 한 번 번역해 각 주문에 넣어둔다.
  // 상품명을 모아 한꺼번에 보낸다 (같은 상품명은 한 번만, 기본 50개씩 묶어서).
  // ② 배송등록 때는 다시 번역하지 않는다.
  var tr = translateMany_(items.map(function (it) { return it.titleEn; }), cfg);
  items.forEach(function (it) {
    var t = tr.map[String(it.titleEn || '').trim()] || { ko: '', en: '' };
    it.titleKo = t.ko;
    it.titleEng = t.en;
  });
  var titleCount = tr.ai + tr.google;
  if (tr.error) log_('상품명번역', tr.error);

  var sep = cfg.상품명구분자;
  var defaultWeight = num_(cfg.기본무게, 0.1);
  var threshold = num_(cfg.관세임계값, 0);
  var dutyRows = [];       // 관세 신고 대상 → [오류확인] 으로 보낼 행 인덱스
  var pickRows = [];       // 지정 상품명만 담긴 박스 → [근석이] 로 보낼 행 인덱스
  var pickMixed = 0;       // 지정 상품명이 섞인 박스 (규칙상 [주문] 에 남긴다)
  var pickCfg = pickList_();
  var pickEx = pickExact_(cfg);

  var rows_i = -1;
  var rows = groupOrder.map(function (key) {
    rows_i++;
    var g = byGroup[key];
    g.items.sort(function (a, b) {
      return String(a.purchaseDate).localeCompare(String(b.purchaseDate));
    });
    g.orderId = g.items[0].orderId;   // 대표 주문번호 = 가장 이른 주문

    var weight = 0;
    var total = 0;
    var titles = [];
    var noPriceN = 0;
    g.items.forEach(function (it) {
      weight += defaultWeight * (it.qty || 1);
      total += num_(it.linePrice, 0);
      if (it.noPrice) noPriceN++;
      titles.push(kseTitle_(it.titleKo, it.titleEn, sep));
    });
    var allNoPrice = noPriceN === g.items.length;

    var note = [];
    // 법인(비즈니스) 주문 — 행 전체를 다른 색으로 칠하고 비고에 표시한다
    var biz = g.items.some(function (it) { return it.business; });
    if (biz) note.push(NOTE_BIZ);
    // 발송기한 — 아마존 promise-date. 늦었거나 임박한 건만 적는다.
    var due = '', past = 0;
    g.items.forEach(function (it) {
      var a = it.amz || {};
      var p = String(a['promise-date'] || '').trim();
      if (p && (!due || p < due)) due = p;
      var dp = num_(a['days-past-promise'], 0);
      if (dp > past) past = dp;
    });
    // 아직 여유가 있는 건은 적지 않는다 (거의 모든 행에 붙으면 의미가 없다)
    if (past > 0) note.push('발송기한 ' + past + '일 지남');
    else if (due) {
      var left = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
      if (isNaN(left)) { /* 날짜를 못 읽으면 적지 않는다 */ }
      else if (left < 0) note.push('발송기한 지남 (' + due.slice(5, 10) + ')');
      else if (left === 0) note.push('발송기한 오늘 (' + due.slice(5, 10) + ')');
    }
    if (g.items.length > 1 || g.orderIds.length > 1) {
      note.push('합배송 ' + g.orderIds.length + '주문 / ' + g.items.length + '상품');
    }
    // 관세 신고 기준 — 배송지가 같은 사람이 주문한 물건 가격의 총합으로 본다.
    // 넘으면 그대로 접수하지 않고 [오류확인] 으로 보내 사람이 판단하게 한다.
    // 가격을 못 찾은 상품이 있으면 그대로 접수할 수 없다 → [오류확인]
    if (noPriceN) {
      note.push(allNoPrice
        ? '가격 없음 — 가격자료에서 못 찾음'
        : '가격 없음 ' + noPriceN + '/' + g.items.length + '상품 — 합계가 실제보다 낮음');
    }
    var dutyOver = threshold > 0 && total >= threshold;
    if (dutyOver) note.push('관세 신고 대상 — 합계 ' + round_(total, 0) + ' ≥ ' + threshold);
    // 지정 상품명 — 박스 안 물건이 전부 목록에 있을 때만 [근석이] 로 보낸다.
    // 섞여 있으면 보내지 않는다 (사용자 규칙).
    var pv = pickVerdict_(g.items, pickCfg, pickEx);
    var pickNoteText = pickNote_(pv);
    if (pickNoteText) note.push(pickNoteText);
    if (pv.mixed) pickMixed++;
    if (g.country && g.country.toUpperCase() !== 'JP') note.push('배송국가 ' + g.country + ' 확인 필요');
    if (!g.receiver) note.push('수취인 없음 — KSE 필수값');
    if (!g.tel) note.push('전화번호 없음');
    if (zipJP_(g.zip).length !== 7) note.push('우편번호 확인 필요');
    var brokenSku = g.items.filter(function (it) { return it.skuBroken; }).length;
    if (brokenSku) note.push('SKU 손상 ' + brokenSku + '건 (KSE 상품코드 빈값으로 전송)');

    var pick = function (fn) { return g.items.map(fn).join('\n'); };

    var row = [];
    for (var c = 0; c < COL_COUNT; c++) row.push('');
    row[COL.STATUS - 1] = ST.READY;
    row[COL.GROUP_KEY - 1] = g.receiver + ' / ' + g.zip;
    row[COL.ORDER_ID - 1] = g.orderId;
    row[COL.ORDER_IDS - 1] = g.orderIds.join('\n');
    row[COL.ORDER_TIME - 1] = g.items[0].purchaseDate;
    row[COL.RECEIVER - 1] = g.receiver;
    row[COL.TEL - 1] = g.tel;
    row[COL.ZIP - 1] = g.zip;
    row[COL.ADDRESS - 1] = g.address;
    row[COL.COUNTRY - 1] = g.country;
    row[COL.SKU - 1] = pick(function (it) { return it.sku; });
    row[COL.TITLE_EN - 1] = pick(function (it) { return it.titleEn; });
    row[COL.TITLE_KSE - 1] = titles.join('\n');
    row[COL.QTY - 1] = pick(function (it) { return it.qty; });
    row[COL.UNIT_PRICE - 1] = pick(function (it) { return it.unitPrice; });
    // 전부 가격을 못 찾았으면 0 이 아니라 빈 칸으로 둔다 (사람이 채우게)
    row[COL.TOTAL - 1] = allNoPrice ? '' : round_(total, 2);
    row[COL.WEIGHT - 1] = Math.max(round_(weight, 3), 0.001);
    row[COL.NOTE - 1] = note.join(' / ');
    row[COL.RAW - 1] = JSON.stringify(g);
    // 필수값이 비어 있으면 KSE가 받지 않는다 → 색만 칠하고 두지 않고 [오류확인] 으로
    var lacking = missingRequired_(row).length > 0;
    // 법인(비즈니스) 주문은 그대로 보내지 않고 사람이 먼저 본다
    if (dutyOver || noPriceN || lacking || biz) dutyRows.push(rows_i);
    else if (pv.all && pv.matched) pickRows.push(rows_i);
    return row;
  });

  // 관세 신고 대상은 [주문] 이 아니라 [오류확인] 으로 보낸다.
  // 같은 배송지로 묶인 상품은 한 행이므로, 그 안의 다른 상품도 함께 빠진다.
  var dutySet = {};
  dutyRows.forEach(function (i) { dutySet[i] = true; });
  var pickSet = {};
  pickRows.forEach(function (i) { pickSet[i] = true; });
  var toOrders = rows.filter(function (r, i) { return !dutySet[i] && !pickSet[i]; });
  var toError = rows.filter(function (r, i) { return dutySet[i]; });
  var toPick = rows.filter(function (r, i) { return pickSet[i]; });

  var sh = ordersSheet_();
  var startRow = sh.getLastRow() + 1;
  if (toOrders.length) writeRows_(sh, startRow, toOrders);

  var esh = null, eStart = 0;
  if (toError.length) {
    esh = errorSheet_();
    eStart = esh.getLastRow() + 1;
    writeRows_(esh, eStart, toError);
  }

  var psh = null, pStart = 0;
  if (toPick.length) {
    psh = pickSheet_();
    pStart = psh.getLastRow() + 1;
    writeRows_(psh, pStart, toPick);
  }
  SpreadsheetApp.flush();

  // 손으로 채워야 하는 칸을 바로 눈에 보이게 칠한다.
  // (아마존이 리포트에서 특정 이름을 걸러내는 경우가 있어 수취인이 비는 주문이 나온다)
  var warnCount = 0;
  var paint = function (list, base, sheet) {
    var set = {};
    var touched = [];
    list.forEach(function (r, i) {
      var rowNum = base + i;
      touched.push(rowNum);
      missingRequired_(r).forEach(function (m) {
        set[rowNum + ',' + m[1]] = true;
        warnCount++;
      });
      // 관세 신고 대상은 합계 칸을 붉게 (왜 걸렸는지 한눈에 보이게)
      if (threshold > 0 && num_(r[COL.TOTAL - 1], 0) >= threshold) {
        set[rowNum + ',' + COL.TOTAL] = true;
      }
    });
    applyWarnColors_(set, touched, sheet);
  };
  paint(toOrders, startRow, null);
  if (esh) paint(toError, eStart, esh);

  // 법인주문 행은 굵은 글씨 + 연한 초록 (오류색이 칠해진 칸은 그대로 둔다)
  markBizRows_(ordersSheet_(), startRow, toOrders);
  if (esh) markBizRows_(esh, eStart, toError);
  if (psh) markBizRows_(psh, pStart, toPick);

  // 한국어 상품명을 보고 물건을 담으므로 수량 표기는 늘 들어 있어야 한다.
  // 새로 번역된 것은 이미 붙어 있고, 예전 행·손댄 행을 여기서 맞춘다 (87_tidy.gs).
  수량표기_보정_모두_();

  // 같은 오류끼리 모아 본다
  오류확인_정렬_();

  var bizCount = 0;
  rows.forEach(function (r) {
    if (String(r[COL.NOTE - 1] || '').indexOf(NOTE_BIZ) >= 0) bizCount++;
  });

  var merged = 0;
  rows.forEach(function (r) {
    if (String(r[COL.ORDER_IDS - 1]).indexOf('\n') >= 0) merged++;
  });

  var summary = '주문 ' + items.length + '행 → 박스 ' + rows.length + '건' +
    (toError.length ? ' (확인 필요 ' + toError.length + '건은 [' + SHEET_ERROR + '] 으로)' : '') +
    (toPick.length ? ' (지정 상품명 ' + toPick.length + '건은 [' + SHEET_PICK + '] 으로)' : '') +
    (pickMixed ? '\n지정 상품명 혼재 ' + pickMixed + '건 — 섞였으므로 [' + SHEET_ORDERS + '] 에 남겼습니다' : '') +
    (merged ? ' (합배송 ' + merged + '건)' : '') +
    (noPrice.length ? ' / 가격없음 ' + noPrice.length + '행' : '') +
    (오류확인_요약_() ? '\n[' + SHEET_ERROR + '] ' + 오류확인_요약_() : '') +
    (skippedDup ? ' / 중복 제외 ' + skippedDup + '행' : '') +
    (skuBrokenCount ? '\nSKU 손상 ' + skuBrokenCount + '행 (Shift-JIS 리포트 — KSE 상품코드는 빈값으로 전송)' : '') +
    '\n상품명 번역 ' + tr.ai + '건(AI)' + (tr.google ? ' / ' + tr.google + '건(구글)' : '') +
    (tr.error ? ' — ' + tr.error : '') +
    (warnCount ? '\n붉게 칠한 칸 ' + warnCount + '개 — 채워야 KSE가 받습니다' : '') +
    (bizCount ? '\n법인주문 ' + bizCount + '건 — [' + SHEET_ERROR +
      '] 으로 보냈습니다 (굵은 글씨 + 연한 초록)' : '');
  log_('병합', (names || '') + ' — ' + summary.replace(/\n/g, ' / '));

  // 어느 주문이 어디로 갔는지 번호로 남긴다 — 나중에 '이 주문 왜 없지' 를 로그만 보고 찾게.
  // [주문] 으로 간 것은 시트에 그대로 있으니 적지 않는다.
  var idsOf = function (list) {
    var out = [];
    list.forEach(function (r) {
      String(r[COL.ORDER_IDS - 1] || '').split('\n').forEach(function (id) {
        if (id.trim()) out.push(id.trim());
      });
    });
    return out;
  };
  logIds_('병합', '중복 제외 (이미 [' + SHEET_ORDERS + ']·[' + SHEET_DONE + '] 에 있음)', dupIds);
  logIds_('병합', '[' + SHEET_ERROR + '] 으로 보낸 주문', idsOf(toError));
  logIds_('병합', '[' + SHEET_PICK + '] 으로 보낸 주문', idsOf(toPick));
  return { added: toOrders.length, message: (names ? names + '\n' : '') + summary };
}

