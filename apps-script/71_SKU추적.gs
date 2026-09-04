/**
 * 71_SKU추적.gs — 한 SKU의 일별 판매량과 가격 변동을 겹쳐 본다
 *
 * ── 무엇을 보는가 ───────────────────────────────────────
 * 가격을 올린 날을 기준으로 앞뒤 판매량이 어떻게 달라졌는지 본다.
 * 자료는 이미 있는 것만 쓴다 — '주문' 탭의 주문일과 '가격변경대장'의 반영 기록.
 * 새로 받을 API도, 권한도 필요 없다.
 *
 * ── 왜 판정을 따로 붙이는가 ─────────────────────────────
 * 하루 두세 개 팔리는 상품은 그래프만 보면 항상 뭔가 변한 것처럼 보인다.
 * 가격을 올린 다음 주에 덜 팔렸다고 해서 가격 때문이라고 할 수 없다 —
 * 그 정도 흔들림은 아무 일이 없어도 늘 생긴다.
 * 그래서 변경 전후를 포아송으로 비교해 2σ를 넘을 때만 '감소/증가'라고 적고,
 * 나머지는 '판단 불가'로 둔다. 대부분은 판단 불가가 나오는 게 정상이다.
 *
 * ── 그날의 가격을 어떻게 아는가 ─────────────────────────
 * 대장에는 '언제 얼마에서 얼마로 바꿨는지'만 있다. 그래서 시간순으로 훑으며
 * 구간별 가격을 만든다. 대장 이전 기간은 첫 변경의 '이전가'로 본다.
 * (등록 후 수동 변경이 없었다는 전제 — 리프라이싱 r0와 같은 전제다)
 */

var SHEET_TRACK = 'SKU추적';
var TRACK_HEADER = ['날짜', '판매수량', '매출(JPY)', '가격(JPY)', '가격변경'];
var TK_DATE = 0, TK_QTY = 1, TK_REV = 2, TK_PRICE = 3, TK_CHANGE = 4;

/** 기본 조회 기간 (일) */
var TRACK_DAYS = 120;

/** 가격변경 전후를 비교할 창 (일) */
var TRACK_WINDOW = 14;

/** 전후 합쳐 이만큼은 팔려야 비교를 시도한다 */
var TRACK_MIN_OBS = 8;

// 전후 비교표. 일별 표 위에 놓는다
var CMP_HEADER = ['가격변경일', '가격', '변동률', '이전 일평균', '이후 일평균',
                  '관측일(전/후)', '판매 증감', '판정', '비고'];

// 창이 이보다 짧으면 숫자를 내지 않는다.
// 사흘치로 '판매 40% 감소'라고 적으면 없는 신호를 본 것이다.
var TRACK_MIN_DAYS = 5;

/**
 * 대장에서 이 SKU의 반영된 가격 변경을 시간순으로 뽑는다.
 * @return {Array<{date:string, from:number, to:number, reason:string}>}
 */
function priceChangesOf_(sku) {
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, PRICELOG_HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][PL_SKU]).trim() !== sku) continue;
    if (v[i][PL_APPLIED] !== true) continue;      // 실제로 나간 것만
    var d = v[i][PL_AT];
    if (!d) continue;
    var ds = (d instanceof Date) ? ymd_(d) : String(d).substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) continue;
    out.push({ date: ds, from: Number(v[i][PL_OLD]) || 0, to: Number(v[i][PL_NEW]) || 0,
               reason: String(v[i][PL_REASON] || '') });
  }
  out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return out;
}

/** 날짜별 유효 가격을 정하는 함수를 만든다 */
function priceTimeline_(changes, currentPrice) {
  return function (ymdStr) {
    var p = changes.length ? changes[0].from : currentPrice;
    for (var i = 0; i < changes.length; i++) {
      if (changes[i].date <= ymdStr) p = changes[i].to;
      else break;
    }
    return p || currentPrice;
  };
}

/**
 * 이 SKU의 일별 수량·매출.
 *
 * 자료가 둘 있을 수 있다:
 *   판매실적(날짜별 모드) — 하루짜리 기간으로 받은 행. 아마존이 집계한 값이라 정확하다.
 *   주문                  — Orders API로 모은 것. 수집이 느려 기간이 짧을 수 있다.
 * 둘 다 있으면 판매실적을 우선하고, 없는 날만 주문으로 메운다.
 */
