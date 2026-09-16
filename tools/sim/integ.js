const fs=require('fs'), path=require('path');
// 저장소의 apps-script/*.gs 를 그대로 읽는다 (옛 'all/' 복사본은 낡아 있었다 — 2026-09-16)
const SRC=path.join(__dirname,'..','..','apps-script');
const files=fs.readdirSync(SRC).filter(f=>f.endsWith('.gs')).sort();
let fails=[], notes=[];
const ok=(c,m)=>{ if(!c){fails.push(m);} };

// ── GAS 흉내 ─────────────────────────────────────────────
const cells={}; // name -> rows
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}return out;},
  getValue:()=>((cells[name]||[])[r-1]||[])[c-1]??'',
  setValues:()=>{},setValue:()=>{},setNumberFormat(){return this;},setFontWeight(){return this;},
  setBackground(){return this;},setFontColor(){return this;},setFontSize(){return this;},setWrap(){return this;},
  setVerticalAlignment(){return this;},setHorizontalAlignment(){return this;},setNote(){return this;},
  setNotes(){return this;},clearContent(){return this;},setDataValidation(){return this;},insertCheckboxes(){return this;}
});
const mkSheet=name=>({
  getName:()=>name, getLastRow:()=>(cells[name]||[]).length, getLastColumn:()=>((cells[name]||[])[0]||[]).length||1,
  getMaxRows:()=>1000,getMaxColumns:()=>26,getFrozenRows:()=>1,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),getDataRange:()=>mkRange(name,1,1,(cells[name]||[]).length,26),
  setFrozenRows(){},setColumnWidth(){},insertRowsAfter(){},deleteRows(){},deleteColumns(){},clear(){},
  hideSheet(){},showSheet(){},isSheetHidden:()=>false,activate(){},getSheetId:()=>1,autoResizeColumns(){},
  setTabColor(){},getIndex:()=>1
});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));},
  getSheets:()=>Object.keys(cells).map(n=>sheets[n]||(sheets[n]=mkSheet(n))),setActiveSheet(){},getId:()=>'x',
  getSpreadsheetTimeZone:()=>'Asia/Tokyo',getActiveSheet:()=>mkSheet('x'),toast(){}};
global.SpreadsheetApp={getActive:()=>ss,getActiveSpreadsheet:()=>ss,openById:()=>ss,flush(){},
  getUi:()=>uiStub, DataValidation:{}, newDataValidation:()=>({requireCheckbox:()=>({build:()=>({})})})};
const props={}; global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];},getProperties:()=>({...props})})};
global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger(){},newTrigger:()=>({timeBased:()=>({after:()=>({create(){}}),atHour:()=>({everyDays:()=>({create(){}})}),everyMinutes:()=>({create(){}})})})};
global.Utilities={sleep(){},formatDate:(d,tz,f)=>'2026-09-04 00:00',ungzip:b=>b,newBlob:()=>({}),base64Encode:()=>'',computeDigest:()=>[1,2,3],DigestAlgorithm:{MD5:1,SHA_256:2},Charset:{UTF_8:1},parseCsv:()=>[]};
global.Session={getScriptTimeZone:()=>'Asia/Tokyo',getEffectiveUser:()=>({getEmail:()=>'x@y'}),getActiveUser:()=>({getEmail:()=>'x@y'})};
global.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){},waitLock(){}})};
global.UrlFetchApp={fetch:()=>({getResponseCode:()=>200,getContentText:()=>'{}',getBlob:()=>({setContentType:()=>({getDataAsString:()=>''})})})};
global.DriveApp={getFolderById:()=>({getFiles:()=>({hasNext:()=>false})})};
global.MailApp={sendEmail(){}}; global.GmailApp={sendEmail(){}};
global.LanguageApp={translate:s=>s}; global.Logger={log(){}};
global.ContentService={createTextOutput:()=>({setMimeType(){return this;}}),MimeType:{JSON:1}};
global.HtmlService={createHtmlOutput:()=>({})};

