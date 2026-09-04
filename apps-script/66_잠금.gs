/**
 * 66_잠금.gs — 동시 실행 방지
 *
 * 왜 필요한가:
 *   시간 트리거 4개(환율·괴리·감사·주문)와 1분 간격 이어실행 3개(주문수집·번역·
 *   가격반영)가 같은 시트를 읽고 쓴다. Apps Script의 atHour(6)은 '6시 정각'이
 *   아니라 6~7시 사이 임의 시각이라 시간대를 벌려도 겹칠 수 있고, 이어실행은
 *   애초에 하루 종일 돈다. 겹치면 절반만 쓰인 데이터를 읽거나 같은 탭에 동시에
 *   써서 값이 조용히 깨진다.
 *
 * 두 가지 방식으로 나눈다:
 *   [건너뛰기] 매일 도는 작업 — 오늘 못 돌면 내일 돌면 된다. 물러난다.
 *   [미루기]   이어실행 체인 — 물러나면 체인이 끊기므로 1분 뒤로 다시 예약한다.
 */

var LOCK_WAIT_MS = 20000;      // 이 시간 안에 못 잡으면 다른 작업이 도는 중으로 본다

/**
 * 잠금을 잡고 실행한다. 못 잡으면 skip.
 * @return {{ran:boolean, value:*}}
 */
function withLock_(name, fn) {
  var lock;
  try {
    lock = LockService.getScriptLock();
  } catch (e) {
    return { ran: true, value: fn() };   // 잠금 자체를 못 쓰는 환경이면 그냥 실행
  }
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    log_('lock', 'INFO', name + ' 건너뜀 — 다른 작업이 실행 중');
    return { ran: false, value: null };
  }
  try {
    return { ran: true, value: fn() };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * 이어실행용. 잠금을 못 잡으면 건너뛰지 않고 1분 뒤로 다시 예약한다 —
 * 체인이 끊기면 남은 작업이 영영 처리되지 않기 때문이다.
 */
function withLockOrRetry_(name, handler, fn) {
  var lock;
  try {
    lock = LockService.getScriptLock();
  } catch (e) {
    return fn();
  }
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    log_('lock', 'INFO', name + ' 연기 — 다른 작업 중, 1분 뒤 재시도');
    rescheduleContinue_(handler);
    return null;
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/** 같은 이름의 이어실행 트리거를 하나만 남기고 1분 뒤로 건다 */
function rescheduleContinue_(handler) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === handler) ScriptApp.deleteTrigger(ts[i]);
  }
  ScriptApp.newTrigger(handler).timeBased().after(60 * 1000).create();
}

/** 메뉴: 지금 도는 자동화가 있는지 확인 */
function lockStatus() {
  var busy = false;
  try {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(500)) { lock.releaseLock(); } else { busy = true; }
  } catch (e) {}

  var ts = ScriptApp.getProjectTriggers();
  var timed = [], cont = [];
  for (var i = 0; i < ts.length; i++) {
    var fn = ts[i].getHandlerFunction();
    if (fn.indexOf('continue') === 0) cont.push(fn);
    else timed.push(fn);
  }
  ui_().alert('자동화 상태',
    (busy ? '■ 지금 무언가 실행 중입니다.\n   끝날 때까지 다른 메뉴를 누르지 마세요.\n\n'
          : '■ 실행 중인 작업 없음\n\n') +
    '예약된 정기 작업 ' + timed.length + '개\n   ' + (timed.join('\n   ') || '없음') + '\n\n' +
    '진행 중인 이어실행 ' + cont.length + '개\n   ' + (cont.join('\n   ') || '없음') + '\n\n' +
    '겹쳐도 잠금이 막습니다 — 정기 작업은 건너뛰고, 이어실행은 1분 뒤 재시도합니다.',
    ui_().ButtonSet.OK);
}