function dailySalesOf_(sku) {
  var out = { qty: {}, rev: {}, first: '', last: '', src: '' };
  var fromReport = {};

  // 1) 판매실적 — 기간시작과 기간종료가 같은 행만 '그날의 값'이다
  var rv = salesTable_();
  {
    for (var r = 0; r < rv.length; r++) {
      if (String(rv[r][SL_SKU]).trim() !== sku) continue;
      var f = rv[r][SL_FROM] instanceof Date ? ymd_(rv[r][SL_FROM]) : String(rv[r][SL_FROM]);
      var t = rv[r][SL_TO] instanceof Date ? ymd_(rv[r][SL_TO]) : String(rv[r][SL_TO]);
      if (f !== t) continue;                       // 기간 합계 행은 날짜를 모른다
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) continue;
      fromReport[f] = true;
      // 같은 날이 두 번 있으면 더하지 않고 나중 것으로 덮는다.
      // 수집이 중간에 끊겼다 이어지면 그 SKU가 한 번 더 들어올 수 있는데,
      // 더해버리면 그날만 판매량이 두 배로 보인다.
      out.qty[f] = Number(rv[r][SL_QTY]) || 0;
      out.rev[f] = Number(rv[r][SL_AMT]) || 0;
    }
  }

  // 2) 주문 — 리포트에 없는 날만 채운다.
  //    그래프는 어차피 최근 TRACK_DAYS 만 그리므로 그 창(+비교 여유)만 읽는다.
  //    주문 탭이 4만 행이어도 여기서 읽는 건 넉 달 남짓이다.
  var cutoff = ymd_(new Date(Date.now() - (TRACK_DAYS + TRACK_WINDOW) * 86400000));
  var v = ordersInRange_(cutoff, '');
  var usedOrders = false;
  {
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][OD_SKU]).trim() !== sku) continue;
      var d = v[i][OD_DATE];
      var ds = (d instanceof Date) ? ymd_(d) : String(d).substring(0, 10);
      if (fromReport[ds]) continue;                // 리포트 값이 우선
      usedOrders = true;
      out.qty[ds] = (out.qty[ds] || 0) + (Number(v[i][OD_QTY]) || 1);
      out.rev[ds] = (out.rev[ds] || 0) + (Number(v[i][OD_PRICE]) || 0);
    }
  }

  for (var k in out.qty) {
    if (!out.first || k < out.first) out.first = k;
    if (!out.last || k > out.last) out.last = k;
  }
  var nRep = 0;
  for (var z in fromReport) nRep++;
  out.src = nRep && usedOrders ? '판매실적 + 주문'
          : nRep ? '판매실적(날짜별)'
          : usedOrders ? '주문' : '';
  return out;
}

/**
 * 가격변경 전후 비교.
 * 주문이 없는 날도 분모에 넣어야 한다 — 판 날만 세면 판매율이 부풀려진다.
 *
 * 창을 두 가지로 자른다 — 둘 다 안 하면 숫자가 거짓말을 한다.
 *
 * ① 자료가 있는 범위 밖은 세지 않는다.
 *    사흘 전에 바꾼 가격을 14일 창으로 보면, 아직 오지 않은 11일이 전부 '0개 판매'로
 *    잡혀 판매가 폭락한 것처럼 보인다. 실제로는 아무 일도 없었는데.
 *
 * ② 옆의 가격변경을 넘지 않는다.
 *    변경이 닷새 간격이면 앞 변경의 '이후'에 뒤 변경의 효과가 섞인다.
 *    둘 다 무엇 때문인지 알 수 없는 숫자가 된다.
 *
 * @param {{qty:Object, first:string, last:string}} daily
 * @param {string} changeDate 변경일 (이 날부터 '이후')
 * @param {number} windowDays 최대 창 길이
 * @param {{prev:string, next:string}} bound 앞뒤 변경일 (없으면 '')
 */
