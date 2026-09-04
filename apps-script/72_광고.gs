/**
 * 72_광고.gs — Amazon Ads API로 광고비를 받아 TACOS를 낸다
 *
 * ── SP-API와 완전히 다른 API다 ──────────────────────────
 * 자격증명도, 승인도, 접속 주소도, 토큰 발급처까지 따로다.
 * SP-API 키로는 광고 자료를 하나도 못 본다.
 *   접속 주소  advertising-api-fe.amazon.com   (일본은 극동)
 *   토큰       api.amazon.co.jp                (SP-API의 api.amazon.com 이 아니다)
 *   머리글     Amazon-Advertising-API-ClientId / -Scope(프로필 ID) / Authorization
 *
 * ── 왜 ROAS가 아니라 TACOS인가 ─────────────────────────
 *   ROAS  = 광고로 판 매출 ÷ 광고비
 *   TACOS = 광고비 ÷ 전체 매출 (자연 유입 포함)
 * ROAS가 좋아도 광고 없이 팔리던 것을 광고로 산 것뿐일 수 있다.
 * 전체 매출 대비로 봐야 '광고를 늘려서 장사가 커졌는가'를 알 수 있다.
 * 전체 매출은 이미 판매실적에 있으니, 여기서 받을 것은 광고비 하나다.
 *
 * ── 프로필 ID ───────────────────────────────────────────
 * Ads API는 계정이 아니라 '프로필' 단위로 움직인다. 한 계정이 나라마다 프로필을 갖고,
 * 요청마다 어느 프로필인지 -Scope 머리글로 알려줘야 한다.
 * /v2/profiles 로 목록을 받아 일본(JP) 것을 골라 저장해 둔다.
 */

var ADS_HOST = 'advertising-api-fe.amazon.com';     // 극동 (JP/AU/SG)
var ADS_COUNTRY = 'JP';

/**
 * 토큰 발급처가 SP-API와 다르다.
 *
 * SP-API는 api.amazon.com 을 쓰지만, 광고 FE 리전은 인가를 apac.account.amazon.com 에서
 * 받고 토큰을 api.amazon.co.jp 에서 교환한다. 거기서 나온 리프레시 토큰은
 * 같은 일본 엔드포인트에서만 갱신된다 — api.amazon.com 으로 부르면 거절당한다.
 */
var ADS_TOKEN_URL = 'https://api.amazon.co.jp/auth/o2/token';

var PROP_ADS_CLIENT = 'ADS_CLIENT_ID';
var PROP_ADS_SECRET = 'ADS_CLIENT_SECRET';
var PROP_ADS_REFRESH = 'ADS_REFRESH_TOKEN';
var PROP_ADS_PROFILE = 'ADS_PROFILE_ID';

var SHEET_ADS = '광고실적';
var ADS_HEADER = ['날짜', 'SKU', 'ASIN', '캠페인', '광고비(JPY)', '광고매출(JPY)',
                  '노출', '클릭', '광고주문', '수집일시'];
var AD_DATE = 0, AD_SKU = 1, AD_ASIN = 2, AD_CAMP = 3, AD_COST = 4, AD_SALES = 5,
    AD_IMPR = 6, AD_CLICK = 7, AD_ORD = 8, AD_AT = 9;

// 하루치 계정 전체 합계. 추적 SKU만 남겨도 계정 TACOS는 맞아야 한다.
var SHEET_ADSDAY = '광고일계';
var ADSDAY_HEADER = ['날짜', '광고비(JPY)', '광고매출(JPY)', '노출', '클릭', '광고주문',
                     '추적 SKU', '전체 SKU'];
var ADD_DATE = 0, ADD_COST = 1, ADD_SALES = 2, ADD_IMPR = 3, ADD_CLICK = 4,
    ADD_ORD = 5, ADD_NTRACK = 6, ADD_NALL = 7;

/** 광고실적에 낱개로 남길 SKU 수 (0 = 전부) */
var PROP_ADS_TOP_N = 'ADS_TOP_N';
var PROP_ADS_SKUS = 'ADS_SKUS';   // 직접 적어둔 SKU 목록 (JSON 배열). 있으면 상위 N보다 우선
var ADS_TOP_N_DEFAULT = 100;

var ADS_REPORT_TYPE = 'spAdvertisedProduct';
var ADS_MAX_DAYS = 31;                  // 한 번에 요청할 기간
var PROP_ADS_QUEUE = 'ADS_QUEUE';
var PROP_ADS_REPORT = 'ADS_REPORT_ID';
var ADS_CONTINUE_HANDLER = 'continueAdsReport';
var ADS_SOFT_MS = 4 * 60 * 1000;

/**
 * 요청할 칸.
 * 이름이 하나라도 틀리면 아마존이 어느 것이 틀렸는지 알려주며 거절한다.
 * 그 메시지를 그대로 보여주므로, 거절당하면 여기만 고치면 된다.
 */
var ADS_COLUMNS = ['date', 'advertisedSku', 'advertisedAsin', 'cost', 'sales14d',
                   'impressions', 'clicks', 'purchases14d'];

/**
 * 캠페인을 알아야 '같은 SKU를 광고 여러 개로 돌리고 있는지'를 볼 수 있다.
 *
 * 캠페인은 groupBy 로 못 나눈다 — spAdvertisedProduct 는 groupBy 에 advertiser 만 받는다
 * (실측 2026-08-06: campaign 을 넣으면 400). 대신 칸으로 받으면 한 줄이
 * (날짜 × SKU × 캠페인)이 되므로 결과는 같다.
 *
 * 어느 칸 이름이 받아들여지는지는 계정마다 다를 수 있어 한 단계씩 물러선다.
 * 물러선 단계는 기억해 두고 다음부터는 거기서 시작한다.
 */
var ADS_LEVEL_COLS = [
  ['campaignName', 'campaignId'],   // 0 — 이름까지 (제일 보기 좋다)
  ['campaignId'],                   // 1 — 아이디만
  []                                // 2 — 캠페인 없이 (예전 방식)
];
var PROP_ADS_COL_LEVEL = 'ADS_COL_LEVEL';

