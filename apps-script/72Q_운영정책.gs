/**
 * 72Q_운영정책.gs — 정책(한도) · 요청함 · 머리글로 열 찾기
 *
 * ── 왜 정책 표가 따로 있나 ──────────────────────────────
 * 지금까지는 줄마다 승인 체크를 받아 한 번씩 실행했다. 새 기획은 그 대신
 * "처음에 정한 한도 안에서는 자동으로 실행한다" 로 간다. 그러려면 한도가
 * 어딘가에 명시적으로, 버전과 승인 시각과 함께 적혀 있어야 한다.
 * 줄마다 찍힌 옛 체크를 정책 승인으로 바꿔 읽지 않는다 — 그것은 그때 그 한 번을
 * 허락한 것이지 앞으로를 허락한 것이 아니다.
 *
 * ── 무엇이 비면 멈추고, 무엇이 비면 무제한인가 ─────────
 * 반드시 있어야 하는 것 (비면 그 대상은 아무것도 안 함):
 *   주간 지출한도 · 주간 손실한도 · 최대 기간
 * 이 셋이면 총 노출이 이미 갇힌다 — 최악이라도 주간 한도 × (기간 ÷ 7) 이다.
 *
 * 비워도 되는 것 (비면 '따로 제한 없음'):
 *   누적 지출한도 · 누적 손실한도
 * 주간과 기간으로 이미 막히므로 굳이 두 번 막지 않는다. 적으면 그 값이
 * 주간보다 먼저 걸리는 더 좁은 울타리가 된다 (2026-09-07 에 사람이 정한 것).
 *
 * 기존 캠페인 예산의 합이나 시트에 남아 있던 옛 숫자를 승인된 한도로 삼지 않는다.
 * 광고육성 표의 주간허용손해 4,500엔은 과거 설정이지 이번 정책의 승인값이 아니다.
 *
 * ── 머리글로 열을 찾는다 ────────────────────────────────
 * 지금까지는 열 번호를 상수로 박아 뒀다. 표에 칸을 하나 끼워 넣으면 그 아래가
 * 전부 어긋난다. 앞으로 붙는 칸은 머리글 이름으로 찾는다 —
 * 표를 지우고 다시 만들지 않고, 없는 칸만 뒤에 붙인다.
 */

// ── 머리글로 열 찾기 ────────────────────────────────────

/** 1행을 읽어 {머리글: 0부터 센 자리} 로. 빈 머리글은 건너뛴다 */
function hdrMap_(sh) {
  var out = {};
  var n = Math.max(sh.getLastColumn(), 1);
  var row = sh.getRange(1, 1, 1, n).getValues()[0];
  for (var i = 0; i < row.length; i++) {
    var k = String(row[i] == null ? '' : row[i]).trim();
    if (k && out[k] === undefined) out[k] = i;
  }
  return out;
}

/**
 * 없는 머리글을 표 뒤에 붙이고 {머리글: 자리} 를 준다.
 *
 * 기존 칸은 건드리지 않는다 — 옛 코드가 아직 열 번호 상수를 쓰고 있어서,
 * 사이에 끼워 넣으면 그 아래가 전부 어긋난다. 새 칸은 언제나 뒤에.
 */
function ensureCols_(sh, names) {
  var map = hdrMap_(sh);
  var add = [];
  for (var i = 0; i < names.length; i++) if (map[names[i]] === undefined) add.push(names[i]);
  if (!add.length) return map;
  // 빈 시트는 getLastColumn() 이 0 이다. 그때 +1 을 하면 2번 칸부터 쓰게 된다
  var lastCol = sh.getLastColumn();
  var at = lastCol > 0 ? lastCol + 1 : 1;
  fitCols_(sh, at + add.length - 1);
  sh.getRange(1, at, 1, add.length).setValues([add])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  for (var j = 0; j < add.length; j++) map[add[j]] = at - 1 + j;
  SpreadsheetApp.flush();     // 칸 붙이기는 구조 변경이라 다음 쓰기 전에 확정한다
  return map;
}

/** 머리글 이름으로 값 읽기. 칸이 없거나 비면 기본값 */
function cellOf_(row, map, name, dflt) {
  var i = map[name];
  if (i === undefined || i >= row.length) return dflt;
  var v = row[i];
  return (v === '' || v === null || v === undefined) ? dflt : v;
}

