/**
 * 61_스냅샷.gs — 가격 스냅샷 · 롤백
 *
 * 리프라이싱은 수천 SKU의 라이브 가격을 한 번에 바꾼다. 되돌릴 수단 없이
 * 실행하면 안 된다. 그래서 산출 시점에 전체 카탈로그 가격을 자동으로 떠 두고,
 * 언제든 그 상태로 되돌리는 피드를 만들 수 있게 한다.
 *
 * 되돌리는 길이 두 개다:
 *   [스냅샷 기준]  그 시점 가격으로 전부 복원. 뭘 건드렸는지 모를 때 쓴다.
 *   [실행 기준]    특정 리프라이싱 실행분만 이전가로 되돌린다. 그 사이 다른
 *                  이유로 바꾼 가격은 건드리지 않으므로 이쪽이 더 안전하다.
 *
 * 아마존은 피드를 올려야 가격이 바뀌므로, 여기서는 '복구 피드 파일'까지만 만든다.
 * 실제 복구는 셀러센트럴 업로드로 완료된다.
 */

/** 리스팅 탭의 현재 가격을 통째로 떠서 새 탭에 저장. 반환: 스냅샷ID */
function takePriceSnapshot_(reason) {
  var listSh = getSheetOrThrow_(SHEET_LISTING);
  var last = listSh.getLastRow();
  if (last < 2) throw new Error('리스팅이 비어 있어 스냅샷을 뜰 수 없습니다.');

  var lv = listSh.getRange(2, 1, last - 1, LISTING_HEADER.length).getValues();
  var rows = [];
  for (var i = 0; i < lv.length; i++) {
    var sku = String(lv[i][L_SKU] || '').trim();
    var price = Number(lv[i][L_PRICE]);
    if (!sku || !(price > 0)) continue;
    rows.push([sku, price, lv[i][L_STATUS]]);
  }
  if (!rows.length) throw new Error('가격이 있는 SKU가 없습니다.');

  var id = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var tabName = SNAPSHOT_PREFIX + id;
  var sh = ensureSheet_(tabName, SNAPSHOT_HEADER);
  sh.clear();
  sh.getRange(1, 1, 1, SNAPSHOT_HEADER.length).setValues([SNAPSHOT_HEADER])
    .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  var CH = 2000;
  for (var s = 0; s < rows.length; s += CH) {
    var part = rows.slice(s, s + CH);
    sh.getRange(2 + s, 1, part.length, SNAPSHOT_HEADER.length).setValues(part);
  }
  sh.setFrozenRows(1);
  sh.hideSheet();   // 평소엔 접어둔다 — 탭이 늘어나 시트가 지저분해지는 걸 막는다

  var idx = ensureSheet_(SHEET_SNAPSHOT_INDEX, SNAPSHOT_INDEX_HEADER);
  if (idx.getLastRow() === 0) {
    idx.getRange(1, 1, 1, SNAPSHOT_INDEX_HEADER.length).setValues([SNAPSHOT_INDEX_HEADER])
      .setFontWeight('bold');
  }
  idx.appendRow([id, new Date(), rows.length, reason || '', tabName]);
  idx.setFrozenRows(1);

  pruneSnapshots_();
  log_('snapshot', 'INFO', '스냅샷 ' + id + ' · ' + rows.length + '건 (' + reason + ')');
  return { id: id, n: rows.length, tab: tabName };
}

/** 오래된 스냅샷 탭 정리 (최근 MAX_SNAPSHOTS개만 남긴다) */
function pruneSnapshots_() {
  var idx = ss_().getSheetByName(SHEET_SNAPSHOT_INDEX);
  if (!idx || idx.getLastRow() < 2) return;
  var n = idx.getLastRow() - 1;
  if (n <= MAX_SNAPSHOTS) return;
  var vals = idx.getRange(2, 1, n, SNAPSHOT_INDEX_HEADER.length).getValues();
  var drop = n - MAX_SNAPSHOTS;
  for (var i = 0; i < drop; i++) {
    var tab = String(vals[i][SI_TAB] || '');
    var sh = ss_().getSheetByName(tab);
    if (sh) ss_().deleteSheet(sh);
  }
  idx.deleteRows(2, drop);
  log_('snapshot', 'INFO', '오래된 스냅샷 ' + drop + '개 정리');
}

function listSnapshots_() {
  var idx = ss_().getSheetByName(SHEET_SNAPSHOT_INDEX);
  if (!idx || idx.getLastRow() < 2) return [];
  var vals = idx.getRange(2, 1, idx.getLastRow() - 1, SNAPSHOT_INDEX_HEADER.length).getValues();
  return vals.map(function (v) {
    return { id: String(v[SI_ID]), at: v[SI_AT], n: v[SI_N],
             reason: String(v[SI_REASON]), tab: String(v[SI_TAB]) };
  });
}

