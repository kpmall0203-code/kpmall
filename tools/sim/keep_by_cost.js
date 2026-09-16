// 상위 N 이 광고비 순인지 — 판매량 상위였을 때 빠지던 '돈만 쓰는' SKU 가 남는가
const fs=require('fs'); const s72=fs.readFileSync('' + __dirname + '/../../apps-script/72_광고.gs','utf8');
function fn(src,name){ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('no '+name);
  let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.substring(i,k+1);} } }
let props={ADS_TOP_N:'2'};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]==null?null:props[k]})};
global.ADS_TOP_N_DEFAULT=100; global.PROP_ADS_TOP_N='ADS_TOP_N'; global.PROP_ADS_SKUS='ADS_SKUS'; global.naOurCampaigns_=()=>({prefix:'KP NEW',cids:{}}); global.naIsOurs_=(o,n)=>String(n||'').indexOf('KP NEW')===0;
global.naHandedSkus_=()=>({}); global.countKeys_=o=>Object.keys(o).length; global.log_=()=>{};
for (const n of ['adsKeepSkus_','adsSkuList_','adsTopN_','parseAdsReport_']) eval(fn(s72,n));
const rep=[ {date:'2026-09-01',advertisedSku:'BEST',cost:10,clicks:2,impressions:100,campaignName:'KP A'},
  {date:'2026-09-01',advertisedSku:'LEAK',cost:500,clicks:100,impressions:9000,campaignName:'KP A'},
  {date:'2026-09-02',advertisedSku:'LEAK',cost:400,clicks:80,impressions:8000,campaignName:'KP B'},
  {date:'2026-09-01',advertisedSku:'MID',cost:50,clicks:10,impressions:500,campaignName:'KP A'},
  {date:'2026-09-01',advertisedSku:'NEWS',cost:1,clicks:1,impressions:5,campaignName:'KP NEW B1-1'} ];
let fail=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fail++; };
let p=parseAdsReport_(JSON.stringify(rep)); const kept=[...new Set(p.rows.map(r=>r[1]))].sort();
ok(kept.join()==='LEAK,MID', '광고비 상위 2 = 돈 쓴 순 (LEAK·MID) — 실제: '+kept.join());
ok(p.days[0][7]===4 && p.days[0][6]===2, '하루 합계는 거르기 전 전체(SKU 4) · 추적 2');
ok(p.na.length===1 && p.na[0][1]==='NEWS', '신규 줄은 상위 N 과 무관하게 남는다');
props={ADS_TOP_N:'0'}; p=parseAdsReport_(JSON.stringify(rep)); ok(new Set(p.rows.map(r=>r[1])).size===4, '0 = 전부');
props={ADS_SKUS:JSON.stringify(['BEST'])}; p=parseAdsReport_(JSON.stringify(rep)); ok(p.rows.length===1&&p.rows[0][1]==='BEST', '직접 적은 SKU 목록은 그대로');
console.log(fail?'\n✗ 실패 '+fail:'\n✓ 전부 통과'); process.exit(fail?1:0);
