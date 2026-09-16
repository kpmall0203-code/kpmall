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
                 '72L_검색어','72M_검색어반영','72N_광고관제','72O_광고육성','72P_승격'])
  eval(fs.readFileSync('all/'+f+'.js','utf8'));
global.adBasis_=()=>({'기본 마진율':0.17,'목표 ACOS 비율':0.65,
  '캠페인 이름 앞머리':'KP'});
global.adTermEconomics_=()=>({}); global.adTermNegatives_=()=>({});
global.adTermExistingKw_=()=>({}); global.adTermGroupBasis_=()=>({});

// ── 시트 ─────────────────────────────────────────────────
const g=(o)=>{ const r=new Array(ADGROW_HEADER.length).fill('');
  r[AG_SKU]=o.sku; r[AG_ASIN]=o.asin||'B0GROW0001'; r[AG_KW]=o.kw||'';
  r[AG_PRICE]=3000; r[AG_MARGIN]=17; r[AG_CVR]=2.5; r[AG_LOSS]=3000; r[AG_MULT]=o.mult||1.5;
  r[AG_BECPA]=510; r[AG_CAP]=12; r[AG_BID]=o.bid||19; r[AG_WEEKLY]=9000; r[AG_DAILY]=1286;
  r[AG_CAMP]=o.camp; r[AG_CID]=o.cid||''; r[AG_GID]=o.gid||'';
  r[AG_RESULT]=o.result||''; r[AG_VERDICT]=o.v||'돌고 있음'; r[AG_APPROVE]=true;
  return r; };
cells['광고육성']=[ADGROW_HEADER.slice(),
  g({sku:'신상A',kw:'토너 패드',camp:'KP GROW B0GROW0001',cid:'CB1',gid:'GB1'}),
  g({sku:'신상B',camp:'KP GROW B0GROW0002',cid:'CB2',gid:'GB2',asin:'B0GROW0002'})];
cells['광고생성계획']=[ADPLAN_HEADER.slice()];


// ── 자동 겨냥 좁히기 ─────────────────────────────────────
global.ADSW_CT_TARGET='t';
global.AUTO_TARGET_KR={'QUERY_HIGH_REL_MATCHES':'자동:유사검색어',
  'QUERY_BROAD_REL_MATCHES':'자동:넓은검색어',
  'ASIN_SUBSTITUTE_RELATED':'자동:대체상품','ASIN_ACCESSORY_RELATED':'자동:보완상품'};
global.adsCreated_=(r,k,f)=>{const b=(r&&r[k])||{};
  return b.success?{ok:true,ids:b.success.map(x=>String(x[f]||''))}:{ok:false,ids:[],msg:'err'};};

let clauses;               // 아마존이 지금 들고 있는 겨냥
const resetClauses=have=>{ clauses={};
  have.forEach((t,i)=>{clauses[t]={id:'T'+i,state:'ENABLED'};}); };
global.adsApiRetry_=(t,m,p,b)=>{ apiLog.push({m:m,p:p,b:b});
  if(p==='/sp/targets/list') return {targetingClauses:Object.keys(clauses).map(k=>
    ({targetId:clauses[k].id,state:clauses[k].state,expression:[{type:k}]}))};
  if(p==='/sp/targets'&&m==='put'){ b.targetingClauses.forEach(c=>{
      for(const k in clauses) if(clauses[k].id===c.targetId) clauses[k].state=c.state; });
    return {targetingClauses:{success:b.targetingClauses.map(c=>({targetId:c.targetId}))}}; }
  if(p==='/sp/targets'&&m!=='put'){ b.targetingClauses.forEach((c,i)=>{
      clauses[c.expression[0].type]={id:'N'+i,state:c.state}; });
    return {targetingClauses:{success:b.targetingClauses.map((c,i)=>({targetId:'N'+i}))}}; }
  return {}; };

const setup=(mode,have)=>{
  resetClauses(have);
  cells['광고육성']=[ADGROW_HEADER.slice(),
    g({sku:'신상A',kw:'',camp:'KP GROW B0GROW0001',cid:'CB1',gid:'GB1'})];
  cells['광고육성계획']=[ADPLAN_HEADER.slice()];
  const r=new Array(ADPLAN_HEADER.length).fill('');
  r[AP_NAME-1]='KP GROW B0GROW0001'; r[4]='자동'; r[AP_RESULT-1]='성공 · 상품 1개';
  r[AP_CID-1]='CB1'; r[AP_GID-1]='GB1'; r[ADPLAN_HEADER.length-1]='B';
  cells['광고육성계획'].push(r);
  // 진짜 adBasis_ 가 읽도록 시트에 넣는다 (stub 을 씌우면 기본값만 시험하게 된다)
  cells['광고기준']=[ADBASIS_HEADER.slice()].concat(
    mode ? [['트랙 B 자동 겨냥', mode, '']] : []);
  apiLog=[]; logged=[];
};
const ALL=['QUERY_HIGH_REL_MATCHES','QUERY_BROAD_REL_MATCHES',
           'ASIN_SUBSTITUTE_RELATED','ASIN_ACCESSORY_RELATED'];
const on=()=>ALL.filter(k=>clauses[k]&&clauses[k].state==='ENABLED')
                .map(k=>adGrowClauseName_(k)).join('+');

// 기본값 — 검색어 둘만 남고 상품 겨냥 둘은 꺼진다
setup('', ALL);
narrowAdGrowTargets();
ok(on()==='유사검색어+넓은검색어', '기본값: 검색어 겨냥만 남음 — '+on());
ok(logged.length===1 && String(logged[0][0]).indexOf('대체상품 끔')>0,
   '대장에 무엇을 껐는지 — "'+logged[0][0]+'"');
ok(String(cells['광고육성'][1][AG_RESULT]).indexOf('겨냥 유사검색어+넓은검색어')>=0,
   '육성 표 [결과]에 표시 — "'+String(cells['광고육성'][1][AG_RESULT]).trim()+'"');

// 다시 눌러도 안전 (이미 그 상태면 아무것도 안 보낸다)
apiLog=[]; logged=[];
narrowAdGrowTargets();
ok(apiLog.filter(x=>x.p==='/sp/targets').length===0, '다시 눌러도 아무것도 안 바꾼다');
ok(logged.length===0, '   대장도 안 늘어난다');

// 가장 좁게
setup('유사검색어만', ALL);
narrowAdGrowTargets();
ok(on()==='유사검색어', '"유사검색어만" — '+on());

// 전부
setup('전부', ALL);
narrowAdGrowTargets();
ok(on()==='유사검색어+넓은검색어+대체상품+보완상품', '"전부" 는 넷 다 — '+on());

// 살려야 하는 겨냥이 아예 없으면 만든다
setup('', ['ASIN_SUBSTITUTE_RELATED']);
narrowAdGrowTargets();
ok(on()==='유사검색어+넓은검색어', '없던 겨냥은 만들어 켠다 — '+on());
ok(apiLog.some(x=>x.p==='/sp/targets'&&x.m!=='put'), '   만들기(POST)를 보냈다');

// 수동 캠페인은 건드리지 않는다
setup('', ALL);
cells['광고육성계획'][1][4]='수동';
apiLog=[];
narrowAdGrowTargets();
ok(apiLog.length===0, '수동 캠페인은 겨냥이 없어 건드리지 않는다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
