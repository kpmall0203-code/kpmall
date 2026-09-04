/**
 * 51_청구서.gs — 포워더 청구서 적재 · 요율표 · 무게 실측 DB · 과청구 검증
 *
 * 왜 청구서가 이 시스템의 뿌리인가:
 *   등록된 g수는 신뢰할 수 없다고 확인됐다. 그런데 주문 후 사입/발송 구조라
 *   실제로 나간 건 전부 포워더가 실측해서 청구서에 찍어 준다.
 *   즉 청구서가 무게·배송비의 유일한 정답지다.
 *   팔린 SKU부터 정확해지므로, 금액 노출이 큰 순서대로 자동 정비되는 셈이다.
 *
 * 적재 방식:
 *   Drive 폴더에 청구서 xlsx를 넣어두면 Advanced Drive Service로 구글시트로 변환해 읽는다.
 *   접수번호가 키라 같은 파일을 두 번 넣어도 중복되지 않는다.
 */

/**
 * 메뉴: 청구서 폴더 지정.
 *
 * 입력을 셋 다 받는다 — 사람이 뭘 붙여넣을지 모르기 때문이다:
 *   · 폴더 ID      1Bg7QKH60tvX77Sbu4Saeg0HOhZwk-K0v
 *   · 폴더 URL     https://drive.google.com/drive/folders/1Bg7QK...
 *   · 폴더 이름    아마존 최적가
 * 지정 직후 폴더 안을 실제로 훑어 뭐가 보이는지 바로 알려준다.
 * "설정은 됐는데 파일을 못 찾는" 상태로 넘어가지 않게 하기 위함이다.
 */
