/**
 * 90_유틸.gs — 공용 헬퍼
 */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/**
 * 사람에게 묻는 창.
 *
 * ── 트리거에는 사람이 없다 ──────────────────────────────
 * 시간 트리거로 도는 동안 SpreadsheetApp.getUi() 는 예외를 던진다. 그러면
 * 일을 다 해 놓고 마지막 알림창에서 걸음이 죽는다 — 표는 바뀌었는데 로그에는
 * 실패로 남아, 다음 걸음이 무엇을 믿어야 할지 알 수 없게 된다.
 *
 * 그래서 창이 없으면 대신 답하는 흉내 창을 준다. 두 가지를 지킨다:
 *   · 알리기만 하는 창(단추 하나)은 로그로 넘기고 OK 로 답한다 — 결정할 것이 없다
 *   · 물어보는 창(OK_CANCEL·YES_NO)은 언제나 '아니오' 다 — 사람이 없는데
 *     사람의 승낙을 지어내지 않는다. 물어야 하는 일은 트리거에서 안 하는 것이 맞다
 */
var UI_SILENT_ = false;
var UI_STUB_BUTTON_ = { OK: 'ui.OK', CANCEL: 'ui.CANCEL', YES: 'ui.YES', NO: 'ui.NO' };
var UI_STUB_SET_ = { OK: 'set.OK', OK_CANCEL: 'set.OK_CANCEL',
                     YES_NO: 'set.YES_NO', YES_NO_CANCEL: 'set.YES_NO_CANCEL' };

/** 트리거 걸음이 켜고 끈다. 켜면 창을 아예 찾지 않는다 */
function uiSilent_(on) { UI_SILENT_ = !!on; }
function uiIsSilent_() { return UI_SILENT_; }

function uiStub_() {
  var isSet = function (x) {
    for (var k in UI_STUB_SET_) if (UI_STUB_SET_[k] === x) return true;
    return false;
  };
  return {
    ButtonSet: UI_STUB_SET_,
    Button: UI_STUB_BUTTON_,
    alert: function (a, b, c) {
      var set = isSet(c) ? c : (isSet(b) ? b : UI_STUB_SET_.OK);
      var text = [a, isSet(b) ? '' : b].filter(function (t) { return t; }).join(' — ');
      if (set === UI_STUB_SET_.OK) {
        log_('ui', 'INFO', '[창 없음] ' + String(text).replace(/\n/g, ' | ').substring(0, 400));
        return UI_STUB_BUTTON_.OK;
      }
      log_('ui', 'WARN', '[창 없음 · 아니오로 답함] ' +
           String(text).replace(/\n/g, ' | ').substring(0, 400));
      return set === UI_STUB_SET_.OK_CANCEL ? UI_STUB_BUTTON_.CANCEL : UI_STUB_BUTTON_.NO;
    },
    prompt: function (a) {
      log_('ui', 'WARN', '[창 없음 · 취소로 답함] ' + String(a).substring(0, 200));
      return { getSelectedButton: function () { return UI_STUB_BUTTON_.CANCEL; },
               getResponseText: function () { return ''; } };
    }
  };
}

function ui_() {
  if (!UI_SILENT_) {
    try { return SpreadsheetApp.getUi(); }
    catch (e) { UI_SILENT_ = true; }      // 트리거·웹앱 문맥 — 이 실행 내내 창이 없다
  }
  return uiStub_();
}

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
/**
 * 머리글에 설명을 단다.
 *
 * 칸마다 setNote 를 부르면 스무 번을 부른다. 탭 50개 · 셀 300만 문서에서는
 * 그것만으로도 스프레드시트 서비스가 늦어진다. 지금 있는 설명을 한 번에 읽어
 * 바뀐 것만 갈아끼우고 한 번에 쓴다 — 읽기 하나, 쓰기 하나.
 */
function headerNotes_(sh, headerRow, header, notes) {
  try {
    var w = Math.max(sh.getLastColumn(), header.length);
    var rng = sh.getRange(headerRow, 1, 1, w);
    var cur = rng.getNotes()[0];
    var dirty = false;
    for (var i = 0; i < header.length && i < w; i++) {
      var n = notes[header[i]];
      if (n && cur[i] !== n) { cur[i] = n; dirty = true; }
    }
    if (dirty) rng.setNotes([cur]);
  } catch (e) {
    log_('ui', 'WARN', '머리글 설명 실패: ' + e);
  }
}

/**
 * 머리글 '이름' 으로 설명을 단다. 칸의 자리를 모를 때 쓴다.
 *
 * headerNotes_ 는 넘긴 배열의 순서를 곧 열 번호로 본다. 표 뒤에 덧붙인 칸에
 * 그것을 쓰면 1번 칸부터 덮어써서 엉뚱한 머리글에 설명이 붙는다 — 실제로 그랬다.
 */
function notesByName_(sh, notes) {
  try {
    var w = Math.max(sh.getLastColumn(), 1);
    var rng = sh.getRange(1, 1, 1, w);
    var hdr = rng.getValues()[0];
    var cur = rng.getNotes()[0];
    var dirty = false;
    for (var i = 0; i < w; i++) {
      var k = String(hdr[i] == null ? '' : hdr[i]).trim();
      var n = k ? notes[k] : null;
      if (n && cur[i] !== n) { cur[i] = n; dirty = true; }
    }
    if (dirty) rng.setNotes([cur]);
  } catch (e) {
    log_('ui', 'WARN', '머리글 설명 실패: ' + e);
  }
}

/**
 * 이 작업이 쓸 표를 미리 만든다 — 한 실행에 하나만.
 *
 * 시트를 새로 만드는 것은 문서 전체를 다시 저장하는 일이다. 탭 50개 ·
 * 셀 300만 문서에서 한 실행에 둘을 만들었더니 스프레드시트 서비스가
 * 타임아웃됐다 (2026-09-07, 운영정책 + 요청함). 하나 만들면 그 이름을 주고,
 * 부른 쪽은 거기서 멈춰 사람에게 다시 누르라고 한다.
 *
 * @return {string} 방금 만든 표 이름. 만들 것이 없으면 빈 문자열
 */
function makeOneSheet_(specs) {
  for (var i = 0; i < specs.length; i++) {
    var sh = ss_().getSheetByName(specs[i].name);
    // 만들다 만 표(시트는 있는데 머리글이 없는 것)도 여기서 마저 채운다.
    // 실제로 타임아웃이 그 사이를 갈라 놓은 적이 있다
    if (sh && sh.getLastRow() > 0) continue;
    if (!sh) sh = ss_().insertSheet(specs[i].name);
    var h = specs[i].header;
    if (h && h.length) {
      fitCols_(sh, h.length);
      sh.getRange(1, 1, 1, h.length).setValues([h])
        .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
    SpreadsheetApp.flush();
    return specs[i].name;
  }
  return '';
}

/** 표를 하나 만들었으면 알리고 멈춘다. @return {boolean} 멈춰야 하나 */
function madeSheetStop_(made, menuName) {
  if (!made) return false;
  ui_().alert('표를 만들었습니다 — 한 번 더 눌러 주세요',
    '"' + made + '" 표를 새로 만들었습니다.\n\n' +
    '이 문서는 탭이 50개라 표 하나를 만드는 것만으로도 무겁습니다.\n' +
    '한 실행에 하나씩만 만듭니다 (둘을 한꺼번에 만들다 타임아웃이 났습니다).\n\n' +
    '[' + menuName + ']을 다시 눌러 주세요.', ui_().ButtonSet.OK);
  return true;
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
