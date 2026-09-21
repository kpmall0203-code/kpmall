/**
 * ③ KSE 배송등록 (+ 송장번호 이어서 조회 + 완료 이관)
 *
 * 실제 국제배송 접수라 되돌리기 어렵다. 실행할 때 건수를 보여주고 확인을 받는다.
 * 보내는 값은 _원본JSON 이 아니라 rowToGroup_ 로 시트 수정을 반영한 것이다.
 * 송장번호까지 받은 건은 곧바로 [완료] 로 옮긴다 (완료 처리 버튼은 없앴다).
 */

/**
 * KSE 에 보낼 행 — 보낼 차례대로.
 *
 * ③ 주문 정렬은 급한 것(발송기한이 이른 것)을 시트 위로 올린다. 그런데 KSE 는
 * 접수한 차례대로 번호를 매기고, 접수 목록과 송장을 뽑으면 최근 접수가 앞에 온다.
 * 시트 위부터 보내면 가장 급한 건이 가장 먼저 접수돼, 뽑을 때 맨 뒤 장으로 간다.
 *
 * 그래서 기본은 '시트 아래부터' — 안 급한 것부터 접수하고 급한 것을 마지막에 접수해,
 * 뽑았을 때 앞 장이 먼저 보낼 물건이 되게 한다. 시트의 보기 순서(급한 것이 위)는
 * 그대로 두고 보내는 차례만 뒤집는다.
 *
 * KSE 목록이 오래된 접수부터 나오는 곳이면 [설정] KSE_등록순서 를 '시트 위부터' 로.
 */
function 전송대상_(cfg) {
  var list = orderRows_().filter(function (r) {
    return String(r.v[COL.STATUS - 1]).trim() === ST.READY &&
           !String(r.v[COL.KSE_NO - 1]).trim();
  });
  var order = String((cfg || getConfig()).KSE_등록순서 || '시트 아래부터').trim();
  return order === '시트 위부터' ? list : list.reverse();
}

// ── 실행 시간 ───────────────────────────────────────────────────────────
//
// Apps Script 는 한 실행을 6분에서 끊는다. 확인 창이 떠 있던 시간도 여기에 들어간다.
// 보내는 도중에 끊기면 KSE 에는 접수됐는데 시트에는 접수번호가 안 남고, 다음 실행이
// 그 행을 다시 보내 같은 주문이 두 번 접수된다. 그래서
//   · 확인이 늦었으면 이번 실행에서는 보내지 않고 새 실행(트리거)에 넘긴다
//   · 배치를 보낼 때마다 접수번호를 바로 적는다 (끊겨도 잃는 것은 마지막 한 배치)
//   · 배치를 보내기 전에 남은 시간을 보고, 모자라면 보내지 않고 남긴다
//   · 남긴 행은 1분 뒤 새 실행이 이어서 보낸다 — 대기 줄이 없어질 때까지
var KSE_RUN_BUDGET_MS = 5.5 * 60 * 1000;         // 6분에서 30초를 남긴다
var KSE_CONFIRM_WAIT_MAX_MS = 3 * 60 * 1000;     // 확인 창을 이보다 오래 띄웠으면 새 실행으로
var KSE_CONTINUE_HANDLER = 'KSE_배송등록_이어서';
var PROP_KSE_ROUNDS = 'KSE_CONTINUE_ROUNDS';
var KSE_CONTINUE_MAX_ROUNDS = 20;                // 폭주 방지 — 20회면 배치크기 20 기준 수천 건이다

