/**
 * 72AF_확대결과.gs — 올려 본 것이 정말 이익이었나 (기획서 5.2·5.3)
 *
 * ── 광고매출이 늘었다는 것으로는 부족하다 ───────────────
 * 입찰을 올리면 광고매출은 거의 언제나 는다. 원래 그냥 팔릴 것을 광고로 사 오기
 * 때문이다. 그래서 두 가지를 함께 본다.
 *
 *   ① 그 상품 자체의 광고 이익 = 광고매출 × 마진 − 광고비
 *   ② 대조군과 견준 차이 (같은 기간, 안 바꾼 상품군들이 얼마나 변했나)
 *
 * ② 가 없으면 "그 주가 좋았던 것" 과 구별할 수 없다.
 *
 *   추가이익/상품군/일 = (시험군 운영기 − 시험군 기준기) − (대조군 운영기 − 대조군 기준기)
 *
 * ── 그 값도 불확실하다 ──────────────────────────────────
 * 상품마다 사정이 다르고 표본이 적다. 그래서 상품군 단위로 다시 뽑는(부트스트랩)
 * 방법으로 구간을 함께 낸다. 구간의 아래끝이 '최소 유의미 이익' 을 넘을 때만
 * 확대유지라고 말한다. 양쪽 군이 각각 30개 미만이면 아예 확증 판정을 내리지 않는다.
 *
 * 이 표는 계산만 한다. 채택(계속 올린 값으로 두기)은 사람이 새 시험·새 승인으로 한다.
 */

var SHEET_EXRESULT = '광고확대결과';
var EXRESULT_HEADER = [
  '시험ID', 'SKU', '상품군키', '배정', '증액유형',
  '기준 클릭', '기준 주문', '기준 광고비', '기준 공헌이익', '기준 일평균',
  '운영 클릭', '운영 주문', '운영 광고비', '운영 공헌이익', '운영 일평균',
  '내 변화(일)', '대조군 변화(일)', '추가이익(일)', '구간 아래', '구간 위',
  '시험군 상품군수', '대조군 상품군수', '판정', '근거', '계산일'
];

/** 판정 (기획서 5.3) */
var XV_KEEP = '확대유지';
var XV_MAYBE = '관측개선_미확정';
var XV_NONE = '효과없음';
var XV_BAD = '악화';
var XV_HOLD = '판정보류';

/**
 * 메뉴: 끝난 시험을 평가한다.
 * 아마존을 건드리지 않는다 — 표만 읽고 표에만 쓴다.
 */
