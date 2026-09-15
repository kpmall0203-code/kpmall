/** 메뉴, 업로드 다이얼로그, 시트 초기 설정, 자동조회 트리거 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('아마존 → KSE')
    .addItem('① 아마존 자료 올리기', '아마존자료_올리기')
    .addSeparator()
    .addItem('② 검사하기', '검사하기')
    .addSeparator()
    .addItem('③ KSE 배송등록', 'KSE_배송등록')
    .addSeparator()
    .addItem('근석이 시트 다운', '근석이_시트_다운')
    .addItem('shipnergy 다운', 'shipnergy_다운')
    .addItem('아마존 발송확인 파일 다운', '아마존_발송확인_다운')
    .addSeparator()
    .addSubMenu(ui.createMenu('정리')
      .addItem('한 번에 정리', '전체_정리')
      .addSeparator()
      .addItem('주문 정렬 (같은 상품끼리)', '주문_정렬')
      .addItem('오류확인 정렬 (오류 유형별)', '오류확인_정렬')
      .addItem('빈 행 제거', '빈행_제거')
      .addItem('번역 채우기 (빠진 상품명만)', '번역_채우기')
      .addItem('번호 서식 고치기 (우편번호·전화번호 0)', '번호_서식_고치기')
      .addSeparator()
      .addItem('비우기 (시트 골라서)', '비우기'))
    .addSubMenu(ui.createMenu('설정')
      .addItem('시트 초기 설정', '초기_설정')
      .addItem('KSE API 키 등록', 'KSE_API키_등록')
      .addItem('AI 키 점검', 'AI_키_점검')
      .addItem('AI 테스트 — 이름 판별 (샘플 5개)', 'AI_테스트')
      .addItem('AI 테스트 — 상품명 번역 (샘플 5개)', '번역_테스트')
      .addItem('30분마다 배송상태 자동조회 켜기', '트리거_설치')
      .addItem('자동조회 끄기', '트리거_해제')
      .addSeparator()
      .addItem('개별 검사 — 이름만', '검사_이름만')
      .addItem('개별 검사 — 주소만 (기관·배송대행지)', '검사_주소만')
      .addItem('개별 검사 — 전화번호만', '검사_전화만')
      .addItem('개별 검사 — 상품명만 (통관 금지)', '검사_상품명만')
      .addSeparator()
      .addItem('shipnergy 시트 열기', 'shipnergy_시트_열기')
      .addItem('금지 상품명 목록 열기', '금지상품명_목록_열기')
      .addItem('주소 낱말 목록 열기 (기관·배송대행지)', '주소낱말_목록_열기')
      .addItem('지정 상품명 목록 열기', '지정상품명_목록_열기')
      .addItem('번역사전 열기 (꼭 지킬 표기)', '번역사전_열기')
      .addItem('지정 상품명 다시 분류', '지정상품명_재분류'))
    .addSubMenu(ui.createMenu('점검')
      .addItem('배송상태 새로고침', 'KSE_배송상태_조회')
      .addItem('오류확인 → 주문으로 되돌리기', '오류확인_되돌리기')
      .addItem('완료 → 주문으로 되돌리기', '완료_되돌리기')
      .addItem('근석이 → 주문으로 되돌리기', '근석이_되돌리기')
      .addItem('shipnergy → 주문으로 되돌리기', 'shipnergy_되돌리기')
      .addItem('KSE 연결 테스트', 'KSE_연결테스트')
      .addItem('도움말', '도움말'))
    .addToUi();
}

// ── ① 업로드 다이얼로그 ─────────────────────────────────────────────────

function 아마존자료_올리기() {
  var html = HtmlService.createHtmlOutputFromFile('upload')
    .setWidth(480).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, '아마존 자료 올리기');
}

// ── 시트 초기 설정 ──────────────────────────────────────────────────────

function sheetOrCreate_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function setHeaders_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#efefef');
  sh.setFrozenRows(1);
}

function 초기_설정() {
  var ss = SpreadsheetApp.getActive();

  var orders = sheetOrCreate_(SHEET_ORDERS);
  if (orders.getMaxColumns() < COL_COUNT) {
    orders.insertColumnsAfter(orders.getMaxColumns(), COL_COUNT - orders.getMaxColumns());
  }
  setHeaders_(orders, HEADERS_ORDERS);
  orders.hideColumns(COL.RAW);
  orders.setColumnWidth(COL.ADDRESS, 280);
  orders.setColumnWidth(COL.SKU, 200);
  orders.setColumnWidth(COL.TITLE_EN, 240);
  orders.setColumnWidth(COL.TITLE_KSE, 320);
  orders.setColumnWidth(COL.NOTE, 240);

  var config = sheetOrCreate_(SHEET_CONFIG);
  setHeaders_(config, ['키', '값', '설명']);
  // 없는 키만 뒤에 덧붙인다 (기존 값은 건드리지 않는다)
  var haveKeys = {};
  if (config.getLastRow() > 1) {
    config.getRange(2, 1, config.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var k = String(r[0]).trim();
      if (k) haveKeys[k] = true;
    });
  }
  var missing = [];
  for (var key in DEFAULT_CONFIG) {
    if (!haveKeys[key]) missing.push([key, DEFAULT_CONFIG[key], CONFIG_DESC[key] || '']);
  }
  if (missing.length) {
    config.getRange(config.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  }
  config.setColumnWidth(2, 260);
  config.setColumnWidth(3, 480);

  errorSheet_();
  doneSheet_();
  pickSheet_();
  pickListSheet_();
  banListSheet_();
  addrWordSheet_();
  shipSheet_();

  var logSh = sheetOrCreate_(SHEET_LOG);
  setHeaders_(logSh, ['시각', '단계', '내용']);
  logSh.setColumnWidth(3, 700);

  // 비어 있는 기본 '시트1' 정리
  ['시트1', 'Sheet1'].forEach(function (name) {
    var s = ss.getSheetByName(name);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0 && s.getLastColumn() === 0) {
      ss.deleteSheet(s);
    }
  });

  _cfg = null;
  _addrWords = null;
  SpreadsheetApp.getUi().alert('시트를 준비했습니다.\n' +
    '주문 / 오류확인 / 근석이 / shipnergy / 지정상품명 / 금지상품명 / 주소낱말 / 완료 / 설정 / 로그\n' +
    '[지정상품명] 시트의 상품명 칸에 적어 넣으면 그 물건만 담긴 주문이 [근석이] 로 갑니다.\n' +
    '가격을 못 찾은 주문도 [오류확인] 으로 갑니다.\n' +
    '[금지상품명] 시트의 낱말이 상품명에 있으면 [오류확인] 으로 갑니다 (기본값 넣어둠).\n' +
    '([가격없음] 시트는 가격 못 찾은 행이 생길 때 만들어집니다)');
}

function KSE_API키_등록() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('KSE API 키',
    'KSE OMS [Developer > KSE API] 에서 발급받은 키를 붙여넣으세요.\n' +
    '(비워두고 확인하면 코드에 들어 있는 기본 키를 씁니다)', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var key = res.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  if (key) {
    props.setProperty('KSE_API_KEY', key);
    ui.alert('KSE API 키를 저장했습니다.');
  } else {
    props.deleteProperty('KSE_API_KEY');
    ui.alert('스크립트 속성의 키를 지웠습니다. 코드의 기본 키를 사용합니다.');
  }
}

// ── 자동 조회 트리거 ────────────────────────────────────────────────────
//
// KSE 배송상태는 30분 간격으로 갱신되므로 접수해 둔 건을 주기적으로 갱신한다.
// 배송등록(③)만 사람이 확인한다. 송장번호가 채워지면 완료 처리는 저절로 된다.

function 배송상태_자동조회() {
  var targets = 조회대상_();
  if (!targets.length) return;
  var r = 배송상태_갱신_(targets);
  // 송장번호가 채워진 건은 여기서 바로 완료 처리한다 (③ 버튼을 없앴다)
  var done = r.got ? 완료_처리_() : 0;
  if (r.got || r.updated || done) {
    log_('자동조회', '배송상태 갱신 ' + r.updated + '건 / 송장번호 신규 ' + r.got +
      '건 / 완료 이관 ' + done + '건');
  }
}

function 트리거_설치() {
  트리거_해제();
  ScriptApp.newTrigger('배송상태_자동조회').timeBased().everyMinutes(30).create();
  log_('트리거', '30분 주기 설치');
  SpreadsheetApp.getUi().alert('30분마다 배송상태를 자동으로 조회합니다.\n' +
    '(배송등록만 확인이 필요해서 자동화하지 않습니다)');
}

function 트리거_해제() {
  var ts = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === '배송상태_자동조회') {
      ScriptApp.deleteTrigger(ts[i]);
      n++;
    }
  }
  if (n) log_('트리거', '해제 ' + n + '건');
}

/** 사람이 확인·수정한 [오류확인] 건을 [주문]으로 되돌린다. */
function 오류확인_되돌리기() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('오류확인 → 주문으로 되돌리기',
    '되돌릴 대표주문번호를 콤마로 구분해 적어주세요.\n예: 250-5587398-0612618',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var ids = res.getResponseText().split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; });
  if (!ids.length) return;

  var r = restoreFromError_(ids);
  var n = r.n;
  log_('되돌리기', '오류확인 → 주문 ' + n + '건 (' + ids.join(', ') + ')' +
    (r.pick ? ' / 지정 상품명 ' + r.pick + '건은 [' + SHEET_PICK + '] 으로' : ''));
  if (!n) {
    ui.alert('[' + SHEET_ERROR + '] 시트에서 해당 주문번호를 찾지 못했습니다.');
    return;
  }
  ui.alert(n + '건을 [' + SHEET_ORDERS + '] 시트로 되돌렸습니다.' +
    (r.pick ? '\n\n그중 ' + r.pick + '건은 물건이 전부 지정 상품명이라 [' +
      SHEET_PICK + '] 시트로 보냈습니다.' : ''));
}

