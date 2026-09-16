// 신규 상품 광고 매일 주기 (78D · 78E) — 보호 · 판정 · 인계 · 탐색 조정
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const cells={}, na={};
function mk(store,name){ return {
  getName:()=>name, getLastRow:()=>(store[name]||[]).length,
  getLastColumn:()=>((store[name]||[[]])[0]||[]).length||1,
  getMaxRows:()=>Math.max((store[name]||[]).length,1000), getMaxColumns:()=>40,
  insertRowsAfter(){}, insertColumnsAfter(){}, deleteColumns(){}, deleteRows(){}, setFrozenRows(){},
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
global.SpreadsheetApp={openById:id=>({getName:()=>'신규파일',
  getSheetByName:n=>((id==='NEWFILE'?na:cells)[n]?mk(id==='NEWFILE'?na:cells,n):null),
  insertSheet:n=>{const st=id==='NEWFILE'?na:cells; st[n]=st[n]||[]; return mk(st,n);},
  getSheets:()=>Object.keys(id==='NEWFILE'?na:cells).map(n=>mk(id==='NEWFILE'?na:cells,n)),
  deleteSheet(){}}), flush(){}};
let logs=[], alerts=[];
global.log_=(c,l,m)=>logs.push(l+' '+m);
global.ui_=()=>({alert:(a,b)=>{alerts.push([a,String(b||'')]);return 'OK';},ButtonSet:{OK:1}});
global.adBusyGuard_=()=>true; global.headerNotes_=()=>{}; global.withLock_=(n,f)=>f();
global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
global.toast_=()=>{};
const TODAY='2026-09-11';
global.ymd_=d=>{ if(!(d instanceof Date)) return TODAY;
  const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); };
global.adYmd_=x=>x instanceof Date?ymd_(x):String(x==null?'':x).substring(0,10);
global.daysBetween_=(a,b)=>{const p=s=>new Date(s+'T00:00:00Z').getTime();return Math.round((p(b)-p(a))/864e5);};
global.weekStart_=y=>{const d=new Date(y+'T00:00:00Z');const w=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-w);return d.toISOString().substring(0,10);};
global.ensureSheet_=(n,h)=>{if(!cells[n])cells[n]=[h.slice()];return mk(cells,n);};
global.writeTable_=(sh,h,rows)=>{const st=(sh.getName()in na)?na:cells; st[sh.getName()]=[h.slice()].concat(rows);};
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.adSpendMature_=(d,t)=>d?daysBetween_(d,t)>=16:false;
global.SHEET_LISTING='리스팅';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명','검색어','번역일시','가격(JPY)','재고','상태'];
global.SRCCOST_TAB='상품 목록'; global.SRCCOST_COL_KRW=3; global.SRCCOST_COL_PRICE=9;
global.SRCCOST_COL_MJPY=13; global.SRCCOST_COL_SKU=15; global.SRCCOST_COL_SHIP=16;
global.srcKrw_=x=>{const m=String(x==null?'':x).replace(/,/g,'').match(/(\d+(?:\.\d+)?)/);return m?Number(m[1]):0;};
global.MSRC_DEFAULT='기본값'; global.DEFAULT_FEE_RATE=0.10;
let basis={'신규광고 시트 ID':'NEWFILE','마진율 시트 ID':'EXT','확대 · 최대 유효입찰(JPY)':100,'확대 · 모드':'모의운영'};
global.adBasis_=()=>basis;
let units={}; global.adUnitMap_=()=>units;
let marginPct=24.1;
global.adMarginCtx_=()=>({rate:8.644});
global.adMarginFor_=()=>marginPct>0?{pct:marginPct,src:'소싱 조달비',why:'소싱'}
                                   :{pct:0,src:'원가 계산(적자)',why:'⛔ 팔수록 손해입니다'};
