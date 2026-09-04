/**
 * 10_메뉴.gs — 시트 메뉴 및 자동 갱신 트리거
 */

function onOpen() {
  ui_().createMenu('사입도우미')
    .addItem('① SP-API 자격증명 설정', 'setupCredentials')
    .addItem('② 상품목록 갱신 (SP-API)', 'updateListings')
    .addItem('③ 한글 번역 시작', 'translatePending')
    .addSeparator()
    .addItem('Gemini API 키 설정', 'setupGeminiKey')
    .addItem('번역 진행 상황', 'translationStatus')
    .addItem('번역 중단', 'stopTranslation')
    .addItem('웹앱 공유 토큰 보기', 'setupShareToken')
    .addSeparator()
    .addItem('자동 갱신 켜기 (매일)', 'enableDailyTriggers')
    .addItem('자동 갱신 끄기', 'disableDailyTriggers')
    .addToUi();

  buildPriceMenu_();
}

/**
 * 가격관리 메뉴.
 *
 * 기능이 아니라 '하려는 일' 단위로 묶는다. 예전엔 실행 순서대로 ①②③④를
 * 최상위에 늘어놓았는데, 기능이 줄고 나니 그 번호가 오히려 방해가 됐다 —
 * 리프라이싱 한 번 하려면 위아래로 흩어진 버튼을 찾아다녀야 했다.
 *
 * 이제 하나의 일은 하나의 묶음 안에서 끝난다:
 *   ▶ 리프라이싱 — 산출부터 되돌리기·진행상황까지
 *   📣 광고      — 기준·계산·생성·켜기·검색어. 위에서 아래가 곧 순서
 *   📊 분석      — 보는 것 전부
 *   🔄 데이터    — 채우는 것 전부 (광고 자료는 📣 광고 안에)
 *   ⚙ 설정      — 처음에 한 번, 그리고 가끔
 *
 * 뭘 눌러야 할지 모르면 맨 위 [현재 상태]가 다음 할 일을 직접 알려준다.
 */