/**
 * 칸마다 숫자 서식을 못 박는다.
 *
 * writeTable_ 은 값만 쓰고 서식은 건드리지 않는다. 그래서 칸이 하나 늘어나
 * 자리가 밀리면 새 칸이 앞 칸의 서식을 그대로 물려받는다.
 * 실제로 2026-08-06 에 캠페인 칸이 생기면서 [광고주문]이 옛 [수집일시] 자리에
 * 앉아 날짜 서식을 물려받았고, 0이 '1899. 12. 30' 으로 보였다.
 * 값은 멀쩡한데 Apps Script 가 그 칸을 Date 로 읽어 광고분석의 주문 수가
 * -5740763067200 같은 밀리초로 나왔다 — CVR 을 아예 계산할 수 없었다.
 *
 * 쓸 때마다 자리별 서식을 다시 지정하면 칸이 또 밀려도 뜻과 서식이 함께 간다.
 * SKU 칸을 텍스트로 두는 것은 '10252' 같은 숫자꼴 SKU 가 수로 바뀌어
 * 앞의 0 을 잃는 것을 막기 위해서다.
 */
var ADS_FORMATS = [
  { col: 1, n: 1, fmt: 'yyyy-mm-dd' },   // 날짜
  { col: 2, n: 3, fmt: '@' },            // SKU · ASIN · 캠페인
  { col: 5, n: 2, fmt: '#,##0.00' },     // 광고비 · 광고매출 (엔은 소수가 나온다)
                                         // '#,##0.##' 은 정수일 때 '160.' 처럼 끝점이 남는다
  { col: 7, n: 3, fmt: '#,##0' },        // 노출 · 클릭 · 광고주문
  { col: 10, n: 1, fmt: 'yyyy-mm-dd' }   // 수집일시
];

var ADSDAY_FORMATS = [
  { col: 1, n: 1, fmt: 'yyyy-mm-dd' },
  { col: 2, n: 2, fmt: '#,##0' },        // 하루 합계는 writeAdsDays_ 가 반올림해 넣는다
  { col: 4, n: 5, fmt: '#,##0' }
];

/**
 * 표 본문에 서식을 입힌다.
 * 서식이 실패해도 수집 전체를 죽이지는 않는다 — 수집은 이어달리기라 비싸다.
 */
function applyFormats_(sh, specs, rowCount) {
  if (rowCount <= 0) return;
  try {
    for (var i = 0; i < specs.length; i++) {
      sh.getRange(2, specs[i].col, rowCount, specs[i].n).setNumberFormat(specs[i].fmt);
    }
  } catch (e) {
    log_('ads', 'WARN', '칸 서식 지정 실패 (' + sh.getName() + '): ' + e);
  }
}

/**
 * 숫자 칸을 숫자로 읽는다.
 *
 * 날짜 서식이 잘못 걸린 칸은 getValues() 가 Date 를 준다. 거기에 Number() 를
 * 씌우면 1970년 기준 밀리초가 나와 합계가 조 단위로 튄다.
 * 서식만 틀렸을 뿐 담긴 값은 맞으므로, 시트 일련번호(1899-12-30 기준)로 되돌린다.
 * 위에서 서식을 못 박았어도 이미 어긋난 자료가 남아 있어 읽는 쪽에서도 막는다.
 */
function adsNum_(v) {
  if (v instanceof Date) {
    return Math.round((v.getTime() - new Date(1899, 11, 30).getTime()) / 86400000);
  }
  var x = Number(v);
  return isNaN(x) ? 0 : x;
}

// ── 자격증명 ────────────────────────────────────────────

/** 메뉴: 광고 API 자격증명 설정 */
function setupAdsCredentials() {
  var props = PropertiesService.getScriptProperties();
  var has = function (k) { return props.getProperty(k) ? '(설정됨 — 비워두면 유지)' : '(미설정)'; };

  var c = ui_().prompt('광고 API — 클라이언트 ID',
    'SP-API와 다른 별도 자격증명입니다.\n' +
    '광고 콘솔에서 발급받은 값을 넣으세요.\n\n' +
    '현재 ' + has(PROP_ADS_CLIENT) + '\n\namzn1.application-oa2-client... 로 시작합니다.',
    ui_().ButtonSet.OK_CANCEL);
  if (c.getSelectedButton() !== ui_().Button.OK) return;

  var s = ui_().prompt('광고 API — 클라이언트 시크릿',
    '현재 ' + has(PROP_ADS_SECRET), ui_().ButtonSet.OK_CANCEL);
  if (s.getSelectedButton() !== ui_().Button.OK) return;

  var r = ui_().prompt('광고 API — 리프레시 토큰',
    '현재 ' + has(PROP_ADS_REFRESH) + '\n\nAtzr| 로 시작합니다.',
    ui_().ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui_().Button.OK) return;

  // 인증 스크립트를 돌렸다면 프로필 ID가 이미 나와 있다. 있으면 그대로 쓴다 —
  // 없으면 /v2/profiles 로 찾는다.
  var pf = ui_().prompt('광고 API — 프로필 ID (선택)',
    '이미 아는 값이 있으면 넣으세요 (.env 의 ADS_PROFILE_ID).\n' +
    '비워두면 일본(JP) 프로필을 자동으로 찾습니다.\n\n' +
    '현재 ' + has(PROP_ADS_PROFILE), ui_().ButtonSet.OK_CANCEL);
  if (pf.getSelectedButton() !== ui_().Button.OK) return;

  var cv = String(c.getResponseText()).trim();
  var sv = String(s.getResponseText()).trim();
  var rv = String(r.getResponseText()).trim();
  var pv = String(pf.getResponseText()).trim();

  // 되돌릴 수 있게 이전 값을 들고 있는다 — 새 값이 틀리면 원래대로 돌린다
  var old = {
    c: props.getProperty(PROP_ADS_CLIENT),
    s: props.getProperty(PROP_ADS_SECRET),
    r: props.getProperty(PROP_ADS_REFRESH)
  };
  if (cv) props.setProperty(PROP_ADS_CLIENT, cv);
  if (sv) props.setProperty(PROP_ADS_SECRET, sv);
  if (rv) props.setProperty(PROP_ADS_REFRESH, rv);
  if (pv) props.setProperty(PROP_ADS_PROFILE, pv);

  if (!props.getProperty(PROP_ADS_CLIENT) || !props.getProperty(PROP_ADS_SECRET) ||
      !props.getProperty(PROP_ADS_REFRESH)) {
    ui_().alert('세 가지가 모두 있어야 합니다.\n아직 없는 값이 있어 저장만 해두었습니다.');
    return;
  }

  try {
    var prof;
    if (pv) {
      // 프로필을 직접 받았어도 토큰이 살아 있는지는 확인해야 한다.
      // 저장만 하고 넘어가면 나중에 수집을 돌릴 때야 실패한다.
      adsToken_();
      prof = { id: pv, country: ADS_COUNTRY + ' (직접 입력)', name: '' };
    } else {
      prof = adsPickProfile_();
    }
    ui_().alert('광고 API 연결됨',
      '프로필: ' + prof.id + ' (' + prof.country + ')\n' +
      (prof.name ? '계정: ' + prof.name + '\n' : '') + '\n' +
      '[🔄 데이터 갱신 → 광고비 수집]을 실행할 수 있습니다.', ui_().ButtonSet.OK);
  } catch (e) {
    // 새로 넣은 값 때문에 깨졌으면 되돌린다. 반쯤 바뀐 상태로 두면 원인을 못 찾는다
    if (cv) old.c === null ? props.deleteProperty(PROP_ADS_CLIENT) : props.setProperty(PROP_ADS_CLIENT, old.c);
    if (sv) old.s === null ? props.deleteProperty(PROP_ADS_SECRET) : props.setProperty(PROP_ADS_SECRET, old.s);
    if (rv) old.r === null ? props.deleteProperty(PROP_ADS_REFRESH) : props.setProperty(PROP_ADS_REFRESH, old.r);
    throw new Error('광고 API에 연결하지 못했습니다.\n\n' + String(e) + '\n\n' +
      '입력값은 이전 상태로 되돌렸습니다.\n' +
      '· 광고 API 전용 자격증명이 맞는지 (SP-API 것과 다릅니다)\n' +
      '· 리프레시 토큰이 광고 승인에서 나온 것인지 확인하세요.');
  }
}

