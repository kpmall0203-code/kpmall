/**
 * 72J_광고실행.gs — 승인한 계획을 실제로 만든다
 *
 * ── 만드는 순서 ─────────────────────────────────────────
 *   캠페인 → 광고그룹 → 상품 등록 → (옛 그룹에서 그 상품 멈춤)
 * 자동 캠페인은 광고그룹을 만들면 아마존이 겨냥 네 가지를 알아서 붙이고
 * 그 그룹의 기본입찰을 물려받는다. 그래서 겨냥을 따로 만들지 않고
 * 광고그룹 기본입찰에 우리 값을 넣는다 — 부를 곳이 하나 줄고 실패할 자리도 준다.
 *
 * ── 옛 그룹에서 왜 빼는가 ───────────────────────────────
 * 같은 상품이 두 광고그룹에 들어 있으면 두 곳에서 함께 입찰한다.
 * 자기 상품끼리 값을 올리는 셈이라 CPC 만 오르고 얻는 것이 없다.
 * 다만 지우지 않고 '멈춤'으로 둔다 — 되돌릴 수 있어야 한다.
 *
 * ── 끊겨도 이어서 ───────────────────────────────────────
 * 계획이 수십 줄이고 한 줄에 API 를 네댓 번 부르므로 6분 한도에 걸린다.
 * 그래서 한 줄을 끝낼 때마다 결과를 적고, 시간이 차면 1분 뒤로 넘긴다.
 * 다시 들어오면 결과가 빈 줄부터 잇는다 — 이미 만든 것을 두 번 만들지 않는다.
 */

var PROP_ADEXEC_STATE = 'ADEXEC_STATE';       // 'on' | 'off' — 만들 때 켤지
var ADEXEC_CONTINUE_HANDLER = 'continueAdPlanExec';
var ADEXEC_ADS_BATCH = 100;                   // 한 번에 등록할 상품 수
/**
 * 몇 줄마다 시트에 옮길지.
 * 줄마다 쓰면 스프레드시트 서비스가 시간을 넘기고, 끝까지 모으면 중간에 죽을 때
 * 통째로 잃는다. 그 사이를 잡는 값이다.
 */
var ADEXEC_FLUSH_EVERY = 15;

/**
 * SKU → ASIN. 대장에서 '어느 상품인지'를 바로 알아보게 하려고 쓴다.
 * 광고재배분에 ASIN 칸이 있으니 그것만 읽는다 (리스팅 2만6천 줄을 다시 읽을 이유가 없다).
 */
function adSkuAsin_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_REALLOC);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, REALLOC_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var sk = String(v[i][0] || '').trim();
    var as = String(v[i][20] || '').trim();
    if (sk && as) out[sk] = as;
  }
  return out;
}

/** 여러 SKU 를 한 칸에 담는다 — 다 적으면 칸이 터지고, 안 적으면 못 알아본다 */
function adSkuText_(skus, n) {
  var k = n || 3;
  if (!skus || !skus.length) return '';
  if (skus.length <= k) return skus.join(', ');
  return skus.slice(0, k).join(', ') + ' 외 ' + (skus.length - k) + '개';
}

/** 일괄 응답에서 만들어진 ID 를 꺼낸다 */
function adsCreated_(res, key, idField) {
  var box = (res && res[key]) || {};
  var succ = box.success || [], errs = box.error || [];
  if (succ.length) return { ok: true, ids: succ.map(function (x) { return String(x[idField] || ''); }) };
  var e = (errs[0] && errs[0].errors && errs[0].errors[0]) || {};
  return { ok: false, ids: [],
           msg: (e.errorType || '') + ' ' + String(e.message || '').substring(0, 120) };
}

/** 메뉴: 승인분 캠페인 생성 실행 */
function executeAdPlan() {
  if (!adBusyGuard_('캠페인 만들기')) return;
  var props = PropertiesService.getScriptProperties();
  var sh = getSheetOrThrow_(SHEET_ADPLAN);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADPLAN + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();

  var todo = 0, daily = 0, skus = 0, done = 0;
  for (var i = 0; i < v.length; i++) {
    if (v[i][AP_APPROVE - 1] !== true) continue;
    if (String(v[i][AP_RESULT - 1]).indexOf('성공') === 0) { done++; continue; }
    if (String(v[i][AP_ACTION - 1]) === '이미 있음') continue;
    todo++; daily += Number(v[i][AP_DAILY - 1]) || 0;
    skus += Number(v[i][7]) || 0;
  }
  if (!todo) {
    ui_().alert('만들 것이 없습니다.',
      (done ? '승인한 ' + done + '줄은 이미 만들었습니다.\n\n' : '') +
      '"' + SHEET_ADPLAN + '" 탭에서 [승인] 칸을 체크하세요.', ui_().ButtonSet.OK);
    return;
  }

  var ans = ui_().alert('승인분 캠페인 생성',
    todo + '줄을 만듭니다 (SKU ' + skus.toLocaleString() + '개).\n' +
    '하루 예산 합계 ' + daily.toLocaleString() + '엔\n\n' +
    '이 SKU 들이 다른 광고그룹에 들어 있으면 거기서는 멈춥니다 —\n' +
    '두 곳에서 함께 입찰하면 자기끼리 값을 올립니다. (지우지 않고 멈춤)\n\n' +
    '[예]    켜진 상태로 만든다 — 바로 돈이 나갑니다\n' +
    '[아니오] 멈춘 상태로 만든다 — 보고 나서 직접 켭니다\n' +
    '[취소]  아무것도 안 함',
    ui_().ButtonSet.YES_NO_CANCEL);
  if (ans === ui_().Button.CANCEL) return;
  props.setProperty(PROP_ADEXEC_STATE, ans === ui_().Button.YES ? 'on' : 'off');

  toast_('캠페인 생성 시작 — ' + todo + '줄');
  adPlanExecStep_(true);
}

