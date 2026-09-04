/**
 * 72I_광고생성.gs — 전용 캠페인 생성 계획 (트랙 A 실행 준비)
 *
 * ── 왜 캠페인을 새로 만드는가 ───────────────────────────
 * 입찰가는 키워드·타깃에 걸리는데 지금은 광고그룹 하나에 SKU 가 1만 개 넘게 있다.
 * 한 SKU 만 골라 올릴 수가 없어서, 결국 그중 채산성이 가장 나쁜 것에 맞추게 된다.
 * 그게 전 품목 CPC 가 5엔인 이유다. 그러니 트랙 A 의 실행은 입찰 조정이 아니라
 * 값을 따로 매길 수 있는 그릇을 만드는 일이다.
 *
 * ── 구간을 고정하는 이유 ────────────────────────────────
 * 처음에는 그때그때 SKU 를 정렬해 비슷한 것끼리 묶었다. 그러면 물건이 새로 들어올
 * 때마다 경계가 흔들려서, 같은 상품이 지난달과 다른 묶음에 들어간다.
 * 그래서 구간을 기준점에서 배수로 쌓아 고정한다 —
 *   2 · 3 · 4.5 · 6.8 · 10 · 15 · 22 · 34 · 51 …
 * 권장 CPC 가 17엔인 상품은 언제 들어오든 [15~22] 묶음이다. 새 물건이 오면
 * 이미 있는 그 캠페인에 담기만 하면 되고, 자리가 없을 때만 하나 더 만든다.
 *
 * 묶음의 입찰은 그 구간의 아래 끝에 맞춘다. 구간 안에서 가장 낮은 권장가보다
 * 항상 낮으므로, 묶였다는 이유로 손해 보는 상품이 없다.
 *
 * ── 바닥: 시장가 아래로는 부르지 않는다 ─────────────────
 * 구간 아래 끝을 그대로 부르면 시장가보다 낮은 값이 나온다. 실제로 ¥5~7 구간과
 * ¥7~10 구간(SKU 395개)이 시장 CPC ¥7.7 아래로 입찰해 노출을 거의 못 샀다.
 * 손해는 안 나지만 아무 일도 안 일어난다 — 광고를 켠 값을 못 한다.
 *
 *   입찰 = max(원래 입찰, 시장 CPC)
 *
 * 그러면 원래 그 값을 못 내던 상품이 딸려 올라갈 수 있으므로, 담기 전에 거른다:
 *
 *   CPC 상한 ≥ 시장 CPC × 시장가 안전배수(1.2)  인 SKU 만 캠페인에 넣는다
 *
 * 못 넘는 상품은 광고로 이길 수 없다 — 시장가에 사면 세션 마진이 남지 않는다.
 * 빼는 것이 정직하다. 오가닉으로 두고, 값이나 무게를 고쳐 채산성이 오르면 다시 들어온다.
 *
 * ── 일예산 ──────────────────────────────────────────────
 * '되는지 2주 안에 알려면 얼마가 드나'로 잡는다.
 *
 *   판정필요클릭 = 3 ÷ 필요CVR        (손익분기 주문 3건이 나왔어야 할 클릭 수)
 *   필요CVR      = CPC ÷ 손익분기CPA  (지금 값에 사서 본전이 되려면 필요한 전환율)
 *   판정에 드는 돈 = 판정필요클릭 × CPC = 손익분기CPA × 3
 *
 * CPC 가 약분되어 사라진다 — 비싼 클릭이면 적게, 싼 클릭이면 많이 사면 되므로
 * 판정에 드는 총액은 '손익분기 주문 3건어치'로 언제나 같다. 그것을 2주(14일)에
 * 나눠 쓰는 것이 하루 예산이다:
 *
 *   필요액 = 손익분기CPA × 3 ÷ 14 × 여유배수
 *   상한   = 월매출 × 마진율 × 목표ACOS비율 ÷ 30   (오가닉 매출이 감당할 수 있는 선)
 *   하루예산 = max(최소일예산, 필요액) 을 상한 안으로 밀어넣은 값
 *
 * 상한이 있는 이유: 판정만 생각하면 잘 안 팔리는 상품에도 큰 예산이 붙는데,
 * 그 상품이 한 달에 버는 돈보다 광고비가 크면 판정할 값어치가 없다.
 * 묶음 캠페인은 그 묶음에서 가장 낮은 손익분기CPA 를 쓴다 — 가장 빠듯한 상품이 기준이다.
 *
 * 여기서는 아무것도 만들지 않는다. 계획만 표로 낸다.
 */