/** LWA 토큰 (광고용). SP-API와 토큰 발급처는 같지만 자격증명이 다르다 */
function adsToken_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_ADS_CLIENT);
  var secret = props.getProperty(PROP_ADS_SECRET);
  var refresh = props.getProperty(PROP_ADS_REFRESH);
  if (!id || !secret || !refresh) {
    throw new Error('광고 API 자격증명이 없습니다.\n' +
      '[⚙ 설정 → 광고 API 자격증명]을 먼저 실행하세요.');
  }
  var res = UrlFetchApp.fetch(ADS_TOKEN_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: id,
      client_secret: secret
    },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) throw new Error('광고 토큰 발급 실패 (' + code + '): ' + body.substring(0, 200));
  return JSON.parse(body).access_token;
}

/**
 * Ads API 호출.
 * @param {string} path '/v2/profiles' 처럼 앞에 / 를 붙인다
 * @param {Object=} payload 있으면 POST
 * @param {string=} contentType 리포트 요청은 전용 형식을 쓴다
 * @param {string=} accept 받을 형식. 캠페인·키워드(v3)는 이것까지 맞춰야 한다 —
 *     안 보내면 406(Not Acceptable)이 온다. 리포트는 안 보내도 된다.
 */
function adsApi_(token, method, path, payload, contentType, accept) {
  var props = PropertiesService.getScriptProperties();
  var headers = {
    'Authorization': 'Bearer ' + token,
    'Amazon-Advertising-API-ClientId': props.getProperty(PROP_ADS_CLIENT)
  };
  if (accept) headers['Accept'] = accept;
  // 프로필 목록을 받을 때는 아직 프로필을 모른다
  var profile = props.getProperty(PROP_ADS_PROFILE);
  if (profile && path.indexOf('/v2/profiles') !== 0) {
    headers['Amazon-Advertising-API-Scope'] = profile;
  }
  var opt = { method: method, headers: headers, muteHttpExceptions: true };
  if (payload) {
    opt.contentType = contentType || 'application/json';
    opt.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch('https://' + ADS_HOST + path, opt);
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code >= 300) {
    throw new Error('광고 API ' + code + ' — ' + text.substring(0, 300));
  }
  return text ? JSON.parse(text) : {};
}

/** 일본 프로필을 찾아 저장한다 */
function adsPickProfile_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_ADS_PROFILE);           // 목록 요청에는 Scope를 붙이면 안 된다
  var token = adsToken_();
  var list = adsApi_(token, 'get', '/v2/profiles');
  if (!list || !list.length) {
    throw new Error('프로필이 없습니다.\n' +
      '이 계정에 광고 계정이 연결돼 있는지 확인하세요.');
  }
  var pick = null;
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].countryCode || '').toUpperCase() === ADS_COUNTRY) { pick = list[i]; break; }
  }
  if (!pick) {
    var seen = list.map(function (p) { return p.countryCode; }).join(', ');
    throw new Error('일본(' + ADS_COUNTRY + ') 프로필이 없습니다.\n받은 나라: ' + seen + '\n\n' +
      '극동 접속 주소에 일본 계정이 없다면 다른 지역 계정일 수 있습니다.');
  }
  props.setProperty(PROP_ADS_PROFILE, String(pick.profileId));
  var name = pick.accountInfo ? String(pick.accountInfo.name || '') : '';
  log_('ads', 'INFO', '광고 프로필 ' + pick.profileId + ' (' + pick.countryCode + ')');
  return { id: pick.profileId, country: pick.countryCode, name: name };
}

/** 메뉴: 광고 프로필 다시 찾기 */
function adsPickProfile() {
  var p = adsPickProfile_();
  ui_().alert('광고 프로필',
    '프로필: ' + p.id + ' (' + p.country + ')' + (p.name ? '\n계정: ' + p.name : ''),
    ui_().ButtonSet.OK);
}

// ── 광고비 수집 ─────────────────────────────────────────

