/**
 * 86_addrword.gs — 주소·수취인 검사에 쓰는 낱말을 [주소낱말] 시트에서 고친다.
 *
 * ── 왜 만드는가 ─────────────────────────────────────────
 * 주문을 [오류확인] 으로 빼는 낱말이 코드 안에 다섯 덩어리로 흩어져 있었다.
 *   ORG_KEYWORDS    기관·법인    (株式会社, 病院, 店 …)      주소·이름, 확정
 *   FORWARD_STRONG  배송대행 상호 (tenso, Buyee …)          주소·이름, 확정
 *   FORWARD_WEAK    남의 집 수령  (様方, 気付 …)             주소·이름, 애매
 *   NAME_ORG_WORDS  이름 칸 상호  (SHOP, HOTEL …)           이름만, 확정
 *   NAME_ORG_WEAK   이름 칸 약함  (THE, JAPAN …)            이름만, 둘 이상이면 애매
 * 낱말을 더하거나 빼려면 코드를 고쳐야 했다. 특히 '店' 처럼 짧은 낱말은
 * 엉뚱한 주소까지 잡는데 뺄 방법이 없었다.
 *
 * ── 어떻게 바뀌는가 ────────────────────────────────────
 * 다섯 덩어리를 [주소낱말] 시트 한 장으로 모은다. 시트를 처음 만들 때 위 기본값을
 * 그대로 부어 넣고, 그 뒤로는 시트가 원본이다.
 *   · 줄을 지우면 그 낱말로는 더 이상 걸리지 않는다
 *   · 줄을 더하면 다음 검사부터 바로 걸린다
 *   · 판정을 '애매' 로 바꾸면 빼지 않고 노란색으로만 표시한다 (사람이 판단)
 *
 * 시트가 없으면 코드의 기본값으로 돈다 — 예전과 똑같이 동작한다.
 * [설정] 의 기관키워드_추가 · 배송대행지_추가 도 그대로 살아 있다 (시트에 더해서 본다).
 */

var SHEET_ADDRWORDS = '주소낱말';

// 갈래 — 어디를 보고, 어떻게 맞추는가
var ADDRW_ORG = '기관·법인';    // 주소·이름에서 부분일치 ('店' 하나로 支店·商店 을 잡는다)
var ADDRW_FWD = '배송대행지';   // 주소·이름에서 부분일치
var ADDRW_NAME = '이름낱말';    // 이름 칸에서만, 대문자 낱말 단위로 맞춘다
var ADDRW_KINDS = [ADDRW_ORG, ADDRW_FWD, ADDRW_NAME];

var ADDRW_HEADERS = ['낱말', '갈래', '판정', '메모'];

/**
 * 시트를 처음 만들 때 넣을 기본 낱말.
 *
 * 코드의 다섯 목록을 그대로 편다. 목록 상수는 여기서만 쓰이므로,
 * 시트를 만든 뒤에는 시트를 고치면 된다 (코드는 손대지 않는다).
 */
function addrWordSeed_() {
  var rows = [];
  var add = function (words, kind, level, memo) {
    words.forEach(function (w) { rows.push([w, kind, level, memo || '']); });
  };
  add(FORWARD_STRONG, ADDRW_FWD, LV_NO, '배송대행 상호');
  add(FORWARD_WEAK, ADDRW_FWD, LV_MAYBE, '남의 집·시설로 받는 표기');
  add(ORG_KEYWORDS, ADDRW_ORG, LV_NO, '');
  add(NAME_ORG_WORDS, ADDRW_NAME, LV_NO, '');
  add(NAME_ORG_WEAK, ADDRW_NAME, LV_MAYBE, '둘 이상 겹칠 때만 애매');
  return rows;
}

