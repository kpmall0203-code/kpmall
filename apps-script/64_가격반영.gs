/**
 * 64_가격반영.gs — Listings Items API로 가격을 직접 반영
 *
 * 왜 피드가 아니라 Listings Items API인가:
 *   구형 플랫파일 피드(POST_FLAT_FILE_PRICEANDQUANTITYONLY)는 이 앱에 403이다.
 *   JSON_LISTINGS_FEED는 열려 있지만 대량 제출이라 결과가 나중에 보고서로 온다.
 *   Listings Items API는 SKU마다 성공/실패가 즉시 돌아온다 — 7,177건을 눈 감고
 *   던지는 것보다, 실패가 뭔지 그 자리에서 아는 게 훨씬 안전하다.
 *
 * 실측으로 확인한 요청 형식 (2026-07-31):
 *   PATCH /listings/2021-08-01/items/{sellerId}/{sku}?marketplaceIds=..&mode=..
 *   body: { productType, patches:[{op:'replace',
 *           path:'/attributes/purchasable_offer', value:[{...our_price...}]}] }
 *   mode=VALIDATION_PREVIEW 면 실제로 바꾸지 않고 검증만 한다 (status: VALID/INVALID).
 *
 * 안전장치 (이 파일의 존재 이유):
 *   · 트리거에서는 절대 실행되지 않는다. 사람이 메뉴를 눌러야만 돈다.
 *   · 실행 전 건수·평균/최대 변동폭을 보여주고, 건수를 직접 입력해야 진행한다.
 *   · 먼저 전량 VALIDATION_PREVIEW로 돌려 INVALID를 걸러낸 뒤 실반영한다.
 *   · SKU마다 결과를 '반영결과' 탭에 남긴다. 실패분만 재시도할 수 있다.
 *   · 6분 한도에 맞춰 나눠 돌고, 남으면 이어실행 트리거를 스스로 건다.
 */

var SHEET_APPLY = '반영결과';
var APPLY_HEADER = ['SKU', '이전가', '반영가', '상태', '메시지', '시각', '실행ID'];
var AP_SKU = 0, AP_OLD = 1, AP_NEW = 2, AP_STATUS = 3, AP_MSG = 4, AP_AT = 5, AP_RUN = 6;

var SHEET_PTYPE = '상품유형';   // SKU → productType 캐시 (PATCH에 필수, 매번 GET하면 호출이 2배)
var PTYPE_HEADER = ['SKU', 'productType', '조회일시'];

var PROP_SELLER_ID = 'SELLER_ID';
var PROP_APPLY_QUEUE = 'APPLY_QUEUE';       // (구버전) 남은 작업 JSON — 이제 시트로 옮긴다
var PROP_APPLY_RUNID = 'APPLY_RUNID';
var PROP_APPLY_MODE = 'APPLY_MODE';         // 'preview' | 'live'
var APPLY_CONTINUE_HANDLER = 'continueApply';

/**
 * 작업 큐를 숨긴 시트에 둔다.
 *
 * 예전엔 Script Properties에 JSON으로 넣었는데, 프로퍼티 값 하나는 9KB가 한계다.
 * 3,000건이면 130KB라 저장 자체가 실패하거나, 청크마다 다시 쓰다가 중간에
 * 터져서 이어실행 체인이 조용히 끊긴다. 시트는 그런 한계가 없다.
 *
 * 큐를 매번 다시 쓰지 않고 '어디까지 했는지' 커서만 옮긴다 — 쓰기 비용도 없어진다.
 */
var SHEET_APPLY_QUEUE = '_반영대기';
var AQ_HEADER = ['SKU', '이전가', '반영가'];
var PROP_APPLY_CURSOR = 'APPLY_CURSOR';

/** 트리거 안에서는 대화상자를 못 띄운다. 검증→실반영 승인이 밀렸다는 표시 */
var PROP_APPLY_AWAIT = 'APPLY_AWAIT_LIVE';

/** 연속 실패 횟수. 이만큼 연달아 실패하면 체인을 멈춘다 */
var PROP_APPLY_FAILS = 'APPLY_FAILS';
var APPLY_MAX_FAILS = 5;

/**
 * 검증 방식.
 *
 * 'full'   — 전량 검증 후 반영. 안전하지만 호출이 두 배다.
 * 'sample' — 무작위 표본만 검증하고 통과하면 바로 반영.
 *
 * 전량 검증이 사주는 것은 '가격을 하나도 안 바꾼 상태에서 실패 목록을 아는 것'
 * 하나뿐이다. 그런데 실반영도 SKU마다 성공/실패가 즉시 돌아오고, 실패한 건은
 * 가격이 안 바뀐 채 기록만 남는다 — 즉 개별 실패는 언제 알든 손해가 없다.
 *
 * 전량 검증이 진짜로 막아주는 건 '전면적 실패'다 (상품유형이 틀렸다거나
 * 필수 속성이 빠졌다거나). 그건 표본 50건이면 충분히 드러난다:
 * 실패율이 6%만 돼도 50건 중 하나 이상 걸릴 확률이 95%다.
 *
 * 그래서 기본을 표본으로 바꾼다. 처음 돌리거나 건수가 적을 때는 전량이 낫다.
 */
var PROP_APPLY_PLAN = 'APPLY_PLAN';       // 'full' | 'sample'
var PROP_APPLY_LIMIT = 'APPLY_LIMIT';     // 이번 단계에서 여기까지만 처리 (표본용)
var APPLY_SAMPLE_N = 50;
var APPLY_FULL_BELOW = 200;               // 이보다 적으면 표본을 나눌 이유가 없다

// Listings Items API는 초당 5회(버스트 10). 여유를 둬서 220ms 간격으로 던진다.
var APPLY_SLEEP_MS = 220;
var APPLY_SOFT_MS = 4.5 * 60 * 1000;

