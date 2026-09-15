/**
 * 정리 — 빈 행 제거, 번역 채우기, 한 번에 정리.
 *
 * [오류확인] 에서 되돌리거나 손으로 행을 옮기면 빈 행이 남고 순서도 흐트러진다.
 * 그때 쓰는 도구를 여기 모았다.
 */

var TIDY_SHEETS = [SHEET_ORDERS, SHEET_ERROR, SHEET_PICK, SHEET_SHIP, SHEET_DONE];

/** 한 시트의 빈 행을 지운다 (아래에서 위로, 이어진 구간은 한 번에) */
function 빈행_제거_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return 0;

  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, 1, n, COL_COUNT).getValues();

  // 지울 행 번호를 모은다
  var kill = [];
  for (var i = 0; i < n; i++) if (rowBlank_(vals[i])) kill.push(i + 2);
  if (!kill.length) return 0;

  // 이어진 구간으로 묶어 아래에서 위로 지운다 (행 번호가 밀리지 않게)
  var runs = [];
  var start = kill[0], prev = kill[0];
  for (var k = 1; k < kill.length; k++) {
    if (kill[k] === prev + 1) { prev = kill[k]; continue; }
    runs.push([start, prev - start + 1]);
    start = prev = kill[k];
  }
  runs.push([start, prev - start + 1]);

  keepSpareRows_(sh, kill.length);
  runs.reverse().forEach(function (r) { sh.deleteRows(r[0], r[1]); });
  SpreadsheetApp.flush();
  return kill.length;
}

function 빈행_제거() {
  var out = [];
  var total = 0;
  TIDY_SHEETS.forEach(function (name) {
    var n = 빈행_제거_(name);
    total += n;
    if (n) out.push('  ' + name + ' — ' + n + '행');
  });
  if (total) log_('정리', '빈 행 제거 ' + total + '행');
  SpreadsheetApp.getUi().alert(
    total ? '빈 행 ' + total + '개를 지웠습니다.\n\n' + out.join('\n')
      : '지울 빈 행이 없습니다.');
}

// 번역이 들어가는 시트 — 상품명 칸이 있는 곳
var TRANSLATE_SHEETS = [SHEET_ORDERS, SHEET_ERROR, SHEET_PICK, SHEET_SHIP];

// ── 번역 채우기 ─────────────────────────────────────────────────────────
//
// 구글 번역이 간헐적으로 실패해 한국어가 안 붙는 행이 생긴다.
// KSE상품명 한 줄이 원문(상품명(영문))과 똑같으면 번역이 안 된 줄이다.

/** 시트 하나의 번역 빈 줄을 다시 채운다 */
function 번역_채우기_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return { rows: 0, lines: 0 };

  var cfg = getConfig();
  var sep = cfg.상품명구분자;
  var n = sh.getLastRow() - 1;
  var rng = sh.getRange(2, 1, n, COL_COUNT);
  var vals = rng.getValues();

  var fixedRows = 0;
  var fixedLines = 0;
  var touched = false;

  // 번역이 빠진 줄을 먼저 모은다 — 한꺼번에 보내려고
  var need = [];
  for (var i = 0; i < n; i++) {
    var ens0 = String(vals[i][COL.TITLE_EN - 1] || '').split('\n');
    var kses0 = String(vals[i][COL.TITLE_KSE - 1] || '').split('\n');
    if (!String(vals[i][COL.TITLE_EN - 1] || '').trim()) continue;
    for (var j0 = 0; j0 < ens0.length; j0++) {
      var en0 = String(ens0[j0] || '').trim();
      if (!en0) continue;
      var cur0 = String(kses0[j0] || '').trim();
      // 번역이 붙었으면 'ko + 구분자 + 원문' 이라 원문과 같을 수 없다
      if (cur0 && cur0 !== en0) continue;
      need.push(en0);
    }
  }
  if (!need.length) return { rows: 0, lines: 0 };

  var bulk = translateMany_(need, cfg);
  if (bulk.error) log_('상품명번역', bulk.error);

  for (var i = 0; i < n; i++) {
    var v = vals[i];
    var ens = String(v[COL.TITLE_EN - 1] || '').split('\n');
    var kses = String(v[COL.TITLE_KSE - 1] || '').split('\n');
    if (!String(v[COL.TITLE_EN - 1] || '').trim()) continue;

    var g = null;
    var raw = String(v[COL.RAW - 1] || '');
    if (raw) { try { g = JSON.parse(raw); } catch (e) { g = null; } }

    var rowFixed = false;
    for (var j = 0; j < ens.length; j++) {
      var en = String(ens[j] || '').trim();
      if (!en) continue;
      var cur = String(kses[j] || '').trim();
      if (cur && cur !== en) continue;

      var tr = bulk.map[en];
      if (!tr || !tr.ko || tr.ko === en) continue;   // 이번에도 안 되면 그대로 둔다
      kses[j] = kseTitle_(tr.ko, en, sep);
      if (g && g.items && g.items[j]) {
        g.items[j].titleKo = tr.ko;
        g.items[j].titleEng = tr.en;
      }
      fixedLines++;
      rowFixed = true;
    }

    if (rowFixed) {
      v[COL.TITLE_KSE - 1] = kses.join('\n');
      if (g) v[COL.RAW - 1] = JSON.stringify(g);
      fixedRows++;
      touched = true;
    }
  }

  if (touched) {
    rng.setValues(vals);
    SpreadsheetApp.flush();
  }
  return { rows: fixedRows, lines: fixedLines };
}

