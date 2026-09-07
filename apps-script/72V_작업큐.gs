/**
 * 72V_작업큐.gs — 무엇을 바꿀 것인가를 줄로 남긴다 (기획서 13.2)
 *
 * ── 왜 큐가 필요한가 ────────────────────────────────────
 * 지금까지의 실행은 "표를 훑으며 그때그때 API 를 부른다" 였다. 그러면
 *   · 타임아웃으로 끊겼을 때 어디까지 갔는지 모른다
 *   · 아마존이 받았는지 안 받았는지 모르는 채로 다시 부른다 (중복 생성)
 *   · 계산이 바뀌어도 이미 나간 것과 안 나간 것을 가릴 수 없다
 * 그래서 '무엇을 바꿀 것인가' 를 먼저 줄로 적고, 그 줄의 상태를 옮긴다.
 *
 *   대기 → 실행중 → 검증대기 → 완료
 *   예외: 모의 · 재시도대기 · 결과불명 · 입력오류 · 중단 · 취소
 *
 * ── 결과불명을 무조건 다시 하지 않는다 ──────────────────
 * 보내고 타임아웃이 나면 만들어졌는지 알 수 없다. 그때 다시 만들면 같은 캠페인이
 * 둘이 된다. '결과불명' 으로 두고, 다음 수집이 실제 상태를 가져와 대조한다.
 *
 * ── 정책이 바뀌면 안 나간 작업은 무효다 ─────────────────
 * 마진이나 한도가 바뀌면 어제 계산한 목표값은 더 이상 그 정책의 것이 아니다.
 * 정책 버전이 다른 열린 작업은 취소하고 다시 계산한다.
 *
 * ── 이 파일은 아직 아마존에 쓰지 않는다 ─────────────────
 * 정책이 [자동운영] 이고 한도가 확정된 줄만 '대기' 가 되고, 나머지는 '모의' 다.
 * 실제로 보내는 것은 다음 걸음에서 붙인다.
 */

var SHEET_JOB = '광고작업';
var JOB_HEADER = [
  '작업ID', '만든시각', '정책ID', '정책버전', '소유트랙', '상품키',
  '대상종류', '대상ID', '대상이름', '동작',
  '기대이전값', '목표값', '근거',
  '상태', '시도', '마지막시각', '결과', '검증결과'
];

var JOB_WAIT = '대기';           // 보낼 준비가 됐다
var JOB_DRY = '모의';            // 정책이 모의운영이라 안 보낸다
var JOB_RUNNING = '실행중';
var JOB_VERIFY = '검증대기';     // 아마존이 받았다. 실제 상태를 확인해야 한다
var JOB_DONE = '완료';
var JOB_RETRY = '재시도대기';
var JOB_UNKNOWN = '결과불명';    // 보냈는데 받았는지 모른다 — 다시 보내지 않는다
var JOB_BADINPUT = '입력오류';
var JOB_ABORT = '중단';
var JOB_CANCEL = '취소';         // 정책이 바뀌어 더 이상 유효하지 않다

/** 아직 끝나지 않은 상태들 — 같은 작업을 또 만들지 않으려고 본다 */
var JOB_OPEN = [JOB_WAIT, JOB_DRY, JOB_RUNNING, JOB_VERIFY, JOB_RETRY, JOB_UNKNOWN];

/**
 * 작업 고유키 — 정책버전 + 상품키 + 자원 + 동작 + 목표값.
 * 목표값을 넣는 이유: 같은 그룹의 같은 동작이라도 목표가 달라지면 다른 작업이다.
 * 목표값이 그대로면 이미 만든 줄을 다시 만들지 않는다.
 */
function adJobKey_(o) {
  return [o.policyId, o.policyVer, o.sku, o.targetKind, o.targetId, o.action,
          String(o.to)].join('|');
}

/**
 * 한 번에 얼마나 바꿀 것인가 (기획서 7.1).
 * 정상 인상은 15%, 인하는 20% 까지. 보호 동작(중단·감액)은 이 제한 위에 있다.
 */
var JOB_UP_PCT = 0.15;
var JOB_DOWN_PCT = 0.20;
var JOB_MIN_HOURS = 72;          // 같은 대상을 이보다 자주 손대지 않는다
var JOB_BID_EPS = 0.5;           // 이보다 차이가 작으면 건드리지 않는다

/**
 * 목표를 향해 한 걸음.
 * 한 번에 목표까지 뛰지 않는다 — 크게 흔들면 무엇이 원인인지 알 수 없고,
 * 아마존의 학습도 매번 처음부터 시작한다.
 */
