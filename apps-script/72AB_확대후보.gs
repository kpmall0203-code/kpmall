/**
 * 72AB_확대후보.gs — 기존 광고에서 더 쓸 만한 상품 고르기 (EXPAND 1단계)
 *
 * ── 이 표가 답하는 질문 ─────────────────────────────────
 *   지금 광고 중인 상품 중 어느 것이 더 써도 되는가
 *   그렇게 말할 근거가 이 상품에 있기는 한가 (표본)
 *   지금 내는 값이 손익분기가 되려면 마진율이 몇이어야 하는가
 *
 * ── 마진율을 사람이 채울 수 있게 하는 것이 요점이다 ──────
 * 후보의 90%는 바깥 마진율 시트에도 없어 기본 17% 로 간다. 17% 가 틀린 상품이
 * 많다는 것을 사람이 안다 — 그래서 [마진율(%)] 칸을 비워 두지 않고 채워 주되,
 * 사람이 고쳐 적으면 그 값을 다시는 덮어쓰지 않는다. [마진출처] 가 어느 쪽인지 말한다.
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
 * ── 여기서는 아무것도 바꾸지 않는다 ─────────────────────
 * 계산하고 표에 적을 뿐, 입찰·예산을 건드리지 않는다 (기획서 7.2).
 */

