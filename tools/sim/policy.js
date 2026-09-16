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
global.SpreadsheetApp={flush(){},getActive:()=>({}),
  newDataValidation:()=>({requireValueInList:()=>({setAllowInvalid:()=>({build:()=>({})})}),
                          requireCheckbox:()=>({build:()=>({})})})};
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

for (const f of ['52D_주문보관','72AA_마진','72D_광고구조','72H_광고재배분','72I_광고생성',
                 '72L_검색어','72M_검색어반영','72N_광고관제','72O_광고육성','72P_승격',
                 '72Q_운영정책','72R_지출원장','72S_육성상태','72U_운영현황','72V_작업큐','72W_작업실행'])
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


// ── 정책 · 지출 원장 · 손실 계산 ─────────────────────────
// 90_유틸의 새 헬퍼 셋만 떼어 진짜 코드로 시험한다 (파일 전체를 부르면 환경 stub 을 덮는다)
{
  const u=fs.readFileSync('all/90_유틸.js','utf8');
  for (const fn of ['makeOneSheet_','madeSheetStop_','notesByName_']) {
    const i=u.indexOf('function '+fn+'(');
    let d=0, j=u.indexOf('{', i);
    let k=j;
    do { if(u[k]==='{')d++; else if(u[k]==='}')d--; k++; } while(d>0 && k<u.length);
    eval(u.slice(i,k));
    global[fn]=eval(fn);
  }
}
global.ADCAMP_COLS=['campaignId','campaignName','campaignStatus','impressions','clicks','cost','purchases14d','sales14d'];
global.ADCAMP_REPORT_TYPE='spCampaigns';
global.daysBetween_=(a,b)=>{const d=x=>new Date(x+'T00:00:00Z').getTime();
  return Math.round((d(b)-d(a))/86400000);};
global.addDays_=(y,n)=>{const d=new Date(y+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);};
global.ymd_=d=>(d instanceof Date? d.toISOString().slice(0,10) : String(d));

// 기획서 15장 검수 9·10 — 판단전환율 평활
let r=adBlendedCvr_(1,1,0.02,50);
ok(Math.abs(r.cvr-2/51)<1e-9, '1클릭 1주문 · 초기2% · 사전50 → 판단 '+(r.cvr*100).toFixed(2)+'% (100% 급등 없음)');
r=adBlendedCvr_(6,200,0.03,50);
ok(Math.abs(r.cvr-7.5/250)<1e-9, '200클릭 6주문 · 초기3% → 판단 '+(r.cvr*100).toFixed(2)+'% (실제 3%와 일치)');
r=adBlendedCvr_(0,0,0.03,50);
ok(r.cvr===0.03 && r.actual===null, '표본 0 → 초기 추정 그대로, 실제는 빈칸');

// 기획서 15장 검수 15 — 광고비 13,500 · 주문 0 이면 손실은 13,500 (4,500 아님)
const s0={cost:13500,sales:0,ord:0,ck:600,im:0,matureCost:13500,matureSales:0,matureOrd:0,matureCk:600,days:{}};
let L=adLossLedger_(s0,0.35,0,4500,0);
ok(L.risk===13500, '주문 0 → 위험손실 '+L.risk+'엔 (계획손실 4,500 으로 줄이지 않는다)');
ok(L.over===true, '   손실한도 4,500 을 넘겼다고 판정');

// 아직 안 익은 매출로 손실을 깎지 않는다
const s1={cost:10000,sales:20000,ord:5,ck:500,im:0,matureCost:10000,matureSales:0,matureOrd:0,matureCk:500,days:{}};
L=adLossLedger_(s1,0.35,0,4500,0);
ok(L.loss===10000-7000 && L.risk===10000,
   '잠정 매출 2만(이익 7천)이 있어도 위험손실은 '+L.risk+'엔 — 성숙한 것만 인정');
const s2={cost:10000,sales:20000,ord:5,ck:500,im:0,matureCost:10000,matureSales:20000,matureOrd:5,matureCk:500,days:{}};
L=adLossLedger_(s2,0.35,0,4500,0);
ok(L.risk===3000, '성숙하면 위험손실 '+L.risk+'엔으로 줄어든다 (10,000 − 20,000×0.35)');

// 여력 = min(지출여유, 손실여유) − 미집계준비액
L=adLossLedger_(s2,0.35,20000,4500,1000);
ok(L.leftSpend===10000 && L.leftLoss===1500 && L.room===500,
   '여력 = min(지출 '+L.leftSpend+', 손실 '+L.leftLoss+') − 준비액 1000 = '+L.room);
// 기획서 15장 검수 32 — 한도 미정이면 계산 불가로 둔다
L=adLossLedger_(s2,0.35,0,0,0);
ok(L.room===-1, '한도를 안 정하면 여력은 "계산 불가"(-1) — 무제한으로 읽지 않는다');

// 미집계 준비액
ok(adPendingSpend_('','2026-09-07',0)===null || adPendingSpend_(null,1929,'2026-09-07')===null,
   '지출 자료가 없으면 준비액을 못 낸다 (null)');
ok(adPendingSpend_('2026-09-05',1929,'2026-09-07')===Math.round(1929*2*1.25),
   '이틀치 미집계 = 1929 × 2 × 1.25 = '+adPendingSpend_('2026-09-05',1929,'2026-09-07')+'엔');
