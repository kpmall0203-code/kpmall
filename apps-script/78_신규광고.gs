/**
 * 78_신규광고.gs — NEW_ADS 의 그릇: 새 파일 접근 · 설정 · 표 스키마 · 정책 읽기
 *
 * ── 왜 파일을 따로 두나 ─────────────────────────────────
 * 운영 시트는 이미 516만 셀(구글 한도 1,000만의 51.6%)이다. 신규 상품은 주 1,000 상품군씩
 * 들어오고 [상품통합] 한 표만 해도 30열 × 주 1,000줄 = 1년 150만 셀이다. 여기 넣으면
 * 올해 안에 한도에 닿는다. 그래서 자료만 새 파일에 두고 코드는 이 프로젝트에 남긴다 —
 * 자격증명·API 층(72_광고)·대장(72F)·캠페인 생성(72J)·상품광고목록(72AC)·원가(57)·
 * 환율(50)·가격선(72AH)·재개 가능한 걸음(72X)을 그대로 쓰기 위해서다.
 *
 * ── 두 한도의 역할이 다르다 ─────────────────────────────
 * [주간 시작 상품군 수] 는 처리량이고 [탐색 주간 지출한도] 는 안전망이다. 1,000개에
 * 판돈(평균 ¥400)을 미리 예약하면 주 ¥400,000 이 잠기는데, 실제로는 그만큼 쓰지 않는다 —
 * 지금 신규가 들어가는 'ad for x and tiktok'(SKU 12,463개)이 주 ¥101,873 을 쓴다.
 * 새 상품은 클릭이 잘 안 붙어 판돈을 다 태우는 일이 드물다. 그래서 돈은 '이번 주 실지출'
 * 로 재고, 판돈은 상품군마다 제 원장에서 지킨다 (예약을 쌓지 않는다).
 *
 * ── 돈이 나가는 자리는 ② 실행 하나뿐 ───────────────────
 * ① 가져오기는 읽고 셈하고 적기만 한다. ② 실행은 [신규 · 모드] 가 자동운영일 때만
 * 아마존에 보낸다. 기본은 모의운영이다.
 */

var NA_TRACK = 'N';                      // 광고생성계획 [트랙] 칸 — NEW_ADS 가 만든 줄
var NA_BASIS_ID_KEY = '신규광고 시트 ID';   // 광고기준에 적어 두는 새 파일 ID

// ── 새 파일의 표 ─────────────────────────────────────────
var NA_SHEET_CFG = '설정';
var NA_SHEET_ITEM = '상품통합';
var NA_SHEET_FAM = '상품군광고';

/**
 * 칸을 늘릴 때는 반드시 **뒤에 붙인다**. 가운데 끼우면 아래 번호들이 한 칸씩 밀려
 * 이미 쌓인 자료를 엉뚱한 칸에서 읽는다 — 번호는 코드에 박혀 있고 자료는 시트에 있다.
 * naMigrate_() 가 머리글만 보고 빠진 칸을 뒤에 채운다.
 */
var NA_ITEM_HEADER = [
  'SKU', 'ASIN', '상품군키', '상품명', '소싱URL',
  '조달비(KRW)', '조달비(JPY)', '판매가(JPY)', '마진율(%)', '마진출처',
  '주문당공헌이익(JPY)', '판단주문율(%)', '허용입찰(JPY)', '시작입찰(JPY)',
  '대표', '배분', '사유', '상태', '소유', '수집일시', '들어온날', '다음평가일',
  '캠페인', '캠페인ID', '광고그룹ID', '시작일', '광고ID들'
];
var NA_I_SKU = 0, NA_I_ASIN = 1, NA_I_FAM = 2, NA_I_NAME = 3, NA_I_URL = 4,
    NA_I_KRW = 5, NA_I_JPY = 6, NA_I_PRICE = 7, NA_I_MPCT = 8, NA_I_MSRC = 9,
    NA_I_G = 10, NA_I_Q = 11, NA_I_CAP = 12, NA_I_BID = 13,
    NA_I_REP = 14, NA_I_ALLOC = 15, NA_I_WHY = 16, NA_I_STATE = 17, NA_I_OWNER = 18,
    NA_I_AT = 19, NA_I_IN = 20, NA_I_NEXT = 21,
    NA_I_CAMP = 22, NA_I_CID = 23, NA_I_GID = 24, NA_I_START = 25, NA_I_ADIDS = 26;
var NA_ITEM_ID_COLS = [24, 25, 27];      // 1부터 — 16자리 ID 는 글자로 못 박는다

