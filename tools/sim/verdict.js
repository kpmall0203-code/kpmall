const fs=require('fs');
const L=fs.readFileSync('72L.js','utf8');
eval(L.match(/var ADTERM_JUDGE_ORDERS[\s\S]*?ADTERM_PROMOTE_ORDERS = \d+;/)[0]);
global.pct1_=x=>(x*100).toFixed(1)+'%';
eval(L.match(/function adTermGroupBasis_[\s\S]*?\n}/)[0]);
eval(L.match(/function adTermVerdict_[\s\S]*?\n}\n\n/)[0]);

// 실제 표에서 뽑은 그룹 실적
const rep=[
 {adGroupId:'big', sales14d:3027731, purchases14d:875},
 {adGroupId:'x',   sales14d:0,       purchases14d:0},
];
const gb=adTermGroupBasis_(rep,0.17);
console.log('그룹 기준:', JSON.stringify(gb));
const B=gb['big'].beCpa;
const cases=[
 {n:'ピエールダルジャン',   clicks:671, cost:3077, orders:41},
 {n:'주문 1건 · 전환 좋음', clicks:20,  cost:160,  orders:1},
 {n:'클릭만 잔뜩 · 주문 0', clicks:400, cost:3200, orders:0},
 {n:'클릭 적음 · 주문 0',   clicks:10,  cost:80,   orders:0},
 {n:'채산성 모름',          clicks:50,  cost:400,  orders:0, noBase:true},
];
console.log('\n손익분기CPA ¥'+B.toFixed(0)+' 기준 판정:');
for(const c of cases){
  const d=adTermVerdict_({clicks:c.clicks,cost:c.cost,orders:c.orders,
    beCpa:c.noBase?0:B, src:c.noBase?'':'group'},{'목표 ACOS 비율':0.65});
  console.log('  '+c.n.padEnd(20)+' → '+d.v.padEnd(7)+' | '+d.why);
}
