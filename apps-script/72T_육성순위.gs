/**
 * 72T_육성순위.gs — 순위 관측 기록 (기획서 9.6)
 *
 * ── 왜 숫자 한 칸으로는 안 되나 ─────────────────────────
 * 광고육성 표의 [오가닉순위] 는 숫자 한 칸이다. 그것만으로는
 *   언제 잰 것인지 · 어떤 말로 잰 것인지 · 어디서 어떻게 잰 것인지
 * 를 알 수 없다. 순위는 검색어마다 다르고, 지역·기기·시각마다 흔들린다.
 * 그 숫자 하나로 "목표에 닿았다" 를 판정하면 흔들림을 성과로 읽게 된다.
 *
 * 그래서 관측을 줄로 쌓는다. 측정키는 이렇다:
 *   마켓플레이스 + ASIN + 검색어 + 측정시각 + 측정방법 + 배송지역 + 기기
 *
 * ── 못 찾은 것과 100위는 다르다 ─────────────────────────
 * 검색 결과 안에서 못 찾았으면 '측정범위밖' 과 몇 위까지 봤는지를 적는다.
 * 0 이나 999 를 넣어 평균에 섞지 않는다 — 그러면 안 보이던 상품이
 * 갑자기 999위에서 50위가 된 것처럼 보여 개선으로 읽힌다.
 *
 * ── 오래된 순위로 졸업시키지 않는다 ─────────────────────
 * 관측이 [순위 유효기간] 보다 오래되면 졸업·과투자 판정을 보류한다.
 * 모르는 것을 아는 척하지 않는다.
 */

var SHEET_ADRANK = '광고육성순위';
var ADRANK_HEADER = [
  '관측ID', '측정시각', '마켓플레이스', 'SKU', 'ASIN', '검색어',
  '순위종류', '순위', '상태', '검색깊이', '측정방법', '배송지역', '기기', '비고'
];

/** 순위 종류 — 서로 다른 개념이라 섞지 않는다 */
var RANK_KIND_ORGANIC = '오가닉검색';
var RANK_KIND_AD = '광고슬롯';
var RANK_KIND_BSR = '판매순위';

/** 관측 상태 */
var RANK_OK = '측정됨';
var RANK_OUT = '측정범위밖';      // 검색깊이까지 봤는데 못 찾음
var RANK_NONE = '미측정';         // 아직 안 쟀음

var ADRANK_MARKET_DEFAULT = 'amazon.co.jp';
var ADRANK_DEPTH_DEFAULT = 100;   // 몇 위까지 보고 없으면 '측정범위밖' 이라 할 것인가
var ADRANK_FRESH_DAYS = 7;        // 이보다 오래된 관측으로는 졸업을 판정하지 않는다
var ADRANK_MEDIAN_N = 3;          // 최근 이만큼의 중앙값을 그 상품의 순위로 본다

/**
 * 관측을 읽어 SKU 마다 요약한다.
 *
 * 최근 것 몇 개의 중앙값을 쓴다 — 한 번의 관측은 그날의 흔들림일 수 있다.
 * '측정범위밖' 은 중앙값 계산에 넣지 않되, 몇 번 있었는지는 센다.
 *
 * @return {Object} SKU → {rank, at, n, out, prev, delta, stale, kw}
 */
