// 재시도 트리거 누수 · 청소 · 자격 거절은 잇단 실패 아님 · 관제 예산 규칙
const fs=require('fs'); const A=__dirname+'/../../apps-script/';
const sX=fs.readFileSync(A+'72X_광고자동.gs','utf8'), sN=fs.readFileSync(A+'72N_광고관제.gs','utf8');
function fn(src,name){ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('no '+name); let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.substring(i,k+1);} } }
let props={}, log=[], trig=[];
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]==null?null:props[k], setProperty:(k,v)=>{props[k]=String(v);}, deleteProperty:k=>{delete props[k];}})};
const mkT=h=>({getHandlerFunction:()=>h});
global.ScriptApp={getProjectTriggers:()=>trig.slice(), deleteTrigger:t=>{trig=trig.filter(x=>x!==t);}, WeekDay:{MONDAY:1},
  newTrigger:h=>{const b={timeBased:()=>b,after:()=>b,atHour:()=>b,everyDays:()=>b,onWeekDay:()=>b,create:()=>{trig.push(mkT(h));}}; return b;}};
global.log_=(a,b,c)=>log.push(c); global.uiSilent_=()=>{}; global.notifyAlert_=()=>{}; global.ADSPEND_PENDING='리포트 준비 중';
for (const m of sX.matchAll(/^var (ADSCHED_\w+) = ([^;]+);/gm)) eval('var '+m[1]+' = '+m[2]+';');
global.AD_AUTOMATIONS=[{handler:'scheduledA',hour:3},{handler:'scheduledB',hour:11}];
for (const n of ['adSchedDrop_','adSchedRetry_','adQueueJson_','adSchedRetryRun','adSchedSweep_','adSchedClear_','adSchedRun_']) eval(fn(sX,n));
let fail=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fail++; };
// 옛 상태: 매일 트리거 2 + 예전 재시도가 남긴 scheduledB 트리거 3개
trig=[mkT('scheduledA'),mkT('scheduledB'),mkT('scheduledB'),mkT('scheduledB'),mkT('scheduledB')];
adSchedSweep_();
ok(trig.filter(t=>t.getHandlerFunction()==='scheduledB').length===1 && trig.length===2, '청소: 겹친 scheduledB 4개 → 1개 (전체 '+trig.length+')');
// 재시도는 손잡이 하나로
let calls=[]; global.scheduledB=()=>{calls.push('B');}; global.scheduledA=()=>{calls.push('A');};
adSchedRetry_('scheduledB'); adSchedRetry_('scheduledA'); adSchedRetry_('scheduledB');
ok(trig.filter(t=>t.getHandlerFunction()===ADSCHED_RETRY_HANDLER).length===1 && trig.length===3, '세 번 걸어도 재시도 트리거는 1개 (전체 '+trig.length+')');
ok(JSON.parse(props.ADSCHED_RETRY_QUEUE).join()==='scheduledB,scheduledA', '큐에 이름만 (중복 없이): '+props.ADSCHED_RETRY_QUEUE);
adSchedRetryRun();
ok(calls.join()==='B,A' && trig.length===2 && !props.ADSCHED_RETRY_QUEUE, '뜨면 제 트리거 지우고 큐의 걸음을 부른다 → 남은 트리거 '+trig.length);
props={}; props[ADSCHED_RETRY_PROP+'scheduledB']='4'; ok(adSchedRetry_('scheduledB')===false && trig.length===2, '4번 넘으면 안 건다');
// 관제 판정 규칙
global.ADWATCH_DAYS=7; global.pct1_=x=>Math.round(x*1000)/10+'%'; global.ADWATCH_MIN_DAYS=3; global.daysBetween_=(a,b)=>0;
eval(fn(sN,'adWatchVerdict_'));
const c={approved:true,daily:865,bid:8,nSku:9,track:'X',result:'성공 · 멈춤'};
let d=adWatchVerdict_(c,{state:'ENABLED'},{im:20480,ck:1644,cost:6740,sales:196973,ord:60},0.17,'','2026-09-16','2026-09-22',0);
ok(d.fix!=='PAUSE', 'B7T: 한도 11% 초과지만 벌고 있음 → 안 멈춤 ('+d.v+')');
d=adWatchVerdict_(c,{state:'ENABLED'},{im:2000,ck:100,cost:9000,sales:5000,ord:2},0.17,'','2026-09-16','2026-09-22',0);
ok(d.fix==='PAUSE' && /예산 초과/.test(d.v), '한도 48% 초과 + 못 벎 → 멈춤');
d=adWatchVerdict_(c,{state:'ENABLED'},{im:2000,ck:100,cost:6740,sales:1000,ord:0},0.17,'','2026-09-16','2026-09-22',0);
ok(d.fix!=='PAUSE' || !/예산 초과/.test(d.v), '11% 초과는 아마존 허용 폭(25%) 안 → 예산 초과 아님 ('+d.v+')');
console.log(fail?'\n✗ 실패 '+fail:'\n✓ 전부 통과'); process.exit(fail?1:0);
