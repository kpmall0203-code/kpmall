/**
 * 74_자료점검.gs — 필요한 자료를 알아서 챙기고, 중복을 걷어낸다
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 지금까지는 '수집 → 분석' 순서를 사람이 외우고 있어야 했다.
 * 매출 기여도를 보려면 판매실적이 먼저 있어야 하고, SKU 추적을 보려면 일별 수집이
 * 먼저 돌아야 한다. 이 구조를 아는 사람만 쓸 수 있다.
 *
 * 그래서 분석을 누르면 먼저 '무엇이 있어야 하는지'를 확인하고, 없으면 알려주고
 * 그 자리에서 받아온다. 사람이 순서를 외울 필요가 없어진다.
 *
 * ── 오래 걸리는 것은 자동으로 못 끝낸다 ────────────────
 * 아마존 동기화·주문 수집·판매실적은 6분 한도를 넘어 트리거로 이어 달린다.
 * 그런 건 시작만 걸어주고 "몇 분 뒤 다시 눌러 달라"고 말한다.
 * 몰래 기다리게 하는 것보다 정직하다.
 */

/** 이 시간이 지나면 '낡았다'고 본다 (시간) */
var STALE_LISTING_H = 24 * 7;
var STALE_FX_H = 24 * 3;

/**
 * 자료 요구사항 목록.
 * 각 항목: 있는지 보는 법, 없으면 받는 법, 오래 걸리는지.
 */
function dataNeeds_() {
  return {
    listing: {
      label: '리스팅 (등록 상품)',
      why: 'SKU·현재가를 여기서 읽습니다',
      check: function () {
        var sh = ss_().getSheetByName(SHEET_LISTING);
        var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
        if (!n) return { ok: false, why: '비어 있음' };
        var at = PropertiesService.getScriptProperties().getProperty(PROP_LAST_SYNC_AT);
        var h = at ? (Date.now() - Number(at)) / 3600000 : 9999;
        if (h > STALE_LISTING_H) {
          return { ok: true, stale: true, why: n.toLocaleString() + '개 · ' +
                   Math.round(h / 24) + '일 전 동기화' };
        }
        return { ok: true, why: n.toLocaleString() + '개' };
      },
      cost: '약 3~6분. 18,000 SKU를 리포트로 받아 통째로 갈아끼웁니다',
      collect: 'syncAmazon', slow: true, menu: '🔄 데이터 갱신 → 아마존 동기화'
    },

    fx: {
      label: '환율',
      why: '리프라이싱의 r1(사내환율)입니다',
      check: function () {
        var r = null;
        try { r = fxHouseRate_(); } catch (e) {}
        return r ? { ok: true, why: r.toFixed(2) + ' KRW/JPY' }
                 : { ok: false, why: '사내환율 없음' };
      },
      cost: '10초 안팎. 환율 한 줄만 읽습니다',
      collect: 'refreshData', slow: false, menu: '🔄 데이터 갱신 → 환율·청구서·원가'
    },

    sales: {
      label: '판매실적 (기간 합계)',
      why: 'SKU별 판매량·매출·세션이 여기서 나옵니다',
      check: function () {
        var p = salesPeriods_();
        return p.length ? { ok: true, why: p.length + '개 기간 (' + p[0].from + '~' + p[0].to + ')' }
                        : { ok: false, why: '받아둔 기간 없음' };
      },
      cost: '기간 하나에 1~3분. 세션·카트박스%가 여기에만 있습니다',
      collect: 'fetchSalesReport', slow: true, menu: '🔄 데이터 갱신 → 판매실적 수집'
    },

    daily: {
      label: '일별 SKU 판매',
      why: '날짜별 판매량이 있어야 가격변경 전후를 비교합니다',
      check: function () {
        // 하루짜리 행(기간시작 = 기간종료)이 있는지만 본다 (실행당 1회 읽는 캐시 사용)
        var v = salesTable_();
        for (var i = 0; i < v.length; i++) {
          var f = v[i][SL_FROM] instanceof Date ? ymd_(v[i][SL_FROM]) : String(v[i][SL_FROM]);
          var t = v[i][SL_TO] instanceof Date ? ymd_(v[i][SL_TO]) : String(v[i][SL_TO]);
          if (f && f === t) return { ok: true, why: '있음' };
        }
        return { ok: false, why: '날짜별 자료 없음' };
      },
      cost: '하루당 한 번씩 부르므로 30일이면 5~10분. 이어 달립니다',
      collect: 'fetchSalesDaily', slow: true, menu: '🔄 데이터 갱신 → 일별 SKU 판매 수집'
    },

    orders: {
      label: '주문 (주문번호↔SKU)',
      why: '청구서의 실측 배송비를 SKU에 붙이는 다리입니다',
      check: function () {
        var sh = ss_().getSheetByName(SHEET_ORDERS);
        var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
        return n ? { ok: true, why: n.toLocaleString() + '행' }
                 : { ok: false, why: '비어 있음' };
      },
      cost: '30일씩 나눠 받습니다. 한 구간에 1~2분',
      collect: 'fetchOrdersReport', slow: true, menu: '🔄 데이터 갱신 → 주문 수집'
    },

    invoice: {
      label: '청구서 실측 배송비',
      why: '배송비율·손익분기가 추정이 아니라 실측이 됩니다',
      check: function () {
        var sh = ss_().getSheetByName(SHEET_SKUCOST);
        var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
        return n ? { ok: true, why: n.toLocaleString() + '개 SKU' }
                 : { ok: false, why: '없음 (요율표 추정으로 대체)' };
      },
      cost: '청구서 장수에 따라 1~5분. 드라이브 폴더를 통째로 읽습니다',
      collect: 'refreshData', slow: false, menu: '🔄 데이터 갱신 → 환율·청구서·원가'
    },

    ads: {
      label: '광고비',
      why: 'TACOS 계산에 씁니다',
      check: function () {
        var sh = ss_().getSheetByName(SHEET_ADS);
        var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
        if (n) return { ok: true, why: n.toLocaleString() + '행' };
        var has = PropertiesService.getScriptProperties().getProperty(PROP_ADS_REFRESH);
        return { ok: false, why: has ? '수집 안 함' : '광고 API 자격증명 없음' };
      },
      cost: '31일 구간마다 2분 안팎. 받을 SKU를 먼저 물어봅니다',
      collect: 'fetchAdsSpend', slow: true, menu: '📣 광고 → 자료 받기 → 광고비 수집'
    },

    adstruct: {
      label: '광고 구조 (캠페인·광고그룹)',
      why: '캠페인 계획·검색어 판정이 광고그룹 ID 를 여기서 찾습니다',
      check: function () {
        var sh = ss_().getSheetByName(SHEET_ADSTRUCT);
        var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
        return n ? { ok: true, why: n.toLocaleString() + '줄' } : { ok: false, why: '없음' };
      },
      cost: '1~3분. 캠페인·광고그룹·키워드를 통째로 받습니다',
      collect: 'fetchAdStructure', slow: false, menu: '📣 광고 → 자료 받기 → 광고 구조 수집'
    },

    realloc: {
      label: '광고 재배분 (SKU 채산성)',
      why: '손익분기 CPA·권장 CPC 가 여기서 나옵니다 — 광고 쪽의 바탕입니다',
      check: function () {
        var sh = ss_().getSheetByName(SHEET_REALLOC);
        var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
        return n ? { ok: true, why: n.toLocaleString() + '개 SKU' } : { ok: false, why: '계산 안 함' };
      },
      cost: '1~2분. 판매실적·마진율로 계산만 합니다 (API 안 부름)',
      collect: 'analyzeAdReallocation', slow: false, menu: '📣 광고 → ② 광고 재배분 계산'
    },

    adterm: {
      label: '광고 검색어 (자동 캠페인)',
      why: '승격·부정 판정이 여기 쌓입니다',
      check: function () {
        var sh = ss_().getSheetByName(SHEET_ADTERM);
        var n = sh ? Math.max(sh.getLastRow() - 1, 0) : 0;
        return n ? { ok: true, why: n.toLocaleString() + '줄' } : { ok: false, why: '없음' };
      },
      cost: '한 주에 1~2분 · 1만 줄 안팎',
      collect: 'fetchAdSearchTerms', slow: true, menu: '📣 광고 → 검색어 수집'
    }
  };
}

