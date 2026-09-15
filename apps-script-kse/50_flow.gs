/**
 * ③ KSE 배송등록 (+ 송장번호 이어서 조회 + 완료 이관)
 *
 * 실제 국제배송 접수라 되돌리기 어렵다. 실행할 때 건수를 보여주고 확인을 받는다.
 * 보내는 값은 _원본JSON 이 아니라 rowToGroup_ 로 시트 수정을 반영한 것이다.
 * 송장번호까지 받은 건은 곧바로 [완료] 로 옮긴다 (완료 처리 버튼은 없앴다).
 */

function 전송대상_() {
  return orderRows_().filter(function (r) {
    return String(r.v[COL.STATUS - 1]).trim() === ST.READY &&
           !String(r.v[COL.KSE_NO - 1]).trim();
  });
}

function KSE_배송등록() {
  var ui = SpreadsheetApp.getUi();
  var cfg = getConfig();
  var targets = 전송대상_();
  if (!targets.length) {
    ui.alert('KSE에 보낼 대기 건이 없습니다.');
    return 0;
  }

  var boxes = targets.length;
  var orders = 0;
  targets.forEach(function (t) {
    orders += String(t.v[COL.ORDER_IDS - 1]).split('\n').filter(function (x) { return x.trim(); }).length;
  });

  var answer = ui.alert('KSE 배송등록',
    kseBaseUrl_() + ' 에\n박스 ' + boxes + '건 (주문 ' + orders + '건) 을 실제로 배송접수합니다.\n' +
    '(필수값이 빠진 건은 자동으로 보류됩니다)\n\n' +
    '접수 후에는 되돌리기 어렵습니다. 진행할까요?', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return 0;

  var updates = [];

  // KSE 필수값(가이드 Require=Y)이 빠진 건은 보내지 않는다.
  // Shift-JIS 리포트에서 이름이 통째로 날아간 주문이 실제로 있었다(한글 이름).
  // 여기서 걸러내면 KSE 오류를 받는 대신 무엇이 비었는지 시트에서 바로 보인다.
  var blocked = [];
  var warnSet = {};        // 지금 비어 있는 칸만 칠한다 (채운 칸은 색이 지워진다)
  var touched = [];
  targets = targets.filter(function (t) {
    var missing = missingRequired_(t.v);
    // 무게는 상품마스터 기본값으로 채워지지만, 0 이하면 통관 리스크가 있어 막는다
    if (!(num_(t.v[COL.WEIGHT - 1], 0) > 0)) missing.push(['무게', COL.WEIGHT]);

    touched.push(t.row);
    missing.forEach(function (m) { warnSet[t.row + ',' + m[1]] = true; });

    if (!missing.length) return true;
    blocked.push(t);
    updates.push([t.row, COL.NOTE, 'KSE 필수값 없음: ' +
      missing.map(function (m) { return m[0]; }).join(', ') + ' — 채운 뒤 다시 실행']);
    return false;
  });
  applyWarnColors_(warnSet, touched);

  if (!targets.length) {
    applyUpdates_(updates);
    ui.alert('보낼 수 있는 건이 없습니다.\n필수값이 빠진 ' + blocked.length + '건은 비고를 확인하세요.');
    return 0;
  }

  var size = Math.max(1, Math.min(parseInt(cfg.KSE_배치크기, 10) || 20, KSE_QUERY_MAX));
  var ok = 0, ng = 0;

  chunk_(targets, size).forEach(function (batch) {
    var packages = [];
    var batchRows = [];

    batch.forEach(function (t) {
      try {
        // 시트에서 손으로 고친 값(수취인·단가·상품명·수량 …)을 반영해서 보낸다
        var pr = rowToGroup_(t.v);
        if (pr.warn.length) {
          updates.push([t.row, COL.STATUS, ST.ERROR]);
          updates.push([t.row, COL.NOTE,
            '시트 수정을 반영할 수 없습니다 — ' + pr.warn.join(' / ') +
            '. 상품이 여러 개인 박스는 줄 수를 상품 수와 맞춰주세요']);
          ng++;
          return;
        }
        var pkg = kseBuildPackage_(pr.g, cfg);
        packages.push(pkg);
        batchRows.push(t.row);
        // 고친 값을 _원본JSON 에도 반영해 두면 이후 단계(발송확인 파일 등)가 같은 값을 쓴다
        updates.push([t.row, COL.RAW, JSON.stringify(pr.g)]);
        // 실제로 보내는 무게를 시트에도 반영해 표시와 전송값이 어긋나지 않게 한다
        if (num_(t.v[COL.WEIGHT - 1], 0) !== pkg.RealWeight) {
          updates.push([t.row, COL.WEIGHT, pkg.RealWeight]);
        }
      } catch (e) {
        updates.push([t.row, COL.STATUS, ST.ERROR]);
        updates.push([t.row, COL.NOTE, '요청 생성 실패: ' + e]);
        ng++;
      }
    });
    if (!packages.length) return;

    var res;
    try {
      res = kseCreateOrders_(packages);
    } catch (e) {
      log_('KSE등록', '배치 실패: ' + e);
      batchRows.forEach(function (r) {
        updates.push([r, COL.STATUS, ST.ERROR]);
        updates.push([r, COL.NOTE, String(e).slice(0, 500)]);
      });
      ng += batchRows.length;
      return;
    }

    // 응답 Data는 요청 DataList와 같은 순서. 확실히 하려고 PackageNo로도 맞춰본다.
    var results = res.Data || [];
    var byPackage = {};
    results.forEach(function (d) {
      var rd = (d && d.ResultData) || null;
      if (rd && rd.PackageNo) byPackage[String(rd.PackageNo)] = d;
    });

    batchRows.forEach(function (r, k) {
      var item = byPackage[packages[k].PackageNo] || results[k];
      var rd = (item && item.ResultData) || null;

      if (item && String(item.Code) === '0' && rd) {
        updates.push([r, COL.KSE_NO, rd.TrackingNo || '']);
        updates.push([r, COL.KSE_STATUS, ((rd.Status || '') + ' ' + (rd.StatusDesc || '')).trim()]);
        updates.push([r, COL.LOCAL_CARRIER, rd.LocalTrackingCompany || '']);
        updates.push([r, COL.KSE_SENT_AT, nowStr_()]);
        updates.push([r, COL.STATUS, rd.LocalTrackingNo ? ST.INVOICED : ST.SENT]);
        if (rd.LocalTrackingNo) updates.push([r, COL.INVOICE, String(rd.LocalTrackingNo)]);
        ok++;
      } else {
        var msg = item ? ('[' + item.Code + '] ' + item.Message) : '응답에서 결과를 찾지 못함';
        updates.push([r, COL.STATUS, ST.ERROR]);
        updates.push([r, COL.NOTE, String(msg).slice(0, 500)]);
        ng++;
      }
    });
  });

  applyUpdates_(updates);

  // 접수 응답에 송장번호가 실려 오는 경우가 많다. 사람이 따로 누르지 않게 바로 채운다.
  var got = 0;
  if (ok) {
    try {
      got = 배송상태_갱신_(조회대상_()).got;
    } catch (e) {
      log_('KSE등록', '송장 자동조회 실패: ' + e);
    }
  }

  // 송장번호까지 받은 건은 바로 [완료] 로 넘긴다 (따로 누르지 않게)
  var done = 완료_처리_();

  var summary = 'KSE 배송등록 — 성공 ' + ok + ' / 실패 ' + ng +
    (blocked.length ? ' / 필수값 없어 보류 ' + blocked.length : '') +
    '\n송장번호 확보 ' + got + '건 / [' + SHEET_DONE + '] 이관 ' + done + '건';
  log_('KSE등록', summary.replace('\n', ' / '));
  ui.alert(summary +
    '\n\n아마존 발송확인 파일은 접수번호(K…)만 있으면 바로 만들 수 있습니다.' +
    (ok && got < ok
      ? '\n아직 송장번호가 안 나온 건은 KSE가 30분 주기로 채우고, 그때 자동으로 완료 처리됩니다.\n' +
        '(설정 > 자동조회 켜기, 또는 점검 > 배송상태 새로고침)'
      : ''));
  return ok;
}

// ── 배송상태 / 송장번호 ─────────────────────────────────────────────────

/** 아직 끝나지 않은 KSE 접수건. 송장번호가 이미 있어도 상태는 계속 바뀌므로 함께 본다. */
function 조회대상_() {
  return orderRows_().filter(function (r) {
    var st = String(r.v[COL.STATUS - 1]).trim();
    return String(r.v[COL.KSE_NO - 1]).trim() && (st === ST.SENT || st === ST.INVOICED);
  });
}

function 배송상태_갱신_(targets) {
  var updates = [], states = [], got = 0, updated = 0;

  chunk_(targets, KSE_TRACKING_MAX).forEach(function (batch) {   // 1회 최대 20건
    var nos = batch.map(function (t) { return String(t.v[COL.KSE_NO - 1]).trim(); });
    var res;
    try {
      res = kseTracking_(nos);
    } catch (e) {
      log_('송장조회', nos.join(',') + ' 실패: ' + e);
      return;
    }

    batch.forEach(function (t, i) {
      var entry = res[nos[i]];
      var data = entry && entry.Data;
      if (!entry || String(entry.Code) !== '0' || !data) {
        var m = entry ? ('[' + entry.Code + '] ' + entry.Message) : '응답 없음';
        updates.push([t.row, COL.NOTE, String(m).slice(0, 300)]);
        return;
      }

      var statusText = ((data.Status || '') + ' ' + (data.StatusDesc || '')).trim();
      if (String(t.v[COL.KSE_STATUS - 1]).trim() !== statusText) {
        updates.push([t.row, COL.KSE_STATUS, statusText]);
        updated++;
      }
      if (data.LocalTrackingCompany &&
          String(t.v[COL.LOCAL_CARRIER - 1]).trim() !== String(data.LocalTrackingCompany)) {
        updates.push([t.row, COL.LOCAL_CARRIER, data.LocalTrackingCompany]);
      }
      // 송장번호는 한 번 받으면 덮어쓰지 않는다
      if (data.LocalTrackingNo && !String(t.v[COL.INVOICE - 1]).trim()) {
        updates.push([t.row, COL.INVOICE, String(data.LocalTrackingNo)]);
        if (String(t.v[COL.STATUS - 1]).trim() === ST.SENT) {
          updates.push([t.row, COL.STATUS, ST.INVOICED]);
        }
        got++;
      }

      states.push(String(t.v[COL.ORDER_ID - 1]) + '  ' + statusText +
        (data.LocalTrackingNo ? '  ·  송장 ' + data.LocalTrackingNo : '  ·  송장 대기'));
    });
  });

  applyUpdates_(updates);
  return { got: got, updated: updated, states: states };
}

function KSE_배송상태_조회() {
  var targets = 조회대상_();
  if (!targets.length) {
    SpreadsheetApp.getUi().alert('조회할 KSE 접수건이 없습니다.\n(② 배송등록을 마친 건이 대상입니다)');
    return 0;
  }
  var r = 배송상태_갱신_(targets);
  var done = 완료_처리_();
  var summary = '대상 ' + targets.length + '건 — 배송상태 갱신 ' + r.updated +
    '건 / 송장번호 신규 ' + r.got + '건 / [' + SHEET_DONE + '] 이관 ' + done + '건';
  log_('송장조회', summary);
  SpreadsheetApp.getUi().alert(summary +
    (r.states.length ? '\n\n현재 상태\n' + r.states.slice(0, 12).join('\n') : '') +
    '\n\nKSE 배송상태는 30분 간격으로 갱신됩니다.\n송장번호가 채워진 건은 자동으로 [' + SHEET_DONE + '] 으로 옮겼습니다.');
  return r.got;
}

// ── ③ 완료 처리 ─────────────────────────────────────────────────────────

/**
 * 송장번호까지 받은 건을 [완료] 로 옮긴다.
 * 사람이 누르는 버튼은 없앴다 — ② 배송등록과 자동조회가 알아서 부른다.
 */
function 완료_처리_() {
  var targets = orderRows_().filter(function (r) {
    return String(r.v[COL.INVOICE - 1]).trim() &&
           String(r.v[COL.STATUS - 1]).trim() !== ST.DONE;
  });
  if (!targets.length) return 0;

  var stamp = nowStr_();
  targets.forEach(function (t) {
    t.v[COL.STATUS - 1] = ST.DONE;
    t.v[COL.DONE_AT - 1] = stamp;
  });
  moveToDone_(targets);
  log_('완료처리', targets.length + '건 이관 (자동)');
  return targets.length;
}
