// 트랙 B ①②③: 검색어 판정 잣대 · 판정대로 멈춤 · 기준키워드 수동 캠페인
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];
      out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}return out;},
  getValue:()=>((cells[name]||[])[r-1]||[])[c-1]??'',
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];}return this;},
  setValue(v){const rows=cells[name]||(cells[name]=[]);
    const row=rows[r-1]||(rows[r-1]=[]); row[c-1]=v;return this;},
  setNumberFormat(){return this;},setFontWeight(){return this;},setBackground(){return this;},
  setFontColor(){return this;},setNote(){return this;},setNotes(){return this;},
  insertCheckboxes(){return this;},clearContent(){return this;},setDataValidation(){return this;},
  setHorizontalAlignment(){return this;},setWrap(){return this;},setFontSize(){return this;},
  setVerticalAlignment(){return this;},merge(){return this;}
});
const sheets={};
const mkSheet=name=>sheets[name]||(sheets[name]={
  getName:()=>name,getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[])[0]||[]).length||1,
  getMaxRows:()=>100000,getMaxColumns:()=>40,getFrozenRows:()=>1,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),
  getDataRange:()=>mkRange(name,1,1,(cells[name]||[]).length,40),
  setFrozenRows(){},insertRowsAfter(){},insertColumnsAfter(){},deleteRows(){},activate(){},
  setColumnWidth(){},setTabColor(){},hideSheet(){},showSheet(){},isSheetHidden:()=>false});
global.PROMO_TRACK='X'; global.NA_TRACK='N'; if(typeof global.AP_TRACK==='undefined') global.AP_TRACK=22;
global.ss_=()=>({getSheetByName:n=>cells[n]?mkSheet(n):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return mkSheet(n);},getSheets:()=>[]});
global.SpreadsheetApp={flush(){},getActive:()=>({})};
global.getSheetOrThrow_=n=>{ if(!cells[n]) throw new Error('없음 '+n); return mkSheet(n); };
global.ensureSheet_=(n,h)=>{ if(!cells[n]) cells[n]=[h.slice()]; return mkSheet(n); };
global.headerNotes_=()=>{}; global.showSheet_=()=>{}; global.toast_=()=>{}; global.log_=()=>{};
global.notifyAlert_=()=>{}; global.setColWidths_=()=>{};
let answer='OK';
global.ui_=()=>({alert:()=>({OK:1,CANCEL:9})[answer],
  prompt:()=>({getSelectedButton:()=>1,getResponseText:()=>''}),
  ButtonSet:{OK:1,OK_CANCEL:2,YES_NO_CANCEL:3},Button:{OK:1,YES:1,NO:2,CANCEL:9}});
global.Utilities={sleep(){},formatDate:()=>'2026-09-04'};
global.Session={getScriptTimeZone:()=>'Asia/Tokyo'};
global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger(){},
  newTrigger:()=>({timeBased:()=>({after:()=>({create(){}})})})};
global.PropertiesService={getScriptProperties:()=>({getProperty:()=>null,setProperty(){},deleteProperty(){}})};
global.adBusyGuard_=()=>true; global.adsToken_=()=>'tok';
global.adSkuAsin_=()=>({}); global.adSkuText_=(a,n)=>(a||[]).slice(0,n||3).join(', ');
global.ymd_=d=>'2026-09-04'; global.addDays_=(d,n)=>'2026-08-08';
global.daysBetween_=(a,b)=>27; global.pct1_=x=>(x*100).toFixed(1)+'%';
global.adErrorText_=s=>String(s);
global.adRowApproved_=v=>v===true||String(v).toUpperCase()==='TRUE';
global.ADS_SOFT_MS=4*60*1000;
global.ADSW_CT_CAMPAIGN='c';global.ADSW_CT_KEYWORD='k';global.ADSW_CT_NEGKEYWORD='n';
global.ADKW_PROVISIONAL_DAYS=14;
global.adLogRow_=o=>[o.sum]; global.adLogWrite_=r=>{logged=logged.concat(r);};
global.ADENABLE_MARK={ENABLED:'· 켬', PAUSED:'· 멈춤'};
let logged=[];
let apiLog=[];
global.adsApiRetry_=(t,m,p,b)=>{ apiLog.push({m:m,p:p,b:b});
  if(p==='/sp/keywords') return {keywords:{success:b.keywords.map((x,i)=>({index:i,keywordId:'K'+i}))}};
  if(p==='/sp/campaigns'&&m==='put') return {campaigns:{success:b.campaigns.map(c=>({campaignId:c.campaignId}))}};
  return {}; };

