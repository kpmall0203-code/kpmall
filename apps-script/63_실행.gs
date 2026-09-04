/**
 * 63_실행.gs — 묶음 실행 · 다음 할 일 안내
 *
 * 기능이 늘면서 버튼이 39개가 됐다. 대부분은 '한 번만 누르는 것'이거나
 * '항상 같이 눌러야 하는 것'이라 사람이 순서를 외워야 했다.
 *
 * 여기서 두 가지를 한다:
 *   1) 항상 같이 도는 것들을 하나로 묶는다 (탭 생성, 데이터 갱신 등)
 *   2) 시트 상태를 보고 '다음에 뭘 눌러야 하는지' 직접 알려준다
 *
 * Apps Script 6분 제한이 있어 무한정 묶을 수는 없다. SP-API 리포트 폴링처럼
 * 오래 걸리는 것은 따로 두고, 빠른 것끼리만 묶는다.
 */

// ── ① 처음 설정 ──────────────────────────────────────────

/** 탭을 한꺼번에 만든다. 여러 번 눌러도 기존 입력은 보존된다. */
function setupAll() {
  var done = [], failed = [];
  var steps = [
    ['요율표', function () { if (!ss_().getSheetByName(SHEET_RATECARD)) writeRateCard_(); }],
    ['원가', setupCostSheet],
    ['자동화설정', setupAutomationSheet],
    ['리프라이싱제외', setupExcludeSheet],
    ['배송비조회', setupShipLookup]
  ];
  for (var i = 0; i < steps.length; i++) {
    try { steps[i][1](); done.push(steps[i][0]); }
    catch (e) { failed.push(steps[i][0] + ' (' + e.message + ')'); }
  }

  try { organizeSheets_quiet_(); } catch (e) {}   // 만든 직후 바로 정리해 둔다

  var props = PropertiesService.getScriptProperties();
  var needFolder = !props.getProperty(PROP_INVOICE_FOLDER);

  ui_().alert('처음 설정 완료',
    '만든 탭: ' + done.join(', ') +
    (failed.length ? '\n실패: ' + failed.join(', ') : '') + '\n\n' +
    (needFolder
      ? '■ 남은 것 하나 — 청구서 폴더 지정\n' +
        '   메뉴 [⚙ 설정 → 청구서 폴더 지정]에서 Drive 폴더를 연결하세요.\n\n'
      : '') +
    '다음: [🔄 데이터 갱신 → 환율·청구서·원가]',
    ui_().ButtonSet.OK);
}

// ── ② 데이터 갱신 ────────────────────────────────────────

/**
 * 빠른 것끼리 묶는다: 환율 → 청구서 적재 → SKU원가.
 * SP-API 리포트(등록일·리스팅)는 폴링이 길어 ③으로 분리했다.
 */
function refreshData() {
  var log = [], t0 = Date.now();

  try { fxUpdate(); log.push('✓ 환율 갱신'); }
  catch (e) { log.push('✗ 환율: ' + e.message); }

  if (PropertiesService.getScriptProperties().getProperty(PROP_INVOICE_FOLDER)) {
    try { ingestInvoices(); log.push('✓ 청구서 적재'); }
    catch (e) { log.push('✗ 청구서: ' + e.message); }
  } else {
    log.push('- 청구서: 폴더 미지정으로 건너뜀');
  }

  try {
    var ordSh = ss_().getSheetByName(SHEET_ORDERS);
    if (ordSh && ordSh.getLastRow() > 1) { rebuildSkuCosts(); log.push('✓ SKU원가 재계산'); }
    else log.push('- SKU원가: 주문↔SKU 자료가 없어 건너뜀 (배송비가 추정으로 계산됩니다)');
  } catch (e) { log.push('✗ SKU원가: ' + e.message); }

  ui_().alert('데이터 갱신 완료 (' + Math.round((Date.now() - t0) / 1000) + '초)',
    log.join('\n') + '\n\n' + nextActionText_(), ui_().ButtonSet.OK);
}

