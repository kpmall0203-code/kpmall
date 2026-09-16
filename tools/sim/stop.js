// 멈춤 후보 — 무엇을 근거로 멈추고, 승인 없이는 안 나가는가 (72AC · 72AD)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;},
  setValue(x){return this.setValues([[x]]);},
  getValue:()=>((cells[name]||[])[r-1]||[])[c-1]??'',
  setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
  setNumberFormat(){return this;},setNote(){return this;},setNotes(){return this;},
  clearContent(){return this;},insertCheckboxes(){return this;}
});
const mkSheet=name=>({ getName:()=>name,
  getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1,
  getMaxRows:()=>Math.max((cells[name]||[]).length,1000),getMaxColumns:()=>60,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),
  setFrozenRows(){},insertRowsAfter(){},insertColumnsAfter(){},deleteRows(){},setColumnWidth(){}
});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));}};
let alerts=[], answer='YES', triggers=[];
global.ss_=()=>ss;
global.ui_=()=>({alert:(a,b,c)=>{alerts.push([a,String(b||'')]);return answer;},
  ButtonSet:{OK:1,YES_NO:2},Button:{YES:'YES',NO:'NO'}});
global.SpreadsheetApp={flush(){}};
const props={};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,
  setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];}})};
global.ScriptApp={getProjectTriggers:()=>triggers,deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t);},
  newTrigger:h=>({timeBased:()=>({after:()=>({create(){triggers.push({getHandlerFunction:()=>h});}})})})};
