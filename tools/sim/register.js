// 승격 반반 시험 등록 — 만들어진 두 편을 시험 표에 올리고, 14일 뒤 시험편을 되돌린다 (72AH · 72AE)
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;},
  insertCheckboxes(){return this;}, setNumberFormat(){return this;}
});
const mkSheet=name=>({ getName:()=>name, getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1, getMaxRows:()=>1000, insertRowsAfter(){},
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc) });
const sheets={};
global.ss_=()=>({getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null});
global.makeOneSheet_=specs=>{const n=specs[0].name; if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.log_=()=>{}; global.ui_=()=>({alert(){},ButtonSet:{OK:1}}); global.SpreadsheetApp={flush(){}};
let today='2026-09-10'; global.ymd_=()=>today;
global.addDays_=(y,n)=>{const d=new Date(y+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.adRowApproved_=v=>v===true||String(v).trim()==='O';
global.adErrorText_=s=>String(s); global.adLogBuffer_=()=>({push(){},flush(){}}); global.adLogRow_=o=>o;
global.adsToken_=()=>'T'; global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
let sent=[]; global.adJobSend_=(t,a,k,id,val)=>{sent.push({id:id,val:val});return {ok:true};};
global.hdrMap_=sh=>{const m={};(cells[sh.getName()][0]||[]).forEach((h,i)=>{m[String(h)]=i;});return m;};
global.cellOf_=(row,map,n,d)=>{const i=map[n];return i===undefined?d:(row[i]??d);};
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2; global.ADS_SOFT_MS=4*60*1000;
global.SHEET_ADS='광고실적'; global.EXPAND_WINDOW_DAYS=30;
global.ADS_HEADER=['날짜','SKU','ASIN','캠페인','광고비(JPY)','광고매출(JPY)','노출','클릭','광고주문','수집일시'];
global.adMarginCtx_=()=>({}); global.adMarginFor_=()=>({pct:20}); global.buildAdExpandResults=()=>'';
global.adSkuAsin_=()=>({S1:'B0S1',S2:'B0S2',S3:'B0S3',S4:'B0S4',S9:'B0S9'});
global.adExpandStartRow_=()=>'';
global.SHEET_ADPLAN='광고생성계획'; global.SHEET_EXPAND='광고확대후보'; global.SHEET_ADGRP='광고그룹'; global.SHEET_ADSTRUCT='광고구조';
global.ADGRP_HEADER=new Array(11).fill('x'); global.adSpendRead_=()=>null;
global.ADPLAN_HEADER=['계획ID','동작','방식','캠페인명','유형','일예산(JPY)','입찰(JPY)','SKU수','기존SKU수','대표SKU','CPC구간','손익분기CPA(JPY)','월매출합(JPY)','기존광고제거','근거','SKU목록','광고그룹ID','승인','결과','캠페인ID','광고ID들','트랙'];
global.AP_NAME=4; global.AP_DAILY=6; global.AP_BID=7; global.AP_SKUS=16; global.AP_GID=17; global.AP_APPROVE=18; global.AP_RESULT=19; global.AP_CID=20; global.AP_TRACK=22;
global.adSkuListSplit_=t=>String(t||'').split('|').map(x=>x.trim()).filter(Boolean);
global.adPlanSkus_=r=>{const l=String(r[AP_SKUS-1]||'').trim(),p=String(r[9]||'').trim();return (l&&p&&l===p)?[l]:adSkuListSplit_(l);};
global.adPlanRow_=()=>[]; global.adPromoBand_=()=>null;
let basis={'확대 · 모드':'자동운영','확대 · 최대 유효입찰(JPY)':100,'일예산 여유 배수':2};
global.adBasis_=()=>basis;
eval(fs.readFileSync('all/72AF_확대결과.js','utf8'));
eval(fs.readFileSync('all/72AB_확대후보.js','utf8'));
eval(fs.readFileSync('all/72AE_확대시험.js','utf8'));
eval(fs.readFileSync('all/72AH_승격.js','utf8'));

function plan(name,bid,daily,skus,gid,res,track){ const r=new Array(ADPLAN_HEADER.length).fill('');
  r[AP_NAME-1]=name; r[AP_BID-1]=bid; r[AP_DAILY-1]=daily; r[AP_SKUS-1]=skus.join(' | ');
  r[AP_GID-1]=gid; r[AP_RESULT-1]=res; r[AP_TRACK-1]=track===undefined?'X':track; r[AP_APPROVE-1]=true; return r; }
cells['광고생성계획']=[ADPLAN_HEADER,
  plan('KP EXPAND B5',7,600,['S1'],'G1','성공 · 상품 1개'),          // 대조편
  plan('KP EXPAND B5T',10,1800,['S2','S3'],'G2','성공 · 상품 2개'),  // 시험편
  plan('KP EXPAND B3',3,100,['S4'],'G3','성공 · 상품 1개'),          // 짝 없음 — 값 그대로 옮긴 것
  plan('KP EXPAND B4T',11,300,['S9'],'','',''),                       // 아직 안 만들어짐 · 트랙도 없음
  plan('KP GROW B0X',20,300,['S9'],'G9','성공','B')];                 // 트랙 B 줄 — 남의 것
cells['광고실적']=[ADS_HEADER];

// ── 1) 두 편이 다 만들어진 가격선만 올린다 ──────────────
let r=adPromoteRegister_();
const T=()=> (cells[SHEET_EXTEST]||[]).slice(1);
ok(r.test===2 && r.ctrl===1, '시험편 2 · 대조편 1 을 올린다 ('+JSON.stringify(r)+')');
ok(T().length===3, '   시험 표에 3줄 ('+T().length+')');
const by={}; T().forEach(x=>{by[x[XT_SKU]]=x;});
ok(by.S1[XT_ARM]===XARM_CTRL && by.S1[XT_FROM]===7 && by.S1[XT_TO]===7 && by.S1[XT_RID]==='G1',
   '   대조편 S1: ¥7 → ¥7 · 그룹 G1 ('+by.S1[XT_FROM]+'→'+by.S1[XT_TO]+')');
ok(by.S2[XT_ARM]===XARM_TEST && by.S2[XT_FROM]===7 && by.S2[XT_TO]===10 && by.S2[XT_RID]==='G2',
   '   시험편 S2: 시험전값은 대조편 값 ¥7 · 시험값 ¥10 · 그룹 G2');
ok(by.S2[XT_TYPE]===XTYPE_PROMO && by.S2[XT_STATE]===XS_RUN && by.S2[XT_RUNFROM]===today && by.S2[XT_RUNTO]==='2026-09-24',
   '   유형 승격 · 상태 시험중 · 운영 '+by.S2[XT_RUNFROM]+'~'+by.S2[XT_RUNTO]);
ok(by.S2[XT_BFROM]==='2026-08-27' && by.S2[XT_BTO]==='2026-09-09', '   기준기는 오늘 앞 14일 ('+by.S2[XT_BFROM]+'~'+by.S2[XT_BTO]+')');
ok(by.S2[XT_FAM]==='B0S2' && by.S2[XT_APPROVE]===true, '   상품군키는 ASIN · 승인 ✓ (② 시작이 승인한 것)');
// 예약액: (1800/2) × (10/7−1) × 7 / 2개 = 900 × 0.4286 × 7 / 2 = 1350
ok(by.S2[XT_HOLD]===1350 && !by.S1[XT_HOLD], '   예약액 시험편 ¥1,350 · 대조편 없음 ('+by.S2[XT_HOLD]+')');
ok(!by.S4 && !by.S9, '   짝 없는 B3 · 안 만들어진 B4T · 트랙 B 줄은 올리지 않는다');

// ── 2) 두 번 불러도 다시 안 올린다 ──────────────────────
r=adPromoteRegister_();
ok(r.test===0 && r.ctrl===0 && T().length===3, '다시 불러도 0 (이미 올라간 SKU 는 건너뛴다)');

// ── 3) 뒤늦게 만들어진 짝은 그때 올린다 ─────────────────
cells['광고생성계획'].push(plan('KP EXPAND B4',6,150,['S9'],'G8','성공 · 상품 1개'));
cells['광고생성계획'][4][AP_GID-1]='G4'; cells['광고생성계획'][4][AP_RESULT-1]='성공 · 상품 1개'; cells['광고생성계획'][4][AP_TRACK-1]='X';
r=adPromoteRegister_();
ok(r.test===1 && r.ctrl===0, '   B4T 가 만들어지고 짝 B4 도 생기면 그때 올린다 (S9 는 시험편에만 있어 시험 1) — '+JSON.stringify(r));

// ── 4) 14일 뒤 시험편만 대조편 값으로 되돌린다 ──────────
today='2026-09-24'; sent=[];
const msg=adExpandCycle({quiet:true});
const T2={}; T().forEach(x=>{T2[x[XT_SKU]]=x;});
ok(/되돌림 3/.test(msg), '운영이 끝나면 시험편 3줄(S2·S3·S9)을 되돌린다 — '+msg);
ok(sent.filter(x=>x.id==='G2'&&x.val===7).length===1, '   G2 를 ¥7(대조편 값)로 한 번만 보낸다 (줄은 둘이지만 같은 그룹 같은 값 — 호출 한도를 아낀다)');
ok(T2.S1[XT_STATE]===XS_MATURE && T2.S2[XT_STATE]===XS_MATURE, '   두 편 다 성숙대기로 ('+T2.S1[XT_STATE]+' · '+T2.S2[XT_STATE]+')');
ok(!sent.some(x=>x.id==='G1'), '   대조편 그룹 G1 은 건드리지 않는다');

// ── 5) 시트가 날짜를 Date 로 돌려줘도 되돌림이 온다 ─────
// 시트는 '2026-09-24' 를 날짜로 바꿔 둘 때가 있다. String(Date) 는 'Thu Sep 24 …' 라 앞 10자 비교가 어긋난다
today='2026-09-10';
cells[SHEET_EXTEST]=[EXTEST_HEADER];
cells['광고생성계획']=[ADPLAN_HEADER,
  plan('KP EXPAND B5',7,600,['S1'],'G1','성공 · 상품 1개'),
  plan('KP EXPAND B5T',10,1800,['S2'],'G2','성공 · 상품 2개')];
adPromoteRegister_();
T().forEach(r=>{ for (const c of [XT_BFROM,XT_BTO,XT_RUNFROM,XT_RUNTO]) r[c]=new Date(r[c]+'T00:00:00Z'); });
global.ymd_=d=>(d instanceof Date && Math.abs(d.getTime()-Date.now())>3600e3)? d.toISOString().slice(0,10) : today;   // new Date() 는 '오늘'
today='2026-09-24'; sent=[];
adExpandCycle({quiet:true});
ok(sent.some(x=>x.id==='G2'&&x.val===7), 'Date 객체로 읽혀도 운영 끝날을 알아보고 되돌린다 ('+sent.length+'건 보냄)');
ok(T().every(r=>r[XT_STATE]===XS_MATURE), '   두 줄 다 성숙대기 — '+T().map(r=>r[XT_STATE]).join(' · '));
global.ymd_=()=>today;

// ── 6) 견주던 시험이 다 끝나면 대조군을 닫는다 ──────────
cells[SHEET_EXTEST]=[EXTEST_HEADER];
function done(id,sku,arm,type){ const r=new Array(EXTEST_HEADER.length).fill(''); r[XT_ID]=id; r[XT_SKU]=sku; r[XT_ASIN]='B0'+sku; r[XT_FAM]='B0'+sku;
  r[XT_ARM]=arm; r[XT_TYPE]=type; r[XT_RKIND]='광고그룹'; r[XT_RID]='G'; r[XT_FROM]=7; r[XT_TO]=arm===XARM_TEST?10:7;
  r[XT_BFROM]='2026-08-27'; r[XT_BTO]='2026-09-09'; r[XT_RUNFROM]='2026-09-10'; r[XT_RUNTO]='2026-09-24'; r[XT_BACK]='2026-09-24';
  r[XT_STATE]=XS_DONE; r[XT_APPROVE]=true; return r; }
cells[SHEET_EXTEST].push(done('P1','S2',XARM_TEST,XTYPE_PROMO), done('P2','S1',XARM_CTRL,XTYPE_PROMO),
                         done('X1','S7',XARM_TEST,XTYPE_BID),   done('X2','S8',XARM_CTRL,XTYPE_BID));
global.SHEET_EXRESULT='광고확대결과';
cells[SHEET_EXRESULT]=[EXRESULT_HEADER, (()=>{const r=new Array(EXRESULT_HEADER.length).fill(''); r[0]='P1'; r[EXRESULT_HEADER.indexOf('판정')]=XV_NONE; return r;})()];
cells[SHEET_ADS]=[ADS_HEADER];
let m2=adExpandAdopt_(adExpandPolicy_());
const S={}; T().forEach(r=>{S[r[XT_SKU]]=r[XT_STATE];});
ok(S.S2===XS_STAY && S.S1===XS_CLOSE, '승격 시험군이 판정되면(머묾) 그 묶음의 대조군은 닫힌다 — S1 '+S.S1);
ok(S.S7===XS_DONE && S.S8===XS_DONE, '   판정이 아직 없는 증액 묶음의 대조군은 열어 둔다 — S8 '+S.S8);
ok(/대조끝 1/.test(m2), '   요약에 적는다 — '+m2);
// 닫힌 대조군은 냉각 없이 다음 회차에 나올 수 있다 · 머문 시험군은 냉각
global.adUnitMap_=()=>({}); global.adExpandGroupIndex_=()=>({}); global.adExpandBudgetSignal_=()=>({}); global.adUnitCollectedAt_=()=>'';
global.SHEET_EXPAND='광고확대후보';
const pc=adExpandPlanCtx_();
ok(!pc.cool.S1 && !!pc.cool.S2, '   닫힌 대조군 S1 은 냉각 없음 · 머문 시험군 S2 는 냉각 — cool='+JSON.stringify(Object.keys(pc.cool)));
ok(pc.round['B0S1']===1, '   대조끝도 회차는 센다 (다음엔 다른 편이 될 수 있게) — '+pc.round['B0S1']);
// 대조군만 남은 표에서는 판정 걸음이 돌지 않는다
cells[SHEET_EXTEST]=[EXTEST_HEADER, done('P9','S1',XARM_CTRL,XTYPE_PROMO)];
let calls=0; global.buildAdExpandResults=()=>{calls++; return '';};
adExpandCycle({quiet:true});
ok(calls===0, '   대조군만 평가완료면 매일 다시 판정하지 않는다 (부트스트랩 낭비 없음)');

// ── 7) 이미 있는 가격선 캠페인엔 새 상품만 추가한다 ─────
global.hdrMap_=sh=>{const m={};(cells[sh.getName()][0]||[]).forEach((h,i)=>{m[String(h)]=i;});return m;};
global.EXPAND_HEADER=['SKU','ASIN','상품명','판매가(JPY)','마진율(%)','마진출처','마진근거','객단가(JPY)','성숙클릭','성숙주문','광고비(JPY)','광고매출(JPY)','실제클릭비용(JPY)','실제주문율(%)','판단주문율(%)','주문당공헌이익(JPY)','손익분기클릭비용(JPY)','목표클릭비용(JPY)','여유배수','필요마진율(%)','분류','사유','자료기간','판정','바꿀 것','승인','결과','프로그램값(%)','실행자료'];
global.EXA_SPLIT='분리 필요'; global.EXTEST_MIN_BID=2; global.AP_ACTION=2;
global.adSkuListJoin_=a=>a.join(' | ');
global.adPlanRow_=o=>['',o.action,o.kind,o.name,'자동',o.daily,Math.round(o.bid),o.skus.length,0,o.skus[0].sku,o.band,Math.round(o.beMin),Math.round(o.amt),'실행 시 확인',o.why,o.skus.map(x=>x.sku).join(' | '),'',false,'','','','A'];
global.adPromoBand_=(t,b,m)=>{ b=Number(b)>0?Number(b):2; m=Number(m)>1?Number(m):1.5; if(!(t>0)) return null; if(t<b) return {i:0,lo:b,hi:b*m};
  let i=Math.floor(Math.log(t/b)/Math.log(m)); if(i>12)i=12; const lo=b*Math.pow(m,i); return {i:i,lo:Math.round(lo*100)/100,hi:Math.round(lo*m*100)/100}; };
basis={'확대 · 모드':'자동운영','확대 · 최대 유효입찰(JPY)':100,'일예산 여유 배수':2,'묶음 CPC 기준점':2,'묶음 CPC 배수':1.5,
  '확대 · 승격 첫 배수':1.5,'최소 일예산':100,'캠페인 이름 앞머리':'KP','확대 · 승격 반반 시험':'FALSE'};
const erow=(sku,target,cpc)=>{const r=new Array(EXPAND_HEADER.length).fill(''); r[0]=sku; r[1]='B0'+sku; r[10]=3000; r[11]=9000; r[12]=cpc; r[16]=target/0.65; r[17]=target; r[23]='분리 필요'; return r;};
cells['광고확대후보']=[EXPAND_HEADER, erow('OLD',17,7), erow('NEW',17,7)];
cells['광고생성계획']=[ADPLAN_HEADER, plan('KP EXPAND B5',8,600,['OLD'],'G1','성공 · 상품 1개')];
cells['광고생성계획'][1][AP_CID-1]='C1';
let pr=planAdPromoteBands();
const PL=(cells['광고생성계획']||[]).slice(1);
ok(PL.length===2 && PL[1][AP_ACTION-1]==='기존에 추가', '이미 만들어진 B5 가 있으면 새 줄은 "기존에 추가" ('+PL[1][AP_ACTION-1]+')');
ok(PL[1][AP_SKUS-1]==='NEW' && PL[1][7]===1, '   이미 들어간 OLD 는 빼고 NEW 만 ('+PL[1][AP_SKUS-1]+')');
ok(PL[1][AP_GID-1]==='G1' && PL[1][AP_CID-1]==='C1' && PL[1][AP_BID-1]===8, '   캠페인ID·광고그룹ID·지금 부르는 값(¥8)을 채운다 — 72J 가 만들기를 건너뛰고 상품만 넣는다');
cells['광고생성계획']=[ADPLAN_HEADER, plan('KP EXPAND B5',8,600,['OLD','NEW'],'G1','성공 · 상품 2개')];
cells['광고생성계획'][1][AP_CID-1]='C1';
pr=planAdPromoteBands();
ok((cells['광고생성계획']||[]).length===2, '   둘 다 이미 들어가 있으면 줄을 안 만든다');
cells['광고생성계획']=[ADPLAN_HEADER, plan('KP EXPAND B5',8,600,['OLD'],'','')];   // 아직 만드는 중
pr=planAdPromoteBands();
ok((cells['광고생성계획']||[]).length===2, '   아직 안 만들어진 같은 이름 줄이 있으면 그대로 둔다 (그 줄이 만든다)');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
