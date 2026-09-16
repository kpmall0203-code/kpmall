// 승격(72P) 한 바퀴: SKU 귀속 → 계획 → 수동 캠페인 생성 → 키워드 반영 + 원그룹 막기
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

const cells={};                       // 시트이름 -> 줄 배열 (머리글 포함)
const written={};                     // writeTable_ 이 남긴 것
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
  setHorizontalAlignment(){return this;},setWrap(){return this;}
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
let alerts=[];
global.ui_=()=>({alert:(a,b)=>{alerts.push(String(a)+' | '+String(b||''));return 1;},
  ButtonSet:{OK:1,OK_CANCEL:2,YES_NO_CANCEL:3},Button:{OK:1,YES:1,NO:2,CANCEL:9}});
global.Utilities={sleep(){},formatDate:()=>'2026-09-04'};
global.Session={getScriptTimeZone:()=>'Asia/Tokyo'};
global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger(){},
  newTrigger:()=>({timeBased:()=>({after:()=>({create(){}})})})};
global.PropertiesService={getScriptProperties:()=>({getProperty:()=>null,setProperty(){},deleteProperty(){}})};
global.adBusyGuard_=()=>true;
global.adsToken_=()=>'tok';
global.adSkuAsin_=()=>({'르네셀토너':'B0FBLY21B6','묶음SKU':'B0XXXXXXXX'});
global.adSkuText_=(a,n)=>(a||[]).slice(0,n||3).join(', ');
global.ymd_=()=>'2026-09-04';
global.adErrorText_=s=>String(s); global.adTriesOf_=()=>0; global.adAbortRun_=()=>{};
global.adMarkFail_=()=>false;
global.ADEXEC_MAX_TRIES=3; global.ADEXEC_ABORT_AFTER=5; global.ADS_SOFT_MS=4*60*1000;
global.ADEXEC_ADS_BATCH=100; global.ADEXEC_FLUSH_EVERY=15;
global.ADSW_CT_CAMPAIGN='c';global.ADSW_CT_ADGROUP='g';global.ADSW_CT_PRODUCTAD='p';
global.ADSW_CT_KEYWORD='k';global.ADSW_CT_NEGKEYWORD='n';
global.adRowApproved_=v=>v===true||String(v).toUpperCase()==='TRUE';
global.adsCreated_=(r,k,f)=>{const b=(r&&r[k])||{};
  return b.success?{ok:true,ids:b.success.map(x=>String(x[f]||''))}:{ok:false,ids:[],msg:'err'};};

let apiLog=[];
global.adsApiRetry_=(t,m,p,b)=>{ apiLog.push({p:p,b:b});
  if(p==='/sp/campaigns') return {campaigns:{success:[{index:0,campaignId:'CNEW'}]}};
  if(p==='/sp/adGroups') return {adGroups:{success:[{index:0,adGroupId:'GNEW'}]}};
  if(p==='/sp/productAds/list') return {productAds:[]};
  if(p==='/sp/productAds') return {productAds:{success:b.productAds.map((x,i)=>({index:i,adId:'A'+i}))}};
  if(p==='/sp/keywords') return {keywords:{success:b.keywords.map((x,i)=>({index:i,keywordId:'K'+i}))}};
  if(p==='/sp/negativeKeywords') return {negativeKeywords:{success:b.negativeKeywords.map((x,i)=>({index:i,keywordId:'N'+i}))}};
  return {}; };

for (const f of ['52D_주문보관','72D_광고구조','72F_광고대장','72H_광고재배분','72I_광고생성',
                 '72J_광고실행','72L_검색어','72M_검색어반영','72O_광고육성','72P_승격'])
  eval(fs.readFileSync('all/'+f+'.js','utf8'));
global.adBasis_=()=>({'캠페인 이름 앞머리':'KP','목표 ACOS 비율':0.65,'기본 마진율':0.17,
  '일예산 여유 배수':2.0,'최소 일예산':100});
global.adLogBuffer_=n=>({push(){},flush(){}});
global.adLogRow_=o=>[o.sum];

// ── 시트 자료 ────────────────────────────────────────────
cells['광고그룹']=[ADGRP_HEADER.slice(),
  ['옛캠','자동','옛그룹',      'ENABLED',10,1,          'O',3,'C1','G1','x'],  // SKU 1개
  ['big','자동','big',          'ENABLED',10,'25개 넘음','',9,'C2','G2','x']]; // 몰아넣기
cells['광고상품']=[ADPROD_HEADER.slice(),
  ['르네셀토너','B0FBLY21B6',1,'옛캠',1,'O','G1','x']];
cells['광고생성계획']=[ADPLAN_HEADER.slice()];
cells['광고재배분']=[REALLOC_HEADER.slice(),
  ['르네셀토너','토너',5,3000,3000,500,0.025,1,0.17,'기본',510,8,12,'O',1,5,1,'인상','x',90000,'B0FBLY21B6',true]];

const term=(gid,cid,verdict,text)=>{
  const r=new Array(ADTERM_HEADER.length).fill('');
  r[AT_TERM]=text; r[AT_VERDICT]=verdict; r[AT_CID]=cid; r[AT_GID]=gid;
  r[AT_CLICKS]=40; r[AT_ORDERS]=2; r[AT_CVR]=0.05; r[AT_CPC]=9; r[AT_BECPA]=510;
  r[3]='옛캠'; r[4]=gid==='G1'?'옛그룹':'big'; r[AT_WHY]='팔았다';
  return r; };
