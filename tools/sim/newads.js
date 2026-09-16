// 신규 상품 광고 ① 가져오기 (78 · 78B)
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const cells={}, na={};                       // na = 새 파일의 탭
function mk(store,name){ return {
  getName:()=>name, getLastRow:()=>(store[name]||[]).length,
  getLastColumn:()=>((store[name]||[[]])[0]||[]).length||1,
  getMaxRows:()=>Math.max((store[name]||[]).length,1000), getMaxColumns:()=>30,
  insertRowsAfter(){}, deleteColumns(){}, setFrozenRows(){},
  getRange:(r,c,nr,nc)=>({
    getValues:()=>{const rows=store[name]||[];const out=[];
      for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
      return out;},
    setValues(v){const rows=store[name]||(store[name]=[]);
      for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
        for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;},
    setValue(x){return this.setValues([[x]]);},
    setFontWeight(){return this;},setBackground(){return this;},setFontColor(){return this;},
    setNumberFormat(){return this;},getNotes:()=>[Array(nc||1).fill('')],setNotes(){return this;} })};}
global.ss_=()=>({getSheetByName:n=>cells[n]?mk(cells,n):null, insertSheet:n=>{cells[n]=cells[n]||[];return mk(cells,n);}});
global.SpreadsheetApp={openById:id=>({
  getName:()=>'Amazon 신규 상품 광고',
  getSheetByName:n=>((id==='NEWFILE'?na:cells)[n]?mk(id==='NEWFILE'?na:cells,n):null),
  insertSheet:n=>{const st=id==='NEWFILE'?na:cells; st[n]=st[n]||[]; return mk(st,n);},
  getSheets:()=>Object.keys(id==='NEWFILE'?na:cells).map(n=>mk(id==='NEWFILE'?na:cells,n)),
  deleteSheet(){} }), flush(){}};
let logs=[], alerts=[];
global.log_=(c,l,m)=>logs.push(l+' '+m);
global.ui_=()=>({alert:(a,b)=>{alerts.push([a,String(b||'')]);return 'OK';},ButtonSet:{OK:1,YES_NO:2},Button:{YES:'YES'}});
global.adBusyGuard_=()=>true;
global.headerNotes_=()=>{}; global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
global.ymd_=()=>'2026-09-11';
global.adYmd_=x=>String(x==null?'':x).substring(0,10);
global.SHEET_LISTING='리스팅';
global.LISTING_HEADER=['SKU','ASIN','일본어상품명','한글명','검색어','번역일시','가격(JPY)','재고','상태'];
global.SRCCOST_TAB='상품 목록'; global.SRCCOST_COL_KRW=3; global.SRCCOST_COL_PRICE=9;
global.SRCCOST_COL_MJPY=13; global.SRCCOST_COL_SKU=15; global.SRCCOST_COL_SHIP=16;
global.srcKrw_=x=>{const m=String(x==null?'':x).replace(/,/g,'').match(/(\d+(?:\.\d+)?)/); return m?Number(m[1]):0;};
global.MSRC_DEFAULT='기본값';
let basis={'신규광고 시트 ID':'NEWFILE','마진율 시트 ID':'EXT','확대 · 최대 유효입찰(JPY)':100};
global.adBasis_=()=>basis;
let advertised={};
global.adUnitMap_=()=>advertised;
// 마진 사슬 흉내: 조달비가 있으면 실측, 없으면 기본값
let rate=8.644;
global.adMarginCtx_=()=>({rate:rate});
global.adMarginFor_=(ctx,sku,price,name,u,asin)=>{
  const s=srcRows[sku];
  if(!s||!(s.krw>0)) return {pct:15,src:'기본값',why:'기본값'};
  const ship=605, fee=0.10;
  const unit=(price*(1-fee)-ship)*rate-s.krw;
  const pct=unit/rate/price*100;
  if(pct<=0) return {pct:0,src:'원가 계산(적자)',why:'⛔ 팔수록 손해'};
  return {pct:Math.round(pct*10)/10, src:'소싱 조달비', why:'소싱 조달비로 셈'};
};
eval(fs.readFileSync('all/78_신규광고.js','utf8'));
eval(fs.readFileSync('all/78B_신규광고_가져오기.js','utf8'));

