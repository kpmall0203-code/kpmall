/**
 * 67_반영검증.gs — 방금 반영한 SKU만 아마존에서 되받아 확인
 *
 * 왜 따로 만드는가:
 *   [🔄 데이터 갱신 → 아마존 동기화]는 전체 리포트(GET_MERCHANT_LISTINGS_ALL_DATA)를 만들어 받는다.
 *   12,000행을 통째로 뽑는 방식이라 생성·폴링만 3~4분이고, 6분 제한에 걸려 이어실행까지 간다.
 *   확인하고 싶은 게 방금 바꾼 4건이든 200건이든 비용은 똑같다.
 *
 *   Listings Items API는 SKU 하나를 바로 조회할 수 있다(GET + includedData=offers).
 *   200건이면 200번 호출이지만 건당 0.2초라 40초면 끝난다.
 *   200건을 넘어가면 전체 리포트가 오히려 싸지므로 그때는 동기화를 권한다.
 *
 * 확인 결과는 '리스팅' 탭 가격에도 그대로 덮어쓴다.
 *   아마존이 실제로 갖고 있는 값이 정답이므로, 이걸 반영해두면
 *   다음 리프라이싱이 옛 가격을 P0로 쓰는 사고를 막는다.
 */

var SHEET_VERIFY = '반영검증';
var VERIFY_HEADER = ['SKU', '이전가', '기대가', '아마존 실제가', '판정', '확인시각', '실행ID'];
var VF_SKU = 0, VF_OLD = 1, VF_WANT = 2, VF_ACTUAL = 3, VF_VERDICT = 4, VF_AT = 5, VF_RUN = 6;

var PROP_VERIFY_QUEUE = 'VERIFY_QUEUE';
var PROP_VERIFY_RUNID = 'VERIFY_RUNID';
var VERIFY_CONTINUE_HANDLER = 'continueVerify';

var VERIFY_SLEEP_MS = 220;
var VERIFY_SOFT_MS = 4.5 * 60 * 1000;

/** 개별조회가 전체 리포트보다 싼 한계. 넘으면 동기화를 권한다. */
var VERIFY_MAX_ITEMS = 400;

/** 반영 직후엔 아직 옛 가격이 보일 수 있다. 이 시간이 안 지났으면 경고. */
var VERIFY_SETTLE_MS = 3 * 60 * 1000;

/** SKU 하나의 현재 판매가를 아마존에서 직접 읽는다. 없으면 null */
function fetchLivePrice_(token, seller, sku) {
  var path = '/listings/2021-08-01/items/' + encodeURIComponent(seller) + '/' +
             encodeURIComponent(sku) +
             '?marketplaceIds=' + MARKETPLACE_JP + '&includedData=offers';
  var j = spapi_(token, 'get', path);
  var offers = j.offers || [];
  for (var i = 0; i < offers.length; i++) {
    var p = offers[i].price;
    if (p && p.amount !== null && p.amount !== undefined) return Number(p.amount);
  }
  return null;
}

/**
 * 반영결과 탭에서 확인할 실행을 고른다.
 * 실반영(_LIVE)만 대상 — 검증(VALIDATION_PREVIEW)은 가격을 바꾸지 않았으니 확인할 게 없다.
 * @return {{runId:string, items:Array, at:Date}|null}
 */
