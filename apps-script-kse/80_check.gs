/**
 * 검사 — 이름 / 주소 / 전화번호를 보고 문제 있는 주문을 [오류확인] 으로 보낸다.
 *
 * 프런트에서는 `검사하기` 버튼 하나로 세 가지를 순서대로 돌린다.
 * 하나씩 돌리고 싶으면 설정 > 개별 검사 에 따로 있다.
 *
 * 결과는 두 단계로 구분해서 색을 다르게 칠한다.
 *   아님(#f4c7c3, 진한 빨강) — 규칙이나 AI가 확정한 결함
 *   애매(#fff2cc, 노랑)      — 판단이 갈려 사람이 봐야 하는 것
 * 주소는 걸린 키워드 글자만 빨갛게 물들여 어디가 문제인지 바로 보이게 한다.
 */

var LV_NO = '아님';
var LV_MAYBE = '애매';

// ── 기관·법인 키워드 ────────────────────────────────────────────────────
// 개인 수취인이 아니라 회사·관공서·학교 등으로 보이는 주소를 걸러낸다.
// 부분일치로 본다 ('店' 하나로 支店·本店·商店·○○店 을 모두 잡는다).
var ORG_KEYWORDS = [
  // 회사·법인
  '株式会社', '(株)', '㈱', '有限会社', '合同会社', '合名会社', '合資会社',
  '一般社団法人', '公益社団法人', '一般財団法人', '公益財団法人',
  'NPO法人', '特定非営利活動法人', '協同組合', '農業協同組合', '漁業協同組合',
  '商工会議所', '組合', '法人',
  '営業所', '支店', '支社', '出張所', '事務所', '本社', '本店', '工場', '倉庫',
  '研究所', '営業部', '人事総務',
  '店', '商店', '商会', '産業', 'コーポレーション',
  'Co.,Ltd', 'Co., Ltd.', 'Inc.', 'Corp.', 'K.K.', 'LLC',
  // 병원·의료
  '病院', '医院', 'クリニック', '診療所', '歯科', '薬局', '保健所',
  // 학교·교육
  '大学', '大学院', '大学校', '短期大学', '高等学校', '高等部', '高校',
  '中学校', '小学校', '幼稚園', '保育園', 'こども園', '専門学校', '予備校',
  // 기숙사·숙박
  '寮', '学生寮', '社員寮', '社宅', '官舎', '寄宿舎',
  'ホテル', '旅館', '民宿', 'ゲストハウス', 'モーテル', 'シェアハウス',
  // 관공서
  '市役所', '区役所', '町役場', '村役場', '県庁', '都庁', '道庁', '府庁',
  '公民館', '税務署', '警察署', '交番', '消防署', '郵便局', '法務局',
  '入国管理局', 'ハローワーク', '図書館', '体育館', '保健センター', '福祉センター',
  // 군·교정
  '自衛隊', '基地', '刑務所', '拘置所', '少年院',
  // 목욕탕·온천·사우나
  '温泉', '銭湯', '浴場', '大浴場', '湯屋', 'サウナ', 'スパ', '健康ランド',
  // 가게·점포
  '店舗', 'ショップ', 'ストア', 'マート', 'スーパー', 'コンビニ', 'モール',
  'カフェ', 'レストラン', '食堂', '居酒屋', 'ベーカリー', 'パン工房',
  '美容室', '美容院', '理容室', '理髪店', 'サロン', 'ネイル', 'エステ',
  'ジム', 'フィットネス', 'スタジオ', '道場', '教室', '学園', '学院', '塾',
  '整体', '接骨院', '鍼灸', '動物病院', '調剤',
  '会館', '公園管理', '斎場', '神社', '寺院', '教会',
  // 영문
  'Hotel', 'HOTEL', 'Ryokan', 'Resort', 'Inn ', 'Motel', 'Hostel',
  'Dormitory', 'Hospital', 'Clinic', 'School', 'University', 'College',
  'Shop', 'Store', 'Market', 'Salon', 'Studio', 'Cafe', 'Restaurant',
  'Office', 'Factory', 'Warehouse'
];

