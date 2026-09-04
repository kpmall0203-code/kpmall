/**
 * 72G_광고키워드.gs — 키워드·타깃별 실적 (spTargeting)
 *
 * ── 왜 주 단위로 쌓는가 ─────────────────────────────────
 * 판정 규칙이 "판정 가능한 2주 연속", "직전 인상 뒤 노출이 늘었나"처럼
 * 주와 주를 견주는 형태다. 한 덩어리 합계로 받으면 그 비교를 못 한다.
 * 날짜별로 받으면 (날짜 × 대상 584) 이라 한 달에 1만7천 줄이 되어 너무 무겁다.
 * 그래서 한 주를 한 구간으로 받아 '기간시작·기간종료'를 달고 쌓는다 —
 * 판매실적 탭이 쓰는 방식과 같다.
 *
 * ── 광고구조와 붙여서 읽는다 ────────────────────────────
 * 리포트는 무슨 일이 있었는지만 준다. 지금 입찰가가 얼마인지는 광고구조에 있다.
 * 대상ID로 이어 붙여야 '이 성적을 낸 키워드의 현재 입찰가'가 한 줄에 모인다.
 * 붙지 않는 줄은 버리지 않고 그대로 남긴다 — 광고구조를 안 받았거나
 * 그 사이에 지워진 키워드다. 조용히 사라지면 합계가 안 맞는다.
 *
 * ── 최근 2주는 잠정이다 ─────────────────────────────────
 * 광고매출(sales14d)은 클릭 후 14일까지 붙는다. 최근 2주 구간은 나중에 더 늘어난다.
 * 그 사실을 [잠정] 칸으로 표시해 둔다 — 모르고 보면 매주 "실적이 나빠졌다"로 읽는다.
 */

var SHEET_ADKW = '광고키워드';
var ADKW_HEADER = [
  '기간시작', '기간종료', '잠정', '캠페인', '유형', '광고그룹',
  '종류', '키워드/타깃', '매치/표현', '상태', '실입찰(JPY)',
  '노출', '클릭', '광고비(JPY)', '광고매출(JPY)', '주문',
  'CTR', 'CVR', 'CPC(JPY)', 'ACOS', '상단노출점유율',
  '캠페인ID', '대상ID', '수집일시'
];
var AK_FROM = 0, AK_TO = 1, AK_ID = 23;      // 대상ID 칸 (1부터 셈)
var ADKW_ID_COLS = [22, 23];

var ADKW_REPORT_TYPE = 'spTargeting';
var PROP_ADKW_QUEUE = 'ADKW_QUEUE';
var PROP_ADKW_REPORT = 'ADKW_REPORT_ID';
var PROP_ADKW_LEVEL = 'ADKW_COL_LEVEL';
var ADKW_CONTINUE_HANDLER = 'continueAdKeywords';
var ADKW_WEEKS_DEFAULT = 8;
var ADKW_KEEP_WEEKS = 26;        // 이보다 오래된 구간은 지운다
var ADKW_PROVISIONAL_DAYS = 14;  // 광고매출이 아직 붙는 중인 기간

// 이 칸들은 확실하다. 하나라도 빠지면 표가 성립하지 않는다.
var ADKW_COLS = ['campaignId', 'adGroupId', 'keywordId',
                 'impressions', 'clicks', 'cost', 'purchases14d', 'sales14d'];
/**
 * 있으면 좋은 칸. 계정마다 받아주는 것이 달라 한 단계씩 물러선다.
 * 이름·매치는 광고구조에서 이어 붙일 수 있으므로, 다 빠져도 표는 돌아간다.
 * 물러선 단계는 기억해 두고 다음부터는 거기서 시작한다.
 */
var ADKW_LEVEL_COLS = [
  ['campaignName', 'keyword', 'matchType', 'targeting', 'topOfSearchImpressionShare'],
  ['campaignName', 'keyword', 'matchType', 'targeting'],
  ['keyword', 'matchType'],
  []
];

/** 어제까지, 한 주씩 뒤로. 최근 것부터 처리한다 — 중간에 멈춰도 쓸모 있는 쪽이 먼저 들어온다 */
function adkwWeeks_(n) {
  var out = [];
  var end = ymd_(new Date(Date.now() - 86400000));
  for (var i = 0; i < n; i++) {
    var start = addDays_(end, -6);
    out.push(start + '|' + end);
    end = addDays_(start, -1);
  }
  return out;
}