function pickVerifyRun_() {
  var sh = ss_().getSheetByName(SHEET_APPLY);
  if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, APPLY_HEADER.length).getValues();

  var byRun = {}, order = [], lastAt = {};
  for (var i = 0; i < vals.length; i++) {
    var rid = String(vals[i][AP_RUN] || '');
    if (!/_LIVE$/.test(rid)) continue;
    var st = String(vals[i][AP_STATUS] || '');
    if (st === 'ERROR' || st === 'INVALID') continue;   // 애초에 안 나간 건
    var sku = String(vals[i][AP_SKU] || '').trim();
    if (!sku) continue;
    if (!byRun[rid]) { byRun[rid] = {}; order.push(rid); }
    // 같은 SKU가 재시도로 여러 번 있으면 마지막 것이 진짜
    byRun[rid][sku] = { sku: sku, old: Number(vals[i][AP_OLD]), price: Number(vals[i][AP_NEW]) };
    var t = vals[i][AP_AT];
    if (t instanceof Date) lastAt[rid] = t;
  }
  if (!order.length) return null;

  var runId = order[order.length - 1];
  var items = [];
  for (var k in byRun[runId]) items.push(byRun[runId][k]);
  return { runId: runId, items: items, at: lastAt[runId] || null };
}

/**
 * 메뉴: 반영 결과 확인.
 *
 * 건수에 따라 방법을 바꾼다 — 둘 다 결과 형식은 같다.
 *   400건 이하 → SKU마다 직접 조회 (동기화 불필요, 몇 초)
 *   400건 초과 → 동기화된 '리스팅' 탭과 대조 (API 호출 0회, 즉시)
 *
 * 개별 조회는 건당 비용이 있어 수천 건이면 전체 리포트가 훨씬 싸다.
 * 대신 리포트는 받아둔 시점의 값이므로, 반영보다 오래된 리스팅으로
 * 대조하면 '아직 안 바뀐 것'을 '틀렸다'고 잘못 읽는다. 그래서 신선도를 먼저 본다.
 */
function verifyAppliedPrices() {
  var pick = pickVerifyRun_();
  if (!pick) {
    throw new Error('실제로 반영된 실행이 없습니다.\n' +
                    '[▶ 리프라이싱 → ② 승인분 아마존 반영]를 먼저 실행하세요.');
  }

  var n = pick.items.length;
  if (n > VERIFY_MAX_ITEMS) { verifyByListing_(pick); return; }

  var seller = sellerId_();
  var warn = '';
  if (pick.at && Date.now() - pick.at.getTime() < VERIFY_SETTLE_MS) {
    warn = '\n\n⚠ 반영한 지 얼마 안 됐습니다.\n' +
           '아마존 반영에는 보통 1~3분이 걸리므로,\n' +
           '지금 조회하면 아직 이전 가격이 보일 수 있습니다.';
  }

  var est = Math.ceil(n * (VERIFY_SLEEP_MS + 400) / 1000);
  var r = ui_().alert('반영 확인',
    '실행: ' + pick.runId + '\n' +
    '대상: ' + n.toLocaleString() + '건 (예상 ' + est + '초)\n\n' +
    '아마존에서 이 SKU들의 현재 판매가만 직접 읽어와\n' +
    '기대가와 맞는지 비교합니다. 가격은 바뀌지 않습니다.\n' +
    "확인된 값은 '리스팅' 탭 가격에도 반영됩니다." + warn + '\n\n진행할까요?',
    ui_().ButtonSet.YES_NO);
  if (r !== ui_().Button.YES) return;

  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_VERIFY_QUEUE, JSON.stringify(pick.items));
  props.setProperty(PROP_VERIFY_RUNID, pick.runId);

  // 이번 실행분 이전 기록은 지우고 새로 쌓는다 (재실행해도 중복되지 않게)
  clearVerifyRun_(pick.runId);

  verifyChunk_();
}

/**
 * 대량 확인: 동기화된 '리스팅' 탭과 대조한다. API 호출이 없어 건수 제한이 없다.
 *
 * 전제는 '리스팅이 반영보다 나중에 받아졌을 것'. 그렇지 않으면 결과가 무의미하므로
 * 진행하지 않고 동기화를 먼저 하게 한다 — 틀린 확인은 확인 안 한 것보다 나쁘다.
 */
