/**
 * 72D_광고구조.gs — 캠페인 · 광고그룹 · 키워드 · 타깃 목록을 받아온다
 *
 * ── 왜 실적과 따로 받는가 ───────────────────────────────
 * 광고실적(리포트)은 '무슨 일이 있었나'를 날짜별로 알려주지만
 * '지금 입찰가가 얼마인가'는 알려주지 않는다. 입찰가는 리포트가 아니라
 * 캠페인 관리 API에 있고, 바꾸는 것도 거기다.
 *
 * 그래서 입찰을 조정하려면 두 가지가 다 있어야 한다:
 *   광고구조 — 지금 입찰가 · 대상ID (바꿀 대상과 그 자리)
 *   spTargeting 리포트 — 그 대상이 낸 클릭 · 주문 · 노출 점유율 (바꿀 근거)
 * 이 파일은 앞의 것만 한다.
 *
 * ── ID를 글자로 두는 이유 ───────────────────────────────
 * 아마존 ID는 자릿수가 많은 숫자꼴 문자열이다. 시트가 숫자로 바꿔 버리면
 * 뒷자리가 반올림돼 조용히 다른 ID가 된다 — 그 ID로 PUT 하면 남의 키워드를
 * 고치거나 404가 난다. 그래서 쓰기 전에 ID 칸을 글자 서식으로 못 박는다.
 */

var SHEET_ADSTRUCT = '광고구조';
var ADSTRUCT_KIND_NEG = '부정키워드';   // 종류 칸의 값. 72L 이 이 이름으로 찾는다
var ADSTRUCT_HEADER = [
  '캠페인', '유형', '캠페인상태', '일예산(JPY)',
  '광고그룹', '그룹상태', '그룹기본입찰',
  '종류', '키워드/타깃', '매치/표현', '상태', '입찰(JPY)', '실입찰(JPY)',
  '캠페인ID', '광고그룹ID', '대상ID', '수집일시'
];
// 글자로 못 박을 칸 (1부터 셈) — 캠페인ID · 광고그룹ID · 대상ID
var ADSTRUCT_ID_COLS = [14, 15, 16];

// 캠페인 목록(ENABLED·PAUSED)에 없는 줄. 보관(ARCHIVED)됐거나 지워진 캠페인이다 —
// 안 도는 것이므로 입찰 조정 대상이 아니다. 조용히 버리지 않고 이렇게 표시해 남긴다.
var ADSTRUCT_GONE = '(보관됨/삭제됨)';

// 어느 캠페인·광고그룹이 어느 SKU를 광고하는가.
// 입찰가는 광고그룹에 걸리는데 채산성은 SKU에 걸린다 — 둘을 잇는 표가 없으면
// '이 키워드에 얼마까지 낼 수 있나'를 계산할 수가 없다.
var SHEET_ADPROD = '광고상품';
// 줄마다 (광고그룹 × SKU) 를 그대로 쌓으면 2만 줄을 넘겨 잘린다 —
// 실제로 잘렸다. 필요한 것은 낱개 줄이 아니라 'SKU 하나가 어디에 걸려 있나'라서
// SKU 한 줄로 접어서 남긴다.
var ADPROD_HEADER = ['SKU', 'ASIN', '광고그룹수', '대표캠페인',
                     '가장작은그룹SKU수', '전용', '광고그룹ID들', '수집일시'];
var ADPROD_ID_COLS = [7];

/**
 * 한 광고그룹이 이만큼 이하의 SKU만 담고 있으면 '전용'으로 본다.
 * 전용일 때만 그 SKU에 맞춘 입찰가를 걸 수 있다 — 아니면 같은 입찰이
 * 그룹 안의 모든 SKU에 함께 걸려서, 가장 채산성 나쁜 것에 맞출 수밖에 없다.
 */
var ADPROD_DEDICATED_MAX = 5;

/**
 * 그룹마다 이만큼만 받아 보고 '작은가 큰가'만 가른다.
 *
 * 광고상품을 전부 받으려 했더니 6분 한도에 걸렸다 — 한 그룹에 SKU 가 1만 개 넘는
 * 것이 있어 500개씩 200번을 불러야 했다.
 *
 * 그런데 큰 그룹의 SKU 를 낱개로 셀 이유가 없다. 큰 그룹에 든 SKU 에 대해 할 일은
 * '전용 캠페인을 새로 만든다' 하나뿐이고, 그건 광고를 아예 안 하는 SKU 와 같은 일이다.
 * 갈라야 하는 것은 '이 SKU 만 입찰을 바꿀 수 있나' 하나뿐이므로,
 * 전용 기준보다 하나 더 받아 보고 넘치면 '큼'으로 끝낸다.
 */
