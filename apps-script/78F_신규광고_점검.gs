/**
 * 78F_신규광고_점검.gs — 아마존이 이 광고를 실제로 내보내고 있나 (서빙 상태)
 *
 * 켜져 있다(ENABLED)와 내보낸다(serving)는 다르다. 새 리스팅은 대표 오퍼(카트박스)가
 * 없거나, 이미지·심사가 걸려 있거나, 자격이 없어 '켜져 있는데 노출 0' 인 경우가 흔하다.
 * 노출이 안 붙을 때 값을 올리기 전에 이것부터 봐야 한다 — 안 내보내는 광고는 값을
 * 올려도 안 나온다.
 *
 * /sp/productAds/list 와 /sp/campaigns/list 에 includeExtendedDataFields 를 켜면
 * servingStatus 와 그 사유가 온다. 읽기만 한다 — 돈이 나가는 일은 없다.
 */

var NA_SHEET_SERVING = '서빙상태';
var NA_SERVING_HEADER = ['SKU', 'ASIN', '캠페인', '캠페인ID', '광고그룹ID', '광고ID', '상태', '서빙상태', '뜻', '상세', '점검일시'];

/** 아마존 서빙 상태 코드 → 사람이 읽는 말 */
var NA_SERVING_KO = {
  AD_STATUS_LIVE: '정상 — 노출 가능',
  NOT_BUYABLE: '구매 불가 — 대표 오퍼(카트박스)가 없거나 오퍼가 없음. SP 광고는 대표 오퍼일 때만 나옴',
  OUT_OF_STOCK: '재고 없음',
  MISSING_IMAGE: '대표 이미지 없음',
  MISSING_DECORATION: '상품 정보 부족 (이미지·제목 등)',
  LANDING_PAGE_NOT_AVAILABLE: '상품 페이지가 없거나 안 열림',
  INELIGIBLE: '광고 자격 없음 (카테고리 제한 · 리스팅 규정)',
  AD_POLICING_PENDING_REVIEW: '광고 심사 대기',
  AD_POLICING_SUSPENDED: '정책 위반으로 정지',
  PIR_PENDING_REVIEW: '상품 심사 대기',
  SECURITY_SCAN_PENDING_REVIEW: '보안 검사 대기',
  CAMPAIGN_OUT_OF_BUDGET: '캠페인 예산 소진',
  ADVERTISER_ACCOUNT_OUT_OF_BUDGET: '계정 예산 소진',
  ADVERTISER_PAYMENT_FAILURE: '결제 실패',
  CAMPAIGN_PAUSED: '캠페인 멈춤', AD_GROUP_PAUSED: '광고그룹 멈춤', AD_PAUSED: '광고 멈춤',
  CAMPAIGN_ARCHIVED: '캠페인 보관', AD_GROUP_ARCHIVED: '광고그룹 보관', AD_ARCHIVED: '광고 보관',
  CAMPAIGN_INCOMPLETE: '캠페인 설정 미완', AD_GROUP_INCOMPLETE: '광고그룹 설정 미완',
  PENDING_START_DATE: '시작일 전', ENDED: '종료',
  ADVERTISER_STATUS_ENABLED: '광고주 정상', CAMPAIGN_STATUS_ENABLED: '캠페인 정상'
};
function naServingKo_(code) {
  var c = String(code || '').trim();
  return NA_SERVING_KO[c] || (c ? '(모르는 코드 — 상세 참고)' : '(안 옴)');
}

/** 메뉴: 서빙 상태 점검 */
function naServingCheck() {
  if (!adBusyGuard_('신규 상품 광고 — 서빙 상태 점검')) return;
  var r = naServingRun_();
  if (r.blocked) { ui_().alert('서빙 상태 점검', r.blocked, ui_().ButtonSet.OK); return; }
  var lines = [];
  var keys = Object.keys(r.byStatus).sort(function (a, b) { return r.byStatus[b] - r.byStatus[a]; });
  for (var i = 0; i < keys.length; i++) lines.push('  ' + r.byStatus[keys[i]] + '개  ' + keys[i] + ' — ' + naServingKo_(keys[i]));
  var cl = [];
  var ck = Object.keys(r.campByStatus);
  for (var j = 0; j < ck.length; j++) cl.push('  ' + r.campByStatus[ck[j]] + '개  ' + ck[j] + ' — ' + naServingKo_(ck[j]));
  ui_().alert('신규 광고 — 아마존이 내보내고 있나',
    '상품광고 ' + r.n + '개 (캠페인 ' + r.nCamp + '개)\n\n' +
    '광고 서빙 상태\n' + lines.join('\n') + '\n\n' +
    '캠페인 서빙 상태\n' + cl.join('\n') + '\n\n' +
    (r.live < r.n ? '⚠ 내보내지 않는 광고 ' + (r.n - r.live) + '개 — 값을 올려도 안 나옵니다. ' +
                    '사유별 SKU 는 새 파일의 [' + NA_SHEET_SERVING + '] 탭.\n' : '모두 내보내는 중입니다 — 노출이 적다면 값(입찰)이나 새 리스팅의 관련성 문제입니다.\n'),
    ui_().ButtonSet.OK);
}

