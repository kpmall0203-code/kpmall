/**
 * 72AB_확대후보.gs — 기존 광고에서 더 쓸 만한 상품 고르기 (EXPAND 1단계)
 *
 * ── 이 표가 답하는 질문 ─────────────────────────────────
 *   지금 광고 중인 상품 중 어느 것이 더 써도 되는가
 *   그렇게 말할 근거가 이 상품에 있기는 한가 (표본)
 *   지금 내는 값이 손익분기가 되려면 마진율이 몇이어야 하는가
 *
 * ── 마진율을 사람이 채울 수 있게 하는 것이 요점이다 ──────
 * 후보의 90%는 바깥 마진율 시트에도 없어 기본값으로 간다. 그 값이 틀린 상품이
 * 많다는 것을 사람이 안다 — 그래서 [마진율(%)] 칸을 비워 두지 않고 채워 주되,
 * 사람이 고쳐 적으면 그 값을 다시는 덮어쓰지 않는다.
 *
 * 사람이 고쳤는지는 [마진출처] 로 가리지 않는다. 마진율만 고치고 출처 칸은
 * 그대로 두는 것이 자연스럽고, 실제로 그렇게 하고 계신다. 그래서 [프로그램값(%)]
 * 칸에 '내가 그때 쓴 값' 을 남겨 두고, 지금 칸의 값이 그것과 다르면 사람이 고친 것으로
 * 본다. 그 줄은 [마진출처] 를 '사용자 입력' 으로 바꿔 두어 다음부터는 한눈에 보인다.
 * (프로그램값 칸이 없던 옛 표는, 지금 다시 셈한 값과 달라도 사람 것으로 친다.)
 *
 * ── 필요마진율: 가정 없이 볼 수 있는 하나의 숫자 ─────────
 *   필요마진율 = 실제 CPC ÷ (객단가 × 실제 주문율)
 * 지금 내는 값이 손익분기가 되는 마진율이다. 실제 마진이 이보다 높으면 이익이고,
 * 낮으면 지금도 밑지고 있다. 마진율을 몰라도 이 값은 계산된다 —
 * 그래서 사람이 "이 상품은 그만큼 안 남아" 라고 바로 판단할 수 있다.
 *
 * ── 언제 것을 세는가: 성숙한 날만 ───────────────────────
 * 아마존은 클릭한 날로부터 14일까지 주문을 그 클릭에 붙인다. 거기에 보고 지연
 * 이틀을 더해 16일이 지나야 그 날의 주문이 다 붙는다. 그 전 날짜를 함께 세면
 * 최근으로 올수록 주문이 없는 것처럼 보여, 잘 팔리는 상품을 '비용보호' 로 몰아
 * 입찰을 깎게 된다. 그래서 최근 16일은 아예 빼고, 그 앞의 성숙한 날 중
 * 최근 30일만 센다. 표의 [자료기간] 이 실제로 센 날을 말한다.
 *
 * 이 값들은 지출 원장(72R)이 쓰는 것과 같은 상수다 — 한 문서 안에서
 * 성숙의 뜻이 둘이면 안 된다.
 *
 * ── 이 표가 앞이다 ──────────────────────────────────────
 * 사람이 보는 표는 이것 하나다. 마진율을 적고, [판정]·[바꿀 것] 을 보고, [승인] 을 켠다.
 * 멈춤(72AD)·증액 시험(72AE)·감액의 셈이 전부 여기 한 줄에 모인다.
 * 그 뒤의 표들(멈춤후보·확대시험·확대결과)은 프로그램이 제 기록으로 쓰는 것이다.
 *
 * ── 여기서는 아무것도 바꾸지 않는다 ─────────────────────
 * 계산하고 표에 적을 뿐, 입찰·예산을 건드리지 않는다 (기획서 7.2).
 * 바꾸는 것은 [② 시작] 하나다.
 */

var SHEET_EXPAND = '광고확대후보';
var EXPAND_HEADER = [
  'SKU', 'ASIN', '상품명', '판매가(JPY)',
  '마진율(%)', '마진출처', '마진근거',
  '객단가(JPY)', '성숙클릭', '성숙주문', '광고비(JPY)', '광고매출(JPY)',
  '실제클릭비용(JPY)', '실제주문율(%)', '판단주문율(%)',
  '주문당공헌이익(JPY)', '손익분기클릭비용(JPY)', '목표클릭비용(JPY)', '여유배수',
  '필요마진율(%)', '분류', '사유', '자료기간',
  '판정', '바꿀 것', '승인', '결과', '프로그램값(%)', '실행자료'
];
var EX_SKU = 0, EX_ASIN = 1, EX_NAME = 2, EX_PRICE = 3, EX_MARGIN = 4, EX_MSRC = 5;
var EX_ACT = 23, EX_CHANGE = 24, EX_APPROVE = 25, EX_RESULT = 26;
var EX_PROG = 27;                   // 프로그램이 지난번에 낸 값 (사람이 고쳤는지 가리는 잣대)
var EX_EXEC = 28;                   // 시작할 때 쓰는 자료 (사람이 읽을 것은 아니다)
var EXPAND_APPROVE_COL = 26;        // 1부터

