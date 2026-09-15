/**
 * 아마존 → KSE 배송등록 (시트 내장).
 *
 *   ① 아마존 자료 올리기   주문자료 CSV + 가격자료 CSV → order-item-id 로 병합
 *                          배송지(수취인+주소)가 같은 주문은 한 박스로 묶어 [주문] 시트에
 *   ② KSE 배송등록         createOrders + 송장번호 조회
 *   ③ 완료 처리            [완료] 시트로 이관
 *
 * 아마존은 주문 리포트에 가격이 없고 가격자료를 따로 주기 때문에, 병합이 항상 선행된다.
 * 가격을 못 찾은 행은 [가격없음] 시트로 분리해서 KSE로 나가지 않게 한다.
 */

// ── 시트 이름 ────────────────────────────────────────────────────────────
var SHEET_ORDERS = '주문';
var SHEET_ERROR = '오류확인';
// [가격없음] 시트는 없앴다 — 가격 못 찾은 주문도 [오류확인] 으로 모은다
var SHEET_DONE = '완료';
var SHEET_PICK = '근석이';        // 지정 상품명만 담긴 주문
var SHEET_PICKLIST = '지정상품명';  // 사람이 직접 적는 상품명 목록
var SHEET_BANLIST = '금지상품명';   // 통관에 걸리는 낱말 목록
var SHEET_SHIP = 'shipnergy';       // Shipnergy 로 보낼 주문
var SHEET_CONFIG = '설정';
var SHEET_LOG = '로그';

// ── [주문] 시트 컬럼 (1-based). 1행 = KSE 패키지 1건 ─────────────────────
var COL = {
  STATUS: 1,        // 상태
  GROUP_KEY: 2,     // 묶음키 (수취인 + 주소)
  ORDER_ID: 3,      // 대표주문번호
  ORDER_IDS: 4,     // 주문번호 목록
  ORDER_TIME: 5,    // 주문일시 (그룹 내 가장 이른 것)
  RECEIVER: 6,      // 수취인
  TEL: 7,           // 전화번호
  ZIP: 8,           // 우편번호
  ADDRESS: 9,       // 주소
  COUNTRY: 10,      // 국가
  SKU: 11,          // SKU
  TITLE_EN: 12,     // 상품명(영문)
  TITLE_KSE: 13,    // KSE상품명(한/영)
  QTY: 14,          // 수량
  UNIT_PRICE: 15,   // 단가
  TOTAL: 16,        // 합계금액
  WEIGHT: 17,       // 무게(kg)
  KSE_NO: 18,       // KSE접수번호
  KSE_STATUS: 19,   // KSE상태
  LOCAL_CARRIER: 20,// 현지배송사
  INVOICE: 21,      // 송장번호
  KSE_SENT_AT: 22,  // KSE전송일시
  DONE_AT: 23,      // 완료일시
  NOTE: 24,         // 비고
  RAW: 25           // _원본JSON (숨김)
};
var COL_COUNT = 25;

var HEADERS_ORDERS = [
  '상태', '묶음키', '대표주문번호', '주문번호목록', '주문일시', '수취인', '전화번호',
  '우편번호', '주소', '국가', 'SKU', '상품명(영문)', 'KSE상품명(한/영)', '수량', '단가',
  '합계금액', '무게(kg)', 'KSE접수번호', 'KSE상태', '현지배송사', '송장번호',
  'KSE전송일시', '완료일시', '비고', '_원본JSON'
];

// ── 상태 ─────────────────────────────────────────────────────────────────
var ST = {
  READY: '대기',
  SENT: 'KSE접수',
  INVOICED: '송장수신',
  DONE: '완료',
  ERROR: '오류'
};