/** KSE 접수가 잘못됐을 때, [완료]로 옮긴 건을 [주문]으로 되돌린다. */
function 완료_되돌리기() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('완료 → 주문으로 되돌리기',
    '되돌릴 대표주문번호를 콤마로 구분해 적어주세요.\n예: 250-5587398-0612618',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var ids = res.getResponseText().split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x; });
  if (!ids.length) return;

  var n = restoreFromDone_(ids);
  log_('되돌리기', n + '건 (' + ids.join(', ') + ')');
  ui.alert(n ? n + '건을 [' + SHEET_ORDERS + '] 시트로 되돌렸습니다.'
             : '[' + SHEET_DONE + '] 시트에서 해당 주문번호를 찾지 못했습니다.');
}

// ── 도움말 ──────────────────────────────────────────────────────────────

function 도움말() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font:13px/1.75 -apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;padding:6px">' +
    '<p><b>① 아마존 자료 올리기</b><br>리포트 파일을 그냥 올리면 됩니다 — ' +
    '<code>item-price</code> 가 있는 파일을 가격자료로 알아서 잡고, ' +
    '<code>order-item-id</code> 로 병합합니다. 주문·가격을 구분해 고를 필요가 없고, ' +
    '한 파일에 둘 다 있으면 그것만 올려도 됩니다. ' +
    '가격을 못 찾은 주문은 [오류확인] 시트로 갑니다 — 배송지가 같으면 한 박스이므로 ' +
    '같이 묶인 나머지 상품도 함께 갑니다.</p>' +
    '<p><b>배송지가 같으면 한 박스</b><br>수취인 이름과 주소(우편번호 포함)가 같은 주문은 ' +
    '한 박스로 묶어 배송료를 줄입니다. [주문] 시트 1행 = KSE 접수 1건이고, ' +
    '개별 주문번호는 주문번호목록 칸과 KSE의 상품별 주문번호에 들어갑니다.</p>' +
    '<p><b>② 검사하기</b><br>이름 → 주소 → 전화번호 → 상품명(통관 금지)을 순서대로 검사합니다. ' +
    '걸린 건은 [오류확인] 시트로 옮기고, <span style="background:#f4c7c3">진한 빨강</span>은 ' +
    '<b>아님</b>(확정된 결함), <span style="background:#fff2cc">노랑</span>은 ' +
    '<b>애매</b>(사람이 판단)입니다. 주소에서 걸린 회사·관공서 키워드는 그 글자만 ' +
    '굵은 빨강으로 칠합니다. 하나만 다시 보려면 설정의 개별 검사를 쓰세요.</p>' +
    '<p style="color:#666"><b>[주소낱말]</b> 시트에 주소·이름 검사가 쓰는 낱말이 모두 들어 ' +
    '있습니다 (기관·법인, 배송대행지, 이름 칸 낱말). 줄을 더하면 걸리고 지우면 안 걸립니다. ' +
    '너무 자주 걸리는 낱말은 판정을 <b>애매</b>로 바꾸면 [오류확인] 으로 빼지 않고 ' +
    '노란색 표시만 합니다. 메뉴는 <b>설정 > 주소 낱말 목록 열기</b>.</p>' +
    '<p><b>③ KSE 배송등록</b><br>실제 국제배송 접수입니다. 박스·주문 건수를 보여주고 ' +
    '확인을 받은 뒤 접수하며, KSE 접수번호와 송장번호를 바로 이어서 받아옵니다.<br>' +
    '시트에서 손으로 고친 값(수취인·전화번호·주소·수량·단가·상품명·무게)이 그대로 접수됩니다. ' +
    '상품이 여러 개인 박스는 <b>줄 수를 상품 수와 맞춰</b>야 합니다 — 줄 수가 다르면 어느 ' +
    '상품의 값인지 알 수 없어 그 건은 보내지 않고 비고에 사유를 적습니다.<br>' +
    '송장번호까지 받은 건은 <b>자동으로 [완료] 시트로</b> 넘어갑니다 (완료 처리 버튼은 없앴습니다). ' +
    '송장번호가 늦게 나오는 건은 자동조회가 채우면서 그때 완료 처리됩니다.</p>' +
    '<hr>' +
    '<p style="color:#666">접수 직후 송장번호가 안 나오는 건도 있습니다. KSE가 30분 주기로 ' +
    '상태를 갱신하므로 <b>설정 > 자동조회 켜기</b>를 켜두거나 ' +
    '<b>점검 > 배송상태 새로고침</b>을 누르면 채워집니다.</p>' +
    '<p><b>아마존 발송확인 파일 다운</b><br>추적번호로 <b>KSE 접수번호(K…)</b> 를 넣습니다 — ' +
    '일본 국내 배송사와 국내 송장번호는 쓰지 않습니다. KSE가 내려주는 파일을 그대로 올리면 ' +
    '<b>합배송 주문이 완료 처리되지 않습니다</b> — 그 파일에는 대표주문번호만 있어서 함께 ' +
    '묶인 나머지 주문이 미발송으로 남습니다. 이 버튼은 박스를 주문상품 단위로 다시 펼쳐 ' +
    '같은 접수번호를 각 줄에 붙여 줍니다. 접수번호는 ③을 실행한 직후에 받으므로 송장번호를 ' +
    '기다릴 필요가 없습니다. [완료] 로 넘어간 건도 최근 것은 함께 들어갑니다 ' +
    '([설정] 발송확인_완료조회일수, 기본 2일). 셀러센트럴 出荷通知の一括アップロード 에 올리세요.</p>' +
    '<p style="color:#666"><b>붉게 칠한 칸</b>은 손으로 채워야 하는 KSE 필수값입니다 ' +
    '(수취인·우편번호·주소·전화번호). 아마존이 리포트에서 특정 이름을 걸러내는 경우가 있어 ' +
    '수취인이 비는 주문이 나옵니다. 필수값이 빈 주문은 [오류확인] 으로 보내니, ' +
    'Seller Central 주문 상세에서 확인해 채운 뒤 <b>점검 > 오류확인 → 주문으로 되돌리기</b> ' +
    '로 되돌리고 ③을 실행하세요.</p>' +
    '<p style="color:#666">[오류확인] 은 <b>이름 → 주소 → 전화번호 → 가격</b> 순으로 모아 ' +
    '놓습니다. 오류가 2종 이상인 행은 그 유형 그룹의 끝에 붙입니다. ' +
    '직접 다시 모으려면 <b>점검 > 오류확인 정렬</b>.</p>' +
    '<p><b>shipnergy 다운</b><br>[shipnergy] 시트로 옮겨 둔 주문을 Shipnergy 업로드 ' +
    '양식(34컬럼 xlsx)으로 내려줍니다. [shipnergy] 시트는 [주문] 과 같은 칸 구성이라 ' +
    '행을 그대로 복사·이동하면 되고, 양식 변환은 내려받을 때만 합니다. ' +
    'Shipnergy 는 주문번호(order-id)가 같은 줄만 한 건으로 합치므로, 주문번호가 다른 ' +
    '합배송 박스는 따로 올라갑니다 (다이얼로그가 몇 건인지 알려줍니다).</p>' +
    '<p style="color:#666"><b>[지정상품명]</b> 시트 상품명 칸에 적어 넣으면, ' +
    '그 물건<b>만</b> 담긴 박스가 [근석이] 시트로 갑니다. 목록에 있는 물건과 없는 물건이 ' +
    '한 박스에 섞이면 박스를 쪼갤 수 없으므로 [주문] 에 그대로 남깁니다. ' +
    '목록을 나중에 적었으면 <b>설정 > 지정 상품명 다시 분류</b>를 누르세요.</p>' +
    '<p style="color:#666">합계금액이 [설정]의 <b>관세임계값</b>(16,000엔) 이상이면 ' +
    '관세 신고 대상이라 합계 칸을 붉게 칠하고 [오류확인] 으로 보냅니다 — 같은 배송지로 ' +
    '묶인 박스는 한 행이므로 나머지 물건도 함께 빠집니다. 지정 상품명이어도 ' +
    '관세 대상이 먼저입니다.</p>' +
    '<p style="color:#666">무게·HS코드·원산지는 [설정]의 기본값으로 나갑니다 ' +
    '(물류센터 입고 시 재측정).</p>' +
    '<p style="color:#666"><b>단가</b>는 아마존 <code>item-price</code>(줄 합계)를 수량으로 나눈 ' +
    '1개 단가로 보냅니다. 리포트가 이미 단가를 주는 경우 [설정]의 단가기준을 ' +
    "'그대로'로 바꾸세요.</p>" +
    '</div>')
    .setWidth(560).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '사용 방법');
}
