// 리프라이싱 → 바깥 [상품 목록] 판매가·마진율 동기 (64B sourceMarginSync_)
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const cells={}; let writes=[];
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){writes.push([r,c,v.length,v[0].length]); const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;}
});
const mkSheet=name=>({ getName:()=>name, getLastRow:()=>(cells[name]||[]).length, getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc) });
global.SpreadsheetApp={openById:id=>({getSheetByName:n=>cells[n]?mkSheet(n):null})};
global.adBasis_=()=>({'마진율 시트 ID':'EXT'});
global.fxReceiveRate_=()=>8.644;      // KRW / JPY
global.DEFAULT_FEE_RATE=0.10;
let logs=[]; global.log_=(c,l,m)=>logs.push(m);
eval(fs.readFileSync('all/64B_가격반영_마진동기.js','utf8'));

// 상품 목록 흉내: 16열. C 조달비 · I 판매가 · L 마진율 · M 마진 · O SKU
function row(sku,krw,price,mpct,mjpy){ const r=new Array(16).fill(''); r[2]=krw; r[8]=price; r[11]=mpct; r[12]=mjpy; r[14]=sku; return r; }
// 실제 줄 하나를 그대로: 8,000원 · ¥2,450 · 24.1% · ¥591  → 조달비 ¥925.5 · 기타 ¥933.5 · 배송 = 933.5 − 245 = ¥688.5
cells['상품 목록']=[new Array(16).fill('h'),
  row('A-1','8,000원',2450,24.1,591),
  row('B-1','',3000,17.0,510),          // 조달비 없음
  row('A-1','8,000원',2450,24.1,591),   // 같은 SKU 두 줄
  row('C-1','13,000원',3200,19.2,615)];

// ── 1) 가격이 올라가면 수수료만 늘고 배송·조달비는 그대로 ──
let r=sourceMarginSync_([{sku:'A-1',price:2800},{sku:'B-1',price:3300},{sku:'Z-9',price:100},{sku:'C-1',price:3200}]);
const A=cells['상품 목록'][1], A2=cells['상품 목록'][3], B=cells['상품 목록'][2], C=cells['상품 목록'][4];
const costJ=8000/8.644, ship=(2450-591-costJ)-2450*0.1, m1=2800*0.9-ship-costJ;
ok(A[8]===2800 && A[12]===Math.round(m1) && A[11]===Math.round(m1/2800*1000)/10,
   'A-1: 판매가 ¥2,450→¥2,800 · 마진 ¥591→¥'+A[12]+' ('+A[11]+'%) — 배송비 ¥'+ship.toFixed(0)+' 는 그대로, 수수료만 ¥35 늘었다');
ok(Math.abs((2800-2450)*0.9 - (A[12]-591))<=1, '   마진 증가분 = 가격 증가분 × (1−수수료율) = ¥'+((2800-2450)*0.9).toFixed(0));
ok(A2[8]===2800 && A2[12]===A[12], '   같은 SKU 가 두 줄이면 둘 다 고친다');
ok(B[8]===3300 && B[11]===17.0 && B[12]===510, 'B-1: 조달비가 없으면 판매가만 고치고 마진은 둔다');
ok(C[8]===3200 && C[12]===615, 'C-1: 가격이 같으면 아무것도 안 건드린다');
ok(r.updated===3 && r.noCost===1 && r.missing===1, '   요약 — '+r.msg);
ok(writes.length===2 && writes[0][1]===9 && writes[1][1]===12 && writes[1][3]===2, '   쓰기는 두 번뿐 — I열 통째 · L:M 통째 ('+JSON.stringify(writes)+')');

// ── 2) 실제 507줄 분포로 검산: 우리 식이 바깥 값을 얼마나 재현하나 ──
// (바깥 시트가 쓴 마진을 같은 가격에서 우리 식으로 다시 세우면 배송비를 거꾸로 꺼내므로 정확히 같아야 한다)
writes=[]; cells['상품 목록']=[new Array(16).fill('h'), row('D-1','20,200원',5010,17.1,858)];
r=sourceMarginSync_([{sku:'D-1',price:5010.4}]);   // 사실상 같은 가격 (반올림 차이)
ok(cells['상품 목록'][1][12]===858, '반올림 차이(¥0.4)는 같은 가격으로 본다 — 마진 그대로 '+cells['상품 목록'][1][12]);
cells['상품 목록']=[new Array(16).fill('h'), row('D-1','20,200원',5010,17.1,858)];
r=sourceMarginSync_([{sku:'D-1',price:5010}]); r=sourceMarginSync_([{sku:'D-1',price:6000}]); r=sourceMarginSync_([{sku:'D-1',price:5010}]);
ok(cells['상품 목록'][1][12]===858 && cells['상품 목록'][1][11]===17.1, '올렸다 내리면 원래 값으로 정확히 돌아온다 (배송비를 새로 추정하지 않으므로) — '+cells['상품 목록'][1][12]+' · '+cells['상품 목록'][1][11]+'%');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
