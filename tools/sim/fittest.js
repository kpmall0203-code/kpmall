const fs=require('fs');
eval(fs.readFileSync('fit.js','utf8').match(/function fitRows_[\s\S]*?\n}/)[0]);
const H=['a','b','c','d'];
let rows=[[1,2],[1,2,3,4],[1]];
console.log('맞추기 전:', JSON.stringify(rows));
fitRows_('시험표',H,rows);
console.log('맞춘 뒤  :', JSON.stringify(rows));
console.log('모두 4칸 :', rows.every(r=>r.length===4));
try { fitRows_('시험표',H,[[1,2,3,4,5]]); console.log('넘치는 줄: 그냥 지나감 ← 위험'); }
catch(e){ console.log('넘치는 줄: 막힘 →', e.message.split('\n')[0]); }
