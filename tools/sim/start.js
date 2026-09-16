// 앞 단추 둘 — ① 후보 찾기·확인(판정·승인) → ② 시작 (72AB · 72AG) · 광고 자료 갱신 사슬 (72X)
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
let alerts=[], answer='YES', today='2026-09-05', triggers=[];
global.PROMO_TRACK='X'; if(typeof global.AP_TRACK==='undefined') global.AP_TRACK=22;
global.ADS_SOFT_MS=4*60*1000;
global.ss_=()=>ss;
global.ui_=()=>({alert:(a,b)=>{alerts.push([a,String(b||'')]);return answer;},
  ButtonSet:{OK:1,YES_NO:2},Button:{YES:'YES',NO:'NO'}});
global.SpreadsheetApp={flush(){}};
const props={};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,
  setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})};
global.ScriptApp={getProjectTriggers:()=>triggers,deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t);},
  WeekDay:{MONDAY:1},
  newTrigger:h=>({timeBased:()=>({after:()=>({create(){triggers.push({getHandlerFunction:()=>h,kind:'after'});}}),
    atHour:()=>({everyDays:()=>({create(){triggers.push({getHandlerFunction:()=>h,kind:'daily'});}})}),
    onWeekDay:()=>({atHour:()=>({create(){triggers.push({getHandlerFunction:()=>h,kind:'weekly'});}})})})})};