ok(adPendingSpend_('2026-09-07',1929,'2026-09-07')===0, '자료가 오늘까지면 준비액 0');

// 리포트 기간 상한 (아마존 400: range must not exceed 31 days)
{
  const u=fs.readFileSync('all/72E_광고캠페인.js','utf8');
  const i=u.indexOf('function adsClampFrom_(');
  let d=0,k=u.indexOf('{',i);
  do { if(u[k]==='{')d++; else if(u[k]==='}')d--; k++; } while(d>0);
  eval(u.slice(i,k)); global.adsClampFrom_=eval('adsClampFrom_');
  global.ADS_REPORT_MAX_DAYS=31;
}
ok(adsClampFrom_('2026-08-04','2026-09-06')==='2026-08-07',
   '35일을 달라면 31일로 당긴다 → '+adsClampFrom_('2026-08-04','2026-09-06'));
ok(adsClampFrom_('2026-08-08','2026-09-06')==='2026-08-08', '30일은 그대로 둔다');
ok(adsClampFrom_('2026-08-07','2026-09-06')==='2026-08-07', '딱 31일도 그대로 (양끝 포함)');
ok(SPEND_FETCH_DAYS<=31, '지출 원장이 달라는 날 수 '+SPEND_FETCH_DAYS+'일 — 상한 안');
{
  const to='2026-09-06', from=addDays_(to,-(SPEND_FETCH_DAYS-1));
  ok(daysBetween_(from,to)+1<=31, '실제로 부르는 기간 '+(daysBetween_(from,to)+1)+'일');
}

// 성숙 판정 · 주 경계
ok(adSpendMature_('2026-08-01','2026-09-07')===true, '37일 전은 성숙');
ok(adSpendMature_('2026-09-01','2026-09-07')===false, '6일 전은 잠정 (귀속 14일 + 지연 2일 전)');
ok(weekStart_('2026-09-07')==='2026-09-07', '월요일의 주 시작은 그날 — '+weekStart_('2026-09-07'));
ok(weekStart_('2026-09-13')==='2026-09-07', '일요일은 그 주 월요일로 — '+weekStart_('2026-09-13'));

// ── 정책: 빈 한도는 무제한이 아니다 ─────────────────────
cells['광고육성']=[ADGROW_HEADER.slice(),
  g({sku:'신상A',kw:'',camp:'KP GROW B0GROW0001',cid:'CB1',gid:'GB1'})];
cells['광고생성계획']=[ADPLAN_HEADER.slice()];
// 표는 한 실행에 하나만 만든다 — 만들면 거기서 멈춘다
let alertN=0; const realUi=global.ui_;
global.ui_=()=>({alert:()=>{alertN++;return 1;},
  prompt:()=>({getSelectedButton:()=>1,getResponseText:()=>''}),
  ButtonSet:{OK:1,OK_CANCEL:2,YES_NO_CANCEL:3},Button:{OK:1,YES:1,NO:2,CANCEL:9}});
setupAdPolicy();
ok(!!cells['광고운영정책'] && !cells['광고요청함'],
   '첫 실행: 정책 표만 만들고 멈춘다 (한 실행에 시트 하나)');
setupAdPolicy();
ok(!!cells['광고요청함'] && !cells['광고운영정책'][1],
   '두 번째: 요청함을 만들고 멈춘다 (아직 정책 줄은 안 씀)');
setupAdPolicy();
const P=cells['광고운영정책']; const pm={}; P[0].forEach((h,i)=>pm[h]=i);
ok(P.length===2, '정책 표에는 트랙 A 줄 하나만 (트랙 B 는 광고육성 표에 산다) — 실제 '+(P.length-1));
ok(P[1][pm['소유트랙']]==='A', '   그 줄은 트랙 A');
ok(String(P[1][pm['주간 지출한도(JPY)']])==='', '   한도는 비워 둔다 — 옛 값을 넣지 않는다');

// ── 트랙 B 정책은 광고육성 표에서 읽는다 ─────────────────
// 사람이 적을 것은 셋뿐: 마진율 · 전환율예측 · 주간허용손해
const GH=cells['광고육성'][0];
['모드','최대 기간(일)','누적 지출한도(JPY)','누적 손실한도(JPY)','정책버전']
  .forEach(h=>{ if(GH.indexOf(h)<0) GH.push(h); });
const gm2={}; GH.forEach((h,i)=>gm2[h]=i);
const gRow=cells['광고육성'][1];
while(gRow.length<GH.length) gRow.push('');
gRow[AG_MARGIN]=35; gRow[AG_CVR]=3; gRow[AG_LOSS]=4500; gRow[AG_MULT]=1.5;
gRow[AG_APPROVE]=true; gRow[gm2['모드']]='자동운영';

let bp=adPolicyFor_(adPolicyAll_(),'B','신상A');
ok(bp && bp.ready && bp.canAuto, '셋을 적고 승인하면 바로 자동운영 (표 하나에서 끝난다)');
ok(bp.weekLoss===4500, '   주간 손실한도 = 주간허용손해 ('+bp.weekLoss+')');
ok(bp.weekSpend===9000, '   계산된 [주간광고비] 가 있으면 그것이 주간 지출한도 ('+bp.weekSpend+')');
gRow[AG_WEEKLY]='';
ok(adPolicyFor_(adPolicyAll_(),'B','신상A').weekSpend===13500,
   '   아직 계산 전이면 허용손해에서 바로 낸다 (4500 × 1.5/0.5 = 13,500)');
