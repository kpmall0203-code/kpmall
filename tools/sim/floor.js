const fs=require('fs');
const floorCpc=7.7;
function mk(){ return function(bid,capMin){
  var raw=Number(bid)||0;
  var b=(floorCpc>raw)?Math.ceil(floorCpc):raw;
  if(capMin>0){var lim=Math.floor(capMin); if(b>lim)b=lim;}
  return Math.max(2,b);};}
const wf=mk();
console.log('%-28s %8s %8s %8s','상황','원래입찰','최소상한','결과');
const cs=[
 ['B2 ¥4 · 상한 9.24',4,9.24],['B3 ¥7 · 상한 10.8',7,10.8],
 ['B4 ¥10.1 · 상한 15.4',10.125,15.4],['B5 ¥15.2 · 상한 23',15.19,23],
 ['전용 ¥7 · 상한 10.8',7,10.8],['전용 ¥30 · 상한 46',30,46],
 ['상한이 시장가보다 낮음',4,7.0],['상한 없음',4,0],
];
for(const [l,b,c] of cs){const r=wf(b,c);
  const bad=(c>0&&Math.round(r)>c)?' ← 상한 넘음!':'';
  console.log('%-28s %8s %8s %8s%s',l,b,c||'-',r,bad);}
console.log('\n상한을 넘긴 경우:', cs.filter(([l,b,c])=>c>0&&Math.round(wf(b,c))>c).length===0?'없음 ✓':'있음 ✗');
console.log('시장가 아래로 남은 경우:', cs.filter(([l,b,c])=>{const r=wf(b,c);return c>=floorCpc&&r<floorCpc;}).length===0?'없음 ✓':'있음 ✗');