function KSE_배송등록() {
  var t0 = Date.now();
  var ui = SpreadsheetApp.getUi();
  var cfg = getConfig();
  var targets = 전송대상_(cfg);
  if (!targets.length) {
    ui.alert('KSE에 보낼 대기 건이 없습니다.');
    return 0;
  }

  var boxes = targets.length;
  var orders = 0;
  targets.forEach(function (t) {
    orders += String(t.v[COL.ORDER_IDS - 1]).split('\n').filter(function (x) { return x.trim(); }).length;
  });

  var orderDesc = String(cfg.KSE_등록순서 || '시트 아래부터').trim() === '시트 위부터'
    ? '시트 위부터 접수합니다'
    : '시트 아래부터 접수합니다 — 급한 건이 마지막에 접수돼 뽑을 때 앞 장에 옵니다';

  var answer = ui.alert('KSE 배송등록',
    kseBaseUrl_() + ' 에\n박스 ' + boxes + '건 (주문 ' + orders + '건) 을 실제로 배송접수합니다.\n' +
    orderDesc + '.\n' +
    '(필수값이 빠진 건은 자동으로 보류됩니다)\n\n' +
    '접수 후에는 되돌리기 어렵습니다. 진행할까요?', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return 0;

  // 확인 창이 떠 있던 시간도 6분에 들어간다. 오래 기다렸으면 이번 실행에서는 보내지 않는다 —
  // 보내다 끊기면 KSE 에만 접수되고 시트에 안 남는다. 새 실행이 곧바로 이어받는다.
  var waited = Date.now() - t0;
  if (waited > KSE_CONFIRM_WAIT_MAX_MS) {
    PropertiesService.getScriptProperties().setProperty(PROP_KSE_ROUNDS, '0');
    kseScheduleContinue_(1);
    log_('KSE등록', '확인까지 ' + Math.round(waited / 60000) + '분 — 이번 실행에서는 보내지 않고 1분 뒤 자동 실행에 넘김');
    ui.alert('확인을 누르기까지 ' + Math.round(waited / 60000) + '분이 지나 이번 실행에서는 보내지 않았습니다.\n' +
      '(보내다 시간이 끊기면 KSE에만 접수되고 시트에 남지 않습니다)\n\n' +
      '1분 뒤 자동으로 보내기 시작해 대기 줄이 없어질 때까지 이어집니다.\n' +
      '진행은 [' + SHEET_LOG + '] 시트에 남고, 접수번호는 [' + SHEET_ORDERS + '] 에 채워집니다.');
    return 0;
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    ui.alert('자동 이어보내기가 진행 중입니다. 끝나면 [' + SHEET_LOG + '] 에 남습니다.');
    return 0;
  }
  var r;
  try {
    r = kseSendRound_(cfg, t0);
  } finally {
    lock.releaseLock();
  }

  PropertiesService.getScriptProperties().setProperty(PROP_KSE_ROUNDS, '0');
  if (r.deferred) kseScheduleContinue_(1);

  var summary = kseRoundSummary_(r);
  log_('KSE등록', summary.replace(/\n/g, ' / '));
  ui.alert(summary +
    (r.deferred
      ? '\n\n남은 ' + r.deferred + '건은 시간이 모자라 보내지 않았습니다.\n' +
        '1분 뒤 자동으로 이어서 보내고, 대기 줄이 없어질 때까지 계속합니다.\n' +
        '진행은 [' + SHEET_LOG + '] 시트에 남습니다.'
      : '') +
    '\n\n아마존 발송확인 파일은 접수번호(K…)만 있으면 바로 만들 수 있습니다.' +
    (r.ok && r.got < r.ok
      ? '\n아직 송장번호가 안 나온 건은 KSE가 30분 주기로 채우고, 그때 자동으로 완료 처리됩니다.\n' +
        '(설정 > 자동조회 켜기, 또는 점검 > 배송상태 새로고침)'
      : ''));
  return r.ok;
}

/**
 * 한 실행에서 보낼 수 있는 만큼 보낸다. 창을 띄우지 않는다 (트리거에서도 부른다).
 *
 * @param cfg 설정
 * @param t0  이 실행이 시작한 시각 (확인 창 시간까지 포함해서 잰다)
 * @return {{targets, ok, ng, blocked, deferred, got, done, followupSkipped}}
 */
function kseSendRound_(cfg, t0) {
  var deadline = t0 + KSE_RUN_BUDGET_MS;
  var targets = 전송대상_(cfg);
  var res = { targets: targets.length, ok: 0, ng: 0, blocked: 0, deferred: 0,
              got: 0, done: 0, followupSkipped: false };
  if (!targets.length) return res;

  // KSE 필수값(가이드 Require=Y)이 빠진 건은 보내지 않는다.
  // Shift-JIS 리포트에서 이름이 통째로 날아간 주문이 실제로 있었다(한글 이름).
  // 여기서 걸러내면 KSE 오류를 받는 대신 무엇이 비었는지 시트에서 바로 보인다.
  var blockedUpdates = [];
  var warnSet = {};        // 지금 비어 있는 칸만 칠한다 (채운 칸은 색이 지워진다)
  var touched = [];
  targets = targets.filter(function (t) {
    var missing = missingRequired_(t.v);
    // 무게는 상품마스터 기본값으로 채워지지만, 0 이하면 통관 리스크가 있어 막는다
    if (!(num_(t.v[COL.WEIGHT - 1], 0) > 0)) missing.push(['무게', COL.WEIGHT]);

    touched.push(t.row);
    missing.forEach(function (m) { warnSet[t.row + ',' + m[1]] = true; });

    if (!missing.length) return true;
    res.blocked++;
    blockedUpdates.push([t.row, COL.NOTE, 'KSE 필수값 없음: ' +
      missing.map(function (m) { return m[0]; }).join(', ') + ' — 채운 뒤 다시 실행']);
    return false;
  });
  applyWarnColors_(warnSet, touched);
  applyUpdates_(blockedUpdates);           // 보류 사유는 바로 적는다
  if (!targets.length) return res;

  var size = Math.max(1, Math.min(parseInt(cfg.KSE_배치크기, 10) || 20, KSE_QUERY_MAX));
  var batches = chunk_(targets, size);
  var lastBatchMs = 20 * 1000;             // 첫 배치는 20초로 잡고, 그 뒤는 잰 값을 쓴다

  for (var bi = 0; bi < batches.length; bi++) {
    // 이 배치를 보내고 적을 시간이 남았는가. 모자라면 보내지 않고 남긴다 —
    // 보내다 끊기면 KSE 에만 접수되고 시트에 안 남아, 다음 실행이 같은 주문을 또 보낸다.
    if (Date.now() + lastBatchMs * 1.5 > deadline) {
      for (var rest = bi; rest < batches.length; rest++) res.deferred += batches[rest].length;
      break;
    }
    var bt = Date.now();
    var batch = batches[bi];
    var updates = [];
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
          res.ng++;
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
        res.ng++;
      }
    });

    if (packages.length) {
      var kseRes = null;
      try {
        kseRes = kseCreateOrders_(packages);
      } catch (e) {
        log_('KSE등록', '배치 실패: ' + e);
        batchRows.forEach(function (r) {
          updates.push([r, COL.STATUS, ST.ERROR]);
          updates.push([r, COL.NOTE, String(e).slice(0, 500)]);
        });
        res.ng += batchRows.length;
      }

      if (kseRes) {
        // 응답 Data는 요청 DataList와 같은 순서. 확실히 하려고 PackageNo로도 맞춰본다.
        var results = kseRes.Data || [];
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
            res.ok++;
          } else {
            var msg = item ? ('[' + item.Code + '] ' + item.Message) : '응답에서 결과를 찾지 못함';
            updates.push([r, COL.STATUS, ST.ERROR]);
            updates.push([r, COL.NOTE, String(msg).slice(0, 500)]);
            res.ng++;
          }
        });
      }
    }

    // 배치마다 바로 적는다 — 여기서 끊겨도 잃는 것은 이 한 배치뿐이다
    applyUpdates_(updates);
    lastBatchMs = Date.now() - bt;
  }

  // 접수 응답에 송장번호가 실려 오는 경우가 많다. 사람이 따로 누르지 않게 바로 채운다.
  // 시간이 남을 때만 — 안 해도 30분 자동조회와 다음 실행이 채운다.
  if (res.ok) {
    if (Date.now() + 30 * 1000 < deadline) {
      try {
        res.got = 배송상태_갱신_(조회대상_()).got;
      } catch (e) {
        log_('KSE등록', '송장 자동조회 실패: ' + e);
      }
    } else {
      res.followupSkipped = true;
    }
  }
  // 송장번호까지 받은 건은 바로 [완료] 로 넘긴다 (따로 누르지 않게)
  if (Date.now() + 20 * 1000 < deadline) res.done = 완료_처리_();
  else res.followupSkipped = true;
  return res;
}