gRow[AG_WEEKLY]=9000;
ok(bp.maxDays===ADGROW_MAXDAYS_DEFAULT, '   최대 기간을 비우면 기본값 '+bp.maxDays+'일');
ok(bp.totalSpend===0 && bp.totalLoss===0, '   누적 한도는 비면 제한 없음');

gRow[AG_APPROVE]=false;
ok(!adPolicyFor_(adPolicyAll_(),'B','신상A').canAuto, '승인을 풀면 멈춘다');
gRow[AG_APPROVE]=true;
gRow[gm2['모드']]='모의운영';
ok(!adPolicyFor_(adPolicyAll_(),'B','신상A').canAuto, '모의운영이면 아마존을 안 건드린다');
gRow[gm2['모드']]='자동운영';

// 필수 셋 — 하나라도 비면 멈춘다
[[AG_MARGIN,'마진율'],[AG_CVR,'전환율예측'],[AG_LOSS,'주간허용손해']].forEach(function (pair) {
  const keep=gRow[pair[0]];
  gRow[pair[0]]='';
  const r=adPolicyFor_(adPolicyAll_(),'B','신상A');
  ok(!r.ready && r.miss.join(' ').indexOf(pair[1])>=0,
     '['+pair[1]+'] 가 비면 멈추고 무엇이 없는지 말한다 — "'+r.miss.join(' · ')+'"');
  gRow[pair[0]]=keep;
});

// 누적 한도는 적으면 더 좁은 울타리, 비우면 제한 없음
let led0=adLossLedger_({cost:50000,sales:0,matureSales:0}, 0.35, 0, 0, 0);
ok(led0.room===-1 && led0.over===false, '누적을 비우면 그것으로는 막지 않는다');
let led1=adLossLedger_({cost:50000,sales:0,matureSales:0}, 0.35, 54000, 18000, 0);
ok(led1.over===true, '적어 두면 그 값이 먼저 걸린다 (위험손실 50,000 ≥ 18,000)');