/** 메뉴: 광고비 수집 */
function fetchAdsSpend() {
  var props = PropertiesService.getScriptProperties();
  if (adResumeIfQueued_('광고비 수집', PROP_ADS_QUEUE, adsReportStep_)) return;
  if (!props.getProperty(PROP_ADS_PROFILE)) adsPickProfile_();

  var res = ui_().prompt('광고비 수집 — 기간',
    'SKU별 일일 광고비와 광고매출을 받습니다.\n' +
    'TACOS(광고비 ÷ 전체매출) 계산에 씁니다.\n\n' +
    '기간을 입력하세요.\n' +
    '  60                 최근 60일\n' +
    '  2026-06            한 달\n' +
    '  2026-04~2026-06    여러 달\n\n' +
    ADS_MAX_DAYS + '일씩 나눠 받습니다.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var range = parseSalesRange_(String(res.getResponseText()).trim());
  if (!range) { ui_().alert('기간을 알아듣지 못했습니다.\n예: 60 · 2026-06'); return; }

  // 광고한 SKU를 전부 날짜×캠페인으로 쌓으면 셀 한도(1,000만)를 넘긴다 — 실제로 넘겼다.
  var pn = ui_().prompt('광고비 수집 — 어떤 SKU를 받을까요',
    'SKU를 직접 적거나, 판매량 상위 몇 위까지 받을지 숫자로 적으세요.\n\n' +
    '  100                 판매량 상위 100개\n' +
    '  50                  상위 50개\n' +
    '  A-123, B-456        적어준 SKU만 (쉼표·줄바꿈으로 구분)\n' +
    '  0                   전부  ⚠ 셀 한도를 넘길 수 있습니다\n\n' +
    '거른 SKU도 하루 합계는 "광고일계"에 남습니다 —\n' +
    '계정 전체 TACOS는 그대로 맞습니다.\n\n' +
    '지금 설정: ' + adsPickText_() + '   (그냥 [확인]이면 그대로)',
    ui_().ButtonSet.OK_CANCEL);
  if (pn.getSelectedButton() !== ui_().Button.OK) return;
  var rawPick = String(pn.getResponseText()).trim();
  var pick = adsParsePick_(rawPick);
  if (!pick && rawPick !== '') {
    ui_().alert('알아듣지 못했습니다.\n순위 숫자(0~2000)나 SKU 목록을 넣으세요.');
    return;
  }
  if (pick) {
    if (pick.mode === 'sku') {
      props.setProperty(PROP_ADS_SKUS, JSON.stringify(pick.skus));
    } else {
      props.deleteProperty(PROP_ADS_SKUS);
      props.setProperty(PROP_ADS_TOP_N, String(pick.n));
    }
  }

  var wins = adsWindows_(range.from, range.to);
  // 무엇으로 알아들었는지 여기서 보여준다 — 숫자로만 된 SKU를 순위로 오해할 수 있다
  var ok = ui_().alert('광고비 수집',
    range.from + ' ~ ' + range.to + '\n' +
    '받을 대상: ' + adsPickText_() + '\n' +
    '구간 ' + wins.length + '개 · 예상 ' +
    wins.length * 2 + '분 내외\n\n시작할까요?', ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  props.setProperty(PROP_ADS_QUEUE, JSON.stringify(wins));
  toast_('광고비 수집 시작 — 구간 ' + wins.length + '개');
  adsReportStep_(true);
}

function adsWindows_(from, to) {
  var out = [], cur = from, guard = 0;
  while (cur <= to && guard++ < 200) {
    var end = addDays_(cur, ADS_MAX_DAYS - 1);
    if (end > to) end = to;
    out.push(cur + '|' + end);
    cur = addDays_(end, 1);
  }
  return out;
}

function continueAdsReport() {
  withLockOrRetry_('광고비 수집', ADS_CONTINUE_HANDLER, function () {
    try { adsReportStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

/** 한 구간을 처리한다 — 요청 → 생성 대기 → 내려받아 적재 */
function adsReportStep_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_ADS_QUEUE) || '[]');
  if (!queue.length) { adsScheduleContinue_(false); return '완료'; }

  var token = adsToken_();
  var win = queue[0].split('|');
  var from = win[0], to = win[1];
  var reportId = props.getProperty(PROP_ADS_REPORT);

  if (!reportId) {
    toast_('광고 리포트 요청 중… (' + from + '~' + to + ')');
    var created = adsCreateReport_(token, from, to);
    reportId = created.reportId;
    if (!reportId) throw new Error('리포트 번호를 못 받았습니다: ' + JSON.stringify(created).substring(0, 200));
    props.setProperty(PROP_ADS_REPORT, reportId);
    log_('ads', 'INFO', '광고 리포트 생성 ' + reportId + ' (' + from + '~' + to + ')');
  }

  var url = '';
  while (Date.now() - t0 < ADS_SOFT_MS) {
    var info = adsApi_(token, 'get', '/reporting/reports/' + reportId);
    var st = String(info.status || '').toUpperCase();
    if (st === 'COMPLETED' || st === 'SUCCESS') { url = info.url; break; }
    if (st === 'FAILURE' || st === 'CANCELLED') {
      props.deleteProperty(PROP_ADS_REPORT);
      adsScheduleContinue_(true);
      throw new Error('광고 리포트 실패: ' + st +
        (info.failureReason ? '\n' + info.failureReason : ''));
    }
    Utilities.sleep(15000);
  }
  if (!url) {
    adsScheduleContinue_(true);
    log_('ads', 'INFO', '광고 리포트 생성 대기 — 1분 뒤 재시도');
    if (interactive) {
      ui_().alert('광고비 수집 — 리포트 준비 중',
        '아마존이 리포트를 만들고 있습니다 (오류 아님).\n\n' +
        '남은 구간 ' + queue.length + '개\n1분 뒤 자동으로 이어받습니다.',
        ui_().ButtonSet.OK);
    }
    return;
  }

  var blob = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getBlob();
  var text = Utilities.ungzip(blob.setContentType('application/x-gzip')).getDataAsString('UTF-8');
  var parsed = parseAdsReport_(text);
  var rows = parsed.rows;
  if (rows.length) writeAdsRows_(rows, from, to);
  writeAdsDays_(parsed.days, from, to);

  queue.shift();
  props.setProperty(PROP_ADS_QUEUE, JSON.stringify(queue));
  props.deleteProperty(PROP_ADS_REPORT);

  var msg = from + '~' + to + ' — ' + rows.length + '행' +
            (queue.length ? ' · 남은 구간 ' + queue.length : ' · 완료');
  log_('ads', 'INFO', '광고비 — ' + msg);
  toast_(msg);

  if (queue.length) {
    adsScheduleContinue_(true);
    if (interactive) {
      ui_().alert('광고비 수집 — 진행 중',
        msg + '\n\n1분 간격으로 자동 진행됩니다.', ui_().ButtonSet.OK);
    }
    return msg;
  }
  adsScheduleContinue_(false);
  // 광고실적은 '날짜 × SKU'라 가장 빨리 큰다 — 받을 때마다 오래된 건 접어둔다
  var pruned = '';
  try { pruned = pruneAds_(); } catch (e) { log_('ads', 'WARN', '보관 정리 실패: ' + e); }
  if (interactive) {
    ui_().alert('광고비 수집 완료', msg + (pruned ? '\n\n' + pruned : '') + '\n\n' +
      '[📊 분석 → TACOS · 광고 효율]에서 SKU별 TACOS를 볼 수 있습니다.\n' +
      '(같은 기간의 판매실적이 있어야 TACOS가 계산됩니다)', ui_().ButtonSet.OK);
  }
  return msg;
}

/** GZIP_JSON 은 객체 배열이다 */
/**
 * 리포트를 요청한다. 캠페인 칸을 붙이되, 아마존이 그 이름을 모른다고 하면
 * 빼고 한 번 더 시도한다.
 *
 * campaignId 는 공식 예시에 있어 확실하지만 campaignName 은 확인하지 못했다.
 * 확실치 않은 칸 하나 때문에 수집 전체가 멈추는 것보다, 빼고라도 받는 게 낫다.
 * 뺐다는 사실은 기억해 두고(속성) 다음부터는 처음부터 안 넣는다.
 */
function adsCreateReport_(token, from, to) {
  var props = PropertiesService.getScriptProperties();

  var attempt = function (level) {
    var cols = ADS_COLUMNS.concat(ADS_LEVEL_COLS[level]);
    return adsApi_(token, 'post', '/reporting/reports', {
      name: '사입도우미 ' + from + '~' + to,
      startDate: from,
      endDate: to,
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        // groupBy 에는 advertiser 만 들어간다 (실측 2026-08-06: campaign 을 넣으면
        // 400 "Allowed values: (advertiser)"). 캠페인은 나누는 축이 아니라 칸으로 받는다 —
        // 그래도 한 줄이 (날짜 × SKU × 캠페인)이 되므로 목적은 같다.
        groupBy: ['advertiser'],
        columns: cols,
        reportTypeId: ADS_REPORT_TYPE,
        timeUnit: 'DAILY',
        format: 'GZIP_JSON'
      }
    }, 'application/vnd.createasyncreportrequest.v3+json');
  };

  var start = parseInt(props.getProperty(PROP_ADS_COL_LEVEL) || '', 10);
  if (!(start >= 0 && start < ADS_LEVEL_COLS.length)) start = 0;

  for (var lv = start; lv < ADS_LEVEL_COLS.length; lv++) {
    try {
      var r = attempt(lv);
      if (lv !== start) props.setProperty(PROP_ADS_COL_LEVEL, String(lv));
      return r;
    } catch (e) {
      var msg = String(e);
      // 칸 이름 문제일 때만 물러선다. groupBy·기간·권한 오류를 칸 문제로 착각하면
      // 캠페인 칸을 조용히 잃은 채 엉뚱한 곳을 고치게 된다.
      var isColumn = /column|metric|field/i.test(msg) && !/groupBy/i.test(msg);
      if (!isColumn || lv === ADS_LEVEL_COLS.length - 1) throw e;
      log_('ads', 'WARN', '칸을 줄여 재시도 (' + ADS_LEVEL_COLS[lv].join(',') + ' → ' +
           (ADS_LEVEL_COLS[lv + 1].join(',') || '캠페인 없음') + ') — ' + msg.substring(0, 150));
    }
  }
  throw new Error('광고 리포트를 요청하지 못했습니다.');
}

/** 낱개로 남길 SKU 수 */
function adsTopN_() {
  var v = parseInt(PropertiesService.getScriptProperties()
    .getProperty(PROP_ADS_TOP_N) || '', 10);
  if (v === 0) return 0;                       // 0 = 전부
  return (v >= 1 && v <= 2000) ? v : ADS_TOP_N_DEFAULT;
}

/** 직접 적어둔 SKU 목록 (없으면 []) */
function adsSkuList_() {
  try {
    var v = JSON.parse(PropertiesService.getScriptProperties()
      .getProperty(PROP_ADS_SKUS) || '[]');
    return (v && v.length) ? v : [];
  } catch (e) { return []; }
}

/**
 * 수집 대상 입력을 읽는다.
 *
 * 숫자 하나면 순위, 그 밖은 SKU 목록으로 본다.
 * 숫자로만 된 SKU 하나를 넣으면 순위로 오해하지만,
 * 바로 다음 확인 창에 무엇으로 알아들었는지 띄우므로 되돌릴 수 있다.
 *
 * @return {{mode:'top'|'all'|'sku', n:number, skus:Array<string>}|null}
 *         null = 못 알아들었거나 빈 입력
 */
function adsParsePick_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (s === '') return null;
  var parts = s.split(/[,\n\r\t;]+/), toks = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p) toks.push(p);
  }
  if (!toks.length) return null;
  if (toks.length === 1 && /^\d{1,4}$/.test(toks[0])) {
    var n = parseInt(toks[0], 10);
    if (n === 0) return { mode: 'all', n: 0, skus: [] };
    if (n > 2000) return null;
    return { mode: 'top', n: n, skus: [] };
  }
  return { mode: 'sku', n: 0, skus: toks };
}

