/**
 * 53_리프라이싱.gs — 환율 리프라이싱 + 가격변경 대장
 *
 *   P1 = P0 × [ 1 + w × (r0/r1 − 1) ]
 *
 * 왜 원가를 몰라도 되는가:
 *   등록일    P0 × (1−f) = X/r0 + Ship
 *   오늘      P1 × (1−f) = X/r1 + Ship      (같은 원화 몫 X를 지키는 조건)
 *   두 식에서 X가 소거된다. X 안에 원가가 얼마였는지, 마진율이 30%였는지
 *   80%였는지 몰라도 된다 — 현재 판매가 P0 자체가 그 정보를 담고 있다.
 *
 * r0를 어디서 얻는가 (순서가 중요):
 *   1) 가격변경대장에 기록이 있으면 → 마지막 변경 시점의 환율
 *   2) 없으면 → 리스팅 open-date의 시장환율 (소급 복원)
 *   대장이 쌓이면 (2)에 의존할 일이 없어진다. 이번 같은 복원을 두 번 하지 않기 위한 장부.
 *
 * 이건 '가격 인상'이 아니라 '마진 복원'이다. 등록일에 의도했던 원화 마진으로
 * 되돌리는 것이지 더 벌자는 게 아니다.
 */

// ── 순수 계산부 (시트와 무관 — 단위 테스트 대상) ─────────

function computeNewPrice_(p0, r0, r1, w) {
  return p0 * (1 + w * (r0 / r1 - 1));
}

function roundUpJpy_(p) {
  return Math.ceil(p / PRICE_ROUND_JPY) * PRICE_ROUND_JPY;
}

/**
 * 가드레일 → {action, reason}
 *   skip      : 환율 노이즈 수준. 잦은 가격 변동은 카트에도 불리하다.
 *   review    : 전제가 깨졌거나 구조적 적자. 사람이 봐야 한다.
 *   hold_down : 인하는 별도 승인. 인상 실패는 '주문 감소'로 끝나지만
 *               인하 실패는 '전 주문 즉시 실현손 + 최저가 경쟁 유발'이라 비대칭이다.
 *   apply     : 반영 대상.
 *
 * floorJpy(원가 기반 최저가)는 선택 인자다. 이게 핵심 설계인데 —
 * 리프라이싱은 원가 없이도 돌아가야 하고(원가 입력은 오래 걸리는 일이다),
 * 원가를 넣은 SKU는 그 즉시 정확해져야 한다.
 *   원가 없음 : "잔여액 300엔 미만이면 검토" — 추정. 전체 평균에서 나온 문턱.
 *   원가 있음 : "손익분기 2,580엔 미달이면 검토" — 그 SKU의 실제 금액.
 * SKU 단위로 알아서 승격되므로, 원가는 아는 것부터 넣으면 된다.
 */
function decideAction_(oldPrice, newPrice, feeRate, estFeeJpy, allowDown, floorJpy) {
  var delta = newPrice / oldPrice - 1;
  if (Math.abs(delta) < MIN_DELTA) return { action: 'skip', reason: 'Δ=' + pct_(delta) + ' (1% 미만)' };
  if (Math.abs(delta) > MAX_DELTA) return { action: 'review', reason: 'Δ=' + pct_(delta) + ' (15% 초과 — 전제 확인)' };
  if (delta < 0 && !allowDown) return { action: 'hold_down', reason: '인하 ' + pct_(delta) + ' (별도 승인 필요)' };

  if (floorJpy > 0) {
    if (newPrice < floorJpy) {
      return { action: 'review',
               reason: '원가기준 최저가 ' + floorJpy + '엔 미달 (적자)' };
    }
  } else if (estFeeJpy > 0) {
    var residual = newPrice * (1 - feeRate) - estFeeJpy;
    if (residual < MIN_RESIDUAL_JPY) {
      return { action: 'review', reason: '잔여액 ' + Math.round(residual) + '엔 < ' + MIN_RESIDUAL_JPY + '엔 (구조적 적자 의심)' };
    }
  }
  return { action: 'apply', reason: 'Δ=' + pct_(delta) + (floorJpy > 0 ? ' [원가검증]' : '') };
}

