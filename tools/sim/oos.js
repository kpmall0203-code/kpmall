// 품절인데 팔리던 SKU (82_품절판매)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };
const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(){return this;},setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
  setNumberFormat(){return this;}
});
const mkSheet=name=>({getName:()=>name,getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1,getMaxRows:()=>1000,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),setFrozenRows(){},insertRowsAfter(){}});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));}};
let alerts=[];
global.ss_=()=>ss; global.ui_=()=>({alert:(a,b)=>{alerts.push([a,String(b||'')]);},ButtonSet:{OK:1}});
global.SpreadsheetApp={flush(){}};
global.log_=()=>{}; global.showSheet_=()=>{}; global.headerNotes_=()=>{}; global.ensureData_=()=>{};
global.makeOneSheet_=specs=>{const n=specs[0].name; if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.madeSheetStop_=(made)=>{ if(!made) return false; alerts.push(['만듦',made]); return true; };
let written=null; global.writeTable_=(sh,h,rows)=>{written=rows; cells[sh.getName()]=[h].concat(rows);};
global.ymd_=d=>String(d).slice(0,10);
global.addDays_=(ymd,n)=>{const d=new Date(ymd+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.SHEET_LISTING='리스팅';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명(자동번역)','검색어(수동)','번역일시','가격(JPY)','재고','상태'];
global.SHEET_SALES='판매실적'; global.SL_FROM=0; global.SL_TO=1; global.SL_SKU=2; global.SL_ASIN=3; global.SL_QTY=4; global.SL_AMT=5;
global.SALES_HEADER=['기간시작','기간종료','SKU','ASIN','판매수량','판매금액(JPY)','세션','페이지뷰','카트박스%','수집일시'];
let _salesTblCache=null;
global.salesTable_=()=>{const sh=ss.getSheetByName('판매실적'); return sh? sh.getRange(2,1,sh.getLastRow()-1,10).getValues():[];};
global.monthlySalesMap_=()=>({});
global.adUnitMap_=()=>({ OUT_HOT:{ads:[],on:2} });
global.costMap_=()=>({ OUT_HOT:5000 });
eval(fs.readFileSync('all/82_품절판매.js','utf8'));

cells['리스팅']=[LISTING_HEADER,
  ['OUT_HOT','B01','ホット','핫','','',1500,0,'Active'],        // 재고 0 · 최근에도 팔림
  ['OUT_OLD','B02','オールド','올드','','',1200,0,'Inactive'],  // 재고 0 · 옛날에만 팔림 · 비활성
  ['IN_STOCK','B03','ある','있음','','',1000,30,'Active'],     // 재고 있음
  ['OUT_NEVER','B04','ない','없음','','',900,0,'Active'],       // 재고 0 · 판 적 없음
  ['OUT_BLANK','B05','空','빈칸','','',900,'','Active']];      // 재고 칸이 비어 있음 — 0 이 아니다
cells['판매실적']=[SALES_HEADER,
  // 같은 판매가 하루 · 한 달 · 전체 기간 줄로 겹쳐 들어 있다 — 한 달 줄만 더해야 한다
  ['2026-08-01','2026-08-01','OUT_HOT','B01',3,4500,'','','',''],       // 하루
  ['2026-08-20','2026-08-20','OUT_HOT','B01',2,3000,'','','',''],       // 하루
  ['2026-07-01','2026-07-31','OUT_HOT','B01',2,3000,'','','',''],       // 7월
  ['2026-08-01','2026-08-31','OUT_HOT','B01',5,7500,'','','',''],       // 8월
  ['2025-01-01','2026-08-31','OUT_HOT','B01',7,10500,'','','',''],      // 전체 — 더하면 안 된다
  ['2026-06-01','2026-06-30','OUT_OLD','B02',5,6000,'','','',''],
  ['2026-08-01','2026-08-31','IN_STOCK','B03',9,9000,'','','',''],
  ['2026-08-01','2026-08-31','OUT_BLANK','B05',1,900,'','','','']];

analyzeOutOfStockSellers(); alerts=[]; analyzeOutOfStockSellers();
const H=OOS_HEADER, col=n=>H.indexOf(n);
const bys={}; (written||[]).forEach(r=>{bys[r[0]]=r;});
ok(written && written.length===2, '재고 0 이면서 판 기록이 있는 것만 ('+(written&&written.length)+'개)');
ok(!bys['IN_STOCK'] && !bys['OUT_NEVER'] && !bys['OUT_BLANK'], '   재고 있음 · 판 적 없음 · 재고 칸 빈칸은 빠진다');
ok(written[0][0]==='OUT_HOT', '최근에도 팔리던 것이 위로 ('+written[0][0]+')');
ok(bys['OUT_HOT'][col('판매수량(합)')]===7 && bys['OUT_HOT'][col('판매금액(JPY·합)')]===10500,
   '   한 달 줄만 더한다 — 수량 7 · ¥10,500 (하루·전체 기간 줄을 겹쳐 세면 24 가 된다)');
ok(bys['OUT_HOT'][col('마지막 판매(기간종료)')]==='2026-08-31' && bys['OUT_HOT'][col('마지막 달 수량')]===5,
   '   마지막 판매 08-31 · 마지막 달(8월) 수량 5');
ok(bys['OUT_OLD'][col('마지막 달 수량')]===0 && /Inactive/.test(bys['OUT_OLD'][col('할 일')]),
   '6월에만 팔린 비활성 상품 — 마지막 달 0 · 할 일에 상태를 적는다');
ok(bys['OUT_HOT'][col('켜진 광고')]===2 && bys['OUT_HOT'][col('원가 있음')]==='O', '켜진 광고 · 원가 유무를 붙인다');
ok(/2개/.test(alerts[0][1]) && /16,500/.test(alerts[0][1]), '알림에 개수와 판 돈 (10,500 + 6,000)');
console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