var PROP_SYNC_REPORT = 'SYNC_REPORT_ID';
var PROP_SYNC_DOC = 'SYNC_DOC_ID';
var PROP_LAST_SYNC_AT = 'LAST_SYNC_AT';   // 리스팅 탭이 언제 아마존과 맞춰졌는지
var SYNC_CONTINUE_HANDLER = 'continueSync';

var SYNC_POLL_MS = 2.5 * 60 * 1000;    // 폴링 상한
var SYNC_HANDOFF_MS = 45 * 1000;       // 폴링에 이만큼 넘게 썼으면 기록은 다음 실행으로

/**
 * ③ 아마존 동기화 — 리포트 '한 번'으로 리스팅과 등록일을 함께 채운다.
 *
 * 예전에는 updateListingsSilent_() 와 updateOpenDates() 를 이어서 불렀는데,
 * 둘 다 GET_MERCHANT_LISTINGS_ALL_DATA 를 각각 생성·폴링해서 최악의 경우
 * 4분+4분이 되어 6분 한도를 넘겼다. 등록일은 같은 리포트의 open-date
 * 컬럼이므로 한 번만 받으면 된다.
 *
 * 그래도 시간 초과가 났다. 원인은 '이어받기가 폴링까지만'이었기 때문이다.
 *   리포트 대기 3분 + 다운로드·파싱·12,000행 기록 3분 = 6분 초과.
 *   대기가 조금만 길어져도 뒤쪽이 통째로 잘리고, 다시 눌러도 또 대기부터 한다.
 *
 * 그래서 단계를 둘로 쪼개 각각 6분을 통째로 쓰게 했다:
 *   1단계 리포트 준비 → documentId 저장하고 종료
 *   2단계 다운로드 + 기록 → 새 실행에서 6분을 전부 쓴다
 * 사이는 1분 트리거로 자동 연결되므로 사용자가 다시 누를 필요는 없다.
 *
 * documentId의 다운로드 URL은 5분이면 만료되지만 documentId 자체는 살아 있어
 * 이어받을 때 URL만 다시 발급받으면 된다.
 */
function syncAmazon() {
  syncStep_(true);
}

/** 트리거용 이어실행 */
function continueSync() {
  withLockOrRetry_('아마존 동기화', SYNC_CONTINUE_HANDLER, function () {
    try { syncStep_(false); } catch (e) { log_('spapi', 'ERROR', '동기화 이어실행: ' + String(e)); }
  });
}

