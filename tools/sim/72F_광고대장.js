/**
 * 72F_광고대장.gs — 광고 변경 대장 · 캠페인 보관 실행
 *
 * ── 아마존에는 '삭제'가 없다 ────────────────────────────
 * 캠페인을 없애는 유일한 길은 상태를 ARCHIVED 로 바꾸는 것이고, 이건 영구적이다.
 * 되돌릴 수 없고, 보관된 캠페인은 다시 켜지도 재사용하지도 못한다.
 * 그 안의 광고그룹·키워드·입찰가·쌓인 학습이 통째로 사라진다.
 * 같은 이름으로 새로 만들 수는 있지만 그건 다른 캠페인이다.
 *
 * 그래서 여기서는 세 가지를 지킨다:
 *   ① 무엇을 없앨지 하나하나 보여주고 확인받는다
 *   ② 부르기 전에 대장에 먼저 적는다 — 호출이 실패해도 시도한 기록이 남는다
 *   ③ 재고가 없어 멈춘 캠페인은 기본적으로 뺀다 (재고 들어오면 다시 쓸 것들이다)
 *
 * ── 대장을 지금 만드는 이유 ─────────────────────────────
 * 나중에 입찰가·예산 조정도 전부 이 표를 거친다. 무엇을 언제 왜 바꿨는지가
 * 남아 있어야 '바꾼 뒤에 좋아졌나'를 물을 수 있다. 광고에서 그 물음이 전부다.
 */

var SHEET_ADLOG = '광고변경대장';
/**
 * 첫 판에는 캠페인 칸에 '(그룹 124540216079034)' 같은 것이 들어가 읽을 수가 없었다.
 * 무엇을 왜 바꿨는지 되짚으려고 만든 표인데 되짚을 수가 없으면 없는 것과 같다.
 * 그래서 사람이 읽는 [요약] 을 앞에 두고, 어느 상품인지(SKU·ASIN)와
 * 캠페인·광고그룹 이름을 함께 남긴다. ID 는 뒤로 미룬다 — 기계가 쓸 값이다.
 */
var ADLOG_HEADER = ['일시', '요약', '종류', '캠페인', '광고그룹', 'SKU', 'ASIN',
                    '대상', '항목', '전', '후', '사유', '실행', '결과',
                    '캠페인ID', '광고그룹ID', '대상ID'];
var ADLOG_ID_COLS = [15, 16, 17];
var ADLOG_RESULT_COL = 14;

/**
 * 대장 한 줄. 자리를 외우지 않도록 이름으로 받는다 —
 * 쓰는 곳이 셋이라 자리로 넘기면 하나만 어긋나도 표 전체가 밀린다.
 */
function adLogRow_(o) {
  return [o.at || new Date(), o.sum || '', o.kind || '', o.camp || '', o.group || '',
          o.sku || '', o.asin || '', o.target || '', o.item || '',
          (o.from === undefined || o.from === null) ? '' : o.from,
          (o.to === undefined || o.to === null) ? '' : o.to,
          o.why || '', o.by || '승인', '시도',
          o.cid || '', o.gid || '', o.tid || ''];
}

/**
 * 칸 구성이 바뀌었으면 옛 줄을 이름으로 맞춰 옮긴다.
 * 그냥 새 머리글만 씌우면 옛 줄이 한 칸씩 밀려 엉뚱한 자리에 들어간다 —
 * 기록을 지우는 것보다 나쁘다. 지운 줄로 보이지 않으면서 값이 틀리기 때문이다.
 */
var ADLOG_SHEET_CACHE = null;      // 한 번 실행하는 동안만 산다

