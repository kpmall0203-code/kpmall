/**
 * 65_시트정리.gs — 탭 순서 정리 · 숨김 · 청소
 *
 * 기능이 늘면서 탭이 25개를 넘겼다. 대부분은 시스템이 읽고 쓰는 '데이터'라
 * 사람이 열어볼 일이 없는데, 정작 매일 봐야 하는 탭이 그 사이에 묻힌다.
 *
 * 세 부류로 나눈다:
 *   [작업]  사람이 직접 보고 손대는 탭. 맨 앞에 순서대로 놓는다.
 *   [결과]  가끔 열어보는 분석 결과. 작업 탭 뒤.
 *   [데이터] 시스템 저장소. 숨긴다 — 지우면 안 되지만 볼 일도 없다.
 *
 * 숨김은 삭제가 아니다. 시트 하단 '숨겨진 시트' 아이콘이나
 * 메뉴 [모든 시트 보이기]로 언제든 다시 꺼낼 수 있다.
 */

/**
 * 탭 목록을 상수가 아니라 함수로 둔다.
 *
 * Apps Script는 파일을 이름순으로 로드하며 최상위 문장을 그 자리에서 실행한다.
 * 이 파일(65)은 67·69보다 먼저 로드되므로, 최상위 배열에 SHEET_VERIFY(67)나
 * SHEET_MARGIN(69)을 적으면 undefined가 그대로 박힌다 —
 * 그 탭들이 정리 대상에서 조용히 빠졌다. 함수로 두면 호출 시점에 값이 잡힌다.
 */

/**
 * 무슨 일을 하려는지 고르면 그 일에 쓰는 탭만 남기고 전부 숨긴다.
 *
 * 탭이 스물몇 개인데 한 번에 다 쓰는 일은 없다. 가격을 고칠 때 청구서 탭이
 * 옆에 있어봐야 눈만 어지럽고, 반대도 마찬가지다.
 * '자주 보는 것 / 가끔 보는 것'으로 나눴더니 결국 다 보이는 셈이라 소용이 없었다.
 *
 * 숨김은 삭제가 아니다. 언제든 다른 작업을 고르거나 [모든 시트 보이기]로 되돌린다.
 */
function tabModes_() {
  return [
    { key: 'reprice', name: '리프라이싱 (가격 산출 → 반영 → 확인)',
      tabs: [SHEET_REPRICE, SHEET_VERIFY, SHEET_APPLY, SHEET_EXCLUDE] },

    { key: 'analyze', name: '매출·판매 분석',
      tabs: [SHEET_MARGIN, SHEET_TRACK, SHEET_ADSREPORT,
             SHEET_BUYBOX, SHEET_SEASON, SHEET_DAILY] },

    /**
     * 광고는 묶음이 셋이다. 하나로 두면 탭 스물세 개가 한꺼번에 펴져
     * "무엇을 보고 있는지" 를 알 수 없다.
     *
     *   트랙 B   새 상품을 키우는 자리. 매일 보는 것은 여기뿐이다
     *   트랙 A   이미 팔리는 상품의 광고를 손질하는 자리 (주·월 단위)
     *   자료     프로그램이 읽고 쓰는 수집물. 사람은 무엇이 언제 들어왔는지만 본다
     *
     * 어느 탭이 무엇인지는 [탭 안내] 가 한 줄씩 적어 준다.
     */
    { key: 'adsB', name: '🌱 광고 · 트랙 B — 새 상품 키우기 (매일)',
      tabs: [SHEET_DASH, SHEET_ADGROW, SHEET_POLICY, SHEET_JOB, SHEET_INBOX,
             SHEET_ADPLAN_GROW, SHEET_SPENDDAY, SHEET_ADWATCH, SHEET_ADTERM, SHEET_ADLOG] },

    { key: 'adsA', name: '🏗 광고 · 트랙 A — 있는 광고 손질 (주·월)',
      tabs: [SHEET_ADBASIS, SHEET_EXPAND, SHEET_ADSTOP, SHEET_REALLOC, SHEET_ADPLAN,
             SHEET_ADTERM, SHEET_ADPROD, SHEET_ADWATCH, SHEET_ADLOG, SHEET_SALES] },

    { key: 'adsData', name: '📥 광고 · 자료 (수집물 — 프로그램이 읽는 것)',
      tabs: [SHEET_ADSTRUCT, SHEET_ADGRP, SHEET_ADPROD, SHEET_ADUNIT, SHEET_ADKW, SHEET_ADTERM_RAW,
             SHEET_ADCAMP, SHEET_SPENDDAY, SHEET_ADS, SHEET_ADSDAY, SHEET_ADSREPORT,
             SHEET_ADSUM, SHEET_ADLOG] },

    { key: 'invoice', name: '청구서·배송비 — 실측 무게와 요율',
      tabs: [SHEET_SHIPHEAVY, SHEET_SHIPLOOKUP, '청구서검증', SHEET_PACKOPT,
             SHEET_RATECARD, SHEET_COOLSW, SHEET_COOLLOG, SHEET_COST] },

    { key: 'cost', name: '원가·수익성',
      tabs: [SHEET_COST, SHEET_PROFIT] },

    { key: 'setup', name: '설정·자동화',
      tabs: [SHEET_CONFIG, SHEET_EXCLUDE] },

    { key: 'all', name: '전부 보기 (숨김 해제)', tabs: null }
  ];
}