/**
 * 트랙 N 캠페인의 상품광고를 전부 읽어 서빙 상태를 새 파일에 적는다.
 * @return {{blocked:string, n:number, live:number, nCamp:number, byStatus:Object, campByStatus:Object}}
 */
function naServingRun_() {
  var out = { blocked: '', n: 0, live: 0, nCamp: 0, byStatus: {}, campByStatus: {} };
  var ours = naOurCampaigns_();
  var cids = Object.keys(ours.cids);
  if (!cids.length) { out.blocked = '계획 표에 트랙 N 캠페인이 없습니다 — [② 배분대로 광고 시작] 뒤에 보세요.'; return out; }
  var token = adsToken_();

  // 캠페인 — 이름과 캠페인 단위 서빙 상태
  var camp = {};
  for (var s = 0; s < cids.length; s += 100) {
    var part = cids.slice(s, s + 100);
    var rc = adsApiRetry_(token, 'post', '/sp/campaigns/list',
      { campaignIdFilter: { include: part }, includeExtendedDataFields: true, maxResults: 100 },
      ADSW_CT_CAMPAIGN, ADSW_CT_CAMPAIGN);
    var arr = (rc && rc.campaigns) || [];
    for (var a = 0; a < arr.length; a++) {
      var ex = arr[a].extendedData || {};
      camp[String(arr[a].campaignId)] = { name: String(arr[a].name || ''), state: String(arr[a].state || ''),
                                          serving: String(ex.servingStatus || '') };
      var cs = String(ex.servingStatus || '(안 옴)');
      out.campByStatus[cs] = (out.campByStatus[cs] || 0) + 1;
      out.nCamp++;
    }
  }

  // 상품광고 — 페이지 넘기며 전부
  var rows = [], now = new Date();
  for (var s2 = 0; s2 < cids.length; s2 += 100) {
    var part2 = cids.slice(s2, s2 + 100), next = null, guard = 0;
    do {
      var body = { campaignIdFilter: { include: part2 }, includeExtendedDataFields: true, maxResults: 500 };
      if (next) body.nextToken = next;
      var rp = adsApiRetry_(token, 'post', '/sp/productAds/list', body, ADSW_CT_PRODUCTAD, ADSW_CT_PRODUCTAD);
      var ads = (rp && rp.productAds) || [];
      for (var i = 0; i < ads.length; i++) {
        var ad = ads[i], ex2 = ad.extendedData || {};
        var st = String(ex2.servingStatus || '');
        var det = (ex2.servingStatusDetails || []).map(function (d) {
          return String(d.name || '') + (d.message ? ': ' + d.message : '');
        }).join(' | ');
        var c = camp[String(ad.campaignId)] || { name: '' };
        rows.push([String(ad.sku || ''), String(ad.asin || ''), c.name, String(ad.campaignId || ''),
                   String(ad.adGroupId || ''), String(ad.adId || ''), String(ad.state || ''),
                   st, naServingKo_(st), det, now]);
        var key = st || '(안 옴)';
        out.byStatus[key] = (out.byStatus[key] || 0) + 1;
        if (st === 'AD_STATUS_LIVE') out.live++;
      }
      next = rp && rp.nextToken;
    } while (next && guard++ < 50);
  }
  out.n = rows.length;
  // 문제 있는 것이 위로
  rows.sort(function (x, y) {
    var ax = x[7] === 'AD_STATUS_LIVE' ? 1 : 0, ay = y[7] === 'AD_STATUS_LIVE' ? 1 : 0;
    return ax !== ay ? ax - ay : (x[7] < y[7] ? -1 : x[7] > y[7] ? 1 : 0);
  });
  var sh = naSheet_(NA_SHEET_SERVING, NA_SERVING_HEADER);
  writeTable_(sh, NA_SERVING_HEADER, rows);
  try { if (rows.length) sh.getRange(2, 4, rows.length, 3).setNumberFormat('@'); } catch (e) {}
  var parts = [];
  for (var k in out.byStatus) parts.push(k + ' ' + out.byStatus[k]);
  log_('newads', 'INFO', '서빙 상태 — 광고 ' + out.n + '개 · 내보냄 ' + out.live + ' · ' + parts.join(' · '));
  return out;
}
