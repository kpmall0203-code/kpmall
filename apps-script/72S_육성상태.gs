/**
 * 72S_육성상태.gs — 트랙 B 상태 점검 (계산·표시만, 아마존을 건드리지 않는다)
 *
 * ── 이 걸음이 답하는 질문 ───────────────────────────────
 *   이 상품에 지금까지 얼마를 썼고, 그중 얼마를 실제로 잃었나
 *   승인된 한도 안에서 앞으로 얼마를 더 쓸 수 있나
 *   지금 어느 단계인가, 다음에 사람이 해야 할 일은 무엇인가
 *
 * ── 왜 '위험평가손실' 을 따로 세나 ──────────────────────
 * 손실 = 광고비 − 공헌이익인데, 광고매출은 클릭 뒤 며칠에 걸쳐 붙는다.
 * 아직 자라는 중인 매출로 손실을 깎으면 실제보다 안전해 보인다.
 * 그래서 위험평가에서는 성숙한 매출만 인정한다 — 늦게 붙을 이익은
 * 붙고 나서 세면 되지만, 이미 나간 광고비는 지금 나간 돈이다.
 *
 * ── 무엇을 하지 않나 ────────────────────────────────────
 * 입찰·예산을 바꾸지 않고 캠페인을 켜거나 끄지 않는다. 정책이 [자동운영]이 되고
 * 한도가 확정된 뒤에 실행 걸음을 따로 만든다. 지금은 사실을 보여 주는 것까지다.
 */

// 광고육성 표에 뒤로 붙일 칸. 머리글 이름으로 찾는다 (열 번호를 박지 않는다)
var ADGROW_EXT = [
  '정책ID', '정책상태',
  '마진출처', '마진확인일',
  '초기추정전환율(%)', '실제광고전환율(%)', '판단전환율(%)', '성숙클릭',
  '단계',
  '주간지출(JPY)', '주간위험손실(JPY)', '주간여력(JPY)',
  '누적지출(JPY)', '누적위험손실(JPY)', '누적여력(JPY)',
  '미집계준비액(JPY)', '경과일', '자료기준일', '다음 행동'
];

/** 단계 (기획서 9.5) */
var BSTAGE_INPUT = '입력대기';
var BSTAGE_FIND = '키워드발견';
var BSTAGE_PREP = '수동준비';
var BSTAGE_GROW = '집중육성';
var BSTAGE_HOLD = '유지확인';
var BSTAGE_HANDOVER = 'A인계';
var BSTAGE_STOP = '보류/중단';

/** 이 육성 줄이 쓰는 캠페인ID 전부 (지금 것 + 갈아타며 버린 것) */
function adGrowCids_(row) {
  var out = {};
  var cur = String(row[AG_CID] || '').trim();
  if (cur) out[cur] = true;
  var prev = String(row[AG_PREVCID] || '').split(',');
  for (var i = 0; i < prev.length; i++) {
    var p = prev[i].trim();
    if (p) out[p] = true;
  }
  return out;
}

/**
 * 단계와 다음 행동을 정한다.
 * 막는 것이 먼저다 — 돈이 나가는 것을 멈출 이유가 있으면 그것이 단계다.
 */
