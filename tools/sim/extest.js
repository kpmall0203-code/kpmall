// 확대 시험 — 계획 · 시작 · 되돌림 · 판정 (72AE · 72AF)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;},
  setValue(x){return this.setValues([[x]]);},
  getValue:()=>((cells[name]||[])[r-1]||[])[c-1]??'',
  setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
  setNumberFormat(){return this;},setNote(){return this;},setNotes(){return this;},
  clearContent(){return this;},insertCheckboxes(){return this;}
});
const mkSheet=name=>({ getName:()=>name,
  getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1,
  getMaxRows:()=>Math.max((cells[name]||[]).length,1000),getMaxColumns:()=>60,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),
  setFrozenRows(){},insertRowsAfter(){},insertColumnsAfter(){},deleteRows(){},setColumnWidth(){}
});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));}};
let alerts=[], answer='YES', today='2026-09-05';
global.ss_=()=>ss;
global.ui_=()=>({alert:(a,b)=>{alerts.push([a,String(b||'')]);return answer;},
  ButtonSet:{OK:1,YES_NO:2},Button:{YES:'YES',NO:'NO'}});
global.SpreadsheetApp={flush(){}};
const props={};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,
  setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})};
global.log_=()=>{}; global.showSheet_=()=>{}; global.headerNotes_=()=>{}; global.toast_=()=>{};
global.writeTable_=(sh,h,rows)=>{cells[sh.getName()]=[h.slice()].concat(rows.map(r=>r.slice()));};
global.makeOneSheet_=specs=>{const n=specs[0].name;
  if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.madeSheetStop_=(made)=>{ if(!made) return false; alerts.push(['만듦',made]); return true; };
global.getSheetOrThrow_=n=>{ if(!cells[n]) throw new Error('없음 '+n); return sheets[n]||(sheets[n]=mkSheet(n)); };
global.ymd_=d=>today;
global.addDays_=(ymd,n)=>{const d=new Date(ymd+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.ADS_SOFT_MS=4*60*1000;
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.SHEET_ADS='광고실적';
global.ADS_HEADER=['날짜','SKU','ASIN','캠페인','광고비(JPY)','광고매출(JPY)','노출','클릭','광고주문','수집일시'];
global.SHEET_LISTING='리스팅'; global.SHEET_ADLOG='광고변경대장';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명','검색어','번역일시','가격(JPY)','재고','상태'];
global.SHEET_ADGRP='광고그룹';
global.ADGRP_HEADER=['캠페인','유형','광고그룹','상태','기본입찰','SKU수','전용가능','대상수','캠페인ID','광고그룹ID','수집일시'];
global.SHEET_ADSTRUCT='광고구조'; global.SHEET_SPENDDAY='광고캠페인일별';
global.ADSW_CT_CAMPAIGN='c'; global.ADSW_CT_ADGROUP='g'; global.DEFAULT_FEE_RATE=0.10;
global.adBusyGuard_=()=>true;
global.adRowApproved_=v=>v===true||String(v).trim()==='O';
global.adErrorText_=s=>String(s);
global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
global.pct1_=x=>(x*100).toFixed(1)+'%';
global.adLogRow_=o=>[o.sku,o.item,o.from,o.to,o.why];
let logged=[]; global.adLogBuffer_=()=>({push:r=>{logged=logged.concat(r);},flush(){}});
global.adsToken_=()=>'t';
global.hdrMap_=sh=>{const h=(cells[sh.getName()]||[[]])[0]||[];const m={};h.forEach((x,i)=>{m[String(x)]=i;});return m;};
global.cellOf_=(row,map,name,dft)=>{const i=map[name];return i===undefined?dft:(row[i]??dft);};
// 마진 자료 — 전부 기본 17%
global.costMap_=()=>({}); global.fxHouseRate_=()=>9.5; global.skuCostMap_=()=>({});
global.costInfoMap_=()=>({}); global.resolveShipping_=()=>({fee:0,src:''});
global.unitProfitKrw_=()=>0; global.normName_=s=>String(s||''); global.externalMarginMap_=()=>({});
let basis={'기본 마진율':0.17};
global.adBasis_=()=>basis;
let api=[];
global.adJobSend_=(t,act,kind,tid,to)=>{api.push({act,kind,tid,to});return {ok:true,ids:[tid],msg:''};};
let ledger={rows:[],has:true};
global.adSpendRead_=()=>ledger;

for(const f of ['72AA_마진','72AB_확대후보','72AE_확대시험','72AF_확대결과'])
  eval(fs.readFileSync('all/'+f+'.js','utf8'));

// ── 자료 ────────────────────────────────────────────────
// 확대후보: 두 SKU 가 확대검토. 판매가 1000 · 마진 17% · 판단주문율 5% → 상한 ¥5.5
const EH=EXPAND_HEADER, ei=n=>EH.indexOf(n);
const cand=(sku,asin,room)=>{const r=new Array(EH.length).fill('');
  r[ei('SKU')]=sku; r[ei('ASIN')]=asin; r[ei('판매가(JPY)')]=1000; r[ei('마진율(%)')]=17;
  r[ei('판단주문율(%)')]=5; r[ei('광고비(JPY)')]=3000; r[ei('성숙클릭')]=600;
  r[ei('여유배수')]=room; r[ei('분류')]=EXC_GROW; return r;};
cells['광고확대후보']=[EH, cand('A1','B0A',2.0), cand('A2','B0B',1.5), cand('A3','B0C',1.4)];
cells['광고그룹']=[ADGRP_HEADER,
  ['빅','자동','big-1','ENABLED',5,'25개 넘음','',3,'C9','G9',''],       // 몰아넣기
  ['전용A','자동','ga','ENABLED',5,1,'O',2,'C1','G1',''],
  ['전용B','자동','gb','ENABLED',5,1,'O',2,'C2','G2',''],
  ['전용C','자동','gc','ENABLED',5,1,'O',2,'C3','G3','']];
cells['광고구조']=[['캠페인','캠페인ID','일예산(JPY)'],
  ['전용A','C1',1000],['전용B','C2',1000],['전용C','C3',300]];
global.adUnitCollectedAt_=()=>'2026-09-06';
global.adUnitMap_=()=>({
  A1:{ads:[{id:'ad1',gid:'G1',cid:'C1',camp:'전용A',state:'ENABLED'}],on:1},
  A2:{ads:[{id:'ad2',gid:'G2',cid:'C2',camp:'전용B',state:'ENABLED'}],on:1},
  A3:{ads:[{id:'ad3',gid:'G9',cid:'C9',camp:'빅',state:'ENABLED'}],on:1}});

// ── 1) 한도가 비면 시작할 수 없다 ───────────────────────
alerts=[]; planAdExpandTests();          // 표 만들고 멈춤
alerts=[]; planAdExpandTests();
const TH=EXTEST_HEADER;
const rows=()=> (cells[SHEET_EXTEST]||[]).slice(1);
const byS=()=>{const o={}; rows().forEach(r=>{o[r[XT_SKU]]=r;}); return o;};
let t=byS();
ok(rows().length===3, '확대검토 3줄이 시험 계획이 된다 ('+rows().length+')');
ok(t['A3'][XT_TYPE]===XTYPE_SPLIT && String(t['A3'][XT_WHY]).indexOf(XR_SPLIT)===0,
   '몰아넣기 그룹은 구조준비로 남는다 — 그 상품만 값을 부를 수 없다');
ok(alerts[0][1].indexOf('최대 유효입찰')>0 && alerts[0][1].indexOf('최대 동시 시험 수')<0,
   '[최대 유효입찰] 이 비면 시작할 수 없다고 말한다 — 나머지 한도는 비워도 된다(제한 없음): "'+
   alerts[0][1].split(String.fromCharCode(10))[1].trim()+'"');
api=[]; alerts=[]; startAdExpandTests();
ok(api.length===0 && alerts[0][1].indexOf('없는 값')>0, '   그 상태에서 시작을 눌러도 안 나간다');

// ── 2) 한도를 채우면 계획이 선다 ────────────────────────
basis={'기본 마진율':0.17,'확대 · 모드':'자동운영','확대 · 최대 동시 시험 수':10,
  '확대 · 시험 주간 지출한도(JPY)':50000,'확대 · 시험 손실한도(JPY)':20000,
  '확대 · 최대 유효입찰(JPY)':50,
  '확대 · 대조군 비율':0.0001};     // 배정이 셈을 가리지 않게 — 배정 자체는 3) 에서 본다
planAdExpandTests(); t=byS();
ok(t['A1'][XT_CAP]===5.53, '목표 상한 = 1000×17% × 5% × 0.65 = ¥5.53 ('+t['A1'][XT_CAP]+')');
ok(t['A1'][XT_TO]===5.5, '한 번에 10% · 상한 이하로 내림 → ¥5 → ¥5.5 ('+t['A1'][XT_TO]+')');
ok(t['A1'][XT_TYPE]===XTYPE_BID, '예산이 남으면 입찰형 ('+t['A1'][XT_TYPE]+')');
// 예산 제약 신호 — C2 는 최근 7일 중 4일 예산 90% 소진
ledger={has:true,rows:[0,1,2,3].map(i=>({d:global.addDays_(today,-i),cid:'C2',cost:990,sales:0,ord:0,ck:0,im:0}))};
planAdExpandTests(); t=byS();
ok(t['A2'][XT_TYPE]===XTYPE_BUDGET, '예산을 다 쓰는 캠페인은 예산형으로 ('+t['A2'][XT_TYPE]+')');
ok(t['A2'][XT_FROM]===1000 && t['A2'][XT_TO]===1100, '   일예산 1000 → 1100 (10%)');
ledger={has:true,rows:[]};

// ── 3) 대조군은 바꾸지 않는다 · 회차마다 돈다 ───────────
let ctrl=0;
for(let i=0;i<2000;i++) if(adExpandIsControl_('FAM'+i,{seed:20260908,holdout:0.2},0)) ctrl++;
ok(ctrl>2000*0.15 && ctrl<2000*0.25, '대조군 배정이 20% 언저리 ('+(ctrl/20).toFixed(1)+'%)');
ok(adExpandIsControl_('X',{seed:1,holdout:0.2},0)===adExpandIsControl_('X',{seed:1,holdout:0.2},0),
   '   같은 씨앗·회차면 같은 답 (재현된다)');
let flips=0;
for(let i=0;i<500;i++){ const a=adExpandIsControl_('F'+i,{seed:1,holdout:0.2},0), b=adExpandIsControl_('F'+i,{seed:1,holdout:0.2},1); if(a!==b) flips++; }
ok(flips>100, '   회차가 바뀌면 배정이 바뀐다 — 한 번 대조군이 영원히 대조군이 아니다 ('+flips+'/500 바뀜)');

// ── 4) 승인한 줄만 나가고, 14일 뒤 되돌린다 ─────────────
// (배정이 흔들리지 않게 대조군 비율을 0 으로 두고 본다 — 배정 자체는 위에서 시험했다)
basis['확대 · 대조군 비율']=0.0001;
planAdExpandTests(); t=byS();
ok(t['A1'][XT_STATE]===XS_PLAN, '   A1 이 계획 상태다 ('+t['A1'][XT_STATE]+')');
const rr=cells[SHEET_EXTEST];
for(const r of rr.slice(1)) if(r[XT_SKU]==='A1'&&r[XT_STATE]===XS_PLAN) r[XT_APPROVE]=true;
api=[]; alerts=[]; answer='NO'; startAdExpandTests();
ok(api.length===0, '마지막 확인에 아니오면 안 나간다');
answer='YES'; api=[]; startAdExpandTests();
ok(api.length===1 && api[0].act==='입찰변경' && api[0].tid==='G1' && api[0].to===5.5,
   '승인한 줄만 · 그 그룹에만 · 계획한 값으로 ('+JSON.stringify(api[0])+')');
t=byS();
ok(t['A1'][XT_STATE]===XS_RUN && t['A1'][XT_RUNTO]==='2026-09-19',
   '   시험중 · 운영종료 '+t['A1'][XT_RUNTO]+' (14일 뒤)');

api=[]; adExpandCycle({quiet:true});
ok(api.length===0, '운영 기간 중에는 아무것도 안 한다');
today='2026-09-19'; api=[];
adExpandCycle({quiet:true}); t=byS();
ok(api.length===1 && api[0].to===5 && api[0].tid==='G1', '기간이 끝나면 저절로 원래 값(¥5)으로 되돌린다 (승인 없이)');
ok(t['A1'][XT_STATE]===XS_MATURE && t['A1'][XT_MATURE]==='2026-10-05',
   '   성숙대기 · 성숙예정일 '+t['A1'][XT_MATURE]+' (되돌린 뒤 16일)');
today='2026-10-05'; adExpandCycle({quiet:true}); t=byS();
ok(t['A1'][XT_STATE]===XS_DONE, '성숙일이 지나면 평가완료로 넘어간다');

// ── 5) 판정 — 대조군이 모자라면 확증하지 않는다 ─────────
// A1: 기준기 하루 이익 0 · 운영기 하루 +100 (광고매출 늘고 이익도 늘었다)
const days=(f,n)=>Array.from({length:n},(_,i)=>global.addDays_(f,i));
const perfRows=[ADS_HEADER];
for(const d of days('2026-08-22',14)) perfRows.push([d,'A1','B0A','c',100,588,0,20,1,'']);
for(const d of days('2026-09-05',14)) perfRows.push([d,'A1','B0A','c',200,1765,0,40,2,'']);
cells['광고실적']=perfRows;
alerts=[]; buildAdExpandResults();      // 표 만들고 멈춤
alerts=[]; buildAdExpandResults();
const RH=EXRESULT_HEADER, ri=n=>RH.indexOf(n);
const res=(cells[SHEET_EXRESULT]||[]).slice(1);
ok(res.length===1, '평가완료 줄만 결과에 나온다 ('+res.length+')');
ok(res[0][ri('판정')]===XV_MAYBE && String(res[0][ri('근거')]).indexOf('LOW_EVIDENCE')===0,
   '상품군이 30개에 못 미치면 확증하지 않는다 → '+res[0][ri('판정')]);
ok(Math.abs(res[0][ri('내 변화(일)')]-100)<3,
   '   내 변화는 하루 '+res[0][ri('내 변화(일)')]+'엔 (기준 0 → 운영 100)');

// ── 6) 부트스트랩은 씨앗이 같으면 같다 ──────────────────
const A=[10,12,8,15,9], B=[1,2,0,3,1];
const c1=adExBootstrap_(A,B,500,0.9,7), c2=adExBootstrap_(A,B,500,0.9,7);
ok(c1.lo===c2.lo && c1.hi===c2.hi, '같은 씨앗·입력이면 구간이 똑같다 ('+c1.lo.toFixed(2)+'~'+c1.hi.toFixed(2)+')');
ok(c1.lo>0, '   차이가 뚜렷하면 구간 아래끝이 0보다 크다');
const c3=adExBootstrap_([1,2,3],[1,2,3],500,0.9,7);
ok(c3.lo<0 && c3.hi>0, '   차이가 없으면 구간이 0을 품는다 ('+c3.lo.toFixed(2)+'~'+c3.hi.toFixed(2)+')');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