/** 머리글 이름으로 값 쓰기 (메모리의 줄에). 칸이 없으면 아무것도 안 한다 */
function setCell_(row, map, name, value) {
  var i = map[name];
  if (i === undefined) return;
  while (row.length <= i) row.push('');
  row[i] = value;
}

/** 체크박스 칸 읽기 — TRUE 글자와 참 값을 둘 다 받는다 */
function cellTrue_(row, map, name) {
  var v = cellOf_(row, map, name, false);
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

// ── 운영 정책 ───────────────────────────────────────────

var SHEET_POLICY = '광고운영정책';
var POLICY_HEADER = [
  '정책ID', '버전', '소유트랙', '대상', '모드',
  '주간 지출한도(JPY)', '주간 손실한도(JPY)',
  '누적 지출한도(JPY)', '누적 손실한도(JPY)', '최대 기간(일)',
  '시작일', '승인', '승인자', '승인시각', '상태', '무엇이 비었나', '비고'
];

/** 모드 — 무엇까지 자동으로 할 것인가 */
var POLICY_MODE_DRY = '모의운영';      // 계산·표시만. 아마존을 건드리지 않는다
var POLICY_MODE_AUTO = '자동운영';     // 한도 안에서 생성·입찰·예산·중단을 자동으로
var POLICY_MODE_HOLD = '일시정지';     // 새 변경을 멈춘다 (켜져 있는 광고를 끄지는 않는다)
var POLICY_MODES = [POLICY_MODE_DRY, POLICY_MODE_AUTO, POLICY_MODE_HOLD];

/**
 * 트랙마다 반드시 채워져야 하는 한도.
 *
 * 트랙 B 는 지출과 손실이 다른 값이다 — 주문이 0이면 손실은 광고비 전액이라
 * 지출한도만으로는 손실을 막지 못한다. 그래서 주간은 둘 다 받는다.
 * 최대 기간까지 있으면 총 노출이 갇히므로 누적 두 칸은 비워도 된다 (= 제한 없음).
 */
var POLICY_NEED = {
  A: ['주간 지출한도(JPY)'],
  B: ['주간 지출한도(JPY)', '주간 손실한도(JPY)', '최대 기간(일)']
};

/** 비워 두면 '따로 제한 없음' 인 칸 — 사람에게 그렇게 보여 준다 */
var POLICY_OPTIONAL = ['누적 지출한도(JPY)', '누적 손실한도(JPY)'];

/**
 * 정책 한 줄을 읽어 쓸 수 있는 꼴로.
 * 필수 한도가 하나라도 비면 ready=false — 그 대상은 켜지지도 증액되지도 않는다.
 */
function adPolicyParse_(row, map) {
  var track = String(cellOf_(row, map, '소유트랙', '')).trim().toUpperCase();
  var need = POLICY_NEED[track] || [];
  var miss = [];
  for (var i = 0; i < need.length; i++) {
    if (!(Number(cellOf_(row, map, need[i], 0)) > 0)) miss.push(need[i]);
  }
  var approved = cellTrue_(row, map, '승인');
  var mode = String(cellOf_(row, map, '모드', POLICY_MODE_DRY)).trim() || POLICY_MODE_DRY;
  if (POLICY_MODES.indexOf(mode) < 0) { mode = POLICY_MODE_DRY; miss.push('모드(값이 이상함)'); }
  if (!approved) miss.push('승인');
  return {
    id: String(cellOf_(row, map, '정책ID', '')).trim(),
    ver: Number(cellOf_(row, map, '버전', 1)) || 1,
    track: track,
    target: String(cellOf_(row, map, '대상', '')).trim(),
    mode: mode,
    weekSpend: Number(cellOf_(row, map, '주간 지출한도(JPY)', 0)) || 0,
    weekLoss: Number(cellOf_(row, map, '주간 손실한도(JPY)', 0)) || 0,
    totalSpend: Number(cellOf_(row, map, '누적 지출한도(JPY)', 0)) || 0,
    totalLoss: Number(cellOf_(row, map, '누적 손실한도(JPY)', 0)) || 0,
    maxDays: Number(cellOf_(row, map, '최대 기간(일)', 0)) || 0,
    start: cellOf_(row, map, '시작일', ''),
    approved: approved,
    miss: miss,
    ready: miss.length === 0,
    // 자동으로 아마존을 바꿔도 되는가 — 승인 + 한도 + 자동운영 모드가 모두 필요하다
    canAuto: miss.length === 0 && mode === POLICY_MODE_AUTO
  };
}

/** 정책 전부. 트랙+대상으로 찾을 수 있게 색인도 준다 */
function adPolicyAll_() {
  var out = { rows: [], byKey: {} };
  var sh = ss_().getSheetByName(SHEET_POLICY);
  if (!sh || sh.getLastRow() < 2) return out;
  var map = hdrMap_(sh);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues();
  for (var i = 0; i < v.length; i++) {
    if (!String(cellOf_(v[i], map, '대상', '')).trim()) continue;
    var p = adPolicyParse_(v[i], map);
    p.row = i + 2;
    out.rows.push(p);
    out.byKey[p.track + ' ' + p.target] = p;
  }
  return out;
}

/** 이 트랙·대상의 정책. 없으면 null — 없는 것과 비어 있는 것은 다르다 */
function adPolicyFor_(all, track, target) {
  return all.byKey[String(track).toUpperCase() + ' ' + String(target).trim()] || null;
}

/**
 * 메뉴: 정책 표를 만들고 정비한다.
 *
 * 트랙 B 상품마다 한 줄, 트랙 A 전체에 한 줄을 둔다. 한도는 비워 둔 채로 만든다 —
 * 여기에 기본값을 넣으면 사람이 정하지 않은 금액이 승인된 것처럼 보인다.
 * 대신 무엇이 비었는지 [무엇이 비었나] 칸과 요청함에 적는다.
 */
/**
 * 육성 표에 있는데 정책 줄이 없는 SKU 의 줄을 만든다 (한도는 비운 채로).
 *
 * 상품을 등록한 뒤 사람이 [운영 정책 만들기] 를 눌러야만 줄이 생겼다.
 * 안 누르면 단계가 '입력대기' 에 머무는데, 표에는 "정책 줄이 없습니다" 라고만
 * 적혀 있어 무엇을 눌러야 하는지 알기 어려웠다. 줄은 프로그램이 만들고,
 * 한도는 사람이 채운다 — 빈 한도는 여전히 '멈춤' 이라 돈이 나가지 않는다.
 *
 * @return {{added:number, skus:Array}} 새로 만든 줄
 */
function adPolicyEnsureGrowRows_() {
  var out = { added: 0, skus: [] };
  var sh = ss_().getSheetByName(SHEET_POLICY);
  var gsh = ss_().getSheetByName(SHEET_ADGROW);
  if (!sh || !gsh || gsh.getLastRow() < 2) return out;      // 표가 없으면 여기서 만들지 않는다

  var map = ensureCols_(sh, POLICY_HEADER);
  var last = sh.getLastRow();
  var have = {}, nRows = 0;
  if (last > 1) {
    var ex = sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), 1)).getValues();
    for (var i = 0; i < ex.length; i++) {
      var tg = String(cellOf_(ex[i], map, '대상', '')).trim();
      if (!tg) continue;
      nRows++;
      have[String(cellOf_(ex[i], map, '소유트랙', '')).trim().toUpperCase() + ' ' + tg] = true;
    }
  }

  var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1, ADGROW_HEADER.length).getValues();
  var width = Math.max(sh.getLastColumn(), POLICY_HEADER.length);
  var add = [], req = [];
  for (var g = 0; g < gv.length; g++) {
    var sku = String(gv[g][AG_SKU] || '').trim();
    if (!sku || have['B ' + sku]) continue;
    have['B ' + sku] = true;
    var row = new Array(width).fill('');
    setCell_(row, map, '정책ID', 'B' + (nRows + add.length + 1));
    setCell_(row, map, '버전', 1);
    setCell_(row, map, '소유트랙', 'B');
    setCell_(row, map, '대상', sku);
    setCell_(row, map, '모드', POLICY_MODE_DRY);
    setCell_(row, map, '승인', false);
    setCell_(row, map, '상태', '미확정');
    setCell_(row, map, '무엇이 비었나', POLICY_NEED.B.join(' · ') + ' · 승인');
    setCell_(row, map, '비고', String(gv[g][AG_NAME] || '').substring(0, 40));
    add.push(row);
    out.skus.push(sku);
    req.push({ kind: '한도확정', target: 'B · ' + sku,
               what: POLICY_NEED.B.join(' · ') + ' · 승인',
               now: '(빈칸 — 이 다섯 칸이 차고 [모드]가 ' + POLICY_MODE_AUTO +
                    ' 여야 이 상품이 움직입니다)' });
  }
  if (!add.length) return out;

  var at = Math.max(last, 1) + 1;
  var need = at + add.length - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(at, 1, add.length, width).setValues(add);
  sh.getRange(at, map['승인'] + 1, add.length, 1).insertCheckboxes();
  sh.getRange(at, map['모드'] + 1, add.length, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(POLICY_MODES, true)
      .setAllowInvalid(false).build());
  adInboxAdd_(req);
  log_('ads', 'INFO', '운영 정책 줄 자동 생성 ' + add.length + '개: ' + out.skus.join(', '));
  out.added = add.length;
  return out;
}