function beforeAfter_(daily, changeDate, windowDays, bound) {
  bound = bound || {};
  var day = 86400000;
  var base = new Date(changeDate + 'T00:00:00').getTime();

  // 이전 창: [bFrom, 변경 전날] — 자료 시작과 앞 변경일 중 늦은 쪽에서 멈춘다
  var bFrom = base - windowDays * day;
  var lim = [daily.first, bound.prev];
  for (var i = 0; i < lim.length; i++) {
    if (!lim[i]) continue;
    var t = new Date(lim[i] + 'T00:00:00').getTime();
    if (t > bFrom) bFrom = t;
  }
  // 이후 창: [변경일, aTo] — 자료 끝과 다음 변경 전날 중 이른 쪽에서 멈춘다
  var aTo = base + (windowDays - 1) * day;
  var hi = [daily.last, bound.next ? ymd_(new Date(new Date(bound.next + 'T00:00:00').getTime() - day)) : ''];
  for (var j = 0; j < hi.length; j++) {
    if (!hi[j]) continue;
    var t2 = new Date(hi[j] + 'T00:00:00').getTime();
    if (t2 < aTo) aTo = t2;
  }

  var bQty = 0, aQty = 0, bDays = 0, aDays = 0;
  for (var ms = bFrom; ms < base; ms += day) { bQty += daily.qty[ymd_(new Date(ms))] || 0; bDays++; }
  for (var ms2 = base; ms2 <= aTo; ms2 += day) { aQty += daily.qty[ymd_(new Date(ms2))] || 0; aDays++; }

  var bRate = bDays ? bQty / bDays : 0;
  var aRate = aDays ? aQty / aDays : 0;
  var change = bRate > 0 ? aRate / bRate - 1 : (aRate > 0 ? 1 : 0);

  var verdict, note = '';
  if (bDays < TRACK_MIN_DAYS || aDays < TRACK_MIN_DAYS) {
    verdict = '판단 불가';
    note = (aDays < TRACK_MIN_DAYS)
      ? '변경 후 ' + aDays + '일뿐 — ' + TRACK_MIN_DAYS + '일은 지나야 봅니다'
      : '변경 전 자료가 ' + bDays + '일뿐입니다';
  } else if (bQty + aQty < TRACK_MIN_OBS) {
    verdict = '판단 불가';
    note = '표본 ' + (bQty + aQty) + '개 — 너무 적습니다';
  } else {
    // 포아송: 두 구간의 '일당 판매율' 로그비를 2σ와 견준다.
    // 창 길이가 다를 수 있으므로 건수가 아니라 율로 비교해야 한다.
    var x = bQty + 0.5, y = aQty + 0.5;
    var lr = Math.log((y / aDays) / (x / bDays));
    var z = Math.abs(lr) / Math.sqrt(1 / x + 1 / y);
    verdict = z < 2 ? '판단 불가' : (aRate > bRate ? '증가' : '감소');
    if (z < 2) note = '우연 범위 (z=' + z.toFixed(1) + ')';
    else note = 'z=' + z.toFixed(1);
  }
  if (bound.prev && bFrom > base - windowDays * day) note = addNote_(note, '앞 변경까지만');
  if (bound.next && aTo < base + (windowDays - 1) * day) note = addNote_(note, '다음 변경까지만');

  return { beforeQty: bQty, afterQty: aQty, beforeDays: bDays, afterDays: aDays,
           beforeRate: bRate, afterRate: aRate, change: change,
           verdict: verdict, note: note };
}

function addNote_(a, b) { return a ? a + ' · ' + b : b; }

/**
 * 메뉴: SKU 추적.
 * 선택한 셀의 SKU를 기본값으로 물어본다.
 */
