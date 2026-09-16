// 신규 상품 광고 — 실자료로 끝까지 (① 가져오기 → ② 시작 → 실적 수집 → ③ 매일 주기). 아마존은 흉내.
const fs=require('fs'), path=require('path');
const live=JSON.parse(fs.readFileSync('live2.json','utf8'));
const NEWID='1yugdKPb1GA0sVIMAFFUGNJle_4sU1Qtkvr26JLtN3F8';
const stores={main:{},nw:{}};
for(const k in live.main) stores.main[k]=live.main[k].map(r=>r.slice());
const FRESH=process.env.FRESH==='1';           // 1 이면 새 파일을 비운 채로 시작한다 (처음 설치부터)
if(!FRESH) for(const k in live.new) stores.nw[k]=live.new[k].map(r=>r.slice());
const files=fs.readdirSync('all').filter(f=>f.endsWith('.js')).sort();

function mkSheet(store,name){ const cells=store;
  const range=(r,c,nr,nc)=>({
    getValues:()=>{const rows=cells[name]||[];const out=[];
      for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}return out;},
    setValues(v){const rows=cells[name]||(cells[name]=[]);
      for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);for(let j=0;j<v[i].length;j++)row[c-1+j]=v[i][j];}return this;},
    getValue:()=>((cells[name]||[])[r-1]||[])[c-1]??'',
    setValue(x){return this.setValues([[x]]);},
    getDisplayValues(){return this.getValues().map(r=>r.map(String));},
    setNumberFormat(){return this;},setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
    setWrap(){return this;},setNote(){return this;},setNotes(){return this;},getNotes:()=>[Array(nc||1).fill('')],
    clearContent(){return this;},setDataValidation(){return this;},insertCheckboxes(){return this;},
    getNumRows:()=>nr||1,getNumColumns:()=>nc||1,getRow:()=>r,getColumn:()=>c,offset:(a,b,n1,n2)=>range(r+a,c+b,n1||nr,n2||nc),
    setHorizontalAlignment(){return this;},setVerticalAlignment(){return this;},setFontSize(){return this;},clear(){return this;}});
  return { getName:()=>name, getLastRow:()=>(cells[name]||[]).length,
    getLastColumn:()=>Math.max(...((cells[name]||[[]]).slice(0,3).map(r=>r.length)),1),
    getMaxRows:()=>Math.max((cells[name]||[]).length,1000), getMaxColumns:()=>60, getFrozenRows:()=>1,
    getRange:range, getDataRange:()=>range(1,1,(cells[name]||[]).length,30),
    insertRowsAfter(){}, insertColumnsAfter(){}, deleteColumns(){}, deleteRows(){}, setFrozenRows(){}, clear(){cells[name]=[];},
    hideSheet(){}, showSheet(){}, activate(){}, setTabColor(){}, autoResizeColumns(){}, setColumnWidth(){}, getSheetId:()=>1, getIndex:()=>1,
    appendRow(r){(cells[name]||(cells[name]=[])).push(r.slice());} }; }
function mkSS(store,title){ const sheets={};
  return { getName:()=>title, getSheetByName:n=>store[n]?(sheets[n]||(sheets[n]=mkSheet(store,n))):null,
    insertSheet:n=>{store[n]=store[n]||[];return sheets[n]||(sheets[n]=mkSheet(store,n));},
    getSheets:()=>Object.keys(store).map(n=>sheets[n]||(sheets[n]=mkSheet(store,n))),
    deleteSheet(sh){delete store[sh.getName()];}, setActiveSheet(){}, getId:()=>'x', getSpreadsheetTimeZone:()=>'Asia/Tokyo', toast(){} }; }
const mainSS=mkSS(stores.main,'운영'), newSS=mkSS(stores.nw,'Amazon 신규 상품 광고');
let alerts=[];
const uiStub={createMenu:()=>({addItem(){return this;},addSeparator(){return this;},addSubMenu(){return this;},addToUi(){}}),
  alert:(a,b,c)=>{alerts.push([a,String(b||'')]);return 'OK';},
  prompt:()=>({getSelectedButton:()=>'CANCEL',getResponseText:()=>''}),
  ButtonSet:{OK:'OK',OK_CANCEL:'OKC',YES_NO:'YN'},Button:{OK:'OK',CANCEL:'CANCEL',YES:'YES',NO:'NO'}};
