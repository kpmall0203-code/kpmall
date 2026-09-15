/**
 * [근석이] → 야마토 B2 클라우드 「外部データ取り込み基本レイアウト」 95컬럼.
 *
 * 근석이는 일본 국내 배송(야마토)이라 KSE 양식이 아니라 B2 양식으로 내려준다.
 * 박스 1건 = 송장 1장이므로 상품 단위로 펼치지 않는다 (상품명은 品名１/品名２/記事 로).
 *
 * [근석이] 시트 자체는 [주문] 과 같은 25칸 양식을 그대로 쓴다 — 사람이 [주문] 에서
 * 손으로 행을 옮기기 때문이다. 양식 변환은 내려받을 때만 한다.
 */

var B2_COLUMNS = [
  'お客様管理番号', '送り状種類', 'クール区分', '伝票番号', '出荷予定日', 'お届け予定日',
  '配達時間帯', 'お届け先コード', 'お届け先電話番号', 'お届け先電話番号枝番',
  'お届け先郵便番号', 'お届け先住所', 'お届け先アパートマンション名',
  'お届け先会社・部門１', 'お届け先会社・部門２', 'お届け先名', 'お届け先名(ｶﾅ)', '敬称',
  'ご依頼主コード', 'ご依頼主電話番号', 'ご依頼主電話番号枝番', 'ご依頼主郵便番号',
  'ご依頼主住所', 'ご依頼主アパートマンション', 'ご依頼主名', 'ご依頼主名(ｶﾅ)',
  '品名コード１', '品名１', '品名コード２', '品名２', '荷扱い１', '荷扱い２', '記事',
  'ｺﾚｸﾄ代金引換額（税込)', '内消費税額等', '止置き', '営業所コード', '発行枚数',
  '個数口表示フラグ', '請求先顧客コード', '請求先分類コード', '運賃管理番号',
  'クロネコwebコレクトデータ登録', 'クロネコwebコレクト加盟店番号',
  'クロネコwebコレクト申込受付番号１', 'クロネコwebコレクト申込受付番号２',
  'クロネコwebコレクト申込受付番号３', 'お届け予定ｅメール利用区分',
  'お届け予定ｅメールe-mailアドレス', '入力機種', 'お届け予定ｅメールメッセージ',
  'お届け完了ｅメール利用区分', 'お届け完了ｅメールe-mailアドレス',
  'お届け完了ｅメールメッセージ', 'クロネコ収納代行利用区分', '予備',
  '収納代行請求金額(税込)', '収納代行内消費税額等', '収納代行請求先郵便番号',
  '収納代行請求先住所', '収納代行請求先住所（アパートマンション名）',
  '収納代行請求先会社・部門名１', '収納代行請求先会社・部門名２', '収納代行請求先名(漢字)',
  '収納代行請求先名(カナ)', '収納代行問合せ先名(漢字)', '収納代行問合せ先郵便番号',
  '収納代行問合せ先住所', '収納代行問合せ先住所（アパートマンション名）',
  '収納代行問合せ先電話番号', '収納代行管理番号', '収納代行品名', '収納代行備考',
  '複数口くくりキー', '検索キータイトル1', '検索キー1', '検索キータイトル2', '検索キー2',
  '検索キータイトル3', '検索キー3', '検索キータイトル4', '検索キー4', '検索キータイトル5',
  '検索キー5', '予備', '予備', '投函予定メール利用区分', '投函予定メールe-mailアドレス',
  '投函予定メールメッセージ', '投函完了メール（お届け先宛）利用区分',
  '投函完了メール（お届け先宛）e-mailアドレス', '投函完了メール（お届け先宛）メールメッセージ',
  '投函完了メール（ご依頼主宛）利用区分', '投函完了メール（ご依頼主宛）e-mailアドレス',
  '投函完了メール（ご依頼主宛）メールメッセージ'
];

