const fs=require('fs');
const src=fs.readFileSync('72O.js','utf8');
eval(src.match(/var ADGROW_PAGE1_DEFAULT = \d+;/)[0]);
eval(src.match(/function adGrowRankBlock_[\s\S]*?\n}/)[0]);
console.log('── 1페이지 판정 (기준 16위) ──');
const cases=[
 ['순위 안 적음',      '', 10],
 ['3위 · 목표 10위',    3, 10],
 ['10위 · 목표 10위',  10, 10],
 ['12위 · 목표 10위',  12, 10],   // 목표는 못 넘었지만 1페이지 안
 ['16위 · 목표 없음',  16, ''],
 ['17위 · 목표 없음',  17, ''],
 ['45위 · 목표 10위',  45, 10],
 ['0 (모름)',          0, 10],
];
for(const [lab,r,g] of cases){
  const b=adGrowRankBlock_(r,g,16);
  console.log('  '+lab.padEnd(18)+' → '+(b?'막힘 : '+b.slice(0,52):'통과'));
}