/**
 * 필요한 자료를 확인하고, 없으면 받아온다.
 *
 * @param {Array<string>} required 반드시 있어야 하는 것
 * @param {Array<string>} optional 없어도 되지만 있으면 좋은 것
 * @param {string} title 무슨 작업인지 (알림창 제목)
 * @return {boolean} 계속 진행해도 되는가
 */
function ensureData_(required, optional, title) {
  var needs = dataNeeds_();
  var missing = [], stale = [], weak = [], have = [];

  var scan = function (keys, isRequired) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], d = needs[k];
      if (!d) continue;
      var r;
      try { r = d.check(); } catch (e) { r = { ok: false, why: '확인 실패: ' + e }; }
      var row = { key: k, def: d, res: r };
      if (!r.ok) (isRequired ? missing : weak).push(row);
      else if (r.stale) stale.push(row);
      else have.push(row);
    }
  };
  scan(required || [], true);
  scan(optional || [], false);

  if (!missing.length && !stale.length && !weak.length) return true;

  // 무엇이 없다고만 하면 '그래서 얼마나 걸리는데?'를 다시 묻게 된다.
  // 왜 필요한지 · 지금 뭐가 있는지 · 받으면 얼마나 걸리는지를 한 덩어리로 적는다.
  var line = function (x) {
    return '   · ' + x.def.label + '  — ' + x.res.why + '\n' +
           '        ' + x.def.why + '\n' +
           '        받는 곳: ' + x.def.menu + '\n' +
           '        ' + (x.def.cost || (x.def.slow
             ? '한 번에 못 끝나 트리거로 이어 달립니다'
             : '금방 끝납니다'));
  };
  var body = '';
  if (missing.length) body += '■ 없어서 진행할 수 없는 것\n' +
                             missing.map(line).join('\n') + '\n\n';
  if (weak.length) body += '■ 없어도 되지만, 있으면 더 정확한 것\n' +
                           weak.map(line).join('\n') + '\n\n';
  if (stale.length) body += '■ 오래된 것\n' + stale.map(line).join('\n') + '\n\n';

  // 받아야 할 것 중 첫 번째부터 처리한다. 여러 개를 한꺼번에 돌리면
  // 6분 한도에 걸려 무엇이 끝났는지도 알 수 없게 된다.
  var todo = missing.length ? missing : (weak.length ? weak : stale);
  var first = todo[0];

  var ans = ui_().alert(title + ' — 자료 점검',
    body +
    (missing.length
      ? '지금 [' + first.def.label + ']부터 받을까요?\n' +
        (first.def.slow
          ? '(몇 분 걸리고 자동으로 이어 달립니다. 끝나면 다시 실행하세요)\n\n'
          : '(금방 끝납니다)\n\n') +
        '[예] 지금 받기\n[아니오] 취소'
      : '[예] 지금 받기\n[아니오] 있는 것만으로 진행'),
    ui_().ButtonSet.YES_NO);

  if (ans !== ui_().Button.YES) {
    // 필수가 빠졌으면 진행할 수 없다. 나머지는 그냥 간다.
    if (missing.length) {
      throw new Error(missing.map(function (x) { return x.def.label; }).join(', ') +
        ' 이(가) 없어 진행할 수 없습니다.\n\n' +
        '메뉴: ' + missing[0].def.menu);
    }
    return true;
  }

  log_('needs', 'INFO', title + ' — ' + first.key + ' 수집 시작');
  var fn = this[first.def.collect];
  if (typeof fn !== 'function') {
    // 전역에서 못 찾으면(스코프 문제) 이름으로 안내만 한다
    throw new Error('[' + first.def.menu + ']을 실행한 뒤 다시 시도하세요.');
  }
  fn();
  if (first.def.slow) {
    throw new Error('[' + first.def.label + '] 수집을 시작했습니다.\n\n' +
      '끝나면 [' + title + ']을 다시 실행하세요.\n' +
      '(진행 상황은 [🔄 데이터 갱신 → 수집 상태]에서 볼 수 있습니다)');
  }
  return true;
}