function adRankSummary_(todayYmd) {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADRANK);
  if (!sh || sh.getLastRow() < 2) return out;
  var map = hdrMap_(sh);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).getValues();

  var by = {};
  for (var i = 0; i < v.length; i++) {
    var sku = String(cellOf_(v[i], map, 'SKU', '')).trim();
    if (!sku) continue;
    if (String(cellOf_(v[i], map, '순위종류', RANK_KIND_ORGANIC)) !== RANK_KIND_ORGANIC) continue;
    var at = adLogYmd_(cellOf_(v[i], map, '측정시각', ''));
    if (!at) continue;
    var state = String(cellOf_(v[i], map, '상태', '')).trim();
    var rank = Number(cellOf_(v[i], map, '순위', 0)) || 0;
    if (state === RANK_NONE || (!rank && state !== RANK_OUT)) continue;   // 아직 안 적은 줄
    (by[sku] || (by[sku] = [])).push({
      at: at, rank: rank, out: state === RANK_OUT,
      kw: String(cellOf_(v[i], map, '검색어', '')).trim(),
      depth: Number(cellOf_(v[i], map, '검색깊이', 0)) || 0
    });
  }

  for (var s in by) {
    var arr = by[s];
    arr.sort(function (a, b) { return a.at < b.at ? 1 : (a.at > b.at ? -1 : 0) });  // 최근이 앞
    var recent = arr.slice(0, ADRANK_MEDIAN_N);
    var nums = [];
    for (var r = 0; r < recent.length; r++) if (!recent[r].out) nums.push(recent[r].rank);
    nums.sort(function (a, b) { return a - b; });
    var med = nums.length ? nums[Math.floor(nums.length / 2)] : 0;
    // 직전 묶음의 중앙값과 견줘 변화를 본다 (관측이 모자라면 변화를 말하지 않는다)
    var older = arr.slice(ADRANK_MEDIAN_N, ADRANK_MEDIAN_N * 2);
    var onums = [];
    for (var o = 0; o < older.length; o++) if (!older[o].out) onums.push(older[o].rank);
    onums.sort(function (a, b) { return a - b; });
    var omed = onums.length ? onums[Math.floor(onums.length / 2)] : 0;
    var outN = 0;
    for (var q = 0; q < recent.length; q++) if (recent[q].out) outN++;
    out[s] = {
      rank: med,                              // 0 = 최근 관측이 전부 '측정범위밖'
      at: arr[0].at,
      kw: arr[0].kw,
      n: nums.length,
      out: outN,
      prev: omed,
      delta: (med && omed) ? (omed - med) : null,      // 양수 = 순위가 올라옴
      stale: daysBetween_(arr[0].at, todayYmd) > ADRANK_FRESH_DAYS
    };
  }
  return out;
}

/**
 * 메뉴: 오늘 순위를 적을 줄을 준비한다.
 *
 * 사람에게 창을 띄워 하나씩 묻지 않는다 — 상품이 늘면 못 쓴다.
 * 대신 표에 빈 줄을 만들어 두고 [순위] 칸만 채우게 한다.
 * 못 찾았으면 [상태] 를 '측정범위밖' 으로 바꾸고 [순위] 는 비워 둔다.
 */