var PROP_TAB_MODE = 'TAB_MODE';

/** 지금 고른 작업 (없으면 리프라이싱) */
function tabModeCurrent_() {
  var key = PropertiesService.getScriptProperties().getProperty(PROP_TAB_MODE) || 'reprice';
  var modes = tabModes_();
  for (var i = 0; i < modes.length; i++) if (modes[i].key === key) return modes[i];
  return modes[0];
}

// 시스템 저장소 탭(리스팅·환율·주문 등)은 따로 목록을 두지 않는다 —
// 어느 작업에도 들어 있지 않으므로 applyTabMode_의 '나머지 전부 숨김'에 자연히 걸린다.

/** 사람이 여는 탭 전체 (어느 작업이든 한 번은 나오는 것) */
function tabAllVisible_() {
  var modes = tabModes_(), seen = {}, out = [];
  for (var i = 0; i < modes.length; i++) {
    if (!modes[i].tabs) continue;
    for (var j = 0; j < modes[i].tabs.length; j++) {
      var t = modes[i].tabs[j];
      if (t && !seen[t]) { seen[t] = true; out.push(t); }
    }
  }
  return out;
}

// 예전 버전이 만들었다가 이름이 바뀐 탭 (내용이 비어 있을 때만 지운다)
// 기능을 걷어내면서 남은 탭. 내용이 있으면 지우지 않고 알려만 준다.
var TAB_OBSOLETE = ['자동화제외', '최적화_대상', '최적화', '즉시교정',
                    '신규감사', '판매분석', '권장가계산기', 'API권한'];