/** 지금 무엇을 받기로 돼 있는지 사람 말로 */
function adsPickText_() {
  var list = adsSkuList_();
  if (list.length) {
    return 'SKU ' + list.length + '개 — ' + list.slice(0, 5).join(', ') +
           (list.length > 5 ? ' 외 ' + (list.length - 5) + '개' : '');
  }
  var n = adsTopN_();
  return n ? '판매량 상위 ' + n + '개' : '광고한 SKU 전부';
}

/**
 * 낱개로 남길 SKU 집합. null 이면 거르지 않는다.
 * 적어둔 목록이 있으면 그것이 우선, 없으면 판매량 상위 N개.
 */
function adsKeepSkus_() {
  var list = adsSkuList_();
  if (list.length) {
    var m = {};
    for (var i = 0; i < list.length; i++) m[String(list[i]).trim()] = true;
    return m;
  }
  var topN = adsTopN_();
  if (topN <= 0) return null;
  var top = topSkusByQty_(topN);
  if (!top || !top.length) return null;         // 판매 자료가 없으면 못 고른다 — 전부 받는다
  var k = {};
  for (var t = 0; t < top.length; t++) k[top[t]] = true;
  return k;
}

function parseAdsReport_(text) {
  var arr;
  try { arr = JSON.parse(text); } catch (e) {
    throw new Error('광고 리포트를 읽지 못했습니다: ' + String(text).substring(0, 120));
  }
  if (!arr || !arr.length) return { rows: [], days: [], nAll: 0, nTrack: 0 };
  var now = new Date();

  // 낱개로 남길 SKU. 광고한 SKU를 전부 날짜×캠페인으로 쌓으면 통합문서 셀 한도
  // (1,000만)를 금방 넘긴다 — 실제로 넘겼다. 볼 것은 상위 몇 개뿐이다.
  var keepSku = adsKeepSkus_();

  var out = [], day = {}, allSku = {}, trackSku = {};
  for (var i = 0; i < arr.length; i++) {
    var r = arr[i];
    var d = String(r.date || '').substring(0, 10);
    var sku = String(r.advertisedSku || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !sku) continue;

    var cost = Number(r.cost) || 0, sales = Number(r.sales14d) || 0;
    var im = Number(r.impressions) || 0, ck = Number(r.clicks) || 0;
    var od = Number(r.purchases14d) || 0;

    // 하루치 계정 전체 합계는 거르기 전에 모은다.
    // 상위 몇 개만 남겨도 '계정 전체 TACOS'는 맞아야 하기 때문이다.
    if (!day[d]) day[d] = { cost: 0, sales: 0, im: 0, ck: 0, od: 0 };
    day[d].cost += cost; day[d].sales += sales;
    day[d].im += im; day[d].ck += ck; day[d].od += od;
    allSku[sku] = true;

    if (keepSku && !keepSku[sku]) continue;
    trackSku[sku] = true;
    out.push([d, sku, String(r.advertisedAsin || ''),
              String(r.campaignName || r.campaignId || ''),
              cost, sales, im, ck, od, now]);
  }

  var days = [];
  for (var k in day) {
    days.push([k, Math.round(day[k].cost), Math.round(day[k].sales),
               day[k].im, day[k].ck, day[k].od,
               countKeys_(trackSku), countKeys_(allSku)]);
  }
  days.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  return { rows: out, days: days,
           nAll: countKeys_(allSku), nTrack: countKeys_(trackSku) };
}

