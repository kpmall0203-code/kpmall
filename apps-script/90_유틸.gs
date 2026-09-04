/**
 * 90_유틸.gs — 공용 헬퍼
 */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function ui_() { return SpreadsheetApp.getUi(); }

function toast_(msg) {
  try { ss_().toast(msg, '사입도우미', 6); } catch (e) {}
}

/** 'YYYY-MM-DD' 두 개 사이의 일수 (음수는 0) */
function daysBetween_(a, b) {
  if (!a || !b) return 0;
  var d1 = new Date(a).getTime(), d2 = new Date(b).getTime();
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

/**
 * 트리거 안에서 사용자에게 알린다.
 * 대화상자는 트리거 문맥에서 뜨지 않으므로(그리고 예외를 던져 체인을 끊으므로)
 * 로그 + 메일로 대신한다. 실패해도 호출자를 죽이지 않는다.
 */
function notifyAlert_(subject, body) {
  log_('notify', 'INFO', subject + ' — ' + String(body).replace(/\n/g, ' | '));
  try {
    var email = PropertiesService.getScriptProperties().getProperty(PROP_ALERT_EMAIL) ||
                Session.getEffectiveUser().getEmail();
    if (email) MailApp.sendEmail(email, '[가격관리] ' + subject, body + '\n\n' + ss_().getUrl());
  } catch (e) {}
}

function ensureSheet_(name, header) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    if (header && header.length) {
      sh.getRange(1, 1, 1, header.length).setValues([header]);
      sh.setFrozenRows(1);
    }
    return sh;
  }
  if (header && header.length && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * 결과 탭을 눈앞에 띄운다.
 *
 * 분석이 끝나도 결과 탭이 숨겨져 있거나 뒤쪽에 있으면 사람은 아무것도 못 본다.
 * [탭 정리]로 숨겨둔 상태일 수도 있으므로 숨김을 먼저 푼다.
 *
 * 알림창을 띄우기 *전에* 부르는 것이 맞다 — 창을 닫는 순간 결과가 보인다.
 */
function showSheet_(name) {
  try {
    var sh = ss_().getSheetByName(name);
    if (!sh) return false;
    if (sh.isSheetHidden()) sh.showSheet();
    sh.activate();
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    log_('ui', 'WARN', '탭 표시 실패 (' + name + '): ' + e);
    return false;
  }
}

/**
 * 머리글 칸에 설명을 붙인다 (마우스를 올리면 뜨는 메모).
 * @param {Sheet} sh
 * @param {number} headerRow 머리글이 있는 행
 * @param {Object} notes {칸이름: 설명}
 * @param {Array<string>} header
 */
function headerNotes_(sh, headerRow, header, notes) {
  try {
    for (var i = 0; i < header.length; i++) {
      var n = notes[header[i]];
      if (n) sh.getRange(headerRow, i + 1).setNote(n);
    }
  } catch (e) {
    log_('ui', 'WARN', '머리글 설명 실패: ' + e);
  }
}

function getSheetOrThrow_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('탭 "' + name + '"이 없습니다. 먼저 [상품목록 갱신]을 실행하세요.');
  return sh;
}

function log_(component, level, message) {
  try {
    var sh = ensureSheet_(SHEET_LOG, LOG_HEADER);
    sh.appendRow([new Date(), component, level, String(message).substring(0, 2000)]);
    // 로그가 너무 길어지면 오래된 것부터 정리
    var last = sh.getLastRow();
    if (last > 2000) sh.deleteRows(2, last - 1000);
  } catch (e) {}
}
