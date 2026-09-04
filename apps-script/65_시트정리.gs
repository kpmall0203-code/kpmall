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
     * 광고 묶음은 메뉴 [📣 광고] 의 순서를 따른다:
     *   기준 → 재배분 → 계획 → (구조·그룹·상품은 계획의 재료) → 검색어 → 대장
     * 수집 원자료(광고실적·광고일계)는 TACOS 가 이상할 때 보는 것이라 뒤에 둔다.
     * 판매실적을 같이 남긴다 — 재배분의 세션·전환율이 거기서 나온다.
     */
    { key: 'ads', name: '광고 (기준 · 재배분 · 캠페인 · 검색어)',
      tabs: [SHEET_ADBASIS, SHEET_REALLOC, SHEET_ADPLAN, SHEET_ADSTRUCT, SHEET_ADGRP,
             SHEET_ADPROD, SHEET_ADTERM, SHEET_ADTERM_RAW, SHEET_ADLOG, SHEET_ADCAMP, SHEET_ADKW,
             SHEET_ADSREPORT, SHEET_ADS, SHEET_ADSDAY, SHEET_ADSUM, SHEET_SALES] },

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
