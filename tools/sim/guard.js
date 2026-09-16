const fs=require('fs');
let alerted=[], deleted=[];
global.ui_=()=>({alert:(a,b,c)=>{alerted.push(a);return 1;},
  ButtonSet:{OK:1,YES_NO_CANCEL:2}, Button:{YES:1,NO:2,CANCEL:3,OK:1}});
global.log_=()=>{}; global.notifyAlert_=()=>{}; global.Utilities={sleep:()=>{}};
global.PROP_ADKW_QUEUE='K'; global.PROP_ADS_QUEUE='S'; global.PROP_ADTERM_QUEUE='T';
let locked=false;
global.LockService={getScriptLock:()=>({tryLock:ms=>!locked, releaseLock:()=>{}})};
const trig=['continueAdEnable','continueSync','onOpen','dailyPriceRun','continueAdTerms'];
global.ScriptApp={getProjectTriggers:()=>trig.map(f=>({getHandlerFunction:()=>f})),
  deleteTrigger:t=>deleted.push(t.getHandlerFunction()),
  newTrigger:()=>({timeBased:()=>({after:()=>({create:()=>{}})})})};
global.PropertiesService={getScriptProperties:()=>({getProperty:()=>null,deleteProperty:()=>{},setProperty:()=>{}})};
global.adsApi_=()=>({}); global.ADS_RETRY_WAITS=[];
eval(fs.readFileSync('72K_광고상태.js','utf8'));

locked=false; console.log('잠기지 않았을 때 통과:', adBusyGuard_('테스트')===true);
locked=true;  console.log('잠겼을 때 막힘   :', adBusyGuard_('테스트')===false, '| 알림:', alerted.length===1);

deleted=[];
stopAllContinuations();
console.log('지운 트리거:', deleted);
console.log('continue* 만 지움:', deleted.every(f=>f.indexOf('continue')===0) && deleted.length===3);