function verifyByListing_(pick) {
  var props = PropertiesService.getScriptProperties();
  var syncAt = Number(props.getProperty(PROP_LAST_SYNC_AT) || 0);
  var appliedAt = pick.at ? pick.at.getTime() : 0;

  if (!syncAt || (appliedAt && syncAt < appliedAt)) {
    var when = syncAt ? Utilities.formatDate(new Date(syncAt), Session.getScriptTimeZone(),
                                             'MM-dd HH:mm') : '기록 없음';
    var r = ui_().alert('먼저 동기화가 필요합니다',
      pick.items.length.toLocaleString() + '건은 개별 조회 대신\n' +
      "'리스팅' 탭과 대조해 확인합니다 (즉시, 호출 0회).\n\n" +
      '그런데 리스팅이 반영보다 오래됐습니다.\n' +
      '  마지막 동기화: ' + when + '\n' +
      '  가격 반영    : ' +
        (appliedAt ? Utilities.formatDate(new Date(appliedAt), Session.getScriptTimeZone(),
                                          'MM-dd HH:mm') : '?') + '\n\n' +
      '이대로 대조하면 옛 가격과 비교하게 됩니다.\n\n' +
      '지금 [🔄 데이터 갱신 → 아마존 동기화]를 실행할까요?', ui_().ButtonSet.YES_NO);
    if (r === ui_().Button.YES) syncAmazon();
    return;
  }

  var listSh = getSheetOrThrow_(SHEET_LISTING);
  if (listSh.getLastRow() < 2) throw new Error('리스팅이 비어 있습니다.');
  var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
  var actual = {};
  for (var i = 0; i < lv.length; i++) {
    var s = String(lv[i][L_SKU] || '').trim();
    if (s) actual[s] = Number(lv[i][L_PRICE]);
  }

  var now = new Date();
  var rows = [], ok = 0, pending = 0, diff = 0, missing = 0;
  for (var k = 0; k < pick.items.length; k++) {
    var it = pick.items[k];
    var a = actual[it.sku];
    var verdict;
    if (a === undefined) { verdict = '리스팅에 없음'; missing++; }
    else {
      verdict = verifyVerdict_(it.old, it.price, a);
      if (verdict === '일치') ok++;
      else if (verdict === '아직 반영 전') pending++;
      else diff++;
    }
    rows.push([it.sku, it.old, it.price, a === undefined ? '' : a, verdict, now, pick.runId]);
  }

  clearVerifyRun_(pick.runId);
  var sh = ensureSheet_(SHEET_VERIFY, VERIFY_HEADER);
  var CH = 2000;
  for (var s2 = 0; s2 < rows.length; s2 += CH) {
    var part = rows.slice(s2, s2 + CH);
    sh.getRange(sh.getLastRow() + 1, 1, part.length, VERIFY_HEADER.length).setValues(part);
  }
  formatVerifySheet_(sh);

  var total = pick.items.length;
  var pctOk = total ? Math.round(ok / total * 100) : 0;
  log_('verify', 'INFO', '리스팅 대조 ' + pick.runId + ' · 일치 ' + ok + '/' + total);

  showSheet_(SHEET_VERIFY);
  ui_().alert('반영 대조 완료 — ' + SHEET_VERIFY + ' 탭',
    '실행: ' + pick.runId + '\n' +
    '대조: 동기화된 리스팅 (' +
      Utilities.formatDate(new Date(syncAt), Session.getScriptTimeZone(), 'MM-dd HH:mm') + ' 기준)\n\n' +
    '✅ 일치           ' + ok.toLocaleString() + '건  (' + pctOk + '%)\n' +
    '⏳ 아직 반영 전   ' + pending.toLocaleString() + '건\n' +
    '⚠ 불일치         ' + diff.toLocaleString() + '건\n' +
    (missing ? '· 리스팅에 없음  ' + missing.toLocaleString() + '건\n' : '') +
    '\n대상 ' + total.toLocaleString() + '건\n\n' +
    (pending ? '⏳ 는 동기화 이후에 반영됐을 수 있습니다.\n동기화를 한 번 더 돌리고 다시 대조하세요.\n' : '') +
    (diff ? '⚠ 는 기대가도 이전가도 아닙니다. ' + SHEET_VERIFY + ' 탭에서 확인하세요.\n' : '') +
    (!pending && !diff && !missing ? '전부 의도대로 반영됐습니다.' : ''),
    ui_().ButtonSet.OK);
}

