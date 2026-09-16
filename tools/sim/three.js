const fs=require('fs');
const rows=JSON.parse(fs.readFileSync('realrows.json','utf8'));
const N=rows.length;
global.ADPLAN_HEADER=new Array(20).fill('x');
global.AP_ACTION=2;global.AP_NAME=4;global.AP_DAILY=6;global.AP_SKUS=16;
global.AP_GID=17;global.AP_APPROVE=18;global.AP_RESULT=19;global.AP_CID=20;
global.SHEET_ADPLAN='p';global.ADS_SOFT_MS=4*60*1000;global.ADEXEC_ADS_BATCH=100;
global.ADSW_CT_CAMPAIGN='c';global.ADSW_CT_ADGROUP='g';global.ADSW_CT_PRODUCTAD='p';
global.ADEXEC_FLUSH_EVERY=15;global.ADEXEC_MAX_TRIES=3;global.ADEXEC_ABORT_AFTER=5;
let puts=[], dialogs=[], answer='OK', written=null;
const fakeRange={getValues:()=>rows.map(r=>r.slice()),setValues:v=>{written=v.map(x=>x[0]);}};
const fakeSheet={getLastRow:()=>N+1,getRange:()=>fakeRange};
global.getSheetOrThrow_=()=>fakeSheet;
let MODE=null;
global.PropertiesService={getScriptProperties:()=>({getProperty:()=>MODE,setProperty:(k,v)=>{MODE=v;},deleteProperty:()=>{}})};
global.ScriptApp={getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({after:()=>({create:()=>{}})})})};
global.Utilities={sleep:()=>{}};global.log_=()=>{};global.toast_=()=>{};global.showSheet_=()=>{};
global.adBusyGuard_=()=>true;
global.ui_=()=>({alert:(t,b,set)=>{dialogs.push([t,b]);return set==='OKC'?(answer==='OK'?'OK':'CANCEL'):'OK';},
  ButtonSet:{OK:'OK',OK_CANCEL:'OKC'},Button:{OK:'OK',CANCEL:'CANCEL'}});
global.adsToken_=()=>'t';
global.adsApiRetry_=(t,m,p,b)=>{
  if(p==='/sp/campaigns'){puts.push(b.campaigns[0].state);return {campaigns:{success:[{campaignId:'x'}]}};}
  if(p==='/sp/adGroups')return {adGroups:{success:[{adGroupId:'x'}]}};
  if(p==='/sp/productAds/list')return {productAds:[{adId:'a1',state:'?'}]};
  return {productAds:{success:[{adId:'a1'}]}};};
global.adsCreated_=(r,k,f)=>{const b=(r&&r[k])||{};return b.success?{ok:true,ids:b.success.map(x=>String(x[f]||''))}:{ok:false,ids:[],msg:'e'};};
global.adErrorText_=s=>s;global.adTriesOf_=()=>0;global.adAbortRun_=()=>{};
global.adLogBuffer_=()=>({push:()=>{},flush:()=>{}});global.adLogRow_=o=>[o];
const src=fs.readFileSync('72J_광고실행.js','utf8');
eval(src.match(/var ADENABLE_CONTINUE_HANDLER[\s\S]*$/m)[0]);

for(const [label,fn] of [['켜기',enableApprovedCampaigns],['승인대로',syncCampaignsToApproval],['전부 멈추기',pauseAllCampaigns]]){
  puts=[];dialogs=[];MODE=null;
  fn();
  const on=puts.filter(x=>x==='ENABLED').length, off=puts.filter(x=>x==='PAUSED').length;
  console.log('── '+label+' ──');
  console.log('   캠페인 PUT: ENABLED '+on+' · PAUSED '+off);
  console.log('   창 제목: '+dialogs.map(d=>d[0]).join(' → '));
  if(dialogs.length && /바꿀 것이 없습니다/.test(dialogs[0][0]))
     console.log('   안내문:\n'+dialogs[0][1].split('\n').map(l=>'      '+l).join('\n'));
  console.log();
}
