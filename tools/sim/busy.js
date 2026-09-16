// 무엇이 도는지 두 곳이 같은 답을 하는가 (74_자료점검 · 72K · 72X 큐)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };
const props={}; let trigs=[];
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,
  setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})};
global.ScriptApp={getProjectTriggers:()=>trigs.map(h=>({getHandlerFunction:()=>h})),deleteTrigger(){},
  newTrigger:()=>({timeBased:()=>({after:()=>({create(){}})})})};
global.ADDATA_QUEUE='ADDATA_QUEUE'; global.ADDATA_MAKE='ADDATA_MAKE'; global.ADDATA_CONTINUE='continueAdData';
global.ADDATA_LABEL={structure:'광고 구조',units:'상품광고 목록',spend:'지출 원장',ads:'SKU별 광고비',cand:'후보 다시 세우기'};
global.PROP_ADUNIT_NEXT='ADUNIT_NEXT'; global.PROP_ADUNIT_ROW='ADUNIT_ROW'; global.ADUNIT_CONTINUE='continueAdUnits';
global.PROP_ADS_QUEUE='ADS_QUEUE'; global.PROP_ADS_REPORT='ADS_REPORT';
for(const k of ['PROP_SYNC_REPORT','PROP_SYNC_DOC','PROP_SALES_QUEUE','PROP_SALES_REPORT','PROP_SALES_DOC',
  'PROP_SALES_RANGE','PROP_SKUD_QUEUE','PROP_ORDR_QUEUE','PROP_ADTERM_QUEUE','PROP_ADTERM_REPORT',
  'PROP_ADKW_QUEUE','PROP_DUP_QUEUE']) global[k]=k;
for(const k of ['ADEXEC_CONTINUE_HANDLER','ADENABLE_CONTINUE_HANDLER','ADTERM_APPLY_CONTINUE']) global[k]='h_'+k;
global.ADTERM_ROLLUP='ROLLUP';
global.adTermLastIn_=()=>null; global.applyQueueRemaining_=()=>0;
global.syncScheduleContinue_=()=>{}; global.salesClearRun_=()=>{}; global.skuDailyScheduleContinue_=()=>{};
global.ordrClearRun_=()=>{}; global.adsClearRun_=()=>{}; global.adTermScheduleContinue_=()=>{};
global.adkwClearRun_=()=>{}; global.adExecScheduleContinue_=()=>{}; global.adEnableScheduleContinue_=()=>{};
global.adTermApplyScheduleContinue_=()=>{}; global.dupCleanStop_=()=>{};
global.adDataContinue_=()=>{}; global.adUnitContinue_=()=>{};
global.LockService={getScriptLock:()=>({tryLock:()=>lockFree,releaseLock(){}})};
let lockFree=true, alerts=[];
global.ui_=()=>({alert:(a,b)=>{alerts.push([String(a),String(b||'')]);},ButtonSet:{OK:1}});
// 필요한 함수만 떼어 얹는다 (파일 전체를 부르면 환경 stub 을 덮는다)
const src=fs.readFileSync('all/74_자료점검.js','utf8');
const cut=(name)=>{const i=src.indexOf('function '+name+'(');let d=0,j=src.indexOf('{',i),k=j;
  do{ if(src[k]==='{')d++; else if(src[k]==='}')d--; k++; }while(d>0&&k<src.length); return src.slice(i,k);};
eval(cut('statusJobs_')); eval(cut('statusRunningNames_'));
global.statusJobs_=statusJobs_; global.statusRunningNames_=statusRunningNames_;
const g=fs.readFileSync('all/72K_광고상태.js','utf8');
const gi=g.indexOf('function adBusyGuard_(');let d=0,gj=g.indexOf('{',gi),gk=gj;
do{ if(g[gk]==='{')d++; else if(g[gk]==='}')d--; gk++; }while(d>0&&gk<g.length);
eval(g.slice(gi,gk));

ok(statusRunningNames_().length===0, '아무것도 안 돌면 빈 목록');
props['ADDATA_QUEUE']=JSON.stringify(['ads','cand']);
const n1=statusRunningNames_();
ok(n1.length===1 && /광고 자료 갱신/.test(n1[0]) && /SKU별 광고비/.test(n1[0]),
   '자료 갱신 사슬이 [지금 무엇이 도는가] 에 나온다 — "'+n1[0]+'"');
lockFree=false; alerts=[];
ok(adBusyGuard_('② 시작')===false, '잠겨 있으면 막는다');
ok(/SKU별 광고비/.test(alerts[0][1]), '   막을 때 무엇이 도는지 이름을 댄다 (예전엔 "다른 작업" 만 말했다)');
props['ADDATA_QUEUE']=JSON.stringify([]); alerts=[];
adBusyGuard_('② 시작');
ok(/짧은 걸음/.test(alerts[0][1]), '   표에 안 남는 짧은 걸음이면 그렇다고 말하고 기다리라 한다');
delete props['ADDATA_QUEUE'];
props['ADUNIT_NEXT']='N'; props['ADUNIT_ROW']='12002';
const n2=statusRunningNames_();
ok(n2.length===1 && /상품광고 목록/.test(n2[0]) && /12,000/.test(n2[0]),
   '상품광고 목록 이어받기도 나온다 — "'+n2[0]+'"');
// 다 쓴 큐가 "[]" 로 남아도 '도는 중' 으로 보지 않는다
delete props['ADUNIT_NEXT']; props['ADS_QUEUE']='[]';
ok(statusRunningNames_().length===0, '다 쓴 큐("[]")를 도는 것으로 세지 않는다');
console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