// 이름 칸에 이게 들어 있으면 사람 이름이 아니다 (AI를 부르지 않고 확정한다).
// 대문자로 맞춰 낱말 단위로 본다.
var NAME_ORG_WORDS = [
  'ROOM', 'SHOP', 'STORE', 'MART', 'MARKET', 'HOTEL', 'MOTEL', 'HOSTEL', 'INN',
  'SALON', 'STUDIO', 'CAFE', 'COFFEE', 'RESTAURANT', 'KITCHEN', 'BAKERY', 'BAR',
  'CLUB', 'GROUP', 'TRADING', 'TRADE', 'COMPANY', 'CORP', 'CORPORATION',
  'LTD', 'INC', 'LLC', 'GMBH', 'OFFICE', 'SERVICE', 'SERVICES', 'CENTER', 'CENTRE',
  'CLINIC', 'HOSPITAL', 'DENTAL', 'PHARMACY', 'SCHOOL', 'ACADEMY', 'COLLEGE',
  'UNIVERSITY', 'GYM', 'FITNESS', 'SPA', 'NAIL', 'BEAUTY', 'RESORT', 'VILLA',
  'FARM', 'FACTORY', 'WAREHOUSE', 'LOGISTICS', 'AGENCY', 'STAFF', 'DEPT',
  'DEPARTMENT', 'TEAM', 'SHOWROOM', 'GALLERY', 'LOUNGE'
];

// 이것만으로는 확정하지 않고 '애매' 로 둔다 (사람 이름일 수도 있다)
var NAME_ORG_WEAK = [
  'THE', 'LADY', 'MEN', 'WOMEN', 'PERFECT', 'PREMIUM', 'ROYAL', 'GRAND',
  'GLOBAL', 'INTERNATIONAL', 'PACIFIC', 'ATLANTIC', 'JAPAN', 'TOKYO', 'OSAKA',
  'KOREA', 'CHINA', 'CITY', 'TOWN', 'STAR', 'MOON', 'SUN', 'GOLD', 'SILVER',
  'BLUE', 'GREEN', 'RED', 'WHITE', 'BLACK', 'HOUSE', 'HOME', 'GARDEN', 'TABLE'
];

/** 이름 칸의 낱말이 상호처럼 보이는가 → {level, words} 또는 null */
function nameOrgWords_(text) {
  var t = String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!t) return null;
  var words = t.split(' ');
  var strong = [], weak = [];
  words.forEach(function (w) {
    if (!w) return;
    if (NAME_ORG_WORDS.indexOf(w) >= 0 && strong.indexOf(w) < 0) strong.push(w);
    else if (NAME_ORG_WEAK.indexOf(w) >= 0 && weak.indexOf(w) < 0) weak.push(w);
  });
  if (strong.length) return { level: LV_NO, words: strong };
  // 약한 낱말만으로는, 두 개 이상 겹칠 때만 의심한다 (THE PACIFIC ROOM 류)
  if (weak.length >= 2) return { level: LV_MAYBE, words: weak };
  return null;
}

function orgKeywords_() {
  var extra = String(getConfig().기관키워드_추가 || '')
    .split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s; });
  return ORG_KEYWORDS.concat(extra);
}

/** 문자열에서 기관 키워드가 나타나는 구간을 찾는다 → [{start, len, word}] */
function findOrgSpans_(text) {
  // 구간 찾기는 83_ban.js 의 findSpans_ 와 같은 규칙을 쓴다
  return findSpans_(text, orgKeywords_());
}