function setupAdPolicy() {
  // 이 작업이 쓸 표를 먼저. 한 실행에 하나만 만든다 (문서가 무겁다)
  var made = makeOneSheet_([{ name: SHEET_POLICY, header: POLICY_HEADER },
                            { name: SHEET_INBOX, header: INBOX_HEADER }]);
  if (madeSheetStop_(made, '⓪ 운영 정책 만들기 · 정비')) return;

  var sh = ss_().getSheetByName(SHEET_POLICY);
  var hadBox = sh.getLastRow() > 1;
  var map = ensureCols_(sh, POLICY_HEADER);
  var have = {}, rows = [];
  if (sh.getLastRow() > 1) {
    rows = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues();
    for (var i = 0; i < rows.length; i++) {
      var tk = String(cellOf_(rows[i], map, '소유트랙', '')).trim().toUpperCase();
      var tg = String(cellOf_(rows[i], map, '대상', '')).trim();
      if (tg) have[tk + ' ' + tg] = true;
    }
  }

  var want = [{ track: 'A', target: '전체', note: '트랙 A(재배분) 전체에 걸리는 한도' }];
  var gsh = ss_().getSheetByName(SHEET_ADGROW);
  if (gsh && gsh.getLastRow() > 1) {
    var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1, ADGROW_HEADER.length).getValues();
    for (var g = 0; g < gv.length; g++) {
      var sku = String(gv[g][AG_SKU] || '').trim();
      if (sku) want.push({ track: 'B', target: sku,
                           note: String(gv[g][AG_NAME] || '').substring(0, 40) });
    }
  }

  var added = 0, width = Math.max(sh.getLastColumn(), POLICY_HEADER.length);
  for (var w = 0; w < want.length; w++) {
    var key = want[w].track + ' ' + want[w].target;
    if (have[key]) continue;
    var row = new Array(width).fill('');
    setCell_(row, map, '정책ID', want[w].track + (rows.length + 1));
    setCell_(row, map, '버전', 1);
    setCell_(row, map, '소유트랙', want[w].track);
    setCell_(row, map, '대상', want[w].target);
    setCell_(row, map, '모드', POLICY_MODE_DRY);
    setCell_(row, map, '승인', false);
    setCell_(row, map, '비고', want[w].note);
    rows.push(row); added++;
  }

  // 상태와 '무엇이 비었나' 는 언제나 다시 계산한다 — 사람이 한도를 채우면 바로 보이게
  var nReady = 0, nAuto = 0, req = [];
  for (var r = 0; r < rows.length; r++) {
    if (!String(cellOf_(rows[r], map, '대상', '')).trim()) continue;
    var p = adPolicyParse_(rows[r], map);
    setCell_(rows[r], map, '상태', p.ready ? '유효 · ' + p.mode : '미확정');
    setCell_(rows[r], map, '무엇이 비었나', p.miss.join(' · '));
    if (p.ready) nReady++;
    if (p.canAuto) nAuto++;
    if (!p.ready) {
      req.push({ kind: '한도확정', target: p.track + ' · ' + p.target,
                 what: p.miss.join(' · '),
                 now: p.track === 'B'
                   ? '광고육성 표의 옛 값(주간허용손해 등)은 참고만 — 승인된 한도가 아닙니다'
                   : '' });
    } else {
      adInboxClose_('한도확정', p.track + ' · ' + p.target);
    }
  }

  var need = Math.max(rows.length + 1, 2);
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
  // 체크박스 넣기는 구조를 바꾸는 일이라 새로 생긴 줄에만 한다
  if (rows.length && (!hadBox || added)) {
    sh.getRange(2, map['승인'] + 1, rows.length, 1).insertCheckboxes();
  }
  // [모드]는 골라 넣게 한다 — 오타가 나면 조용히 모의운영으로 떨어져
  // "왜 자동으로 안 도나" 를 한참 찾게 된다
  if (rows.length) {
    sh.getRange(2, map['모드'] + 1, rows.length, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(POLICY_MODES, true)
        .setAllowInvalid(false).build());
  }
  adPolicyNotes_(sh);
  var nReq = adInboxAdd_(req);

  showSheet_(SHEET_POLICY);
  ui_().alert('운영 정책',
    '정책 줄 ' + rows.length + '개' + (added ? ' (새로 ' + added + '개)' : '') + '\n' +
    '한도가 다 찬 줄 ' + nReady + '개 · 자동운영 ' + nAuto + '개\n' +
    (nReq ? '요청함에 ' + nReq + '건 넣었습니다\n' : '') + '\n' +
    '반드시 채울 것: ' + POLICY_NEED.B.join(' · ') + '\n' +
    '   이 칸이 비면 그 대상은 새로 켜지지도 증액되지도 않습니다 (무제한이 아니라 멈춤).\n' +
    '비워도 되는 것: ' + POLICY_OPTIONAL.join(' · ') + '\n' +
    '   비우면 "따로 제한 없음" 입니다 — 주간 한도와 최대 기간이 이미 총량을 가둡니다.\n\n' +
    '① 한도를 적고  ② [모드]를 정하고  ③ [승인]을 체크하세요.\n' +
    '   ' + POLICY_MODE_DRY + ' = 계산·표시만\n' +
    '   ' + POLICY_MODE_AUTO + ' = 한도 안에서 아마존을 바꿈\n' +
    '   ' + POLICY_MODE_HOLD + ' = 새 변경을 멈춤 (켜진 광고를 끄지는 않음)',
    ui_().ButtonSet.OK);
}