// 메뉴 기록용 UI
const handlers=[], menuNames=[];
const mkMenu=name=>{menuNames.push(name);const m={addItem:(l,h)=>{handlers.push([name,l,h]);return m;},addSeparator:()=>m,addSubMenu:()=>m,addToUi(){}};return m;};
const uiStub={createMenu:mkMenu,alert:()=>'OK',prompt:()=>({getSelectedButton:()=>'CANCEL',getResponseText:()=>''}),
  ButtonSet:{OK:'OK',OK_CANCEL:'OKC',YES_NO:'YN',YES_NO_CANCEL:'YNC'},Button:{OK:'OK',CANCEL:'CANCEL',YES:'YES',NO:'NO'}};

// ── 전 파일 적재 (알파벳순 = GAS 순서) ─────────────────────
const defined=new Set();
for(const f of files){
  const src=fs.readFileSync(path.join(SRC,f),'utf8');
  try{ (0,eval)(src); }catch(e){ fails.push('적재 실패 '+f+': '+e.message); }
  for(const m of src.matchAll(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm)) defined.add(m[1]);
}
notes.push('파일 '+files.length+'개 적재');

// 1) 메뉴 → 핸들러 존재
onOpen();
for(const [menu,label,h] of handlers) ok(typeof global[h]==='function','메뉴 핸들러 없음: '+menu+' → '+label+' ('+h+')');
notes.push('메뉴 항목 '+handlers.length+'개 · 핸들러 전부 존재'+(fails.length?' (실패 있음)':''));

// 2) 탭 정리
const modes=tabModes_();
for(const m of modes){ if(!m.tabs) continue; for(const t of m.tabs) ok(typeof t==='string'&&t.length>0,'탭 이름이 비었음: '+m.key); }
notes.push('탭 묶음 '+modes.length+'개 · 탭 이름 전부 정상');

// 2-b) 탭 안내 — 모든 탭이 설명을 갖고 있나 (묶음에 있는데 안내에 없으면 "이게 뭐지"가 남는다)
const guide=tabGuideRows_(), guided={};
for(const g of guide){
  ok(typeof g[1]==='string'&&g[1].length>0,'탭 안내에 이름 없는 줄');
  ok(String(g[2]||'').length>10,'탭 안내 설명이 너무 짧다: '+g[1]);
  guided[g[1]]=true;
}
for(const m of modes){ if(!m.tabs) continue; if(m.key.indexOf('ads')!==0) continue;
  for(const t of m.tabs) ok(guided[t],'광고 탭인데 안내에 없음: '+t+' ('+m.key+')'); }
notes.push('탭 안내 '+guide.length+'줄 · 광고 탭 전부 설명 있음');

// 3) 설명서
const rows=manualRows_();
for(const r of rows){ ok(r.length===6,'설명서 줄 칸수 '+r.length+': '+r[1]); ok(!/undefined|NaN/.test(r.join('|')),'설명서에 undefined: '+r[1]); }
const manualMenus=rows.filter(r=>!String(r[0]).startsWith('▬')).map(r=>r[1]);
notes.push('설명서 '+rows.length+'줄 · undefined 없음');
// 설명서가 지운 메뉴를 아직 말하나
for(const m of manualMenus) ok(!/광고 배치|수집 상태 · 가진 자료|지금 무엇이 도는가$/.test(m),'설명서에 낡은 메뉴: '+m);

// 4) dataNeeds_
const needs=dataNeeds_();
for(const k in needs){ ok(typeof global[needs[k].collect]==='function','dataNeeds '+k+'.collect 없음: '+needs[k].collect); }
notes.push('가진 자료 항목 '+Object.keys(needs).length+'개 · 수집 함수 전부 존재');

// 5) collectStatus (도는 것 없음) 가 예외 없이 끝나나
cells['로그']=[['a','b','c','d']];
try{ collectStatus(); notes.push('collectStatus 실행 OK'); }catch(e){ fails.push('collectStatus 예외: '+e.message); }