/** 메뉴: 판매자 토큰 설정 */
function setupSellerId() {
  var ui = ui_();
  var props = PropertiesService.getScriptProperties();
  var cur = props.getProperty(PROP_SELLER_ID) || '';
  var res = ui.prompt('판매자 토큰 (Merchant Token)',
    '셀러센트럴 → 설정 → 계정 정보 → 판매자 토큰\n' +
    'A로 시작하는 13~14자리 문자열입니다.' + (cur ? '\n\n현재: ' + cur : ''),
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var v = res.getResponseText().trim();
  if (!v) return;
  props.setProperty(PROP_SELLER_ID, v);
  ui.alert('판매자 토큰을 저장했습니다: ' + v);
}

function sellerId_() {
  var v = PropertiesService.getScriptProperties().getProperty(PROP_SELLER_ID);
  if (!v) throw new Error('판매자 토큰이 없습니다.\n[⚙ 설정 → 판매자 토큰]을 먼저 실행하세요.');
  return v;
}

// ── productType 캐시 ─────────────────────────────────────

function ptypeMap_() {
  var map = {};
  var sh = ss_().getSheetByName(SHEET_PTYPE);
  if (sh && sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      var s = String(vals[i][0] || '').trim();
      if (s && vals[i][1]) map[s] = String(vals[i][1]);
    }
  }
  return map;
}

function ptypeSave_(pairs) {
  if (!pairs.length) return;
  var sh = ensureSheet_(SHEET_PTYPE, PTYPE_HEADER);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, 3).setValues([PTYPE_HEADER]).setFontWeight('bold');
  var now = new Date();
  var rows = pairs.map(function (p) { return [p[0], p[1], now]; });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
}

// ── 작업 큐 (숨긴 시트 + 커서) ────────────────────────────

/**
 * 큐를 새로 깐다. items = [{sku, old, price}]
 * shuffle=true면 순서를 섞는다 — 앞에서 N건을 떼면 그게 곧 무작위 표본이 된다.
 * (리프라이싱 결과는 등록일순이라, 안 섞고 앞 50건을 쓰면 옛날 상품만 뽑힌다)
 */
function applyQueueWrite_(items, shuffle) {
  if (shuffle) {
    items = items.slice();
    for (var j = items.length - 1; j > 0; j--) {   // Fisher-Yates
      var k = Math.floor(Math.random() * (j + 1));
      var t = items[j]; items[j] = items[k]; items[k] = t;
    }
  }
  var sh = ensureSheet_(SHEET_APPLY_QUEUE, AQ_HEADER);
  sh.clear();
  sh.getRange(1, 1, 1, AQ_HEADER.length).setValues([AQ_HEADER]).setFontWeight('bold');
  var CH = 2000;
  for (var s = 0; s < items.length; s += CH) {
    var part = items.slice(s, s + CH).map(function (it) {
      return [it.sku, it.old, it.price];
    });
    sh.getRange(2 + s, 1, part.length, AQ_HEADER.length).setValues(part);
  }
  sh.setFrozenRows(1);
  try { sh.hideSheet(); } catch (e) {}
  PropertiesService.getScriptProperties().setProperty(PROP_APPLY_CURSOR, '0');
}

function applyQueueTotal_() {
  var sh = ss_().getSheetByName(SHEET_APPLY_QUEUE);
  return (!sh || sh.getLastRow() < 2) ? 0 : sh.getLastRow() - 1;
}

function applyQueueCursor_() {
  return Number(PropertiesService.getScriptProperties().getProperty(PROP_APPLY_CURSOR) || 0);
}

/**
 * 이번 단계가 끝나는 지점. 표본 검증 중이면 표본 끝, 아니면 큐 끝.
 * 큐 자체는 전량을 담고 있고 커서만 앞에서 멈춘다 —
 * 표본이 통과하면 커서를 0으로 되돌려 같은 큐를 실반영으로 다시 훑는다.
 */
function applyPhaseEnd_() {
  var total = applyQueueTotal_();
  var lim = Number(PropertiesService.getScriptProperties().getProperty(PROP_APPLY_LIMIT) || 0);
  return (lim > 0 && lim < total) ? lim : total;
}

function applyQueueRemaining_() {
  return Math.max(0, applyPhaseEnd_() - applyQueueCursor_());
}

/** 커서 위치부터 n건 읽는다 */
function applyQueueRead_(cursor, n) {
  var end = applyPhaseEnd_();
  if (cursor >= end) return [];
  var take = Math.min(n, end - cursor);
  var sh = ss_().getSheetByName(SHEET_APPLY_QUEUE);
  var v = sh.getRange(2 + cursor, 1, take, AQ_HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    out.push({ sku: String(v[i][0]).trim(), old: Number(v[i][1]), price: Number(v[i][2]) });
  }
  return out;
}

/** 구버전 프로퍼티 큐가 남아 있으면 시트로 옮긴다 (진행 중이던 작업을 살린다) */
function applyQueueMigrate_() {
  var props = PropertiesService.getScriptProperties();
  var legacy = props.getProperty(PROP_APPLY_QUEUE);
  if (!legacy) return;
  try {
    var arr = JSON.parse(legacy);
    if (arr && arr.length) {
      applyQueueWrite_(arr);
      log_('apply', 'INFO', '작업 큐를 시트로 이전 — ' + arr.length + '건');
    }
  } catch (e) {
    log_('apply', 'ERROR', '큐 이전 실패: ' + String(e));
  }
  props.deleteProperty(PROP_APPLY_QUEUE);
}

/** 트리거 안에서는 대화상자를 못 띄운다 */
function hasUi_() {
  try { SpreadsheetApp.getUi(); return true; } catch (e) { return false; }
}

/** SKU의 productType을 받아온다 (PATCH 본문에 필수) */
function fetchProductType_(token, seller, sku) {
  var path = '/listings/2021-08-01/items/' + encodeURIComponent(seller) + '/' + encodeURIComponent(sku) +
             '?marketplaceIds=' + MARKETPLACE_JP + '&includedData=summaries';
  var j = spapi_(token, 'get', path);
  var sums = j.summaries || [];
  return sums.length ? String(sums[0].productType || '') : '';
}

/**
 * 가격 PATCH. mode='VALIDATION_PREVIEW' 면 실제로 바꾸지 않는다.
 * @return {{status:string, msg:string}}
 */
