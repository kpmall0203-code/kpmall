/**
 * 78_배송과다.gs — 배송비가 값을 잡아먹는 SKU만 따로 본다
 *
 * ── 왜 따로 만드나 ──────────────────────────────────────
 * 이 판정은 원래 매출기여 탭 안에 [배송비율] 칸으로 들어 있었다. 그런데 거기는
 * 매출 상위 100개만 낱개로 남기고 나머지를 '기타' 한 줄로 접는다.
 * 배송비가 심한 물건은 대개 매출이 크지 않다 — 정확히 접히는 쪽에 있다.
 * 찾으려던 것이 요약에 묻혀 안 보이는 구조였다.
 *
 * 여기서는 매출 순위와 상관없이 SKU원가 탭 전체를 훑어 비율 높은 순으로 세운다.
 *
 * ── 무엇을 근거로 하나 ──────────────────────────────────
 * s = 실측 배송비(청구서 중위) ÷ 현재 판매가.
 * 추정 요율표가 아니라 실제로 청구된 금액이다. 배송건수가 적으면 중위값이
 * 우연에 흔들리므로 몇 건짜리인지 같이 적는다.
 */

var SHEET_SHIPHEAVY = '배송과다';
var SHIPHEAVY_HEADER = [
  'SKU', '상품명', '한글명', '판정', '배송비율', '실측배송비(JPY)', '현재가(JPY)',
  '배송건수', '적용무게(KG)', '실무게(KG)', '부피무게(KG)', '냉장',
  '남는돈(JPY)', '무엇을 하면 되나'
];
var SH_SKU = 0, SH_NAME = 1, SH_KR = 2, SH_VERDICT = 3, SH_S = 4, SH_FEE = 5,
    SH_PRICE = 6, SH_N = 7, SH_WAPP = 8, SH_WACT = 9, SH_WVOL = 10, SH_COOL = 11,
    SH_LEFT = 12, SH_ACTION = 13;

/** 이 건수 미만이면 중위값을 믿기 어렵다 — 지우지 않고 표시만 한다 */
var SHIPHEAVY_MIN_N = 2;

/**
 * 무엇을 하면 되는지 한 줄로.
 *
 * 배송비 문제는 원인이 몇 가지로 갈린다. "비싸다"만 적으면 어디를 손대야 할지
 * 알 수 없어서, 자료로 구별되는 만큼은 갈라준다.
 */
function shipAction_(s, wApp, wAct, wVol, cool, left) {
  if (cool) return '냉장을 일반으로 돌릴 수 있는지 — [냉장해제 가격 조정]';
  // 부피무게가 실무게보다 크면 무게가 아니라 상자가 문제다
  if (wVol > 0 && wAct > 0 && wVol > wAct * 1.2) {
    return '상자가 커서 부피무게로 잡힌다 — 포장 축소';
  }
  if (left <= 0) return '값이 배송비를 못 덮는다 — 묶음 판매나 판매 중단';
  if (s >= S_BAD) return '무게 구간을 낮추거나 묶음으로 — [포장 절감 후보] 확인';
  return '값 대비 무겁다 — 묶음 판매 검토';
}

/**
 * 메뉴: 배송비 과다 SKU (비율 높은 순)
 *
 * 문턱을 물어본다. 기본은 '주의' 선(30%)인데, 심한 것부터 보고 싶으면
 * 40이나 50을 넣으면 된다.
 */
