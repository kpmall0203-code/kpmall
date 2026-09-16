// 계획 표 [SKU목록] — 쉼표 든 SKU 가 온전히 돌아오나 (72I adSkuListJoin_/Split_ · 72J 가 읽는다)
const fs=require('fs'); let fails=[]; const ok=(c,m)=>{console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails.push(m);};
const src=fs.readFileSync('all/72I_광고생성.js','utf8');
const m=src.match(/var AD_SKU_SEP[\s\S]*?function adSkuListSplit_[\s\S]*?\n}\n/);
eval(m[0]);
const skus=['양반 들기름김 식탁, 4g, 32개','신라면 골드 125g, 16봉','비쵸비   4개','채운  고춧가루 보통 500g,'];
const cell=adSkuListJoin_(skus);
ok(cell.indexOf(' | ')>0, '쉼표가 아니라 | 로 잇는다 — '+cell);
const back=adSkuListSplit_(cell);
ok(back.length===4 && back.every((s,i)=>s===skus[i].trim()), '쉼표 든 SKU 4개가 4개로 돌아온다 ('+back.length+')');
const old=adSkuListSplit_('A-1, B-2, C-3');
ok(old.length===3 && old[1]==='B-2', '옛 줄(쉼표)도 그대로 읽는다');
ok(adSkuListSplit_('').length===0 && adSkuListSplit_(null).length===0, '빈 칸은 빈 목록');
console.log(fails.length?'\n✗ 실패 '+fails.length+'건':'\n✓ 전부 통과'); process.exit(fails.length?1:0);
