const fs=require('fs');
const live=JSON.parse(fs.readFileSync('live.json','utf8'));
const cells={}; for(const k of ['리스팅','판매실적','원가']) cells[k]=live[k].map(r=>r.slice());
const mkRange=(name,r,c,nr,nc)=>({getValues:()=>{const rows=cells[name]||[];const out=[];
  for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}return out;},
  setValues(){return this;},setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},setNumberFormat(){return this;}});
const mkSheet=name=>({getName:()=>name,getLastRow:()=>(cells[name]||[]).length,getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1,
  getMaxRows:()=>1000,getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),setFrozenRows(){},insertRowsAfter(){}});
const sheets={}; const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));}};
let alerts=[]; global.ss_=()=>ss; global.ui_=()=>({alert:(a,b)=>{alerts.push([a,String(b||'')]);},ButtonSet:{OK:1}});
global.SpreadsheetApp={flush(){}}; global.log_=()=>{}; global.showSheet_=()=>{}; global.headerNotes_=()=>{}; global.ensureData_=()=>{};
global.makeOneSheet_=specs=>{const n=specs[0].name; if(cells[n]&&cells[n].length) return ''; cells[n]=[specs[0].header.slice()]; return n;};
global.madeSheetStop_=(made)=>{ if(!made) return false; return true; };
let written=null; global.writeTable_=(sh,h,rows)=>{written=rows;};
global.ymd_=d=>String(d).slice(0,10);
global.addDays_=(ymd,n)=>{const d=new Date(ymd+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.SHEET_LISTING='리스팅'; global.LISTING_HEADER=live['리스팅'][0];
global.SHEET_SALES='판매실적'; global.SL_FROM=0; global.SL_TO=1; global.SL_SKU=2; global.SL_ASIN=3; global.SL_QTY=4; global.SL_AMT=5;
global.SALES_HEADER=['기간시작','기간종료','SKU','ASIN','판매수량','판매금액(JPY)','세션','페이지뷰','카트박스%','수집일시'];
global.salesTable_=()=>cells['판매실적'].slice(1);
global.monthlySalesMap_=()=>({}); global.adUnitMap_=()=>({});
global.costMap_=()=>{const m={}; for(const r of cells['원가'].slice(1)) if(r[0]&&Number(r[1])>0) m[String(r[0]).trim()]=Number(r[1]); return m;};
eval(fs.readFileSync('all/82_품절판매.js','utf8'));
analyzeOutOfStockSellers(); analyzeOutOfStockSellers();
console.log(alerts[alerts.length-1][1]);
fs.writeFileSync('oos_out.json', JSON.stringify({h:OOS_HEADER, rows:written}));