function adPolicyNotes_(sh) {
  notesByName_(sh, {
    '대상': '트랙 B 는 SKU 하나. 트랙 A 는 "전체".',
    '모드': POLICY_MODE_DRY + ' = 계산·표시만, 아마존을 건드리지 않는다\n' +
            POLICY_MODE_AUTO + ' = 한도 안에서 생성·입찰·예산·중단을 자동으로\n' +
            POLICY_MODE_HOLD + ' = 새 변경을 멈춘다 (켜져 있는 광고를 끄지는 않는다)',
    '주간 지출한도(JPY)': '한 주에 이 대상에 쓸 수 있는 광고비.\n' +
      '비우면 "안 정함" — 켜지지도 증액되지도 않는다.',
    '주간 손실한도(JPY)': '한 주에 잃어도 좋은 돈. 손실 = 광고비 − 검증된 공헌이익.\n' +
      '주문이 0이면 손실은 광고비 전액이다 — 지출한도와 손실한도는 다른 값이다.',
    '누적 지출한도(JPY)': '이 육성이 끝날 때까지 통틀어 쓸 수 있는 광고비.\n' +
      '비워도 된다 — 비우면 "따로 제한 없음" 이다 (주간 한도와 최대 기간이 이미 총량을 가둔다).\n' +
      '적으면 주간보다 먼저 걸리는 더 좁은 울타리가 된다.',
    '누적 손실한도(JPY)': '통틀어 잃어도 좋은 돈. 여기 닿으면 멈춘다.\n' +
      '비워도 된다 — 비우면 "따로 제한 없음".',
    '최대 기간(일)': '시작일부터 이만큼 지나면 멈춘다. 이것은 반드시 있어야 한다 —\n' +
      '누적 한도를 비워 두면 총 노출을 가두는 것이 주간 한도와 이 값뿐이다.',
    '승인': '체크해야 이 정책이 산다.\n옛 줄별 체크를 정책 승인으로 바꿔 읽지 않는다.',
    '상태': '자동으로 계산한다. 한도·모드·승인이 다 있어야 "유효".',
    '무엇이 비었나': '자동으로 계산한다. 여기가 비어야 그 대상이 움직인다.'
  });
}

