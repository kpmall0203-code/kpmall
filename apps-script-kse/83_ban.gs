/**
 * 금지 상품명 검사 — 고기·닭·하리보처럼 통관에 걸리는 품목을 걸러낸다.
 *
 * 상품명(원본 일본어)에 금지 낱말이 있으면
 *  · 그 낱말만 굵은 빨간 글씨로 칠하고
 *  · 상품명 칸 배경을 빨갛게 하고
 *  · 그 박스를 [오류확인] 으로 보낸다
 *
 * 낱말 목록은 [금지상품명] 시트에서 사람이 직접 고친다. 처음 만들 때 아래 기본값을
 * 넣어 두고, 필요 없는 줄은 지우면 된다.
 */

var BAN_SEED = [
  // 고기류
  ['肉', '고기 — 축산물은 통관 불가'],
  ['牛肉', '소고기'],
  ['豚肉', '돼지고기'],
  ['鶏肉', '닭고기'],
  ['鶏', '닭'],
  ['焼き鳥', '야키토리'],
  ['馬肉', '말고기'],
  ['羊肉', '양고기'],
  ['ラム肉', '양고기'],
  ['ハム', '햄'],
  ['ソーセージ', '소시지'],
  ['ベーコン', '베이컨'],
  ['サラミ', '살라미'],
  ['ジャーキー', '육포'],
  ['牛タン', '소혀'],
  ['カルビ', '갈비'],
  ['プルコギ', '불고기'],
  ['サムギョプサル', '삼겹살'],
  ['サムゲタン', '삼계탕'],
  ['参鶏湯', '삼계탕'],
  ['チキン', '치킨'],
  ['ミート', 'meat'],
  ['ビーフ', 'beef'],
  ['ポーク', 'pork'],
  // 젤라틴 과자
  ['ハリボー', '하리보 — 돼지 젤라틴'],
  ['HARIBO', '하리보'],
  ['ゼラチン', '젤라틴']
];

/** 사람이 낱말을 적어 넣는 시트 */
function banListSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_BANLIST);
  if (!sh) {
    sh = ss.insertSheet(SHEET_BANLIST);
    sh.getRange(1, 1, 1, 2).setValues([['금지낱말', '메모']])
      .setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200);
    sh.setColumnWidth(2, 320);
    sh.getRange(2, 1, BAN_SEED.length, 2).setValues(BAN_SEED);
    sh.getRange('A1').setNote(
      '상품명에 이 낱말이 들어 있으면 [' + SHEET_ERROR + '] 으로 보냅니다.\n' +
      '- 상품명은 아마존 원본(일본어)과 번역된 이름 둘 다에서 찾습니다.\n' +
      '- 걸린 낱말만 굵은 빨간 글씨로 칠하고 그 칸을 빨갛게 합니다.\n' +
      '- 필요 없는 줄은 지우고, 필요한 낱말은 아래에 계속 적으면 됩니다.\n' +
      '- 짧은 낱말은 엉뚱한 상품명에도 걸립니다 (예: 肉 → 筋肉).');
  }
  return sh;
}

/** [금지상품명] 시트의 낱말 목록 + [설정] 의 추가 낱말 */
function banList_() {
  var out = [];
  var seen = {};
  var push = function (w) {
    var t = String(w == null ? '' : w).trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  };

  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_BANLIST);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { push(r[0]); });
  }
  String(getConfig().금지상품명_추가 || '').split(',').forEach(push);
  return out;
}

/**
 * 낱말 목록으로 걸리는 구간을 찾는다. 대소문자는 무시한다.
 * 겹치는 구간은 긴 쪽만 남긴다 ('鶏肉' 과 '鶏' 이 같이 잡히는 경우).
 */
function findSpans_(text, words) {
  var s = String(text || '');
  var low = s.toLowerCase();
  var spans = [];
  for (var i = 0; i < words.length; i++) {
    var w = String(words[i] || '');
    if (!w) continue;
    var lw = w.toLowerCase();
    // 대소문자를 무시해도 자릿수가 달라지지 않는 낱말만 소문자 비교를 쓴다
    var hay = (lw.length === w.length) ? low : s;
    var needle = (lw.length === w.length) ? lw : w;
    var from = 0;
    while (true) {
      var at = hay.indexOf(needle, from);
      if (at < 0) break;
      spans.push({ start: at, len: w.length, word: s.substr(at, w.length) });
      from = at + w.length;
    }
  }
  spans.sort(function (a, b) { return a.start - b.start || b.len - a.len; });
  var out = [];
  spans.forEach(function (sp) {
    var last = out[out.length - 1];
    if (last && sp.start < last.start + last.len) return;
    out.push(sp);
  });
  return out;
}

/** 상품명에서 금지 낱말을 찾는다 */
function findBanSpans_(text, words) {
  return findSpans_(text, words || banList_());
}

/** [금지상품명] 시트를 만들고 열어준다 */
function 금지상품명_목록_열기() {
  var sh = banListSheet_();
  SpreadsheetApp.getActive().setActiveSheet(sh);
  sh.setActiveRange(sh.getRange(Math.max(2, sh.getLastRow() + 1), 1));
}