function continueAdPlanExec() {
  withLockOrRetry_('캠페인 생성', ADEXEC_CONTINUE_HANDLER, function () {
    try { adPlanExecStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

function adExecScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADEXEC_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ADEXEC_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/** 시간이 찰 때까지 승인분을 하나씩 만든다 */
function adPlanExecStep_(interactive) {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var state = props.getProperty(PROP_ADEXEC_STATE) === 'on' ? 'ENABLED' : 'PAUSED';
  var sh = getSheetOrThrow_(SHEET_ADPLAN);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  var token = adsToken_();

  var logBuf = adLogBuffer_(ADEXEC_FLUSH_EVERY);
  var okN = 0, failN = 0, left = 0, timeUp = false, gaveUp = 0, streak = 0, aborted = '';
  for (var i = 0; i < v.length; i++) {
    if (v[i][AP_APPROVE - 1] !== true) continue;
    if (String(v[i][AP_RESULT - 1]).indexOf('성공') === 0) continue;
    if (adIsGivenUp_(v[i][AP_RESULT - 1])) continue;      // 이미 그만둔 줄
    if (String(v[i][AP_ACTION - 1]) === '이미 있음') continue;
    if (aborted) { left++; continue; }
    if (Date.now() - t0 > ADS_SOFT_MS) { timeUp = true; left++; continue; }

    var r = adExecRow_(token, sh, i + 2, v[i], state, logBuf);
    if (r.ok) { okN++; streak = 0; }
    else {
      failN++; streak++;
      if (r.gaveUp) gaveUp++;
      // 하나가 틀린 것과 무언가 통째로 잘못된 것은 다르다.
      // 잇달아 실패하면 뒤엣것이므로 더 밀어붙이지 않는다.
      if (streak >= ADEXEC_ABORT_AFTER) {
        aborted = '잇달아 ' + streak + '줄 실패 (마지막: ' +
                  String(v[i][AP_NAME - 1]) + ')';
      }
    }
  }

  logBuf.flush();
  var msg = '캠페인 생성 — 성공 ' + okN + (failN ? ' · 실패 ' + failN : '') +
            (gaveUp ? ' · 중단 ' + gaveUp : '') +
            (left ? ' · 남음 ' + left : ' · 완료');
  if (aborted) {
    adAbortRun_('캠페인 만들기', ADEXEC_CONTINUE_HANDLER, aborted);
    timeUp = false;
  } else {
    log_('ads', failN ? 'WARN' : 'INFO', msg);
  }
  toast_(msg);
  adExecScheduleContinue_(timeUp);

  if (interactive) {
    showSheet_(timeUp ? SHEET_ADPLAN : SHEET_ADLOG);
    ui_().alert(aborted ? '캠페인 생성 — 멈췄습니다'
                        : (timeUp ? '캠페인 생성 — 진행 중' : '캠페인 생성 완료'),
      msg + '\n\n' +
      (aborted ? '⛔ ' + aborted + '\n' +
                 '무언가 통째로 잘못된 것으로 보고 더 진행하지 않았습니다.\n' +
                 '[결과] 칸의 사유를 보고 고친 뒤 다시 실행하세요.\n\n' : '') +
      (timeUp ? '1분 간격으로 자동으로 이어집니다. 창을 닫아도 됩니다.\n\n' : '') +
      (gaveUp ? gaveUp + '줄은 ' + ADEXEC_MAX_TRIES + '번 해봐도 안 돼 그만뒀습니다.\n' +
                '[결과] 칸을 비우면 다시 시도합니다.\n\n' : '') +
      (failN - gaveUp > 0 ? '실패한 줄은 다음 번에 다시 시도합니다.\n\n' : '') +
      (state === 'PAUSED'
        ? '멈춘 상태로 만들었습니다. 광고 콘솔에서 확인하고 켜세요.'
        : '켜진 상태입니다 — 지금부터 돈이 나갑니다.'),
      ui_().ButtonSet.OK);
  }
  return msg;
}

/** 계획 한 줄을 만든다 */
function adExecRow_(token, sh, rowNo, row, state, bucket) {
  var name = String(row[AP_NAME - 1]);
  var bid = Number(row[AP_BID - 1]) || 0;
  var daily = Number(row[AP_DAILY - 1]) || 0;
  var gid = String(row[AP_GID - 1] || '').trim();
  var cid = String(row[AP_CID - 1] || '').trim();
  var skus = String(row[AP_SKUS - 1] || '').split(',').map(function (x) { return x.trim(); })
              .filter(function (x) { return x; });
  var log = [], now = new Date();
  var asinMap = adSkuAsin_();
  var skuTxt = adSkuText_(skus);
  var asinTxt = adSkuText_(skus.map(function (x) { return asinMap[x] || ''; })
                               .filter(function (x) { return x; }));
  var prev = String(row[AP_RESULT - 1] || '');
  var madeCamp = false, madeGroup = false;
  var fail = function (why) {
    // 캠페인과 광고그룹까지 만들어 놓고 상품에서 막히면 빈 껍데기가 남는다.
    // 멈춤 상태라 돈은 안 나가지만, 왜 있는지 모르는 캠페인이 되므로 적어 둔다.
    var shell = (madeCamp || madeGroup)
      ? ' [빈 캠페인이 남았습니다 — 상품 없이 캠페인·광고그룹만 만들어졌습니다. ' +
        '고친 뒤 다시 실행하면 그 캠페인에 상품만 넣습니다]'
      : '';
    var gaveUp = adMarkFail_(sh, rowNo, AP_RESULT, prev, adErrorText_(why) + shell);
    log_('ads', gaveUp ? 'ERROR' : 'WARN',
         '캠페인 생성 ' + (gaveUp ? '중단' : '실패') + ' ' + name + ' — ' + adErrorText_(why));
    return { ok: false, gaveUp: gaveUp };
  };

  try {
    // ① 캠페인 — 이미 광고그룹이 정해진 줄('기존에 추가')은 만들지 않는다.
    //    광고그룹만 알고 캠페인을 모르면 상품을 어디에 넣을지 정할 수 없으므로 멈춘다 —
    //    여기서 그냥 만들면 같은 이름의 캠페인이 하나 더 생긴다.
    if (gid && !cid) {
      return fail('기존 광고그룹에 넣어야 하는데 캠페인ID가 비어 있습니다. ' +
                  '[광고 구조 수집] 후 [전용 캠페인 생성 계획]을 다시 실행하세요.');
    }
    if (!cid) {
      // 아마존은 이름에 아스키만 받는다. 계획이 이미 다듬어 주지만,
      // 사람이 시트에서 이름을 고쳐 넣었을 수 있어 부르기 전에 한 번 더 본다 —
      // 여기서 막지 않으면 응답이 "잘못된 요청" 한 줄이라 원인을 찾기 어렵다.
      if (/[^\x20-\x7E]/.test(name)) {
        return fail('캠페인 이름에 아스키가 아닌 글자가 있습니다 ("' + name + '"). ' +
                    '아마존은 한글 이름을 받지 않습니다.');
      }
      var cres = adsApiRetry_(token, 'post', '/sp/campaigns', { campaigns: [{
        name: name, targetingType: 'AUTO', state: state,
        budget: { budget: daily, budgetType: 'DAILY' },
        dynamicBidding: { strategy: 'LEGACY_FOR_SALES' },
        startDate: ymd_(now)
      }] }, ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
      var c = adsCreated_(cres, 'campaigns', 'campaignId');
      if (!c.ok) return fail('캠페인 — ' + c.msg);
      cid = c.ids[0]; madeCamp = true;
      sh.getRange(rowNo, AP_CID).setValue(cid);
      log.push(adLogRow_({ at: now, kind: '캠페인', camp: name, group: name,
        sku: skuTxt, asin: asinTxt, item: '생성', to: state,
        sum: '캠페인 만듦 · ' + name + ' · 하루 ¥' + daily + ' · ' + state,
        why: '전용 캠페인 생성', cid: cid }));
    }
    // ② 광고그룹 — 자동 캠페인은 여기 기본입찰을 겨냥 넷이 물려받는다
    if (!gid) {
      var gres = adsApiRetry_(token, 'post', '/sp/adGroups', { adGroups: [{
        campaignId: cid, name: name, state: state, defaultBid: bid
      }] }, ADSW_CT_ADGROUP, ADSW_CT_ADGROUP);
      var g = adsCreated_(gres, 'adGroups', 'adGroupId');
      if (!g.ok) return fail('광고그룹 — ' + g.msg);
      gid = g.ids[0]; madeGroup = true;
      sh.getRange(rowNo, AP_GID).setValue(gid);
      log.push(adLogRow_({ at: now, kind: '광고그룹', camp: name, group: name,
        sku: skuTxt, asin: asinTxt, item: '기본입찰', to: bid,
        sum: '기본입찰 ¥' + bid + ' · ' + name + ' (자동 겨냥 넷이 물려받음)',
        why: '겨냥 넷이 이 값을 물려받는다', cid: cid, gid: gid }));
    }

    // ③ 이 SKU 들이 지금 어디 있나 (승인한 줄만이라 한 번이면 끝난다)
    var placed = {};
    try {
      var pr = adsApiRetry_(token, 'post', '/sp/productAds/list',
        { maxResults: 500, skuFilter: { include: skus },
          stateFilter: { include: ['ENABLED', 'PAUSED'] } },
        ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
      var arr = (pr && pr.productAds) || [];
      for (var a = 0; a < arr.length; a++) {
        var sk = String(arr[a].sku || '');
        if (skus.indexOf(sk) < 0) continue;        // 필터가 안 먹었으면 버린다
        (placed[sk] || (placed[sk] = [])).push(
          { adId: String(arr[a].adId || ''), gid: String(arr[a].adGroupId || '') });
      }
    } catch (e2) {
      log_('ads', 'WARN', '기존 광고 조회 실패 (' + name + '): ' + String(e2).substring(0, 120));
    }

    // ④ 상품 등록 — 이미 이 그룹에 있는 것은 뺀다
    var add = [];
    for (var s = 0; s < skus.length; s++) {
      var here = false, lst = placed[skus[s]] || [];
      for (var l = 0; l < lst.length; l++) if (lst[l].gid === gid) here = true;
      if (!here) add.push({ campaignId: cid, adGroupId: gid, sku: skus[s], state: state });
    }
    var added = 0, madeIds = [];
    for (var b = 0; b < add.length; b += ADEXEC_ADS_BATCH) {
      var part = add.slice(b, b + ADEXEC_ADS_BATCH);
      var ares = adsApiRetry_(token, 'post', '/sp/productAds', { productAds: part },
                         ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
      var ad = adsCreated_(ares, 'productAds', 'adId');
      if (!ad.ok) return fail('상품 등록 — ' + ad.msg);
      added += ad.ids.length;
      madeIds = madeIds.concat(ad.ids);
    }
    // 받은 ID 를 적어 둔다 — 켜고 끌 때 다시 물어보지 않으려고
    if (madeIds.length) sh.getRange(rowNo, AP_ADIDS).setValue(madeIds.join(','));
    if (added) {
      log.push(adLogRow_({ at: now, kind: '상품', camp: name, group: name,
        sku: skuTxt, asin: asinTxt, target: added + '개', item: '등록', to: state,
        sum: '상품 ' + added + '개 담음 · ' + name + ' · ' + adSkuText_(skus, 2),
        why: '이 캠페인에 담는다', cid: cid, gid: gid }));
    }

    // ⑤ 옛 그룹에서는 멈춘다 (지우지 않는다 — 되돌릴 수 있어야 한다)
    var stop = [];
    for (var s2 = 0; s2 < skus.length; s2++) {
      var lst2 = placed[skus[s2]] || [];
      for (var l2 = 0; l2 < lst2.length; l2++) {
        if (lst2[l2].gid !== gid && lst2[l2].adId) {
          stop.push({ adId: lst2[l2].adId, state: 'PAUSED' });
        }
      }
    }
    var stopped = 0;
    for (var p2 = 0; p2 < stop.length; p2 += ADEXEC_ADS_BATCH) {
      var pp = stop.slice(p2, p2 + ADEXEC_ADS_BATCH);
      try {
        var sres = adsApiRetry_(token, 'put', '/sp/productAds', { productAds: pp },
                           ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
        var st2 = adsCreated_(sres, 'productAds', 'adId');
        if (st2.ok) stopped += st2.ids.length;
        else log_('ads', 'WARN', '옛 광고 멈춤 실패 (' + name + '): ' + st2.msg);
      } catch (e3) {
        log_('ads', 'WARN', '옛 광고 멈춤 실패 (' + name + '): ' + String(e3).substring(0, 120));
      }
    }
    if (stopped) {
      log.push(adLogRow_({ at: now, kind: '상품', camp: name, group: name,
        sku: skuTxt, asin: asinTxt, target: stopped + '개',
        item: '옛 그룹에서 멈춤', from: 'ENABLED', to: 'PAUSED',
        sum: '옛 광고그룹에서 ' + stopped + '개 멈춤 · ' + adSkuText_(skus, 2) +
             ' (두 곳에서 입찰하면 자기끼리 값을 올림)',
        why: '같은 상품이 두 곳에서 입찰하면 자기끼리 값을 올린다', cid: cid, gid: gid }));
    }

    if (log.length) { if (bucket) bucket.push(log); else {
      var st3 = adLogWrite_(log); adLogResult_(st3, log.map(function () { return '성공'; })); } }
    sh.getRange(rowNo, AP_RESULT).setValue(
      '성공 · 상품 ' + added + '개' + (stopped ? ' · 옛 그룹 멈춤 ' + stopped : ''));
    return { ok: true };
  } catch (e) {
    return fail(String(e));
  }
}

// ── 승인분 입찰 반영 (전용 그룹만) ──────────────────────
//
// 입찰가는 광고그룹과 그 안의 키워드·타깃에 걸린다. 그런데 승인은 SKU 단위다.
// 한 그룹에 SKU 가 여럿이면 그 입찰이 그들 모두에게 함께 걸리므로,
// 승인한 SKU 하나의 권장가로 정하면 같은 그룹의 다른 SKU 가 손해를 본다.
// 그래서 그룹 안 SKU 들의 권장가 중 '가장 낮은 값'에 맞춘다.
//
// 권장가를 모르는 SKU (세션이 모자라 판정하지 않은 것 등)가 섞여 있으면
// 그 값이 더 낮을 수도 있다. 조용히 넘기지 않고 몇 개인지 알린 뒤 진행한다.

var ADBID_MIN = 2;              // 아마존이 받는 입찰 하한
var ADBID_EPS = 0.5;            // 이보다 차이가 작으면 건드리지 않는다

/** 광고그룹ID → 그 그룹의 SKU 목록 (광고상품) */
function adGroupSkus_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADPROD);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPROD_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][0] || '').trim();
    var ids = String(v[i][6] || '').split(',');
    for (var j = 0; j < ids.length; j++) {
      var gd = ids[j].replace(/\s/g, '');
      if (!sku || !gd) continue;
      (out[gd] || (out[gd] = [])).push(sku);
    }
  }
  return out;
}

/** 광고그룹ID → 그 그룹의 대상들 (광고구조) */
function adGroupTargets_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var gd = String(v[i][14] || '').trim();
    if (!gd) continue;
    (out[gd] || (out[gd] = [])).push({
      camp: String(v[i][0]), group: String(v[i][4]),
      kind: String(v[i][7]), name: String(v[i][8]), state: String(v[i][10]),
      bid: Number(v[i][11]), eff: Number(v[i][12]),
      cid: String(v[i][13] || ''), id: String(v[i][15] || '')
    });
  }
  return out;
}

/** 메뉴: 승인분 입찰 반영 */
function applyApprovedBids() {
  if (!adBusyGuard_('입찰 반영')) return;
  var basis = adBasis_();
  var sh = getSheetOrThrow_(SHEET_REALLOC);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, REALLOC_HEADER.length).getValues();

  var rec = {}, approved = {};
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][0] || '').trim();
    if (!sku) continue;
    var r0 = Number(v[i][11]);
    if (r0 > 0) rec[sku] = r0;
    if (v[i][RA_APPROVE - 1] === true &&
        (String(v[i][17]) === '인하' || String(v[i][17]) === '인상')) {
      approved[sku] = { row: i + 2, verdict: String(v[i][17]) };
    }
  }
  if (!countKeys_(approved)) {
    ui_().alert('반영할 것이 없습니다.',
      '"' + SHEET_REALLOC + '" 에서 [인하]·[인상] 줄의 [승인] 칸을 체크하세요.\n' +
      '(전용 그룹에 든 SKU 만 그 SKU 에 맞춰 입찰을 바꿀 수 있습니다)', ui_().ButtonSet.OK);
    return;
  }

  var gs = adGroupSkus_(), gt = adGroupTargets_(), asinMap = adSkuAsin_();
  var maxUp = Number(basis['한 번에 올릴 최대 배수']) || 3;

  // 승인한 SKU 가 든 그룹마다, 그 그룹 SKU 들의 권장가 중 가장 낮은 값을 고른다
  var plans = [], unknownTot = 0;
  var seen = {};
  for (var sku2 in approved) {
    for (var gd in gs) {
      if (gs[gd].indexOf(sku2) < 0 || seen[gd]) continue;
      seen[gd] = true;
      var mem = gs[gd], vals = [], unknown = [];
      for (var m = 0; m < mem.length; m++) {
        if (rec[mem[m]] > 0) vals.push(rec[mem[m]]); else unknown.push(mem[m]);
      }
      if (!vals.length) continue;
      var lo = Math.min.apply(null, vals);
      var tg = gt[gd] || [];
      var cur = 0;
      for (var t = 0; t < tg.length; t++) if (tg[t].eff > cur) cur = tg[t].eff;
      var target = Math.max(ADBID_MIN, Math.round(lo));
      if (cur > 0 && target > cur * maxUp) target = Math.round(cur * maxUp);  // 인상은 한 번에 배수까지
      unknownTot += unknown.length;
      plans.push({ gd: gd, bid: target, mem: mem, vals: vals, unknown: unknown,
                   tg: tg, cur: cur });
    }
  }
  if (!plans.length) { ui_().alert('바꿀 대상을 찾지 못했습니다.\n[광고 구조 수집]을 먼저 실행하세요.'); return; }

  var lines = plans.map(function (p) {
    return '   · 그룹 ' + p.gd + ' — SKU ' + p.mem.length + '개 · 대상 ' + p.tg.length + '개\n' +
           '       지금 최대 ¥' + p.cur + ' → ¥' + p.bid +
           ' (그 그룹 권장가 중 가장 낮은 값)' +
           (p.unknown.length ? '\n       ⚠ 권장가를 모르는 SKU ' + p.unknown.length +
                               '개 (' + p.unknown.join(', ') + ') — 더 낮아야 할 수도 있습니다' : '');
  }).join('\n');

  var ok = ui_().alert('승인분 입찰 반영',
    '광고그룹 ' + plans.length + '개의 입찰을 바꿉니다.\n\n' + lines + '\n\n' +
    '한 그룹의 입찰은 그 안 SKU 전부에 함께 걸립니다.\n' +
    '그래서 승인한 SKU 하나가 아니라 그룹에서 가장 낮은 권장가에 맞춥니다 —\n' +
    '아니면 같은 그룹의 다른 SKU 가 손익분기를 넘겨 사게 됩니다.\n\n' +
    '진행할까요?', ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  var token = adsToken_();
  var now = new Date(), okN = 0, failN = 0, nT = 0;

  for (var p2 = 0; p2 < plans.length; p2++) {
    var pl = plans[p2];
    var entries = [], results = [];

    var cName = (pl.tg[0] && pl.tg[0].camp) || '(이름 모름)';
    var gName = (pl.tg[0] && pl.tg[0].group) || '(이름 모름)';
    var gCid = (pl.tg[0] && pl.tg[0].cid) || '';
    var mSku = adSkuText_(pl.mem);
    var mAsin = adSkuText_(pl.mem.map(function (x) { return asinMap[x] || ''; })
                                 .filter(function (x) { return x; }));
    var why = '그룹 안 SKU ' + pl.mem.length + '개의 권장가 중 가장 낮은 값' +
              (pl.unknown.length ? ' (권장가 모르는 SKU ' + pl.unknown.length + '개 있음)' : '');

    // ① 광고그룹 기본입찰 — 입찰이 비어 있는 대상은 이걸 물려받는다
    entries.push(adLogRow_({ at: now, kind: '광고그룹', camp: cName, group: gName,
      sku: mSku, asin: mAsin, target: 'SKU ' + pl.mem.length + '개',
      item: '기본입찰', to: pl.bid,
      sum: '기본입찰 ¥' + pl.bid + ' · ' + gName + ' (SKU ' + pl.mem.length + '개 공유)',
      why: why, cid: gCid, gid: pl.gd }));
    // ② 입찰이 명시된 대상들
    var kws = [], tgs = [];
    for (var t2 = 0; t2 < pl.tg.length; t2++) {
      var o = pl.tg[t2];
      if (o.state !== 'ENABLED' || !o.id) continue;
      if (o.bid > 0 && Math.abs(o.bid - pl.bid) < ADBID_EPS) continue;   // 이미 그 값
      (o.kind === '키워드' ? kws : tgs).push({ o: o });
      entries.push(adLogRow_({ at: now, kind: o.kind, camp: o.camp, group: o.group,
        sku: mSku, asin: mAsin, target: o.name, item: '입찰',
        from: o.bid || '(그룹값)', to: pl.bid,
        sum: '입찰 ¥' + (o.bid || '(그룹값)') + ' → ¥' + pl.bid + ' · "' + o.name +
             '" · ' + gName,
        why: why, cid: o.cid, tid: o.id, gid: pl.gd }));
    }
    var start = adLogWrite_(entries);

    var gOk = false;
    try {
      var gres = adsApiRetry_(token, 'put', '/sp/adGroups',
        { adGroups: [{ adGroupId: pl.gd, defaultBid: pl.bid }] },
        ADSW_CT_ADGROUP, ADSW_CT_ADGROUP);
      gOk = adsCreated_(gres, 'adGroups', 'adGroupId').ok;
    } catch (e) { gOk = false; }
    results.push(gOk ? '성공' : '실패');

    var put = function (list, path, ct, key, idField) {
      var out = [];
      for (var b = 0; b < list.length; b += ADEXEC_ADS_BATCH) {
        var part = list.slice(b, b + ADEXEC_ADS_BATCH);
        var body = {};
        body[key] = part.map(function (x) {
          var one = { bid: pl.bid };
          one[idField] = x.o.id;
          return one;
        });
        var msg = '성공';
        try {
          var res = adsApiRetry_(token, 'put', path, body, ct, ct);
          var rr = adsCreated_(res, key, idField);
          if (!rr.ok) msg = '실패: ' + (rr.msg || '');
        } catch (e2) { msg = '실패: ' + String(e2).substring(0, 100); }
        for (var q = 0; q < part.length; q++) out.push(msg);
        if (msg === '성공') nT += part.length;
      }
      return out;
    };
    results = results.concat(put(kws, '/sp/keywords', ADSW_CT_KEYWORD, 'keywords', 'keywordId'));
    results = results.concat(put(tgs, '/sp/targets', ADSW_CT_TARGET, 'targetingClauses', 'targetId'));
    adLogResult_(start, results);

    var bad = 0;
    for (var z = 0; z < results.length; z++) if (results[z] !== '성공') bad++;
    if (bad) failN++; else okN++;
  }

  // 반영한 SKU 는 체크를 푼다 (같은 것을 두 번 내리지 않게)
  for (var sk in approved) sh.getRange(approved[sk].row, RA_APPROVE).setValue(false);

  var msg = '입찰 반영 — 그룹 ' + okN + '개 성공' + (failN ? ' · ' + failN + '개 실패' : '') +
            ' · 대상 ' + nT + '개';
  log_('ads', failN ? 'WARN' : 'INFO', msg);
  toast_(msg);
  showSheet_(SHEET_ADLOG);
  ui_().alert('승인분 입찰 반영',
    msg + '\n\n' +
    (unknownTot ? '권장가를 모르는 SKU ' + unknownTot + '개가 같은 그룹에 있습니다.\n' +
                  '그 SKU 들이 더 낮아야 한다면 지금 값도 높습니다.\n\n' : '') +
    '무엇을 얼마에서 얼마로 바꿨는지는 "' + SHEET_ADLOG + '" 에 있습니다.',
    ui_().ButtonSet.OK);
  return msg;
}

