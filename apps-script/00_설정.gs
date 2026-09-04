/**
 * 00_설정.gs — 전역 상수
 *
 * 이 스크립트가 하는 일:
 *   1) 아마존 SP-API에서 전체 리스팅(SKU·ASIN·일본어 상품명)을 받아 "리스팅" 탭에 기록
 *   2) 일본어 상품명을 한글로 자동 번역해 검색어로 쓸 수 있게 저장
 *   3) 크롬 확장이 읽어갈 수 있도록 JSON 웹앱으로 제공
 *
 * 번역을 GOOGLETRANSLATE 수식이 아니라 LanguageApp으로 하는 이유:
 *   수식은 1만 행 규모에서 재계산이 끝나지 않거나 #ERROR!를 뱉는다.
 *   LanguageApp은 같은 번역 엔진이지만 결과를 "값"으로 저장할 수 있어 안정적이다.
 *   대신 일일 호출 한도가 있어 나눠서 처리하고, 다음 날 자동으로 이어서 한다.
 */

// ── 탭 이름 ──────────────────────────────────────────────
var SHEET_LISTING = '리스팅';
var SHEET_LOG = '로그';

// ── 리스팅 탭 스키마 ─────────────────────────────────────
var LISTING_HEADER = [
  'SKU', 'ASIN', '일본어상품명', '한글명(자동번역)', '검색어(수동)',
  '번역일시', '가격(JPY)', '재고', '상태'
];
var L_SKU = 0, L_ASIN = 1, L_JP = 2, L_KR = 3, L_MANUAL = 4,
    L_TRAT = 5, L_PRICE = 6, L_QTY = 7, L_STATUS = 8;

// ── SP-API ───────────────────────────────────────────────
var SPAPI_BASE = 'https://sellingpartnerapi-fe.amazon.com';
var MARKETPLACE_JP = 'A1VC38T7YXB528';
var REPORT_TYPE = 'GET_MERCHANT_LISTINGS_ALL_DATA';

// JP 마켓플레이스 리포트는 컬럼명이 일본어로 온다. 영문은 폴백.
var HDR_SKU = ['出品者SKU', 'seller-sku', 'sku'];
var HDR_NAME = ['商品名', 'item-name', 'title'];
var HDR_PID = ['商品ID', 'product-id', 'asin1', 'asin'];
var HDR_PRICE = ['価格', 'price'];
var HDR_QTY = ['数量', '在庫数', 'quantity'];
var HDR_STATUS = ['ステータス', 'status'];

// ── 번역 ─────────────────────────────────────────────────
// 엔진은 두 가지. Gemini API 키가 등록돼 있으면 그쪽을 쓴다.
//
//   [Gemini]      수백 건을 한 번에 묶어 보낸다. 단순 번역이 아니라 "한국 쇼핑몰에서
//                 검색할 이름"으로 만들어 준다. 蔘鶏湯→삼계탕, ククダス→쿠크다스 처럼
//                 원래 한국 상품명을 복원하는 게 강점.
//   [LanguageApp] 키가 없을 때의 대체 수단. 건당 호출이라 느리고 일일 한도가 있어
//                 며칠에 걸쳐 나눠 처리된다.
var TRANSLATE_CHUNK = 1200;          // LanguageApp 사용 시 1회 실행당 번역 건수

var GEMINI_MODEL = 'gemini-2.5-flash';
var GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
// 실측: 300건/26초, 200건/18초, 150건/12초.
// 재시도까지 감안한 여유를 두려고 150으로 잡는다.
var GEMINI_BATCH = 150;
var GEMINI_MIN_BATCH = 25;           // 응답이 어긋나면 반씩 줄여 재시도하는 하한

// Apps Script 실행 한도는 6분. 아래 두 단계로 나눠 지킨다.
//   SOFT: 새 API 호출을 더 시작하지 않는 시점
//   HARD: 재시도까지 즉시 중단하는 시점 (남은 시간은 시트 기록용으로 남겨둔다)
var TRANSLATE_SOFT_MS = 3.0 * 60 * 1000;
var TRANSLATE_HARD_MS = 4.2 * 60 * 1000;

// 한 번 실행에서 다루는 시트 행 범위. 읽기·쓰기 비용을 일정하게 유지한다.
var TR_WINDOW_ROWS = 750;
// 번역에 실제로 필요한 열만 읽고 쓴다: C(일본어상품명) ~ F(번역일시)
var TR_COL_START = 3;
var TR_COL_COUNT = 4;
var W_JP = 0, W_KR = 1, W_MANUAL = 2, W_TRAT = 3;

var CONTINUE_HANDLER = 'continueTranslation'; // 이어실행 트리거가 부르는 함수
var TRANSLATE_TIME_BUDGET_MS = 4.5 * 60 * 1000; // 6분 한도 대비 여유
var TRANSLATE_MAX_LEN = 240;         // 번역에 넘길 상품명 최대 길이
var TRANSLATE_MAX_WORDS = 8;         // 저장할 검색어의 최대 단어 수 (길면 검색 적중률이 떨어진다)

// 괄호류 (전각 포함 — 실제 상품명에 ［並行輸入品］처럼 전각이 섞여 온다)
var BRACKET_RE = /[（(\[［【][^）)\]］】]*[）)\]］】]/g;
// 괄호 안이 아래 표기뿐이면 통째로 버린다. 그 외(맛·색상·구성 등)는 내용을 살린다.
//   버림: 【並行輸入品】 (x 1)   살림: (6個セット、チーズ味)
var BRACKET_NOISE_RE = /並行輸入品|輸入品|正規品|送料無料|直送|クール便|訳あり|^[\sxX×*]*\d*\s*$/;

// ── Script Properties 키 ─────────────────────────────────
var PROP_LWA_ID = 'LWA_CLIENT_ID';
var PROP_LWA_SECRET = 'LWA_CLIENT_SECRET';
var PROP_LWA_REFRESH = 'LWA_REFRESH_TOKEN';
var PROP_SHARE_TOKEN = 'SHARE_TOKEN';       // 웹앱 조회용 토큰
var PROP_GEMINI_KEY = 'GEMINI_API_KEY';     // Gemini API 키 (없으면 LanguageApp으로 대체)
var PROP_TR_CURSOR = 'TRANSLATE_CURSOR';    // 번역 이어실행 커서 (행 위치)
var PROP_TR_PASS_PENDING = 'TR_PASS_PENDING'; // 이번 한 바퀴에서 남은 건수

var LOG_HEADER = ['일시', '구성요소', '레벨', '메시지'];