// 열 번호 (0-based) — 템플릿의 A,B,C… 순서와 같다
var B2 = {
  관리번호: 0, 송장종류: 1, 쿨: 2, 전표번호: 3, 출하예정일: 4, 배달예정일: 5, 시간대: 6,
  수취인코드: 7, 수취인전화: 8, 수취인전화지번: 9, 수취인우편: 10, 수취인주소: 11,
  수취인건물: 12, 수취인회사1: 13, 수취인회사2: 14, 수취인명: 15, 수취인카나: 16, 경칭: 17,
  의뢰인코드: 18, 의뢰인전화: 19, 의뢰인전화지번: 20, 의뢰인우편: 21, 의뢰인주소: 22,
  의뢰인건물: 23, 의뢰인명: 24, 의뢰인카나: 25,
  품명코드1: 26, 품명1: 27, 품명코드2: 28, 품명2: 29, 취급1: 30, 취급2: 31, 기사: 32,
  대금: 33, 소비세: 34, 지치키: 35, 영업소코드: 36, 발행매수: 37, 개수구표시: 38,
  청구선고객코드: 39, 청구선분류코드: 40, 운임관리번호: 41,
  웹콜렉트등록: 42, 예정메일구분: 47, 완료메일구분: 51, 수납대행구분: 54,
  투함예정메일: 87, 투함완료수취: 90, 투함완료의뢰: 93
};

// 宅急便 필수항목 (템플릿 주석 기준)
var B2_REQUIRED = [
  [B2.송장종류, '送り状種類'], [B2.출하예정일, '出荷予定日'],
  [B2.수취인전화, 'お届け先電話番号'], [B2.수취인우편, 'お届け先郵便番号'],
  [B2.수취인주소, 'お届け先住所'], [B2.수취인명, 'お届け先名'],
  [B2.의뢰인전화, 'ご依頼主電話番号'], [B2.의뢰인우편, 'ご依頼主郵便番号'],
  [B2.의뢰인주소, 'ご依頼主住所'], [B2.의뢰인명, 'ご依頼主名'],
  [B2.품명1, '品名１'], [B2.청구선고객코드, '請求先顧客コード'],
  [B2.운임관리번호, '運賃管理番号']
];

/** 반각 기준 글자 폭 (전각은 2) */
function textWidth_(s) {
  var t = String(s == null ? '' : s);
  var w = 0;
  for (var i = 0; i < t.length; i++) {
    w += t.charCodeAt(i) < 0x80 || (t.charCodeAt(i) >= 0xFF61 && t.charCodeAt(i) <= 0xFF9F) ? 1 : 2;
  }
  return w;
}

/** B2 가 받는 글자 수를 넘지 않게 자른다 (반각 기준) */
function cutWidth_(s, maxHalf) {
  var t = String(s == null ? '' : s);
  var w = 0;
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    w += c < 0x80 || (c >= 0xFF61 && c <= 0xFF9F) ? 1 : 2;
    if (w > maxHalf) return t.slice(0, i);
  }
  return t;
}

/** 우편번호를 123-4567 로 (B2 는 하이픈 있어도 없어도 받는다) */
function b2Zip_(zip) {
  var d = zipJP_(zip);   // 시트에서 앞의 0이 떨어진 5~6자리는 되붙인다
  return d.length === 7 ? d.slice(0, 3) + '-' + d.slice(3) : String(zip || '').trim();
}

/** 일본 번호로 보이면 앞의 0을 되붙인다 */
function b2Tel_(tel) {
  var s = String(tel == null ? '' : tel).trim();
  if (!s) return '';
  var d = s.replace(/[^0-9]/g, '');
  if (d && d.charAt(0) !== '0') {
    var fixed = jpNormalize_(d);
    if (jpPhoneOk_(fixed)) return fixed;
  }
  return s;
}

/** 번지처럼 보이는가 (숫자·하이픈·丁目番地号 만) */
function looksBanchi_(s) {
  var t = String(s == null ? '' : s).trim();
  if (!t) return false;
  return /^[0-9０-９\s\-ー－ｰ‐−–—丁目番地号の]+$/.test(t);
}

/** 숫자 사이의 장음·전각 기호를 하이픈으로 (1ｰ13ｰ15 → 1-13-15) */
function numDash_(s) {
  var t = String(s == null ? '' : s);
  for (var i = 0; i < 3; i++) {
    t = t.replace(/([0-9０-９])[ーｰ－‐−–—]([0-9０-９])/g, '$1-$2');
  }
  return t;
}