function shipHeavyReport() {
  ensureData_(['listing'], ['invoice'], '배송비 과다 SKU');

  var res = ui_().prompt('배송비 과다 SKU',
    '배송비가 판매가의 몇 %를 넘는 것을 볼까요?\n\n' +
    '  ' + Math.round(S_WARN * 100) + '   △ 주의부터 (기본 — 그냥 [확인])\n' +
    '  ' + Math.round(S_BAD * 100) + '   ⚠ 심각부터\n' +
    '  ' + Math.round(S_LOSS * 100) + '   ⛔ 확정손실만 (원가가 0원이어도 적자)\n\n' +
    '실측 가중평균은 ' + Math.round(DEFAULT_S * 100) + '% 입니다.\n' +
    '이 판정은 매출 순위와 무관하게 전체를 훑습니다 —\n' +
    '배송비가 심한 물건은 대개 매출이 작아 매출기여 탭에서는 "기타"로 접힙니다.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var raw = String(res.getResponseText()).trim();
  var cut = S_WARN;
  if (raw) {
    var p = parseFloat(raw);
    if (!(p > 0 && p <= 200)) { ui_().alert('1 ~ 200 사이의 %로 넣으세요.'); return; }
    cut = p / 100;
  }

  var rows = shipHeavyRows_(cut);
  if (!rows.length) {
    ui_().alert('배송비 과다 SKU',
      Math.round(cut * 100) + '%를 넘는 SKU가 없습니다.\n\n' +
      '실측 배송비가 아직 없으면 [🔄 데이터 갱신 → 환율·청구서·원가]를 먼저 돌리세요.',
      ui_().ButtonSet.OK);
    return '';
  }

  writeShipHeavy_(rows, cut);

  // 요약: 이걸 고치면 얼마가 도는지
  var nLoss = 0, nBad = 0, nCool = 0, feeSum = 0, thin = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][SH_S] >= S_LOSS) nLoss++;
    else if (rows[i][SH_S] >= S_BAD) nBad++;
    if (rows[i][SH_COOL]) nCool++;
    feeSum += Number(rows[i][SH_FEE]) || 0;
    if (Number(rows[i][SH_N]) < SHIPHEAVY_MIN_N) thin++;
  }

  var msg = Math.round(cut * 100) + '% 초과 ' + rows.length.toLocaleString() + '개';
  log_('ship', 'INFO', '배송과다 — ' + msg);

  showSheet_(SHEET_SHIPHEAVY);
  ui_().alert('배송비 과다 SKU — ' + SHEET_SHIPHEAVY + ' 탭',
    '배송비율 ' + Math.round(cut * 100) + '% 초과: ' + rows.length.toLocaleString() + '개\n' +
    (nLoss ? '  ⛔ 확정손실 ' + nLoss + '개 — 원가가 0원이어도 적자입니다\n' : '') +
    (nBad ? '  ⚠ 심각 ' + nBad + '개\n' : '') +
    (nCool ? '  ❄ 냉장 ' + nCool + '개 — 계절이 풀렸으면 [냉장해제 가격 조정]\n' : '') +
    '\n건당 실측 배송비 합계: ' + Math.round(feeSum).toLocaleString() + '엔\n' +
    (thin ? '\n· 배송건수 ' + SHIPHEAVY_MIN_N + '건 미만 ' + thin +
            '개는 중위값이 흔들립니다 (표에 ⚠ 표시)\n' : '') +
    '\n※ 여기 있는 것은 환율 리프라이싱으로 안 고쳐집니다.\n' +
    '   값을 올리면 배송비 비율만 조금 내려갈 뿐 마진 구조는 그대로입니다.\n' +
    '   무게 구간을 낮추거나(포장·묶음) 파는 것을 그만두는 쪽입니다.\n\n' +
    '[무엇을 하면 되나] 칸에 SKU마다 갈라 적었습니다.',
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * SKU원가 × 리스팅을 붙여 비율 높은 순으로 세운다.
 * @param {number} cut 이 비율을 넘는 것만
 */
function shipHeavyRows_(cut) {
  var cs = ss_().getSheetByName(SHEET_SKUCOST);
  if (!cs || cs.getLastRow() < 2) return [];
  var cv = cs.getRange(2, 1, cs.getLastRow() - 1, SKUCOST_HEADER.length).getValues();

  // 현재가·이름은 리스팅에서. 한 번만 읽어 지도로 만든다
  var price = {}, jp = {}, kr = {};
  var ls = ss_().getSheetByName(SHEET_LISTING);
  if (ls && ls.getLastRow() > 1) {
    var lv = ls.getRange(2, 1, ls.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      var k = String(lv[i][L_SKU] || '').trim();
      if (!k) continue;
      price[k] = Number(lv[i][L_PRICE]) || 0;
      jp[k] = lv[i][L_JP];
      kr[k] = lv[i][L_KR];
    }
  }

  var out = [];
  for (var j = 0; j < cv.length; j++) {
    var sku = String(cv[j][SC_SKU] || '').trim();
    if (!sku) continue;
    var fee = Number(cv[j][SC_FEEMED]) || 0;
    var pr = price[sku] || 0;
    if (!(fee > 0) || !(pr > 0)) continue;      // 값이나 배송비를 모르면 비율을 못 낸다

    var s = fee / pr;
    if (!(s > cut)) continue;

    var wApp = Number(cv[j][SC_WAPP]) || 0;
    var wAct = Number(cv[j][SC_WACT]) || 0;
    var dw = Number(cv[j][SC_DW]) || 0, dh = Number(cv[j][SC_DH]) || 0,
        dd = Number(cv[j][SC_DD]) || 0;
    // 부피무게 = 가로×세로×높이 ÷ 6000 (실측 7,643건에서 청구서 값과 일치)
    var wVol = (dw && dh && dd) ? (dw * dh * dd) / 6000 : 0;
    var cool = !!cv[j][SC_COOL];
    var n = Number(cv[j][SC_N]) || 0;

    // 남는 돈 = 판매가 × (1 − 수수료) − 배송비. 원가는 아직 안 뺀 값이다
    var left = Math.round(pr * (1 - DEFAULT_FEE_RATE) - fee);

    out.push([
      sku, jp[sku] || '', kr[sku] || '',
      shipVerdict_(s) + (n < SHIPHEAVY_MIN_N ? ' ⚠' + n + '건' : ''),
      s, Math.round(fee), Math.round(pr), n,
      wApp ? Number(wApp.toFixed(2)) : '',
      wAct ? Number(wAct.toFixed(2)) : '',
      wVol ? Number(wVol.toFixed(2)) : '',
      cool ? '❄' : '',
      left,
      shipAction_(s, wApp, wAct, wVol, cool, left)
    ]);
  }

  out.sort(function (a, b) { return b[SH_S] - a[SH_S]; });
  return out;
}

function writeShipHeavy_(rows, cut) {
  var sh = ensureSheet_(SHEET_SHIPHEAVY, SHIPHEAVY_HEADER);
  sh.clear();

  sh.getRange(1, 1).setValue(
    '배송비율 ' + Math.round(cut * 100) + '% 초과 ' + rows.length.toLocaleString() + '개  ·  ' +
    '실측 배송비(청구서 중위) ÷ 현재가  ·  ' + ymd_(new Date()) +
    '   |   실측 가중평균 ' + Math.round(DEFAULT_S * 100) + '% · 확정손실선 ' +
    Math.round(S_LOSS * 100) + '%')
    .setFontWeight('bold');

  sh.getRange(2, 1, 1, SHIPHEAVY_HEADER.length).setValues([SHIPHEAVY_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');

  var CH = 2000;
  for (var s = 0; s < rows.length; s += CH) {
    var part = rows.slice(s, s + CH);
    sh.getRange(3 + s, 1, part.length, SHIPHEAVY_HEADER.length).setValues(part);
  }

  sh.setFrozenRows(2);
  var n = rows.length;
  sh.getRange(3, SH_S + 1, n, 1).setNumberFormat('0.0%');
  sh.getRange(3, SH_FEE + 1, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, SH_PRICE + 1, n, 1).setNumberFormat('#,##0');
  sh.getRange(3, SH_LEFT + 1, n, 1).setNumberFormat('#,##0');

  var bg = [];
  for (var i = 0; i < n; i++) {
    var sv = rows[i][SH_S];
    bg.push([sv >= S_LOSS ? '#f4c7c3' : sv >= S_BAD ? '#fce8e6' : '#fff4d6']);
  }
  if (n) {
    sh.getRange(3, SH_S + 1, n, 1).setBackgrounds(bg);
    sh.getRange(3, SH_VERDICT + 1, n, 1).setBackgrounds(bg);
  }

  headerNotes_(sh, 2, SHIPHEAVY_HEADER, {
    '배송비율': '실측 배송비 ÷ 현재가. 요율표 추정이 아니라 청구서에 찍힌 금액입니다.',
    '실측배송비(JPY)': '청구서에서 그 SKU가 받은 배송비의 중위값.\n' +
                       '배송건수가 적으면 흔들립니다.',
    '배송건수': SHIPHEAVY_MIN_N + '건 미만이면 판정 칸에 ⚠ 를 붙입니다 — ' +
                '한두 건으로는 중위값을 믿기 어렵습니다.',
    '부피무게(KG)': '가로×세로×높이 ÷ 6000.\n실무게보다 크면 무게가 아니라 상자가 문제입니다.',
    '남는돈(JPY)': '현재가 × (1 − 수수료 ' + Math.round(DEFAULT_FEE_RATE * 100) +
                   '%) − 배송비.\n원가는 아직 빼지 않은 값이라, 여기가 0에 가까우면 이미 적자입니다.'
  });

  writeLegend_(sh, 3 + n + 2, [
    ['이 표를 어떻게 쓰나', ''],
    ['환율 리프라이싱으로 못 고친다',
     '값을 올리면 비율은 내려가지만 배송비 자체는 그대로입니다. ' +
     '무게 구간을 낮추거나(포장·묶음) 파는 것을 그만두는 쪽입니다.'],
    ['부피무게 > 실무게',
     '가벼운데 상자가 큽니다. 포장만 줄여도 요율 구간이 내려갑니다 — [포장 절감 후보]에서 ' +
     '얼마나 줄이면 구간이 바뀌는지 볼 수 있습니다.'],
    ['❄ 냉장',
     '계절이 풀렸으면 일반 배송으로 돌릴 수 있습니다. 배송비가 내려간 만큼 ' +
     '값을 내려도 마진이 같습니다 — [냉장해제 가격 조정].'],
    ['남는돈이 0 이하',
     '원가를 한 푼도 안 쳐도 적자입니다. 묶음 판매로 건당 배송비를 나누거나 접습니다.'],
    ['⚠ N건',
     '배송건수가 적어 중위값이 우연에 흔들립니다. 손대기 전에 청구서를 직접 확인하세요.']
  ]);

  for (var c = 1; c <= 3; c++) sh.autoResizeColumn(c);
  sh.setColumnWidth(SH_ACTION + 1, 340);
  sh.getRange(3, SH_ACTION + 1, n, 1).setWrap(true);
}