function setupInvoiceFolder() {
  var ui = ui_();
  var props = PropertiesService.getScriptProperties();
  var cur = props.getProperty(PROP_INVOICE_FOLDER);
  var res = ui.prompt(
    '청구서 폴더 지정',
    '아래 셋 중 아무거나 넣으세요.\n' +
    '  · 폴더 URL 통째로\n' +
    '  · 폴더 ID (URL의 /folders/ 뒤 문자열)\n' +
    '  · 폴더 이름' +
    (cur ? '\n\n현재 설정: ' + cur : ''),
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var raw = res.getResponseText().trim();
  if (!raw) return;

  var folder = null, how = '';
  var id = extractDriveId_(raw);

  if (id) {
    try { folder = DriveApp.getFolderById(id); how = 'ID'; } catch (e) {}
  }
  if (!folder) {
    // 이름으로 찾아본다
    try {
      var it = DriveApp.getFoldersByName(raw);
      var found = [];
      while (it.hasNext() && found.length < 5) found.push(it.next());
      if (found.length === 1) { folder = found[0]; how = '이름'; }
      else if (found.length > 1) {
        var list = found.map(function (f) { return '· ' + f.getName() + '  (' + f.getId() + ')'; }).join('\n');
        ui.alert('같은 이름의 폴더가 ' + found.length + '개 있습니다',
          list + '\n\n어느 것인지 알 수 없으니 폴더 ID나 URL로 다시 지정해주세요.',
          ui.ButtonSet.OK);
        return;
      }
    } catch (e2) {}
  }

  if (!folder) {
    ui.alert('폴더를 찾지 못했습니다',
      '입력값: ' + raw + '\n' +
      (id ? '추출한 ID: ' + id + '\n' : '입력에서 ID 형태를 찾지 못했습니다.\n') + '\n' +
      '확인해 보세요:\n' +
      '1) Drive에서 폴더를 열고 주소창 URL을 통째로 복사해 붙여넣기\n' +
      '2) 그 폴더가 이 계정(' + Session.getEffectiveUser().getEmail() + ')의 것인지\n' +
      '3) 파일이 아니라 폴더인지 (파일 ID를 넣으면 실패합니다)',
      ui.ButtonSet.OK);
    return;
  }

  props.setProperty(PROP_INVOICE_FOLDER, folder.getId());

  // 바로 훑어서 뭐가 보이는지 알려준다
  var scan = scanInvoiceFolder_(folder);
  ui.alert('폴더 연결 완료 (' + how + '으로 찾음)',
    '폴더: ' + folder.getName() + '\n' +
    'ID  : ' + folder.getId() + '\n\n' +
    '지금 이 폴더에서 보이는 것:\n' +
    '  · 청구서(.xlsx)  ' + scan.xlsx.length + '개\n' +
    '  · 텍스트(.csv/.txt/.tsv)  ' + scan.text.length + '개\n' +
    '  · 그 외  ' + scan.other + '개\n\n' +
    (scan.xlsx.length
      ? scan.xlsx.slice(0, 5).map(function (n) { return '  ' + n; }).join('\n') +
        '\n\n다음: [🔄 데이터 갱신 → 환율·청구서·원가]'
      : '⚠ .xlsx 파일이 안 보입니다. 폴더가 맞는지, 파일이 업로드됐는지 확인하세요.'),
    ui.ButtonSet.OK);
}

/**
 * URL·ID 문자열에서 Drive ID를 뽑는다.
 * folders/<id>, /d/<id>, ?id=<id> 형태와 맨 ID를 모두 받는다.
 */
function extractDriveId_(raw) {
  var s = String(raw || '').trim();
  var m = s.match(/[-\w]{25,}/);          // Drive ID는 25자 이상의 영숫자·-·_
  return m ? m[0] : '';
}

/** 폴더 안을 훑어 종류별로 센다 */
function scanInvoiceFolder_(folder) {
  var out = { xlsx: [], text: [], other: 0 };
  var it = folder.getFiles();
  while (it.hasNext()) {
    var n = it.next().getName();
    if (/\.xlsx$/i.test(n)) out.xlsx.push(n);
    else if (/\.(csv|tsv|txt)$/i.test(n)) out.text.push(n);
    else out.other++;
  }
  return out;
}

/** 메뉴: 청구서 폴더 진단 — 설정값과 실제로 보이는 파일을 대조한다 */
function diagnoseInvoiceFolder() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_INVOICE_FOLDER);
  if (!id) {
    ui_().alert('청구서 폴더 미설정',
      '아직 폴더를 지정하지 않았습니다.\n[⚙ 설정 → 청구서 폴더 지정]을 실행하세요.',
      ui_().ButtonSet.OK);
    return;
  }
  var folder;
  try {
    folder = DriveApp.getFolderById(id);
  } catch (e) {
    ui_().alert('설정된 폴더를 열 수 없습니다',
      '저장된 ID: ' + id + '\n오류: ' + e.message + '\n\n' +
      '폴더가 삭제됐거나 다른 계정 소유일 수 있습니다.\n다시 지정해주세요.',
      ui_().ButtonSet.OK);
    return;
  }
  var scan = scanInvoiceFolder_(folder);
  var msg = '폴더: ' + folder.getName() + '\nID: ' + folder.getId() + '\n' +
            '실행 계정: ' + Session.getEffectiveUser().getEmail() + '\n\n' +
            '청구서(.xlsx) ' + scan.xlsx.length + '개\n' +
            scan.xlsx.map(function (n) { return '  · ' + n; }).join('\n') + '\n\n' +
            '텍스트(.csv/.txt/.tsv) ' + scan.text.length + '개\n' +
            scan.text.slice(0, 10).map(function (n) { return '  · ' + n; }).join('\n');
  ui_().alert('청구서 폴더 진단', msg, ui_().ButtonSet.OK);
  return msg;
}

