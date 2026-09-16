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
                 '72L_검색어','72M_검색어반영','72N_광고관제','72O_광고육성','72P_승격',
                 '72Q_운영정책','72R_지출원장','72S_육성상태','72V_작업큐','72W_작업실행'])
  eval(fs.readFileSync('all/'+f+'.js','utf8'));
{ // 90_유틸의 표 만들기 헬퍼만 진짜 코드로 (파일 전체는 환경 stub 을 덮는다)
  const u=fs.readFileSync('all/90_유틸.js','utf8');
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

// ── ① 검색어 판정이 트랙 B 잣대를 쓰나 ───────────────────
const grp=adGrowGroups_();
ok(grp['GB1'] && grp['GB1'].mult===1.5, '육성 그룹 GB1 · 손해배수 '+(grp['GB1']||{}).mult);
// 손익분기 510, 배수 1.5 → 트랙 B 잣대 765
// 클릭 20 · CPC 19 · 광고비 380 · 주문 0 → 손익분기 셈이면 3건어치(1530) 미만이라 '더 봄'
// 광고비 1700 이면 트랙 A 잣대(1530)로는 '부정', 트랙 B 잣대(2295)로는 '더 봄'
const vA=adTermVerdict_({clicks:60,cost:1700,orders:0,beCpa:510,src:''}, adBasis_());
const vB=adTermVerdict_({clicks:60,cost:1700,orders:0,beCpa:510*1.5,src:'growth',
                         note:' [트랙 B · 손해배수 1.5]'}, adBasis_());
ok(vA.v==='부정', '트랙 A 잣대로는 부정 ('+vA.v+')');
ok(vB.v==='더 봄', '트랙 B 잣대로는 아직 부정 아님 ('+vB.v+')');
ok(vB.why.indexOf('트랙 B')>=0, '사유에 트랙 B 표시 — "'+vB.why.slice(-24)+'"');
const vB2=adTermVerdict_({clicks:200,cost:4000,orders:0,beCpa:510*1.5,src:'growth',
                          note:' [트랙 B · 손해배수 1.5]'}, adBasis_());
ok(vB2.v==='부정', '트랙 B 셈으로도 밑지면 부정 ('+vB2.v+')');

// 중단·넘김 단계의 줄은 더 이상 트랙 B 잣대가 아니다 (판정 칸이 아니라 상태 점검의 [단계])
cells['광고육성'][0].push('단계','멈춤필요','다음 행동');
cells['광고육성'].slice(1).forEach(r=>r.push('','',''));
const C_STAGE=ADGROW_HEADER.length, C_PAUSE=C_STAGE+1, C_NEXT=C_STAGE+2;
cells['광고육성'][2][C_STAGE]=BSTAGE_STOP;
ok(adGrowGroups_()['GB2']===undefined, '중단 단계의 줄은 트랙 B 잣대에서 빠진다');
cells['광고육성'][2][C_STAGE]=BSTAGE_HANDOVER;
ok(adGrowGroups_()['GB2']===undefined, '넘김 단계의 줄도 빠진다');
cells['광고육성'][2][C_STAGE]='';

// ── ③ 기준키워드 → 수동 캠페인 ──────────────────────────
pushAdGrowToPlan();
ok(!cells['광고생성계획'][1], '트랙 B 는 트랙 A 의 계획 표를 건드리지 않는다');
const plan=cells['광고육성계획'].slice(1);
const byName={}; plan.forEach(r=>byName[r[AP_NAME-1]]=r);
ok(byName['KP GROW B0GROW0001'][4]==='수동', '기준키워드 있는 줄 → 수동');
ok(byName['KP GROW B0GROW0002'][4]==='자동', '기준키워드 없는 줄 → 자동 (그대로)');
ok(plan.every(r=>r[ADPLAN_HEADER.length-1]==='B'), '둘 다 트랙 B');

// ── ③ 기준키워드 올리기 ─────────────────────────────────
apiLog=[]; logged=[];
applyAdGrowKeyword();
const kw=apiLog.filter(x=>x.p==='/sp/keywords');
const sent=kw.length?kw[0].b.keywords:[];
ok(sent.length===1 && sent[0].keywordText==='토너 패드' && sent[0].adGroupId==='GB1',
   '기준키워드 1개만 올라간다 ('+sent.map(k=>k.keywordText).join(',')+')');
ok(sent[0].matchType==='EXACT' && sent[0].bid===19,
   '정확 일치 · 시작입찰 ¥'+sent[0].bid+' (손익분기 넘긴 값)');
ok(String(cells['광고육성'][1][AG_RESULT]).indexOf('키워드 K0')>=0,
   '결과 칸에 키워드ID — "'+cells['광고육성'][1][AG_RESULT]+'"');
const gm1={}; cells['광고육성'][0].forEach((h,i)=>gm1[h]=i);
ok(gm1['기준키워드ID']!==undefined &&
   String(cells['광고육성'][1][gm1['기준키워드ID']])==='K0',
   '[기준키워드ID] 칸에 ID 를 남긴다 — 작업 큐가 여기에 입찰을 건다 ("'+
   (gm1['기준키워드ID']===undefined?'칸 없음':cells['광고육성'][1][gm1['기준키워드ID']])+'")');
apiLog=[]; applyAdGrowKeyword();
ok(apiLog.filter(x=>x.p==='/sp/keywords').length===0, '두 번 눌러도 다시 안 올린다');

// ── ② 멈춤필요 → 보호 멈춤 작업 ──────────────────────────
// 옛 '주간 판정'은 없앴다. 상태 점검이 [멈춤필요]='예' 를 적으면
// 작업 계획이 캠페인 멈춤 작업을 만들고, 관제는 아직 켜져 있는 것을 잡는다.
cells['광고육성계획'].slice(1).forEach((r,i)=>{ r[AP_RESULT-1]='성공 · 상품 1개 '+ADENABLE_MARK.ENABLED;
  r[AP_CID-1]='CB'+(i+1); });
cells['광고육성'][1][C_STAGE]=BSTAGE_STOP; cells['광고육성'][1][C_PAUSE]='예';
cells['광고육성'][1][C_NEXT]='주간 손실한도 초과';
cells['광고육성'][2][C_STAGE]=BSTAGE_GROW; cells['광고육성'][2][C_PAUSE]='';
cells['광고작업']=[JOB_HEADER.slice()];
const ours=adWatchOurs_();
ok(ours.length===2, '관제가 두 캠페인을 안다');
const pj=planAdGrowJobs({quiet:true});
ok(pj && pj.pause===1, '멈춤필요 줄 하나 → 보호 멈춤 작업 1건 ('+JSON.stringify(pj)+')');
const jobs=cells['광고작업'].slice(1);
const jm={}; JOB_HEADER.forEach((h,i)=>jm[h]=i);
const pz=jobs.filter(r=>r[jm['동작']]==='상태변경');
ok(pz.length===1 && pz[0][jm['대상ID']]==='CB1' && String(pz[0][jm['목표값']])==='PAUSED',
   '캠페인 CB1 을 PAUSED 로 — 대상 '+(pz[0]||[])[jm['대상ID']]);
ok(pz.length===1 && pz[0][jm['상태']]===JOB_WAIT,
   '정책이 없어도 보호 멈춤은 "대기" (모의가 아니다) — '+(pz[0]||[])[jm['상태']]);
ok(jobs.filter(r=>r[jm['대상ID']]==='CB2').length===0, '멈춤필요 아닌 줄은 멈춤 작업이 없다');
// 두 번 계획해도 같은 작업을 겹쳐 만들지 않는다
const pj2=planAdGrowJobs({quiet:true});
ok(pj2.added===0, '다시 계획해도 겹치지 않는다 (added '+pj2.added+')');
// 이미 멈춘 캠페인에는 만들지 않는다
cells['광고육성계획'][1][AP_RESULT-1]='성공 · 상품 1개 '+ADENABLE_MARK.PAUSED;
cells['광고작업']=[JOB_HEADER.slice()];
ok(planAdGrowJobs({quiet:true}).pause===0, '이미 멈춰 있으면 멈춤 작업을 안 만든다');
cells['광고육성계획'][1][AP_RESULT-1]='성공 · 상품 1개 '+ADENABLE_MARK.ENABLED;

// 관제가 켜져 있는 멈춤필요 줄을 잡나
const grow2=adGrowWeeklyByCamp_();
ok(grow2['KP GROW B0GROW0001'].mustStop===true && grow2['KP GROW B0GROW0001'].stage===BSTAGE_STOP,
   '관제가 [멈춤필요]·[단계]를 읽는다');
ok(grow2['KP GROW B0GROW0002'].mustStop===false, '멈출 것 아닌 줄은 false');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
