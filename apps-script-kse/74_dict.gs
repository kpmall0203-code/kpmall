/**
 * 번역사전 — 상품명 번역에서 꼭 지켜야 할 표기를 사람이 적어두는 시트.
 *
 * Claude 가 모르는 한국 과자·브랜드를 비슷한 유명 상품으로 바꿔 옮기는 일이 있었다
 * (ﾋﾞﾁｮﾋﾞ → 초코송이). 이 시트에 적힌 낱말이 상품명에 들어 있으면
 * 번역 요청에 "이 표기를 쓰라" 고 같이 보내고, 구글 번역으로 넘어갈 때도 먼저 바꿔 끼운다.
 *
 * 반각 가타카나(ﾋﾞﾁｮﾋﾞ)와 전각(ビチョビ)은 같은 낱말로 본다.
 */

var SHEET_DICT = '번역사전';

var DICT_SEED = [
  ['ビチョビ', '비쵸비', 'Bichobi', '오리온 비쵸비 — 초코송이와 다른 상품']
];

/** 대조용 — 반각/전각, 대소문자, 공백 차이를 없앤다 */
function dictNorm_(s) {
  var t = String(s == null ? '' : s);
  try { t = t.normalize('NFKC'); } catch (e) { /* normalize 가 없으면 그대로 */ }
  return t.replace(/\s+/g, '').toLowerCase();
}

function dictSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_DICT);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DICT);
    sh.getRange(1, 1, 1, 4).setValues([['원문 (일본어)', '한국어', '영문', '메모']])
      .setFontWeight('bold').setBackground('#efefef');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 220);
    sh.setColumnWidth(2, 200);
    sh.setColumnWidth(3, 200);
    sh.setColumnWidth(4, 320);
    sh.getRange(2, 1, DICT_SEED.length, 4).setValues(DICT_SEED);
    sh.getRange('A1').setNote(
      '상품명 번역에서 꼭 지킬 표기를 한 줄에 하나씩 적으세요.\n' +
      '- 원문 낱말이 상품명에 들어 있으면 그 한국어·영문 표기로 옮깁니다.\n' +
      '- 반각(ﾋﾞﾁｮﾋﾞ)과 전각(ビチョビ)은 같은 것으로 봅니다.\n' +
      '- 이미 번역된 행은 바뀌지 않습니다. 해당 칸을 지우고 [정리 > 번역 채우기] 를 하세요.');
  }
  return sh;
}

/** 사전 전체 [{src, key, ko, en}] — 긴 낱말부터 (짧은 낱말이 먼저 걸리지 않게) */
var _dictCache = null;   // 한 번 실행하는 동안만

function dictList_() {
  if (_dictCache) return _dictCache;
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_DICT);
  var rows = sh && sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    : DICT_SEED.map(function (r) { return r.slice(0, 3); });
  var out = [];
  rows.forEach(function (r) {
    var src = String(r[0] == null ? '' : r[0]).trim();
    var key = dictNorm_(src);
    var ko = String(r[1] == null ? '' : r[1]).trim();
    var en = String(r[2] == null ? '' : r[2]).trim();
    if (key && (ko || en)) out.push({ src: src, key: key, ko: ko, en: en });
  });
  out.sort(function (a, b) { return b.key.length - a.key.length; });
  _dictCache = out;
  return out;
}

/** 상품명에 들어 있는 사전 낱말들 */
function dictHits_(text, list) {
  var t = dictNorm_(text);
  if (!t) return [];
  return (list || []).filter(function (d) { return t.indexOf(d.key) >= 0; });
}

/**
 * 구글 번역 전에 사전 낱말을 바꿔 끼운다.
 * NFKC 로 펼친 뒤 바꾸므로 반각 가타카나도 걸린다.
 * @param lang 'ko' | 'en'
 */
function dictApply_(text, list, lang) {
  var t = String(text == null ? '' : text);
  try { t = t.normalize('NFKC'); } catch (e) { /* 그대로 */ }
  (list || []).forEach(function (d) {
    var to = lang === 'en' ? d.en : d.ko;
    if (!to) return;
    var esc = d.src.normalize ? d.src.normalize('NFKC') : d.src;
    esc = esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(esc, 'gi'), ' ' + to + ' ');
  });
  return t.replace(/\s+/g, ' ').trim();
}

function 번역사전_열기() {
  var sh = dictSheet_();
  SpreadsheetApp.getActive().setActiveSheet(sh);
}