global.SHEET_ADPLAN='광고생성계획';
global.ADPLAN_HEADER=['계획ID','동작','방식','캠페인명','유형','일예산(JPY)','입찰(JPY)','SKU수','기존SKU수','대표SKU','CPC구간','손익분기CPA(JPY)','월매출합(JPY)','기존광고제거','근거','SKU목록','광고그룹ID','승인','결과','캠페인ID','광고ID들','트랙'];
global.AP_ACTION=2;global.AP_NAME=4;global.AP_DAILY=6;global.AP_BID=7;global.AP_SKUS=16;
global.AP_GID=17;global.AP_APPROVE=18;global.AP_RESULT=19;global.AP_CID=20;global.AP_ADIDS=21;global.AP_TRACK=22;
global.adSkuListJoin_=a=>a.join(' | ');
global.adSkuListSplit_=t=>String(t==null?'':t).split(/\s*\|\s*|,/).map(s=>s.trim()).filter(Boolean);
global.adPlanSkus_=r=>{const l=String(r[AP_SKUS-1]||'').trim(),p=String(r[9]||'').trim();return (l&&p&&l===p)?[l]:adSkuListSplit_(l);};
global.adIsGivenUp_=s=>/그만/.test(String(s||''));
global.adPromoBand_=(t,b,m)=>{b=b>0?b:2;m=m>1?m:1.5;if(!(t>0))return null;
  if(t<b)return{i:0};let i=Math.floor(Math.log(t/b)/Math.log(m));if(!isFinite(i)||i<0)i=0;if(i>12)i=12;return{i:i};};
global.SHEET_ADGRP='광고그룹';
global.ADGRP_HEADER=['캠페인','유형','광고그룹','상태','기본입찰','SKU수','전용가능','대상수','캠페인ID','광고그룹ID','수집일시'];
global.ADSPEND_PENDING='리포트 준비 중'; global.adSchedRun_=(h,l,fn)=>fn(); global.adPlanTrackGet_=()=>''; global.adPlanTrackSet_=()=>{}; global.adPlanOnlyGet_=()=>''; global.adPlanOnlySet_=()=>{};
global.adPlanExecStep_=()=>'성공 0 · 완료';
global.adsToken_=()=>'T';
global.ADSW_CT_CAMPAIGN='c';global.ADSW_CT_ADGROUP='g';global.ADSW_CT_PRODUCTAD='p';
let puts=[];
global.adsApiRetry_=(t,m,p,b)=>{puts.push({m:m,p:p,b:b});
  if(p==='/sp/productAds')return{productAds:{success:b.productAds.map((x,i)=>({index:i,adId:x.adId}))}};
  if(p==='/sp/adGroups')return{adGroups:{success:b.adGroups.map((x,i)=>({index:i,adGroupId:x.adGroupId}))}};
  if(p==='/sp/campaigns')return{campaigns:{success:b.campaigns.map((x,i)=>({index:i,campaignId:x.campaignId}))}};
  throw new Error('unexpected '+p);};
global.adsCreated_=(res,key,f)=>{const s=res&&res[key]&&res[key].success;
  return {ok:!!s, ids:(s||[]).map(x=>String(x[f])), msg:''};};
global.adUnitMarkPaused_=()=>0;
global.adPromoteStopOld_=()=>({paused:0});
global.adSpendRead_=()=>({rows:[],last:'',has:false});
global.adSpendSum_=()=>({cost:0});
global.adPendingSpend_=()=>0;
global.SPEND_OVERSPEND_MULT=1.25;
global.PROMO_TRACK='X';
global.naOurCampaigns_=undefined;

global.ADS_SOFT_MS=240000; 
eval(fs.readFileSync('all/78_신규광고.js','utf8'));
eval(fs.readFileSync('all/78B_신규광고_가져오기.js','utf8'));
eval(fs.readFileSync('all/78C_신규광고_실행.js','utf8'));
eval(fs.readFileSync('all/78D_신규광고_실적.js','utf8'));
eval(fs.readFileSync('all/78E_신규광고_주기.js','utf8'));

// ── 자료 ────────────────────────────────────────────────
function srow(sku,krw,price,mj){const r=new Array(16).fill('');
  r[0]='u';r[2]=krw;r[5]='2026-08-01';r[6]=sku;r[8]=price;r[12]=mj;r[14]=sku;r[15]='일반';return r;}