// ── 자료 ────────────────────────────────────────────────
// 상품 목록: A URL · C 조달비 · G 이름 · I 판매가 · M 마진 · O SKU · P 배송
function srow(sku,krw,price,name,url,at){ const r=new Array(16).fill('');
  r[0]=url||'https://x'; r[2]=krw; r[5]=at||'2026-09-10 10:00'; r[6]=name||sku; r[8]=price; r[12]=0; r[14]=sku; r[15]='일반'; return r; }
let srcRows={};
function setSrc(list){ cells['상품 목록']=[new Array(16).fill('h')].concat(list);
  srcRows={}; list.forEach(r=>{srcRows[r[14]]={krw:srcKrw_(r[2]),price:r[8]};}); }
function lrow(sku,asin,price,stock,state){ return [sku,asin,'name'+sku,'','','',price,stock,state||'Active']; }

setSrc([
  srow('제피르-250g-AA-1','15,900원',4120,'제피르 250g'),      // 단품
  srow('제피르-250g-AA-2','20,200원',5010,'제피르 250g 2입'),   // 배수 — 더 비쌈
  srow('제피르-250g-AA-3','24,500원',5950,'제피르 250g 3입'),
  srow('저마진-BB-1','2,500원',1000,'저마진'),                   // 마진 양수지만 얇음 → 허용입찰 < ¥2
  srow('적자-CC-1','40,000원',2000,'적자'),                      // 팔수록 손해
  srow('미등록-DD-1','8,000원',2450,'미등록'),                   // 리스팅에 없음
  srow('이미광고-EE-1','8,000원',2450,'이미광고'),               // 이미 광고 중
  srow('비활성-FF-1','8,000원',2450,'비활성'),                   // 리스팅 상태 Inactive
  srow('재고0-GG-1','8,000원',2450,'재고0')]);                   // Active 인데 재고 0
cells['리스팅']=[LISTING_HEADER,
  lrow('제피르-250g-AA-1','B0AA',4120,10), lrow('제피르-250g-AA-2','B0AA',5010,10), lrow('제피르-250g-AA-3','B0AA',5950,10),
  lrow('저마진-BB-1','B0BB',1000,5), lrow('적자-CC-1','B0CC',2000,5),
  lrow('이미광고-EE-1','B0EE',2450,5), lrow('비활성-FF-1','B0FF',2450,0,'Inactive'),
  lrow('재고0-GG-1','B0GG',2450,0,'Active')];
advertised={'이미광고-EE-1':{ads:[{id:'A1'}],on:1}};

// ── 1) 설치 ─────────────────────────────────────────────
setupNewAds();
ok(!!na['설정'] && !!na['상품통합'] && !!na['상품군광고'], '새 파일에 표 셋을 만든다 — '+Object.keys(na).join(' · '));
ok(na['설정'].length-1===NA_CFG_DEFAULTS.length, '설정 기본값 '+(na['설정'].length-1)+'개');
const pol=naPolicy_();
ok(pol.weekStarts===1000 && pol.weekSpend===120000 && pol.famPot===1000 && pol.q0===0.02,
   '정책: 주 시작 '+pol.weekStarts+' · 주간 ¥'+pol.weekSpend+' · 판돈 ¥'+pol.famPot+' · 시드 '+(pol.q0*100)+'%');
ok(pol.maxBid===100, '   최대 유효입찰은 광고기준의 확대 값을 따른다 (¥'+pol.maxBid+')');
ok(pol.canAuto===false && /모의운영/.test(naGateText_(pol)), '   기본은 모의운영 — 아무것도 안 나간다');

// ── 2) 가져오기 ─────────────────────────────────────────
const r=naImportRun_({quiet:true});
const I=na['상품통합'].slice(1), by={}; I.forEach(x=>{by[x[NA_I_SKU]]=x;});
ok(r.read===9 && r.added===9, '소싱 9줄을 읽어 9줄을 새로 넣었다 ('+r.read+' · '+r.added+')');
ok(r.fams===7, '상품군 '+r.fams+'개 (제피르 3옵션이 하나로)');
ok(by['제피르-250g-AA-1'][NA_I_FAM]==='제피르-250g-AA', '상품군키는 끝의 -숫자를 뗀다 — '+by['제피르-250g-AA-1'][NA_I_FAM]);

