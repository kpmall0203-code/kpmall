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
  insertCheckboxes(){return this;},setDataValidation(){return this;},
  clearContent(){ const rows=cells[name]||[];
    for(let i=0;i<(nr||1);i++){ const row=rows[r-1+i]; if(!row) continue;
      for(let j=0;j<(nc||1);j++) row[c-1+j]=''; } return this; },
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
                 '72J_광고실행','72L_검색어','72M_검색어반영','72N_광고관제','72O_광고육성','72P_승격',
                 '72Q_운영정책','72R_지출원장','72S_육성상태','72V_작업큐','72W_작업실행','72Y_육성진행','72Z_초기화'])
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
  r[AG_SKU]=o.sku; r[AG_ASIN]='B0GROW0001'; r[AG_NAME]='상품 이름'; r[AG_KW]=o.kw||'옛 키워드';
  r[AG_PRICE]=1380; r[AG_MARGIN]=35; r[AG_CVR]=3; r[AG_LOSS]=4500; r[AG_MULT]=1.5;
  r[AG_BID]=21; r[AG_DAILY]=1929; r[AG_START]='2026-09-01'; r[AG_COST]=9000; r[AG_LOSSSUM]=4500;
  r[AG_CAMP]='KP GROW X'; r[AG_CID]='C1'; r[AG_GID]='G1'; r[AG_RESULT]='성공 · 켬';
  r[AG_PREVCID]='C0'; r[AG_APPROVE]=true; return r; };
const P=(name)=>{ const r=new Array(ADPLAN_HEADER.length).fill('');
  r[AP_NAME-1]=name; r[AP_ACTION-1]='생성'; r[AP_APPROVE-1]=true;
  r[AP_RESULT-1]='성공 · 상품 1개 · 켬'; r[AP_CID-1]='C1'; return r; };

let live=[{campaignId:'C1',name:'KP GROW X',state:'ENABLED'},
          {campaignId:'C2',name:'KP B5 CPC15-23 #1',state:'PAUSED'},
          {campaignId:'C9',name:'옛 몰아넣기 캠페인',state:'ENABLED'}];
// 진짜 adsPageAll_ 을 그대로 쓰고 그 아래(adsApi_)에서 답한다 —
// eval 범위가 같아 상위 함수는 못 덮는다
let listCalls=0;
global.adsApi_=(t,m,p,b)=>{ if(p==='/sp/campaigns/list'){ listCalls++; return {campaigns:live.slice()}; }
  return {}; };
global.adBasis_=()=>({'캠페인 이름 앞머리':'KP'});
global.adLogRow_=o=>[o.sum]; global.adLogWrite_=r=>{logged=logged.concat(r);};
let sent=[];
global.adsApiRetry_=(t,m,p,b)=>{ sent.push({m:m,p:p,b:b});
  if(p==='/sp/campaigns/delete'){
    const ids=((b.campaignIdFilter||{}).include)||[];
    live=live.filter(c=>ids.indexOf(c.campaignId)<0);          // 진짜로 목록에서 사라진다
    return {campaigns:{success:ids.map((id,i)=>({index:i,campaignId:id}))}};
  }
  return {campaigns:{success:(b.campaigns||[]).map(c=>({campaignId:c.campaignId}))}}; };
global.adErrorText_=x=>String(x);
global.adsCreated_=(res,key,idf)=>{const s=(res&&res[key]&&res[key].success)||[];
  return {ok:s.length>0, ids:s.map(x=>String(x[idf]||''))};};

const seed=()=>{
  cells['광고육성']=[ADGROW_HEADER.slice().concat(['단계','다음 행동','기준키워드ID','누적지출(JPY)']),
    g({sku:'신상A'}).concat(['집중육성','뭐든','KW7',9000])];
  cells['광고생성계획']=[ADPLAN_HEADER.slice(), P('KP B5 CPC15-23 #1')];
  cells['광고육성계획']=[ADPLAN_HEADER.slice(), P('KP GROW X')];
  cells['광고작업']=[JOB_HEADER.slice()];
  const j=new Array(JOB_HEADER.length).fill('');
  const jm={}; JOB_HEADER.forEach((h,i)=>jm[h]=i);
  j[jm['상태']]=JOB_WAIT; j[jm['대상ID']]='G1'; j[jm['동작']]='입찰변경';
  cells['광고작업'].push(j);
  cells['광고캠페인일별']=[SPENDDAY_HEADER.slice(), ['2026-09-01','C1','KP GROW X',100,5,500,0,0,'14일','잠정','']];
  sent=[]; logged=[]; listCalls=0;
};