function adGrowStage_(o) {
  if (!o.marginOk) {
    return { stage: BSTAGE_INPUT,
             next: '이 상품의 마진율을 광고육성 표에 적어 주세요 (원가·수수료·배송비를 뺀 값)' };
  }
  if (!o.policy) {
    return { stage: BSTAGE_INPUT,
             next: '운영 정책에 이 SKU 줄이 없습니다 — [운영 정책 만들기·정비]를 누르세요' };
  }
  if (!o.policy.ready) {
    return { stage: BSTAGE_INPUT,
             next: '정책에서 안 정한 것: ' + o.policy.miss.join(' · ') };
  }
  if (o.policy.mode === POLICY_MODE_HOLD) {
    return { stage: BSTAGE_STOP, next: '정책이 일시정지입니다 — 새 변경을 하지 않습니다' };
  }
  if (o.expired) {
    return { stage: BSTAGE_STOP,
             next: '최대 기간 ' + o.policy.maxDays + '일을 넘겼습니다 (' + o.days + '일째). ' +
                   '정책을 다시 승인하지 않으면 늘리지 않습니다' };
  }
  if (o.total.over) {
    return { stage: BSTAGE_STOP,
             next: '누적 한도 소진 — 지출 ' + fmtYen_(o.total.cost) + ' / ' +
                   fmtYen_(o.policy.totalSpend) + ' · 위험손실 ' + fmtYen_(o.total.risk) +
                   ' / ' + fmtYen_(o.policy.totalLoss) };
  }
  if (o.week.over) {
    return { stage: BSTAGE_STOP,
             next: '이번 주 한도 소진 — 다음 주에 누적 한도 안에서 다시 돕니다' };
  }
  if (o.pending === null) {
    return { stage: BSTAGE_STOP,
             next: '지출 자료가 없어 남은 여력을 계산할 수 없습니다 — [지출 원장 수집]을 먼저 하세요' };
  }
  if (!o.keyword) {
    return { stage: BSTAGE_FIND,
             next: '자동으로 검색어를 찾는 중입니다. 매주 [검색어 수집·판정]을 보고 ' +
                   '살 말이 보이면 [기준키워드]에 적으세요' };
  }
  if (!o.manual) {
    return { stage: BSTAGE_PREP,
             next: '기준키워드가 정해졌습니다 — [자동 → 수동 갈아타기] 로 수동 캠페인을 만드세요' };
  }
  if (o.rank <= 0) {
    return { stage: BSTAGE_GROW,
             next: '기준키워드로 검색한 오가닉 순위를 [오가닉순위]에 적어 주세요 — ' +
                   '순위가 없으면 졸업을 판정할 수 없습니다' };
  }
  if (o.goal > 0 && o.rank <= o.goal) {
    return { stage: BSTAGE_HOLD,
             next: '목표 ' + o.goal + '위에 닿았습니다 (' + o.rank + '위). ' +
                   '바로 끄지 않고 입찰을 낮춰 순위가 유지되는지 봅니다' };
  }
  return { stage: BSTAGE_GROW,
           next: '순위 ' + o.rank + '위 → 목표 ' + (o.goal || '?') + '위. ' +
                 '남은 여력 ' + (o.room >= 0 ? fmtYen_(o.room) : '계산 불가') };
}

function fmtYen_(n) {
  var v = Math.round(Number(n) || 0);
  return '¥' + v.toLocaleString();
}

/**
 * 메뉴: 트랙 B 상태 점검.
 * 시트만 읽고 시트에만 쓴다 — API 를 부르지 않는다.
 */
