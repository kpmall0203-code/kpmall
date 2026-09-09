/**
 * 72AC_상품광고.gs — SKU 하나하나의 광고를 손에 쥔다 (EXPAND 1단계 준비)
 *
 * ── 왜 이제 와서 받나 ───────────────────────────────────
 * 광고구조 수집(72D)은 큰 그룹의 상품을 일부러 세지 않았다. 그때 든 이유는
 * "거기 든 SKU 에 할 일은 어차피 전용 캠페인을 새로 만드는 것뿐" 이었다.
 * 입찰만 생각하면 맞는 말이다 — 그룹 입찰 하나가 수천 SKU 에 함께 걸리니
 * 한 상품 때문에 올릴 수가 없다.
 *
 * 그런데 할 일이 하나 더 있다는 것을 자료가 알려 줬다. 성숙 30일 동안
 * 주문 0 인데 돈만 쓴 SKU 가 105개(¥30,894)다. 이것들은 입찰을 내릴 것이 아니라
 * 그 상품의 광고 하나만 멈추면 된다 — 그리고 상품광고(productAd)는 그룹 입찰과
 * 무관하게 낱개로 멈출 수 있다. 즉 큰 그룹 안에서도 할 수 있는 일이 있다.
 * 그러려면 SKU 하나하나의 광고ID 를 알아야 한다. 이 표가 그것이다.
 *
 * ── 크기 ────────────────────────────────────────────────
 * 계정에 상품광고가 1만 6천 개쯤 있다. 9칸이니 15만 셀 — 한도(1,000만)에 견주면
 * 작다. 다만 한 번에 다 못 받으므로 4분마다 끊어 이어 달린다 (다른 수집과 같은 방식).
 *
 * ── 여기서는 아무것도 바꾸지 않는다 ─────────────────────
 * 목록을 받아 적을 뿐이다. 멈추는 것은 72AD 가 사람의 승인을 받고 한다.
 */

var SHEET_ADUNIT = '상품광고목록';
var ADUNIT_HEADER = ['SKU', 'ASIN', '캠페인', '광고그룹', '상태',
                     '광고ID', '캠페인ID', '광고그룹ID', '수집일시'];
var ADUNIT_ID_COLS = [6, 7, 8];        // 1부터 — ID 는 글자 서식이라야 뒷자리가 안 잘린다

var ADUNIT_PAGE = 500;                 // 한 번에 받을 줄 수
var ADUNIT_FLUSH = 2000;               // 이만큼 모이면 시트에 적는다
var ADUNIT_CONTINUE = 'continueAdUnits';
var PROP_ADUNIT_NEXT = 'ADUNIT_NEXT';  // 이어받을 자리표 (없으면 처음부터)
var PROP_ADUNIT_ROW = 'ADUNIT_ROW';    // 다음에 적을 줄 번호

/**
 * 메뉴: 상품광고 목록 수집.
 *
 * 처음 부르면 표를 비우고 처음부터, 이어 달리는 중이면 그 자리부터 받는다.
 */
function fetchAdProductAds() {
  if (!adBusyGuard_('상품광고 목록 수집')) return;
  adUnitSheet_();                       // 없으면 만들고 그대로 이어간다
  var props = PropertiesService.getScriptProperties();
  var resuming = !!props.getProperty(PROP_ADUNIT_NEXT);
  if (!resuming) {
    props.deleteProperty(PROP_ADUNIT_ROW);
    var sh0 = adUnitSheet_();
    if (sh0.getLastRow() > 1) sh0.getRange(2, 1, sh0.getLastRow() - 1, ADUNIT_HEADER.length).clearContent();
  }
  var msg = adUnitStep_(true);
  ui_().alert('상품광고 목록 수집', msg, ui_().ButtonSet.OK);
}

/**
 * 표를 확보한다 — 없으면 만들고 머리글을 넣는다.
 *
 * 예전에는 부르는 쪽에서 makeOneSheet_ 로 만들고 "한 번 더 누르세요" 하고 멈췄다.
 * 그런데 [광고 자료 갱신] 사슬은 사람이 없다 — 멈추면 그 걸음이 그냥 실패한다
 * (실제로 "탭이 없습니다" 로 죽었다). 그래서 여기서 확보하고 바로 이어간다.
 */