// ── 전화번호 규칙 ───────────────────────────────────────────────────────
// 국가별 자릿수. cc 는 국제표기('+cc'/'00cc')를 국내표기('0…')로 바꾸는 데 쓴다.
// ── 전화번호 ────────────────────────────────────────────────────────────
//
// 해외 번호는 오류가 아니다 (한국·미국 등에서 주문하는 사람이 있다).
// 반면 일본 번호는 자릿수가 정해져 있어서 하드코딩으로 확실히 가려낼 수 있다.
//
//  휴대폰   070 / 080 / 090  → 정확히 11자리
//  IP전화   050              → 정확히 11자리
//  M2M      020              → 11~14자리
//  프리다이얼 0120 / 0800     → 10자리
//  고정전화 그 외 0으로 시작  → 정확히 10자리

/** 일본 번호로서 자릿수가 맞는가 */
function jpPhoneOk_(d) {
  if (d.charAt(0) !== '0') return false;
  if (/^0[5789]0/.test(d)) return d.length === 11;   // 050/070/080/090
  if (/^020/.test(d)) return d.length >= 11 && d.length <= 14;
  if (/^(0120|0800|0570)/.test(d)) return d.length === 10;
  return d.length === 10;                             // 지역번호
}

/** 일본 번호로 볼 수 있게 다듬는다 (국가코드 81 / 앞의 0 빠진 번호) */
function jpNormalize_(d) {
  if (d.indexOf('0081') === 0) return '0' + d.slice(4);
  if (d.indexOf('81') === 0 && d.charAt(0) !== '0' && jpPhoneOk_('0' + d.slice(2))) {
    return '0' + d.slice(2);
  }
  if (d.charAt(0) !== '0' && jpPhoneOk_('0' + d)) return '0' + d;   // 9012345678 → 09012345678
  return d;
}

/**
 * 전화번호 판정.
 * @return null 정상 / 문자열 = 사유
 */
function phoneDefect_(raw, country) {
  var s = String(raw || '').trim();
  if (!s) return '전화번호 없음';

  var d = s.replace(/[^0-9]/g, '');
  if (!d) return '숫자가 없음';
  if (/^(0+|1+|1234567890)$/.test(d)) return '가짜 번호로 보임';

  var cty = String(country || '').trim().toUpperCase();
  var intlMark = s.charAt(0) === '+' || d.indexOf('00') === 0;
  var otherCountry = cty && cty !== 'JP';

  // 해외 번호 — 오류로 잡지 않는다. 자릿수만 상식선에서 본다.
  if (otherCountry || (intlMark && d.indexOf('0081') !== 0)) {
    if (d.length < 7) return '번호가 너무 짧음 (' + d.length + '자리)';
    if (d.length > 15) return '번호가 너무 김 (' + d.length + '자리)';
    return null;
  }

  var jp = jpNormalize_(d);
  if (jpPhoneOk_(jp)) return null;

  // 일본 번호로는 안 맞지만 해외 번호일 수도 있다 → 국가코드로 시작하면 넘어간다
  if (jp.charAt(0) !== '0' && jp.length >= 8 && jp.length <= 15) return null;

  if (/^0[5789]0/.test(jp)) {
    return '일본 휴대폰은 11자리인데 ' + jp.length + '자리';
  }
  if (jp.charAt(0) === '0') {
    return '일본 고정전화는 10자리인데 ' + jp.length + '자리';
  }
  return '전화번호 형식 이상 (' + jp.length + '자리)';
}

/** 예전 이름 — 남겨둔다 */
function isValidPhone_(raw, country) {
  return phoneDefect_(raw, country) === null;
}

// ── 검사 결과 모으기 ────────────────────────────────────────────────────

/**
 * @param {Object} opts {name:bool, addr:bool, phone:bool}
 * @return {Object} 요약
 */
/** [오류확인] 시트의 행들 */
function errorRows_() {
  var sh = errorSheet_();
  if (sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, COL_COUNT).getValues();
  return vals.map(function (v, i) { return { row: i + 2, v: v }; });
}

