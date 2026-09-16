// 시간 트리거 걸음 (기획서 13.3) — 사람이 없을 때 무엇을 하고 무엇을 안 하나
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

let logs=[], mails=[];
global.log_=(a,lv,m)=>{logs.push(lv+' '+m);};
global.ss_=()=>({getUrl:()=>'u', toast(){}, getSheetByName:()=>null});
global.PropertiesService={_p:{},getScriptProperties(){const p=this._p;return{
  getProperty:k=>p[k]===undefined?null:p[k], setProperty(k,v){p[k]=String(v);},
  deleteProperty(k){delete p[k];}};}};
global.MailApp={sendEmail:(to,s,b)=>mails.push(s)};
global.Session={getEffectiveUser:()=>({getEmail:()=>'x@y.z'})};
global.PROP_ALERT_EMAIL='ALERT_EMAIL';
global.pad2_=n=>String(n).length<2?'0'+n:String(n);
global.ADWATCH_HANDLER='scheduledAdWatch';
global.POLICY_MODE_AUTO='자동운영';

// 트리거 저장소 흉내
let trig=[];
global.ScriptApp={
  getProjectTriggers:()=>trig.slice(),
  deleteTrigger:t=>{trig=trig.filter(x=>x!==t);},
  WeekDay:{MONDAY:'MON'},
  newTrigger:h=>({timeBased:()=>({
    atHour:()=>({everyDays:()=>({create(){trig.push({h:h,kind:'daily',
      getHandlerFunction:()=>h});}})}),
    onWeekDay:d=>({atHour:()=>({create(){trig.push({h:h,kind:'weekly',day:d,
      getHandlerFunction:()=>h});}})}),
    after:ms=>({create(){trig.push({h:h,kind:'after',ms:ms,
      getHandlerFunction:()=>h});}})})})};

// 창이 없는 환경 — getUi 가 던진다 (실제 트리거와 같다)
const ssStub={getUrl:()=>'https://sheet', toast(){}, getSheetByName:()=>null};
global.SpreadsheetApp={getUi:()=>{throw new Error('Cannot call SpreadsheetApp.getUi()');},
  flush(){}, getActiveSpreadsheet:()=>ssStub, getActive:()=>ssStub};

// 90_유틸의 ui_ 묶음만 진짜 코드로 (파일 전체를 부르면 위 stub 을 덮는다)
{
  const u=fs.readFileSync('all/90_유틸.js','utf8');
  const head=u.slice(0, u.indexOf('function ensureSheet_('));
  eval(head);
  for (const n of ['ui_','uiSilent_','uiIsSilent_','uiStub_','notifyAlert_'])
    global[n]=eval(n);
  global.UI_STUB_SET_=eval('UI_STUB_SET_'); global.UI_STUB_BUTTON_=eval('UI_STUB_BUTTON_');
}
global.ADSPEND_PENDING='리포트 준비 중';
eval(fs.readFileSync('all/72X_광고자동.js','utf8'));

// ── 창이 없을 때 ui_ 가 어떻게 답하나 ────────────────────
logs=[];
const r1=ui_().alert('끝났습니다','줄 3개', ui_().ButtonSet.OK);
ok(r1===ui_().Button.OK, '알리는 창(단추 하나)은 OK 로 답하고 넘어간다');
ok(logs.some(l=>l.indexOf('[창 없음]')>=0 && l.indexOf('줄 3개')>=0),
   '   내용을 로그에 남긴다 — "'+(logs.find(l=>l.indexOf('[창 없음]')>=0)||'').slice(0,50)+'"');
logs=[];
const r2=ui_().alert('정말 보낼까요?','30개', ui_().ButtonSet.OK_CANCEL);
ok(r2===ui_().Button.CANCEL, '묻는 창은 언제나 취소 — 없는 사람의 승낙을 지어내지 않는다');
ok(logs.some(l=>l.indexOf('WARN')===0), '   물어야 했다는 것을 경고로 남긴다');
const r3=ui_().prompt('몇 개?');
ok(r3.getSelectedButton()===ui_().Button.CANCEL && r3.getResponseText()==='',
   '입력 창도 취소');

// ── 걸음 감싸기 ─────────────────────────────────────────
logs=[]; mails=[];
let called=0;
let out=adSchedRun_('scheduledAdSpend','지출 원장 수집',()=>{called++;return '완료';});
ok(called===1 && out==='완료', '걸음을 그대로 부른다 (사람이 누르는 길과 같은 함수)');
ok(!uiIsSilent_(), '   끝나면 창 찾기를 되돌린다 (다음 메뉴 실행이 창을 쓴다)');

logs=[]; mails=[]; trig=[];
out=adSchedRun_('scheduledAdSpend','지출 원장 수집',()=>ADSPEND_PENDING);
ok(trig.length===1 && trig[0].kind==='after' && trig[0].h==='scheduledAdSpend',
   '리포트가 아직이면 몇 분 뒤 다시 건다');
ok(trig[0].ms===3*60*1000, '   '+(trig[0].ms/60000)+'분 뒤');
// 이미 한 번 기다렸다 (1/4). 세 번 더 하면 4/4, 그 다음이 그만두는 자리
for (let i=0;i<3;i++) { trig=[]; adSchedRun_('scheduledAdSpend','x',()=>ADSPEND_PENDING); }
ok(trig.length===1, '   네 번째까지는 계속 기다린다');
trig=[]; adSchedRun_('scheduledAdSpend','x',()=>ADSPEND_PENDING);
ok(trig.length===0, '네 번까지만 기다린다 — 안 되는 것을 하루 종일 두드리지 않는다');
ok(logs.some(l=>l.indexOf('오늘은 그만')>=0), '   그만두는 이유를 남긴다');