// ── 요청함 ─────────────────────────────────────────────

var SHEET_INBOX = '광고요청함';
var INBOX_HEADER = ['요청ID', '등록시각', '종류', '대상', '무엇이 필요한가',
                    '지금 값', '상태', '처리시각', '비고'];
var INBOX_OPEN = '열림';
var INBOX_DONE = '처리됨';

/**
 * 요청을 넣는다. 같은 종류·대상이 이미 열려 있으면 다시 넣지 않는다 —
 * 매일 도는 작업이 같은 요청을 쌓으면 요청함이 쓸모없어진다.
 * @return {number} 새로 넣은 건수
 */
function adInboxAdd_(reqs) {
  if (!reqs || !reqs.length) return 0;
  var sh = ss_().getSheetByName(SHEET_INBOX);
  if (!sh) return 0;              // 표는 부른 쪽이 미리 만든다 (한 실행에 하나만)
  var map = ensureCols_(sh, INBOX_HEADER);
  var open = {};
  var last = sh.getLastRow();
  if (last > 1) {
    var v = sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), 1)).getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(cellOf_(v[i], map, '상태', '')) !== INBOX_OPEN) continue;
      open[String(cellOf_(v[i], map, '종류', '')) + ' ' +
           String(cellOf_(v[i], map, '대상', ''))] = true;
    }
  }
  var width = Math.max(sh.getLastColumn(), INBOX_HEADER.length);
  var add = [], now = new Date();
  for (var r = 0; r < reqs.length; r++) {
    var q = reqs[r];
    var key = q.kind + ' ' + q.target;
    if (open[key]) continue;
    open[key] = true;
    var row = new Array(width).fill('');
    setCell_(row, map, '요청ID', 'R' + (Math.max(last - 1, 0) + add.length + 1));
    setCell_(row, map, '등록시각', now);
    setCell_(row, map, '종류', q.kind);
    setCell_(row, map, '대상', q.target);
    setCell_(row, map, '무엇이 필요한가', q.what || '');
    setCell_(row, map, '지금 값', q.now || '');
    setCell_(row, map, '상태', INBOX_OPEN);
    add.push(row);
  }
  if (!add.length) return 0;
  var at = Math.max(last, 1) + 1;
  var need = at + add.length - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(at, 1, add.length, width).setValues(add);
  sh.setFrozenRows(1);
  return add.length;
}

