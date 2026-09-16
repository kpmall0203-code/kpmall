const fs=require('fs');
global.ADGROW_MULT_DEFAULT=1.5; global.pct1_=x=>(x*100).toFixed(1)+'%';
const src=fs.readFileSync('72O.js','utf8');
eval(src.match(/var ADGROW_HEADER[\s\S]*?\];/)[0]);
eval(src.match(/var AG_SKU[\s\S]*?AG_RESULT = \d+;/)[0]);
eval(src.match(/var ADGROW_OVER_MULT[\s\S]*?ADGROW_MIN_WEEKS = \d+;/)[0]);
eval(src.match(/function adGrowCalc_[\s\S]*?\n}/)[0]);
eval(src.match(/function adGrowVerdict_[\s\S]*?\n}/)[0]);

console.log('── 허용 손해 → 예산 역산이 실제로 그 손해를 내는가 ──');
console.log('가격 ¥3000 · 마진 20% · 목표전환율 3% · 주간 허용 손해 ¥3000\n');
console.log('%-6s %8s %8s %10s %10s %10s %10s'.replace(/%-?\d*s/g,m=>m),
  '배수','CPC상한','입찰','주간광고비','기대매출','기대ACOS','실제손해');
for(const r of [1.2,1.5,2.0,3.0]){
  const c=adGrowCalc_(3000,20,3,3000,r);
  const m=0.20, cvr=0.03, price=3000;
  const clicks=c.weekly/c.bid;              // 그 예산으로 살 클릭
  const orders=clicks*cvr;                   // 목표 전환율대로 팔리면
  const sales=orders*price;
  const acos=c.weekly/sales;
  const loss=c.weekly-sales*m;
  console.log('  %s   %6.1f  %6d  %9d  %9d   %7.1f%%  %9d',
    String(r).padEnd(4),c.cap,c.bid,c.weekly,Math.round(sales),100*acos,Math.round(loss));
}
console.log('\n  → 실제손해가 ¥3000 에 붙으면 역산이 맞는 것 (입찰 내림 때문에 조금 어긋남)');

console.log('\n── 입력 검증 ──');
for(const [lab,a] of [['마진율 0',[3000,0,3,3000,1.5]],['전환율 0',[3000,20,0,3000,1.5]],
  ['배수 1',[3000,20,3,3000,1]],['허용손해 0',[3000,20,3,0,1.5]],['가격 없음',[0,20,3,3000,1.5]]]){
  const c=adGrowCalc_(...a); console.log('  '+lab.padEnd(10)+' → '+(c.ok?'통과 ← 위험':'막힘: '+c.why.slice(0,42)));
}

console.log('\n── 주간 판정 ──');
const mk=o=>{const g=new Array(ADGROW_HEADER.length).fill('');
  g[AG_MARGIN]=20;g[AG_CVR]=3;g[AG_LOSS]=3000;g[AG_RANK]=o.rank||'';g[AG_RANKGOAL]=o.goal||'';return g;};
const cases=[
 ['순위 도달',      mk({rank:8,goal:10}), {ck:300,cost:9000,sales:30000,ord:9}, 4, 3000, 12000],
 ['손해 과다',      mk({}),               {ck:300,cost:9000,sales:6000,ord:2},  2, 7800,  6000],
 ['1주차',          mk({}),               {ck:50,cost:2000,sales:3000,ord:1},   1, 1400,  3000],
 ['전환율 절반 미만',mk({}),               {ck:200,cost:6000,sales:3000,ord:2},  3, 5400,  9000],
 ['전환율 좋음',    mk({}),               {ck:200,cost:6000,sales:24000,ord:8}, 3, 1200,  9000],
 ['평범',           mk({}),               {ck:200,cost:6000,sales:15000,ord:5}, 3, 3000,  9000],
];
for(const [lab,g,p,w,ls,pl] of cases)
  console.log('  '+lab.padEnd(16)+' → '+adGrowVerdict_(g,p,w,ls,pl).v.padEnd(16)+' | '+adGrowVerdict_(g,p,w,ls,pl).why.slice(0,62));