/** 메뉴: 폴더의 청구서 xlsx를 모두 적재 */
function ingestInvoices() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(PROP_INVOICE_FOLDER);
  if (!folderId) throw new Error('먼저 [청구서 폴더 지정]을 실행하세요.');

  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var sh = ensureSheet_(SHEET_SHIPMENTS, SHIP_HEADER);

  // 열이 늘어난 뒤(예: 품목·치수 추가) 다시 적재해도, 접수번호가 이미 있으면
  // 건너뛰기 때문에 기존 행의 새 열이 영영 비어 있게 된다.
  // 그래서 헤더가 현재 스키마와 다르면 통째로 다시 만든다.
  var rebuilt = false;
  if (sh.getLastRow() > 0) {
    var hdr = sh.getRange(1, 1, 1, SHIP_HEADER.length).getValues()[0];
    for (var h = 0; h < SHIP_HEADER.length; h++) {
      if (String(hdr[h]).trim() !== SHIP_HEADER[h]) { rebuilt = true; break; }
    }
    if (rebuilt) {
      sh.clear();
      sh.getRange(1, 1, 1, SHIP_HEADER.length).setValues([SHIP_HEADER]).setFontWeight('bold');
      log_('invoice', 'INFO', '배송실적 스키마 변경 감지 — 전체 재적재');
    }
  }
  var existing = shipLoadKeys_(sh);
  var allNew = [];
  var processed = 0;

  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (!/\.xlsx$/i.test(name)) continue;
    toast_('청구서 읽는 중: ' + name);
    var rows;
    try {
      rows = parseInvoiceFile_(f);
    } catch (e) {
      log_('invoice', 'ERROR', name + ' 파싱 실패: ' + e);
      continue;
    }
    processed++;
    for (var i = 0; i < rows.length; i++) {
      if (!existing[rows[i][SP_RECV]]) {
        existing[rows[i][SP_RECV]] = true;
        allNew.push(rows[i]);
      }
    }
  }

  if (allNew.length) {
    var CH = 2000;
    for (var s = 0; s < allNew.length; s += CH) {
      var part = allNew.slice(s, s + CH);
      sh.getRange(sh.getLastRow() + 1, 1, part.length, SHIP_HEADER.length).setValues(part);
    }
  }
  var msg = '청구서 ' + processed + '개 · ' + (rebuilt ? '전체 재적재 ' : '신규 ') +
            allNew.length + '건';
  log_('invoice', 'INFO', msg);
  toast_(msg);
  try { ui_().alert(msg + '\n\n다음: [SKU원가 재계산]을 실행하세요.'); } catch (e) {}
  return msg;
}

/**
 * xlsx 파일 하나 → 행 배열.
 * Drive API로 구글시트 사본을 만들어 읽고, 다 읽으면 사본을 지운다.
 */
function parseInvoiceFile_(file) {
  var copyId = null;
  try {
    var copy = Drive.Files.copy(
      { name: '__tmp_invoice_' + file.getId(), mimeType: 'application/vnd.google-apps.spreadsheet' },
      file.getId());
    copyId = copy.id;
  } catch (e) {
    throw new Error('xlsx 변환 실패 — Apps Script 편집기에서 서비스 [Drive API]를 추가했는지 확인하세요. (' + e + ')');
  }
  try {
    var src = SpreadsheetApp.openById(copyId);
    var sheet = src.getSheetByName('상세');
    if (!sheet) throw new Error('"상세" 시트가 없습니다');
    var vals = sheet.getDataRange().getValues();
    if (vals.length < 2) return [];
    var hdr = vals[0].map(function (h) { return String(h).trim(); });
    var idx = {};
    var want = {
      recv: '접수번호', order: '주문번호', date: '출고일', site: '판매 site',
      type: '배송타입', wact: '실제무게(KG)', wvol: '부피무게(KG)', wapp: '적용무게(KG)',
      fee: '배송비', total: '총 상품금액', rfwd: '환율'
    };
    for (var k in want) {
      idx[k] = hdr.indexOf(want[k]);
      if (idx[k] < 0) throw new Error('컬럼 없음: ' + want[k]);
    }
    // 치수는 없어도 적재는 계속한다 (구형식 청구서 대비)
    idx.size = hdr.indexOf('크기(W,H,D)');
    idx.item = hdr.indexOf('상세품목');
    var out = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      var recv = String(row[idx.recv] || '').trim();
      var fee = Number(row[idx.fee]);
      if (!recv || !fee) continue;
      var dt = row[idx.date];
      var dstr = dt ? ymd_(new Date(dt)) : '';
      var wapp = Number(row[idx.wapp]) || 0;
      var dim = parseSize_(idx.size >= 0 ? row[idx.size] : '');
      out.push([
        recv,
        String(row[idx.order] || '').trim(),
        dstr,
        String(row[idx.site] || '').trim(),
        String(row[idx.type] || '').trim(),
        Number(row[idx.wact]) || 0,
        Number(row[idx.wvol]) || 0,
        wapp,
        fee,
        Number(row[idx.total]) || 0,
        Number(row[idx.rfwd]) || 0,
        dstr.substring(0, 7),
        isCoolFee_(wapp, fee),
        dim.w, dim.h, dim.d,
        idx.item >= 0 ? String(row[idx.item] || '').substring(0, 120) : ''
      ]);
    }
    return out;
  } finally {
    if (copyId) { try { Drive.Files.remove(copyId); } catch (e) {} }
  }
}