// ── 확인 글자를 안 적으면 아무 일도 없다 ─────────────────
seed();
answer='OK';
global.ui_=()=>({alert:()=>({OK:1,CANCEL:9})[answer],
  prompt:()=>({getSelectedButton:()=>1,getResponseText:()=>'네'}),
  ButtonSet:{OK:1,OK_CANCEL:2,YES_NO_CANCEL:3},Button:{OK:1,YES:1,NO:2,CANCEL:9}});
resetKpCampaigns();
ok(sent.length===0, '확인 글자가 다르면 아마존에 아무것도 안 보낸다');
ok(cells['광고육성계획'].length===2, '   표도 그대로');

// ── 제대로 적으면 멈추고 → 보관 ──────────────────────────
seed();
global.ui_=()=>({alert:()=>1,
  prompt:()=>({getSelectedButton:()=>1,getResponseText:()=>ADRESET_CONFIRM}),
  ButtonSet:{OK:1,OK_CANCEL:2,YES_NO_CANCEL:3},Button:{OK:1,YES:1,NO:2,CANCEL:9}});
resetKpCampaigns();
const puts=sent.filter(x=>x.p==='/sp/campaigns');
const dels=sent.filter(x=>x.p==='/sp/campaigns/delete');
ok(puts.length===1 && puts[0].b.campaigns.map(c=>c.state+':'+c.campaignId).join(',')==='PAUSED:C1',
   '① 켜진 KP 만 멈춘다 — '+puts.map(x=>x.b.campaigns.map(c=>c.state+':'+c.campaignId)).join(','));
ok(dels.length===1, '② 보관은 PUT 이 아니라 delete 로 보낸다 ('+dels.length+'번)');
ok(dels.length && (dels[0].b.campaignIdFilter||{}).include.join(',')==='C1,C2',
   '   지울 ID 를 campaignIdFilter 로 — '+(dels.length?(dels[0].b.campaignIdFilter||{}).include.join(','):''));
ok(sent.map(x=>JSON.stringify(x.b)).join(' ').indexOf('C9')<0,
   'KP 가 아닌 옛 캠페인은 건드리지 않는다');
ok(listCalls===2, '보냈다고 믿지 않고 다시 조회해 확인한다 (조회 '+listCalls+'번)');
ok(live.length===1 && live[0].campaignId==='C9', '   확인 결과 KP 는 목록에서 사라졌다');
ok(logged.length===1 && String(logged[0][0]).indexOf('하나도 남지 않았습니다')>0,
   '대장에 확인 결과까지 적는다 — "'+logged[0][0]+'"');

// ── 표 되돌리기 ─────────────────────────────────────────
ok(cells['광고생성계획'].length===2 && String(cells['광고생성계획'][1][AP_NAME-1])==='',
   '계획 표는 머리글만 남는다');
ok(String(cells['광고육성계획'][1][AP_NAME-1])==='', '육성 계획 표도');
const gv=cells['광고육성'][1], gm={}; cells['광고육성'][0].forEach((h,i)=>gm[h]=i);
ok(gv[AG_SKU]==='신상A' && gv[AG_MARGIN]===35 && gv[AG_PRICE]===1380,
   '사람이 넣은 값은 남는다 (SKU·마진율·가격)');
ok(gv[AG_CID]==='' && gv[AG_GID]==='' && gv[AG_RESULT]==='' && gv[AG_PREVCID]==='',
   'ID 와 결과는 지운다 — 없는 캠페인을 가리키지 않게');
ok(gv[AG_START]==='' && gv[AG_COST]==='' && gv[AG_LOSSSUM]==='', '누적과 시작일도 지운다');
ok(gv[AG_KW]==='', '기준키워드도 비운다 — 처음부터 다시 고르게');
ok(String(gv[gm['단계']])==='' && String(gv[gm['기준키워드ID']])==='', '뒤에 붙은 칸도 지운다');
ok(gv[AG_VERDICT]==='준비됨', '판정은 "준비됨" 으로');
const jm2={}; JOB_HEADER.forEach((h,i)=>jm2[h]=i);
ok(cells['광고작업'][1][jm2['상태']]===JOB_CANCEL, '열린 작업은 취소한다');
ok(cells['광고캠페인일별'].length===2, '지출 원장은 그대로 (이미 쓴 돈의 기록)');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
