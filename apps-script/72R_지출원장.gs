/**
 * 72R_지출원장.gs — 캠페인 일별 지출 원장과 손실 계산
 *
 * ── 왜 원장이 하나여야 하나 ─────────────────────────────
 * 광고비는 지금 여러 표에 흩어져 있다 (광고실적은 SKU별, 광고관제는 7일 합계,
 * 육성 판정은 그때그때 리포트). 이것들을 서로 더하면 같은 돈을 두 번 센다.
 * 예산 관제가 보는 지출은 하나여야 한다 — 캠페인 일별 실적, 그것 하나다.
 *
 * ── 손실은 광고비에서 검증된 이익을 뺀 것이다 ───────────
 * 옛 식은 '주간광고비 = 주간허용손해 × r ÷ (r−1)' 이었다. 그것은 실제 CPC 가
 * 계산대로이고 실제 전환율이 목표대로일 때의 시나리오 값이다. 주문이 0이면
 * 손실은 광고비 전액이다. 실제로 지금 육성 3상품은 주간허용손해 4,500엔으로
 * 주간광고비 13,500엔이 잡혀 있는데, 주문이 0이면 한 주에 13,500엔을 잃는다 —
 * 승인한 것의 세 배다. 그래서 손실은 시나리오가 아니라 실측으로 센다.
 *
 *   기간 손실        = 기간 광고비 − 그 기간에 귀속한 공헌이익
 *   기간 위험평가손실 = max(0, 기간 광고비 − 성숙·검증된 공헌이익)
 *   남은 안전지출여력 = min(지출한도 − 쓴 광고비, 손실한도 − 위험평가손실)
 *                      − 미집계지출 준비액
 *
 * 위험평가에서 음수 손실(즉 이익)로 한도를 늘리지 않는다. 아직 안 익은 매출로
 * 손실을 깎지 않는다 — 그것은 아직 오지 않은 돈이다.
 *
 * ── 미집계지출 준비액 ───────────────────────────────────
 * 리포트는 늦게 온다. 마지막 자료일 이후에도 광고는 돌았다. 그 사이 쓴 돈을
 * 0으로 보면 한도를 넘긴 채로 '아직 여유 있음' 이라고 말하게 된다.
 * 마지막 자료일부터 오늘까지 × 활성 일예산 × 초과지출계수로 미리 떼어 둔다.
 * 아마존 일예산은 평균값이라 하루 지출이 더 클 수 있어 계수는 1보다 크다.
 */

var SHEET_SPENDDAY = '광고캠페인일별';
var SPENDDAY_HEADER = ['날짜', '캠페인ID', '캠페인', '노출', '클릭',
                       '광고비(JPY)', '광고매출(JPY)', '주문',
                       '귀속기간', '성숙', '수집일시'];
var SPENDDAY_ID_COLS = [2];          // 1부터 — 캠페인ID 는 글자로

var SPEND_ATTRIB_DAYS = 14;          // 쓰는 리포트 칸이 purchases14d · sales14d 다
var SPEND_REPORT_LAG_DAYS = 2;       // 보고 지연 여유
var SPEND_FETCH_DAYS = 35;           // 한 번에 받을 날짜 수
var SPEND_OVERSPEND_MULT = 1.25;     // 아마존 일예산은 평균값 — 하루 지출이 더 클 수 있다
var PROP_SPENDDAY_REPORT = 'SPENDDAY_REPORT_ID';
var SPENDDAY_REPORT_WAIT_MS = 90 * 1000;

/** 성숙 판정 — 클릭일 + 귀속기간 + 보고 지연이 지났나 */
function adSpendMature_(ymd, todayYmd) {
  if (!ymd) return false;
  return daysBetween_(ymd, todayYmd) >= (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS);
}

/** 그 날짜가 든 주의 월요일 (주간 경계는 월요일 00:00 기준) */
function weekStart_(ymd) {
  var p = String(ymd).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  var dow = d.getDay();                  // 0=일요일
  var back = (dow === 0) ? 6 : dow - 1;   // 월요일까지 며칠 뒤로
  d.setDate(d.getDate() - back);
  return ymd_(d);
}

/**
 * 메뉴: 캠페인 일별 지출을 받아 원장에 넣는다.
 *
 * 같은 날짜는 갈아끼운다 — 최근 날짜는 귀속이 아직 붙는 중이라 값이 자란다.
 * 그래서 매번 최근 구간을 통째로 다시 받아 바꾼다.
 */