for (const f of ['52D_주문보관','72D_광고구조','72H_광고재배분','72I_광고생성',
                 '72J_광고실행','72L_검색어','72M_검색어반영','72N_광고관제','72O_광고육성','72P_승격',
                 '72Q_운영정책','72R_지출원장','72S_육성상태','72V_작업큐','72W_작업실행','72X_광고자동','72Y_육성진행'])
  eval(fs.readFileSync('all/'+f+'.js','utf8'));
{ const u=fs.readFileSync('all/90_유틸.js','utf8');
  for (const fn of ['makeOneSheet_','madeSheetStop_','notesByName_']) {
    const i=u.indexOf('function '+fn+'('); let d=0,k=u.indexOf('{',i);
    do { if(u[k]==='{')d++; else if(u[k]==='}')d--; k++; } while(d>0&&k<u.length);
    eval(u.slice(i,k)); global[fn]=eval(fn);
  }
}
global.adBasis_=()=>({'기본 마진율':0.17,'목표 ACOS 비율':0.65,
  '캠페인 이름 앞머리':'KP'});
global.adTermEconomics_=()=>({}); global.adTermNegatives_=()=>({});
global.adTermExistingKw_=()=>({}); global.adTermGroupBasis_=()=>({});

// 진짜로 값이 남는 속성 저장소 — 울타리(ADPLAN_ONLY)가 실제로 걸리는지 보려면 필요하다
global.PropertiesService={_p:{},getScriptProperties(){const p=this._p;return{
  getProperty:k=>(p[k]===undefined?null:p[k]), setProperty(k,v){p[k]=String(v);},
  deleteProperty(k){delete p[k];}};}};
global.adBasis_=()=>({'기본 마진율':0.17,'목표 ACOS 비율':0.65,'캠페인 이름 앞머리':'KP'});
global.adTermEconomics_=()=>({}); global.adTermNegatives_=()=>({});
global.adTermExistingKw_=()=>({}); global.adTermGroupBasis_=()=>({});
global.ADEXEC_ABORT_AFTER=5; global.ADEXEC_MAX_TRIES=3;
global.adIsGivenUp_=()=>false; global.adMarkFail_=()=>false;
global.ADSW_CT_ADGROUP='g'; global.ADSW_CT_PRODUCTAD='p'; global.ADSW_CT_TARGET='t';
global.PROP_ADEXEC_STATE='S'; global.PROP_ADENABLE_STATE='E';
global.ADENABLE_MODES={ON:'켜기',SYNC:'맞추기',OFF:'멈추기'};
global.adLogBuffer_=()=>({push(){},flush(){}});
global.adsCreated_=(res,key,idf)=>{const b=(res&&res[key])||{};
  const succ=b.success||[]; if(succ.length) return {ok:true,ids:succ.map(x=>String(x[idf]||''))};
  return {ok:false,ids:[],msg:'실패'};};
let liveState={};
global.adsApiRetry_=(t,m,p,b)=>{ apiLog.push({m:m,p:p,b:b});
  if(p==='/sp/campaigns'&&m!=='put'){ const id='C'+(Object.keys(liveState).length+1);
    liveState[id]='PAUSED'; return {campaigns:{success:[{index:0,campaignId:id}]}}; }
  if(p==='/sp/adGroups'&&m!=='put') return {adGroups:{success:[{index:0,adGroupId:'G'+(Object.keys(liveState).length)}]}};
  if(p==='/sp/productAds/list') return {productAds:[]};
  if(p==='/sp/productAds'&&m!=='put') return {productAds:{success:(b.productAds||[]).map((x,i)=>({index:i,adId:'A'+i}))}};
  if(m==='put'&&p==='/sp/campaigns'){ b.campaigns.forEach(c=>liveState[c.campaignId]=c.state);
    return {campaigns:{success:b.campaigns.map(c=>({campaignId:c.campaignId}))}}; }
  if(m==='put'&&p==='/sp/adGroups') return {adGroups:{success:b.adGroups.map(c=>({adGroupId:c.adGroupId}))}};
  if(m==='put'&&p==='/sp/productAds') return {productAds:{success:b.productAds.map(c=>({adId:c.adId}))}};
  if(p==='/sp/keywords') return {keywords:{success:b.keywords.map((x,i)=>({index:i,keywordId:'KW'+i}))}};
  if(p==='/sp/targets/list') return {targetingClauses:[]};
  if(p==='/sp/targets') return {targetingClauses:{success:(b.targetingClauses||[{}]).map((x,i)=>({index:i,targetId:'T'+i}))}};
  return {}; };

