// 자동운영으로 ① 후보 확인 → ② 시작 → 14일 뒤 되돌림 → 성숙 → 판정 → 채택까지 실제 시트 자료로 돌려 본다.
// 아마존은 흉내 — 무엇을 보내는지 기록만 한다. 시트도 메모리 안에서만 바뀐다.
const fs=require('fs'), path=require('path');
const live=JSON.parse(fs.readFileSync('live.json','utf8'));
const files=fs.readdirSync('all').filter(f=>f.endsWith('.js')).sort();
const cells={}; for(const k in live) cells[k]=live[k].map(r=>r.slice());
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
  clearContent(){return this;},setDataValidation(){return this;},insertCheckboxes(){return this;},
  setValuesAsText(){return this;},getNumRows:()=>nr||1,getNotes:()=>[[""]]
});
const mkSheet=name=>({
  getName:()=>name,getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>Math.max(...((cells[name]||[[]]).slice(0,3).map(r=>r.length)),1),
  getMaxRows:()=>Math.max((cells[name]||[]).length,1000),getMaxColumns:()=>60,getFrozenRows:()=>1,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),
  getDataRange:()=>mkRange(name,1,1,(cells[name]||[]).length,30),
  setFrozenRows(){},setColumnWidth(){},insertColumnsAfter(){},insertRowsAfter(){},deleteRows(){},
  deleteColumns(){},clear(){},hideSheet(){},showSheet(){},isSheetHidden:()=>false,activate(){},
  getSheetId:()=>1,autoResizeColumns(){},setTabColor(){},getIndex:()=>1,appendRow(r){(cells[name]||(cells[name]=[])).push(r.slice());}
});
const sheets={};
const ss={getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null,
  insertSheet:n=>{cells[n]=cells[n]||[];return sheets[n]||(sheets[n]=mkSheet(n));},
  getSheets:()=>Object.keys(cells).map(n=>sheets[n]||(sheets[n]=mkSheet(n))),
  setActiveSheet(){},getId:()=>'x',getSpreadsheetTimeZone:()=>'Asia/Tokyo',toast(){}};
let alerts=[], answer='YES';
const uiStub={createMenu:()=>({addItem(){return this;},addSeparator(){return this;},addSubMenu(){return this;},addToUi(){}}),
  alert:(a,b,c)=>{alerts.push([a,String(b||'')]);return c===undefined? 'OK' : answer;},
  prompt:()=>({getSelectedButton:()=>'CANCEL',getResponseText:()=>''}),
  ButtonSet:{OK:'OK',OK_CANCEL:'OKC',YES_NO:'YN'},Button:{OK:'OK',CANCEL:'CANCEL',YES:'YES',NO:'NO'}};
global.SpreadsheetApp={getActive:()=>ss,getActiveSpreadsheet:()=>ss,openById:()=>ss,flush(){},
  getUi:()=>uiStub,newDataValidation:()=>({requireCheckbox:()=>({build:()=>({})})})};
const props={}; global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]??null,
  setProperty:(k,v)=>{props[k]=String(v);},deleteProperty:k=>{delete props[k];},getProperties:()=>({...props})})};
let triggers=[];
const tb=()=>({after:()=>({create(){}}),atHour:()=>({everyDays:()=>({create(){}})}),everyMinutes:()=>({create(){}}),
  onWeekDay:()=>({atHour:()=>({create(){}})})});
global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger(){},WeekDay:{MONDAY:1},
  newTrigger:h=>{triggers.push(h);return {timeBased:tb};}};
let today='2026-09-10';
global.Utilities={sleep(){},formatDate:(d,tz,f)=>today,ungzip:b=>b,newBlob:()=>({}),
  base64Encode:()=>'',computeDigest:()=>[1,2,3],DigestAlgorithm:{MD5:1,SHA_256:2},Charset:{UTF_8:1},parseCsv:()=>[]};
global.Session={getScriptTimeZone:()=>'Asia/Tokyo',getEffectiveUser:()=>({getEmail:()=>'x@y'}),getActiveUser:()=>({getEmail:()=>'x@y'})};
global.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){},waitLock(){}})};
global.UrlFetchApp={fetch:()=>{throw new Error('실제 HTTP 호출 시도');}};
global.DriveApp={getFolderById:()=>({getFiles:()=>({hasNext:()=>false})})};
global.MailApp={sendEmail(){}}; global.GmailApp={sendEmail(){}};
global.LanguageApp={translate:s=>s}; global.Logger={log(){}};
global.ContentService={createTextOutput:()=>({setMimeType(){return this;}}),MimeType:{JSON:1}};
global.HtmlService={createHtmlOutput:()=>({})};

for(const f of files){ try{ (0,eval)(fs.readFileSync(path.join('all',f),'utf8')); }
  catch(e){ console.log('적재 실패 '+f+': '+e.message); } }