function fetchAdSpendDaily() {
  if (!adBusyGuard_('지출 원장 수집')) return;
  var made = makeOneSheet_([{ name: SHEET_SPENDDAY, header: SPENDDAY_HEADER }]);
  if (madeSheetStop_(made, '지출 원장 수집')) return;
  var to = ymd_(new Date(Date.now() - 86400000));           // 어제까지
  var from = addDays_(to, -(SPEND_FETCH_DAYS - 1));

  var saved = ADS_SOFT_MS;
  ADS_SOFT_MS = SPENDDAY_REPORT_WAIT_MS;
  var rep;
  try {
    rep = adsRunReport_(adsToken_(), PROP_SPENDDAY_REPORT,
      { adProduct: 'SPONSORED_PRODUCTS', groupBy: ['campaign'],
        columns: ['date'].concat(ADCAMP_COLS),
        reportTypeId: ADCAMP_REPORT_TYPE, timeUnit: 'DAILY', format: 'GZIP_JSON' },
      from, to, '지출원장');
  } finally { ADS_SOFT_MS = saved; }
  if (rep === null) {
    ui_().alert('지출 원장 — 리포트 준비 중',
      '아마존이 실적을 만들고 있습니다 (오류 아님).\n1~2분 뒤 다시 누르면 이어받습니다.',
      ui_().ButtonSet.OK);
    return;
  }

  var today = ymd_(new Date()), now = new Date();
  var fresh = [], nMature = 0;
  for (var i = 0; i < rep.length; i++) {
    var r = rep[i];
    var d = String(r.date || '').substring(0, 10);
    var cid = String(r.campaignId || '');
    if (!d || !cid) continue;
    var mature = adSpendMature_(d, today);
    if (mature) nMature++;
    fresh.push([d, cid, String(r.campaignName || ''),
                Number(r.impressions) || 0, Number(r.clicks) || 0,
                Math.round(Number(r.cost) || 0), Math.round(Number(r.sales14d) || 0),
                Number(r.purchases14d) || 0,
                SPEND_ATTRIB_DAYS + '일', mature ? '성숙' : '잠정', now]);
  }

  // 받은 구간의 옛 줄을 빼고 새 줄을 넣는다 (덧붙이기 + 그 구간만 갈아끼움)
  var sh = ss_().getSheetByName(SHEET_SPENDDAY);
  var keep = [];
  if (sh.getLastRow() > 1) {
    var old = sh.getRange(2, 1, sh.getLastRow() - 1, SPENDDAY_HEADER.length).getValues();
    for (var o = 0; o < old.length; o++) {
      var od = old[o][0] instanceof Date ? ymd_(old[o][0]) : String(old[o][0] || '').substring(0, 10);
      if (!od) continue;
      if (od >= from && od <= to) continue;      // 이번에 다시 받은 구간
      keep.push(old[o]);
    }
  }
  var rows = keep.concat(fresh);
  rows.sort(function (a, b) {
    var ad = a[0] instanceof Date ? ymd_(a[0]) : String(a[0]);
    var bd = b[0] instanceof Date ? ymd_(b[0]) : String(b[0]);
    return ad < bd ? 1 : (ad > bd ? -1 : 0);      // 최근이 위로
  });

  var need = Math.max(rows.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  for (var c = 0; c < SPENDDAY_ID_COLS.length; c++) {
    sh.getRange(2, SPENDDAY_ID_COLS[c], need - 1, 1).setNumberFormat('@');
  }
  writeTable_(sh, SPENDDAY_HEADER, rows);
  notesByName_(sh, {
    '광고매출(JPY)': '클릭일 기준으로 귀속한 매출. 귀속기간 칸의 날 수만큼 뒤늦게 붙는다.',
    '성숙': '"성숙" 은 귀속기간(' + SPEND_ATTRIB_DAYS + '일) + 보고 지연(' +
            SPEND_REPORT_LAG_DAYS + '일)이 지나 값이 더 안 자라는 날.\n' +
            '"잠정" 은 아직 자라는 중 — 이 매출로 손실을 깎지 않는다.',
    '귀속기간': '이 줄이 어느 귀속기간의 값인가. 서로 다른 기간을 섞어 더하지 않는다.'
  });

  var msg = '지출 원장 — ' + from + '~' + to + ' · ' + fresh.length.toLocaleString() +
            '줄 (성숙 ' + nMature.toLocaleString() + ') · 표 ' + rows.length.toLocaleString() + '줄';
  log_('ads', 'INFO', msg);
  showSheet_(SHEET_SPENDDAY);
  ui_().alert('지출 원장', msg + '\n\n' +
    '이 표 하나가 예산 관제의 지출 기준입니다. 다른 표의 광고비와 더하지 마세요 —\n' +
    '같은 돈을 두 번 세게 됩니다.', ui_().ButtonSet.OK);
}

/** 원장을 읽어 캠페인ID별·날짜별로 (시트만 읽는다) */
function adSpendRead_() {
  var out = { rows: [], last: '', has: false };
  var sh = ss_().getSheetByName(SHEET_SPENDDAY);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, SPENDDAY_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var d = v[i][0] instanceof Date ? ymd_(v[i][0]) : String(v[i][0] || '').substring(0, 10);
    var cid = String(v[i][1] || '').trim();
    if (!d || !cid) continue;
    out.rows.push({ d: d, cid: cid, im: Number(v[i][3]) || 0, ck: Number(v[i][4]) || 0,
                    cost: Number(v[i][5]) || 0, sales: Number(v[i][6]) || 0,
                    ord: Number(v[i][7]) || 0,
                    mature: String(v[i][9]) === '성숙' });
    if (d > out.last) out.last = d;
  }
  out.has = out.rows.length > 0;
  return out;
}