function addAdGrowRankRows() {
  var made = makeOneSheet_([{ name: SHEET_ADRANK, header: ADRANK_HEADER }]);
  if (madeSheetStop_(made, '순위 적을 줄 만들기')) return;

  var gsh = getSheetOrThrow_(SHEET_ADGROW);
  if (gsh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1, ADGROW_HEADER.length).getValues();

  var sh = ss_().getSheetByName(SHEET_ADRANK);
  var map = ensureCols_(sh, ADRANK_HEADER);
  var last = sh.getLastRow();
  var today = ymd_(new Date());

  // 오늘 이미 만들어 둔 (SKU, 검색어) 는 다시 만들지 않는다
  var todayHave = {};
  if (last > 1) {
    var ex = sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), 1)).getValues();
    for (var e = 0; e < ex.length; e++) {
      if (adLogYmd_(cellOf_(ex[e], map, '측정시각', '')) !== today) continue;
      todayHave[String(cellOf_(ex[e], map, 'SKU', '')) + ' ' +
                String(cellOf_(ex[e], map, '검색어', ''))] = true;
    }
  }

  var width = Math.max(sh.getLastColumn(), ADRANK_HEADER.length);
  var add = [], noKw = [], now = new Date();
  for (var i = 0; i < gv.length; i++) {
    var sku = String(gv[i][AG_SKU] || '').trim();
    if (!sku) continue;
    var kw = String(gv[i][AG_KW] || '').trim();
    if (!kw) { noKw.push(sku); continue; }        // 잴 말이 없으면 잴 수가 없다
    if (todayHave[sku + ' ' + kw]) continue;
    var row = new Array(width).fill('');
    setCell_(row, map, '관측ID', 'K' + (Math.max(last - 1, 0) + add.length + 1));
    setCell_(row, map, '측정시각', now);
    setCell_(row, map, '마켓플레이스', ADRANK_MARKET_DEFAULT);
    setCell_(row, map, 'SKU', sku);
    setCell_(row, map, 'ASIN', String(gv[i][AG_ASIN] || ''));
    setCell_(row, map, '검색어', kw);
    setCell_(row, map, '순위종류', RANK_KIND_ORGANIC);
    setCell_(row, map, '상태', RANK_NONE);
    setCell_(row, map, '검색깊이', ADRANK_DEPTH_DEFAULT);
    setCell_(row, map, '측정방법', '사람이 봄');
    add.push(row);
  }

  if (add.length) {
    var at = Math.max(last, 1) + 1;
    var need = at + add.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(at, 1, add.length, width).setValues(add);
  }
  adRankNotes_(sh);
  showSheet_(SHEET_ADRANK);
  ui_().alert('순위 적을 줄',
    (add.length ? add.length + '줄을 만들었습니다.\n\n' +
      '[순위] 칸에 몇 위인지 적고 [상태]를 "' + RANK_OK + '" 으로 바꾸세요.\n' +
      '검색깊이(' + ADRANK_DEPTH_DEFAULT + '위)까지 봤는데 없으면 [상태]만 "' +
      RANK_OUT + '" 으로 바꾸고 순위는 비워 두세요.\n\n'
      : '오늘 만들 줄이 없습니다 (이미 만들어 두었습니다).\n\n') +
    (noKw.length ? '⚠ [기준키워드]가 빈 상품 ' + noKw.length + '개는 뺐습니다: ' +
                   noKw.slice(0, 3).join(', ') + '\n   무슨 말로 잴지 정해야 순위를 잴 수 있습니다.\n\n' : '') +
    '순위는 같은 조건(지역·기기·로그아웃 상태)에서 재세요.\n' +
    '조건이 흔들리면 순위 변화가 아니라 조건 변화를 보게 됩니다.',
    ui_().ButtonSet.OK);
}

function adRankNotes_(sh) {
  notesByName_(sh, {
    '측정시각': '언제 잰 것인가. ' + ADRANK_FRESH_DAYS + '일보다 오래되면 졸업 판정을 보류한다.',
    '검색어': '순위는 검색어마다 다르다. 무슨 말로 잰 것인지가 순위의 절반이다.',
    '순위종류': RANK_KIND_ORGANIC + ' = 검색 결과의 자연 순위 (육성이 사려는 것)\n' +
                RANK_KIND_AD + ' = 광고 슬롯 위치\n' +
                RANK_KIND_BSR + ' = 카테고리 판매 순위\n서로 다른 개념이라 섞어 세지 않는다.',
    '순위': '몇 번째로 나오나. 못 찾았으면 비워 두고 [상태]를 "' + RANK_OUT + '" 으로.\n' +
            '0 이나 999 를 넣지 않는다 — 평균에 섞이면 흔들림이 성과로 보인다.',
    '상태': RANK_OK + ' = 잰 값이 있다\n' + RANK_OUT + ' = 검색깊이까지 봤는데 없었다\n' +
            RANK_NONE + ' = 아직 안 쟀다',
    '검색깊이': '몇 위까지 보고 "없다" 고 한 것인가. 이것이 없으면 "' + RANK_OUT + '" 이 무슨 뜻인지 모른다.',
    '배송지역': '순위는 배송지에 따라 달라진다. 같은 조건에서 재야 견줄 수 있다.',
    '기기': 'PC · 모바일. 결과가 다르다.'
  });
}