function buildPriceMenu_() {
  var ui = ui_();
  ui.createMenu('가격관리')
    .addItem('현재 상태 · 다음 할 일', 'showStatus')
    .addItem('지금 무엇이 도는가 · 멈추기', 'collectStatus')
    .addItem('📖 설명서 (이게 다 뭐야)', 'showManual')
    .addSeparator()

    .addSubMenu(ui.createMenu('▶ 리프라이싱')
      .addItem('① 산출 (구간 지정)', 'repriceMenu')
      .addItem('② 승인분 아마존 반영', 'applyPricesToAmazon')
      .addItem('③ 반영 확인', 'verifyAppliedPrices')
      .addSeparator()
      .addItem('↩ 되돌리기', 'rollbackMenu')
      .addItem('진행상황 / 중단', 'applyStatus')
      .addItem('실패분 재시도', 'retryFailedApplies')
      .addSeparator()
      .addItem('선택 SKU 제외', 'excludeSelectedSku')
      .addItem('승인분 피드 파일만 생성', 'buildPriceFeed')
      .addSeparator()
      .addItem('냉장해제 가격 조정', 'proposeCoolPriceCuts'))

    /**
     * 광고는 한 묶음으로 뺀다. 열다섯 개가 [분석] 안에 한 줄로 늘어져 있어
     * 무엇을 먼저 눌러야 하는지 보이지 않았다. 여기서는 위에서 아래로 읽으면
     * 그것이 곧 순서다:
     *   ①~⑤  기준 → 계산 → 계획 → 승인 → 생성      (트랙 A 를 처음 깔 때)
     *   켜기·맞추기·멈추기                          (돈이 나가는 스위치)
     *   검색어 수집 → 승인 → 반영                   (매주)
     *   입찰 반영 · 점검 · 보관                      (가끔)
     * 자료 받기와 진단은 접어 둔다 — 늘 쓰는 것이 아니다.
     */
    .addSubMenu(ui.createMenu('📣 광고')
      .addItem('① 광고 기준 설정 (마진율 · 목표 ACOS)', 'setupAdBasis')
      .addItem('② 광고 재배분 계산 (SKU 채산성)', 'analyzeAdReallocation')
      .addItem('③ 캠페인 생성 계획', 'planAdCampaigns')
      .addItem('④ 계획 전부 승인 (주의: 전 줄 체크)', 'approveAllPlan')
      .addItem('⑤ 승인분 캠페인 생성', 'executeAdPlan')
      .addSeparator()
      .addItem('캠페인 켜기 (승인 ✓ 만)', 'enableApprovedCampaigns')
      .addItem('캠페인 승인대로 맞추기 (미승인은 끔)', 'syncCampaignsToApproval')
      .addItem('캠페인 전부 멈추기', 'pauseAllCampaigns')
      .addSeparator()
      .addItem('검색어 수집 (자동 캠페인)', 'fetchAdSearchTerms')
      .addItem('검색어 판정 승인', 'approveAdTerms')
      .addItem('검색어 승인분 반영 (키워드 올림 · 막음)', 'applyAdTerms')
      .addSeparator()
      .addItem('승인분 입찰 반영', 'applyApprovedBids')
      .addItem('캠페인 점검 · 정리 후보', 'reviewAdCampaigns')
      .addItem('승인한 캠페인 보관 (되돌릴 수 없음)', 'archiveApprovedCampaigns')
      .addSeparator()
      .addSubMenu(ui.createMenu('📥 자료 받기')
        .addItem('광고 구조 수집 (캠페인 · 광고그룹 · 키워드)', 'fetchAdStructure')
        .addItem('광고비 수집 (SKU 골라서)', 'fetchAdsSpend')
        .addItem('키워드 실적 수집 (주 단위)', 'fetchAdKeywords'))
      .addSubMenu(ui.createMenu('🔧 진단')
        .addItem('광고 쓰기 권한 진단', 'diagnoseAdsWrite')
        .addItem('켜기 · 멈추기 한 개 실험', 'testCampaignToggle')
        .addItem('광고 프로필 다시 찾기', 'adsPickProfile')))

    .addSubMenu(ui.createMenu('📊 분석')
      .addItem('매출 기여도 · 추세', 'analyzeMarginShare')
      .addItem('SKU 추적 (일별 판매·가격)', 'trackSku')
      .addItem('계절성 (언제 팔리나 · 언제 사올까)', 'analyzeSeasonality')
      .addSeparator()
      .addItem('TACOS · 광고 효율', 'analyzeTacos')
      .addItem('카트박스 손실', 'analyzeBuyBox')
      .addSeparator()
      .addSubMenu(ui.createMenu('📦 배송비 · 원가')
        .addItem('배송비 과다 SKU (비율 높은 순)', 'shipHeavyReport')
        .addItem('포장 절감 후보', 'packagingSavings')
        .addSeparator()
        .addItem('배송비 조회 — 붙여넣은 SKU', 'fillShipLookup')
        .addItem('배송비 조회 — 파일 (엑셀/CSV)', 'lookupShippingFromFile')
        .addSeparator()
        .addItem('청구서 월간 검증', 'verifyInvoices')
        .addItem('수익성 분석 (원가 입력분)', 'analyzeProfitability')
        .addItem('원가 입력 대상 채우기 (판매량 상위)', 'fillTopSkusForCost')))

    .addSubMenu(ui.createMenu('🔄 데이터 갱신')
      .addItem('환율·청구서·원가', 'refreshData')
      .addItem('아마존 동기화 (리스팅·등록일)', 'syncAmazon')
      .addSeparator()
      .addItem('판매실적 수집 (기간 합계)', 'fetchSalesReport')
      .addItem('일별 SKU 판매 수집', 'fetchSalesDaily')
      .addItem('주문 수집 (청구서↔SKU)', 'fetchOrdersReport'))

    .addSubMenu(ui.createMenu('⚙ 설정')
      .addItem('처음 설정 (최초 1회)', 'setupAll')
      .addItem('탭 정리 (작업별 보기)', 'organizeSheets')
      .addSeparator()

      .addSubMenu(ui.createMenu('🔑 연결 · 자격증명')
        .addItem('① SP-API 자격증명', 'setupCredentials')
        .addItem('② 판매자 토큰 (가격 반영용)', 'setupSellerId')
        .addItem('SP-API 권한 진단', 'diagnoseSalesPermission')
        .addSeparator()
        .addItem('광고 API 자격증명 (SP-API와 별도)', 'setupAdsCredentials')
        .addSeparator()
        .addItem('청구서 폴더 지정', 'setupInvoiceFolder')
        .addItem('청구서 폴더 진단', 'diagnoseInvoiceFolder')
        .addItem('알림 메일 주소', 'setupAlertEmail'))

      .addSubMenu(ui.createMenu('🗂 자료 관리')
        .addItem('중복 점검 · 정리', 'checkDuplicates')
        .addItem('속도 진단 (무엇이 느린가)', 'diagnoseSpeed')
        .addItem('셀 여유 확보 (한도 1,000만)', 'trimWorkbook')
        .addSeparator()
        .addItem('주문 보관 정리 (기간 지정)', 'pruneOrdersMenu')
        .addItem('광고 보관 정리 (기간 지정)', 'pruneAdsMenu')
        .addItem('주문 수집 기록 지우기', 'ordersReportResetDone')
        .addSeparator()
        .addItem('냉장 SKU 목록 만들기', 'buildCoolSwitchSheet')
        .addItem('냉장전환 적용', 'applyCoolSwitch')
        .addItem('냉장전환 되돌리기', 'rollbackCoolSwitch')
        .addSeparator()
        .addItem('요율표 초기화', 'ensureRateCard'))

      .addSubMenu(ui.createMenu('⏱ 자동화')
        .addItem('자동화 설정 적용', 'applyAutomationSettings')
        .addItem('자동화 실행 상태 (예약된 정기 작업)', 'lockStatus'))

      .addSeparator()
      .addItem('스냅샷 목록', 'showSnapshots')
      .addItem('숨긴 시트 모두 보이기', 'showHiddenSheets'))
    .addToUi();
}