var NA_FAM_HEADER = [
  '상품군키', '옵션수', '대표SKU', '이전대표', '상품명',
  '판돈(JPY)', '누적탐색비(JPY)', '위험손실(JPY)', '남은판돈(JPY)',
  '상태', '사유', '처음편입일', '냉각해제일', '시작일', '캠페인'
];
var NA_F_KEY = 0, NA_F_N = 1, NA_F_REP = 2, NA_F_PREV = 3, NA_F_NAME = 4,
    NA_F_POT = 5, NA_F_SPENT = 6, NA_F_RISK = 7, NA_F_LEFT = 8,
    NA_F_STATE = 9, NA_F_WHY = 10, NA_F_IN = 11, NA_F_COOL = 12,
    NA_F_START = 13, NA_F_CAMP = 14;

// ── 배분 ─────────────────────────────────────────────────
var NAA_EVID = '검증근거운영';
var NAA_START = '소액자동시작';
var NAA_VARWAIT = '옵션대기';
var NAA_BUDWAIT = '예산대기';
var NAA_EXCLUDE = '광고제외';
var NAA_INFO = '정보대기';

// ── 상태 ─────────────────────────────────────────────────
var NAS_NEW = '가져옴';
var NAS_INFO = '정보대기';
var NAS_VARWAIT = '옵션대기';
var NAS_BUDWAIT = '예산대기';
var NAS_PROBE = '소액운영';
var NAS_WATCH = '관찰';
var NAS_PROFIT = '수익운영';
var NAS_HANDED = '인계';
var NAS_MATURE = '성숙대기';
var NAS_COOL = '냉각';
var NAS_EXCLUDE = '제외';
var NAS_STOP = '중단';

// ── 사유 ─────────────────────────────────────────────────
var NAR_NOT_LISTED = 'NOT_LISTED_YET';
var NAR_MARGIN_MISSING = 'MARGIN_MISSING';
var NAR_MARGIN_MISMATCH = 'MARGIN_MISMATCH';
var NAR_BELOW_MIN = 'BELOW_ECONOMIC_MINIMUM';
var NAR_ALREADY = 'ALREADY_ADVERTISED';
var NAR_VARWAIT = 'VARIANT_WAIT';
var NAR_FAM_OUT = 'FAMILY_BUDGET_EXHAUSTED';
var NAR_WEEKLY = 'WEEKLY_CAP';
var NAR_LISTING_OFF = 'LISTING_INACTIVE';
var NAR_NO_STOCK = 'NO_STOCK';
var NAR_LOSS = 'MARGIN_NEGATIVE';
var NAR_HOLD = 'MANUAL_HOLD';            // 소유가 NEW_ADS 가 아닌 줄 — 사람이 잡고 있다
var NA_OWNER = 'NEW_ADS';
var NA_MISMATCH_PP = 5;                  // 바깥 시트 마진율과 이만큼(%p) 어긋나면 사유에 표시한다

/**
 * 리스팅에서 '살 수 있다' 고 볼 상태. 실측 분포(2026-09-10 · 26,811줄):
 *   Active 22,475 · Incomplete 3,228 · Inactive 1,108
 * 그리고 Active 는 전부 재고 > 0, Inactive·Incomplete 는 12줄만 빼고 전부 재고 0 이다.
 *
 * ⚠ 부분 문자열로 보면 안 된다 — 'Inactive'.indexOf('active') 는 2 를 돌려준다.
 * 그렇게 짰다가 비활성 1,108개를 '활성' 으로 읽었다 (2026-09-10 시뮬레이터가 잡았다).
 */
var NA_LISTING_OK = { 'active': 1 };

var NA_MIN_BID = 2;                      // 아마존 최소 입찰
var NA_SOFT_MS = 210 * 1000;             // 한 번에 도는 부드러운 마감 (6분 한도 안쪽)

/**
 * 설정 기본값. 돈이 걸린 값도 사용자가 위임해 기본값을 둔다 —
 * 다만 [모드] 는 모의운영에서 시작하므로 값만으로는 아무것도 나가지 않는다.
 */
