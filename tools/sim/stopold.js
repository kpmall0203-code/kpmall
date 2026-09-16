// 승격 뒷정리 — 옮긴 상품을 옛 그룹에서 멈춘다 (72AH adPromoteStopOld_)
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;},
  setValue(x){return this.setValues([[x]]);},
  setNumberFormat(){fmt.push(name+':'+r+':'+c); return this;}
});
let fmt=[];
const mkSheet=name=>({ getName:()=>name, getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1, getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc) });
const sheets={};
global.ss_=()=>({getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null});
global.log_=(c,l,m)=>{logs.push(l+' '+m);}; let logs=[];
global.ui_=()=>({alert(){return 'YES';},ButtonSet:{OK:1,YES_NO:2},Button:{YES:'YES'}});
global.adBusyGuard_=()=>true; global.adUnitCollectedAt_=()=>'2026-09-10';
const props={}; global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=String(v);}})}; global.adsToken_=()=>'T'; global.ADS_SOFT_MS=4*60*1000;
global.ADSW_CT_PRODUCTAD='p'; global.ADSTOP_BATCH=100; global.SHEET_ADLOG='광고변경대장';
global.adSkuText_=(a,n)=>a.slice(0,n||3).join(', ')+(a.length>(n||3)?' 외 '+(a.length-(n||3))+'개':'');
let ledger=[]; global.adLogBuffer_=()=>({push(r){ledger=ledger.concat(r);},flush(){}}); global.adLogRow_=o=>o;
global.adErrorText_=s=>String(s);
global.SHEET_ADPLAN='광고생성계획'; global.SHEET_ADUNIT='상품광고목록';
global.ADPLAN_HEADER=new Array(22).fill('x');
global.AP_NAME=4; global.AP_BID=7; global.AP_SKUS=16; global.AP_GID=17; global.AP_RESULT=19; global.AP_CID=20; global.AP_ADIDS=21; global.AP_TRACK=22;
global.ADUNIT_HEADER=['SKU','ASIN','캠페인','광고그룹','상태','광고ID','캠페인ID','광고그룹ID','수집일시'];
global.adSkuListSplit_=t=>String(t||'').split('|').map(x=>x.trim()).filter(Boolean);
global.adPlanSkus_=r=>{const l=String(r[AP_SKUS-1]||'').trim(),p=String(r[9]||'').trim();return (l&&p&&l===p)?[l]:adSkuListSplit_(l);};
global.XARM_TEST='시험군'; global.XARM_CTRL='대조군';
// 아마존 흉내
let api=[];
global.adsApiRetry_=(t,m,p,body)=>{ api.push({m,p,body:JSON.parse(JSON.stringify(body))});
  if(p==='/sp/productAds/list'){ const gid=body.adGroupIdFilter.include[0];
    const inNew={G_NEW:[{sku:'S1',adId:'N1'},{sku:'S2',adId:'N2'},{sku:'S4',adId:'N4'}], G_NEW2:[{sku:'S9',adId:'N9'}]}[gid]||[];
    return {productAds:inNew.map(x=>({sku:x.sku,adId:x.adId,adGroupId:gid,state:'ENABLED'}))}; }
  if(p==='/sp/productAds'&&m==='put') return {productAds:{success:body.productAds.map((x,i)=>({adId:x.adId,index:i})),error:[]}};
  throw new Error('흉내 없음 '+m+' '+p); };
eval(fs.readFileSync('all/72AG_광고시작.js','utf8').match(/function adPauseAds_[\s\S]*?\n}\n/)[0]);
eval(fs.readFileSync('all/72J_광고실행.js','utf8').match(/function adsCreated_[\s\S]*?\n}\n/)[0]);
eval(fs.readFileSync('all/72AC_상품광고.js','utf8').match(/function adUnitMap_[\s\S]*?\n}\n/)[0]);
eval(fs.readFileSync('all/72AC_상품광고.js','utf8').match(/function adUnitMarkPaused_[\s\S]*?\n}\n/)[0]);
eval(fs.readFileSync('all/72AH_승격.js','utf8'));

function plan(name,gid,cid,skus,res,track){ const r=new Array(22).fill(''); r[AP_NAME-1]=name; r[AP_GID-1]=gid; r[AP_CID-1]=cid;
  r[AP_SKUS-1]=skus.join(' | '); r[AP_RESULT-1]=res; r[AP_TRACK-1]=track===undefined?'X':track; r[AP_ADIDS-1]=4.4e269; return r; }
