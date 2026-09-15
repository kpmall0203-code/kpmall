/**
 * 정리 ▸ 비우기 — 고를 시트만 데이터 행을 지우고 칸 서식을 되돌린다.
 *
 * 되돌릴 수 없는 동작이라 다이얼로그에서 시트마다 행 수를 보여주고,
 * 고른 것만 지운다. 1행(헤더)은 남기고 2행 아래를 지운다.
 * 배경색·굵은 글씨·글자색(리치텍스트)·메모까지 같이 초기화한다.
 *
 * [설정] 시트는 목록에 넣지 않는다 — 지우면 동작이 멈춘다.
 */

function clearTargets_() {
  return [
    { name: SHEET_ORDERS, desc: '처리 중인 박스' },
    { name: SHEET_ERROR, desc: '사람이 확인할 건' },
    { name: SHEET_PICK, desc: '지정 상품명 주문' },
    { name: SHEET_SHIP, desc: 'Shipnergy 주문' },
    { name: SHEET_DONE, desc: '완료된 건' },
    { name: SHEET_LOG, desc: '실행 기록' },
    { name: SHEET_PICKLIST, desc: '사람이 적어 넣은 상품명 목록', list: true },
    { name: SHEET_BANLIST, desc: '통관 금지 낱말 목록', list: true }
  ];
}

/** 다이얼로그가 부르는 서버 함수 — 어떤 시트에 몇 행 있는지 */
function clearList() {
  var ss = SpreadsheetApp.getActive();
  return clearTargets_().map(function (t) {
    var sh = ss.getSheetByName(t.name);
    return {
      name: t.name,
      desc: t.desc,
      list: !!t.list,
      exists: !!sh,
      rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0
    };
  });
}

/** 시트 하나를 비운다 — 헤더만 남기고 값·서식·메모를 되돌린다 */
function clearSheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) return 0;

  var last = sh.getLastRow();
  var removed = Math.max(0, last - 1);
  if (removed > 0) {
    keepSpareRows_(sh, removed);
    sh.deleteRows(2, removed);
  }

  // 남은 빈 영역의 서식도 되돌린다 (경고색·법인 초록·굵은 글씨가 남지 않게)
  var rows = sh.getMaxRows() - 1;
  if (rows > 0) {
    var rng = sh.getRange(2, 1, rows, sh.getMaxColumns());
    rng.clearContent();
    rng.clearFormat();
    rng.clearNote();
  }
  return removed;
}

/**
 * 다이얼로그가 부르는 서버 함수 — 고른 시트를 비운다.
 * @param {string[]} names 비울 시트 이름
 */
function clearRun(names) {
  var want = {};
  (names || []).forEach(function (n) { want[String(n)] = true; });

  var allowed = {};
  clearTargets_().forEach(function (t) { allowed[t.name] = true; });

  var done = [];
  var total = 0;
  clearTargets_().forEach(function (t) {
    if (!want[t.name] || !allowed[t.name]) return;
    var n = clearSheet_(t.name);
    total += n;
    done.push({ name: t.name, rows: n });
  });

  if (!done.length) return { message: '고른 시트가 없습니다.' };

  SpreadsheetApp.flush();
  var summary = done.map(function (d) { return d.name + ' ' + d.rows + '행'; }).join(' / ');
  log_('정리', '비우기 — ' + summary);
  return {
    total: total,
    done: done,
    message: '비웠습니다 (' + total + '행)\n' +
      done.map(function (d) { return '  ' + d.name + ' — ' + d.rows + '행'; }).join('\n')
  };
}

function 비우기() {
  var html = HtmlService.createHtmlOutputFromFile('clear')
    .setWidth(460).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, '비우기');
}
