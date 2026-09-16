// 신규 상품 광고 ② 실행 (78C) — 풀 배정 · 주간 문 · 되돌아와도 안전
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const cells={}, na={};
function mk(store,name){ return {
  getName:()=>name, getLastRow:()=>(store[name]||[]).length,
  getLastColumn:()=>((store[name]||[[]])[0]||[]).length||1,
  getMaxRows:()=>Math.max((store[name]||[]).length,1000), getMaxColumns:()=>40,
  insertRowsAfter(){}, insertColumnsAfter(){}, deleteColumns(){}, setFrozenRows(){},
  getRange:(r,c,nr,nc)=>({
    getValues:()=>{const rows=store[name]||[];const out=[];
      for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
      return out;},
    setValues(v){const rows=store[name]||(store[name]=[]);
      for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
        for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;},
    setValue(x){return this.setValues([[x]]);},
    setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
    setNumberFormat(){return this;},getNotes:()=>[Array(nc||1).fill('')],setNotes(){return this;} })};}
global.ss_=()=>({getSheetByName:n=>cells[n]?mk(cells,n):null, insertSheet:n=>{cells[n]=cells[n]||[];return mk(cells,n);}});
global.SpreadsheetApp={openById:id=>({
  getName:()=>'Amazon 신규 상품 광고',
  getSheetByName:n=>((id==='NEWFILE'?na:cells)[n]?mk(id==='NEWFILE'?na:cells,n):null),
  insertSheet:n=>{const st=id==='NEWFILE'?na:cells; st[n]=st[n]||[]; return mk(st,n);},
  getSheets:()=>Object.keys(id==='NEWFILE'?na:cells).map(n=>mk(id==='NEWFILE'?na:cells,n)),
  deleteSheet(){} }), flush(){}};
let logs=[], alerts=[];
global.log_=(c,l,m)=>logs.push(l+' '+m);
global.ui_=()=>({alert:(a,b)=>{alerts.push([a,String(b||'')]);return 'OK';},ButtonSet:{OK:1},Button:{YES:'YES'}});
global.adBusyGuard_=()=>true; global.headerNotes_=()=>{};
global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
const TODAY='2026-09-11';                              // 금요일
global.ymd_=d=>d instanceof Date?TODAY:TODAY;
global.adYmd_=x=>x instanceof Date?TODAY:String(x==null?'':x).substring(0,10);
global.daysBetween_=(a,b)=>{const p=s=>new Date(s+'T00:00:00Z').getTime();return Math.round((p(b)-p(a))/864e5);};
global.weekStart_=y=>{const d=new Date(y+'T00:00:00Z');const w=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-w);return d.toISOString().substring(0,10);};
global.ensureSheet_=(n,h)=>{if(!cells[n])cells[n]=[h.slice()];return mk(cells,n);};
global.SHEET_LISTING='리스팅';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명','검색어','번역일시','가격(JPY)','재고','상태'];
global.SRCCOST_TAB='상품 목록'; global.SRCCOST_COL_KRW=3; global.SRCCOST_COL_PRICE=9;
global.SRCCOST_COL_MJPY=13; global.SRCCOST_COL_SKU=15; global.SRCCOST_COL_SHIP=16;
global.srcKrw_=x=>{const m=String(x==null?'':x).replace(/,/g,'').match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):0;};
global.MSRC_DEFAULT='기본값'; global.DEFAULT_FEE_RATE=0.10;
global.SPEND_OVERSPEND_MULT=1.25;
let basis={'신규광고 시트 ID':'NEWFILE','마진율 시트 ID':'EXT','확대 · 최대 유효입찰(JPY)':100};
global.adBasis_=()=>basis;
let advertised={}; global.adUnitMap_=()=>advertised;
let rate=8.644; global.adMarginCtx_=()=>({rate:rate});
global.adMarginFor_=(ctx,sku,price)=>{const s=srcRows[sku];
  if(!s||!(s.krw>0)) return {pct:15,src:'기본값',why:'기본값'};
  const pct=((price*0.9-605)*rate-s.krw)/rate/price*100;
  return pct<=0?{pct:0,src:'원가 계산(적자)',why:'손해'}:{pct:Math.round(pct*10)/10,src:'소싱 조달비',why:'소싱'};};
