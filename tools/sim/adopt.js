// 사다리를 어디서 멈추나 — 채택 · 머묾 · '노출을 못 사서 계속 올림' (72AE adExpandAdopt_)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;}
});
const mkSheet=name=>({ getName:()=>name,
  getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc) });
const sheets={};
global.ss_=()=>({getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null});
global.log_=()=>{}; global.ymd_=()=>'2026-09-09';
global.adRowApproved_=v=>v===true||String(v).trim()==='O';
global.adErrorText_=s=>String(s);
global.adLogBuffer_=()=>({push(){},flush(){}});
global.adLogRow_=o=>o;
global.adsToken_=()=>'T';
let sent=[];
global.adJobSend_=(t,act,kind,id,val)=>{sent.push({act:act,id:id,val:val});return {ok:true};};
global.hdrMap_=sh=>{const m={};(cells[sh.getName()][0]||[]).forEach((h,i)=>{m[String(h)]=i;});return m;};
global.cellOf_=(row,map,name,dflt)=>{const i=map[name];return i===undefined?dflt:(row[i]??dflt);};
global.addDays_=(y,n)=>{const d=new Date(y+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.SHEET_ADS='광고실적'; global.EXPAND_WINDOW_DAYS=30;
global.ADS_HEADER=['날짜','SKU','ASIN','캠페인','광고비(JPY)','광고매출(JPY)','노출','클릭','광고주문','수집일시'];
global.adUnitMap_=()=>({}); global.adExpandGroupIndex_=()=>({}); global.adExpandBudgetSignal_=()=>({});
global.adUnitCollectedAt_=()=>''; global.adMarginCtx_=()=>({}); global.adMarginFor_=()=>({pct:20});
global.adStopVerdict_=()=>({}); global.adPromoBand_=()=>null;
let basis={'확대 · 모드':'자동운영','확대 · 최대 동시 시험 수':10,'확대 · 시험 주간 지출한도(JPY)':5000,
  '확대 · 시험 손실한도(JPY)':5000,'확대 · 최대 유효입찰(JPY)':100};
global.adBasis_=()=>basis;
eval(fs.readFileSync('all/72AF_확대결과.js','utf8'));
eval(fs.readFileSync('all/72AB_확대후보.js','utf8'));
eval(fs.readFileSync('all/72AE_확대시험.js','utf8'));

// ── 광고실적: 시험마다 기준 14일 · 운영 14일 ────────────
// 노출을 정해 준다 — base 는 하루 노출, run 은 운영기간 하루 노출
function ads(rows){
  const out=[ADS_HEADER];
  rows.forEach(r=>{
    for(let i=0;i<14;i++) out.push(['2026-07-01'.slice(0,8)+String(1+i).padStart(2,'0'),r.sku,'A',
      'c',10,50,r.base,1,0,'']);
    for(let i=0;i<14;i++) out.push(['2026-08-'+String(1+i).padStart(2,'0'),r.sku,'A',
      'c',10,50,r.run,1,0,'']);
  });
  cells[SHEET_ADS]=out;
}
function test(id,sku,verdict,to,cap,approve){
  const r=new Array(EXTEST_HEADER.length).fill('');
  r[XT_ID]=id; r[XT_SKU]=sku; r[XT_ASIN]='A'; r[XT_FAM]='A'; r[XT_ARM]=XARM_TEST; r[XT_TYPE]=XTYPE_BID;
  r[XT_RKIND]='광고그룹'; r[XT_RID]='g1'; r[XT_RNAME]='KP'; r[XT_FROM]=10; r[XT_TO]=to; r[XT_CAP]=cap;
  r[XT_BFROM]='2026-07-01'; r[XT_BTO]='2026-07-14'; r[XT_RUNFROM]='2026-08-01'; r[XT_RUNTO]='2026-08-14';
  r[XT_STATE]=XS_DONE; r[XT_APPROVE]=approve===undefined?true:approve;
  return r;
}
function result(id,v){
  const r=new Array(EXRESULT_HEADER.length).fill('');
  const i=n=>EXRESULT_HEADER.indexOf(n);
  r[i('시험ID')]=id; r[i('판정')]=v; r[i('내 변화(일)')]=0; r[i('대조군 변화(일)')]=0;
  return r;
}
function run(tests,results){
  cells[SHEET_EXTEST]=[EXTEST_HEADER].concat(tests);
  cells[SHEET_EXRESULT]=[EXRESULT_HEADER].concat(results);
  sent=[];
  return adExpandAdopt_(adExpandPolicy_());
}
const state=i=>cells[SHEET_EXTEST][i+1][XT_STATE];
const said=i=>String(cells[SHEET_EXTEST][i+1][XT_RESULT]);

// ── 1) 노출을 더 샀는데 이익이 안 늘었다 → 거기가 끝이다 ─
ads([{sku:'S1',base:100,run:400}]);
let msg=run([test('T1','S1',null,11,20)],[result('T1',XV_NONE)]);
ok(state(0)===XS_STAY, '노출은 늘었는데 이익이 안 늘면 직전 값에 머문다 ('+state(0)+')');
ok(/노출 하루 100 → 400/.test(said(0)), '   결과에 노출이 얼마나 늘었는지 적는다 — '+said(0));
ok(sent.length===0, '   머무는 줄은 아마존에 아무것도 안 보낸다');

// ── 2) 값을 올렸는데 노출조차 안 늘었다 → 목표까지 계속 ─
ads([{sku:'S2',base:100,run:102}]);
msg=run([test('T2','S2',null,11,20)],[result('T2',XV_NONE)]);
ok(state(0)===XS_ADOPT, '노출을 못 샀으면 머물지 않고 그 값을 채택해 계속 올린다 ('+state(0)+')');
ok(/노출이 안 늘었습니다/.test(said(0)) && /목표 ¥20/.test(said(0)), '   왜 계속 올리는지 적는다 — '+said(0));
ok(sent.length===1 && sent[0].val===11, '   시험값 ¥11 을 다시 걸어 둔다');
ok(/계속 올림 1/.test(msg), '   요약에 몇 개인지 센다 — '+msg);

// ── 3) 목표 상한에 닿았으면 노출을 못 샀어도 멈춘다 ─────
msg=run([test('T3','S2',null,20,20)],[result('T3',XV_NONE)]);
ok(state(0)===XS_STAY, '목표 상한이면 더 올릴 자리가 없다 ('+state(0)+')');

// ── 4) 악화는 노출과 무관하게 멈춘다 ────────────────────
msg=run([test('T4','S2',null,11,20)],[result('T4',XV_BAD)]);
ok(state(0)===XS_STAY, '악화는 노출을 못 샀더라도 멈춘다 ('+state(0)+')');

// ── 5) 좋은 판정은 그대로 채택 ──────────────────────────
ads([{sku:'S3',base:100,run:400}]);
msg=run([test('T5','S3',null,11,20)],[result('T5',XV_KEEP)]);
ok(state(0)===XS_ADOPT && sent.length===1, '확대유지는 그대로 채택한다 ('+state(0)+')');
ok(!/노출이 안 늘었습니다/.test(said(0)), '   그때는 노출 이야기를 붙이지 않는다');

// ── 6) 승인이 없으면 올리지 않는다 ──────────────────────
ads([{sku:'S4',base:100,run:102}]);
msg=run([test('T6','S4',null,11,20,false)],[result('T6',XV_NONE)]);
ok(state(0)===XS_STAY && sent.length===0, '승인이 없으면 노출을 못 샀어도 안 올린다 ('+state(0)+')');
ok(/승인이 없어/.test(said(0)), '   왜 안 올렸는지 적는다 — '+said(0));

// ── 7) 광고실적이 없으면 판단하지 않는다 (머문다) ───────
cells[SHEET_ADS]=[ADS_HEADER];
msg=run([test('T7','S9',null,11,20)],[result('T7',XV_NONE)]);
ok(state(0)===XS_STAY, '노출 자료가 없으면 함부로 올리지 않는다 ('+state(0)+')');

// ── 8) 모의운영이면 아무것도 안 한다 ────────────────────
basis['확대 · 모드']='모의운영';
msg=run([test('T8','S2',null,11,20)],[result('T8',XV_NONE)]);
ok(/모의운영/.test(msg) && sent.length===0, '모의운영이면 채택도 머묾도 없다 — '+msg);
basis['확대 · 모드']='자동운영';

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
