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


// ── 자동으로 시작해서 나중에 수동으로 갈아탄다 ────────────
global.ADEXEC_ABORT_AFTER=5; global.ADEXEC_MAX_TRIES=3;
global.adIsGivenUp_=()=>false; global.adMarkFail_=()=>false;
global.ADSW_CT_ADGROUP='g'; global.ADSW_CT_PRODUCTAD='p';
global.PROP_ADEXEC_STATE='S'; global.PROP_ADENABLE_STATE='E';
global.ADENABLE_MODES={ON:'켜기',SYNC:'맞추기',OFF:'멈추기'};
global.adSkuAsin_=()=>({}); global.adLogBuffer_=()=>({push(){},flush(){}});
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
  if(p==='/sp/keywords') return {keywords:{success:b.keywords.map((x,i)=>({index:i,keywordId:'K'+i}))}};
  return {}; };

// ① 기준키워드 없이 시작
cells['광고육성']=[ADGROW_HEADER.slice(),
  g({sku:'신상A',kw:'',camp:'KP GROW B0GROW0001'})];
cells['광고생성계획']=[ADPLAN_HEADER.slice()];
pushAdGrowToPlan();
cells['광고육성계획'][1][AP_APPROVE-1]=true;
apiLog=[]; adPlanExecStep_(false);
const cid1=cells['광고육성계획'][1][AP_CID-1];
ok(cells['광고육성계획'][1][4]==='자동' && String(cid1).length>0,
   '① 자동 캠페인이 만들어짐 ('+cid1+')');
ok(cells['광고육성'][1][AG_CID]===cid1, '   육성 표에 ID 가 돌아옴');
liveState[cid1]='ENABLED';                       // 켰다고 치자

// ② 두 주 뒤 검색어를 보고 기준키워드를 정했다
cells['광고육성'][1][AG_KW]='토너 패드';
// 옛 캠페인에 올려 두었던 키워드ID 가 남아 있다고 치자
cells['광고육성'][0].push('기준키워드ID');
cells['광고육성'][1].push('KWOLD');
switchAdGrowToManual();
const plan=cells['광고육성계획'].slice(1);
ok(plan.length===2, '② 계획에 새 줄이 생김 (총 '+plan.length+'줄)');
const nw=plan.filter(r=>String(r[AP_NAME-1]).slice(-3)===' KW')[0];
ok(nw && nw[4]==='수동', '   새 줄은 수동 — '+(nw?nw[AP_NAME-1]:'(없음)'));
ok(nw[AP_CID-1]==='', '   새 줄의 ID 는 비어 있다 (아직 안 만들었다)');
ok(nw[AP_APPROVE-1]===true,
   '   승인은 정책이 정한다 — 값이 다 있고 자동운영이면 채워 둔다 (사람이 또 체크하지 않게)');
ok(plan[0][AP_APPROVE-1]===false &&
   String(plan[0][AP_RESULT-1]).indexOf(ADGROW_SWITCHED_MARK)>0,
   '   옛 줄은 승인이 풀리고 갈아탐 표시 — "'+String(plan[0][AP_RESULT-1]).trim()+'"');
ok(cells['광고육성'][1][AG_PREVCID]===cid1, '   옛 캠페인ID 가 [이전캠페인ID들]로 — '+cells['광고육성'][1][AG_PREVCID]);
ok(String(cells['광고육성'][1][AG_CAMP]).slice(-3)===' KW' && cells['광고육성'][1][AG_CID]==='',
   '   육성 표가 새 캠페인을 가리킴');
const gmS={}; cells['광고육성'][0].forEach((h,i)=>gmS[h]=i);
ok(gmS['기준키워드ID']!==undefined &&
   String(cells['광고육성'][1][gmS['기준키워드ID']]||'')==='',
   '   옛 [기준키워드ID] 는 비운다 (멈춘 캠페인의 키워드에 입찰을 걸지 않게)');
ok(liveState[cid1]==='ENABLED', '   옛 캠페인은 아직 켜져 있다 (순위 쌓기가 안 끊긴다)');

// ③ 새 줄 승인 → 생성 → 기준키워드 올리기
cells['광고육성계획'].forEach((r,i)=>{ if(i && String(r[AP_NAME-1]).slice(-3)===' KW') r[AP_APPROVE-1]=true; });
apiLog=[]; adPlanExecStep_(false);
const cid2=cells['광고육성'][1][AG_CID];
ok(String(cid2).length>0 && cid2!==cid1, '③ 수동 캠페인이 만들어짐 ('+cid2+')');
const mk=apiLog.filter(x=>x.p==='/sp/campaigns'&&x.m!=='put');
ok(mk.length===1 && mk[0].b.campaigns[0].targetingType==='MANUAL',
   '   MANUAL 로 (옛 줄은 승인이 풀려 다시 안 만든다)');

logged=[]; apiLog=[];
applyAdGrowKeyword();
const kws=apiLog.filter(x=>x.p==='/sp/keywords');
ok(kws.length===1 && kws[0].b.keywords[0].keywordText==='토너 패드',
   '   기준키워드가 새 그룹에 올라감');
ok(liveState[cid1]==='PAUSED', '   그 자리에서 옛 자동 캠페인이 멈춤');
ok(logged.some(r=>String(r[0]).indexOf('트랙 B 갈아타기')===0),
   '   대장에 주체가 남음 — "'+logged.map(r=>r[0]).join(' / ')+'"');

// ④ 누적은 이어진다
const perfStub={}; perfStub[cid1]={ck:100,cost:9000,sales:20000,ord:5};
perfStub[cid2]={ck:20,cost:2000,sales:5000,ord:1};
const gv=cells['광고육성'].slice(1)[0];
const cids=[String(gv[AG_CID]).trim()].concat(String(gv[AG_PREVCID]||'').split(',').map(t=>t.trim()));
let cost=0; const seen={};
cids.forEach(c=>{ if(c&&!seen[c]&&perfStub[c]){seen[c]=1; cost+=perfStub[c].cost;} });
ok(cost===11000, '④ 누적 광고비가 옛것+새것 = ¥'+cost.toLocaleString()+' (¥9,000 이 안 사라진다)');

// ⑤ 관제가 못 멈춘 옛 캠페인을 잡는가
liveState[cid1]='ENABLED';                        // 누가 다시 켰다고 치자
const ours=adWatchOurs_();
const oldRow=ours.filter(o=>o.cid===cid1)[0];
ok(oldRow && String(oldRow.result).indexOf(ADGROW_SWITCHED_MARK)>=0,
   '⑤ 관제가 갈아탐 표시를 본다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
