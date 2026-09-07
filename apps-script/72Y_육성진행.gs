/**
 * 72Y_육성진행.gs — 트랙 B 를 사람 손 없이 다음 단계로 민다 (기획서 9.5)
 *
 * ── 무엇을 자동으로 하나 ────────────────────────────────
 *   ① 기준키워드 고르기   자동 캠페인의 검색어 중 실제로 판 말을 고른다
 *   ② 계획에 넣기         정책이 [자동운영] 인 줄은 승인까지 채운다
 *   ③ 캠페인 만들기       멈춘 상태로 만든다
 *   ④ 겨냥 맞추기         자동이면 상품 겨냥을 끄고, 기준키워드가 있으면 올린다
 *   ⑤ 켜기                승인된 줄만
 *   ⑥ 자동 → 수동 갈아타기  기준키워드가 생겼는데 아직 자동이면
 *
 * ⑥ 뒤에는 ②③④⑤ 가 새 수동 캠페인에 다시 걸린다. 한 번에 다 하지 않고
 * 하루 한 걸음씩 나아가도 된다 — 각 걸음은 이미 된 줄을 건너뛰므로
 * 몇 번을 불러도 같은 자리에 머문다.
 *
 * ── 무엇으로 막나 ───────────────────────────────────────
 * 이 걸음은 정책이 [자동운영] 이고 한도가 다 찬 대상만 민다. 그 판단은
 * 계획 표의 [승인] 칸이 대신한다 — 승인은 정책이 채우고(72O), 생성·켜기는
 * 승인된 줄만 본다. 그래서 여기서 정책을 다시 해석하지 않는다.
 *
 * 트랙 A 표는 건드리지 않는다. 사람이 트랙 A 계획을 승인해 두고 아직 만들지
 * 않았을 수 있는데, 자동이 그것까지 만들면 사람이 안 시킨 돈이 나간다.
 * adPlanOnlySet_ 이 이 걸음 동안 트랙 B 표에만 손대게 막는다.
 */

/**
 * 기준키워드 자동 선정 — 판 말을 고른다.
 *
 * 클릭이 많은 말이 아니라 '주문이 붙은 말' 을 고른다. 클릭만 많고 안 팔린 말은
 * 순위를 사 봐야 팔리지 않는다 — 그 말로 갈아타면 손해만 굳는다.
 * 주문이 하나도 없으면 고르지 않는다. 자동 캠페인이 더 돌면서 자료를 모은다.
 */
var AUTOKW_MIN_ORDERS = 1;        // 이만큼은 팔린 말이어야 고른다
var AUTOKW_MAX_LEN = 80;          // 아마존 키워드 길이 한도

function adGrowAutoKeyword_() {
  var out = { picked: [], waiting: 0 };
  var sh = ss_().getSheetByName(SHEET_ADGROW);
  if (!sh || sh.getLastRow() < 2) return out;
  var map = hdrMap_(sh);
  var width = Math.max(sh.getLastColumn(), ADGROW_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();

  // 검색어 표 — 우리 캠페인의 말만 본다
  var tsh = ss_().getSheetByName(SHEET_ADTERM);
  if (!tsh || tsh.getLastRow() < 2) return out;
  var tv = tsh.getRange(2, 1, tsh.getLastRow() - 1, ADTERM_HEADER.length).getValues();

  var pol = adPolicyAll_(), dirty = false, logs = [];
  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][AG_SKU] || '').trim();
    if (!sku) continue;
    if (String(v[i][AG_KW] || '').trim()) continue;            // 이미 정해졌다
    var p = adPolicyFor_(pol, 'B', sku);
    if (!(p && p.canAuto)) continue;                           // 자동으로 밀 대상이 아니다
    var cids = adGrowCids_(v[i]);
    if (!Object.keys(cids).length) continue;                   // 아직 캠페인이 없다

    // 이 상품의 캠페인에서 나온 검색어를 말별로 모은다
    var by = {};
    for (var t = 0; t < tv.length; t++) {
      if (!cids[String(tv[t][AT_CID] || '').trim()]) continue;
      var term = String(tv[t][AT_TERM] || '').trim();
      if (!term || term.length > AUTOKW_MAX_LEN) continue;
      if (String(tv[t][AT_VERDICT] || '') === '부정') continue;          // 막기로 한 말
      var b = by[term] || (by[term] = { clicks: 0, orders: 0, cost: 0 });
      b.clicks += Number(tv[t][AT_CLICKS]) || 0;
      b.orders += Number(tv[t][AT_ORDERS]) || 0;
      b.cost += Number(tv[t][AT_COST]) || 0;
    }

    var best = null, bestTerm = '';
    for (var k in by) {
      var c = by[k];
      if (c.orders < AUTOKW_MIN_ORDERS) continue;
      if (!best || c.orders > best.orders ||
          (c.orders === best.orders && c.clicks > best.clicks)) { best = c; bestTerm = k; }
    }
    if (!best) { out.waiting++; continue; }

    v[i][AG_KW] = bestTerm;
    v[i][AG_WHY] = '기준키워드 자동 선정 — "' + bestTerm + '" (주문 ' + best.orders +
                   ' · 클릭 ' + best.clicks + ' · 광고비 ' + fmtYen_(best.cost) + ')';
    dirty = true;
    out.picked.push({ sku: sku, kw: bestTerm, orders: best.orders, clicks: best.clicks });
    logs.push(adLogRow_({
      kind: '육성', camp: String(v[i][AG_CAMP] || ''), target: bestTerm,
      item: '기준키워드', from: '', to: bestTerm, sku: sku, asin: String(v[i][AG_ASIN] || ''),
      sum: '기준키워드 자동 선정 · "' + bestTerm + '" · 주문 ' + best.orders,
      why: '자동 캠페인의 검색어 중 실제로 판 말. 클릭만 많은 말은 고르지 않는다',
      by: '자동 진행'
    }));
  }

  if (dirty) {
    sh.getRange(2, 1, v.length, width).setValues(v);
    if (logs.length) adLogWrite_(logs);
  }
  return out;
}