// ── 설정 기본값 ([설정] 시트가 우선한다) ─────────────────────────────────
var DEFAULT_CONFIG = {
  KSE_서버: '실서버',
  KSE_배송서비스코드: 'KSE',
  KSE_마켓명: 'Amazon',
  KSE_통화: 'JPY',
  KSE_배치크기: '20',
  KSE_장바구니번호: '주문상품ID',
  기본무게: '0.1',
  기본원산지: 'KR',
  기본HS코드: '',
  기본재질: '',
  상품명구분자: ' / ',
  합배송기준: '배송지',
  주소조립순서: 'ship-state,ship-city,ship-address-1,ship-address-2,ship-address-3',
  단가기준: '합계÷수량',
  상품코드_영문만: 'FALSE',
  관세임계값: '16600',
  AI_모델: 'claude-opus-5',
  번역_엔진: 'Claude',
  번역_모델: 'claude-sonnet-5',
  번역_배치크기: '25',
  번역_effort: 'low',
  번역_폴백제한초: '90',
  AI_effort: 'medium',
  AI_배치크기: '50',
  AI_최소확신도: '0.7',
  외국인_단일명_허용: 'FALSE',
  기관키워드_추가: '',
  지정상품명_일치방식: '완전일치',
  금지상품명_추가: '',
  배송대행지_추가: '',
  발송인_이름: '',
  발송인_이름카나: '',
  발송인_전화번호: '',
  발송인_우편번호: '',
  발송인_주소: '',
  발송인_건물: '',
  야마토_청구선고객코드: '',
  야마토_운임관리번호: '',
  근석이_양식: 'B2',
  근석이_수량표기: '표기',
  근석이_품명자르기: '원본',
  근석이_송장종류: 'A',
  근석이_경칭: '様',
  근석이_헤더행: '없음',
  근석이_파일형식: 'CSV',
  아마존_배송사코드: 'KSE',
  아마존_배송사명: '',
  아마존_배송방법: 'Standard',
  아마존_송장기준: 'KSE접수번호',
  발송확인_완료조회일수: '2'
};