function patchPrice_(token, seller, sku, price, productType, mode) {
  var q = 'marketplaceIds=' + MARKETPLACE_JP + (mode ? '&mode=' + mode : '');
  var url = SPAPI_BASE + '/listings/2021-08-01/items/' +
            encodeURIComponent(seller) + '/' + encodeURIComponent(sku) + '?' + q;
  var body = {
    productType: productType,
    patches: [{
      op: 'replace',
      path: '/attributes/purchasable_offer',
      value: [{
        currency: 'JPY',
        marketplace_id: MARKETPLACE_JP,
        audience: 'ALL',
        our_price: [{ schedule: [{ value_with_tax: price }] }]
      }]
    }]
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { 'x-amz-access-token': token },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var txt = res.getContentText();
  var j = {};
  try { j = JSON.parse(txt); } catch (e) {}
  if (code < 200 || code >= 300) {
    var em = (j.errors && j.errors[0] && j.errors[0].message) || ('HTTP ' + code);
    return { status: 'ERROR', msg: String(em).substring(0, 200) };
  }
  var issues = j.issues || [];
  var errs = issues.filter(function (x) { return x.severity === 'ERROR'; });
  if (errs.length) {
    return { status: 'INVALID', msg: errs.map(function (x) { return x.message; }).join(' / ').substring(0, 200) };
  }
  return { status: j.status || 'ACCEPTED', msg: issues.length ? (issues[0].message || '').substring(0, 150) : '' };
}

// ── 실행 (사람이 메뉴로만 시작) ──────────────────────────

/**
 * 메뉴: 승인분을 아마존에 직접 반영.
 * 먼저 전량 검증(VALIDATION_PREVIEW) → 통과분만 실반영.
 */
function applyPricesToAmazon() {
  var seller = sellerId_();
  var sh = getSheetOrThrow_(SHEET_REPRICE);
  var last = sh.getLastRow();
  if (last < 3) throw new Error('리프라이싱 결과가 없습니다. [▶ 리프라이싱 → ① 산출]을 먼저 실행하세요.');

  var vals = sh.getRange(3, 1, last - 2, REPRICE_HEADER.length).getValues();
  var picked = [];
  var deltas = [];
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][RP_OK] !== true) continue;
    var sku = String(vals[i][RP_SKU] || '').trim();
    var p1 = Number(vals[i][RP_NEW]), p0 = Number(vals[i][RP_OLD]);
    if (!sku || !(p1 > 0) || !(p0 > 0)) continue;
    picked.push({ sku: sku, price: p1, old: p0 });
    deltas.push(p1 / p0 - 1);
  }
  if (!picked.length) throw new Error('승인(체크)된 행이 없습니다.');

  var sum = 0, mx = 0;
  for (var d = 0; d < deltas.length; d++) {
    sum += deltas[d];
    if (Math.abs(deltas[d]) > Math.abs(mx)) mx = deltas[d];
  }
  var avg = sum / deltas.length;

  // 건수가 적으면 나눌 이유가 없다 — 전량 검증이 어차피 금방 끝난다
  var canSample = picked.length > APPLY_FULL_BELOW;
  var sampleN = Math.min(APPLY_SAMPLE_N, picked.length);

  // 1차 관문: 무엇이 바뀌는지 숫자로 보여준다
  var ok = ui_().alert('아마존에 가격을 직접 반영합니다',
    '대상: ' + picked.length.toLocaleString() + ' SKU\n' +
    '평균 변동: ' + pct_(avg) + '\n' +
    '최대 변동: ' + pct_(mx) + '\n\n' +
    (canSample
      ? '진행 순서\n' +
        '  1) 무작위 ' + sampleN + '건만 검증 (실제로 바꾸지 않음)\n' +
        '  2) 통과하면 전량 실제 반영\n\n' +
        '전량 검증을 원하시면 다음 화면에서 고를 수 있습니다.\n\n'
      : '진행 순서\n' +
        '  1) 전량 검증 (실제로 바꾸지 않음)\n' +
        '  2) 검증 통과분만 실제 반영\n\n') +
    '되돌리기: [▶ 리프라이싱 → ↩ 되돌리기]로 언제든 이전 가격 복구 가능합니다.\n' +
    '(직전 산출 때 스냅샷을 이미 떠 두었습니다)\n\n' +
    '계속할까요?', ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  // 검증 방식 선택
  var plan = 'full';
  if (canSample) {
    var pr = ui_().alert('검증 방식',
      '표본 검증 (권장)\n' +
      '  무작위 ' + sampleN + '건만 먼저 검증하고, 전부 통과하면 바로 반영합니다.\n' +
      '  걸리는 시간이 절반쯤으로 줄어듭니다.\n' +
      '  개별 실패는 반영 중에 그대로 잡히고, 실패한 건은 가격이 안 바뀝니다.\n\n' +
      '전량 검증\n' +
      '  ' + picked.length.toLocaleString() + '건을 모두 미리 검증합니다.\n' +
      '  가격을 하나도 안 바꾼 상태에서 실패 목록 전체를 먼저 보고 싶을 때.\n\n' +
      '[예] 표본 검증    [아니오] 전량 검증',
      ui_().ButtonSet.YES_NO_CANCEL);
    if (pr === ui_().Button.CANCEL) return;
    plan = (pr === ui_().Button.YES) ? 'sample' : 'full';
  }

  // 2차 관문: 건수를 직접 입력해야 진행
  var conf = ui_().prompt('최종 확인',
    '실수 방지를 위해 대상 건수를 그대로 입력하세요.\n\n' +
    '입력할 숫자: ' + picked.length,
    ui_().ButtonSet.OK_CANCEL);
  if (conf.getSelectedButton() !== ui_().Button.OK) return;
  if (String(conf.getResponseText()).trim() !== String(picked.length)) {
    ui_().alert('입력이 일치하지 않아 취소했습니다.\n(' + picked.length + ' 를 입력해야 진행됩니다)');
    return;
  }

  var runId = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_APPLY_RUNID, runId);
  props.setProperty(PROP_APPLY_MODE, 'preview');
  props.setProperty(PROP_APPLY_PLAN, plan);
  props.deleteProperty(PROP_APPLY_AWAIT);
  props.deleteProperty(PROP_APPLY_FAILS);

  // 큐에는 언제나 전량이 들어간다. 표본 검증이면 앞에서 N건만 훑도록
  // 종료 지점을 걸어두고, 통과하면 커서를 0으로 되돌려 같은 큐를 실반영한다.
  applyQueueWrite_(picked, plan === 'sample');
  if (plan === 'sample') props.setProperty(PROP_APPLY_LIMIT, String(sampleN));
  else props.deleteProperty(PROP_APPLY_LIMIT);

  var out = ensureSheet_(SHEET_APPLY, APPLY_HEADER);
  out.clear();
  out.getRange(1, 1, 1, APPLY_HEADER.length).setValues([APPLY_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  out.setFrozenRows(1);

  toast_('검증 시작 — ' + picked.length + '건');
  applyChunk_();
}

/** 트리거/메뉴: 이어서 처리 */
/**
 * 트리거용 이어실행.
 *
 * 예전엔 예외를 잡아 로그만 남겼다. 그런데 다음 트리거 예약은 청크가 끝까지
 * 갔을 때만 하므로, 중간에 한 번 터지면 체인이 영영 끊긴다 —
 * 화면에는 아무 표시도 없고 결과 탭만 어중간하게 멈춰 있다.
 * 이제는 실패해도 다시 예약하고, 연속 5회 실패해야 멈춘다.
 */
function continueApply() {
  withLockOrRetry_('가격 반영', APPLY_CONTINUE_HANDLER, function () {
    var props = PropertiesService.getScriptProperties();
    try {
      applyChunk_();
      props.deleteProperty(PROP_APPLY_FAILS);
    } catch (e) {
      var fails = Number(props.getProperty(PROP_APPLY_FAILS) || 0) + 1;
      props.setProperty(PROP_APPLY_FAILS, String(fails));
      log_('apply', 'ERROR', '이어실행 ' + fails + '회 실패: ' + String(e));
      if (fails < APPLY_MAX_FAILS && applyQueueRemaining_() > 0) {
        applyScheduleContinue_(true);
      } else {
        applyScheduleContinue_(false);
        log_('apply', 'ERROR', '연속 실패로 중단. 메뉴 [가격 반영 진행상황]에서 확인하세요.');
        notifyAlert_('가격 반영 중단',
          '연속 ' + fails + '회 실패해 이어실행을 멈췄습니다.\n' +
          '남은 작업: ' + applyQueueRemaining_() + '건\n\n마지막 오류: ' + String(e));
      }
    }
  });
}

function applyChunk_() {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  applyQueueMigrate_();
  var cursor = applyQueueCursor_();
  var mode = props.getProperty(PROP_APPLY_MODE) || 'preview';
  var runId = props.getProperty(PROP_APPLY_RUNID) || '';
  // 큐 전체를 메모리에 올리지 않고 배치로 읽는다. 다 쓰면 아래에서 더 읽어온다.
  var BATCH = 500;
  var queue = applyQueueRead_(cursor, BATCH);
  if (!queue.length) { applyFinishPhase_(); return; }

  var seller = sellerId_();
  var token = getLwaToken_();
  var ptypes = ptypeMap_();
  var newTypes = [];
  var rows = [];
  var now = new Date();
  var done = 0;

  while (Date.now() - t0 < APPLY_SOFT_MS) {
    if (!queue.length) {
      // 배치를 다 썼는데 시간이 남았다 — 트리거를 1분 기다리느니 더 읽어서 계속한다
      queue = applyQueueRead_(cursor + done, BATCH);
      if (!queue.length) break;
    }
    var item = queue.shift();
    var pt = ptypes[item.sku];
    try {
      if (!pt) {
        pt = fetchProductType_(token, seller, item.sku);
        if (pt) { ptypes[item.sku] = pt; newTypes.push([item.sku, pt]); }
        Utilities.sleep(APPLY_SLEEP_MS);
      }
      if (!pt) {
        rows.push([item.sku, item.old, item.price, 'ERROR', 'productType 조회 실패', now, runId]);
        done++;
        continue;
      }
      var r = patchPrice_(token, seller, item.sku, item.price, pt,
                          mode === 'preview' ? 'VALIDATION_PREVIEW' : '');
      rows.push([item.sku, item.old, item.price,
                 mode === 'preview' ? (r.status === 'VALID' ? 'VALID' : r.status) : r.status,
                 r.msg, now, runId]);
      done++;
    } catch (e) {
      rows.push([item.sku, item.old, item.price, 'ERROR', String(e).substring(0, 200), now, runId]);
      done++;
    }
    Utilities.sleep(APPLY_SLEEP_MS);
  }

  if (rows.length) {
    var out = ensureSheet_(SHEET_APPLY, APPLY_HEADER);
    out.getRange(out.getLastRow() + 1, 1, rows.length, APPLY_HEADER.length).setValues(rows);
  }
  ptypeSave_(newTypes);
  // 큐를 다시 쓰지 않고 커서만 옮긴다
  props.setProperty(PROP_APPLY_CURSOR, String(cursor + done));

  var left = applyQueueRemaining_();
  if (left > 0) {
    applyScheduleContinue_(true);
    var msg = (mode === 'preview' ? '검증' : '반영') + ' ' + done + '건 처리 · 남음 ' + left + '건';
    log_('apply', 'INFO', msg);
    toast_(msg);

    // 사람이 직접 눌러 돌린 경우엔 토스트로는 놓치기 쉽다.
    // 한 번 실행은 6분이 한계라 여기서 이어서 더 돌 수는 없으므로,
    // 몇 건 남았고 어디를 다시 누르면 되는지 분명히 알려준다.
    if (hasUi_()) {
      var perRun = done > 0 ? done : 1;
      var more = Math.ceil(left / perRun);
      ui_().alert((mode === 'preview' ? '검증' : '실반영') + ' 진행 중',
        '이번에 ' + done.toLocaleString() + '건 처리했습니다.\n' +
        '남음: ' + left.toLocaleString() + '건\n\n' +
        '자동 이어실행을 예약해 뒀습니다. 하루 실행 한도(90분)가\n' +
        '남아 있으면 1분 뒤부터 알아서 진행됩니다.\n\n' +
        '한도를 다 썼다면 진행이 없을 텐데, 그때는\n' +
        '[▶ 리프라이싱 → 진행상황]에서 [예]를 누르세요.\n' +
        '이 속도면 ' + more + '번쯤 더 누르면 끝납니다.',
        ui_().ButtonSet.OK);
    }
  } else {
    applyFinishPhase_();
  }
}

/** 한 단계(검증 또는 반영)가 끝났을 때 */
function applyFinishPhase_() {
  var props = PropertiesService.getScriptProperties();
  var mode = props.getProperty(PROP_APPLY_MODE) || 'preview';
  var runId = props.getProperty(PROP_APPLY_RUNID) || '';
  applyScheduleContinue_(false);

  var sh = ss_().getSheetByName(SHEET_APPLY);
  if (!sh || sh.getLastRow() < 2) return;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, APPLY_HEADER.length).getValues();
  var mine = vals.filter(function (v) { return String(v[AP_RUN]) === runId; });

  if (mode === 'preview') {
    var valid = mine.filter(function (v) { return String(v[AP_STATUS]) === 'VALID'; });
    var bad = mine.filter(function (v) { return String(v[AP_STATUS]) !== 'VALID'; });
    var uniqN = dedupBySku_(valid).length;   // 중복 검증분을 뺀 실제 반영 대상
    var plan = props.getProperty(PROP_APPLY_PLAN) || 'full';
    log_('apply', 'INFO', (plan === 'sample' ? '표본' : '전량') + ' 검증 완료 · 통과 ' +
                          uniqN + ' / 실패 ' + bad.length);

    // ── 표본 검증 ──
    if (plan === 'sample') { applyFinishSample_(runId, valid, bad); return; }

    // 검증→실반영은 사람이 승인해야 하는 관문이다.
    // 그런데 이 지점은 대개 트리거(이어실행) 안에서 도달한다 — 거기서는
    // 대화상자를 띄울 수 없고, 띄우려 하면 예외가 나서 체인이 조용히 끊긴다.
    // 그래서 UI가 없으면 '승인 대기' 상태로 세워두고 메뉴에서 이어받게 한다.
    if (!hasUi_()) {
      props.setProperty(PROP_APPLY_AWAIT, '1');
      notifyAlert_('검증 완료 — 실반영 승인 대기',
        '통과 ' + uniqN + '건 / 실패 ' + bad.length + '건.\n' +
        '아직 가격은 하나도 바뀌지 않았습니다.\n\n' +
        '시트 메뉴 [가격관리 → ▶ 리프라이싱 → 진행상황]에서 이어서 진행하세요.');
      return;
    }

    var r = ui_().alert('검증 완료 — 아직 아무것도 바뀌지 않았습니다',
      '통과: ' + uniqN.toLocaleString() + '건\n' +
      '실패: ' + bad.length.toLocaleString() + '건' +
      (bad.length ? '\n\n실패 예시:\n  ' + bad.slice(0, 3).map(function (v) {
        return v[AP_SKU] + ' — ' + String(v[AP_MSG]).substring(0, 60);
      }).join('\n  ') : '') +
      '\n\n통과한 ' + uniqN.toLocaleString() + '건을 실제로 반영할까요?\n' +
      '(실패분은 "' + SHEET_APPLY + '" 탭에서 확인 후 따로 처리하세요)',
      ui_().ButtonSet.YES_NO);
    if (r !== ui_().Button.YES) {
      props.setProperty(PROP_APPLY_AWAIT, '1');
      ui_().alert('중단했습니다. 가격은 그대로입니다.\n\n' +
                  '나중에 [▶ 리프라이싱 → 진행상황]에서 이어서 할 수 있습니다.');
      return;
    }
    applyStartLive_(runId, valid);
    return;
  }

  // 실반영 완료
  var okN = mine.filter(function (v) {
    var s = String(v[AP_STATUS]);
    return s === 'ACCEPTED' || s === 'VALID';
  });
  var ng = mine.filter(function (v) {
    var s = String(v[AP_STATUS]);
    return !(s === 'ACCEPTED' || s === 'VALID');
  });
  // 되돌리기였다면 대장에서 '원래 실행'을 반영 취소해야 한다.
  //
  // 여기가 미묘한데 — r0는 '그 가격에 박혀 있는 환율'이다. 되돌린 뒤에도
  // 원래 실행이 반영=TRUE로 남아 있으면, 다음 리프라이싱이 그 실행의 r1을
  // r0로 쓴다. 실제 가격은 그 이전 값으로 돌아갔는데 말이다.
  // 되돌림 = 그 변경이 없던 일이 되는 것이므로, 기록을 지우는 게 맞다.
  if (runId.indexOf('ROLLBACK_') === 0) {
    // 검증→실반영으로 넘어갈 때 runId 뒤에 '_LIVE'가 붙는다. 떼고 원본 실행ID를 찾는다.
    var origRun = runId.substring('ROLLBACK_'.length).replace(/_LIVE$/, '');
    var undone = unmarkPriceLogRun_(origRun, okN.map(function (v) { return String(v[AP_SKU]); }));
    log_('apply', 'INFO', '되돌리기 완료 · ' + okN.length + '건 · 대장 반영취소 ' + undone + '건');
  } else {
    markPriceLogAppliedBySku_(okN.map(function (v) {
      return { sku: String(v[AP_SKU]), price: Number(v[AP_NEW]) };
    }));
    try {
      props.setProperty(PROP_LAST_REPRICE_R1, String(fxHouseRate_()));
    } catch (e) {}
    log_('apply', 'INFO', '실반영 완료 · 성공 ' + okN.length + ' / 실패 ' + ng.length);
  }
  ui_().alert('가격 반영 완료',
    '성공: ' + okN.length.toLocaleString() + '건\n' +
    '실패: ' + ng.length.toLocaleString() + '건\n\n' +
    '아마존 반영에는 보통 몇 분~수십 분 걸립니다.\n' +
    '[🔄 데이터 갱신 → 아마존 동기화]로 실제 가격을 다시 받아 확인하세요.\n\n' +
    '되돌리려면 [▶ 리프라이싱 → ↩ 되돌리기]를 실행하세요.',
    ui_().ButtonSet.OK);
}

