// 실제 시트 자료로 광고확대후보를 돌려 본다 (배포된 소스 그대로)
const fs=require('fs'), path=require('path');
const live=JSON.parse(fs.readFileSync('live.json','utf8'));
const files=fs.readdirSync('all').filter(f=>f.endsWith('.js')).sort();

// ── GAS 흉내 (integ.js 와 같은 뼈대) ───────────────────
// 값은 이미 시트가 담고 있는 그대로(숫자는 숫자, 날짜는 yyyy-MM-dd 글자)로 받아 왔다
const cells={};
for(const k in live) cells[k]=live[k].map(r=>r.slice());

const written={};
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
  setNumberFormat(){return this;},setNote(){return this;},setNotes(){return this;},setWrap(){return this;},
  setVerticalAlignment(){return this;},setHorizontalAlignment(){return this;},setFontSize(){return this;},
  clearContent(){return this;},setDataValidation(){return this;},insertCheckboxes(){return this;}
});
const mkSheet=name=>({
  getName:()=>name,getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>Math.max(...((cells[name]||[[]]).slice(0,3).map(r=>r.length)),1),
  getMaxRows:()=>Math.max((cells[name]||[]).length,1000),getMaxColumns:()=>60,getFrozenRows:()=>1,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),
  getDataRange:()=>mkRange(name,1,1,(cells[name]||[]).length,26),
  setFrozenRows(){},setColumnWidth(){},insertColumnsAfter(){},insertRowsAfter(){},deleteRows(){},
  deleteColumns(){},clear(){},hideSheet(){},showSheet(){},isSheetHidden:()=>false,activate(){},
  getSheetId:()=>1,autoResizeColumns(){},setTabColor(){},getIndex:()=>1
});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));},
  getSheets:()=>Object.keys(cells).map(n=>sheets[n]||(sheets[n]=mkSheet(n))),
  setActiveSheet(){},getId:()=>'x',getSpreadsheetTimeZone:()=>'Asia/Tokyo',toast(){}};
let alerts=[];
const uiStub={createMenu:()=>({addItem(){return this;},addSeparator(){return this;},addSubMenu(){return this;},addToUi(){}}),
  alert:(a,b)=>{alerts.push([a,b]);return 'OK';},
  prompt:()=>({getSelectedButton:()=>'CANCEL',getResponseText:()=>''}),
  ButtonSet:{OK:'OK',OK_CANCEL:'OKC',YES_NO:'YN'},Button:{OK:'OK',CANCEL:'CANCEL',YES:'YES'}};
// 바깥 참고 시트: '상품 목록'(이름 매칭)과 '광고 기준값'(SKU/ASIN) 둘 다 여기 cells 에 있다
global.SpreadsheetApp={getActive:()=>ss,getActiveSpreadsheet:()=>ss,openById:()=>ss,flush(){},
  getUi:()=>uiStub,newDataValidation:()=>({requireCheckbox:()=>({build:()=>({})})})};
const props={}; global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,
  setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];},getProperties:()=>({...props})})};
global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger(){},newTrigger:()=>({timeBased:()=>({after:()=>({create(){}}),
  atHour:()=>({everyDays:()=>({create(){}})}),everyMinutes:()=>({create(){}})})})};
global.Utilities={sleep(){},formatDate:(d,tz,f)=>'2026-09-08',ungzip:b=>b,newBlob:()=>({}),
  base64Encode:()=>'',computeDigest:()=>[1,2,3],DigestAlgorithm:{MD5:1,SHA_256:2},Charset:{UTF_8:1},parseCsv:()=>[]};
global.Session={getScriptTimeZone:()=>'Asia/Tokyo',getEffectiveUser:()=>({getEmail:()=>'x@y'}),getActiveUser:()=>({getEmail:()=>'x@y'})};
global.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){},waitLock(){}})};
global.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>'{}'})};
global.DriveApp={getFolderById:()=>({getFiles:()=>({hasNext:()=>false})})};
global.MailApp={sendEmail(){}}; global.GmailApp={sendEmail(){}};
global.LanguageApp={translate:s=>s}; global.Logger={log(){}};
global.ContentService={createTextOutput:()=>({setMimeType(){return this;}}),MimeType:{JSON:1}};
global.HtmlService={createHtmlOutput:()=>({})};