/**
 * LWA 자격증명을 Script Properties에 저장 (시트에는 남기지 않는다).
 *
 * 세 칸 모두 '비워두면 그대로 유지'다. 앱에 역할을 추가하면 Refresh Token만
 * 새로 받는데, 그때 잘 돌던 Client ID/Secret까지 다시 타이핑하다 오타로
 * 전체를 망가뜨리는 일이 생긴다. 바꿀 것만 바꾸게 한다.
 */
function setupCredentials() {
  var ui = ui_();
  var props = PropertiesService.getScriptProperties();
  var cur = {
    id: props.getProperty(PROP_LWA_ID) || '',
    secret: props.getProperty(PROP_LWA_SECRET) || '',
    refresh: props.getProperty(PROP_LWA_REFRESH) || ''
  };
  var has = cur.id && cur.secret && cur.refresh;
  var tail = function (v) { return v ? '현재: …' + v.slice(-8) + '\n(비워두고 확인 = 그대로 유지)' : ''; };

  var a = ui.prompt('SP-API 자격증명 1/3 — Client ID',
    'amzn1.application-oa2-client....\n\n' + tail(cur.id), ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var b = ui.prompt('SP-API 자격증명 2/3 — Client Secret',
    'amzn1.oa2-cs.v1....\n\n' + tail(cur.secret), ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  var c = ui.prompt('SP-API 자격증명 3/3 — Refresh Token',
    'Atzr|....\n\n' +
    '※ 앱에 역할(예: Brand Analytics)을 추가했다면\n' +
    '   재승인해서 받은 새 토큰을 여기에 넣으세요.\n' +
    '   역할만 추가하고 토큰을 그대로 두면 계속 403입니다.\n\n' + tail(cur.refresh),
    ui.ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui.Button.OK) return;

  var nid = a.getResponseText().trim() || cur.id;
  var nsecret = b.getResponseText().trim() || cur.secret;
  var nrefresh = c.getResponseText().trim() || cur.refresh;
  if (!nid || !nsecret || !nrefresh) {
    ui.alert('세 값이 모두 있어야 합니다.\n(처음 설정이라면 빈칸으로 둘 수 없습니다)');
    return;
  }
  var changed = [];
  if (nid !== cur.id) changed.push('Client ID');
  if (nsecret !== cur.secret) changed.push('Client Secret');
  if (nrefresh !== cur.refresh) changed.push('Refresh Token');
  if (!changed.length) { ui.alert('바뀐 값이 없습니다.'); return; }

  props.setProperty(PROP_LWA_ID, nid);
  props.setProperty(PROP_LWA_SECRET, nsecret);
  props.setProperty(PROP_LWA_REFRESH, nrefresh);

  try {
    getLwaToken_();

    // 토큰이 유효한 것과 '새 역할이 붙었는가'는 다른 문제다.
    // 역할을 추가하고 재승인한 직후라면 그걸 확인하러 온 것이므로 바로 재본다.
    var extra = '';
    if (changed.indexOf('Refresh Token') >= 0) {
      extra = '\n\n' + probeRoles_();
    }
    ui.alert('저장 완료 — 바꾼 값: ' + changed.join(', ') + '\n\n' +
             '토큰 발급을 확인했습니다.' + extra +
             (has ? '' : '\n\n다음: [② 상품목록 갱신]을 실행하세요.'));
  } catch (e) {
    // 되돌린다 — 잘 돌던 자격증명을 못 쓰게 만드는 게 최악이다
    if (has) {
      props.setProperty(PROP_LWA_ID, cur.id);
      props.setProperty(PROP_LWA_SECRET, cur.secret);
      props.setProperty(PROP_LWA_REFRESH, cur.refresh);
    }
    ui.alert('토큰 발급에 실패해 ' + (has ? '이전 값으로 되돌렸습니다' : '저장하지 못했습니다') +
             ':\n\n' + e.message);
  }
}

/**
 * 새 토큰에 어떤 역할이 실제로 붙어 있는지 가볍게 확인한다.
 *
 * 역할은 '토큰이 발급되는 순간'의 것으로 굳는다. 역할을 추가한 뒤 재승인을
 * 안 했거나, 저장보다 먼저 토큰을 뽑았으면 옛 권한 그대로다.
 * 그걸 나중에 다른 기능에서 403으로 만나느니 여기서 바로 알려준다.
 */
function probeRoles_() {
  var token;
  try { token = getLwaToken_(); } catch (e) { return '(권한 확인 실패: ' + e.message + ')'; }

  var checks = [
    { name: '상품 리스팅', path: '/reports/2021-06-30/reports?reportTypes=' + REPORT_TYPE + '&pageSize=1' },
    { name: '주문 추적', path: '/orders/v0/orders?MarketplaceIds=' + MARKETPLACE_JP +
        '&CreatedAfter=' + Utilities.formatDate(new Date(Date.now() - 86400000), 'UTC',
                                                "yyyy-MM-dd'T'HH:mm:ss'Z'") + '&MaxResultsPerPage=1' }
  ];
  var lines = [];
  for (var i = 0; i < checks.length; i++) {
    try {
      spapi_(token, 'get', checks[i].path);
      lines.push('  ✅ ' + checks[i].name);
    } catch (e2) {
      lines.push('  ❌ ' + checks[i].name);
    }
  }

  // 브랜드 분석은 조회로는 못 본다 — 리포트를 실제로 요청해야 판별된다
  var ba;
  try {
    var y = Utilities.formatDate(new Date(Date.now() - 2 * 86400000), 'UTC', 'yyyy-MM-dd');
    spapi_(token, 'post', '/reports/2021-06-30/reports', {
      reportType: SALES_REPORT_TYPE,
      marketplaceIds: [MARKETPLACE_JP],
      dataStartTime: y + 'T00:00:00Z',
      dataEndTime: y + 'T23:59:59Z',
      reportOptions: { dateGranularity: 'DAY', asinGranularity: 'SKU' }
    });
    ba = '  ✅ 브랜드 분석 — 판매실적을 받을 수 있습니다';
  } catch (e3) {
    ba = isRateLimited_(e3)
      ? '  ⏳ 브랜드 분석 — 호출 제한(5분 3회)이라 지금은 판단 불가'
      : '  ❌ 브랜드 분석 — 아직 안 붙었습니다\n' +
        '     역할 저장 → 재승인 → 새 토큰 순서인지 확인하세요.\n' +
        '     저장보다 먼저 뽑은 토큰에는 역할이 안 담깁니다.';
  }
  lines.push(ba);
  return '이 토큰에 실제로 붙어 있는 권한:\n' + lines.join('\n');
}

/** Gemini API 키 저장 — 저장 직후 실제 호출로 동작을 확인한다 */
function setupGeminiKey() {
  var ui = ui_();
  var props = PropertiesService.getScriptProperties();
  var cur = props.getProperty(PROP_GEMINI_KEY);
  var res = ui.prompt(
    'Gemini API 키',
    'aistudio.google.com 에서 발급한 키를 입력하세요.' +
      (cur ? '\n\n(현재 등록됨: …' + cur.slice(-6) + ')' : ''),
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (!key) {
    props.deleteProperty(PROP_GEMINI_KEY);
    ui.alert('키를 지웠습니다. 번역은 LanguageApp으로 처리됩니다.');
    return;
  }
  props.setProperty(PROP_GEMINI_KEY, key);

  var test = geminiCall_(key, ['ククダス ウベエディション 菓子 289g', '蔘鶏湯用材料 70g']);
  if (test) {
    ui.alert('저장 완료. 테스트 번역이 정상 동작합니다.\n\n' +
             '  ククダス… → ' + test[0] + '\n' +
             '  蔘鶏湯用材料… → ' + test[1] + '\n\n' +
             '다음: [③ 한글 번역 시작]');
  } else {
    ui.alert('저장은 했지만 테스트 호출에 실패했습니다.\n' +
             '키가 맞는지, Generative Language API가 사용 설정됐는지 확인하세요.\n' +
             '자세한 오류는 "로그" 탭에 남습니다.');
  }
}

/** 매일 자동: 새벽에 리스팅 갱신, 이후 시간대에 번역 이어하기 */
function enableDailyTriggers() {
  disableDailyTriggers();
  ScriptApp.newTrigger('scheduledUpdate').timeBased().atHour(4).everyDays(1).create();
  ScriptApp.newTrigger('scheduledTranslate').timeBased().atHour(5).everyDays(1).create();
  // 한 번에 못 끝내면 번역 쪽에서 1분 뒤 이어실행 트리거를 스스로 건다.
  // LanguageApp(키 없음)으로 도는 경우를 대비해 낮 시간대에도 한 번 더 시도한다.
  ScriptApp.newTrigger('scheduledTranslate').timeBased().atHour(14).everyDays(1).create();
  ui_().alert('자동 갱신을 켰습니다.\n\n' +
              '· 매일 04시: 상품목록 갱신 (SP-API)\n' +
              '· 매일 05시/14시: 신규 상품 번역\n\n' +
              '한 번에 안 끝나면 1분 간격으로 알아서 이어서 처리합니다.');
}

function disableDailyTriggers() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    var fn = ts[i].getHandlerFunction();
    if (fn === 'scheduledUpdate' || fn === 'scheduledTranslate' || fn === CONTINUE_HANDLER) {
      ScriptApp.deleteTrigger(ts[i]);
    }
  }
}

/** 트리거용: 리스팅 갱신 (실패해도 로그만 남기고 조용히 넘어간다) */
function scheduledUpdate() {
  // 가격관리 쪽 작업과 같은 '리스팅' 탭을 쓰므로 잠금을 공유한다
  withLock_('리스팅 자동갱신', function () {
    try {
      updateListingsSilent_();
    } catch (e) {
      log_('spapi', 'ERROR', String(e));
    }
  });
}

function updateListingsSilent_() {
  var t0 = Date.now();
  var token = getLwaToken_();
  var created = spapi_(token, 'post', '/reports/2021-06-30/reports', {
    reportType: REPORT_TYPE,
    marketplaceIds: [MARKETPLACE_JP]
  });
  var docId = null;
  while (Date.now() - t0 < 4 * 60 * 1000) {
    Utilities.sleep(10000);
    var info = spapi_(token, 'get', '/reports/2021-06-30/reports/' + created.reportId);
    if (info.processingStatus === 'DONE') { docId = info.reportDocumentId; break; }
    if (info.processingStatus === 'FATAL' || info.processingStatus === 'CANCELLED') {
      throw new Error('리포트 처리 실패: ' + info.processingStatus);
    }
  }
  if (!docId) throw new Error('리포트 시간 초과');

  var doc = spapi_(token, 'get', '/reports/2021-06-30/documents/' + docId);
  var blob = UrlFetchApp.fetch(doc.url, { muteHttpExceptions: true }).getBlob();
  var text = (doc.compressionAlgorithm === 'GZIP')
    ? Utilities.ungzip(blob.setContentType('application/x-gzip')).getDataAsString('UTF-8')
    : blob.getDataAsString('UTF-8');

  var items = parseListingReport_(text);
  if (items.length) {
    writeListings_(items);
    log_('spapi', 'INFO', '자동 갱신 ' + items.length + '건');
  }
}