global.ss_=()=>ss; global.ui_=()=>uiStub;
const warn=[]; global.log_=(c,l,m)=>{ if(l!=='INFO') warn.push(l+' '+String(m).substring(0,160)); };
global.toast_=()=>{}; global.showSheet_=()=>{};
global.writeTable_=(sh,h,rows)=>{ cells[sh.getName()]=[h.slice()].concat(rows.map(r=>r.slice())); };
global.ymd_=d=>{ if(d instanceof Date && Math.abs(d.getTime()-Date.now())>3600e3) return d.toISOString().slice(0,10); return today; };

// ── 아마존 흉내 ──────────────────────────────────────────
const api=[]; let seq=0;
global.adsToken_=()=>'TOKEN';
global.adsApi_=(token,method,p,body)=>{
  api.push({m:method,p:p,body:JSON.parse(JSON.stringify(body||null))});
  const succ=(key,idf,arr)=>({[key]:{success:arr.map((x,i)=>({[idf]:String(x[idf]||(idf.slice(0,1).toUpperCase()+(++seq))),index:i})),error:[]}});
  if(p==='/sp/campaigns'&&method==='post') return succ('campaigns','campaignId',body.campaigns);
  if(p==='/sp/campaigns'&&method==='put') return succ('campaigns','campaignId',body.campaigns);
  if(p==='/sp/adGroups'&&method==='post') return succ('adGroups','adGroupId',body.adGroups);
  if(p==='/sp/adGroups'&&method==='put') return succ('adGroups','adGroupId',body.adGroups);
  if(p==='/sp/productAds/list') return {productAds:[],totalResults:0};
  if(p==='/sp/productAds'&&method==='post') return succ('productAds','adId',body.productAds);
  if(p==='/sp/productAds'&&method==='put') return succ('productAds','adId',body.productAds);
  throw new Error('흉내 없는 호출 '+method+' '+p);
};

const H=EXPAND_HEADER, col=n=>H.indexOf(n);
const rows=()=>cells[SHEET_EXPAND].slice(1);
const count=(arr,f)=>{const c={};arr.forEach(r=>{const k=f(r);c[k]=(c[k]||0)+1;});return c;};
const show=(t)=>console.log('\n── '+t+' ──');
const step=(t,fn)=>{ show(t); try{ return fn(); } catch(e){ console.log('  ✗ 예외: '+e.stack.split('\n').slice(0,3).join(' | ')); } };

// ── 0) 광고기준 — 모의 한도 (시험용 값. 실제 시트에는 넣지 않았다) ──
// 정하신 대로: 동시 시험 수 · 주간 지출한도 · 손실한도는 비운다(제한 없음).
// 최대 유효입찰만 넣는다 — 이것만 필수다. 승격 일예산 상한은 항목 자체가 없어졌다.
const SIM={'확대 · 최대 동시 시험 수':'','확대 · 시험 주간 지출한도(JPY)':'','확대 · 시험 손실한도(JPY)':'',
  '확대 · 최대 유효입찰(JPY)':Number(process.env.MAXBID||100)};
for(const r of cells['광고기준']) if(SIM[r[0]]!==undefined) r[1]=SIM[r[0]];
const pol=adExpandPolicy_();
console.log('정책: 모드='+pol.mode+' ready='+pol.ready+' canAuto='+pol.canAuto+' 부족='+pol.need.join(','));

// ── 1) ① 후보 찾기·확인 ──
step('① 후보 찾기·확인', ()=>{ alerts=[]; buildAdExpandCandidates({quiet:true});
  console.log('  줄 '+rows().length+' · 판정 '+JSON.stringify(count(rows(),r=>r[col('판정')])));
  console.log('  승인 살아남음 '+JSON.stringify(count(rows(),r=>String(r[col('승인')]))));
  const kept=rows().filter(r=>String(r[col('결과')]).indexOf('멈춤')===0).length;
  console.log('  지난 멈춤 결과 남은 줄 '+kept);
  if(warn.length){console.log('  경고 '+warn.length+': '+warn.slice(0,4).join(' / ')); warn.length=0;}
});

// ── 2) 승인 켜기 — 증액 시험 · 감액 · 분리 필요 전부 ──
const want={'증액 시험':1,'감액':1,'분리 필요':1,'대조군':1};
let nOk=0; for(const r of rows()) if(want[r[col('판정')]]){ r[col('승인')]=true; nOk++; }
console.log('\n승인 켬 '+nOk+'줄: '+JSON.stringify(count(rows().filter(r=>r[col('승인')]===true),r=>r[col('판정')])));