function trackSku() {
  ensureData_(['listing'], ['daily'], 'SKU 추적');

  var guess = '';
  try {
    var cell = ss_().getActiveRange();
    if (cell) guess = String(cell.getValue() || '').trim();
  } catch (e) {}
  if (guess.length > 60 || guess.indexOf(' ') >= 0) guess = '';

  var res = ui_().prompt('SKU 추적',
    '일별 판매량과 가격 변동을 함께 봅니다.\n\n' +
    'SKU를 입력하세요.' + (guess ? '\n(선택한 셀: ' + guess + ')' : '') + '\n\n' +
    '"주문" 탭에 쌓인 자료만 씁니다 — 수집이 덜 됐으면 그만큼만 보입니다.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var sku = String(res.getResponseText()).trim() || guess;
  if (!sku) throw new Error('SKU를 입력하세요.');

  return trackSku_(sku);
}

function trackSku_(sku) {
  var daily = dailySalesOf_(sku);
  if (!daily.first) {
    throw new Error('"' + sku + '" 의 주문 기록이 없습니다.\n\n' +
      '· SKU가 정확한지 확인하세요 (대소문자 구분)\n' +
      '· [🔄 데이터 갱신 → 판매실적 수집]을 "날짜별"로 받으면 훨씬 빠릅니다\n' +
      '· 그 기간을 아직 안 받았을 수 있습니다');
  }

  // 현재가 — 대장이 비어 있을 때의 기준
  var cur = 0, name = '';
  var listSh = ss_().getSheetByName(SHEET_LISTING);
  if (listSh && listSh.getLastRow() > 1) {
    var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
    for (var i = 0; i < lv.length; i++) {
      if (String(lv[i][L_SKU]).trim() === sku) {
        cur = Number(lv[i][L_PRICE]) || 0;
        name = String(lv[i][L_KR] || lv[i][L_JP] || '');
        break;
      }
    }
  }

  var changes = priceChangesOf_(sku);
  var priceAt = priceTimeline_(changes, cur);
  var changeOn = {};
  for (var c = 0; c < changes.length; c++) {
    changeOn[changes[c].date] = changes[c].from + ' → ' + changes[c].to +
                                ' (' + pct_(changes[c].to / changes[c].from - 1) + ')';
  }

  // 주문이 없는 날도 0으로 채운다 — 빠뜨리면 그래프가 거짓말을 한다
  var endMs = new Date(daily.last + 'T00:00:00').getTime();
  var startMs = Math.max(new Date(daily.first + 'T00:00:00').getTime(),
                         endMs - (TRACK_DAYS - 1) * 86400000);
  var rows = [];
  var totQty = 0, totRev = 0;
  for (var ms = startMs; ms <= endMs; ms += 86400000) {
    var d = ymd_(new Date(ms));
    var q = daily.qty[d] || 0;
    var rv = daily.rev[d] || 0;
    totQty += q; totRev += rv;
    rows.push([d, q, rv, priceAt(d), changeOn[d] || '']);
  }

  // 변경별 전후 비교 — 표에 같이 넣는다.
  // 알림창에만 띄우면 닫는 순간 사라져서, 정작 표를 볼 때 옆에 없다.
  var winStart = ymd_(new Date(startMs));
  var cmp = [], lines = [];
  for (var k = 0; k < changes.length; k++) {
    var ch = changes[k];
    if (ch.date < winStart) continue;
    var ba = beforeAfter_(daily, ch.date, TRACK_WINDOW, {
      prev: k > 0 ? changes[k - 1].date : '',
      next: k + 1 < changes.length ? changes[k + 1].date : ''
    });
    cmp.push([
      ch.date,
      ch.from + ' → ' + ch.to,
      pct_(ch.to / ch.from - 1),
      ba.beforeRate,
      ba.afterRate,
      ba.beforeDays + ' / ' + ba.afterDays + '일',
      ba.change,
      ba.verdict,
      ba.note
    ]);
    lines.push('  ' + ch.date + '  ' + ch.from + ' → ' + ch.to +
               ' (' + pct_(ch.to / ch.from - 1) + ')\n' +
               '     일평균 ' + ba.beforeRate.toFixed(2) + ' → ' + ba.afterRate.toFixed(2) +
               '개  (' + pct_(ba.change) + ')  ' + ba.verdict +
               (ba.note ? '\n     ' + ba.note : ''));
  }

  writeTrackSheet_(sku, name, rows, changes, daily, cur, totQty, totRev, cmp);

  var days = rows.length;
  var msg = sku + (name ? ' — ' + name.substring(0, 24) : '') + '\n' +
            rows[0][TK_DATE] + ' ~ ' + rows[rows.length - 1][TK_DATE] +
            ' (' + days + '일) · 총 ' + totQty + '개 · 일평균 ' + (totQty / days).toFixed(2) + '개' +
            (daily.src ? '\n자료: ' + daily.src : '');
  log_('track', 'INFO', 'SKU추적 ' + sku + ' · ' + totQty + '개/' + days + '일');

  showSheet_(SHEET_TRACK);
  ui_().alert('SKU 추적 — ' + SHEET_TRACK + ' 탭',
    msg + '\n\n' +
    (lines.length
      ? '■ 가격변경 전후 (' + TRACK_WINDOW + '일씩)\n' + lines.join('\n\n') + '\n\n' +
        '※ "판단 불가"가 정상입니다. 하루 몇 개 팔리는 상품은\n' +
        '   그 정도 흔들림이 아무 일 없어도 늘 생깁니다.\n'
      : '■ 이 기간에 반영된 가격변경이 없습니다.\n' +
        '   (대장에 반영=TRUE로 기록된 것만 셉니다)\n') +
    '\n탭에 일별 표와 그래프가 있습니다.',
    ui_().ButtonSet.OK);
  return msg;
}

function writeTrackSheet_(sku, name, rows, changes, daily, cur, totQty, totRev, cmp) {
  var sh = ensureSheet_(SHEET_TRACK, TRACK_HEADER);
  // 이전 그래프를 지우지 않으면 볼 때마다 쌓인다
  var charts = sh.getCharts();
  for (var c = 0; c < charts.length; c++) sh.removeChart(charts[c]);
  sh.clear();

  var days = rows.length;
  sh.getRange(1, 1).setValue(
    sku + (name ? '  —  ' + name : '') +
    '   |   ' + rows[0][TK_DATE] + ' ~ ' + rows[days - 1][TK_DATE] +
    ' (' + days + '일) · 총 ' + totQty + '개 · 일평균 ' + (totQty / days).toFixed(2) + '개' +
    ' · 현재가 ' + cur + '엔 · 가격변경 ' + changes.length + '회' +
    (daily.src ? ' · 자료: ' + daily.src : ''))
    .setFontWeight('bold');

  // ── 가격변경 전후 비교 (일별 표 위에) ──
  var r = 3;
  cmp = cmp || [];
  sh.getRange(r, 1).setValue('■ 가격변경 전후 — 최대 ' + TRACK_WINDOW + '일씩')
    .setFontWeight('bold');
  r++;
  if (cmp.length) {
    sh.getRange(r, 1, 1, CMP_HEADER.length).setValues([CMP_HEADER])
      .setFontWeight('bold').setBackground('#2d3561').setFontColor('#ffffff');
    sh.getRange(r + 1, 1, cmp.length, CMP_HEADER.length).setValues(cmp);
    sh.getRange(r + 1, 4, cmp.length, 2).setNumberFormat('0.00');   // 일평균 전·후
    sh.getRange(r + 1, 7, cmp.length, 1).setNumberFormat('+0.0%;-0.0%;0.0%');
    // 판정에 색을 준다 — '판단 불가'가 대부분이라 눈에 걸리는 것만 짚어야 한다
    var vbg = [];
    for (var v = 0; v < cmp.length; v++) {
      var vd = cmp[v][7];
      vbg.push([vd === '증가' ? '#d9ead3' : (vd === '감소' ? '#f4cccc' : '#f0f0f0')]);
    }
    sh.getRange(r + 1, 8, cmp.length, 1).setBackgrounds(vbg);
    r += cmp.length + 1;
  } else {
    sh.getRange(r, 1).setValue('이 기간에 반영된 가격변경이 없습니다 (대장에 반영=TRUE인 것만).')
      .setFontColor('#666666');
    r++;
  }
  r++;   // 빈 줄

  var hdrRow = r;
  sh.getRange(hdrRow, 1, 1, TRACK_HEADER.length).setValues([TRACK_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');

  var first = hdrRow + 1;
  var CH = 2000;
  for (var s = 0; s < rows.length; s += CH) {
    var part = rows.slice(s, s + CH);
    sh.getRange(first + s, 1, part.length, TRACK_HEADER.length).setValues(part);
  }
  sh.setFrozenRows(hdrRow);
  sh.getRange(first, TK_REV + 1, days, 1).setNumberFormat('#,##0');
  sh.getRange(first, TK_PRICE + 1, days, 1).setNumberFormat('#,##0');

  // 가격이 바뀐 날에 표시 — 그래프에서 어디가 변곡점인지 표에서도 짚을 수 있게
  var bg = [];
  for (var i = 0; i < days; i++) bg.push([rows[i][TK_CHANGE] ? '#fff4d6' : '#ffffff']);
  sh.getRange(first, TK_CHANGE + 1, days, 1).setBackgrounds(bg);

  try {
    var chart = sh.newChart()
      .asComboChart()
      .addRange(sh.getRange(hdrRow, TK_DATE + 1, days + 1, 1))    // 날짜
      .addRange(sh.getRange(hdrRow, TK_QTY + 1, days + 1, 1))     // 판매수량
      .addRange(sh.getRange(hdrRow, TK_PRICE + 1, days + 1, 1))   // 가격
      .setNumHeaders(1)
      .setOption('title', sku + ' — 일별 판매량과 가격')
      .setOption('series', { 0: { type: 'bars', targetAxisIndex: 0 },
                             1: { type: 'line', targetAxisIndex: 1 } })
      .setOption('vAxes', { 0: { title: '판매수량' }, 1: { title: '가격(JPY)' } })
      .setOption('legend', { position: 'top' })
      .setPosition(hdrRow, TRACK_HEADER.length + 2, 0, 0)
      .build();
    sh.insertChart(chart);
  } catch (e) {
    log_('track', 'WARN', '그래프 생성 실패: ' + e);
  }
}