// 성공하면 셈을 지운다 (다음 날 다시 네 번 기다릴 수 있게)
adSchedRun_('scheduledAdSpend','x',()=>'완료');
trig=[]; adSchedRun_('scheduledAdSpend','x',()=>ADSPEND_PENDING);
ok(trig.length===1, '성공한 뒤에는 기다림 셈이 처음으로 돌아간다');

logs=[]; mails=[]; trig=[];
out=adSchedRun_('scheduledAdGrowCycle','한 바퀴',()=>{throw new Error('광고 API 500');});
ok(out===null, '터져도 예외를 밖으로 내보내지 않는다 (다음 날 걸음이 살아 있다)');
ok(logs.some(l=>l.indexOf('ERROR')===0 && l.indexOf('한 바퀴')>=0), '   실행 기록에 남긴다');
ok(mails.length===1, '   메일로 알린다 — 창이 없으니 이것 말고는 알 길이 없다');
ok(!uiIsSilent_(), '   터져도 창 찾기를 되돌린다');

// ── 트리거가 부르는 길은 묻지 않는다 ────────────────────
// 창이 없을 때 확인 창을 띄우면 '아니오' 가 되어 아무것도 안 나간다.
// 그래서 트리거 길은 quiet 로 부른다 — 승낙은 광고운영정책 표에 이미 있다.
let seen=null;
global.runAdGrowCycle=(o)=>{seen=o; return '한 바퀴 — 보냄 2';};
global.fetchAdSpendDaily=()=>'완료'; global.fetchAdStructure=()=>'완료';
global.verifyAdJobs=()=>'검증 완료';
scheduledAdGrowCycle();
ok(seen && seen.quiet===true, '트리거는 한 바퀴를 quiet 로 부른다 (묻지 않고 보낸다)');
let seenAdv=null;
global.advanceAdGrow=(o)=>{seenAdv=o; return {msg:'민 것 없음', moved:0};};
scheduledAdAdvance();
ok(seenAdv && seenAdv.quiet===true, '자동 진행도 quiet 로 부른다 (묻지 않고 민다)');
seen=null; scheduledAdVerify(); scheduledAdSpend(); scheduledAdStructure();
ok(seen===null, '   나머지 걸음은 그대로 (같은 함수를 부른다)');

// ── 켜고 끄기 ───────────────────────────────────────────
trig=[]; setupAdGrowTriggers();
ok(trig.length===AD_AUTOMATIONS.length, '켜면 걸음 수만큼 걸린다 ('+trig.length+')');
const nWeek=AD_AUTOMATIONS.filter(a=>a.weekly).length;
ok(trig.filter(t=>t.kind==='weekly').length===nWeek,
   '   주 1회짜리 '+nWeek+'개 (SKU별 광고비 · 상품광고 목록 · 검색어 · 후보 다시 세우기)');
ok(trig.filter(t=>t.kind==='daily').length===AD_AUTOMATIONS.length-nWeek, '   나머지는 매일');
const hours=AD_AUTOMATIONS.map(a=>a.hour).join(',');
ok(hours==='0,1,2,3,4,5,6,7,8,9,10,11,12',
   '   시각이 겹치지 않고 이어진다: 0 광고비 … 9 후보 · 10 신규 가져오기 · 11 신규 시작 · 12 신규 주기 ('+hours+')');
// 신규 걸음의 순서가 뜻을 가진다 — 가져오기 → 시작 → 주기
const na3=['scheduledNewAdsImport','scheduledNewAdsStart','scheduledNewAdsCycle']
  .map(h=>AD_AUTOMATIONS.findIndex(a=>a.handler===h));
ok(na3.every(i=>i>=0) && na3[0]<na3[1] && na3[1]<na3[2],
   '   신규: 가져오기 → 시작 → 주기 순서다 (셈하기 전에 시작하면 어제 값으로 만든다)');
ok(AD_AUTOMATIONS.findIndex(a=>a.handler==='scheduledAdsSpend') <
   AD_AUTOMATIONS.findIndex(a=>a.handler==='scheduledNewAdsCycle'),
   '   광고비 수집이 신규 주기보다 먼저다 (그 자료로 판정한다)');
// 확대 시험을 되돌리는 걸음은 매일이라야 한다 — 주 1회면 최대 엿새를 더 쓴다
const cyc=AD_AUTOMATIONS.find(a=>a.handler==='scheduledAdExpandCycle');
ok(cyc && !cyc.weekly, '   확대 시험 주기는 매일 돈다 (되돌릴 날을 놓치면 그만큼 더 쓴다)');
// 자료가 들어온 뒤에 후보를 센다 — 순서가 뒤집히면 지난주 자료로 판단한다
const iSpend=AD_AUTOMATIONS.findIndex(a=>a.handler==='scheduledAdsSpend');
const iCand=AD_AUTOMATIONS.findIndex(a=>a.handler==='scheduledAdCandidates');
ok(AD_AUTOMATIONS[iSpend].hour < AD_AUTOMATIONS[iCand].hour,
   '   광고비 수집이 후보 세우기보다 먼저다');
setupAdGrowTriggers();
ok(trig.length===AD_AUTOMATIONS.length, '두 번 켜도 곱절이 되지 않는다 (옛 것을 먼저 거둔다)');
trig.push({h:'other',getHandlerFunction:()=>'other',kind:'daily'});
stopAdGrowTriggers();
ok(trig.length===1 && trig[0].h==='other', '끄면 광고 걸음만 거둔다 — 남의 트리거는 안 건드린다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