// ── 3) ② 시작 ──
step('② 시작', ()=>{ alerts=[]; api.length=0; triggers=[]; startAdActions();
  console.log('  묻는 창: '+alerts[0][1].split('\n').slice(0,6).join(' / '));
  console.log('  끝 창: '+(alerts[alerts.length-1]||['',''])[1].split('\n').slice(0,4).join(' / '));
  console.log('  API '+api.length+'건: '+JSON.stringify(count(api,a=>a.m+' '+a.p)));
  console.log('  결과 칸: '+JSON.stringify(count(rows().filter(r=>r[col('승인')]===true),r=>String(r[col('결과')]).replace(/\d{4}-\d\d-\d\d/,'날짜').substring(0,40))));
  const xt=cells[SHEET_EXTEST].slice(1);
  console.log('  시험표 '+xt.length+'줄: '+JSON.stringify(count(xt,r=>r[XT_STATE]+'/'+r[XT_ARM])));
  xt.filter(r=>r[XT_STATE]===XS_RUN&&r[XT_ARM]===XARM_TEST).forEach(r=>console.log('    '+r[XT_SKU]+' ¥'+r[XT_FROM]+'→¥'+r[XT_TO]+' 상한 ¥'+r[XT_CAP]+' 예약 ¥'+r[XT_HOLD]+' 운영 '+r[XT_RUNFROM]+'~'+r[XT_RUNTO]+' | '+r[XT_RESULT]));
  const bids=api.filter(a=>a.p==='/sp/adGroups'&&a.m==='put').map(a=>a.body.adGroups[0].adGroupId+':'+a.body.adGroups[0].defaultBid);
  console.log('  입찰변경 보냄: '+bids.join(', '));
  const pl=(cells[SHEET_ADPLAN]||[]).slice(1);
  console.log('  생성계획 '+pl.length+'줄: '+pl.map(r=>r[AP_NAME-1]+' 입찰¥'+r[AP_BID-1]+' 예산¥'+r[AP_DAILY-1]+' SKU'+r[7]+' → '+String(r[AP_RESULT-1]).substring(0,30)).join('\n    '));
  const camps=api.filter(a=>a.p==='/sp/campaigns'&&a.m==='post').length, ads=api.filter(a=>a.p==='/sp/productAds'&&a.m==='post').reduce((s,a)=>s+a.body.productAds.length,0);
  const paused=api.filter(a=>a.p==='/sp/productAds'&&a.m==='put').reduce((s,a)=>s+a.body.productAds.filter(x=>x.state==='PAUSED').length,0);
  console.log('  캠페인 생성 '+camps+' · 상품광고 추가 '+ads+' · 옛 광고 멈춤 '+paused);
  console.log('  걸음 '+triggers.length+': '+triggers.join(','));
  if(warn.length){console.log('  경고 '+warn.length+': '+warn.slice(0,6).join(' / ')); warn.length=0;}
});

// ── 4) 14일 뒤 — 되돌림 ──
today='2026-09-23';
step('14일 뒤 주기 (되돌림)', ()=>{ api.length=0; const m=adExpandCycle({quiet:true}); console.log('  '+m);
  const back=api.filter(a=>a.p==='/sp/adGroups'&&a.m==='put').map(a=>a.body.adGroups[0].adGroupId+':'+a.body.adGroups[0].defaultBid);
  console.log('  되돌림 보냄: '+back.join(', '));
  const xt=cells[SHEET_EXTEST].slice(1); console.log('  상태 '+JSON.stringify(count(xt,r=>r[XT_STATE])));
  if(warn.length){console.log('  경고: '+warn.slice(0,4).join(' / ')); warn.length=0;}
});

// ── 5) 주간 후보 다시 세우기 (시험중 표시 · 승인 보존) ──
step('주간 후보 다시 세우기', ()=>{ buildAdExpandCandidates({quiet:true});
  console.log('  판정 '+JSON.stringify(count(rows(),r=>r[col('판정')])));
  if(warn.length){console.log('  경고: '+warn.slice(0,4).join(' / ')); warn.length=0;}
});

// ── 6) 성숙 뒤 — 판정 · 채택 ──
today='2026-10-10';
step('성숙 뒤 주기 (판정·채택)', ()=>{ api.length=0; const m=adExpandCycle({quiet:true}); console.log('  '+m);
  const xt=cells[SHEET_EXTEST].slice(1); console.log('  상태 '+JSON.stringify(count(xt,r=>r[XT_STATE])));
  xt.forEach(r=>{ if(r[XT_ARM]===XARM_TEST) console.log('    '+r[XT_SKU]+' → '+r[XT_STATE]+' | '+String(r[XT_RESULT]).substring(0,90)); });
  const rs=(cells[SHEET_EXRESULT]||[]).slice(1); const ri=n=>EXRESULT_HEADER.indexOf(n);
  rs.forEach(r=>console.log('    결과: '+r[ri('SKU')]+' 판정 '+r[ri('판정')]+' · '+String(r[ri('근거')]).substring(0,70)));
  console.log('  API '+api.length);
  if(warn.length){console.log('  경고: '+warn.slice(0,4).join(' / ')); warn.length=0;}
});

// ── 7) 그 다음 주 계획 — 냉각/이어가기 ──
step('다음 주 후보 (냉각·이어가기)', ()=>{ buildAdExpandCandidates({quiet:true});
  rows().filter(r=>['피에르다르장(레몬) 초록','한정판 오레오 호떡맛'].indexOf(r[col('SKU')])>=0).forEach(r=>console.log('    '+r[col('SKU')]+' → '+r[col('판정')]+' | '+String(r[col('사유')]).substring(0,90)));
  if(warn.length){console.log('  경고: '+warn.slice(0,4).join(' / ')); warn.length=0;}
});