global.SpreadsheetApp={getActive:()=>mainSS,getActiveSpreadsheet:()=>mainSS,openById:id=>id===NEWID?newSS:mainSS,flush(){},
  getUi:()=>uiStub,newDataValidation:()=>({requireCheckbox:()=>({build:()=>({})})})};
const props={}; global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,
  setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];},getProperties:()=>({...props})})};
const tb=()=>({after:()=>({create(){}}),atHour:()=>({everyDays:()=>({create(){}})}),everyMinutes:()=>({create(){}}),onWeekDay:()=>({atHour:()=>({create(){}})})});
global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger(){},WeekDay:{MONDAY:1},newTrigger:()=>({timeBased:tb})};
let today='2026-09-11';
global.Utilities={sleep(){},formatDate:()=>today,ungzip:b=>b,newBlob:()=>({}),base64Encode:()=>'',computeDigest:()=>[1,2,3],
  DigestAlgorithm:{MD5:1,SHA_256:2},Charset:{UTF_8:1},parseCsv:()=>[]};
global.Session={getScriptTimeZone:()=>'Asia/Tokyo',getEffectiveUser:()=>({getEmail:()=>'x@y'}),getActiveUser:()=>({getEmail:()=>'x@y'})};
global.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){},waitLock(){}})};
global.UrlFetchApp={fetch:()=>{throw new Error('실제 HTTP 호출 시도');}};
global.DriveApp={getFolderById:()=>({getFiles:()=>({hasNext:()=>false})})};
global.MailApp={sendEmail(){}}; global.GmailApp={sendEmail(){}}; global.LanguageApp={translate:s=>s}; global.Logger={log(){}};
global.ContentService={createTextOutput:()=>({setMimeType(){return this;}}),MimeType:{JSON:1}}; global.HtmlService={createHtmlOutput:()=>({})};
global.ADS_SOFT_MS=240000; global.withLock_=(n,fn)=>({ran:true,value:fn()}); global.ADSPEND_PENDING='리포트 준비 중'; global.adSchedRun_=(h,l,fn)=>fn(); 
for(const f of files){ try{ (0,eval)(fs.readFileSync(path.join('all',f),'utf8')); }catch(e){ console.log('적재 실패 '+f+': '+e.message); } }
global.ss_=()=>mainSS; global.ui_=()=>uiStub;
const warn=[]; global.log_=(c,l,m)=>{ if(l!=='INFO') warn.push(c+' '+l+' '+String(m).substring(0,160)); };
global.toast_=()=>{}; global.showSheet_=()=>{};
global.writeTable_=(sh,h,rows)=>{ const st=(sh.getName() in stores.nw)?stores.nw:stores.main; st[sh.getName()]=[h.slice()].concat(rows.map(r=>r.slice())); };
global.ymd_=d=>{ if(d instanceof Date && Math.abs(d.getTime()-Date.now())>3600e3) { const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); } return today; };

// ── 아마존 흉내 ─────────────────────────────────────────
const api=[]; let seq=1000; const camps={}, groups={}, ads={};
global.adsToken_=()=>'TOKEN';
global.adsApi_=(token,method,p,body)=>{
  api.push({m:method,p:p,body:JSON.parse(JSON.stringify(body||null))});
  const succ=(key,idf,arr,mk)=>({[key]:{success:arr.map((x,i)=>{const id=String(x[idf]||(++seq)); if(mk) mk(id,x); return {[idf]:id,index:i};}),error:[]}});
  if(p==='/sp/campaigns'&&method==='post') return succ('campaigns','campaignId',body.campaigns,(id,x)=>{camps[id]={name:x.name,budget:x.budget.budget,state:x.state};});
  if(p==='/sp/campaigns'&&method==='put') return succ('campaigns','campaignId',body.campaigns,(id,x)=>{if(camps[id]&&x.budget)camps[id].budget=x.budget.budget; if(camps[id]&&x.state)camps[id].state=x.state;});
  if(p==='/sp/adGroups'&&method==='post'){
    // 아마존은 한 캠페인 안에서 광고그룹 이름이 겹치면 거절한다 (실측 2026-09-12)
    const dup=body.adGroups.filter(x=>Object.values(groups).some(g=>g.cid===x.campaignId&&g.name===x.name));
    if(dup.length) return {adGroups:{success:[],error:dup.map((x,i)=>({index:i,errors:[{errorType:'duplicateValueError',message:'name already exists in campaign'}]}))}};
    return succ('adGroups','adGroupId',body.adGroups,(id,x)=>{groups[id]={cid:x.campaignId,bid:x.defaultBid,name:x.name};});
  }
  if(p==='/sp/adGroups'&&method==='put') return succ('adGroups','adGroupId',body.adGroups,(id,x)=>{if(groups[id])groups[id].bid=x.defaultBid;});
  if(p==='/sp/productAds'&&method==='post') return succ('productAds','adId',body.productAds,(id,x)=>{ads[id]={gid:x.adGroupId,sku:x.sku,state:x.state};});
  if(p==='/sp/productAds'&&method==='put') return succ('productAds','adId',body.productAds,(id,x)=>{if(ads[id])ads[id].state=x.state;});
  if(p==='/sp/productAds/list') return {productAds:[],totalResults:0};
  if(p==='/sp/campaigns/list') return {campaigns:[]};
  if(p==='/sp/adGroups/list') return {adGroups:[]};
  throw new Error('흉내 없는 호출 '+method+' '+p);
};
const M=stores.main, NW=stores.nw;
const cnt=(arr,f)=>{const c={};arr.forEach(r=>{const k=f(r);c[k]=(c[k]||0)+1;});return c;};
const show=t=>console.log('\n── '+t+' ──');
let fails=0; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails++;};
const step=(t,fn)=>{ show(t); try{ return fn(); }catch(e){ console.log('  ✗ 예외: '+e.stack.split('\n').slice(0,4).join(' | ')); fails++; } };
const items=()=>NW['상품통합'].slice(1); const IH=()=>NW['상품통합'][0];
const col=(h,n)=>h.indexOf(n);
const plan=()=>M['광고생성계획'].slice(1).filter(r=>String(r[AP_TRACK-1]).trim()==='N');