function unit(sku,grp,state,id,gid){ return [sku,'B0'+sku,grp,grp,state,id,'C_'+gid,gid,'2026-09-10']; }
cells['광고생성계획']=[ADPLAN_HEADER,
  plan('KP EXPAND B5','G_NEW','C_NEW',['S1','S2','S3','S4'],'성공 · 상품 3개'),   // S3 는 등록 실패(새 그룹에 없음)
  plan('KP EXPAND B9','G_NEW2','C_NEW2',['S9'],'성공 · 상품 1개'),
  plan('KP GROW B0X','G_B','C_B',['S1'],'성공','B'),                            // 트랙 B — 남의 줄
  plan('KP EXPAND B8T','G_FAIL','C_FAIL',['S8'],'실패 1회: 상품 등록')];       // 못 만든 줄
cells['상품광고목록']=[ADUNIT_HEADER,
  unit('S1','big','ENABLED','A1','G_BIG'), unit('S1','化粧品','ENABLED','A1b','G_COS'),   // S1 은 옛 그룹 둘
  unit('S2','big','ENABLED','A2','G_BIG'),
  unit('S3','big','ENABLED','A3','G_BIG'),                                                 // 등록 실패 — 건드리면 안 됨
  unit('S4','big','PAUSED','A4','G_BIG'),                                                  // 이미 꺼짐
  unit('S9','tiktok','ENABLED','A9','G_TK'),
  unit('S1','KP EXPAND B5','ENABLED','N1','G_NEW')];                                       // 새 그룹 자체 — 끄면 안 됨

// ── 1) dry — 셈만 ────────────────────────────────────────
let r=adPromoteStopOld_({dry:true,quiet:true});
ok(r.paused===4 && r.skus===4 && api.every(a=>a.m!=='put'), 'dry: 멈출 것 4개(A1·A1b·A2·A9)를 세기만 하고 안 보낸다 — '+JSON.stringify({paused:r.paused,skus:r.skus}));

// ── 2) 실제 ──────────────────────────────────────────────
api=[]; ledger=[]; fmt=[];
r=adPromoteStopOld_({quiet:true});
const put=api.filter(a=>a.m==='put').flatMap(a=>a.body.productAds.map(x=>x.adId)).sort();
ok(JSON.stringify(put)==='["A1","A1b","A2","A9"]', '옛 그룹의 켜진 광고 4개를 멈춘다 — '+JSON.stringify(put));
ok(!put.includes('A3'), '   등록에 실패한 S3 의 옛 광고는 건드리지 않는다 (그게 유일한 자리다)');
ok(!put.includes('A4') && !put.includes('N1'), '   이미 꺼진 것 · 새 그룹 자체는 안 보낸다');
ok(api.filter(a=>a.p==='/sp/productAds/list').every(a=>a.body.adGroupIdFilter), '   새 그룹은 skuFilter 가 아니라 그룹 ID 로 묻는다');
const U={}; cells['상품광고목록'].slice(1).forEach(u=>{U[u[5]]=u[4];});
ok(U.A1==='PAUSED'&&U.A1b==='PAUSED'&&U.A2==='PAUSED'&&U.A9==='PAUSED'&&U.A3==='ENABLED', '   상품광고목록의 상태도 PAUSED 로 고친다 (S3 는 그대로)');
ok(cells['광고생성계획'][1][AP_ADIDS-1]==='N1,N2,N4' && fmt.some(f=>f.startsWith('광고생성계획:2:21')), '   망가진 [광고ID들](4.4e+269)을 진짜 목록으로, 글자 서식으로 다시 적는다 — '+cells['광고생성계획'][1][AP_ADIDS-1]);
ok(ledger.length===2 && /뒷정리/.test(ledger[0].why), '   대장에 가격선마다 한 줄 ('+ledger.length+')');
ok(/멈춤 4개/.test(r.msg), '   요약 — '+r.msg);

// ── 3) 두 번째는 아무것도 안 한다 ───────────────────────
api=[];
r=adPromoteStopOld_({quiet:true});
ok(api.filter(a=>a.p==='/sp/productAds/list').length===1 && api.every(a=>a.m!=='put'), '다시 부르면: 실패 SKU(S3)가 남은 B5 만 한 번 더 확인하고 아무것도 안 보낸다 — '+r.msg);
api=[];
r=adPromoteStopOld_({quiet:true});
ok(api.length===0, '   세 번째부터는 목록을 새로 받을 때까지 아마존을 부르지 않는다 (스냅샷 도장) — '+r.msg);
global.adUnitCollectedAt_=()=>'2026-09-17'; api=[];
r=adPromoteStopOld_({quiet:true});
ok(api.filter(a=>a.p==='/sp/productAds/list').length===1, '   목록을 새로 받으면 다시 확인한다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
