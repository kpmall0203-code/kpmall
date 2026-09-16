// 켠 날 찾기 — 켜진 길이 둘이어도 같은 날이 나오는가
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };
const cells={};
const mkRange=(name,r,c,nr,nc)=>({getValues:()=>{const rows=cells[name]||[];const out=[];
  for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];
    out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}return out;}});
const mkSheet=name=>({getName:()=>name,getLastRow:()=>(cells[name]||[]).length,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc),getMaxColumns:()=>40});
global.ss_=()=>({getSheetByName:n=>cells[n]?mkSheet(n):null});
global.ymd_=d=>d.toISOString().slice(0,10);
global.SHEET_ADLOG='광고변경대장';
global.ADLOG_HEADER=['일시','요약','종류','캠페인','광고그룹','SKU','ASIN','대상','항목','전','후','사유','실행','결과','캠페인ID','광고그룹ID','대상ID'];
eval(fs.readFileSync('all/72N_광고관제.js','utf8'));

const L=(at,kind,item,to,cid)=>{const r=new Array(17).fill('');
  r[0]=at; r[2]=kind; r[8]=item; r[10]=to; r[14]=cid; return r;};
cells['광고변경대장']=[ADLOG_HEADER.slice(),
  L(new Date('2026-09-07T00:00:00Z'),'캠페인','생성','ENABLED','C_생성켜짐'),
  L(new Date('2026-09-07T00:00:00Z'),'광고그룹','기본입찰',21,'C_생성켜짐'),
  L(new Date('2026-09-01T00:00:00Z'),'캠페인','생성','PAUSED','C_나중에켬'),
  L(new Date('2026-09-05T00:00:00Z'),'캠페인','상태','ENABLED','C_나중에켬'),
  L(new Date('2026-09-02T00:00:00Z'),'캠페인','상태','ENABLED','C_다시켬'),
  L(new Date('2026-09-06T00:00:00Z'),'캠페인','상태','ENABLED','C_다시켬'),
  L('2026. 9. 7','캠페인','생성','ENABLED','C_글자날짜'),
  L(new Date('2026-09-07T00:00:00Z'),'상품','등록','ENABLED','C_상품만')];

const s=adWatchOnSince_();
ok(s['C_생성켜짐']==='2026-09-07', '켜진 채로 만든 캠페인 → '+s['C_생성켜짐']+' (이것이 오늘 난 오진)');
ok(s['C_나중에켬']==='2026-09-05', '만들고 나중에 켠 것 → 켠 날 '+s['C_나중에켬']);
ok(s['C_다시켬']==='2026-09-06', '여러 번 켰으면 마지막 → '+s['C_다시켬']);
ok(s['C_글자날짜']==='2026-09-07', "글자 날짜 '2026. 9. 7' 도 읽는다 → "+s['C_글자날짜']);
ok(s['C_상품만']===undefined, '상품 등록만 있는 것은 켠 날이 아니다');
ok(adLogYmd_('')==='' && adLogYmd_('알 수 없음')==='', '못 읽으면 빈 값 — 날짜를 지어내지 않는다');

// 판정: 오늘 켠 캠페인은 '노출 0' 이 아니라 '켠 지 얼마 안 됨'
const c={approved:true,daily:1929,result:''};
const live={state:'ENABLED'};
const p={im:0,ck:0,cost:0,sales:0,ord:0};
const d1=adWatchVerdict_(c,live,p,0.17,'2026-09-07','2026-08-31','2026-09-06',9000);
ok(d1.v==='· 켠 지 얼마 안 됨', '오늘 켠 것 → "'+d1.v+'"');
const d2=adWatchVerdict_(c,live,p,0.17,'','2026-08-31','2026-09-06',9000);
ok(d2.v==='· 노출 없음' && d2.why.indexOf('며칠째인지는 모릅니다')>0,
   '켠 날을 모르면 며칠이라 단정하지 않는다 — "'+d2.why+'"');
const d3=adWatchVerdict_(c,live,p,0.17,'2026-08-20','2026-08-31','2026-09-06',9000);
ok(d3.v==='· 노출 없음' && d3.why.indexOf('켜진 지 7일')===0, '오래 켜둔 것은 그대로 — "'+d3.why.slice(0,20)+'"');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