/** 한 실행의 결과 문구 */
function kseRoundSummary_(r) {
  return 'KSE 배송등록 — 성공 ' + r.ok + ' / 실패 ' + r.ng +
    (r.blocked ? ' / 필수값 없어 보류 ' + r.blocked : '') +
    (r.deferred ? ' / 시간 모자라 남김 ' + r.deferred : '') +
    '\n송장번호 확보 ' + r.got + '건 / [' + SHEET_DONE + '] 이관 ' + r.done + '건' +
    (r.followupSkipped ? ' (송장조회·완료 이관은 시간이 모자라 다음 실행으로)' : '');
}

// ── 자동 이어보내기 ─────────────────────────────────────────────────────

/** 1분 뒤(또는 minutes 분 뒤) 새 실행이 이어서 보내게 트리거를 건다. 같은 트리거는 하나만 둔다. */
function kseScheduleContinue_(minutes) {
  kseClearContinueTriggers_();
  ScriptApp.newTrigger(KSE_CONTINUE_HANDLER).timeBased()
    .after(Math.max(1, minutes || 1) * 60 * 1000).create();
}

function kseClearContinueTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === KSE_CONTINUE_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

/**
 * 트리거가 부른다 — 창을 띄우지 않고 한 실행 분량을 보내고, 남았으면 또 건다.
 *
 * 멈추는 때: 대기 줄이 없어졌을 때 · 한 번에 한 배치도 못 보냈을 때(설정을 봐야 한다) ·
 * 20회를 넘겼을 때. 필수값이 빠져 보류된 행은 사람이 채워야 하므로 여기서 기다리지 않는다.
 */