// ── 중복 점검 ────────────────────────────────────────────
//
// 같은 자료를 두 번 받는 일은 생긴다 — 수집이 중간에 끊겨 이어받거나,
// 같은 기간을 다시 요청하거나, 수집 기록을 지우고 다시 돌리거나.
// 대부분은 각 수집기가 알아서 갈아끼우지만, 한 번에 훑어볼 곳이 필요하다.

/**
 * 중복을 셀 기준. 어느 칸이 같으면 같은 줄로 볼 것인가.
 * @return {Array<{sheet, header, keys, label, skip}>}
 */
function dupSpecs_() {
  return [
    { sheet: SHEET_SALES, header: SALES_HEADER, label: '판매실적',
      keys: [SL_FROM, SL_TO, SL_SKU] },
    // 캠페인별로 줄이 나뉜다 — 같은 날 같은 SKU가 여러 줄인 게 정상이다.
    // (날짜, SKU)만으로 중복을 판정하면 캠페인 하나만 남기고 나머지 광고비를 지운다.
    // 그래서 값 칸까지 모두 같을 때만 중복으로 본다.
    { sheet: SHEET_ADS, header: ADS_HEADER, label: '광고실적',
      keys: [AD_DATE, AD_SKU, AD_CAMP, AD_COST, AD_SALES, AD_IMPR, AD_CLICK, AD_ORD],
      dateKey: AD_DATE,
      note: '한 SKU가 캠페인 여러 개면 같은 날 여러 줄이 정상입니다 — ' +
            '캠페인과 값이 모두 같을 때만 셉니다' },
    { sheet: SHEET_ORDSUM, header: ORDSUM_HEADER, label: '주문요약',
      keys: [OS_MONTH, OS_SKU] },
    { sheet: SHEET_ADSUM, header: ADSUM_HEADER, label: '광고요약',
      keys: [AS_MONTH, AS_SKU] },
    { sheet: SHEET_SKUCOST, header: SKUCOST_HEADER, label: 'SKU원가',
      keys: [SC_SKU] },
    { sheet: SHEET_ORDERS, header: ORDERS_HEADER, label: '주문',
      keys: [OD_ORDER, OD_SKU, OD_QTY, OD_PRICE, OD_DATE],
      dateKey: OD_DATE,   // 커서 기간을 정해 그 블록만 본다 — 4만 행 통읽기를 피한다
      note: '한 주문에 같은 SKU가 두 줄인 경우가 있어, 다섯 칸이 모두 같을 때만 셉니다' }
  ];
}

function dupKey_(row, keys) {
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var v = row[keys[i]];
    parts.push(v instanceof Date ? ymd_(v) : String(v == null ? '' : v).trim());
  }
  return parts.join('');
}

/**
 * 중복 판정에 필요한 칸 수.
 *
 * 어느 표든 판정 칸이 앞쪽에 몰려 있어 거기까지만 읽으면 된다.
 * SKU원가는 13칸 중 1칸, 판매실적은 10칸 중 3칸이면 충분하다 —
 * 전부 읽으면 주문 18만 행에서 90만 셀을 들고 오다 6분을 넘긴다.
 */
function dupWidth_(spec) {
  var mx = 0;
  for (var i = 0; i < spec.keys.length; i++) if (spec.keys[i] > mx) mx = spec.keys[i];
  return mx + 1;
}

/** 다시 쓸 때 한 번에 보내는 행 수 */
var DUP_WRITE_CHUNK = 2000;