// ── 단계: 순위가 아니라 '스스로 버나' 로 끝을 본다 ──────
global.adLogYmd_=v=>{ if(v instanceof Date) return v.toISOString().slice(0,10);
  const t=String(v||'').trim(); if(/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0,10);
  const m=/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(t); if(!m) return '';
  return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0'); };

const okPol={ready:true,mode:'자동운영',miss:[],maxDays:42,totalSpend:60000,totalLoss:20000};
const noOver={over:false,cost:0,risk:0,room:5000};
const stg=(o)=>adGrowStage_(Object.assign(
  {marginOk:true,policy:okPol,expired:false,days:5,week:noOver,total:noOver,pending:0,
   keyword:'토너 패드',manual:true,selfPay:false,matureClicks:0,needClicks:50,room:5000}, o));

let st=stg({selfPay:true,matureClicks:80});
ok(st.stage===BSTAGE_HOLD, '성숙 클릭이 쌓였고 위험손실이 0 이면 → '+st.stage);
ok(st.next.indexOf('스스로 법니다')>0, '   왜 그런지 적는다 — "'+st.next.slice(0,24)+'"');
st=stg({selfPay:false,matureClicks:10});
ok(st.stage===BSTAGE_GROW && st.next.indexOf('50회는 돼야')>0,
   '표본이 모자라면 판정을 미룬다 — "'+st.next.slice(0,40)+'"');
st=stg({selfPay:false,matureClicks:200});
ok(st.stage===BSTAGE_GROW && st.next.indexOf('50회는 돼야')<0,
   '표본이 충분한데 아직 손해면 계속 육성 — "'+st.next.slice(0,30)+'"');
st=stg({keyword:''});
ok(st.stage===BSTAGE_FIND, '기준키워드가 없으면 '+st.stage);
st=stg({manual:false});
ok(st.stage===BSTAGE_PREP, '기준키워드는 있는데 아직 자동 캠페인이면 '+st.stage);
st=stg({selfPay:true,matureClicks:80,expired:true});
ok(st.stage===BSTAGE_STOP && st.pause===true,
   '기간이 끝났으면 스스로 벌어도 멈춘다 (막는 것이 먼저)');

// ── 모의운영 입찰 (기획서 9.2 · 검수 14) ─────────────────
// G=483 · q=3% → 손익분기 14.49 · ×1.5 = 21.735
const G=1380*0.35, q1=0.03;
ok(Math.abs(G-483)<1e-9 && Math.abs(G*q1-14.49)<1e-9 && Math.abs(G*q1*1.5-21.735)<1e-9,
   'G '+G+' · 손익분기 '+(G*q1).toFixed(2)+' · 목표 '+(G*q1*1.5).toFixed(3));
// q 가 1.5% 로 내려가면 목표도 절반
ok(Math.abs(G*0.015*1.5-10.8675)<1e-9,
   '판단전환율이 1.5% 로 내려가면 목표 '+(G*0.015*1.5).toFixed(4)+' 으로 내려간다');

// ── 운영 현황: 관리 밖 지출을 숨기지 않는다 ──────────────
const LG=(d,cid,cost)=>({d:d,cid:cid,cost:cost,sales:0,ord:0,ck:0,im:0,mature:false});
const dled={has:true,last:'2026-09-06',rows:[
  LG('2026-09-01','CA',1000), LG('2026-09-01','CB',2000), LG('2026-09-01','CX',50000),
  LG('2026-08-01','CA',9999)]};
const own={CA:{track:'A'},CB:{track:'B'}};
let sp=dashSpendSplit_(dled,'2026-09-01','2026-09-06',own);
ok(sp.A===1000 && sp.B===2000 && sp['밖']===50000 && sp.total===53000,
   '트랙 A '+sp.A+' · B '+sp.B+' · 관리 밖 '+sp['밖']+' · 전체 '+sp.total);
ok(dashPct_(3000,53000)===' (6%)',
   '한도가 덮는 몫을 퍼센트로 적는다 → '+dashPct_(3000,53000).trim()+' (나머지는 옛 캠페인)');
sp=dashSpendSplit_(dled,'2026-09-01','2026-09-06',own);
ok(sp.total===53000, '기간 밖(8월 1일)은 안 센다');
ok(dashPct_(1,0)==='', '분모가 0이면 퍼센트를 만들지 않는다');

// ── 작업 큐 (기획서 13.2) ────────────────────────────────
let st2=adBidStep_(21, 30);
ok(st2.to===24.15, '인상은 한 번에 15% 까지 — 21 → '+st2.to+' (목표 30)');
st2=adBidStep_(21, 10);
ok(st2.to===16.8, '인하는 20% 까지 — 21 → '+st2.to+' (목표 10)');
st2=adBidStep_(21, 22);
ok(st2.to===22, '목표가 가까우면 그대로 — '+st2.to);
st2=adBidStep_(21, 21.2);
ok(st2.to===0 && st2.why.indexOf('미만')>0, '차이가 0.5 미만이면 안 건드린다');
st2=adBidStep_(0, 30);
ok(st2.to===30, '지금 입찰이 없으면 목표로 바로 — '+st2.to);
st2=adBidStep_(21, 0);
ok(st2.to===0, '목표를 못 내면 작업을 안 만든다');

// 고유키: 목표값이 같으면 같은 작업
const J={policyId:'B2',policyVer:1,sku:'신상A',targetKind:'광고그룹',targetId:'G1',action:'입찰변경',to:24.15};
ok(adJobKey_(J)===adJobKey_(Object.assign({},J)), '같은 목표 = 같은 작업 (두 번 안 만든다)');
ok(adJobKey_(J)!==adJobKey_(Object.assign({},J,{to:25})), '목표가 다르면 다른 작업');
ok(adJobKey_(J)!==adJobKey_(Object.assign({},J,{policyVer:2})), '정책 버전이 다르면 다른 작업');

// 큐: 열린 작업은 다시 안 만들고, 정책이 바뀌면 안 나간 것은 취소
const JH={}; JOB_HEADER.forEach((h,i)=>JH[h]=i);
cells['광고작업']=[JOB_HEADER.slice()];
let r1=adJobUpsert_([{policyId:'B2',policyVer:1,track:'B',sku:'신상A',targetKind:'광고그룹',
  targetId:'G1',action:'입찰변경',from:21,to:24.15,why:'x',canAuto:false}], {B2:1});
ok(r1.added===1 && cells['광고작업'][1][JH['상태']]===JOB_DRY,
   '자동운영이 아니면 '+JOB_DRY+' 로 넣는다 (안 보냄)');
let r2=adJobUpsert_([{policyId:'B2',policyVer:1,track:'B',sku:'신상A',targetKind:'광고그룹',
  targetId:'G1',action:'입찰변경',from:21,to:24.15,why:'x',canAuto:false}], {B2:1});
ok(r2.added===0, '같은 작업을 또 만들지 않는다');
let r3=adJobUpsert_([], {B2:2});
ok(r3.cancelled===1 && cells['광고작업'][1][JH['상태']]===JOB_CANCEL,
   '정책 버전이 바뀌면 안 나간 작업은 '+JOB_CANCEL);
// 이미 나간 것은 정책이 바뀌어도 건드리지 않는다
cells['광고작업'][1][JH['상태']]=JOB_VERIFY;
let r4=adJobUpsert_([], {B2:3});
ok(r4.cancelled===0 && cells['광고작업'][1][JH['상태']]===JOB_VERIFY,
   '이미 보낸 작업('+JOB_VERIFY+')은 정책이 바뀌어도 그대로 — 아마존에 이미 갔다');

// 72시간 간격
const jm={}; JOB_HEADER.forEach((h,i)=>jm[h]=i);
const mk=(tid,act,st,at)=>{const r=new Array(JOB_HEADER.length).fill('');
  r[jm['대상ID']]=tid; r[jm['동작']]=act; r[jm['상태']]=st; r[jm['마지막시각']]=at; return r;};
const nowMs=Date.parse('2026-09-07T00:00:00Z');
ok(adJobHoursSince_([mk('G1','입찰변경',JOB_DONE,new Date(nowMs-40*3600000))],jm,'G1','입찰변경',nowMs)===40,
   '40시간 전에 손댔다 → 40');
ok(adJobHoursSince_([],jm,'G1','입찰변경',nowMs)===-1, '손댄 적 없으면 -1 (바로 할 수 있다)');
ok(adJobHoursSince_([mk('G1','입찰변경',JOB_DRY,new Date(nowMs-40*3600000))],jm,'G1','입찰변경',nowMs)===-1,
   '모의로 남긴 줄은 손댄 것이 아니다 — 완료만 센다');

// ── 작업 실행·검증 (기획서 13.1 · 13.2) ──────────────────
global.ADEXEC_FLUSH_EVERY=15; global.ADS_SOFT_MS=4*60*1000;
global.adLogBuffer_=()=>({push(){},flush(){}}); global.adLogRow_=o=>[o.sum];
global.adErrorText_=x=>String(x); global.adAbortRun_=()=>{};
global.withLockOrRetry_=(a,b,f)=>f();
global.ADGRP_HEADER=['캠페인','유형','광고그룹','상태','기본입찰','SKU수','전용가능','대상수','캠페인ID','광고그룹ID','수집일시'];
global.SHEET_ADGRP='광고그룹';
global.ADSW_CT_ADGROUP='g'; global.ADSW_CT_CAMPAIGN='c';
// 파일마다 eval 범위가 달라 cross-file 참조는 global 로만 이어진다 (실제 코드와 같은 로직)
global.adsCreated_=(res,key,idf)=>{const b=(res&&res[key])||{};
  const succ=b.success||[], errs=b.error||[];
  if(succ.length) return {ok:true,ids:succ.map(x=>String(x[idf]||''))};
  const e=(errs[0]&&errs[0].errors&&errs[0].errors[0])||{};
  return {ok:false,ids:[],msg:(e.errorType||'')+' '+String(e.message||'')};};

const JH2={}; JOB_HEADER.forEach((h,i)=>JH2[h]=i);
const mkJob=(o)=>{const r=new Array(JOB_HEADER.length).fill('');
  r[JH2['작업ID']]=o.id||'J1'; r[JH2['정책ID']]=POL_B; r[JH2['정책버전']]=o.ver===undefined?1:o.ver;
  r[JH2['소유트랙']]='B'; r[JH2['상품키']]='신상A'; r[JH2['대상종류']]='광고그룹';
  r[JH2['대상ID']]='G1'; r[JH2['대상이름']]='KP GROW X'; r[JH2['동작']]='입찰변경';
  r[JH2['기대이전값']]=o.from===undefined?21:o.from; r[JH2['목표값']]=o.to===undefined?24.15:o.to;
  r[JH2['상태']]=o.st||JOB_WAIT; r[JH2['시도']]=o.tries||0; return r;};
// 트랙 B 의 정책은 광고육성 표 안에 있다 — 그 줄을 세운다
const setPolicy=(mode,approved,ver)=>{
  cells['광고운영정책']=[POLICY_HEADER.slice()];        // 트랙 A 용, 비워 둔다
  const H=cells['광고육성'][0];
  ['모드','최대 기간(일)','누적 지출한도(JPY)','누적 손실한도(JPY)','정책버전']
    .forEach(h=>{ if(H.indexOf(h)<0) H.push(h); });
  const m={}; H.forEach((h,i)=>m[h]=i);
  const r=cells['광고육성'][1];
  while(r.length<H.length) r.push('');
  r[AG_MARGIN]=35; r[AG_CVR]=3; r[AG_LOSS]=4500; r[AG_MULT]=1.5; r[AG_WEEKLY]=13500;
  r[AG_APPROVE]=approved; r[m['모드']]=mode; r[m['정책버전']]=ver||1;
  r[m['누적 지출한도(JPY)']]=60000; r[m['누적 손실한도(JPY)']]=20000; r[m['최대 기간(일)']]=42;};
const POL_B='B:신상A';
const grp=(bid)=>{cells['광고그룹']=[ADGRP_HEADER.slice(),
  ['c','자동','g','ENABLED',bid,1,'O',4,'C1','G1','2026-09-07']];};

// 정책이 자동운영이 아니면 안 보낸다
setPolicy('모의운영', true); grp(21);
cells['광고작업']=[JOB_HEADER.slice(), mkJob({})];
apiLog=[]; adJobRunStep_(false);
ok(apiLog.length===0 && cells['광고작업'][1][JH2['상태']]===JOB_CANCEL,
   '모의운영 정책이면 안 보내고 '+cells['광고작업'][1][JH2['상태']]);
ok(String(cells['광고작업'][1][JH2['결과']]).indexOf('모의운영')>=0,
   '   왜 안 보냈는지 적는다 — "'+cells['광고작업'][1][JH2['결과']]+'"');

// 자동운영이면 보내고 검증대기로
setPolicy('자동운영', true); grp(21);
cells['광고작업']=[JOB_HEADER.slice(), mkJob({})];
apiLog=[];
global.adsApiRetry_=(t,m,p,b)=>{apiLog.push({m:m,p:p,b:b});
  return {adGroups:{success:[{index:0,adGroupId:'G1'}]}};};
adJobRunStep_(false);
ok(apiLog.length===1 && apiLog[0].p==='/sp/adGroups' && apiLog[0].b.adGroups[0].defaultBid===24.15,
   '입찰 24.15 를 보냈다');
ok(cells['광고작업'][1][JH2['상태']]===JOB_VERIFY,
   '보낸 뒤는 '+JOB_DONE+' 이 아니라 '+cells['광고작업'][1][JH2['상태']]+' — 보낸 것과 그렇게 된 것은 다르다');

// 기대이전값이 바뀌었으면 덮지 않는다
setPolicy('자동운영', true); grp(30);          // 그 사이 누가 30 으로 바꿨다
cells['광고작업']=[JOB_HEADER.slice(), mkJob({from:21})];
apiLog=[]; adJobRunStep_(false);
ok(apiLog.length===0 && cells['광고작업'][1][JH2['상태']]===JOB_CANCEL,
   '그 사이 값이 바뀌었으면 덮지 않는다');
ok(String(cells['광고작업'][1][JH2['결과']]).indexOf('그 사이')>=0,
   '   "'+cells['광고작업'][1][JH2['결과']]+'"');

// 정책 버전이 다르면 안 보낸다
setPolicy('자동운영', true, 2); grp(21);
cells['광고작업']=[JOB_HEADER.slice(), mkJob({ver:1})];
apiLog=[]; adJobRunStep_(false);
ok(apiLog.length===0 && cells['광고작업'][1][JH2['상태']]===JOB_CANCEL, '정책 버전이 다르면 안 보낸다');

// 보내다 터지면 결과불명 — 다시 보내지 않는다
setPolicy('자동운영', true); grp(21);
cells['광고작업']=[JOB_HEADER.slice(), mkJob({})];
global.adsApiRetry_=()=>{throw new Error('timeout');};
adJobRunStep_(false);
ok(cells['광고작업'][1][JH2['상태']]===JOB_UNKNOWN,
   '보내다 끊기면 '+JOB_UNKNOWN+' — 다시 보내면 두 번 바뀐다');
apiLog=[]; global.adsApiRetry_=(t,m,p,b)=>{apiLog.push({p:p});return{};};
adJobRunStep_(false);
ok(apiLog.length===0, '   결과불명은 실행이 다시 집지 않는다');

// 검증: 실제로 그 값이면 완료
grp(24.15);
verifyAdJobs();
ok(cells['광고작업'][1][JH2['상태']]===JOB_DONE,
   '결과불명이었지만 실제로 바뀌었으면 '+JOB_DONE);
// 검증: 안 바뀌었으면 다시 보낼 수 있다
cells['광고작업'][1][JH2['상태']]=JOB_UNKNOWN; grp(21);
verifyAdJobs();
ok(cells['광고작업'][1][JH2['상태']]===JOB_WAIT,
   '결과불명인데 안 바뀌었으면 '+JOB_WAIT+' 로 — 다시 보내도 안전하다');
// 검증: 보냈다는데 값이 다르면 재시도대기
cells['광고작업'][1][JH2['상태']]=JOB_VERIFY; grp(21);
verifyAdJobs();
ok(cells['광고작업'][1][JH2['상태']]===JOB_RETRY, '보냈는데 값이 다르면 '+JOB_RETRY);

// 되돌릴 수 없는 오류는 재시도하지 않는다
setPolicy('자동운영', true); grp(21);
cells['광고작업']=[JOB_HEADER.slice(), mkJob({})];
global.adsApiRetry_=()=>({adGroups:{error:[{index:0,errors:[{errorType:'invalidArgument',message:'bad bid'}]}]}});
adJobRunStep_(false);
ok(cells['광고작업'][1][JH2['상태']]===JOB_BADINPUT,
   'invalidArgument 는 '+JOB_BADINPUT+' — 세 번 해도 같다');

// ── 키워드 입찰 (수동으로 갈아탄 뒤) ─────────────────────
// 아마존은 키워드에 입찰이 있으면 광고그룹 기본입찰을 쓰지 않는다.
// 그룹에만 걸면 갈아탄 뒤로 값이 얼어붙는다.
global.SHEET_ADSTRUCT='광고구조';
global.ADSW_CT_KEYWORD='k';
const SH=['캠페인','유형','캠페인상태','일예산(JPY)','광고그룹','그룹상태','그룹기본입찰',
          '종류','키워드/타깃','매치/표현','상태','입찰(JPY)','실입찰(JPY)',
          '캠페인ID','광고그룹ID','대상ID','수집일시'];
const struct=(bid)=>{cells['광고구조']=[SH.slice(),
  ['KP GROW X','수동','ENABLED',1929,'KP GROW X','ENABLED',21,
   '키워드','토너 패드','EXACT','ENABLED',bid,bid,'C1','G1','KW9','2026-09-07']];};

struct(21);
ok(adKeywordBidNow_('KW9')===21, '광고구조에서 키워드 입찰을 읽는다');
ok(adKeywordBidNow_('없는ID')===null, '없는 키워드는 null — 0 으로 치지 않는다');

// 계획: 기준키워드ID 가 있으면 그룹이 아니라 키워드에 건다
// (앞 시험들이 광고육성 표를 고쳐 놓았으므로 여기서 새로 세운다)
const EXT2=['기준키워드ID','현재설정입찰(JPY)','목표클릭비용(JPY)','판단전환율(%)',
            '단계','멈춤필요','다음 행동'];
const CK=ADGROW_HEADER.length;
const kwRow=(o)=>{const r=g({sku:o.sku,camp:o.camp,cid:o.cid,gid:o.gid,asin:o.asin});
  while(r.length<CK) r.push('');
  return r.concat([o.kid||'', o.cur||21, o.target||30, 3, BSTAGE_GROW, '', '']);};
cells['광고육성']=[ADGROW_HEADER.slice().concat(EXT2),
  kwRow({sku:'신상A',camp:'KP GROW X',cid:'C1',gid:'G1',kid:'KW9'}),
  kwRow({sku:'신상B',camp:'KP GROW Y',cid:'C2',gid:'G2',asin:'B0GROW0002'})];
setPolicy('자동운영', true);        // 신상A 줄 (첫 줄) 을 세운다
// 신상B 도 같은 조건으로 (둘 다 밀리는지 보려는 것)
(function(){ const H=cells['광고육성'][0], m={}; H.forEach((h,i)=>m[h]=i);
  const r=cells['광고육성'][2]; while(r.length<H.length) r.push('');
  r[AG_MARGIN]=35; r[AG_CVR]=3; r[AG_LOSS]=4500; r[AG_MULT]=1.5; r[AG_WEEKLY]=13500;
  r[AG_APPROVE]=true; r[m['모드']]='자동운영'; r[m['정책버전']]=1; })();
cells['광고작업']=[JOB_HEADER.slice()];
struct(21); grp(21);
const pk=planAdGrowJobs({quiet:true});
const jbs=cells['광고작업'].slice(1);
const byT={}; jbs.forEach(r=>byT[r[JH2['상품키']]]=r);
ok(byT['신상A'] && byT['신상A'][JH2['대상종류']]==='키워드' && byT['신상A'][JH2['대상ID']]==='KW9',
   '기준키워드가 있으면 키워드에 건다 — '+(byT['신상A']||[])[JH2['대상종류']]);
ok(byT['신상B'] && byT['신상B'][JH2['대상종류']]==='광고그룹',
   '기준키워드가 없으면 그대로 광고그룹 — '+(byT['신상B']||[])[JH2['대상종류']]);
ok(String((byT['신상A']||[])[JH2['근거']]).indexOf('그룹 기본입찰은')>0,
   '   왜 키워드인지 근거에 적는다');

// 실행: /sp/keywords 로 간다
cells['광고작업']=[JOB_HEADER.slice(), mkJob({})];
cells['광고작업'][1][JH2['대상종류']]='키워드';
cells['광고작업'][1][JH2['대상ID']]='KW9';
apiLog=[];
global.adsApiRetry_=(t,m,p,b)=>{apiLog.push({m:m,p:p,b:b});
  return {keywords:{success:[{index:0,keywordId:'KW9'}]}};};
adJobRunStep_(false);
ok(apiLog.length===1 && apiLog[0].p==='/sp/keywords' &&
   apiLog[0].b.keywords[0].bid===24.15 && apiLog[0].b.keywords[0].keywordId==='KW9',
   '키워드 입찰을 /sp/keywords 로 보낸다');
ok(cells['광고작업'][1][JH2['상태']]===JOB_VERIFY, '보낸 뒤는 '+JOB_VERIFY);

// 검증: 광고구조의 키워드 입찰과 맞대 본다
struct(24.15); verifyAdJobs();
ok(cells['광고작업'][1][JH2['상태']]===JOB_DONE, '키워드 입찰이 실제로 바뀌었으면 '+JOB_DONE);
cells['광고작업'][1][JH2['상태']]=JOB_VERIFY; struct(21); verifyAdJobs();
ok(cells['광고작업'][1][JH2['상태']]===JOB_RETRY, '안 바뀌었으면 '+JOB_RETRY+' — 그룹 값에 속지 않는다');

// 그 사이 누가 키워드 입찰을 바꿨으면 덮지 않는다
setPolicy('자동운영', true); struct(30);
cells['광고작업']=[JOB_HEADER.slice(), mkJob({from:21})];
cells['광고작업'][1][JH2['대상종류']]='키워드'; cells['광고작업'][1][JH2['대상ID']]='KW9';
apiLog=[]; adJobRunStep_(false);
ok(apiLog.length===0 && cells['광고작업'][1][JH2['상태']]===JOB_CANCEL,
   '키워드도 그 사이 값이 바뀌었으면 덮지 않는다');

// ── 시장가 대비 우리 자리 (기획서 6장) ──────────────────
// 아마존은 '이 말의 시장가' 를 안 준다. 낸 값과 예산 소진율로 대신 본다.
const R=(o)=>adGrowReach_(Object.assign({days:7,im:1000,clicks:50,cost:1000,daily:1000,target:25},o));
let rc=R({days:2});
ok(rc.state==='', '자료가 '+REACH_MIN_DAYS+'일도 안 되면 진단하지 않는다 (모르는 것을 말하지 않는다)');
rc=R({daily:0});
ok(rc.state==='', '하루 예산을 모르면 소진율을 못 낸다 → 진단 안 함');
rc=R({im:0,cost:0,clicks:0});
ok(rc.state===REACH_NONE, '노출 0 → '+rc.state);
rc=R({cost:6800,clicks:200});      // 소진율 97% · CPC 34
ok(rc.state===REACH_FULL, '예산을 다 쓰면 → '+rc.state);
ok(rc.note.indexOf('예산을 올려야')>0, '   더 사려면 예산이라고 말한다');
// 소진율 낮은데 낸 값이 목표(25)에 붙음 → 천장에 막힘
rc=R({cost:1400,clicks:60,target:25});     // 소진율 20% · CPC 23.3 (목표의 93%)
ok(rc.state===REACH_CEIL, '예산을 못 쓰는데 낸 값이 목표에 붙음 → '+rc.state);
ok(rc.note.indexOf('손해배수')>0 && rc.note.indexOf('마진율')>0,
   '   사람이 정할 것을 적는다 (마진율 확인 · 손해배수 · 빼기)');
// 소진율 낮은데 낸 값은 한참 아래 → 살 노출이 적은 것
rc=R({cost:1400,clicks:200,target:25});    // 소진율 20% · CPC 7
ok(rc.state===REACH_THIN, '값은 여유 있는데 예산을 못 쓰면 → '+rc.state);
ok(rc.note.indexOf('검색량')>0, '   값 문제가 아니라고 말한다');
rc=R({cost:4000,clicks:160,target:25});    // 소진율 57%
ok(rc.state===REACH_OK, '어중간하면 정상 — 없는 문제를 만들지 않는다');

// ── 추천값 — 얼마를 넣으면 좋은가 ────────────────────────
// 마진율은 계산으로 나온다 (원가·배송비·환율·수수료). 전환율예측은 계정 중앙값.
// 주간허용손해만은 사람의 결정이라, 눈금('이 상품 몇 건 판 이익만큼')을 준다.
global.costMap_=()=>({'신상A':4000});          // 원가 4,000원
global.fxHouseRate_=()=>9.5;                   // 9.5 KRW/JPY
global.skuCostMap_=()=>({}); global.costInfoMap_=()=>({});
global.resolveShipping_=()=>({fee:250, src:'실측(12건)'});
global.DEFAULT_FEE_RATE=0.10;
global.unitProfitKrw_=(price,ship,cost,rate,fee)=>(price*(1-fee)-ship)*rate-cost;
// 계정 전환율 중앙값은 광고재배분 표의 [오가닉전환율] 에서 나온다 (7번째 칸)
cells['광고재배분']=[['SKU','a','b','c','d','e','오가닉전환율'],
  ['s1','','','','','',0.02], ['s2','','','','','',0.024], ['s3','','','','','',0.03]];
cells['광고캠페인일별']=[SPENDDAY_HEADER.slice()];

// 마진 문맥은 한 실행 동안 들고 있는다 — 위에서 stub 을 갈아 끼웠으니 새로 읽게 한다
adMarginCtx_(true);
let rec=adGrowRecommend_('신상A', 1380, 0, 1.5);
// (1380×0.9 − 250) × 9.5 − 4000 = 5,424원 → ÷9.5 = ¥571 → ÷1380 = 41.4%
ok(Math.abs(rec.margin.v-41.4)<0.3, '마진율은 원가로 계산한다 — '+rec.margin.v+'%');
ok(rec.margin.why.indexOf('원가')>=0 && rec.margin.why.indexOf('배송비')>=0,
   '   무엇으로 셈했는지 적는다 — "'+rec.margin.why.slice(0,44)+'"');
ok(rec.cvr.v===2.4 && rec.cvr.why.indexOf('중앙값')>0,
   '전환율예측은 계정 중앙값 — '+rec.cvr.v+'%');
// 주문당 공헌이익 = 1380 × 41.4% ≈ 571 → ×10건 ≈ 5,700
ok(rec.loss.v>=5200 && rec.loss.v<=6200, '주간허용손해는 열 건어치 이익 — '+fmtYen_(rec.loss.v));
ok(rec.loss.why.indexOf('10건')>0, '   눈금을 밝힌다 — "'+rec.loss.why+'"');

// 원가를 모르면 지어내지 않는다 — 기본값을 넣되 그렇다고 밝히고 고쳐 적으라고 말한다 (72AA).
// 여기서는 광고기준 시트가 비어 있어 ADBASIS_DEFAULTS 의 [기본 마진율] 이 그대로 온다.
global.costMap_=()=>({});
let rec2=adGrowRecommend_('모르는SKU', 1380, 0, 1.5);
ok(rec2.margin.v===MARGIN_DEFAULT_PCT,
   '원가도 바깥 시트도 없으면 기본 마진율 '+MARGIN_DEFAULT_PCT+'% 가 추천값에도 그대로 온다 ('+rec2.margin.v+'%)');
ok(rec2.margin.why.indexOf(MSRC_DEFAULT)===0 && rec2.margin.why.indexOf('적어 주세요')>0,
   '   기본값이라고 밝히고 실제 마진율을 적으라고 한다 — "'+rec2.margin.why.slice(0,40)+'"');

// 싼 상품은 하루 예산 바닥까지 올린다 (그 밑으로는 아마존이 캠페인을 안 돌린다)
let rec3=adGrowRecommend_('싼것', 200, 5, 1.5);   // 공헌이익 10 × 10건 = 100
ok(rec3.loss.v>=230, '너무 작으면 하루 예산 바닥까지 올린다 — '+fmtYen_(rec3.loss.v));
ok(rec3.loss.why.indexOf('아마존이 캠페인을 돌려서')>0, '   왜 올렸는지 적는다');

// 계정 주간 광고비의 5% 를 넘지 않는다 (한 상품이 계정을 흔들지 않게)
const today4=ymd_(new Date());
cells['광고캠페인일별']=[SPENDDAY_HEADER.slice(),
  [today4,'CX','옛 캠페인',0,0,40000,0,0,'14일','잠정','']];
let rec4=adGrowRecommend_('비싼것', 30000, 40, 1.5);   // 공헌이익 12,000 × 10 = 120,000
ok(rec4.loss.v<=1000, '계정을 흔들 만큼 크면 5% 로 낮춘다 — '+fmtYen_(rec4.loss.v));
ok(rec4.loss.why.indexOf('5%')>0, '   왜 낮췄는지 적는다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
