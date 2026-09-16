// 72V 광고통계 — 프로그램별 광고비·매출·TACOS 표와 요약, 하루치 판매 자동 걸기
const fs=require('fs'); const A=__dirname + '/../../apps-script/';
const src=fs.readFileSync(A+'72V_광고통계.gs','utf8');
let props={}, log=[], out=[];
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]==null?null:props[k], setProperty:(k,v)=>{props[k]=String(v);}, deleteProperty:k=>{delete props[k];}})};
global.log_=(a,b,c)=>log.push(c); global.toast_=()=>{}; global.showSheet_=()=>{}; global.fmtYen_=n=>'¥'+Math.round(n);
global.ui_=()=>({alert:(t,m)=>out.push(m), ButtonSet:{OK:1}});
global.ymd_=d=>d.toISOString().substring(0,10);
global.addDays_=(d,n)=>{const x=new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().substring(0,10);};
global.daysBetween_=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000);
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.adSpendMature_=(d,t)=>daysBetween_(d,t)>=16;
global.adYmd_=x=>x instanceof Date?ymd_(x):String(x==null?'':x).substring(0,10);
global.countKeys_=o=>Object.keys(o).length;
global.AP_RESULT=19; global.AP_CID=20; global.AP_TRACK=22; global.AP_SKUS=16;
global.SL_FROM=0; global.SL_TO=1; global.SL_SKU=2; global.SL_AMT=5;
global.Date=class extends Date{ constructor(...a){ super(...(a.length?a:['2026-09-14T03:00:00Z'])); } };
// 자료: 원장 3일, 캠페인 c1(N) c2(B) c3(A) c9(밖)
global.adSpendRead_=()=>({has:true,last:'2026-09-12',rows:[
  {d:'2026-09-10',cid:'c1',cost:100,sales:300,ord:1},{d:'2026-09-10',cid:'c2',cost:200,sales:0,ord:0},{d:'2026-09-10',cid:'c3',cost:300,sales:900,ord:2},{d:'2026-09-10',cid:'c9',cost:50,sales:0,ord:0},
  {d:'2026-09-11',cid:'c1',cost:110,sales:0,ord:0},{d:'2026-09-11',cid:'c3',cost:310,sales:600,ord:1},
  {d:'2026-09-12',cid:'c1',cost:120,sales:240,ord:1},{d:'2026-09-12',cid:'c2',cost:220,sales:440,ord:1},{d:'2026-09-12',cid:'c3',cost:320,sales:0,ord:0}]});
global.adWatchOurs_=()=>[{cid:'c1',track:'N'},{cid:'c2',track:'B'},{cid:'c3',track:'X'}];
const plan=[]; const mk=(cid,track,skus)=>{const r=new Array(22).fill(''); r[18]='성공'; r[19]=cid; r[21]=track; r[15]=skus; return r;};
plan.push(mk('c1','N','S1'), mk('c2','B','S2, S3'), mk('c3','X','S3, S4'));
global.adPlanEachRow_=fn=>plan.forEach(r=>fn(r,null,2,'계획'));
global.adPlanSkus_=r=>String(r[15]).split(/\s*,\s*/).filter(Boolean);
global.adUnitMap_=()=>({S5:{ads:[{cid:'c9'}]}, S1:{ads:[{cid:'c1'}]}});
// 판매실적: 9/10 리포트(세션 있음) · 9/11 Sales API 상위만(세션 '') · 9/12 없음
global.salesTable_=()=>[
  ['2026-09-10','2026-09-10','S1','',1,1000,'3','4','100'], ['2026-09-10','2026-09-10','S2','',1,2000,'0','0','0'],
  ['2026-09-10','2026-09-10','S4','',1,3000,'1','1','0'], ['2026-09-10','2026-09-10','S5','',1,500,'0','0','0'],
  ['2026-09-10','2026-09-10','ORG','',1,4000,'0','0','0'],
  ['2026-09-11','2026-09-11','S1','',1,999,'','',''], ['2026-08-01','2026-08-31','S1','',9,9999,'5','5','100']];