/**
 * 어느 쪽이 서버를 덜 다녀오는가.
 *
 * 둘 다 비용은 '호출 횟수'로 정해진다. 실제로 옮기는 양이 아니다.
 *   다시 쓰기 = 읽기 1 + 지우기 1 + (행 수 / 묶음) 번의 쓰기
 *   행 지우기 = 연속 구간 수만큼
 *
 * 고정 문턱(예: '2만 행 넘으면 지우기')으로 가르면 어긋난다.
 * 4만 행 표를 다시 쓰는 건 22번인데, 흩어진 중복 300건을 지우는 건 300번이다.
 * 표가 크다고 지우기가 유리한 게 아니라, 중복이 몰려 있을 때만 유리하다.
 *
 * @return {boolean} 통째로 다시 쓰는 편이 나은가
 */
function dupPreferRewrite_(nRows, nRuns) {
  // 실측(2026-08-06): 205,250셀 통읽기가 2.0초, 163,377셀이 1.6초다.
  // 즉 대량 읽기·쓰기는 싸고, 비싼 건 '호출 횟수'다.
  // 그래서 크기로 자르지 않고 어느 쪽이 서버를 덜 다녀오는지로만 고른다.
  //   다시 쓰기 = 읽기 1 + 쓰기 (행수/묶음) + 꼬리 자르기 1
  //   행 지우기 = 연속 구간 수
  // 148,471행 표에 흩어진 중복 12,000건이면 76회 대 12,000회 — 다시 쓰기가 낫다.
  var rewriteCalls = Math.ceil(nRows / DUP_WRITE_CHUNK) + 2;
  return nRuns > rewriteCalls;
}

/** 지울 행 번호(오름차순)를 연속 구간 [시작, 개수] 로 묶는다 */
function dupRuns_(rows) {
  var out = [], i = 0;
  while (i < rows.length) {
    var start = rows[i], n = 1;
    while (i + n < rows.length && rows[i + n] === start + n) n++;
    out.push([start, n]);
    i += n;
  }
  return out;
}

/**
 * 한 시트의 중복을 센다. clean=true 면 뒤에 나온 것만 남기고 지운다.
 *
 * 지울 때 표를 통째로 다시 쓰지 않는다. 중복은 보통 몇 백 건인데 그것 때문에
 * 18만 행을 새로 쓰면 읽기보다 쓰기에서 시간이 다 간다.
 * 연속 구간으로 묶어 뒤에서부터 지우면 건드리는 양이 중복 수에 비례한다.
 *
 * @return {{label, total, dup, removed, rows}}
 */
function dupScanSheet_(spec, fromDate) {
  var sh = ss_().getSheetByName(spec.sheet);
  var none = { label: spec.label, total: 0, dup: 0, removed: 0, rows: [] };
  if (!sh || sh.getLastRow() < 2) return none;

  var n = sh.getLastRow() - 1;
  var rowBase = 2;                       // v[0] 이 시트의 몇 행인가

  var v;
  if (fromDate && spec.dateKey !== undefined) {
    // 분석은 늘 기간을 대상으로 한다 — 날짜 칸(1칸)을 먼저 훑어 블록을 찾고
    // 그 블록만 전체 폭으로 읽는다. 표가 커져도 읽기는 기간에만 비례한다.
    var dcol = sh.getRange(2, spec.dateKey + 1, n, 1).getValues();
    var lo = -1, hi = -1;
    for (var d0 = 0; d0 < n; d0++) {
      var dd = dcol[d0][0];
      var ds0 = dd instanceof Date ? ymd_(dd) : String(dd || '').substring(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds0) || ds0 < fromDate) continue;
      if (lo < 0) lo = d0;
      hi = d0;
    }
    if (lo < 0) return none;
    rowBase = 2 + lo;
    v = sh.getRange(rowBase, 1, hi - lo + 1, dupWidth_(spec)).getValues();
  } else {
    v = sh.getRange(2, 1, n, dupWidth_(spec)).getValues();
  }
  var kFirst = spec.keys[0], kLast = spec.keys[spec.keys.length - 1];
  var blank = function (row) {
    return !String(row[kFirst] || '').trim() && !String(row[kLast] || '').trim();
  };

  var lastAt = {}, live = 0;
  for (var i = 0; i < v.length; i++) {
    if (blank(v[i])) continue;
    live++;
    lastAt[dupKey_(v[i], spec.keys)] = i;
  }

  var dupRows = [];
  for (var k = 0; k < v.length; k++) {
    if (blank(v[k])) continue;
    if (lastAt[dupKey_(v[k], spec.keys)] !== k) dupRows.push(k + rowBase);   // 시트 행 번호
  }
  return { label: spec.label, total: live, dup: dupRows.length,
           removed: 0, rows: dupRows };
}

/**
 * 점검이 찾아준 행 번호를 지운다.
 *
 * ── 왜 두 방식을 쓰는가 ────────────────────────────────
 * deleteRows 는 호출마다 서버를 한 번 다녀온다. 지울 양이 아니라 '호출 횟수'가
 * 곧 시간이다. 중복이 한 덩어리로 몰려 있으면 한 번이면 끝나지만,
 * 잘게 흩어져 있으면 수백 번이 되어 6분을 넘긴다.
 *
 * 반대로 통째로 다시 쓰기는 호출은 적지만 표 크기에 비례한다.
 * 주문 18만 행을 다시 쓰면 그것대로 6분을 넘긴다.
 *
 * 그래서 표가 작으면 다시 쓰고, 크면 뒤에서부터 지우되 시간이 되는 만큼만 한다.
 * 뒤에서부터 지우면 앞쪽 행 번호가 안 밀리므로, 중간에 멈춰도 남은 것은
 * 다시 점검해서 이어서 지우면 된다.
 *
 * @param {Array<number>} rows 시트 행 번호 (오름차순)
 * @param {number} deadline 이 시각을 넘기면 멈춘다 (Date.now() 기준)
 * @return {{label, removed, left}}
 */