/**
 * 판정 = 이 상품에 지금 할 일. 분류(경제성)와 다르다 — 분류가 '확대검토' 라도
 * 손잡이가 없으면 판정은 '분리 필요' 이고, 시험이 돌고 있으면 '시험중' 이다.
 * 사람은 이 칸과 [바꿀 것] 만 보고 [승인] 을 켠다. 그것이 앞에서 할 일의 전부다.
 */
var EXA_TEST = '증액 시험';
var EXA_DOWN = '감액';
var EXA_CTRL = '대조군';
var EXA_RUNNING = '시험중';
var EXA_SPLIT = '분리 필요';
var EXA_KEEP = '유지';
var EXA_CEIL = '천장';              // 더 올릴 자리가 없다 — 여기가 이 상품의 최적점 근처다

/** 분류 (기획서 3.1) */
var EXC_GROW = '확대검토';
var EXC_HOLD = '현상유지';
var EXC_THIN = '근거부족';
var EXC_GUARD = '비용보호';
var EXC_WAIT = '자료대기';

/** 진입 바닥값 (기획서 3.2 · 8) */
var EXPAND_MIN_CLICKS = 50;
var EXPAND_MIN_ORDERS = 3;
var EXPAND_PRIOR = 50;              // 판단주문율의 사전클릭
var EXPAND_KEEP = 0.65;             // 이익보존계수 — 목표 CPC = 손익분기 × 이것
var EXPAND_ROOM = 1.10;             // 목표가 지금보다 이만큼 높아야 '확대검토'
var EXPAND_WINDOW_DAYS = 30;        // 성숙한 날 중 몇 일을 셀까

/**
 * 메뉴: 후보 표를 만들거나 새로 고친다.
 *
 * 사람이 적은 마진율은 그대로 두고, 나머지 칸만 다시 계산한다.
 */
