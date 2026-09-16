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
global.ADSW_CT_ADGROUP='g';global.ADSW_CT_PRODUCTAD='p';
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
                 '72Q_운영정책','72R_지출원장','72S_육성상태','72V_작업큐','72W_작업실행'])
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


// ── 트랙마다 제 계획 표 ───────────────────────────────────
cells['광고육성']=[ADGROW_HEADER.slice(),
  g({sku:'신상A',kw:'토너 패드',camp:'KP GROW B0GROW0001'})];
cells['광고생성계획']=[ADPLAN_HEADER.slice()];

ok(adPlanSheetNames_().length===2 && adPlanSheetNames_()[1]==='광고육성계획',
   '계획 표 둘 — '+adPlanSheetNames_().join(' · '));
ok(adPlanTables_().length===0, '줄이 없는 표는 안 센다 (지금 '+adPlanTables_().length+'개)');

// 육성은 제 표에만 쓴다
pushAdGrowToPlan();
ok(!cells['광고생성계획'][1], '트랙 A 표는 그대로 비어 있다');
ok(cells['광고육성계획'] && cells['광고육성계획'].length===2,
   '트랙 B 는 광고육성계획에 '+((cells['광고육성계획']||[]).length-1)+'줄');
ok(cells['광고육성계획'][1][4]==='수동', '기준키워드가 있어 수동');
ok(adPlanTables_().length===1, 'B 표에만 줄이 있으니 하나');

// 트랙 A·M 줄을 A 표에 넣는다
const arow=new Array(ADPLAN_HEADER.length).fill('');
arow[AP_ACTION-1]='생성'; arow[2]='전용'; arow[AP_NAME-1]='KP B0AAA'; arow[4]='자동';
arow[AP_DAILY-1]=300; arow[AP_BID-1]=8; arow[7]=1; arow[AP_SKUS-1]='기존A';
arow[AP_APPROVE-1]=true; arow[ADPLAN_HEADER.length-1]='A';
cells['광고생성계획'].push(arow);
cells['광고육성계획'][1][AP_APPROVE-1]=true;
ok(adPlanTables_().length===2, '두 표에 줄이 생기면 둘 다 잡힌다');
global.ADEXEC_ABORT_AFTER=5; global.ADEXEC_MAX_TRIES=3;

// ── 생성이 두 표를 함께 돈다 ─────────────────────────────
global.adSkuAsin_=()=>({}); global.adLogBuffer_=()=>({push(){},flush(){}});
global.adIsGivenUp_=()=>false; global.adMarkFail_=()=>false;
global.ADEXEC_CONTINUE_HANDLER='x'; global.adAbortRun_=()=>{};
global.adsApiRetry_=(t,m,p,b)=>{ apiLog.push({m:m,p:p,b:b});
  if(p==='/sp/campaigns'&&m!=='put') return {campaigns:{success:[{index:0,campaignId:'CNEW'}]}};
  if(p==='/sp/adGroups'&&m!=='put') return {adGroups:{success:[{index:0,adGroupId:'GNEW'}]}};
  if(p==='/sp/productAds/list') return {productAds:[]};
  if(p==='/sp/productAds'&&m!=='put') return {productAds:{success:(b.productAds||[]).map((x,i)=>({index:i,adId:'A'+i}))}};
  if(m==='put'&&p==='/sp/campaigns') return {campaigns:{success:b.campaigns.map(c=>({campaignId:c.campaignId}))}};
  if(m==='put'&&p==='/sp/adGroups') return {adGroups:{success:b.adGroups.map(c=>({adGroupId:c.adGroupId}))}};
  if(m==='put'&&p==='/sp/productAds') return {productAds:{success:b.productAds.map(c=>({adId:c.adId}))}};
  return {}; };
global.PROP_ADEXEC_STATE='S'; global.PROP_ADENABLE_STATE='E';
global.ADENABLE_MODES={ON:'켜기',SYNC:'맞추기',OFF:'멈추기'};
apiLog=[];
adPlanExecStep_(false);
const made=apiLog.filter(x=>x.p==='/sp/campaigns'&&x.m!=='put');
ok(made.length===2, '두 표에서 한 줄씩 만든다 ('+made.length+'개)');
const types=made.map(x=>x.b.campaigns[0].targetingType).sort();
ok(types.join(',')==='AUTO,MANUAL', '유형이 표마다 제 값 — '+types.join(','));
ok(String(cells['광고생성계획'][1][AP_RESULT-1]).indexOf('성공')===0 &&
   String(cells['광고육성계획'][1][AP_RESULT-1]).indexOf('성공')===0,
   '결과가 각자 제 표에 적힌다');

// ── 켜기가 두 표를 함께 센다 ─────────────────────────────
const c=adEnableCount_();
ok(c.made===2 && c.okN===2, '켜기 셈이 두 표를 합친다 (만든 줄 '+c.made+' · 승인 '+c.okN+')');

apiLog=[];
PropertiesService.getScriptProperties().setProperty=()=>{};
// 켜기 모드만 'ON' — 다른 속성(계획 표 울타리 등)까지 'ON' 이면 표를 못 찾는다
global.PropertiesService={getScriptProperties:()=>({
  getProperty:k=>(k===PROP_ADENABLE_STATE?'ON':null), setProperty(){}, deleteProperty(){}})};
adEnableStep_(false);
const puts=apiLog.filter(x=>x.m==='put'&&x.p==='/sp/campaigns');
const onIds=[].concat.apply([],puts.map(x=>x.b.campaigns.map(cc=>cc.campaignId)));
ok(onIds.length===2 && onIds.every(id=>id==='CNEW'), '두 표의 줄을 다 켠다 ('+onIds.length+'개)');
ok(String(cells['광고생성계획'][1][AP_RESULT-1]).indexOf(ADENABLE_MARK.ENABLED)>0 &&
   String(cells['광고육성계획'][1][AP_RESULT-1]).indexOf(ADENABLE_MARK.ENABLED)>0,
   '켠 표시도 각자 제 표에');

// ── 관제가 두 표를 함께 본다 ─────────────────────────────
const ours=adWatchOurs_();
ok(ours.length===2, '관제가 두 표의 캠페인을 안다');
const tabs=ours.map(o=>o.tab).sort();
ok(tabs.join(',')==='광고생성계획,광고육성계획', '어느 표의 줄인지 들고 다닌다 — '+tabs.join(','));
const tr=ours.map(o=>o.track).sort();
ok(tr.join(',')==='A,B', '트랙도 그대로 — '+tr.join(','));

// 멈추면 각자 제 표에 표시가 간다
logged=[]; apiLog=[];
adWatchPause_('tok', ours, '시험', '관제(자동)');
ok(String(cells['광고생성계획'][1][AP_RESULT-1]).indexOf(ADENABLE_MARK.PAUSED)>0 &&
   String(cells['광고육성계획'][1][AP_RESULT-1]).indexOf(ADENABLE_MARK.PAUSED)>0,
   '멈춤 표시가 두 표에 각각 간다');

// ── 트랙 A 의 다시 계산이 B 표를 못 건드린다 ──────────────
const bBefore=JSON.stringify(cells['광고육성계획']);
cells['광고생성계획']=[ADPLAN_HEADER.slice()];      // A 표를 통째로 다시 쓴 셈
ok(JSON.stringify(cells['광고육성계획'])===bBefore, 'A 표를 통째로 다시 써도 B 표는 그대로');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