function adBidStep_(cur, target) {
  var c = Number(cur) || 0, t = Number(target) || 0;
  if (!(t > 0)) return { to: 0, why: '목표를 계산할 수 없습니다' };
  if (!(c > 0)) return { to: Math.round(t * 100) / 100, why: '지금 입찰이 없어 목표로 바로' };
  if (Math.abs(t - c) < JOB_BID_EPS) return { to: 0, why: '차이가 ¥' + JOB_BID_EPS + ' 미만' };
  var lim = (t > c) ? c * (1 + JOB_UP_PCT) : c * (1 - JOB_DOWN_PCT);
  var to = (t > c) ? Math.min(t, lim) : Math.max(t, lim);
  to = Math.round(to * 100) / 100;
  var capped = Math.abs(to - t) > 0.001;
  return { to: to,
           why: '¥' + c + ' → ¥' + to + ' (목표 ¥' + (Math.round(t * 100) / 100) + ')' +
                (capped ? ' · 한 번에 ' + (t > c ? JOB_UP_PCT * 100 : JOB_DOWN_PCT * 100) + '% 까지' : '') };
}

/** 그 대상을 마지막으로 손댄 뒤 몇 시간 지났나. 손댄 적 없으면 -1 */
function adJobHoursSince_(rows, map, targetId, action, now) {
  var last = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(cellOf_(rows[i], map, '대상ID', '')) !== String(targetId)) continue;
    if (String(cellOf_(rows[i], map, '동작', '')) !== action) continue;
    var st = String(cellOf_(rows[i], map, '상태', ''));
    if (st !== JOB_DONE) continue;
    var at = cellOf_(rows[i], map, '마지막시각', '');
    var t = (at instanceof Date) ? at.getTime() : Date.parse(String(at));
    if (isFinite(t) && t > last) last = t;
  }
  if (!last) return -1;
  return (now - last) / 3600000;
}

/**
 * 작업을 큐에 넣는다. 이미 열려 있는 같은 작업은 다시 만들지 않는다.
 * @return {{added:number, cancelled:number}}
 */
function adJobUpsert_(jobs, curPolicyVer) {
  var sh = ss_().getSheetByName(SHEET_JOB);
  if (!sh) return { added: 0, cancelled: 0 };
  var map = ensureCols_(sh, JOB_HEADER);
  var width = Math.max(sh.getLastColumn(), JOB_HEADER.length);
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];

  // ① 정책이 바뀌었으면 안 나간 작업은 무효다
  var cancelled = 0, dirty = false;
  for (var i = 0; i < rows.length; i++) {
    var st = String(cellOf_(rows[i], map, '상태', ''));
    if (st !== JOB_WAIT && st !== JOB_DRY) continue;      // 이미 나간 것은 건드리지 않는다
    var pid = String(cellOf_(rows[i], map, '정책ID', ''));
    var pv = Number(cellOf_(rows[i], map, '정책버전', 0)) || 0;
    if (curPolicyVer[pid] === undefined || curPolicyVer[pid] === pv) continue;
    setCell_(rows[i], map, '상태', JOB_CANCEL);
    setCell_(rows[i], map, '결과', '정책 버전이 ' + pv + ' → ' + curPolicyVer[pid] +
                                  ' 로 바뀌어 다시 계산합니다');
    cancelled++; dirty = true;
  }

  // ② 이미 열려 있는 작업은 다시 만들지 않는다
  var open = {};
  for (var j = 0; j < rows.length; j++) {
    if (JOB_OPEN.indexOf(String(cellOf_(rows[j], map, '상태', ''))) < 0) continue;
    open[String(cellOf_(rows[j], map, '작업ID', ''))] = true;
  }

  var add = [], now = new Date();
  for (var k = 0; k < jobs.length; k++) {
    var o = jobs[k];
    var id = adJobKey_(o);
    if (open[id]) continue;
    open[id] = true;
    var row = new Array(width).fill('');
    setCell_(row, map, '작업ID', id);
    setCell_(row, map, '만든시각', now);
    setCell_(row, map, '정책ID', o.policyId);
    setCell_(row, map, '정책버전', o.policyVer);
    setCell_(row, map, '소유트랙', o.track);
    setCell_(row, map, '상품키', o.sku);
    setCell_(row, map, '대상종류', o.targetKind);
    setCell_(row, map, '대상ID', o.targetId);
    setCell_(row, map, '대상이름', o.targetName || '');
    setCell_(row, map, '동작', o.action);
    setCell_(row, map, '기대이전값', o.from === undefined ? '' : o.from);
    setCell_(row, map, '목표값', o.to);
    setCell_(row, map, '근거', o.why || '');
    setCell_(row, map, '상태', o.canAuto ? JOB_WAIT : JOB_DRY);
    setCell_(row, map, '시도', 0);
    add.push(row);
  }

  if (dirty && rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
  if (add.length) {
    var at = Math.max(last, 1) + 1;
    var need = at + add.length - 1;
    if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
    sh.getRange(at, 1, add.length, width).setValues(add);
  }
  return { added: add.length, cancelled: cancelled };
}