/**
 * 주소 한 덩어리에서 건물명을 떼어낸다.
 *
 * 아마존은 '江戸川区平井6-33-5 D\'クラディア平井405' 처럼 한 칸에 건물까지 넣는 경우가 있다.
 * 공백으로 끊어 앞쪽은 주소, 번지가 아닌 덩어리부터는 건물로 본다.
 */
function splitBldg_(s) {
  var t = String(s == null ? '' : s).replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { addr: '', bldg: '' };
  var chunks = t.split(' ');
  var addr = chunks[0];
  var rest = [];
  for (var i = 1; i < chunks.length; i++) {
    if (!rest.length && looksBanchi_(chunks[i])) addr += chunks[i];
    else rest.push(chunks[i]);
  }
  return { addr: addr, bldg: rest.join(' ') };
}

/**
 * B2 가 쪼갤 수 있는 주소 + 건물명을 만든다.
 *
 * 원본 리포트 조각(ship-state / ship-city / ship-address-1~3)이 있으면 그것을 쓰고,
 * 없으면 시트 주소에서 건물명을 떼어낸다.
 */
function b2Address_(box, items) {
  var a = (items && items[0] && items[0].amz) || {};
  var pref = String(a['ship-state'] || '').trim();
  var city = String(a['ship-city'] || '').trim();
  var a1 = String(a['ship-address-1'] || '').trim();
  var a2 = String(a['ship-address-2'] || '').trim();
  var a3 = String(a['ship-address-3'] || '').trim();

  var addr, bldgParts = [];
  if (pref && (city || a1)) {
    var s1 = splitBldg_(a1);
    addr = pref + city + s1.addr;
    if (s1.bldg) bldgParts.push(s1.bldg);
    // 番地 는 주소에 붙이고, 건물명이면 건물 칸으로
    if (a2) {
      if (looksBanchi_(a2) && !bldgParts.length) addr += a2;
      else bldgParts.push(a2);
    }
    if (a3) bldgParts.push(a3);
  } else {
    // 원본이 없는 행 (손으로 옮긴 경우) — 시트 주소에서 떼어낸다
    var s = splitBldg_(box.address);
    addr = s.addr;
    if (s.bldg) bldgParts.push(s.bldg);
  }

  // B2 는 都道府県/市区郡町村/町・番地 를 스스로 쪼갠다. 공백이 있으면 못 쪼갠다.
  addr = numDash_(addr).replace(/\s+/g, '');
  var bldg = numDash_(bldgParts.join(' ').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim());
  return { addr: addr, bldg: bldg };
}

/**
 * B2 品名 용으로 상품명을 다듬는다.
 *
 * 1) 유통 표시·광고 문구를 뗀다 ([並行輸入品], 【韓国食品】, ｜뒤쪽 …)
 * 2) 25자(반각 50)를 넘으면 낱말 경계에서 자른다 — 중간에 끊기지 않게
 */
function b2Title_(s, maxHalf) {
  var t = String(s == null ? '' : s);

  // 대괄호·꺾쇠 안의 유통/판매 표시
  t = t.replace(/[\[［【(（]\s*(並行輸入品|正規品|日本正規品|国内正規品|送料無料|新品|未使用|韓国直送|韓国食品|韓国コスメ|公式|本社公式)\s*[\]］】)）]/g, ' ');
  // 세로선·슬래시 뒤의 홍보 문구 (｜韓国コスメ フレグランス 香水 …)
  t = t.replace(/[｜|]/, ' ');
  // 남은 빈 괄호
  t = t.replace(/[\[［【(（]\s*[\]］】)）]/g, ' ');
  t = t.replace(/[\u3000\s]+/g, ' ').trim();
  if (!t) return '';

  if (textWidth_(t) <= maxHalf) return t;

  // 낱말 경계(공백·중점·슬래시)에서 자른다
  var cut = cutWidth_(t, maxHalf);
  var at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('・'), cut.lastIndexOf('/'));
  // 너무 많이 잘려나가면 그냥 글자 기준으로 자른다
  if (at > 0 && textWidth_(cut.slice(0, at)) >= maxHalf * 0.6) return cut.slice(0, at).trim();
  return cut.trim();
}

