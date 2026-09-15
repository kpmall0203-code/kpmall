/**
 * 73_qty.gs — 번역에서 떨어져 나간 수량·세트 표기를 되살린다.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────
 * 상품명 뒤쪽에 붙는 수량이 번역에서 통째로 사라지는 일이 있었다.
 *   원문: オットゥギ ジンラーメン スティック 辛口 5g×10個入り 50g ラーメン 6個
 *   번역: 오뚜기 진라면 스틱 매운맛 5g 10개입 50g          ← 끝의 '6個' 가 없다
 * 번역 프롬프트가 '40자 안쪽으로 짧게' 를 요구해서, 긴 상품명은 모델이 뒤를 버렸다.
 * 그런데 그 뒤가 바로 몇 개들이인지를 말하는 자리라, 통관 서류의 수량이 틀어진다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────
 * 프롬프트를 고쳐 뒤쪽 수량을 지키게 했다 (72_ai_translate.gs).
 * 그래도 모델은 가끔 빠뜨리므로, 번역이 끝난 뒤 코드로 한 번 더 확인한다.
 * 원문에 있는 '2 이상의 수량' 이 번역문에 없으면 뒤에 붙인다.
 *
 * 1개(1個·1袋…)는 붙이지 않는다 — 없어도 뜻이 같고, 오히려 이름만 길어진다.
 * 이미 번역문에 그 숫자가 있으면 건드리지 않는다.
 */

// 일본어 수량 단위 → 한국어 · 영문.
// 긴 것을 앞에 둔다 ('10個入り' 를 '10個' 로 끊지 않으려고).
var QTY_UNITS = [
  ['個入り', '개입', 'ea'], ['袋入り', '봉지', 'bags'], ['本入り', '개입', 'ea'],
  ['枚入り', '매', 'sheets'], ['錠入り', '정', 'tablets'], ['粒入り', '정', 'tablets'],
  ['カプセル', '캡슐', 'capsules'], ['パック', '팩', 'packs'], ['セット', '세트', 'set'],
  ['入り', '개입', 'ea'],
  ['個', '개', 'ea'], ['袋', '봉지', 'bags'], ['本', '개', 'ea'], ['箱', '박스', 'boxes'],
  ['包', '포', 'packs'], ['枚', '매', 'sheets'], ['錠', '정', 'tablets'],
  ['粒', '정', 'tablets'], ['缶', '캔', 'cans'], ['入', '개입', 'ea']
];

/**
 * 원문에서 살려야 할 수량 표기를 뽑는다.
 *
 * @return {Array} [{num:'6', ko:'6개', en:'6ea'}, ...] — 나온 순서, 2 이상만
 */
function qtyTokens_(src) {
  var s = String(src == null ? '' : src);
  try { s = s.normalize('NFKC'); } catch (e) { /* 그대로 */ }
  // '[並行輸入品]' 같은 유통 표시 안의 숫자는 상품 수량이 아니다 — 괄호째 뺀다
  s = s.replace(/[\[【(（][^\[\]【】()（）]*?(並行輸入品?|輸入)[^\[\]【】()（）]*?[\]】)）]/g, ' ');

  var units = QTY_UNITS.map(function (u) { return u[0]; }).join('|');
  // 앞의 (約|約) 까지 같이 잡는다 — '約35個' 을 '35개' 로 단정하지 않으려고
  var re = new RegExp('(約|およそ)?[ 　]*(\\d+)\\s*(' + units + ')([ 　]*セット)?', 'g');
  var out = [];
  var m;
  while ((m = re.exec(s)) !== null) {
    var n = parseInt(m[2], 10);
    if (!(n >= 2)) continue;              // 1개는 붙이지 않는다
    var ko = '', en = '';
    for (var i = 0; i < QTY_UNITS.length; i++) {
      if (QTY_UNITS[i][0] === m[3]) { ko = QTY_UNITS[i][1]; en = QTY_UNITS[i][2]; break; }
    }
    if (!ko) continue;
    var koText = String(n) + ko;
    var enText = (en === 'ea') ? String(n) + en : String(n) + ' ' + en;
    // 'N個セット' 는 '3개 세트' 로
    if (m[4] && ko !== '세트') { koText += ' 세트'; enText += ' set'; }
    // '約35個' 은 어림수다 — 그대로 어림수로 적는다
    if (m[1]) { koText = '약 ' + koText; enText = 'about ' + enText; }
    out.push({ num: String(n), ko: koText, en: enText });
  }
  return out;
}

/**
 * 번역문에 원문의 수량이 남아 있는지 보고, 빠졌으면 뒤에 붙인다.
 *
 * @param {string} src  원문 상품명
 * @param {string} text 번역문 (한국어 또는 통관 영문)
 * @param {string} lang 'ko' 또는 'en'
 * @return {string} 손볼 것이 없으면 받은 그대로
 */
function keepQty_(src, text, lang) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return t;
  var toks = qtyTokens_(src);
  if (!toks.length) return t;

  // 번역문에 이미 있는 숫자 — 용량(300g)이든 수량이든 숫자가 같으면 있는 것으로 본다.
  // 덜 붙이는 쪽이 안전하다 (잘못 붙이면 없던 수량이 생긴다).
  var have = {};
  t.replace(/\d+/g, function (d) { have[d] = true; return d; });

  var add = [];
  toks.forEach(function (q) {
    if (have[q.num] || add.length >= 2) return;   // 두 개까지만 — 이름이 길어지지 않게
    have[q.num] = true;
    add.push(lang === 'en' ? q.en : q.ko);
  });
  return add.length ? t + ' ' + add.join(' ') : t;
}