// ── 만든 캠페인 켜기 · 멈추기 ───────────────────────────
//
// 멈춤 상태로 만들면 캠페인·광고그룹·상품이 전부 멈춰 있다. 셋 다 켜야 돌아간다 —
// 캠페인만 켜면 광고그룹이 멈춰 있어 아무 일도 안 일어나고, 왜 노출이 없는지
// 한참 찾게 된다.
//
// '기존에 추가' 줄은 캠페인·광고그룹을 우리가 만든 것이 아니므로 건드리지 않고
// 우리가 넣은 상품만 켠다. 남의 캠페인 상태를 마음대로 바꾸면 안 된다.

var ADENABLE_CONTINUE_HANDLER = 'continueAdEnable';
var PROP_ADENABLE_STATE = 'ADENABLE_TO';
var ADENABLE_MARK = { ENABLED: '· 켬', PAUSED: '· 멈춤' };

/**
 * ── 승인 칸이 곧 '켜도 좋다' 는 뜻이다 ────────────────────
 *
 * 처음 판(2026-09-04)은 승인 칸을 보지 않고 '성공' 인 줄이면 전부 켰다.
 * 그래서 승인 하나만 체크했는데 일흔 개가 켜졌다 — 돈이 나갔다.
 * 켜는 일은 되돌릴 수 없는 쪽(돈)이므로, 명시적으로 허락한 줄만 켠다.
 *
 *   켜기        승인 ✓ 인 줄만 ENABLED. 미승인은 손대지 않는다.
 *   멈추기      전부 PAUSED. 멈추는 쪽은 안전하므로 승인을 묻지 않는다.
 *   승인대로    ✓ → ENABLED, 빈칸 → PAUSED. 시트가 곧 아마존의 상태가 된다.
 *
 * '승인대로' 가 있어야 "이 둘만 켜 두고 나머지는 꺼" 를 한 번에 할 수 있다.
 */
