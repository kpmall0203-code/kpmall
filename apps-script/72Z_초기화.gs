/**
 * 72Z_초기화.gs — 이 프로그램이 만든 캠페인을 전부 걷어내고 처음으로 되돌린다
 *
 * ── 왜 '삭제' 가 아니라 '보관' 인가 ─────────────────────
 * 아마존은 캠페인을 지우는 길을 주지 않는다. 줄 수 있는 마지막 상태가
 * ARCHIVED(보관)이고, 보관하면 목록에서 사라지고 다시 켤 수 없다 —
 * 실질적으로 삭제와 같다. 되돌릴 수 없으므로 사람이 한 번 더 확인해야 한다.
 *
 * ── 무엇을 지우나 ───────────────────────────────────────
 * 이름이 [캠페인 이름 앞머리](기본 'KP')로 시작하는 캠페인 전부.
 * 그 앞머리는 이 프로그램이 만든 것에만 붙는다 — 옛 몰아넣기 캠페인은
 * 이름이 달라 여기 걸리지 않는다. 걸릴 목록을 먼저 보여 주고 묻는다.
 *
 * ── 표도 같이 되돌린다 ──────────────────────────────────
 * 캠페인만 보관하고 표를 그대로 두면, 다음 걸음이 없는 캠페인의 ID 로
 * 입찰을 걸고 켜려 든다. 계획 표는 비우고, 육성 표는 사람이 넣은 값
 * (SKU·상품명·가격·마진율·전환율·손해)만 남기고 나머지를 지운다.
 * 지출 원장은 지우지 않는다 — 이미 쓴 돈은 이미 쓴 돈이다.
 */

var ADRESET_CONFIRM = 'KP삭제';
var ADRESET_CHUNK = 50;

/** 메뉴: KP 캠페인 전부 보관하고 표를 처음으로 */
function resetKpCampaigns() {
  if (!adBusyGuard_('KP 캠페인 초기화')) return;
  var prefix = String(adBasis_()['캠페인 이름 앞머리'] || 'KP').trim() || 'KP';
  var token = adsToken_();

  // ① 지금 살아 있는 것을 아마존에게 직접 묻는다 (시트가 아니라)
  var all = adsPageAll_(token, '/sp/campaigns/list', ADSW_CT_CAMPAIGN, 'campaigns',
                        { stateFilter: { include: ['ENABLED', 'PAUSED'] } });
  var mine = [], on = 0;
  for (var i = 0; i < all.length; i++) {
    var nm = String(all[i].name || '');
    if (nm.indexOf(prefix) !== 0) continue;
    var st = String(all[i].state || '').toUpperCase();
    if (st === 'ENABLED') on++;
    mine.push({ cid: String(all[i].campaignId), name: nm, state: st });
  }

  if (!mine.length) {
    ui_().alert('보관할 것이 없습니다',
      '"' + prefix + '" 로 시작하는 캠페인이 없습니다 (켜짐·멈춤 ' + all.length + '개 중).',
      ui_().ButtonSet.OK);
    return;
  }

  var sample = mine.slice(0, 12).map(function (c) { return '   · ' + c.name; }).join('\n');
  var res = ui_().prompt('⚠ ' + prefix + ' 캠페인 ' + mine.length + '개를 보관합니다',
    '켜짐 ' + on + '개 · 멈춤 ' + (mine.length - on) + '개\n\n' + sample +
    (mine.length > 12 ? '\n   … 외 ' + (mine.length - 12) + '개' : '') + '\n\n' +
    '보관(ARCHIVED)은 되돌릴 수 없습니다 — 다시 켤 수 없고 목록에서 사라집니다.\n' +
    '켜져 있는 것은 먼저 멈추고 보관합니다.\n\n' +
    '계획 표(' + adPlanSheetNames_().join(' · ') + ')는 비우고,\n' +
    '광고육성 표는 사람이 넣은 값만 남기고 ID·결과·누적을 지웁니다.\n' +
    '지출 원장은 그대로 둡니다 (이미 쓴 돈은 남습니다).\n\n' +
    '계속하려면 ' + ADRESET_CONFIRM + ' 이라고 적으세요.',
    ui_().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui_().Button.OK) return;
  if (String(res.getResponseText()).trim() !== ADRESET_CONFIRM) {
    ui_().alert('그만뒀습니다', '"' + ADRESET_CONFIRM + '" 과 다르게 적으셨습니다.', ui_().ButtonSet.OK);
    return;
  }

  // ② 켜진 것부터 멈춘다 — 보관이 실패해도 돈은 그 자리에서 멎는다
  var paused = adResetPut_(token, mine.filter(function (c) { return c.state === 'ENABLED'; }), 'PAUSED');
  var archived = adResetPut_(token, mine, 'ARCHIVED');

  // ③ 표 되돌리기
  var wiped = adResetSheets_();

  var logs = [adLogRow_({
    kind: '캠페인', item: '보관', from: '', to: 'ARCHIVED',
    sum: prefix + ' 캠페인 초기화 · 보관 ' + archived.ok + '개 (멈춤 먼저 ' + paused.ok + '개)',
    why: '사람이 처음부터 다시 하기로 했다', by: 'KP 캠페인 초기화'
  })];
  adLogWrite_(logs);
  log_('ads', 'WARN', prefix + ' 캠페인 초기화 — 보관 ' + archived.ok + ' · 실패 ' + archived.fail);

  showSheet_(SHEET_ADGROW);
  ui_().alert('초기화했습니다',
    '보관 ' + archived.ok + '개' + (archived.fail ? ' · 실패 ' + archived.fail + '개' : '') +
    ' (먼저 멈춤 ' + paused.ok + '개)\n\n' + wiped.join('\n') + '\n\n' +
    '다음:\n' +
    '  ① [📥 자료 받기 → 광고 구조 수집] — 보관된 것이 표에서도 사라집니다\n' +
    '  ② 광고육성 표에서 키울 상품과 마진율을 확인하고\n' +
    '  ③ 광고운영정책에서 한도를 채우고 [' + POLICY_MODE_AUTO + ']로 두면\n' +
    '     다음 새벽부터 자동으로 처음부터 다시 시작합니다.',
    ui_().ButtonSet.OK);
}