function buildAdExpandCandidates(opts) {
  var made = makeOneSheet_([{ name: SHEET_EXPAND, header: EXPAND_HEADER }]);
  if (made) { if (!(opts && opts.quiet)) madeSheetStop_(made, '① 후보 찾기·확인'); return null; }

  var ash = ss_().getSheetByName(SHEET_ADS);
  if (!ash || ash.getLastRow() < 2) {
    if (opts && opts.quiet) return null;
    ui_().alert('광고 실적이 없습니다',
      '[📥 자료 받기 → 광고비 수집] 을 먼저 하세요.\n' +
      '"' + SHEET_ADS + '" 에 SKU × 날짜 실적이 있어야 후보를 셀 수 있습니다.',
      ui_().ButtonSet.OK);
    return;
  }

  // ① 사람이 적어 둔 마진율을 먼저 챙긴다 — 새로 고쳐도 그 값은 살린다.
  //    출처 칸이 아니라 '프로그램값' 과 견줘 가린다 (사람은 보통 숫자만 고친다).
  var sh = ss_().getSheetByName(SHEET_EXPAND);
  var keep = {}, oldProg = {}, keepAct = {};
  if (sh.getLastRow() > 1) {
    var wid = Math.max(sh.getLastColumn(), EXPAND_HEADER.length);
    var old = sh.getRange(2, 1, sh.getLastRow() - 1, wid).getValues();
    for (var o = 0; o < old.length; o++) {
      var k = String(old[o][EX_SKU] || '').trim();
      if (!k) continue;
      // 승인은 '같은 판정' 일 때만 살린다 — 멈춤을 승인했는데 감액으로 바뀌면 다시 봐야 한다
      keepAct[k] = { act: String(old[o][EX_ACT] || ''), ok: adRowApproved_(old[o][EX_APPROVE]),
                     res: String(old[o][EX_RESULT] || '') };
      var mv = Number(old[o][EX_MARGIN]);
      if (!(mv > 0)) continue;
      var pv = Number(old[o][EX_PROG]);
      if (String(old[o][EX_MSRC]) === MSRC_USER) keep[k] = mv;
      else if (pv > 0) { if (Math.abs(mv - pv) > 0.05) keep[k] = mv; }
      else oldProg[k] = mv;            // 프로그램값 칸이 없던 옛 표 — 아래에서 다시 셈해 견준다
    }
  }

  // ② 광고 실적을 SKU 로 모은다 — 성숙한 날만, 그중 최근 EXPAND_WINDOW_DAYS 일
  var perf = adPerfBySku_(EXPAND_WINDOW_DAYS);
  var agg = perf.sku, span = perf.span, last = perf.last;
  if (!perf.days) {
    if (!(opts && opts.quiet)) ui_().alert('셀 수 있는 날이 없습니다', adMatureHelp_(perf), ui_().ButtonSet.OK);
    return null;
  }

  // ③ 리스팅에서 이름·가격 (바깥 마진율 시트를 이름으로 맞대므로 일본어명이 필요하다)
  var info = {};
  var lsh = ss_().getSheetByName(SHEET_LISTING);
  if (lsh && lsh.getLastRow() > 1) {
    var lv = lsh.getRange(2, 1, lsh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var l = 0; l < lv.length; l++) {
      var s2 = String(lv[l][0] || '').trim();
      if (s2) info[s2] = { asin: String(lv[l][1] || ''), jp: String(lv[l][2] || ''),
                           price: Number(lv[l][6]) || 0 };
    }
  }

  // 표를 세울 때는 자료를 새로 읽는다 — 한 실행 안에서 확대·멈춤을 잇달아 세우면
  // 앞에서 들고 있던 낡은 마진(사람이 방금 적은 값이 빠진 것)을 쓰게 된다
  var ctx = adMarginCtx_(true);
  var pc = adExpandPlanCtx_();                 // 손잡이 · 예산 신호 · 돌고 있는 시험 · 정책
  var grow = adStopGrowSkus_();
  // 사전분포로 쓸 '전체 주문율' — 이 계정의 광고가 평균 몇 %나 주문으로 이어지나.
  // 클릭이 적은 상품의 주문율을 여기로 끌어당긴다 (아래 q 참고).
  var fleetCk = 0, fleetOd = 0;
  for (var fs in agg) { fleetCk += agg[fs].ck || 0; fleetOd += agg[fs].od || 0; }
  var fleet = fleetCk > 0 ? fleetOd / fleetCk : 0;

  var rows = [], cnt = {}, act = {}, push = [], nUser = 0, nSheet = 0, nCost = 0, nDef = 0;
  for (var sku2 in agg) {
    var a2 = agg[sku2], inf = info[sku2] || { asin: a2.asin, jp: '', price: 0 };
    var aov = a2.od > 0 ? a2.sales / a2.od : 0;
    var price = inf.price || aov;
    var refP = adRefPrice_(ctx, sku2, inf.asin || a2.asin);   // 기준값 시트가 정한 판매가
    if (refP > 0) price = refP;
    var pg = adMarginProgram_(ctx, sku2, price, inf.jp);      // 프로그램만으로 낸 값
    var mine = keep[sku2];
    // 옛 표(프로그램값 칸이 없던 것)는 지금 셈한 값과 달라야 사람이 고친 것으로 본다
    if (!(Number(mine) > 0) && oldProg[sku2] > 0 && Math.abs(oldProg[sku2] - pg.pct) > 0.05) {
      mine = oldProg[sku2];
    }
    var m = adMarginFor_(ctx, sku2, price, inf.jp, mine, inf.asin || a2.asin);
    if (m.src === MSRC_USER) {
      push.push({ sku: sku2, asin: inf.asin || a2.asin, name: inf.jp, margin: m.pct, price: 0 });
    }
    if (m.src === MSRC_USER || m.src === MSRC_REF || m.src === MSRC_REF_ASIN) nUser++;
    else if (m.src === MSRC_SHEET) nSheet++;
    else if (m.src === MSRC_COST || m.src === MSRC_LOSS) nCost++;
    else nDef++;

    var cpc = a2.ck > 0 ? a2.cost / a2.ck : 0;
    var real = a2.ck > 0 ? a2.od / a2.ck : 0;
    // 판단 주문율 — 클릭이 적으면 전체 주문율 쪽으로 끌어당긴다.
    // 끌어당기는 곳은 반드시 '그 상품 바깥의 값' 이어야 한다. 제 실측값으로 당기면
    //   (od + K×od/ck) ÷ (ck + K) = od/ck
    // 로 약분돼 아무 일도 일어나지 않는다 — 클릭 82회짜리 우연도 그대로 입찰이 된다.
    var q = fleet > 0 ? (a2.od + EXPAND_PRIOR * fleet) / (a2.ck + EXPAND_PRIOR) : real;
    var G = price * m.pct / 100;
    var be = G * q;
    var target = be * EXPAND_KEEP;
    var room = cpc > 0 ? target / cpc : 0;
    var need = (aov > 0 && real > 0) ? cpc / (aov * real) * 100 : 0;

    var cls, why;
    if (!a2.ck || !price) { cls = EXC_WAIT; why = '클릭이나 판매가를 모릅니다 — 자료를 채워야 셀 수 있습니다'; }
    else if (a2.ck < EXPAND_MIN_CLICKS || a2.od < EXPAND_MIN_ORDERS) {
      cls = EXC_THIN;
      why = '표본이 작습니다 (클릭 ' + Math.round(a2.ck) + '/' + EXPAND_MIN_CLICKS +
            ' · 주문 ' + Math.round(a2.od) + '/' + EXPAND_MIN_ORDERS + ') — 더 두고 봅니다';
    } else if (m.src === MSRC_LOSS) { cls = EXC_GUARD; why = m.why; }
    else if (room < 1) {
      cls = EXC_GUARD;
      why = '지금 내는 ¥' + (Math.round(cpc * 100) / 100) + ' 가 목표 ¥' +
            (Math.round(target * 100) / 100) + ' 보다 높습니다 — 늘릴 것이 아니라 줄일 자리입니다' +
            (m.src === MSRC_DEFAULT ? ' (마진율이 기본값이라 실제 마진을 적으면 달라질 수 있습니다)' : '');
    } else if (room >= EXPAND_ROOM) {
      cls = EXC_GROW;
      why = '지금 ¥' + (Math.round(cpc * 100) / 100) + ' → 목표 ¥' +
            (Math.round(target * 100) / 100) + ' (' + (Math.round(room * 10) / 10) + '배 여유). ' +
            '필요마진율 ' + (Math.round(need * 10) / 10) + '% — 실제 마진이 이보다 높으면 지금도 이익입니다';
    } else { cls = EXC_HOLD; why = '목표와 지금 값이 비슷합니다 — 올릴 근거가 약합니다'; }
    cnt[cls] = (cnt[cls] || 0) + 1;

    // 판정 — 이 상품에 지금 할 일
    var ac = adExpandAction_({ sku: sku2, asin: inf.asin || a2.asin, a: a2, m: m, price: price,
                               cls: cls, G: G, q: q, target: target, cpc: cpc,
                               dailyCost: a2.cost / EXPAND_WINDOW_DAYS }, pc, grow);
    act[ac.v] = (act[ac.v] || 0) + 1;
    var ka = keepAct[sku2] || {};
    var approved = (ka.ok && ka.act === ac.v && ac.exec) ? true : false;
    // [사유] 는 판정의 이유를 적는다. 분류(경제성)와 판정은 다를 수 있다 —
    // 클릭 139·주문 0 이면 분류는 '근거부족'(확대 표본이 얇다)이지만 판정은 '멈춤'이다.
    // 예전에는 분류 이유를 적어 대장에 "멈춤 · 확실 — 표본이 작습니다" 같은 엉뚱한 문장이 남았다.
    // 둘 다 남긴다 — 판정 이유("왜 멈추나")가 앞, 분류 이유("경제성이 어떤가")가 뒤.
    // 뒤엣것에는 마진율이 기본값이라 뒤집힐 수 있다는 경고 같은 것이 들어 있다.
    var reason = (ac.why && why && ac.why !== why) ? (ac.why + ' | ' + why) : (ac.why || why);
    // 멈춘 줄은 정말 멈췄는지 대조해 [결과] 뒤에 붙인다 (상품광고목록의 지금 상태로)
    var res = adStopCheck_(ka.res, pc.units[sku2], pc.unitAt);

    rows.push([sku2, inf.asin || a2.asin, String(inf.jp || '').substring(0, 60), Math.round(price),
      m.pct, m.src, m.why,
      Math.round(aov), Math.round(a2.ck), Math.round(a2.od), Math.round(a2.cost), Math.round(a2.sales),
      Math.round(cpc * 100) / 100, Math.round(real * 10000) / 100, Math.round(q * 10000) / 100,
      Math.round(G), Math.round(be * 100) / 100, Math.round(target * 100) / 100,
      cpc > 0 ? Math.round(room * 100) / 100 : '',
      need ? Math.round(need * 10) / 10 : '', cls, reason, span,
      ac.v, ac.change, approved, res, pg.pct, ac.exec ? JSON.stringify(ac.exec) : '']);
  }

  // 할 일이 있는 줄을 위로 (멈춤 → 증액 → 감액 → 시험중 → 대조군 → 분리 필요 → 나머지),
  // 그 안에서는 여유배수가 큰 순으로.
  // 순위가 0 인 것을 || 로 거르면 1등이 꼴찌가 된다 (0 은 거짓이다). undefined 만 뒤로 보낸다
  var order = {}; order[ASV_STOP] = 0; order[ASV_STOP_EV] = 1; order[EXA_TEST] = 2; order[EXA_DOWN] = 3;
  order[EXA_RUNNING] = 4; order[EXA_CTRL] = 5; order[EXA_SPLIT] = 6; order[EXA_CEIL] = 7; order[EXA_KEEP] = 8;
  var rank = function (v) { var r = order[v]; return r === undefined ? 9 : r; };
  rows.sort(function (x, y) {
    var d = rank(x[EX_ACT]) - rank(y[EX_ACT]);
    if (d) return d;
    return (Number(y[18]) || 0) - (Number(x[18]) || 0);
  });

  // 표에서 고친 값을 바깥 기준값 시트로 올린다 — 값이 한 곳에 모여야 잃지 않는다
  var pushed = { updated: 0, added: 0 };
  try { pushed = adRefPush_(push); } catch (e9) { log_('ads', 'WARN', '기준값 올리기 실패: ' + e9); }

  writeTable_(sh, EXPAND_HEADER, rows);
  sh.getRange(1, 1, 1, EXPAND_HEADER.length).setValues([EXPAND_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  if (rows.length) sh.getRange(2, EXPAND_APPROVE_COL, rows.length, 1).insertCheckboxes();
  adExpandNotes_(sh);
  if (opts && opts.quiet) return { rows: rows.length, act: act, cnt: cnt };
  showSheet_(SHEET_EXPAND);

  var todo = Object.keys(act).filter(function (k) { return order[k] !== undefined && order[k] <= 3; })
               .map(function (k) { return k + ' ' + act[k]; }).join(' · ');
  ui_().alert('① 후보 찾기·확인',
    '할 일 — ' + (todo || '없음') + '\n' +
    (act[EXA_SPLIT] ? '분리 필요 ' + act[EXA_SPLIT] + ' (몰아넣기 그룹 — 값을 따로 못 부름)\n' : '') +
    (act[EXA_RUNNING] ? '시험중 ' + act[EXA_RUNNING] + ' · ' : '') +
    (act[EXA_CTRL] ? '대조군 ' + act[EXA_CTRL] + '\n' : '\n') +
    adExpandGateText_(pc.pol) +
    '[판정] 과 [바꿀 것] 을 보고 [승인] 을 켜세요. 그 다음 [② 시작] 이 전부입니다.\n\n' +
    '상품 ' + rows.length + '개 · 센 기간 ' + span + '\n' +
    '상품 ' + rows.length + '개 · 센 기간 ' + span + '\n' +
    '(최근 ' + (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) + '일 ' + perf.young + '줄은 주문이 아직 다 안 붙어 뺐습니다' +
    (perf.old ? ' · 창 밖 ' + perf.old + '줄' : '') + ')\n' +
    Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ') + '\n\n' +
    (pushed.added || pushed.updated
      ? '표에서 고친 마진율 ' + (pushed.added + pushed.updated) + '개를 바깥 [' + AD_REF_TAB +
        '] 탭으로 옮겼습니다 (새로 ' + pushed.added + ' · 고침 ' + pushed.updated + ')\n\n' : '') +
    '마진율 출처 — 기준값·직접입력 ' + nUser + ' · 원가 계산 ' + nCost +
    ' · 마진율 시트 ' + nSheet + ' · 기본 ' + nDef + '\n\n' +
    (nDef ? '⚠ ' + nDef + '개는 기본 ' + ctx.def + '% 로 셌습니다. 실제 마진율을 아시면\n' +
            '   [마진율(%)] 칸에 적어 주세요 — 다시 눌러도 그 값은 지워지지 않습니다.\n' +
            '   그 상품이 이익인지 아닌지는 [필요마진율] 과 견주면 바로 보입니다.\n\n' : '') +
    '여기서는 아무것도 바꾸지 않았습니다. 계산해서 적었을 뿐입니다.',
    ui_().ButtonSet.OK);
}

function adExpandNotes_(sh) {
  headerNotes_(sh, 1, EXPAND_HEADER, {
    '마진율(%)': '광고 전 공헌이익 비율. 여기에 직접 적어도 되고 (다시 계산해도 안 지워집니다),\n' +
      '다음에 표를 세울 때 바깥 시트의 [' + AD_REF_TAB + '] 탭으로 옮겨 둡니다.\n' +
      '판매가를 고치려면 그 탭의 [판매가(JPY)] 칸에 적으세요 — 여기 판매가는 리스팅 값입니다.',
    '마진출처': MSRC_REF + ' > ' + MSRC_USER + ' > ' + MSRC_COST + ' > ' + MSRC_SHEET + ' > ' +
      MSRC_DEFAULT + ' 순서로 씁니다.\n' +
      '"' + MSRC_REF + '" 은 바깥 시트의 [' + AD_REF_TAB + '] 탭에 SKU(또는 ASIN)로 적어 둔 값입니다 —\n' +
      '거기가 원장이라, 이 표를 다시 세워도 그 값은 그대로입니다.\n' +
      '기본값이 많은 것이 정상입니다 — 바깥 시트는 일본어 상품명이 정확히 같을 때만 붙습니다.',
    '필요마진율(%)': '= 실제 클릭비용 ÷ (객단가 × 실제 주문율).\n' +
      '지금 내는 값이 손익분기가 되는 마진율입니다. 마진율을 몰라도 계산됩니다 —\n' +
      '실제 마진이 이보다 높으면 지금도 이익이고, 낮으면 지금도 밑지고 있습니다.',
    '판단주문율(%)': '= (성숙 주문 + ' + EXPAND_PRIOR + ' × 전체 주문율) ÷ (성숙 클릭 + ' + EXPAND_PRIOR + ').\n' +
      '표본이 작을 때 한두 건의 우연이 입찰을 흔들지 않게, 계정 전체 평균 쪽으로 눌러 줍니다.\n' +
      '클릭이 ' + EXPAND_PRIOR + '회면 반반, ' + (EXPAND_PRIOR * 4) + '회면 실측이 8할입니다.',
    '목표클릭비용(JPY)': '= 손익분기 × ' + EXPAND_KEEP + ' (이익보존계수).\n' +
      '손익분기까지 다 쓰지 않고 일부를 이익으로 남깁니다.',
    '여유배수': '= 목표 ÷ 지금 내는 값. 1보다 크면 더 낼 수 있고, 작으면 지금이 과합니다.',
    '분류': EXC_GROW + ' = 표본도 있고 여유도 있음 (여유배수 ' + EXPAND_ROOM + '배 이상)\n' +
      EXC_HOLD + ' = 목표와 지금이 비슷함\n' +
      EXC_GUARD + ' = 지금이 목표보다 높음 — 줄일 자리\n' +
      EXC_THIN + ' = 클릭 ' + EXPAND_MIN_CLICKS + ' · 주문 ' + EXPAND_MIN_ORDERS + ' 미만\n' +
      EXC_WAIT + ' = 자료가 모자라 셀 수 없음',
    '판정': '이 상품에 지금 할 일.\n' +
      ASV_STOP + ' / ' + ASV_STOP_EV + ' = 안 팔리는데 돈 쓰는 것 → 그 상품의 광고만 멈춤\n' +
      EXA_TEST + ' = 값을 10% 올려 14일 시험 (끝나면 되돌리고 대조군과 견줌)\n' +
      EXA_DOWN + ' = 지금 값이 목표보다 높음 → 바로 내림 (시험 불필요)\n' +
      EXA_CTRL + ' = 견주려고 일부러 안 바꾸는 상품 (회차마다 바뀜)\n' +
      EXA_SPLIT + ' = 몰아넣기 그룹이라 값을 따로 못 부름 · ' + EXA_CEIL + ' = 더 올릴 자리 없음',
    '바꿀 것': '무엇을 얼마에서 얼마로. [승인] 을 켜면 [② 시작] 때 이대로 나갑니다.',
    '승인': '켜면 [② 시작] 때 이 줄의 [바꿀 것] 이 나갑니다. 다시 계산해도 판정이 같으면 켜 둔 것이 남습니다.',
    '프로그램값(%)': '프로그램이 스스로 낸 마진율 (원가·바깥 시트·기본값). 고치지 마세요 —\n' +
      '[마진율(%)] 이 이 값과 다르면 "사람이 고친 것" 으로 보고 그 값을 지키는 잣대입니다.',
    '자료기간': '실제로 센 날. 주문은 클릭한 날로부터 ' + SPEND_ATTRIB_DAYS + '일까지 붙고 보고가 ' +
      SPEND_REPORT_LAG_DAYS + '일 늦어서, 최근 ' + (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) +
      '일은 세지 않습니다 — 그 날들을 함께 세면 잘 팔리는 상품이 "안 팔린다" 로 보입니다.\n' +
      '그 앞의 성숙한 날 중 최근 ' + EXPAND_WINDOW_DAYS + '일을 씁니다. 기간이 짧으면 ' +
      '[광고비 수집] 으로 그 앞 기간을 더 받아 두세요.'
  });
}


// ── 성숙한 날만 세기 (확대·멈춤이 같은 창을 쓴다) ────────
//
// 아마존은 클릭한 날로부터 14일까지 주문을 그 클릭에 붙이고, 보고가 이틀 늦다.
// 그래서 최근 16일은 '아직 안 팔린 것' 이 아니라 '아직 모르는 것' 이다.
// 확대 후보와 멈춤 후보가 서로 다른 창을 쓰면, 한쪽은 늘리라 하고 다른 쪽은
// 멈추라 하는 일이 생긴다 — 그래서 창을 만드는 곳을 하나로 둔다.

/** 성숙한 날의 창. @return {{from:string, to:string}} */
function adMatureWindow_(days) {
  var to = addDays_(ymd_(new Date()), -(SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS));
  return { from: addDays_(to, -((days || EXPAND_WINDOW_DAYS) - 1)), to: to };
}

/**
 * 광고실적을 SKU 로 모은다 (성숙한 날만).
 * @return {{sku:Object, days:number, span:string, last:string, young:number, old:number,
 *           from:string, to:string}}
 */
function adPerfBySku_(days) {
  var w = adMatureWindow_(days);
  var out = { sku: {}, days: 0, span: '', last: '', young: 0, old: 0, from: w.from, to: w.to };
  var ash = ss_().getSheetByName(SHEET_ADS);
  if (!ash || ash.getLastRow() < 2) return out;
  var av = ash.getRange(2, 1, ash.getLastRow() - 1, ADS_HEADER.length).getValues();
  var seen = {};
  for (var i = 0; i < av.length; i++) {
    var sku = String(av[i][1] || '').trim();
    if (!sku) continue;
    var d = av[i][0] instanceof Date ? ymd_(av[i][0]) : String(av[i][0] || '').substring(0, 10);
    if (d > out.last) out.last = d;
    if (d > w.to) { out.young++; continue; }
    if (d < w.from) { out.old++; continue; }
    seen[d] = true;
    var a = out.sku[sku] || (out.sku[sku] = { asin: String(av[i][2] || ''),
      im: 0, ck: 0, od: 0, cost: 0, sales: 0 });
    a.im += Number(av[i][6]) || 0;
    a.ck += Number(av[i][7]) || 0;
    a.od += Number(av[i][8]) || 0;
    a.cost += Number(av[i][4]) || 0;
    a.sales += Number(av[i][5]) || 0;
  }
  out.days = Object.keys(seen).length;
  out.span = out.days ? (w.from + '~' + w.to + ' · ' + out.days + '일') : '';
  return out;
}

/** 성숙한 날이 없을 때 무엇을 해야 하는지 */
function adMatureHelp_(perf) {
  return '광고실적에 성숙한 날짜가 없습니다 (마지막 자료 ' + (perf.last || '없음') + ').\n\n' +
    '주문은 클릭한 날로부터 ' + SPEND_ATTRIB_DAYS + '일까지 그 클릭에 붙고, 보고가 ' +
    SPEND_REPORT_LAG_DAYS + '일 늦습니다.\n' +
    '그래서 최근 ' + (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) + '일은 세지 않습니다 — ' +
    '지금 세려면 ' + perf.to + ' 이전 날짜가 있어야 합니다.\n\n' +
    '[📥 자료 받기 → 광고비 수집] 에서 그 앞 기간을 한 번 더 받아 주세요.';
}


/**
 * 사람이 [광고확대후보] 표에 적어 둔 마진율. SKU → %.
 *
 * 마진을 묻는 곳은 전부 여기를 거친다 (72AA 가 문맥에 싣는다). 그래야
 * 확대 후보에 적은 값이 멈춤 후보·트랙 B 추천에도 그대로 쓰인다.
 *
 * 사람 것인지 가리는 잣대는 두 가지다 — [마진출처] 가 '사용자 입력' 이거나,
 * [마진율] 이 [프로그램값] 과 다르거나. 뒤엣것이 중요하다: 사람은 보통 숫자만 고치고
 * 출처 칸은 그대로 두기 때문이다.
 */
function adUserMarginMap_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_EXPAND);
  if (!sh || sh.getLastRow() < 2) return out;
  var wid = Math.max(sh.getLastColumn(), EXPAND_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, wid).getValues();
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][EX_SKU] || '').trim();
    var m = Number(v[i][EX_MARGIN]);
    if (!sku || !(m > 0) || m >= 100) continue;
    var prog = Number(v[i][EX_PROG]);
    if (String(v[i][EX_MSRC]) === MSRC_USER) out[sku] = m;
    else if (prog > 0 && Math.abs(m - prog) > 0.05) out[sku] = m;
  }
  return out;
}