var ADENABLE_MODES = { ON: '켜기', OFF: '멈추기', SYNC: '승인대로' };

/** 그 줄이 승인됐나 (체크박스는 true, 손으로 적으면 'TRUE'/'Y'/'O') */
function adRowApproved_(cell) {
  if (cell === true) return true;
  var t = String(cell == null ? '' : cell).trim().toUpperCase();
  return t === 'TRUE' || t === 'Y' || t === 'YES' || t === 'O' || t === 'V' || t === '1';
}

/** 이 줄이 가야 할 상태. null 이면 손대지 않는다 */
function adTargetState_(mode, approved) {
  if (mode === 'OFF') return 'PAUSED';
  if (mode === 'SYNC') return approved ? 'ENABLED' : 'PAUSED';
  return approved ? 'ENABLED' : null;      // ON: 승인된 줄만
}

/**
 * 메뉴는 셋으로 나눈다.
 *
 * 처음에는 창 하나에 [예]=켜기 / [아니오]=승인대로 를 넣었다. 사람은 [예] 를 눌렀고
 * "켬 0 · 멈춤 0" 이 나왔다 — 켜기는 미승인 줄을 건드리지 않으니 맞는 동작인데,
 * 누른 사람 입장에서는 고장으로 보인다. 예/아니오 한 창에 서로 다른 동사를 넣은 것이
 * 잘못이다. 메뉴 이름이 곧 하는 일이 되게 쪼갠다.
 */

