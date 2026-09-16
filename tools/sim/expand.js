// 마진 한 곳(72AA)과 확대 후보 표(72AB) — 사람이 적은 값이 살아남는가
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

// ── 시트 흉내 ──────────────────────────────────────────
const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];}
    return this;},
  setValue(x){return this.setValues([[x]]);},
  setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
  setNumberFormat(){return this;},setNote(){return this;},setWrap(){return this;},setNotes(){return this;},
  insertCheckboxes(){return this;}
});
const mkSheet=name=>({
  getName:()=>name,
  getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[])[0]||[]).length||1,
  getMaxRows:()=>1000,getMaxColumns:()=>60,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),
  setFrozenRows(){},insertColumnsAfter(){},deleteRows(){},setColumnWidth(){}
});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));}};
global.SpreadsheetApp={flush(){},openById:()=>({getSheetByName:n=>n==='광고 기준값'?refSheet:null,insertSheet:()=>refSheet})};
let alerts=[];
global.ss_=()=>ss;
global.ui_=()=>({alert:(a,b)=>{alerts.push(String(a)+'|'+String(b||''));return 'OK';},ButtonSet:{OK:1}});
global.log_=()=>{};
global.showSheet_=()=>{};
global.headerNotes_=()=>{};
global.ymd_=d=>'2026-09-05';          // 오늘 → 성숙 경계 2026-08-20 · 창 2026-07-22~08-20
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.addDays_=(ymd,n)=>{const d=new Date(ymd+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);};
global.DEFAULT_FEE_RATE=0.10;
global.SHEET_ADS='광고실적';
global.ADS_HEADER=['날짜','SKU','ASIN','캠페인','광고비(JPY)','광고매출(JPY)','노출','클릭','광고주문','수집일시'];
global.SHEET_LISTING='리스팅';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명(자동번역)','검색어(수동)','번역일시','가격(JPY)','재고','상태'];

// 원가·환율·바깥시트 (72AA 가 부르는 것들 — 여기서는 아는 값을 준다)
global.costMap_=()=>({'COST-1':6000});                 // 원(KRW)
global.fxHouseRate_=()=>9.5;                            // 1엔당 원
global.skuCostMap_=()=>({});
global.costInfoMap_=()=>({});
global.resolveShipping_=()=>({fee:200,src:'요율표'});
global.unitProfitKrw_=(price,ship,cost,rate,feeRate)=>(price*(1-feeRate)-ship)*rate-cost;
global.adBasis_=()=>({'기본 마진율':0.17,'마진율 시트 ID':'EXT','마진율 시트 탭':'상품 목록'});
global.normName_=s=>String(s==null?'':s).replace(/[\s　]+/g,'')
  .replace(/[\[\]【】（）()／\/,、。・:：]/g,'').toLowerCase();
global.externalMarginMap_=()=>({'ぽてとちっぷす':0.25});  // 비율로 온다 (25%)
// 바깥 '광고 기준값' 탭 — SpreadsheetApp.openById 로 연다
let refRows=[['SKU','ASIN','상품명(참고)','마진율(%)','판매가(JPY)','메모','수정일']];
const refSheet={getName:()=>'광고 기준값',getLastRow:()=>refRows.length,getMaxRows:()=>1000,
  getRange:(r,c,nr,nc)=>({getValues:()=>{const o=[];for(let i=0;i<(nr||1);i++){const row=refRows[r-1+i]||[];
      o.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}return o;},
    setValues(v){for(let i=0;i<v.length;i++){const row=refRows[r-1+i]||(refRows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];}return this;},
    setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;}}),
  setFrozenRows(){},insertRowsAfter(){}};