/**
 * 표본 검증이 끝났을 때.
 *
 * 표본이 깨끗하면 큐(전량)를 커서 0부터 실반영으로 다시 훑는다.
 * 실패가 섞였으면 '전면적 문제'일 수 있으니 사람에게 판단을 넘긴다 —
 * 여기서 자동으로 밀어붙이면 표본을 뜬 의미가 없다.
 */
function applyFinishSample_(runId, valid, bad) {
  var props = PropertiesService.getScriptProperties();
  var n = valid.length + bad.length;
  var rate = n ? bad.length / n : 0;

  if (!bad.length) {
    // 전량 반영으로 넘어간다. 큐는 이미 전량이므로 종료 지점만 풀면 된다.
    props.deleteProperty(PROP_APPLY_LIMIT);
    var total = applyQueueTotal_();
    if (!hasUi_()) {
      props.setProperty(PROP_APPLY_AWAIT, '1');
      notifyAlert_('표본 검증 통과 — 실반영 승인 대기',
        '표본 ' + n + '건 전부 통과했습니다. 아직 가격은 바뀌지 않았습니다.\n\n' +
        '전량 ' + total + '건을 반영하려면\n' +
        '시트 메뉴 [가격관리 → ▶ 리프라이싱 → 진행상황]에서 이어서 진행하세요.');
      return;
    }
    var r = ui_().alert('표본 검증 통과 — 아직 아무것도 바뀌지 않았습니다',
      '표본 ' + n + '건 전부 통과했습니다.\n' +
      '설정이 전면적으로 잘못된 경우는 아닙니다.\n\n' +
      '이제 전량 ' + total.toLocaleString() + '건을 실제로 반영합니다.\n' +
      '개별 실패가 있으면 그 SKU만 가격이 안 바뀌고 "' + SHEET_APPLY + '"에 기록됩니다.\n\n' +
      '진행할까요?', ui_().ButtonSet.YES_NO);
    if (r !== ui_().Button.YES) {
      props.setProperty(PROP_APPLY_AWAIT, '1');
      ui_().alert('중단했습니다. 가격은 그대로입니다.\n\n' +
                  '나중에 [▶ 리프라이싱 → 진행상황]에서 이어서 할 수 있습니다.');
      return;
    }
    applyStartLiveAll_(runId);
    return;
  }

  // 표본에 실패가 있다
  var lines = bad.slice(0, 5).map(function (v) {
    return '  ' + v[AP_SKU] + ' — ' + String(v[AP_MSG]).substring(0, 60);
  }).join('\n');

  if (!hasUi_()) {
    props.setProperty(PROP_APPLY_AWAIT, '1');
    notifyAlert_('표본 검증에서 실패 발생 — 확인 필요',
      '표본 ' + n + '건 중 ' + bad.length + '건 실패 (' + Math.round(rate * 100) + '%).\n' +
      '가격은 하나도 바뀌지 않았습니다.\n\n' + lines + '\n\n' +
      '시트 메뉴 [▶ 리프라이싱 → 진행상황]에서 판단하세요.');
    return;
  }

  var r2 = ui_().alert('표본 검증 — 실패가 섞였습니다',
    '표본 ' + n + '건 중 ' + bad.length + '건 실패 (' + Math.round(rate * 100) + '%)\n' +
    '가격은 아직 하나도 바뀌지 않았습니다.\n\n' + lines + '\n\n' +
    (rate >= 0.1
      ? '⚠ 실패율이 높습니다. 전면적 문제일 수 있으니 전량 검증을 권합니다.\n\n'
      : '개별 SKU 사정일 가능성이 큽니다 (판매중지 등).\n\n') +
    '[예] 전량 검증으로 전환 (안전)\n' +
    '[아니오] 통과분만 그대로 반영 진행\n' +
    '[취소] 중단',
    ui_().ButtonSet.YES_NO_CANCEL);

  if (r2 === ui_().Button.YES) {
    props.setProperty(PROP_APPLY_PLAN, 'full');
    props.deleteProperty(PROP_APPLY_LIMIT);
    props.setProperty(PROP_APPLY_CURSOR, '0');   // 전량을 처음부터 검증
    toast_('전량 검증으로 전환합니다');
    applyChunk_();
    return;
  }
  if (r2 === ui_().Button.NO) {
    props.deleteProperty(PROP_APPLY_LIMIT);
    applyStartLiveAll_(runId);
    return;
  }
  props.setProperty(PROP_APPLY_AWAIT, '1');
  ui_().alert('중단했습니다. 가격은 그대로입니다.');
}

