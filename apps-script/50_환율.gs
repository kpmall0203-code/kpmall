/**
 * 50_환율.gs — 환율 자동 기록 · 사내환율 · 괴리 알림
 *
 * 환율을 두 가지로 나눠 쓴다. 헷갈리기 쉬운데 역할이 다르다.
 *
 *   [기준시세]   frankfurter(ECB). 리프라이싱의 r0/r1 계산용.
 *                r0/r1은 '비율'이라 은행 스프레드가 분자·분모에서 소거된다.
 *                어떤 소스를 쓰든 r0와 r1을 같은 소스에서 뽑기만 하면 결과가 같다.
 *                무키·전기간 조회가 되어 2022년 등록 SKU의 r0까지 채울 수 있다.
 *
 *   [송금받을때] 네이버(하나은행 고시). 신규 SKU 권장가 산출용.
 *                여기서는 '비율'이 아니라 절대 수취액이 중요하므로
 *                실제로 손에 들어오는 환율을 써야 한다.
 *
 * 사내환율(r1)에 실시간이 아니라 20영업일 평균을 쓰는 이유:
 *   실시간은 하루에도 0.5%씩 움직인다. 그걸 기준으로 리프라이싱하면
 *   오늘 올렸다 다음 주 내렸다를 반복하게 된다. 애초에 문제였던
 *   '점(点) 환율' 노이즈를 가격 쪽에 그대로 옮겨 심는 셈이다.
 *   반면 신규 등록은 매일 300~400건이라 그 자체로 시간 평균이 되므로
 *   실시간을 써도 무방하다.
 */

/** 메뉴: 환율 백필 + 오늘 시세 갱신 */
function fxUpdate() {
  var sh = ensureSheet_(SHEET_FX, FX_HEADER);
  var last = sh.getLastRow();
  var start = FX_BACKFILL_START;
  if (last > 1) {
    // 이미 있는 마지막 날짜 다음날부터만 받는다 (매일 도는 트리거에서 낭비 방지)
    var lastDate = sh.getRange(last, FX_DATE + 1).getValue();
    if (lastDate) {
      var d = new Date(lastDate);
      d.setDate(d.getDate() - 3); // 주말/휴일 보정치를 겹쳐 받아 빈틈을 막는다
      start = ymd_(d);
    }
  }
  var today = ymd_(new Date());
  var added = fxFetchRange_(start, today);
  var recv = fxFetchNaver_();
  if (recv) fxStampTodayReceive_(recv);

  var hr = fxHouseRate_();
  var msg = '환율 ' + added + '건 갱신 · 사내환율 ' + (hr ? hr.toFixed(4) : '-') +
            (recv ? ' · 송금받을때 ' + recv.toFixed(2) : '');
  log_('fx', 'INFO', msg);
  toast_(msg);
  return msg;
}

/** frankfurter에서 일별 KRW/JPY를 받아 시트에 병합. 반환: 새로 쓴 행 수 */
function fxFetchRange_(startYmd, endYmd) {
  var rates = null, lastErr = null;
  for (var i = 0; i < FX_API_HOSTS.length; i++) {
    try {
      var url = FX_API_HOSTS[i] + '/' + startYmd + '..' + endYmd + '?base=JPY&symbols=KRW';
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
      var body = JSON.parse(res.getContentText());
      if (body && body.rates) { rates = body.rates; break; }
      throw new Error('rates 없음');
    } catch (e) {
      lastErr = e;
    }
  }
  if (!rates) throw new Error('환율 조회 실패: ' + lastErr);

  var sh = ensureSheet_(SHEET_FX, FX_HEADER);
  var existing = fxLoadMap_(sh);
  var dates = Object.keys(rates).sort();
  var newRows = [];
  for (var d = 0; d < dates.length; d++) {
    var day = dates[d];
    var v = rates[day] && rates[day].KRW;
    if (!v) continue;
    if (existing[day]) continue;   // 이미 있으면 건너뛴다 (덮어쓰지 않는다)
    newRows.push([day, v, '', 'frankfurter']);
  }
  if (newRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, FX_HEADER.length).setValues(newRows);
    fxSortByDate_(sh);
  }
  return newRows.length;
}

/**
 * 네이버에서 원/엔 시세를 받아 '송금받을때'를 만든다. 실패해도 조용히 null.
 *
 * 주의 — 이 엔드포인트가 주는 closePrice/calcPrice는 '매매기준율'이지
 * 송금받을때가 아니다. (2026-07-30 실측: closePrice 893.17 = 매매기준율)
 * 송금받을때는 여기서 약 1% 낮으므로 FX_RECV_SPREAD를 곱해 환산한다.
 * 이 구분이 중요한 이유: 권장가 계산기는 비율이 아니라 '실제 수취 절대액'을
 * 쓰기 때문에, 매매기준율을 그대로 쓰면 마진을 1% 부풀려 잡게 된다.
 */