// 계획 표 · 실행
global.SHEET_ADPLAN='광고생성계획';
global.ADPLAN_HEADER=['계획ID','동작','방식','캠페인명','유형','일예산(JPY)','입찰(JPY)','SKU수','기존SKU수','대표SKU','CPC구간','손익분기CPA(JPY)','월매출합(JPY)','기존광고제거','근거','SKU목록','광고그룹ID','승인','결과','캠페인ID','광고ID들','트랙'];
global.AP_ACTION=2;global.AP_NAME=4;global.AP_DAILY=6;global.AP_BID=7;global.AP_SKUS=16;
global.AP_GID=17;global.AP_APPROVE=18;global.AP_RESULT=19;global.AP_CID=20;global.AP_ADIDS=21;global.AP_TRACK=22;
global.AD_SKU_SEP=' | ';
global.adSkuListJoin_=a=>a.join(' | ');
global.adSkuListSplit_=t=>String(t==null?'':t).split(/\s*\|\s*|,/).map(s=>s.trim()).filter(Boolean);
global.adPlanSkus_=r=>{const l=String(r[AP_SKUS-1]||'').trim(),p=String(r[9]||'').trim();return (l&&p&&l===p)?[l]:adSkuListSplit_(l);};
global.adIsGivenUp_=s=>/그만/.test(String(s||''));
global.adPromoBand_=(t,b,m)=>{b=b>0?b:2;m=m>1?m:1.5;if(!(t>0))return null;
  if(t<b)return{i:0};let i=Math.floor(Math.log(t/b)/Math.log(m));if(!isFinite(i)||i<0)i=0;if(i>12)i=12;return{i:i};};
global.SHEET_ADGRP='광고그룹';
global.ADGRP_HEADER=['캠페인','유형','광고그룹','상태','기본입찰','SKU수','전용가능','대상수','캠페인ID','광고그룹ID','수집일시'];
let planOnly=''; global.withLock_=(n,fn)=>({ran:true,value:fn()}); global.ADS_SOFT_MS=240000; global.ADSPEND_PENDING='리포트 준비 중'; global.adSchedRun_=(h,l,fn)=>fn(); global.adPlanTrackGet_=()=>''; global.adPlanTrackSet_=()=>{}; global.adPlanOnlyGet_=()=>planOnly; global.adPlanOnlySet_=n=>{planOnly=n||'';};
// 가짜 실행: 승인된 트랙 N 줄에 캠페인ID·광고그룹ID 를 박는다 (72J 가 하는 것과 같은 순서)
let seq=0, campByName={}, execCalls=0;
global.adPlanExecStep_=()=>{
  execCalls++;
  const sh=cells['광고생성계획']; let okN=0;
  for(let i=1;i<sh.length;i++){
    const r=sh[i];
    if(r[AP_APPROVE-1]!==true) continue;
    if(String(r[AP_RESULT-1]||'').indexOf('성공')===0) continue;
    const name=String(r[AP_NAME-1]);
    let cid=String(r[AP_CID-1]||'').trim();
    if(!cid){ cid=campByName[name]||('C'+(++seq)); campByName[name]=cid; r[AP_CID-1]=cid; }
    r[AP_GID-1]='G'+(++seq);
    r[AP_RESULT-1]='성공';
    okN++;
  }
  return '캠페인 생성 — 성공 '+okN+' · 완료';
};
let budgetPuts=[];
global.adsToken_=()=>'T';
global.ADSW_CT_CAMPAIGN='ct';
global.adsApiRetry_=(t,m,p,b)=>{ if(p==='/sp/campaigns'&&m==='put'){budgetPuts.push(b.campaigns[0]);
  return{campaigns:{success:b.campaigns.map((x,i)=>({index:i,campaignId:x.campaignId}))}};} throw new Error('unexpected '+p);};
global.adsCreated_=(res,key)=>({ok:!!(res&&res[key]&&res[key].success),ids:[],msg:''});
let stopCalls=[]; global.adPromoteStopOld_=o=>{stopCalls.push(o);return{paused:3};};
// 지출 원장
let ledger=[]; global.adSpendRead_=()=>({rows:ledger,last:ledger.length?ledger[ledger.length-1].d:'',has:ledger.length>0});
global.adSpendSum_=(led,cids,from,to)=>{let s={cost:0};for(const r of led.rows){if(!cids[r.cid])continue;
  if(from&&r.d<from)continue; if(to&&r.d>to)continue; s.cost+=r.cost;} return s;};
global.adPendingSpend_=(last,daily,today)=>{if(!last)return null;const g=daysBetween_(last,today);return g<=0?0:Math.round(daily*g*1.25);};
global.PROMO_TRACK='X';