/**
 * 아무 기간이나 물어볼 수 있게 광고실적을 한 번만 읽어 둔다.
 *
 * 시험 전후를 견주려면 '이 SKU 의 이 날짜부터 저 날짜까지' 를 여러 번 물어야 한다.
 * 그때마다 표를 다시 읽으면 2만 5천 줄을 시험 수만큼 훑게 된다.
 *
 * @return {function(string,string,string):{im,ck,od,cost,sales,days}} (sku, from, to)
 */
function adPerfWindow_() {
  var idx = {};
  var ash = ss_().getSheetByName(SHEET_ADS);
  if (ash && ash.getLastRow() > 1) {
    var v = ash.getRange(2, 1, ash.getLastRow() - 1, ADS_HEADER.length).getValues();
    for (var i = 0; i < v.length; i++) {
      var sku = String(v[i][1] || '').trim();
      if (!sku) continue;
      var d = v[i][0] instanceof Date ? ymd_(v[i][0]) : String(v[i][0] || '').substring(0, 10);
      if (!d) continue;
      (idx[sku] || (idx[sku] = [])).push({ d: d, im: Number(v[i][6]) || 0, ck: Number(v[i][7]) || 0,
                                           od: Number(v[i][8]) || 0,
                                           cost: Number(v[i][4]) || 0, sales: Number(v[i][5]) || 0 });
    }
  }
  return function (sku, from, to) {
    var a = idx[sku] || [], o = { im: 0, ck: 0, od: 0, cost: 0, sales: 0, days: 0 };
    for (var i = 0; i < a.length; i++) {
      if (a[i].d < from || a[i].d > to) continue;
      o.im += a[i].im; o.ck += a[i].ck; o.od += a[i].od;
      o.cost += a[i].cost; o.sales += a[i].sales; o.days++;
    }
    return o;
  };
}