function fxFetchNaver_() {
  try {
    var res = UrlFetchApp.fetch(FX_NAVER_URL, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com/' }
    });
    if (res.getResponseCode() !== 200) return null;
    var j = JSON.parse(res.getContentText());

    // 송금받을때가 직접 오면 그대로 쓰고, 없으면 매매기준율에 스프레드를 적용한다.
    var direct = null, base = null;
    var pools = [j, j.result, j.datas, j.detail];
    var directKeys = ['ttBuyPrice', 'ttbRate', 'receiveRate'];
    var baseKeys = ['calcPrice', 'closePrice', 'basePrice'];
    for (var p = 0; p < pools.length; p++) {
      var o = pools[p];
      if (!o) continue;
      for (var a = 0; a < directKeys.length && direct === null; a++) {
        var dv = parseFloat(String(o[directKeys[a]]).replace(/,/g, ''));
        if (!isNaN(dv) && dv > 0) direct = dv;
      }
      for (var b = 0; b < baseKeys.length && base === null; b++) {
        var bv = parseFloat(String(o[baseKeys[b]]).replace(/,/g, ''));
        if (!isNaN(bv) && bv > 0) base = bv;
      }
    }

    var val = direct !== null ? direct : (base !== null ? base * FX_RECV_SPREAD : null);
    if (val === null) return null;
    // 100엔 표기(약 900대)면 100으로 나눠 1엔 기준으로 맞춘다
    return val > 100 ? val / 100 : val;
  } catch (e) {
    log_('fx', 'WARN', '네이버 환율 조회 실패(무시): ' + e);
    return null;
  }
}

/**
 * 송금받을때 값을 기록한다.
 * 오늘 행이 있으면 거기에, 없으면(주말·ECB 지연) 최근 영업일 행에 쓴다 —
 * "가장 최근 관측값"이라는 의미는 같고, 버리면 fxReceiveRate_()가
 * 실시간 값 대신 스프레드 추정으로 떨어진다 (통합 테스트에서 실측한 공백).
 * 행을 새로 만들지는 않는다 — 기준시세가 빈 행은 r0 조회를 깨뜨린다.
 */
function fxStampTodayReceive_(recv) {
  var sh = ensureSheet_(SHEET_FX, FX_HEADER);
  var last = sh.getLastRow();
  if (last < 2) return;
  var today = ymd_(new Date());
  var dates = sh.getRange(2, FX_DATE + 1, last - 1, 1).getValues();
  for (var i = dates.length - 1; i >= 0; i--) {
    if (ymd_(new Date(dates[i][0])) === today) {
      sh.getRange(i + 2, FX_RECV + 1).setValue(recv);
      return;
    }
  }
  sh.getRange(last, FX_RECV + 1).setValue(recv);   // 최근 영업일 행에 기록
}

/** {'2026-07-30': 9.18, ...} */
function fxLoadMap_(sh) {
  var map = {};
  var last = sh.getLastRow();
  if (last < 2) return map;
  var vals = sh.getRange(2, 1, last - 1, FX_HEADER.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    var d = vals[i][FX_DATE];
    if (!d) continue;
    map[ymd_(new Date(d))] = { base: Number(vals[i][FX_BASE]) || 0, recv: Number(vals[i][FX_RECV]) || 0 };
  }
  return map;
}

function fxSortByDate_(sh) {
  var last = sh.getLastRow();
  if (last > 2) sh.getRange(2, 1, last - 1, FX_HEADER.length).sort({ column: 1, ascending: true });
}

/**
 * 특정 일자의 기준환율. 주말·휴일이면 그 이전 최근 영업일 값을 쓴다.
 * 캐시를 쓰는 이유: 리프라이싱은 1만 건 이상을 한 번에 도는데
 * 매 SKU마다 시트를 읽으면 6분 한도를 못 지킨다.
 */
var _fxCache = null;
function fxRateOn_(dateLike) {
  if (!_fxCache) _fxCache = fxBuildCache_();
  var target = ymd_(new Date(dateLike));
  if (_fxCache.map[target]) return _fxCache.map[target].base;
  // 이진 탐색으로 target 이하 최근 일자
  var ds = _fxCache.dates, lo = 0, hi = ds.length - 1, best = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (ds[mid] <= target) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best >= 0 ? _fxCache.map[ds[best]].base : null;
}

function fxBuildCache_() {
  var sh = getSheetOrThrow_(SHEET_FX);
  var map = fxLoadMap_(sh);
  var dates = Object.keys(map).sort();
  return { map: map, dates: dates };
}

