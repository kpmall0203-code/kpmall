// 설정 따라잡기 — 도는 줄의 허용·입찰·판돈이 지금 설정을 따라가나
const fs=require('fs'); const A=__dirname + '/../../apps-script/';
const s78=fs.readFileSync(A+'78_신규광고.gs','utf8'), s78E=fs.readFileSync(A+'78E_신규광고_주기.gs','utf8');
function fn(src,name){ const i=src.indexOf('function '+name+'('); if(i<0) throw new Error('no '+name); let d=0,j=src.indexOf('{',i); for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d) return src.substring(i,k+1);} } }
function vars(src){ const out=[]; const re=/^var (NA_|NAS_|NAA_|NAR_)[\s\S]*?;/gm; let m; while((m=re.exec(src))) out.push(m[0].replace(/\/\/.*$/gm,'')); return out.join('\n'); }
eval(vars(s78)); eval(vars(s78E)); eval(fn(s78E,'naPolicyCatchUp_')); global.naPlusDays_=(d,n)=>addDays_(d,n);
global.addDays_=(d,n)=>{const x=new Date(d+'T00:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().substring(0,10);};
const pol={famPot:1000, famMult:1.0, beta:1.0, startFrac:1.0, maxBid:100};
const mk=(sku,fam,state,G,q,cap,bid,gid,rep)=>{ const r=new Array(27).fill(''); r[NA_I_SKU]=sku; r[NA_I_FAM]=fam; r[NA_I_STATE]=state; r[NA_I_G]=G; r[NA_I_Q]=q; r[NA_I_CAP]=cap; r[NA_I_BID]=bid; r[NA_I_GID]=gid; r[NA_I_REP]=rep; return r; };
const rows=[ mk('S1','F1',NAS_PROBE,824,2,8.24,5.76,'g1','O'), mk('S2','F2',NAS_PROBE,3468,2,34.68,24.27,'g2','O'), mk('S3','F3',NAS_WATCH,244,2,2.44,2,'g3','O'),
             mk('S4','F4',NAS_PROBE,824,2,8.24,20,'g4','O'), mk('S5','F5',NAS_STOP,824,2,8.24,5,'g5','O'), mk('S6','F1',NAS_PROBE,824,2,8.24,5,'','') ];
const fams=[ ['F1',2,'S1','','',412,100,0,312,NAS_PROBE], ['F2',1,'S2','','',1000,0,0,1000,NAS_PROBE], ['F3',1,'S3','','',122,0,0,122,NAS_WATCH], ['F4',1,'S4','','',900,0,0,900,NAS_PROBE], ['F5',1,'S5','','',412,0,0,0,NAS_STOP] ];
const famAt={}; fams.forEach((f,i)=>famAt[f[0]]=i);
let fail=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fail++; };
const cu=naPolicyCatchUp_(rows,[0,1,2,3,4,5],fams,famAt,pol,'2026-09-15');
ok(rows[0][NA_I_CAP]===16.48 && cu.jobs.some(j=>j.sku==='S1'&&j.to===16.48), 'S1 허용 8.24 → 16.48, 입찰 5.76 → 16.48');
ok(rows[1][NA_I_CAP]===69.36 && cu.jobs.find(j=>j.sku==='S2').to===69.36, 'S2 허용 34.68 → 69.36 (최대 유효입찰 100 안)');
ok(rows[2][NA_I_CAP]===4.88 && cu.jobs.find(j=>j.sku==='S3').to===4.88, 'S3 관찰 줄도 · 최소 입찰 2 이상');
ok(!cu.jobs.some(j=>j.sku==='S4'), 'S4 이미 목표 위(20 > 16.48) 면 안 내린다');
ok(!cu.jobs.some(j=>j.sku==='S5') && !cu.jobs.some(j=>j.sku==='S6'), '멈춘 줄 · 그룹 없는 줄은 건너뜀');
ok(fams[0][NA_F_POT]===824 && fams[1][NA_F_POT]===1000 && fams[3][NA_F_POT]===900 && cu.potUp===2, '판돈: F1 412→824 · F2 상한 1000 유지 · F4 900 유지(안 줄임) · 키운 수 2 ('+cu.potUp+')');
ok(rows[0][NA_I_NEXT]==='2026-09-18' && /설정 따라잡기/.test(rows[0][NA_I_WHY]), '올린 줄은 다음평가일 사흘 뒤 · 사유');
console.log(fail?'\n✗ 실패 '+fail:'\n✓ 전부 통과'); process.exit(fail?1:0);