function buildAdExpandResults(opts) {
  var quiet = !!(opts && opts.quiet);
  makeOneSheet_([{ name: SHEET_EXRESULT, header: EXRESULT_HEADER }]);   // 없으면 만들고 그대로 이어간다

  var tsh = ss_().getSheetByName(SHEET_EXTEST);
  if (!tsh || tsh.getLastRow() < 2) {
    if (!quiet) ui_().alert('시험이 없습니다', '[확대 → ① 시험 계획] 부터 하세요.', ui_().ButtonSet.OK);
    return '시험 없음';
  }
  var pol = adExpandPolicy_();
  var v = tsh.getRange(2, 1, tsh.getLastRow() - 1, Math.max(tsh.getLastColumn(), EXTEST_HEADER.length)).getValues();
  var perf = adPerfWindow_();
  var ctx = adMarginCtx_(true);
  var today = ymd_(new Date());

  // ① 시험 줄마다 기준기·운영기를 센다
  var rows = [], arms = { 시험군: {}, 대조군: {} }, nBad = 0;
  for (var i = 0; i < v.length; i++) {
    var st = String(v[i][XT_STATE]);
    if (st !== XS_DONE && st !== XS_GUARD) continue;
    var runFrom = String(v[i][XT_RUNFROM] || '').substring(0, 10);
    // 되돌린 날은 이미 원래 값으로 돌아간 날이라 운영기에 넣지 않는다.
    // 넣으면 하루치가 얹혀 하루 평균이 그만큼 묽어진다 (14일이 15일이 된다).
    var backDay = String(v[i][XT_BACK] || '').substring(0, 10);
    var runTo = backDay ? addDays_(backDay, -1) : String(v[i][XT_RUNTO] || '').substring(0, 10);
    if (!runFrom || !runTo || runTo < runFrom) continue;
    var baseTo = addDays_(runFrom, -1);
    var baseFrom = addDays_(baseTo, -(pol.baseDays - 1));
    var sku = String(v[i][XT_SKU]);
    var fam = String(v[i][XT_FAM] || sku);
    var arm = String(v[i][XT_ARM]);

    var b = perf(sku, baseFrom, baseTo), r = perf(sku, runFrom, runTo);
    var price = r.od > 0 ? r.sales / r.od : (b.od > 0 ? b.sales / b.od : 0);
    var m = adMarginFor_(ctx, sku, price, '', null);
    var bProfit = b.sales * m.pct / 100 - b.cost;
    var rProfit = r.sales * m.pct / 100 - r.cost;
    var bDays = Math.max(1, daysBetween_(baseFrom, baseTo) + 1);
    var rDays = Math.max(1, daysBetween_(runFrom, runTo) + 1);
    var bAvg = bProfit / bDays, rAvg = rProfit / rDays;
    var delta = rAvg - bAvg;

    // 상품군 단위로 모은다 (같은 ASIN 의 여러 SKU 는 한 상품군이다)
    var pool = arms[arm] || (arms[arm] = {});
    var f = pool[fam] || (pool[fam] = { d: 0, n: 0 });
    f.d += delta; f.n++;

    rows.push({ id: String(v[i][XT_ID]), sku: sku, fam: fam, arm: arm,
      type: String(v[i][XT_TYPE]), b: b, r: r, bProfit: bProfit, rProfit: rProfit,
      bAvg: bAvg, rAvg: rAvg, delta: delta, guard: st === XS_GUARD,
      stale: (b.days < 1 || r.days < 1) });
    if (rProfit < 0 && rProfit < bProfit) nBad++;
  }
  if (!rows.length) {
    if (!quiet) ui_().alert('평가할 시험이 없습니다',
      '성숙(되돌린 뒤 ' + (SPEND_ATTRIB_DAYS + SPEND_REPORT_LAG_DAYS) +
      '일)이 끝난 시험만 평가합니다.', ui_().ButtonSet.OK);
    return '평가할 것 없음';
  }

  // ② 군별 상품군 평균 변화
  var testArr = adExFamArray_(arms[XARM_TEST]);
  var ctrlArr = adExFamArray_(arms[XARM_CTRL]);
  var lift = adExMean_(testArr) - adExMean_(ctrlArr);
  var ci = (testArr.length && ctrlArr.length)
    ? adExBootstrap_(testArr, ctrlArr, pol.boot, pol.level, pol.seed) : null;
  var enough = testArr.length >= pol.minFam && ctrlArr.length >= pol.minFam;
  var minGain = isFinite(pol.minGain) ? Number(pol.minGain) : 0;
  var gainKnown = isFinite(Number(pol.minGain));

  // ③ 줄마다 판정
  var out = [], cnt = {};
  for (var k = 0; k < rows.length; k++) {
    var x = rows[k];
    var verdict, why;
    if (x.stale) {
      verdict = XV_HOLD; why = 'DATA_PARTIAL — 기준기나 운영기의 자료가 비어 있습니다';
    } else if (x.guard) {
      verdict = XV_BAD; why = '손실한도를 넘어 중간에 되돌린 시험입니다';
    } else if (x.arm === XARM_CTRL) {
      verdict = XV_HOLD; why = '대조군 — 견주는 데 쓰는 줄입니다 (바꾸지 않았습니다)';
    } else if (x.rProfit < 0 && x.rProfit < x.bProfit) {
      verdict = XV_BAD;
      why = '올린 기간의 광고 이익이 ' + fmtYen_(x.rProfit) + ' 로, 기준기 ' +
            fmtYen_(x.bProfit) + ' 보다 나빠졌습니다';
    } else if (!enough) {
      verdict = XV_MAYBE;
      why = 'LOW_EVIDENCE — 상품군이 시험군 ' + testArr.length + '개 · 대조군 ' + ctrlArr.length +
            '개로 각각 ' + pol.minFam + '개에 못 미쳐 확증 판정을 내리지 않습니다' +
            (x.delta > 0 ? ' (이 상품만 보면 하루 ' + fmtYen_(x.delta) + ' 좋아졌습니다)' : '');
    } else if (!ci) {
      verdict = XV_MAYBE; why = 'LOW_EVIDENCE — 대조군 자료가 모자라 구간을 낼 수 없습니다';
    } else if (ci.lo > minGain) {
      verdict = XV_KEEP;
      why = '대조군과 견준 추가이익이 하루 상품군당 ' + fmtYen_(lift) + ' (구간 ' +
            fmtYen_(ci.lo) + '~' + fmtYen_(ci.hi) + ') 로, 기준 ' + fmtYen_(minGain) +
            ' 를 넘습니다' + (gainKnown ? '' : ' (기준값이 미정이라 0 을 기준선으로 썼습니다)');
    } else if (ci.hi < 0) {
      verdict = XV_NONE;
      why = '대조군과 견주면 오히려 줄었습니다 (구간 ' + fmtYen_(ci.lo) + '~' + fmtYen_(ci.hi) + ')';
    } else {
      verdict = gainKnown ? XV_NONE : XV_MAYBE;
      why = '구간(' + fmtYen_(ci.lo) + '~' + fmtYen_(ci.hi) + ')이 기준 ' + fmtYen_(minGain) +
            ' 를 확실히 넘지 못합니다 — 근거가 부족합니다' +
            (gainKnown ? '' : '. [확대 · 최소 유의미 이익] 을 정하면 효과없음/미확정을 가릅니다');
    }
    cnt[verdict] = (cnt[verdict] || 0) + 1;
    out.push([x.id, x.sku, x.fam, x.arm, x.type,
      Math.round(x.b.ck), Math.round(x.b.od), Math.round(x.b.cost), Math.round(x.bProfit),
      Math.round(x.bAvg),
      Math.round(x.r.ck), Math.round(x.r.od), Math.round(x.r.cost), Math.round(x.rProfit),
      Math.round(x.rAvg),
      Math.round(x.delta), Math.round(adExMean_(ctrlArr)), Math.round(lift),
      ci ? Math.round(ci.lo) : '', ci ? Math.round(ci.hi) : '',
      testArr.length, ctrlArr.length, verdict, why, today]);
  }

  var sh = ss_().getSheetByName(SHEET_EXRESULT);
  writeTable_(sh, EXRESULT_HEADER, out);
  sh.getRange(1, 1, 1, EXRESULT_HEADER.length).setValues([EXRESULT_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  adExResultNotes_(sh, pol);
  if (!quiet) showSheet_(SHEET_EXRESULT);

  var msg = '시험 ' + out.length + '줄 · ' +
            Object.keys(cnt).map(function (a) { return a + ' ' + cnt[a]; }).join(' · ');
  if (!quiet) {
    ui_().alert('확대 결과',
      msg + '\n\n' +
      '상품군 — 시험군 ' + testArr.length + '개 · 대조군 ' + ctrlArr.length + '개' +
      (enough ? '' : ' (각각 ' + pol.minFam + '개는 돼야 확증 판정을 냅니다)') + '\n' +
      '추가이익 하루 상품군당 ' + fmtYen_(lift) +
      (ci ? ' (' + Math.round(pol.level * 100) + '% 구간 ' + fmtYen_(ci.lo) + '~' + fmtYen_(ci.hi) + ')' : '') +
      '\n\n광고매출이 늘어도 전체 이익이 줄었으면 성공이 아닙니다 — ' +
      '이 표는 광고귀속 공헌이익으로 셈합니다.',
      ui_().ButtonSet.OK);
  }
  log_('ads', 'INFO', '확대 결과 — ' + msg);
  return msg;
}

/** 상품군별 평균 변화의 배열 */
function adExFamArray_(pool) {
  var out = [];
  for (var k in pool) out.push(pool[k].d / Math.max(1, pool[k].n));
  return out;
}

function adExMean_(a) {
  if (!a || !a.length) return 0;
  var s = 0;
  for (var i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

/**
 * 같은 씨앗이면 같은 답이 나오는 난수 (기획서 5.3 — seed 저장·재현).
 * 앱스 스크립트의 Math.random 은 씨앗을 못 주므로 직접 만든다.
 */
function adExRng_(seed) {
  var s = (Number(seed) || 1) >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * 상품군 단위 재표집으로 추가이익의 구간을 낸다.
 * 같은 상품군을 여러 번 뽑아도 그것은 독립 표본이 아니다 — 그래서 상품군 단위로 뽑는다.
 */
function adExBootstrap_(test, ctrl, n, level, seed) {
  var reps = Math.max(100, Math.min(Number(n) || 1000, 5000));
  var rnd = adExRng_(seed), diffs = [];
  for (var b = 0; b < reps; b++) {
    var st = 0, sc = 0;
    for (var i = 0; i < test.length; i++) st += test[Math.floor(rnd() * test.length)];
    for (var j = 0; j < ctrl.length; j++) sc += ctrl[Math.floor(rnd() * ctrl.length)];
    diffs.push(st / test.length - sc / ctrl.length);
  }
  diffs.sort(function (p, q) { return p - q; });
  var a = (1 - (Number(level) || 0.9)) / 2;
  return { lo: diffs[Math.floor(a * reps)], hi: diffs[Math.min(reps - 1, Math.floor((1 - a) * reps))],
           n: reps };
}

function adExResultNotes_(sh, pol) {
  headerNotes_(sh, 1, EXRESULT_HEADER, {
    '기준 공헌이익': '= 광고매출 × 마진율 − 광고비. 바꾸기 전 ' + pol.baseDays + '일.',
    '운영 공헌이익': '= 같은 셈, 올린 값으로 돌린 기간.',
    '내 변화(일)': '운영기 하루 평균 − 기준기 하루 평균.',
    '대조군 변화(일)': '같은 기간에 안 바꾼 상품군들의 하루 평균 변화. 이만큼은 내가 한 일이 아닙니다.',
    '추가이익(일)': '= 내 변화 − 대조군 변화. 상품군 하나가 하루에 더 번 돈으로 봅니다.',
    '구간 아래': '상품군 단위 재표집 ' + pol.boot + '회의 ' + Math.round(pol.level * 100) + '% 구간.\n' +
      '아래끝이 [최소 유의미 이익] 을 넘을 때만 "' + XV_KEEP + '" 이라고 합니다.',
    '판정': XV_KEEP + ' = 근거를 갖춘 개선 (채택은 새 시험·새 승인으로)\n' +
      XV_MAYBE + ' = 좋아 보이나 표본·대조 근거 부족\n' +
      XV_NONE + ' = 충분히 봤으나 추가 이익 근거 없음\n' +
      XV_BAD + ' = 광고 이익이 나빠졌거나 손실한도로 중단\n' +
      XV_HOLD + ' = 자료 부족·대조군 줄'
  });
}
