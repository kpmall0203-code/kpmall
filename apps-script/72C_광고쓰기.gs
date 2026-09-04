/**
 * 72C_광고쓰기.gs — 광고 API 쓰기 권한 진단
 *
 * ── 왜 따로 확인해야 하는가 ─────────────────────────────
 * 광고 API에는 '읽기 전용' 스코프가 따로 없다. 리포트를 받는 데 쓰는
 * advertising::campaign_management 하나가 입찰가·예산 변경까지 같이 담고 있다.
 * 그래서 광고비 수집이 되고 있다면 스코프는 이미 충족된 상태다.
 *
 * 남는 변수는 '광고 계정에서 이 사용자에게 준 역할'이다.
 * 계정 소유자면 쓰기가 되고, 보기 전용으로 초대된 계정이면 리포트는 되는데
 * PUT 만 403 이 난다. 이건 토큰을 봐서는 알 수 없고 실제로 써 봐야 안다.
 *
 * ── 아무것도 바꾸지 않는 이유 ───────────────────────────
 * 지금 값을 그대로 다시 쓴다. 입찰가 12.00 을 12.00 으로 PUT 한다.
 * 권한이 있으면 성공하고 값은 그대로, 없으면 403 이 온다.
 * 어느 쪽이든 광고는 조금도 달라지지 않는다.
 *
 * v3 는 부분 갱신이라 보낸 칸만 바뀐다. 그래도 혹시 몰라 읽어온 값을
 * 그대로 되돌려 보내므로, 전체 교체로 동작하더라도 결과는 같다.
 */

// v3 는 Content-Type 과 Accept 에 전용 형식을 요구한다. 하나라도 빠지면 406이다.
var ADSW_CT_CAMPAIGN = 'application/vnd.spCampaign.v3+json';
var ADSW_CT_ADGROUP  = 'application/vnd.spAdGroup.v3+json';
var ADSW_CT_KEYWORD  = 'application/vnd.spKeyword.v3+json';
var ADSW_CT_NEGKEYWORD = 'application/vnd.spNegativeKeyword.v3+json';
var ADSW_CT_TARGET   = 'application/vnd.spTargetingClause.v3+json';

var PROP_ADS_WRITE_OK = 'ADS_WRITE_OK';   // 마지막 진단 결과 (yes/no + 날짜)

/** v3 목록 조회 (POST .../list) */
function adsList_(token, path, ct, body) {
  return adsApi_(token, 'post', path, body || { maxResults: 100 }, ct, ct);
}

/**
 * 성공/실패가 줄마다 따로 오는 v3 응답을 푼다.
 * HTTP 207 이면 전체는 성공인데 줄은 실패했을 수 있다 — 코드만 보면 속는다.
 * @return {{ok:boolean, msg:string}}
 */
function adsBatchResult_(res, key) {
  var box = res && res[key];
  if (!box) return { ok: false, msg: '응답에 ' + key + ' 가 없습니다: ' +
                                     JSON.stringify(res).substring(0, 200) };
  var nOk = (box.success || []).length;
  if (nOk > 0) return { ok: true, msg: '' };
  var errs = box.error || [];
  var first = errs.length && errs[0].errors && errs[0].errors.length
    ? errs[0].errors[0] : null;
  return { ok: false, msg: first
    ? (first.errorType || '') + ' ' + (first.message || '')
    : JSON.stringify(res).substring(0, 200) };
}

/**
 * 메뉴: 광고 쓰기 권한 진단.
 * 키워드가 없으면(자동 캠페인만 돌리는 계정) 타깃으로 확인한다 —
 * 자동 캠페인은 키워드가 아니라 타깃으로 굴러간다.
 */