/**
 * 메뉴: 복구 피드 만들기.
 * 스냅샷을 골라 현재 가격과 비교하고, 다른 것만 되돌리는 피드를 만든다.
 */
function buildRollbackFeed() {
  var snaps = listSnapshots_();
  if (!snaps.length) {
    throw new Error('스냅샷이 없습니다.\n리프라이싱을 실행하면 자동으로 생성됩니다.');
  }
  var lines = snaps.map(function (s, i) {
    return (i + 1) + ') ' + s.id + '  ' + s.n + '건  ' + s.reason;
  }).join('\n');

  var res = ui_().prompt('복구할 스냅샷 선택',
    lines + '\n\n번호를 입력하세요 (가장 최근 = ' + snaps.length + ')',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var pick = parseInt(res.getResponseText().trim(), 10);
  if (!(pick >= 1 && pick <= snaps.length)) throw new Error('잘못된 번호입니다.');
  var snap = snaps[pick - 1];

  var snapSh = ss_().getSheetByName(snap.tab);
  if (!snapSh) throw new Error('스냅샷 탭(' + snap.tab + ')을 찾을 수 없습니다.');
  var sv = snapSh.getRange(2, 1, Math.max(snapSh.getLastRow() - 1, 1), SNAPSHOT_HEADER.length).getValues();
  var snapPrice = {};
  for (var i = 0; i < sv.length; i++) {
    var sku = String(sv[i][SN_SKU] || '').trim();
    var p = Number(sv[i][SN_PRICE]);
    if (sku && p > 0) snapPrice[sku] = p;
  }

  // 현재 가격과 비교 — 다른 것만 되돌린다
  var listSh = getSheetOrThrow_(SHEET_LISTING);
  var lv = listSh.getRange(2, 1, listSh.getLastRow() - 1, LISTING_HEADER.length).getValues();
  var diffs = [], missing = 0;
  for (var j = 0; j < lv.length; j++) {
    var s2 = String(lv[j][L_SKU] || '').trim();
    var cur = Number(lv[j][L_PRICE]);
    if (!s2 || !(cur > 0)) continue;
    var old = snapPrice[s2];
    if (!old) { missing++; continue; }        // 스냅샷 이후 새로 등록된 SKU
    if (Math.abs(old - cur) < 0.5) continue;  // 그대로면 건드리지 않는다
    diffs.push([s2, old, cur]);
  }

  if (!diffs.length) {
    ui_().alert('되돌릴 것이 없습니다',
      '현재 가격이 스냅샷 ' + snap.id + ' 와 동일합니다.\n\n' +
      '(리프라이싱 피드를 아직 셀러센트럴에 올리지 않았거나,\n' +
      ' 리스팅 탭이 아직 갱신되지 않았을 수 있습니다.\n' +
      ' [② 상품목록 갱신]으로 최신 가격을 받아온 뒤 다시 시도하세요.)',
      ui_().ButtonSet.OK);
    return;
  }

  var tsv = 'sku\tprice\n';
  for (var k = 0; k < diffs.length; k++) tsv += diffs[k][0] + '\t' + diffs[k][1] + '\n';

  var name = 'ROLLBACK_' + snap.id + '_' +
             Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss') + '.txt';
  var blob = Utilities.newBlob('', 'text/tab-separated-values', name).setDataFromString(tsv, 'UTF-8');
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(PROP_FEED_FOLDER) || props.getProperty(PROP_INVOICE_FOLDER);
  var file = folderId ? DriveApp.getFolderById(folderId).createFile(blob) : DriveApp.createFile(blob);

  // 되돌림도 대장에 남긴다 — 그래야 r0 추적이 어긋나지 않는다
  var now = new Date();
  var runId = 'ROLLBACK_' + snap.id;
  var logRows = diffs.map(function (d) {
    return [now, d[0], d[2], d[1], d[1] / d[2] - 1, '롤백 → 스냅샷 ' + snap.id,
            '', '', runId, false];
  });
  appendPriceLog_(logRows);

  var msg = '복구 피드 ' + diffs.length + '건 생성';
  log_('snapshot', 'INFO', msg + ' / ' + file.getUrl());
  ui_().alert('복구 피드 생성 완료',
    '스냅샷 ' + snap.id + ' 기준\n' +
    '되돌릴 SKU: ' + diffs.length.toLocaleString() + '건\n' +
    (missing ? '스냅샷에 없던 신규 SKU(건드리지 않음): ' + missing + '건\n' : '') +
    '\n' + file.getUrl() + '\n\n' +
    '셀러센트럴 [카탈로그 > 업로드로 상품 등록 > 가격 및 수량 변경]에 업로드하면 복구됩니다.',
    ui_().ButtonSet.OK);
  return msg;
}

/**
 * 메뉴: 특정 리프라이싱 실행분만 되돌리기.
 * 스냅샷 전체 복원보다 안전하다 — 그 실행에서 바꾼 SKU만 이전가로 돌린다.
 */
function buildUndoFeedForRun() {
  var sh = ss_().getSheetByName(SHEET_PRICELOG);
  if (!sh || sh.getLastRow() < 2) throw new Error('가격변경대장이 비어 있습니다.');
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, PRICELOG_HEADER.length).getValues();

  // 반영된(TRUE) 실행ID만 후보로 보여준다
  var runs = {};
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][PL_APPLIED] !== true) continue;
    var rid = String(vals[i][PL_RUNID] || '');
    if (!rid || rid.indexOf('ROLLBACK_') === 0) continue;
    if (!runs[rid]) runs[rid] = { n: 0, at: vals[i][PL_AT] };
    runs[rid].n++;
  }
  var ids = Object.keys(runs).sort();
  if (!ids.length) throw new Error('되돌릴 수 있는 반영 기록이 없습니다.\n(피드를 생성한 실행만 대상입니다)');

  var lines = ids.map(function (r, i) {
    return (i + 1) + ') ' + r + '  ' + runs[r].n + '건';
  }).join('\n');
  var res = ui_().prompt('되돌릴 실행 선택',
    lines + '\n\n번호를 입력하세요 (가장 최근 = ' + ids.length + ')',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  var pick = parseInt(res.getResponseText().trim(), 10);
  if (!(pick >= 1 && pick <= ids.length)) throw new Error('잘못된 번호입니다.');
  var runId = ids[pick - 1];

  // 같은 SKU가 여러 번 바뀌었으면 그 실행의 '이전가'로 되돌린다
  var restore = {};
  for (var j = 0; j < vals.length; j++) {
    if (vals[j][PL_APPLIED] !== true) continue;
    if (String(vals[j][PL_RUNID]) !== runId) continue;
    var sku = String(vals[j][PL_SKU] || '').trim();
    var oldP = Number(vals[j][PL_OLD]);
    if (sku && oldP > 0) restore[sku] = oldP;
  }
  var skus = Object.keys(restore);
  if (!skus.length) throw new Error('해당 실행에 되돌릴 항목이 없습니다.');

  var tsv = 'sku\tprice\n';
  for (var k = 0; k < skus.length; k++) tsv += skus[k] + '\t' + restore[skus[k]] + '\n';

  var name = 'UNDO_' + runId + '.txt';
  var blob = Utilities.newBlob('', 'text/tab-separated-values', name).setDataFromString(tsv, 'UTF-8');
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(PROP_FEED_FOLDER) || props.getProperty(PROP_INVOICE_FOLDER);
  var file = folderId ? DriveApp.getFolderById(folderId).createFile(blob) : DriveApp.createFile(blob);

  var now = new Date();
  var logRows = skus.map(function (s) {
    return [now, s, '', restore[s], '', '실행 되돌리기 ' + runId, '', '', 'ROLLBACK_' + runId, false];
  });
  appendPriceLog_(logRows);

  var msg = '되돌리기 피드 ' + skus.length + '건 생성 (' + runId + ')';
  log_('snapshot', 'INFO', msg);
  ui_().alert('되돌리기 피드 생성 완료',
    '실행 ' + runId + ' 에서 바꾼 ' + skus.length.toLocaleString() + '건을\n' +
    '이전 가격으로 되돌리는 피드입니다.\n\n' + file.getUrl() + '\n\n' +
    '셀러센트럴에 업로드하면 복구됩니다.',
    ui_().ButtonSet.OK);
  return msg;
}

/** 메뉴: 스냅샷 목록 보기 */
function showSnapshots() {
  var snaps = listSnapshots_();
  if (!snaps.length) {
    ui_().alert('스냅샷 없음',
      '아직 스냅샷이 없습니다.\n리프라이싱 산출을 실행하면 자동으로 생성됩니다.',
      ui_().ButtonSet.OK);
    return;
  }
  var lines = snaps.map(function (s) {
    return '· ' + s.id + '  ' + Number(s.n).toLocaleString() + '건  ' + s.reason;
  }).join('\n');
  ui_().alert('가격 스냅샷 (' + snaps.length + '/' + MAX_SNAPSHOTS + ')',
    lines + '\n\n오래된 것부터 자동 삭제됩니다.\n' +
    '되돌리려면 [복구 피드 만들기]를 실행하세요.',
    ui_().ButtonSet.OK);
}
