const fs=require('fs');
// 72L 의 상수·자리표만 가져온다
const L=fs.readFileSync('72L.js','utf8');
eval(L.match(/var ADTERM_HEADER = \[[\s\S]*?\];/)[0]);
eval(L.match(/var AT_FROM = [\s\S]*?AT_APPLIED = \d+;/)[0]);
global.SHEET_ADTERM='광고검색어';
global.ADSW_CT_KEYWORD='k'; global.ADSW_CT_NEGKEYWORD='n';
global.ADS_SOFT_MS=4*60*1000; global.ADEXEC_FLUSH_EVERY=15;
global.ADEXEC_MAX_TRIES=3; global.ADEXEC_ABORT_AFTER=5;
global.adBusyGuard_=()=>true; global.adBasis_=()=>({'목표 ACOS 비율':0.65});
global.adsToken_=()=>'t'; global.adRowApproved_=c=>c===true||String(c).toUpperCase()==='TRUE';
global.adTriesOf_=s=>{const m=/실패 (\d+)회/.exec(String(s));return m?+m[1]:0;};
global.adErrorText_=s=>s; global.adAbortRun_=()=>{}; global.log_=()=>{};
global.toast_=()=>{}; global.showSheet_=()=>{};
global.adLogBuffer_=()=>{const b=[];return{push:r=>b.push(...r),flush:()=>{},all:b};};
global.adLogRow_=o=>o;
global.ScriptApp={getProjectTriggers:()=>[],newTrigger:()=>({timeBased:()=>({after:()=>({create:()=>{}})})})};
global.ui_=()=>({alert:()=>'OK',ButtonSet:{OK:'OK',OK_CANCEL:'OKC',YES_NO_CANCEL:'YNC'},Button:{OK:'OK',NO:'NO',CANCEL:'C'}});

// 헤더 자리에 맞춘 시험 줄
const H=ADTERM_HEADER.length;
function row(o){const r=new Array(H).fill('');
  r[3]='KP B0X'; r[4]='KP B0X'; r[AT_TERM]=o.term; r[7]='SKU1'; r[8]='B0X';
  r[AT_CLICKS]=o.clicks; r[AT_COST]=o.cost; r[AT_ORDERS]=o.orders;
  r[AT_CVR]=o.clicks?o.orders/o.clicks:0; r[AT_CPC]=o.clicks?o.cost/o.clicks:0;
  r[AT_BECPA]=o.beCpa; r[AT_VERDICT]=o.v; r[AT_WHY]='시험';
  r[AT_CID]='c1'; r[AT_GID]='g1'; r[AT_APPROVE]=o.ap!==false; r[AT_APPLIED]=o.applied||'';
  return r;}

const rows=[
  row({term:'ピエール ダルジャン',clicks:100,cost:800,orders:6,beCpa:300,v:'승격'}),
  row({term:'一発転換',           clicks:1,  cost:8,  orders:1,beCpa:300,v:'승격'}), // CVR 100%
  row({term:'高い割に売れる',      clicks:40, cost:1600,orders:3,beCpa:300,v:'승격'}), // CPC 40
  row({term:'무주문 낭비',        clicks:90, cost:900, orders:0,beCpa:300,v:'부정'}),
  row({term:'아직 모름',          clicks:5,  cost:40,  orders:0,beCpa:300,v:'더 봄'}),
  row({term:'이미 올림',          clicks:50, cost:400, orders:3,beCpa:300,v:'승격',applied:'성공 · 키워드 999'}),
  row({term:'승인 안 함',         clicks:50, cost:400, orders:3,beCpa:300,v:'승격',ap:false}),
  row({term:'x'.repeat(81),       clicks:50, cost:400, orders:3,beCpa:300,v:'승격'}),
];
let written=null, sent=[];
const rg={getValues:()=>rows.map(r=>r.slice()),setValues:v=>{written=v.map(x=>x[0]);}};
global.getSheetOrThrow_=()=>({getLastRow:()=>rows.length+1,getRange:()=>rg});
global.adsApiRetry_=(t,m,p,b,ct)=>{
  const key=p==='/sp/keywords'?'keywords':'negativeKeywords';
  const items=b[key]; sent.push([key,items.map(x=>({txt:x.keywordText,mt:x.matchType,bid:x.bid}))]);
  const out={success:[],error:[]};
  items.forEach((x,i)=>out.success.push({index:i,keywordId:'ID'+(1000+sent.length*10+i)}));
  const r={}; r[key]=out; return r;};
eval(fs.readFileSync('72M.js','utf8'));

console.log('── 입찰가 계산 ──');
console.log('  상한 = 손익분기CPA × CVR · 희망 = 상한×0.65 · 덮개 = 실제CPC×1.5\n');
for(const r of rows.slice(0,3)){
  const cvr=r[AT_CVR],cpc=r[AT_CPC],be=r[AT_BECPA];
  console.log('  "'+r[AT_TERM]+'"');
  console.log('    클릭 '+r[AT_CLICKS]+' · 주문 '+r[AT_ORDERS]+' · CVR '+(cvr*100).toFixed(1)+'% · 실제CPC '+cpc.toFixed(1));
  console.log('    상한 '+(be*cvr).toFixed(1)+' · 희망 '+(be*cvr*0.65).toFixed(1)+' · 덮개 '+(cpc*1.5).toFixed(1)+' → 입찰 '+adTermBid_(r,0.65));
}
console.log('\n── 반영 실행 ──');
console.log(adTermApplyStep_(false));
console.log('\n보낸 뭉치:');
for(const [k,items] of sent) console.log('  '+k+':',JSON.stringify(items,null,0));
console.log('\n반영결과 칸:');
rows.forEach((r,i)=>console.log('  '+String(r[AT_TERM]).slice(0,20).padEnd(22)+' | '+(written?written[i]:'')));