// 6) 부정키워드를 시트에서 읽나
cells['광고구조']=[ADSTRUCT_HEADER,
  ['c','자동','ENABLED',100,'g','ENABLED',10,'키워드','ピエール','EXACT','ENABLED',12,12,'1','G1','K1',''],
  ['c','자동','ENABLED',100,'g','ENABLED',10,ADSTRUCT_KIND_NEG,'ダメ','NEGATIVE_EXACT','ENABLED','','', '1','G1','N1','']];
const negs=adTermNegatives_();
ok(negs['G1']&&negs['G1']['ダメ']===true,'adTermNegatives_ 가 시트의 부정키워드를 못 읽음');
ok(!(negs['G1']&&negs['G1']['ピエール']),'adTermNegatives_ 가 일반 키워드를 부정으로 오인');
notes.push('부정키워드 시트 읽기 OK');

// 7) 켜기: 광고ID들 칸이 있으면 productAds/list 를 안 부른다
cells['광고생성계획']=[ADPLAN_HEADER, (()=>{const r=new Array(ADPLAN_HEADER.length).fill('');
  r[AP_ACTION-1]='생성';r[AP_NAME-1]='KP T';r[AP_GID-1]='G1';r[AP_CID-1]='C1';r[AP_APPROVE-1]=true;r[AP_RESULT-1]='성공 · 상품 2개';r[AP_ADIDS-1]='A1,A2';return r;})()];
props['ADENABLE_TO']='ON';
let apiCalls=[];
global.adsToken_=()=>'t';
global.adsApiRetry_=(t,m,p,b)=>{apiCalls.push(p);
  if(p==='/sp/campaigns')return{campaigns:{success:[{campaignId:'C1'}]}};
  if(p==='/sp/adGroups')return{adGroups:{success:[{adGroupId:'G1'}]}};
  if(p==='/sp/productAds')return{productAds:{success:b.productAds.map((x,i)=>({index:i,adId:x.adId}))}};
  return{productAds:[]};};
global.adLogBuffer_=()=>({push(){},flush(){}});
adEnableStep_(false);
ok(!apiCalls.includes('/sp/productAds/list'),'켜기가 저장된 광고ID 가 있는데도 productAds/list 를 불렀다');
ok(apiCalls.includes('/sp/productAds'),'켜기가 상품 PUT 을 안 했다');
notes.push('켜기: 저장된 광고ID 사용 · API 호출 '+JSON.stringify(apiCalls));

// 8) 광고구조 push 가 머리글 폭과 같나 (부정키워드 줄 포함)
ok(ADSTRUCT_HEADER.length===17,'ADSTRUCT_HEADER 길이 '+ADSTRUCT_HEADER.length);