/**
 * 계획 표는 둘이다 — 트랙마다 제 표를 가진다.
 *
 * 처음에는 하나에 다 넣었다. "실행 경로를 두 벌 만들지 않는다" 는 생각이었고
 * 그 자체는 맞았는데, 표를 같이 쓴 대가가 계속 나왔다:
 *   · 트랙 A 의 계획 다시 계산이 표를 통째로 다시 써서 B 줄을 지울 뻔했다
 *   · 캠페인 유형이 A 기준(AUTO)으로 박혀 있어 B 가 수동 캠페인을 못 만들었다
 *   · A 의 "이미 만든 줄은 건너뛴다" 가 B 의 자동→수동 갈아타기를 막았다
 * 매번 조건문을 하나씩 더 다는 식으로 막았는데, 그게 쌓이면 다음 사람이 못 읽는다.
 *
 * 그래서 표만 가른다. 실행(생성·켜기·멈춤)·관제·대장은 여전히 한 벌이고,
 * 표 목록을 돌 뿐이다 — 머리글이 같아서 줄의 생김새는 하나다.
 *
 *   광고생성계획   트랙 A(재배분) · M(승격).  72I 가 통째로 다시 쓴다
 *   광고육성계획   트랙 B(육성).             72O 가 혼자 쓴다
 */
var SHEET_ADPLAN = '광고생성계획';
var SHEET_ADPLAN_GROW = '광고육성계획';
var ADPLAN_HEADER = [
  '계획ID', '동작', '방식', '캠페인명', '유형', '일예산(JPY)', '입찰(JPY)',
  'SKU수', '기존SKU수', '대표SKU', 'CPC구간', '손익분기CPA(JPY)', '월매출합(JPY)',
  '기존광고제거', '근거', 'SKU목록', '광고그룹ID', '승인', '결과', '캠페인ID',
  '광고ID들',         // 만들 때 받은 productAd ID. 켜기·멈추기가 다시 조회하지 않게
  '트랙'              // A = 재배분(이 파일이 만든다) · B = 육성(72O 가 밀어넣는다)
];
var AP_ACTION = 2, AP_NAME = 4, AP_DAILY = 6, AP_BID = 7, AP_SKUS = 16;
var AP_GID = 17, AP_APPROVE = 18, AP_RESULT = 19, AP_CID = 20, AP_ADIDS = 21, AP_TRACK = 22;
var ADPLAN_TRACK_B = 'B';
/** 계획 표 이름들. 새 트랙이 생기면 여기만 늘린다 */
function adPlanSheetNames_() { return [SHEET_ADPLAN, SHEET_ADPLAN_GROW]; }

/**
 * 있는 계획 표를 값째로 읽어 온다. 실행·관제가 이것으로 돈다.
 * @return {Array} [{name, sh, v}] — v 는 머리글 뺀 줄들
 */
function adPlanTables_() {
  var out = [], names = adPlanSheetNames_();
  for (var i = 0; i < names.length; i++) {
    var sh = ss_().getSheetByName(names[i]);
    if (!sh || sh.getLastRow() < 2) continue;
    out.push({ name: names[i], sh: sh,
               v: sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues() });
  }
  return out;
}

/** 두 표를 한 줄씩 훑는다 — 표를 나눠 쓰는 것을 부르는 쪽이 몰라도 되게 */
function adPlanEachRow_(fn) {
  var t = adPlanTables_();
  for (var i = 0; i < t.length; i++) {
    for (var r = 0; r < t[i].v.length; r++) fn(t[i].v[r], t[i].sh, r + 2, t[i].name);
  }
}

var ADPLAN_JUDGE_ORDERS = 3;    // 판정에 필요한 손익분기 주문 수
var ADPLAN_JUDGE_DAYS = 14;     // 그것을 몇 일 안에 볼 것인가

/**
 * 권장 CPC 가 어느 고정 구간에 드는가.
 * 기준점에서 배수로 쌓아 올린 구간이라, 같은 값이면 언제 계산해도 같은 구간이 나온다.
 */
function adBandOf_(rec, basis) {
  var base = Number(basis['묶음 CPC 기준점']) || 2;
  var r = Number(basis['묶음 CPC 배수']) || 1.5;
  var k = (rec > base) ? Math.floor(Math.log(rec / base) / Math.log(r)) : 0;
  var lo = base * Math.pow(r, k), hi = lo * r;
  return { k: k, lo: lo, hi: hi,
           label: 'CPC' + Math.round(lo) + '~' + Math.round(hi) };
}