var CONFIG_DESC = {
  KSE_서버: '실서버 또는 테스트',
  KSE_배송서비스코드: 'KSE / KSE Light / SDEX',
  KSE_마켓명: 'KSE에 알릴 판매 마켓명',
  KSE_통화: 'ISO 4217',
  KSE_배치크기: '1회 전송 건수 (KSE 권장 20, 최대 500)',
  KSE_장바구니번호: 'KSE 장바구니번호(PackageNo)에 무엇을 넣을지. 주문상품ID = 아마존 order-item-id(기본) / 주문번호 = order-id. 나머지 하나가 상품별 주문번호(GoodsOrderNo)로 들어간다',
  기본무게: '상품마스터에 무게가 없을 때 쓸 kg 값',
  기본원산지: 'ISO 3166-1 alpha-2',
  기본HS코드: '비워두면 미전송 (통관 지연 가능)',
  기본재질: '옷·신발·주류는 필수',
  상품명구분자: '한국어와 영문 상품명 사이에 넣을 문자',
  합배송기준: "'배송지' = 수취인+주소가 같으면 한 박스 / '주문' = order-id 단위",
  주소조립순서: '아마존 주소 컬럼을 이 순서로 이어 붙인다 (빈 칸은 건너뜀)',
  단가기준: "'합계÷수량' = item-price 를 수량으로 나눠 1개 단가로 / '그대로' = item-price 를 그대로",
  상품코드_영문만: "KSE 가이드상 GoodsCode·SKU 는 영문/숫자만 허용. FALSE=SKU를 그대로 보냄(기본), TRUE=허용문자가 아니면 빈값으로 보냄. 문자셋 오류가 나면 TRUE로 바꾸세요",
  관세임계값: '배송지(수취인+주소)별 합계금액이 이 값 이상이면 관세 신고 대상 → [오류확인] 시트로 보내고 합계금액 칸을 붉게 칠한다. 여러 물건을 합산한 금액으로 본다. 0이면 검사 안 함',
  AI_모델: '이름 판별에 쓸 모델. claude-opus-5(정확도 우선) / claude-sonnet-5 / claude-haiku-4-5',
  번역_엔진: '상품명 번역을 무엇으로 할지. Claude(기본) 또는 구글. Claude 가 실패하면 자동으로 구글 번역으로 넘어간다',
  번역_모델: '번역에 쓸 모델. claude-sonnet-5(기본) / claude-haiku-4-5-20251001 로 더 싸게 / claude-opus-5 로 더 정확하게',
  번역_배치크기: '한 번에 묶어 보낼 상품명 개수 (기본 25). 묶음들은 동시에 보낸다. 같은 상품명은 한 번만 번역한다',
  번역_effort: '번역에 쓸 생각 강도. low(기본) — 번역은 판단이 아니라 변환이라 낮게 둔다. 품질이 아쉬우면 medium',
  번역_폴백제한초: 'Claude 가 실패해 구글 번역으로 넘어갈 때 최대 몇 초까지 쓸지 (기본 90). 넘으면 남은 것은 [정리 > 번역 채우기] 로 미룬다',
  AI_effort: '판단 깊이. low / medium / high / xhigh / max',
  AI_배치크기: '한 번에 판별할 이름 개수. 크면 빠르지만 뒤쪽 판정이 무뎌진다',
  AI_최소확신도: '이 값보다 확신이 낮으면 정상이라도 [오류확인]으로 보낸다 (0~1)',
  외국인_단일명_허용: "로마자 이름도 성 없이 이름만이면 정상으로 볼지 (기본 FALSE = 풀네임이어야 한다)",
  기관키워드_추가: '회사·관공서 판별에 더 넣을 키워드. 콤마로 구분',
  지정상품명_일치방식: "[지정상품명] 시트의 상품명을 어떻게 대조할지. 포함 = 상품명 일부만 적어도 걸린다 / 완전일치 = 상품명이 똑같아야 걸린다(기본)",
  금지상품명_추가: '[금지상품명] 시트 말고 여기에 더 적을 낱말. 콤마로 구분',
  배송대행지_추가: '배송대행지 판별에 더 넣을 낱말(상호 등). 콤마로 구분',
  발송인_이름: '야마토 B2 의 ご依頼主名 — 근석이 다운에 들어간다 (宅急便 필수)',
  발송인_이름카나: 'ご依頼主名(ｶﾅ) — 반각 가타카나',
  발송인_전화번호: 'ご依頼主電話番号 (宅急便 필수)',
  발송인_우편번호: 'ご依頼主郵便番号 (宅急便 필수)',
  발송인_주소: 'ご依頼主住所 (宅急便 필수)',
  발송인_건물: 'ご依頼主アパートマンション',
  야마토_청구선고객코드: '請求先顧客コード — 야마토 계약 번호. 앞 0 이 날아가지 않게 텍스트로 적는다 (宅急便 필수)',
  야마토_운임관리번호: '運賃管理番号 — 두 자리 (宅急便 필수)',
  근석이_양식: '근석이 다운 양식. B2(기본) = 야마토 B2 클라우드 95컬럼, 송장을 바로 뽑는다 / 아마존 = 아마존 주문 리포트 32컬럼, 원본을 그대로 넘긴다',
  근석이_품명자르기: '근석이 B2 品名 상품명. 원본(기본) → 아마존 상품명 그대로, 자르지 않음 / 자르기 → B2 글자 수(25자)에 맞춰 다듬고 자름',
  근석이_수량표기: '근석이 B2 品名 앞에 수량을 붙일지. 표기(기본) → [SET][3個] 상품명 (2개 이상이면 [SET]) / 없음 → 상품명만',
  근석이_송장종류: '送り状種類. A(기본, B2 웹 화면에서 쓰는 값) / 0=発払い / 2=コレクト / 5=着払い (B2 양식에서만 쓴다)',
  근석이_경칭: '敬称. 様 / 御中 등. 비워두면 안 넣는다',
  근석이_헤더행: '근석이 다운 파일 첫 줄에 컬럼 이름을 넣을지. 없음(기본) / 있음. B2 취込 패턴에서 1행을 제목행으로 쓰면 있음 으로',
  근석이_파일형식: 'CSV(기본) 또는 xlsx',
  아마존_배송사코드: '아마존 발송확인 파일의 carrier-code. 아마존이 KSE 접수번호를 받는 양식이라 KSE 로 둔다. 아마존이 이 코드를 거부하면 Other 로 바꾸고 아마존_배송사명에 KSE 를 적는다',
  아마존_배송사명: 'carrier-code 가 Other 일 때만 필요한 carrier-name. 비워두면 빈 칸으로 나간다',
  아마존_배송방법: '아마존 발송확인 파일의 ship-method',
  아마존_송장기준: '아마존에 넣을 추적번호. KSE접수번호 = KSE가 준 K… 번호(기본) / 송장번호 = 일본 국내 송장번호',
  발송확인_완료조회일수: '아마존 발송확인 파일을 만들 때 [완료] 시트에서 며칠 전까지 볼지 (기본 2일). 이미 아마존에 올린 오래된 건을 다시 올리지 않게 한다'
};

// ── KSE ──────────────────────────────────────────────────────────────────
var KSE_BASE = {
  '실서버': 'https://api.kokusai.express/v1',
  '테스트': 'https://test.kseoms.com/v1'
};
var KSE_TRACKING_MAX = 20;    // 배송추적조회 1회 최대
var KSE_QUERY_MAX = 500;      // 배송등록 1회 최대

// 본인 스프레드시트에 종속된 비공개 프로젝트라 키를 여기 둔다.
// 스크립트 속성 KSE_API_KEY 가 있으면 그쪽이 우선한다.
var KSE_API_KEY_FALLBACK = '$2y$10$oKKWVsLgu7PutMbMr0bKR.PF082hCWNOt8OkVcytpOCtfAuPGgif6';