/** '43.8x12.8x29.1' → {w,h,d}. 못 읽으면 0. */
function parseSize_(raw) {
  var m = SIZE_RE.exec(String(raw || ''));
  if (!m) return { w: 0, h: 0, d: 0 };
  return { w: Number(m[1]) || 0, h: Number(m[2]) || 0, d: Number(m[3]) || 0 };
}

function shipLoadKeys_(sh) {
  var keys = {};
  var last = sh.getLastRow();
  if (last < 2) return keys;
  var vals = sh.getRange(2, SP_RECV + 1, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var k = String(vals[i][0] || '').trim();
    if (k) keys[k] = true;
  }
  return keys;
}

// ── 요율표 ───────────────────────────────────────────────

/**
 * 현재 형식인가 — 구분 열이 있고 일반·냉장이 모두 들어 있는가.
 *
 * 이 판정이 필요한 이유: 초기 버전은 [적용무게, 배송비] 2열이었고 냉장 표가 없었다.
 * "데이터가 있으면 그대로 둔다"로 짜면 그 2열 탭이 영원히 남아 냉장 요율이 생기지 않는다.
 * 그래서 행 유무가 아니라 형식으로 판정한다 (59 트리거가 갱신 때 쓴다).
 */
function rateCardIsCurrent_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return false;
  var hdr = sh.getRange(1, 1, 1, 3).getValues()[0];
  if (String(hdr[RC_KIND]).trim() !== RATECARD_HEADER[RC_KIND]) return false;  // 2열 구버전
  var kinds = sh.getRange(2, RC_KIND + 1, last - 1, 1).getValues();
  var hasNormal = false, hasCool = false;
  for (var i = 0; i < kinds.length; i++) {
    var k = String(kinds[i][0]).trim();
    if (k === RC_NORMAL) hasNormal = true;
    else if (k === RC_COOL) hasCool = true;
  }
  return hasNormal && hasCool;
}

