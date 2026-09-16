// 입찰 전송 묶음 — 100개씩, 부분 성공은 된 줄만 적는다
const fs=require('fs'); const A=__dirname + '/../../apps-script/';
const s78=fs.readFileSync(A+'78_신규광고.gs','utf8'), s78E=fs.readFileSync(A+'78E_신규광고_주기.gs','utf8'), s72J=fs.readFileSync(A+'72J_광고실행.gs','utf8');
function fn(src,name){ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('no '+name); let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.substring(i,k+1);} } }
function vars(src){ const out=[]; const re=/^var NA_I_[\s\S]*?;/gm; let m; while((m=re.exec(src))) out.push(m[0].replace(/\/\/.*$/gm,'')); return out.join('\n'); }
eval(vars(s78)); global.ADSW_CT_ADGROUP='g';
let log=[], calls=[];
global.log_=(a,b,c)=>log.push(c); global.adsToken_=()=>'t';
eval(fn(s72J,'adsCreated_')); eval(fn(s78E,'naSendBids_'));
let fail=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fail++; };
const mkJobs=n=>{ const j=[],rows=[]; for(let i=0;i<n;i++){ const r=new Array(27).fill(''); r[NA_I_BID]=5; rows.push(r); j.push({gid:'g'+i,to:16.5,sku:'S'+i,ri:i}); } return {j,rows}; };
// ① 117개 → 두 번 호출, 전부 성공
let {j,rows}=mkJobs(117);
global.adsApiRetry_=(t,m,p,b)=>{ calls.push(b.adGroups.length);
  return {adGroups:{success:b.adGroups.map((x,i)=>({adGroupId:x.adGroupId,index:i}))}}; };
let n=naSendBids_(j,rows);
ok(n===117 && calls.join()==='100,17', '117줄을 100+17 두 번에 보냄 ('+calls.join()+')');
ok(rows.every(r=>r[NA_I_BID]===16.5), '전부 시트에 적힘');
// ② 부분 성공 — 3번째만 실패
calls=[]; log=[]; ({j,rows}=mkJobs(5));
global.adsApiRetry_=(t,m,p,b)=>({adGroups:{ success:b.adGroups.map((x,i)=>({adGroupId:x.adGroupId,index:i})).filter((x,i)=>i!==2),
  error:[{index:2,errors:[{errorType:'X',message:'bad'}]}] }});
n=naSendBids_(j,rows);
ok(n===4 && rows[2][NA_I_BID]===5 && rows[3][NA_I_BID]===16.5, '안 된 줄은 옛 값 그대로 (된 4 · 3번째 유지)');
ok(/입찰 4개를 올렸습니다 · 못 올림 1/.test(log[0]), '로그: '+log[0]);
// ③ 묶음 전체 실패
calls=[]; log=[]; ({j,rows}=mkJobs(3));
global.adsApiRetry_=()=>({adGroups:{error:[{errors:[{errorType:'E',message:'nope'}]}]}});
n=naSendBids_(j,rows);
ok(n===0 && rows.every(r=>r[NA_I_BID]===5) && /못 올렸습니다 3개/.test(log[0]), '묶음이 통째로 실패하면 아무 줄도 안 적는다');
// ④ 던져도 죽지 않는다
log=[]; ({j,rows}=mkJobs(2)); global.adsApiRetry_=()=>{ throw new Error('boom'); };
ok(naSendBids_(j,rows)===0 && /boom/.test(log[0]), '예외도 잡는다');
console.log(fail?'\n✗ 실패 '+fail:'\n✓ 전부 통과'); process.exit(fail?1:0);