function dupDeleteRows_(spec, rows, deadline) {
  var out = { label: spec.label, removed: 0, left: 0 };
  if (!rows || !rows.length) return out;
  var sh = ss_().getSheetByName(spec.sheet);
  if (!sh) return out;
  if (!deadline) deadline = Date.now() + DUP_SOFT_MS;

  var rr = dupRuns_(rows);
  var n = sh.getLastRow() - 1;

  if (dupPreferRewrite_(n, rr.length)) {
    var full = sh.getRange(2, 1, n, spec.header.length).getValues();
    var drop = {};
    for (var d = 0; d < rows.length; d++) drop[rows[d] - 2] = true;
    var keep = [];
    for (var f = 0; f < full.length; f++) if (!drop[f]) keep.push(full[f]);

    // clear() 후 쓰기는 쓰다가 죽으면 표가 통째로 빈다.
    // 대신 제자리에 위로 당겨 쓰고, 남은 꼬리만 마지막에 한 번 자른다.
    // 중간에 죽어도 '앞쪽은 정리됨 + 뒤쪽은 옛날 것'이라 잃는 자료가 없고,
    // 다시 돌리면 남은 중복을 마저 지운다.
    var CH = DUP_WRITE_CHUNK;
    for (var w = 0; w < keep.length; w += CH) {
      var part = keep.slice(w, w + CH);
      sh.getRange(2 + w, 1, part.length, spec.header.length).setValues(part);
    }
    if (n > keep.length) sh.deleteRows(2 + keep.length, n - keep.length);
    out.removed = rows.length;
    return out;
  }

  // 뒤에서부터 — 앞쪽 행 번호가 안 밀린다
  for (var r = rr.length - 1; r >= 0; r--) {
    if (Date.now() > deadline) break;
    sh.deleteRows(rr[r][0], rr[r][1]);
    out.removed += rr[r][1];
  }
  out.left = rows.length - out.removed;
  return out;
}

/** 점검(읽기)에 쓸 시간 상한 */
var DUP_SOFT_MS = 3 * 60 * 1000;


/** 메뉴: 중복 점검 · 정리 */
function checkDuplicates() {
  var t0 = Date.now();

  // 기간을 먼저 정한다. 분석은 늘 특정 기간을 대상으로 하는데,
  // 주문 탭은 보관 기간만큼 커서(4만+행) 통읽기가 시간을 다 먹는다.
  // 중복은 재수집에서 생기므로 보통 최근 구간에만 있다.
  var pr = ui_().prompt('중복 점검 — 기간',
    '주문 탭은 기간을 정해 봅니다 (다른 표는 작아서 늘 전체).\n\n' +
    '  90        최근 90일 (기본 — 그냥 [확인])\n' +
    '  180       최근 180일\n' +
    '  전체      처음부터 끝까지 (수만 행이면 오래 걸립니다)',
    ui_().ButtonSet.OK_CANCEL);
  if (pr.getSelectedButton() !== ui_().Button.OK) return;
  var raw = String(pr.getResponseText()).trim();
  var fromDate = '';
  if (raw !== '전체' && raw !== '0') {
    var days = /^\d+$/.test(raw) ? parseInt(raw, 10) : 90;
    fromDate = ymd_(new Date(Date.now() - days * 86400000));
  }
  PropertiesService.getScriptProperties()
    .setProperty(PROP_DUP_RANGE, fromDate);   // 백그라운드 정리도 같은 기간을 본다

  // 점검도 이 실행에서 하지 않는다.
  //
  // 표를 다섯 개 훑는 동안 기간 질문 창에서 기다린 시간까지 6분에 포함되는데,
  // 큰 표가 하나만 있어도 그 예산을 넘긴다. 그래서 '무엇을 볼지'만 정해 예약하고,
  // 표 하나씩 새 실행에서 훑는다 — 한 실행이 표 하나만 맡으면 예산이 넉넉하다.
  var specs = dupSpecs_();
  var labels = [];
  for (var i = 0; i < specs.length; i++) labels.push(specs[i].label);

  PropertiesService.getScriptProperties()
    .setProperty(PROP_DUP_QUEUE, JSON.stringify(labels));
  dupCleanReset_();
  dupScheduleContinue_(true);

  var msg = '중복 점검·정리 예약 — ' + labels.length + '개 표' +
            (fromDate ? ' (주문은 ' + fromDate + ' 이후)' : ' (전 기간)');
  log_('dup', 'INFO', msg);
  toast_(msg);
  ui_().alert('중복 점검 · 정리 — 예약했습니다',
    '1분 뒤부터 표를 하나씩 훑고, 중복이 있으면 바로 지웁니다.\n' +
    '시트를 닫아두셔도 됩니다.\n\n' +
    '대상: ' + labels.join(' · ') + '\n' +
    '기간: ' + (fromDate ? fromDate + ' 이후 (주문 탭)' : '전 기간') + '\n\n' +
    '왜 바로 안 하나: 표를 다섯 개 훑는 동안 이 창에서 기다린 시간까지\n' +
    '6분 한도에 포함됩니다. 표 하나씩 새 실행에서 맡으면 그 제약이 없습니다.\n\n' +
    '진행 상황: [🔄 데이터 갱신 → 수집 상태 · 가진 자료]\n' +
    '결과는 로그 탭에 표마다 한 줄씩 남습니다.',
    ui_().ButtonSet.OK);
  return msg;
}

