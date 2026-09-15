/**
 * 지정 상품명 분류 — [지정상품명] 시트에 적어둔 상품명이 들어간 주문을 [근석이] 로 보낸다.
 *
 * 규칙 (사용자 요청):
 *  - 목록은 사람이 직접 적는다. [지정상품명] 시트의 '상품명' 칸에 한 줄에 하나씩.
 *  - 한 박스(같은 배송지로 묶인 행)에 목록에 있는 물건과 없는 물건이 섞이면
 *    그 박스는 [근석이] 로 보내지 않고 [주문] 에 그대로 둔다.
 *  - 관세 신고 대상은 [오류확인] 이 먼저다 (사람이 판단해야 하므로).
 */

// ── 시트 ────────────────────────────────────────────────────────────────

/** 지정 상품명만 담긴 주문이 모이는 시트 */
function pickSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_PICK);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PICK);
    sh.getRange(1, 1, 1, COL_COUNT).setValues([HEADERS_ORDERS])
      .setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() >= COL.RAW) sh.hideColumns(COL.RAW);
    sh.setColumnWidth(COL.TITLE_EN, 240);
    sh.setColumnWidth(COL.TITLE_KSE, 320);
  }
  return sh;
}

/** 사람이 상품명을 적어 넣는 시트 */
function pickListSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_PICKLIST);
  if (!sh) {
    sh = ss.insertSheet(SHEET_PICKLIST);
    sh.getRange(1, 1, 1, 2).setValues([['상품명', '메모']])
      .setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 420);
    sh.setColumnWidth(2, 260);
    sh.getRange('A1').setNote(
      '[' + SHEET_PICK + '] 으로 보낼 상품명을 여기에 한 줄에 하나씩 적으세요.\n' +
      '- 아마존 원본 상품명과 번역된 상품명 둘 다에서 찾습니다.\n' +
      '- 기본은 부분일치입니다 (상품명 일부만 적어도 걸립니다).\n' +
      '  [설정] 의 지정상품명_일치방식 을 완전일치 로 바꿀 수 있습니다.\n' +
      '- 한 박스에 목록에 없는 물건이 섞이면 그 박스는 [주문] 에 남습니다.');
  }
  return sh;
}

// ── 목록 읽기 / 대조 ────────────────────────────────────────────────────

/** 대조용으로 다듬는다 — 대소문자, 공백(전각 포함) 차이는 무시한다 */
function normTitle_(s) {
  return String(s == null ? '' : s)
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** [지정상품명] 시트의 상품명 목록 (다듬은 것과 원문을 같이 준다) */
function pickList_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_PICKLIST);
  if (!sh || sh.getLastRow() < 2) return [];

  var out = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
    var raw = String(r[0] == null ? '' : r[0]).trim();
    if (!raw) return;
    var key = normTitle_(raw);
    if (key) out.push({ raw: raw, key: key });
  });
  return out;
}

/** text 가 목록에 걸리면 걸린 항목의 원문을, 아니면 '' 을 준다 */
function pickMatch_(text, list, exact) {
  var t = normTitle_(text);
  if (!t) return '';
  for (var i = 0; i < list.length; i++) {
    if (exact ? t === list[i].key : t.indexOf(list[i].key) >= 0) return list[i].raw;
  }
  return '';
}

/** 상품 하나가 목록에 걸리는지 — 원본 상품명과 번역된 상품명 둘 다 본다 */
function itemPicked_(it, list, exact) {
  return pickMatch_(it.titleEn, list, exact) ||
    pickMatch_(it.titleKo, list, exact) ||
    pickMatch_(it.titleEng, list, exact);
}

/**
 * 박스 하나를 판정한다.
 * all   = 박스 안 모든 물건이 목록에 있음 → [근석이]
 * mixed = 일부만 있음 → [주문] 에 남긴다
 */
function pickVerdict_(items, list, exact) {
  if (!list.length || !items || !items.length) {
    return { matched: 0, total: items ? items.length : 0, all: false, mixed: false, hits: [] };
  }
  var hits = [];
  var matched = 0;
  items.forEach(function (it) {
    var hit = itemPicked_(it, list, exact);
    if (hit) {
      matched++;
      if (hits.indexOf(hit) < 0) hits.push(hit);
    }
  });
  return {
    matched: matched,
    total: items.length,
    all: matched === items.length,
    mixed: matched > 0 && matched < items.length,
    hits: hits
  };
}