function KSE_배송등록_이어서() {
  kseClearContinueTriggers_();
  var props = PropertiesService.getScriptProperties();
  var rounds = parseInt(props.getProperty(PROP_KSE_ROUNDS) || '0', 10) + 1;
  props.setProperty(PROP_KSE_ROUNDS, String(rounds));
  if (rounds > KSE_CONTINUE_MAX_ROUNDS) {
    log_('KSE등록', '자동 이어보내기가 ' + KSE_CONTINUE_MAX_ROUNDS + '회를 넘어 멈춤 — ④ 를 손으로 실행하세요');
    return;
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    log_('KSE등록', '자동 이어보내기 ' + rounds + '회 — 다른 실행이 진행 중이라 2분 뒤 다시');
    kseScheduleContinue_(2);
    return;
  }
  var r;
  try {
    r = kseSendRound_(getConfig(), Date.now());
  } finally {
    lock.releaseLock();
  }

  log_('KSE등록', '자동 이어보내기 ' + rounds + '회 — ' + kseRoundSummary_(r).replace(/\n/g, ' / '));
  if (r.deferred && (r.ok + r.ng) > 0) {
    kseScheduleContinue_(1);
  } else if (r.deferred) {
    log_('KSE등록', '한 실행에 한 배치도 못 보내 멈춤 — [설정] KSE_배치크기 를 줄이거나 ④ 를 손으로 실행하세요');
  } else {
    props.setProperty(PROP_KSE_ROUNDS, '0');
    log_('KSE등록', '자동 이어보내기 끝 — 대기 줄 없음' +
      (r.blocked ? ' (필수값 없어 보류 ' + r.blocked + '건은 채운 뒤 ④ 실행)' : ''));
  }
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