/**
 * 검사해서 결함만 모은다. 시트는 건드리지 않는다.
 *
 * @param rows [{row, v}]
 * @param opts {name, addr, phone, item}
 * @param nameRows 이름(AI) 검사를 돌릴 행만 따로 줄 때 (비용 때문에)
 * @return {findings, counts, aiUsed, error}
 */
function 검사_수집_(rows, opts, cfg, nameRows) {
  var findings = {};
  function add(row, col, level, reason, spans) {
    if (!findings[row]) findings[row] = [];
    findings[row].push({ col: col, level: level, reason: reason, spans: spans || null });
  }

  var counts = { name: 0, addr: 0, phone: 0, item: 0 };
  var aiUsed = 0;
  var error = '';

  // ── 상품명: 통관 금지 낱말 (고기·닭·하리보 …) ────────────────────────
  if (opts.item) {
    var banWords = banList_();
    if (banWords.length) {
      rows.forEach(function (r) {
        [COL.TITLE_EN, COL.TITLE_KSE].forEach(function (col) {
          var text = String(r.v[col - 1] || '');
          if (!text) return;
          var sp = findBanSpans_(text, banWords);
          if (!sp.length) return;
          var words = [];
          sp.forEach(function (x) { if (words.indexOf(x.word) < 0) words.push(x.word); });
          add(r.row, col, LV_NO, '통관 금지 품목 (' + words.join(',') + ')', sp);
          if (col === COL.TITLE_EN) counts.item++;
        });
      });
    }
  }

  // ── 주소: 배송대행지 → 기관·법인 키워드 ──────────────────────────────
  if (opts.addr) {
    var fwWords = forwardWords_(cfg);
    rows.forEach(function (r) {
      var addr = String(r.v[COL.ADDRESS - 1]);
      var recv = String(r.v[COL.RECEIVER - 1]);
      // 배송대행지가 먼저다 — 회사 키워드보다 구체적인 사유다
      var fwAddr = findForward_(addr, fwWords);
      var fw = fwAddr || findForward_(recv, fwWords);
      if (fw) {
        add(r.row, fwAddr ? COL.ADDRESS : COL.RECEIVER, fw.level,
          '배송대행지로 보임 (' + fw.words.join(',') + ')', fw.spans);
        counts.addr++;
        return;
      }
      var spans = findOrgSpans_(addr);
      var nameSpans = findOrgSpans_(recv);
      if (spans.length) {
        add(r.row, COL.ADDRESS, LV_NO,
          '기관·법인 주소 (' + spans.map(function (x) { return x.word; }).join(',') + ')', spans);
        counts.addr++;
      } else if (nameSpans.length) {
        add(r.row, COL.RECEIVER, LV_NO,
          '기관·법인명 (' + nameSpans.map(function (x) { return x.word; }).join(',') + ')', nameSpans);
        counts.addr++;
      }
    });
  }

  // ── 전화번호 ──────────────────────────────────────────────────────────
  if (opts.phone) {
    rows.forEach(function (r) {
      var bad = phoneDefect_(String(r.v[COL.TEL - 1]), String(r.v[COL.COUNTRY - 1]));
      if (bad) {
        add(r.row, COL.TEL, LV_NO, '전화번호 — ' + bad);
        counts.phone++;
      }
    });
  }

  // ── 이름 ──────────────────────────────────────────────────────────────
  if (opts.name) {
    var target = nameRows === undefined ? rows : nameRows;
    if (target.length) {
      var res = 이름_판별_수집_(target, cfg);
      aiUsed = res.aiCount;
      error = res.error || '';
      for (var row in res.verdicts) {
        var v = res.verdicts[row];
        if (v.verdict === '정상') continue;
        add(Number(row), COL.RECEIVER, v.verdict === LV_NO ? LV_NO : LV_MAYBE,
          '이름 ' + v.verdict + (v.by === 'AI'
            ? '(AI' + (v.conf !== undefined ? ' ' + Math.round(v.conf * 100) + '%' : '') + ')'
            : '(규칙)') + (v.reason ? ' — ' + v.reason : ''));
        counts.name++;
      }
    }
  }

  return { findings: findings, counts: counts, aiUsed: aiUsed, error: error };
}