/** 메뉴: 승인 ✓ 만 켜기 */
function enableApprovedCampaigns() { adEnableStart_('ON'); }

/** 메뉴: 승인대로 맞추기 (✓ 는 켜고 나머지는 전부 끔) */
function syncCampaignsToApproval() { adEnableStart_('SYNC'); }

/** 메뉴: 전부 멈추기 */
function pauseAllCampaigns() { adEnableStart_('OFF'); }

/** 계획 표를 훑어 지금 상태를 센다 */
function adEnableCount_(v) {
  var c = { made: 0, on: 0, off: 0, okN: 0, okDaily: 0, wrongOn: 0, okOff: 0 };
  for (var i = 0; i < v.length; i++) {
    var r = String(v[i][AP_RESULT - 1]);
    if (r.indexOf('성공') !== 0) continue;
    c.made++;
    var ap = adRowApproved_(v[i][AP_APPROVE - 1]);
    var isOn = r.indexOf(ADENABLE_MARK.ENABLED) >= 0;
    if (ap) { c.okN++; c.okDaily += Number(v[i][AP_DAILY - 1]) || 0; if (!isOn) c.okOff++; }
    if (isOn) { c.on++; if (!ap) c.wrongOn++; }
    else if (r.indexOf(ADENABLE_MARK.PAUSED) >= 0) c.off++;
  }
  return c;
}

