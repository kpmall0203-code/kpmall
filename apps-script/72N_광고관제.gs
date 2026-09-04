/**
 * 72N_광고관제.gs — 우리가 만든 캠페인이 지금 뭐가 켜져 있고 얼마 쓰는가, 한 탭에서
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 캠페인이 여든 개를 넘으면 사람이 하나씩 열어 볼 수 없다. 그런데 자동으로 돌리는
 * 프로그램은 잘못 짜이면 조용히 돈을 샌다 — 실제로 승인 칸을 안 보고 일흔 개를 켠 적이 있다.
 * 그때 그것을 알아챈 것은 사람이 우연히 아마존 화면을 본 것이었다. 그래서는 안 된다.
 *
 * 이 탭이 하는 일 셋:
 *   ① 보인다   우리 캠페인마다 상태(아마존이 말하는 것) · 승인 · 최근 7일 광고비·매출
 *   ② 막는다   주간 광고비 한도. 넘으면 전부 멈추고 메일. 80% 에서 미리 메일
 *   ③ 잡는다   승인 안 했는데 켜져 있는 것 — 그 자체가 버그 신호. 바로 멈춘다
 *
 * ── 무엇을 부르나 (수집이다 — API → 시트) ─────────────────
 *   /sp/campaigns/list  우리 캠페인 ID 로만 (≤100 개, 한 번)  → 진짜 상태·예산
 *   spCampaigns 리포트  최근 7일, 캠페인 단위                → 광고비·매출·주문
 * 둘 다 가볍다. 매일 아침 트리거로 돈다. 사람은 표만 본다.
 *
 * ── 한도는 어디서 오나 ──────────────────────────────────
 * 광고기준의 [주간 광고비 한도(JPY)]. 비워 두면 승인 ✓ 캠페인의 일예산 합 × 7 을 쓴다 —
 * 승인한 만큼만 쓰는 것이 정상이므로, 그것을 넘으면 승인 안 한 것이 켜졌다는 뜻이다.
 * 숫자를 적으면 그 값이 우선한다 (트랙 B 의 '한 주 허용 손해' 도 여기에 적는다).
 */

var SHEET_ADWATCH = '광고관제';
var ADWATCH_HEADER = [
  '캠페인', '아마존상태', '승인', '일예산(JPY)', '입찰(JPY)', 'SKU수',
  '7일노출', '7일클릭', '7일광고비(JPY)', '7일광고매출(JPY)', '7일주문', '7일ACOS',
  '판정', '사유', '멈춤', '캠페인ID', '확인일시'
];
var AW_STATE = 1, AW_APPROVE = 2, AW_DAILY = 3, AW_COST = 8, AW_VERDICT = 12,
    AW_STOP = 14, AW_CID = 15;
var ADWATCH_ROW_HEADER = 2;                       // 1행은 요약 띠, 2행이 머리글
var PROP_ADWATCH_REPORT = 'ADWATCH_REPORT_ID';    // 점검(30일)과 섞이지 않게 따로
var PROP_ADWATCH_MAILED = 'ADWATCH_MAILED';       // 같은 경고 메일을 하루에 한 번만
var ADWATCH_DAYS = 7;
var ADWATCH_HANDLER = 'scheduledAdWatch';
var ADWATCH_REPORT_WAIT_MS = 90 * 1000;

// ── 자료 ────────────────────────────────────────────────

/** 광고생성계획에서 우리가 만든 캠페인 (결과가 성공인 줄) */
function adWatchOurs_() {
  var sh = ss_().getSheetByName(SHEET_ADPLAN);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][AP_RESULT - 1]).indexOf('성공') !== 0) continue;
    var cid = String(v[i][AP_CID - 1] || '').trim();
    if (!cid) continue;
    out.push({ row: i + 2, cid: cid, name: String(v[i][AP_NAME - 1]),
               approved: adRowApproved_(v[i][AP_APPROVE - 1]),
               daily: Number(v[i][AP_DAILY - 1]) || 0, bid: Number(v[i][AP_BID - 1]) || 0,
               nSku: Number(v[i][7]) || 0, result: String(v[i][AP_RESULT - 1]) });
  }
  return out;
}