for(const f of files){ try{ (0,eval)(fs.readFileSync(path.join('all',f),'utf8')); }
  catch(e){ console.log('적재 실패 '+f+': '+e.message); } }

// 환경만 갈아 끼운다 (계산은 배포된 코드 그대로)
global.ss_=()=>ss;
global.ui_=()=>uiStub;
const warn=[];
global.log_=(c,l,m)=>{ if(l!=='INFO') warn.push(l+' '+m); };
global.toast_=()=>{}; global.showSheet_=()=>{};
let outRows=null;
global.writeTable_=(sh,h,rows)=>{ outRows={h:h,rows:rows}; cells[sh.getName()]=[h.slice()].concat(rows.map(r=>r.slice())); };

// 1) 마진 문맥이 실제로 무엇을 읽었나
const ctx=adMarginCtx_(true);
console.log('― 마진 자료 ―');
console.log('  원가 있는 SKU        ', Object.keys(ctx.costs).length);
console.log('  사내환율             ', ctx.rate ? ctx.rate.toFixed(2)+' 원/엔' : '없음');
console.log('  바깥 마진율 시트 줄  ', Object.keys(ctx.ext).length);
console.log('  기본 마진율          ', ctx.def+'%');
console.log('  리스팅 상품명        ', Object.keys(adJpNameMap_(true)).length);

// 2) 표를 만든다 (첫 번은 표만 만들고 멈추는 것이 정상)
buildAdExpandCandidates();
if(!outRows){ console.log('\n(첫 실행: 표를 만들고 멈춤 — ' + (alerts[0]||[])[0] + ')'); alerts=[]; buildAdExpandCandidates(); }

const H=outRows.h, rows=outRows.rows, col=n=>H.indexOf(n);
const cnt={}, src={};
for(const r of rows){ cnt[r[col('분류')]]=(cnt[r[col('분류')]]||0)+1; src[r[col('마진출처')]]=(src[r[col('마진출처')]]||0)+1; }
console.log('\n― 결과 ―');
console.log('  상품 ', rows.length, '· 자료기준일', rows[0][col('자료기준일')]);
console.log('  분류 ', JSON.stringify(cnt,null,0));
console.log('  마진출처', JSON.stringify(src,null,0));
console.log('\n― 확대검토 위 10개 (여유배수 순) ―');
console.log(['SKU','마진%','출처','CPC','목표','여유','필요마진%','주문'].join('\t'));
for(const r of rows.filter(r=>r[col('분류')]==='확대검토').slice(0,10))
  console.log([r[0], r[col('마진율(%)')], r[col('마진출처')], r[col('실제클릭비용(JPY)')],
    r[col('목표클릭비용(JPY)')], r[col('여유배수')], r[col('필요마진율(%)')], r[col('성숙주문')]].join('\t'));
console.log('\n― 비용보호(줄일 자리) 위 8개 — 필요마진율 높은 순 ―');
const guard=rows.filter(r=>r[col('분류')]==='비용보호').sort((a,b)=>(b[col('필요마진율(%)')]||0)-(a[col('필요마진율(%)')]||0));
for(const r of guard.slice(0,8))
  console.log([r[0], r[col('마진율(%)')], r[col('실제클릭비용(JPY)')], r[col('목표클릭비용(JPY)')],
    r[col('필요마진율(%)')], r[col('성숙클릭')], r[col('성숙주문')]].join('\t'));
console.log('\n알림창:', (alerts[0]||[])[1] ? String(alerts[0][1]).split('\n').slice(0,6).join(' / ') : '(없음)');
if(warn.length) console.log('경고:', warn.slice(0,5));
fs.writeFileSync('live_out.json', JSON.stringify(outRows));