/** [설정] 의 일치방식이 완전일치인가 */
function pickExact_(cfg) {
  return String(cfg.지정상품명_일치방식 || '').trim() === '완전일치';
}

/** 박스 판정 결과를 비고에 적을 문구로 */
function pickNote_(v) {
  if (v.all && v.matched) {
    return '지정 상품명 → [' + SHEET_PICK + ']' + (v.hits.length ? ' (' + v.hits.join(', ') + ')' : '');
  }
  if (v.mixed) {
    return '지정 상품명 혼재 ' + v.matched + '/' + v.total +
      ' — 섞였으므로 [' + SHEET_PICK + '] 으로 보내지 않음';
  }
  return '';
}

// ── 이미 [주문] 에 있는 행을 다시 분류 ──────────────────────────────────

/**
 * 목록을 나중에 적었거나 고쳤을 때 쓴다.
 * [주문] 에서 아직 접수하지 않은(대기) 행만 다시 보고, 전부 걸린 박스를 [근석이] 로 옮긴다.
 */
function 지정상품명_재분류() {
  var ui = SpreadsheetApp.getUi();
  var cfg = getConfig();
  var list = pickList_();
  if (!list.length) {
    pickListSheet_();
    ui.alert('[' + SHEET_PICKLIST + '] 시트가 비어 있습니다.\n\n' +
      '상품명 칸에 분류할 상품명을 한 줄에 하나씩 적은 뒤 다시 실행하세요.');
    return;
  }
  var exact = pickExact_(cfg);

  var orders = ordersSheet_();
  if (orders.getLastRow() < 2) { ui.alert('[' + SHEET_ORDERS + '] 시트에 주문이 없습니다.'); return; }

  var vals = orders.getRange(2, 1, orders.getLastRow() - 1, COL_COUNT).getValues();
  var move = [];
  var mixedCount = 0;

  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (String(v[COL.STATUS - 1]).trim() !== ST.READY) continue;   // 접수한 건은 건드리지 않는다

    var items = pickItemsOfRow_(v);
    var verdict = pickVerdict_(items, list, exact);
    if (verdict.mixed) { mixedCount++; continue; }
    if (!verdict.all || !verdict.matched) continue;

    var out = v.slice();
    var note = String(out[COL.NOTE - 1] || '');
    var add = pickNote_(verdict);
    out[COL.NOTE - 1] = note ? note + ' / ' + add : add;
    move.push({ row: i + 2, v: out });
  }

  if (!move.length) {
    ui.alert('옮길 주문이 없습니다.' +
      (mixedCount ? '\n\n(목록에 있는 물건과 없는 물건이 섞인 박스 ' + mixedCount +
        '건은 규칙대로 [' + SHEET_ORDERS + '] 에 남겨두었습니다)' : ''));
    return;
  }

  var pick = pickSheet_();
  writeRows_(pick, pick.getLastRow() + 1, move.map(function (m) { return m.v; }));

  // 행 번호가 밀리지 않도록 아래에서 위로 지운다
  deleteRowsAt_(orders, move.map(function (m) { return m.row; }));
  SpreadsheetApp.flush();

  log_('지정상품명', '재분류 ' + move.length + '건 → [' + SHEET_PICK + ']' +
    (mixedCount ? ' / 혼재 ' + mixedCount + '건 유지' : ''));
  ui.alert(move.length + '건을 [' + SHEET_PICK + '] 시트로 옮겼습니다.' +
    (mixedCount ? '\n\n섞인 박스 ' + mixedCount + '건은 [' + SHEET_ORDERS + '] 에 남겼습니다.' : ''));
}

/**
 * [주문] 의 주어진 행들 중 물건이 전부 목록에 걸린 박스를 [근석이] 로 옮긴다.
 *
 * [오류확인] → [주문] 되돌리기 뒤에 자동으로 부른다. 사람이 [지정 상품명 다시 분류] 를
 * 따로 누르지 않아도 되게 하려는 것이다. 옮긴 건수를 준다.
 *
 * @param rowNums [주문] 시트 행 번호 배열
 */