// ── 설정 ────────────────────────────────────────────────
const WEEK=Number(process.env.WEEK||100);
step('0) 설치·설정 (주 시작 '+WEEK+' · 자동운영)', ()=>{
  setupNewAds();
  const cfg=NW['설정']; const set=(k,v)=>{const r=cfg.find(x=>x[0]===k); if(r) r[1]=v; else cfg.push([k,v,'']);};
  set('신규 · 모드','자동운영'); set('신규 · 주간 시작 상품군 수',WEEK);
  naCfg_(true);
  const pol=naPolicy_();
  console.log('  모드='+pol.mode+' ready='+pol.ready+' canAuto='+pol.canAuto+' 주간='+pol.weekStarts+' 지출한도=¥'+pol.weekSpend+' 판돈=¥'+pol.famPot+' 최대입찰=¥'+pol.maxBid+' 인계='+pol.handover);
  ok(pol.canAuto, '자동운영으로 돈이 나갈 수 있는 상태');
});

step('① 가져오기', ()=>{
  const r=naImportRun_({quiet:true});
  console.log('  읽음 '+r.read+' · 새로 '+r.added+' · 고침 '+r.updated+' · 상품군 '+r.fams+' · 시작가능 '+r.startable);
  console.log('  배분 '+JSON.stringify(r.alloc));
  console.log('  시작입찰 중앙 ¥'+r.bidMid+' · 최소 ¥'+r.bidLo+' · 최대 ¥'+r.bidHi);
  const h=IH();
  const mm=items().filter(x=>/MISMATCH/.test(String(x[col(h,'사유')]))).length;
  ok(mm<=3, 'MARGIN_MISMATCH '+mm+'줄 (값이 움직인 줄에서만)');
  const src=cnt(items().filter(x=>x[col(h,'마진율(%)')]!==''),x=>x[col(h,'마진출처')]);
  ok(!src['기본값'], '마진출처에 기본값 없음 '+JSON.stringify(src));
  if(warn.length){console.log('  경고: '+warn.slice(0,5).join(' / ')); warn.length=0;}
});