var ADPROD_PROBE = 25;

/**
 * 이 안에 드는 그룹은 SKU 수를 정확히 센다.
 * 우리가 만드는 묶음 캠페인이 최대 20개까지 차므로, 그보다 넉넉히 잡아야
 * '이 묶음에 아직 자리가 있나'를 알 수 있다 — 자리를 모르면 새 SKU 가 들어올 때마다
 * 캠페인을 새로 만들게 되고, 그러면 몇 달 뒤 캠페인이 수백 개가 된다.
 */

var SHEET_ADGRP = '광고그룹';
var ADGRP_HEADER = ['캠페인', '유형', '광고그룹', '상태', '기본입찰',
                    'SKU수', '전용가능', '대상수', '캠페인ID', '광고그룹ID', '수집일시'];
var ADGRP_ID_COLS = [9, 10];

var ADSTRUCT_MAX = 20000;          // 이보다 많으면 자르고 알린다
var ADSTRUCT_PAGE = 500;           // 한 번에 받을 줄 수

/**
 * nextToken 이 없어질 때까지 이어 받는다.
 * @param {string} key 응답에서 목록이 들어 있는 칸 이름
 */
function adsPageAll_(token, path, ct, key, filter, cap) {
  var lim = cap || ADSTRUCT_MAX;
  var out = [], next = null, guard = 0;
  do {
    var body = { maxResults: ADSTRUCT_PAGE };
    for (var k in filter) body[k] = filter[k];
    if (next) body.nextToken = next;
    var r = adsApi_(token, 'post', path, body, ct, ct);
    var arr = r[key] || [];
    out = out.concat(arr);
    next = r.nextToken || null;
    guard++;
  } while (next && guard < 2000 && out.length < lim);
  return out;
}

// 자동 캠페인이 쓰는 네 가지 겨냥 방식. 뜻을 모르면 표를 읽을 수가 없다.
var AUTO_TARGET_KR = {
  'QUERY_HIGH_REL_MATCHES': '자동:유사검색어',
  'QUERY_BROAD_REL_MATCHES': '자동:넓은검색어',
  'ASIN_SUBSTITUTE_RELATED': '자동:대체상품',
  'ASIN_ACCESSORY_RELATED': '자동:보완상품'
};

/** 자동 캠페인의 타깃은 이름이 없다 — 무엇을 겨냥한 것인지 풀어 쓴다 */
function targetLabel_(t) {
  try {
    var ex = t.resolvedExpression || t.expression || [];
    if (!ex.length) return String(t.targetId || '');
    var parts = [];
    for (var i = 0; i < ex.length; i++) {
      var ty = String(ex[i].type || '');
      var val = ex[i].value ? ' ' + ex[i].value : '';
      parts.push(AUTO_TARGET_KR[ty] || ty || '?');
      if (val) parts[parts.length - 1] += val;
    }
    return parts.join(' + ');
  } catch (e) { return String(t.targetId || ''); }
}