function countKeys_(o) { var n = 0; for (var k in o) n++; return n; }

/** 하루치 계정 합계를 기록한다 (같은 날짜는 갈아끼운다) */
function writeAdsDays_(days, from, to) {
  if (!days.length) return 0;
  var sh = ensureSheet_(SHEET_ADSDAY, ADSDAY_HEADER);
  var keep = [];
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSDAY_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var d = v[i][ADD_DATE] instanceof Date ? ymd_(v[i][ADD_DATE]) : String(v[i][ADD_DATE]);
      if (!d || (d >= from && d <= to)) continue;
      keep.push(v[i]);
    }
  }
  var all = keep.concat(days);
  all.sort(function (a, b) { return String(a[0]) < String(b[0]) ? -1 : 1; });
  writeTable_(sh, ADSDAY_HEADER, all);
  applyFormats_(sh, ADSDAY_FORMATS, all.length);
  return days.length;
}

/**
 * 같은 기간을 다시 받으면 그 기간 행만 갈아끼운다.
 * 광고비는 사후에 조정되는 일이 있어(무효 클릭 환불 등) 덧붙이기만 하면 두 번 세어진다.
 */
function writeAdsRows_(rows, from, to) {
  var sh = ensureSheet_(SHEET_ADS, ADS_HEADER);

  // 캠페인 칸이 생기면서 표가 9칸에서 10칸이 됐다.
  // 옛 자료를 그대로 두면 칸이 한 칸씩 밀려 광고비 자리에 노출 수가 들어간다.
  // 조용히 어긋나느니 비우고 다시 받는 게 낫다 (수집이 기간을 통째로 갈아끼운다).
  if (sh.getLastRow() > 0) {
    var hdr = sh.getRange(1, 1, 1, ADS_HEADER.length).getValues()[0];
    var same = true;
    for (var h = 0; h < ADS_HEADER.length; h++) {
      if (String(hdr[h]).trim() !== ADS_HEADER[h]) { same = false; break; }
    }
    if (!same) {
      sh.clear();
      sh.getRange(1, 1, 1, ADS_HEADER.length).setValues([ADS_HEADER])
        .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      log_('ads', 'INFO', '광고실적 칸 구성이 바뀌어 비우고 다시 받습니다 (캠페인 칸 추가)');
    }
  }
  var keep = [];
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADS_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var d = v[i][AD_DATE] instanceof Date ? ymd_(v[i][AD_DATE]) : String(v[i][AD_DATE]);
      if (!d) continue;
      if (d >= from && d <= to) continue;         // 이번에 받은 기간은 버린다
      keep.push(v[i]);
    }
  }
  var all = keep.concat(rows);
  writeTable_(sh, ADS_HEADER, all);
  applyFormats_(sh, ADS_FORMATS, all.length);
  return rows.length;
}

function adsScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADS_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ADS_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

function adsClearRun_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_ADS_QUEUE);
  props.deleteProperty(PROP_ADS_REPORT);
  adsScheduleContinue_(false);
}


// ── TACOS 분석 (매출기여에서 분리) ──────────────────────
//
// 처음에는 매출기여에 광고비 네 칸을 얹었는데, 그러면 매출기여가 광고실적까지
// 통읽기해야 해서 실행 시간이 그만큼 늘었다. 광고를 보는 날과 매출 비중을 보는
// 날은 다르므로 따로 뗀다 — 각자 자기 자료만 읽는다.

var SHEET_ADSREPORT = '광고분석';
var ADSREPORT_HEADER = [
  'SKU', '상품명', '캠페인 수', '광고비(JPY)', '광고매출(JPY)', 'ACOS',
  '매출(JPY)', 'TACOS', '노출', '클릭', '클릭률', '광고주문', 'CVR', 'CPC(JPY)',
  '캠페인별 광고비'
];

