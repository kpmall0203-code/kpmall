const fs=require('fs');
const L=fs.readFileSync('72L.js','utf8');
// 필요한 전역
global.SHEET_REALLOC='광고재배분'; global.SHEET_ADSTRUCT='광고구조'; global.SHEET_ADPLAN='광고생성계획';
global.ADSTRUCT_HEADER=new Array(17).fill('h'); global.ADSTRUCT_KIND_NEG='부정키워드';
global.REALLOC_HEADER=new Array(22).fill('h'); global.ADPLAN_HEADER=new Array(21).fill('h');
global.AP_RESULT=19; global.AP_GID=17; global.AP_SKUS=16;
global.ADKW_PROVISIONAL_DAYS=14; global.ADS_SOFT_MS=240000;
global.pct1_=x=>(x*100).toFixed(1)+'%'; global.ymd_=d=>typeof d==='string'?d:'2026-09-04';
global.addDays_=(d,n)=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000);
global.adBasis_=()=>({'목표 ACOS 비율':0.65,'기본 마진율':0.17});
global.adGroupSkus_=()=>({}); global.adSkuText_=(a,n)=>a.join(',');
global.log_=()=>{}; global.toast_=()=>{}; global.showSheet_=()=>{};
global.fitRows_=(n,h,r)=>r; global.headerNotes_=()=>{};
let written=null, deleted=[], appended=[];
const cells={};
const mkSheet=name=>({getName:()=>name,getLastRow:()=>(cells[name]||[]).length,getMaxRows:()=>100000,
  getRange:(r,c,nr,nc)=>({getValues:()=>{const rows=cells[name]||[];return Array.from({length:nr||1},(_,i)=>Array.from({length:nc||1},(_,j)=>(rows[r-1+i]||[])[c-1+j]??''));},
    getValue:()=>((cells[name]||[])[r-1]||[])[c-1]??'', setValues:v=>{appended.push([name,r,v.length]);}, setNumberFormat(){return this;}, insertCheckboxes(){return this;}}),
  deleteRows:(r,n)=>{deleted.push([name,r,n]);(cells[name]||[]).splice(r-1,n);}, insertRowsAfter(){}, setFrozenRows(){}});
global.ss_=()=>({getSheetByName:n=>cells[n]?mkSheet(n):null});
global.ensureSheet_=n=>{cells[n]=cells[n]||[['h']];return mkSheet(n);};
global.writeTable_=(sh,h,rows)=>{written=rows;};
eval(L);

// 원본 3주: 같은 검색어가 주마다 나온다
const H=ADTERM_RAW_HEADER;
cells['광고검색어주간']=[H];
const wk=[['2026-08-14','2026-08-20'],['2026-08-21','2026-08-27'],['2026-08-28','2026-09-03']];
for(const [f,t] of wk){
  cells['광고검색어주간'].push([f,t,'C1','G1','ピエール','close',5000,80,640,20000,3,new Date()]);   // 3주 합: 240클릭 9주문
  cells['광고검색어주간'].push([f,t,'C1','G1','ハズレ語','close',9000,90,720,0,0,new Date()]);      // 3주 합: 270클릭 0주문 → N 넘김
  cells['광고검색어주간'].push([f,t,'C1','G1','아직','close',300,10,80,0,0,new Date()]);          // 30클릭 0주문 → 더 봄
}
// 판정 표에 이전 승인·반영결과
cells['광고검색어']=[ADTERM_HEADER, (()=>{const r=new Array(28).fill('');r[AT_TERM]='ピエール';r[AT_GID]='G1';r[AT_APPROVE]=true;r[AT_APPLIED]='성공 · 키워드 K9';return r;})()];
cells['광고구조']=[ADSTRUCT_HEADER, ['big','자동','ENABLED',500,'big-g','ENABLED',8,'키워드','x','EXACT','ENABLED',8,8,'C1','G1','K1','']];

const r=adTermRollup_();
console.log('결과:', r.msg);
console.log('그룹 채산성 (판매실적에서): 객단가',(60000/9).toFixed(0),'× 0.17 = 손익분기CPA', (60000/9*0.17).toFixed(0));
for(const row of written) console.log('  %s | 클릭 %d · 주문 %d | %s | %s | 승인=%s 반영=%s', String(row[AT_TERM]).padEnd(8), row[AT_CLICKS], row[AT_ORDERS], row[AT_VERDICT], String(row[AT_WHY]).slice(0,60), row[AT_APPROVE], row[AT_APPLIED]);
const p=written.find(x=>x[AT_TERM]==='ピエール');
console.log('\n승인·반영결과 이어붙음:', p[AT_APPROVE]===true && String(p[AT_APPLIED]).startsWith('성공'));
console.log('한 검색어 = 한 줄:', written.length===3);

// 덧붙이기: 같은 주 다시 받으면 그 덩어리만 지운다
deleted=[]; appended=[];
adTermRawAppend_([['2026-08-28','2026-09-03','C1','G1','새로','close',1,1,8,0,0,new Date()]],'2026-08-28','2026-09-03');
console.log('\n같은 주 다시 받음 → 지운 덩어리:', JSON.stringify(deleted), '| 덧붙임:', JSON.stringify(appended));
console.log('다른 주는 그대로:', (cells['광고검색어주간'].filter(x=>x[0]==='2026-08-14').length===3));