/**
 * 아마존이 받는 이름으로 다듬는다.
 *
 * 캠페인·광고그룹 이름에 한글을 넣으면 아마존이 통째로 거절한다. 실제로 거절당했다.
 * 그런데 SKU 이름이 대부분 한글이라 그대로 쓰면 만들 수 있는 것이 거의 없다.
 * 그래서 영숫자만 남기고, 남는 게 없으면 그 글자로 만든 짧은 번호를 붙인다 —
 * 이름이 사라지는 것보다 알아볼 수 있는 번호가 낫다.
 */
function adAsciiName_(s, fallback) {
  var t = String(s == null ? '' : s)
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[^A-Za-z0-9 ._-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (t.length >= 3) return t.substring(0, 100);
  return fallback || ('X' + adShortHash_(s));
}

/** 이름을 못 살렸을 때 쓸 짧은 번호 (같은 글자면 같은 번호가 나온다) */
function adShortHash_(s) {
  var str = String(s == null ? '' : s), h = 0;
  for (var i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase();
}

/**
 * 캠페인 이름. 구간 번호(B12)를 앞에 박아 둔다.
 *
 * 사람이 읽는 부분(CPC15~23)은 반올림이 걸려 있어서, 기준점이나 배수를 조금만
 * 손대면 글자가 달라진다. 이름으로 맞대보면 그 순간 '기존 캠페인이 없다'가 되어
 * 전부 새로 만들게 된다 — 몇 달 뒤 같은 구간 캠페인이 여러 개 쌓인다.
 * 그래서 대조는 번호로만 하고, 읽을 거리는 뒤에 붙인다.
 */
function adBandName_(prefix, band, seq) {
  return prefix + ' B' + band.k + ' CPC' + Math.round(band.lo) + '-' +
         Math.round(band.hi) + ' #' + seq;
}

/** 캠페인 이름에서 (구간번호, 순번)을 도로 꺼낸다 */
function adBandKeyOf_(name) {
  var m = /\sB(\d+)\s.*#(\d+)\s*$/.exec(String(name));
  return m ? (m[1] + '#' + m[2]) : null;
}

/**
 * 하루 예산 — 위 주석의 식 그대로.
 * @param {number} beCpaMin  이 캠페인 SKU 들의 손익분기 CPA 중 가장 낮은 값
 * @param {number} monthlyAmt 그 SKU 들의 월매출 합
 */
function adPlanDaily_(beCpaMin, monthlyAmt, basis) {
  var slack = Number(basis['일예산 여유 배수']) || 1;
  // 판정에 드는 돈(손익분기 주문 3건어치)을 2주에 나눠 쓴다
  var need = Math.round(beCpaMin * ADPLAN_JUDGE_ORDERS / ADPLAN_JUDGE_DAYS * slack);
  var floor = Number(basis['최소 일예산']) || 100;
  // 오가닉 매출이 감당할 수 있는 하루치 — 이보다 크게 쓰면 판정할 값어치가 없다
  var cap = Math.round(monthlyAmt * basis['기본 마진율'] * basis['목표 ACOS 비율'] / 30);
  var d = Math.max(floor, need);
  if (cap > floor && d > cap) d = cap;
  return d;
}

/**
 * 이미 만들어 둔 캠페인 → 자리 여유.
 * 묶음은 구간번호+순번으로, 전용은 이름 그대로 찾는다.
 */
function adPlanExisting_(prefix) {
  var out = { band: {}, solo: {} };
  var sh = ss_().getSheetByName(SHEET_ADGRP);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADGRP_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var name = String(v[i][0] || '');
    var key = adBandKeyOf_(name);
    // 앞머리로만 찾으면, 나중에 앞머리를 바꾸는 순간 이미 만든 묶음을 못 찾아
    // 같은 구간 캠페인을 또 만들게 된다. 묶음은 구간 번호가 곧 이름이므로
    // 앞머리가 달라도 번호로 알아본다. 전용은 이름이 곧 그 상품이라 앞머리를 본다.
    if (!key && name.indexOf(prefix) !== 0) continue;
    var n = Number(v[i][5]);
    var rec = { name: name, cid: String(v[i][8] || ''), gid: String(v[i][9] || ''),
                n: isFinite(n) ? n : -1, unknown: !isFinite(n) };
    if (key) out.band[key] = rec; else out.solo[name] = rec;
  }
  return out;
}

/**
 * 이미 만들어 둔 줄의 실행 자취(결과·ID·승인)를 캠페인 이름으로 찾아 둔다.
 *
 * 계획을 다시 돌리면 표를 통째로 새로 쓴다. 그때 [결과]와 [캠페인ID]가 지워지면
 * 이미 만든 캠페인을 '아직 안 만든 것'으로 보고 다시 만들려 든다 —
 * 아마존이 같은 이름을 거절하므로 만들어지지는 않지만, 실패 줄만 잔뜩 남는다.
 * 그래서 이름이 같은 줄의 자취는 그대로 옮겨 온다.
 */
function adPlanPrior_() {
  var out = {};
  var sh = ss_().getSheetByName(SHEET_ADPLAN);
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    var nm = String(v[i][AP_NAME - 1] || '').trim();
    if (!nm) continue;
    out[nm] = { result: String(v[i][AP_RESULT - 1] || ''),
                gid: String(v[i][AP_GID - 1] || ''),
                cid: String(v[i][AP_CID - 1] || ''),
                adIds: String(v[i][AP_ADIDS - 1] || ''),
                approve: v[i][AP_APPROVE - 1] === true };
  }
  return out;
}