/** 트리거용 이어실행 */
function continueVerify() {
  withLockOrRetry_('반영 확인', VERIFY_CONTINUE_HANDLER, function () {
    try { verifyChunk_(); } catch (e) { log_('verify', 'ERROR', String(e)); }
  });
}

function verifyChunk_() {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_VERIFY_QUEUE) || '[]');
  var runId = props.getProperty(PROP_VERIFY_RUNID) || '';
  if (!queue.length) { verifyFinish_(runId); return; }

  var seller = sellerId_();
  var token = getLwaToken_();
  var rows = [];
  var now = new Date();

  while (queue.length && Date.now() - t0 < VERIFY_SOFT_MS) {
    var it = queue.shift();
    var actual = null, verdict;
    try {
      actual = fetchLivePrice_(token, seller, it.sku);
      verdict = verifyVerdict_(it.old, it.price, actual);
    } catch (e) {
      verdict = '조회실패: ' + String(e).substring(0, 80);
    }
    rows.push([it.sku, it.old, it.price, actual === null ? '' : actual, verdict, now, runId]);
    Utilities.sleep(VERIFY_SLEEP_MS);
  }

  if (rows.length) {
    var out = ensureSheet_(SHEET_VERIFY, VERIFY_HEADER);
    out.getRange(out.getLastRow() + 1, 1, rows.length, VERIFY_HEADER.length).setValues(rows);
  }
  props.setProperty(PROP_VERIFY_QUEUE, JSON.stringify(queue));

  if (queue.length) {
    verifyScheduleContinue_(true);
    toast_('반영 확인 ' + rows.length + '건 · 남음 ' + queue.length + '건');
  } else {
    verifyFinish_(runId);
  }
}

/**
 * 기대가 / 실제가 / 이전가를 놓고 판정.
 * 이전가와 같으면 '아직 반영 전'이지 '틀림'이 아니다 — 재확인하면 되므로 구분한다.
 */
function verifyVerdict_(oldPrice, wantPrice, actual) {
  if (actual === null) return '가격없음';
  if (Math.abs(actual - wantPrice) < 0.5) return '일치';
  if (Math.abs(actual - oldPrice) < 0.5) return '아직 반영 전';
  return '불일치';
}

function verifyScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === VERIFY_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(VERIFY_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/** 같은 실행을 다시 확인할 때 옛 기록을 지운다 */
function clearVerifyRun_(runId) {
  var sh = ss_().getSheetByName(SHEET_VERIFY);
  if (!sh || sh.getLastRow() < 2) return;
  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, 1, n, VERIFY_HEADER.length).getValues();
  var keep = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][VF_RUN]) !== runId) keep.push(vals[i]);
  }
  if (keep.length === vals.length) return;
  sh.getRange(2, 1, n, VERIFY_HEADER.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, VERIFY_HEADER.length).setValues(keep);
}