function lrow(sku,asin,price,stock,state){return [sku,asin,'n','','','',price,stock,state||'Active'];}
const SK=['정상-A-1','품절-B-1','비활성-C-1','판돈끝-D-1','인계-E-1','수익-F-1','관찰-G-1','주문0-H-1','저노출-I-1','무반응-J-1','적자-K-1'];
cells['상품 목록']=[new Array(16).fill('h')].concat(SK.map(s=>srow(s,'8,000원',4120,993)));
cells['리스팅']=[LISTING_HEADER].concat(SK.map(s=>lrow(s,'B0'+s,4120,10)));
setupNewAds();
naImportRun_({quiet:true});
const I=()=>na['상품통합'].slice(1);
const byS=()=>{const o={};I().forEach(r=>{o[r[NA_I_SKU]]=r;});return o;};
ok(I().filter(r=>r[NA_I_ALLOC]===NAA_START).length===SK.length, '① 이 '+SK.length+'개를 시작 대기로 뒀다');

// 자동운영으로 바꿔 실제로 시작한다 (가짜 실행이 ID 를 박는다)
na['설정'].find(x=>x[0]==='신규 · 모드')[1]='자동운영'; naCfg_(true);
let seq=0, campByName={};
global.adPlanExecStep_=()=>{const sh=cells['광고생성계획'];let n=0;
  for(let i=1;i<sh.length;i++){const r=sh[i];
    if(r[AP_APPROVE-1]!==true||String(r[AP_RESULT-1]||'').indexOf('성공')===0) continue;
    const nm=String(r[AP_NAME-1]); let cid=String(r[AP_CID-1]||'').trim();
    if(!cid){cid=campByName[nm]||('C'+(++seq)); campByName[nm]=cid; r[AP_CID-1]=cid;}
    r[AP_GID-1]='G'+(++seq); r[AP_RESULT-1]='성공'; n++;}
  return '캠페인 생성 — 성공 '+n+' · 완료';};
naRunStep_({quiet:true});
const started=I().filter(r=>r[NA_I_STATE]===NAS_PROBE);
ok(started.length===SK.length, '② 가 '+started.length+'개를 시작했다');
// 켜진 상품광고 목록
units={}; I().forEach(r=>{units[r[NA_I_SKU]]={ads:[{id:'AD'+r[NA_I_SKU],gid:r[NA_I_GID],state:'ENABLED'}],on:1};});

// ── 실적을 넣는다 ───────────────────────────────────────
// 성숙(16일 전) 날짜와 최근 날짜를 갈라 쓴다
const OLD='2026-08-20';     // 22일 전 → 성숙
const NEW2='2026-09-10';    // 1일 전 → 잠정
function perf(sku,d,cost,sales,im,ck,od){return [d,sku,'A','KP NEW B1-1',cost,sales,im,ck,od];}
let P=[];
P.push(perf('인계-E-1',OLD,400,9000,5000,60,4));         // 클릭 50↑ 주문 3↑ 이익>0 → 인계
P.push(perf('수익-F-1',OLD,200,4000,3000,30,2));         // 주문 2 이익>0 → 수익운영
P.push(perf('관찰-G-1',OLD,150,2000,2000,20,1));         // 주문 1 → 관찰
P.push(perf('주문0-H-1',OLD,900,0,4000,40,0));           // 판돈 소진 + 주문 0 → 중단
P.push(perf('저노출-I-1','2026-09-06',20,0,50,1,0));      // 5일 전 · 노출 거의 없음 → 입찰 인상
P.push(perf('무반응-J-1','2026-09-06',0,0,1500,0,0));     // 5일 전 · 노출 1500 클릭 0 → LOW_RELEVANCE
P.push(perf('정상-A-1',NEW2,50,0,800,6,0));              // 잠정 자료만 → 아무것도 안 한다
naPerfWrite_(P,'2026-08-01','2026-09-10');
ok(na['신규광고일별'].length-1===P.length, '신규광고일별에 '+(na['신규광고일별'].length-1)+'줄');
const pf=naPerfBySku_();
ok(pf.bySku['인계-E-1'].mCk===60 && pf.bySku['정상-A-1'].mCk===0,
   '성숙은 날짜로 다시 센다 — 22일 전 클릭은 성숙(60), 1일 전 클릭은 잠정(0)');

