/**
 * 72U_운영현황.gs — 한 화면 (기획서 4.3 · 12)
 *
 * ── 무엇에 답하나 ───────────────────────────────────────
 *   지금 돈이 어디로 나가고 있나 (관리하는 것 · 관리 밖의 것)
 *   승인한 한도가 그중 얼마를 덮고 있나
 *   자료는 언제 것인가
 *   사람이 다음에 무엇을 해야 하나
 *
 * ── 관리 밖 지출을 같이 보여 주는 이유 ──────────────────
 * 우리가 만든 캠페인은 계정의 일부다. 옛 몰아넣기 캠페인이 아직 대부분의 돈을
 * 쓰고 있다. 관리하는 것만 보여 주면 "한도 안에서 잘 돌고 있다" 로 읽히는데,
 * 실제 계좌에서 나가는 돈은 그 몇 배다. 한도가 계정의 몇 퍼센트를 덮는지
 * 숫자로 적는다 (기획서 11.2).
 *
 * ── 계산만 한다 ─────────────────────────────────────────
 * API 를 부르지 않는다. 시트에 있는 것만 읽어 한 장으로 접는다.
 */

var SHEET_DASH = '광고운영현황';
var DASH_HEADER = ['구분', '항목', '값', '무엇을 뜻하나'];

/** 원장에서 기간 합계를 트랙별로 가른다 */
function dashSpendSplit_(led, from, to, ownById) {
  var out = { A: 0, B: 0, 밖: 0, total: 0, camps: {} };
  for (var i = 0; i < led.rows.length; i++) {
    var r = led.rows[i];
    if (from && r.d < from) continue;
    if (to && r.d > to) continue;
    var own = ownById[r.cid];
    var key = own ? (own.track === 'B' ? 'B' : 'A') : '밖';
    out[key] += r.cost;
    out.total += r.cost;
    out.camps[r.cid] = true;
  }
  return out;
}

function dashPct_(part, whole) {
  if (!(whole > 0)) return '';
  return ' (' + Math.round(part / whole * 100) + '%)';
}