/** 메뉴: 탭 정리 — 무슨 일을 할지 고르면 그 일에 쓰는 탭만 남긴다 */
function organizeSheets() {
  var modes = tabModes_();
  var cur = tabModeCurrent_();
  var lines = modes.map(function (m, i) {
    return '  ' + (i + 1) + ') ' + m.name + (m.key === cur.key ? '   ← 지금' : '');
  }).join('\n');

  var res = ui_().prompt('탭 정리 — 무슨 작업을 하시나요',
    '고른 작업에 쓰는 탭만 남기고 나머지는 숨깁니다.\n' +
    '(숨김은 삭제가 아닙니다. 언제든 다시 고르면 됩니다)\n\n' + lines + '\n\n' +
    '번호를 입력하세요.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;

  var pick = parseInt(String(res.getResponseText()).trim(), 10);
  if (!(pick >= 1 && pick <= modes.length)) {
    ui_().alert('1 ~ ' + modes.length + ' 사이로 넣으세요.');
    return;
  }
  return applyTabMode_(modes[pick - 1], true);
}

/**
 * 고른 작업에 맞춰 탭을 보이고 숨긴다.
 * @param {{key:string, name:string, tabs:Array}} mode
 * @param {boolean} interactive 알림창을 띄울지
 */
function applyTabMode_(mode, interactive) {
  var ss = ss_();
  var moved = 0, hidden = 0, shown = 0, removed = [];
  PropertiesService.getScriptProperties().setProperty(PROP_TAB_MODE, mode.key);

  // '전부 보기'는 데이터 탭과 스냅샷만 숨기고 나머지를 다 편다
  var want = mode.tabs || tabAllVisible_();
  // 설명서는 어느 작업을 고르든 남긴다 — '이게 뭐지'는 아무 때나 생긴다
  if (want.indexOf(SHEET_MANUAL) < 0) want = want.concat([SHEET_MANUAL]);
  var wantSet = {};
  for (var w = 0; w < want.length; w++) wantSet[want[w]] = true;

  // 1) 고른 탭을 앞으로 순서대로.
  //    숨긴 시트를 setActiveSheet 하면 스프레드시트가 멈춘 것처럼 오래 걸리므로
  //    먼저 펴고, 이미 제자리인 탭은 건드리지 않는다
  //    (moveActiveSheet 는 호출마다 전체 재배치라 비싸다).
  var pos = 1;
  for (var i = 0; i < want.length; i++) {
    var sh = ss.getSheetByName(want[i]);
    if (!sh) continue;                       // 아직 안 만들어진 탭은 건너뛴다
    if (sh.isSheetHidden()) { sh.showSheet(); shown++; }
    if (sh.getIndex() !== pos) {
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(pos);
      moved++;
    }
    pos++;
  }

  // 2) 나머지는 전부 숨긴다.
  //    보이는 시트 수를 매번 다시 세면 O(n²)이라 한 번만 세고 카운터로 굴린다.
  var all = ss.getSheets();
  var visible = 0;
  for (var v = 0; v < all.length; v++) if (!all[v].isSheetHidden()) visible++;
  for (var j = 0; j < all.length; j++) {
    var name = all[j].getName();
    if (wantSet[name]) continue;
    if (TAB_OBSOLETE.indexOf(name) >= 0) continue;   // 아래에서 따로 다룬다
    if (all[j].isSheetHidden()) continue;
    if (visible <= 1) break;                 // 마지막 보이는 시트는 숨길 수 없다
    all[j].hideSheet();
    visible--;
    hidden++;
  }

  // 3) 없어진 기능이 남긴 탭 정리.
  //    빈 탭은 그냥 지우고, 내용이 있는 탭은 몇 행인지 보여주고 물어본 뒤 지운다.
  //    (기능을 걷어내도 탭은 남는다 — 안 지우면 계속 눈에 걸리고, 말없이 지우면 놀란다)
  var withData = [];
  for (var k = 0; k < TAB_OBSOLETE.length; k++) {
    var old = ss.getSheetByName(TAB_OBSOLETE[k]);
    if (!old) continue;
    if (old.getLastRow() > 1) { withData.push(old); continue; }
    ss.deleteSheet(old);
    removed.push(TAB_OBSOLETE[k] + ' 삭제 (비어 있음)');
  }

  // 목록에서 떨어져 나간 스냅샷 탭 — 되돌리기는 목록을 보고 찾으므로 이건 못 쓴다
  var known = {};
  var idx = ss.getSheetByName(SHEET_SNAPSHOT_INDEX);
  if (idx && idx.getLastRow() > 1) {
    var iv = idx.getRange(2, 1, idx.getLastRow() - 1, SNAPSHOT_INDEX_HEADER.length).getValues();
    for (var q = 0; q < iv.length; q++) known[String(iv[q][SI_TAB])] = true;
  }
  var all2 = ss.getSheets();
  for (var o = 0; o < all2.length; o++) {
    var nm2 = all2[o].getName();
    if (nm2.indexOf(SNAPSHOT_PREFIX) !== 0 || known[nm2]) continue;
    withData.push(all2[o]);
  }
  // 자동화설정에 없어진 항목이 남아 있으면 다시 그린다 (체크 상태는 보존된다)
  try {
    if (automationSheetIsStale_()) {
      buildAutomationSheet_();
      removed.push(SHEET_CONFIG + ' 목록 갱신 (없어진 항목 제거)');
    }
  } catch (e) {}

  if (withData.length && interactive) {
    var lines2 = withData.map(function (s) {
      return '   · ' + s.getName() + '  (' + (s.getLastRow() - 1).toLocaleString() + '행)';
    }).join('\n');
    var ans = ui_().alert('없어진 기능이 남긴 탭',
      '아래 탭은 이제 쓰지 않는 기능이 만든 것입니다.\n' +
      '(스냅샷_ 은 되돌리기 목록에서 떨어져 나가 더는 복구에 못 씁니다)\n\n' + lines2 + '\n\n' +
      '지금 지울까요?\n' +
      '[아니오]를 누르면 그대로 두고 다음에 다시 물어봅니다.',
      ui_().ButtonSet.YES_NO);
    if (ans === ui_().Button.YES) {
      for (var w = 0; w < withData.length; w++) {
        var nm = withData[w].getName(), rows = withData[w].getLastRow() - 1;
        ss.deleteSheet(withData[w]);
        removed.push(nm + ' 삭제 (' + rows + '행)');
      }
    } else {
      for (var w2 = 0; w2 < withData.length; w2++) {
        removed.push(withData[w2].getName() + ' (보존)');
      }
    }
  }

  var msg = mode.name + ' — 보임 ' + want.length + '개 · 숨김 ' + hidden + '개' +
            (shown ? ' · 다시 폄 ' + shown + '개' : '') +
            (removed.length ? ' · 정리 ' + removed.length + '개' : '');
  log_('sheets', 'INFO', msg);
  toast_(mode.name);
  if (interactive) {
    try {
      ui_().alert('탭 정리 — ' + mode.name,
        '보이는 탭 (' + want.length + '개)\n   ' + want.join(' · ') + '\n\n' +
        '숨긴 탭 ' + hidden + '개 — 지운 게 아닙니다.\n' +
        (removed.length ? '\n구버전 잔재\n   ' + removed.join('\n   ') + '\n' : '') +
        '\n다른 작업을 하려면 [탭 정리]를 다시 실행해 고르세요.\n' +
        '전부 보려면 [⚙ 설정 → 숨긴 시트 모두 보이기].',
        ui_().ButtonSet.OK);
    } catch (e) {}
  }
  return msg;
}

/** 알림창 없이 정리만 (처음 설정 끝에서 부른다) */
function organizeSheets_quiet_() {
  applyTabMode_(tabModeCurrent_(), false);
}

/** 메뉴: 숨긴 시트 모두 보이기 (스냅샷 제외 — 갯수가 많고 볼 일이 없다) */
function showHiddenSheets() {
  var ss = ss_();
  var all = ss.getSheets();
  var shown = 0;
  for (var i = 0; i < all.length; i++) {
    if (!all[i].isSheetHidden()) continue;
    if (all[i].getName().indexOf(SNAPSHOT_PREFIX) === 0) continue;
    all[i].showSheet();
    shown++;
  }
  toast_(shown + '개 시트를 다시 표시했습니다.');
  ui_().alert('숨긴 시트 표시',
    shown + '개를 다시 표시했습니다.\n' +
    '(스냅샷 탭은 갯수가 많아 그대로 두었습니다)\n\n' +
    '다시 정리하려면 [탭 정리]를 실행하세요.', ui_().ButtonSet.OK);
}

// ── 탭 안내 ─────────────────────────────────────────────
//
// "이 탭이 뭐지" 는 아무 때나 생긴다. 탭 이름만으로는 광고구조와 광고그룹이
// 어떻게 다른지, 광고실적과 광고캠페인일별 중 어느 것이 여력 계산에 쓰이는지
// 알 수 없다. 한 줄씩 적어 표로 만든다 — 설명서(77)가 '무슨 단추' 라면
// 이것은 '무슨 표' 다.

var SHEET_TABGUIDE = '탭안내';
var TABGUIDE_HEADER = ['묶음', '탭', '무엇인가', '누가 쓰나', '언제 보나'];

var TAB_WHO_HUMAN = '사람이 고침';
var TAB_WHO_BOTH = '사람 ↔ 프로그램';
var TAB_WHO_PROG = '프로그램이 씀 (읽기만)';

/** 탭 하나하나가 무엇인가. 코드가 쓰는 이름을 그대로 쓴다 */
function tabGuideRows_() {
  var B = '🌱 트랙 B', A = '🏗 트랙 A', D = '📥 광고 자료', C = '공통';
  return [
    [B, SHEET_DASH, '지금 돈이 어디로 나가는지 한 장 — 관리하는 것과 관리 밖(옛 캠페인)을 갈라서 보여 준다',
     TAB_WHO_PROG, '아침에 한 번'],
    [B, SHEET_ADGROW, '트랙 B 의 본표 한 장. 값·한도·승인·단계·다음 행동이 한 줄에 다 있다. ' +
     '사람이 적을 것은 셋뿐 — 마진율 · ' + AG_CVR_NAME + ' · 주간허용손해 (추천값을 채워 준다)',
     TAB_WHO_BOTH, '매일 (단계와 다음 행동만 봐도 된다)'],
    [A, SHEET_POLICY, '트랙 A 의 한도·모드·승인. 트랙 B 의 한도는 광고육성 표 안에 있다',
     TAB_WHO_HUMAN, '트랙 A 한도를 정할 때'],
    [B, SHEET_JOB, '프로그램이 아마존에 보낼 변경 하나하나(입찰·멈춤)와 그 결과. 무엇을 왜 보냈는지가 줄마다 남는다',
     TAB_WHO_PROG, '이상할 때만'],
    [B, SHEET_INBOX, '사람이 정해야 할 것만 모아 놓은 곳. 비어 있으면 손댈 것이 없다는 뜻',
     TAB_WHO_BOTH, '매일 (비어 있으면 넘어간다)'],
    [B, SHEET_ADPLAN_GROW, '만들 트랙 B 캠페인 줄. 승인 ✓ 인 줄만 만들어지고 켜진다',
     TAB_WHO_BOTH, '캠페인이 안 만들어질 때'],
    [B, SHEET_SPENDDAY, '캠페인 × 날짜 지출·매출 원장. 여력·손실 계산은 이 표 하나만 본다',
     TAB_WHO_PROG, '자료가 며칠 것인지 확인할 때'],
    [B, SHEET_ADWATCH, '매일 아침 이상한 캠페인 — 노출 0, 멈춰야 하는데 켜져 있음, 예산 과다 등',
     TAB_WHO_PROG, '매일'],
    [B, SHEET_ADTERM, '자동 캠페인이 실제로 산 검색어와 판정. 기준키워드 자동 선정이 여기서 판 말을 고른다',
     TAB_WHO_BOTH, '주 1회'],

    [A, SHEET_ADBASIS, '트랙 A 계산의 기준값 (마진율·목표 ACOS·한도 등)', TAB_WHO_HUMAN, '기준을 바꿀 때'],
    [A, SHEET_EXPAND, '지금 광고 중인 상품 중 어디에 더 써도 되나. 상품마다 마진율과 그 출처를 적어 두고, ' +
     '[마진율(%)] 을 사람이 고쳐 적으면 다시 계산해도 그 값은 지우지 않는다. ' +
     '[필요마진율] 은 지금 내는 값이 손익분기가 되는 마진율이라 마진율을 몰라도 보인다',
     TAB_WHO_BOTH, '광고를 늘릴지 정할 때 (주 1회)'],
    [A, SHEET_ADSTOP, '안 팔리는데 돈만 쓰는 광고. 클릭이 쌓였는데도 본전 주문율에 못 미치는 SKU 를 골라 ' +
     '[승인] 을 켠 줄만 그 상품의 광고를 낱개로 멈춘다 (캠페인·광고그룹은 건드리지 않는다)',
     TAB_WHO_BOTH, '확대보다 먼저 — 주 1회'],
    [A, SHEET_REALLOC, 'SKU 별 채산성 계산 결과 — 권장 클릭비용과 구간', TAB_WHO_PROG, '재배분을 돌린 뒤'],
    [A, SHEET_ADPLAN, '만들 트랙 A·승격 캠페인 줄. 승인 ✓ 인 줄만 만들어진다', TAB_WHO_BOTH, '캠페인을 만들 때'],
    [A, SHEET_ADPROD, '어느 광고그룹이 어느 SKU 를 광고하나 — 채산성과 입찰을 잇는 다리',
     TAB_WHO_PROG, '이상할 때만'],
    [A, SHEET_SALES, '세션·전환율의 출처. 트랙 A 계산이 이것을 본다', TAB_WHO_PROG, '이상할 때만'],

    [D, SHEET_ADSTRUCT, '캠페인·광고그룹·키워드·겨냥의 지금 상태. 입찰을 확인하고 검증하는 기준',
     TAB_WHO_PROG, '검증이 "자료 없음" 이라 할 때'],
    [D, SHEET_ADUNIT, 'SKU 하나하나의 광고와 그 광고ID. 몰아넣기 그룹에 든 것까지 전부 있다 — ' +
     '이것이 있어야 그룹 입찰을 건드리지 않고 그 상품의 광고만 멈출 수 있다',
     TAB_WHO_PROG, '멈춤 후보가 "손잡이 없음" 이라 할 때'],
    [D, SHEET_ADGRP, '광고그룹별 기본입찰. 자동 캠페인의 입찰은 이 값이 곧 그 그룹의 입찰이다',
     TAB_WHO_PROG, '입찰 검증이 이상할 때'],
    [D, SHEET_ADKW, '키워드·타깃의 주간 실적 (노출·클릭·주문·상단 점유율)', TAB_WHO_PROG, '주 1회'],
    [D, SHEET_ADTERM_RAW, '검색어 원자료 (주 단위). 광고검색어 판정의 재료', TAB_WHO_PROG, '거의 안 봄'],
    [D, SHEET_ADCAMP, '캠페인 목록과 일예산 (이름·상태·예산만 따로 모은 것)',
     TAB_WHO_PROG, '거의 안 봄'],
    [D, SHEET_ADS, 'SKU × 날짜 광고비 (TACOS 분석용)', TAB_WHO_PROG, '거의 안 봄'],
    [D, SHEET_ADSDAY, '하루 광고비 합계 (SKU 를 걸러 받아도 하루 총액은 여기 남는다)',
     TAB_WHO_PROG, '거의 안 봄'],
    [D, SHEET_ADSUM, '광고 자료를 접어 둔 요약 (오래된 것을 접을 때 만든다)',
     TAB_WHO_PROG, '거의 안 봄'],
    [D, SHEET_ADSREPORT, 'TACOS · 광고 효율 분석 결과', TAB_WHO_PROG, '분석을 돌린 뒤'],

    [C, SHEET_ADLOG, '우리가 바꾼 모든 것의 기록 — 언제 무엇을 왜 바꿨나. 사고가 나면 여기서 찾는다',
     TAB_WHO_PROG, '무엇이 왜 바뀌었는지 물을 때'],
    [C, SHEET_MANUAL, '메뉴 단추마다 무슨 일을 하는지', TAB_WHO_PROG, '"이 단추 뭐지" 싶을 때'],
    [C, SHEET_TABGUIDE, '지금 보고 있는 이 표', TAB_WHO_PROG, '"이 탭 뭐지" 싶을 때']
  ];
}

/** 메뉴: 탭 안내 — 어느 탭이 무엇인가 */
function showTabGuide() {
  var made = makeOneSheet_([{ name: SHEET_TABGUIDE, header: TABGUIDE_HEADER }]);
  if (madeSheetStop_(made, '탭 안내')) return;
  var sh = ss_().getSheetByName(SHEET_TABGUIDE);

  var rows = tabGuideRows_();
  var ss = ss_(), out = [];
  for (var i = 0; i < rows.length; i++) {
    var name = rows[i][1];
    var exists = !!ss.getSheetByName(name);
    out.push([rows[i][0], name + (exists ? '' : '  (아직 없음)'),
              rows[i][2], rows[i][3], rows[i][4]]);
  }
  writeTable_(sh, TABGUIDE_HEADER, out);
  sh.getRange(1, 1, 1, TABGUIDE_HEADER.length).setValues([TABGUIDE_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  var wid = [90, 150, 520, 150, 200];
  for (var w = 0; w < wid.length; w++) sh.setColumnWidth(w + 1, wid[w]);
  sh.getRange(2, 3, out.length, 1).setWrap(true);

  showSheet_(SHEET_TABGUIDE);
  ui_().alert('탭 안내',
    '탭 ' + out.length + '개가 무엇인지 적었습니다.\n\n' +
    '탭이 많아 보이는 것은 대부분 프로그램이 읽는 자료라 그렇습니다 —\n' +
    '[탭 정리]에서 지금 하려는 일을 고르면 그 일에 쓰는 탭만 남습니다:\n' +
    '   🌱 트랙 B (매일 보는 것)\n' +
    '   🏗 트랙 A (주·월)\n' +
    '   📥 광고 자료 (수집물)',
    ui_().ButtonSet.OK);
}