let tables={}; const fakeSheet=name=>({getName:()=>name, getRange:()=>({setNumberFormat:()=>{},setValues:()=>{},setFontWeight:()=>({setFontSize:()=>{},setBackground:()=>({setFontColor:()=>{}})}),setBackground:()=>{}}), setFrozenColumns:()=>{}, getCharts:()=>[], removeChart:()=>{}, clear:()=>{}, setColumnWidth:()=>{}, newChart:()=>chartB(), insertChart:()=>{out.push('chart');}});
const chartB=()=>{const b={}; ['asComboChart','asLineChart','asColumnChart','addRange','setNumHeaders','setOption','setStacked','setPosition'].forEach(k=>b[k]=()=>b); b.build=()=>b; return b;};
global.ensureSheet_=name=>fakeSheet(name); global.writeTable_=(sh,h,rows)=>{tables[sh.getName()]={h,rows};};
global.salesQueue_=()=>JSON.parse(props.SALES_QUEUE||'[]'); global.PROP_SALES_QUEUE='SALES_QUEUE'; global.PROP_SALES_RANGE='SALES_RANGE';
global.salesScheduleContinue_=(m,s)=>out.push('trigger '+s); global.SpreadsheetApp={flush:()=>{}}; global.Utilities={sleep:()=>{}};
eval(src);
let fail=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fail++; };
const r=adStatBuild_({quiet:true});
const t=tables['광고통계']; const H=t.h; const row=d=>t.rows.find(x=>x[0]===d); const c=(r,p,k)=>r[H.indexOf(p+' '+k)];
ok(t.rows.length===3 && H.length===1+4*8+2, '표 3일 · 열 '+H.length);
const d10=row('2026-09-10');
ok(c(d10,'🆕 신규','광고비')===100 && c(d10,'🌱 키우기','광고비')===200 && c(d10,'🔁 기존','광고비')===350, '9/10 광고비 — 신규 100 · 키우기 200 · 기존 300+밖 50 ('+c(d10,'🔁 기존','광고비')+')');
ok(c(d10,'전체','광고비')===650 && c(d10,'전체','광고매출')===1200, '전체 650 / 광고매출 1200');
// SKU → 프로그램: S1 N · S2 B · S3 B(키우기 > 기존) · S4 A · S5 A(밖) · ORG 없음
ok(c(d10,'🆕 신규','매출')===1000 && c(d10,'🌱 키우기','매출')===2000 && c(d10,'🔁 기존','매출')===3500 && c(d10,'전체','매출')===10500,
   '9/10 매출 — 신규 1000 · 키우기 2000 · 기존 3500 · 전체 10500 (광고 안 하는 ORG 포함)');
ok(c(d10,'🆕 신규','TACOS%')===10 && c(d10,'🆕 신규','ACOS%')===33.3 && c(d10,'전체','TACOS%')===6.2, 'TACOS 신규 10% · ACOS 33.3% · 전체 6.2%');
ok(row('2026-09-11')[H.indexOf('매출자료')]==='' && c(row('2026-09-11'),'🆕 신규','매출')==='', 'Sales API 상위만 받은 날은 매출 자료 없음');
ok(c(row('2026-09-12'),'🆕 신규','TACOS 7일%')===10 && c(row('2026-09-12'),'🆕 신규','TACOS%')==='', 'TACOS 7일은 자료 있는 날만으로 (9/12 = 9/10 기준 10%)');
ok(d10[H.indexOf('성숙')]==='잠정', '최근 날은 잠정');
ok(r.sum.length===12 && r.sum[0][1]==='🆕 신규' && r.sum[0][2]===330 && r.sum[0][4]===1000 && r.sum[0][8]===1 && r.sum[0][9]===1, '요약 최근 7일 신규 — 광고비 330 · 매출 1000(자료 1일) · 캠페인 1');
ok(r.sum[1][2]===980 && r.sum[1][8]===2, '요약 기존 — 광고비 980 · 캠페인 2 (c3+c9)');
ok(out.filter(x=>x==='chart').length===15, '그래프 전체 6 + 프로그램 3×3 = 15 ('+out.filter(x=>x==='chart').length+')');
ok(c(d10,'🆕 신규','클릭')===0 && c(d10,'🔁 기존','광고주문')===2, '클릭·광고주문 칸');
ok(r.camps.A.length===2 && r.camps.A[0][0]==='c3' && r.camps.A[0][1]===930 && r.camps.B[0][6]===2, '캠페인별 30일 — 기존 2개(c3 930 먼저) · 키우기 c2 2일');
// 탭 하나가 죽어도 나머지는 만든다
let boom=0; const es=global.ensureSheet_; global.ensureSheet_=n=>{ if(n==='📈 기존'){ boom++; throw new Error('스프레드시트 서비스가 타임아웃'); } return es(n); }; out=[]; log=[];
const r2=adStatBuild_({quiet:true}); global.ensureSheet_=es;
ok(boom===2 && r2.failed.join()==='📈 기존' && out.filter(x=>x==='chart').length===12, '기존 탭만 두 번 실패 · 나머지 12 그래프는 만듦 · failed='+r2.failed);
// 하루치 판매 자동
props={}; out=[];
let m=salesDailyAuto_();
ok(props.SALES_QUEUE==='["2026-09-09|2026-09-09","2026-09-11|2026-09-11","2026-09-12|2026-09-12"]' && out[0]==='trigger 60', '빠진 날만(9/10 은 있음), 그제(9/12)까지, 최근 3일: '+props.SALES_QUEUE+' — '+m);
props={SALES_QUEUE:'["x|y"]'}; ok(/도는 중/.test(salesDailyAuto_()), '사람이 돌리는 중이면 건너뜀');
console.log(fail?'\n✗ 실패 '+fail:'\n✓ 전부 통과'); process.exit(fail?1:0);
