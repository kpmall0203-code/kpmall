/**
 * 30_번역.gs — 일본어 상품명 → 한국 쇼핑몰 검색어
 *
 * Gemini API 키가 등록돼 있으면 수백 건을 한 번에 묶어 보낸다(권장).
 * 키가 없으면 LanguageApp으로 건당 번역한다(느리고 일일 한도 있음).
 *
 * ── 6분 실행 한도를 지키는 방법 ──────────────────────────
 * Apps Script는 실행이 6분을 넘기면 강제 종료되고, 그때까지 메모리에 있던 결과는
 * 시트에 반영되지 않은 채 사라진다. 그래서 세 가지를 지킨다.
 *
 *   1) 행 범위를 TR_WINDOW_ROWS 만큼만 잘라 처리한다 (읽기·쓰기 비용 고정)
 *   2) SOFT 시각을 넘기면 새 API 호출을 시작하지 않고, HARD 시각을 넘기면
 *      쪼개기 재시도까지 즉시 포기한다 (남은 시간은 시트 기록용)
 *   3) 창(window) 하나를 끝낼 때마다 시트에 기록하고 커서를 저장한다
 *      → 중간에 무슨 일이 생겨도 그때까지 번역한 건 남는다
 */

// ── 전처리 ───────────────────────────────────────────────

/**
 * 번역에 넘기기 전 잡음을 걷어낸다.
 * 괄호 안에 맛·구성 같은 식별 정보가 들어 있는 경우가 많아, 통째로 버리지 않고
 * 잡음 표기일 때만 제거한다.
 */
function cleanTitleForTranslate_(jp) {
  var s = String(jp || '');
  s = s.replace(BRACKET_RE, function (m) {
    var inner = m.substring(1, m.length - 1);
    return BRACKET_NOISE_RE.test(inner) ? ' ' : ' ' + inner + ' ';
  });
  s = s.replace(/※.*$/g, ' ');
  s = s.replace(/[｜|/·・、]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > TRANSLATE_MAX_LEN) s = s.substring(0, TRANSLATE_MAX_LEN);
  return s;
}

/**
 * 검색어 마무리.
 * 용량·중량(200ml, 320g)은 절대 지우지 않는다. 같은 상품의 다른 용량이 최저가로
 * 잡히면 엉뚱한 물건을 사게 되기 때문이다. 길어서 자를 때도 용량은 살려 뒤에 붙인다.
 */