/** 예약 상태만 초기화 (큐는 부르는 쪽이 이미 세팅했다) */
function dupCleanReset_() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_DUP_STALL);
}

var PROP_DUP_QUEUE = 'DUP_CLEAN_QUEUE';
var PROP_DUP_RANGE = 'DUP_CLEAN_RANGE';   // 점검 때 고른 기간 — 정리도 같은 기간만 본다
var PROP_DUP_STALL = 'DUP_CLEAN_STALL';   // 진전 없이 되돌아온 횟수
var DUP_MAX_STALLS = 4;                   // 이만큼 연속이면 체인을 끊는다

/** 한 표가 이만큼 넘게 걸렸으면 다음 표는 새 실행에 넘긴다 */
var DUP_ONE_SHEET_MS = 60 * 1000;
var DUP_CONTINUE_HANDLER = 'continueDupClean';

/** 트리거용 이어실행 */
function continueDupClean() {
  withLockOrRetry_('중복 정리', DUP_CONTINUE_HANDLER, function () {
    try { dupCleanChunk_(); } catch (e) { log_('dup', 'ERROR', String(e)); }
  });
}

/**
 * 예약된 시트를 하나씩 정리한다. 새 실행이라 6분을 통째로 쓴다.
 * 시간이 모자라면 남은 것을 큐에 두고 1분 뒤 다시 온다.
 */
function dupCleanChunk_() {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_DUP_QUEUE) || '[]');
  if (!queue.length) { dupCleanStop_(); return '완료'; }

  var byLabel = {};
  var specs = dupSpecs_();
  for (var i = 0; i < specs.length; i++) byLabel[specs[i].label] = specs[i];

  // 강제 종료를 견디게 '먼저' 다음 실행을 예약한다.
  // 6분을 넘겨 죽으면 이 아래 코드는 하나도 안 돌므로, 끝에서만 예약하면 체인이 끊긴다.
  //
  // 다만 그 예약이 무한 재시도가 될 수 있다 — 시간 초과가 아니라 진짜 오류로 죽으면
  // 매분 다시 와서 또 죽고, 하루 90분 자동 실행 한도를 아무 진전 없이 태운다.
  // 그래서 '진전 없는 실행'을 세어 몇 번 연속이면 체인을 끊고 알린다.
  var stalls = Number(props.getProperty(PROP_DUP_STALL) || 0);
  if (stalls >= DUP_MAX_STALLS) {
    dupCleanStop_();
    var why = '중복 정리를 멈췄습니다 — ' + stalls + '번 연속으로 진전이 없었습니다.\n' +
              '남은 대상: ' + queue.join(', ') + '\n' +
              '로그 탭의 오류를 확인한 뒤 [중복 점검 · 정리]를 다시 실행하세요.';
    log_('dup', 'ERROR', why);
    notifyAlert_('중복 정리 중단', why);
    return why;
  }
  props.setProperty(PROP_DUP_STALL, String(stalls + 1));   // 진전이 있으면 아래서 지운다
  dupScheduleContinue_(true);

  var done = [];
  while (queue.length && Date.now() - t0 < DUP_SOFT_MS) {
    var spec = byLabel[queue[0]];
    if (!spec) { queue.shift(); continue; }
    // 예약 사이에 시트가 바뀌었을 수 있으니 행 번호는 다시 잰다
    var sc = dupScanSheet_(spec, props.getProperty(PROP_DUP_RANGE) || '');
    if (!sc.dup) { queue.shift(); done.push(spec.label + ' 중복 없음'); continue; }
    var res = dupDeleteRows_(spec, sc.rows, t0 + DUP_SOFT_MS);
    if (spec.sheet === SHEET_SALES) salesCacheClear_();
    done.push(spec.label + ' ' + res.removed.toLocaleString() + '행 정리' +
              (res.left ? ' (남음 ' + res.left.toLocaleString() + '행)' : ''));
    if (res.left) break;               // 시간 소진 — 다음 실행이 이어서 지운다
    queue.shift();

    // 큰 표는 한 실행이 통째로 맡게 한다.
    // 방금 표가 오래 걸렸다면 다음 표는 새 실행에 넘긴다 — 남은 예산으로
    // 시작했다가 중간에 죽으면 그 표는 한 걸음도 못 나간 채 반복된다.
    if (Date.now() - t0 > DUP_ONE_SHEET_MS) break;
  }

  // 여기까지 왔으면 이번 실행은 살아서 끝났다. 뭐라도 했으면 정체 카운터를 지운다.
  if (done.length) props.deleteProperty(PROP_DUP_STALL);

  var more = queue.length > 0;
  if (more) props.setProperty(PROP_DUP_QUEUE, JSON.stringify(queue));
  else { props.deleteProperty(PROP_DUP_QUEUE); props.deleteProperty(PROP_DUP_RANGE); }
  if (more) dupScheduleContinue_(true); else dupCleanStop_();

  if (!more) { clearCostCache_(); clearCostSheetCache_(); }
  var msg = '중복 정리 — ' + (done.join(' · ') || '한 것 없음') +
            ' (' + Math.round((Date.now() - t0) / 1000) + '초)' +
            (more ? ' · 계속' : ' · 완료');
  log_('dup', 'INFO', msg);
  toast_(more ? '중복 정리 진행 중…' : '중복 정리 완료');
  return msg;
}