let r2;
step('② 시작 (자동운영 · 아마존 흉내)', ()=>{
  r2=naRunStep_({quiet:true});
  console.log('  바퀴 '+r2.passes+' · 계획 '+r2.planned+' · 승인 '+r2.approved+' · 풀 '+r2.pools+'(새 '+r2.newPools+') · 대기 '+r2.waits+' · 만듦 '+r2.ok+'/실패 '+r2.fail+' · 옛광고멈춤 '+r2.stopped);
  console.log('  이번 주 시작 '+r2.weekStarts+'/'+WEEK+' · 남은 자리 '+r2.slots+' · why='+(r2.why||'없음'));
  const h=IH();
  const run=items().filter(x=>x[col(h,'상태')]===NAS_PROBE);
  ok(run.length<=WEEK, '소액운영으로 바뀐 것 '+run.length+'개 ≤ 주간 한도 '+WEEK);
  ok(run.every(x=>String(x[col(h,'캠페인ID')]).length>0 && String(x[col(h,'광고그룹ID')]).length>0 && x[col(h,'시작일')]===today), '   전부 캠페인ID·광고그룹ID·시작일 있음');
  // 아마존에 실제로 무엇을 만들었나
  const postC=api.filter(a=>a.p==='/sp/campaigns'&&a.m==='post').length, postG=api.filter(a=>a.p==='/sp/adGroups'&&a.m==='post').length, postA=api.filter(a=>a.p==='/sp/productAds'&&a.m==='post').length;
  const putB=api.filter(a=>a.p==='/sp/campaigns'&&a.m==='put'&&a.body.campaigns[0].budget).length;
  console.log('  API: 캠페인 POST '+postC+' · 그룹 POST '+postG+' · 상품광고 POST '+postA+' · 예산 PUT '+putB);
  ok(postC===Object.keys(camps).length, '캠페인 POST '+postC+' = 만들어진 캠페인 수 (모의운영 때 적어 둔 6 + 새 풀 '+r2.newPools+')');
  ok(postG===run.length && postA===run.length, '그룹·상품광고 POST 수 = 시작한 SKU 수');
  const names=Object.values(camps).map(c=>c.name);
  ok(new Set(names).size===names.length, '같은 이름의 캠페인이 둘 생기지 않았다: '+names.join(', '));
  // 한 캠페인 안에서 광고그룹 이름이 겹치면 아마존이 거절한다 — 신규는 한 캠페인에 스물까지 담는다
  const gByC={}; Object.values(groups).forEach(g=>{(gByC[g.cid]=gByC[g.cid]||[]).push(g.name);});
  const dupG=Object.keys(gByC).filter(c=>new Set(gByC[c]).size!==gByC[c].length);
  ok(dupG.length===0, '   한 캠페인 안에서 광고그룹 이름이 겹치지 않는다 (겹친 캠페인 '+dupG.length+')');
  ok(Object.values(gByC).some(a=>a.length>1), '   실제로 한 캠페인에 그룹이 여럿 들어갔다 (최대 '+Math.max(...Object.values(gByC).map(a=>a.length))+')');
  ok(names.every(n=>/^[\x20-\x7E]+$/.test(n)), '   캠페인 이름 전부 아스키');
  const perPool=cnt(Object.values(groups),g=>g.cid);
  ok(Object.values(perPool).every(n=>n<=naPolicy_().poolGroups), '   풀마다 그룹 ≤ '+naPolicy_().poolGroups+' (최대 '+Math.max(...Object.values(perPool))+')');
  // 예산 = 그룹 (입찰×5) 합 ×2, 최소 100
  let badBudget=0, over=[];
  for(const cid in camps){ const bids=Object.values(groups).filter(g=>g.cid===cid).map(g=>g.bid);
    const want=Math.max(100,Math.round(bids.reduce((a,b)=>a+b*5,0)*2));
    if(Math.abs(camps[cid].budget-want)>1) badBudget++;
    if(camps[cid].budget>want+1) over.push(camps[cid].name+' ¥'+camps[cid].budget+'>'+want); }
  ok(badBudget===0, '   캠페인 일예산이 **실제로 만들어진** 그룹 수에 맞다 (어긋난 풀 '+badBudget+
     (over.length?' · 과다 '+over.slice(0,2).join(', '):'')+')');
  const totalBudget=Object.values(camps).reduce((a,c)=>a+c.budget,0);
  console.log('  캠페인 '+Object.keys(camps).length+'개 · 일예산 합 ¥'+totalBudget+'/일 · 상태 '+JSON.stringify(cnt(Object.values(camps),c=>c.state)));
  ok(Object.values(camps).every(c=>c.state==='ENABLED'), '   캠페인은 켜진 채 만든다 (옛 광고를 멈추므로)');
  // 시트의 입찰 = 아마존 그룹 입찰
  let bidMis=0; run.forEach(x=>{const g=groups[String(x[col(h,'광고그룹ID')])]; if(!g||Math.abs(g.bid-Number(x[col(h,'시작입찰(JPY)')]))>0.01) bidMis++;});
  ok(bidMis===0, '   시트의 시작입찰 = 아마존 그룹 기본입찰 (어긋남 '+bidMis+')');
  ok(run.every(x=>Number(x[col(h,'시작입찰(JPY)')])<=Number(x[col(h,'허용입찰(JPY)')])+0.01), '   시작입찰 ≤ 허용입찰');
  ok(run.every(x=>Number(x[col(h,'시작입찰(JPY)')])<=100), '   시작입찰 ≤ 최대 유효입찰 ¥100');
  if(warn.length){console.log('  경고: '+warn.slice(0,6).join(' / ')); warn.length=0;}
});