var SHEET_EXPAND = '광고확대후보';
var EXPAND_HEADER = [
  'SKU', 'ASIN', '상품명', '판매가(JPY)',
  '마진율(%)', '마진출처', '마진근거',
  '객단가(JPY)', '성숙클릭', '성숙주문', '광고비(JPY)', '광고매출(JPY)',
  '실제클릭비용(JPY)', '실제주문율(%)', '판단주문율(%)',
  '주문당공헌이익(JPY)', '손익분기클릭비용(JPY)', '목표클릭비용(JPY)', '여유배수',
  '필요마진율(%)', '분류', '사유', '자료기간'
];
var EX_SKU = 0, EX_ASIN = 1, EX_NAME = 2, EX_PRICE = 3, EX_MARGIN = 4, EX_MSRC = 5;

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
function buildAdExpandCandidates() {
  var made = makeOneSheet_([{ name: SHEET_EXPAND, header: EXPAND_HEADER }]);
  if (madeSheetStop_(made, '광고 확대 후보')) return;

  var ash = ss_().getSheetByName(SHEET_ADS);
  if (!ash || ash.getLastRow() < 2) {
    ui_().alert('광고 실적이 없습니다',
      '[📥 자료 받기 → 광고비 수집] 을 먼저 하세요.\n' +
      '"' + SHEET_ADS + '" 에 SKU × 날짜 실적이 있어야 후보를 셀 수 있습니다.',
      ui_().ButtonSet.OK);
    return;
  }

  // ① 사람이 적어 둔 마진율을 먼저 챙긴다 — 새로 고쳐도 그 값은 살린다
  var sh = ss_().getSheetByName(SHEET_EXPAND);
  var keep = {};
  if (sh.getLastRow() > 1) {
    var old = sh.getRange(2, 1, sh.getLastRow() - 1, EXPAND_HEADER.length).getValues();
    for (var o = 0; o < old.length; o++) {
      var k = String(old[o][EX_SKU] || '').trim();
      if (k && String(old[o][EX_MSRC]) === MSRC_USER) keep[k] = Number(old[o][EX_MARGIN]);
    }
  }

  // ② 광고 실적을 SKU 로 모은다 — 성숙한 날만, 그중 최근 EXPAND_WINDOW_DAYS 일
  var perf = adPerfBySku_(EXPAND_WINDOW_DAYS);
  var agg = perf.sku, span = perf.span, last = perf.last;
  if (!perf.days) {
    ui_().alert('셀 수 있는 날이 없습니다', adMatureHelp_(perf), ui_().ButtonSet.OK);
    return;
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

  var ctx = adMarginCtx_();
  var rows = [], cnt = {}, nUser = 0, nSheet = 0, nCost = 0, nDef = 0;
  for (var sku2 in agg) {
    var a2 = agg[sku2], inf = info[sku2] || { asin: a2.asin, jp: '', price: 0 };
    var aov = a2.od > 0 ? a2.sales / a2.od : 0;
    var price = inf.price || aov;
    var m = adMarginFor_(ctx, sku2, price, inf.jp, keep[sku2]);
    if (m.src === MSRC_USER) nUser++;
    else if (m.src === MSRC_SHEET) nSheet++;
    else if (m.src === MSRC_COST || m.src === MSRC_LOSS) nCost++;
    else nDef++;

    var cpc = a2.ck > 0 ? a2.cost / a2.ck : 0;
    var real = a2.ck > 0 ? a2.od / a2.ck : 0;
    var q = (a2.od + EXPAND_PRIOR * real) / (a2.ck + EXPAND_PRIOR);   // 표본이 작으면 실측 쪽으로 눌린다
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

    rows.push([sku2, inf.asin || a2.asin, String(inf.jp || '').substring(0, 60), Math.round(price),
      m.pct, m.src, m.why,
      Math.round(aov), Math.round(a2.ck), Math.round(a2.od), Math.round(a2.cost), Math.round(a2.sales),
      Math.round(cpc * 100) / 100, Math.round(real * 10000) / 100, Math.round(q * 10000) / 100,
      Math.round(G), Math.round(be * 100) / 100, Math.round(target * 100) / 100,
      cpc > 0 ? Math.round(room * 100) / 100 : '',
      need ? Math.round(need * 10) / 10 : '', cls, why, span]);
  }

  // 확대검토를 위로, 그 안에서는 여유배수가 큰 순으로
  // 순위가 0 인 것을 || 로 거르면 1등이 꼴찌가 된다 (0 은 거짓이다). undefined 만 뒤로 보낸다
  var order = {}; order[EXC_GROW] = 0; order[EXC_HOLD] = 1; order[EXC_GUARD] = 2;
  order[EXC_THIN] = 3; order[EXC_WAIT] = 4;
  var rank = function (v) { var r = order[v]; return r === undefined ? 9 : r; };
  rows.sort(function (x, y) {
    var d = rank(x[20]) - rank(y[20]);
    if (d) return d;
    return (Number(y[18]) || 0) - (Number(x[18]) || 0);
  });

  writeTable_(sh, EXPAND_HEADER, rows);
  sh.getRange(1, 1, 1, EXPAND_HEADER.length).setValues([EXPAND_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  adExpandNotes_(sh);
  showSheet_(SHEET_EXPAND);

  ui_().alert('광고 확대 후보',
    '상품 ' + rows.length + '개 · 센 기간 ' + span + '\n' +
    '(최근 ' + (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) + '일 ' + perf.young + '줄은 주문이 아직 다 안 붙어 뺐습니다' +
    (perf.old ? ' · 창 밖 ' + perf.old + '줄' : '') + ')\n' +
    Object.keys(cnt).map(function (k) { return k + ' ' + cnt[k]; }).join(' · ') + '\n\n' +
    '마진율 출처 — 사용자 입력 ' + nUser + ' · 원가 계산 ' + nCost +
    ' · 마진율 시트 ' + nSheet + ' · 기본 ' + nDef + '\n\n' +
    (nDef ? '⚠ ' + nDef + '개는 기본 ' + ctx.def + '% 로 셌습니다. 실제 마진율을 아시면\n' +
            '   [마진율(%)] 칸에 적어 주세요 — 다시 눌러도 그 값은 지워지지 않습니다.\n' +
            '   그 상품이 이익인지 아닌지는 [필요마진율] 과 견주면 바로 보입니다.\n\n' : '') +
    '여기서는 아무것도 바꾸지 않았습니다. 계산해서 적었을 뿐입니다.',
    ui_().ButtonSet.OK);
}

function adExpandNotes_(sh) {
  headerNotes_(sh, 1, EXPAND_HEADER, {
    '마진율(%)': '광고 전 공헌이익 비율. 여기에 직접 적으면 그 값이 가장 셉니다 —\n' +
      '다시 계산해도 덮어쓰지 않습니다 ([마진출처] 가 "' + MSRC_USER + '" 이 됩니다).',
    '마진출처': MSRC_USER + ' > ' + MSRC_COST + ' > ' + MSRC_SHEET + ' > ' + MSRC_DEFAULT + ' 순서로 씁니다.\n' +
      '기본값이 많은 것이 정상입니다 — 바깥 시트는 일본어 상품명이 정확히 같을 때만 붙습니다.',
    '필요마진율(%)': '= 실제 클릭비용 ÷ (객단가 × 실제 주문율).\n' +
      '지금 내는 값이 손익분기가 되는 마진율입니다. 마진율을 몰라도 계산됩니다 —\n' +
      '실제 마진이 이보다 높으면 지금도 이익이고, 낮으면 지금도 밑지고 있습니다.',
    '판단주문율(%)': '= (성숙 주문 + ' + EXPAND_PRIOR + ' × 실제 주문율) ÷ (성숙 클릭 + ' + EXPAND_PRIOR + ').\n' +
      '표본이 작을 때 한두 건의 우연이 입찰을 흔들지 않게 눌러 줍니다.',
    '목표클릭비용(JPY)': '= 손익분기 × ' + EXPAND_KEEP + ' (이익보존계수).\n' +
      '손익분기까지 다 쓰지 않고 일부를 이익으로 남깁니다.',
    '여유배수': '= 목표 ÷ 지금 내는 값. 1보다 크면 더 낼 수 있고, 작으면 지금이 과합니다.',
    '분류': EXC_GROW + ' = 표본도 있고 여유도 있음 (여유배수 ' + EXPAND_ROOM + '배 이상)\n' +
      EXC_HOLD + ' = 목표와 지금이 비슷함\n' +
      EXC_GUARD + ' = 지금이 목표보다 높음 — 줄일 자리\n' +
      EXC_THIN + ' = 클릭 ' + EXPAND_MIN_CLICKS + ' · 주문 ' + EXPAND_MIN_ORDERS + ' 미만\n' +
      EXC_WAIT + ' = 자료가 모자라 셀 수 없음',
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