/** 리포트 요청. 선택 칸이 거절당하면 한 단계 줄여 다시 부른다 */
function adkwReport_(token, from, to) {
  var props = PropertiesService.getScriptProperties();
  var mk = function (level) {
    return { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['targeting'],
             columns: ADKW_COLS.concat(ADKW_LEVEL_COLS[level]),
             reportTypeId: ADKW_REPORT_TYPE, timeUnit: 'SUMMARY', format: 'GZIP_JSON' };
  };
  var start = parseInt(props.getProperty(PROP_ADKW_LEVEL) || '', 10);
  if (!(start >= 0 && start < ADKW_LEVEL_COLS.length)) start = 0;

  for (var lv = start; lv < ADKW_LEVEL_COLS.length; lv++) {
    try {
      var r = adsRunReport_(token, PROP_ADKW_REPORT, mk(lv), from, to, '키워드실적');
      if (lv !== start) props.setProperty(PROP_ADKW_LEVEL, String(lv));
      return r;
    } catch (e) {
      var msg = String(e);
      // 칸 이름 문제일 때만 물러선다. 기간·권한 오류를 칸 문제로 착각하면
      // 쓸 수 있는 칸을 조용히 잃은 채 엉뚱한 데를 고치게 된다.
      var isColumn = /column|metric|field/i.test(msg) && !/groupBy/i.test(msg);
      if (!isColumn || lv === ADKW_LEVEL_COLS.length - 1) throw e;
      props.deleteProperty(PROP_ADKW_REPORT);
      log_('ads', 'WARN', '키워드 리포트 칸을 줄여 재시도 (' +
           (ADKW_LEVEL_COLS[lv + 1].join(',') || '이름 없이') + ') — ' + msg.substring(0, 140));
    }
  }
  throw new Error('키워드 실적 리포트를 요청하지 못했습니다.');
}

/** 광고구조 → 대상ID로 찾아 쓰는 표 */
function adkwStructIndex_() {
  var idx = {};
  var sh = ss_().getSheetByName(SHEET_ADSTRUCT);
  if (!sh || sh.getLastRow() < 2) return idx;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADSTRUCT_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var id = String(v[i][15] || '').trim();          // 대상ID
    if (!id) continue;
    idx[id] = { camp: v[i][0], type: v[i][1], group: v[i][4], kind: v[i][7],
                label: v[i][8], match: v[i][9], state: v[i][10], bid: v[i][12] };
  }
  return idx;
}

/** 같은 구간을 다시 받으면 그 구간 줄만 갈아끼운다 */
function writeAdkwRows_(rows, from, to) {
  var sh = ensureSheet_(SHEET_ADKW, ADKW_HEADER);
  var keep = [];
  var oldest = addDays_(ymd_(new Date()), -7 * ADKW_KEEP_WEEKS);
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADKW_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var f = v[i][AK_FROM] instanceof Date ? ymd_(v[i][AK_FROM]) : String(v[i][AK_FROM]);
      var t = v[i][AK_TO] instanceof Date ? ymd_(v[i][AK_TO]) : String(v[i][AK_TO]);
      if (!f) continue;
      if (f === from && t === to) continue;          // 이번에 받은 구간은 버린다
      if (f < oldest) continue;                      // 보관 기간을 넘긴 것도 버린다
      keep.push(v[i]);
    }
  }
  var all = keep.concat(rows);
  all.sort(function (a, b) {
    var x = String(a[AK_FROM]), y = String(b[AK_FROM]);
    if (x !== y) return x > y ? -1 : 1;              // 최근 구간이 위로
    return String(a[7]) < String(b[7]) ? -1 : 1;
  });
  var need = Math.max(all.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  for (var d = 0; d < ADKW_ID_COLS.length; d++) {
    sh.getRange(2, ADKW_ID_COLS[d], need - 1, 1).setNumberFormat('@');
  }
  writeTable_(sh, ADKW_HEADER, all);
  if (all.length) {
    sh.getRange(2, 17, all.length, 2).setNumberFormat('0.00%');   // CTR · CVR
    sh.getRange(2, 19, all.length, 1).setNumberFormat('#,##0.0'); // CPC
    sh.getRange(2, 20, all.length, 2).setNumberFormat('0.0%');    // ACOS · 점유율
  }
  return all.length;
}

/** 리포트 한 줄 → 표 한 줄 */
function adkwBuildRows_(rep, from, to, idx, now) {
  // 광고매출이 아직 붙는 중인 구간인지 (클릭 후 14일까지 늘어난다)
  var prov = daysBetween_(to, ymd_(new Date())) < ADKW_PROVISIONAL_DAYS;
  var rows = [], miss = 0;
  for (var i = 0; i < rep.length; i++) {
    var r = rep[i];
    var id = String(r.keywordId || r.targetId || '').trim();
    if (!id) continue;
    var s = idx[id];
    if (!s) miss++;
    var im = Number(r.impressions) || 0, ck = Number(r.clicks) || 0;
    var cost = Number(r.cost) || 0, sal = Number(r.sales14d) || 0;
    var od = Number(r.purchases14d) || 0;
    var tos = r.topOfSearchImpressionShare;
    rows.push([
      from, to, prov ? '잠정' : '',
      s ? s.camp : (r.campaignName || '(모름)'),
      s ? s.type : '',
      s ? s.group : '',
      s ? s.kind : (r.keyword ? '키워드' : '타깃'),
      s ? s.label : (r.keyword || r.targeting || id),
      s ? s.match : (r.matchType || ''),
      s ? s.state : '',
      s && s.bid !== '' ? s.bid : '',
      im, ck, Math.round(cost), Math.round(sal), od,
      im > 0 ? ck / im : '', ck > 0 ? od / ck : '',
      ck > 0 ? cost / ck : '', sal > 0 ? cost / sal : '',
      (typeof tos === 'number') ? tos / 100 : '',
      String(r.campaignId || (s ? '' : '')), id, now
    ]);
  }
  return { rows: rows, miss: miss };
}