/** 아마존이 말하는 지금 상태 — 우리 ID 로만 묻는다 */
function adWatchLiveState_(token, cids) {
  var out = {};
  for (var i = 0; i < cids.length; i += 100) {
    var part = cids.slice(i, i + 100);
    var r = adsApiRetry_(token, 'post', '/sp/campaigns/list',
      { campaignIdFilter: { include: part }, maxResults: 100 },
      ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
    var arr = (r && r.campaigns) || [];
    for (var a = 0; a < arr.length; a++) {
      out[String(arr[a].campaignId)] = {
        state: String(arr[a].state || ''),
        budget: (arr[a].budget && typeof arr[a].budget.budget === 'number') ? arr[a].budget.budget : ''
      };
    }
  }
  return out;
}

/** 최근 7일 캠페인 실적. 준비 안 됐으면 null */
function adWatchReport_(token) {
  var to = ymd_(new Date(Date.now() - 86400000));
  var from = addDays_(to, -(ADWATCH_DAYS - 1));
  var saved = ADS_SOFT_MS;
  ADS_SOFT_MS = ADWATCH_REPORT_WAIT_MS;
  try {
    var rep = adsRunReport_(token, PROP_ADWATCH_REPORT,
      { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['campaign'], columns: ADCAMP_COLS,
        reportTypeId: ADCAMP_REPORT_TYPE, timeUnit: 'SUMMARY', format: 'GZIP_JSON' },
      from, to, '관제');
    if (rep === null) return null;
    var out = {};
    for (var i = 0; i < rep.length; i++) {
      var r = rep[i], cid = String(r.campaignId || '');
      if (!cid) continue;
      var p = out[cid] || (out[cid] = { im: 0, ck: 0, cost: 0, sales: 0, ord: 0 });
      p.im += Number(r.impressions) || 0; p.ck += Number(r.clicks) || 0;
      p.cost += Number(r.cost) || 0; p.sales += Number(r.sales14d) || 0;
      p.ord += Number(r.purchases14d) || 0;
    }
    return { from: from, to: to, perf: out };
  } finally { ADS_SOFT_MS = saved; }
}

// ── 판정 ────────────────────────────────────────────────

/**
 * 캠페인 한 줄을 본다. 순서가 곧 심각도다.
 * '승인 안 했는데 켜짐' 이 맨 위인 이유: 그것은 실적이 아니라 프로그램 오류의 증거다.
 */
function adWatchVerdict_(c, live, p, margin) {
  var on = live && live.state === 'ENABLED';
  if (!live) return { v: '?', why: '아마존에 없음 — 지워졌거나 ID 가 낡았다', fix: '' };
  if (on && !c.approved) {
    return { v: '⛔ 미승인 켜짐', why: '승인 칸이 비어 있는데 아마존에서 켜져 있다 — 프로그램 오류 신호', fix: 'PAUSE' };
  }
  if (on && p.cost > c.daily * ADWATCH_DAYS * 1.1 && c.daily > 0) {
    return { v: '⛔ 예산 초과', why: '7일 광고비 ¥' + Math.round(p.cost) + ' > 일예산×7 ¥' +
             Math.round(c.daily * ADWATCH_DAYS) + ' — 예산이 안 먹히고 있다', fix: 'PAUSE' };
  }
  if (!on) return { v: '멈춤', why: c.approved ? '승인 ✓ 인데 멈춰 있음 — 켜려면 [캠페인 켜기]' : '', fix: '' };
  if (p.ord >= 3 && p.sales > 0 && p.cost / p.sales > margin) {
    return { v: '⚠ 손해 중', why: '7일 ACOS ' + pct1_(p.cost / p.sales) + ' > 마진율 ' + pct1_(margin) +
             ' (최근 2주는 매출이 아직 붙는 중이라 과장될 수 있음)', fix: '' };
  }
  if (p.ck >= 50 && p.ord === 0) {
    return { v: '⚠ 안 팔림', why: '7일 클릭 ' + p.ck + ' · 주문 0 · ¥' + Math.round(p.cost), fix: '' };
  }
  if (p.im === 0) return { v: '· 노출 없음', why: '켜져 있는데 7일 노출 0 — 입찰이 낮거나 상품 자격 문제', fix: '' };
  return { v: '정상', why: '', fix: '' };
}

/** 한도. 광고기준에 숫자가 있으면 그것, 없으면 승인 ✓ 일예산 합 × 7 */
function adWatchCap_(basis, ours) {
  var set = Number(basis['주간 광고비 한도(JPY)']);
  if (set > 0) return { cap: set, src: '광고기준에 적은 값' };
  var sum = 0;
  for (var i = 0; i < ours.length; i++) if (ours[i].approved) sum += ours[i].daily;
  return { cap: sum * 7, src: '승인 ✓ 캠페인 일예산 합 × 7 (광고기준에 적으면 그 값이 우선)' };
}

// ── 실행 ────────────────────────────────────────────────

/** 메뉴: 광고 관제 갱신 */
function refreshAdWatch() {
  if (!adBusyGuard_('광고 관제')) return;
  var r = adWatchRun_(true);
  if (r && r.pending) {
    ui_().alert('광고 관제 — 리포트 준비 중',
      '아마존이 7일 실적을 만들고 있습니다 (오류 아님).\n1~2분 뒤 다시 누르면 이어받습니다.', ui_().ButtonSet.OK);
    return;
  }
  if (!r) return;
  showSheet_(SHEET_ADWATCH);
  var lines = [r.banner, ''];
  if (r.writeErr) lines.push('⚠ 표를 쓰다 시트가 늦어 멈췄습니다 — 판정과 멈춤은 끝났습니다. 다시 누르면 표가 채워집니다.\n   (' + r.writeErr + ')', '');
  if (r.paused.length) lines.push('⛔ 자동으로 멈춘 캠페인 ' + r.paused.length + '개:\n   ' + r.paused.join('\n   '), '');
  lines.push('판정: ' + r.statLine);
  if (!adWatchTriggerOn_()) {
    var ok = ui_().alert('광고 관제', lines.join('\n') + '\n\n' +
      '이 점검을 매일 아침 자동으로 돌릴까요? (한도를 넘으면 멈추고 메일)\n' +
      '[확인] 켠다   [취소] 지금은 안 켠다', ui_().ButtonSet.OK_CANCEL);
    if (ok === ui_().Button.OK) { adWatchTriggerSet_(true); toast_('광고 관제 자동 점검 켬 — 매일 08시'); }
  } else {
    ui_().alert('광고 관제', lines.join('\n') + '\n\n매일 08시에 자동으로 다시 봅니다.', ui_().ButtonSet.OK);
  }
}

/** 트리거: 매일 아침 */
function scheduledAdWatch() {
  withLock_('광고 관제', function () {
    try {
      var r = adWatchRun_(false);
      if (r && r.pending) {
        // 리포트가 늦다 — 10분 뒤 한 번 더
        ScriptApp.newTrigger(ADWATCH_HANDLER + 'Retry').timeBased().after(10 * 60 * 1000).create();
      }
    } catch (e) {
      log_('ads', 'ERROR', '광고 관제 실패: ' + String(e));
      adWatchMailOnce_('fail', '광고 관제가 돌지 못했습니다',
        String(e) + '\n\n관제가 안 돌면 한도 감시도 안 됩니다. 시트에서 [🚦 광고 관제]를 직접 눌러 보세요.');
    }
  });
}
function scheduledAdWatchRetry() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADWATCH_HANDLER + 'Retry') ScriptApp.deleteTrigger(ts[i]);
  }
  scheduledAdWatch();
}