/**
 * 표본이 통과했을 때의 실반영 — 큐에 이미 전량이 있으므로 커서만 되감는다.
 * (전량 검증 경로의 applyStartLive_ 는 '반영결과'에서 통과분만 추려 큐를 새로 깐다)
 */
function applyStartLiveAll_(runId) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_APPLY_AWAIT);
  props.deleteProperty(PROP_APPLY_LIMIT);
  props.setProperty(PROP_APPLY_CURSOR, '0');
  props.setProperty(PROP_APPLY_MODE, 'live');
  props.setProperty(PROP_APPLY_RUNID, /_LIVE$/.test(runId) ? runId : runId + '_LIVE');
  toast_('실반영 시작 — ' + applyQueueTotal_() + '건');
  applyChunk_();
}

/**
 * '반영결과' 행들을 SKU 기준으로 중복 제거한다 (뒤에 나온 것이 최신).
 *
 * 검증이 중간에 끊겼다 재개되면 같은 SKU가 '반영결과'에 여러 번 남는다.
 * 검증은 가격을 안 바꾸니 중복이 무해하지만, 실반영은 같은 SKU에 PATCH를
 * 두 번 보내게 된다. 결과는 같아도 호출 수가 배로 들고, 하루 실행 한도가
 * 빠듯한 상황에서는 그 자체가 손해다.
 */
