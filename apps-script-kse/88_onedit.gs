/**
 * 88_onedit.gs — [완료] 에 손으로 붙여넣은 행에도 완료일시와 경로 색을 넣는다.
 *
 * 도구로 옮기는 행(KSE 접수·근석이/shipnergy 내려받기)은 옮길 때 시각과 색이 들어간다.
 * 그런데 [주문] 에서 행을 잘라 [완료] 에 붙여넣으면 아무것도 안 남았다 — 9/28 에 573행이
 * 그렇게 들어와 완료일시가 비고 상태도 '송장수신' 그대로였다.
 *
 * 단순 트리거(onEdit)라 설치가 필요 없고, 붙여넣기에도 불린다. [완료] 가 아닌 시트는 바로 끝낸다.
 * 주문번호가 있고 완료일시가 빈 행만 손댄다 — 이미 있는 값은 바꾸지 않는다.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== SHEET_DONE) return;
    var top = Math.max(2, e.range.getRow());
    var bottom = e.range.getLastRow();
    if (bottom < top) return;
    doneStampRows_(sh, top, bottom - top + 1);
  } catch (err) {
    // 편집을 막으면 안 된다 — 조용히 넘기고 로그만
    try { log_('완료처리', '붙여넣은 행 표시 실패 — ' + err); } catch (e2) { /* 무시 */ }
  }
}

/**
 * [완료] 의 top 행부터 n 행 — 완료일시가 빈 주문 행에 시각·상태를 넣고, 전부 경로 색으로 칠한다.
 * @return {number} 시각을 새로 넣은 행 수
 */
function doneStampRows_(sh, top, n) {
  var rng = sh.getRange(top, 1, n, COL_COUNT);
  var vals = rng.getValues();
  var stamp = nowStr_();
  var stamped = 0;
  var dateCells = [], statusCells = [];
  vals.forEach(function (v) {
    var hasOrder = String(v[COL.ORDER_ID - 1] || '').trim();
    var needStamp = hasOrder && !String(v[COL.DONE_AT - 1] || '').trim();
    if (needStamp) { v[COL.DONE_AT - 1] = stamp; v[COL.STATUS - 1] = ST.DONE; stamped++; }
    dateCells.push([v[COL.DONE_AT - 1]]);
    statusCells.push([v[COL.STATUS - 1]]);
  });
  if (stamped) {
    sh.getRange(top, COL.DONE_AT, n, 1).setValues(dateCells);
    sh.getRange(top, COL.STATUS, n, 1).setValues(statusCells);
  }
  // 주문번호가 있는 행만 칠한다 (빈 행은 그대로)
  var i = 0;
  while (i < vals.length) {
    if (!String(vals[i][COL.ORDER_ID - 1] || '').trim()) { i++; continue; }
    var j = i;
    while (j + 1 < vals.length && String(vals[j + 1][COL.ORDER_ID - 1] || '').trim()) j++;
    paintDoneRows_(sh, top + i, vals.slice(i, j + 1));
    i = j + 1;
  }
  if (stamped) log_('완료처리', '[' + SHEET_DONE + '] 에 붙여넣은 ' + stamped + '행 — 완료일시·색 넣음');
  return stamped;
}