var NA_CFG_DEFAULTS = [
  ['신규 · 모드', '모의운영',
   '모의운영 = 읽고 셈하고 적기만 한다 · 자동운영 = ② 실행이 실제로 캠페인을 만든다'],
  ['신규 · 주간 시작 상품군 수', 1000,
   '한 주에 새로 광고를 시작할 상품군 수. 도착이 이보다 많으면 ' + NAR_WEEKLY + ' 로 다음 주에 다시 줄 선다'],
  ['신규 · 탐색 주간 지출한도(JPY)', 120000,
   '안전망. 이번 주 NEW_ADS 실지출(+아직 보고 안 된 2일치)이 이 값을 넘으면 새 시작을 멈춘다. ' +
   '이미 도는 광고는 끄지 않는다 — 수익 광고도 탐색 중인 것도. 예약을 쌓지 않고 실지출로 잰다'],
  ['신규 · 상품군 탐색비 상한(JPY)', 1000,
   '상품군 하나가 근거를 얻을 때까지 평생 써 볼 최대 광고비(판돈). 실제로는 ' +
   '[주문당공헌이익 × 탐색배수] 가 먼저 걸린다. 옵션이 여섯이어도 판돈은 상품군에 하나다'],
  ['신규 · 상품군 탐색배수', 0.50,
   '판돈 = min(위 상한, 주문당공헌이익 × 이 값). 0.5 면 "주문 한 건 이익의 절반까지 써 본다"'],
  ['신규 · 시드 주문율', 0.02,
   '실적이 없는 새 상품에 처음 가정하는 광고 주문율. 계정 평균(3.75%)을 쓰지 않는다 — ' +
   '그것은 리뷰·순위가 쌓인 상품이 만든 값이라 갓 등록한 상품에는 보수적이지 않다. ' +
   'NEW_ADS 자기 집단의 성숙 클릭이 500 을 넘으면 그 실측으로 갱신한다'],
  ['신규 · 이익보존계수', 0.50,
   '허용 입찰 = 주문당공헌이익 × 판단주문율 × 이 값. 예상 이익의 절반까지만 광고에 쓴다'],
  ['신규 · 시작 비율', 0.70, '시작 입찰 = 허용 입찰 × 이 값. 상한에 바로 붙지 않고 아래에서 시작한다'],
  ['신규 · 최대 유효입찰(JPY)', '',
   '비우면 광고기준의 [확대 · 최대 유효입찰] 을 따른다. 어떤 셈이 나와도 이 값을 넘겨 부르지 않는다'],
  ['신규 · 탐색 활성일', 14, '한 상품군을 며칠까지 탐색할까. 판돈이 먼저 떨어지면 그때 멈춘다'],
  ['신규 · 냉각(일)', 28, '중단한 상품군을 며칠 뒤에 다시 볼까'],
  ['신규 · 상품군당 최대 활성 옵션', 1, '대표 하나. 수익이 확인되고 한도가 남으면 2 까지'],
  ['신규 · 옵션 가격대(%)', 110,
   '근거가 없을 때 대표를 고르는 폭. 가장 싼 적격 옵션의 이 %% 안에 드는 것들 중에서 고른다'],
  ['신규 · 풀 캠페인당 그룹 수', 20, '가격선 캠페인 하나에 광고그룹(=SKU) 몇 개를 담을까'],
  ['신규 · 판정 유지 주문', 2, '이만큼 성숙 주문이 있고 이익이 양수면 수익운영'],
  ['신규 · 인계 클릭', 50, '이만큼 성숙 클릭이 쌓이고'],
  ['신규 · 인계 주문', 3, '이만큼 성숙 주문이 있고 이익이 양수면 확대(EXPAND)에 넘긴다'],
  ['신규 · 인계 켜기', 'FALSE',
   'TRUE 면 근거가 쌓인 SKU 의 소유권을 EXPAND 로 넘긴다. ⚠ EXPAND 쪽이 KP NEW 캠페인을 ' +
   '제 것으로 알아보고 광고실적에 그 SKU 를 남기는 받을 준비가 아직 없다 — 그 전에 켜면 ' +
   '넘긴 SKU 를 아무도 안 본다. 준비될 때까지 FALSE 로 두고 수익운영에 머문다']
];

/** 새 파일을 연다. ID 가 없으면 무엇을 해야 하는지 말한다 */
function naSS_() {
  var id = '';
  try { id = String(adBasis_()[NA_BASIS_ID_KEY] || '').trim(); } catch (e) { id = ''; }
  if (!id) {
    throw new Error('광고기준에 [' + NA_BASIS_ID_KEY + '] 가 비어 있습니다.\n' +
      '신규 상품 광고 자료를 담을 스프레드시트를 만들고 그 ID 를 적어 주세요.\n' +
      '(운영 시트는 이미 한도의 절반을 써서 여기에 표를 더 넣지 않습니다)');
  }
  try { return SpreadsheetApp.openById(id); }
  catch (e) {
    throw new Error('[' + NA_BASIS_ID_KEY + '] 로 적힌 시트를 열 수 없습니다 (' + id + ').\n' + e);
  }
}