global.log_=()=>{}; global.showSheet_=()=>{}; global.headerNotes_=()=>{}; global.toast_=()=>{};
global.uiSilent_=()=>{}; global.notifyAlert_=()=>{};
global.withLockOrRetry_=(n,h,fn)=>fn();
global.writeTable_=(sh,h,rows)=>{cells[sh.getName()]=[h.slice()].concat(rows.map(r=>r.slice()));};
global.makeOneSheet_=specs=>{const n=specs[0].name;
  if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.madeSheetStop_=(made)=>{ if(!made) return false; alerts.push(['만듦',made]); return true; };
global.getSheetOrThrow_=n=>{ if(!cells[n]) throw new Error('없음 '+n); return sheets[n]||(sheets[n]=mkSheet(n)); };
global.ymd_=d=>today;
global.addDays_=(ymd,n)=>{const d=new Date(ymd+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.SHEET_ADS='광고실적';
global.ADS_HEADER=['날짜','SKU','ASIN','캠페인','광고비(JPY)','광고매출(JPY)','노출','클릭','광고주문','수집일시'];
global.SHEET_LISTING='리스팅'; global.SHEET_ADLOG='광고변경대장'; global.SHEET_ADGROW='광고육성';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명','검색어','번역일시','가격(JPY)','재고','상태'];
global.SHEET_ADGRP='광고그룹';
global.ADGRP_HEADER=['캠페인','유형','광고그룹','상태','기본입찰','SKU수','전용가능','대상수','캠페인ID','광고그룹ID','수집일시'];
global.SHEET_ADSTRUCT='광고구조'; global.SHEET_SPENDDAY='광고캠페인일별';
global.ADSW_CT_CAMPAIGN='c'; global.ADSW_CT_ADGROUP='g'; global.ADSW_CT_PRODUCTAD='p';
global.DEFAULT_FEE_RATE=0.10; global.JOB_DOWN_PCT=0.20;
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
global.costMap_=()=>({}); global.fxHouseRate_=()=>9.5; global.skuCostMap_=()=>({});
global.costInfoMap_=()=>({}); global.resolveShipping_=()=>({fee:0,src:''});
global.unitProfitKrw_=()=>0; global.normName_=s=>String(s||''); global.externalMarginMap_=()=>({});
let basis={'기본 마진율':0.17,'확대 · 모드':'자동운영','확대 · 최대 동시 시험 수':10,
  '확대 · 시험 주간 지출한도(JPY)':50000,'확대 · 시험 손실한도(JPY)':20000,'확대 · 최대 유효입찰(JPY)':50,
  '확대 · 대조군 비율':0.0001};
global.adBasis_=()=>basis;
let api=[];
global.adJobSend_=(t,act,kind,tid,to)=>{api.push({act,kind,tid,to});return {ok:true,ids:[tid],msg:''};};
global.adsApiRetry_=(t,m,p,b)=>{api.push({act:'PUT '+p,ids:(b.productAds||[]).map(x=>x.adId),state:(b.productAds||[{}])[0].state});
  return {productAds:{success:(b.productAds||[]).map(x=>({adId:x.adId}))}};};
global.adsCreated_=r=>({ok:true,ids:(r.productAds&&r.productAds.success||[]).map(x=>x.adId),msg:''});
global.adSpendRead_=()=>({rows:[],has:false});
// 자료 갱신 사슬이 부르는 수집기들 — 몇 번 불렸는지만 센다
const called={structure:0,units:0,spend:0,ads:0};
global.fetchAdStructure=()=>{called.structure++;};
let unitsLeft=2;
global.adUnitStep_=()=>{called.units++; if(!cells['상품광고목록']) throw new Error('탭 "상품광고목록"이 없습니다');
  unitsLeft--; if(unitsLeft>0) props['ADUNIT_NEXT']='N'; else delete props['ADUNIT_NEXT']; return 'x';};
global.adUnitSheet_=()=>{ if(!cells['상품광고목록']) cells['상품광고목록']=[['SKU']]; return mkSheet('상품광고목록'); };
global.EXPAND_HEADER=global.EXPAND_HEADER||['SKU']; 
global.adUnitContinue_=()=>{}; global.PROP_ADUNIT_NEXT='ADUNIT_NEXT'; global.PROP_ADUNIT_ROW='ADUNIT_ROW';
let spendPending=1; global.ADSPEND_PENDING='리포트 준비 중';
global.fetchAdSpendDaily=()=>{called.spend++; return (spendPending-->0)?ADSPEND_PENDING:'ok';};
global.PROP_ADS_QUEUE='ADS_QUEUE'; global.PROP_ADS_REPORT='ADS_REPORT';
global.adsWindows_=()=>['a|b','c|d'];
global.adsReportStep_=()=>{called.ads++; const q=JSON.parse(props['ADS_QUEUE']||'[]'); q.shift();
  if(q.length) props['ADS_QUEUE']=JSON.stringify(q); else delete props['ADS_QUEUE']; return '한 구간';};
global.adsScheduleContinue_=()=>{};
global.buildAdStopCandidates=()=>{};

global.adPlanOnlySet_=global.adPlanOnlySet_||(()=>{}); global.adPlanTrackSet_=()=>{}; global.PROMO_TRACK=global.PROMO_TRACK||'X';
for(const f of ['72AA_마진','72AB_확대후보','72AD_멈춤후보','72AE_확대시험','72AF_확대결과','72AH_승격','72AG_광고시작','72X_광고자동'])
eval(fs.readFileSync('all/'+f+'.js','utf8'));
// 72X 가 부르는 다른 걸음들 (여기서는 안 본다)
global.fetchAdTerms=()=>{}; global.runAdGrowCycle=()=>{}; global.advanceAdGrow=()=>{}; global.verifyAdJobs=()=>{};

// ── 자료 ────────────────────────────────────────────────
const D='2026-08-15';
cells['광고실적']=[ADS_HEADER,
  // 판단주문율은 계정 전체 주문율(여기서는 72/1600 = 4.5%) 쪽으로 눌린다 — 목표는 그 값으로 난다.
  // GROW: 클릭 500 · 주문 26 · CPC ¥5 — 목표 ¥5.68 (여유 1.14배) → 증액 시험
  [D,'GROW','B0G','c',2500,26000,50000,500,26,''],
  // HIGH: 클릭 300 · 주문 20 · CPC ¥8 — 팔리지만 목표(¥7.02)보다 높음 → 감액 (전용 그룹 · 입찰 8)
  [D,'HIGH','B0H','c',2400,20000,30000,300,20,''],
  // DEAD: 클릭 300 · 주문 0 → 멈춤 · 확실
  [D,'DEAD','B0D','c',1500,0,30000,300,0,''],
  // BIG: 여유 크지만 몰아넣기 그룹 → 분리 필요
  [D,'BIG','B0B','c',2500,26000,50000,500,26,'']];
cells['리스팅']=[LISTING_HEADER].concat(['GROW','HIGH','DEAD','BIG'].map((s,i)=>[s,'B0'+s[0],'なまえ'+i,'','','',1000,10,'Active']));
cells['광고그룹']=[ADGRP_HEADER,
  ['빅','자동','big','ENABLED',5,'25개 넘음','',3,'C9','G9',''],
  ['전용G','자동','gg','ENABLED',5,1,'O',2,'C1','G1',''],
  ['전용H','자동','gh','ENABLED',8,1,'O',2,'C2','G2','']];
cells['광고구조']=[['캠페인','캠페인ID','일예산(JPY)'],['전용G','C1',1000],['전용H','C2',1000]];
global.adUnitCollectedAt_=()=>'2026-09-06';
global.adUnitMap_=()=>({
  GROW:{ads:[{id:'adG',gid:'G1',cid:'C1',camp:'전용G',state:'ENABLED'}],on:1},
  HIGH:{ads:[{id:'adH',gid:'G2',cid:'C2',camp:'전용H',state:'ENABLED'}],on:1},
  DEAD:{ads:[{id:'adD1',gid:'G9',cid:'C9',camp:'빅',state:'ENABLED'},{id:'adD2',gid:'G9',cid:'C9',camp:'빅',state:'ENABLED'}],on:2},
  BIG:{ads:[{id:'adB',gid:'G9',cid:'C9',camp:'빅',state:'ENABLED'}],on:1}});

// ── 1) ① 후보 찾기·확인 — 한 표에 판정이 다 모인다 ─────
buildAdExpandCandidates(); alerts=[]; buildAdExpandCandidates();
const H=EXPAND_HEADER, col=n=>H.indexOf(n);
const byS=()=>{const o={}; (cells['광고확대후보']||[]).slice(1).forEach(r=>{o[r[0]]=r;}); return o;};
let t=byS();
ok(t['DEAD'][col('판정')]===ASV_STOP && t['DEAD'][col('바꿀 것')]==='광고 2개 멈춤',
   'DEAD → '+t['DEAD'][col('판정')]+' · '+t['DEAD'][col('바꿀 것')]);
ok(t['GROW'][col('판정')]===EXA_TEST && /입찰 ¥5 → ¥5\.5/.test(t['GROW'][col('바꿀 것')]),
   'GROW → '+t['GROW'][col('판정')]+' · '+t['GROW'][col('바꿀 것')]);
ok(t['HIGH'][col('판정')]===EXA_DOWN && /¥8 → ¥7\.02/.test(t['HIGH'][col('바꿀 것')]),
   'HIGH → '+t['HIGH'][col('판정')]+' · '+t['HIGH'][col('바꿀 것')]+' (목표까지, 한 번에 20% 까지)');
ok(t['BIG'][col('판정')]===EXA_SPLIT, 'BIG → '+t['BIG'][col('판정')]+' (몰아넣기 그룹)');
ok(cells['광고확대후보'][1][0]==='DEAD', '할 일이 있는 줄이 위로 온다 (첫 줄 '+cells['광고확대후보'][1][0]+')');
ok(t['DEAD'][col('승인')]===false && t['GROW'][col('승인')]===false, '만들 때 승인은 전부 꺼져 있다');

// ── 2) ② 시작 — 승인한 줄만, 판정대로 ─────────────────
api=[]; alerts=[]; startAdActions();
ok(api.length===0 && alerts[0][1].indexOf('승인')>=0, '승인이 없으면 아무것도 안 보낸다');
for(const r of cells['광고확대후보'].slice(1)) if(['DEAD','GROW','HIGH'].includes(r[0])) r[col('승인')]=true;
api=[]; answer='NO'; startAdActions();
ok(api.length===0, '마지막 확인에 아니오면 안 보낸다');
answer='YES'; api=[]; alerts=[]; triggers=[]; startAdActions();
const stop=api.filter(x=>String(x.act).indexOf('PUT /sp/productAds')===0);
ok(stop.length===1 && stop[0].ids.join(',')==='adD1,adD2' && stop[0].state==='PAUSED',
   '멈춤: DEAD 의 광고 2개만 PAUSED ('+(stop[0]&&stop[0].ids.join(','))+')');
const down=api.find(x=>x.act==='입찰변경'&&x.tid==='G2');
ok(down && down.to===7.02, '감액: HIGH 의 그룹 입찰 8 → 7.02 (바로, 시험 없이)');
const up=api.find(x=>x.act==='입찰변경'&&x.tid==='G1');
ok(up && up.to===5.5, '증액 시험: GROW 의 그룹 입찰 5 → 5.5 (시험 표에 줄이 서고 시험군만 올림)');
ok(!api.some(x=>x.tid==='G9'), '   몰아넣기 그룹(G9)의 입찰은 건드리지 않는다');
t=byS();
ok(/멈춤 2개/.test(t['DEAD'][col('결과')]) && /감액/.test(t['HIGH'][col('결과')]) && /시험 시작/.test(t['GROW'][col('결과')]),
   '결과가 표에 적힌다 — "'+t['DEAD'][col('결과')]+'" · "'+t['HIGH'][col('결과')]+'" · "'+t['GROW'][col('결과')]+'"');
const test=(cells[SHEET_EXTEST]||[]).slice(1).find(r=>r[XT_SKU]==='GROW');
ok(test && test[XT_STATE]===XS_RUN && test[XT_RUNTO]==='2026-09-19', '시험 표: GROW 시험중 · 운영종료 '+(test&&test[XT_RUNTO]));
ok(triggers.length===AD_AUTOMATIONS.length, '걸음 '+triggers.length+'개가 걸린다 (되돌림·판정·채택·자료 갱신·후보)');
ok(logged.length>=3, '대장에 셋 다 남는다 ('+logged.length+'줄)');

// ── 2-b) 멈춘 줄이 정말 멈췄는지 대조한다 ──────────────
// 대장·표에 "보냈다" 고 적히는 것과 실제로 그렇게 된 것은 다르다
ok(adStopCheck_('멈춤 2개 · 2026-09-05', {ads:[],on:0}, '2026-09-06')==='멈춤 2개 · 2026-09-05 · 확인 O (2026-09-06 자료)',
   '켜진 광고가 0 이면 "확인 O" 를 붙인다');
ok(/⚠ 아직 켜짐 1개/.test(adStopCheck_('멈춤 2개 · 2026-09-05', {ads:[],on:1}, '2026-09-06')),
   '   아직 켜져 있으면 몇 개인지 적는다 (누가 다시 켰거나 아마존이 안 받은 것)');
ok(adStopCheck_('멈춤 2개 · 확인 O (2026-09-06 자료)', {ads:[],on:0}, '2026-09-07')==='멈춤 2개 · 확인 O (2026-09-07 자료)',
   '   다시 볼 때 확인 문구가 겹쳐 붙지 않는다');
ok(adStopCheck_('감액 ¥8 → ¥7', {ads:[],on:1}, '2026-09-06')==='감액 ¥8 → ¥7',
   '   멈춤이 아닌 줄은 건드리지 않는다');
// 판정 이유가 [사유] 에 온다 (분류 이유가 아니라)
const w=byS();
ok(/클릭 300회에 주문 0건/.test(w['DEAD'][col('사유')]),
   '[사유] 에 판정 이유를 적는다 — "'+String(w['DEAD'][col('사유')]).slice(0,34)+'"');

// ── 2-c) 분리 필요를 승인하면 승격 계획이 선다 ──────────
// 진짜 planAdPromoteBands 를 돌린다 (같은 파일 안의 함수는 stub 으로 못 덮는다)
global.ADPLAN_HEADER=['계획ID','동작','방식','캠페인명','유형','일예산(JPY)','입찰(JPY)','SKU수','기존SKU수','대표SKU','CPC구간','손익분기CPA(JPY)','월매출합(JPY)','기존광고제거','근거','SKU목록','광고그룹ID','승인','결과','캠페인ID','광고ID들','트랙'];
global.SHEET_ADPLAN='광고생성계획'; global.AP_NAME=4; global.AP_APPROVE=18; global.AP_DAILY=6; global.AP_BID=7;
global.adPlanRow_=o=>['',o.action,o.kind,o.name,'자동',o.daily,Math.round(o.bid),o.skus.length,0,
  o.skus[0].sku,o.band,Math.round(o.beMin),Math.round(o.amt),'실행 시 확인',o.why,
  o.skus.map(x=>x.sku).join(', '),'',false,'','','','A'];
basis['확대 · 승격 일예산 상한(JPY)']=5000;
basis['묶음 CPC 기준점']=2; basis['묶음 CPC 배수']=1.5; basis['한 번에 올릴 최대 배수']=3;
basis['일예산 여유 배수']=2; basis['최소 일예산']=100;
let ranExec=false; global.adPlanExecStep_=()=>{ranExec=true;};
for(const r of cells['광고확대후보'].slice(1)) if(r[0]==='BIG') r[col('승인')]=true;
api=[]; alerts=[]; startAdActions();
const pl=(cells['광고생성계획']||[]).slice(1);
ok(pl.length===1 && /BIG/.test(String(pl[0][15])),
   '승인한 분리 필요 SKU 가 가격선 캠페인 계획이 된다 ('+(pl[0]&&pl[0][3])+' · '+(pl[0]&&pl[0][15])+')');
ok(pl[0][AP_APPROVE-1]===true && ranExec===true, '   승인 ✓ 로 넣고 만들기까지 이어 부른다');
const bg=byS();
ok(/승격 계획/.test(bg['BIG'][col('결과')]), '   결과 칸에 적는다 — "'+bg['BIG'][col('결과')]+'"');
ok(/승격/.test(alerts[alerts.length-1][1]), '   알림에도 승격을 알린다');

// ── 3) 다시 ① 을 눌러도 승인·결과가 살고, 시험중은 시험중 ─
buildAdExpandCandidates(); t=byS();
ok(t['GROW'][col('판정')]===EXA_RUNNING, '시험이 도는 상품은 판정이 "시험중" ('+t['GROW'][col('판정')]+')');
ok(/시험 시작/.test(t['GROW'][col('결과')]), '   지난 결과는 남는다');

// ── 4) 계단 오르기 — 좋으면 채택하고, 다음 계획이 거기서 또 올린다 ─
today='2026-09-19'; api=[]; adExpandCycle({quiet:true});          // 되돌림
today='2026-10-05';
// 결과: 운영기 이익이 기준기보다 크고, 상품별 판단이 켜져 있으면 채택
basis['확대 · 상품별로 판단해 이어가기']='TRUE';
const days=(f,n)=>Array.from({length:n},(_,i)=>global.addDays_(f,i));
const pr=[ADS_HEADER];
for(const d of days('2026-08-22',14)) pr.push([d,'GROW','B0G','c',100,588,0,20,1,'']);
for(const d of days('2026-09-05',14)) pr.push([d,'GROW','B0G','c',200,1765,0,40,2,'']);
cells['광고실적']=pr; api=[];
adExpandCycle({quiet:true});                                     // 성숙 → 평가 → 채택
const tr=(cells[SHEET_EXTEST]||[]).slice(1).find(r=>r[XT_SKU]==='GROW');
ok(tr && tr[XT_STATE]===XS_ADOPT, '판정이 좋으면 그 값을 채택한다 ('+(tr&&tr[XT_STATE])+')');
ok(api.some(x=>x.tid==='G1'&&x.to===5.5), '   되돌려 둔 값을 다시 5.5 로 올린다');
// 다음 계획: 지금 값이 5.5 라면 (구조 수집이 그렇게 가져왔다고 치고) 6.05 를 계획한다
cells['광고그룹'][2][4]=5.5;
cells['광고실적']=[ADS_HEADER,[ '2026-09-10','GROW','B0G','c',2750,27500,50000,500,25,'']];
buildAdExpandCandidates(); t=byS();
ok(t['GROW'][col('판정')]===EXA_CEIL,
   '다음 계단: 지금 5.5 · 상한 5.68 — 10% 여유가 없으니 "천장" 으로 멈춘다 ('+t['GROW'][col('판정')]+')');
// 상한이 더 높았다면 (마진을 25% 로 고쳐 적었다 치자) 다시 한 계단을 계획한다
cells['광고확대후보'].slice(1).forEach(r=>{ if(r[0]==='GROW'){ r[col('마진율(%)')]=25; } });
buildAdExpandCandidates(); t=byS();
ok(t['GROW'][col('판정')]===EXA_TEST && /¥5\.5 → ¥6\.05/.test(t['GROW'][col('바꿀 것')]),
   '   상한이 올라가면 채택값 5.5 에서 또 10% 를 계획한다 ('+t['GROW'][col('바꿀 것')]+')');

// ── 5) 광고 자료 갱신 사슬 — 앞 걸음이 끝나야 다음으로 ──
props['ADDATA_QUEUE']=undefined; delete props['ADDATA_QUEUE'];
alerts=[]; triggers=[]; answer='YES'; refreshAdData();
ok(called.structure===1, '① 구조를 받고');
let guard=0; const trace=[];
while(props['ADDATA_QUEUE'] && guard++<20){ trace.push(JSON.parse(props['ADDATA_QUEUE'])[0]); continueAdData(); }
if(process.env.TRACE) console.log('  걸음 흐름:', trace.join(' → '), '| 호출', JSON.stringify(called));
ok(cells['상품광고목록'], '② 상품광고목록 탭이 없으면 만들고 이어간다 (사슬에는 "한 번 더 누르세요" 할 사람이 없다)');
ok(called.units===2, '   두 번에 걸쳐 이어 받고 ('+called.units+')');
ok(called.spend===2, '③ 원장은 리포트가 늦으면 다시 온다 ('+called.spend+')');
ok(called.ads===2, '④ SKU별 광고비는 구간마다 ('+called.ads+')');
ok(!props['ADDATA_QUEUE'] && !props['ADS_QUEUE'], '⑤ 다 받으면 자리표를 지운다');

// ── 6) 한 걸음이 죽으면 한 번 다시 하고, 그래도 죽으면 넘어간다 ─
called.structure=0; global.fetchAdStructure=()=>{called.structure++; throw new Error('아마존이 막음');};
props['ADDATA_QUEUE']=JSON.stringify(['structure','spend']); spendPending=0;
continueAdData();
ok(JSON.parse(props['ADDATA_QUEUE'])[0]==='structure', '죽은 걸음은 2분 뒤 한 번 더 (아직 같은 걸음)');
continueAdData();
ok(JSON.parse(props['ADDATA_QUEUE'] || '["끝"]')[0]!=='structure',
   '   두 번째도 죽으면 넘어간다 — 한 걸음이 사슬 전체를 붙잡지 않는다');
ok(called.structure===2, '   두 번만 해 본다 ('+called.structure+'번)');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