step('②′ 다시 눌러도 겹치지 않는다', ()=>{
  const before=api.length, n=plan().length;
  const r=naRunStep_({quiet:true});
  ok(api.length===before && plan().length===n, '아마존 호출 0 · 계획 줄 그대로 ('+n+') · 자리 '+r.slots);
});

// ── 실적 수집 흉내 — 리포트 줄을 만들어 parseAdsReport_ 에 넣는다 ──
function fakeReport(days){
  const h=IH(); const out=[];
  const run=items().filter(x=>x[col(h,'상태')]===NAS_PROBE||x[col(h,'상태')]===NAS_WATCH||x[col(h,'상태')]===NAS_PROFIT);
  run.forEach((x,i)=>{ const cid=String(x[col(h,'캠페인ID')]); const name=camps[cid]?camps[cid].name:'KP NEW B?';
    for(const d of days){
      // 다섯 부류: 잘 팔림 / 조금 팔림 / 클릭만 / 노출만 / 아무것도
      const k=i%5; let im=0,ck=0,cost=0,sales=0,od=0;
      if(k===0){im=900;ck=9;cost=ck*Number(x[col(h,'시작입찰(JPY)')]);od=1;sales=Number(x[col(h,'판매가(JPY)')]);}
      else if(k===1){im=600;ck=5;cost=ck*Number(x[col(h,'시작입찰(JPY)')]);od=d===days[0]?1:0;sales=od?Number(x[col(h,'판매가(JPY)')]):0;}
      else if(k===2){im=700;ck=6;cost=ck*Number(x[col(h,'시작입찰(JPY)')]);}
      else if(k===3){im=400;ck=0;}
      else {im=30;ck=0;}
      out.push({date:d,advertisedSku:x[col(h,'SKU')],advertisedAsin:x[col(h,'ASIN')],campaignName:name,campaignId:cid,cost:cost,sales14d:sales,impressions:im,clicks:ck,purchases14d:od});
    }});
  return out;
}
step('실적 수집 (72_광고 훅 → 신규광고일별)', ()=>{
  const days=[]; for(let i=1;i<=20;i++){ const d=new Date('2026-09-11T00:00:00Z'); d.setUTCDate(d.getUTCDate()+i); days.push(d.toISOString().slice(0,10)); }
  const rep=fakeReport(days);
  const parsed=parseAdsReport_(JSON.stringify(rep));
  ok(parsed.na.length===rep.length, '리포트 '+rep.length+'줄 가운데 트랙 N 으로 알아본 줄 '+parsed.na.length);
  const n=naPerfWrite_(parsed.na,days[0],days[days.length-1]);
  ok(n===rep.length && NW['신규광고일별'].length-1===n, '신규광고일별 '+n+'줄');
  // 이름 없이 ID 만 있어도 알아본다
  const rep2=rep.slice(0,3).map(x=>({...x,campaignName:undefined}));
  ok(parseAdsReport_(JSON.stringify(rep2)).na.length===3, '   campaignName 이 없어도 계획 표의 캠페인ID 로 알아본다');
});