/** 정리 체인을 완전히 끝낸다 (트리거·큐·기간·정체 카운터) */
function dupCleanStop_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_DUP_QUEUE);
  props.deleteProperty(PROP_DUP_RANGE);
  props.deleteProperty(PROP_DUP_STALL);
  dupScheduleContinue_(false);
}

function dupScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === DUP_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(DUP_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

/**
 * 메뉴: 수집 상태 — 진행 중인 것과 가진 자료를 한 화면에서 본다.
 * 수집마다 따로 있던 '진행상황 / 중단'을 여기로 모았다.
 */
function collectStatus() {
  var props = PropertiesService.getScriptProperties();
  var q = function (k) { return JSON.parse(props.getProperty(k) || '[]').length; };
  var trigs = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var hasTrig = function (fn) { return trigs.indexOf(fn) >= 0; };

  var jobs = [
    { label: '아마존 동기화',
      on: !!(props.getProperty(PROP_SYNC_REPORT) || props.getProperty(PROP_SYNC_DOC)),
      note: function () { return '진행 중'; },
      stop: function () {
        syncScheduleContinue_(false);
        props.deleteProperty(PROP_SYNC_REPORT);
        props.deleteProperty(PROP_SYNC_DOC);
      } },
    { label: '판매실적 수집',
      on: !!(q(PROP_SALES_QUEUE) > 0 || props.getProperty(PROP_SALES_REPORT) ||
             props.getProperty(PROP_SALES_DOC)),
      note: function () {
        var n = q(PROP_SALES_QUEUE);
        var cur = props.getProperty(PROP_SALES_RANGE) || '';
        return (cur ? cur.replace('|', '~') + ' 받는 중' : '리포트 대기 중') +
               (n ? ' · 남은 구간 ' + n + '개' : '');
      },
      stop: salesClearRun_ },
    { label: '일별 SKU 수집', on: q(PROP_SKUD_QUEUE) > 0,
      note: function () { return q(PROP_SKUD_QUEUE) + '개 SKU 남음'; },
      stop: function () {
        props.deleteProperty(PROP_SKUD_QUEUE);
        skuDailyScheduleContinue_(false);
      } },
    { label: '주문 수집', on: q(PROP_ORDR_QUEUE) > 0,
      note: function () { return q(PROP_ORDR_QUEUE) + '개 구간 남음'; },
      stop: ordrClearRun_ },
    { label: '광고비 수집', on: q(PROP_ADS_QUEUE) > 0,
      note: function () { return q(PROP_ADS_QUEUE) + '개 구간 남음'; },
      stop: adsClearRun_ },

    /**
     * 광고 쪽 작업. 처음엔 72K 에 '지금 무엇이 도는가' 를 따로 만들었는데
     * 여기와 같은 일을 두 곳에서 하게 됐다. 한 곳으로 합친다.
     *
     * 큐가 있는 것(검색어·키워드)은 큐로, 시트가 곧 큐인 것(캠페인 만들기·켜기·검색어 반영)은
     * 트리거가 살아 있는지로 본다. 큐 길이만으로는 '도는 것' 과 '멈춘 것' 이 안 갈리므로
     * 검색어는 마지막으로 들어온 시각도 같이 적는다 — 방금이면 도는 것이다.
     */
    { label: '검색어 수집', on: q(PROP_ADTERM_QUEUE) > 0,
      note: function () {
        var t = adTermLastIn_();
        var qq = JSON.parse(props.getProperty(PROP_ADTERM_QUEUE) || '[]');
        var wk = qq.filter(function (x) { return x !== ADTERM_ROLLUP; }).length;
        return (wk ? '주 ' + wk + '개 남음' : '합쳐서 판정하는 중') +
               (t ? ' · 마지막 ' + (t.mins < 1 ? '방금' : t.mins + '분 전') +
                    (t.mins > 3 ? ' ⚠ 멈춘 듯' : '') : '');
      },
      stop: function () {
        props.deleteProperty(PROP_ADTERM_QUEUE);
        props.deleteProperty(PROP_ADTERM_REPORT);
        adTermScheduleContinue_(false);
      } },
    { label: '키워드 실적 수집', on: q(PROP_ADKW_QUEUE) > 0,
      note: function () { return q(PROP_ADKW_QUEUE) + '개 주 남음'; },
      stop: adkwClearRun_ },
    { label: '캠페인 만들기', on: hasTrig(ADEXEC_CONTINUE_HANDLER),
      note: function () { return '1분 간격으로 이어 달리는 중'; },
      stop: function () { adExecScheduleContinue_(false); } },
    { label: '캠페인 켜기·멈추기', on: hasTrig(ADENABLE_CONTINUE_HANDLER),
      note: function () { return '1분 간격으로 이어 달리는 중'; },
      stop: function () { adEnableScheduleContinue_(false); } },
    { label: '검색어 반영', on: hasTrig(ADTERM_APPLY_CONTINUE),
      note: function () { return '1분 간격으로 이어 달리는 중'; },
      stop: function () { adTermApplyScheduleContinue_(false); } },
    { label: '중복 정리', on: q(PROP_DUP_QUEUE) > 0,
      note: function () {
        return JSON.parse(props.getProperty(PROP_DUP_QUEUE) || '[]').join(', ') + ' 남음';
      },
      stop: dupCleanStop_ },
    { label: '가격 반영', on: applyQueueRemaining_() > 0,
      note: function () { return applyQueueRemaining_() + '건 남음'; },
      stop: null }        // 반영은 중간에 끊으면 어디까지 나갔는지 헷갈린다
  ];

  var running = [];
  for (var i = 0; i < jobs.length; i++) if (jobs[i].on) running.push(jobs[i]);
  var lines = jobs.map(function (j) {
    return '   ' + (j.on ? '▶ ' : '·  ') + j.label + (j.on ? '  — ' + j.note() : '  대기');
  }).join('\n');

  // 자료 현황도 같이 — '무엇이 있고 무엇이 없는지'를 한 화면에서
  var needs = dataNeeds_();
  var dataLines = [];
  for (var k in needs) {
    var r;
    try { r = needs[k].check(); } catch (e) { r = { ok: false, why: '확인 실패' }; }
    dataLines.push('   ' + (r.ok ? (r.stale ? '△' : '✓') : '✗') + ' ' +
                   needs[k].label + '  — ' + r.why);
  }

  var body = '■ 진행 중인 작업\n' + lines + '\n\n' +
             '■ 가지고 있는 자료\n' + dataLines.join('\n') + '\n\n';

  if (!running.length) {
    ui_().alert('지금 무엇이 도는가', body + '진행 중인 작업이 없습니다.', ui_().ButtonSet.OK);
    return;
  }

  var stoppable = [];
  for (var s = 0; s < running.length; s++) if (running[s].stop) stoppable.push(running[s]);
  if (!stoppable.length) {
    ui_().alert('지금 무엇이 도는가', body +
      '1분 간격으로 자동으로 이어 달립니다. 시트를 닫아두셔도 됩니다.\n' +
      '(가격 반영은 중간에 끊지 않습니다 — 어디까지 나갔는지 헷갈립니다)',
      ui_().ButtonSet.OK);
    return;
  }

  var opts = stoppable.map(function (j, i) { return '  ' + (i + 1) + ') ' + j.label; }).join('\n');
  var res = ui_().prompt('지금 무엇이 도는가 · 멈추기',
    body + '1분 간격으로 자동으로 이어 달립니다. 시트를 닫아두셔도 됩니다.\n\n' +
    '중단하려면 번호를 넣으세요 (그냥 [확인]이면 계속 진행):\n' + opts +
    '\n  0) 전부 중단',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var raw = String(res.getResponseText()).trim();
  if (raw === '') return;
  var pick = parseInt(raw, 10);

  // 0 = 전부. 하나씩 끄려고 메뉴를 여섯 번 여는 것보다 이게 필요할 때가 있다.
  if (pick === 0) {
    var ansAll = ui_().alert('전부 중단',
      stoppable.map(function (j) { return '   · ' + j.label; }).join('\n') + '\n\n' +
      '위 작업을 모두 멈춥니다.\n' +
      '받은 자료는 그대로 남고, 다시 시작하면 이어받습니다.\n\n계속할까요?',
      ui_().ButtonSet.YES_NO);
    if (ansAll !== ui_().Button.YES) return;
    var names = [];
    for (var s2 = 0; s2 < stoppable.length; s2++) {
      try { stoppable[s2].stop(); names.push(stoppable[s2].label); }
      catch (e) { log_('needs', 'ERROR', stoppable[s2].label + ' 중단 실패: ' + e); }
    }
    log_('needs', 'INFO', '전부 중단 — ' + names.join(', '));
    toast_('전부 중단 (' + names.length + '개)');
    ui_().alert('중단했습니다',
      names.join(' · ') + '\n\n받은 자료는 그대로 남아 있습니다.\n' +
      '예약 트리거도 함께 지웠습니다.', ui_().ButtonSet.OK);
    return;
  }

  if (!(pick >= 1 && pick <= stoppable.length)) return;
  var job = stoppable[pick - 1];
  var ans = ui_().alert('중단', '[' + job.label + ']을 중단할까요?\n\n' +
    '받은 자료는 그대로 남고, 다시 시작하면 이어받습니다.', ui_().ButtonSet.YES_NO);
  if (ans !== ui_().Button.YES) return;
  job.stop();
  log_('needs', 'INFO', job.label + ' 중단');
  toast_(job.label + ' 중단');
  ui_().alert('중단했습니다.\n받은 자료는 그대로 남아 있습니다.');
}


/** 광고검색어에 마지막으로 줄이 들어온 때. 없으면 null */
function adTermLastIn_() {
  var sh = ss_().getSheetByName(SHEET_ADTERM_RAW);
  if (!sh || sh.getLastRow() < 2) return null;
  // 원본은 덧붙이기만 하므로 마지막 줄이 가장 최근이다
  var v = sh.getRange(sh.getLastRow(), AR_AT + 1).getValue();
  if (!(v instanceof Date)) return null;
  return { at: v, mins: Math.round((Date.now() - v.getTime()) / 60000) };
}