// 판돈을 소진시킨다
const famOf=k=>na['상품군광고'].slice(1).find(x=>x[NA_F_KEY]===k);
famOf('주문0-H')[NA_F_POT]=800;
// 보호 대상 세 개
cells['리스팅'].find(r=>r[0]==='품절-B-1')[7]=0;
cells['리스팅'].find(r=>r[0]==='비활성-C-1')[8]='Inactive';
cells['리스팅']=cells['리스팅'].filter(r=>r[0]!=='판돈끝-D-1');   // 리스팅에서 사라짐

// ── 주기 ────────────────────────────────────────────────
// ② 가 [다음평가일] 을 오늘로 적어 뒀다. 사흘 규칙을 보려면 하루 지난 것으로 둔다
I().forEach(r=>{ if(r[NA_I_NEXT]===TODAY) r[NA_I_NEXT]='2026-09-08'; });
puts=[];
const r1=naCycleRun_({quiet:true});
const B=byS();
// 뒤에서 주기를 더 돌리면 같은 줄 객체가 다시 쓰인다 — 이 시점의 사유를 떠 둔다
const WHY1={}; Object.keys(B).forEach(k=>{WHY1[k]=String(B[k][NA_I_WHY]);});
console.log('  ── 보호 ──');
ok(B['품절-B-1'][NA_I_STATE]===NAS_STOP && /재고가 0/.test(B['품절-B-1'][NA_I_WHY]), '재고 0 → 멈춤');
ok(B['비활성-C-1'][NA_I_STATE]===NAS_STOP && /Inactive/.test(B['비활성-C-1'][NA_I_WHY]), '리스팅 비활성 → 멈춤');
ok(B['판돈끝-D-1'][NA_I_STATE]===NAS_STOP && /사라졌습니다/.test(B['판돈끝-D-1'][NA_I_WHY]), '리스팅에서 사라짐 → 멈춤');
ok(r1.guard===3, '   보호로 멈춘 것 '+r1.guard+'개');
console.log('  ── 판정 ──');
ok(B['수익-F-1'][NA_I_STATE]===NAS_PROFIT && /성숙 주문 2/.test(B['수익-F-1'][NA_I_WHY]), '성숙 주문 2 · 이익>0 → 수익운영');
ok(B['관찰-G-1'][NA_I_STATE]===NAS_WATCH, '성숙 주문 1 → 관찰');
ok(B['주문0-H-1'][NA_I_STATE]===NAS_STOP && /판돈/.test(B['주문0-H-1'][NA_I_WHY]),
   '판돈을 다 쓰면 판정 전에 먼저 멈춘다 (보호) — '+String(B['주문0-H-1'][NA_I_WHY]).substring(0,46));
ok(adYmd_(famOf('주문0-H')[NA_F_COOL])>TODAY, '   중단한 상품군은 냉각일이 붙는다 ('+adYmd_(famOf('주문0-H')[NA_F_COOL])+')');
ok(B['정상-A-1'][NA_I_STATE]===NAS_PROBE && /탐색 중/.test(B['정상-A-1'][NA_I_WHY]),
   '잠정 자료만 있으면 아무 판정도 하지 않는다 — 어제 클릭에 붙을 주문을 아직 모른다');
console.log('  ── 인계 ──');
// 기본은 켜짐. 먼저 꺼서 '수익운영에 머무는' 쪽을 본다
const setCfg=(k,v)=>{const r=na['설정'].find(x=>x[0]===k); if(r) r[1]=v; else na['설정'].push([k,v,'']); naCfg_(true);};
setCfg('신규 · 인계 켜기','FALSE');
naCycleRun_({quiet:true});
ok(byS()['인계-E-1'][NA_I_STATE]===NAS_PROFIT && /인계 켜기\] 가 꺼져/.test(byS()['인계-E-1'][NA_I_WHY]),
   '[신규 · 인계 켜기] 를 끄면 근거가 쌓여도 수익운영에 머문다');
setCfg('신규 · 인계 켜기','TRUE');
ok(naPolicy_().handover===true, '   기본(빈칸)과 TRUE 는 켜짐 — FALSE 라고 적어야만 꺼진다');
naCycleRun_({quiet:true});
ok(byS()['인계-E-1'][NA_I_STATE]===NAS_PROFIT && /EXPAND 가 자동운영이 아닙니다/.test(byS()['인계-E-1'][NA_I_WHY]),
   '켜도 EXPAND 가 모의운영이면 넘기지 않는다');