global.log_=()=>{}; global.showSheet_=()=>{}; global.headerNotes_=()=>{}; global.toast_=()=>{};
global.writeTable_=(sh,h,rows)=>{cells[sh.getName()]=[h.slice()].concat(rows.map(r=>r.slice()));};
global.makeOneSheet_=specs=>{const n=specs[0].name;
  if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.madeSheetStop_=(made)=>{ if(!made) return false; alerts.push(['만듦',made]); return true; };
global.getSheetOrThrow_=n=>{ if(!cells[n]) throw new Error('없음 '+n); return sheets[n]||(sheets[n]=mkSheet(n)); };
global.ymd_=d=>'2026-09-05';                  // 성숙 경계 2026-08-20 · 창 2026-07-22~08-20
global.addDays_=(ymd,n)=>{const d=new Date(ymd+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);};
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.ADS_SOFT_MS=4*60*1000;
global.SHEET_ADS='광고실적';
global.ADS_HEADER=['날짜','SKU','ASIN','캠페인','광고비(JPY)','광고매출(JPY)','노출','클릭','광고주문','수집일시'];
global.SHEET_LISTING='리스팅';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명','검색어','번역일시','가격(JPY)','재고','상태'];
global.SHEET_ADGROW='광고육성'; global.SHEET_ADLOG='광고변경대장';
global.SHEET_ADGRP='광고그룹';
global.ADGRP_HEADER=['캠페인','유형','광고그룹','상태','기본입찰','SKU수','전용가능','대상수','캠페인ID','광고그룹ID','수집일시'];
global.ADSW_CT_PRODUCTAD='ct'; global.DEFAULT_FEE_RATE=0.10;
global.adBusyGuard_=()=>true;
global.adRowApproved_=v=>v===true||String(v).trim()==='O'||String(v).trim()==='TRUE';
global.adErrorText_=s=>String(s);
global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
global.pct1_=x=>isFinite(x)?(x*100).toFixed(1)+'%':'—';   // 72E 의 것 (여기서는 그 파일을 안 얹는다)
global.adLogRow_=o=>[o.sku,o.item,o.from,o.to,o.why];
let logged=[];
global.adLogBuffer_=()=>({push:r=>{logged=logged.concat(r);},flush(){}});
global.adsCreated_=(r)=>({ok:true, ids:(r&&r.productAds&&r.productAds.success)||[], msg:''});
global.adsToken_=()=>'t';
// 마진 자료 — 원가도 바깥 시트도 없다 → 전부 기본 17%
global.costMap_=()=>({}); global.fxHouseRate_=()=>9.5; global.skuCostMap_=()=>({});
global.costInfoMap_=()=>({}); global.resolveShipping_=()=>({fee:0,src:''});
global.unitProfitKrw_=()=>0; global.adBasis_=()=>({'기본 마진율':0.17});
global.normName_=s=>String(s||''); global.externalMarginMap_=()=>({});

let api=[];
global.adsApi_=(t,m,p,b)=>{ api.push({m,p,b});
  if(p==='/sp/productAds/list'){
    const page=b.nextToken?2:1;
    const arr=[];
    for(let i=0;i<(page===1?2:1);i++)
      arr.push({adId:'AD'+page+i, sku:'DEAD', asin:'A1', campaignId:'C1', adGroupId:'G1', state:'ENABLED'});
    return page===1 ? {productAds:arr, nextToken:'N2'} : {productAds:arr};
  }
  return {};
};
global.adsApiRetry_=(t,m,p,b)=>{ api.push({m,p,b});
  return {productAds:{success:(b.productAds||[]).map(x=>({adId:x.adId}))}}; };

for(const f of ['72AA_마진','72AB_확대후보','72AC_상품광고','72AD_멈춤후보'])
  eval(fs.readFileSync('all/'+f+'.js','utf8'));

// ── 1) 상품광고 목록 수집 — 이어 달리는가 ────────────────
cells['광고그룹']=[ADGRP_HEADER,['빅 캠페인','자동','big-1','ENABLED',5,'25개 넘음','',3,'C1','G1','']];
api=[];
fetchAdProductAds();
ok(cells[SHEET_ADUNIT] && cells[SHEET_ADUNIT][0][0]==='SKU',
   '표가 없으면 만들고 그대로 이어간다 (사람에게 다시 누르라고 하지 않는다)');
ok(cells[SHEET_ADUNIT].length-1===3, '두 쪽(2+1개)을 이어 받아 3줄을 적는다 ('+(cells[SHEET_ADUNIT].length-1)+')');
ok(api.filter(x=>x.p==='/sp/productAds/list').length===2, '   nextToken 이 있는 동안 계속 받는다');
ok(api[1].b.nextToken==='N2', '   두 번째 요청에 자리표를 넣는다');
ok(!props['ADUNIT_NEXT'], '   다 받으면 자리표를 지운다');
ok(cells[SHEET_ADUNIT][1][2]==='빅 캠페인' && cells[SHEET_ADUNIT][1][3]==='big-1',
   '   광고그룹ID 로 캠페인·그룹 이름을 붙인다');
const um=adUnitMap_();
ok(um['DEAD'] && um['DEAD'].on===3, '   SKU → 광고 목록을 만들 수 있다 (켜진 광고 '+um['DEAD'].on+'개)');

// ── 2) 멈춤 후보 — 무엇을 근거로 가르나 ──────────────────
const D='2026-08-15';
cells['광고실적']=[ADS_HEADER,
  // 클릭 300 · 주문 0 · CPC ¥5 → 상한 1.0% < 본전 2.94%
  [D,'DEAD','A1','big',1500,0,30000,300,0,''],
  // 클릭 20 — 아직 아무 말도 못 한다
  [D,'THIN','A2','big',200,0,2000,20,0,''],
  // 클릭 200 · 주문 20 → 본전을 넘겨 판다
  [D,'SELL','A3','big',600,20000,20000,200,20,''],
  // 클릭 400 · 주문 4 · CPC ¥10 → 상한 2.4% < 본전 5.88% (팔리지만 확실히 밑진다)
  [D,'LOSS','A4','big',4000,4000,40000,400,4,''],
  // 클릭 60 · 주문 3 · CPC ¥10 → 기대 6.5% > 본전 5.88% (밑지지만 근거는 못 됨)
  [D,'MAYBE','A5','big',600,3000,6000,60,3,''],
  // 클릭 100 · 주문 0 · CPC ¥3.4 → 상한 3% > 본전 2% > 기대 0.98% (기대값으로만 멈춤)
  [D,'EVSTOP','A8','big',340,0,3400,100,0,''],
  // 상품광고 목록에 없는 SKU
  [D,'NOAD','A6','big',900,0,9000,180,0,''],
  // 트랙 B 가 키우는 중
  [D,'GROWSKU','A7','KP GROW',900,0,9000,180,0,''],
  // 아직 안 성숙한 날 — 세면 안 된다
  ['2026-09-04','DEAD','A1','big',9000,0,90000,900,0,'']];
cells['리스팅']=[LISTING_HEADER].concat(['DEAD','THIN','SELL','LOSS','MAYBE','NOAD','GROWSKU','EVSTOP']
  .map((s,i)=>[s,'A'+(i+1),'なまえ'+i,'','','',1000,10,'Active']));
cells['광고육성']=[['SKU'],['GROWSKU']];
// DEAD·SELL·LOSS·MAYBE·THIN 은 광고가 있고, NOAD 는 없다
cells[SHEET_ADUNIT]=[ADUNIT_HEADER].concat(
  ['DEAD','THIN','SELL','LOSS','MAYBE','GROWSKU','EVSTOP'].map((s,i)=>
    [s,'A'+(i+1),'빅 캠페인','big-1','ENABLED','AD'+s,'C1','G1','']));

alerts=[];
buildAdStopCandidates();
ok(alerts.some(a=>a[1]===SHEET_ADSTOP), '멈춤 후보도 표를 만들면 한 번 멈춘다 (한 실행에 표 하나)');
alerts=[];
buildAdStopCandidates();
const H=ADSTOP_HEADER, col=n=>H.indexOf(n);
const out={}; (cells[SHEET_ADSTOP]||[]).slice(1).forEach(r=>{out[r[0]]=r;});
ok(out['DEAD'][col('판정')]===ASV_STOP,
   'DEAD (클릭 300 · 주문 0) → '+out['DEAD'][col('판정')]);
ok(Math.abs(out['DEAD'][col('필요주문율(%)')]-2.9)<0.1 && Math.abs(out['DEAD'][col('주문율상한(%)')]-1)<0.1,
   '   본전 '+out['DEAD'][col('필요주문율(%)')]+'% · 상한 '+out['DEAD'][col('주문율상한(%)')]+'%');
ok(out['DEAD'][col('성숙클릭')]===300, '   아직 안 성숙한 날(클릭 900)은 안 센다 ('+out['DEAD'][col('성숙클릭')]+')');
ok(out['THIN'][col('판정')]===ASV_WATCH, 'THIN (클릭 20) → '+out['THIN'][col('판정')]);
ok(out['SELL'][col('판정')]===ASV_KEEP, 'SELL (주문 20) → '+out['SELL'][col('판정')]);
ok(out['LOSS'][col('판정')]===ASV_STOP, 'LOSS (주문 4인데 상한이 본전에 못 미침) → '+out['LOSS'][col('판정')]);
ok(out['MAYBE'][col('판정')]===ASV_WATCH, 'MAYBE (밑지지만 기대값이 본전보다 높음) → '+out['MAYBE'][col('판정')]);
ok(out['EVSTOP'][col('판정')]===ASV_STOP_EV,
   'EVSTOP (상한은 본전 위, 기대값은 아래) → '+out['EVSTOP'][col('판정')]);
ok(Math.abs(out['EVSTOP'][col('기대주문율(%)')]-1)<0.1 && Math.abs(out['EVSTOP'][col('필요주문율(%)')]-2)<0.1,
   '   기대 '+out['EVSTOP'][col('기대주문율(%)')]+'% · 본전 '+out['EVSTOP'][col('필요주문율(%)')]+'% · 상한 '+out['EVSTOP'][col('주문율상한(%)')]+'%');
ok(cells[SHEET_ADSTOP][1][col('판정')]===ASV_STOP, '확실이 기대값보다 위에 온다');
ok(out['NOAD'][col('판정')]===ASV_NOHANDLE, 'NOAD (광고ID 를 모름) → '+out['NOAD'][col('판정')]);
ok(out['GROWSKU'][col('판정')]===ASV_GROW, 'GROWSKU (트랙 B) → '+out['GROWSKU'][col('판정')]);
ok(out['DEAD'][col('승인')]===false, '만들 때 승인은 꺼져 있다 — 저절로 나가지 않는다');
ok(cells[SHEET_ADSTOP][1][0]==='DEAD'||cells[SHEET_ADSTOP][1][col('판정')]===ASV_STOP,
   '멈출 것이 맨 위에 온다');

// ── 3) 승인분 멈추기 — 승인한 줄만 나간다 ────────────────
api=[]; alerts=[];
applyAdStopApproved();
ok(api.length===0 && alerts.length===1, '승인이 하나도 없으면 아무것도 안 보낸다');

const rowsNow=cells[SHEET_ADSTOP];
for(const r of rowsNow.slice(1)){
  if(r[0]==='DEAD') r[col('승인')]=true;
  if(r[0]==='EVSTOP') r[col('승인')]=true;   // 기대값 줄도 승인하면 나가야 한다
  if(r[0]==='SELL') r[col('승인')]=true;     // 판정이 '팔림' 인데 승인된 줄
}
api=[]; alerts=[]; answer='NO';
applyAdStopApproved();
ok(api.length===0, '마지막 확인에 아니오면 안 보낸다');
answer='YES'; api=[]; alerts=[];
applyAdStopApproved();
const puts=api.filter(x=>x.p==='/sp/productAds');
ok(puts.length===2, '승인 ✓ 이고 판정이 멈춤인 줄만 보낸다 — 확실·기대값 둘 다 (요청 '+puts.length+'건)');
const sent=puts.map(x=>x.b.productAds[0].adId).sort();
ok(sent.join(',')==='ADDEAD,ADEVSTOP', '   DEAD 와 EVSTOP 만 · '+sent.join(','));
ok(puts[0].b.productAds[0].state==='PAUSED', '   상태는 PAUSED');
ok(!api.some(x=>x.p==='/sp/campaigns'||x.p==='/sp/adGroups'),
   '   캠페인·광고그룹은 건드리지 않는다 (같은 그룹의 다른 상품은 그대로 나간다)');
const after={}; cells[SHEET_ADSTOP].slice(1).forEach(r=>{after[r[0]]=r;});
ok(String(after['DEAD'][col('결과')]).indexOf('멈춤')===0, '결과를 표에 적는다 — "'+after['DEAD'][col('결과')]+'"');
ok(String(after['SELL'][col('결과')])==='', '   승인됐어도 판정이 아니면 결과가 없다');
ok(logged.length===2 && logged.every(r=>r[3]==='PAUSED'), '대장에 멈춘 줄마다 무엇을 왜 멈췄는지 남는다 ('+logged.length+'줄)');
ok(/기대값|확실/.test(String(logged[0][4])), '   어느 근거로 멈췄는지도 적는다 — "'+String(logged[0][4]).slice(0,50)+'"');

// ── 4) 확대후보에 사람이 적은 마진율을 여기서도 쓴다 ────
// MAYBE 는 17% 로 재면 '더 봄' 이었다. 실제 마진이 2% 라면 본전이 50% 라 못 판다
cells['광고확대후보']=[EXPAND_HEADER,
  (()=>{const r=new Array(EXPAND_HEADER.length).fill('');
    r[EX_SKU]='MAYBE'; r[EX_MARGIN]=2; r[EX_MSRC]=MSRC_DEFAULT; r[EX_PROG]=17; return r;})()];
buildAdStopCandidates();
const withUser={}; cells[SHEET_ADSTOP].slice(1).forEach(r=>{withUser[r[0]]=r;});
ok(withUser['MAYBE'][col('마진율(%)')]===2 && withUser['MAYBE'][col('마진출처')]===MSRC_USER,
   '확대후보에 적은 마진율 2% 를 멈춤 후보도 쓴다 ('+withUser['MAYBE'][col('마진율(%)')]+'% · '+withUser['MAYBE'][col('마진출처')]+')');
ok(withUser['MAYBE'][col('판정')]===ASV_STOP_EV || withUser['MAYBE'][col('판정')]===ASV_STOP,
   '   그러면 판정이 뒤집힌다 (더 봄 → '+withUser['MAYBE'][col('판정')]+')');
cells['광고확대후보']=undefined; delete cells['광고확대후보'];

// 다시 만들어도 승인이 풀리지 않는가
buildAdStopCandidates();
const re={}; cells[SHEET_ADSTOP].slice(1).forEach(r=>{re[r[0]]=r;});
ok(re['DEAD'][col('승인')]===true, '다시 만들어도 승인해 둔 줄은 그대로다');
ok(String(re['DEAD'][col('결과')]).indexOf('멈춤')===0, '   지난 결과도 남는다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