/**
 * 원가 모듈이 아직 안 올라갔거나 원가 탭이 없어도 리프라이싱이 죽지 않게 감싼다.
 * 원가는 '있으면 더 정확해지는' 선택 입력이지 전제가 아니다.
 */
function costMapSafe_() {
  try { return costMap_(); } catch (e) { return {}; }
}

/** 그 SKU의 원가 기반 최저가. 원가를 모르면 0(= 추정 문턱을 쓰라는 뜻). */
function costFloorFor_(sku, shipJpy, rate, costs) {
  var c = costs[sku];
  if (!(c > 0) || !(rate > 0)) return 0;
  try {
    return roundUpJpy_(breakevenPriceJpy_(shipJpy, c, rate, DEFAULT_FEE_RATE) * BREAKEVEN_SAFETY);
  } catch (e) {
    return 0;   // 57_원가.gs 미탑재
  }
}

function pct_(x) { return (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%'; }

// ── 가격변경 대장 (#7) ───────────────────────────────────

function ensurePriceLog_() {
  return ensureSheet_(SHEET_PRICELOG, PRICELOG_HEADER);
}

/** SKU → {at, r1} 중 가장 최근 것. 반영된(TRUE) 기록만 신뢰한다. */
var _priceLogCache = null;
function priceLogMap_() {
  if (_priceLogCache) return _priceLogCache;
  var map = {};
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (sh && sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, PRICELOG_HEADER.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var sku = String(vals[i][PL_SKU] || '').trim();
      if (!sku) continue;
      if (vals[i][PL_APPLIED] !== true && String(vals[i][PL_APPLIED]).toUpperCase() !== 'TRUE') continue;
      var r1 = Number(vals[i][PL_R1]);
      var at = vals[i][PL_AT];
      if (!(r1 > 0) || !at) continue;
      var t = new Date(at).getTime();
      if (!map[sku] || t > map[sku].t) map[sku] = { t: t, r1: r1 };
    }
  }
  _priceLogCache = map;
  return map;
}

function clearPriceLogCache_() { _priceLogCache = null; }

/**
 * 그 SKU 가격에 박혀 있는 환율(r0).
 * 대장에 반영 기록이 있으면 그때 쓴 r1이 지금의 r0다. 없으면 등록일 시장환율.
 */
function r0ForSku_(sku, openDate, logMap) {
  var lg = logMap[sku];
  if (lg && lg.r1 > 0) return { r0: lg.r1, src: '대장' };
  if (!openDate) return { r0: null, src: '' };
  var r = fxRateOn_(openDate);
  return { r0: r, src: '등록일' };
}

/**
 * 직전 산출이 남긴 '미반영' 리프라이싱 행을 지운다.
 *
 * 산출(dry-run)은 몇 번이고 다시 돌릴 수 있는데, 돌릴 때마다 대장에
 * 미반영 행을 쌓으면 같은 SKU가 중복되고, 나중에 피드 생성이
 * sku|가격으로 매칭할 때 중복 행을 전부 TRUE로 만든다 (통합 테스트에서 실측).
 * 반영된(TRUE) 행은 역사이므로 절대 건드리지 않는다.
 */
function cleanupStalePriceLog_(reason) {
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (!sh || sh.getLastRow() < 2) return 0;
  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, 1, n, PRICELOG_HEADER.length).getValues();
  var keep = [];
  var dropped = 0;
  for (var i = 0; i < vals.length; i++) {
    // 사유에 구간 라벨이 붙으므로(예: '환율 리프라이싱 [2024년]') 접두로 맞춘다
    var stale = vals[i][PL_APPLIED] !== true &&
                String(vals[i][PL_REASON]).indexOf(reason) === 0;
    if (stale) { dropped++; continue; }
    keep.push(vals[i]);
  }
  if (!dropped) return 0;
  sh.getRange(2, 1, n, PRICELOG_HEADER.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, PRICELOG_HEADER.length).setValues(keep);
  clearPriceLogCache_();
  return dropped;
}