/** 공식 요율표를 탭에 쓴다 (기존 내용은 지운다) */
function writeRateCard_() {
  var sh = ensureSheet_(SHEET_RATECARD, RATECARD_HEADER);
  sh.clear();
  var rows = [];
  for (var i = 0; i < RATECARD_SEED_NORMAL.length; i++) {
    rows.push([RC_NORMAL, RATECARD_SEED_NORMAL[i][0], RATECARD_SEED_NORMAL[i][1]]);
  }
  for (var j = 0; j < RATECARD_SEED_COOL.length; j++) {
    rows.push([RC_COOL, RATECARD_SEED_COOL[j][0], RATECARD_SEED_COOL[j][1]]);
  }
  sh.getRange(1, 1, 1, 3).setValues([RATECARD_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
  // 냉장 행을 옅게 칠해 두 표가 한눈에 갈리게 한다
  var colors = rows.map(function (r) {
    return [r[RC_KIND] === RC_COOL ? '#e8f0fe' : '#ffffff'];
  });
  sh.getRange(2, 1, rows.length, 1).setBackgrounds(colors);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 3);
  _rateCardCache = null;
  log_('invoice', 'INFO', '요율표 생성 — 일반 ' + RATECARD_SEED_NORMAL.length +
                          '구간 / 냉장 ' + RATECARD_SEED_COOL.length + '구간');
  return sh;
}

/**
 * 요율표 조회 → {normal: [[kg,fee],...], cool: [...]}
 * 탭이 없어도 절대 만들지 않고 시드 상수로 폴백한다 — 이 함수는 커스텀 함수
 * (=권장가/=배송비)에서도 불리는데, 커스텀 함수는 시트에 쓰기가 금지돼 있어
 * 여기서 insertSheet를 하면 수식이 통째로 에러가 난다.
 */
var _rateCardCache = null;
function rateCards_() {
  if (_rateCardCache) return _rateCardCache;
  var out = { normal: [], cool: [] };
  var sh = ss_().getSheetByName(SHEET_RATECARD);
  if (sh && sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < vals.length; i++) {
      var kind = String(vals[i][RC_KIND] || '').trim();
      var w = Number(vals[i][RC_WEIGHT]), f = Number(vals[i][RC_FEE]);
      if (!(w > 0) || !(f > 0)) continue;
      (kind === RC_COOL ? out.cool : out.normal).push([w, f]);
    }
  }
  if (!out.normal.length) out.normal = RATECARD_SEED_NORMAL.slice();
  if (!out.cool.length) out.cool = RATECARD_SEED_COOL.slice();
  out.normal.sort(function (a, b) { return a[0] - b[0]; });
  out.cool.sort(function (a, b) { return a[0] - b[0]; });
  _rateCardCache = out;
  return out;
}

function rateCardFor_(isCool) {
  var c = rateCards_();
  return isCool ? c.cool : c.normal;
}

/**
 * 실제/부피 무게 → 적용무게. 고정 스텝이 아니라 '그 표의 다음 구간'으로 올린다.
 * 일반은 2.0kg까지 0.25 단위지만 냉장은 1.0kg 위로 0.5 단위라, 표마다 다르기 때문이다.
 */
function applyWeightOn_(actualKg, volKg, card) {
  var base = Math.max(Number(actualKg) || 0, Number(volKg) || 0);
  if (base <= 0) return 0;
  for (var i = 0; i < card.length; i++) {
    if (base <= card[i][0] + 1e-9) return card[i][0];
  }
  return card[card.length - 1][0];   // 표 최대 초과
}

/** 부피무게(kg) = 가로×세로×높이(cm) / 6000 */
function volumetricWeight_(wcm, hcm, dcm) {
  var a = Number(wcm) || 0, b = Number(hcm) || 0, c = Number(dcm) || 0;
  if (a <= 0 || b <= 0 || c <= 0) return 0;
  return (a * b * c) / VOLUMETRIC_DIVISOR;
}

/** 적용무게 → 배송비(JPY). 표 최대치를 넘으면 마지막 구간을 쓴다. */
function shippingFeeFor_(appliedKg, isCool) {
  var card = rateCardFor_(!!isCool);
  if (!(appliedKg > 0)) return 0;
  for (var i = 0; i < card.length; i++) {
    if (appliedKg <= card[i][0] + 1e-9) return card[i][1];
  }
  return card[card.length - 1][1];
}

/** 무게(g)와 치수(cm)로 배송비를 바로 구한다 — 권장가 계산기가 쓴다 */
function estimateShipping_(grams, wcm, hcm, dcm, isCool) {
  var cool = !!isCool;
  var card = rateCardFor_(cool);
  var actual = (Number(grams) || 0) / 1000;
  var vol = volumetricWeight_(wcm, hcm, dcm);
  var applied = applyWeightOn_(actual, vol, card);
  return { applied: applied, fee: shippingFeeFor_(applied, cool),
           vol: vol, actual: actual, cool: cool };
}