/**
 * 메뉴·트리거: 트랙 B 를 갈 수 있는 데까지 민다.
 *
 * 각 걸음은 제 조건에 맞는 줄만 건드린다. 조건이 안 되면 조용히 지나간다 —
 * "아무것도 안 했다" 가 정상이고, 그때는 표의 [다음 행동] 에 왜인지 적혀 있다.
 */
function advanceAdGrow(opts) {
  var quiet = !!(opts && opts.quiet);
  if (!quiet && !adBusyGuard_('트랙 B 자동 진행')) return null;
  var lines = [];

  // ① 기준키워드 — 판 말이 생겼으면 고른다
  var kw = adGrowAutoKeyword_();
  if (kw.picked.length) {
    lines.push('기준키워드 고름 ' + kw.picked.length + '개: ' +
               kw.picked.map(function (x) { return x.sku + ' → "' + x.kw + '"'; })
                 .slice(0, 3).join(' · '));
  }

  // ⑥ 갈아타기 — 기준키워드가 있는데 아직 자동이면 수동 줄을 만든다
  //    (①에서 방금 고른 것도 여기서 바로 이어진다)
  var sw = switchAdGrowToManual({ quiet: true }) || { n: 0 };
  if (sw.n) lines.push('자동 → 수동 갈아타기 ' + sw.n + '줄');

  // ② 계획에 넣기 — 아직 계획에 없는 줄
  var push = pushAdGrowToPlan({ quiet: true }) || { added: 0, updated: 0 };
  if (push.added || push.updated) {
    lines.push('계획에 넣음 ' + push.added + '개' +
               (push.updated ? ' · 값 갱신 ' + push.updated : ''));
  }

  /**
   * ③ 만들기 · ⑤ 켜기 — 트랙 B 표에만 손대게 울타리를 치고 부른다.
   * 이어실행 트리거가 나중에 이어받아도 울타리가 남아 있어야 하므로 속성에 적는다.
   */
  adPlanOnlySet_(SHEET_ADPLAN_GROW);
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_ADEXEC_STATE, 'off');       // 언제나 멈춘 상태로 만든다
  var made = adPlanExecStep_(false);
  if (made) lines.push(made);

  var a = narrowAdGrowTargets({ quiet: true }) || { n: 0, msg: '' };
  var b = applyAdGrowKeyword({ quiet: true }) || { n: 0, msg: '' };
  if (a.n) lines.push(a.msg);
  if (b.n) lines.push(b.msg);

  props.setProperty(PROP_ADENABLE_STATE, 'ON');      // 승인된 줄만 켠다
  var on = adEnableStep_(false);
  if (on) lines.push(on);
  adPlanOnlySet_('');

  var msg = lines.length ? lines.join('\n') : '민 것이 없습니다 (조건이 된 줄이 없습니다)';
  log_('ads', 'INFO', '트랙 B 자동 진행 — ' + msg.replace(/\n/g, ' | '));
  if (quiet) return { msg: msg, moved: lines.length, kw: kw.picked.length, sw: sw.n };
  showSheet_(SHEET_ADGROW);
  ui_().alert('트랙 B 자동 진행', msg + '\n\n' +
    (kw.waiting ? '아직 판 말이 없어 기준키워드를 못 고른 상품 ' + kw.waiting + '개 — ' +
                  '자동 캠페인이 더 돌아야 합니다.\n\n' : '') +
    '정책이 [' + POLICY_MODE_AUTO + '] 이고 한도가 다 찬 상품만 밉니다.\n' +
    '나머지는 광고육성 표의 [다음 행동] 에 이유가 있습니다.', ui_().ButtonSet.OK);
  return { msg: msg, moved: lines.length };
}