function adUnitSheet_() {
  var sh = ss_().getSheetByName(SHEET_ADUNIT);
  if (sh) return sh;
  sh = ss_().insertSheet(SHEET_ADUNIT);
  sh.getRange(1, 1, 1, ADUNIT_HEADER.length).setValues([ADUNIT_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  SpreadsheetApp.flush();
  log_('ads', 'INFO', '"' + SHEET_ADUNIT + '" 표를 만들었습니다');
  return sh;
}

/** 이어 달리기용 (트리거가 부른다) */
function continueAdUnits() {
  withLockOrRetry_('상품광고 목록 수집', ADUNIT_CONTINUE, function () {
    try { adUnitStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

/**
 * 한 걸음 — 시간이 다 될 때까지 받아 적고, 남았으면 1분 뒤로 미룬다.
 * @return {string} 사람에게 보여줄 한 줄
 */
function adUnitStep_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var token = adsToken_();
  var sh = adUnitSheet_();
  var names = adUnitNames_();

  var next = props.getProperty(PROP_ADUNIT_NEXT) || null;
  var row = parseInt(props.getProperty(PROP_ADUNIT_ROW) || '', 10);
  if (!(row >= 2)) row = 2;

  var buf = [], got = 0, pages = 0, now = new Date();
  var flush = function () {
    if (!buf.length) return;
    var need = row + buf.length + 10;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    for (var c = 0; c < ADUNIT_ID_COLS.length; c++) {
      sh.getRange(row, ADUNIT_ID_COLS[c], buf.length, 1).setNumberFormat('@');
    }
    sh.getRange(row, 1, buf.length, ADUNIT_HEADER.length).setValues(buf);
    row += buf.length;
    buf = [];
    props.setProperty(PROP_ADUNIT_ROW, String(row));
  };

  while (Date.now() - t0 < ADS_SOFT_MS) {
    var body = { maxResults: ADUNIT_PAGE, stateFilter: { include: ['ENABLED', 'PAUSED'] } };
    if (next) body.nextToken = next;
    var r = adsApi_(token, 'post', '/sp/productAds/list', body,
                    ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
    var arr = (r && r.productAds) || [];
    for (var i = 0; i < arr.length; i++) {
      var a = arr[i];
      var gid = String(a.adGroupId || '');
      var nm = names[gid] || { camp: '', grp: '' };
      buf.push([String(a.sku || ''), String(a.asin || ''), nm.camp, nm.grp,
                String(a.state || ''), String(a.adId || ''),
                String(a.campaignId || ''), gid, now]);
    }
    got += arr.length; pages++;
    if (buf.length >= ADUNIT_FLUSH) flush();
    next = r && r.nextToken ? r.nextToken : null;
    if (!next) break;
  }
  flush();

  if (next) {
    props.setProperty(PROP_ADUNIT_NEXT, next);
    adUnitContinue_(true);
    var m1 = '상품광고 ' + (row - 2).toLocaleString() + '개까지 받았습니다 — 1분 뒤 이어서 받습니다.';
    log_('ads', 'INFO', '상품광고 목록 — ' + (row - 2) + '개 · 이어받기');
    return m1;
  }

  props.deleteProperty(PROP_ADUNIT_NEXT);
  props.deleteProperty(PROP_ADUNIT_ROW);
  adUnitContinue_(false);
  var total = row - 2;
  var nSku = adUnitSkuCount_(sh);
  log_('ads', 'INFO', '상품광고 목록 — ' + total + '개 · SKU ' + nSku + '개 · 완료');
  adUnitNotes_(sh);
  if (interactive) showSheet_(SHEET_ADUNIT);
  return '상품광고 ' + total.toLocaleString() + '개 · SKU ' + nSku.toLocaleString() + '개 · 완료\n\n' +
         '이제 SKU 하나하나의 광고를 낱개로 멈출 수 있습니다.\n' +
         '다음: [🛑 멈추기 → ② 멈춤 후보 만들기]';
}

function adUnitContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADUNIT_CONTINUE) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ADUNIT_CONTINUE).timeBased().after(60 * 1000).create();
}

/** 광고그룹ID → 캠페인·그룹 이름 (광고그룹 표에서. 없으면 빈칸) */
function adUnitNames_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADGRP);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var gid = String(v[i][9] || '').trim();          // 광고그룹ID
    if (gid) out[gid] = { camp: String(v[i][0] || ''), grp: String(v[i][2] || '') };
  }
  return out;
}

function adUnitSkuCount_(sh) {
  if (sh.getLastRow() < 2) return 0;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  var seen = {}, n = 0;
  for (var i = 0; i < v.length; i++) {
    var s = String(v[i][0] || '').trim();
    if (s && !seen[s]) { seen[s] = true; n++; }
  }
  return n;
}

/**
 * SKU → 그 SKU 의 광고들. 멈춤 후보(72AD)가 이것으로 손잡이를 찾는다.
 * @return {Object} sku → {ads:[{id,gid,cid,camp,grp,state}], on:number}
 */
function adUnitMap_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADUNIT);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADUNIT_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][0] || '').trim();
    var id = String(v[i][5] || '').trim();
    if (!sku || !id) continue;
    var o = out[sku] || (out[sku] = { ads: [], on: 0 });
    var st = String(v[i][4] || '');
    o.ads.push({ id: id, gid: String(v[i][7] || ''), cid: String(v[i][6] || ''),
                 camp: String(v[i][2] || ''), grp: String(v[i][3] || ''), state: st });
    if (st === 'ENABLED') o.on++;
  }
  return out;
}

function adUnitNotes_(sh) {
  headerNotes_(sh, 1, ADUNIT_HEADER, {
    'SKU': '광고에 올라가 있는 SKU. 큰 그룹(몰아넣기)에 든 것도 여기에는 다 있다 —\n' +
           '광고구조 표의 "광고상품" 은 전용 그룹만 세지만, 이 표는 전부 센다.',
    '광고ID': '이 SKU 의 광고 하나를 가리키는 자리표. 이것이 있어야 그 상품만 멈출 수 있다.\n' +
              '그룹 입찰은 그룹 전체에 걸리지만, 상품광고는 낱개로 켜고 끌 수 있다.',
    '상태': 'ENABLED = 지금 나가는 중 · PAUSED = 멈춰 있음.',
    '수집일시': '오래됐으면 새 SKU 가 빠져 있을 수 있습니다 — 다시 받으세요.'
  });
}


/** 상품광고목록을 마지막으로 받은 날 (없으면 빈 글자) */
function adUnitCollectedAt_() {
  var sh = ss_().getSheetByName(SHEET_ADUNIT);
  if (!sh || sh.getLastRow() < 2) return '';
  var v = sh.getRange(2, ADUNIT_HEADER.length, 1, 1).getValue();
  if (v instanceof Date) return ymd_(v);
  return String(v || '').substring(0, 10);
}