function dedupBySku_(rows) {
  var byS = {}, order = [];
  for (var i = 0; i < rows.length; i++) {
    var sku = String(rows[i][AP_SKU]).trim();
    if (!sku) continue;
    if (!byS[sku]) order.push(sku);
    byS[sku] = { sku: sku, price: Number(rows[i][AP_NEW]), old: Number(rows[i][AP_OLD]) };
  }
  return order.map(function (s) { return byS[s]; });
}

/** 검증 통과분을 실반영 큐에 올린다 */
function applyStartLive_(runId, validRows) {
  var props = PropertiesService.getScriptProperties();

  var q = dedupBySku_(validRows);
  if (q.length < validRows.length) {
    log_('apply', 'INFO', '실반영 중복 제거 ' + (validRows.length - q.length) + '건 → ' + q.length + '건');
  }
  props.deleteProperty(PROP_APPLY_AWAIT);
  props.setProperty(PROP_APPLY_RUNID, /_LIVE$/.test(runId) ? runId : runId + '_LIVE');
  props.setProperty(PROP_APPLY_MODE, 'live');
  applyQueueWrite_(q);
  toast_('실반영 시작 — ' + q.length + '건');
  applyChunk_();
}

/**
 * 메뉴: 검증까지 끝났지만 실반영 승인이 밀려 있는 작업을 이어서 진행.
 * 트리거 안에서 대화상자를 못 띄워 멈춘 경우가 여기로 온다.
 */
