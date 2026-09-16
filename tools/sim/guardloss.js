// 손실한도 — 손해를 내는 시험만 되돌린다 (72AE adExpandLossGuard_ · adExpandCycle)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };
const cells={};
const mkRange=(name,r,c,nr,nc)=>({
  getValues:()=>{const rows=cells[name]||[];const out=[];
    for(let i=0;i<(nr||1);i++){const row=rows[r-1+i]||[];out.push(Array.from({length:nc||1},(_,j)=>row[c-1+j]??''));}
    return out;},
  setValues(v){const rows=cells[name]||(cells[name]=[]);
    for(let i=0;i<v.length;i++){const row=rows[r-1+i]||(rows[r-1+i]=[]);
      for(let j=0;j<v[i].length;j++) row[c-1+j]=v[i][j];} return this;}
});
const mkSheet=name=>({ getName:()=>name, getLastRow:()=>(cells[name]||[]).length,
  getLastColumn:()=>((cells[name]||[[]])[0]||[]).length||1,
  getRange:(r,c,nr,nc)=>mkRange(name,r,c,nr,nc) });
const sheets={};
global.ss_=()=>({getSheetByName:n=>cells[n]?(sheets[n]||(sheets[n]=mkSheet(n))):null});
global.log_=()=>{}; global.ui_=()=>({alert(){},ButtonSet:{OK:1}});
let today='2026-09-16'; global.ymd_=()=>today;
global.addDays_=(y,n)=>{const d=new Date(y+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
global.daysBetween_=(a,b)=>Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));
global.adRowApproved_=v=>v===true||String(v).trim()==='O';
global.adErrorText_=s=>String(s); global.adLogBuffer_=()=>({push(){},flush(){}}); global.adLogRow_=o=>o;
global.adsToken_=()=>'T'; global.fmtYen_=n=>'¥'+Math.round(Number(n)||0).toLocaleString();
let sent=[]; global.adJobSend_=(t,a,k,id,val)=>{sent.push({id:id,val:val});return {ok:true};};
global.hdrMap_=sh=>{const m={};(cells[sh.getName()][0]||[]).forEach((h,i)=>{m[String(h)]=i;});return m;};
global.cellOf_=(row,map,n,d)=>{const i=map[n];return i===undefined?d:(row[i]??d);};
global.SPEND_ATTRIB_DAYS=14; global.SPEND_REPORT_LAG_DAYS=2;
global.SHEET_ADS='광고실적'; global.EXPAND_WINDOW_DAYS=30;
global.ADS_HEADER=['날짜','SKU','ASIN','캠페인','광고비(JPY)','광고매출(JPY)','노출','클릭','광고주문','수집일시'];
global.adMarginCtx_=()=>({}); global.adMarginFor_=()=>({pct:20});
global.buildAdExpandResults=()=>'';
let basis={'확대 · 모드':'자동운영','확대 · 최대 유효입찰(JPY)':100};
global.adBasis_=()=>basis;
eval(fs.readFileSync('all/72AF_확대결과.js','utf8'));
eval(fs.readFileSync('all/72AB_확대후보.js','utf8'));
eval(fs.readFileSync('all/72AE_확대시험.js','utf8'));

// 광고실적 — 시험마다 운영 7일치. cost/sales 를 정해 손해를 만든다
function ads(list){ const out=[ADS_HEADER];
  list.forEach(x=>{ for(let i=1;i<=7;i++) out.push(['2026-09-'+String(8+i).padStart(2,'0'),x.sku,'A','c',x.cost/7,x.sales/7,100,1,0,'']); });
  cells[SHEET_ADS]=out; }
function row(id,sku,to,due){ const r=new Array(EXTEST_HEADER.length).fill('');
  r[XT_ID]=id; r[XT_SKU]=sku; r[XT_ASIN]='A'; r[XT_FAM]='A'; r[XT_ARM]=XARM_TEST; r[XT_TYPE]=XTYPE_BID;
  r[XT_RKIND]='광고그룹'; r[XT_RID]='g_'+sku; r[XT_RNAME]='KP'; r[XT_FROM]=10; r[XT_TO]=to||11; r[XT_CAP]=20;
  r[XT_BFROM]='2026-08-25'; r[XT_BTO]='2026-09-07'; r[XT_RUNFROM]='2026-09-09';
  r[XT_RUNTO]=due||'2026-09-23'; r[XT_HOLD]=500; r[XT_STATE]=XS_RUN; r[XT_APPROVE]=true; return r; }