step('③ 매일 주기 — 21일 뒤 (성숙 자료 5일치)', ()=>{
  today='2026-10-02';
  const h=IH(); const before=cnt(items(),x=>x[col(h,'상태')]);
  const r=naCycleRun_({quiet:true});
  console.log('  도는 것 '+r.live+' · 보호 '+r.guard+'('+r.guardWhy+') · 다시시도 '+r.retried+' · 인상 '+r.raised+' · 관련성없음 '+r.lowRel+' · 수익 '+r.profit+' · 관찰 '+r.watch+' · 중단 '+r.stopped+' · 인계 '+r.handed+' · 재개 '+r.resumed);
  console.log('  보냄: 멈춤 '+r.sentStop+' · 재개 '+r.sentResume+' · 입찰 '+r.sentBid+' · 실적 마지막 '+r.perfLast+' · 성숙 기준 '+r.matureTo);
  const after=cnt(items(),x=>x[col(h,'상태')]);
  console.log('  상태: '+JSON.stringify(before)+' → '+JSON.stringify(after));
  // 불변식
  const runAll=items().filter(x=>String(x[col(h,'광고그룹ID')]));
  ok(runAll.every(x=>Number(x[col(h,'시작입찰(JPY)')])<=Number(x[col(h,'허용입찰(JPY)')])+0.01), '입찰이 허용 상한을 넘은 줄 없음');
  ok(runAll.every(x=>!(Number(x[col(h,'시작입찰(JPY)')])>100)), '입찰이 최대 유효입찰 ¥100 을 넘은 줄 없음');
  const profitRows=items().filter(x=>x[col(h,'상태')]===NAS_PROFIT);
  ok(profitRows.length>0, '수익운영으로 판정된 줄 '+profitRows.length+'개 (잘 팔린 부류)');
  ok(r.handed===0, '21일째는 성숙 클릭이 50 에 못 미쳐 아직 안 넘긴다 (인계 '+r.handed+')');
  const stopped=items().filter(x=>x[col(h,'상태')]===NAS_STOP);
  console.log('  중단 사유: '+JSON.stringify(cnt(stopped,x=>String(x[col(h,'사유')]).replace(/[¥\d,.]+/g,'#').substring(0,40))));
  // 아마존 상태와 시트 상태가 맞는가
  let mis=0; stopped.forEach(x=>{ const gid=String(x[col(h,'광고그룹ID')]); const a=Object.values(ads).find(a=>a.gid===gid); if(a&&a.state!=='PAUSED') mis++; });
  ok(mis===0, '   멈춘 줄의 상품광고는 아마존에서도 PAUSED (어긋남 '+mis+')');
  const raisedRows=items().filter(x=>/입찰 ¥.* → ¥/.test(String(x[col(h,'사유')])));
  let bidMis=0; raisedRows.forEach(x=>{const g=groups[String(x[col(h,'광고그룹ID')])]; if(!g||Math.abs(g.bid-Number(x[col(h,'시작입찰(JPY)')]))>0.01) bidMis++;});
  ok(bidMis===0, '   올린 줄의 시트 입찰 = 아마존 그룹 입찰 (어긋남 '+bidMis+')');
  const fam=NW['상품군광고'].slice(1), fh=NW['상품군광고'][0];
  const negLeft=fam.filter(x=>x[col(fh,'남은판돈(JPY)')]!==''&&Number(x[col(fh,'남은판돈(JPY)')])<0&&fam.length);
  console.log('  상품군 상태 '+JSON.stringify(cnt(fam,x=>x[col(fh,'상태')]))+' · 남은판돈<0 인 상품군 '+negLeft.length);
  if(warn.length){console.log('  경고 '+warn.length+': '+warn.slice(0,6).join(' / ')); warn.length=0;}
});

step('③′ 하루 더 — 같은 판단을 되풀이하지 않는다', ()=>{
  today='2026-10-03'; const before=api.length;
  const r=naCycleRun_({quiet:true});
  console.log('  보냄: 멈춤 '+r.sentStop+' · 재개 '+r.sentResume+' · 입찰 '+r.sentBid+' · API 호출 '+(api.length-before));
  ok(r.sentStop===0, '어제 멈춘 것을 또 멈추지 않는다');
  ok(r.sentBid===0, '어제 올린 것을 사흘 안에 또 올리지 않는다');
});

step('③″ 재고가 들어오면 다시 켠다', ()=>{
  const h=IH();
  // 시작한 것 하나를 재고 0 으로 → 멈춤 → 재고 회복 → 재개
  const one=items().find(x=>x[col(h,'상태')]===NAS_PROBE); const sku=one[col(h,'SKU')];
  const L=M['리스팅'].find(r=>r[0]===sku); const stock0=L[7]; L[7]=0;
  // 상품광고목록에 이 SKU 가 있어야 멈출 ID 를 안다 — 흉내 아마존의 광고를 넣어 준다
  const ad=Object.entries(ads).find(([id,a])=>a.sku===sku);
  M['상품광고목록'].push([sku,one[col(h,'ASIN')],'KP NEW','',ad[1].state,ad[0],one[col(h,'캠페인ID')],one[col(h,'광고그룹ID')]]);
  today='2026-10-04'; let r=naCycleRun_({quiet:true});
  ok(items().find(x=>x[col(h,'SKU')]===sku)[col(h,'상태')]===NAS_STOP && r.sentStop>=1, sku+' 재고 0 → 멈춤 (보냄 '+r.sentStop+')');
  L[7]=stock0; M['상품광고목록'].find(r=>r[0]===sku)[4]='PAUSED';
  today='2026-10-05'; r=naCycleRun_({quiet:true});
  ok(items().find(x=>x[col(h,'SKU')]===sku)[col(h,'상태')]===NAS_PROBE && r.sentResume>=1, '   재고 회복 → 같은 그룹을 다시 켬 (보냄 '+r.sentResume+')');
});