function kseApiKey_() {
  return PropertiesService.getScriptProperties().getProperty('KSE_API_KEY') || KSE_API_KEY_FALLBACK;
}

// ── 설정 읽기 ────────────────────────────────────────────────────────────
var _cfg = null;

function getConfig() {
  if (_cfg) return _cfg;
  var cfg = {};
  for (var k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];

  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  if (sh && sh.getLastRow() > 1) {
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      var key = String(rows[i][0]).trim();
      if (!key) continue;
      var raw = rows[i][1] === null || rows[i][1] === undefined ? '' : String(rows[i][1]);
      // 상품명구분자는 앞뒤 공백이 값의 일부다 (' / ')
      cfg[key] = (key === '상품명구분자') ? raw : raw.trim();
    }
  }
  _cfg = cfg;
  return cfg;
}

function kseBaseUrl_() {
  return KSE_BASE[getConfig().KSE_서버] || KSE_BASE['실서버'];
}

// ── 유틸 ─────────────────────────────────────────────────────────────────

/** KSE가 거부하는 문자(' " \ ;)와 제어문자를 없앤다. */
function sanitize_(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/['"\\;]/g, ' ')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digits_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[^0-9]/g, '');
}

function num_(v, dflt) {
  var n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/,/g, ''));
  return isFinite(n) ? n : (dflt || 0);
}

function round_(n, digitsCount) {
  var p = Math.pow(10, digitsCount);
  return Math.round(n * p) / p;
}

function nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function chunk_(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 묶음키 비교용 정규화 — 공백·기호를 없애고 소문자로. 표기 흔들림을 흡수한다. */
function normKey_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[\s\-‐-―ー－]/g, '')
    .replace(/[.,'"()\[\]]/g, '')
    .toLowerCase();
}

/** 영문·숫자·일부 기호만으로 이루어졌는지 */
function isAsciiSafe_(s) {
  return /^[A-Za-z0-9 ._\-+()\/&%,:#]*$/.test(String(s || ''));
}

/**
 * KSE TitleEng 가 받는 글자만 남긴다.
 * 통째로 버리면 통관영문명이 비어버리므로, 안 되는 글자만 떼어낸다.
 * 남은 글자가 거의 없으면 '' 을 준다.
 */
function asciiClean_(s) {
  var t = String(s == null ? '' : s)
    .replace(/[^A-Za-z0-9 ._\-+()\/&%,:#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.replace(/[^A-Za-z0-9]/g, '').length >= 2 ? t : '';
}

/**
 * KSE GoodsCode / SKU 값.
 *
 * 가이드상 GoodsCode 는 "영문, 숫자, 일부 특수문자만", SKU 는 여기에 일본어까지다.
 * 그런데 아마존 SKU 는 한국어인 경우가 많다.
 *
 * 한글만 골라 지우면 '민티드 고체치약 90정' → '90' 처럼 의미 없는 조각이 되고
 * 서로 충돌할 수도 있어서, 조각내지 않고 둘 중 하나만 한다:
 *   상품코드_영문만 = FALSE (기본) → SKU를 그대로 보낸다
 *   상품코드_영문만 = TRUE        → 허용 문자셋이 아니면 빈값을 보낸다
 *                                   (가이드: 고유코드가 없으면 빈값 입력요망)
 * 한국어 상품명은 Title 에 그대로 들어가므로 어느 쪽이든 정보가 사라지지는 않는다.
 */
function goodsCode_(s) {
  var t = sanitize_(s);
  if (!t) return '';
  if (String(getConfig().상품코드_영문만 || 'FALSE').toUpperCase() !== 'TRUE') return t;
  return isAsciiSafe_(t) ? t : '';
}

/**
 * 일본 우편번호를 하이픈 없는 7자리 문자열로.
 *
 * 구글 시트가 '0140063' 을 숫자 140063 으로 저장해 앞의 0을 떨어뜨린다.
 * 일본 우편번호는 늘 7자리이므로, 5~6자리 숫자만 남았으면 떨어진 0을 되붙인다
 * (001-0016 처럼 0이 둘인 지역도 있어 5자리까지 본다). 7자리를 못 만들면 숫자만 돌려준다.
 * 시트에서 읽은 우편번호는 어디서든 이 함수를 거친 뒤에 쓴다.
 */
function zipJP_(v) {
  var d = digits_(v);
  if (d.length >= 5 && d.length < 7) d = '0000000'.slice(0, 7 - d.length) + d;
  return d;
}

/** 일본 우편번호 7자리를 찾아낸다 (123-4567 / 1234567). 없으면 빈 문자열. */
function findZip_(text) {
  var m = String(text || '').match(/(\d{3})\s*-?\s*(\d{4})(?!\d)/);
  return m ? m[1] + m[2] : '';
}

/** 일본 도도부현 47개 — 주소 앞머리를 정확히 알아보려고 목록으로 둔다. */
var JP_PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];

/** 주소 맨 앞의 도도부현. 없으면 빈 문자열. */
function findPrefecture_(addr) {
  var t = String(addr == null ? '' : addr).replace(/^\s+/, '');
  for (var i = 0; i < JP_PREFECTURES.length; i++) {
    if (t.indexOf(JP_PREFECTURES[i]) === 0) return JP_PREFECTURES[i];
  }
  return '';
}

/**
 * 주소 앞머리에 이미 들어 있는 조각(도도부현·시)을 떼어낸다.
 *
 * 업로드 양식은 ship-state · ship-city 를 따로 받아 주소 앞에 다시 붙인다.
 * 우리 시트의 주소 칸은 '도도부현 + 시 + 번지' 를 한 덩어리로 담고 있어서,
 * 그대로 ship-address-1 에 넣으면 '千葉県 千葉県 茂原市…' 처럼 두 번 나간다.
 * 공백은 무시하고 앞머리가 맞을 때만 떼어낸다 (다르면 주소를 건드리지 않는다).
 */
function stripAddrHead_(addr, heads) {
  var t = String(addr == null ? '' : addr).trim();
  for (var k = 0; k < heads.length; k++) {
    var h = String(heads[k] == null ? '' : heads[k]).replace(/\s+/g, '');
    if (!h) continue;
    var i = 0, j = 0;
    while (i < t.length && j < h.length) {
      var c = t.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (c !== h.charAt(j)) { j = -1; break; }
      i++; j++;
    }
    if (j === h.length) t = t.slice(i).replace(/^[\s,、]+/, '');
  }
  return t.trim();
}

/** 앞뒤로 같은 도도부현이 두 번 붙는 경우를 하나로 줄인다. */
function dedupePrefecture_(addr) {
  return String(addr || '')
    .replace(/^(\S*?[都道府県])\s*\1/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 상품마스터 키로 쓸 만한 SKU 인지.
 *
 * Shift-JIS 리포트는 한글을 표현할 수 없어 아마존이 공백으로 바꿔 내려준다.
 * '민티드 고체치약 90정' → '            90' 처럼 되는데, 이런 조각을 마스터 키로
 * 쓰면 서로 충돌해서 엉뚱한 무게·HS코드가 붙는다. 그래서 걸러낸다.
 */
function skuUsable_(raw) {
  var t = String(raw === null || raw === undefined ? '' : raw);
  if (!t.trim()) return false;
  if (/\s{2,}/.test(t)) return false;        // 다국어가 공백으로 치환된 흔적
  return /[A-Za-z0-9\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff]{2,}/.test(t.trim());
}

function ordersSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ORDERS);
  if (!sh) throw new Error('[' + SHEET_ORDERS + '] 시트가 없습니다. 메뉴 > 설정 > 시트 초기 설정 을 먼저 실행하세요.');
  return sh;
}

/** [주문] 시트 전체를 [{row, v}] 로 */
function orderRows_() {
  var sh = ordersSheet_();
  if (sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COL_COUNT).getValues();
  return vals.map(function (v, i) { return { row: i + 2, v: v }; });
}

/** updates: [[row, col, value], ...] */
function applyUpdates_(updates) {
  if (!updates.length) return;
  var sh = ordersSheet_();
  for (var i = 0; i < updates.length; i++) {
    sh.getRange(updates[i][0], updates[i][1]).setValue(updates[i][2]);
  }
  SpreadsheetApp.flush();
}

/** 처리가 끝난 주문을 옮겨 두는 [완료] 시트 */
function doneSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_DONE);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DONE);
    sh.getRange(1, 1, 1, COL_COUNT).setValues([HEADERS_ORDERS])
      .setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    if (sh.getMaxColumns() >= COL.RAW) sh.hideColumns(COL.RAW);
    applyTextFormat_(sh);
  }
  return sh;
}

