/**
 * 76_셀정리.gs — 통합문서 셀 한도(1,000만) 확보
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 구글 시트는 '쓴 셀'이 아니라 '있는 셀'을 센다. 시트를 만들면 기본 1,000행 × 26열이
 * 잡히고, 행을 덧붙여도 열은 26개 그대로 남는다.
 *
 * 광고실적은 칸이 10개인데 26개가 잡혀 있다 — 148,471행이면
 *   실제로 쓰는 셀   148,471 × 10 = 1,484,710
 *   실제로 잡힌 셀   148,471 × 26 = 3,860,246
 * 차이 2,375,536개가 아무것도 안 담은 채 한도를 먹는다.
 *
 * 큰 탭 몇 개만 잘라도 수백만 셀이 돌아온다. 자료는 하나도 안 잃는다 —
 * 머리글 너비 밖의 빈 열과, 자료 아래의 빈 행만 지운다.
 */

/** 자료 아래에 이만큼은 여유 행을 남긴다 (덧붙이기가 매번 행을 늘리지 않게) */
var TRIM_SPARE_ROWS = 50;

/**
 * 한 시트의 빈 열·빈 행을 지운다.
 * @return {{name, before, after, freed}}
 */
function trimSheet_(sh, width) {
  var name = sh.getName();
  var maxR = sh.getMaxRows(), maxC = sh.getMaxColumns();
  var before = maxR * maxC;

  // 열: 머리글 너비 밖은 쓸 일이 없다
  if (width > 0 && maxC > width) sh.deleteColumns(width + 1, maxC - width);

  // 행: 자료 + 여유분 밖은 비어 있다
  var need = Math.max(sh.getLastRow(), 1) + TRIM_SPARE_ROWS;
  var maxR2 = sh.getMaxRows();
  if (maxR2 > need) sh.deleteRows(need + 1, maxR2 - need);

  var after = sh.getMaxRows() * sh.getMaxColumns();
  return { name: name, before: before, after: after, freed: before - after };
}

/** 시트 이름 → 그 시트가 실제로 쓰는 칸 수 */
function sheetWidths_() {
  var w = {};
  w[SHEET_ADS] = ADS_HEADER.length;
  w[SHEET_ADSDAY] = ADSDAY_HEADER.length;
  w[SHEET_ADSUM] = ADSUM_HEADER.length;
  w[SHEET_ADSTRUCT] = ADSTRUCT_HEADER.length;
  w[SHEET_ADCAMP] = ADCAMP_HEADER.length;
  w[SHEET_ADLOG] = ADLOG_HEADER.length;
  w[SHEET_ADKW] = ADKW_HEADER.length;
  w[SHEET_ADPROD] = ADPROD_HEADER.length;
  w[SHEET_ADGRP] = ADGRP_HEADER.length;
  w[SHEET_REALLOC] = REALLOC_HEADER.length;
  w[SHEET_ADBASIS] = ADBASIS_HEADER.length;
  w[SHEET_ADPLAN] = ADPLAN_HEADER.length;
  w[SHEET_ADTERM] = ADTERM_HEADER.length;
  w[SHEET_ADTERM_RAW] = ADTERM_RAW_HEADER.length;
  w[SHEET_ADWATCH] = ADWATCH_HEADER.length;
  w[SHEET_ORDERS] = ORDERS_HEADER.length;
  w[SHEET_ORDSUM] = ORDSUM_HEADER.length;
  w[SHEET_SALES] = SALES_HEADER.length;
  w[SHEET_LISTING] = LISTING_HEADER.length;
  w[SHEET_SKUCOST] = SKUCOST_HEADER.length;
  w[SHEET_SHIPMENTS] = SHIP_HEADER.length;
  w[SHEET_PRICELOG] = PRICELOG_HEADER.length;
  w[SHEET_LOG] = LOG_HEADER.length;
  w[SHEET_FX] = FX_HEADER.length;
  w[SHEET_OPENDATE] = OPENDATE_HEADER.length;
  w[SHEET_MANUAL] = MANUAL_HEADER.length;
  w[SHEET_SHIPHEAVY] = SHIPHEAVY_HEADER.length;
  w[SHEET_BUYBOX] = BUYBOX_HEADER.length;
  w[SHEET_COOLLOG] = COOLLOG_HEADER.length;
  return w;
}

/** 메뉴: 셀 여유 확보 */
function trimWorkbook() {
  var ss = ss_();
  var widths = sheetWidths_();
  var all = ss.getSheets();

  // 지금 몇 셀을 쓰고 있는지 먼저 보여준다 — 한도가 1,000만이다
  var total = 0, rows = [];
  for (var i = 0; i < all.length; i++) {
    var c = all[i].getMaxRows() * all[i].getMaxColumns();
    total += c;
    rows.push({ sh: all[i], name: all[i].getName(), cells: c });
  }
  rows.sort(function (a, b) { return b.cells - a.cells; });

  var top = rows.slice(0, 8).map(function (r) {
    return '   ' + r.name + '  ' + r.cells.toLocaleString() + '셀';
  }).join('\n');

  var ans = ui_().alert('셀 여유 확보',
    '지금 잡혀 있는 셀: ' + total.toLocaleString() + ' / 10,000,000\n\n' +
    '큰 시트\n' + top + '\n\n' +
    '구글 시트는 쓴 셀이 아니라 "있는 셀"을 셉니다.\n' +
    '시트를 만들면 기본 26열이 잡히는데, 실제로 쓰는 건 5~10칸입니다.\n' +
    '나머지 빈 열과 자료 아래 빈 행을 지웁니다.\n\n' +
    '자료는 하나도 지우지 않습니다.\n\n계속할까요?',
    ui_().ButtonSet.YES_NO);
  if (ans !== ui_().Button.YES) return;

  var freed = 0, done = [];
  for (var j = 0; j < rows.length; j++) {
    var nm = rows[j].name;
    // 스냅샷은 가격 두 칸이면 충분하다
    var w = widths[nm] || (nm.indexOf(SNAPSHOT_PREFIX) === 0 ? SNAPSHOT_HEADER.length : 0);
    if (!w) continue;                       // 폭을 모르는 시트는 건드리지 않는다
    try {
      var r = trimSheet_(rows[j].sh, w);
      if (r.freed > 0) {
        freed += r.freed;
        done.push('   ' + r.name + '  ' + r.freed.toLocaleString() + '셀 확보');
      }
    } catch (e) {
      log_('trim', 'WARN', nm + ' 정리 실패: ' + e);
    }
  }

  var after = 0;
  var all2 = ss.getSheets();
  for (var k = 0; k < all2.length; k++) after += all2[k].getMaxRows() * all2[k].getMaxColumns();

  var msg = '셀 ' + freed.toLocaleString() + '개 확보 (' +
            total.toLocaleString() + ' → ' + after.toLocaleString() + ')';
  log_('trim', 'INFO', msg);
  toast_(msg);
  ui_().alert('셀 여유 확보 완료',
    (done.join('\n') || '   확보할 것이 없었습니다') + '\n\n' + msg + ' / 10,000,000',
    ui_().ButtonSet.OK);
  return msg;
}