global.makeOneSheet_=specs=>{const n=specs[0].name;
  if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.madeSheetStop_=(made,menu)=>{ if(!made) return false; alerts.push('만듦|'+made); return true; };
global.writeTable_=(sh,header,rows)=>{cells[sh.getName()]=[header.slice()].concat(rows.map(r=>r.slice()));};

global.adRowApproved_=v=>v===true||String(v).trim()==='O';
global.JOB_DOWN_PCT=0.20; global.pct1_=x=>(x*100).toFixed(1)+'%';
global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.hdrMap_=sh=>{const h=(cells[sh.getName()]||[[]])[0]||[];const m={};h.forEach((x,i)=>{m[String(x)]=i;});return m;};
global.cellOf_=(row,map,name,dft)=>{const i=map[name];return i===undefined?dft:(row[i]??dft);};
global.SHEET_ADGRP='광고그룹'; global.SHEET_ADSTRUCT='광고구조'; global.SHEET_ADGROW='광고육성';
global.ADGRP_HEADER=['캠페인','유형','광고그룹','상태','기본입찰','SKU수','전용가능','대상수','캠페인ID','광고그룹ID','수집일시'];
global.adSpendRead_=()=>({rows:[],has:false});
global.adUnitCollectedAt_=()=>'2026-09-06';
global.adUnitMap_=()=>({});           // 상품광고 목록이 아직 없다 — 손잡이 없음
global.adBusyGuard_=()=>true; global.adsToken_=()=>'t'; global.adErrorText_=s=>String(s);
global.adLogRow_=o=>[o.sku]; global.adLogBuffer_=()=>({push(){},flush(){}});
global.adJobSend_=()=>({ok:true}); global.adsApiRetry_=()=>({}); global.adsCreated_=()=>({ok:true,ids:[]});
global.ADSW_CT_PRODUCTAD='p';
eval(fs.readFileSync('all/72AA_마진.js','utf8'));
eval(fs.readFileSync('all/72AB_확대후보.js','utf8'));
eval(fs.readFileSync('all/72AD_멈춤후보.js','utf8'));
eval(fs.readFileSync('all/72AE_확대시험.js','utf8'));
eval(fs.readFileSync('all/72AH_승격.js','utf8'));

// ── 1) 마진은 어느 순서로 정해지나 ─────────────────────
const ctx=adMarginCtx_(true);
ok(ctx.def===17, '광고기준의 [기본 마진율] 을 그대로 쓴다 ('+ctx.def+'%)');
ok(MARGIN_DEFAULT_PCT===15, '   그 시트를 못 읽을 때의 대비값은 15% ('+MARGIN_DEFAULT_PCT+')');
(function(){ const keep=global.adBasis_; global.adBasis_=()=>({});
  const c2=adMarginCtx_(true);
  ok(c2.def===15, '   광고기준이 비어 있으면 15% 로 간다 ('+c2.def+'%)');
  global.adBasis_=keep; adMarginCtx_(true); })();

let m=adMarginFor_(ctx,'COST-1',1000,'ぽてとちっぷす',33);
ok(m.pct===33 && m.src===MSRC_USER, '① 사람이 적은 값이 원가·바깥시트를 이긴다 ('+m.pct+' · '+m.src+')');

m=adMarginFor_(ctx,'COST-1',1000,'ぽてとちっぷす',null);
// (1000×0.9 − 200)×9.5 − 6000 = 650원 → 650/9.5/1000 = 6.8%
ok(m.src===MSRC_COST && Math.abs(m.pct-6.8)<0.05, '② 원가가 있으면 계산값이 바깥시트를 이긴다 ('+m.pct+'% · '+m.src+')');

m=adMarginFor_(ctx,'NOCOST',1000,'ぽてと 【ちっぷす】',null);   // 띄어쓰기·괄호만 다른 같은 이름
ok(m.src===MSRC_SHEET && m.pct===25, '③ 원가가 없으면 바깥 마진율 시트 (띄어쓰기·괄호는 다듬어 맞댐) ('+m.pct+'% · '+m.src+')');

m=adMarginFor_(ctx,'NOCOST',1000,'없는이름',null);
ok(m.src===MSRC_DEFAULT && m.pct===17, '④ 아무것도 없으면 기본 17% ('+m.pct+'% · '+m.src+')');

m=adMarginFor_(ctx,'COST-1',300,'',null);   // (300×0.9−200)×9.5 = 665 − 6000 < 0
ok(m.src===MSRC_LOSS && m.pct===0, '팔수록 손해면 그렇게 말한다 (기본 17%로 덮지 않는다) — '+m.src);

m=adMarginFor_(ctx,'X',1000,'',0);
ok(m.src!==MSRC_USER, '0 이나 빈칸은 "사람이 적은 값" 이 아니다 ('+m.src+')');

// ── 2) 확대 후보 표 ────────────────────────────────────
cells['광고실적']=[ADS_HEADER,
  // 여유 있는 상품: 클릭 500 · 주문 25 (5%) · 광고비 ¥2,500 → CPC ¥5 · 객단가 ¥1,000
  ['2026-08-15','GROW','B0GROW','KP c',2500,25000,50000,500,25,''],
  // 지금이 과한 상품: 클릭 400 · 주문 4 (1%) · 광고비 ¥8,000 → CPC ¥20
  ['2026-08-15','OVER','B0OVER','KP c',8000,4000,40000,400,4,''],
  // 표본이 얇은 상품
  ['2026-08-15','THIN','A3','KP c',60,1000,900,12,1,''],
  // 사람이 마진율을 적어 둔 상품
  ['2026-08-15','MINE','A4','KP c',1000,20000,20000,200,20,''],
  // 아직 주문이 다 안 붙은 날 (오늘로부터 16일 안) — 세면 안 된다
  ['2026-09-04','GROW','B0GROW','KP c',9000,0,90000,900,0,''],
  // 창보다 오래된 날 — 역시 안 센다
  ['2026-06-01','GROW','B0GROW','KP c',9000,0,90000,900,0,'']];
cells['리스팅']=[LISTING_HEADER,
  ['GROW','B0GROW','ぽてとちっぷす','','','',1000,10,'Active'],
  ['OVER','B0OVER','おかし','','','',1000,10,'Active'],
  ['THIN','A3','あめ','','','',1000,10,'Active'],
  ['MINE','A4','ちょこ','','','',1000,10,'Active']];

buildAdExpandCandidates();
ok(alerts.some(a=>a.indexOf('만듦|광고확대후보')===0), '표가 없으면 만들고 한 번 멈춘다 (한 실행에 표 하나)');

alerts=[];
buildAdExpandCandidates();
const H=EXPAND_HEADER, col=n=>H.indexOf(n);
const out={}; (cells['광고확대후보']||[]).slice(1).forEach(r=>{out[r[0]]=r;});
ok(Object.keys(out).length===4, '광고 중인 상품 4개가 표에 나온다 ('+Object.keys(out).length+')');
ok(out['GROW'][col('성숙클릭')]===500,
   '최근 16일(주문이 아직 안 붙은 날)과 창 밖 날짜는 빼고 센다 — 클릭 '+out['GROW'][col('성숙클릭')]+' (900+900 을 더하지 않는다)');
ok(String(out['GROW'][col('자료기간')]).indexOf('2026-07-07~2026-08-20')===0,
   '실제로 센 날을 적는다 — "'+out['GROW'][col('자료기간')]+'"');

ok(out['GROW'][col('판정')]==='분리 필요',
   '손잡이(상품광고 목록)가 없으면 확대검토라도 판정은 "분리 필요" ('+out['GROW'][col('판정')]+')');
ok(out['THIN'][col('판정')]==='유지' && out['OVER'][col('판정')]==='유지',
   '   나머지는 유지 (승인할 것이 없다)');
const g=out['GROW'];
ok(g[col('마진출처')]===MSRC_SHEET && g[col('마진율(%)')]===25,
   'GROW 는 바깥 시트에서 마진율 25% 를 찾아 채운다 ('+g[col('마진율(%)')]+'% · '+g[col('마진출처')]+')');
// 판단주문율은 '계정 전체 주문율' 쪽으로 눌린다 — 제 실측값으로 누르면 약분돼 아무 일도 안 일어난다.
// 이 자료의 전체 주문율 = (25+4+1+20) 주문 / (500+400+12+200) 클릭 = 50/1112 = 4.496%
// GROW 는 실측 5% 인데 클릭 500 이라 거의 제 값에 머문다: (25 + 50×0.04496)/(500+50) = 4.954%
const FLEET = 50/1112;
const qGrow = (25 + 50*FLEET)/(500+50);
ok(Math.abs(g[col('판단주문율(%)')]-qGrow*100)<0.01,
   '판단주문율 '+(qGrow*100).toFixed(2)+'% — 실측 5% 를 전체 '+(FLEET*100).toFixed(2)+'% 쪽으로 조금 당긴다 ('+g[col('판단주문율(%)')]+')');
ok(Math.abs(g[col('손익분기클릭비용(JPY)')]-1000*0.25*qGrow)<0.01,
   '손익분기 = 판매가 ¥1,000 × 마진 25% × 판단주문율 ('+g[col('손익분기클릭비용(JPY)')]+')');
ok(Math.abs(g[col('목표클릭비용(JPY)')]-1000*0.25*qGrow*EXPAND_KEEP)<0.01,
   '목표는 손익분기 × '+EXPAND_KEEP+' ('+g[col('목표클릭비용(JPY)')]+')');
// 클릭이 적으면 세게 당긴다 — 한두 건의 우연이 그대로 입찰이 되지 않게
ok(Math.abs(out['THIN'][col('판단주문율(%)')]-(1+50*FLEET)/(12+50)*100)<0.01,
   '   클릭 12 · 주문 1 이면 실측 8.3% 가 아니라 '+(((1+50*FLEET)/(12+50))*100).toFixed(2)+'% 로 눌린다 ('+out['THIN'][col('판단주문율(%)')]+')');
ok(g[col('분류')]==='확대검토', 'CPC ¥5 · 목표 ¥8.1 → 확대검토 ('+g[col('분류')]+')');
// 필요마진율 = CPC 5 ÷ (객단가 1000 × 실제주문율 0.05) = 10%
ok(Math.abs(g[col('필요마진율(%)')]-10)<0.05, '필요마진율은 마진율과 무관하게 10% ('+g[col('필요마진율(%)')]+')');

const o=out['OVER'];
ok(o[col('마진출처')]===MSRC_DEFAULT && o[col('마진율(%)')]===17,
   'OVER 는 근거가 없어 기본 17% ('+o[col('마진율(%)')]+'% · '+o[col('마진출처')]+')');
ok(o[col('분류')]==='비용보호', 'CPC ¥20 이 목표보다 높으면 비용보호 ('+o[col('분류')]+')');
ok(String(o[col('사유')]).indexOf('기본값')>0, '   기본 마진율로 셌다는 것을 사유에 밝힌다');

ok(out['THIN'][col('분류')]==='근거부족', '클릭 12 · 주문 1 은 근거부족 ('+out['THIN'][col('분류')]+')');

// ── 3) 사람이 적은 값은 다시 눌러도 살아남는다 ─────────
// 사람은 보통 숫자만 고치고 [마진출처] 는 그대로 둔다 — 그래도 지켜져야 한다
const rowMine=cells['광고확대후보'].find(r=>r[0]==='MINE');
rowMine[col('마진율(%)')]=8;                       // 출처 칸은 '기본 17%' 인 채로 둔다
ok(rowMine[col('마진출처')]===MSRC_DEFAULT && rowMine[col('프로그램값(%)')]===17,
   '프로그램이 제가 쓴 값을 [프로그램값] 에 남겨 둔다 ('+rowMine[col('프로그램값(%)')]+')');
buildAdExpandCandidates();
const after={}; cells['광고확대후보'].slice(1).forEach(r=>{after[r[0]]=r;});
ok(after['MINE'][col('마진율(%)')]===8 && after['MINE'][col('마진출처')]===MSRC_USER,
   '출처 칸을 안 고쳐도 사람이 적은 8% 가 살아남고 출처가 바뀐다 ('+after['MINE'][col('마진율(%)')]+'% · '+after['MINE'][col('마진출처')]+')');
ok(after['MINE'][col('프로그램값(%)')]===17, '   프로그램값 칸은 프로그램의 값(17%)을 그대로 지킨다');
ok(adUserMarginMap_()['MINE']===8 && !adUserMarginMap_()['GROW'],
   '   그 값을 다른 표(멈춤 후보·트랙 B)도 볼 수 있다');
ok(after['GROW'][col('마진율(%)')]===25, '   나머지 줄은 다시 계산된다 ('+after['GROW'][col('마진율(%)')]+'%)');
// 마진 8% · 판단주문율 (20+50×0.04496)/(200+50)=8.9% → 손익분기 ¥7.12 · 목표 ¥4.63
// CPC ¥5 가 목표보다 높다 → 늘릴 자리가 아니라 줄일 자리
ok(after['MINE'][col('분류')]==='비용보호',
   '   사람이 낮춰 적은 마진율이 곧바로 분류에 반영된다 ('+after['MINE'][col('분류')]+')');

// ── 4-a) 기준값 시트가 표보다 세다 · 표에서 고친 값은 거기로 올라간다 ─
ok(refRows.length-1>0, '표에서 고친 마진율이 바깥 기준값 시트로 올라간다 ('+(refRows.length-1)+'줄)');
const up=refRows.slice(1).find(r=>r[0]==='MINE');
ok(up && up[3]===8, '   MINE 의 8% 가 그대로 올라갔다 ('+(up&&up[3])+')');
refRows.push(['','B0OVER','ASIN 으로 적은 줄',33,'','ASIN 매칭','2026-09-09']);
refRows.push(['GROW','B0GROW','',12,2000,'판매가도 여기서','2026-09-09']);
buildAdExpandCandidates();
const ref={}; cells['광고확대후보'].slice(1).forEach(r=>{ref[r[0]]=r;});
ok(ref['GROW'][col('마진율(%)')]===12 && ref['GROW'][col('마진출처')]===MSRC_REF,
   '기준값 시트의 SKU 줄이 바깥 마진율 시트(25%)를 이긴다 ('+ref['GROW'][col('마진율(%)')]+'% · '+ref['GROW'][col('마진출처')]+')');
ok(ref['GROW'][col('판매가(JPY)')]===2000, '   판매가도 기준값 시트 값을 쓴다 ('+ref['GROW'][col('판매가(JPY)')]+')');
ok(ref['OVER'][col('마진율(%)')]===33 && ref['OVER'][col('마진출처')]===MSRC_REF_ASIN,
   'SKU 가 없으면 ASIN 으로 맞댄다 ('+ref['OVER'][col('마진율(%)')]+'% · '+ref['OVER'][col('마진출처')]+')');

// ── 4) 프로그램값 칸이 없던 옛 표에서 고친 값도 지킨다 ───
// (이 칸이 생기기 전에 사람이 고쳐 둔 줄 — 지금 다시 셈한 값과 다르면 사람 것으로 본다)
const rowOld=cells['광고확대후보'].find(r=>r[0]==='THIN');   // 기준값 시트에 없는 줄로 본다
rowOld[col('마진율(%)')]=9;
rowOld[col('프로그램값(%)')]='';        // 옛 표에는 이 칸이 없었다
buildAdExpandCandidates();
const old2={}; cells['광고확대후보'].slice(1).forEach(r=>{old2[r[0]]=r;});
ok(old2['THIN'][col('마진율(%)')]===9 && old2['THIN'][col('마진출처')]===MSRC_USER,
   '프로그램값 칸이 없던 옛 표에서 고친 값도 지킨다 ('+old2['THIN'][col('마진율(%)')]+'% · '+old2['THIN'][col('마진출처')]+')');
ok(refRows.slice(1).some(r=>r[0]==='THIN'&&r[3]===9), '   그 값도 기준값 시트로 올라간다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