/** 메뉴: 키워드 실적 수집 */
function fetchAdKeywords() {
  if (!adBusyGuard_('키워드 실적 수집')) return;
  if (adResumeIfQueued_('키워드 실적 수집', PROP_ADKW_QUEUE, adkwStep_)) return;
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_ADS_PROFILE)) adsPickProfile_();
  var wins = adAskWeeks_('키워드 실적 수집',
    '수동 키워드·타깃마다 노출·클릭·주문·상단 노출 점유율을 주 단위로 받습니다.\n' +
    '주와 주를 견주려면 최소 4주는 있어야 합니다.' +
    (ss_().getSheetByName(SHEET_ADSTRUCT) ? '' :
      '\n\n※ 광고구조가 아직 없어 입찰가·캠페인 이름이 안 붙습니다.\n' +
      '   [📣 광고 → 자료 받기 → 광고 구조 수집]을 먼저 하면 붙습니다.'),
    ADKW_WEEKS_DEFAULT, ADKW_KEEP_WEEKS);
  if (!wins) return;
  props.setProperty(PROP_ADKW_QUEUE, JSON.stringify(wins));
  adkwStep_(true);
}

function continueAdKeywords() {
  withLockOrRetry_('키워드 실적 수집', ADKW_CONTINUE_HANDLER, function () {
    try { adkwStep_(false); } catch (e) { log_('ads', 'ERROR', String(e)); }
  });
}

function adkwScheduleContinue_(more) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADKW_CONTINUE_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (more) ScriptApp.newTrigger(ADKW_CONTINUE_HANDLER).timeBased().after(60 * 1000).create();
}

function adkwClearRun_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_ADKW_QUEUE);
  props.deleteProperty(PROP_ADKW_REPORT);
  adkwScheduleContinue_(false);
}

/** 한 주를 처리한다 */
function adkwStep_(interactive) {
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty(PROP_ADKW_QUEUE) || '[]');
  if (!queue.length) { adkwScheduleContinue_(false); return '완료'; }

  var token = adsToken_();
  var win = queue[0].split('|');
  var from = win[0], to = win[1];

  toast_('키워드 실적 요청 중… (' + from + '~' + to + ')');
  var rep = adkwReport_(token, from, to);
  if (rep === null) {
    adkwScheduleContinue_(true);
    log_('ads', 'INFO', '키워드 리포트 준비 대기 — 1분 뒤 재시도 (' + from + '~' + to + ')');
    if (interactive) {
      ui_().alert('키워드 실적 — 리포트 준비 중',
        '아마존이 리포트를 만들고 있습니다 (오류 아님).\n\n' +
        '남은 주 ' + queue.length + '개\n1분 뒤 자동으로 이어받습니다.',
        ui_().ButtonSet.OK);
    }
    return;
  }

  var built = adkwBuildRows_(rep, from, to, adkwStructIndex_(), new Date());
  var total = writeAdkwRows_(built.rows, from, to);

  queue.shift();
  props.setProperty(PROP_ADKW_QUEUE, JSON.stringify(queue));
  props.deleteProperty(PROP_ADKW_REPORT);

  var msg = from + '~' + to + ' — ' + built.rows.length + '행' +
            (built.miss ? ' (광고구조에 없는 대상 ' + built.miss + ')' : '') +
            (queue.length ? ' · 남은 주 ' + queue.length : ' · 완료');
  log_('ads', 'INFO', '키워드 실적 — ' + msg);
  toast_(msg);

  if (queue.length) {
    adkwScheduleContinue_(true);
    if (interactive) {
      ui_().alert('키워드 실적 수집 — 진행 중',
        msg + '\n\n1분 간격으로 자동 진행됩니다.\n' +
        '창을 닫아도 계속됩니다.', ui_().ButtonSet.OK);
    }
    return msg;
  }
  adkwScheduleContinue_(false);
  showSheet_(SHEET_ADKW);
  if (interactive) {
    ui_().alert('키워드 실적 수집 완료',
      msg + '\n\n표 ' + total.toLocaleString() + '행 (한 주 × 대상 하나가 한 줄)\n\n' +
      '[잠정] 칸이 붙은 구간은 광고매출이 아직 늘어납니다 —\n' +
      '클릭 후 14일까지 붙기 때문입니다. 그 주끼리 견주지 마세요.',
      ui_().ButtonSet.OK);
  }
  return msg;
}