basis['확대 · 모드']='자동운영';
naCycleRun_({quiet:true});
ok(byS()['인계-E-1'][NA_I_OWNER]==='EXPAND' && byS()['인계-E-1'][NA_I_STATE]===NAS_HANDED,
   'EXPAND 가 자동운영이면 소유권을 넘긴다 (클릭 60 · 주문 4)');
const handed=byS()['인계-E-1'];
naCycleRun_({quiet:true});
ok(byS()['인계-E-1'][NA_I_OWNER]==='EXPAND', '   넘긴 뒤에는 신규가 그 줄을 만지지 않는다');
console.log('  ── 탐색 조정 ──');
ok(/입찰 ¥.* → ¥/.test(WHY1['저노출-I-1']), '저노출이면 입찰을 올린다 — '+WHY1['저노출-I-1'].substring(0,52));
const bidPut=puts.filter(p=>p.p==='/sp/adGroups');
ok(bidPut.length>=1 && bidPut[0].b.adGroups[0].defaultBid>0, '   광고그룹 기본입찰 PUT 을 보냈다 (¥'+bidPut[0].b.adGroups[0].defaultBid+')');
const raised=byS()['저노출-I-1'];
ok(Number(raised[NA_I_BID])===bidPut[0].b.adGroups[0].defaultBid, '   보낸 뒤에만 시트의 입찰을 고친다');
ok(/LOW_RELEVANCE/.test(WHY1['무반응-J-1']), '노출 1500 에 클릭 0 이면 더 올리지 않는다 (LOW_RELEVANCE)');
const stopPut=puts.filter(p=>p.p==='/sp/productAds');
ok(stopPut.length>=1, '   멈춤은 상품광고 PUT 으로 보낸다 ('+stopPut.length+'번) — 캠페인·그룹은 그대로 둔다');
ok(!puts.some(p=>p.p==='/sp/campaigns'), '   캠페인은 건드리지 않는다');

// ── 허용 상한을 넘겨 올리지 않는다 ──────────────────────
const capOf=r=>Number(r[NA_I_CAP]);
ok(Number(raised[NA_I_BID])<=capOf(raised)+0.01, '입찰은 허용 상한 ¥'+capOf(raised)+' 을 넘지 않는다 (¥'+raised[NA_I_BID]+')');

// ── 다시 켜기 — 보호로 멈춘 것은 원인이 사라지면 바로 ──
console.log('  ── 다시 켜기 ──');
units['품절-B-1'].ads[0].state='PAUSED';           // 멈춰 뒀다
cells['리스팅'].find(r=>r[0]==='품절-B-1')[7]=12;    // 재고가 들어왔다
puts=[];
const rr=naCycleRun_({quiet:true});
ok(byS()['품절-B-1'][NA_I_STATE]===NAS_PROBE && /다시 켭니다/.test(byS()['품절-B-1'][NA_I_WHY]),
   '재고가 들어오면 같은 광고그룹의 광고를 다시 켠다 (새 그룹을 만들지 않는다)');
const en=puts.filter(p=>p.p==='/sp/productAds' && p.b.productAds[0].state==='ENABLED');
ok(en.length===1 && en[0].b.productAds[0].adId==='AD품절-B-1', '   ENABLED PUT 을 보냈다 ('+(en[0]&&en[0].b.productAds[0].adId)+')');
ok(rr.resumed===1, '   다시 켠 수 '+rr.resumed);
// 판정으로 멈춘 것은 냉각 + G 20% 변화가 있어야
const hf=famOf('주문0-H'); hf[NA_F_COOL]='2026-09-01';   // 냉각 끝
units['주문0-H-1'].ads[0].state='PAUSED';
naCycleRun_({quiet:true});
ok(byS()['주문0-H-1'][NA_I_STATE]===NAS_STOP && /거의 그대로/.test(byS()['주문0-H-1'][NA_I_WHY]),
   '판정으로 멈춘 것은 냉각이 끝나도 G 가 그대로면 다시 켜지 않는다 — 같은 조건이면 같은 결과');