function tidyKoreanQuery_(kr) {
  var s = String(kr || '')
    .replace(/병행\s*수입(품)?/g, ' ')
    .replace(/해외\s*직구/g, ' ')
    .replace(/정품\s*보장/g, ' ')
    .replace(/[,\.]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  var w = s.split(' ').filter(String);
  if (w.length <= TRANSLATE_MAX_WORDS) return w.join(' ');

  var head = w.slice(0, TRANSLATE_MAX_WORDS);
  var sizeRe = /^\d+(\.\d+)?\s*(g|kg|ml|mL|l|L|그램|킬로그램|밀리리터|리터|정|매|입)$/;
  if (!head.some(function (t) { return sizeRe.test(t); })) {
    for (var i = TRANSLATE_MAX_WORDS; i < w.length; i++) {
      if (sizeRe.test(w[i])) { head.push(w[i]); break; }
    }
  }
  return head.join(' ');
}

// ── Gemini 배치 번역 ─────────────────────────────────────

var GEMINI_PROMPT =
  '다음은 일본 아마존에 등록된 상품명 목록이다. 대부분 한국 상품을 일본에 파는 것이다.\n' +
  '각 상품에 대해 한국 쇼핑몰(네이버쇼핑, 쿠팡)에서 그 상품을 찾을 때 쓸 한국어 검색어를 만들어라.\n\n' +
  '규칙:\n' +
  '- 브랜드명과 제품명 위주로 짧게. 5~8단어 이내.\n' +
  '- 용량/중량(200ml, 320g 등)은 상품을 구분하는 정보이므로 반드시 유지한다.\n' +
  '- 묶음 수량(3개세트, 6個 등), 광고 문구(HACCP인증, 개별포장, 병행수입품)는 검색어에서 뺀다.\n' +
  '- 일본어로 음차된 외래어는 한국에서 통용되는 표기로 바꾼다. 예: クロックス→크록스\n' +
  '- 한국 상품이면 원래 한국어 상품명을 복원한다. 예: 蔘鶏湯→삼계탕, ククダス→쿠크다스\n' +
  '- 판단이 어려우면 빈 문자열 대신 최선의 추측을 넣어라.\n\n' +
  '입력은 JSON 배열이다. 반드시 같은 순서, 같은 길이의 JSON 배열로만 답하라. 설명 금지.\n\n' +
  '입력:\n';

/** 한 번의 API 호출로 여러 상품명을 번역한다. 실패하면 null. */
function geminiCall_(key, titles) {
  var payload = {
    contents: [{ parts: [{ text: GEMINI_PROMPT + JSON.stringify(titles) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
      thinkingConfig: { thinkingBudget: 0 } // 단순 변환이라 사고 과정 불필요 — 속도·비용 절감
    }
  };
  var res = UrlFetchApp.fetch(GEMINI_ENDPOINT + GEMINI_MODEL + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    log_('translate', 'ERROR', 'Gemini HTTP ' + code + ': ' + text.substring(0, 300));
    return null;
  }
  try {
    var body = JSON.parse(text);
    var cand = body.candidates && body.candidates[0];
    if (!cand || !cand.content || !cand.content.parts) return null;
    var out = JSON.parse(cand.content.parts[0].text);
    return (out && out.length === titles.length) ? out : null;
  } catch (e) {
    log_('translate', 'ERROR', 'Gemini 응답 파싱 실패: ' + String(e));
    return null;
  }
}

/**
 * 배치를 보내되, 개수가 어긋나거나 실패하면 반으로 쪼개 재시도한다.
 * deadline(ms 절대시각)을 넘기면 재시도를 포기한다 — 이게 없으면 재시도가
 * 실행 한도를 통째로 잡아먹는다.
 * @return 성공한 {상품명: 검색어} 맵
 */
function geminiTranslateChunk_(key, titles, deadline) {
  var map = {};
  if (Date.now() > deadline) return map;

  var out = geminiCall_(key, titles);
  if (out) {
    for (var i = 0; i < titles.length; i++) map[titles[i]] = out[i];
    return map;
  }
  if (titles.length <= GEMINI_MIN_BATCH || Date.now() > deadline) {
    log_('translate', 'WARN', '배치 실패 ' + titles.length + '건 — 다음 실행에서 재시도');
    return map;
  }
  var mid = Math.floor(titles.length / 2);
  var a = geminiTranslateChunk_(key, titles.slice(0, mid), deadline);
  var b = geminiTranslateChunk_(key, titles.slice(mid), deadline);
  for (var k in a) map[k] = a[k];
  for (var k2 in b) map[k2] = b[k2];
  return map;
}

// ── 실행 ─────────────────────────────────────────────────

/**
 * 비어 있는 한글명을 채운다. 시트 행을 창 단위로 잘라 처리하고,
 * 창 하나가 끝날 때마다 기록·커서 저장을 한다.
 *
 * @param interactive 메뉴에서 부른 경우 true (완료 알림 표시)
 */
function runTranslation_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var sh = getSheetOrThrow_(SHEET_LISTING);
  var totalRows = sh.getLastRow() - 1;
  if (totalRows < 1) {
    if (interactive) ui_().alert('리스팅이 비어 있습니다. 먼저 [② 상품목록 갱신]을 실행하세요.');
    return;
  }

  var key = props.getProperty(PROP_GEMINI_KEY);
  var engine = key ? 'Gemini' : 'LanguageApp';
  var cursor = parseInt(props.getProperty(PROP_TR_CURSOR) || '0', 10);
  if (!(cursor >= 0) || cursor >= totalRows) cursor = 0;
  var passPending = parseInt(props.getProperty(PROP_TR_PASS_PENDING) || '0', 10);
  if (!(passPending >= 0)) passPending = 0;

  var done = 0, windows = 0, finished = false;
  // 한 번 실행에서 시트를 한 바퀴만 돈다. 이 제한이 없으면 번역할 게 없어도
  // 3분 내내 같은 자리를 수십 바퀴 돌며 실행 시간을 태운다.
  var lapStart = cursor, lapped = false;

  while (Date.now() - t0 < TRANSLATE_SOFT_MS && !lapped) {
    var rows = Math.min(TR_WINDOW_ROWS, totalRows - cursor);
    if (rows <= 0) break;

    var range = sh.getRange(2 + cursor, TR_COL_START, rows, TR_COL_COUNT);
    var vals = range.getValues();

    // 이 창에서 번역이 필요한 행을 상품명 기준으로 묶는다 (같은 상품명은 한 번만)
    var byTitle = {}, order = [];
    for (var r = 0; r < vals.length; r++) {
      var jp = String(vals[r][W_JP]).trim();
      if (!jp || String(vals[r][W_KR]).trim()) continue;
      // 정제 결과가 비면(제목이 통째로 괄호 표기인 경우 등) 원문이라도 넘긴다.
      // 여기서 건너뛰면 그 행은 영원히 "번역 대기"로 남아 이어실행이 멈추지 않는다.
      var src = cleanTitleForTranslate_(jp) || jp.substring(0, TRANSLATE_MAX_LEN);
      if (!byTitle[src]) { byTitle[src] = []; order.push(src); }
      byTitle[src].push(r);
    }

    var windowDone = 0;
    if (order.length) {
      var deadline = t0 + TRANSLATE_HARD_MS;
      if (key) {
        for (var i = 0; i < order.length; i += GEMINI_BATCH) {
          if (Date.now() - t0 > TRANSLATE_SOFT_MS) break;
          var batch = order.slice(i, i + GEMINI_BATCH);
          var map = geminiTranslateChunk_(key, batch, deadline);
          for (var t = 0; t < batch.length; t++) {
            var kr = map[batch[t]];
            if (!kr || !String(kr).trim()) continue;
            var tidy = tidyKoreanQuery_(kr);
            var rr = byTitle[batch[t]];
            for (var x = 0; x < rr.length; x++) {
              vals[rr[x]][W_KR] = tidy;
              vals[rr[x]][W_TRAT] = new Date();
            }
            windowDone++;
          }
        }
      } else {
        var consecutiveFail = 0;
        for (var j = 0; j < order.length && windowDone < TRANSLATE_CHUNK; j++) {
          if (Date.now() - t0 > TRANSLATE_SOFT_MS) break;
          try {
            var krl = tidyKoreanQuery_(LanguageApp.translate(order[j], 'ja', 'ko'));
            var rl = byTitle[order[j]];
            for (var y = 0; y < rl.length; y++) {
              vals[rl[y]][W_KR] = krl;
              vals[rl[y]][W_TRAT] = new Date();
            }
            windowDone++;
            consecutiveFail = 0;
          } catch (e) {
            if (++consecutiveFail >= 5) break; // 일일 한도로 판단
          }
        }
      }
      // 창 단위로 즉시 기록 — 여기까지 한 작업은 무슨 일이 있어도 남는다
      if (windowDone > 0) range.setValues(vals);
    }

    // 이 창에서 끝내 못 채운 건수 (다음 바퀴에 다시 시도)
    var stillPending = 0;
    for (var s = 0; s < vals.length; s++) {
      if (String(vals[s][W_JP]).trim() && !String(vals[s][W_KR]).trim()) stillPending++;
    }
    passPending += stillPending;

    done += windowDone;
    windows++;
    cursor += rows;

    if (cursor >= totalRows) {
      cursor = 0;
      if (passPending === 0) { finished = true; break; } // 남은 게 없다
      lapped = lapStart === 0; // 처음부터 돌았다면 한 바퀴 완주
      passPending = 0;
    }
    if (cursor === lapStart) lapped = true; // 시작 지점으로 돌아왔다
    props.setProperty(PROP_TR_CURSOR, String(cursor));
    props.setProperty(PROP_TR_PASS_PENDING, String(passPending));
  }

  // 한 바퀴를 다 돌았는데 한 건도 못 옮겼다면 더 해도 소용없다.
  // 계속 이어실행하면 4분마다 3분씩 실행 시간을 태우게 된다.
  var stuck = lapped && done === 0;
  if (stuck) finished = true;

  props.setProperty(PROP_TR_CURSOR, String(cursor));
  props.setProperty(PROP_TR_PASS_PENDING, String(finished ? 0 : passPending));
  log_('translate', stuck ? 'WARN' : 'INFO',
       engine + ' 번역 ' + done + '건 (창 ' + windows + '개, ' +
       Math.round((Date.now() - t0) / 1000) + '초), 커서=' + cursor +
       (stuck ? ' — 한 바퀴 돌아도 진전이 없어 이어실행을 멈춥니다' : ''));

  if (finished) removeContinuationTrigger_();
  else scheduleContinuation_();

  if (interactive) {
    var msg = '[' + engine + '] 이번 실행에서 ' + done + '건 번역했습니다.\n\n';
    if (finished) {
      msg += '모든 상품의 번역이 끝났습니다.';
    } else {
      msg += '아직 남아 있어 1분 뒤 자동으로 이어서 처리합니다.\n' +
             '시트를 닫아도 계속되며, 지금까지 번역한 내용은 이미 저장돼 있습니다.\n\n' +
             '진행 상황은 메뉴 [번역 진행 상황]에서 확인하세요.';
    }
    if (!key) {
      msg += '\n\n※ Gemini API 키를 등록하면 훨씬 빠릅니다. 메뉴 [Gemini API 키 설정]';
    }
    toast_('번역 ' + done + '건 완료');
    ui_().alert(msg);
  }
}

/** 메뉴: 한글 번역 시작/이어하기 */
function translatePending() {
  runTranslation_(true);
}

/** 이어실행 트리거가 호출 */
function continueTranslation() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    // 그냥 리턴하면 이어실행 체인이 끊겨 남은 번역이 다음 날까지 밀린다.
    // 1분 뒤로 다시 예약해 둔다.
    scheduleContinuation_();
    return;
  }
  try {
    runTranslation_(false);
  } catch (e) {
    log_('translate', 'ERROR', String(e));
    scheduleContinuation_(); // 오류가 나도 다음 실행에서 이어가도록
  } finally {
    lock.releaseLock();
  }
}

/** 매일 트리거가 호출 (신규 상품만 처리) */
function scheduledTranslate() {
  // 번역도 '리스팅' 탭에 쓴다 — 가격관리 작업과 겹치면 값이 깨진다
  withLock_('번역', function () {
    try {
      runTranslation_(false);
    } catch (e) {
      log_('translate', 'ERROR', String(e));
    }
  });
}

/**
 * 1분 뒤 이어실행을 예약한다.
 * 일회성 트리거가 목록에 남아 쌓이는 것을 막으려고, 걸기 전에 기존 것을 먼저 지운다.
 * (지우지 않으면 "이미 있음"으로 판단해 새로 걸지 않아 이어실행이 멈출 수 있다.)
 */
function scheduleContinuation_() {
  removeContinuationTrigger_();
  ScriptApp.newTrigger(CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

function removeContinuationTrigger_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
}

/** 메뉴: 번역 중단 (이어실행 트리거 제거) */
function stopTranslation() {
  removeContinuationTrigger_();
  ui_().alert('이어실행을 중단했습니다.\n' +
              '지금까지 번역한 내용은 그대로 남아 있습니다.\n' +
              '[③ 한글 번역 시작]을 누르면 멈춘 지점부터 다시 이어갑니다.');
}

/** 메뉴: 진행 상황 */
function translationStatus() {
  var sh = getSheetOrThrow_(SHEET_LISTING);
  var last = sh.getLastRow();
  if (last < 2) { ui_().alert('리스팅이 비어 있습니다.'); return; }

  // 필요한 열만 읽는다 (C:E)
  var vals = sh.getRange(2, TR_COL_START, last - 1, 3).getValues();
  var total = vals.length, translated = 0, manual = 0, pending = 0;
  for (var r = 0; r < total; r++) {
    if (String(vals[r][W_MANUAL]).trim()) manual++;
    else if (String(vals[r][W_KR]).trim()) translated++;
    else pending++;
  }
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(PROP_GEMINI_KEY);
  var cursor = parseInt(props.getProperty(PROP_TR_CURSOR) || '0', 10);
  var running = false;
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === CONTINUE_HANDLER) running = true;
  }

  ui_().alert(
    '리스팅 ' + total + '건\n' +
    '  수동 검색어 지정 : ' + manual + '건\n' +
    '  자동 번역 완료   : ' + translated + '건\n' +
    '  번역 대기        : ' + pending + '건\n\n' +
    '엔진: ' + (key ? 'Gemini (배치 ' + GEMINI_BATCH + '건씩)' : 'LanguageApp (키 없음)') + '\n' +
    '진행 위치: ' + cursor + '행부터\n' +
    '이어실행 예약: ' + (running ? '있음 (1분 내 자동 재개)' : '없음') + '\n\n' +
    (pending ? (running ? '자동으로 계속 처리됩니다.' : '[③ 한글 번역 시작]을 누르면 이어서 처리합니다.')
             : '모두 완료되었습니다.')
  );
}