/** 새 파일의 표 하나. 없으면 머리글과 함께 만든다 */
function naSheet_(name, header) {
  var ss = naSS_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (header && header.length) {
      sh.getRange(1, 1, 1, header.length).setValues([header])
        .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      if (sh.getMaxColumns() > header.length) {
        sh.deleteColumns(header.length + 1, sh.getMaxColumns() - header.length);
      }
    }
  } else if (header && header.length && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header])
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * 표에 빠진 칸을 뒤에 채운다. 이미 쌓인 자료는 건드리지 않는다.
 *
 * 왜 필요한가: ② 를 만들면서 [캠페인]·[캠페인ID]·[광고그룹ID]·[시작일] 이 늘었다.
 * 시트는 이미 639줄을 담고 있어 다시 만들 수 없다. 머리글만 보고 뒤에 붙인다.
 * @return {number} 채운 칸 수
 */
function naMigrate_() {
  var n = 0;
  var specs = [[NA_SHEET_ITEM, NA_ITEM_HEADER, NA_ITEM_ID_COLS],
               [NA_SHEET_FAM, NA_FAM_HEADER, []]];
  for (var i = 0; i < specs.length; i++) {
    var name = specs[i][0], want = specs[i][1], idCols = specs[i][2];
    var sh = naSheet_(name, want);
    var have = sh.getLastColumn() > 0
      ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    // 이름이 다르면 우리가 아는 표가 아니다 — 손대지 않고 알린다
    for (var c = 0; c < Math.min(have.length, want.length); c++) {
      if (String(have[c]).trim() !== want[c]) {
        log_('newads', 'WARN', '[' + name + '] ' + (c + 1) + '번째 칸이 "' + have[c] +
             '" 입니다 (기대: "' + want[c] + '") — 칸을 늘리지 않았습니다');
        return n;
      }
    }
    if (have.length >= want.length) continue;
    if (sh.getMaxColumns() < want.length) sh.insertColumnsAfter(sh.getMaxColumns(), want.length - sh.getMaxColumns());
    var addN = want.length - have.length;
    sh.getRange(1, have.length + 1, 1, addN).setValues([want.slice(have.length)])
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    for (var d = 0; d < idCols.length; d++) {
      if (idCols[d] > have.length) sh.getRange(2, idCols[d], Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
    }
    n += addN;
    log_('newads', 'INFO', '[' + name + '] 칸 ' + addN + '개를 뒤에 붙였습니다: ' + want.slice(have.length).join(' · '));
  }
  return n;
}

/** 메뉴: 새 파일에 표 셋을 만들고 설정 기본값을 채운다 (있으면 빠진 항목만) */
function setupNewAds() {
  var ss = naSS_();
  var made = [];
  var specs = [[NA_SHEET_CFG, ['항목', '값', '설명']],
               [NA_SHEET_ITEM, NA_ITEM_HEADER],
               [NA_SHEET_FAM, NA_FAM_HEADER]];
  for (var i = 0; i < specs.length; i++) {
    if (!ss.getSheetByName(specs[i][0])) made.push(specs[i][0]);
    naSheet_(specs[i][0], specs[i][1]);
  }
  var grew = naMigrate_();
  var add = naCfgFill_();
  // 처음 만들면 기본 시트1 이 남아 있다 — 비어 있으면 치운다
  try {
    var s1 = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
    if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  } catch (e) {}
  naItemNotes_();
  log_('newads', 'INFO', '신규광고 설치 — 표 ' + made.length + '개 · 설정 ' + add + '개');
  ui_().alert('신규 상품 광고 — 설치',
    (made.length ? '표를 만들었습니다: ' + made.join(' · ') + '\n' : '표는 이미 있습니다.\n') +
    (add ? '설정 ' + add + '개를 채웠습니다.\n' : '설정은 이미 다 있습니다.\n') +
    (grew ? '표에 칸 ' + grew + '개를 뒤에 붙였습니다.\n' : '') +
    '\n파일: ' + ss.getName() + '\n\n' +
    '[신규 · 모드] 는 "모의운영" 입니다 — ② 실행을 눌러도 아마존에 아무것도 보내지 않습니다.\n' +
    '먼저 [① 광고할 물건 가져오기] 로 배분이 어떻게 나오는지 보세요.',
    ui_().ButtonSet.OK);
}

/** 설정 표에 빠진 기본값을 채운다. @return {number} 채운 수 */
function naCfgFill_() {
  var sh = naSheet_(NA_SHEET_CFG, ['항목', '값', '설명']);
  var have = {};
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < v.length; i++) have[String(v[i][0]).trim()] = true;
  }
  var add = [];
  for (var d = 0; d < NA_CFG_DEFAULTS.length; d++) {
    if (!have[NA_CFG_DEFAULTS[d][0]]) add.push(NA_CFG_DEFAULTS[d]);
  }
  if (add.length) {
    var at = Math.max(sh.getLastRow(), 1) + 1;
    if (sh.getMaxRows() < at + add.length - 1) sh.insertRowsAfter(sh.getMaxRows(), at + add.length - 1 - sh.getMaxRows());
    sh.getRange(at, 1, add.length, 3).setValues(add);
  }
  return add.length;
}