/**
 * CVR 과 CPC 는 이미 받아둔 칸에서 바로 나오는데 그동안 없었다.
 *
 * 클릭률(CTR)만으로는 '사람이 안 온다'와 '와서 안 산다'가 구별되지 않는다.
 * 둘은 할 일이 정반대다 — 앞은 광고를 더 태울 자리고, 뒤는 광고를 더 태우면
 * 손실만 커지는 자리다. 입찰가도 ACOS = CPC ÷ (CVR × 판매가) 에서 나오므로
 * 이 둘이 없으면 얼마를 불러야 하는지 계산할 수가 없다.
 */
var ADSREPORT_NOTES = {
  'CVR': '광고주문 ÷ 클릭. 클릭한 사람 중 몇 %가 샀는가.\n' +
         '낮으면 광고가 아니라 가격·상세페이지·카트박스를 먼저 본다 — ' +
         '광고비를 더 써도 같은 비율로 놓친다.\n' +
         '클릭이 적으면 우연과 구별되지 않는다.',
  'CPC(JPY)': '광고비 ÷ 클릭. 클릭 하나에 실제로 낸 돈.\n' +
              '입찰가와는 다르다 — 보통 입찰가보다 낮게 낙찰된다.',
  '클릭률': '클릭 ÷ 노출. 사람이 오는가를 본다 (CVR 은 와서 사는가).'
};

/**
 * 한 SKU를 캠페인 몇 개로 돌리고 있는가.
 *
 * 같은 상품을 광고 여러 개에 걸어두면 자기끼리 입찰가를 올리며 경쟁한다.
 * 어느 캠페인이 문제인지 알려면 캠페인 단위로 봐야 해서, 리포트를 캠페인별로 받는다.
 *
 * @return {{n:Object, detail:Object}} SKU별 캠페인 수와 '캠페인=금액' 문자열
 */
function adsByCampaign_(from, to) {
  var out = { n: {}, detail: {} };
  var sh = ss_().getSheetByName(SHEET_ADS);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADS_HEADER.length).getValues();

  var per = {};                              // sku -> {캠페인: 광고비}
  for (var i = 0; i < v.length; i++) {
    var d = v[i][AD_DATE] instanceof Date ? ymd_(v[i][AD_DATE]) : String(v[i][AD_DATE]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (from && d < from) continue;
    if (to && d > to) continue;
    var sku = String(v[i][AD_SKU] || '').trim();
    var camp = String(v[i][AD_CAMP] || '').trim() || '(이름 없음)';
    if (!sku) continue;
    if (!per[sku]) per[sku] = {};
    per[sku][camp] = (per[sku][camp] || 0) + adsNum_(v[i][AD_COST]);
  }

  for (var s in per) {
    var names = Object.keys(per[s]);
    out.n[s] = names.length;
    // 광고비 큰 캠페인부터 — 문제를 볼 때 큰 것부터 본다
    names.sort(function (a, b) { return per[s][b] - per[s][a]; });
    out.detail[s] = names.slice(0, 4).map(function (nm) {
      return nm + ' ' + Math.round(per[s][nm]).toLocaleString();
    }).join(' · ') + (names.length > 4 ? ' 외 ' + (names.length - 4) : '');
  }
  return out;
}

