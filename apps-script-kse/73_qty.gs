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
 * 1個·1袋 처럼 하나짜리도 남긴다 — 원문이 적어 둔 수량은 그대로 지킨다.
 * 이미 번역문에 그 숫자가 있으면 건드리지 않는다.
 *
 * 다만 '1袋で約2L分'(한 봉지로 2L), '1袋100g'(한 봉지가 100g) 처럼 하나짜리가
 * 수량이 아니라 설명인 자리가 있다. 뒤에 오는 글자로 가려낸다 (아래 descOnly_).
 */

// 일본어 수량 단위 → 한국어 · 영문 · (뒤에 이 글자가 오면 수량이 아니다).
// 긴 것을 앞에 둔다 ('10個入り' 를 '10個' 로 끊지 않으려고).
// 넷째 칸: '15 本体' 의 本, '2 入浴剤' 의 入 처럼 낱말의 첫 글자일 뿐인 경우를 걸러낸다.
var QTY_UNITS = [
  ['個入り', '개입', 'ea'], ['袋入り', '봉지', 'bags'], ['本入り', '개입', 'ea'],
  ['枚入り', '매', 'sheets'], ['錠入り', '정', 'tablets'], ['粒入り', '정', 'tablets'],
  ['カプセル', '캡슐', 'capsules'], ['パック', '팩', 'packs'], ['セット', '세트', 'set', 'アップ'],
  ['入り', '개입', 'ea'],
  ['個', '개', 'ea', '人|性|別|室|所|体|数|々|包'],
  ['袋', '봉지', 'bags', '小|入'],
  ['本', '개', 'ea', '体|格|物|当|来|社|店|日|人|質|部|舗|場|名|文|数|籍|棚|命|能|音|州|音|気|島'],
  ['箱', '박스', 'boxes', '入'],
  ['包', '포', 'packs', '装|丁|囲|括|含|茎'],
  ['枚', '매', 'sheets', '数|目'],
  ['錠', '정', 'tablets', '剤|前'],
  ['粒', '정', 'tablets', '子|度|状'],
  ['缶', '캔', 'cans', '詰'],
  ['入', '개입', 'ea', '浴|力|門|口|場|学|手|荷|金|札|居|会|院|国|港|室|試|団|社|園|念|部|籍|選|賞|信|所|札|力|館']
];

/**
 * 수량이 아니라 설명인 자리인가 — 바로 뒤에 오는 글자로 가려낸다.
 *
 *   ○○ 1本おまけ          덤으로 주는 것이지 이 상품의 개수가 아니다 (개수와 무관하게 제외)
 *   1袋で約2L分            '한 봉지로 2L' — 쓰는 법 설명
 *   1袋100g、3〜4人前      '한 봉지가 100g' — 단위당 규격
 *   1箱 10カプセル         '한 상자에 10캡슐' — 뒤의 숫자가 진짜 수량이다
 *
 * 뒤에 숫자가 오는 경우는 하나짜리(1個·1袋…)에만 적용한다.
 * 2 이상은 '2個1080円' 처럼 값이 뒤따르는 것이 보통이라 수량으로 본다.
 */
function descOnly_(n, after) {
  var s = String(after || '');
  if (/^[ 　]*おまけ/.test(s)) return true;
  if (n !== 1) return false;
  return /^[ 　]*(で|は|につき|あたり|当たり|[0-9０-９])/.test(s);
}

/**
 * 원문에서 살려야 할 수량 표기를 뽑는다.
 *
 * 1個·1袋 처럼 하나짜리도 뽑는다 — 원문이 적어 둔 것은 그대로 남긴다.
 *
 * @return {Array} [{num:'6', ko:'6개', en:'6ea'}, ...] — 나온 순서
 */
function qtyTokens_(src) {
  var s = String(src == null ? '' : src);
  try { s = s.normalize('NFKC'); } catch (e) { /* 그대로 */ }
  // '[並行輸入品]' 같은 유통 표시 안의 숫자는 상품 수량이 아니다 — 괄호째 뺀다
  s = s.replace(/[\[【(（][^\[\]【】()（）]*?(並行輸入品?|輸入)[^\[\]【】()（）]*?[\]】)）]/g, ' ');

  var units = QTY_UNITS.map(function (u) { return u[0] + (u[3] ? '(?!' + u[3] + ')' : ''); }).join('|');
  // 앞의 (約|約) 까지 같이 잡는다 — '約35個' 을 '35개' 로 단정하지 않으려고
  var re = new RegExp('(約|およそ)?[ 　]*(\\d+)\\s*(' + units + ')([ 　]*セット)?', 'g');
  var out = [];
  var m;
  while ((m = re.exec(s)) !== null) {
    var n = parseInt(m[2], 10);
    if (!(n >= 1)) continue;
    var ko = '', en = '';
    for (var i = 0; i < QTY_UNITS.length; i++) {
      if (QTY_UNITS[i][0] === m[3]) { ko = QTY_UNITS[i][1]; en = QTY_UNITS[i][2]; break; }
    }
    if (!ko) continue;
    if (descOnly_(n, s.slice(re.lastIndex))) continue;
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

// 용량·부피 단위 — 한국어 표기는 원문 그대로 쓴다 (g, ml 은 번역할 것이 없다)
// 'ℓ' 는 NFKC 정규화를 거치면 소문자 l 이 되므로 l 도 받는다 (적을 때는 L 로)
var SIZE_RE = /(\d+(?:[.,]\d+)?)[ 　]*(kg|mg|g|ml|mL|L|l|ℓ|cc|oz)(?![A-Za-z])/g;

/**
 * 용량이 통째로 빠진 번역을 메운다.
 *
 * 한국어 상품명을 보고 물건을 담으므로 '300g' 인지 '50g' 인지가 수량만큼 중요하다.
 * 번역에 용량이 하나도 없는데 원문에는 있을 때만 앞쪽 하나를 붙인다 —
 * 번역에 용량이 이미 있으면 (0.5oz/15ml 처럼 같은 값을 두 단위로 적은 것 등)
 * 건드리지 않는다. 덜 붙이는 쪽이 안전하다.
 */
function keepSize_(src, text, lang) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return t;
  SIZE_RE.lastIndex = 0;
  if (SIZE_RE.test(t)) return t;            // 번역에 용량이 이미 있다

  var s = String(src == null ? '' : src);
  try { s = s.normalize('NFKC'); } catch (e) { /* 그대로 */ }
  s = s.replace(/[\[【(（][^\[\]【】()（）]*?(並行輸入品?|輸入)[^\[\]【】()（）]*?[\]】)）]/g, ' ');

  SIZE_RE.lastIndex = 0;
  var m;
  while ((m = SIZE_RE.exec(s)) !== null) {
    // '2L分'(2리터 분량) 처럼 쓰는 법을 말하는 자리는 뺀다
    if (/^[ 　]*(分|相当|につき|あたり|当たり)/.test(s.slice(SIZE_RE.lastIndex))) continue;
    // 'ℓ'·'l' 은 L 로 (통관 영문명은 영문·숫자만, 한국어 표기도 L 이 보통)
    return t + ' ' + m[1] + m[2].replace(/[ℓl]/, 'L');
  }
  return t;
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
  t = keepSize_(src, t, lang);              // 용량이 통째로 빠졌으면 먼저 메운다
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