// ── 수량 표기 되살리기 ──────────────────────────────────────────────────
//
// 번역이 상품명 뒤쪽의 수량·세트를 빠뜨린 행을 고친다 ('… 50g' → '… 50g 6개').
// 새로 번역하지 않고 원문과 견줘 빠진 것만 붙이므로 AI 를 부르지 않는다 (73_qty.gs).

/** 시트 하나의 수량 표기를 되살린다 */
function 수량표기_보정_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return { rows: 0, lines: 0 };

  var sep = getConfig().상품명구분자;
  var sepStr = (sep === undefined || sep === null) ? ' / ' : String(sep);
  var n = sh.getLastRow() - 1;
  var rng = sh.getRange(2, 1, n, COL_COUNT);
  var vals = rng.getValues();
  var fixedRows = 0, fixedLines = 0, touched = false;

  for (var i = 0; i < n; i++) {
    var v = vals[i];
    var srcs = String(v[COL.TITLE_EN - 1] || '').split('\n');
    var kses = String(v[COL.TITLE_KSE - 1] || '').split('\n');
    if (!String(v[COL.TITLE_EN - 1] || '').trim()) continue;

    var g = null;
    var raw = String(v[COL.RAW - 1] || '');
    if (raw) { try { g = JSON.parse(raw); } catch (e) { g = null; } }

    var rowFixed = false;
    for (var j = 0; j < srcs.length; j++) {
      var src = String(srcs[j] || '').trim();
      var kse = String(kses[j] || '').trim();
      if (!src || !kse) continue;

      // KSE상품명은 '한국어 + 구분자 + 원문' 이다. 뒤의 원문을 떼고 한국어만 본다.
      var tail = sepStr + sanitize_(src);
      if (kse.length <= tail.length || kse.slice(-tail.length) !== tail) continue;
      var ko = kse.slice(0, kse.length - tail.length);

      var koFix = keepQty_(src, ko, 'ko');
      if (koFix === ko) continue;

      kses[j] = kseTitle_(koFix, src, sep);
      if (g && g.items && g.items[j]) {
        g.items[j].titleKo = koFix;
        if (g.items[j].titleEng) {
          g.items[j].titleEng = keepQty_(src, g.items[j].titleEng, 'en');
        }
      }
      fixedLines++;
      rowFixed = true;
    }

    if (rowFixed) {
      v[COL.TITLE_KSE - 1] = kses.join('\n');
      if (g) v[COL.RAW - 1] = JSON.stringify(g);
      fixedRows++;
      touched = true;
    }
  }

  if (touched) {
    rng.setValues(vals);
    SpreadsheetApp.flush();
  }
  return { rows: fixedRows, lines: fixedLines };
}

function 수량표기_보정() {
  var out = [];
  var lines = 0;
  TRANSLATE_SHEETS.forEach(function (name) {
    var r = 수량표기_보정_(name);
    lines += r.lines;
    if (r.lines) out.push('  ' + name + ' — ' + r.rows + '행 / ' + r.lines + '개 상품명');
  });
  if (lines) log_('정리', '수량 표기 되살리기 ' + lines + '개 상품명');
  SpreadsheetApp.getUi().alert(
    lines ? '번역에서 빠져 있던 수량 표기 ' + lines + '개를 되살렸습니다.\n\n' + out.join('\n')
      : '수량 표기가 빠진 상품명이 없습니다.');
}

function 번역_채우기() {
  var out = [];
  var lines = 0;
  TRANSLATE_SHEETS.forEach(function (name) {
    var r = 번역_채우기_(name);
    lines += r.lines;
    if (r.lines) out.push('  ' + name + ' — ' + r.rows + '행 / ' + r.lines + '개 상품명');
  });
  if (lines) log_('정리', '번역 채우기 ' + lines + '개 상품명');
  SpreadsheetApp.getUi().alert(
    lines ? '번역이 빠져 있던 상품명 ' + lines + '개를 채웠습니다.\n\n' + out.join('\n')
      : '번역이 빠진 상품명이 없습니다.\n\n' +
        '(구글 번역이 계속 실패하면 잠시 뒤 다시 실행해 보세요)');
}