cells['광고검색어']=[ADTERM_HEADER.slice(),
  term('G1','C1','승격','르네셀 토너'),
  term('G1','C1','승격','renecell toner'),
  term('G2','C2','승격','화장품'),          // SKU 모름
  term('G1','C1','부정','싼 토너')];

// ── ① SKU 귀속 ──────────────────────────────────────────
const map=adPromoSkuByGroup_();
ok(map['G1']==='르네셀토너', 'SKU 1개 그룹 → 르네셀토너 ('+map['G1']+')');
ok(map['G2']===undefined,   '몰아넣기 그룹은 답하지 않는다');

// ── ② 계획 ──────────────────────────────────────────────
planAdPromote();
const tv=cells['광고검색어'].slice(1);
ok(tv[0][AT_PROMO_SKU]==='르네셀토너' && tv[0][AT_PROMO_CAMP]==='KP EXACT B0FBLY21B6',
   '승격줄에 SKU·캠페인 ('+tv[0][AT_PROMO_CAMP]+')');
ok(tv[2][AT_PROMO_SKU]===ADPROMO_MARK_UNKNOWN && !tv[2][AT_PROMO_CAMP],
   'SKU 모름 줄은 캠페인 없음');
ok(tv[3][AT_PROMO_SKU]==='' , '부정줄은 건드리지 않는다');
const plan=cells['광고생성계획'].slice(1);
ok(plan.length===1, '수동 캠페인 계획 1줄 (검색어 2개가 한 캠페인) — '+plan.length);
ok(plan[0][4]==='수동', '[유형] = 수동');
ok(plan[0][ADPLAN_HEADER.length-1]==='M', '[트랙] = M');
ok(plan[0][AP_APPROVE-1]===false, '승인은 꺼진 채로 — 돈은 사람이 켠다');
ok(Number(plan[0][AP_DAILY-1])>0 && Number(plan[0][AP_BID-1])>0,
   '예산 ¥'+plan[0][AP_DAILY-1]+' · 기본입찰 ¥'+plan[0][AP_BID-1]);

// ── ③ 재계산해도 살아남나 (72I 가 A 아닌 줄을 건진다) ────
const keep=[]; for(const r of plan) if(String(r[AP_TRACK-1]||'').trim()&&String(r[AP_TRACK-1]).trim()!=='A') keep.push(r);
ok(keep.length===1, '트랙 A 재계산이 승격줄을 건진다');

// ── ④ 수동 캠페인 생성 ──────────────────────────────────
apiLog=[];
const prow=plan[0].slice(); prow[AP_APPROVE-1]=true;
const res=adExecRow_('tok', mkSheet('광고생성계획'), 2, prow, 'PAUSED', []);
const camp=apiLog.filter(x=>x.p==='/sp/campaigns')[0];
ok(camp && camp.b.campaigns[0].targetingType==='MANUAL',
   '수동 줄은 MANUAL 로 만든다 ('+(camp?camp.b.campaigns[0].targetingType:'없음')+')');
const arow=new Array(ADPLAN_HEADER.length).fill(''); arow[4]='자동';
arow[AP_NAME-1]='KP AUTO'; arow[AP_SKUS-1]='르네셀토너'; arow[AP_BID-1]=8; arow[AP_DAILY-1]=300;
apiLog=[]; adExecRow_('tok', mkSheet('광고생성계획'), 3, arow, 'PAUSED', []);
ok(apiLog.filter(x=>x.p==='/sp/campaigns')[0].b.campaigns[0].targetingType==='AUTO',
   '자동 줄은 그대로 AUTO');

// ── ⑤ 반영: 키워드는 수동 그룹에, 부정은 원 그룹에 ──────
cells['광고생성계획'][1][AP_CID-1]='CNEW';
cells['광고생성계획'][1][AP_GID-1]='GNEW';
ADPROMO_TARGET_CACHE=null;
for(let i=1;i<cells['광고검색어'].length;i++) cells['광고검색어'][i][AT_APPROVE]=true;
apiLog=[];
const msg=adTermApplyStep_(false);
console.log('  … '+msg);
const kw=apiLog.filter(x=>x.p==='/sp/keywords');
const ng=apiLog.filter(x=>x.p==='/sp/negativeKeywords');
const kws=kw.length?kw[0].b.keywords:[];
ok(kws.length===2 && kws.every(k=>k.adGroupId==='GNEW'&&k.campaignId==='CNEW'&&k.matchType==='EXACT'),
   '승격 키워드 2개가 새 수동 그룹으로 ('+kws.map(k=>k.adGroupId).join(',')+')');
ok(kws.every(k=>k.bid>0), '키워드마다 입찰 ('+kws.map(k=>k.bid).join(',')+'엔)');
const negAll=[].concat.apply([],ng.map(x=>x.b.negativeKeywords));
const onSrc=negAll.filter(n=>n.adGroupId==='G1');
ok(onSrc.length===3, '원 그룹 G1 에 부정 3개 — 판정 부정 1 + 옮긴 말 2 (실제 '+onSrc.length+')');
ok(negAll.every(n=>n.matchType==='NEGATIVE_EXACT'), '전부 부정 정확 일치');
ok(negAll.every(n=>n.adGroupId!=='GNEW'), '새 수동 그룹은 막지 않는다');
const applied=cells['광고검색어'].slice(1).map(r=>String(r[AT_APPLIED]));
ok(applied[0].indexOf('성공')===0 && applied[0].indexOf('원그룹 막음')>0,
   '반영결과에 올림 + 원그룹 막음 — "'+applied[0]+'"');
ok(applied[2].indexOf('중단(SKU 모름)')===0, 'SKU 모름 줄은 중단 — "'+applied[2].substring(0,24)+'…"');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