/** [주문] → [완료] 이관 */
function moveToDone_(rows) {
  if (!rows.length) return 0;
  var done = doneSheet_();
  var dStart = done.getLastRow() + 1;
  writeRows_(done, dStart, rows.map(function (r) { return r.v; }));
  markBizRows_(done, dStart, rows.map(function (r) { return r.v; }));

  // 행 번호가 밀리지 않도록 아래에서 위로 지운다
  var orders = ordersSheet_();
  deleteRowsAt_(orders, rows.map(function (r) { return r.row; }));

  SpreadsheetApp.flush();
  return rows.length;
}

/**
 * 사람이 판단해야 할 주문을 모아두는 [오류확인] 시트.
 * 관세 신고 대상(합계 임계값 초과)처럼 그대로 보내면 안 되는 건이 여기로 온다.
 */
function errorSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_ERROR);
  if (!sh) {
    sh = ss.insertSheet(SHEET_ERROR);
    sh.getRange(1, 1, 1, COL_COUNT).setValues([HEADERS_ORDERS])
      .setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    applyTextFormat_(sh);
    if (sh.getMaxColumns() >= COL.RAW) sh.hideColumns(COL.RAW);
  }
  return sh;
}

/** [오류확인] → [주문] 되돌리기 (사람이 확인·수정한 뒤) */
function restoreFromError_(orderIds) {
  var want = {};
  (orderIds || []).forEach(function (id) { want[String(id).trim()] = true; });

  var err = errorSheet_();
  if (err.getLastRow() < 2) return 0;

  var vals = err.getRange(2, 1, err.getLastRow() - 1, COL_COUNT).getValues();
  var picked = [];
  for (var i = 0; i < vals.length; i++) {
    if (want[String(vals[i][COL.ORDER_ID - 1]).trim()]) picked.push({ row: i + 2, v: vals[i] });
  }
  if (!picked.length) return 0;

  var orders = ordersSheet_();
  var start = orders.getLastRow() + 1;
  var moved = picked.map(function (p) {
    var v = p.v.slice();
    v[COL.STATUS - 1] = ST.READY;
    // 법인주문 표기는 되돌린 뒤에도 남겨야 한다 (사람이 바로 알아볼 수 있게)
    var biz = isBizRow_(v) ? NOTE_BIZ + ' / ' : '';
    v[COL.NOTE - 1] = biz + '오류확인에서 되돌림 ' + nowStr_();
    return v;
  });
  writeRows_(orders, start, moved);
  // 되돌린 행의 경고색은 지운다 — 사람이 확인했다는 뜻이므로
  var cleared = {};
  var rows = [];
  for (var k = 0; k < picked.length; k++) rows.push(start + k);
  applyWarnColors_(cleared, rows);
  markBizRows_(orders, start, moved);

  deleteRowsAt_(err, picked.map(function (p) { return p.row; }));

  SpreadsheetApp.flush();

  // 되돌린 박스가 전부 지정 상품명이면 바로 [근석이] 로 보낸다.
  // (관세 때문에 [오류확인] 으로 갔다가 사람이 확인한 건이 대표적이다)
  var toPick = 0;
  try {
    toPick = pickMoveRows_(rows);
  } catch (e) {
    log_('되돌리기', '지정 상품명 자동 분류 실패 — ' + e);
  }
  return { n: picked.length, pick: toPick };
}

/** [완료] → [주문] 되돌리기 (KSE·업로드가 반려됐을 때) */
function restoreFromDone_(orderIds) {
  var want = {};
  (orderIds || []).forEach(function (id) { want[String(id).trim()] = true; });

  var done = doneSheet_();
  if (done.getLastRow() < 2) return 0;

  var vals = done.getRange(2, 1, done.getLastRow() - 1, COL_COUNT).getValues();
  var picked = [];
  for (var i = 0; i < vals.length; i++) {
    if (want[String(vals[i][COL.ORDER_ID - 1]).trim()]) picked.push({ row: i + 2, v: vals[i] });
  }
  if (!picked.length) return 0;

  var orders = ordersSheet_();
  writeRows_(orders, orders.getLastRow() + 1, picked.map(function (p) {
      var v = p.v.slice();
      v[COL.STATUS - 1] = String(v[COL.INVOICE - 1]).trim() ? ST.INVOICED : ST.SENT;
      v[COL.DONE_AT - 1] = '';
      v[COL.NOTE - 1] = '되돌림 ' + nowStr_();
      return v;
    }));

  deleteRowsAt_(done, picked.map(function (p) { return p.row; }));

  SpreadsheetApp.flush();
  return picked.length;
}

/**
 * 직접 확인이 필요한 칸만 색으로 표시한다.
 *
 * 무게 미등록처럼 기본값으로 정상 처리되는 항목은 칠하지 않는다 —
 * 다 칠하면 정작 손으로 채워야 하는 칸이 묻힌다.
 */