/** 메뉴: 운영 현황 한 장 */
function showAdDashboard() {
  var made = makeOneSheet_([{ name: SHEET_DASH, header: DASH_HEADER }]);
  if (madeSheetStop_(made, '광고 운영 현황')) return;

  var led = adSpendRead_();
  var pol = adPolicyAll_();
  var today = ymd_(new Date());
  var wkFrom = weekStart_(today);
  var d7 = addDays_(today, -6);

  // 어느 캠페인이 우리 것이고 어느 트랙인가
  var ours = adWatchOurs_(), ownById = {};
  for (var i = 0; i < ours.length; i++) ownById[ours[i].cid] = ours[i];

  var rows = [];
  var add = function (sec, item, val, why) { rows.push([sec, item, val, why || '']); };

  // ── 자료 ────────────────────────────────────────────
  var lag = led.last ? daysBetween_(led.last, today) : -1;
  add('자료', '지출 원장 기준일', led.last || '(없음)',
      led.has ? (lag + '일 전까지의 자료입니다. 그 뒤 쓴 돈은 아직 안 잡혔습니다.')
              : '[지출 원장 수집]을 먼저 하세요 — 이것이 없으면 여력을 계산할 수 없습니다.');
  add('자료', '지출 원장 줄 수', led.rows.length,
      '캠페인 × 날짜. 예산 관제가 보는 지출은 이 표 하나입니다.');
  if (led.has && lag > 2) {
    add('자료', '⚠ 자료가 오래됐습니다', lag + '일 전',
        '자료가 늦을수록 미집계 준비액이 커지고 여력이 줄어듭니다. 다시 수집하세요.');
  }

  // ── 지출 ────────────────────────────────────────────
  var wins = [['이번 주', wkFrom, today], ['최근 7일', d7, today]];
  if (led.has) {
    var days = {}, first = '';
    for (var q = 0; q < led.rows.length; q++) {
      days[led.rows[q].d] = true;
      if (!first || led.rows[q].d < first) first = led.rows[q].d;
    }
    wins.push(['원장 전체 (' + first + '~' + led.last + ')', first, led.last]);
  }
  for (var w = 0; w < wins.length; w++) {
    var sp = dashSpendSplit_(led, wins[w][1], wins[w][2], ownById);
    add('지출 · ' + wins[w][0], '트랙 A (관리)', fmtYen_(sp.A) + dashPct_(sp.A, sp.total), '');
    add('지출 · ' + wins[w][0], '트랙 B (관리)', fmtYen_(sp.B) + dashPct_(sp.B, sp.total), '');
    add('지출 · ' + wins[w][0], '관리 밖 (기존 광고)',
        fmtYen_(sp['밖']) + dashPct_(sp['밖'], sp.total),
        '우리가 만들지 않은 옛 캠페인. 지금 한도가 덮지 않습니다.');
    add('지출 · ' + wins[w][0], '계정 전체', fmtYen_(sp.total), '');
  }

  // ── 한도 ────────────────────────────────────────────
  var wkNow = dashSpendSplit_(led, wkFrom, today, ownById);
  var covered = wkNow.A + wkNow.B;
  add('한도', '한도가 덮는 범위', fmtYen_(covered) + ' / ' + fmtYen_(wkNow.total) +
      dashPct_(covered, wkNow.total),
      '이번 주 계정 전체 지출 중 정책 한도가 걸린 몫. 나머지는 옛 캠페인이라 ' +
      '여기서 멈출 수 없습니다.');

  var nReady = 0, nAuto = 0, nMiss = 0;
  for (var p = 0; p < pol.rows.length; p++) {
    if (pol.rows[p].ready) nReady++; else nMiss++;
    if (pol.rows[p].canAuto) nAuto++;
  }
  add('한도', '정책 줄', pol.rows.length + '개 (유효 ' + nReady + ' · 미확정 ' + nMiss + ')',
      nMiss ? '미확정인 대상은 새로 켜지지도 증액되지도 않습니다.' : '');
  add('한도', '자동운영 중인 정책', nAuto + '개',
      nAuto ? '이 대상들은 한도 안에서 프로그램이 스스로 바꿉니다.'
            : '지금은 아무것도 자동으로 바뀌지 않습니다 (전부 모의운영 또는 미확정).');

  var polA = adPolicyFor_(pol, 'A', '전체');
  add('한도', '트랙 A 주간 지출한도',
      polA && polA.weekSpend > 0 ? fmtYen_(polA.weekSpend) : '안 정함',
      polA && polA.weekSpend > 0
        ? '이번 주 트랙 A 지출 ' + fmtYen_(wkNow.A) + dashPct_(wkNow.A, polA.weekSpend)
        : '광고운영정책 표에서 정하세요. 비어 있으면 무제한이 아니라 "멈춤" 입니다.');

  // ── 트랙 B 상품별 ───────────────────────────────────
  var gsh = ss_().getSheetByName(SHEET_ADGROW);
  var stage = {}, nB = 0;
  if (gsh && gsh.getLastRow() > 1) {
    var gmap = hdrMap_(gsh);
    var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1,
                          Math.max(gsh.getLastColumn(), 1)).getValues();
    for (var g = 0; g < gv.length; g++) {
      var sku = String(gv[g][AG_SKU] || '').trim();
      if (!sku) continue;
      nB++;
      var st = String(cellOf_(gv[g], gmap, '단계', '(점검 안 함)'));
      stage[st] = (stage[st] || 0) + 1;
      var bp = adPolicyFor_(pol, 'B', sku);
      add('트랙 B · ' + sku, st,
          '주간 ' + cellOf_(gv[g], gmap, '주간지출(JPY)', 0) +
          '엔 · 위험손실 ' + cellOf_(gv[g], gmap, '주간위험손실(JPY)', 0) +
          '엔 · 여력 ' + cellOf_(gv[g], gmap, '주간여력(JPY)', '?'),
          String(cellOf_(gv[g], gmap, '다음 행동', '')).substring(0, 160));
      if (bp && !bp.ready) {
        add('트랙 B · ' + sku, '정책 미확정', bp.miss.join(' · '),
            '이 다섯 칸이 차야 이 상품이 움직입니다.');
      }
    }
  }
  add('트랙 B', '상품 수', nB + '개',
      Object.keys(stage).map(function (k) { return k + ' ' + stage[k]; }).join(' · '));

  // ── 요청함 ──────────────────────────────────────────
  var ish = ss_().getSheetByName(SHEET_INBOX);
  var openN = 0, kinds = {};
  if (ish && ish.getLastRow() > 1) {
    var imap = hdrMap_(ish);
    var iv = ish.getRange(2, 1, ish.getLastRow() - 1,
                          Math.max(ish.getLastColumn(), 1)).getValues();
    for (var r2 = 0; r2 < iv.length; r2++) {
      if (String(cellOf_(iv[r2], imap, '상태', '')) !== INBOX_OPEN) continue;
      openN++;
      var kk = String(cellOf_(iv[r2], imap, '종류', ''));
      kinds[kk] = (kinds[kk] || 0) + 1;
    }
  }
  add('요청함', '열린 요청', openN + '건',
      Object.keys(kinds).map(function (k) { return k + ' ' + kinds[k]; }).join(' · ') ||
      '사람이 정해야 할 것이 없습니다.');

  // ── 다음에 할 일 ────────────────────────────────────
  var todo = [];
  if (!led.has) todo.push('[지출 원장 수집] — 이것이 없으면 여력을 계산할 수 없습니다');
  else if (lag > 2) todo.push('[지출 원장 수집] 다시 — 자료가 ' + lag + '일 전입니다');
  if (nMiss) todo.push('광고운영정책 표에서 한도를 정하고 [승인] 체크 (' + nMiss + '줄)');
  if (kinds['B마진']) todo.push('광고육성 표에 마진율 적기 (' + kinds['B마진'] + '개)');
  if (kinds['순위입력']) todo.push('[순위 적을 줄 만들기] → 순위 적기 (' + kinds['순위입력'] + '개)');
  if (!todo.length) todo.push('사람이 할 일이 없습니다 — 정해진 주기대로 돌면 됩니다');
  for (var t = 0; t < todo.length; t++) add('다음에 할 일', (t + 1) + '번', todo[t], '');

  var sh = ss_().getSheetByName(SHEET_DASH);
  ensureCols_(sh, DASH_HEADER);
  writeTable_(sh, DASH_HEADER, rows);
  sh.getRange(1, 1, 1, DASH_HEADER.length).setValues([DASH_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');

  showSheet_(SHEET_DASH);
  ui_().alert('광고 운영 현황',
    (led.has ? '지출 자료 ' + led.last + ' 까지 (' + lag + '일 전)'
             : '⛔ 지출 원장이 비어 있습니다') + '\n\n' +
    '이번 주 — 트랙 A ' + fmtYen_(wkNow.A) + ' · 트랙 B ' + fmtYen_(wkNow.B) +
    ' · 관리 밖 ' + fmtYen_(wkNow['밖']) + '\n' +
    '한도가 덮는 몫 ' + fmtYen_(covered) + ' / ' + fmtYen_(wkNow.total) +
    dashPct_(covered, wkNow.total) + '\n\n' +
    '자동운영 정책 ' + nAuto + '개 · 미확정 ' + nMiss + '개 · 열린 요청 ' + openN + '건\n\n' +
    todo[0], ui_().ButtonSet.OK);
}