/** 계획 한 줄 */
function adPlanRow_(o) {
  return ['', o.action, o.kind, o.name, '자동', o.daily, Math.round(o.bid),
          o.skus.length, o.exist || 0, o.skus[0].sku, o.band, Math.round(o.beMin),
          Math.round(o.amt), o.action === '이미 있음' ? '' : '실행 시 확인', o.why,
          o.skus.map(function (x) { return x.sku; }).join(', ').substring(0, 4000),
          o.gid || (o.prior && o.prior.gid) || '',
          !!(o.prior && o.prior.approve),
          (o.prior && o.prior.result) || '',
          o.cid || (o.prior && o.prior.cid) || '',
          (o.prior && o.prior.adIds) || '',
          'A'];
}

/** 메뉴: 전용 캠페인 생성 계획 */
function planAdCampaigns() {
  var basis = adBasis_();
  var sh = getSheetOrThrow_(SHEET_REALLOC);
  if (sh.getLastRow() < 2) {
    throw new Error('"' + SHEET_REALLOC + '" 이 비어 있습니다.\n' +
      '[📊 분석 → 광고 재배분 계산]을 먼저 실행하세요.');
  }
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, REALLOC_HEADER.length).getValues();

  var pool = [];
  for (var i = 0; i < v.length; i++) {
    var verdict = String(v[i][17]);
    if (verdict !== '신규 캠페인' && verdict !== '캠페인 분리') continue;
    var rec = Number(v[i][11]), be = Number(v[i][10]);
    if (!(rec > 0) || !(be > 0)) continue;
    pool.push({ sku: String(v[i][0]), asin: String(v[i][20] || '').trim(),
                rec: rec, beCpa: be, amt: Number(v[i][19]) || 0,
                cap: Number(v[i][12]) || 0 });
  }
  if (!pool.length) { ui_().alert('만들 대상이 없습니다.'); return; }

  // 앞머리가 한글이면 아마존이 이름을 거절한다. 다듬어서 쓰고 알림에 알린다.
  /**
   * 이름 앞머리. 아마존은 캠페인 이름에 아스키만 받으므로 한글은 여기서 걷힌다.
   * 실제로 기본값이 '사입' 이었고 그것이 조용히 'KP' 로 떨어져 캠페인이 만들어졌다 —
   * 시트에는 한글이 적혀 있는데 아마존에는 KP 로 들어가 있어 사람이 헷갈렸다.
   * 걷어냈으면 그 사실을 계획 표의 근거 칸과 확인 창에 남긴다.
   */
  var rawPrefix = String(basis['캠페인 이름 앞머리'] || '');
  var prefix = adAsciiName_(rawPrefix, 'KP');
  var prefixChanged = (prefix !== rawPrefix.trim());
  if (prefixChanged) {
    log_('ads', 'WARN', '캠페인 이름 앞머리 "' + rawPrefix + '" → "' + prefix +
         '" (아마존은 아스키만 받습니다)');
  }
  var maxN = Number(basis['묶음당 최대 SKU']) || 20;
  var existing = adPlanExisting_(prefix);
  var prior = adPlanPrior_();

  /**
   * 바닥과 거르기. 시장가 아래로 부르면 노출을 못 사고, 시장가를 못 내는 상품을
   * 억지로 올리면 팔수록 손해다. 둘 다 막는다.
   */
  var floorCpc = Number(basis['시장 CPC']) || 0;
  var safe = Number(basis['시장가 안전배수']) || 1.2;
  var needCap = floorCpc * safe;
  var dropped = [], dropAmt = 0;
  if (needCap > 0) {
    var kept = [];
    for (var f = 0; f < pool.length; f++) {
      if (pool[f].cap > 0 && pool[f].cap < needCap) {
        dropped.push(pool[f]); dropAmt += pool[f].amt;
      } else kept.push(pool[f]);
    }
    pool = kept;
  }
  if (!pool.length) {
    ui_().alert('넣을 SKU 가 없습니다',
      (dropped.length ? 'CPC 상한이 시장가 ¥' + floorCpc + ' × ' + safe + ' = ¥' +
        needCap.toFixed(1) + ' 에 못 미쳐 ' + dropped.length + '개를 전부 뺐습니다.\n\n' +
        '이 상품들은 광고로 이길 수 없습니다 — 시장가에 사면 세션 마진이 남지 않습니다.\n' +
        '[광고기준 → 시장가 안전배수] 를 낮추거나, 값·무게를 고쳐 채산성을 올리세요.'
        : '판정이 [신규 캠페인]·[캠페인 분리] 인 줄이 없습니다.'),
      ui_().ButtonSet.OK);
    return;
  }

  /**
   * 시장가 아래로는 부르지 않는다. 단 그 SKU 들의 CPC 상한은 넘지 않게.
   *
   * 바닥이 걸릴 때만 올림한다. 시장가 ¥7.7 을 반올림하면 ¥8 이지만 내림하면 ¥7 —
   * 시장가 아래로 다시 떨어져 올린 뜻이 없어진다. 상한 쪽은 반대로 내림한다:
   * 나중에 adPlanRow_ 가 반올림할 때 상한을 반 엔이라도 넘기면 팔수록 손해다.
   * 바닥이 안 걸리는 구간은 값을 그대로 둔다 — 이미 만든 캠페인과 어긋나지 않게.
   */
  var withFloor = function (bid, capMin) {
    var raw = Number(bid) || 0;
    var b = (floorCpc > raw) ? Math.ceil(floorCpc) : raw;
    if (capMin > 0) {
      var lim = Math.floor(capMin);
      if (b > lim) b = lim;
    }
    return Math.max(2, b);
  };

  pool.sort(function (a, b) { return b.amt - a.amt; });
  var nSolo = Math.min(Number(basis['전용 캠페인 상위 개수']) || 0, pool.length);
  var rows = [], nFloored = 0;

  // ① 매출 상위는 SKU 하나에 캠페인 하나
  for (var s2 = 0; s2 < nSolo; s2++) {
    // SKU 이름은 대부분 한글이라 못 쓴다. ASIN 은 언제나 아스키이고
    // 아마존 화면에서 바로 알아볼 수 있어 이름에 쓰기 알맞다.
    var one = pool[s2];
    // 한글을 지우고 남은 조각(예: "33 20ml")을 이름으로 쓰면 서로 겹칠 수 있다.
    // 겹친 이름은 아마존이 거절하거나 엉뚱한 캠페인을 찾게 만든다.
    // ASIN 이 없으면 차라리 그 SKU 로만 나오는 번호를 쓴다.
    var nm = prefix + ' ' + (one.asin || ('SKU' + adShortHash_(one.sku)));
    var ex = existing.solo[nm];
    var soloBid = withFloor(one.rec, one.cap);
    if (soloBid > one.rec) nFloored++;
    rows.push(adPlanRow_({
      prior: prior[nm],
      action: ex ? '이미 있음' : '생성', kind: '전용', name: nm, bid: soloBid,
      daily: adPlanDaily_(one.beCpa, one.amt, basis), skus: [one],
      band: '¥' + Math.round(soloBid), beMin: one.beCpa, amt: one.amt, exist: ex ? ex.n : 0,
      gid: ex ? ex.gid : '', cid: ex ? ex.cid : '',
      why: ex ? '같은 이름의 캠페인이 이미 있다 — 건너뛴다'
              : '오가닉 매출 상위 — 이 SKU 만 담아 값을 정확히 맞춘다' +
                (soloBid > one.rec
                  ? '. 권장 ¥' + Math.round(one.rec) + ' 이 시장가 ¥' + floorCpc +
                    ' 아래라 시장가로 올렸다 (상한 ¥' + Math.round(one.cap) + ' 안)'
                  : '')
    }));
  }

  // ② 나머지는 고정 구간에 담는다. 구간이 고정이라 새 물건도 같은 자리를 찾아온다
  var band = {};
  for (var r2 = nSolo; r2 < pool.length; r2++) {
    var b = adBandOf_(pool[r2].rec, basis);
    (band[b.label] || (band[b.label] = { info: b, list: [] })).list.push(pool[r2]);
  }
  var labels = Object.keys(band).sort(function (a, b) {
    return band[a].info.lo - band[b].info.lo; });

  for (var L = 0; L < labels.length; L++) {
    var bi = band[labels[L]], list = bi.list, seq = 1, idx = 0;
    while (idx < list.length) {
      var ex2 = existing.band[bi.info.k + '#' + seq];
      var nm2 = ex2 ? ex2.name : adBandName_(prefix, bi.info, seq);
      var room = maxN;
      if (ex2 && !ex2.unknown) room = Math.max(0, maxN - ex2.n);
      else if (ex2 && ex2.unknown) room = 0;      // 몇 개 들었는지 모르면 더 넣지 않는다
      if (room <= 0) { seq++; continue; }
      var take = list.slice(idx, idx + room);
      idx += take.length;
      var beMin = take[0].beCpa, amt = 0, capMin = take[0].cap;
      for (var t = 0; t < take.length; t++) {
        if (take[t].beCpa < beMin) beMin = take[t].beCpa;
        if (take[t].cap > 0 && (!capMin || take[t].cap < capMin)) capMin = take[t].cap;
        amt += take[t].amt;
      }
      // 구간 아래 끝이 시장가보다 낮으면 시장가로 올린다 (그 묶음 최소 상한 안에서)
      var bandBid = withFloor(bi.info.lo, capMin);
      if (bandBid > bi.info.lo) nFloored++;
      rows.push(adPlanRow_({
        prior: prior[nm2],
        action: ex2 ? '기존에 추가' : '생성', kind: '묶음', name: nm2,
        bid: bandBid, daily: adPlanDaily_(beMin, amt, basis), skus: take,
        band: '¥' + Math.round(bi.info.lo) + '~' + Math.round(bi.info.hi),
        beMin: beMin, amt: amt, exist: ex2 ? ex2.n : 0,
        gid: ex2 ? ex2.gid : '', cid: ex2 ? ex2.cid : '',
        why: (ex2 ? '이미 있는 묶음에 ' + take.length + '개를 더 넣는다. '
                  : '새 묶음. ') +
             (bandBid > bi.info.lo
               ? '구간 아래 끝 ¥' + Math.round(bi.info.lo) + ' 가 시장가 ¥' + floorCpc +
                 ' 아래라 ¥' + Math.round(bandBid) + ' 로 올렸다 — 그 값이면 노출을 못 산다 ' +
                 '(이 묶음 최소 상한 ¥' + Math.round(capMin) + ' 안)'
               : '입찰은 구간 아래 끝(¥' + Math.round(bi.info.lo) + ')에 맞춰 ' +
                 '묶였다는 이유로 손해 보는 상품이 없게 한다')
      }));
      seq++;
    }
  }

  for (var k2 = 0; k2 < rows.length; k2++) rows[k2][0] = 'P' + (k2 + 1);

  /**
   * 이 계산은 트랙 A(재배분) 줄만 만든다. 같은 표에 사는 트랙 M(승격, 72P) 줄은
   * 통째로 다시 쓰면 지워지므로 먼저 건져 두었다가 뒤에 붙인다 —
   * 그 줄의 캠페인ID·결과는 이미 아마존에 있는 것이다.
   *
   * 트랙 B(육성)는 제 표(광고육성계획)에 살아서 여기 걸리지 않는다.
   * 그래도 'A 가 아닌 것' 으로 고른다 — 옛 표에 남아 있는 B 줄이 있어도 살아남게,
   * 그리고 트랙이 하나 더 늘 때 여기를 안 고쳐도 되게. 트랙 칸이 빈 옛 줄은 A 로 본다.
   */
  var keepOther = [];
  var pshOld = ss_().getSheetByName(SHEET_ADPLAN);
  if (pshOld && pshOld.getLastRow() > 1) {
    var ov = pshOld.getRange(2, 1, pshOld.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
    for (var o2 = 0; o2 < ov.length; o2++) {
      var tk = String(ov[o2][AP_TRACK - 1] || '').trim();
      if (tk && tk !== 'A') keepOther.push(ov[o2]);
    }
  }
  rows = rows.concat(keepOther);

  var psh = ensureSheet_(SHEET_ADPLAN, ADPLAN_HEADER);
  var need2 = Math.max(rows.length + 1, 2);
  if (psh.getMaxRows() < need2) psh.insertRowsAfter(psh.getMaxRows(), need2 - psh.getMaxRows());
  psh.getRange(2, AP_GID, need2 - 1, 1).setNumberFormat('@');
  psh.getRange(2, AP_CID, need2 - 1, 1).setNumberFormat('@');
  writeTable_(psh, ADPLAN_HEADER, rows);
  if (rows.length) psh.getRange(2, AP_APPROVE, rows.length, 1).insertCheckboxes();
  headerNotes_(psh, 1, ADPLAN_HEADER, {
    '캠페인명': '아마존은 캠페인 이름에 한글을 안 받는다.\n전용은 ASIN 을, 묶음은 구간 번호를 쓴다.\n어느 SKU 인지는 [대표SKU]·[SKU목록] 칸에 있다.',
    '동작': '생성 = 캠페인부터 새로 만든다\n기존에 추가 = 이미 있는 묶음에 상품만 넣는다\n이미 있음 = 할 일 없음',
    'CPC구간': '기준점에서 배수로 쌓은 고정 구간.\n권장 CPC 가 같으면 언제 계산해도 같은 구간에 들어가므로,\n새 물건이 들어와도 이미 있는 캠페인을 찾아 담긴다.',
    '입찰(JPY)': '구간의 아래 끝. 그 구간 어느 상품의 권장가보다도 낮아\n묶였다는 이유로 손해 보는 상품이 없다.',
    '일예산(JPY)': '손익분기 CPA × ' + ADPLAN_JUDGE_ORDERS + ' ÷ ' + ADPLAN_JUDGE_DAYS +
                   '일 × 여유 배수.\n"되는지 2주 안에 알려면 얼마가 드나" 로 잡은 값.',
    '기존광고제거': '새 캠페인을 만들면서 옛 그룹에 그대로 두면\n같은 상품이 두 곳에서 입찰해 자기끼리 값을 올린다.\n어디에 들어 있는지는 승인한 것만 실행할 때 조회해 뺀다 —\n계획 단계에서 천 개를 미리 조회하면 실행 시간을 넘긴다.',
    '승인': '체크한 줄만 [승인분 캠페인 생성 실행]이 만든다.',
    '결과': '실행 결과. 성공한 줄은 다시 실행해도 건너뛴다.'
  });

  var totDaily = 0, totSku = 0, cnt = {}, kept = 0;
  for (var t2 = 0; t2 < rows.length; t2++) {
    var madeAlready = String(rows[t2][AP_RESULT - 1]).indexOf('성공') === 0;
    if (madeAlready) kept++;
    if (rows[t2][1] !== '이미 있음' && !madeAlready) {
      totDaily += rows[t2][5]; totSku += rows[t2][7];
    }
    cnt[rows[t2][1]] = (cnt[rows[t2][1]] || 0) + 1;
  }
  var msg = '캠페인 생성 계획 — ' + rows.length + '줄 (생성 ' + (cnt['생성'] || 0) +
            ' · 기존에 추가 ' + (cnt['기존에 추가'] || 0) + ') · SKU ' + totSku;
  log_('ads', 'INFO', msg);
  toast_(msg);
  showSheet_(SHEET_ADPLAN);
  ui_().alert('전용 캠페인 생성 계획',
    (prefixChanged ? '⚠ 이름 앞머리 "' + rawPrefix + '" 는 아마존이 못 받아 "' + prefix +
                     '" 로 바꿔 씁니다 (아스키만 받습니다).\n' +
                     '   [광고기준 → 캠페인 이름 앞머리] 를 "' + prefix + '" 로 적어 두면 헷갈리지 않습니다.\n\n' : '') +
    (dropped.length
      ? '⛔ 시장가에 못 미쳐 뺀 SKU ' + dropped.length.toLocaleString() + '개 (월매출 ¥' +
        Math.round(dropAmt).toLocaleString() + ')\n' +
        '   CPC 상한이 시장가 ¥' + floorCpc + ' × ' + safe + ' = ¥' + needCap.toFixed(1) +
        ' 에 못 미칩니다 — 광고로 이길 수 없어 오가닉으로 둡니다.\n\n'
      : '') +
    (nFloored
      ? '↑ 시장가로 올린 캠페인 ' + nFloored + '개\n' +
        '   구간 아래 끝이 시장가 ¥' + floorCpc + ' 보다 낮아 그 값으로는 노출을 못 삽니다.\n\n'
      : '') +
    'SKU ' + totSku.toLocaleString() + '개\n' +
    '   새로 만들 캠페인 ' + (cnt['생성'] || 0) + '개\n' +
    '   이미 있는 묶음에 추가 ' + (cnt['기존에 추가'] || 0) + '개\n' +
    (cnt['이미 있음'] ? '   이미 있어 건너뜀 ' + cnt['이미 있음'] + '개\n' : '') +
    (kept ? '   이미 만든 ' + kept + '개는 자취를 그대로 두었습니다 (다시 안 만듭니다)\n' : '') + '\n' +
    '하루 예산 합계 ' + totDaily.toLocaleString() + '엔 · 한 달 ' +
      (totDaily * 30).toLocaleString() + '엔\n' +
    '(전부 켰을 때의 상한입니다. 클릭이 있어야 실제로 씁니다)\n\n' +
    '이 SKU 들이 지금 다른 광고그룹에 들어 있으면 실행할 때 거기서 뺍니다 —\n' +
    '그대로 두면 같은 상품이 두 곳에서 입찰해 자기끼리 값을 올립니다.\n' +
    '(어디에 들어 있는지는 승인한 것만 그때 조회합니다. 여기서 천 개를 미리\n' +
    ' 조회하려다 실행 시간을 넘겼습니다)\n\n' +
    'CPC 구간은 고정이라, 앞으로 새 물건이 들어와도\n' +
    '같은 계산으로 이 캠페인들에 담깁니다.\n\n' +
    '아직 아무것도 만들지 않았습니다.',
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * 메뉴: 계획 일괄 승인.
 *
 * 승인 칸이 여든 개가 넘으면 손으로 누를 수가 없다. 그렇다고 만들 때 전부
 * 자동으로 하면 확인 없이 돈 쓰는 것을 만들게 되므로, 승인은 남기되
 * 한 번에 켜는 길을 둔다 — 얼마를 거는 것인지 숫자로 보여주고 나서.
 */
function approveAllPlan() {
  var sh = getSheetOrThrow_(SHEET_ADPLAN);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADPLAN + '" 이 비어 있습니다.');
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();

  // 아직 안 만든 줄만. 매출 큰 것부터 골라 담을 수 있게 정렬해 둔다
  var open = [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][AP_ACTION - 1]) === '이미 있음') continue;
    if (String(v[i][AP_RESULT - 1]).indexOf('성공') === 0) continue;
    open.push({ row: i + 2, daily: Number(v[i][5]) || 0, sku: Number(v[i][7]) || 0,
                amt: Number(v[i][12]) || 0, on: v[i][AP_APPROVE - 1] === true });
  }
  if (!open.length) { ui_().alert('승인할 줄이 없습니다. 모두 만들었습니다.'); return; }
  open.sort(function (a, b) { return b.amt - a.amt; });

  var all = 0, allSku = 0;
  for (var a = 0; a < open.length; a++) { all += open[a].daily; allSku += open[a].sku; }

  var res = ui_().prompt('계획 일괄 승인',
    '아직 안 만든 줄 ' + open.length + '개 (SKU ' + allSku.toLocaleString() + '개)\n' +
    '전부 켜면 하루 예산 합계 ' + all.toLocaleString() + '엔 · 한 달 ' +
      (all * 30).toLocaleString() + '엔\n' +
    '(예산은 상한입니다. 클릭이 있어야 실제로 씁니다)\n\n' +
    '몇 개를 승인할까요? 오가닉 매출 큰 것부터 담습니다.\n' +
    '  ' + open.length + '     전부\n' +
    '  20    상위 20개만\n' +
    '  0     전부 승인 해제\n\n' +
    '숫자를 넣으세요 (그냥 [확인]이면 전부):',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var raw = String(res.getResponseText()).trim();
  var n = raw === '' ? open.length : parseInt(raw, 10);
  if (!(n >= 0 && n <= open.length)) {
    ui_().alert('0 ~ ' + open.length + ' 사이로 넣으세요.');
    return;
  }

  var pick = open.slice(0, n), sum = 0, sku2 = 0;
  for (var p = 0; p < pick.length; p++) { sum += pick[p].daily; sku2 += pick[p].sku; }
  if (n > 0) {
    var ok = ui_().alert('계획 일괄 승인',
      n + '개를 승인합니다 (SKU ' + sku2.toLocaleString() + '개).\n' +
      '하루 예산 합계 ' + sum.toLocaleString() + '엔 · 한 달 ' +
        (sum * 30).toLocaleString() + '엔\n\n' +
      '승인만 하는 것이라 아직 아무것도 안 만듭니다.\n' +
      '[승인분 캠페인 생성 실행]을 눌러야 만들어집니다.\n\n진행할까요?',
      ui_().ButtonSet.YES_NO);
    if (ok !== ui_().Button.YES) return;
  }

  // 한 칸씩 쓰면 여든 번을 부른다 — 한 덩어리로 읽고 한 번에 쓴다
  var col = [];
  for (var r2 = 0; r2 < v.length; r2++) col.push([false]);
  for (var q = 0; q < pick.length; q++) col[pick[q].row - 2] = [true];
  sh.getRange(2, AP_APPROVE, v.length, 1).setValues(col);

  var msg = '계획 승인 ' + n + '개 · 하루 예산 ' + sum.toLocaleString() + '엔';
  log_('ads', 'INFO', msg);
  toast_(msg);
  showSheet_(SHEET_ADPLAN);
  ui_().alert('계획 일괄 승인', msg + '\n\n' +
    (n ? '다음: [승인분 캠페인 생성 실행]\n처음이면 [아니오](멈춤 상태)를 권합니다.'
       : '모두 승인 해제했습니다.'), ui_().ButtonSet.OK);
  return msg;
}