/** 메뉴: 광고 구조 수집 */
function fetchAdStructure() {
  var props = PropertiesService.getScriptProperties();
  var token = adsToken_();
  if (!props.getProperty(PROP_ADS_PROFILE)) adsPickProfile_();

  var t0 = Date.now();
  var states = { stateFilter: { include: ['ENABLED', 'PAUSED'] } };

  var camps = adsPageAll_(token, '/sp/campaigns/list', ADSW_CT_CAMPAIGN, 'campaigns', states);
  var groups = adsPageAll_(token, '/sp/adGroups/list', ADSW_CT_ADGROUP, 'adGroups', states);
  var kws = adsPageAll_(token, '/sp/keywords/list', ADSW_CT_KEYWORD, 'keywords', states);
  var tgs = adsPageAll_(token, '/sp/targets/list', ADSW_CT_TARGET, 'targetingClauses', states);
  // 부정 키워드도 같이 받는다. 검색어 판정이 '이미 막았나' 를 볼 때 여기서 읽는다 —
  // 예전엔 판정할 때마다 API 로 전부 다시 받았다 (수집과 실행이 섞인 자리였다)
  var negs = adsPageAll_(token, '/sp/negativeKeywords/list', ADSW_CT_NEGKEYWORD,
                         'negativeKeywords', states);


  // 캠페인·그룹은 줄마다 이름을 붙이려고 찾아 쓴다
  var C = {}, G = {};
  var nAuto = 0, nManual = 0;
  for (var i = 0; i < camps.length; i++) {
    var c = camps[i];
    var auto = String(c.targetingType || '').toUpperCase() === 'AUTO';
    if (auto) nAuto++; else nManual++;
    C[String(c.campaignId)] = {
      name: c.name || '(이름 없음)',
      type: auto ? '자동' : '수동',
      state: c.state || '',
      budget: (c.budget && typeof c.budget.budget === 'number') ? c.budget.budget : ''
    };
  }
  for (var j = 0; j < groups.length; j++) {
    var g = groups[j];
    G[String(g.adGroupId)] = {
      name: g.name || '(이름 없음)',
      state: g.state || '',
      campaignId: String(g.campaignId || ''),
      defaultBid: (typeof g.defaultBid === 'number') ? g.defaultBid : ''
    };
  }

  var now = new Date();
  var rows = [];
  var push = function (kind, cid, gid, id, label, match, state, bid) {
    var c = C[String(cid)] || {}, g = G[String(gid)] || {};
    // 입찰가가 비어 있으면 광고그룹 기본값으로 나간다 — 실제로 얼마에 사는지는 그 값이다
    var eff = (typeof bid === 'number') ? bid
            : (typeof g.defaultBid === 'number' ? g.defaultBid : '');
    rows.push([
      c.name || ADSTRUCT_GONE, c.type || '', c.state || '', c.budget === undefined ? '' : c.budget,
      g.name || '(그룹 없음)', g.state || '', g.defaultBid === undefined ? '' : g.defaultBid,
      kind, label, match || '', state || '',
      (typeof bid === 'number') ? bid : '', eff,
      String(cid), String(gid), String(id), now
    ]);
  };

  for (var k = 0; k < kws.length; k++) {
    var w = kws[k];
    push('키워드', w.campaignId, w.adGroupId, w.keywordId,
         w.keywordText || '(이름 없음)', w.matchType || '', w.state, w.bid);
  }
  for (var t = 0; t < tgs.length; t++) {
    var g2 = tgs[t];
    push('타깃', g2.campaignId, g2.adGroupId, g2.targetId,
         targetLabel_(g2), g2.expressionType || '', g2.state, g2.bid);
  }
  for (var n = 0; n < negs.length; n++) {
    var ng = negs[n];
    push(ADSTRUCT_KIND_NEG, ng.campaignId, ng.adGroupId, ng.keywordId,
         ng.keywordText || '(이름 없음)', ng.matchType || '', ng.state, undefined);
  }

  // 캠페인 → 그룹 → 종류 → 이름 순으로 정렬한다. 사람이 캠페인 단위로 읽기 때문이다
  rows.sort(function (a, b) {
    for (var c = 0; c < 9; c++) {
      if (c === 3 || c === 6) continue;                 // 숫자 칸은 정렬 기준이 아니다
      var x = String(a[c]), y = String(b[c]);
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  });

  var cut = false;
  if (rows.length > ADSTRUCT_MAX) { rows = rows.slice(0, ADSTRUCT_MAX); cut = true; }

  var sh = ensureSheet_(SHEET_ADSTRUCT, ADSTRUCT_HEADER);
  // 쓰기 전에 ID 칸을 글자로 못 박는다 (숫자로 바뀌면 뒷자리를 잃는다)
  var need = Math.max(rows.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  for (var d = 0; d < ADSTRUCT_ID_COLS.length; d++) {
    sh.getRange(2, ADSTRUCT_ID_COLS[d], need - 1, 1).setNumberFormat('@');
  }
  writeTable_(sh, ADSTRUCT_HEADER, rows);
  headerNotes_(sh, 1, ADSTRUCT_HEADER, {
    '유형': '자동 = 아마존이 검색어를 알아서 고른다 (탐색용).\n수동 = 내가 키워드를 지정한다.',
    '매치/표현': '키워드는 매치타입(EXACT·PHRASE·BROAD).\n타깃은 표현유형(AUTO = 자동 겨냥 · MANUAL = 상품 겨냥).',
    '실입찰(JPY)': '입찰 칸이 비어 있으면 광고그룹 기본입찰로 나간다.\n실제로 얼마에 사고 있는지는 이 칸이다.',
    '대상ID': '입찰가를 바꿀 때 쓰는 자리표. 글자 서식이라 뒷자리가 안 잘린다.',
    '키워드/타깃': '자동 캠페인의 타깃은 이름이 없어 겨냥 방식을 풀어 적었다.'
  });
  sh.getRange(2, 12, Math.max(rows.length, 1), 2).setNumberFormat('#,##0.00');

  // ── SKU 매핑 ────────────────────────────────────────
  // 그룹마다 딱 ADPROD_PROBE 개만 받아 '작은가 큰가'를 가른다.
  // 작으면 그 SKU 들을 그대로 쓰고, 크면 세지 않는다 (위 주석 참고).
  var grpSku = {}, skuMap = {}, nBig = 0, nProbeFail = 0;
  for (var gk0 in G) {
    var got;
    try {
      got = adsApi_(token, 'post', '/sp/productAds/list',
        { maxResults: ADPROD_PROBE, adGroupIdFilter: { include: [String(gk0)] },
          stateFilter: { include: ['ENABLED', 'PAUSED'] } },
        ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
    } catch (e0) {
      // 못 읽은 그룹을 '전용'으로 두면 안 된다 — 실제로는 SKU 수천 개짜리일 수 있고,
      // 그러면 한 SKU 에 맞춘 입찰이 나머지 전부에 함께 걸린다.
      nProbeFail++;
      grpSku[gk0] = { n: 0, big: true, err: true };
      continue;
    }
    var arr0 = (got && got.productAds) || [];
    var more = !!(got && got.nextToken) || arr0.length >= ADPROD_PROBE;
    grpSku[gk0] = { n: arr0.length, big: more };
    if (more) { nBig++; continue; }               // 큰 그룹은 SKU 를 남기지 않는다
    if (arr0.length > ADPROD_DEDICATED_MAX) continue;   // 셀 수는 있지만 전용은 아니다
    for (var a0 = 0; a0 < arr0.length; a0++) {
      var sku2 = String(arr0[a0].sku || '').trim();
      if (!sku2) continue;
      var sm = skuMap[sku2] || (skuMap[sku2] = { asin: '', gids: {}, camp: '', nGid: 0 });
      if (arr0[a0].asin && !sm.asin) sm.asin = String(arr0[a0].asin);
      if (!sm.gids[gk0]) { sm.gids[gk0] = true; sm.nGid++; }
      if (!sm.camp) sm.camp = (C[String(arr0[a0].campaignId)] || {}).name || ADSTRUCT_GONE;
    }
  }

  // 그룹마다 대상(키워드·타깃)이 몇 개인지 — 한 입찰이 몇 SKU를 담당하는지 보려면 필요하다
  var grpTargets = {};
  for (var t2 = 0; t2 < rows.length; t2++) {
    var g3 = String(rows[t2][14] || '');
    if (g3) grpTargets[g3] = (grpTargets[g3] || 0) + 1;
  }

  var grows = [];
  for (var gk in G) {
    var gv = G[gk], gc = C[gv.campaignId] || {};
    var gi0 = grpSku[gk] || { n: 0, big: false };
    grows.push([gc.name || ADSTRUCT_GONE, gc.type || '', gv.name, gv.state,
                gv.defaultBid === undefined ? '' : gv.defaultBid,
                gi0.err ? '확인 못 함' : (gi0.big ? ADPROD_PROBE + '개 넘음' : gi0.n),
                (!gi0.big && gi0.n <= ADPROD_DEDICATED_MAX) ? 'O' : '',
                grpTargets[gk] || 0,
                String(gv.campaignId), String(gk), now]);
  }
  // 전용 가능한 그룹을 위로 (손댈 수 있는 것이 먼저 보여야 한다)
  grows.sort(function (a, b) {
    if (a[6] !== b[6]) return a[6] ? -1 : 1;
    return String(a[0]) < String(b[0]) ? -1 : 1;
  });
  var nDedGrp = 0;
  for (var q2 = 0; q2 < grows.length; q2++) if (grows[q2][6]) nDedGrp++;
  var gsh = ensureSheet_(SHEET_ADGRP, ADGRP_HEADER);
  var gneed = Math.max(grows.length + 1, 2);
  if (gsh.getMaxRows() < gneed) gsh.insertRowsAfter(gsh.getMaxRows(), gneed - gsh.getMaxRows());
  for (var gi = 0; gi < ADGRP_ID_COLS.length; gi++) {
    gsh.getRange(2, ADGRP_ID_COLS[gi], gneed - 1, 1).setNumberFormat('@');
  }
  writeTable_(gsh, ADGRP_HEADER, grows);

  var prows = [], nDed = 0;
  for (var sk2 in skuMap) {
    var sm2 = skuMap[sk2];
    var minN = 0, ids = [];
    for (var gg2 in sm2.gids) {
      ids.push(gg2);
      var n2 = (grpSku[gg2] && grpSku[gg2].n) || 0;
      if (!minN || n2 < minN) minN = n2;
    }
    var ded = (minN > 0 && minN <= ADPROD_DEDICATED_MAX) ? 'O' : '';
    if (ded) nDed++;
    prows.push([sk2, sm2.asin, sm2.nGid || 0, sm2.camp, minN, ded,
                ids.slice(0, 6).join(','), now]);
  }
  prows.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  var psh = ensureSheet_(SHEET_ADPROD, ADPROD_HEADER);
  var pneed = Math.max(prows.length + 1, 2);
  if (psh.getMaxRows() < pneed) psh.insertRowsAfter(psh.getMaxRows(), pneed - psh.getMaxRows());
  for (var pi = 0; pi < ADPROD_ID_COLS.length; pi++) {
    psh.getRange(2, ADPROD_ID_COLS[pi], pneed - 1, 1).setNumberFormat('@');
  }
  writeTable_(psh, ADPROD_HEADER, prows);
  headerNotes_(psh, 1, ADPROD_HEADER, {
    'SKU': '전용 그룹(SKU ' + ADPROD_DEDICATED_MAX + '개 이하)에 든 SKU 만 여기 있다.\n' +
           'SKU 를 무더기로 담은 큰 그룹은 낱개로 세지 않는다 —\n' +
           '거기 든 SKU 에 할 일은 어차피 전용 캠페인을 새로 만드는 것뿐이라\n' +
           '광고를 아예 안 하는 SKU 와 할 일이 같기 때문이다.',
    '가장작은그룹SKU수': '이 SKU 가 걸려 있는 광고그룹 중 가장 작은 것의 SKU 수.',
    '전용': 'O 이면 그 SKU 에 맞춘 입찰가를 걸 수 있다.'
  });
  headerNotes_(gsh, 1, ADGRP_HEADER, {
    'SKU수': '전용 기준을 넘으면 정확히 세지 않고 "' + ADPROD_PROBE + '개 넘음" 으로 둔다.',
    '전용가능': 'O 이면 이 그룹의 입찰가를 그 SKU 에 맞춰 걸 수 있다.\n' +
                '빈칸이면 같은 입찰이 그룹의 모든 SKU 에 함께 걸린다.'
  });

  var msg = '광고구조 — 캠페인 ' + camps.length + '개 (자동 ' + nAuto + ' · 수동 ' + nManual + ') · ' +
            '광고그룹 ' + groups.length + '개 · 키워드 ' + kws.length + '개 · 타깃 ' + tgs.length +
            '개 · 전용그룹 SKU ' + prows.length + '개 (큰 그룹 ' + nBig + '개는 안 셈)' +
            ' (' + Math.round((Date.now() - t0) / 1000) + '초)';
  log_('ads', 'INFO', msg);
  toast_('광고구조 ' + rows.length + '행');
  showSheet_(SHEET_ADSTRUCT);

  // 이름이 안 붙은 줄은 캠페인·그룹 목록에서 빠진 것이다 (보관됨 등)
  var orphan = 0;
  for (var o = 0; o < rows.length; o++) if (rows[o][0] === ADSTRUCT_GONE) orphan++;

  ui_().alert('광고 구조 수집',
    msg.replace(/^광고구조 — /, '') + '\n\n' +
    '표 ' + rows.length.toLocaleString() + '행 (입찰을 바꿀 수 있는 자리 하나가 한 줄)\n' +
    '"' + SHEET_ADGRP + '" 광고그룹 ' + grows.length + '개 — 전용 ' + nDedGrp +
      ' · SKU 여럿을 함께 담은 그룹 ' + (grows.length - nDedGrp) + '\n' +
    '"' + SHEET_ADPROD + '" 전용 그룹의 SKU ' + prows.length.toLocaleString() + '개\n' +
    (nProbeFail ? '\n⚠ 그룹 ' + nProbeFail + '개는 상품 목록을 못 읽었습니다\n' : '') +
    (nDed === 0 ? '\n⚠ 전용 그룹이 하나도 없습니다 — 지금 구조로는 SKU 별 입찰가를 걸 수 없습니다.\n' +
                  '   한 입찰이 그룹의 모든 SKU 에 함께 걸립니다.\n' +
                  '   그 SKU 들은 전용 캠페인으로 빼야 따로 매길 수 있습니다.\n' : '') +
    (orphan ? '\n· ' + orphan + '행은 보관·삭제된 캠페인입니다 (안 도는 것이라 조정 대상이 아닙니다)\n' : '') +
    (cut ? '\n⚠ ' + ADSTRUCT_MAX.toLocaleString() + '행에서 잘랐습니다\n' : '') +
    '\n지금은 목록만입니다 — 클릭·주문·노출 점유율은 다음 단계에서 붙입니다.',
    ui_().ButtonSet.OK);
  return msg;
}