/**
 * 이 상품에 지금 할 일 — 멈춤 · 증액 시험 · 감액 · 대조군 · 시험중 · 분리 필요 · 천장 · 유지.
 *
 * 멈춤은 72AD 의 셈, 증액은 72AE 의 셈을 그대로 부른다. 감액만 여기서 낸다 —
 * 값을 내리는 것은 시험이 필요 없다 (기획서 4.3: 보호 감액은 예외).
 *
 * @return {{v:string, change:string, exec:Object|null, why:string}}
 */
function adExpandAction_(c, pc, grow) {
  var u = pc.units[c.sku];
  var sv = adStopVerdict_(c.a, c.m, c.price, u, !!grow[c.sku]);
  if (adStopCanStop_(sv.v)) {
    return { v: sv.v, change: '광고 ' + sv.ids.length + '개 멈춤', why: sv.why,
             exec: { k: 'stop', ids: sv.ids, camp: u && u.ads.length ? u.ads[0].camp : '' } };
  }
  if (grow[c.sku]) return { v: EXA_KEEP, change: '', why: sv.why, exec: null };
  if (pc.busy[c.sku]) return { v: EXA_RUNNING, change: '', why: '시험이 돌고 있습니다 (' + pc.busy[c.sku] + ')', exec: null };

  if (c.cls === EXC_GROW) {
    var o = adExpandPlanOne_({ sku: c.sku, asin: c.asin, G: c.G, q: c.q, dailyCost: c.dailyCost }, pc);
    if (o.skip) return { v: EXA_KEEP, change: '', why: o.state, exec: null };
    if (o.type === XTYPE_SPLIT) {
      // 승격으로 풀 수 있다 — 목표 CPC 가 비슷한 것끼리 가격선 캠페인으로 꺼낸다
      var bd = adPromoBand_(c.target, pc.pol.base, pc.pol.mult);
      return { v: EXA_SPLIT,
               change: bd ? '가격선 ¥' + bd.lo + ' 캠페인으로 꺼냄' : '',
               why: o.why, exec: bd ? { k: 'split', lo: bd.lo } : null };
    }
    if (o.state === XS_CANCEL) return { v: EXA_CEIL, change: '', why: o.why, exec: null };
    if (o.arm === XARM_CTRL) {
      return { v: EXA_CTRL, change: '그대로 ¥' + o.from, why: o.why,
               exec: { k: 'ctrl', c: { sku: c.sku, asin: c.asin, G: c.G, q: c.q, dailyCost: c.dailyCost } } };
    }
    return { v: EXA_TEST,
             change: (o.type === XTYPE_BUDGET ? '일예산 ' : '입찰 ') + '¥' + o.from + ' → ¥' + o.to +
                     ' (' + pc.pol.runDays + '일 시험)',
             why: o.why,
             exec: { k: 'test', c: { sku: c.sku, asin: c.asin, G: c.G, q: c.q, dailyCost: c.dailyCost } } };
  }
  if (c.cls === EXC_GUARD && c.cpc > 0) {
    var res = adExpandResource_(c.sku, pc.units, pc.grp);
    if (!res.own) {
      return { v: EXA_KEEP, change: '',
               why: '줄일 자리지만 몰아넣기 그룹이라 이 상품만 값을 내릴 수 없습니다 — 멈출 근거가 서면 멈춤으로 옵니다',
               exec: null };
    }
    if (!(res.bid > 0)) return { v: EXA_KEEP, change: '', why: '지금 값을 모릅니다 (광고 자료 갱신)', exec: null };
    // 목표를 향해 한 계단 — 한 번에 20% 까지만 (72V 의 인하 폭과 같다)
    var to = Math.max(c.target, res.bid * (1 - JOB_DOWN_PCT));
    to = Math.max(EXTEST_MIN_BID, Math.round(to * 100) / 100);
    if (!(to < res.bid - 0.005)) return { v: EXA_KEEP, change: '', why: '이미 목표 언저리입니다', exec: null };
    return { v: EXA_DOWN, change: '입찰 ¥' + res.bid + ' → ¥' + to,
             why: '지금 ¥' + (Math.round(c.cpc * 100) / 100) + ' 는 목표 ¥' + (Math.round(c.target * 100) / 100) +
                  ' 보다 높습니다. 내리는 것은 시험이 필요 없어 바로 합니다 (한 번에 ' +
                  Math.round(JOB_DOWN_PCT * 100) + '% 까지)',
             exec: { k: 'down', rid: res.gid || res.rid, rname: res.rname, from: res.bid, to: to } };
  }
  if (c.cls === EXC_HOLD) {
    // 목표와 지금 값이 비슷하다 — 더 올려도 이익이 늘 자리가 없다. 여기가 이 상품의 천장이다
    return { v: EXA_CEIL, change: '',
             why: '지금 값이 목표 언저리입니다 (여유 10% 미만). 순이익이 더 안 느는 자리 — 그대로 둡니다',
             exec: null };
  }
  return { v: EXA_KEEP, change: '', why: '', exec: null };
}


/**
 * 멈췄다고 적힌 줄이 정말 멈췄는지 대조한다.
 *
 * 보낸 것과 실제로 그렇게 된 것은 다르다 — 아마존이 안 받았을 수도, 누가 다시 켰을 수도 있다.
 * 상품광고목록의 지금 상태(마지막 수집 기준)로 견주어 [결과] 뒤에 한 마디 붙인다.
 * 켜진 광고가 하나도 없으면 확인된 것이고, 남아 있으면 몇 개가 아직 켜져 있는지 적는다.
 *
 * @param {string} res   지난 [결과] 칸
 * @param {Object} u     adUnitMap_ 의 그 SKU 항목
 * @param {string} at    상품광고목록을 언제 받았나
 * @return {string} 새 [결과] 칸
 */
function adStopCheck_(res, u, at) {
  var base = String(res || '').split(' · 확인')[0].split(' · ⚠')[0];
  if (!base || base.indexOf('멈춤') !== 0) return base;
  if (!u) return base;                       // 목록에 없으면 말할 것이 없다
  var when = at ? ' (' + at + ' 자료)' : '';
  return u.on > 0
    ? base + ' · ⚠ 아직 켜짐 ' + u.on + '개' + when
    : base + ' · 확인 O' + when;
}