function diagnoseAdsWrite() {
  var props = PropertiesService.getScriptProperties();
  var token = adsToken_();
  if (!props.getProperty(PROP_ADS_PROFILE)) adsPickProfile_();

  var lines = [];

  // 1) 읽기부터 — 여기서 막히면 쓰기를 볼 것도 없다
  var camps;
  try {
    camps = adsList_(token, '/sp/campaigns/list', ADSW_CT_CAMPAIGN,
      { maxResults: 100, stateFilter: { include: ['ENABLED', 'PAUSED'] } });
  } catch (e) {
    ui_().alert('광고 쓰기 권한 진단',
      '❌ 캠페인 목록조차 읽지 못했습니다.\n\n' + String(e).substring(0, 300) + '\n\n' +
      '리포트는 되는데 이게 안 되면 자격증명이 아니라\n' +
      '광고 계정에서 준 역할의 문제입니다.', ui_().ButtonSet.OK);
    return;
  }
  var nCamp = (camps.campaigns || []).length;
  lines.push('✅ 캠페인 ' + nCamp + '개를 읽었습니다');
  if (!nCamp) {
    ui_().alert('광고 쓰기 권한 진단',
      lines.join('\n') + '\n\n캠페인이 하나도 없어 쓰기를 시험할 대상이 없습니다.',
      ui_().ButtonSet.OK);
    return;
  }

  // 2) 되돌려 쓸 대상 하나를 고른다.
  //    입찰가가 명시된 것을 먼저 고른다 — 광고그룹 기본값을 물려받는 줄은
  //    입찰가 칸이 비어 있어서, 같은 값으로 되돌려 쓴다는 뜻이 흐려진다.
  var target = null;
  try {
    var kws = adsList_(token, '/sp/keywords/list', ADSW_CT_KEYWORD,
      { maxResults: 100, stateFilter: { include: ['ENABLED', 'PAUSED'] } });
    var list = kws.keywords || [];
    lines.push('✅ 키워드 ' + list.length + '개를 읽었습니다');
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i].bid === 'number') { target = mkKeywordTarget_(list[i]); break; }
    }
    if (!target && list.length) target = mkKeywordTarget_(list[0]);
  } catch (e) {
    lines.push('⚠ 키워드 목록 실패 — ' + String(e).substring(0, 90));
  }

  if (!target) {
    try {
      var tgs = adsList_(token, '/sp/targets/list', ADSW_CT_TARGET,
        { maxResults: 100, stateFilter: { include: ['ENABLED', 'PAUSED'] } });
      var tl = tgs.targetingClauses || [];
      lines.push('✅ 타깃 ' + tl.length + '개를 읽었습니다 (자동 캠페인)');
      for (var j = 0; j < tl.length; j++) {
        if (typeof tl[j].bid === 'number') { target = mkTargetTarget_(tl[j]); break; }
      }
      if (!target && tl.length) target = mkTargetTarget_(tl[0]);
    } catch (e2) {
      lines.push('⚠ 타깃 목록 실패 — ' + String(e2).substring(0, 90));
    }
  }

  if (!target) {
    ui_().alert('광고 쓰기 권한 진단',
      lines.join('\n') + '\n\n' +
      '키워드도 타깃도 없어 쓰기를 시험할 대상이 없습니다.\n' +
      '캠페인이 비어 있는지 확인하세요.', ui_().ButtonSet.OK);
    return;
  }

  // 3) 무엇을 쓸지 보여주고 확인받는다
  var bidTxt = (typeof target.bid === 'number')
    ? '입찰가 ' + target.bid + ' → ' + target.bid + ' (같은 값)'
    : '입찰가 없음 (광고그룹 기본값) — 상태 ' + target.state + ' 만 같은 값으로';
  var ans = ui_().alert('광고 쓰기 권한 진단',
    lines.join('\n') + '\n\n' +
    '아래 ' + target.kind + ' 하나에 지금 값을 그대로 다시 씁니다.\n\n' +
    '   ' + target.label + '\n' +
    '   ' + bidTxt + '\n\n' +
    '값은 바뀌지 않습니다. 권한이 있으면 성공하고,\n' +
    '보기 전용 계정이면 403이 옵니다.\n\n' +
    '진행할까요?', ui_().ButtonSet.YES_NO);
  if (ans !== ui_().Button.YES) return;

  // 4) 되돌려 쓰기
  var okWrite = false, why = '';
  try {
    var res = adsApi_(token, 'put', target.path, target.body, target.ct, target.ct);
    var r = adsBatchResult_(res, target.key);
    okWrite = r.ok; why = r.msg;
  } catch (e3) {
    why = String(e3).substring(0, 300);
  }

  var stamp = (okWrite ? 'yes' : 'no') + ' ' + ymd_(new Date());
  props.setProperty(PROP_ADS_WRITE_OK, stamp);
  log_('ads', okWrite ? 'INFO' : 'WARN',
       '쓰기 권한 진단 — ' + (okWrite ? '가능' : '불가') + (why ? ' (' + why + ')' : ''));

  if (okWrite) {
    ui_().alert('광고 쓰기 권한 진단 — 가능',
      lines.join('\n') + '\n' +
      '✅ 입찰가 쓰기 성공 (값은 그대로입니다)\n\n' +
      '자동 입찰 조정을 붙일 수 있습니다.', ui_().ButtonSet.OK);
  } else {
    var is403 = /\b403\b|ACCESS_DENIED|UNAUTHORIZED|FORBIDDEN/i.test(why);
    ui_().alert('광고 쓰기 권한 진단 — 불가',
      lines.join('\n') + '\n' +
      '❌ 입찰가 쓰기 실패\n\n' + why + '\n\n' +
      (is403
        ? '읽기는 되는데 쓰기만 막혔습니다.\n' +
          '광고 콘솔 [설정 → 사용자 관리]에서 이 계정의 역할을\n' +
          '"보기 전용"이 아닌 편집 권한으로 올려야 합니다.\n' +
          '역할을 바꾼 뒤에는 리프레시 토큰을 다시 받으세요 —\n' +
          '역할은 토큰을 발급받는 시점에 굳습니다.'
        : '권한이 아니라 다른 문제일 수 있습니다.\n' +
          '위 메시지를 그대로 두고 다시 진단해 보세요.'),
      ui_().ButtonSet.OK);
  }
}

/** 키워드 한 줄 → 되돌려 쓸 요청 */
function mkKeywordTarget_(k) {
  var one = { keywordId: k.keywordId, state: k.state };
  if (typeof k.bid === 'number') one.bid = k.bid;
  return {
    kind: '키워드', key: 'keywords', ct: ADSW_CT_KEYWORD, path: '/sp/keywords',
    label: '"' + (k.keywordText || '(이름 없음)') + '" (' + (k.matchType || '') + ')',
    bid: k.bid, state: k.state, body: { keywords: [one] }
  };
}

/** 타깃 한 줄 → 되돌려 쓸 요청 (자동 캠페인) */
function mkTargetTarget_(t) {
  var one = { targetId: t.targetId, state: t.state };
  if (typeof t.bid === 'number') one.bid = t.bid;
  var what = '';
  try {
    what = (t.expression && t.expression.length)
      ? (t.expression[0].type || '') : (t.targetId || '');
  } catch (e) { what = String(t.targetId || ''); }
  return {
    kind: '타깃', key: 'targetingClauses', ct: ADSW_CT_TARGET, path: '/sp/targets',
    label: what, bid: t.bid, state: t.state,
    body: { targetingClauses: [one] }
  };
}