function syncStep_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var token = getLwaToken_();
  var docId = props.getProperty(PROP_SYNC_DOC);

  // ── 1단계: 리포트 준비 ──
  if (!docId) {
    var reportId = props.getProperty(PROP_SYNC_REPORT);
    if (!reportId) {
      toast_('리포트 요청 중…');
      reportId = spapi_(token, 'post', '/reports/2021-06-30/reports', {
        reportType: REPORT_TYPE,
        marketplaceIds: [MARKETPLACE_JP]
      }).reportId;
      props.setProperty(PROP_SYNC_REPORT, reportId);
      log_('spapi', 'INFO', '동기화 리포트 생성 ' + reportId);
    } else {
      toast_('직전 리포트 이어받는 중…');
    }

    while (Date.now() - t0 < SYNC_POLL_MS) {
      var info = spapi_(token, 'get', '/reports/2021-06-30/reports/' + reportId);
      if (info.processingStatus === 'DONE') { docId = info.reportDocumentId; break; }
      if (info.processingStatus === 'FATAL' || info.processingStatus === 'CANCELLED') {
        props.deleteProperty(PROP_SYNC_REPORT);
        syncScheduleContinue_(false);
        throw new Error('리포트 처리 실패: ' + info.processingStatus + '\n다시 실행하세요.');
      }
      Utilities.sleep(10000);
    }

    if (!docId) {
      // reportId는 남겨 둔다 — 1분 뒤 자동으로 이어받는다
      syncScheduleContinue_(true);
      log_('spapi', 'INFO', '리포트 생성 대기 — 1분 뒤 자동 재시도');
      if (interactive) {
        ui_().alert('아마존 동기화 — 리포트 준비 중',
          '아마존이 아직 리포트를 만들고 있습니다 (오류 아님).\n\n' +
          '1분 뒤 자동으로 이어받습니다. 창을 닫아두셔도 됩니다.\n' +
          '완료되면 로그 탭에 기록이 남습니다.\n\n' +
          'reportId: ' + reportId, ui_().ButtonSet.OK);
      }
      return;
    }

    props.setProperty(PROP_SYNC_DOC, docId);
    props.deleteProperty(PROP_SYNC_REPORT);

    // 폴링에 시간을 많이 썼으면 기록은 새 실행에 맡긴다.
    // 12,000행 기록에 남은 시간이 얼마인지 걸고 하느니, 6분을 통째로 주는 게 확실하다.
    if (Date.now() - t0 > SYNC_HANDOFF_MS) {
      syncScheduleContinue_(true);
      log_('spapi', 'INFO', '리포트 준비 완료 — 기록은 1분 뒤 이어서');
      if (interactive) {
        ui_().alert('아마존 동기화 — 리포트 준비 완료',
          '리포트를 받을 준비가 됐습니다.\n\n' +
          '1분 뒤 자동으로 시트에 기록합니다 (1~2분 소요).\n' +
          '창을 닫아두셔도 되고, 끝나면 로그 탭에 남습니다.', ui_().ButtonSet.OK);
      }
      return;
    }
  } else {
    toast_('리포트 기록 이어받는 중…');
  }

  // ── 2단계: 다운로드 + 기록 ──
  // URL은 5분이면 만료되므로 이어받을 때마다 새로 발급받는다
  var doc = spapi_(token, 'get', '/reports/2021-06-30/documents/' + docId);
  var blob = UrlFetchApp.fetch(doc.url, { muteHttpExceptions: true }).getBlob();
  var text = (doc.compressionAlgorithm === 'GZIP')
    ? Utilities.ungzip(blob.setContentType('application/x-gzip')).getDataAsString('UTF-8')
    : blob.getDataAsString('UTF-8');

  var items = parseListingReport_(text);
  if (!items.length) {
    props.deleteProperty(PROP_SYNC_DOC);
    syncScheduleContinue_(false);
    throw new Error('리포트에 데이터가 없습니다.');
  }

  writeListings_(items);

  // 같은 파싱 결과에서 등록일 탭까지 채운다 (리포트 재요청 없음).
  // ASIN도 같이 넣는다 — 등록일만 보고 있으면 어느 상품인지 확인하러
  // 매번 리스팅 탭으로 건너가야 한다.
  var odRows = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].openDate) {
      odRows.push([items[i].sku, items[i].asin || '', items[i].openDate]);
    }
  }
  if (odRows.length) {
    var sh = ensureSheet_(SHEET_OPENDATE, OPENDATE_HEADER);
    // clear() 로 비우고 쓰지 않는다 — 1만 건 쓰는 도중에 죽으면
    // 등록일이 통째로 사라지고 리프라이싱이 아예 안 돈다 (r0를 못 구한다)
    writeTable_(sh, OPENDATE_HEADER, odRows);
  }

  props.deleteProperty(PROP_SYNC_DOC);
  props.setProperty(PROP_LAST_SYNC_AT, String(Date.now()));   // 반영 대조가 신선도를 판단한다
  syncScheduleContinue_(false);

  var msg = '리스팅 ' + items.length + '건 · 등록일 ' + odRows.length + '건 (' +
            Math.round((Date.now() - t0) / 1000) + '초)';
  log_('spapi', 'INFO', '동기화 완료 — ' + msg);
  toast_(msg);
  if (interactive) {
    ui_().alert('아마존 동기화 완료', msg + '\n\n' + nextActionText_(), ui_().ButtonSet.OK);
  }
}

function syncScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === SYNC_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(SYNC_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}


// ④ 주문 수집 — 52C_주문리포트.gs 로 옮겨갔다.
//    Orders API 크롤링(건당 2초, 2만 건에 11시간)은 주문 리포트 권한이 확인되어 삭제.

// ── ▶ 리프라이싱 (방향 선택) ─────────────────────────────