function adEnableStart_(mode) {
  if (!adBusyGuard_('캠페인 ' + ADENABLE_MODES[mode])) return;
  var sh = getSheetOrThrow_(SHEET_ADPLAN);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADPLAN + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  var c = adEnableCount_(v);

  if (!c.made) {
    ui_().alert('만든 캠페인이 없습니다.',
      '[승인분 캠페인 생성 실행]으로 먼저 만드세요.', ui_().ButtonSet.OK);
    return;
  }

  // 지금 형편을 먼저 보여 준다 — 어느 메뉴를 눌러도 같은 그림을 본다
  var now = '지금: 만든 줄 ' + c.made + '개 · 켜짐 ' + c.on + ' · 멈춤 ' + c.off + '\n' +
            '승인 ✓ ' + c.okN + '개 (하루 예산 합계 ' + c.okDaily.toLocaleString() + '엔)\n' +
            (c.wrongOn ? '⚠ 승인 안 했는데 켜져 있음: ' + c.wrongOn + '개\n' : '') + '\n';

  var title, body, willDo;
  if (mode === 'ON') {
    willDo = c.okOff;
    title = '승인 ✓ 만 켜기';
    body = now +
      '켤 것: 승인 ✓ 인데 아직 멈춰 있는 ' + c.okOff + '개\n' +
      '건드리지 않을 것: 미승인 ' + (c.made - c.okN) + '개 (켜져 있어도 그대로 둡니다)\n\n' +
      (c.wrongOn ? '※ 승인 안 한 ' + c.wrongOn + '개를 끄려면 [승인대로 맞추기]를 쓰세요.\n\n' : '') +
      '켜면 지금부터 광고비가 나갑니다. 계속할까요?';
  } else if (mode === 'SYNC') {
    willDo = c.okOff + c.wrongOn;
    title = '승인대로 맞추기';
    body = now +
      '켤 것: ' + c.okOff + '개 (승인 ✓ 인데 멈춰 있음)\n' +
      '끌 것: ' + c.wrongOn + '개 (켜져 있는데 승인 ✗)\n' +
      '그대로: ' + (c.made - c.okOff - c.wrongOn) + '개\n\n' +
      '시트의 승인 칸이 그대로 아마존의 상태가 됩니다. 계속할까요?';
  } else {
    willDo = c.on;
    title = '전부 멈추기';
    body = now +
      '끌 것: 켜져 있는 ' + c.on + '개 전부 (승인 여부와 상관없이)\n\n' +
      '광고비가 더 나가지 않습니다. 계속할까요?';
  }

  if (!willDo) {
    ui_().alert(title + ' — 바꿀 것이 없습니다', now +
      (mode === 'ON'
        ? '승인 ✓ ' + c.okN + '개는 이미 전부 켜져 있습니다.\n\n' +
          (c.wrongOn
            ? '승인 안 한 ' + c.wrongOn + '개가 켜져 있습니다.\n' +
              '이것들을 끄려면 [캠페인 승인대로 맞추기]를 쓰세요 —\n' +
              '[켜기]는 미승인 줄을 일부러 건드리지 않습니다.'
            : '승인 칸을 체크한 뒤 다시 실행하세요.')
        : '이미 원하는 상태입니다.'),
      ui_().ButtonSet.OK);
    return;
  }

  if (ui_().alert(title, body, ui_().ButtonSet.OK_CANCEL) !== ui_().Button.OK) return;

  PropertiesService.getScriptProperties().setProperty(PROP_ADENABLE_STATE, mode);
  toast_(ADENABLE_MODES[mode] + ' 진행 중…');
  adEnableStep_(true);
}