/**
 * 박스 안의 상품을 같은 상품명끼리 묶고 수량을 더한다.
 *
 * 아마존은 같은 상품을 여러 주문으로 사면 행이 따로 오고, 한 주문에서 여럿 사면
 * 한 행에 수량으로 온다. 배송장에는 '무엇이 몇 개' 만 보이면 되므로 둘을 합쳐서 센다.
 */
function b2Items_(items) {
  var out = [];
  var at = {};
  (items || []).forEach(function (it) {
    var t = String(it.titleEn || '').trim();
    if (!t) return;
    var q = parseInt(it.qty, 10) || 1;
    if (at[t] === undefined) {
      at[t] = out.length;
      out.push({ title: t, qty: q });
    } else {
      out[at[t]].qty += q;
    }
  });
  return out;
}

/** 박스에 담을 물건 개수 합 (묶인 다른 주문들도 합쳐서 센다) */
function b2Qty_(goods) {
  var n = 0;
  (goods || []).forEach(function (g) { n += g.qty; });
  return n;
}

/**
 * 品名 한 칸 — [SET][2個] 상품명
 *
 * [N個] 는 항상 붙인다. 담을 개수가 배송장에 바로 보여야 한다.
 * [SET] 은 그 송장에 담을 물건이 1개를 넘을 때만 붙인다. 상품이 여러 줄이어도,
 * 한 상품이라도 수량이 2개 이상이면 세트다. 단품 1개면 [1個] 상품명 만 나간다.
 */
function b2Goods_(x, maxHalf, showQty, isSet, full) {
  if (!x) return '';
  var pre = showQty ? (isSet ? '[SET]' : '') + '[' + x.qty + '個] ' : '';
  // 원본 그대로 (기본) — 아마존 상품명을 자르지도 다듬지도 않는다
  if (full) return pre + x.title;
  return pre + b2Title_(x.title, maxHalf - textWidth_(pre));
}

/** 박스 하나 → B2 한 줄 */
function b2Row_(box, items, cfg) {
  var row = [];
  for (var i = 0; i < B2_COLUMNS.length; i++) row.push('');

  // 일본 국내 배송장이라 원문(일본어) 상품명을 쓴다 (한국어 번역은 넣지 않는다).
  // 같은 상품은 묶어서 수량을 더한다.
  var goods = b2Items_(items);
  var showQty = String(cfg.근석이_수량표기 || '표기').trim() !== '없음';
  var totalQty = b2Qty_(goods);
  var isSet = totalQty > 1;
  // 品名 을 원본 그대로 낼지 (기본) / B2 글자 수(반각 50)에 맞춰 자를지
  var fullTitle = String(cfg.근석이_품명자르기 || '원본').trim() !== '자르기';

  row[B2.관리번호] = cutWidth_(box.orderId, 50);
  row[B2.송장종류] = String(cfg.근석이_송장종류 || '0').trim();
  row[B2.출하예정일] = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

  row[B2.수취인전화] = cutWidth_(b2Tel_(box.tel), 15);
  row[B2.수취인우편] = b2Zip_(box.zip);
  // 주소는 공백 없이, 건물명은 따로 (B2 가 都道府県/市区郡町村/町・番地 로 쪼갠다)
  var ad = b2Address_(box, items);
  row[B2.수취인주소] = cutWidth_(ad.addr, 64);
  row[B2.수취인건물] = cutWidth_(ad.bldg, 32);
  row[B2.수취인명] = cutWidth_(box.receiver, 32);
  row[B2.경칭] = String(cfg.근석이_경칭 || '').trim();

  row[B2.의뢰인전화] = cutWidth_(b2Tel_(cfg.발송인_전화번호), 15);
  row[B2.의뢰인우편] = b2Zip_(cfg.발송인_우편번호);
  row[B2.의뢰인주소] = cutWidth_(numDash_(String(cfg.발송인_주소 || '')).replace(/\s+/g, ''), 64);
  row[B2.의뢰인건물] = cutWidth_(cfg.발송인_건물, 32);
  row[B2.의뢰인명] = cutWidth_(cfg.발송인_이름, 32);
  row[B2.의뢰인카나] = cutWidth_(cfg.발송인_이름카나, 50);

  // 品名 은 일본어 원문 상품명 + 수량. 25자(반각 50) 안에서 읽히게 다듬어 넣는다.
  row[B2.품명1] = b2Goods_(goods[0], 50, showQty, isSet, fullTitle);
  if (goods.length > 1) row[B2.품명2] = b2Goods_(goods[1], 50, showQty, isSet, fullTitle);
  // B2 에 品名 칸이 둘뿐이라, 3줄을 넘으면 나머지는 記事 에 적는다.
  // 計 는 박스 전체 개수다 — 배송장 한 장에 몇 개 담는지가 필요한 숫자이므로.
  if (goods.length > 2) {
    row[B2.기사] = cutWidth_('他 ' + (goods.length - 2) + '点' +
      (showQty ? ' 計' + totalQty + '個' : ''), 44);
  }

  row[B2.지치키] = '0';
  row[B2.청구선고객코드] = String(cfg.야마토_청구선고객코드 || '').trim();
  row[B2.운임관리번호] = String(cfg.야마토_운임관리번호 || '').trim();

  // 利用区分 은 비워두면 거부되는 곳이 있어 '0'(이용 안 함) 으로 채운다
  [B2.웹콜렉트등록, B2.예정메일구분, B2.완료메일구분, B2.수납대행구분,
   B2.투함예정메일, B2.투함완료수취, B2.투함완료의뢰].forEach(function (i) {
    row[i] = '0';
  });

  return row;
}