/** 메뉴: TACOS · 광고 효율 */
function analyzeTacos() {
  ensureData_(['ads'], ['sales'], 'TACOS 분석');

  // 매출 기준 기간을 고른다. 판매실적이 없으면 ACOS만 나온다 (TACOS는 전체 매출이 필요)
  var src = null;
  if (salesPeriods_().length) {
    src = pickSalesSource_();
    if (src && src.cancel) return;
  }

  var ads = adsSpendIn_(src ? src.from : '', src ? src.to : '');
  if (!ads) {
    throw new Error((src ? src.label + ' 기간에 ' : '') + '광고 자료가 없습니다.\n\n' +
      '[🔄 데이터 갱신 → 광고비 수집]으로 그 기간을 먼저 받으세요.');
  }

  var nameOf = {};
  var listSh = ss_().getSheetByName(SHEET_LISTING);
  if (listSh && listSh.getLastRow() > 1) {
    var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      var s0 = String(lv[i][L_SKU] || '').trim();
      if (s0) nameOf[s0] = String(lv[i][L_KR] || lv[i][L_JP] || '');
    }
  }

  var camp = adsByCampaign_(src ? src.from : '', src ? src.to : '');
  var rows = [], totRev = 0, totAdRev = 0, multi = 0, multiCost = 0;
  for (var sku in ads.cost) {
    var c = ads.cost[sku];
    var ar = ads.sales[sku] || 0;
    var rev = (src && src.amt && src.amt[sku]) || 0;
    var im = (ads.impr && ads.impr[sku]) || 0;
    var ck = (ads.clicks && ads.clicks[sku]) || 0;
    var od = (ads.ord && ads.ord[sku]) || 0;
    totRev += rev; totAdRev += ar;
    var nc = camp.n[sku] || 0;
    if (nc >= 2) { multi++; multiCost += c; }
    rows.push([
      sku, nameOf[sku] || '', nc || '',
      Math.round(c), Math.round(ar), ar > 0 ? c / ar : '',
      rev ? Math.round(rev) : '', rev > 0 ? c / rev : '',
      im || '', ck || '', im > 0 ? ck / im : '',
      (ads.ord && ads.ord[sku]) || '',
      // 클릭이 0이면 CVR·CPC 는 정의되지 않는다. 0으로 적으면 '전환이 나쁘다'로
      // 잘못 읽히므로 비워 둔다.
      ck > 0 ? od / ck : '', ck > 0 ? c / ck : '',
      nc >= 2 ? (camp.detail[sku] || '') : ''
    ]);
  }
  if (!rows.length) throw new Error('광고비가 잡힌 SKU가 없습니다.');
  rows.sort(function (a, b) { return b[3] - a[3]; });   // 광고비 큰 순

  var sh = ensureSheet_(SHEET_ADSREPORT, ADSREPORT_HEADER);
  sh.clear();
  sh.getRange(1, 1).setValue(
    (src ? '[' + src.label + ']' : '[광고실적 전체 ' + ads.from + '~' + ads.to + ']') +
    '  광고비 ' + Math.round(ads.total).toLocaleString() + '엔 · 광고매출 ' +
    Math.round(totAdRev).toLocaleString() + '엔 · 전체 ACOS ' +
    (totAdRev ? (ads.total / totAdRev * 100).toFixed(1) : '—') + '%' +
    (totRev ? ' · 전체 TACOS ' + (ads.total / totRev * 100).toFixed(1) + '%' : '') +
    '   |   TACOS = 광고비 ÷ 전체매출(자연 유입 포함)')
    .setFontWeight('bold');
  sh.getRange(2, 1, 1, ADSREPORT_HEADER.length).setValues([ADSREPORT_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.getRange(3, 1, rows.length, ADSREPORT_HEADER.length).setValues(rows);
  sh.getRange(3, 4, rows.length, 2).setNumberFormat('#,##0');
  sh.getRange(3, 6, rows.length, 1).setNumberFormat('0.0%');
  sh.getRange(3, 7, rows.length, 1).setNumberFormat('#,##0');
  sh.getRange(3, 8, rows.length, 1).setNumberFormat('0.0%');
  sh.getRange(3, 9, rows.length, 2).setNumberFormat('#,##0');    // 노출 · 클릭
  sh.getRange(3, 11, rows.length, 1).setNumberFormat('0.00%');
  sh.getRange(3, 12, rows.length, 1).setNumberFormat('#,##0');   // 광고주문
  sh.getRange(3, 13, rows.length, 1).setNumberFormat('0.00%');   // CVR
  sh.getRange(3, 14, rows.length, 1).setNumberFormat('#,##0.0'); // CPC
  headerNotes_(sh, 2, ADSREPORT_HEADER, ADSREPORT_NOTES);
  sh.setFrozenRows(2);

  var msg = '광고 SKU ' + rows.length + '개 · 광고비 ' +
            Math.round(ads.total).toLocaleString() + '엔';
  log_('ads', 'INFO', 'TACOS 분석 — ' + msg);
  toast_(msg);
  showSheet_(SHEET_ADSREPORT);
  ui_().alert('TACOS 분석 — ' + SHEET_ADSREPORT + ' 탭',
    msg + '\n\n' +
    'ACOS  = 광고비 ÷ 광고로 판 매출 — 광고만 놓고 본 효율\n' +
    'TACOS = 광고비 ÷ 전체 매출 — 장사 전체에서 광고가 먹는 비율\n' +
    'CVR   = 광고주문 ÷ 클릭 — 와서 사는가 (CTR 은 오는가)\n' +
    'CPC   = 광고비 ÷ 클릭 — 클릭 하나에 실제로 낸 돈\n\n' +
    '둘을 같이 봐야 합니다. ACOS가 좋아도 원래 팔리던 것을\n' +
    '광고로 산 것뿐이면, 매출은 안 늘고 TACOS만 오릅니다.' +
    (totRev ? '' : '\n\n※ 판매실적 기간을 안 골라 TACOS 칸이 비어 있습니다.'),
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * 기간별 SKU 광고비·광고매출.
 * @return {{cost:Object, sales:Object, from:string, to:string, total:number}|null}
 */
function adsSpendIn_(from, to) {
  var sh = ss_().getSheetByName(SHEET_ADS);
  var cost = {}, sales = {}, impr = {}, clicks = {}, ord = {};
  var total = 0, lo = '', hi = '', n = 0;
  var dailyMonths = {};      // 날짜별 자료가 있는 달 — 요약과 겹치면 안 된다

  var v = (sh && sh.getLastRow() > 1)
    ? sh.getRange(2, 1, sh.getLastRow() - 1, ADS_HEADER.length).getValues() : [];
  for (var i = 0; i < v.length; i++) {
    var d = v[i][AD_DATE] instanceof Date ? ymd_(v[i][AD_DATE]) : String(v[i][AD_DATE]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (from && d < from) continue;
    if (to && d > to) continue;
    var sku = String(v[i][AD_SKU] || '').trim();
    if (!sku) continue;
    cost[sku] = (cost[sku] || 0) + adsNum_(v[i][AD_COST]);
    sales[sku] = (sales[sku] || 0) + adsNum_(v[i][AD_SALES]);
    impr[sku] = (impr[sku] || 0) + adsNum_(v[i][AD_IMPR]);
    clicks[sku] = (clicks[sku] || 0) + adsNum_(v[i][AD_CLICK]);
    ord[sku] = (ord[sku] || 0) + adsNum_(v[i][AD_ORD]);
    total += adsNum_(v[i][AD_COST]);
    dailyMonths[d.substring(0, 7)] = true;
    if (!lo || d < lo) lo = d;
    if (!hi || d > hi) hi = d;
    n++;
  }

  // 보관 기간을 넘겨 접어둔 달을 얹는다.
  // 이게 없으면 오래된 기간을 고를 때 '광고를 안 했다'로 보인다.
  //
  // 단, 날짜별 자료가 이미 있는 달은 건너뛴다.
  // 접은 뒤에 그 달을 다시 수집하면 요약과 날짜별이 둘 다 남는데,
  // 그대로 더하면 광고비가 두 배가 되고 TACOS도 두 배로 나온다.
  var folded = adsSummaryIn_(from, to);
  var used = [];
  for (var f2 = 0; f2 < folded.months.length; f2++) {
    if (!dailyMonths[folded.months[f2]]) used.push(folded.months[f2]);
  }
  if (used.length) {
    var pick = {};
    for (var u = 0; u < used.length; u++) pick[used[u]] = true;
    var addFrom = adsSummaryMonths_(pick);
    for (var k2 in addFrom.cost) {
      cost[k2] = (cost[k2] || 0) + addFrom.cost[k2];
      sales[k2] = (sales[k2] || 0) + addFrom.sales[k2];
      impr[k2] = (impr[k2] || 0) + addFrom.impr[k2];
      clicks[k2] = (clicks[k2] || 0) + addFrom.clicks[k2];
      ord[k2] = (ord[k2] || 0) + addFrom.ord[k2];
      total += addFrom.cost[k2];
    }
    n += used.length;
    var fLo = used[0] + '-01';
    var lm = used[used.length - 1];
    var fHi = ymd_(new Date(Number(lm.substring(0, 4)), Number(lm.substring(5, 7)), 0));
    if (!lo || fLo < lo) lo = fLo;
    if (!hi || fHi > hi) hi = fHi;
  }

  if (!n) return null;
  return { cost: cost, sales: sales, impr: impr, clicks: clicks, ord: ord,
           from: lo, to: hi, total: total, folded: used.length };
}