marginPct=60;                                          // 조달비가 내려 G 가 24% → 60% (판돈 상한 ¥1,000 이 누적 ¥900 을 넘는다)
/* 누적 ¥900 은 실적에서 다시 센다 — 새 판돈 ¥1,000 이 그것을 넘어야 켜진다 */
naCycleRun_({quiet:true});
ok(byS()['주문0-H-1'][NA_I_STATE]===NAS_PROBE && /달라져 다시 켭니다/.test(byS()['주문0-H-1'][NA_I_WHY]),
   '   G 가 20% 넘게 달라지면 판돈을 다시 세고 켠다 (판돈 ¥'+hf[NA_F_POT]+' · 누적 ¥'+hf[NA_F_SPENT]+' 은 잇는다)');
marginPct=24.1;

// ── 판돈은 탐색비 한도지 이익 한도가 아니다 ──────────────
console.log('  ── 판돈과 수익운영 ──');
const ff=famOf('수익-F'); ff[NA_F_POT]=100;              // 누적 광고비 200 > 판돈 100, 그러나 벌고 있다
naCycleRun_({quiet:true});
ok(byS()['수익-F-1'][NA_I_STATE]===NAS_PROFIT, '수익운영은 누적 광고비가 판돈을 넘어도 끄지 않는다 (위험손실만 본다) — '+byS()['수익-F-1'][NA_I_STATE]);
ff[NA_F_POT]=1000;

// ── 마진이 무너지면 멈춘다 ──────────────────────────────
marginPct=-1;
const r2=naCycleRun_({quiet:true});
ok(byS()['정상-A-1'][NA_I_STATE]===NAS_STOP && /손해/.test(byS()['정상-A-1'][NA_I_WHY]),
   '조달비·값이 바뀌어 적자가 되면 멈춘다');
marginPct=24.1;

// ── 모의운영이면 아마존에 안 보낸다 ─────────────────────
na['설정'].find(x=>x[0]==='신규 · 모드')[1]='모의운영'; naCfg_(true);
// 다시 시작 대기로 되돌려 놓고
I().forEach(r=>{if(r[NA_I_STATE]===NAS_STOP){r[NA_I_STATE]=NAS_PROBE;}});
cells['리스팅'].find(r=>r[0]==='품절-B-1')[7]=0;
puts=[];
const r3=naCycleRun_({quiet:true});
ok(!r3.sent && puts.length===0, '모의운영: 아마존에 아무것도 안 보낸다 (PUT '+puts.length+'번)');
ok(r3.guard>0, '   그래도 판단은 하고 시트에 적는다 (보호 '+r3.guard+'개)');
ok(/모의운영이라 아마존에/.test((()=>{alerts=[];naCycle();return alerts[0][1];})()),
   '   그리고 "멈춰야 할 광고가 있으면 그동안 계속 돈이 나간다" 고 알린다');

// ── 아마존이 광고를 안 받아 줄 때 다시 시도 ─────────────
na['설정'].find(x=>x[0]==='신규 · 모드')[1]='자동운영'; naCfg_(true);
const ps=cells['광고생성계획'];
ps[1][AP_RESULT-1]='실패 1회: 상품 등록 — adEligibilityError → 아마존이 이 상품의 광고를 허용하지 않습니다';
ps[1][AP_APPROVE-1]=true;
const r4=naCycleRun_({quiet:true});
ok(r4.retried===1 && ps[1][AP_RESULT-1]==='', '72J 가 남기는 실제 문구(adEligibilityError → 허용하지 않습니다)를 알아보고 결과를 비워 다시 시도한다');
ok(/첫거절/.test(String(ps[1][14])), '   첫 거절 날짜를 근거 칸에 남긴다 — '+String(ps[1][14]).substring(String(ps[1][14]).indexOf('[')).substring(0,40));
// 3주가 지나면 그만둔다
ps[1][AP_RESULT-1]='실패 — ineligible';
ps[1][14]=String(ps[1][14]).replace(/\[\d{4}-\d{2}-\d{2} 첫거절\]/,'[2026-08-01 첫거절]');
const r5=naCycleRun_({quiet:true});
ok(r5.gaveUp===1 && /그만둠/.test(String(ps[1][AP_RESULT-1])),
   '   3주가 지나면 그만두고 사람이 볼 수 있게 남긴다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