/**
 * 청구된 금액이 냉장 요율표에 있는 값인지로 냉장 여부를 판정한다.
 *
 * 청구서에는 냉장을 알려주는 컬럼이 없다. 배송타입·타입은 전부 'KSE/일반'으로
 * 똑같이 찍히고, 메모 컬럼도 비어 있다 (2026-04~05 기준 메모 사용 0건).
 * 유일하게 남는 단서가 '실제 청구액'이라 그걸로 역판정한다 —
 * 냉장 요율은 일반의 2배 이상이라 금액만으로 깨끗하게 갈린다.
 */
function isCoolFee_(appliedKg, feeJpy) {
  if (!(feeJpy > 0)) return false;
  var cards = rateCards_();
  var inCool = false, inNormal = false;
  for (var i = 0; i < cards.cool.length; i++) if (cards.cool[i][1] === feeJpy) { inCool = true; break; }
  for (var j = 0; j < cards.normal.length; j++) if (cards.normal[j][1] === feeJpy) { inNormal = true; break; }
  if (inCool && !inNormal) return true;
  if (inCool && inNormal) {   // 양쪽에 있는 금액이면 무게로 가른다
    return shippingFeeFor_(appliedKg, true) === feeJpy;
  }
  return false;
}

// ── 월간 검증 (#5) ───────────────────────────────────────

/**
 * 청구서 월간 검증:
 *   1) 요율표 대비 과청구 건 검출
 *   2) 포워더 내부환율 마크업 추적 (2026-04~05 실측 +1.9~2.0%)
 * 마크업은 협상 가능한 조건이라 추이를 쌓아두는 것 자체가 자료가 된다.
 */