// ── 3) 대표 옵션 — 단품이 뽑혀야 한다 ──────────────────
ok(by['제피르-250g-AA-1'][NA_I_REP]==='O', '대표는 단품(-1) — 가장 싼 것의 110% 안에서 고른다');
ok(by['제피르-250g-AA-2'][NA_I_ALLOC]===NAA_VARWAIT && by['제피르-250g-AA-3'][NA_I_ALLOC]===NAA_VARWAIT,
   '   나머지 옵션은 옵션대기 (탐색비를 3배 주지 않는다)');
ok(by['제피르-250g-AA-1'][NA_I_ALLOC]===NAA_START, '   대표만 소액자동시작');

// ── 4) 배분 ─────────────────────────────────────────────
ok(by['미등록-DD-1'][NA_I_ALLOC]===NAA_INFO && /리스팅에 없습니다/.test(by['미등록-DD-1'][NA_I_WHY]),
   '아마존에 아직 없으면 정보대기 — '+by['미등록-DD-1'][NA_I_WHY].substring(0,30));
ok(by['이미광고-EE-1'][NA_I_ALLOC]===NAA_EXCLUDE && /이미 광고 중/.test(by['이미광고-EE-1'][NA_I_WHY]),
   '이미 광고 중이면 손대지 않는다 (사람이 tiktok 에 넣은 것)');
ok(by['비활성-FF-1'][NA_I_ALLOC]===NAA_EXCLUDE && /Inactive/.test(by['비활성-FF-1'][NA_I_WHY]),
   "리스팅 Inactive 는 제외 — 'Inactive'.indexOf('active') 가 2 라서 부분 문자열로 보면 통과해 버린다");
ok(by['재고0-GG-1'][NA_I_ALLOC]===NAA_EXCLUDE && /재고가 0/.test(by['재고0-GG-1'][NA_I_WHY]),
   '재고 0 도 제외 — 살 수 없는 것에 광고하지 않는다');
ok(by['적자-CC-1'][NA_I_ALLOC]===NAA_EXCLUDE && by['적자-CC-1'][NA_I_MPCT]==='', '팔수록 손해면 제외');
ok(by['저마진-BB-1'][NA_I_ALLOC]===NAA_EXCLUDE && /최소 ¥2 에 못 미칩니다/.test(by['저마진-BB-1'][NA_I_WHY]),
   '허용입찰이 ¥2 미만이면 제외 — '+by['저마진-BB-1'][NA_I_WHY].substring(0,40));

// ── 5) 입찰 셈 ──────────────────────────────────────────
const c=by['제피르-250g-AA-1'];
const G=c[NA_I_PRICE]*c[NA_I_MPCT]/100, cap=Math.min(100,G*0.02*0.5), bid=Math.floor(cap*0.7*100)/100;
ok(Math.abs(c[NA_I_G]-Math.round(G))<1, 'G = 판매가 × 마진율 = ¥'+c[NA_I_G]);
ok(Math.abs(c[NA_I_CAP]-Math.round(cap*100)/100)<0.02, '허용입찰 = G × 2% × 0.5 = ¥'+c[NA_I_CAP]);
ok(Math.abs(c[NA_I_BID]-Math.max(2,bid))<0.02, '시작입찰 = 허용 × 70% = ¥'+c[NA_I_BID]+' (지금 ¥5 근처)');
ok(c[NA_I_MSRC]==='소싱 조달비', '마진출처는 소싱 조달비 — '+c[NA_I_MSRC]);

// ── 6) 상품군 표 ────────────────────────────────────────
const F=na['상품군광고'].slice(1), bf={}; F.forEach(x=>{bf[x[NA_F_KEY]]=x;});
const fam=bf['제피르-250g-AA'];
ok(fam[NA_F_N]===3 && fam[NA_F_REP]==='제피르-250g-AA-1', '상품군 표: 옵션 3 · 대표 단품');
ok(fam[NA_F_POT]===Math.min(1000,Math.round(G*0.5)) && fam[NA_F_LEFT]===fam[NA_F_POT],
   '   판돈 = min(¥1,000, G×0.5) = ¥'+fam[NA_F_POT]+' — 상품군에 하나');