eval(fs.readFileSync('all/78_신규광고.js','utf8'));
eval(fs.readFileSync('all/78B_신규광고_가져오기.js','utf8'));
eval(fs.readFileSync('all/78C_신규광고_실행.js','utf8'));

// ── 자료 ────────────────────────────────────────────────
function srow(sku,krw,price,name){const r=new Array(16).fill('');
  r[0]='https://x';r[2]=krw;r[5]='2026-09-10 10:00';r[6]=name||sku;r[8]=price;r[12]=0;r[14]=sku;r[15]='일반';return r;}
function lrow(sku,asin,price,stock,state){return [sku,asin,'n'+sku,'','','',price,stock,state||'Active'];}
let srcRows={};
const N=45;                                   // 45 상품군 — 풀(20) 을 넘긴다
let src=[], list=[];
for(let i=1;i<=N;i++){
  const sku='물건'+String(i).padStart(3,'0')+'-XX-1';
  // 판매가를 흩어 놓아 가격선이 갈리게 한다
  const price=1500+i*180;
  src.push(srow(sku,'8,000원',price,'물건'+i)); list.push(lrow(sku,'B0'+i,price,5));
}
cells['상품 목록']=[new Array(16).fill('h')].concat(src);
src.forEach(r=>{srcRows[r[14]]={krw:8000,price:r[8]};});
cells['리스팅']=[LISTING_HEADER].concat(list);

setupNewAds();
naImportRun_({quiet:true});
const I=()=>na['상품통합'].slice(1);
ok(na['상품통합'][0].length===NA_ITEM_HEADER.length, '상품통합 머리글 '+na['상품통합'][0].length+'칸 (캠페인·ID·시작일 포함)');
const startable=I().filter(r=>r[NA_I_ALLOC]===NAA_START).length;
const loss=I().filter(r=>r[NA_I_ALLOC]===NAA_EXCLUDE).length;
ok(startable+loss===N && loss===2,
   '① 이 '+startable+'개를 시작 대기로, '+loss+'개는 적자라 제외 (가장 싼 두 개)');

// ── 1) 모의운영 — 계획만 적고 아마존은 안 부른다 ─────────
let r=naRunStep_({quiet:true});
ok(!r.made && execCalls===0, '모의운영: 아마존을 부르지 않았다 (실행 호출 '+execCalls+'회)');
const P=()=>cells['광고생성계획'].slice(1);
ok(P().length===r.planned && r.planned>0, '계획 표에 '+r.planned+'줄을 넣었다');
ok(P().every(x=>x[AP_TRACK-1]===NA_TRACK), '   전부 트랙 '+NA_TRACK);
ok(P().every(x=>x[AP_APPROVE-1]===false), '   승인은 전부 꺼져 있다 — 모드가 모의운영이라');
ok(r.newPools===r.pools && r.pools>0, '   첫 바퀴엔 전부 새 풀 '+r.newPools+'개 (가격선마다 하나)');
ok(r.planned===r.pools, '   새 풀에는 한 줄씩만 넣었다 ('+r.planned+'줄 / 풀 '+r.pools+'개) — 같은 이름 캠페인이 여러 개 생기지 않게');
ok(r.waits===r.cand-r.planned, '   나머지 '+r.waits+'개는 POOL_WAIT (후보 '+r.cand+' · 계획 '+r.planned+')');
const w1=I().find(x=>/POOL_WAIT/.test(x[NA_I_WHY]||''));
ok(!!w1 && w1[NA_I_ALLOC]===NAA_START, '   기다리는 줄의 사유에 이유가 적혀 있다 — '+(w1?w1[NA_I_WHY].substring(0,42):''));
ok(P().every(x=>{const b=Number(x[AP_DAILY-1]);return b>=NA_BUDGET_MIN;}), '   일예산은 최소 ¥'+NA_BUDGET_MIN+' 이상');

// 다시 눌러도 같은 SKU 를 또 넣지 않는다
const n1=P().length; const r2=naRunStep_({quiet:true});
ok(P().length===n1 && r2.planned===0, '모의운영에서 다시 눌러도 계획이 안 늘어난다 ('+r2.planned+'줄 추가)');

// ── 2) 자동운영 — 실제로 만들고 결과를 거둔다 ────────────
na['설정'].find(x=>x[0]==='신규 · 모드')[1]='자동운영';
naCfg_(true);
const r3=naRunStep_({quiet:true});
ok(r3.made && execCalls===r3.passes && r3.passes>1,
   '자동운영: '+r3.passes+'바퀴를 돌며 그만큼 실행을 불렀다 — 새 풀을 만든 뒤 그 캠페인ID 로 이어 채운다');