function applyContinueToLive() {
  var props = PropertiesService.getScriptProperties();
  var runId = props.getProperty(PROP_APPLY_RUNID) || '';
  if (!runId) throw new Error('진행 중인 반영 작업이 없습니다.');
  if (/_LIVE$/.test(runId)) throw new Error('이미 실반영 단계입니다. [가격 반영 진행상황]을 확인하세요.');

  var sh = getSheetOrThrow_(SHEET_APPLY);
  if (sh.getLastRow() < 2) throw new Error('검증 결과가 없습니다.');
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, APPLY_HEADER.length).getValues();
  var valid = vals.filter(function (v) {
    return String(v[AP_RUN]) === runId && String(v[AP_STATUS]) === 'VALID';
  });
  var bad = vals.filter(function (v) {
    return String(v[AP_RUN]) === runId && String(v[AP_STATUS]) !== 'VALID';
  });
  if (!valid.length) throw new Error('검증을 통과한 건이 없습니다.');

  // 표본 검증이었다면 '반영결과'에는 표본 몇 십 건밖에 없다.
  // 그걸로 큐를 다시 깔면 나머지 수천 건이 통째로 날아간다 —
  // 이 경우엔 이미 전량이 들어 있는 큐를 그대로 쓴다.
  var plan = props.getProperty(PROP_APPLY_PLAN) || 'full';
  if (plan === 'sample') {
    var total = applyQueueTotal_();
    if (!total) throw new Error('반영 대기 큐가 비어 있습니다. 리프라이싱부터 다시 하세요.');
    var rs = ui_().alert('표본 검증 통과분 실반영',
      '실행: ' + runId + '\n' +
      '표본 검증: 통과 ' + valid.length + '건 / 실패 ' + bad.length + '건\n\n' +
      '전량 ' + total.toLocaleString() + '건 ← 이만큼 가격이 바뀝니다\n\n' +
      '되돌리기: [▶ 리프라이싱 → ↩ 되돌리기]로 복구 가능합니다.\n\n계속할까요?',
      ui_().ButtonSet.YES_NO);
    if (rs !== ui_().Button.YES) return;
    applyStartLiveAll_(runId);
    return;
  }

  var r = ui_().alert('검증 통과분 실반영',
    '실행: ' + runId + '\n' +
    '통과: ' + dedupBySku_(valid).length.toLocaleString() + '건 ← 이만큼 가격이 바뀝니다\n' +
    '실패: ' + bad.length.toLocaleString() + '건 (건너뜀)\n\n' +
    '되돌리기: [▶ 리프라이싱 → ↩ 되돌리기]로 복구 가능합니다.\n\n계속할까요?',
    ui_().ButtonSet.YES_NO);
  if (r !== ui_().Button.YES) return;
  applyStartLive_(runId, valid);
}

function applyScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === APPLY_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(APPLY_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/** 대장에서 해당 SKU·가격 행을 반영됨으로 확정 */
function markPriceLogAppliedBySku_(list) {
  if (!list.length) return;
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (!sh || sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, 1, n, PRICELOG_HEADER.length).getValues();
  var want = {};
  for (var i = 0; i < list.length; i++) want[list[i].sku + '|' + list[i].price] = true;
  var flags = [], changed = false;
  for (var j = 0; j < vals.length; j++) {
    var cur = vals[j][PL_APPLIED] === true;
    var next = cur || !!want[String(vals[j][PL_SKU]) + '|' + Number(vals[j][PL_NEW])];
    if (next !== cur) changed = true;
    flags.push([next]);
  }
  if (changed) sh.getRange(2, PL_APPLIED + 1, n, 1).setValues(flags);
  clearPriceLogCache_();
}

/**
 * 되돌린 SKU에 대해 원래 실행의 대장 기록을 '미반영'으로 되돌린다.
 * 그래야 r0가 그 이전 상태(더 오래된 반영 기록 또는 등록일)로 자동 복귀한다.
 * @return {number} 취소한 행 수
 */
function unmarkPriceLogRun_(origRunId, skus) {
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (!sh || sh.getLastRow() < 2) return 0;
  var want = {};
  for (var i = 0; i < skus.length; i++) want[skus[i]] = true;
  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, 1, n, PRICELOG_HEADER.length).getValues();
  var flags = [], reasons = [], changed = 0;
  for (var j = 0; j < vals.length; j++) {
    var isTarget = vals[j][PL_APPLIED] === true &&
                   String(vals[j][PL_RUNID]) === origRunId &&
                   want[String(vals[j][PL_SKU])];
    flags.push([isTarget ? false : vals[j][PL_APPLIED]]);
    reasons.push([isTarget ? String(vals[j][PL_REASON]) + ' (되돌림)' : vals[j][PL_REASON]]);
    if (isTarget) changed++;
  }
  if (changed) {
    sh.getRange(2, PL_APPLIED + 1, n, 1).setValues(flags);
    sh.getRange(2, PL_REASON + 1, n, 1).setValues(reasons);
    clearPriceLogCache_();
  }
  return changed;
}