// 9) 정적: 호출되는 식별자 중 정의 안 된 것 (GAS/JS 내장 제외)
const builtin=new Set(['if','for','while','switch','catch','function','return','typeof','new','Number','String','Boolean','Array','Object','Date','Math','JSON','RegExp','Error','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','Promise','Set','Map','require','eval','Symbol','escape','unescape',
  'SpreadsheetApp','PropertiesService','ScriptApp','Utilities','Session','LockService','UrlFetchApp','DriveApp','MailApp','GmailApp','LanguageApp','Logger','ContentService','HtmlService','console','Infinity','NaN','undefined','arguments','this','ceil','floor','round','max','min','abs','sqrt','pow','log','exp','random','push','pop','shift','unshift','slice','splice','concat','join','indexOf','lastIndexOf','map','filter','forEach','reduce','some','every','sort','reverse','keys','values','entries','assign','freeze','test','exec','match','replace','split','substring','substr','trim','toLowerCase','toUpperCase','charAt','charCodeAt','toFixed','toLocaleString','toISOString','getTime','getFullYear','getMonth','getDate','getDay','getHours','setDate','setHours','setMonth','setFullYear','stringify','parse','hasOwnProperty','then','apply','call','bind','localeCompare','startsWith','endsWith','includes','padStart','padEnd','repeat','fill','from','isArray','now','flat','getUTCDate','getUTCMonth','getUTCFullYear','getUTCDay','setUTCDate','setTime','toString','valueOf','create','after','atHour','everyDays','everyMinutes','timeBased','getHandlerFunction','deleteTrigger','newTrigger','getProjectTriggers','tryLock','releaseLock','waitLock','sleep','formatDate','getProperty','setProperty','deleteProperty','getProperties','getScriptProperties','getScriptTimeZone','getEffectiveUser','getActiveUser','getEmail','fetch','getResponseCode','getContentText','getBlob','setContentType','getDataAsString','ungzip','newBlob','base64Encode','computeDigest','parseCsv','getSheetByName','insertSheet','getSheets','getRange','getValues','getValue','setValues','setValue','getLastRow','getLastColumn','getMaxRows','getMaxColumns','setNumberFormat','setFontWeight','setBackground','setFontColor','setFontSize','setWrap','setVerticalAlignment','setHorizontalAlignment','setNote','setNotes','clearContent','clear','setFrozenRows','getFrozenRows','setColumnWidth','insertRowsAfter','deleteRows','deleteColumns','hideSheet','showSheet','isSheetHidden','activate','getName','getSheetId','getDataRange','autoResizeColumns','setTabColor','getIndex','setActiveSheet','getActiveSheet','toast','getActive','getActiveSpreadsheet','openById','flush','getUi','createMenu','addItem','addSeparator','addSubMenu','addToUi','alert','prompt','getSelectedButton','getResponseText','sendEmail','translate','getFolderById','getFiles','hasNext','next','getId','createTextOutput','setMimeType','getSpreadsheetTimeZone','insertCheckboxes','setDataValidation','newDataValidation','requireCheckbox','build','getFileById','getMimeType','getBytes','getNumberFormat','getFontWeight','copyTo','getParent','getFolders','getDateCreated','getLastUpdated','getSize','getAs','createFile','setName','removeRange','moveTo','getDescription','isTrashed','getUrl','getRow','getColumn','getNumRows','getNumColumns','offset','getA1Notation','getNotes','getNote','getFormula','getFormulas','setFormula','setFormulas','getDisplayValue','getDisplayValues','getBackground','getBackgrounds','getFontColor','copyFormatToRange','copyValuesToRange','setBorder','merge','breakApart','clearFormat','clearNote','protect','getProtections','remove','setWarningOnly','addEditor','removeEditor','getEditors','canEdit','setDescription','getRangeList','setValuesAsText','getTextStyle','setTextStyle','getRichTextValue','setRichTextValue','newRichTextValue','setText','setLinkUrl','getText','getLinkUrl','getRuns','getStartIndex','getEndIndex','setHiddenGridlines','hideColumns','showColumns','hideRows','showRows','setRowHeight','setRowHeights','setColumnWidths','getRowHeight','getColumnWidth','insertColumnsAfter','insertColumnAfter','insertRowAfter','insertRowBefore','insertRowsBefore','insertColumnBefore','insertColumnsBefore','deleteColumn','deleteRow','getSheetName','getSheetValues','appendRow','getFilter','createFilter','removeFilter','getPivotTables','getCharts','insertChart','removeChart','newChart','sort','getDeveloperMetadata','addDeveloperMetadata','getBandings','applyRowBanding','getConditionalFormatRules','setConditionalFormatRules','newConditionalFormatRule','whenNumberGreaterThan','whenTextContains','setRanges','getBooleanCondition','getCriteriaType','getCriteriaValues','getRange','setShowHyperlink','moveRows','moveColumns','expandGroups','collapseAllRowGroups','getRowGroup','getRowGroupDepth','getColumnGroup','shiftRowGroupDepth','setRowGroupControlPosition','getRowGroupControlPosition','getSlicers','insertSlicer','isRowHiddenByUser','isRowHiddenByFilter','isColumnHiddenByUser','asDataSourceSheet','getDataSourceTables','getDataSourcePivotTables','getDataSourceFormulas','refreshData','getLastRow','ButtonSet','Button','OK','YES','NO','CANCEL','OK_CANCEL','YES_NO','YES_NO_CANCEL','MimeType','JSON','GZIP','DigestAlgorithm','MD5','SHA_256','Charset','UTF_8']);