/**
 * 찾은 결함을 시트에 칠한다 (옮기지는 않는다).
 *
 * @param sh 시트
 * @param targets [{row: 시트의 행번호, key: findings 의 키, v: 값배열}]
 * @param findings 검사_수집_ 의 결과
 */
function 검사_칠하기_(sh, targets, findings) {
  targets.forEach(function (t) {
    var list = findings[t.key];
    if (!list) return;

    // 어떤 검사로 걸렸든, 비어 있는 필수값은 항상 붉게 칠한다
    missingRequired_(t.v).forEach(function (m) {
      var has = list.some(function (f) { return f.col === m[1]; });
      if (!has) list.push({ col: m[1], level: LV_NO, reason: m[0] + ' 없음', spans: null });
    });

    list.forEach(function (f) {
      var cell = sh.getRange(t.row, f.col);
      cell.setBackground(f.level === LV_NO ? BG_NO : BG_MAYBE);
      // 걸린 낱말만 굵은 빨간 글씨로 물들인다
      if (f.spans && f.spans.length) {
        var text = String(t.v[f.col - 1] || '');
        var builder = SpreadsheetApp.newRichTextValue().setText(text);
        f.spans.forEach(function (sp) {
          if (sp.start + sp.len <= text.length) {
            builder.setTextStyle(sp.start, sp.start + sp.len,
              SpreadsheetApp.newTextStyle().setForegroundColor('#c5221f').setBold(true).build());
          }
        });
        cell.setRichTextValue(builder.build());
      }
    });

    // 비고에 사유를 붙인다 — 이미 적힌 사유는 다시 쓰지 않는다 (여러 번 실행해도 안 쌓인다)
    var note = String(t.v[COL.NOTE - 1] || '');
    var addNote = [];
    list.forEach(function (f) {
      if (!f.reason || note.indexOf(f.reason) >= 0) return;
      if (addNote.indexOf(f.reason) >= 0) return;
      addNote.push(f.reason);
    });
    if (addNote.length) {
      var merged = [note].concat(addNote).filter(function (x) { return x; }).join(' / ');
      t.v[COL.NOTE - 1] = merged;
      sh.getRange(t.row, COL.NOTE).setValue(merged);
    }
  });

  // 법인주문은 오류 표기를 덮지 않고 굵은 글씨 + 연한 초록만 얹는다
  targets.forEach(function (t) { markBizRows_(sh, t.row, [t.v]); });
}

/**
 * 검사하기.
 *
 * [주문] 은 검사해서 걸린 것을 [오류확인] 으로 옮기고,
 * [오류확인] 에 이미 있는 행은 제자리에서 표시만 한다.
 * 법인주문·관세 신고 대상·가격없음은 병합 때 먼저 [오류확인] 으로 가므로,
 * 그 행들도 이름·주소·전화번호·상품명 결함이 보여야 한다.
 */