var BG_WARN = '#fce8e6';   // 필수값 없음 (연한 빨강)
var BG_NO = '#f4c7c3';     // 아님 — 확정된 결함 (진한 빨강)
var BG_MAYBE = '#fff2cc';  // 애매 — 사람이 판단 (노랑)
var BG_NONE = '#ffffff';
var BG_BIZ = '#e3f0d8';    // 법인(비즈니스) 주문 — 행 전체를 연한 초록으로

// 법인주문 행은 흰색이 아니라 이 색이 바탕이다.
// 경고색을 지울 때 흰색으로 되돌리면 행 색이 지워지므로 비고로 알아본다.
var NOTE_BIZ = '법인주문';

function rowBaseColor_(note) {
  return String(note || '').indexOf(NOTE_BIZ) >= 0 ? BG_BIZ : BG_NONE;
}

// 앞의 0이 떨어지면 안 되는 칸. 시트에 텍스트 서식을 박아둔다.
// (구글 시트는 '0861654' 를 숫자 861654 로 저장해 0을 날린다)
var TEXT_COLS = [COL.GROUP_KEY, COL.ORDER_ID, COL.ORDER_IDS, COL.TEL, COL.ZIP,
  COL.SKU, COL.KSE_NO, COL.INVOICE];

function applyTextFormat_(sh) {
  if (!sh) return;
  var rows = sh.getMaxRows();
  TEXT_COLS.forEach(function (c) {
    if (sh.getMaxColumns() >= c) sh.getRange(1, c, rows, 1).setNumberFormat('@');
  });
}

/**
 * 주문 양식 행을 시트에 쓴다 — 쓰기 직전에 그 범위의 번호 칸을 텍스트 서식으로 박는다.
 *
 * applyTextFormat_ 는 시트를 만들 때 한 번 걸리는데, 그 전에 만들어진 탭이나
 * setValues 로 시트가 늘어나며 새로 생긴 행은 기본 서식이라 '0140063' 이 숫자가 된다.
 * 그래서 [주문]·[오류확인]·[근석이]·[Shipnergy]·[완료] 에 행을 넣는 곳은 모두 이것을 쓴다.
 */
function writeRows_(sh, startRow, rows) {
  if (!rows || !rows.length) return;
  TEXT_COLS.forEach(function (c) {
    if (sh.getMaxColumns() >= c) sh.getRange(startRow, c, rows.length, 1).setNumberFormat('@');
  });
  sh.getRange(startRow, 1, rows.length, COL_COUNT).setValues(rows);
}

/**
 * 시트 값에서 앞의 0이 떨어졌으면 원본 값으로 되돌린다.
 * 사람이 실제로 고친 값은 그대로 둔다 — 0만 잃은 경우에만 되돌린다.
 */
function keepZeros_(sheetVal, rawVal) {
  var s = String(sheetVal == null ? '' : sheetVal).trim();
  var r = String(rawVal == null ? '' : rawVal).trim();
  if (!r) return s;
  if (!s) return r;
  if (s === r) return s;
  if (!/^[0-9]+$/.test(s) || !/^0+[0-9]+$/.test(r)) return s;
  // 0을 떼고 같은 숫자면 시트에서 0이 떨어진 것이다
  return r.replace(/^0+/, '') === s.replace(/^0+/, '') ? r : s;
}

function isBizRow_(v) {
  return String(v[COL.NOTE - 1] || '').indexOf(NOTE_BIZ) >= 0;
}

/**
 * 법인주문 행을 눈에 띄게 한다 — 연한 초록 바탕 + 굵은 글씨.
 *
 * 이미 칠해진 오류색(붉은·노란 칸)은 건드리지 않는다. 법인이면서 오류도 있는 행은
 * 오류 표기가 그대로 보이고, 굵은 글씨로 법인임을 같이 알 수 있다.
 *
 * @param sh 시트
 * @param startRow 첫 행 번호
 * @param rows 값 배열 (startRow 부터 이어지는 행들)
 */
function markBizRows_(sh, startRow, rows) {
  if (!sh || !rows || !rows.length) return 0;
  var n = 0;
  rows.forEach(function (v, i) {
    if (!isBizRow_(v)) return;
    var rng = sh.getRange(startRow + i, 1, 1, COL_COUNT);
    var cur = rng.getBackgrounds()[0];
    rng.setBackgrounds([cur.map(function (c) {
      return String(c).toLowerCase() === BG_NONE ? BG_BIZ : c;
    })]);
    rng.setFontWeight('bold');
    n++;
  });
  return n;
}

