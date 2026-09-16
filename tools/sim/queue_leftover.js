// 빈 큐 '[]' 가 속성에 남아 주 1회 걸음이 건너뛰던 버그 + 매일 신규 실적 받기
const fs=require('fs'); const A=__dirname + '/../../apps-script/';
function fn(src,name){ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('no '+name);
  let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.substring(i,k+1);} } }
function vars(src){ return src.split('\n').filter(l=>/^var [A-Z_0-9]+ = [^,]*;/.test(l)).map(l=>l.replace(/;\s*\/\/.*$/,';')).join('\n'); }
const s72=fs.readFileSync(A+'72_광고.gs','utf8'), s72X=fs.readFileSync(A+'72X_광고자동.gs','utf8'),
      s72K=fs.readFileSync(A+'72K_광고상태.gs','utf8'), s78D=fs.readFileSync(A+'78D_신규광고_실적.gs','utf8'),
      s78E=fs.readFileSync(A+'78E_신규광고_주기.gs','utf8');
let props={}, log=[], created=0, statusQ=[], out=[];
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]==null?null:props[k],
  setProperty:(k,v)=>{props[k]=String(v);}, deleteProperty:k=>{delete props[k];}})};
global.ScriptApp={getProjectTriggers:()=>[], newTrigger:()=>({timeBased:()=>({after:()=>({create:()=>{out.push('trigger');}})})})};
global.Utilities={sleep:()=>{}, ungzip:b=>({getDataAsString:()=>'[]'})};
global.UrlFetchApp={fetch:()=>({getBlob:()=>({setContentType:()=>({})})})};
global.log_=(a,b,c)=>log.push(c); global.toast_=()=>{}; global.notifyAlert_=()=>{}; global.uiSilent_=()=>{}; global.ui_=()=>({alert:()=>{},ButtonSet:{OK:1}});
global.adsToken_=()=>'t'; global.ADSPEND_PENDING='리포트 준비 중'; global.ADS_SOFT_MS=1000;
global.ymd_=()=>'2026-09-14'; global.addDays_=(d,n)=>{const x=new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().substring(0,10);};
global.adsAutoDays_=()=>30; global.ADS_MAX_DAYS=31;
global.adsCreateReport_=(t,f,to)=>{created++; out.push('create '+f+'~'+to); return {reportId:'r'+created};};
global.adsApi_=(t,m,p)=>({status: statusQ.length?statusQ.shift():'COMPLETED', url:'u'});
global.parseAdsReport_=()=>({rows:[], days:[], na:[['2026-09-13','S1','A','KP NEW B1-1',3,0,10,1,0]]});
global.writeAdsRows_=()=>{}; global.writeAdsDays_=()=>{}; global.pruneAds_=()=>''; global.adsScheduleContinue_=()=>{};
let perfWritten=[]; global.naPerfWrite_=(rows,f,t)=>{perfWritten.push([rows.length,f,t]); return rows.length;};
global.withLock_=(l,f)=>({ran:true, r:f()}); global.naCycleRun_=()=>{out.push('cycle'); return {};};
eval(vars(s72)); eval(vars(s72X));
for (const n of ['adsReportStep_','adsWindows_']) eval(fn(s72,n));
for (const n of ['adSchedRun_','adSchedRetry_','adSchedClear_','adSchedTriesLeft_','scheduledAdsSpend']) eval(fn(s72X,n));
eval(fn(s72K,'adQueueLen_')); eval(vars(s78D)); eval(fn(s78D,'naPerfFetch_')); eval(fn(s78E,'scheduledNewAdsCycle'));
let fail=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fail++; };

// 1) 지난주 끝난 뒤 '[]' 가 남아 있어도 이번 주는 새로 받는다
props={ADS_QUEUE:'[]'}; created=0; out=[];
scheduledAdsSpend();
ok(created===1, '빈 큐가 남아 있어도 새 리포트를 청구한다 (청구 '+created+')');
ok(props.ADS_QUEUE===undefined, '한 구간이 끝나면 큐 속성이 지워진다 (남은 값: '+props.ADS_QUEUE+')');
ok(perfWritten.length===1 && perfWritten[0][0]===1, '주 1회 수집에서도 신규 줄을 적는다');

// 2) 매일 주기 — 리포트가 바로 되면 실적을 적고 주기를 돈다
props={}; perfWritten=[]; out=[]; statusQ=[];
let r=scheduledNewAdsCycle();
ok(r==='완료' && out.includes('cycle') && perfWritten.length===1, '매일 주기: 실적 받고 주기 (' + r + ')');
ok(out[0]==='create 2026-09-05~2026-09-14', '최근 10일 구간 ('+out[0]+')');
ok(props.NA_PERF_REPORT===undefined, '끝나면 리포트 번호를 지운다');

// 3) 리포트가 아직이면 3분 뒤 다시 · 같은 번호를 이어받는다
props={}; out=[]; perfWritten=[]; statusQ=['PENDING','PENDING','PENDING','PENDING','PENDING','PENDING','PENDING'];
global.Date=class extends Date{ static now(){ return (Date._t=(Date._t||0)+40000); } };
r=scheduledNewAdsCycle();
ok(r==='리포트 준비 중' && out.includes('trigger') && !out.includes('cycle'), '아직이면 다시 오고 주기는 안 돈다');
const rid=props.NA_PERF_REPORT; statusQ=[]; out=[];
r=scheduledNewAdsCycle();
ok(r==='완료' && out.includes('cycle') && !out.some(x=>x.startsWith('create')) && perfWritten.length===1, '다시 와서 같은 리포트를 이어받는다 ('+rid+')');
ok(props['ADSCHED_TRY_scheduledNewAdsCycle']===undefined, '끝나면 재시도 횟수를 지운다');

// 4) 4번 기다려도 아직이면 있는 자료로 주기를 돈다
props={ADSCHED_TRY_scheduledNewAdsCycle:'4'}; out=[]; statusQ=new Array(10).fill('PENDING');
r=scheduledNewAdsCycle();
ok(out.includes('cycle') && r==='완료', '한도를 넘으면 실적 없이 주기를 돈다 ('+r+')');
ok(log.some(l=>/계속 아직/.test(l)), '   경고를 남긴다');

// 5) 어제 남은 번호는 버리고 새로 청구
props={NA_PERF_REPORT:'old|2026-09-04|2026-09-13'}; out=[]; statusQ=[];
scheduledNewAdsCycle();
ok(out.some(x=>x.startsWith('create')), '날짜가 지난 리포트 번호는 버리고 새로 청구한다');
console.log(fail?('\n✗ 실패 '+fail):'\n✓ 전부 통과'); process.exit(fail?1:0);