/** 대장에 기록 (반영여부는 피드 생성 시점에 TRUE로 바뀐다) */
function appendPriceLog_(rows) {
  if (!rows.length) return;
  var sh = ensurePriceLog_();
  var CH = 2000;
  for (var s = 0; s < rows.length; s += CH) {
    var part = rows.slice(s, s + CH);
    sh.getRange(sh.getLastRow() + 1, 1, part.length, PRICELOG_HEADER.length).setValues(part);
  }
  clearPriceLogCache_();
}

// ── 리프라이싱 산출 (#2) ─────────────────────────────────


/**
 * @param {boolean} allowDown 인하 포함 여부
 * @param {string} fromDate 등록일 하한 'YYYY-MM-DD' (빈값이면 제한 없음)
 * @param {string} toDate   등록일 상한 'YYYY-MM-DD' (빈값이면 제한 없음)
 * @param {string} label    화면·대장에 남길 구간 표기
 */
function repriceRun_(allowDown, fromDate, toDate, label) {
  var t0 = Date.now();
  fxClearCache_(); clearCostCache_(); clearPriceLogCache_();

  var r1 = fxHouseRate_();
  if (!r1) throw new Error('환율 데이터가 없습니다. 먼저 [환율 갱신]을 실행하세요.');

  var listSh = getSheetOrThrow_(SHEET_LISTING);
  var lastL = listSh.getLastRow();
  if (lastL < 2) throw new Error('리스팅이 비어 있습니다. [② 상품목록 갱신]을 먼저 실행하세요.');

  // 산출 전에 현재 가격을 통째로 떠 둔다. 되돌릴 수단을 먼저 확보하고 시작한다.
  var snap = takePriceSnapshot_('리프라이싱 산출 직전');

  // open-date는 기존 리스팅 탭에 없다. SP-API 리포트에서 별도 수집한 등록일 탭을 쓴다.
  var openMap = openDateMap_();
  var costMap = skuCostMap_();
  var logMap = priceLogMap_();
  clearExcludeCache_();
  var exclude = excludeMap_();
  // 원가는 선택 입력이다. 비어 있으면 {}가 오고 전체가 추정 모드로 돈다.
  var costs = costMapSafe_();
  var rateRecv = fxReceiveRate_() || r1;

  // 등록일 구간 필터. 한 번에 1만 건을 바꾸는 게 부담스러울 때 나눠 진행하기
  // 위한 것이다. '최근 N개월'이 아니라 구간(from~to)인 이유는, 최근 N개월은
  // 범위가 겹쳐서 이미 처리한 SKU가 계속 다시 딸려 오기 때문이다.
  // 구간으로 끊으면 2026년 → 2025년 → 2024년 식으로 겹침 없이 훑을 수 있다.
  fromDate = fromDate || '';
  toDate = toDate || '';

  var lv = listSh.getRange(2, 1, lastL - 1, LISTING_HEADER.length).getValues();
  var rows = [], logRows = [];
  var stat = { apply: 0, skip: 0, hold_down: 0, review: 0, no_r0: 0,
               excluded: 0, out_of_range: 0 };
  var nCostVerified = 0;
  var runId = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var now = new Date();

  for (var i = 0; i < lv.length; i++) {
    var sku = String(lv[i][L_SKU] || '').trim();
    if (!sku) continue;
    var p0 = Number(lv[i][L_PRICE]);
    if (!(p0 > 0)) continue;
    // 제외 목록에 있으면 아예 표에도 올리지 않는다 — 실수로 승인할 여지를 없앤다
    if (exclude[sku] && exclude[sku].reprice) { stat.excluded++; continue; }

    var openDate = openMap[sku] || '';
    if (fromDate || toDate) {
      if (!openDate ||
          (fromDate && openDate < fromDate) ||
          (toDate && openDate > toDate)) { stat.out_of_range++; continue; }
    }
    var r0info = r0ForSku_(sku, openDate, logMap);
    if (!r0info.r0) { stat.no_r0++; continue; }

    var ws = wForSku_(sku, costMap);
    var raw = computeNewPrice_(p0, r0info.r0, r1, ws.w);
    var p1 = roundUpJpy_(raw);
    // 원가를 아는 SKU만 정확한 손익분기로 검증된다 (나머지는 추정 문턱)
    var floor = costFloorFor_(sku, ws.fee || shippingFeeFor_(0.5, ws.cool), rateRecv, costs);
    if (floor > 0) nCostVerified++;
    var d = decideAction_(p0, p1, DEFAULT_FEE_RATE, ws.fee, allowDown, floor);
    stat[d.action]++;

    rows.push([
      d.action === 'apply',        // 체크박스 기본값: apply만 미리 체크해 둔다
      sku, lv[i][L_ASIN], p0, p1, p1 / p0 - 1,
      d.action, d.reason,
      Number(r0info.r0.toFixed(4)), Number(r1.toFixed(4)),
      ws.w, ws.s, ws.n, openDate + (r0info.src ? ' (' + r0info.src + ')' : ''),
      lv[i][L_STATUS]
    ]);

    if (d.action === 'apply') {
      logRows.push([now, sku, p0, p1, p1 / p0 - 1,
                    '환율 리프라이싱' + (label ? ' [' + label + ']' : ''),
                    Number(r1.toFixed(4)), ws.w, runId, false]);
    }
  }

  writeRepriceSheet_(rows, r1, runId, allowDown, stat, label);
  cleanupStalePriceLog_('환율 리프라이싱');   // 직전 산출의 미반영 행 정리 (재실행 중복 방지)
  appendPriceLog_(logRows);

  var msg = '리프라이싱 산출 ' + rows.length + '건 · 반영대상 ' + stat.apply +
            ' / 스킵 ' + stat.skip + ' / 인하보류 ' + stat.hold_down +
            ' / 검토 ' + stat.review + ' / r0없음 ' + stat.no_r0 +
            (stat.excluded ? ' / 제외 ' + stat.excluded : '') +
            (stat.out_of_range ? ' / 기간밖 ' + stat.out_of_range : '') +
            ' · 원가검증 ' + nCostVerified + '건' +
            ' (' + Math.round((Date.now() - t0) / 1000) + '초)';
  log_('reprice', 'INFO', msg);
  toast_(msg);
  try {
    ui_().alert(msg + '\n\n사내환율 r1 = ' + r1.toFixed(4) + ' KRW/JPY\n\n' +
      '■ 백업 완료 — 스냅샷 ' + snap.id + ' (' + snap.n.toLocaleString() + '건)\n' +
      '   언제든 [복구 피드 만들기]로 이 시점으로 되돌릴 수 있습니다.\n\n' +
      '"' + SHEET_REPRICE + '" 탭에서 승인 체크박스를 확인한 뒤\n' +
      '[승인분 가격 피드 생성]을 실행하세요.');
  } catch (e) {}
  return msg;
}