// 색을 관리하는 칸 — 손으로 채울 수 있는 KSE 필수값만.
// 여기 없는 칸은 건드리지 않으므로 사용자가 직접 칠한 색은 그대로 남는다.
var WARN_COLS = [COL.RECEIVER, COL.TEL, COL.ZIP, COL.ADDRESS, COL.WEIGHT, COL.TOTAL];

/**
 * 확인 필요 칸에 색을 입히고, 채워진 칸의 색은 지운다.
 *
 * 셀 하나씩 setBackground 하면 수백 행에서 실행시간 제한에 걸린다.
 * 배경색을 범위째로 한 번 읽고 한 번 쓴다 (호출 2회).
 *
 * @param {Object} warnSet  경고할 칸 — { 'row,col': true }
 * @param {Array<number>} rows  손볼 행 번호 (시트 기준, 1-based)
 */
function applyWarnColors_(warnSet, rows, sheet) {
  if (!rows.length) return;
  var sh = sheet || ordersSheet_();
  if (sh.getLastRow() < 2) return;

  var n = sh.getLastRow() - 1;
  var rng = sh.getRange(2, 1, n, COL_COUNT);
  var bg = rng.getBackgrounds();
  // 경고를 지울 때 흰색이 아니라 그 행의 바탕색으로 되돌린다 (법인주문 행 색 보존)
  var notes = sh.getRange(2, COL.NOTE, n, 1).getValues();
  var changed = false;

  rows.forEach(function (r) {
    var i = r - 2;
    if (i < 0 || i >= n) return;
    var base = rowBaseColor_(notes[i] && notes[i][0]);
    WARN_COLS.forEach(function (c) {
      var want = warnSet[r + ',' + c] ? BG_WARN : base;
      if (String(bg[i][c - 1]).toLowerCase() !== want) {
        bg[i][c - 1] = want;
        changed = true;
      }
    });
  });

  if (changed) rng.setBackgrounds(bg);
}

/**
 * KSE 가이드에서 Require=Y 인 값이 채워졌는지 본다.
 * @return {Array} 빈 항목의 [이름, 컬럼번호] 목록
 */
function missingRequired_(v) {
  var out = [];
  if (!String(v[COL.RECEIVER - 1]).trim()) out.push(['수취인', COL.RECEIVER]);
  if (zipJP_(v[COL.ZIP - 1]).length !== 7) out.push(['우편번호', COL.ZIP]);
  if (!String(v[COL.ADDRESS - 1]).trim()) out.push(['주소', COL.ADDRESS]);
  if (!String(v[COL.TEL - 1]).trim()) out.push(['전화번호', COL.TEL]);
  return out;
}

// ── 로그 ─────────────────────────────────────────────────────────────────
/**
 * 지우고 나면 고정행(제목)만 남는 경우 맨 아래에 빈 행을 먼저 덧붙인다.
 *
 * 구글 시트는 고정되지 않은 행을 전부 지우는 것을 거부한다
 * ("고정되지 않은 행을 모두 삭제할 수는 없습니다"). 행을 옮길 때마다 시트가 줄어들기 때문에
 * 마지막 남은 주문을 옮기거나 비우기를 할 때 걸린다.
 */
function keepSpareRows_(sh, deleting) {
  var frozen = Math.max(sh.getFrozenRows(), 1);
  var max = sh.getMaxRows();
  if (max - deleting > frozen) return;
  var add = 50;
  sh.insertRowsAfter(max, add);
  // 덧붙인 행은 바로 위 행의 서식(경고색·법인 초록·굵게)을 물려받으므로 되돌린다
  var rng = sh.getRange(max + 1, 1, add, sh.getMaxColumns());
  rng.setBackground(null);
  rng.setFontWeight('normal');
  rng.clearNote();
}

/** 행 번호 목록을 아래에서 위로 지운다 (행 번호가 밀리지 않게) */
function deleteRowsAt_(sh, rowNums) {
  if (!rowNums || !rowNums.length) return;
  keepSpareRows_(sh, rowNums.length);
  rowNums.slice().sort(function (a, b) { return b - a; })
    .forEach(function (rowNum) { sh.deleteRow(rowNum); });
}

function log_(step, message) {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
    if (sh) sh.appendRow([nowStr_(), step, String(message).slice(0, 4000)]);
  } catch (e) {
    Logger.log(step + ': ' + message);
  }
}