/** 설정 표 → {항목: 값} (빠진 것은 기본값) */
var NA_CFG_ = null;
function naCfg_(fresh) {
  if (!fresh && NA_CFG_) return NA_CFG_;
  var out = {};
  for (var d = 0; d < NA_CFG_DEFAULTS.length; d++) out[NA_CFG_DEFAULTS[d][0]] = NA_CFG_DEFAULTS[d][1];
  try {
    var sh = naSS_().getSheetByName(NA_SHEET_CFG);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < v.length; i++) {
        var k = String(v[i][0]).trim();
        if (k && String(v[i][1]) !== '') out[k] = v[i][1];
      }
    }
  } catch (e) { log_('newads', 'WARN', '설정을 못 읽어 기본값을 씁니다: ' + String(e).substring(0, 120)); }
  NA_CFG_ = out;
  return out;
}

/**
 * 셈에 쓰는 정책. 값 하나하나를 숫자로 못 박아 둔다.
 * @return {Object}
 */
function naPolicy_() {
  var c = naCfg_();
  var num = function (k, d) { var v = Number(c[k]); return isFinite(v) && v > 0 ? v : d; };
  var p = {
    mode: String(c['신규 · 모드'] || '모의운영').trim(),
    weekStarts: Math.round(num('신규 · 주간 시작 상품군 수', 1000)),
    weekSpend: num('신규 · 탐색 주간 지출한도(JPY)', 120000),
    famPot: num('신규 · 상품군 탐색비 상한(JPY)', 1000),
    famMult: num('신규 · 상품군 탐색배수', 0.50),
    q0: num('신규 · 시드 주문율', 0.02),
    beta: num('신규 · 이익보존계수', 0.50),
    startFrac: num('신규 · 시작 비율', 0.70),
    probeDays: Math.round(num('신규 · 탐색 활성일', 14)),
    cooldown: Math.round(num('신규 · 냉각(일)', 28)),
    maxVariants: Math.round(num('신규 · 상품군당 최대 활성 옵션', 1)),
    priceBand: num('신규 · 옵션 가격대(%)', 110) / 100,
    poolGroups: Math.round(num('신규 · 풀 캠페인당 그룹 수', 20)),
    keepOrders: Math.round(num('신규 · 판정 유지 주문', 2)),
    handClicks: Math.round(num('신규 · 인계 클릭', 50)),
    handOrders: Math.round(num('신규 · 인계 주문', 3)),
    handover: String(c['신규 · 인계 켜기']).trim().toUpperCase() === 'TRUE'
  };
  // 최대 유효입찰은 비우면 광고기준의 확대 값을 따른다 — 두 프로그램이 같은 천장을 쓴다
  var mb = Number(c['신규 · 최대 유효입찰(JPY)']);
  if (!(isFinite(mb) && mb > 0)) {
    try { mb = Number(adBasis_()['확대 · 최대 유효입찰(JPY)']) || 0; } catch (e) { mb = 0; }
  }
  p.maxBid = isFinite(mb) && mb > 0 ? mb : 0;
  p.need = [];
  if (!p.maxBid) p.need.push('최대 유효입찰(JPY) — 광고기준이나 신규 설정 어느 쪽이든');
  p.ready = !p.need.length;
  p.canAuto = p.ready && p.mode === '자동운영';
  return p;
}