function writeRepriceSheet_(rows, r1, runId, allowDown, stat, label) {
  var sh = ensureSheet_(SHEET_REPRICE, REPRICE_HEADER);
  sh.clear();

  var info = '실행 ' + runId + ' · 사내환율 r1=' + r1.toFixed(4) +
             ' · 대상: ' + (label || '전체') +
             ' · 인하포함=' + (allowDown ? '예' : '아니오') +
             ' · 반영대상 ' + stat.apply + '건';
  sh.getRange(1, 1).setValue(info).setFontWeight('bold');
  sh.getRange(2, 1, 1, REPRICE_HEADER.length).setValues([REPRICE_HEADER]).setFontWeight('bold');

  if (rows.length) {
    var CH = 2000;
    for (var s = 0; s < rows.length; s += CH) {
      var part = rows.slice(s, s + CH);
      sh.getRange(3 + s, 1, part.length, REPRICE_HEADER.length).setValues(part);
    }
    var n = rows.length;
    sh.getRange(3, RP_OK + 1, n, 1).insertCheckboxes();
    sh.getRange(3, RP_DELTA + 1, n, 1).setNumberFormat('0.00%');
    sh.getRange(3, RP_S + 1, n, 1).setNumberFormat('0.000');
    sh.getRange(3, RP_W + 1, n, 1).setNumberFormat('0.000');

    // 판정별 색: 검토는 눈에 띄어야 하고, 스킵은 조용해야 한다.
    var colors = [];
    for (var i = 0; i < n; i++) {
      var a = rows[i][RP_ACTION];
      colors.push([a === 'review' ? '#fce8e6'
                 : a === 'hold_down' ? '#fef7e0'
                 : a === 'skip' ? '#f1f3f4' : '#e6f4ea']);
    }
    sh.getRange(3, RP_ACTION + 1, n, 1).setBackgrounds(colors);
  }
  sh.setFrozenRows(2);
  sh.autoResizeColumns(2, REPRICE_HEADER.length - 1);
}

