// 소싱 조달비를 마진 사슬 ④ 로 (72AA sourceCostMap_ · adMarginFor_)
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const cells={};
const mkRange=(name,r,c,nr,nc)=>({ getValues:()=>{const rows=cells[name]||[];const out=[];
  for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
  return out;} });
const mkSheet=name=>({ getName:()=>name, getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1, getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc) });
global.ss_=()=>({getSheetByName:n=>cells[n]?mkSheet(n):null});
global.SpreadsheetApp={openById:()=>({getSheetByName:n=>cells[n]?mkSheet(n):null})};
let logs=[]; global.log_=(c,l,m)=>logs.push(l+' '+m);
global.SHEET_LISTING='리스팅'; global.SHEET_EXPAND='광고확대후보'; global.AD_REF_TAB='광고 기준값';
global.DEFAULT_FEE_RATE=0.10;
global.adBasis_=()=>({'기본 마진율':0.15,'마진율 시트 ID':'EXT','마진율 시트 탭':'상품 목록'});
global.costMap_=()=>({'HAS_COST': 5000});           // '원가' 탭에 있는 SKU
global.fxHouseRate_=()=>8.7;
global.skuCostMap_=()=>({}); global.costInfoMap_=()=>({});
global.resolveShipping_=()=>({fee:605, src:'추정(0.5kg)'});
global.unitProfitKrw_=(p,ship,cost,rate,fee)=>(p*(1-fee)-ship)*rate-cost;
global.adUserMarginMap_=()=>({});
global.normName_=s=>String(s||'').replace(/[\s()（）]/g,'');
global.externalMarginMap_=()=>({'이름만있는것':0.22});
global.srcKrw_=x=>{const m=String(x==null?'':x).replace(/,/g,'').match(/(\d+(?:\.\d+)?)/); return m?Number(m[1]):0;};
eval(fs.readFileSync('all/72AA_마진.js','utf8'));

// 바깥 상품 목록: C 조달비 · I 판매가 · M 마진 · O SKU · P 배송
function row(sku,krw,price,mjpy){ const r=new Array(16).fill(''); r[2]=krw; r[8]=price; r[12]=mjpy; r[14]=sku; r[15]='일반'; return r; }
cells['상품 목록']=[new Array(16).fill('h'),
  row('NEW-1','8,000원',2450,591),
  row('OLD-0','',2000,0),                    // 조달비 없음
  ['x','x','5,000원','x','x','x','x','x',3000,'x','x','x',400,'','','일반'],  // O열(SKU) 비어 있음 — 9/7 이전 줄
  row('LOSS-1','40,000원',2000,-100),        // 팔수록 손해
  row('HAS_COST','9,000원',3000,500)];       // 원가 탭에도 있는 SKU

// ── 1) 읽기 ──────────────────────────────────────────────
const m=sourceCostMap_();
ok(Object.keys(m).length===3 && !!m['NEW-1'], 'O열에 SKU 가 있는 줄만 읽는다 (9/7 이전 줄은 건너뛴다) — '+Object.keys(m).join(', '));
ok(m['NEW-1'].krw===8000, '   "8,000원" → 8000 ('+m['NEW-1'].krw+')');
ok(!m['OLD-0'], '   조달비가 빈 줄은 넣지 않는다');

// ── 2) 마진 사슬에서의 자리 ─────────────────────────────
const ctx=adMarginCtx_(true);
ok(ctx.nSrc===3, '문맥에 소싱 조달비 '+ctx.nSrc+'개');
// 판매가가 소싱 줄과 같으면 그 줄의 마진을 그대로 쓴다 — 수수료·배송비를 가정하지 않는다
let r=adMarginFor_(ctx,'NEW-1',2450,'','',null);
ok(r.src==='소싱 조달비' && r.pct===Math.round(591/2450*1000)/10,
   '판매가가 그대로면 소싱 줄의 마진을 그대로 쓴다 — ¥591 ÷ ¥2,450 = '+r.pct+'%');