function adWatchTriggerOn_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === ADWATCH_HANDLER) return true;
  return false;
}
function adWatchTriggerSet_(on) {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === ADWATCH_HANDLER) ScriptApp.deleteTrigger(ts[i]);
  }
  if (on) ScriptApp.newTrigger(ADWATCH_HANDLER).timeBased().atHour(8).everyDays(1).create();
}

/** 같은 종류의 경고 메일은 하루 한 번 */
function adWatchMailOnce_(kind, subject, body) {
  var props = PropertiesService.getScriptProperties();
  var today = ymd_(new Date());
  var sent = {};
  try { sent = JSON.parse(props.getProperty(PROP_ADWATCH_MAILED) || '{}'); } catch (e) {}
  if (sent[kind] === today) return false;
  notifyAlert_(subject, body);
  sent[kind] = today;
  props.setProperty(PROP_ADWATCH_MAILED, JSON.stringify(sent));
  return true;
}

/**
 * 한 바퀴. 표를 다시 만들고, 넘은 것은 멈추고, 알린다.
 * @return {{pending:boolean}|{banner:string,paused:string[],statLine:string}}
 */
function adWatchRun_(interactive) {
  var ours = adWatchOurs_();
  if (!ours.length) {
    if (interactive) ui_().alert('관제할 캠페인이 없습니다.', '[⑤ 승인분 캠페인 생성]으로 먼저 만드세요.', ui_().ButtonSet.OK);
    return null;
  }
  var token = adsToken_();
  var rep = adWatchReport_(token);
  if (rep === null) return { pending: true };
  var live = adWatchLiveState_(token, ours.map(function (c) { return c.cid; }));
  var basis = adBasis_();
  var margin = Number(basis['기본 마진율']) || 0.17;
  var warnAt = Number(basis['한도 경고 비율']) || 0.8;
  var autoStop = String(basis['한도 넘으면 자동 멈춤']).toUpperCase() !== 'FALSE';
  var capInfo = adWatchCap_(basis, ours);

  var now = new Date(), rows = [], stat = {}, total = 0, onN = 0, toPause = [];
  for (var i = 0; i < ours.length; i++) {
    var c = ours[i], L = live[c.cid], p = rep.perf[c.cid] || { im: 0, ck: 0, cost: 0, sales: 0, ord: 0 };
    total += p.cost;
    if (L && L.state === 'ENABLED') onN++;
    var d = adWatchVerdict_(c, L, p, margin);
    stat[d.v] = (stat[d.v] || 0) + 1;
    if (d.fix === 'PAUSE' && autoStop) toPause.push(c);
    rows.push([c.name, L ? L.state : '없음', c.approved, (L && L.budget !== '') ? L.budget : c.daily, c.bid, c.nSku,
               p.im, p.ck, Math.round(p.cost), Math.round(p.sales), p.ord, p.sales > 0 ? p.cost / p.sales : '',
               d.v, d.why, false, c.cid, now]);
  }

  // 한도
  var cap = capInfo.cap, ratio = cap > 0 ? total / cap : 0;
  var capState = cap <= 0 ? '한도 없음' : ratio >= 1 ? '⛔ 초과' : ratio >= warnAt ? '⚠ 근접' : '정상';
  if (cap > 0 && ratio >= 1 && autoStop) {
    // 전부 멈춘다 — 켜져 있는 것 모두
    for (var k = 0; k < ours.length; k++) {
      var Lk = live[ours[k].cid];
      if (Lk && Lk.state === 'ENABLED' && toPause.indexOf(ours[k]) < 0) toPause.push(ours[k]);
    }
  }

  // 멈춘다
  var paused = [];
  if (toPause.length) {
    paused = adWatchPause_(token, toPause, cap > 0 && ratio >= 1
      ? '주간 한도 초과 (¥' + Math.round(total).toLocaleString() + ' / ¥' + Math.round(cap).toLocaleString() + ')'
      : '관제 자동 멈춤');
    for (var r2 = 0; r2 < rows.length; r2++) {
      if (paused.indexOf(rows[r2][0]) >= 0) { rows[r2][AW_STATE] = 'PAUSED'; rows[r2][AW_VERDICT] = rows[r2][AW_VERDICT] + ' → 멈춤'; }
    }
  }

  // 정렬: 심각한 것 위로
  var rank = function (v) { return v.indexOf('⛔') === 0 ? 0 : v.indexOf('⚠') === 0 ? 1 : v === '정상' ? 2 : v.indexOf('·') === 0 ? 3 : 4; };
  rows.sort(function (a, b) { var d0 = rank(a[AW_VERDICT]) - rank(b[AW_VERDICT]); return d0 !== 0 ? d0 : b[AW_COST] - a[AW_COST]; });

  var banner = rep.from + ' ~ ' + rep.to + ' (7일)  |  우리 캠페인 ' + ours.length + '개 · 켜짐 ' + onN +
               '  |  광고비 ¥' + Math.round(total).toLocaleString() +
               (cap > 0 ? ' / 한도 ¥' + Math.round(cap).toLocaleString() + ' (' + Math.round(ratio * 100) + '%) ' + capState
                        : ' / 한도 없음 ⚠') +
               '  |  한도 출처: ' + capInfo.src;
  var writeErr = '';
  try { adWatchWrite_(banner, rows, now); }
  catch (e3) {
    writeErr = String(e3).substring(0, 160);
    log_('ads', 'ERROR', '관제 표 쓰기 실패 (판정·멈춤은 끝남): ' + writeErr);
  }

  var statLine = Object.keys(stat).map(function (k) { return k + ' ' + stat[k]; }).join(' · ');
  log_('ads', paused.length || capState.indexOf('⛔') === 0 ? 'WARN' : 'INFO',
       '광고 관제 — ¥' + Math.round(total) + (cap > 0 ? '/' + Math.round(cap) : '') + ' · ' + statLine +
       (paused.length ? ' · 멈춤 ' + paused.length : ''));

  // 알림
  if (paused.length) {
    adWatchMailOnce_('paused', '광고 관제가 캠페인 ' + paused.length + '개를 멈췄습니다',
      banner + '\n\n멈춘 것:\n' + paused.join('\n') + '\n\n사유는 광고관제 탭 [사유] 칸에 있습니다.');
  } else if (capState === '⛔ 초과') {
    // 자동 멈춤을 꺼 둔 경우다 — 그럴수록 메일은 가야 한다
    adWatchMailOnce_('over', '광고비가 주간 한도를 넘었습니다 (자동 멈춤 꺼짐)',
      banner + '\n\n[한도 넘으면 자동 멈춤] 이 FALSE 라 멈추지 않았습니다. 직접 [전부 멈추기] 를 누르거나 광고기준에서 TRUE 로 바꾸세요.');
  } else if (capState === '⚠ 근접') {
    adWatchMailOnce_('warn', '광고비가 주간 한도의 ' + Math.round(ratio * 100) + '% 입니다',
      banner + '\n\n한도를 넘으면 자동으로 전부 멈춥니다. 한도는 광고기준 [주간 광고비 한도(JPY)] 에서 바꿉니다.');
  }
  return { banner: banner, paused: paused, statLine: statLine, writeErr: writeErr };
}