/**
 * 메뉴: 트랙 B 가 지금 해야 할 일을 작업으로 뽑는다.
 *
 * 아마존을 건드리지 않는다. 무엇을 왜 바꿀 것인지만 줄로 남긴다.
 * 정책이 [자동운영] 이고 한도가 확정된 줄만 '대기' 가 되고, 나머지는 '모의' 다.
 */
function planAdGrowJobs(opts) {
  var made = makeOneSheet_([{ name: SHEET_JOB, header: JOB_HEADER }]);
  if (madeSheetStop_(made, '트랙 B 작업 계획')) return null;

  var gsh = getSheetOrThrow_(SHEET_ADGROW);
  if (gsh.getLastRow() < 2) throw new Error('"' + SHEET_ADGROW + '" 이 비어 있습니다.');
  var gmap = hdrMap_(gsh);
  var gv = gsh.getRange(2, 1, gsh.getLastRow() - 1,
                        Math.max(gsh.getLastColumn(), 1)).getValues();

  var pol = adPolicyAll_();
  var curVer = {};
  for (var p = 0; p < pol.rows.length; p++) curVer[pol.rows[p].id] = pol.rows[p].ver;

  var jsh = ss_().getSheetByName(SHEET_JOB);
  var jmap = hdrMap_(jsh);
  var jrows = jsh.getLastRow() > 1
    ? jsh.getRange(2, 1, jsh.getLastRow() - 1, Math.max(jsh.getLastColumn(), 1)).getValues() : [];

  // 지금 켜져 있는 캠페인 — 계획 표의 결과 표시로 안다 (API 아님)
  var ours = adWatchOurs_(), onById = {};
  for (var o = 0; o < ours.length; o++) {
    if (String(ours[o].result).indexOf(ADENABLE_MARK.ENABLED) >= 0) onById[ours[o].cid] = ours[o];
  }

  var jobs = [], now = Date.now(), skipped = { 단계: 0, 간격: 0, 차이: 0, 값없음: 0 }, nPause = 0;
  for (var i = 0; i < gv.length; i++) {
    var sku = String(gv[i][AG_SKU] || '').trim();
    if (!sku) continue;
    var stage = String(cellOf_(gv[i], gmap, '단계', ''));
    var pp = adPolicyFor_(pol, 'B', sku);
    var cid = String(gv[i][AG_CID] || '').trim();

    /**
     * 멈춰야 하는 줄 — 한도·기간을 넘겼다. 캠페인 멈춤 작업을 만든다.
     * 보호 동작이라 정책 모드와 상관없이 '대기' 로 둔다 (기획서 11.1: 안전 감액·중단은 자동).
     * 이미 멈춰 있으면 만들지 않는다.
     */
    if (String(cellOf_(gv[i], gmap, '멈춤필요', '')) === '예' && cid && onById[cid]) {
      jobs.push({
        policyId: pp ? pp.id : '', policyVer: pp ? pp.ver : 0, track: 'B', sku: sku,
        targetKind: '캠페인', targetId: cid, targetName: String(gv[i][AG_CAMP] || ''),
        action: '상태변경', from: 'ENABLED', to: 'PAUSED',
        why: '보호 멈춤 — ' + String(cellOf_(gv[i], gmap, '다음 행동', '')).substring(0, 120),
        canAuto: true
      });
      nPause++;
    }
    // 멈출 이유가 있는 단계에서는 입찰을 계획하지 않는다
    if (stage === BSTAGE_STOP || stage === BSTAGE_INPUT || !stage) { skipped['단계']++; continue; }

    /**
      * 무엇에 입찰을 거는가 — 기준키워드를 올렸으면 그 키워드다.
      * 아마존은 키워드에 입찰이 있으면 광고그룹 기본입찰을 보지 않는다.
      * 그룹에만 걸면 수동으로 갈아탄 뒤로는 값이 얼어붙는다.
      */
    var gid = String(gv[i][AG_GID] || '').trim();
    var kid = String(cellOf_(gv[i], gmap, ADGROW_KWID, '')).trim();
    var tKind = kid ? '키워드' : '광고그룹';
    var tId = kid || gid;
    var cur = Number(cellOf_(gv[i], gmap, '현재설정입찰(JPY)', 0)) || Number(gv[i][AG_BID]) || 0;
    var target = Number(cellOf_(gv[i], gmap, '목표클릭비용(JPY)', 0)) || 0;
    if (!tId || !(target > 0)) { skipped['값없음']++; continue; }

    var hrs = adJobHoursSince_(jrows, jmap, tId, '입찰변경', now);
    if (hrs >= 0 && hrs < JOB_MIN_HOURS) { skipped['간격']++; continue; }

    var step = adBidStep_(cur, target);
    if (!(step.to > 0)) { skipped['차이']++; continue; }

    jobs.push({
      policyId: pp ? pp.id : '', policyVer: pp ? pp.ver : 0, track: 'B', sku: sku,
      targetKind: tKind, targetId: tId,
      targetName: String(gv[i][AG_CAMP] || '') +
                  (kid ? ' · 기준키워드 "' + String(gv[i][AG_KW] || '') + '"' : ''),
      action: '입찰변경', from: cur, to: step.to,
      why: step.why + ' · 판단전환율 ' + cellOf_(gv[i], gmap, '판단전환율(%)', '?') + '%' +
           ' · 단계 ' + stage +
           (kid ? ' · 키워드 입찰 (그룹 기본입찰은 이 캠페인에서 안 쓰입니다)' : ''),
      canAuto: !!(pp && pp.canAuto)
    });
  }

  var res = adJobUpsert_(jobs, curVer);
  adJobNotes_(jsh);
  showSheet_(SHEET_JOB);

  var nWait = 0, nDry = 0;
  for (var q = 0; q < jobs.length; q++) { if (jobs[q].canAuto) nWait++; else nDry++; }
  if (opts && opts.quiet) return { added: res.added, cancelled: res.cancelled, wait: nWait, dry: nDry, pause: nPause };
  ui_().alert('트랙 B 작업 계획',
    '새 작업 ' + res.added + '건' +
    (nPause ? ' · 그중 보호 멈춤 ' + nPause + '건' : '') +
    (res.cancelled ? ' · 정책이 바뀌어 취소한 것 ' + res.cancelled + '건' : '') + '\n' +
    '   ' + JOB_WAIT + ' ' + nWait + '건 (정책이 자동운영 · 한도 확정)\n' +
    '   ' + JOB_DRY + ' ' + nDry + '건 (계산만 하고 보내지 않습니다)\n\n' +
    '건너뜀 — 단계 ' + skipped['단계'] + ' · 값 없음 ' + skipped['값없음'] +
    ' · ' + JOB_MIN_HOURS + '시간 안 지남 ' + skipped['간격'] +
    ' · 차이 작음 ' + skipped['차이'] + '\n\n' +
    '아마존은 아직 건드리지 않았습니다. [근거] 칸을 보고 맞는지 확인하세요.',
    ui_().ButtonSet.OK);
}