/** 메뉴: 진행 상황 / 중단 */
function applyStatus() {
  var props = PropertiesService.getScriptProperties();
  applyQueueMigrate_();
  var total = applyQueueTotal_();
  var done = Math.min(applyQueueCursor_(), total);
  var left = applyQueueRemaining_();
  var mode = props.getProperty(PROP_APPLY_MODE) || '-';
  var runId = props.getProperty(PROP_APPLY_RUNID) || '-';
  var fails = Number(props.getProperty(PROP_APPLY_FAILS) || 0);
  var alive = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === APPLY_CONTINUE_HANDLER;
  }).length > 0;

  // 검증은 끝났는데 실반영 승인이 밀린 상태
  if (props.getProperty(PROP_APPLY_AWAIT) === '1') {
    var r0 = ui_().alert('실반영 승인 대기 중',
      '실행: ' + runId + '\n\n' +
      '검증은 끝났고 아직 가격은 하나도 바뀌지 않았습니다.\n' +
      '자동 진행 중에는 확인 창을 띄울 수 없어 여기서 멈춰 있습니다.\n\n' +
      '지금 실반영을 진행할까요?', ui_().ButtonSet.YES_NO);
    if (r0 === ui_().Button.YES) applyContinueToLive();
    return;
  }

  if (!left) {
    ui_().alert('가격 반영',
      '진행 중인 작업이 없습니다.' +
      (total ? '\n\n마지막 작업: ' + runId + ' · ' + total.toLocaleString() + '건 완료' : ''),
      ui_().ButtonSet.OK);
    return;
  }

  // 마지막으로 실제 진행이 있었던 시각. 예약이 '있음'인데 이게 오래됐으면
  // 자동 실행 한도(일반 Gmail 90분/일)에 걸려 트리거가 안 도는 상태다 —
  // 트리거는 목록에 남아 있으므로 '있음'만 봐서는 멈춘 걸 알 수 없다.
  var lastAt = null;
  var rs = ss_().getSheetByName(SHEET_APPLY);
  if (rs && rs.getLastRow() > 1) {
    var lv = rs.getRange(rs.getLastRow(), AP_AT + 1).getValue();
    if (lv instanceof Date) lastAt = lv;
  }
  var idleMin = lastAt ? Math.round((Date.now() - lastAt.getTime()) / 60000) : -1;
  var stalled = alive && idleMin > 5;

  var r = ui_().alert('가격 반영 진행 중',
    '실행: ' + runId + '\n' +
    '단계: ' + (mode === 'preview'
                 ? ((props.getProperty(PROP_APPLY_PLAN) === 'sample' ? '표본' : '전량') +
                    ' 검증 (가격 안 바뀜)')
                 : '실반영') + '\n' +
    '진행: ' + done.toLocaleString() + ' / ' + total.toLocaleString() + '건\n' +
    '남음: ' + left.toLocaleString() + '건\n' +
    '이어실행 예약: ' + (alive ? '있음' : '없음') +
    (idleMin >= 0 ? ' · 마지막 진행 ' + idleMin + '분 전' : '') +
    (fails ? '\n연속 실패: ' + fails + '회' : '') + '\n\n' +
    (stalled
      ? '⚠ 예약은 있는데 ' + idleMin + '분째 진행이 없습니다.\n' +
        '   자동 실행 한도(하루 90분)에 걸렸을 수 있습니다.\n' +
        '   [예]로 직접 돌리면 이 한도와 무관하게 진행됩니다.\n\n'
      : alive ? '' : '⚠ 자동 진행이 멈춰 있습니다.\n\n') +
    '[예]  지금 이어서 진행 (4~5분 소요)\n' +
    '[아니오]  남은 작업 취소\n' +
    '[취소]  그냥 닫기 (자동 진행은 계속)',
    ui_().ButtonSet.YES_NO_CANCEL);

  if (r === ui_().Button.YES) {
    props.deleteProperty(PROP_APPLY_FAILS);
    toast_('이어서 진행합니다 — 남음 ' + left.toLocaleString() + '건');
    applyChunk_();
    return;
  }
  if (r === ui_().Button.NO) {
    applyScheduleContinue_(false);
    props.setProperty(PROP_APPLY_CURSOR, String(total));   // 남은 작업 버림
    ui_().alert('중단했습니다. 이미 반영된 건은 그대로입니다.\n[▶ 리프라이싱 → ↩ 되돌리기]로 복구할 수 있습니다.');
  }
}

/** 메뉴: 실패분만 다시 시도 */
function retryFailedApplies() {
  var sh = getSheetOrThrow_(SHEET_APPLY);
  if (sh.getLastRow() < 2) throw new Error('반영 결과가 없습니다.');
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, APPLY_HEADER.length).getValues();
  var q = [], seen = {};
  for (var i = vals.length - 1; i >= 0; i--) {
    var s = String(vals[i][AP_STATUS]);
    var sku = String(vals[i][AP_SKU] || '').trim();
    if (!sku || seen[sku]) continue;
    seen[sku] = true;
    if (s === 'ACCEPTED' || s === 'VALID') continue;
    q.push({ sku: sku, price: Number(vals[i][AP_NEW]), old: Number(vals[i][AP_OLD]) });
  }
  if (!q.length) { ui_().alert('재시도할 실패 건이 없습니다.'); return; }
  var r = ui_().alert('실패분 재시도',
    q.length + '건을 다시 시도합니다.\n검증부터 다시 하므로 가격이 바로 바뀌지는 않습니다.\n\n계속할까요?',
    ui_().ButtonSet.YES_NO);
  if (r !== ui_().Button.YES) return;
  var props = PropertiesService.getScriptProperties();
  var runId = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '_RETRY';
  props.setProperty(PROP_APPLY_RUNID, runId);
  props.setProperty(PROP_APPLY_MODE, 'preview');
  props.deleteProperty(PROP_APPLY_AWAIT);
  props.deleteProperty(PROP_APPLY_FAILS);
  applyQueueWrite_(q);
  applyChunk_();
}

/**
 * 메뉴: 되돌리기 피드를 파일이 아니라 API로 직접 반영.
 * 스냅샷/실행단위 롤백과 같은 판단을 쓰되, 여기서는 곧바로 적용 큐에 넣는다.
 */
function applyRollbackToAmazon() {
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (!sh || sh.getLastRow() < 2) throw new Error('가격변경대장이 비어 있습니다.');
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, PRICELOG_HEADER.length).getValues();
  var runs = {};
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][PL_APPLIED] !== true) continue;
    var rid = String(vals[i][PL_RUNID] || '');
    if (!rid || rid.indexOf('ROLLBACK_') === 0) continue;
    if (!runs[rid]) runs[rid] = [];
    runs[rid].push({ sku: String(vals[i][PL_SKU]), price: Number(vals[i][PL_OLD]),
                     old: Number(vals[i][PL_NEW]) });
  }
  var ids = Object.keys(runs).sort();
  if (!ids.length) throw new Error('되돌릴 반영 기록이 없습니다.');

  var lines = ids.map(function (r, i) { return (i + 1) + ') ' + r + '  ' + runs[r].length + '건'; }).join('\n');
  var res = ui_().prompt('API로 되돌리기',
    lines + '\n\n번호를 입력하세요 (가장 최근 = ' + ids.length + ')', ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var pick = parseInt(res.getResponseText().trim(), 10);
  if (!(pick >= 1 && pick <= ids.length)) throw new Error('잘못된 번호입니다.');

  var q = runs[ids[pick - 1]];
  var ok = ui_().alert('되돌리기 확인',
    ids[pick - 1] + ' 에서 바꾼 ' + q.length + '건을\n이전 가격으로 되돌립니다.\n\n계속할까요?',
    ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  var props = PropertiesService.getScriptProperties();
  var runId = 'ROLLBACK_' + ids[pick - 1];
  props.setProperty(PROP_APPLY_RUNID, runId);
  props.setProperty(PROP_APPLY_MODE, 'preview');
  props.deleteProperty(PROP_APPLY_AWAIT);
  props.deleteProperty(PROP_APPLY_FAILS);
  applyQueueWrite_(q);
  var out = ensureSheet_(SHEET_APPLY, APPLY_HEADER);
  if (out.getLastRow() === 0) {
    out.getRange(1, 1, 1, APPLY_HEADER.length).setValues([APPLY_HEADER]).setFontWeight('bold');
  }
  toast_('되돌리기 검증 시작 — ' + q.length + '건');
  applyChunk_();
}