/** 캠페인 상태를 한꺼번에 바꾼다 (묶음으로) */
function adResetPut_(token, list, state) {
  var ok = 0, fail = 0;
  for (var b = 0; b < list.length; b += ADRESET_CHUNK) {
    var part = list.slice(b, b + ADRESET_CHUNK);
    try {
      var r = adsApiRetry_(token, 'put', '/sp/campaigns',
        { campaigns: part.map(function (c) { return { campaignId: c.cid, state: state }; }) },
        ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
      var got = adsCreated_(r, 'campaigns', 'campaignId');
      if (got.ok) ok += got.ids.length; else fail += part.length;
    } catch (e) {
      fail += part.length;
      log_('ads', 'ERROR', '초기화 ' + state + ' 실패: ' + String(e).substring(0, 200));
    }
  }
  return { ok: ok, fail: fail };
}

/**
 * 표를 처음으로 되돌린다.
 * 사람이 넣은 값(SKU·상품명·가격·마진율·전환율·손해·손해배수)은 남긴다 —
 * 그것까지 지우면 "처음부터 다시" 가 아니라 "처음부터 다시 적기" 가 된다.
 */
function adResetSheets_() {
  var out = [];

  // 계획 표 둘 — 머리글만 남긴다
  var names = adPlanSheetNames_();
  for (var i = 0; i < names.length; i++) {
    var psh = ss_().getSheetByName(names[i]);
    if (!psh || psh.getLastRow() < 2) continue;
    var n = psh.getLastRow() - 1;
    psh.getRange(2, 1, n, Math.max(psh.getLastColumn(), 1)).clearContent();
    out.push('· ' + names[i] + ' ' + n + '줄 비움');
  }

  // 육성 표 — ID·결과·누적·단계를 지운다
  var gsh = ss_().getSheetByName(SHEET_ADGROW);
  if (gsh && gsh.getLastRow() > 1) {
    var map = hdrMap_(gsh);
    var width = Math.max(gsh.getLastColumn(), ADGROW_HEADER.length);
    var v = gsh.getRange(2, 1, gsh.getLastRow() - 1, width).getValues();
    var clearNamed = ['정책상태', '초기추정전환율(%)', '실제광고전환율(%)', '판단전환율(%)',
                      '성숙클릭', '기준키워드ID', '현재설정입찰(JPY)', '입찰차이', '단계',
                      '주간지출(JPY)', '주간위험손실(JPY)', '주간여력(JPY)',
                      '누적지출(JPY)', '누적위험손실(JPY)', '누적여력(JPY)',
                      '미집계준비액(JPY)', '경과일', '자료기준일', '스스로버나',
                      '최근7일노출', '최근7일클릭', '실제클릭비용(JPY)', '예산소진율(%)',
                      '노출진단', '멈춤필요', '다음 행동'];
    for (var r = 0; r < v.length; r++) {
      if (!String(v[r][AG_SKU] || '').trim()) continue;
      v[r][AG_CID] = ''; v[r][AG_GID] = ''; v[r][AG_RESULT] = '';
      v[r][AG_PREVCID] = ''; v[r][AG_START] = ''; v[r][AG_WEEKS] = '';
      v[r][AG_COST] = ''; v[r][AG_SALES] = ''; v[r][AG_LOSSSUM] = '';
      v[r][AG_KW] = '';                          // 기준키워드는 다시 자동으로 고른다
      v[r][AG_VERDICT] = '준비됨';
      v[r][AG_WHY] = '초기화했습니다 — 정책 한도가 차 있으면 다음 새벽에 다시 만듭니다';
      for (var c = 0; c < clearNamed.length; c++) setCell_(v[r], map, clearNamed[c], '');
    }
    gsh.getRange(2, 1, v.length, width).setValues(v);
    out.push('· ' + SHEET_ADGROW + ' — ID·결과·누적·기준키워드 지움 (값과 마진율은 그대로)');
  }

  // 작업 큐 — 없는 캠페인을 겨누는 열린 작업은 취소한다
  var jsh = ss_().getSheetByName(SHEET_JOB);
  if (jsh && jsh.getLastRow() > 1) {
    var jmap = hdrMap_(jsh);
    var jw = Math.max(jsh.getLastColumn(), JOB_HEADER.length);
    var jv = jsh.getRange(2, 1, jsh.getLastRow() - 1, jw).getValues();
    var nCancel = 0;
    for (var j = 0; j < jv.length; j++) {
      var st = String(cellOf_(jv[j], jmap, '상태', ''));
      if (JOB_OPEN.indexOf(st) < 0) continue;
      setCell_(jv[j], jmap, '상태', JOB_CANCEL);
      setCell_(jv[j], jmap, '결과', '캠페인 초기화 — 겨누던 대상이 없어졌습니다');
      nCancel++;
    }
    if (nCancel) {
      jsh.getRange(2, 1, jv.length, jw).setValues(jv);
      out.push('· ' + SHEET_JOB + ' 열린 작업 ' + nCancel + '건 취소');
    }
  }

  out.push('· ' + SHEET_SPENDDAY + ' 는 그대로 (이미 쓴 돈의 기록)');
  return out;
}