function adLogEnsure_() {
  // 줄마다 부르면 그때마다 머리글을 읽어 맞대 본다 — 여든 줄이면 여든 번이다.
  // 한 번 확인했으면 그 실행 동안은 다시 안 본다.
  if (ADLOG_SHEET_CACHE) return ADLOG_SHEET_CACHE;
  var sh = ensureSheet_(SHEET_ADLOG, ADLOG_HEADER);
  if (sh.getLastRow() < 1) { ADLOG_SHEET_CACHE = sh; return sh; }
  var w = Math.max(sh.getLastColumn(), 1);
  var old = sh.getRange(1, 1, 1, w).getValues()[0];
  var same = (old.length >= ADLOG_HEADER.length);
  for (var i = 0; same && i < ADLOG_HEADER.length; i++) {
    if (String(old[i]).trim() !== ADLOG_HEADER[i]) same = false;
  }
  if (same) { ADLOG_SHEET_CACHE = sh; return sh; }

  var map = {};
  for (var o = 0; o < old.length; o++) map[String(old[o]).trim()] = o;
  var rows = [];
  if (sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues();
    for (var r = 0; r < v.length; r++) {
      var out = [];
      for (var c = 0; c < ADLOG_HEADER.length; c++) {
        var src = map[ADLOG_HEADER[c]];
        out.push(src === undefined ? '' : v[r][src]);
      }
      // 옛 줄에는 요약이 없다 — 있는 값으로 만들어 준다
      if (!out[1]) {
        out[1] = String(out[8] || '') +
          (out[9] !== '' && out[10] !== '' ? ' ' + out[9] + ' → ' + out[10]
                                           : (out[10] !== '' ? ' ' + out[10] : '')) +
          (out[7] ? ' · ' + out[7] : '') + (out[3] ? ' · ' + out[3] : '');
      }
      rows.push(out);
    }
  }
  var need = Math.max(rows.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  for (var d = 0; d < ADLOG_ID_COLS.length; d++) {
    sh.getRange(2, ADLOG_ID_COLS[d], need - 1, 1).setNumberFormat('@');
  }
  writeTable_(sh, ADLOG_HEADER, rows);
  headerNotes_(sh, 1, ADLOG_HEADER, {
    '요약': '한 줄로 읽는 그 변경. 자세한 것은 오른쪽 칸들에 있다.',
    'SKU': '그 변경이 걸린 상품. 여럿이면 앞의 몇 개만 적고 나머지는 개수로 적는다.',
    '전': '바꾸기 전 값. 비어 있으면 새로 만든 것이다.',
    '결과': '아마존이 실제로 받아들였는지. API 를 부르기 전에 이 줄을 먼저 적으므로,\n중간에 멈춰도 무엇을 시도했는지는 남는다.'
  });
  log_('ads', 'INFO', '광고변경대장 칸 구성을 바꿔 옛 줄 ' + rows.length + '개를 옮겼습니다');
  ADLOG_SHEET_CACHE = sh;
  return sh;
}

/**
 * 대장에 여러 줄을 적고 그 줄들이 어디에 적혔는지 알려준다.
 * 결과는 아직 모르므로 '시도'로 두고, 끝난 뒤 그 자리만 고쳐 쓴다.
 * @return {number} 첫 줄의 행 번호
 */
function adLogWrite_(entries) {
  var sh = adLogEnsure_();
  var start = Math.max(sh.getLastRow(), 1) + 1;
  var need = start + entries.length - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  for (var i = 0; i < ADLOG_ID_COLS.length; i++) {
    sh.getRange(start, ADLOG_ID_COLS[i], entries.length, 1).setNumberFormat('@');
  }
  sh.getRange(start, 1, entries.length, ADLOG_HEADER.length).setValues(entries);
  SpreadsheetApp.flush();          // 여기서 죽어도 기록은 남아 있어야 한다
  return start;
}

/**
 * 여러 줄을 모아 두었다가 한 번에 적는다.
 *
 * 줄마다 바로 적으면 시트를 여덟 번씩 두드리고 그때마다 flush 가 걸린다.
 * 여든 줄이면 육백 번이 넘어 스프레드시트 서비스가 시간을 넘긴다 — 실제로 넘겼다.
 * 그렇다고 끝까지 모았다가 한 번에 적으면 중간에 죽을 때 통째로 잃는다.
 * 그래서 몇 줄씩 끊어 적는다.
 */
function adLogBuffer_(n) {
  var buf = [], every = n || 20;
  return {
    push: function (rows) { buf = buf.concat(rows); if (buf.length >= every) this.flush(); },
    flush: function () {
      if (!buf.length) return;
      var start = adLogWrite_(buf);
      adLogResult_(start, buf.map(function () { return '성공'; }));
      buf = [];
    }
  };
}

/** 대장의 결과 칸만 고쳐 쓴다 */
function adLogResult_(startRow, results) {
  var sh = ss_().getSheetByName(SHEET_ADLOG);
  if (!sh) return;
  var out = results.map(function (r) { return [r]; });
  sh.getRange(startRow, ADLOG_RESULT_COL, out.length, 1).setValues(out);
}

/** 메뉴: 승인한 캠페인 보관 (되돌릴 수 없음) */
function archiveApprovedCampaigns() {
  var sh = getSheetOrThrow_(SHEET_ADCAMP);
  if (sh.getLastRow() < 2) throw new Error(SHEET_ADCAMP + ' 탭이 비어 있습니다.\n' +
    '[📊 분석 → 캠페인 점검 · 정리 후보]를 먼저 실행하세요.');

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADCAMP_HEADER.length).getValues();
  var picked = [], keepStock = [];
  for (var i = 0; i < v.length; i++) {
    if (v[i][AC_APPROVE - 1] !== true) continue;
    var id = String(v[i][AC_ID - 1] || '').trim();
    if (!id) continue;
    var one = { row: i + 2, id: id, name: String(v[i][0]), state: String(v[i][2]),
                verdict: String(v[i][18]), why: String(v[i][19]),
                cost: Number(v[i][9]) || 0, sales: Number(v[i][10]) || 0,
                skus: Number(v[i][5]) || 0 };
    if (one.verdict === '조치 불필요') continue;      // 이미 보관됨
    if (one.verdict === '보존') keepStock.push(one); else picked.push(one);
  }
  if (!picked.length && !keepStock.length) {
    ui_().alert('보관할 캠페인이 없습니다.\n' + SHEET_ADCAMP + ' 탭의 [승인] 칸을 체크하세요.');
    return;
  }

  // 재고가 없어 멈춘 것은 기본적으로 뺀다. 다만 고른 것은 사람이므로 물어본다.
  var target = picked;
  if (keepStock.length) {
    var lines = keepStock.map(function (c) {
      return '   · ' + c.name.substring(0, 34) + '  (광고 상품 ' + c.skus + '개)';
    }).join('\n');
    var ans = ui_().alert('재고 때문에 멈춘 캠페인이 섞여 있습니다',
      '체크한 것 중 ' + keepStock.length + '개는 광고 상품이 전부 재고 없음입니다.\n' +
      '재고가 들어오면 다시 쓸 캠페인입니다.\n\n' + lines + '\n\n' +
      '보관하면 그 안의 상품·키워드 설정이 영구히 사라집니다.\n\n' +
      '[예]    이 ' + keepStock.length + '개는 남기고 나머지 ' + picked.length + '개만 보관\n' +
      '[아니오] 체크한 ' + (picked.length + keepStock.length) + '개 전부 보관\n' +
      '[취소]  아무것도 안 함',
      ui_().ButtonSet.YES_NO_CANCEL);
    if (ans === ui_().Button.CANCEL) return;
    if (ans === ui_().Button.NO) target = picked.concat(keepStock);
  }
  if (!target.length) { ui_().alert('보관할 캠페인이 없습니다.'); return; }

  var sumCost = 0, sumSales = 0, sumSku = 0;
  var list = target.map(function (c) {
    sumCost += c.cost; sumSales += c.sales; sumSku += c.skus;
    return '   · ' + c.name.substring(0, 32) + '  (' + c.state + ' · 상품 ' + c.skus +
           ' · 광고비 ' + c.cost.toLocaleString() + '엔)';
  }).join('\n');

  var ok = ui_().alert('캠페인 보관 — 되돌릴 수 없습니다',
    target.length + '개를 보관(ARCHIVED)합니다.\n\n' + list + '\n\n' +
    '합계 — 광고 상품 ' + sumSku + '개 · 최근 광고비 ' + Math.round(sumCost).toLocaleString() +
    '엔 · 광고매출 ' + Math.round(sumSales).toLocaleString() + '엔\n\n' +
    '⚠ 아마존에는 삭제가 없고 보관이 그 자리를 대신합니다.\n' +
    '   보관한 캠페인은 다시 켜지도, 되돌리지도 못합니다.\n' +
    '   안의 광고그룹·키워드·입찰가가 함께 사라집니다.\n\n' +
    '정말 진행할까요?', ui_().ButtonSet.YES_NO);
  if (ok !== ui_().Button.YES) return;

  var token = adsToken_();
  var now = new Date();
  var entries = target.map(function (c) {
    return adLogRow_({ at: now, kind: '캠페인', camp: c.name,
      sku: c.skus ? '상품 ' + c.skus + '개' : '', item: '상태',
      from: c.state, to: 'ARCHIVED',
      sum: '캠페인 보관 · ' + c.name + ' (' + c.state + ' → 보관됨)',
      why: c.verdict + ' — ' + c.why, cid: c.id });
  });
  var startRow = adLogWrite_(entries);      // 부르기 전에 적는다

  // 50개씩 나눠 보낸다 — 한 번에 다 보내면 어느 줄에서 막혔는지 알기 어렵다
  var results = [], okN = 0;
  for (var s = 0; s < target.length; s += 50) {
    var chunk = target.slice(s, s + 50);
    var body = { campaigns: chunk.map(function (c) {
      return { campaignId: c.id, state: 'ARCHIVED' }; }) };
    var got = {};
    try {
      var res = adsApi_(token, 'put', '/sp/campaigns', body,
                        ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
      var box = (res && res.campaigns) || {};
      var succ = box.success || [], errs = box.error || [];
      for (var a = 0; a < succ.length; a++) got[succ[a].index] = '성공';
      for (var b = 0; b < errs.length; b++) {
        var e1 = (errs[b].errors && errs[b].errors[0]) || {};
        got[errs[b].index] = '실패: ' + (e1.errorType || '') + ' ' +
                             String(e1.message || '').substring(0, 90);
      }
    } catch (e) {
      var m = '실패: ' + String(e).substring(0, 110);
      for (var z = 0; z < chunk.length; z++) got[z] = m;
    }
    for (var k = 0; k < chunk.length; k++) {
      var r = got[k] || '실패: 응답에 결과가 없음';
      results.push(r);
      if (r === '성공') { okN++; chunk[k].done = true; }
    }
  }
  adLogResult_(startRow, results);

  // 성공한 줄은 광고캠페인 탭에서도 상태를 맞춰 둔다 (체크는 풀어 둔다)
  for (var t = 0; t < target.length; t++) {
    if (!target[t].done) continue;
    sh.getRange(target[t].row, 3).setValue('보관됨');
    sh.getRange(target[t].row, 19).setValue('조치 불필요');
    sh.getRange(target[t].row, 20).setValue('보관 실행 ' + ymd_(now));
    sh.getRange(target[t].row, AC_APPROVE).setValue(false);
  }

  var failN = target.length - okN;
  log_('ads', failN ? 'WARN' : 'INFO',
       '캠페인 보관 — 성공 ' + okN + ' · 실패 ' + failN);
  toast_('보관 ' + okN + '개');
  showSheet_(SHEET_ADLOG);
  ui_().alert('캠페인 보관 완료',
    '성공 ' + okN + '개' + (failN ? ' · 실패 ' + failN + '개' : '') + '\n\n' +
    (failN ? '실패한 줄의 사유는 "' + SHEET_ADLOG + '" 탭 [결과] 칸에 있습니다.\n\n' : '') +
    '무엇을 언제 왜 바꿨는지는 "' + SHEET_ADLOG + '"에 남았습니다.',
    ui_().ButtonSet.OK);
}