function verifyFinish_(runId) {
  verifyScheduleContinue_(false);
  PropertiesService.getScriptProperties().deleteProperty(PROP_VERIFY_QUEUE);

  var sh = ss_().getSheetByName(SHEET_VERIFY);
  if (!sh || sh.getLastRow() < 2) return;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, VERIFY_HEADER.length).getValues();
  var mine = vals.filter(function (v) { return String(v[VF_RUN]) === runId; });
  if (!mine.length) return;

  var ok = 0, pending = 0, diff = 0, none = 0, fail = 0;
  var priceMap = {};
  var badRows = [];
  for (var i = 0; i < mine.length; i++) {
    var v = mine[i], verdict = String(v[VF_VERDICT]);
    var actual = Number(v[VF_ACTUAL]);
    if (actual > 0) priceMap[String(v[VF_SKU])] = actual;   // 실제값이 정답
    if (verdict === '일치') ok++;
    else if (verdict === '아직 반영 전') { pending++; badRows.push(v); }
    else if (verdict === '불일치') { diff++; badRows.push(v); }
    else if (verdict === '가격없음') none++;
    else fail++;
  }

  var synced = applyVerifiedPricesToListing_(priceMap);
  formatVerifySheet_(sh);
  log_('verify', 'INFO', '반영 확인 ' + runId + ' · 일치 ' + ok + ' / 대기 ' + pending +
                         ' / 불일치 ' + diff + ' / 리스팅 갱신 ' + synced);

  var msg = '실행: ' + runId + '\n\n' +
            '✅ 일치           ' + ok.toLocaleString() + '건\n' +
            '⏳ 아직 반영 전   ' + pending.toLocaleString() + '건\n' +
            '⚠ 불일치         ' + diff.toLocaleString() + '건\n' +
            (none ? '· 가격없음      ' + none + '건\n' : '') +
            (fail ? '· 조회실패      ' + fail + '건\n' : '') +
            '\n' + synced.toLocaleString() + "건을 '리스팅' 탭 가격에 반영했습니다.";

  if (badRows.length) {
    msg += '\n\n예시:\n' + badRows.slice(0, 3).map(function (v) {
      return '  ' + v[VF_SKU] + ': 기대 ' + v[VF_WANT] + ' → 실제 ' + v[VF_ACTUAL];
    }).join('\n');
  }
  if (pending) {
    msg += '\n\n⏳ 는 아직 아마존에 퍼지는 중일 수 있습니다.\n' +
           '5분쯤 뒤 [✓ 반영 확인]을 한 번 더 누르세요.';
  }
  if (diff) {
    msg += '\n\n⚠ 는 기대가도 이전가도 아닙니다.\n' +
           '다른 도구나 아마존 자동가격이 건드렸을 수 있습니다.';
  }

  showSheet_(SHEET_VERIFY);
  ui_().alert('반영 확인 완료 — ' + SHEET_VERIFY + ' 탭', msg, ui_().ButtonSet.OK);
}

/**
 * 확인된 실제가를 리스팅 탭에 덮어쓴다.
 * 전체 동기화를 돌리지 않고도 시트가 아마존과 같아진다.
 * @return {number} 실제로 바뀐 행 수
 */
function applyVerifiedPricesToListing_(priceMap) {
  var keys = Object.keys(priceMap);
  if (!keys.length) return 0;
  var sh = ss_().getSheetByName(SHEET_LISTING);
  if (!sh || sh.getLastRow() < 2) return 0;

  var n = sh.getLastRow() - 1;
  var skus = sh.getRange(2, L_SKU + 1, n, 1).getValues();
  var prices = sh.getRange(2, L_PRICE + 1, n, 1).getValues();
  var changed = 0;
  for (var i = 0; i < n; i++) {
    var p = priceMap[String(skus[i][0]).trim()];
    if (p === undefined) continue;
    if (Number(prices[i][0]) === p) continue;
    prices[i][0] = p;
    changed++;
  }
  if (changed) sh.getRange(2, L_PRICE + 1, n, 1).setValues(prices);
  return changed;
}

function formatVerifySheet_(sh) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  sh.getRange(1, 1, 1, VERIFY_HEADER.length)
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  var v = sh.getRange(2, VF_VERDICT + 1, n, 1).getValues();
  var bg = [];
  for (var i = 0; i < n; i++) {
    var t = String(v[i][0]);
    bg.push([t === '일치' ? '#e6f4ea'
           : t === '아직 반영 전' ? '#fff4d6'
           : t === '불일치' ? '#fce8e6'
           : '#f1f3f4']);
  }
  sh.getRange(2, VF_VERDICT + 1, n, 1).setBackgrounds(bg);
}