function reviewAdGrowState() {
  var made = makeOneSheet_([{ name: SHEET_INBOX, header: INBOX_HEADER }]);
  if (madeSheetStop_(made, '상태 점검')) return;
  var sh = getSheetOrThrow_(SHEET_ADGROW);
  if (sh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var map = ensureCols_(sh, ADGROW_EXT);
  var width = Math.max(sh.getLastColumn(), ADGROW_HEADER.length);
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();

  var led = adSpendRead_();
  var pol = adPolicyAll_();
  var basis = adBasis_();
  var prior = Number(basis['판단전환율 사전클릭']) || CVR_PRIOR_CLICKS;
  var today = ymd_(new Date());
  var wkFrom = weekStart_(today);
  var stat = {}, req = [], nOver = 0, sumWeek = 0, sumTotal = 0, sumRisk = 0;

  for (var i = 0; i < v.length; i++) {
    var sku = String(v[i][AG_SKU] || '').trim();
    if (!sku) continue;

    // 마진 — B 는 사람이 준다. 없으면 17% 로 메우지 않는다
    var marginPct = Number(v[i][AG_MARGIN]);
    var marginOk = isFinite(marginPct) && marginPct > 0 && marginPct < 100;
    var margin = marginOk ? marginPct / 100 : 0;
    setCell_(v[i], map, '마진출처', marginOk ? '사용자 입력' : '없음');
    if (!marginOk) {
      req.push({ kind: 'B마진', target: sku,
                 what: '이 상품의 광고비를 빼기 전 마진율은 몇 %인가요? ' +
                       '원가·수수료·배송비를 반영한 값을 광고육성 표의 [마진율(%)] 에 적어 주세요',
                 now: v[i][AG_MARGIN] === '' ? '(빈칸)' : String(v[i][AG_MARGIN]) });
    } else {
      adInboxClose_('B마진', sku);
    }

    var p = adPolicyFor_(pol, 'B', sku);
    setCell_(v[i], map, '정책ID', p ? p.id : '');
    setCell_(v[i], map, '정책상태', p ? (p.ready ? '유효 · ' + p.mode : '미확정') : '없음');

    // 지출·손실 — 원장 하나에서만 센다
    var cids = adGrowCids_(v[i]);
    var start = v[i][AG_START] instanceof Date ? ymd_(v[i][AG_START])
                                               : String(v[i][AG_START] || '').substring(0, 10);
    var wk = adSpendSum_(led, cids, wkFrom, today);
    var tt = adSpendSum_(led, cids, start || '', today);
    var daily = Number(v[i][AG_DAILY]) || 0;
    var pending = adPendingSpend_(led.last, daily, today);
    var weekLedger = adLossLedger_(wk, margin, p ? p.weekSpend : 0, p ? p.weekLoss : 0, pending || 0);
    var totalLedger = adLossLedger_(tt, margin, p ? p.totalSpend : 0, p ? p.totalLoss : 0, pending || 0);

    // 전환율 — 초기 추정은 보존하고, 실제와 판단을 따로 적는다
    var initCvr = Number(v[i][AG_CVR]) || 0;               // [목표전환율(%)] 이 초기 추정이다
    var b = adBlendedCvr_(tt.matureOrd, tt.matureCk, initCvr / 100, prior);
    setCell_(v[i], map, '초기추정전환율(%)', initCvr || '');
    setCell_(v[i], map, '실제광고전환율(%)', b.actual === null ? '' : Math.round(b.actual * 10000) / 100);
    setCell_(v[i], map, '판단전환율(%)', Math.round(b.cvr * 10000) / 100);
    setCell_(v[i], map, '성숙클릭', b.n);

    var days = start ? daysBetween_(start, today) + 1 : 0;
    var expired = !!(p && p.maxDays > 0 && days > p.maxDays);
    var rank = Number(v[i][AG_RANK]) || 0;
    var goal = Number(v[i][AG_RANKGOAL]) || 0;
    var keyword = String(v[i][AG_KW] || '').trim();
    // 수동 캠페인인가 — 계획 표의 [유형] 이 답이다
    var manual = adGrowIsManual_(String(v[i][AG_CAMP] || '').trim());

    var st = adGrowStage_({
      marginOk: marginOk, policy: p, expired: expired, days: days,
      week: weekLedger, total: totalLedger, pending: pending,
      keyword: keyword, manual: manual, rank: rank, goal: goal,
      room: Math.min(weekLedger.room < 0 ? Infinity : weekLedger.room,
                     totalLedger.room < 0 ? Infinity : totalLedger.room)
    });

    setCell_(v[i], map, '단계', st.stage);
    setCell_(v[i], map, '다음 행동', st.next);
    setCell_(v[i], map, '주간지출(JPY)', Math.round(wk.cost));
    setCell_(v[i], map, '주간위험손실(JPY)', Math.round(weekLedger.risk));
    setCell_(v[i], map, '주간여력(JPY)', weekLedger.room < 0 ? '한도 미정' : Math.round(weekLedger.room));
    setCell_(v[i], map, '누적지출(JPY)', Math.round(tt.cost));
    setCell_(v[i], map, '누적위험손실(JPY)', Math.round(totalLedger.risk));
    setCell_(v[i], map, '누적여력(JPY)', totalLedger.room < 0 ? '한도 미정' : Math.round(totalLedger.room));
    setCell_(v[i], map, '미집계준비액(JPY)', pending === null ? '자료 없음' : pending);
    setCell_(v[i], map, '경과일', days || '');
    setCell_(v[i], map, '자료기준일', led.last || '(없음)');

    if (rank <= 0 && keyword) {
      req.push({ kind: '순위입력', target: sku,
                 what: '"' + keyword + '" 로 검색했을 때의 오가닉 순위를 [오가닉순위] 에 적어 주세요',
                 now: '(빈칸)' });
    } else if (rank > 0) {
      adInboxClose_('순위입력', sku);
    }

    stat[st.stage] = (stat[st.stage] || 0) + 1;
    if (weekLedger.over || totalLedger.over) nOver++;
    sumWeek += wk.cost; sumTotal += tt.cost; sumRisk += totalLedger.risk;
  }

  sh.getRange(2, 1, v.length, width).setValues(v);
  adGrowStateNotes_(sh);
  var nReq = adInboxAdd_(req);

  showSheet_(SHEET_ADGROW);
  var line = Object.keys(stat).map(function (k) { return k + ' ' + stat[k]; }).join(' · ');
  log_('ads', 'INFO', '트랙 B 상태 — ' + line);
  ui_().alert('트랙 B 상태 점검',
    (led.has ? '지출 자료 기준일 ' + led.last : '⛔ 지출 원장이 비어 있습니다 — [지출 원장 수집]을 먼저 하세요') +
    '\n이번 주 시작 ' + wkFrom + '\n\n' +
    line + '\n\n' +
    '이번 주 지출 ' + fmtYen_(sumWeek) + ' · 누적 지출 ' + fmtYen_(sumTotal) +
    ' · 누적 위험손실 ' + fmtYen_(sumRisk) + '\n' +
    (nOver ? '⛔ 한도를 넘긴 상품 ' + nOver + '개\n' : '') +
    (nReq ? '요청함에 ' + nReq + '건 넣었습니다\n' : '') + '\n' +
    '여기서는 아무것도 바꾸지 않았습니다. 표의 [단계]와 [다음 행동]을 보세요.',
    ui_().ButtonSet.OK);
}

/** 이 캠페인이 수동인가 — 육성 계획 표의 [유형] 을 본다 (시트만 읽는다) */
function adGrowIsManual_(campName) {
  if (!campName) return false;
  var sh = ss_().getSheetByName(SHEET_ADPLAN_GROW);
  if (!sh || sh.getLastRow() < 2) return false;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, ADPLAN_HEADER.length).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][AP_NAME - 1]).trim() !== campName) continue;
    return String(v[i][4] || '').indexOf('수동') === 0;
  }
  return false;
}

