// 승격 — 몰아넣기 그룹에 갇힌 상품을 가격선 캠페인으로 (72AH)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };
const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;},
  setValue(x){return this.setValues([[x]]);},getValue:()=>((cells[name]||[])[r-1]||[])[c-1]??'',
  setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
  setNumberFormat(){return this;},insertCheckboxes(){return this;},setNote(){return this;},setNotes(){return this;}
});
const mkSheet=name=>({getName:()=>name,getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1,getMaxRows:()=>1000,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),setFrozenRows(){},insertRowsAfter(){},setColumnWidth(){}});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));}};
let alerts=[];
global.ss_=()=>ss; global.SpreadsheetApp={flush(){}};
global.ui_=()=>({alert:(a,b)=>{alerts.push([String(a),String(b||'')]);return 'YES';},ButtonSet:{OK:1,YES_NO:2},Button:{YES:'YES'}});
global.log_=()=>{}; global.showSheet_=()=>{};
global.makeOneSheet_=specs=>{const n=specs[0].name; if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
global.hdrMap_=sh=>{const h=(cells[sh.getName()]||[[]])[0]||[];const m={};h.forEach((x,i)=>{m[String(x)]=i;});return m;};
global.cellOf_=(row,map,name,dft)=>{const i=map[name];return i===undefined?dft:(row[i]??dft);};
global.SHEET_EXPAND='광고확대후보'; global.SHEET_ADPLAN='광고생성계획';
global.EXPAND_WINDOW_DAYS=45; global.adSpanDays_=t=>{const m=String(t||'').match(/(\d+)\s*일/); return m&&+m[1]>0? +m[1] : 45;}; global.EXTEST_MIN_BID=2; global.EXA_SPLIT='분리 필요';
global.ADPLAN_HEADER=['계획ID','동작','방식','캠페인명','유형','일예산(JPY)','입찰(JPY)','SKU수','기존SKU수','대표SKU','CPC구간','손익분기CPA(JPY)','월매출합(JPY)','기존광고제거','근거','SKU목록','광고그룹ID','승인','결과','캠페인ID','광고ID들','트랙'];
global.AP_NAME=4; global.AP_APPROVE=18; global.AP_DAILY=6; global.AP_BID=7; global.AP_RESULT=19; global.AP_CID=20; global.AP_ACTION=2; global.AP_GID=17; global.AP_SKUS=16;
global.adSkuListJoin_=a=>a.join(' | '); global.adSkuListSplit_=t=>String(t||'').split('|').map(x=>x.trim()).filter(Boolean);
global.adPlanRow_=o=>['',o.action,o.kind,o.name,'자동',o.daily,Math.round(o.bid),o.skus.length,0,
  o.skus[0].sku,o.band,Math.round(o.beMin),Math.round(o.amt),'실행 시 확인',o.why,
  o.skus.map(x=>x.sku).join(', '),'',false,'','','','A'];
let basis={'묶음 CPC 기준점':2,'묶음 CPC 배수':1.5,'한 번에 올릴 최대 배수':3,'확대 · 승격 첫 배수':1.5,'일예산 여유 배수':2,
  '확대 · 승격 반반 시험':'FALSE',   // 아래 6) 에서 켠다
  '최소 일예산':100,'캠페인 이름 앞머리':'KP'};
global.adBasis_=()=>basis;
global.EXTEST_WEEK_DAYS=7;
global.XARM_TEST='시험군'; global.XARM_CTRL='대조군'; global.AP_TRACK=22;
let weekUsed=0; global.adExpandWeekUsed_=()=>weekUsed;   // 돌고 있는 시험이 이미 예약한 돈
eval(fs.readFileSync('all/72AH_승격.js','utf8'));

// ── 1) 가격선 사다리 ────────────────────────────────────
const b=(t)=>adPromoBand_(t,2,1.5);
ok(b(1).lo===2, '기준점(¥2)보다 낮으면 첫 칸 ('+b(1).lo+')');
ok(b(2).lo===2 && b(2.9).lo===2, '¥2~3 은 ¥2 선');
ok(b(3.1).lo===3 && b(4.4).lo===3, '¥3~4.5 는 ¥3 선');
ok(b(17.48).lo===15.19, '목표 ¥17.48 은 ¥15.19 선 ('+b(17.48).lo+')');
ok(adPromoBand_(0,2,1.5)===null, '목표를 모르면 칸을 안 준다');

// ── 2) 계획 — 가격선마다 한 줄 ──────────────────────────
const EH=['SKU','ASIN','상품명','판매가(JPY)','마진율(%)','마진출처','마진근거','객단가(JPY)','성숙클릭','성숙주문',
 '광고비(JPY)','광고매출(JPY)','실제클릭비용(JPY)','실제주문율(%)','판단주문율(%)','주문당공헌이익(JPY)',
 '손익분기클릭비용(JPY)','목표클릭비용(JPY)','여유배수','필요마진율(%)','분류','사유','자료기간','판정','바꿀 것','승인','결과','프로그램값(%)','실행자료'];
const row=(sku,target,cpc,cost,verdict)=>{const r=new Array(EH.length).fill('');
  r[0]=sku; r[1]='B0'+sku; r[10]=cost; r[11]=cost*3; r[12]=cpc; r[16]=target/0.65; r[17]=target;
  r[22]='2026-07-27~2026-08-25 · 30일';    // 하루 광고비는 이 '실제로 센 날' 로 나눈다
  r[23]=verdict||'분리 필요'; return r;};
cells['광고확대후보']=[EH,
  row('A1',17,7,3000), row('A2',18,6,3000),      // 같은 ¥15.19 선
  row('B1',7,3,1500),                            // ¥6.75 선
  row('C1',40,30,9000),                          // ¥30.4 선
  row('D1',17,7,3000,'유지')];                   // 분리 필요가 아니다
let r=planAdPromoteBands();
const pv=(cells['광고생성계획']||[]).slice(1);
ok(r.rows===3 && pv.length===3, '가격선마다 한 줄 ('+r.rows+'줄)');
ok(r.skus===4, '   분리 필요 4개만 담는다 (유지는 뺀다) — '+r.skus);
const byName={}; pv.forEach(x=>{byName[x[AP_NAME-1]]=x;});
ok(!!byName['KP EXPAND B5'], '캠페인 이름은 아스키 — '+Object.keys(byName).join(' · '));
const big=byName['KP EXPAND B5'];
ok(big[7]===2, '   ¥15.19 선에 2개가 함께 들어간다 ('+big[7]+'개)');
ok(big[AP_BID-1]===10, '   처음 입찰 = 지금 중앙값 ¥7 의 1.5배 ¥10.5 (가격선 ¥15.19 로 한 번에 뛰지 않는다) → '+big[AP_BID-1]);
const small=byName['KP EXPAND B3'];
ok(small[AP_BID-1]===4, '   ¥6.75 선 · 지금 ¥3 → 1.5배 ¥4.5 를 내려 ¥4 ('+small[AP_BID-1]+')');
const c1=byName['KP EXPAND B7'];
ok(c1[AP_BID-1]===34, '   ¥34.17 선 · 지금 ¥30 → 1.5배 ¥45 보다 낮은 가격선을 쓴다 ('+c1[AP_BID-1]+')');

// 첫 배수를 안 적어 두어도 3배가 아니라 1.5배가 기본이다 (10%씩 올리는 규칙과 어긋나지 않게)
delete basis['확대 · 승격 첫 배수'];
cells['광고생성계획']=[ADPLAN_HEADER];
planAdPromoteBands();
const dflt={}; (cells['광고생성계획']||[]).slice(1).forEach(x=>{dflt[x[AP_NAME-1]]=x;});
ok(dflt['KP EXPAND B5'][AP_BID-1]===10, '   [승격 첫 배수] 를 안 적으면 1.5배 ('+dflt['KP EXPAND B5'][AP_BID-1]+') — [한 번에 올릴 최대 배수] 3배를 쓰지 않는다');
basis['확대 · 승격 첫 배수']=1.5;
cells['광고생성계획']=[ADPLAN_HEADER];
planAdPromoteBands();
const re={}; (cells['광고생성계획']||[]).slice(1).forEach(x=>{re[x[AP_NAME-1]]=x;});
Object.keys(re).forEach(k=>{byName[k]=re[k];});
ok(big[AP_DAILY-1]===Math.round(6000/30*2), '   하루 예산은 지금 쓰던 돈 × 여유배수 ('+big[AP_DAILY-1]+')');
ok(big[AP_APPROVE-1]===true, '   ② 시작이 승인한 것이므로 승인 ✓ 로 넣는다');
ok(/옛 그룹에서는 멈춘다/.test(String(big[14])), '   근거에 "옛 그룹에서는 멈춘다" 를 적는다');

// 자료기간이 달라지면 하루 광고비도 달라진다 — 창 길이가 아니라 실제로 센 날로 나눈다
{
  const half=[EH, row('Z1',17,7,3000)]; half[1][22]='2026-07-12~2026-08-25 · 45일';
  const keep=cells['광고확대후보']; cells['광고확대후보']=half;
  const kp=cells['광고생성계획']; cells['광고생성계획']=[ADPLAN_HEADER];
  const rz=planAdPromoteBands();
  ok((cells['광고생성계획']||[]).slice(1)[0][AP_DAILY-1]===Math.round(3000/45*2),
     '자료기간 45일이면 하루 광고비는 ¥3,000÷45 (÷30 이 아니다) → 예산 ¥'+(cells['광고생성계획']||[]).slice(1)[0][AP_DAILY-1]);
  cells['광고확대후보']=keep; cells['광고생성계획']=kp;
}

// ── 3) 주간 지출한도 ────────────────────────────────────
// 더 나가는 돈은 예산이 아니라 입찰이 올라간 만큼이다: 하루 광고비 × (첫입찰/지금값 − 1) × 7
ok(r.week===997, '주간 추가액 = ¥600(B5) + ¥280(B7) + ¥117(B3) = ¥997 — '+r.week);
ok(r.daily===1100, '   하루 예산 합계는 따로 센다 (지금 쓰던 돈 × 여유배수) — '+r.daily);
cells['광고생성계획']=[ADPLAN_HEADER];
basis['확대 · 시험 주간 지출한도(JPY)']=500;
r=planAdPromoteBands();
ok(r.week<=500 && r.over===2, '한도를 넘는 칸은 미룬다 — 주간 '+r.week+' · 미룬 SKU '+r.over+'개');
ok(r.rows===2, '   ¥600 이 드는 B5 만 빠지고 나머지 둘은 들어간다 ('+r.rows+'줄)');
cells['광고생성계획']=[ADPLAN_HEADER];
weekUsed=400;
r=planAdPromoteBands();
ok(r.week<=100, '   돌고 있는 시험이 ¥400 을 이미 예약했으면 남은 ¥100 안에서만 한다 (주간 '+r.week+')');
weekUsed=0;
delete basis['확대 · 시험 주간 지출한도(JPY)'];
cells['광고생성계획']=[ADPLAN_HEADER];
r=planAdPromoteBands();
ok(r.rows===3 && r.over===0 && !r.blocked, '   한도를 비우면 제한 없음 — 세 칸 다 만든다 ('+r.rows+'줄)');

// ── 4) 같은 이름은 두 번 만들지 않는다 ──────────────────
cells['광고생성계획']=[ADPLAN_HEADER]; planAdPromoteBands();
const n1=(cells['광고생성계획']||[]).length;
planAdPromoteBands();
ok((cells['광고생성계획']||[]).length===n1, '다시 계획해도 같은 가격선 캠페인을 또 만들지 않는다');

// ── 4-1) dry — 표를 건드리지 않고 셈만 ──────────────────
cells['광고생성계획']=[ADPLAN_HEADER];
const dr=planAdPromoteBands({dry:true});
ok(dr.rows===3 && dr.week===997 && (cells['광고생성계획']||[]).length===1,
   'dry 는 셈만 하고 계획 표에 한 줄도 안 넣는다 (② 시작의 확인창이 금액을 먼저 보여 준다)');

// ── 5) 고른 SKU 만 ──────────────────────────────────────
cells['광고생성계획']=[ADPLAN_HEADER];
r=planAdPromoteBands({skus:{B1:true}});
ok(r.rows===1 && r.skus===1, '승인한 SKU 만 계획한다 ('+r.rows+'줄 · '+r.skus+'개)');
// ── 6) 반반 시험 — 가격선마다 두 편 ─────────────────────
// ASIN 해시(씨앗 20260908): B0A1·B0A2·B0A3·B0C1 = 시험군 · B0A4·B0B1 = 대조군
basis['확대 · 승격 반반 시험']='TRUE';
cells['광고확대후보']=[EH,
  row('A1',17,7,3000), row('A2',18,6,3000), row('A3',17,7,3000), row('A4',17,7,3000),   // ¥15.19 선: 시험 3 · 대조 1
  row('B1',7,3,1500),                                                                   // ¥6.75 선: 대조 하나뿐
  row('C1',40,30,9000)];                                                                // ¥34.17 선: 시험 하나뿐
cells['광고생성계획']=[ADPLAN_HEADER];
r=planAdPromoteBands();
const nm={}; (cells['광고생성계획']||[]).slice(1).forEach(x=>{nm[x[AP_NAME-1]]=x;});
ok(!!nm['KP EXPAND B5'] && !!nm['KP EXPAND B5T'], '두 편이 다 있는 가격선은 캠페인이 둘 — '+Object.keys(nm).join(' · '));
ok(nm['KP EXPAND B5'][AP_BID-1]===7 && nm['KP EXPAND B5T'][AP_BID-1]===10,
   '   대조편 ¥7 (중앙값 그대로) · 시험편 ¥10 (1.5배) — 중앙값은 칸 전체로 잰다 ('+nm['KP EXPAND B5'][AP_BID-1]+' · '+nm['KP EXPAND B5T'][AP_BID-1]+')');
ok(nm['KP EXPAND B5'][7]===1 && nm['KP EXPAND B5T'][7]===3, '   대조편 1개 · 시험편 3개 — 같은 ASIN 은 같은 편');
ok(!nm['KP EXPAND B3T'] && nm['KP EXPAND B3'][AP_BID-1]===3,
   '한 편이 비면 가르지 않고 값 그대로 옮긴다 (B3: 대조 하나뿐 → ¥3)');
ok(!nm['KP EXPAND B7T'] && nm['KP EXPAND B7'][AP_BID-1]===30,
   '   시험군 하나뿐인 칸도 재지 않은 채 올리지 않는다 (B7: ¥34 가 아니라 지금 값 ¥30)');
ok(/반반 시험 없음/.test(String(nm['KP EXPAND B7'][14])), '   근거에 왜 안 갈랐는지 적는다');
ok(r.arms.test===3 && r.arms.ctrl===3, '   편 수: 시험 3 · 대조 3 (값 그대로 옮긴 것은 대조로 센다) — '+JSON.stringify(r.arms));
ok((cells['광고생성계획']||[]).slice(1).every(x=>x[AP_TRACK-1]==='X'), '   [트랙] 은 전부 X — 만들 때 켜라는 표시');
// 주간 추가액: 대조편 0 · 시험편만. B5T = (3000+3000+3000)/30 × (10/7−1) × 7 = 300 × 0.4286 × 7 = 900
ok(r.week===900, '   주간 추가액은 시험편만 센다 (¥900) — '+r.week);
// 시험편이 정수로 대조편과 같아지면 가르지 않는다
cells['광고확대후보']=[EH, row('D1',7,6.6,3000), row('D2',7,6.6,3000)];   // ¥6.75 선 · 6.6×1.5=9.9 → min(6.75) → 6 = 대조 6
cells['광고생성계획']=[ADPLAN_HEADER];
r=planAdPromoteBands();
const nm2={}; (cells['광고생성계획']||[]).slice(1).forEach(x=>{nm2[x[AP_NAME-1]]=x;});
ok(Object.keys(nm2).length===1 && /같은 값/.test(String(Object.values(nm2)[0][14])),
   '첫 배수를 걸어도 정수로 같은 값이면 한 캠페인 — '+Object.keys(nm2).join(' · '));

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