// ── 시트 ─────────────────────────────────────────────────
const g=(o)=>{ const r=new Array(ADGROW_HEADER.length).fill('');
  r[AG_SKU]=o.sku; r[AG_ASIN]=o.asin||'B0GROW0001'; r[AG_KW]=o.kw||'';
  r[AG_PRICE]=1380; r[AG_MARGIN]=35; r[AG_CVR]=3; r[AG_LOSS]=4500; r[AG_MULT]=1.5;
  r[AG_BECPA]=483; r[AG_CAP]=14.5; r[AG_BID]=o.bid||21; r[AG_WEEKLY]=13500; r[AG_DAILY]=1929;
  r[AG_CAMP]=o.camp||''; r[AG_CID]=o.cid||''; r[AG_GID]=o.gid||'';
  r[AG_RESULT]=o.result||''; r[AG_APPROVE]=true;
  return r; };
const T=(o)=>{ const r=new Array(ADTERM_HEADER.length).fill('');
  r[AT_TERM]=o.term; r[AT_CLICKS]=o.clicks; r[AT_ORDERS]=o.orders||0; r[AT_COST]=o.cost||0;
  r[AT_CID]=o.cid; r[AT_VERDICT]=o.v||'더 봄'; return r; };
// 트랙 B 의 정책은 이제 광고육성 표 안에 있다 (표 하나로 합쳤다)
const pol=(mode,ready)=>{
  cells['광고운영정책']=[POLICY_HEADER.slice()];      // 트랙 A 용 — 비워 둔다
  const g0=cells['광고육성']; if(!g0) return;
  if(g0[0].indexOf('모드')<0) g0[0].push('모드');
  const mi=g0[0].indexOf('모드');
  g0.slice(1).forEach(r=>{ while(r.length<=mi) r.push('');
    r[mi]=mode; r[AG_APPROVE]=true;
    r[AG_MARGIN]=ready?35:''; r[AG_CVR]=ready?3:''; r[AG_LOSS]=ready?4500:''; });
};

// ── ① 기준키워드 자동 선정 ───────────────────────────────
pol('자동운영', true);
cells['광고육성']=[ADGROW_HEADER.slice(),
  g({sku:'신상A',camp:'KP GROW B0GROW0001',cid:'CB1',gid:'GB1',result:'성공 · 상품 1개'})];
cells['광고검색어']=[ADTERM_HEADER.slice(),
  T({term:'토너 패드',clicks:80,orders:0,cost:1600,cid:'CB1'}),
  T({term:'저자극 토너',clicks:30,orders:2,cost:600,cid:'CB1'}),
  T({term:'화장솜',clicks:200,orders:5,cost:4000,cid:'CX'}),       // 남의 캠페인
  T({term:'막은 말',clicks:50,orders:9,cost:900,cid:'CB1',v:'부정'})];
let r1=adGrowAutoKeyword_();
ok(r1.picked.length===1 && r1.picked[0].kw==='저자극 토너',
   '판 말을 고른다 (클릭 많은 "토너 패드" 아님) — "'+(r1.picked[0]||{}).kw+'"');
ok(cells['광고육성'][1][AG_KW]==='저자극 토너', '   표의 [기준키워드]에 적힌다');
ok(String(cells['광고육성'][1][AG_WHY]).indexOf('주문 2')>0,
   '   왜 골랐는지 적는다 — "'+String(cells['광고육성'][1][AG_WHY]).slice(0,40)+'"');