/**
 * 설명은 머리글 '이름' 으로 단다.
 * headerNotes_ 에 ADGROW_EXT 를 넘기면 1번 칸(SKU)부터 덮어쓴다 —
 * 그 배열의 순서를 곧 열 번호로 보기 때문이다. 뒤에 덧붙인 칸에는 쓸 수 없다.
 */
function adGrowStateNotes_(sh) {
  notesByName_(sh, {
    '정책상태': '운영 정책의 한도·모드·승인이 다 있어야 "유효".\n미확정이면 이 상품은 켜지지도 증액되지도 않는다.',
    '초기추정전환율(%)': '[목표전환율(%)] 에 적은 값. 실적이 쌓여도 덮어쓰지 않는다.',
    '실제광고전환율(%)': '성숙한 광고주문 ÷ 성숙한 광고클릭. 표본이 없으면 빈칸.',
    '판단전환율(%)': '입찰 계산에 쓰는 값.\n= (성숙주문 + 사전클릭 × 초기추정) ÷ (성숙클릭 + 사전클릭)\n' +
      '표본이 적으면 초기 추정 쪽으로, 쌓이면 실제값으로 간다 — ' +
      '클릭 1회 주문 1건을 100% 로 받아 과입찰하지 않으려는 것이다.',
    '주간위험손실(JPY)': '= max(0, 주간 광고비 − 성숙한 공헌이익).\n' +
      '아직 자라는 중인 매출로 손실을 깎지 않는다.',
    '주간여력(JPY)': '= min(지출한도 − 쓴 광고비, 손실한도 − 위험손실) − 미집계준비액.\n' +
      '주간과 누적 중 작은 쪽이 실제 여력이다.',
    '미집계준비액(JPY)': '마지막 지출 자료일 이후 아직 안 잡힌 지출의 추정.\n' +
      '= 지난 날 수 × 하루예산 × ' + SPEND_OVERSPEND_MULT + ' (아마존 일예산은 평균값이라 더 쓸 수 있다)',
    '단계': BSTAGE_INPUT + ' → ' + BSTAGE_FIND + ' → ' + BSTAGE_PREP + ' → ' +
            BSTAGE_GROW + ' → ' + BSTAGE_HOLD + ' → ' + BSTAGE_HANDOVER + '\n' +
            BSTAGE_STOP + ' 은 한도·기간·정책 때문에 멈춘 것이다.',
    '다음 행동': '사람이 다음에 할 일. 이 칸이 비면 프로그램이 알아서 갈 수 있다는 뜻이다.'
  });
}