ok(P().filter(x=>x[AP_APPROVE-1]===true).length>0, '   승인이 켜졌다 — 모드가 곧 돈의 승인');
ok(r3.approved===8 && r3.planned===35,
   '   모의운영 때 적어 둔 '+r3.approved+'줄을 승인하고, 기다렸던 '+r3.planned+'줄을 이어 넣었다');
const started=I().filter(x=>x[NA_I_STATE]===NAS_PROBE);
ok(started.length===43, '   한 번 눌러 '+started.length+'개가 다 소액운영으로 바뀌었다 (가격선 수만큼만 시작하지 않는다)');
ok(started.every(x=>x[NA_I_CID]&&x[NA_I_GID]&&x[NA_I_START]===TODAY), '   캠페인ID·광고그룹ID·시작일이 적혔다');
const fam1=na['상품군광고'].slice(1).find(x=>x[NA_F_REP]===started[0][NA_I_SKU]);
ok(fam1[NA_F_STATE]===NAS_PROBE && fam1[NA_F_START]===TODAY, '   상품군 표도 소액운영 · 시작일 '+fam1[NA_F_START]);
ok(stopCalls.length===1 && stopCalls[0].track===NA_TRACK, '   옛 광고 뒷정리를 트랙 '+NA_TRACK+' 로 불렀다 (한 번만)');
ok(r3.stopped===3, '   옛 광고 '+r3.stopped+'개를 멈췄다고 셌다');
ok(r3.waits===0, '   기다리는 것이 남지 않았다');

const added=P().filter(x=>String(x[AP_ACTION-1])==='기존에 추가');
ok(added.length===35 && added.every(x=>String(x[AP_CID-1]).length>0),
   '이어 넣은 '+added.length+'줄은 [기존에 추가] 이고 캠페인ID 가 채워져 있다 — 72J 가 그룹만 더한다');
ok(budgetPuts.length>0, '기존 풀의 일예산을 올렸다 ('+budgetPuts.length+'번) — 스무 그룹이 한 그룹치 예산을 나눠 쓰지 않게');
let poolCount={}; P().forEach(x=>{poolCount[x[AP_NAME-1]]=(poolCount[x[AP_NAME-1]]||0)+1;});
const over=Object.keys(poolCount).filter(k=>poolCount[k]>naPolicy_().poolGroups);
ok(!over.length, '어느 풀도 정원('+naPolicy_().poolGroups+')을 넘지 않았다 — 최대 '+Math.max(...Object.values(poolCount)));
ok(Object.keys(poolCount).every(k=>/^KP NEW B\d+-\d+$/.test(k)), '캠페인 이름은 KP NEW B{가격선}-{풀번호}');
const r4={planned:0};

// 가격선이 실제로 갈렸나
const bands={}; P().forEach(x=>{const m=/B(\d+)-/.exec(x[AP_NAME-1]); if(m) bands[m[1]]=1;});
ok(Object.keys(bands).length>=2, '   가격선이 '+Object.keys(bands).length+'개로 갈렸다 (비슷한 값끼리 한 캠페인)');

// ── 4) 주간 시작 수 한도 ────────────────────────────────
// 새 상품을 더 넣어 '시작할 수 있는 후보' 를 만든다 (앞 바퀴에서 다 들어가 버렸다)
for(let i=N+1;i<=N+6;i++){
  const sku='추가'+String(i).padStart(3,'0')+'-XX-1'; const price=4000+i*50;
  cells['상품 목록'].push(srow(sku,'8,000원',price,'추가'+i));
  srcRows[sku]={krw:8000,price:price};
  cells['리스팅'].push(lrow(sku,'B9'+i,price,5));
}
naImportRun_({quiet:true});
na['설정'].find(x=>x[0]==='신규 · 주간 시작 상품군 수')[1]=1; naCfg_(true);
const r5=naRunStep_({quiet:true});
ok(r5.slots===0 && r5.planned===0 && /WEEKLY_CAP/.test(r5.why), '주간 시작 수가 차면 새로 시작하지 않는다 — '+r5.why.substring(0,40));
const bw=I().filter(x=>x[NA_I_ALLOC]===NAA_BUDWAIT);
ok(bw.length>0 && /WEEKLY_CAP/.test(bw[0][NA_I_WHY]), '   기다리는 줄은 예산대기로 표시된다 ('+bw.length+'개)');
ok(I().filter(x=>x[NA_I_STATE]===NAS_PROBE).length===started.length+r4.planned,
   '   이미 도는 광고는 그대로다 — 한도는 새 시작만 막는다');