function verifyInvoices() {
  var sh = getSheetOrThrow_(SHEET_SHIPMENTS);
  var last = sh.getLastRow();
  if (last < 2) throw new Error('배송실적이 비어 있습니다. 먼저 [청구서 적재]를 실행하세요.');
  var vals = sh.getRange(2, 1, last - 1, SHIP_HEADER.length).getValues();

  var byMonth = {};
  var overcharges = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    var m = String(v[SP_MONTH] || '');
    if (!m) continue;
    if (!byMonth[m]) byMonth[m] = { n: 0, fee: 0, rfwd: 0, mkt: 0, mktN: 0 };
    var b = byMonth[m];
    b.n++; b.fee += Number(v[SP_FEE]) || 0;
    b.rfwd = Number(v[SP_RFWD]) || b.rfwd;

    // 요율표 대비 과청구 — KSE 정규 배송만 본다(원격지·재발송은 별도 항목).
    // 냉장은 요율표가 다르므로 반드시 해당 표로 비교해야 한다.
    if (String(v[SP_TYPE]) === 'KSE') {
      var isCool = v[SP_COOL] === true;
      var expect = shippingFeeFor_(Number(v[SP_WAPP]), isCool);
      var actual = Number(v[SP_FEE]);
      if (expect > 0 && actual > expect * 1.02) {
        // 접수번호·주문번호만으로는 어느 상품인지 알 수 없어 확인이 불가능하다.
        // 품목은 청구서에 있고, SKU는 주문번호로 이어 붙인다.
        overcharges.push([v[SP_DATE], String(v[SP_ITEM] || ''), String(v[SP_ORDER] || ''),
                          v[SP_WAPP], isCool ? RC_COOL : RC_NORMAL,
                          expect, actual, actual - expect, v[SP_RECV]]);
      }
    }
  }

  // 월별 시장환율 평균을 붙여 마크업 계산
  var fxSh = ss_().getSheetByName(SHEET_FX);
  var fxMonth = {};
  if (fxSh && fxSh.getLastRow() > 1) {
    var fv = fxSh.getRange(2, 1, fxSh.getLastRow() - 1, FX_HEADER.length).getValues();
    for (var k = 0; k < fv.length; k++) {
      if (!fv[k][FX_DATE]) continue;
      var mm = ymd_(new Date(fv[k][FX_DATE])).substring(0, 7);
      var bv = Number(fv[k][FX_BASE]);
      if (!(bv > 0)) continue;
      if (!fxMonth[mm]) fxMonth[mm] = { s: 0, n: 0 };
      fxMonth[mm].s += bv; fxMonth[mm].n++;
    }
  }

  var report = [['청구월', '건수', '배송비합(JPY)', '포워더환율', '시장환율', '마크업']];
  var months = Object.keys(byMonth).sort();
  for (var mi = 0; mi < months.length; mi++) {
    var mo = months[mi], b2 = byMonth[mo];
    var mkt = fxMonth[mo] && fxMonth[mo].n ? fxMonth[mo].s / fxMonth[mo].n : 0;
    var markup = (mkt > 0 && b2.rfwd > 0) ? (b2.rfwd / mkt - 1) : '';
    report.push([mo, b2.n, Math.round(b2.fee), b2.rfwd, mkt ? Number(mkt.toFixed(4)) : '', markup]);
  }

  var out = ensureSheet_('청구서검증', report[0]);
  out.clear();
  out.getRange(1, 1, report.length, report[0].length).setValues(report);
  out.getRange(1, 1, 1, report[0].length).setFontWeight('bold');
  out.getRange(2, 6, Math.max(report.length - 1, 1), 1).setNumberFormat('0.00%');
  out.setFrozenRows(1);

  if (overcharges.length) {
    // 주문번호 → SKU (주문 탭이 있을 때만). 없으면 품목명만으로도 확인이 된다.
    // 청구서 기간의 주문만 읽는다 — 그 밖의 주문번호는 여기 안 나온다
    var skuOf = {};
    var needR2 = ordersNeededRange_();
    var ov2 = needR2 ? ordersInRange_(needR2.from, needR2.to) : [];
    for (var q = 0; q < ov2.length; q++) {
      var oid2 = String(ov2[q][OD_ORDER] || '').trim();
      if (oid2 && !skuOf[oid2]) skuOf[oid2] = String(ov2[q][OD_SKU] || '');
    }
    for (var w = 0; w < overcharges.length; w++) {
      overcharges[w].splice(3, 0, skuOf[overcharges[w][2]] || '');
    }
    overcharges.sort(function (a, b) { return b[8] - a[8]; });   // 차액 큰 순
    var oHdr = ['출고일', '품목', '주문번호', 'SKU', '적용무게', '구분',
                '요율표(예상)', '청구액', '차액', '접수번호'];
    out.getRange(report.length + 2, 1, 1, 1).setValue('■ 요율표 대비 과청구 의심 ' + overcharges.length + '건');
    out.getRange(report.length + 3, 1, 1, oHdr.length).setValues([oHdr]).setFontWeight('bold');
    var show = overcharges.slice(0, 500);
    out.getRange(report.length + 4, 1, show.length, oHdr.length).setValues(show);
    out.setColumnWidth(2, 320);
    if (!show[0][1]) {
      out.getRange(report.length + 2, 3).setValue(
        '※ 품목이 비어 있으면 [🔄 데이터 갱신 → 환율·청구서·원가]으로 청구서를 다시 적재하세요 (품목 열이 새로 추가됨)');
    }
  }
  out.autoResizeColumns(1, report[0].length);

  var msg = '검증 완료 · ' + months.length + '개월 · 과청구 의심 ' + overcharges.length + '건';
  log_('invoice', 'INFO', msg);
  toast_(msg);
  return msg;
}

// ── 포장 경계 절감 (#6) ──────────────────────────────────

/**
 * 절상 손실 후보:
 *   적용무게는 구간 단위로 절상된다. 기준무게가 구간 바닥에서 멀수록
 *   (= 아깝게 다음 구간으로 넘어간 건) 포장을 조금만 조이면 한 구간 내려간다.
 * 실측: 3개월 2,317건이 여기 해당, 한 구간 내리면 월 약 74,000엔 절감.
 */