/** 왜 지금 못 보내는가 */
function naGateText_(pol) {
  if (!pol.ready) {
    return '⚠ 돈이 걸린 값이 비어 있어 보낼 수 없습니다:\n   ' + pol.need.join('\n   ') + '\n\n';
  }
  if (!pol.canAuto) {
    return '⚠ [신규 · 모드] 가 "' + pol.mode + '" 입니다 — 계획만 세우고 보내지 않습니다.\n' +
           '   실제로 시작하려면 설정에서 "자동운영" 으로 바꾸세요.\n\n';
  }
  return '';
}

/** 상품군키 — SKU 끝의 "-숫자" 를 뗀다 (옵션은 대개 수량 배수다) */
function naFamilyKey_(sku) {
  var s = String(sku || '').trim();
  return s.replace(/-\d+$/, '') || s;
}

function naItemNotes_() {
  try {
    headerNotes_(naSheet_(NA_SHEET_ITEM, NA_ITEM_HEADER), 1, NA_ITEM_HEADER, {
      '상품군키': 'SKU 끝의 "-숫자" 를 뗀 것. 옵션(수량 배수)들이 한 상품군이다.\n' +
        '판돈은 상품군에 하나 걸린다 — 옵션이 여섯이어도 탐색비를 여섯 배 주지 않는다.',
      '주문당공헌이익(JPY)': '판매가 − 조달비 − 수수료 − 배송비. 광고비를 빼기 전 값이다.\n' +
        '판매가에는 고객 배송비가 이미 들어 있다(送料込み) — 그래서 따로 더하지 않는다.',
      '판단주문율(%)': '실적이 없으면 [신규 · 시드 주문율], 쌓이면 (주문 + 50 × 시드) ÷ (클릭 + 50).\n' +
        '계정 평균을 쓰지 않는다 — 리뷰·순위가 쌓인 상품이 만든 값이라 새 상품에 보수적이지 않다.',
      '허용입찰(JPY)': '= 주문당공헌이익 × 판단주문율 × [이익보존계수]. 이 값을 넘겨 부르지 않는다.',
      '시작입찰(JPY)': '= 허용입찰 × [시작 비율]. 상한에 바로 붙지 않고 아래에서 시작한다.',
      '마진출처': '앞에 있는 것이 이긴다 — 기준값 시트 → 표에 적은 값 → 원가 탭 → 소싱 조달비 → 이름 매칭 → 기본값.\n' +
        '신규 상품은 대개 [소싱 조달비] 다 (바깥 상품 목록의 조달비로 실측).',
      '배분': NAA_START + ' = 대표 옵션만 소액으로 시작\n' +
        NAA_VARWAIT + ' = 같은 상품군의 대표가 이미 관리 중\n' +
        NAA_BUDWAIT + ' = 적격이지만 이번 주 몫이 찼다 (다음 주에 다시 줄 선다)\n' +
        NAA_EXCLUDE + ' = 마진 ≤ 0 · 허용입찰 < ¥' + NA_MIN_BID + ' · 이미 광고 중 · 리스팅 비활성\n' +
        NAA_INFO + ' = 아직 아마존에 없음 · 조달비/판매가 모름',
      '시작일': '광고가 실제로 만들어진 날. 주간 시작 수는 이 날짜로 센다 (월요일 기준).',
      '캠페인ID': '16자리라 글자로 못 박아 둔다 — 숫자로 두면 끝자리가 깎인다.',
      '광고ID들': '만들 때 받은 상품광고 ID. [상품광고목록] 은 주 1회 수집이라 새 광고가 거기 오르기 전에도\n' +
        '이것으로 멈추고 다시 켠다. 없으면 그 일주일은 멈출 수가 없다.',
      '소유': '이 SKU 를 만지는 프로그램. NEW_ADS 가 첫 수익 근거까지 데려가고 그 뒤는 EXPAND 에 넘긴다.\n' +
        '한 SKU 를 두 프로그램이 함께 만지지 않는다.\n' +
        '사람이 잡아 두려면 이 칸을 다른 말(예: 사람)로 바꾸세요 — 그 줄은 가져오기·실행이 다시 건드리지 않습니다 (' + NAR_HOLD + ').',
      '상태': '가져옴·정보대기·옵션대기·예산대기는 가져오기를 누를 때마다 다시 셈한다 —\n' +
        '아직 아마존에 없던 것이 올라오면, 비활성이던 리스팅이 살아나면 저절로 시작 대기로 옮겨 간다.\n' +
        '소액운영 이후(관찰·수익운영·인계·성숙대기·중단·냉각)는 매일 주기만 바꾼다.'
    });
  } catch (e) {}
}
