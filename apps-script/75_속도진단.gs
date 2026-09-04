/**
 * 75_속도진단.gs — 실제 시트에서 무엇이 느린지 잰다
 *
 * ── 왜 필요한가 ─────────────────────────────────────────
 * 모의 환경(dukpy)은 시트가 메모리라 읽기가 사실상 공짜다. 거기서 잰 초 단위는
 * 실제 시트와 아무 관계가 없는데, 그걸 근거로 "고쳤다"고 여러 번 잘못 말했다.
 * 셀 수를 세는 것도 대리 지표일 뿐 — 진짜 답은 이 시트에서 재는 것뿐이다.
 *
 * ── 죽어도 증거가 남게 ──────────────────────────────────
 * 6분을 넘겨 죽으면 그 실행의 코드는 하나도 안 돈다. 그래서 결과를 마지막에
 * 모아 쓰지 않고, 한 단계가 끝날 때마다 로그에 바로 적는다.
 * 도중에 죽어도 '어디까지 갔고 각 단계가 몇 초였는지'가 남는다.
 */

/** 메뉴: 속도 진단 */
function diagnoseSpeed() {
  var t0 = Date.now();
  var out = [];

  // 한 단계를 재고 그 자리에서 로그에 적는다
  var step = function (label, fn) {
    var s = Date.now();
    var note = '';
    try { note = fn() || ''; }
    catch (e) { note = '실패: ' + String(e).substring(0, 80); }
    var ms = Date.now() - s;
    var line = (ms / 1000).toFixed(1) + '초  ' + label + (note ? '  — ' + note : '');
    out.push(line);
    log_('speed', 'INFO', line);          // 죽어도 여기까지는 남는다
    return ms;
  };

  step('스프레드시트 열기', function () {
    var n = ss_().getSheets().length;
    return '시트 ' + n + '개';
  });

  // 큰 탭들의 크기부터 — 이게 모든 판단의 전제다
  var sizes = {};
  step('탭 크기 조회', function () {
    var names = [SHEET_ORDERS, SHEET_SALES, SHEET_LISTING, SHEET_ADS,
                 SHEET_SKUCOST, SHEET_SHIPMENTS, SHEET_PRICELOG, SHEET_LOG];
    var parts = [];
    for (var i = 0; i < names.length; i++) {
      var sh = ss_().getSheetByName(names[i]);
      var n = sh ? Math.max(sh.getLastRow() - 1, 0) : -1;
      sizes[names[i]] = n;
      if (n > 0) parts.push(names[i] + ' ' + n.toLocaleString());
    }
    return parts.join(' · ');
  });

  var ordSh = ss_().getSheetByName(SHEET_ORDERS);
  if (ordSh && sizes[SHEET_ORDERS] > 0) {
    var n = sizes[SHEET_ORDERS];

    step('주문 — 날짜 칸 1개 읽기 (' + n.toLocaleString() + '행)', function () {
      var v = ordSh.getRange(2, OD_DATE + 1, n, 1).getValues();
      return v.length + '행';
    });

    // 기간으로 자를 수 있는가 — 여기가 핵심이다.
    // 주문이 날짜순이 아니면 '90일 블록'이 사실상 전체가 되어 자르기가 무의미해진다.
    step('주문 — 90일 블록 크기 확인', function () {
      var from = ymd_(new Date(Date.now() - 90 * 86400000));
      var dcol = ordSh.getRange(2, OD_DATE + 1, n, 1).getValues();
      var lo = -1, hi = -1, hit = 0;
      for (var i = 0; i < n; i++) {
        var d = dcol[i][0];
        var ds = d instanceof Date ? ymd_(d) : String(d || '').substring(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || ds < from) continue;
        if (lo < 0) lo = i;
        hi = i; hit++;
      }
      if (lo < 0) return '90일 안에 드는 주문이 없음';
      var block = hi - lo + 1;
      var pct = Math.round(block / n * 100);
      return '해당 ' + hit.toLocaleString() + '행 · 블록 ' + block.toLocaleString() +
             '행 (' + pct + '%)' +
             (pct > 60 ? '  ⚠ 날짜가 섞여 있어 자르기 효과 없음' : '');
    });

    step('주문 — 전체 5칸 읽기', function () {
      var v = ordSh.getRange(2, 1, n, ORDERS_HEADER.length).getValues();
      return (n * ORDERS_HEADER.length).toLocaleString() + '셀';
    });
  }

  if (sizes[SHEET_SALES] > 0) {
    step('판매실적 — 3칸 읽기 (' + sizes[SHEET_SALES].toLocaleString() + '행)', function () {
      var sh = ss_().getSheetByName(SHEET_SALES);
      sh.getRange(2, 1, sizes[SHEET_SALES], 3).getValues();
      return (sizes[SHEET_SALES] * 3).toLocaleString() + '셀';
    });
  }

  if (sizes[SHEET_LISTING] > 0) {
    step('리스팅 — 전체 읽기 (' + sizes[SHEET_LISTING].toLocaleString() + '행)', function () {
      var sh = ss_().getSheetByName(SHEET_LISTING);
      sh.getRange(2, 1, sizes[SHEET_LISTING], LISTING_HEADER.length).getValues();
      return (sizes[SHEET_LISTING] * LISTING_HEADER.length).toLocaleString() + '셀';
    });
  }

  var total = ((Date.now() - t0) / 1000).toFixed(1);
  var msg = '속도 진단 — 합계 ' + total + '초';
  log_('speed', 'INFO', msg);
  ui_().alert('속도 진단',
    out.join('\n') + '\n\n합계 ' + total + '초\n\n' +
    '같은 내용이 로그 탭에도 남아 있습니다.\n' +
    '(진단이 중간에 끊겨도 거기까지는 기록됩니다)',
    ui_().ButtonSet.OK);
  return msg;
}