function packagingSavings() {
  var sh = getSheetOrThrow_(SHEET_SHIPMENTS);
  var last = sh.getLastRow();
  if (last < 2) throw new Error('배송실적이 비어 있습니다.');
  var vals = sh.getRange(2, 1, last - 1, SHIP_HEADER.length).getValues();
  var cards = rateCards_();

  // 구간 → 한 단계 아래 구간 요금 (일반·냉장 각각)
  var lowerFee = { normal: {}, cool: {} };
  ['normal', 'cool'].forEach(function (k) {
    var card = cards[k];
    for (var i = 0; i < card.length; i++) {
      lowerFee[k][card[i][0]] = i > 0 ? card[i - 1][1] : card[i][1];
    }
  });

  var agg = {};  // 주문 단위가 아니라 '무게 프로필' 단위로 묶어야 포장 개선 대상이 보인다
  for (var r = 0; r < vals.length; r++) {
    var v = vals[r];
    if (String(v[SP_TYPE]) !== 'KSE') continue;
    var applied = Number(v[SP_WAPP]);
    var base = Math.max(Number(v[SP_WACT]) || 0, Number(v[SP_WVOL]) || 0);
    if (!(applied > 0) || !(base > 0)) continue;
    var slack = applied - base;              // 구간 안에서 남는 여유
    if (slack < 0.20) continue;              // 여유가 적으면 포장으로 못 줄인다
    var fee = Number(v[SP_FEE]) || 0;
    var kind = v[SP_COOL] === true ? 'cool' : 'normal';
    var save = fee - (lowerFee[kind][applied] || fee);
    if (save <= 0) continue;
    // 품목 단위로 묶는다. 무게 프로필만 보여주면 "그래서 뭘 줄이라는 건데?"가 된다.
    var item = String(v[SP_ITEM] || '').trim() || '(품목 미상)';
    var vol = Number(v[SP_WVOL]), act = Number(v[SP_WACT]);
    var key = item + '|' + applied;
    if (!agg[key]) {
      agg[key] = { item: item, applied: applied, kind: kind === 'cool' ? RC_COOL : RC_NORMAL,
                   driver: vol > act ? '부피' : '실중량', n: 0, save: 0, slack: 0,
                   order: String(v[SP_ORDER] || '') };
    }
    agg[key].n++; agg[key].save += save; agg[key].slack += slack;
    if (vol > act) agg[key].driver = '부피';
  }

  // 주문번호로 SKU를 붙일 수 있으면 붙인다 (주문 탭이 있을 때만)
  var skuOf = {};
  var needR3 = ordersNeededRange_();
  var ov = needR3 ? ordersInRange_(needR3.from, needR3.to) : [];
  for (var o = 0; o < ov.length; o++) {
    var oid = String(ov[o][OD_ORDER] || '').trim();
    if (oid && !skuOf[oid]) skuOf[oid] = String(ov[o][OD_SKU] || '');
  }

  var rows = [];
  for (var k in agg) {
    var a = agg[k];
    rows.push([a.item, skuOf[a.order] || '', a.kind, a.applied, a.driver, a.n,
               Math.round(a.slack / a.n * 1000) / 1000,
               Math.round(a.save), Math.round(a.save / a.n)]);
  }
  rows.sort(function (x, y) { return y[7] - x[7]; });

  var hdr = ['품목', 'SKU', '구분', '적용무게(KG)', '지배요인', '건수',
             '평균여유(KG)', '절감가능액(JPY)', '건당절감(JPY)'];
  var out = ensureSheet_(SHEET_PACKOPT, hdr);
  out.clear();
  out.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
  if (rows.length) out.getRange(2, 1, rows.length, hdr.length).setValues(rows);
  out.setFrozenRows(1);
  out.setColumnWidth(1, 320);
  out.autoResizeColumns(2, hdr.length - 1);

  var total = rows.reduce(function (s, x) { return s + x[7]; }, 0);
  var msg = '포장 절감 후보 ' + rows.length + '개 프로필 · 절감가능 ' + Math.round(total).toLocaleString() + '엔';
  toast_(msg);
  return msg;
}