// ── 한 번에 정리 ────────────────────────────────────────────────────────

function 전체_정리() {
  var msg = [];

  var blanks = 0;
  TIDY_SHEETS.forEach(function (name) { blanks += 빈행_제거_(name); });
  msg.push('빈 행 제거 — ' + blanks + '행');

  var zeros = 0;
  TIDY_SHEETS.forEach(function (name) { zeros += 번호_서식_고치기_(name).fixed; });
  msg.push('번호 서식 — ' + zeros + '칸 되돌림');

  var lines = 0;
  TRANSLATE_SHEETS.forEach(function (name) {
    lines += 번역_채우기_(name).lines;
  });
  msg.push('번역 채우기 — ' + lines + '개 상품명');

  var qty = 0;
  TRANSLATE_SHEETS.forEach(function (name) { qty += 수량표기_보정_(name).lines; });
  msg.push('수량 표기 되살리기 — ' + qty + '개 상품명');

  msg.push('[' + SHEET_ORDERS + '] 정렬 — ' + 주문_정렬_() + '행 (같은 상품끼리)');
  msg.push('[' + SHEET_ERROR + '] 정렬 — ' + 오류확인_정렬_() + '행 (오류 유형별)');

  var sum = 오류확인_요약_();
  log_('정리', '전체 정리 — ' + msg.join(' / '));
  SpreadsheetApp.getUi().alert('정리 완료\n\n' + msg.join('\n') +
    (sum ? '\n\n[' + SHEET_ERROR + '] ' + sum : ''));
}

// ── 번호 서식 고치기 ────────────────────────────────────────────────────
//
// 구글 시트가 '0861654' 를 숫자 861654 로 저장해 우편번호·전화번호 앞의 0이 떨어진다.
// KSE·야마토 B2·Shipnergy 가 시트 값을 읽으므로 잘못된 번호가 그대로 나간다.
//
//  1) 해당 칸에 텍스트 서식(@)을 박아 앞으로는 안 떨어지게 한다
//  2) 이미 떨어진 값은 _원본JSON 과 비교해 되돌린다 (사람이 고친 값은 그대로 둔다)

function 번호_서식_고치기_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) return { format: false, fixed: 0 };

  applyTextFormat_(sh);
  if (sh.getLastRow() < 2) return { format: true, fixed: 0 };

  var n = sh.getLastRow() - 1;
  var rng = sh.getRange(2, 1, n, COL_COUNT);
  var vals = rng.getValues();
  var fixed = 0;
  var touched = false;

  for (var i = 0; i < n; i++) {
    var v = vals[i];
    var raw = String(v[COL.RAW - 1] || '');
    if (!raw) continue;
    var g = null;
    try { g = JSON.parse(raw); } catch (e) { continue; }
    if (!g) continue;

    [[COL.TEL, g.tel], [COL.ZIP, g.zip]].forEach(function (pair) {
      var cur = String(v[pair[0] - 1] == null ? '' : v[pair[0] - 1]);
      var want = keepZeros_(cur, pair[1]);
      // 원본에도 없어 되돌리지 못한 우편번호는 자릿수로 0을 되붙인다
      if (pair[0] === COL.ZIP) want = zipJP_(want) || want;
      if (want !== cur) {
        v[pair[0] - 1] = want;
        fixed++;
        touched = true;
      }
    });
  }

  if (touched) {
    rng.setValues(vals);
    SpreadsheetApp.flush();
  }
  return { format: true, fixed: fixed };
}

function 번호_서식_고치기() {
  var out = [];
  var total = 0;
  TIDY_SHEETS.forEach(function (name) {
    var r = 번호_서식_고치기_(name);
    if (!r.format) return;
    total += r.fixed;
    out.push('  ' + name + ' — ' + (r.fixed ? r.fixed + '칸 되돌림' : '이상 없음'));
  });
  if (total) log_('정리', '번호 서식 고치기 ' + total + '칸');
  SpreadsheetApp.getUi().alert(
    '우편번호·전화번호 칸을 텍스트 서식으로 바꿨습니다.\n' +
    (total ? '앞의 0이 떨어진 ' + total + '칸을 원본으로 되돌렸습니다.\n\n'
           : '되돌릴 값은 없었습니다.\n\n') + out.join('\n') +
    '\n\n앞으로는 새로 올리는 자료도 0이 떨어지지 않습니다.');
}