function pickMoveRows_(rowNums) {
  if (!rowNums || !rowNums.length) return 0;
  var list = pickList_();
  if (!list.length) return 0;
  var exact = pickExact_(getConfig());

  var orders = ordersSheet_();
  var last = orders.getLastRow();
  var move = [];
  rowNums.slice().sort(function (a, b) { return a - b; }).forEach(function (rowNum) {
    if (rowNum < 2 || rowNum > last) return;
    var v = orders.getRange(rowNum, 1, 1, COL_COUNT).getValues()[0];
    if (String(v[COL.STATUS - 1]).trim() !== ST.READY) return;
    var verdict = pickVerdict_(pickItemsOfRow_(v), list, exact);
    if (!verdict.all || !verdict.matched) return;
    var out = v.slice();
    var note = String(out[COL.NOTE - 1] || '');
    var add = pickNote_(verdict);
    out[COL.NOTE - 1] = note ? note + ' / ' + add : add;
    move.push({ row: rowNum, v: out });
  });
  if (!move.length) return 0;

  var pick = pickSheet_();
  var start = pick.getLastRow() + 1;
  var vals = move.map(function (m) { return m.v; });
  writeRows_(pick, start, vals);
  markBizRows_(pick, start, vals);

  // 행 번호가 밀리지 않도록 아래에서 위로 지운다
  deleteRowsAt_(orders, move.map(function (m) { return m.row; }));
  SpreadsheetApp.flush();

  log_('지정상품명', '되돌린 뒤 자동 분류 ' + move.length + '건 → [' + SHEET_PICK + ']');
  return move.length;
}

/** 시트 한 행에서 상품 목록을 되살린다 (_원본JSON 이 없으면 칸에서 만든다) */
function pickItemsOfRow_(v) {
  var raw = String(v[COL.RAW - 1] || '');
  if (raw) {
    try {
      var g = JSON.parse(raw);
      if (g && g.items && g.items.length) return g.items;
    } catch (e) { /* 아래 폴백으로 */ }
  }
  var en = String(v[COL.TITLE_EN - 1] || '').split('\n');
  var kse = String(v[COL.TITLE_KSE - 1] || '').split('\n');
  var n = Math.max(en.length, kse.length);
  var items = [];
  for (var i = 0; i < n; i++) {
    items.push({ titleEn: en[i] || '', titleKo: kse[i] || '', titleEng: '' });
  }
  return items;
}

/** [근석이] → [주문] 되돌리기 */
function 근석이_되돌리기() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(SHEET_PICK + ' → ' + SHEET_ORDERS + ' 으로 되돌리기',
    '되돌릴 대표주문번호를 콤마로 구분해 적어주세요.\n예: 250-5587398-0612618',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var ids = res.getResponseText().split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; });
  if (!ids.length) return;

  var want = {};
  ids.forEach(function (id) { want[id] = true; });

  var pick = pickSheet_();
  if (pick.getLastRow() < 2) { ui.alert('[' + SHEET_PICK + '] 시트가 비어 있습니다.'); return; }

  var vals = pick.getRange(2, 1, pick.getLastRow() - 1, COL_COUNT).getValues();
  var picked = [];
  for (var i = 0; i < vals.length; i++) {
    if (want[String(vals[i][COL.ORDER_ID - 1]).trim()]) picked.push({ row: i + 2, v: vals[i] });
  }
  if (!picked.length) {
    ui.alert('[' + SHEET_PICK + '] 시트에서 해당 주문번호를 찾지 못했습니다.');
    return;
  }

  var orders = ordersSheet_();
  var oStart = orders.getLastRow() + 1;
  var back = picked.map(function (p) {
    var v = p.v.slice();
    v[COL.STATUS - 1] = ST.READY;
    var biz = isBizRow_(v) ? NOTE_BIZ + ' / ' : '';
    v[COL.NOTE - 1] = biz + SHEET_PICK + '에서 되돌림 ' + nowStr_();
    return v;
  });
  writeRows_(orders, oStart, back);
  markBizRows_(orders, oStart, back);

  deleteRowsAt_(pick, picked.map(function (p) { return p.row; }));
  SpreadsheetApp.flush();

  log_('되돌리기', SHEET_PICK + ' → ' + SHEET_ORDERS + ' ' + picked.length + '건 (' + ids.join(', ') + ')');
  ui.alert(picked.length + '건을 [' + SHEET_ORDERS + '] 시트로 되돌렸습니다.');
}

/** [지정상품명] 시트를 만들고 열어준다 */
function 지정상품명_목록_열기() {
  var sh = pickListSheet_();
  SpreadsheetApp.getActive().setActiveSheet(sh);
  sh.setActiveRange(sh.getRange(Math.max(2, sh.getLastRow() + 1), 1));
}