// ── 5) 주간 지출 한도 ───────────────────────────────────
na['설정'].find(x=>x[0]==='신규 · 주간 시작 상품군 수')[1]=1000;
na['설정'].find(x=>x[0]==='신규 · 탐색 주간 지출한도(JPY)')[1]=1000; naCfg_(true);
const mon=weekStart_(TODAY);
Object.values(campByName).forEach(cid=>ledger.push({d:mon,cid:cid,cost:900,mature:false}));
const r6=naRunStep_({quiet:true});
ok(r6.weekSpend>0 && r6.slots===0 && /WEEKLY_SPEND_CAP/.test(r6.why),
   '이번 주 실지출이 한도에 닿으면 새 시작을 멈춘다 (실지출 ¥'+r6.weekSpend+')');
ok(/이미 도는 광고는 그대로/.test(r6.why), '   사유에 "이미 도는 광고는 끄지 않는다" 가 적힌다');
// 지출 자료가 아예 없으면 0 으로 보지 않는다
ledger=[]; const r7=naRunStep_({quiet:true});
ok(r7.pending>0, '지출 자료가 없으면 일예산으로 최악을 가정한다 (준비액 ¥'+r7.pending+') — 모르는 것을 0 으로 보지 않는다');

// ── 6) 사람이 잡은 줄은 시작하지 않는다 ─────────────────
na['설정'].find(x=>x[0]==='신규 · 탐색 주간 지출한도(JPY)')[1]=120000; naCfg_(true);
ledger=[];
const free=I().find(x=>x[NA_I_ALLOC]===NAA_BUDWAIT);
free[NA_I_OWNER]='사람';
const before=P().length;
const r8=naRunStep_({quiet:true});
const after=P().filter(x=>adSkuListSplit_(x[AP_SKUS-1])[0]===free[NA_I_SKU]);
ok(after.length===0, '소유=사람 인 줄은 계획에 넣지 않는다');

// ── 7) 72J 가 그만둔 줄은 다시 넣지 않는다 ────────────
const gv=P().find(x=>String(x[AP_RESULT-1]).indexOf('성공')===0);
gv[AP_RESULT-1]='실패 3회 — 이름 오류 · 그만둠'; gv[AP_GID-1]=''; gv[AP_CID-1]='';
const gsku=adSkuListSplit_(gv[AP_SKUS-1])[0];
const gr=I().find(x=>x[NA_I_SKU]===gsku); gr[NA_I_STATE]=NAS_NEW; gr[NA_I_GID]=''; gr[NA_I_CID]='';
const n7=P().length; naRunStep_({quiet:true});
ok(P().length===n7, '72J 가 그만둔 줄의 SKU 를 또 계획에 넣지 않는다 (사람이 [결과] 를 비워야 다시 시도)');
ok(/그만뒀습니다/.test(I().find(x=>x[NA_I_SKU]===gsku)[NA_I_WHY]), '   그 줄의 사유에 그만둔 이유를 옮겨 적는다');

// ── 8) 아직 안 만들어진 계획 줄도 이번 주 자리를 차지한다 ──
na['설정'].find(x=>x[0]==='신규 · 모드')[1]='모의운영'; naCfg_(true);
for(let i=N+7;i<=N+12;i++){ const sku='추가'+i+'-XX-1'; const price=4000+i*50;
  cells['상품 목록'].push(srow(sku,'8,000원',price,'추가'+i)); srcRows[sku]={krw:8000,price:price};
  cells['리스팅'].push(lrow(sku,'B9'+i,price,5)); }
naImportRun_({quiet:true});
na['설정'].find(x=>x[0]==='신규 · 주간 시작 상품군 수')[1]=100; naCfg_(true);
const before8=I().filter(x=>x[NA_I_STATE]===NAS_PROBE).length;
const q1=naRunStep_({quiet:true});           // 모의: 계획만 (승인 X)
const q2=naRunStep_({quiet:true});
ok(q2.slots===Math.max(0,100-q2.weekStarts-P().filter(x=>String(x[AP_RESULT-1]).indexOf('성공')!==0 && !/그만/.test(String(x[AP_RESULT-1]))).length),
   '계획에만 있고 아직 안 만든 줄이 자리를 차지한다 (자리 '+q2.slots+' = 100 − 시작 '+q2.weekStarts+' − 대기 '+(100-q2.weekStarts-q2.slots)+')');