/**
 * 주석·문자열·정규식 리터럴을 지운다.
 *
 * 정규식으로 문자열을 지우면 안 된다 — 한 줄에 '어퍼스트로피(’ 가 아닌 ')' 하나가
 * 어긋나면 그 뒤 짝이 밀려, 지워졌어야 할 문자열 안의 "ID (" 를 함수 호출로 읽는다
 * (실제로 72_광고 의 '프로필 ID (선택)' 를 정의 안 된 호출이라고 셌다).
 * 그래서 한 글자씩 걸어 상태를 들고 간다.
 */
function stripCode(src){
  let out='', i=0, n=src.length;
  const prevTok=()=>{ for(let k=out.length-1;k>=0;k--){ const c=out[k]; if(c===' '||c==='\t'||c==='\n'||c==='\r') continue; return c; } return ''; };
  while(i<n){
    const c=src[i], d=src[i+1];
    if(c==='/'&&d==='*'){ const e=src.indexOf('*/',i+2); i=e<0?n:e+2; continue; }
    if(c==='/'&&d==='/'){ const e=src.indexOf('\n',i); i=e<0?n:e; continue; }
    if(c==='\''||c==='"'||c==='`'){
      i++;
      while(i<n){ if(src[i]==='\\'){ i+=2; continue; } if(src[i]===c){ i++; break; } i++; }
      out+=c+c; continue;
    }
    // 정규식 리터럴 — 앞 토큰이 값이 아닐 때만 (나눗셈과 가른다)
    if(c==='/' && !/[\w$)\]]/.test(prevTok())){
      let j=i+1, cls=false, okRe=false;
      while(j<n){ const x=src[j];
        if(x==='\\'){ j+=2; continue; }
        if(x==='\n') break;
        if(cls){ if(x===']') cls=false; j++; continue; }
        if(x==='['){ cls=true; j++; continue; }
        if(x==='/'){ okRe=true; j++; break; }
        j++; }
      if(okRe){ while(j<n&&/[gimsuy]/.test(src[j])) j++; out+='/RE/'; i=j; continue; }
    }
    out+=c; i++;
  }
  return out;
}

const callRe=/(?<![\w.$'"])([A-Za-z_$][\w$]*)\s*\(/g;
const undefCalls=new Map();
for(const f of files){
  let src=stripCode(fs.readFileSync(path.join(SRC,f),'utf8'));
  const locals=new Set([...src.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)/g)].map(m=>m[1]).concat([...src.matchAll(/\bfunction\b[^(]*\(([^)]*)\)/g)].flatMap(m=>m[1].split(',').map(s=>s.trim()).filter(Boolean))));
  for(const m of src.matchAll(callRe)){
    const id=m[1];
    if(builtin.has(id)||defined.has(id)||locals.has(id)) continue;
    if(typeof global[id]==='function') continue;
    undefCalls.set(id,(undefCalls.get(id)||[]).concat(f));
  }
}
for(const [id,fs2] of undefCalls) fails.push('정의 안 된 호출: '+id+'( ) in '+[...new Set(fs2)].join(', '));

// 10) 중복 함수
const dup=new Map();
for(const f of files){ for(const m of fs.readFileSync(path.join(SRC,f),'utf8').matchAll(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm)) dup.set(m[1],(dup.get(m[1])||[]).concat(f)); }
for(const [k,v] of dup) if(v.length>1) fails.push('중복 함수: '+k+' in '+v.join(', '));

console.log(notes.map(n=>'  ✓ '+n).join('\n'));
console.log(fails.length?('\n✗ 실패 '+fails.length+'건:\n'+fails.map(f=>'  · '+f).join('\n')):'\n모두 통과');
process.exit(fails.length?1:0);
