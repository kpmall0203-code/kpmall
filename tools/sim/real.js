const fs=require('fs');
let call={setValues:0,getRange:0,setValue:0,flush:0}, puts=[];
const rows=JSON.parse(fs.readFileSync('realrows.json','utf8'));
const N=rows.length, HDRLEN=20;
global.ADPLAN_HEADER=new Array(HDRLEN).fill('x');
global.AP_ACTION=2;global.AP_NAME=4;global.AP_DAILY=6;global.AP_BID=7;
global.AP_SKUS=16;global.AP_GID=17;global.AP_APPROVE=18;global.AP_RESULT=19;global.AP_CID=20;
global.SHEET_ADPLAN='p';global.ADS_SOFT_MS=4*60*1000;global.ADEXEC_ADS_BATCH=100;
global.ADSW_CT_CAMPAIGN='c';global.ADSW_CT_ADGROUP='g';global.ADSW_CT_PRODUCTAD='p';
global.ADEXEC_FLUSH_EVERY=15;global.ADEXEC_MAX_TRIES=3;global.ADEXEC_ABORT_AFTER=5;
let written=null;
const fakeRange={getValues:()=>rows.map(r=>r.slice()),
  setValues:v=>{call.setValues++;written=v.map(x=>x[0]);},setValue:()=>{call.setValue++;}};
const fakeSheet={getLastRow:()=>N+1,getRange:()=>{call.getRange++;return fakeRange;}};
global.getSheetOrThrow_=()=>fakeSheet;
global.SpreadsheetApp={flush:()=>{call.flush++;}};
let MODE='SYNC';
global.PropertiesService={getScriptProperties:()=>({getProperty:()=>MODE,setProperty:()=>{},deleteProperty:()=>{}})};
global.ScriptApp={getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({after:()=>({create:()=>{}})})})};
global.Utilities={sleep:()=>{}};global.log_=()=>{};global.toast_=()=>{};global.showSheet_=()=>{};
global.ui_=()=>({alert:()=>1,ButtonSet:{OK:1},Button:{OK:1}});
global.adsToken_=()=>'t';
global.adsApiRetry_=(t,m,p,b)=>{
  if(p==='/sp/campaigns'){puts.push(['campaign',b.campaigns[0].campaignId,b.campaigns[0].state]);return {campaigns:{success:[{campaignId:'x'}]}};}
  if(p==='/sp/adGroups')return {adGroups:{success:[{adGroupId:'x'}]}};
  if(p==='/sp/productAds/list')return {productAds:[{adId:'a1',state:'?'}]};
  return {productAds:{success:[{adId:'a1'}]}};};
global.adsCreated_=(r,k,f)=>{const b=(r&&r[k])||{};return b.success?{ok:true,ids:b.success.map(x=>String(x[f]||''))}:{ok:false,ids:[],msg:'e'};};
global.adErrorText_=s=>s;global.adTriesOf_=()=>0;global.adAbortRun_=()=>{};
global.adLogBuffer_=()=>({push:()=>{},flush:()=>{}});global.adLogRow_=o=>[o];
eval(fs.readFileSync('72J_광고실행.js','utf8').split('/** 메뉴: 만든 캠페인 켜기 / 멈추기 */')[0].split('// ── 만든 캠페인 켜기')[1] ? '' : '');
const src=fs.readFileSync('72J_광고실행.js','utf8');
eval(src.match(/var ADENABLE_CONTINUE_HANDLER[\s\S]*$/m)[0].replace(/function toggleCreatedCampaigns\(\)[\s\S]*?\n}\n\n/,''));

// 승인 칸을 '2개만 TRUE' 로 바꿔 놓고 SYNC 를 돌린다
const KEEP=['KP B0F27TS83P','KP B0DJ8M77H6'];
for(const r of rows) r[AP_APPROVE-1] = KEEP.includes(String(r[AP_NAME-1])) ? true : false;

MODE='SYNC';
console.log('결과:', adEnableStep_(false));
const on=puts.filter(p=>p[2]==='ENABLED'), off=puts.filter(p=>p[2]==='PAUSED');
console.log('캠페인 PUT: ENABLED',on.length,'· PAUSED',off.length);
console.log('시트 호출:',JSON.stringify(call));
// 결과 칸 검증
let bad=[];
rows.forEach((r,i)=>{
  if(!String(r[AP_RESULT-1]).startsWith('성공'))return;
  const want = KEEP.includes(String(r[AP_NAME-1]))?'· 켬':'· 멈춤';
  const got = written?written[i]:r[AP_RESULT-1];
  if(!String(got).includes(want)) bad.push([r[AP_NAME-1],want,got]);
});
console.log('결과 칸이 틀린 줄:', bad.length?bad:'없음');
console.log('\n켠 캠페인 이름:', rows.filter(r=>KEEP.includes(String(r[AP_NAME-1]))).map(r=>r[AP_NAME-1]));