ok(adGrowAutoKeyword_().picked.length===0, '이미 정해진 줄은 다시 안 고른다');

// 주문이 없으면 고르지 않는다 — 자동으로 더 돈다
cells['광고육성']=[ADGROW_HEADER.slice(),
  g({sku:'신상A',camp:'KP GROW B0GROW0001',cid:'CB1',gid:'GB1',result:'성공 · 상품 1개'})];
cells['광고검색어']=[ADTERM_HEADER.slice(),
  T({term:'토너 패드',clicks:300,orders:0,cost:6000,cid:'CB1'})];
let r2=adGrowAutoKeyword_();
ok(r2.picked.length===0 && r2.waiting===1,
   '클릭만 많고 안 팔린 말은 안 고른다 (기다림 '+r2.waiting+')');

// 정책이 자동운영이 아니면 고르지 않는다
pol('모의운영', true);
cells['광고검색어']=[ADTERM_HEADER.slice(), T({term:'저자극 토너',clicks:30,orders:2,cid:'CB1'})];
ok(adGrowAutoKeyword_().picked.length===0, '모의운영이면 기준키워드도 안 고른다');
pol('자동운영', false);
ok(adGrowAutoKeyword_().picked.length===0, '한도가 비면 안 고른다');

// ── ② 파이프라인 한 바퀴: 등록만 된 상품이 켜지기까지 ─────
pol('자동운영', true);
apiLog=[]; liveState={};
cells['광고육성']=[ADGROW_HEADER.slice(), g({sku:'신상A',camp:'',cid:'',gid:''})];
cells['광고육성계획']=[ADPLAN_HEADER.slice()];
cells['광고생성계획']=[ADPLAN_HEADER.slice(),
  (()=>{const r=new Array(ADPLAN_HEADER.length).fill('');
    r[AP_NAME-1]='KP A 남의줄'; r[AP_ACTION-1]='생성'; r[AP_APPROVE-1]=true;
    r[4]='자동'; r[7]=3; return r;})()];   // 트랙 A 의 승인된 줄 — 자동이 건드리면 안 된다
cells['광고육성'][1][AG_CAMP]='KP GROW B0GROW0001';
let adv=advanceAdGrow({quiet:true});
const plan=cells['광고육성계획'].slice(1);
ok(plan.length===1, '계획 표에 줄이 생겼다 ('+plan.length+')');
ok(plan[0][AP_APPROVE-1]===true, '   정책이 자동운영이라 승인이 채워졌다');
ok(String(plan[0][AP_RESULT-1]).indexOf('성공')===0, '   캠페인이 만들어졌다 — "'+plan[0][AP_RESULT-1]+'"');
ok(String(plan[0][AP_RESULT-1]).indexOf(ADENABLE_MARK.ENABLED)>0,
   '   그리고 켜졌다 — "'+plan[0][AP_RESULT-1]+'"');
ok(String(cells['광고생성계획'][1][AP_RESULT-1])==='' &&
   adv.msg.indexOf('캠페인 생성 — 성공 1 · 완료')>=0,
   '트랙 A 의 승인된 줄은 시도조차 안 한다 (자동이 안 시킨 돈을 쓰지 않는다)');
ok(adPlanOnlyGet_()==='', '   울타리는 걸음이 끝나면 걷는다 (사람이 누를 때는 두 표 다)');

// ── ③ 검색어가 쌓이면 수동으로 갈아탄다 ──────────────────
const cid1=cells['광고육성'][1][AG_CID];
cells['광고검색어']=[ADTERM_HEADER.slice(),
  T({term:'저자극 토너',clicks:40,orders:3,cost:800,cid:cid1})];
