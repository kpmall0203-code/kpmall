/**
 * 배송대행지 검사.
 *
 * 일본에는 해외 구매자를 위한 전송(배송대행) 서비스가 여러 곳 있다. 그 주소로 보내면
 * 실수취인을 알 수 없어 통관·분쟁에서 문제가 되므로 [오류확인] 으로 뺀다.
 *
 * 걸러내는 방법은 두 가지다.
 *  · 상호가 드러나는 것 (tenso, Buyee, 転送コム …) → 확정, '아님'
 *  · 남의 집·시설로 받는 표기 (様方, 気付, 局留 …) → 사람이 판단, '애매'
 *
 * 회사 주소 검사(ORG_KEYWORDS)와 따로 둔 이유: 배송대행지는 회사가 아니어도 걸러야 하고,
 * 반대로 회사 주소여도 배송대행지가 아닐 수 있다.
 */

// 아래 두 목록은 [주소낱말] 시트를 처음 만들 때 부어 넣는 기본값이다.
// 시트가 생긴 뒤로는 시트가 원본이다 (메뉴: 설정 > 주소 낱말 목록 열기).

// 상호·서비스명이 드러나는 것 — 확정해서 뺀다
var FORWARD_STRONG = [
  '転送コム', 'tenso', 'Tenso', 'TENSO',
  'Buyee', 'buyee', 'BUYEE', 'バイイー',
  'ZenMarket', 'Zenmarket', 'ZENMARKET', 'ゼンマーケット',
  'ZenPlus', 'Zenplus', 'ゼンプラス',
  'FromJapan', 'From Japan', 'フロムジャパン',
  'Jshoppers', 'JSHOPPERS', 'ジェイショッパーズ',
  'DEJAPAN', 'Dejapan', 'デジャパン',
  'Blackship', 'BlackShip', 'ブラックシップ',
  'スピアネット', 'セカイモン', 'Sekaimon',
  'WorldShopping', 'Buysmart', 'BuySmart',
  '転送サービス', '転送屋', '海外転送', '国際転送',
  '配送代行', '発送代行', '転送代行', '購入代行', '代行サービス'
];

// 남의 집·시설로 받는 표기 — 사람이 판단
var FORWARD_WEAK = [
  '様方', '殿方', '気付', 'キヅケ', 'きづけ',
  '局留', '郵便局留', '私書箱', 'ポステ', 'ロッカー',
  'c/o', 'C/O', 'care of', '転送', '転居'
];

/** [주소낱말] 시트의 배송대행지 낱말 ([설정] 의 추가분까지 합쳐서 온다) */
function forwardWords_() {
  var list = addrWords_();
  return { strong: list.fwdStrong, weak: list.fwdWeak };
}

/**
 * 주소·수취인에서 배송대행지 표시를 찾는다.
 * @return null 또는 {level, spans, words}
 */
function findForward_(text, words) {
  var w = words || forwardWords_();
  var strong = findSpans_(text, w.strong);
  if (strong.length) {
    return {
      level: LV_NO,
      spans: strong,
      words: strong.map(function (x) { return x.word; })
    };
  }
  var weak = findSpans_(text, w.weak);
  if (weak.length) {
    return {
      level: LV_MAYBE,
      spans: weak,
      words: weak.map(function (x) { return x.word; })
    };
  }
  return null;
}