/**
 * 등록 시기별로 몇 건이고 조정폭이 얼마나 되는지 미리 보여준다.
 *
 * 한 번에 1만 건을 바꾸는 건 부담스럽다. 나눠서 할 때 어디부터 손댈지
 * 정하려면 '건수'만으로는 부족하고 '얼마나 움직이는지'를 같이 봐야 한다.
 * 최근 등록분은 등록 시점 환율이 지금과 가까워 조정폭이 작다 — 여기부터가 안전하다.
 */
function repriceScopePreview_() {
  var r1 = fxHouseRate_();
  if (!r1) throw new Error('환율 데이터가 없습니다. [🔄 데이터 갱신 → 환율·청구서·원가]을 먼저 실행하세요.');
  fxClearCache_();
  var openMap = openDateMap_();
  var logMap = priceLogMap_();
  var listSh = getSheetOrThrow_(SHEET_LISTING);
  var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();

  var byYear = {}, all = { n: 0, sum: 0, done: 0 };
  for (var i = 0; i < lv.length; i++) {
    var sku = String(lv[i][L_SKU] || '').trim();
    if (!sku || !(Number(lv[i][L_PRICE]) > 0)) continue;
    var od = openMap[sku];
    if (!od) continue;
    var r0 = fxRateOn_(od);
    if (!r0) continue;
    var y = od.substring(0, 4);
    if (!byYear[y]) byYear[y] = { n: 0, sum: 0, done: 0 };
    var gap = Math.abs(r0 / r1 - 1);
    byYear[y].n++; byYear[y].sum += gap;
    all.n++; all.sum += gap;
    // 이미 리프라이싱을 반영한 적 있는 SKU (대장에 기록이 있음)
    if (logMap[sku]) { byYear[y].done++; all.done++; }
  }
  return { byYear: byYear, all: all };
}

/**
 * 구간 입력을 파싱한다. 사람이 뭘 칠지 모르니 넓게 받는다.
 *   '2024'            → 2024-01-01 ~ 2024-12-31
 *   '2024-03'         → 2024-03-01 ~ 2024-03-31
 *   '2024~2025'       → 2024-01-01 ~ 2025-12-31
 *   '2024-07~2025-06' → 2024-07-01 ~ 2025-06-30
 *   '~2023'           → 2023-12-31 이전 전부
 *   '2026~'           → 2026-01-01 이후 전부
 *   '' / '전체' / '0'  → 제한 없음
 * @return {{from:string, to:string, label:string}}
 */
function parseScopeInput_(raw) {
  var s = String(raw || '').trim().replace(/\s/g, '');
  if (!s || s === '0' || s === '전체') return { from: '', to: '', label: '전체' };

  function startOf(tok) {
    if (/^\d{4}$/.test(tok)) return tok + '-01-01';
    if (/^\d{4}-\d{1,2}$/.test(tok)) {
      var p = tok.split('-');
      return p[0] + '-' + pad2_(p[1]) + '-01';
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(tok)) {
      var q = tok.split('-');
      return q[0] + '-' + pad2_(q[1]) + '-' + pad2_(q[2]);
    }
    return '';
  }
  function endOf(tok) {
    if (/^\d{4}$/.test(tok)) return tok + '-12-31';
    if (/^\d{4}-\d{1,2}$/.test(tok)) {
      var p = tok.split('-');
      var last = new Date(Number(p[0]), Number(p[1]), 0).getDate();   // 그 달의 마지막 날
      return p[0] + '-' + pad2_(p[1]) + '-' + pad2_(last);
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(tok)) {
      var q = tok.split('-');
      return q[0] + '-' + pad2_(q[1]) + '-' + pad2_(q[2]);
    }
    return '';
  }

  var parts = s.split(/[~\-–]{1}(?=\d{4})|~/);
  if (s.indexOf('~') >= 0) {
    var seg = s.split('~');
    var from = seg[0] ? startOf(seg[0]) : '';
    var to = seg[1] ? endOf(seg[1]) : '';
    if ((seg[0] && !from) || (seg[1] && !to)) return null;
    return { from: from, to: to,
             label: (seg[0] || '처음') + ' ~ ' + (seg[1] || '지금') };
  }
  var f = startOf(s), t = endOf(s);
  if (!f || !t) return null;
  return { from: f, to: t, label: s };
}