function fxClearCache_() { _fxCache = null; }

/** 사내환율 = 최근 HOUSE_MA_DAYS 영업일 기준시세 평균 (리프라이싱의 r1) */
function fxHouseRate_() {
  var sh = ss_().getSheetByName(SHEET_FX);
  if (!sh || sh.getLastRow() < 2) return null;
  var last = sh.getLastRow();
  var n = Math.min(HOUSE_MA_DAYS, last - 1);
  var vals = sh.getRange(last - n + 1, FX_BASE + 1, n, 1).getValues();
  var sum = 0, cnt = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = Number(vals[i][0]);
    if (v > 0) { sum += v; cnt++; }
  }
  return cnt ? sum / cnt : null;
}

/**
 * 신규 SKU 권장가 산출에 쓸 '실제 수취 환율'.
 * 네이버 값이 있으면 그걸, 없으면 기준시세에 실측 스프레드를 곱해 추정한다.
 */
function fxReceiveRate_() {
  var sh = ss_().getSheetByName(SHEET_FX);
  if (sh && sh.getLastRow() >= 2) {
    var last = sh.getLastRow();
    var n = Math.min(10, last - 1);
    var vals = sh.getRange(last - n + 1, 1, n, FX_HEADER.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var r = Number(vals[i][FX_RECV]);
      if (r > 0) return r;
    }
  }
  var base = fxHouseRate_();
  return base ? base * FX_RECV_SPREAD : null;
}

/**
 * 괴리 알림: 사내환율이 직전 리프라이싱 기준에서 FX_ALERT_THRESHOLD 이상 벌어지면
 * "리프라이싱 돌릴 때"라고 메일로 알린다. 사람이 환율을 매일 볼 필요를 없앤다.
 */
function fxCheckDrift() {
  var hr = fxHouseRate_();
  if (!hr) return;
  var props = PropertiesService.getScriptProperties();
  var lastR1 = Number(props.getProperty(PROP_LAST_REPRICE_R1));
  if (!lastR1) {
    props.setProperty(PROP_LAST_REPRICE_R1, String(hr));
    return;
  }
  var drift = hr / lastR1 - 1;
  if (Math.abs(drift) < FX_ALERT_THRESHOLD) return;

  var email = props.getProperty(PROP_ALERT_EMAIL) || Session.getEffectiveUser().getEmail();
  var dir = drift > 0 ? '엔 강세(가격 인하 여지)' : '엔 약세(가격 인상 필요)';
  var body =
    '사내환율이 직전 리프라이싱 기준에서 ' + (drift * 100).toFixed(2) + '% 움직였습니다.\n\n' +
    '  직전 기준 r1 : ' + lastR1.toFixed(4) + ' KRW/JPY\n' +
    '  현재 사내환율: ' + hr.toFixed(4) + ' KRW/JPY\n' +
    '  방향        : ' + dir + '\n\n' +
    '시트 메뉴 [가격관리 → ▶ 리프라이싱 → ① 산출]을 실행해 검토하세요.\n' +
    ss_().getUrl();
  try {
    MailApp.sendEmail(email, '[가격관리] 환율 괴리 ' + (drift * 100).toFixed(1) + '% — 리프라이싱 검토', body);
    log_('fx', 'INFO', '괴리 알림 발송 ' + (drift * 100).toFixed(2) + '%');
  } catch (e) {
    log_('fx', 'ERROR', '알림 발송 실패: ' + e);
  }
}

/**
 * 'YYYY-MM-DD'
 *
 * ── 왜 Utilities.formatDate 를 안 쓰는가 ────────────────
 * 예전에는 Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') 였다.
 * 한 줄짜리라 싸 보이지만, 둘 다 Apps Script 서비스 호출이라 한 번에 1~2ms 든다.
 * 표를 훑는 반복문에서 행마다 부르면 41,050행에 65초다 —
 * 같은 자료를 시트에서 읽어오는 데는 2.2초밖에 안 걸리는데.
 *
 * 실측(2026-08-06): 41,050행 반복문 65.8초 중 65초가 이 함수였다.
 * 6분 한도를 넘긴 진짜 원인이 읽기가 아니라 여기였다.
 *
 * V8 런타임의 Date 게터는 스크립트 시간대를 따르므로 결과는 같고,
 * 순수 계산이라 호출 비용이 없다.
 */
function ymd_(d) {
  if (!(d instanceof Date)) {
    // 이미 문자열이면 앞 10자만 (다른 코드가 그렇게 기대한다)
    var s = String(d == null ? '' : d);
    return s.substring(0, 10);
  }
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}
