// 셀 여유 확보가 자료를 지우지 않는가 (76_셀정리)
const fs=require('fs');
let fails=[]; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m); };

const mk=(hdr, maxC, maxR)=>({
  _hdr:hdr, _maxC:maxC, _maxR:maxR, _delC:null, _delR:null,
  getName:()=>'광고육성',
  getMaxRows(){return this._maxR;}, getMaxColumns(){return this._maxC;},
  getLastRow(){return 4;},
  getRange(r,c,nr,nc){ const self=this;
    return { getValues:()=>[self._hdr.slice(c-1, c-1+nc)] }; },
  deleteColumns(at,n){ this._delC={at:at,n:n}; this._maxC-=n; },
  deleteRows(at,n){ this._delR={at:at,n:n}; this._maxR-=n; }
});
eval(fs.readFileSync('all/76_셀정리.js','utf8'));

// 이름으로 뒤에 붙은 칸이 있는 표 — 상수(28)보다 실제 머리글(60)이 넓다
const hdr=[]; for(let i=0;i<60;i++) hdr.push('칸'+i);
let sh=mk(hdr.concat(['','','','']), 64, 1000);
let r=trimSheet_(sh, 28);
ok(sh._delC && sh._delC.at===61, '머리글이 있는 칸은 남기고 그 뒤만 지운다 (지운 자리 '+(sh._delC?sh._delC.at:'없음')+')');
ok(sh.getMaxColumns()===60, '   60칸이 남는다 — 상수 28 을 그대로 믿지 않는다');

// 머리글이 상수보다 좁으면 상수대로 (원래 하던 일)
let sh2=mk(['a','b','c'], 26, 1000);
trimSheet_(sh2, 10);
ok(sh2.getMaxColumns()===10, '머리글이 좁으면 상수 너비까지 자른다 ('+sh2.getMaxColumns()+')');

// 행은 자료 + 여유분만 남긴다
let sh3=mk(['a','b'], 5, 1000);
trimSheet_(sh3, 5);
ok(sh3._delR && sh3._delR.at===4+TRIM_SPARE_ROWS+1, '자료 밑 여유 '+TRIM_SPARE_ROWS+'행만 남기고 지운다');

console.log(fails.length? '\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과');
process.exit(fails.length?1:0);