function adJobNotes_(sh) {
  notesByName_(sh, {
    '작업ID': '정책버전 + 상품 + 자원 + 동작 + 목표값. 같은 작업을 두 번 만들지 않는 열쇠다.',
    '기대이전값': '보내기 직전에 이 값이 맞는지 확인한다.\n' +
      '다르면 그 사이 누가 바꾼 것이므로 덮어쓰지 않는다.',
    '상태': JOB_WAIT + ' 보낼 준비 · ' + JOB_DRY + ' 모의운영이라 안 보냄\n' +
      JOB_RUNNING + ' 보내는 중 · ' + JOB_VERIFY + ' 아마존이 받음, 실제 상태 확인 필요\n' +
      JOB_DONE + ' 끝남 · ' + JOB_RETRY + ' 잠깐 걸린 것, 다시\n' +
      JOB_UNKNOWN + ' 보냈는데 받았는지 모름 — 다시 보내지 않고 조회해 대조한다\n' +
      JOB_BADINPUT + ' 값이 틀림 · ' + JOB_ABORT + ' 그만둠 · ' + JOB_CANCEL + ' 정책이 바뀌어 무효',
    '목표값': '한 번에 목표까지 뛰지 않는다 — 인상 ' + (JOB_UP_PCT * 100) +
      '% · 인하 ' + (JOB_DOWN_PCT * 100) + '% 까지.\n크게 흔들면 무엇이 원인인지 알 수 없다.',
    '검증결과': '보낸 뒤 따로 조회해 실제로 그 값이 되었는지 확인한 결과.\n' +
      '"보냈다" 와 "그렇게 되었다" 는 다르다.'
  });
}