/** 사람이 낱말을 고치는 [주소낱말] 시트 */
function addrWordSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_ADDRWORDS);
  if (sh) return sh;

  sh = ss.insertSheet(SHEET_ADDRWORDS);
  sh.getRange(1, 1, 1, ADDRW_HEADERS.length).setValues([ADDRW_HEADERS])
    .setFontWeight('bold').setBackground('#efefef');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 80);
  sh.setColumnWidth(4, 320);

  var seed = addrWordSeed_();
  sh.getRange(2, 1, seed.length, ADDRW_HEADERS.length).setValues(seed);

  // 갈래·판정은 골라 쓰게 한다 (오타로 낱말이 통째로 죽는 것을 막는다)
  var rows = Math.max(sh.getMaxRows() - 1, seed.length);
  sh.getRange(2, 2, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ADDRW_KINDS, true).build());
  sh.getRange(2, 3, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList([LV_NO, LV_MAYBE], true).build());

  sh.getRange('A1').setNote(
    '주소·수취인 검사가 쓰는 낱말입니다. 여기를 고치면 다음 검사부터 반영됩니다.\n' +
    '\n' +
    '· 낱말을 더하려면 맨 아래에 한 줄 적으세요.\n' +
    '· 빼려면 그 줄을 지우세요 (행 삭제).\n' +
    '· 너무 자주 걸리는 낱말은 판정을 [애매] 로 바꾸면 노란색 표시만 하고 둡니다.\n' +
    '\n' +
    '[갈래]\n' +
    '· ' + ADDRW_ORG + ' — 주소와 이름에서 찾습니다. 부분일치라 짧은 낱말은 넓게 걸립니다 ' +
    '(店 → 支店·商店·○○店).\n' +
    '· ' + ADDRW_FWD + ' — 배송대행지. 주소와 이름에서 부분일치로 찾습니다.\n' +
    '· ' + ADDRW_NAME + ' — 수취인 이름 칸에서만, 대문자 낱말 단위로 맞춥니다 ' +
    '(SHOP 은 SHOPPING 에 안 걸립니다).\n' +
    '\n' +
    '[판정]\n' +
    '· ' + LV_NO + ' — 확정. [' + SHEET_ERROR + '] 으로 보내고 진한 빨강으로 칠합니다.\n' +
    '· ' + LV_MAYBE + ' — 사람이 판단. 노랑으로 칠합니다.\n' +
    '  (' + ADDRW_NAME + ' 의 ' + LV_MAYBE + ' 는 한 이름에 둘 이상 겹칠 때만 잡습니다)');
  return sh;
}

// 한 번 읽은 목록은 실행이 끝날 때까지 다시 읽지 않는다 (행마다 시트를 읽지 않으려고)
var _addrWords = null;

/**
 * [주소낱말] 시트 + [설정] 의 추가 낱말을 갈래·판정별로 나눠 읽는다.
 * 시트가 없으면 코드 기본값을 쓴다.
 *
 * @return {{orgNo:string[], orgMaybe:string[], fwdStrong:string[], fwdWeak:string[],
 *           nameNo:string[], nameMaybe:string[]}}
 */
function addrWords_() {
  if (_addrWords) return _addrWords;

  var out = { orgNo: [], orgMaybe: [], fwdStrong: [], fwdWeak: [],
              nameNo: [], nameMaybe: [] };
  var seen = {};
  var push = function (word, kind, level) {
    var w = String(word == null ? '' : word).trim();
    if (!w) return;
    var k = (ADDRW_KINDS.indexOf(kind) >= 0) ? kind : ADDRW_ORG;
    var lv = (String(level).trim() === LV_MAYBE) ? LV_MAYBE : LV_NO;
    if (k === ADDRW_NAME) w = w.toUpperCase();   // 이름낱말은 대문자로 맞춘다
    var key = k + '\t' + w;
    if (seen[key]) return;
    seen[key] = true;
    if (k === ADDRW_ORG) (lv === LV_MAYBE ? out.orgMaybe : out.orgNo).push(w);
    else if (k === ADDRW_FWD) (lv === LV_MAYBE ? out.fwdWeak : out.fwdStrong).push(w);
    else (lv === LV_MAYBE ? out.nameMaybe : out.nameNo).push(w);
  };

  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ADDRWORDS);
  // 시트가 있으면 시트가 원본이다. 사람이 다 지웠으면 '낱말 없음' 이 맞다.
  var rows = sh ? (sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [])
    : addrWordSeed_();
  rows.forEach(function (r) { push(r[0], String(r[1] || '').trim(), r[2]); });

  // [설정] 의 추가 낱말 — 예전부터 쓰던 자리라 그대로 살린다
  var cfg = getConfig();
  String(cfg.기관키워드_추가 || '').split(',')
    .forEach(function (w) { push(w, ADDRW_ORG, LV_NO); });
  String(cfg.배송대행지_추가 || '').split(',')
    .forEach(function (w) { push(w, ADDRW_FWD, LV_NO); });

  _addrWords = out;
  return out;
}

/** [주소낱말] 시트를 만들고 열어준다 */
function 주소낱말_목록_열기() {
  var sh = addrWordSheet_();
  SpreadsheetApp.getActive().setActiveSheet(sh);
  sh.setActiveRange(sh.getRange(Math.max(2, sh.getLastRow() + 1), 1));
}
