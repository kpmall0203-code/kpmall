// 팔리는데 아직 안 익은 것 — 판돈으로 안 멈추고 성숙대기 · 멈췄던 것은 다시 켠다
const fs=require('fs'); const A=__dirname+'/../../apps-script/';
const s78=fs.readFileSync(A+'78_신규광고.gs','utf8'), s78E=fs.readFileSync(A+'78E_신규광고_주기.gs','utf8');
function fn(src,name){ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('no '+name); let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.substring(i,k+1);} } }
function vars(src){ const out=[]; const re=/^var (NA_|NAS_|NAA_|NAR_)[\s\S]*?;/gm; let m; while((m=re.exec(src))) out.push(m[0].replace(/\/\/.*$/gm,'')); return out.join('\n'); }
eval(vars(s78)); eval(vars(s78E));
global.NA_LISTING_OK={active:1}; global.NA_MIN_BID=2;
global.daysBetween_=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000); global.adSpendMature_=(d,t)=>daysBetween_(d,t)>=16;
global.adYmd_=x=>String(x||'').substring(0,10); global.naPlusDays_=(y,n)=>{const d=new Date(y+'T00:00:00');d.setDate(d.getDate()+Number(n||0));return d.toISOString().substring(0,10);}; global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2; global.adMarginFor_=()=>({pct:21.1});
global.naQOf_=(o,pol)=>pol.q0; global.naExpandReady_=()=>true; global.naRecent_=()=>({days:0,im:0,ck:0});
global.NA_LOWEXP_DAYS=3; global.NA_LOWEXP_IM=300; global.NA_LOWEXP_CK=5; global.NA_RAISE_PCT=0.15; global.NA_RAISE_EVERY_D=3; global.NA_DEAD_IM=1000; global.NA_DEAD_CK=0;
for (const n of ['naDecide_','naPotUpdate_','naResume_']) eval(fn(s78E,n));
const pol={q0:0.02,beta:1,maxBid:100,famPot:1000,famMult:1,handClicks:50,handOrders:3,handover:true,keepOrders:2,probeDays:14,cooldown:28};
const today='2026-09-21';
const mk=(sku,fam,state,G,pct)=>{ const r=new Array(27).fill(''); r[NA_I_SKU]=sku; r[NA_I_FAM]=fam; r[NA_I_STATE]=state; r[NA_I_G]=G; r[NA_I_MPCT]=pct; r[NA_I_PRICE]=2900; r[NA_I_Q]=2; r[NA_I_BID]=12; r[NA_I_GID]='g'; return r; };
const famRow=(k,pot,state,why,cool)=>{ const f=new Array(15).fill(''); f[NA_F_KEY]=k; f[NA_F_POT]=pot; f[NA_F_STATE]=state; f[NA_F_WHY]=why||''; f[NA_F_COOL]=cool||''; return f; };
const L={state:'Active',stock:5,price:2900};
let fail=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fail++; };
// 상황 1: IMINT — 8건 ¥32,535 팔았는데 안 익음 · 광고비 719 > 판돈 612
let rows=[mk('HOT','F1',NAS_PROBE,612,21.1)], fams=[famRow('F1',612,NAS_PROBE)], famAt={F1:0};
let perf={bySku:{HOT:{cost:719,sales:32535,im:5000,ck:66,od:8,mCost:0,mSales:0,mIm:0,mCk:0,mOd:0,days:{},first:'2026-09-14',last:'2026-09-20'}}};
let fx=naPotUpdate_(rows,fams,famAt,perf,{});
ok(fx.F1.od===8 && fx.F1.pRisk===0, '잠정 위험손실 0 (매출×마진 6,865 > 광고비 719)');
ok(Number(fams[0][NA_F_LEFT])===612, '남은 판돈 = 판돈 − 잠정 손실 = 612 ('+fams[0][NA_F_LEFT]+')');
let d=naDecide_(rows[0],fams[0],perf.bySku.HOT,L,{},pol,today,fx.F1);
ok(!d.stop && d.state===NAS_MATURE && /익을 때까지/.test(d.why), '멈추지 않고 성숙대기: '+d.why.substring(0,60));
// 상황 2: 안 익었고 팔리긴 하는데 잠정으로도 손실이 판돈을 넘는다 → 멈춤
perf={bySku:{HOT:{cost:1500,sales:1000,im:9000,ck:200,od:1,mCost:0,mSales:0,mIm:0,mCk:0,mOd:0,days:{},first:'2026-09-14',last:'2026-09-20'}}};
fams=[famRow('F1',612,NAS_PROBE)]; fx=naPotUpdate_(rows,fams,famAt,perf,{});
d=naDecide_(rows[0],fams[0],perf.bySku.HOT,L,{},pol,today,fx.F1);
ok(d.stop && /잠정 손실로도/.test(d.why), '잠정 손실 1,289 > 판돈 612 → 멈춤');
// 상황 3: 주문 0 인 채로 판돈 초과 → 예전처럼 멈춤
perf={bySku:{HOT:{cost:700,sales:0,im:9000,ck:90,od:0,mCost:0,mSales:0,mIm:0,mCk:0,mOd:0,days:{},first:'2026-09-14',last:'2026-09-20'}}};
fams=[famRow('F1',612,NAS_PROBE)]; fx=naPotUpdate_(rows,fams,famAt,perf,{});
d=naDecide_(rows[0],fams[0],perf.bySku.HOT,L,{},pol,today,fx.F1);
ok(d.stop && /다 썼습니다/.test(d.why), '주문 0 · 판돈 초과 → 멈춤 (그대로)');
// 상황 4: 멈춰 있던 IMINT 를 다시 켠다 (냉각 10/19 인데도)
rows=[mk('HOT','F1',NAS_STOP,612,21.1)]; fams=[famRow('F1',612,NAS_COOL,'상품군 판돈 ¥612 을 다 썼습니다 (누적 ¥719 · 위험손실 ¥719) — 멈춥니다','2026-10-19')];
perf={bySku:{HOT:{cost:719,sales:32535,im:5000,ck:66,od:8,mCost:0,mSales:0,mIm:0,mCk:0,mOd:0,days:{},first:'2026-09-14',last:'2026-09-20'}}};
fx=naPotUpdate_(rows,fams,famAt,perf,{});
let rs=naResume_(rows[0],fams[0],L,{},pol,today,perf.bySku.HOT,fx.F1);
ok(rs.resume && rs.mature && /다시 켜고/.test(rs.why), '판돈으로 멈춘 잘 팔리는 것 → 다시 켬 (성숙대기)');
// 상황 5: 리스팅 Inactive 로 멈춘 것은 이 길로 안 켠다
fams=[famRow('F1',612,NAS_STOP,'리스팅 상태가 "Inactive" 입니다','')];
rs=naResume_(rows[0],fams[0],{state:'Inactive',stock:5,price:2900},{},pol,today,perf.bySku.HOT,fx.F1);
ok(!rs.resume, '보호로 멈춘 것은 원인이 남아 있으면 안 켠다');
// 상황 6: 탐색 14일이 끝났는데 주문 0 (도는 광고라 어제 실적이 있어도) → 멈춤 (2026-09-28 고침)
rows=[mk('OLD','F2',NAS_PROBE,600,21.1)]; rows[0][NA_I_START]='2026-09-04'; fams=[famRow('F2',600,NAS_PROBE)]; famAt={F1:0,F2:0};
perf={bySku:{OLD:{cost:120,sales:0,im:3000,ck:15,od:0,mCost:60,mSales:0,mIm:1500,mCk:8,mOd:0,days:{},first:'2026-09-11',last:'2026-09-20'}}};
fx=naPotUpdate_(rows,fams,famAt,perf,{});
d=naDecide_(rows[0],fams[0],perf.bySku.OLD,L,{},pol,today,fx.F2);
ok(d.stop && d.tag===NAR_EXPIRED && d.cool===28, '시작 9/4 · 오늘 9/21 · 주문 0 → 탐색 만료 멈춤 (냉각 28): '+String(d.why).substring(0,50));
// 상황 6b: 실적 첫날(9/11)로 세면 10일이라 안 걸리던 것 — [시작일] 이 비면 예전처럼 실적 첫날
rows[0][NA_I_START]=''; d=naDecide_(rows[0],fams[0],perf.bySku.OLD,L,{},pol,today,fx.F2);
ok(!d.stop, '   [시작일] 이 비면 실적 첫날로 센다 (9/11 → 10일 · 아직)');
// 상황 7: 탐색은 끝났는데 잠정 주문이 있다 → 안 멈추고 성숙대기
rows=[mk('SEL','F2',NAS_PROBE,600,21.1)]; rows[0][NA_I_START]='2026-09-04'; fams=[famRow('F2',600,NAS_PROBE)];
perf={bySku:{SEL:{cost:200,sales:5000,im:3000,ck:40,od:2,mCost:100,mSales:0,mIm:1500,mCk:20,mOd:0,days:{},first:'2026-09-11',last:'2026-09-20'}}};
fx=naPotUpdate_(rows,fams,famAt,perf,{});
d=naDecide_(rows[0],fams[0],perf.bySku.SEL,L,{},pol,today,fx.F2);
ok(!d.stop && d.state===NAS_MATURE && /익을 때까지/.test(d.why), '탐색 만료 · 잠정 주문 2 → 성숙대기: '+String(d.why).substring(0,70));
// 상황 8: 노출이 한 번도 없는 채 14일 → 멈춤. 아직 14일 전이면 기다림
rows=[mk('NOIM','F2',NAS_PROBE,600,21.1)]; rows[0][NA_I_START]='2026-09-04';
d=naDecide_(rows[0],fams[0],null,L,{},pol,today,fx.F2);
ok(d.stop && d.tag===NAR_EXPIRED && /노출이 한 번도/.test(d.why), '실적 없이 14일 → 멈춤');
rows[0][NA_I_START]='2026-09-15'; d=naDecide_(rows[0],fams[0],null,L,{},pol,today,fx.F2);
ok(!d.stop && /기다립니다/.test(d.why), '   14일 전이면 기다린다');
// 상황 9: 탐색 기간이 다 익었고(시작 8/20) 성숙 손해 → 멈춤. 성숙 이익이면 관찰
rows=[mk('LOSS','F2',NAS_MATURE,600,21.1)]; rows[0][NA_I_START]='2026-08-20';
perf={bySku:{LOSS:{cost:900,sales:1000,im:9000,ck:150,od:1,mCost:900,mSales:1000,mIm:9000,mCk:150,mOd:1,days:{},first:'2026-08-20',last:'2026-09-20'}}};
fams=[famRow('F2',5000,NAS_MATURE)]; fx=naPotUpdate_(rows,fams,famAt,perf,{});
d=naDecide_(rows[0],fams[0],perf.bySku.LOSS,L,{},pol,today,fx.F2);
ok(d.stop && d.tag===NAR_LOSS, '탐색 기간이 익었고 성숙 손해 → 멈춤: '+String(d.why).substring(0,40));
// 상황 10: 탐색 만료로 멈춘 것에 늦은 주문이 붙으면 다시 켠다
rows=[mk('LATE','F2',NAS_STOP,600,21.1)]; fams=[famRow('F2',600,NAS_COOL,'탐색 14일 이 끝났는데 주문이 0 입니다 (클릭 15 · 광고비 ¥120) — 멈추고 28일 뒤 다시 봅니다','2026-10-19')];
perf={bySku:{LATE:{cost:120,sales:2900,im:3000,ck:15,od:1,mCost:0,mSales:0,mIm:0,mCk:0,mOd:0,days:{},first:'2026-09-11',last:'2026-09-20'}}};
fx=naPotUpdate_(rows,fams,famAt,perf,{});
rs=naResume_(rows[0],fams[0],L,{},pol,today,perf.bySku.LATE,fx.F2);
ok(rs.resume && rs.mature && /탐색 만료로/.test(rs.why), '탐색 만료로 멈춘 것에 늦은 주문 → 다시 켬 (성숙대기)');
console.log(fail?'\n✗ 실패 '+fail:'\n✓ 전부 통과'); process.exit(fail?1:0);