function setup(list,rows){ ads(list); cells[SHEET_EXTEST]=[EXTEST_HEADER].concat(rows); sent=[]; }
const st=i=>cells[SHEET_EXTEST][i+1][XT_STATE];
const why=i=>String(cells[SHEET_EXTEST][i+1][XT_WHY]);

// ── 1) 줄마다 손해를 따로 센다 ──────────────────────────
// 마진 20%: 손해 = cost − sales*0.2
setup([{sku:'LOSS',cost:5000,sales:5000},{sku:'WIN',cost:1000,sales:20000}],
      [row('T1','LOSS'),row('T2','WIN')]);
let l=adExpandLossBySku_(cells[SHEET_EXTEST].slice(1));
ok(l.by[0]===4000, 'LOSS 줄의 손해 ¥4,000 (광고비 5000 − 매출 5000×20%) — '+l.by[0]);
ok(l.by[1]===-3000, 'WIN 줄은 ¥3,000 벌고 있다 (음수) — '+l.by[1]);
ok(l.total===1000, '합계는 서로 덜어 ¥1,000 — '+l.total);

// ── 2) 합계가 한도 아래면 아무것도 안 한다 ──────────────
basis['확대 · 시험 손실한도(JPY)']=2000;
let g=adExpandLossGuard_(cells[SHEET_EXTEST].slice(1),adExpandPolicy_());
ok(g.nCut===0, '합계 ¥1,000 < 한도 ¥2,000 → 되돌릴 것 없음');

// ── 3) 한도를 넘으면 손해 내는 줄만 되돌린다 ────────────
basis['확대 · 시험 손실한도(JPY)']=500;
let msg=adExpandCycle({quiet:true});
ok(st(0)===XS_GUARD, '손해를 내던 LOSS 는 보호중단 ('+st(0)+')');
ok(st(1)===XS_RUN, '벌고 있는 WIN 은 그대로 돈다 ('+st(1)+') — 내려도 한도에 도움이 안 되고 벌던 것만 끊는다');
ok(sent.length===1 && sent[0].id==='g_LOSS' && sent[0].val===10, '   되돌린 입찰은 LOSS 하나뿐 ¥10 — '+JSON.stringify(sent));
ok(/이 시험의 손해 ¥4,000/.test(why(0)) && /한도 ¥500/.test(why(0)), '   그 줄의 손해와 전체 손해를 함께 적는다 — '+why(0));
ok(/나머지 1개는 그대로/.test(msg), '   요약에 남긴 개수를 적는다 — '+msg);

// ── 4) 손해가 큰 것부터, 한도 아래로 내려가는 데까지만 ──
setup([{sku:'A',cost:9000,sales:0},{sku:'B',cost:4000,sales:0},{sku:'C',cost:1500,sales:0}],
      [row('T1','A'),row('T2','B'),row('T3','C')]);
basis['확대 · 시험 손실한도(JPY)']=5000;   // 합계 14,500
msg=adExpandCycle({quiet:true});
ok(st(0)===XS_GUARD && st(1)===XS_GUARD, '¥9,000 · ¥4,000 을 되돌려 남은 손해 ¥1,500 ≤ 한도 ¥5,000');
ok(st(2)===XS_RUN, '   가장 작은 ¥1,500 은 더 내릴 필요가 없어 그대로 둔다 ('+st(2)+')');

// ── 5) 한도가 비어 있으면 제한 없음 ─────────────────────
setup([{sku:'A',cost:99999,sales:0}],[row('T1','A')]);
basis['확대 · 시험 손실한도(JPY)']='';
msg=adExpandCycle({quiet:true});
ok(st(0)===XS_RUN && sent.length===0, '손실한도를 비우면 아무리 손해가 나도 안 내린다 ('+st(0)+')');