// ── 7) 다시 눌러도 안전 ─────────────────────────────────
const n1=na['상품통합'].length;
const r2=naImportRun_({quiet:true});
ok(na['상품통합'].length===n1 && r2.added===0, '다시 눌러도 줄이 안 늘어난다 ('+r2.added+'개 추가)');
// 판매가가 바뀌면 값만 고친다 (같은 줄 객체를 고치므로 먼저 값을 떠 둔다)
const gBefore=c[NA_I_G], bidBefore=c[NA_I_BID];
cells['리스팅'][1][6]=4500;
const r3=naImportRun_({quiet:true});
const c3=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='제피르-250g-AA-1');
ok(r3.updated>=1 && c3[NA_I_PRICE]===4500 && c3[NA_I_G]>gBefore && c3[NA_I_BID]>bidBefore,
   '판매가가 바뀌면 G·입찰을 다시 센다 (G ¥'+gBefore+' → ¥'+c3[NA_I_G]+' · 입찰 ¥'+bidBefore+' → ¥'+c3[NA_I_BID]+')');
// 이미 시작한 줄은 배분을 덮지 않는다
c3[NA_I_STATE]=NAS_PROBE; c3[NA_I_ALLOC]='시작함';
cells['리스팅'][1][6]=4600;
naImportRun_({quiet:true});
const c4=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='제피르-250g-AA-1');
ok(c4[NA_I_ALLOC]==='시작함' && c4[NA_I_STATE]===NAS_PROBE && c4[NA_I_PRICE]===4600,
   '이미 시작한 줄은 배분·상태를 덮지 않고 값만 고친다 (배분 '+c4[NA_I_ALLOC]+')');

// ── 9) 뒤늦게 등록되는 상품 — 정보대기·비활성이 저절로 시작 대기로 옮겨 온다 ──
cells['리스팅'].push(lrow('미등록-DD-1','B0DD',2450,7));            // 일주일 뒤 아마존에 올라옴
cells['리스팅'][7][8]='Active'; cells['리스팅'][7][7]=4;             // 비활성-FF-1 이 살아남
naImportRun_({quiet:true});
const dd=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='미등록-DD-1');
const ff=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='비활성-FF-1');
ok(dd[NA_I_ALLOC]===NAA_START && dd[NA_I_REP]==='O' && dd[NA_I_STATE]===NAS_NEW,
   '정보대기였던 것이 리스팅에 오르면 다음 가져오기에서 소액자동시작으로 ('+dd[NA_I_ALLOC]+')');
ok(ff[NA_I_ALLOC]===NAA_START, '광고제외(Inactive)였던 것도 살아나면 다시 시작 대기로 ('+ff[NA_I_ALLOC]+')');
const fdd=na['상품군광고'].slice(1).find(x=>x[NA_F_KEY]==='미등록-DD');
ok(fdd[NA_F_STATE]===NAS_NEW && fdd[NA_F_REP]==='미등록-DD-1' && fdd[NA_F_POT]>0,
   '   상품군 표도 정보대기 → 가져옴, 판돈이 붙는다 (¥'+fdd[NA_F_POT]+')');

// ── 10) NEW_ADS 가 시작한 광고는 "이미 광고 중" 이 아니다 — 대표가 바뀌어 둘을 켜면 안 된다 ──
advertised['제피르-250g-AA-1']={ads:[{id:'N1'}],on:1};              // ② 가 켠 것이 상품광고목록에 잡힘
naImportRun_({quiet:true});
const z1=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='제피르-250g-AA-1');
const z2=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='제피르-250g-AA-2');
ok(z1[NA_I_STATE]===NAS_PROBE && z1[NA_I_REP]==='O', '소액운영 중인 대표는 그대로 대표 (상태 '+z1[NA_I_STATE]+')');
ok(z2[NA_I_ALLOC]===NAA_VARWAIT && z2[NA_I_REP]!=='O', '   다른 옵션이 새 대표로 뽑히지 않는다 — 한 상품군에 둘을 켜지 않는다 ('+z2[NA_I_ALLOC]+')');
const fz=na['상품군광고'].slice(1).find(x=>x[NA_F_KEY]==='제피르-250g-AA');
ok(fz[NA_F_REP]==='제피르-250g-AA-1' && !fz[NA_F_PREV], '   상품군 표의 대표도 안 바뀐다');