/** 다이얼로그가 부르는 서버 함수 */
function preparePickB2() {
  var cfg = getConfig();
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PICK);
  if (!sh || sh.getLastRow() < 2) {
    return { count: 0, message: '[' + SHEET_PICK + '] 시트에 내려받을 주문이 없습니다.' };
  }

  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COL_COUNT).getValues();
  var rows = [];
  var boxes = 0;
  var partial = 0;
  var cut = 0;

  vals.forEach(function (v) {
    if (!String(v[COL.ORDER_ID - 1] || '').trim() && !String(v[COL.RECEIVER - 1] || '').trim()) return;
    var r = pickRowToBox_(v);
    boxes++;
    if (!r.full) partial++;
    var line = b2Row_(r.box, r.items, cfg);
    // 글자 수 제한으로 잘린 칸이 있으면 세어 알려준다
    var ad2 = b2Address_(r.box, r.items);
    if (textWidth_(ad2.addr) > 64 || textWidth_(ad2.bldg) > 32 ||
        textWidth_(v[COL.RECEIVER - 1]) > 32) cut++;
    rows.push(line);
  });

  if (!rows.length) {
    return { count: 0, message: '[' + SHEET_PICK + '] 시트에 내려받을 주문이 없습니다.' };
  }

  // 필수항목이 비어 있는지 (첫 줄 기준으로 알려준다 — 설정에서 채워야 하는 값들)
  var missing = [];
  B2_REQUIRED.forEach(function (m) {
    var empty = rows.some(function (r) { return !String(r[m[0]]).trim(); });
    if (empty) missing.push(m[1]);
  });

  var header = String(cfg.근석이_헤더행 || '없음').trim() === '있음';
  var out = header ? [B2_COLUMNS.slice()].concat(rows) : rows;

  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
  var asXlsx = String(cfg.근석이_파일형식 || 'CSV').trim().toLowerCase() === 'xlsx';
  var name, blob;
  if (asXlsx) {
    name = 'b2_' + stamp + '.xlsx';
    blob = xlsxBlob_('Sheet1', out, name);
  } else {
    name = 'b2_' + stamp + '.csv';
    var text = '﻿' + out.map(function (r) {
      return r.map(csvField_).join(',');
    }).join('\r\n') + '\r\n';
    blob = Utilities.newBlob(text, 'text/csv', name);
  }

  log_('근석이 B2', '박스 ' + boxes + '건 → ' + rows.length + '행 / ' + name +
    (missing.length ? ' / 필수항목 빈칸: ' + missing.join(',') : '') +
    (partial ? ' / 원본JSON 없는 행 ' + partial : ''));

  return {
    format: 'B2',
    count: rows.length,
    boxes: boxes,
    partial: partial,
    cut: cut,
    columns: B2_COLUMNS.length,
    header: header,
    missing: missing,
    name: name,
    base64: Utilities.base64Encode(blob.getBytes())
  };
}