step('②″ 스물 줄 중 열아홉이 실패하면 예산을 그만큼만 준다', ()=>{
  // 아마존이 그룹 생성을 전부 거절하는 풀을 하나 만든다 — 계획한 예산이 그대로 남으면 안 된다
  const cid=Object.keys(camps).find(c=>Object.values(groups).filter(g=>g.cid===c).length>=3);
  const before=camps[cid].budget;
  // 그 캠페인의 그룹을 둘만 남기고 지운다 (실패해서 안 만들어진 것과 같은 상태)
  const gids=Object.keys(groups).filter(g=>groups[g].cid===cid);
  const keep=gids.slice(0,2), drop=gids.slice(2);
  const P=M["광고생성계획"];
  drop.forEach(g=>{ delete groups[g];
    for(let i=1;i<P.length;i++) if(String(P[i][AP_GID-1])===g){ P[i][AP_GID-1]=''; P[i][AP_RESULT-1]='실패 1회: 광고그룹 — duplicateValueError'; } });
  const plan2=naPlanRead_();
  naPoolBudgetSync_(plan2);
  const bids=keep.map(g=>groups[g].bid);
  const want=Math.max(100,Math.round(bids.reduce((a,b)=>a+b*5,0)*2));
  ok(camps[cid].budget===want, camps[cid].name+' 일예산 ¥'+before+' → ¥'+camps[cid].budget+
     ' (살아남은 그룹 '+keep.length+'개치 ¥'+want+') — 실패한 줄 몫은 안 준다');
  const rec=M["광고생성계획"].slice(1).filter(r=>String(r[AP_CID-1])===cid).map(r=>Number(r[AP_DAILY-1]));
  ok(rec.every(x=>x===want), '   보낸 값을 그 풀의 모든 줄에 되적는다 — 다음 바퀴에 같은 PUT 을 되풀이하지 않게');
});

// (진단) 그룹 하나에 상품광고가 둘 이상 붙은 곳
{ const byG={}; for(const id in ads){ (byG[ads[id].gid]=byG[ads[id].gid]||[]).push(ads[id].sku); }
  for(const g in byG) if(byG[g].length>1) console.log('  ⚠ 그룹 '+g+' 에 상품광고 '+byG[g].length+': '+JSON.stringify(byG[g])); }
