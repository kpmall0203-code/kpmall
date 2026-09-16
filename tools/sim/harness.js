// 배포된 소스로 켜기 한 바퀴를 흉내내 시트 호출 횟수를 센다
let call = {setValues:0, getRange:0, setValue:0, flush:0, api:0};
const N = 86;                       // 계획 줄 수
const HDRLEN = 20;
global.ADPLAN_HEADER = new Array(HDRLEN).fill('x');
global.AP_ACTION=2; global.AP_NAME=4; global.AP_DAILY=6; global.AP_BID=7;
global.AP_SKUS=16; global.AP_GID=17; global.AP_APPROVE=18; global.AP_RESULT=19; global.AP_CID=20;
global.SHEET_ADPLAN='광고생성계획';
global.ADS_SOFT_MS = 4*60*1000;
global.ADEXEC_ADS_BATCH = 100;
global.ADSW_CT_CAMPAIGN='c'; global.ADSW_CT_ADGROUP='g'; global.ADSW_CT_PRODUCTAD='p';
global.ADLOG_HEADER=['일시','요약','종류','캠페인','광고그룹','SKU','ASIN','대상','항목','전','후','사유','실행','결과','캠페인ID','광고그룹ID','대상ID'];
global.ADLOG_ID_COLS=[15,16,17]; global.ADLOG_RESULT_COL=14; global.SHEET_ADLOG='광고변경대장';

const rows = [];
for (let i=0;i<N;i++){ const r=new Array(HDRLEN).fill('');
  r[AP_ACTION-1]='생성'; r[AP_NAME-1]='KP T'+i; r[AP_DAILY-1]=200;
  r[AP_GID-1]='g'+i; r[AP_CID-1]='c'+i; r[AP_RESULT-1]='성공 · 상품 3개'; rows.push(r); }

const fakeRange = { getValues:()=>rows.map(r=>r.slice()),
  setValues:v=>{call.setValues++;}, setValue:v=>{call.setValue++;},
  setNumberFormat:()=>fakeRange, setHorizontalAlignment:()=>fakeRange, setFontWeight:()=>fakeRange,
  setBackground:()=>fakeRange, setValuesAsText:()=>fakeRange };
const fakeSheet = { getLastRow:()=>N+1, getLastColumn:()=>HDRLEN, getMaxRows:()=>100000, getFrozenRows:()=>1, getDataRange:()=>fakeRange, getMaxColumns:()=>HDRLEN,
  getRange:(...a)=>{call.getRange++;return fakeRange;}, getName:()=>'x',
  setFrozenRows:()=>{}, insertRowsAfter:()=>{}, appendRow:()=>{call.setValues++;} };
global.getSheetOrThrow_=()=>fakeSheet;
global.ensureSheet_=()=>fakeSheet;
global.ss_=()=>({getSheetByName:()=>fakeSheet, insertSheet:()=>fakeSheet});
global.SpreadsheetApp={flush:()=>{call.flush++;}, getActive:()=>({}) };
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>k==='ADENABLE_TO'?'ENABLED':null,
  setProperty:()=>{}, deleteProperty:()=>{}})};
global.ScriptApp={getProjectTriggers:()=>[], newTrigger:()=>({timeBased:()=>({after:()=>({create:()=>{}})})})};
global.Utilities={sleep:()=>{}, formatDate:()=>'2026-09-04'};
global.Session={getScriptTimeZone:()=>'Asia/Tokyo'};
global.log_=()=>{}; global.toast_=()=>{}; global.showSheet_=()=>{}; global.notifyAlert_=()=>{};
global.ui_=()=>({alert:()=>'ok', ButtonSet:{OK:1,YES_NO_CANCEL:2}, Button:{YES:1,OK:1}});
global.headerNotes_=()=>{};
global.setColWidths_=()=>{};
global.writeTable_=(sh,h,r)=>{call.setValues++;};
global.adsToken_=()=>'tok';
global.adsApiRetry_=(t,m,p,b)=>{ call.api++;
  if (p==='/sp/productAds/list') return {productAds:[{adId:'a1',state:'PAUSED'},{adId:'a2',state:'PAUSED'}]};
  if (p==='/sp/campaigns') return {campaigns:{success:[{campaignId:'c'}]}};
  if (p==='/sp/adGroups') return {adGroups:{success:[{adGroupId:'g'}]}};
  return {productAds:{success:[{adId:'a1'},{adId:'a2'}]}}; };
global.adsCreated_=(r,k,f)=>{const b=(r&&r[k])||{}; return b.success?{ok:true,ids:b.success.map(x=>String(x[f]||''))}:{ok:false,ids:[],msg:'err'};};
global.adErrorText_=s=>s; global.adTriesOf_=()=>0; global.adAbortRun_=()=>{};
global.ADEXEC_MAX_TRIES=3; global.ADEXEC_ABORT_AFTER=5;
global.adBusyGuard_=()=>true;
global.getSheetOrThrow_=()=>fakeSheet;

const fs=require('fs');
eval(fs.readFileSync('72F_광고대장.js','utf8'));
eval(fs.readFileSync('72J_광고실행.js','utf8'));

const msg = adEnableStep_(false);
console.log('결과:', msg);
console.log('줄 수:', N);
console.log('시트 호출 총계:', JSON.stringify(call));
console.log('한 줄당 getRange:', (call.getRange/N).toFixed(2),
            '| 한 줄당 setValues:', (call.setValues/N).toFixed(2),
            '| flush:', call.flush);