/** 옛 메뉴 이름 — 승인대로로 보낸다 */
function toggleCreatedCampaigns() { syncCampaignsToApproval(); }

function continueAdEnable() {
  withLockOrRetry_('캠페인 켜기', ADENABLE_CONTINUE_HANDLER, function () {
    try { adEnableStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

function adEnableScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADENABLE_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ADENABLE_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/** 시간이 찰 때까지 한 줄씩 바꾼다 — 줄마다 가야 할 상태가 다르다 */
function adEnableStep_(interactive) {
  var t0 = Date.now();
  var mode = PropertiesService.getScriptProperties().getProperty(PROP_ADENABLE_STATE) || 'ON';
  if (mode === 'ENABLED') mode = 'ON';          // 옛 값과의 호환
  if (mode === 'PAUSED') mode = 'OFF';
  var sh = getSheetOrThrow_(SHEET_ADPLAN);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  var token = adsToken_();

  // 결과 칸은 통째로 한 번에 쓴다 — 줄마다 setValue 하면 여든 번을 부른다
  var col = [], idCol = [];
  for (var c0 = 0; c0 < v.length; c0++) {
    col.push([v[c0][AP_RESULT - 1]]);
    idCol.push([v[c0][AP_ADIDS - 1] || '']);
  }
  var dirty = false, idDirty = false, since = 0;
  var flushCol = function () {
    if (dirty) { sh.getRange(2, AP_RESULT, col.length, 1).setValues(col); dirty = false; }
    if (idDirty) { sh.getRange(2, AP_ADIDS, idCol.length, 1).setValues(idCol); idDirty = false; }
  };
  var logBuf = adLogBuffer_(ADEXEC_FLUSH_EVERY);

  var nOn = 0, nOff = 0, failN = 0, left = 0, timeUp = false, nAds = 0, streak = 0, aborted = '';
  for (var i = 0; i < v.length; i++) {
    var res = String(v[i][AP_RESULT - 1]);
    if (res.indexOf('성공') !== 0) continue;
    if (res.indexOf('중단(') >= 0) continue;            // 그만둔 줄

    var to = adTargetState_(mode, adRowApproved_(v[i][AP_APPROVE - 1]));
    if (!to) continue;                                  // 켜기 모드의 미승인 줄 — 손대지 않는다
    var mark = ADENABLE_MARK[to];
    var other = ADENABLE_MARK[to === 'ENABLED' ? 'PAUSED' : 'ENABLED'];
    if (res.indexOf(mark) >= 0) continue;               // 이미 그 상태

    if (aborted) { left++; continue; }
    if (Date.now() - t0 > ADS_SOFT_MS) { timeUp = true; left++; continue; }

    var name = String(v[i][AP_NAME - 1]);
    var cid = String(v[i][AP_CID - 1] || '').trim();
    var gid = String(v[i][AP_GID - 1] || '').trim();
    var mine = String(v[i][AP_ACTION - 1]) === '생성';
    var bad = [];

    // 우리가 만든 줄만 캠페인·광고그룹을 건드린다
    if (mine && cid) {
      try {
        var cr = adsApiRetry_(token, 'put', '/sp/campaigns',
          { campaigns: [{ campaignId: cid, state: to }] },
          ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
        if (!adsCreated_(cr, 'campaigns', 'campaignId').ok) bad.push('캠페인');
      } catch (e) { bad.push('캠페인'); }
    }
    if (mine && gid) {
      try {
        var gr = adsApiRetry_(token, 'put', '/sp/adGroups',
          { adGroups: [{ adGroupId: gid, state: to }] },
          ADSW_CT_ADGROUP, ADSW_CT_ADGROUP);
        if (!adsCreated_(gr, 'adGroups', 'adGroupId').ok) bad.push('광고그룹');
      } catch (e2) { bad.push('광고그룹'); }
    }
    // 상품은 어느 경우든 바꾼다 — 우리가 넣은 것이다.
    // 만들 때 적어 둔 ID 가 있으면 그것을 쓴다. 없는 줄(이 칸이 생기기 전에 만든 것)만
    // 한 번 조회하고, 그 결과를 적어 두어 다음부터는 안 묻는다.
    var ids = String(idCol[i][0] || '').split(',').map(function (x) { return x.trim(); })
                .filter(function (x) { return x; });
    if (!ids.length && gid) {
      try {
        var lr = adsApiRetry_(token, 'post', '/sp/productAds/list',
          { maxResults: 500, adGroupIdFilter: { include: [gid] } },
          ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
        var arr = (lr && lr.productAds) || [];
        for (var a = 0; a < arr.length; a++) if (arr[a].adId) ids.push(String(arr[a].adId));
        if (ids.length) { idCol[i][0] = ids.join(','); idDirty = true; }
      } catch (e3) { bad.push('상품 조회'); }
    }
    for (var b = 0; b < ids.length; b += ADEXEC_ADS_BATCH) {
      var part = ids.slice(b, b + ADEXEC_ADS_BATCH);
      try {
        var pr2 = adsApiRetry_(token, 'put', '/sp/productAds',
          { productAds: part.map(function (x) { return { adId: x, state: to }; }) },
          ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
        var rr = adsCreated_(pr2, 'productAds', 'adId');
        if (rr.ok) nAds += rr.ids.length;
        else if (!/entityStateConflict/i.test(rr.msg || '')) bad.push('상품');   // 이미 그 상태면 된 것
      } catch (e4) { bad.push('상품'); }
    }

    var base = res.replace(' ' + other, '').replace(' ' + mark, '')
                  .replace(/\s·\s(켜기|멈추기)\s(실패|중단)\([^)]*\)/g, '');
    if (bad.length) {
      failN++; streak++;
      var word = (to === 'ENABLED' ? '켜기' : '멈추기');
      var tries = adTriesOf_(res.replace(/실패\(/, '실패 1회(')) + 1;
      var give = tries >= ADEXEC_MAX_TRIES;
      dirty = true;
      col[i][0] = base + ' · ' + word +
        (give ? ' 중단(' : ' 실패(') + tries + '회: ' + adErrorText_(bad.join(',')) + ')';
      if (streak >= ADEXEC_ABORT_AFTER) {
        aborted = '잇달아 ' + streak + '줄 실패 (마지막: ' + name + ')';
      }
    } else {
      if (to === 'ENABLED') nOn++; else nOff++;
      streak = 0;
      dirty = true;
      col[i][0] = base + ' ' + mark;
      logBuf.push([adLogRow_({ kind: mine ? '캠페인' : '상품', camp: name, group: name,
        item: '상태', from: (to === 'ENABLED' ? 'PAUSED' : 'ENABLED'), to: to,
        sum: (to === 'ENABLED' ? '켬' : '멈춤') + ' · ' + name +
             (ids.length ? ' (상품 ' + ids.length + '개)' : '') +
             (mine ? '' : ' — 상품만 (남의 캠페인은 안 건드림)'),
        why: ADENABLE_MODES[mode] + ' · ' +
             (mine ? '캠페인·광고그룹·상품을 함께' : '기존 캠페인이라 상품만'),
        cid: cid, gid: gid })]);
    }
    // 몇 줄마다 한 번씩만 시트에 옮긴다 (줄마다 쓰면 시간을 넘긴다)
    if (++since >= ADEXEC_FLUSH_EVERY) { flushCol(); logBuf.flush(); since = 0; }
  }
  flushCol(); logBuf.flush();

  var msg = ADENABLE_MODES[mode] + ' — 켬 ' + nOn + ' · 멈춤 ' + nOff +
            (failN ? ' · 실패 ' + failN : '') + ' · 상품 ' + nAds + '개' +
            (left ? ' · 남음 ' + left : ' · 완료');
  if (aborted) {
    adAbortRun_('캠페인 ' + ADENABLE_MODES[mode], ADENABLE_CONTINUE_HANDLER, aborted);
    timeUp = false;
  } else {
    log_('ads', failN ? 'WARN' : 'INFO', msg);
  }
  toast_(msg);
  adEnableScheduleContinue_(timeUp);

  if (interactive) {
    showSheet_(SHEET_ADPLAN);
    ui_().alert(aborted ? '멈췄습니다' : (timeUp ? '진행 중' : '완료'), msg + '\n\n' +
      (aborted ? '⛔ ' + aborted + '\n더 진행하지 않았습니다. 사유를 고친 뒤 다시 실행하세요.\n\n' : '') +
      (timeUp ? '1분 간격으로 자동으로 이어집니다. 창을 닫아도 됩니다.\n\n' : '') +
      (failN ? '실패한 줄은 [결과] 칸에 사유가 있습니다. 다시 실행하면 그 줄만 재시도합니다.\n\n' : '') +
      (nOn ? '켠 ' + nOn + '개는 지금부터 노출이 시작됩니다.\n' : '') +
      (nOff ? '멈춘 ' + nOff + '개는 더 이상 돈이 나가지 않습니다.\n' : '') +
      (!nOn && !nOff && !failN
        ? '바꿀 것이 없었습니다 — 이미 원하는 상태입니다.\n' +
          (mode === 'ON'
            ? '\n[켜기]는 승인 ✓ 인 줄만 켭니다. 미승인 줄은 켜져 있어도 건드리지 않습니다.\n' +
              '승인 안 한 것을 끄려면 [캠페인 승인대로 맞추기]를 쓰세요.'
            : '')
        : ''),
      ui_().ButtonSet.OK);
  }
  return msg;
}