apiLog=[];
let nAdv=advanceAdGrow({quiet:true});
ok(cells['광고육성'][1][AG_KW]==='저자극 토너', '기준키워드를 고르고');
const plan2=cells['광고육성계획'].slice(1);
const kwRow=plan2.filter(r=>String(r[AP_NAME-1]).slice(-3)===' KW')[0];
ok(kwRow && kwRow[4]==='수동', '   수동 줄로 갈아탔다 — '+(kwRow?kwRow[AP_NAME-1]:'(없음)'));
ok(kwRow && kwRow[AP_APPROVE-1]===true, '   새 수동 줄도 정책이 승인을 채운다');
ok(kwRow && String(kwRow[AP_RESULT-1]).indexOf('성공')===0, '   만들어졌다');
ok(kwRow && String(kwRow[AP_RESULT-1]).indexOf(ADENABLE_MARK.ENABLED)>0, '   켜졌다');
const sentKw=apiLog.filter(x=>x.p==='/sp/keywords');
ok(sentKw.length===1 && sentKw[0].b.keywords[0].keywordText==='저자극 토너',
   '   기준키워드가 새 캠페인에 올라갔다');
ok(liveState[cid1]==='PAUSED', '   옛 자동 캠페인은 멈췄다 (같은 말에 둘이 입찰하지 않게)');
const gm={}; cells['광고육성'][0].forEach((h,i)=>gm[h]=i);
ok(String(cells['광고육성'][1][gm['기준키워드ID']]||'').indexOf('KW')===0,
   '   키워드ID 를 남겼다 — 이제 입찰이 이 키워드에 걸린다');

// ── ④ 다시 불러도 같은 자리 ──────────────────────────────
apiLog=[];
let adv3=advanceAdGrow({quiet:true});
ok(adv3.msg.indexOf('실패')<0, '다 된 뒤 또 불러도 실패가 없다 — "'+adv3.msg.replace(/\n/g,' / ')+'"');
ok(adv3.msg.indexOf('성공 0')>=0 || adv3.moved===0, '   만들 것도 켤 것도 없다');

// ── ③ 시작 — 단추 하나가 다 한다 ─────────────────────────
let trig=[];
global.ScriptApp={ WeekDay:{MONDAY:'MON'},
  getProjectTriggers:()=>trig.slice(),
  deleteTrigger:t=>{trig=trig.filter(x=>x!==t);},
  newTrigger:h=>({timeBased:()=>({
    atHour:()=>({everyDays:()=>({create(){trig.push({h:h,kind:'daily',getHandlerFunction:()=>h});}})}),
    onWeekDay:()=>({atHour:()=>({create(){trig.push({h:h,kind:'weekly',getHandlerFunction:()=>h});}})}),
    after:()=>({create(){trig.push({h:h,kind:'after',getHandlerFunction:()=>h});}})})})};
global.adSpendRead_=()=>({has:true,last:'2026-09-06',rows:[]});
global.uiSilent_=()=>{};
// 진짜 걸음이 도는지는 실행 기록으로 본다 (같은 eval 범위라 함수는 못 덮는다)
let seenLog=[];
global.log_=(a,lv,m)=>{seenLog.push(String(m));};

// 한도가 안 찼으면 시작하지 않는다
pol('모의운영', true); trig=[]; seenLog=[];
startAdGrow();
ok(trig.length===0 && !seenLog.some(l=>l.indexOf('한 바퀴')===0),
   '한도·모드가 안 되면 트리거도 안 걸고 아무것도 안 민다');

// 표를 미리 만들어 둔다 — 없으면 "표를 방금 만들었습니다" 에서 한 걸음 멈춘다
cells['광고작업']=cells['광고작업']||[JOB_HEADER.slice()];
cells['광고요청함']=cells['광고요청함']||[INBOX_HEADER.slice()];
pol('자동운영', true); trig=[]; seenLog=[];
startAdGrow();
ok(trig.length===AD_AUTOMATIONS.length, '③ 이 매일 도는 걸음을 다 건다 ('+trig.length+'개)');
ok(seenLog.some(l=>l.indexOf('트랙 B 상태')===0),
   '   지금 한 번 상태를 점검하고 ('+(seenLog.find(l=>l.indexOf('트랙 B 상태')===0)||'안 함')+')');
ok(seenLog.some(l=>l.indexOf('트랙 B 자동 진행')===0),
   '   다음 단계로 민다 (새벽에 하는 것과 같은 걸음)');
startAdGrow();
ok(trig.length===AD_AUTOMATIONS.length, '   두 번 눌러도 트리거가 곱절이 되지 않는다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