// ── 9) 앞 실행이 죽어 승인된 채 남은 줄은 다시 눌러 만든다 ──
// 만들어진 줄 몇 개를 '승인됐지만 아직 안 만들어진' 상태로 되돌린다 (6분에 죽은 것과 같은 꼴)
{
  na['설정'].find(x=>x[0]==='신규 · 모드')[1]='자동운영'; naCfg_(true);
  const P2=cells['광고생성계획'];
  const back=P2.slice(1).filter(r=>String(r[AP_RESULT-1]).indexOf('성공')===0).slice(0,4);
  back.forEach(r=>{ r[AP_RESULT-1]=''; r[AP_GID-1]=''; r[AP_APPROVE-1]=true; });
  const skus=back.map(r=>adSkuListSplit_(r[AP_SKUS-1])[0]);
  I().forEach(x=>{ if(skus.indexOf(x[NA_I_SKU])>=0){ x[NA_I_GID]=''; x[NA_I_STATE]=NAS_NEW; } });
  let calls=0; const real0=global.adPlanExecStep_;
  global.adPlanExecStep_=()=>{ calls++; return real0(); };
  const r8=naRunStep_({quiet:true});
  global.adPlanExecStep_=real0;
  ok(calls>=1 && r8.made===true,
     '계획도 승인도 새로 안 생겨도, 승인된 채 남은 줄이 있으면 보낸다 (실행 호출 '+calls+' · 새 계획 '+r8.planned+'줄)');
  ok(back.every(r=>String(r[AP_RESULT-1]).indexOf('성공')===0), '   그 '+back.length+'줄이 다시 만들어졌다');
}

// ── 10) 나아가지 않으면 여덟 바퀴 되풀이하지 않는다 ────
{
  const P3=cells['광고생성계획'];
  const one=P3.slice(1).find(r=>String(r[AP_RESULT-1]).indexOf('성공')===0);
  one[AP_RESULT-1]='실패 1회: 광고그룹 — 알 수 없는 오류'; one[AP_GID-1]=''; one[AP_APPROVE-1]=true;
  let calls2=0; const real1=global.adPlanExecStep_;
  global.adPlanExecStep_=()=>{ calls2++; return '캠페인 생성 — 성공 0 · 실패 1 · 완료'; };
  const r9b=naRunStep_({quiet:true});
  global.adPlanExecStep_=real1;
  ok(calls2===1 && r9b.stuck>0,
     '한 바퀴에 아무것도 못 만들면 그만둔다 (실행 호출 '+calls2+' · 막힘 '+r9b.stuck+'줄)');
}

// ── 11) 6분 한도 — 72J 가 남기면 그 자리에서 멈춘다 ────
na['설정'].find(x=>x[0]==='신규 · 모드')[1]='자동운영';
na['설정'].find(x=>x[0]==='신규 · 주간 시작 상품군 수')[1]=1000; naCfg_(true);
for(let i=N+20;i<=N+40;i++){ const sku='늦게'+i+'-XX-1'; const price=3000+i*40;
  cells['상품 목록'].push(srow(sku,'8,000원',price,'늦게'+i)); srcRows[sku]={krw:8000,price:price};
  cells['리스팅'].push(lrow(sku,'B7'+i,price,5)); }
naImportRun_({quiet:true});
let execN=0;
const realExec=global.adPlanExecStep_;
global.adPlanExecStep_=()=>{ execN++; realExec(); return '캠페인 생성 — 성공 2 · 남음 7'; };
const r9=naRunStep_({quiet:true});
ok(r9.timeUp===true && execN===1,
   '72J 가 "남음" 을 돌려주면 한 바퀴에서 멈춘다 (이어실행 트리거가 뒤를 잇는다) — 바퀴 '+r9.passes+' · 실행 호출 '+execN);
ok(r9.ok===2, '   그 바퀴의 성공 수는 센다 ('+r9.ok+')');
global.adPlanExecStep_=realExec;
// 시간이 다 되면 새 바퀴를 시작하지 않는다
const realNow=Date.now; let tick=0;
Date.now=()=>{ tick++; return 1e12 + (tick>60 ? NA_RUN_MS+1 : 0); };
const r10=naRunStep_({quiet:true});
Date.now=realNow;
ok(r10.passes<=2, '시간이 다 되면 새 바퀴를 시작하지 않는다 (바퀴 '+r10.passes+')');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