/** 캠페인을 멈추고, 계획 표의 결과 표시와 대장을 맞춘다. @return 멈춘 이름들 */
function adWatchPause_(token, list, why) {
  var done = [];
  for (var i = 0; i < list.length; i += 100) {
    var part = list.slice(i, i + 100);
    var res;
    try {
      res = adsApiRetry_(token, 'put', '/sp/campaigns',
        { campaigns: part.map(function (c) { return { campaignId: c.cid, state: 'PAUSED' }; }) },
        ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
    } catch (e) { log_('ads', 'ERROR', '관제 멈춤 실패: ' + String(e).substring(0, 160)); continue; }
    var box = (res && res.campaigns) || {}, succ = box.success || [];
    var okIds = {};
    for (var s = 0; s < succ.length; s++) okIds[String(succ[s].campaignId)] = true;
    for (var p = 0; p < part.length; p++) if (okIds[part[p].cid]) done.push(part[p]);
  }
  if (!done.length) return [];

  // 계획 표의 결과 칸에 '· 멈춤' 을 남긴다 — 켜기·맞추기가 이 표시를 본다.
  // 아마존은 이미 멈췄다. 여기서 시트가 늦어 터져도 그 사실은 로그에 남긴다
  log_('ads', 'WARN', '관제 멈춤 — ' + done.map(function (c) { return c.name; }).join(', ') + ' · ' + why);
  try {
  var sh = ss_().getSheetByName(SHEET_ADPLAN);
  if (sh) {
    var v = sh.getRange(2, AP_RESULT, sh.getLastRow() - 1, 1).getValues();
    var rowsOf = {};
    for (var d = 0; d < done.length; d++) rowsOf[done[d].row] = true;
    var dirty = false;
    for (var r = 0; r < v.length; r++) {
      if (!rowsOf[r + 2]) continue;
      var base = String(v[r][0]).replace(' ' + ADENABLE_MARK.ENABLED, '').replace(' ' + ADENABLE_MARK.PAUSED, '');
      v[r][0] = base + ' ' + ADENABLE_MARK.PAUSED; dirty = true;
    }
    if (dirty) sh.getRange(2, AP_RESULT, v.length, 1).setValues(v);
  }
  adLogWrite_(done.map(function (c) {
    return adLogRow_({ kind: '캠페인', camp: c.name, group: c.name, item: '상태', from: 'ENABLED', to: 'PAUSED',
      sum: '관제 멈춤 · ' + c.name, why: why, by: '관제(자동)', cid: c.cid });
  }));
  } catch (e2) { log_('ads', 'ERROR', '관제 멈춤 뒤 시트 기록 실패 (아마존은 멈춤): ' + String(e2).substring(0, 160)); }
  return done.map(function (c) { return c.name; });
}

/**
 * 표를 쓴다. 1행 요약 띠, 2행 머리글.
 *
 * 첫 실행에서 "스프레드시트 서비스가 타임아웃" 이 났다. 문서가 50탭 300만 셀이라
 * 시트 삽입·행 삽입·체크박스 삽입 같은 '구조를 바꾸는' 일이 한 번에 겹치면 무겁다.
 * 그래서 구조를 바꾸는 일은 시트가 없을 때 한 번만 하고, 평소에는 값만 쓴다.
 *   · 1000행 전체를 지우지 않고 지난번에 쓴 만큼만 지운다
 *   · 체크박스·머리글 메모는 처음 만들 때만 (값을 덮어써도 검증 규칙은 남는다)
 *   · 행이 모자랄 때만 늘린다 (캠페인 100개 안쪽이라 사실상 없다)
 */
function adWatchWrite_(banner, rows, now) {
  var W = ADWATCH_HEADER.length;
  var sh = ss_().getSheetByName(SHEET_ADWATCH);
  var fresh = false;
  if (!sh) { sh = ss_().insertSheet(SHEET_ADWATCH); fresh = true; }
  var need = rows.length + ADWATCH_ROW_HEADER;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  if (sh.getMaxColumns() < W) sh.insertColumnsAfter(sh.getMaxColumns(), W - sh.getMaxColumns());

  // 지난번에 쓴 범위만 비운다
  var used = sh.getLastRow();
  if (used > ADWATCH_ROW_HEADER) sh.getRange(ADWATCH_ROW_HEADER + 1, 1, used - ADWATCH_ROW_HEADER, W).clearContent();

  sh.getRange(1, 1).setValue(banner).setFontWeight('bold');
  sh.getRange(ADWATCH_ROW_HEADER, 1, 1, W).setValues([ADWATCH_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  if (rows.length) {
    fitRows_(SHEET_ADWATCH, ADWATCH_HEADER, rows);
    sh.getRange(ADWATCH_ROW_HEADER + 1, AW_CID + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(ADWATCH_ROW_HEADER + 1, 1, rows.length, W).setValues(rows);
    sh.getRange(ADWATCH_ROW_HEADER + 1, 12, rows.length, 1).setNumberFormat('0.0%');
  }
  // 체크박스는 이미 있으면 다시 안 넣는다 — 한 칸만 본다
  var hasBox = false;
  if (!fresh && rows.length) {
    try { var dv = sh.getRange(ADWATCH_ROW_HEADER + 1, AW_STOP + 1).getDataValidation(); hasBox = !!dv; } catch (e) {}
  }
  if (rows.length && !hasBox) {
    sh.getRange(ADWATCH_ROW_HEADER + 1, AW_STOP + 1, Math.max(rows.length, 200), 1).insertCheckboxes();
    sh.getRange(ADWATCH_ROW_HEADER + 1, AW_APPROVE + 1, Math.max(rows.length, 200), 1).insertCheckboxes();
  }
  if (fresh || !hasBox) {
    sh.setFrozenRows(ADWATCH_ROW_HEADER);
    headerNotes_(sh, ADWATCH_ROW_HEADER, ADWATCH_HEADER, {
      '아마존상태': '아마존이 지금 말하는 상태. 시트의 표시가 아니라 진짜 값이다.',
      '승인': '광고생성계획의 승인 칸. 여기서 바꿔도 반영되지 않는다 — 계획 표에서 바꾼다.',
      '판정': '⛔ = 자동으로 멈춘다 (한도 넘으면 자동 멈춤 이 TRUE 일 때)\n⚠ = 사람이 볼 것\n· = 참고',
      '멈춤': '체크한 뒤 [📣 광고 → 관제 표에서 체크한 캠페인 멈춤]. 여러 개를 한 번에.',
      '7일ACOS': '광고매출은 클릭 후 14일까지 붙는다. 최근 7일은 실제보다 높게 보인다.'
    });
  }
}

/** 메뉴: 관제 표에서 체크한 캠페인 멈춤 */
function pauseCheckedInWatch() {
  if (!adBusyGuard_('관제 멈춤')) return;
  var sh = ss_().getSheetByName(SHEET_ADWATCH);
  if (!sh || sh.getLastRow() <= ADWATCH_ROW_HEADER) {
    ui_().alert('관제 표가 없습니다.', '[🚦 광고 관제]를 먼저 실행하세요.', ui_().ButtonSet.OK);
    return;
  }
  var v = sh.getRange(ADWATCH_ROW_HEADER + 1, 1, sh.getLastRow() - ADWATCH_ROW_HEADER, ADWATCH_HEADER.length).getValues();
  var ours = adWatchOurs_(), byCid = {};
  for (var o = 0; o < ours.length; o++) byCid[ours[o].cid] = ours[o];
  var pick = [];
  for (var i = 0; i < v.length; i++) {
    if (v[i][AW_STOP] !== true) continue;
    var c = byCid[String(v[i][AW_CID] || '').trim()];
    if (c) pick.push(c);
  }
  if (!pick.length) { ui_().alert('체크한 줄이 없습니다.', '[멈춤] 칸을 체크한 뒤 다시 누르세요.', ui_().ButtonSet.OK); return; }
  var ok = ui_().alert('체크한 캠페인 멈춤', pick.length + '개를 멈춥니다:\n   ' +
    pick.map(function (c) { return c.name; }).join('\n   ') + '\n\n계속할까요?', ui_().ButtonSet.OK_CANCEL);
  if (ok !== ui_().Button.OK) return;
  var done = adWatchPause_(adsToken_(), pick, '관제 표에서 사람이 체크');
  toast_(done.length + '개 멈춤');
  refreshAdWatch();
}