function repriceMenu() {
  // 리스팅과 환율이 없으면 계산 자체가 안 된다. 배송비 실측은 없어도 되지만
  // 있으면 w가 추정이 아니라 실측이 된다.
  ensureData_(['listing', 'fx'], ['invoice'], '리프라이싱');

  var p = repriceScopePreview_();
  var years = Object.keys(p.byYear).sort();
  var lines = [];
  for (var j = 0; j < years.length; j++) {
    var b = p.byYear[years[j]];
    lines.push('  ' + years[j] + '년 : ' + b.n + '건 · 평균 조정폭 ' +
               (b.sum / b.n * 100).toFixed(1) + '%' +
               (b.done ? '  (반영이력 ' + b.done + '건)' : ''));
  }

  var res = ui_().prompt('리프라이싱 대상 구간',
    '등록연도별 규모입니다. 오래된 등록분일수록 환율이 벌어져 조정폭이 큽니다.\n\n' +
    lines.join('\n') + '\n' +
    '  합계   : ' + p.all.n + '건 · 평균 조정폭 ' +
    (p.all.n ? (p.all.sum / p.all.n * 100).toFixed(1) : '0') + '%\n\n' +
    '대상 구간을 입력하세요. 아래 형식을 다 받습니다.\n' +
    '   2024              → 2024년 등록분만\n' +
    '   2024-07           → 2024년 7월만\n' +
    '   2024~2025         → 2024~2025년\n' +
    '   2024-07~2025-06   → 그 사이\n' +
    '   ~2023             → 2023년까지 전부\n' +
    '   2026~             → 2026년부터 전부\n' +
    '   빈칸 또는 0        → 전체',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var scope = parseScopeInput_(res.getResponseText());
  if (!scope) {
    ui_().alert('구간을 알아듣지 못했습니다',
      '입력: ' + res.getResponseText() + '\n\n' +
      '예: 2024 · 2024-07 · 2024~2025 · ~2023 · 2026~ · (빈칸=전체)',
      ui_().ButtonSet.OK);
    return;
  }

  var r = ui_().alert('리프라이싱 산출',
    '대상 구간: ' + scope.label + '\n\n' +
    '인하도 포함할까요?\n\n' +
    '[아니오] 인상만 — 권장. 인하는 실패 비용이 비대칭입니다\n' +
    '           (인상 실패 = 주문 감소 / 인하 실패 = 전 주문 즉시 손실)\n' +
    '[예]     인하 포함 — 환율이 유리해져 내릴 여지가 있을 때',
    ui_().ButtonSet.YES_NO_CANCEL);
  if (r === ui_().Button.CANCEL) return;
  return repriceRun_(r === ui_().Button.YES, scope.from, scope.to, scope.label);
}

// ── ↩ 되돌리기 (한 곳에서 분기) ──────────────────────────

function rollbackMenu() {
  var snaps = listSnapshots_();
  var r = ui_().alert('되돌리기',
    '보관된 스냅샷: ' + snaps.length + '개' +
    (snaps.length ? ' (최근 ' + snaps[snaps.length - 1].id + ')' : '') + '\n\n' +
    '[예]     API로 바로 되돌리기 — 특정 실행분을 아마존에 직접 원복합니다.\n' +
    '[아니오] 피드 파일만 만들기 — 셀러센트럴에 직접 올리고 싶을 때.',
    ui_().ButtonSet.YES_NO_CANCEL);
  if (r === ui_().Button.YES) return applyRollbackToAmazon();
  if (r !== ui_().Button.NO) return;

  var r2 = ui_().alert('피드 파일 만들기',
    '[예]     특정 실행분만 — 그 리프라이싱에서 바꾼 SKU만 원복.\n' +
    '           그 사이 다른 이유로 바꾼 가격은 건드리지 않아 더 안전합니다.\n' +
    '[아니오] 스냅샷 시점으로 전체 복원 — 뭘 건드렸는지 모를 때.',
    ui_().ButtonSet.YES_NO_CANCEL);
  if (r2 === ui_().Button.YES) return buildUndoFeedForRun();
  if (r2 === ui_().Button.NO) return buildRollbackFeed();
}

// ── 다음 할 일 안내 ──────────────────────────────────────

/** 시트 상태를 보고 다음에 눌러야 할 것을 문장으로 만든다 */
function nextActionText_() {
  function rows(name) {
    var sh = ss_().getSheetByName(name);
    return sh ? Math.max(sh.getLastRow() - 1, 0) : -1;
  }
  var props = PropertiesService.getScriptProperties();

  // 멈춰 있는 작업이 있으면 그게 최우선이다 — 새 일을 시작할 게 아니라 끝내야 한다
  if (props.getProperty(PROP_APPLY_AWAIT) === '1') {
    return '▶ 다음: [▶ 리프라이싱 → 진행상황] — 검증은 끝났고 실반영 승인만 남았습니다';
  }
  if (applyQueueRemaining_() > 0) {
    return '▶ 다음: [▶ 리프라이싱 → 진행상황] — 가격 반영이 진행 중입니다';
  }

  if (!props.getProperty(PROP_INVOICE_FOLDER)) {
    return '▶ 다음: [⚙ 설정 → 청구서 폴더 지정]';
  }
  if (rows(SHEET_FX) <= 0) return '▶ 다음: [🔄 데이터 갱신 → 환율·청구서·원가] — 환율이 비어 있습니다';
  if (rows(SHEET_LISTING) <= 0) return '▶ 다음: [🔄 데이터 갱신 → 아마존 동기화] — 리스팅이 비어 있습니다';
  if (rows(SHEET_OPENDATE) <= 0) return '▶ 다음: [🔄 데이터 갱신 → 아마존 동기화] — 등록일이 없으면 리프라이싱 불가';
  if (rows(SHEET_SHIPMENTS) <= 0) return '▶ 다음: [🔄 데이터 갱신 → 환율·청구서·원가] — 청구서가 적재되지 않았습니다';
  if (rows(SHEET_SKUCOST) <= 0) return '▶ 다음: [🔄 데이터 갱신 → 환율·청구서·원가] — SKU원가를 계산하세요';
  if (rows(SHEET_REPRICE) <= 0) return '▶ 다음: [▶ 리프라이싱 → ① 산출] — 준비가 끝났습니다';
  return '▶ 준비 완료. [▶ 리프라이싱 → ① 산출]로 가격을 검토하세요.';
}

/** 메뉴: 현재 상태 + 다음 할 일 */
function showStatus() {
  function mark(name) {
    var sh = ss_().getSheetByName(name);
    if (!sh) return '✗ 없음';
    var n = Math.max(sh.getLastRow() - 1, 0);
    return n === 0 ? '△ 비어 있음' : '✓ ' + n.toLocaleString() + '건';
  }
  var props = PropertiesService.getScriptProperties();
  var hr = null, rr = null;
  try { hr = fxHouseRate_(); } catch (e) {}
  try { rr = fxReceiveRate_(); } catch (e) {}

  var lines = [
    '환율           ' + mark(SHEET_FX),
    '리스팅         ' + mark(SHEET_LISTING),
    '등록일         ' + mark(SHEET_OPENDATE),
    '배송실적       ' + mark(SHEET_SHIPMENTS),
    '주문           ' + mark(SHEET_ORDERS),
    'SKU원가        ' + mark(SHEET_SKUCOST),
    '원가(수동입력) ' + mark(SHEET_COST),
    '가격변경대장   ' + mark(SHEET_PRICELOG),
    '',
    '사내환율 r1 (20일MA) : ' + (hr ? hr.toFixed(4) : '-'),
    '송금받을때 (권장가용) : ' + (rr ? rr.toFixed(2) : '-'),
    '청구서 폴더           : ' + (props.getProperty(PROP_INVOICE_FOLDER) ? '연결됨' : '미설정'),
    '실행 계정             : ' + Session.getEffectiveUser().getEmail(),
    '',
    nextActionText_()
  ];
  ui_().alert('가격관리 상태', lines.join('\n'), ui_().ButtonSet.OK);
}