/**
 * 승인된 행만 모아 아마존 가격 피드(TSV)를 Drive에 만든다.
 * Feeds API는 이 앱에 권한이 없어(403) 셀러센트럴에 수동 업로드해야 한다:
 *   카탈로그 > 업로드로 상품 등록 > 가격 및 수량 변경
 */
function buildPriceFeed() {
  var sh = getSheetOrThrow_(SHEET_REPRICE);
  var last = sh.getLastRow();
  if (last < 3) throw new Error('리프라이싱 결과가 없습니다. 먼저 [리프라이싱 산출]을 실행하세요.');

  var vals = sh.getRange(3, 1, last - 2, REPRICE_HEADER.length).getValues();
  var picked = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][RP_OK] !== true) continue;
    var sku = String(vals[i][RP_SKU] || '').trim();
    var p1 = Number(vals[i][RP_NEW]);
    if (!sku || !(p1 > 0)) continue;
    picked.push({ sku: sku, price: p1, old: Number(vals[i][RP_OLD]), row: i });
  }
  if (!picked.length) throw new Error('승인(체크)된 행이 없습니다.');

  var tsv = 'sku\tprice\n';
  for (var p = 0; p < picked.length; p++) tsv += picked[p].sku + '\t' + picked[p].price + '\n';

  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var fileName = 'price_feed_' + stamp + '.txt';
  var blob = Utilities.newBlob('', 'text/tab-separated-values', fileName).setDataFromString(tsv, 'UTF-8');

  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(PROP_FEED_FOLDER) || props.getProperty(PROP_INVOICE_FOLDER);
  var file = folderId ? DriveApp.getFolderById(folderId).createFile(blob) : DriveApp.createFile(blob);

  markPriceLogApplied_(picked);
  props.setProperty(PROP_LAST_REPRICE_R1, String(fxHouseRate_()));

  // 반영 완료 표시 — 같은 행을 두 번 올리는 사고를 막는다
  for (var q = 0; q < picked.length; q++) {
    sh.getRange(3 + picked[q].row, RP_OK + 1).setValue(false);
    sh.getRange(3 + picked[q].row, RP_ACTION + 1).setValue('피드생성됨');
  }

  var msg = '가격 피드 ' + picked.length + '건 생성: ' + fileName;
  log_('reprice', 'INFO', msg + ' / ' + file.getUrl());
  try {
    ui_().alert(msg + '\n\n' + file.getUrl() + '\n\n' +
      '셀러센트럴에 업로드하세요:\n' +
      '카탈로그 > 업로드로 상품 등록 > 가격 및 수량 변경\n\n' +
      '※ 이 앱에는 Feeds 권한이 없어 자동 제출이 불가합니다.');
  } catch (e) {}
  return msg;
}