/**
 * 캠페인 묶음의 기간 합계.
 * 성숙한 것과 전부를 따로 센다 — 손실은 성숙한 이익으로만 깎는다.
 * @param {Object} led  adSpendRead_() 결과
 * @param {Object} cidSet  {캠페인ID: true}
 */
function adSpendSum_(led, cidSet, from, to) {
  var s = { cost: 0, sales: 0, ord: 0, ck: 0, im: 0,
            matureCost: 0, matureSales: 0, matureOrd: 0, matureCk: 0, days: {} };
  for (var i = 0; i < led.rows.length; i++) {
    var r = led.rows[i];
    if (!cidSet[r.cid]) continue;
    if (from && r.d < from) continue;
    if (to && r.d > to) continue;
    s.cost += r.cost; s.sales += r.sales; s.ord += r.ord; s.ck += r.ck; s.im += r.im;
    s.days[r.d] = true;
    if (r.mature) {
      s.matureCost += r.cost; s.matureSales += r.sales;
      s.matureOrd += r.ord; s.matureCk += r.ck;
    }
  }
  return s;
}

/**
 * 손실 원장 한 벌.
 *
 * @param {Object} s        adSpendSum_ 결과
 * @param {number} margin   유효 마진율 (0~1)
 * @param {number} spendCap 기간 지출한도 (0 이면 안 정함)
 * @param {number} lossCap  기간 손실한도 (0 이면 안 정함)
 * @param {number} pending  미집계지출 준비액
 */
function adLossLedger_(s, margin, spendCap, lossCap, pending) {
  var profit = s.sales * margin;                 // 귀속 매출의 공헌이익 (전부)
  var matureProfit = s.matureSales * margin;     // 그중 성숙한 것
  var loss = s.cost - profit;                    // 음수일 수 있다 (= 이익)
  // 위험평가는 성숙한 이익만 인정한다. 아직 안 익은 매출로 손실을 깎지 않는다
  var risk = Math.max(0, s.cost - matureProfit);
  var leftSpend = spendCap > 0 ? spendCap - s.cost : -1;
  var leftLoss = lossCap > 0 ? lossCap - risk : -1;
  var room;
  if (leftSpend < 0 && leftLoss < 0) room = -1;              // 둘 다 안 정함
  else if (leftSpend < 0) room = leftLoss;
  else if (leftLoss < 0) room = leftSpend;
  else room = Math.min(leftSpend, leftLoss);
  if (room >= 0) room = room - (pending || 0);
  return {
    cost: s.cost, sales: s.sales, ord: s.ord, profit: profit,
    matureProfit: matureProfit, loss: loss, risk: risk,
    leftSpend: leftSpend, leftLoss: leftLoss,
    pending: pending || 0,
    room: room,                       // -1 = 한도를 안 정해 계산할 수 없음
    over: (spendCap > 0 && s.cost >= spendCap) || (lossCap > 0 && risk >= lossCap)
  };
}

/**
 * 미집계지출 준비액 — 마지막 자료일 이후 아직 안 잡힌 지출.
 * 자료가 아예 없으면 계산할 수 없다 (null) — 그때는 증액·활성화를 막아야 한다.
 */
function adPendingSpend_(lastYmd, dailyBudget, todayYmd) {
  if (!lastYmd) return null;
  var gap = daysBetween_(lastYmd, todayYmd);      // 마지막 자료일 다음 날부터 오늘까지
  if (gap <= 0) return 0;
  return Math.round((dailyBudget || 0) * gap * SPEND_OVERSPEND_MULT);
}

/**
 * 판단전환율 — 표본이 적을 때 초기 추정으로 끌어당기고, 쌓이면 실제값에 수렴한다.
 * 클릭 1회 주문 1건을 100% 로 받아 과입찰하는 것을 막는다.
 *
 *   판단 = (성숙 주문 + 사전클릭 × 초기추정) ÷ (성숙 클릭 + 사전클릭)
 */
var CVR_PRIOR_CLICKS = 50;           // 사전클릭 수. 광고기준에서 바꾼다

function adBlendedCvr_(matureOrd, matureCk, priorCvr, priorClicks) {
  var pc = (priorClicks === undefined || priorClicks === null) ? CVR_PRIOR_CLICKS : priorClicks;
  var p = Number(priorCvr) || 0;
  var den = (Number(matureCk) || 0) + pc;
  if (den <= 0) return { cvr: p, actual: null, n: 0 };
  var cvr = ((Number(matureOrd) || 0) + pc * p) / den;
  var actual = (Number(matureCk) || 0) > 0 ? (Number(matureOrd) || 0) / matureCk : null;
  return { cvr: cvr, actual: actual, n: Number(matureCk) || 0 };
}
