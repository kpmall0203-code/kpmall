/**
 * 59_트리거_가격관리.gs — 자동화 트리거 핸들러 · 개별 설정
 *
 * 기존 사입도우미 트리거(scheduledUpdate/scheduledTranslate)와 겹치지 않게
 * 별도 핸들러 이름을 쓴다. 트리거를 붙였다 떼는 건 60_설정.gs의
 * applyAutomationSettings()가 '자동화설정' 탭 체크박스를 보고 처리한다.
 */

function scheduledFxUpdate() {
  withLock_('환율 갱신', function () {
    try { fxUpdate(); } catch (e) { log_('fx', 'ERROR', String(e)); }
  });
}

function scheduledFxDrift() {
  withLock_('환율 괴리 확인', function () {
    try { fxCheckDrift(); } catch (e) { log_('fx', 'ERROR', String(e)); }
  });
}

/**
 * 메뉴: 요율표 생성/초기화.
 * 이미 현재 형식이면 사람이 고쳤을 수 있으니 덮어쓰기 전에 확인을 받는다.
 */
function ensureRateCard() {
  var sh = ss_().getSheetByName(SHEET_RATECARD);
  if (sh && rateCardIsCurrent_(sh)) {
    var res = ui_().alert('요율표 초기화',
      '요율표가 이미 최신 형식입니다 (' + Math.max(sh.getLastRow() - 1, 0) + '행).\n\n' +
      '공식 요율표로 되돌리면 직접 수정하신 요율이 있다면 사라집니다.\n' +
      '초기화할까요?', ui_().ButtonSet.YES_NO);
    if (res !== ui_().Button.YES) { toast_('요율표를 그대로 두었습니다.'); return; }
  }
  writeRateCard_();
  _rateCardCache = null;
  var n = RATECARD_SEED_NORMAL.length, c = RATECARD_SEED_COOL.length;
  ui_().alert('요율표 준비 완료',
    '일반 ' + n + '구간 / 냉장 ' + c + '구간 = 총 ' + (n + c) + '행\n\n' +
    'A열 [구분]으로 두 표가 나뉘어 있습니다. 냉장 행은 옅은 파란색입니다.\n\n' +
    '냉장이 일반보다 훨씬 비쌉니다 (0.5kg: 605엔 vs 1,330엔).\n' +
    '요율이 바뀌면 이 탭만 고치면 됩니다 — 코드 수정은 필요 없습니다.',
    ui_().ButtonSet.OK);
}

/** 메뉴: 환율 괴리 알림을 받을 주소 */
function setupAlertEmail() {
  var ui = ui_();
  var props = PropertiesService.getScriptProperties();
  var cur = props.getProperty(PROP_ALERT_EMAIL) || Session.getEffectiveUser().getEmail();
  var res = ui.prompt('알림 메일 주소',
    '환율 괴리(±3%) 알림을 받을 주소를 입력하세요.\n\n현재: ' + cur + '\n\n' +
    '※ 신규 등록 감사는 메일을 보내지 않고 "신규감사" 탭에 쌓입니다.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var v = res.getResponseText().trim();
  if (v) {
    props.setProperty(PROP_ALERT_EMAIL, v);
    ui.alert('알림 주소를 ' + v + ' 로 설정했습니다.');
  }
}