/** 피드를 실제로 만든 SKU만 대장에서 '반영됨'으로 확정 */
function markPriceLogApplied_(picked) {
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (!sh || sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, 1, n, PRICELOG_HEADER.length).getValues();
  var want = {};
  for (var p = 0; p < picked.length; p++) want[picked[p].sku + '|' + picked[p].price] = true;

  var flags = [];
  var changed = false;
  for (var i = 0; i < vals.length; i++) {
    var cur = vals[i][PL_APPLIED] === true;
    var key = String(vals[i][PL_SKU]) + '|' + Number(vals[i][PL_NEW]);
    var next = cur || !!want[key];
    if (next !== cur) changed = true;
    flags.push([next]);
  }
  if (changed) sh.getRange(2, PL_APPLIED + 1, n, 1).setValues(flags);
  clearPriceLogCache_();
}

// ── 등록일(open-date) 수집 ───────────────────────────────

/**
 * 기존 리스팅 탭에는 등록일이 없다. r0 소급 복원에 반드시 필요하므로
 * SP-API 리포트에서 open-date만 따로 받아 '등록일' 탭에 쌓는다.
 * 대장이 채워진 SKU는 더 이상 이 값에 의존하지 않는다.
 */
var SHEET_OPENDATE = '등록일';
var OPENDATE_HEADER = ['SKU', 'ASIN', '등록일'];
var OP_SKU = 0, OP_ASIN = 1, OP_DATE = 2;

/**
 * 등록일 탭에서 '등록일'이 몇 번째 칸인지 찾는다.
 *
 * 예전에는 ['SKU','등록일'] 두 칸이었다. ASIN이 가운데 끼면서 자리가 밀렸는데,
 * 이 탭은 아마존 동기화를 돌려야 다시 그려진다 — 그전까지는 옛 두 칸짜리다.
 * 자리를 숫자로 박아두면 그 사이에 ASIN 칸을 날짜로 읽어 r0가 통째로 망가진다.
 * 그래서 머리글 이름으로 찾는다.
 *
 * @return {{date:number, asin:number, width:number}}
 */
function openDateCols_(sh) {
  var width = Math.max(sh.getLastColumn(), 2);
  var hdr = sh.getRange(1, 1, 1, width).getValues()[0];
  var date = -1, asin = -1;
  for (var i = 0; i < hdr.length; i++) {
    var h = String(hdr[i] || '').trim();
    if (h === '등록일') date = i;
    else if (h === 'ASIN') asin = i;
  }
  // 머리글이 없거나 다르면 옛 배치(SKU, 등록일)로 본다
  if (date < 0) date = 1;
  return { date: date, asin: asin, width: width };
}

function openDateMap_() {
  var map = {};
  var sh = ss_().getSheetByName(SHEET_OPENDATE);
  if (!sh || sh.getLastRow() < 2) {
    throw new Error('"등록일" 탭이 없습니다. 먼저 [등록일 수집]을 실행하세요.\n' +
                    '(r0 = 등록일 환율이라 이 데이터 없이는 리프라이싱을 계산할 수 없습니다)');
  }
  var c = openDateCols_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, c.width).getValues();
  for (var i = 0; i < vals.length; i++) {
    var sku = String(vals[i][0] || '').trim();
    if (!sku) continue;
    var d = vals[i][c.date];
    map[sku] = (d instanceof Date) ? ymd_(d) : String(d).trim();
  }
  return map;
}