// ── 11) 사람이 잡은 줄 — [소유] 가 NEW_ADS 가 아니면 건드리지 않는다 ──
const gg=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='재고0-GG-1');
cells['리스팅'][8][7]=9;                                            // 재고가 들어와 원래면 시작 대기가 될 것
gg[NA_I_OWNER]='사람'; gg[NA_I_ALLOC]='보류'; gg[NA_I_WHY]='내가 볼 것';
const r11=naImportRun_({quiet:true});
const gg2=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='재고0-GG-1');
ok(gg2[NA_I_ALLOC]==='보류' && gg2[NA_I_WHY]==='내가 볼 것' && gg2[NA_I_OWNER]==='사람',
   '소유=사람 인 줄은 배분·사유·값 모두 그대로 ('+gg2[NA_I_ALLOC]+')');
ok(r11.alloc['사람이 잡음']===1, '   알림에 "사람이 잡음 1" 로 센다');
ok(r11.alloc['운영 중 · '+NAS_PROBE]===1, '   운영 중인 것은 "운영 중 · 소액운영" 으로 따로 센다');
ok(!r11.alloc['광고제외'] || !na['상품통합'].slice(1).some(x=>/이미 광고 중/.test(x[NA_I_WHY]) && x[NA_I_STATE]===NAS_PROBE),
   '   운영 중인 것이 "이미 광고 중" 으로 제외되지 않는다');

// ── 12) 바깥 시트 마진율과 어긋나면 사유에 적는다 (막지는 않는다) ──
cells['상품 목록'].push(srow('어긋남-HH-1','8,000원',2450,'어긋남')); cells['상품 목록'][cells['상품 목록'].length-1][12]=1400; // 바깥 마진 ¥1,400 = 57%
srcRows['어긋남-HH-1']={krw:8000,price:2450};
cells['리스팅'].push(lrow('어긋남-HH-1','B0HH',2450,3));
naImportRun_({quiet:true});
const hh=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='어긋남-HH-1');
ok(hh[NA_I_ALLOC]===NAA_START && /MARGIN_MISMATCH/.test(hh[NA_I_WHY]) && /57\.1%/.test(hh[NA_I_WHY]),
   '마진율이 5%p 넘게 어긋나면 사유에 표시하고 시작은 막지 않는다 — '+hh[NA_I_WHY].replace(/^.*⚠/,'⚠').substring(0,60));

// ── 13) 시간이 다 되면 새 상품군부터 돌아 다음에 이어 간다 ──
cells['상품 목록'].push(srow('새것-II-1','8,000원',2450,'새것')); srcRows['새것-II-1']={krw:8000,price:2450};
cells['리스팅'].push(lrow('새것-II-1','B0II',2450,3));
const realNow=Date.now; let tick=0; Date.now=()=>{ tick++; return tick>3 ? 1e12+NA_SOFT_MS+1 : 1e12; }; // 첫 상품군 하나만 돌고 끊긴다
const r13=naImportRun_({quiet:true}); Date.now=realNow;
const ii=na['상품통합'].slice(1).find(x=>x[NA_I_SKU]==='새것-II-1');
ok(!!ii && ii[NA_I_ALLOC]===NAA_START && r13.left>0, '끊겨도 새 상품군은 먼저 처리된다 (남음 '+r13.left+' · 새것 '+(ii?ii[NA_I_ALLOC]:'없음')+')');
const groups=naOrderGroups_(naSourceRows_(), {'제피르-250g-AA-1':0,'제피르-250g-AA-2':1,'제피르-250g-AA-3':2});
ok(groups[0].fresh===true && groups[groups.length-1].key==='제피르-250g-AA', '   묶음 순서: 새 상품군 먼저, 이미 본 것은 뒤로');

// ② 실행은 78C 에 있다 — newads2.js 가 시험한다

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
