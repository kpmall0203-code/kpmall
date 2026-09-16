const fs=require('fs');
global.ADWATCH_DAYS=7; global.ADWATCH_MIN_DAYS=3;
global.pct1_=x=>(x*100).toFixed(1)+'%';
global.daysBetween_=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000);
const src=fs.readFileSync('72N.js','utf8');
eval(src.match(/function adWatchVerdict_[\s\S]*?\n}/)[0]);
const F='2026-08-28', T='2026-09-03';
const C={approved:true,daily:400}, ON={state:'ENABLED'};
const P=(im,ck,cost,sales,ord)=>({im,ck,cost,sales,ord});
const cases=[
 ['오늘 켬 (기간 뒤)',      C,ON,P(0,0,0,0,0),  '2026-09-04'],
 ['기간 끝날 켬 (1일)',     C,ON,P(0,0,0,0,0),  '2026-09-03'],
 ['기간 중 켬 (4일)',       C,ON,P(0,0,0,0,0),  '2026-08-31'],
 ['오래 켬 · 노출 0',       C,ON,P(0,0,0,0,0),  '2026-08-01'],
 ['오래 켬 · 안 팔림',      C,ON,P(900,60,500,0,0),'2026-08-01'],
 ['오래 켬 · 손해',         C,ON,P(900,60,1000,5000,4),'2026-08-01'],
 ['기간 중 켬 · 손해(4일)', C,ON,P(900,60,1000,5000,4),'2026-08-31'],
 ['대장 기록 없음',         C,ON,P(0,0,0,0,0),  ''],
 ['미승인 켜짐 (오늘 켬)',  {approved:false,daily:400},ON,P(0,0,0,0,0),'2026-09-04'],
 ['예산 초과 (오늘 켬)',    {approved:true,daily:10},ON,P(9,9,900,0,0),'2026-09-04'],
];
for(const [n,c,l,p,s] of cases){
  const d=adWatchVerdict_(c,l,p,0.17,s,F,T);
  console.log('  '+n.padEnd(24)+' → '+d.v.padEnd(16)+' | '+(d.fix==='PAUSE'?'멈춤 ':'    ')+String(d.why).slice(0,70));
}