/** 그 종류·대상의 열린 요청을 닫는다 (사람이 값을 채웠을 때 자동으로) */
function adInboxClose_(kind, target) {
  var sh = ss_().getSheetByName(SHEET_INBOX);
  if (!sh || sh.getLastRow() < 2) return 0;
  var map = hdrMap_(sh);
  var width = Math.max(sh.getLastColumn(), 1);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  var n = 0, now = new Date();
  for (var i = 0; i < v.length; i++) {
    if (String(cellOf_(v[i], map, '상태', '')) !== INBOX_OPEN) continue;
    if (String(cellOf_(v[i], map, '종류', '')) !== kind) continue;
    if (target !== null && String(cellOf_(v[i], map, '대상', '')) !== target) continue;
    setCell_(v[i], map, '상태', INBOX_DONE);
    setCell_(v[i], map, '처리시각', now);
    n++;
  }
  if (n) sh.getRange(2, 1, v.length, width).setValues(v);
  return n;
}

/** 메뉴: 요청함 열기 */
function showAdInbox() {
  var made = makeOneSheet_([{ name: SHEET_INBOX, header: INBOX_HEADER }]);
  if (madeSheetStop_(made, '요청함')) return;
  var sh = ss_().getSheetByName(SHEET_INBOX);
  ensureCols_(sh, INBOX_HEADER);
  var open = 0, kinds = {};
  if (sh.getLastRow() > 1) {
    var map = hdrMap_(sh);
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(cellOf_(v[i], map, '상태', '')) !== INBOX_OPEN) continue;
      open++;
      var k = String(cellOf_(v[i], map, '종류', ''));
      kinds[k] = (kinds[k] || 0) + 1;
    }
  }
  showSheet_(SHEET_INBOX);
  ui_().alert('요청함',
    '열린 요청 ' + open + '건\n' +
    Object.keys(kinds).map(function (k) { return '   ' + k + ' ' + kinds[k]; }).join('\n') +
    (open ? '\n\n' : '\n') +
    '사람이 값을 정해야 프로그램이 다음으로 갈 수 있는 것만 모읍니다.\n' +
    '값을 채우면 다음 점검에서 자동으로 닫힙니다.', ui_().ButtonSet.OK);
}
