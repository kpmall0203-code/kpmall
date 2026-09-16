const fs=require('fs');
global.SHEET_ADPLAN='p'; global.SHEET_ADGROW='g'; global.ADPLAN_HEADER=new Array(22).fill('h');
global.ADGROW_HEADER=new Array(27).fill('h');
global.AP_ACTION=2;global.AP_NAME=4;global.AP_DAILY=6;global.AP_BID=7;global.AP_GID=17;
global.AP_APPROVE=18;global.AP_RESULT=19;global.AP_CID=20;global.AP_ADIDS=21;global.AP_TRACK=22;
global.ADPLAN_TRACK_B='B';
global.AG_SKU=0;global.AG_LOSS=6;global.AG_WEEKLY=11;global.AG_CAMP=23;
global.ADSW_CT_CAMPAIGN='c';global.ADCAMP_COLS=[];global.ADCAMP_REPORT_TYPE='t';global.ADS_SOFT_MS=1;
global.ADENABLE_MARK={ENABLED:'· 켬',PAUSED:'· 멈춤'};
global.adRowApproved_=c=>c===true;global.ymd_=()=>'2026-09-04';global.addDays_=()=>'2026-08-29';
global.pct1_=x=>(x*100).toFixed(1)+'%';global.daysBetween_=()=>10;
global.log_=()=>{};global.toast_=()=>{};global.showSheet_=()=>{};global.fitRows_=()=>{};global.headerNotes_=()=>{};
global.adsToken_=()=>'t';global.adBusyGuard_=()=>true;global.withLock_=(n,f)=>f();
let mails=[];global.notifyAlert_=(s)=>mails.push(s);
global.adLogWrite_=()=>{};global.adLogRow_=o=>o;
const props={};global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v;},deleteProperty:k=>{delete props[k];}})};
global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger(){},newTrigger:()=>({timeBased:()=>({atHour:()=>({everyDays:()=>({create(){}})}),after:()=>({create(){}})})})};
global.ui_=()=>({alert:()=>'OK',ButtonSet:{OK:'OK',OK_CANCEL:'OKC'},Button:{OK:'OK'}});
// 계획: A 2개 (일예산 200 → capA 2800), B 2개
const plan=[];const mkP=(n,tr,daily,cid)=>{const r=new Array(22).fill('');
  r[AP_NAME-1]=n;r[AP_APPROVE-1]=true;r[AP_DAILY-1]=daily;r[AP_BID-1]=10;r[7]=1;
  r[AP_RESULT-1]='성공';r[AP_CID-1]=cid;r[AP_TRACK-1]=tr;return r;};
plan.push(mkP('KP A1','A',200,'A1'),mkP('KP A2','A',200,'A2'),
          mkP('KP GROW X','B',1286,'B1'),mkP('KP GROW Y','B',1286,'B2'));
// 육성: 주간 9000 씩
const grow=[];const mkG=(n,sku,w)=>{const r=new Array(27).fill('');r[AG_CAMP]=n;r[AG_SKU]=sku;r[AG_WEEKLY]=w;r[AG_LOSS]=3000;return r;};
grow.push(mkG('KP GROW X','SKU-X',9000),mkG('KP GROW Y','SKU-Y',9000));
const sheets={p:{getLastRow:()=>plan.length+1,getRange:(r,c,nr,nc)=>({getValues:()=>nc===1?plan.map(x=>[x[c-1]]):plan.map(x=>x.slice()),setValues(){return this;}})},
 g:{getLastRow:()=>grow.length+1,getRange:()=>({getValues:()=>grow.map(x=>x.slice())})},
 광고관제:{getMaxRows:()=>200,getMaxColumns:()=>26,getLastRow:()=>2,insertRowsAfter(){},insertColumnsAfter(){},setFrozenRows(){},
  getRange:()=>({clearContent(){return this;},setValue(){return this;},setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
   setValues(){return this;},setNumberFormat(){return this;},insertCheckboxes(){return this;},getDataValidation:()=>null})}};
global.ss_=()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>sheets[n]});
global.SHEET_ADLOG='L';
let puts=[];let live={A1:'ENABLED',A2:'ENABLED',B1:'ENABLED',B2:'ENABLED'};let perf={};
global.adsApiRetry_=(t,m,p2,b)=>{
  if(p2==='/sp/campaigns/list')return{campaigns:b.campaignIdFilter.include.map(id=>({campaignId:id,state:live[id],budget:{budget:200}}))};
  if(p2==='/sp/campaigns'&&m==='put'){puts.push(...b.campaigns.map(x=>x.campaignId));return{campaigns:{success:b.campaigns.map((x,i)=>({index:i,campaignId:x.campaignId}))}};}
  throw new Error('unexpected');};
global.adsRunReport_=()=>Object.keys(perf).map(cid=>({campaignId:cid,impressions:100,clicks:20,cost:perf[cid],sales14d:perf[cid]*4,purchases14d:3}));
global.adBasis_=()=>({'기본 마진율':0.17,'한도 경고 비율':0.8,'한도 넘으면 자동 멈춤':'TRUE','주간 광고비 한도(JPY)':''});
eval(fs.readFileSync('72N.js','utf8'));
const B=s=>s.split('  |  ').slice(1,4).join(' | ');
function run(l){puts=[];mails=[];delete props['ADWATCH_MAILED'];const r=adWatchRun_(false);
  console.log('── '+l+' ──\n  '+B(r.banner)+'\n  멈춤: '+JSON.stringify(puts));return r;}
perf={A1:200,A2:200,B1:1000,B2:1000}; run('평시');
perf={A1:1800,A2:1800,B1:1000,B2:1000}; run('트랙A 만 초과 (3600>2800)');
console.log('  ✓ A 만 멈춤:', JSON.stringify(puts.sort())==='["A1","A2"]');
perf={A1:200,A2:200,B1:10000,B2:10000}; run('트랙B 만 초과 (20000>18000)');
console.log('  ✓ B 만 멈춤:', JSON.stringify(puts.sort())==='["B1","B2"]');
perf={A1:200,A2:200,B1:12000,B2:1000}; run('트랙B 한 줄만 제 예산 초과');
console.log('  ✓ 그 줄만:', JSON.stringify(puts)==='["B1"]');