function 검사_실행_(opts) {
  var cfg = getConfig();

  var rows = orderRows_().filter(function (r) {
    return String(r.v[COL.STATUS - 1]).trim() === ST.READY;
  });
  // [오류확인] 에 있는 행도 본다 (아직 접수하지 않은 것만)
  var eRows = errorRows_().filter(function (r) {
    var st = String(r.v[COL.STATUS - 1]).trim();
    return (st === ST.READY || st === ST.ERROR || !st) &&
      !String(r.v[COL.KSE_NO - 1]).trim();
  });

  if (!rows.length && !eRows.length) {
    return { checked: 0, moved: 0, message: '검사할 대기 건이 없습니다.' };
  }

  // ── [주문] ────────────────────────────────────────────────────────────
  var a = 검사_수집_(rows, opts, cfg);
  var moved = 검사결과_이관_(rows, a.findings);

  // ── [오류확인] — 제자리 표시 ──────────────────────────────────────────
  // 이름은 AI 비용이 드니, 이미 이름 판정이 적힌 행은 다시 부르지 않는다.
  var eNameRows = eRows.filter(function (r) {
    return String(r.v[COL.NOTE - 1] || '').indexOf('이름 ') < 0;
  });
  var b = 검사_수집_(eRows, opts, cfg, eNameRows);
  var esh = errorSheet_();
  검사_칠하기_(esh, eRows.map(function (r) {
    return { row: r.row, key: r.row, v: r.v };
  }), b.findings);
  var markedInPlace = Object.keys(b.findings).length;

  SpreadsheetApp.flush();
  오류확인_정렬_();

  var counts = {};
  ['name', 'addr', 'phone', 'item'].forEach(function (k) {
    counts[k] = a.counts[k] + b.counts[k];
  });
  var aiUsed = a.aiUsed + b.aiUsed;
  var err = a.error || b.error;
  if (err) log_('검사', err);

  var parts = [];
  if (opts.name) parts.push('이름 ' + counts.name + '건');
  if (opts.addr) parts.push('주소 ' + counts.addr + '건');
  if (opts.phone) parts.push('전화 ' + counts.phone + '건');
  if (opts.item) parts.push('금지 상품명 ' + counts.item + '건');

  var msg = '검사 ' + (rows.length + eRows.length) + '건' +
    ' ([' + SHEET_ORDERS + '] ' + rows.length + ' + [' + SHEET_ERROR + '] ' + eRows.length + ')' +
    '\n' + parts.join(' / ') +
    (aiUsed ? '\n(AI 판정 ' + aiUsed + '건)' : '') +
    '\n[' + SHEET_ERROR + '] 로 새로 ' + moved + '건 이관' +
    (markedInPlace ? ' / 이미 있던 ' + markedInPlace + '건은 제자리에 표시' : '') +
    (err ? '\n\n' + err : '');
  log_('검사', msg.replace(/\n/g, ' / '));
  return { checked: rows.length + eRows.length, moved: moved, message: msg };
}

/** 걸린 행을 [오류확인] 으로 옮기고 칸 색과 글자 색을 입힌다. */
function 검사결과_이관_(rows, findings) {
  var flagged = rows.filter(function (r) { return findings[r.row]; });
  if (!flagged.length) return 0;

  var esh = errorSheet_();
  var eStart = esh.getLastRow() + 1;

  writeRows_(esh, eStart, flagged.map(function (r) { return r.v; }));

  검사_칠하기_(esh, flagged.map(function (r, i) {
    return { row: eStart + i, key: r.row, v: r.v };
  }), findings);

  var orders = ordersSheet_();
  deleteRowsAt_(orders, flagged.map(function (r) { return r.row; }));

  SpreadsheetApp.flush();
  return flagged.length;
}

// ── 메뉴 진입점 ─────────────────────────────────────────────────────────

/** 프런트의 단일 버튼 — 이름·주소·전화를 순서대로 검사한다. */
function 검사하기() {
  var r = 검사_실행_({ name: true, addr: true, phone: true, item: true });
  SpreadsheetApp.getUi().alert(r.message);
}

function 검사_상품명만() {
  var r = 검사_실행_({ item: true });
  SpreadsheetApp.getUi().alert(r.message);
}

function 검사_이름만() {
  SpreadsheetApp.getUi().alert(검사_실행_({ name: true }).message);
}

function 검사_주소만() {
  SpreadsheetApp.getUi().alert(검사_실행_({ addr: true }).message);
}

function 검사_전화만() {
  SpreadsheetApp.getUi().alert(검사_실행_({ phone: true }).message);
}