ok(/수수료·배송비·조달비가 이미 빠진 값/.test(r.why),
   '   근거에 "수수료·배송비가 이미 빠진 값" 이라고 적는다 — 다시 셈하지 않는다');

// 값이 달라지면(리프라이싱) 배송비를 거꾸로 꺼내 수수료만 다시 센다 (64B 와 같은 셈)
const ship1=2450*0.9-8000/8.7-591;
r=adMarginFor_(ctx,'NEW-1',2600,'','',null);
const exp=Math.round(((2600*0.9-ship1)*8.7-8000)/8.7/2600*1000)/10;
ok(r.src==='소싱 조달비' && r.pct===exp, '   값이 오르면 다시 센다 — ¥2,600 에서 '+r.pct+'%');
ok(/소싱 예측\(694\)/.test(r.why),
   '   그때 배송비는 소싱 줄에서 거꾸로 꺼낸 ¥'+Math.round(ship1)+' (우리 0.5kg 추정 ¥605 이 아니다)');
ok(adSrcShip_(m['NEW-1'],8.7)>0 && Math.abs(adSrcShip_(m['NEW-1'],8.7)-ship1)<0.5,
   '   adSrcShip_ = 판매가×(1−수수료) − 조달비 − 마진');

// 개입수가 크면 배송비도 크다 — 0.5kg 고정으로 보면 마진을 과대평가한다.
// 실자료(2026-09-11 · 646줄): 1개입 ¥729 · 6개입 ¥1,054 · 20개입 ¥1,521
cells['상품 목록'].push(row('여섯개입-6','30,000원',7000,1820));
const ctx6=adMarginCtx_(true);
const r6=adMarginFor_(ctx6,'여섯개입-6',7200,'','',null);   // 값이 달라진 줄
const ship6=7000*0.9-30000/8.7-1820;
ok(ship6>1000 && new RegExp('소싱 예측\\('+Math.round(ship6)+'\\)').test(r6.why),
   '   6개입은 배송비 ¥'+Math.round(ship6)+' 로 본다 (0.5kg 추정이면 ¥605 — 마진율이 '+
   (Math.round((ship6-605)/7200*1000)/10)+'%p 과대평가된다)');
ok(r6.pct < Math.round(((7200*0.9-605)*8.7-30000)/8.7/7200*1000)/10,
   '   그래서 마진율이 0.5kg 추정보다 낮게(보수적으로) 나온다 — '+r6.pct+'%');

r=adMarginFor_(ctx,'HAS_COST',3000,'','',null);
ok(r.src==='원가 계산', "'원가' 탭이 있으면 그것이 먼저 (③ > ④) — "+r.src);
r=adMarginFor_(ctx,'LOSS-1',2000,'','',null);
ok(r.src==='원가 계산(적자)' && r.pct===0, '조달비가 판매가보다 크면 적자로 막는다 — '+r.src);
r=adMarginFor_(ctx,'NOPE',2450,'이름만있는것','',null);
ok(r.src==='마진율 시트', 'SKU 가 없으면 옛 이름 매칭으로 (④ > ⑤) — '+r.src);
r=adMarginFor_(ctx,'NOPE2',2450,'','',null);
ok(r.src==='기본값' && r.pct===15, '아무것도 없으면 기본값 15% — '+r.pct+'%');

// ── 3) 사람이 적은 값이 여전히 가장 세다 ────────────────
global.adUserMarginMap_=()=>({'NEW-1':9});
const ctx2=adMarginCtx_(true);
r=adMarginFor_(ctx2,'NEW-1',2450,'','',null);
ok(r.src==='사용자 입력' && r.pct===9, '표에 적은 값이 소싱 조달비를 이긴다 (② > ④) — '+r.src);
cells['광고 기준값']=[['SKU','ASIN','상품명(참고)','마진율(%)','판매가(JPY)','메모'],
                     ['NEW-1','B0NEW','','33','','사람이 적음']];
const ctx3=adMarginCtx_(true);
r=adMarginFor_(ctx3,'NEW-1',2450,'','',null);
ok(r.src==='기준값 시트' && r.pct===33, '기준값 시트가 맨 위 (① > ②) — '+r.src);

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