// ── 6) 운영기간이 끝나면 손해와 무관하게 되돌린다 ───────
setup([{sku:'A',cost:100,sales:99999}],[row('T1','A',11,'2026-09-15')]);
msg=adExpandCycle({quiet:true});
ok(st(0)===XS_MATURE && sent.length===1, '벌고 있어도 14일이 끝나면 되돌린다 (판정은 되돌린 뒤에 낸다)');

// ── 7) 필수 값은 최대 유효입찰 하나뿐 ───────────────────
basis={'확대 · 모드':'자동운영'};
let pol=adExpandPolicy_();
ok(pol.need.length===1 && pol.need[0]==='최대 유효입찰(JPY)', '비어 있으면 못 하는 것은 최대 유효입찰뿐 — '+JSON.stringify(pol.need));
basis['확대 · 최대 유효입찰(JPY)']=100;
pol=adExpandPolicy_();
ok(pol.ready===true && pol.canAuto===true, '   나머지를 다 비워도 자동운영이 된다');
ok(pol.maxConcurrent===0 && pol.weekSpend===0 && pol.lossCap===0, '   그 셋은 0(제한 없음)으로 들어온다');

// ── 8) 주머니: 돌고 있는 시험이 예약한 돈을 센다 ────────
cells[SHEET_EXTEST]=[EXTEST_HEADER].concat([row('T1','A'),row('T2','B')]);
ok(adExpandWeekUsed_()===1000, '돌고 있는 시험 2개 × 예약액 ¥500 = ¥1,000 — '+adExpandWeekUsed_());
cells[SHEET_EXTEST][1][XT_STATE]=XS_MATURE;
ok(adExpandWeekUsed_()===500, '   되돌린(성숙대기) 줄은 더 안 쓰므로 빠진다 — '+adExpandWeekUsed_());

// ── 9) 6분에 걸려도 기록은 남는다 · 남은 것은 주기가 이어 간다 ──
global.SpreadsheetApp={flush(){}};
global.ADS_SOFT_MS=4*60*1000;
global.adExpandStartRow_=(token,r,pol,buf)=>{ r[XT_STATE]=XS_RUN; r[XT_RUNFROM]=today;
  r[XT_RUNTO]=addDays_(today,pol.runDays); sent.push({id:String(r[XT_RID])}); return ''; };
basis={'확대 · 모드':'자동운영','확대 · 최대 유효입찰(JPY)':100};
function plan(id,sku){ const r=row(id,sku); r[XT_STATE]=XS_PLAN; r[XT_RUNFROM]=''; r[XT_RUNTO]=''; return r; }
cells[SHEET_ADS]=[ADS_HEADER];
cells[SHEET_EXTEST]=[EXTEST_HEADER].concat([plan('P1','A'),plan('P2','B'),plan('P3','C')]);
sent=[];
let saves=0;
const realSheet=sheets[SHEET_EXTEST]||(sheets[SHEET_EXTEST]=mkSheet(SHEET_EXTEST));
const realGet=realSheet.getRange;
realSheet.getRange=(r,c,nr,nc)=>{ const rg=realGet(r,c,nr,nc); const sv=rg.setValues.bind(rg);
  rg.setValues=v=>{ if(r===2&&nc>=EXTEST_HEADER.length) saves++; return sv(v); }; return rg; };
let out=adExpandStartApproved_();
ok(out.done===3 && sent.length===3, '승인분 3개를 시작한다 ('+out.done+')');
ok(saves>=1, '   표에 적는다 ('+saves+'번)');
ADS_SOFT_MS=-1;   // 이미 시간이 다 됐다고 치자
cells[SHEET_EXTEST]=[EXTEST_HEADER].concat([plan('Q1','A'),plan('Q2','B')]);
sent=[];
out=adExpandStartApproved_();
ok(out.done===0 && out.left===2 && sent.length===0,
   '시간이 다 됐으면 보내지 않고 미룬다 — 보냄 '+sent.length+' · 미룸 '+out.left);
ok(String(cells[SHEET_EXTEST][1][XT_STATE])===XS_PLAN, '   미룬 줄은 계획으로 남아 다음 걸음이 집어 간다');
ADS_SOFT_MS=4*60*1000;
let msg2=adExpandCycle({quiet:true});
ok(/이어서 시작 2/.test(msg2), '   [확대 시험 주기] 가 남은 것을 이어서 시작한다 — '+msg2);

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