step('④ 인계 → EXPAND 가 받는가 (실자료 · 이음새)', ()=>{
  const h=IH();
  // 45일 뒤: 성숙 자료가 충분히 쌓인 뒤 주기를 돌린다 (인계 기본 켜짐 · EXPAND 자동운영)
  M['광고기준'].find(r=>r[0]==='확대 · 모드')[1]='자동운영';
  // 실적을 더 넣는다 — 잘 팔리는 부류가 클릭 50 · 주문 3 을 넘도록 30일치
  const days=[]; for(let i=21;i<=50;i++){ const d=new Date('2026-09-11T00:00:00Z'); d.setUTCDate(d.getUTCDate()+i); days.push(d.toISOString().slice(0,10)); }
  const parsed=parseAdsReport_(JSON.stringify(fakeReport(days)));
  naPerfWrite_(parsed.na,days[0],days[days.length-1]);
  today='2026-11-05';
  const r=naCycleRun_({quiet:true});
  const handed=items().filter(x=>x[col(h,'소유')]==='EXPAND');
  ok(handed.length>0 && handed.length>=r.handed, '근거가 쌓인 것을 EXPAND 로 넘겼다 — 지금까지 '+handed.length+'개 (이번 바퀴 '+r.handed+' · 상태 인계 '+cnt(handed,x=>x[col(h,'상태')])['인계']+')');
  ok(handed.every(x=>String(x[col(h,'광고그룹ID')]).length>0), '   넘긴 줄은 캠페인·그룹을 그대로 둔다 (KP NEW 그룹 그대로)');
  // ⓐ 72_광고 가 광고실적에 남길 SKU 에 넘긴 것을 더하나
  props['ADS_TOP_N']='2';                          // 상위 2개만 남기는 아주 좁은 설정으로
  global.topSkusByQty_=()=>['없는SKU-1','없는SKU-2'];
  const keep=adsKeepSkus_();
  ok(handed.every(x=>keep[x[col(h,'SKU')]]), '   ⓐ 광고실적에 남길 SKU 목록에 넘긴 '+handed.length+'개가 다 들어간다 (상위 N 과 무관하게)');
  ok(!keep['소액운영중인것'] && Object.keys(keep).length===handed.length+2, '      넘기지 않은 신규 SKU 는 안 들어간다 (목록 '+Object.keys(keep).length+'개)');
  // ⓑ 72D 가 KP NEW 그룹을 전용가능 O 로 매기나 — 규칙: 그룹 SKU 수 ≤ ADPROD_DEDICATED_MAX
  ok(ADPROD_DEDICATED_MAX>=1, '   ⓑ 그룹당 SKU 하나 ≤ 전용 기준 '+ADPROD_DEDICATED_MAX+' → 72D 가 전용가능 O 로 매긴다');
  // ⓒ EXPAND 의 자리 찾기 — 광고그룹 표에 그 그룹이 오르면(구조 수집) 전용 그룹으로 찾는가
  const one=handed[0], sku=one[col(h,'SKU')], gid=String(one[col(h,'광고그룹ID')]), cid=String(one[col(h,'캠페인ID')]);
  M['광고그룹'].push([camps[cid].name,'AUTO','grp','ENABLED',groups[gid].bid,1,'O',0,cid,gid,'']);
  M['상품광고목록'].push([sku,one[col(h,'ASIN')],camps[cid].name,'grp','ENABLED',Object.keys(ads).find(id=>ads[id].sku===sku),cid,gid]);
  const res=adExpandResource_(sku, adUnitMap_(), adExpandGroupIndex_());
  ok(res.own===true && String(res.rid)===gid, '   ⓒ EXPAND 의 자리 찾기가 KP NEW 그룹을 전용 자리로 찾는다 ('+res.rname+')');
  // ⓓ 광고실적에 그 SKU 줄이 있으면 후보 찾기가 분류하는가 — 신규광고일별 줄을 광고실적 꼴로 옮겨 넣는다
  const NP=NW['신규광고일별'].slice(1).filter(x=>x[NA_P_SKU]===sku);
  M['광고실적']=[ADS_HEADER.slice()].concat(NP.map(x=>[x[NA_P_DATE],x[NA_P_SKU],x[NA_P_ASIN],x[NA_P_CAMP],x[NA_P_COST],x[NA_P_SALES],x[NA_P_IM],x[NA_P_CK],x[NA_P_OD],x[NA_P_AT]]));
  M['광고확대후보']=[EXPAND_HEADER.slice()];
  buildAdExpandCandidates({quiet:true});
  const EH=M['광고확대후보'][0]; const ex=M['광고확대후보'].slice(1).find(x=>x[EH.indexOf('SKU')]===sku);
  ok(!!ex, '   ⓓ EXPAND ① 후보 찾기가 넘긴 SKU 를 후보 표에 올린다'+(ex?' — 판정 "'+ex[EH.indexOf('판정')]+'" · 자리 "'+String(ex[EH.indexOf('자리')]||ex[EH.indexOf('자원')]||'').substring(0,20)+'"':''));
  if(ex) console.log('      '+String(ex[EH.indexOf('사유')]||'').substring(0,110));
  if(warn.length){console.log('  경고 '+warn.length+': '+warn.slice(0,6).join(' / ')); warn.length=0;}
});

{ const posts=api.filter(a=>a.p==='/sp/productAds'&&a.m==='post').map(a=>a.body.productAds.map(x=>x.sku).join('+'));
  const seen={}; posts.forEach(k=>{seen[k]=(seen[k]||0)+1;}); const dup=Object.keys(seen).filter(k=>seen[k]>1);
  console.log('  상품광고 POST '+posts.length+'건 · 같은 SKU 로 두 번 보낸 것 '+dup.length+(dup.length?' → '+dup.slice(0,3).join(' , '):''));
  const multi=posts.filter(k=>k.includes('+')); if(multi.length) console.log('  한 번에 둘 이상 보낸 것 '+multi.length+' → '+multi.slice(0,3).join(' , ')); }
console.log('\n'+(fails?'✗ 실패 '+fails+'건':'✓ 실자료 끝까지 통과'));
process.exit(fails?1:0);
