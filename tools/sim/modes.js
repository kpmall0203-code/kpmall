const fs=require('fs');
global.ADENABLE_MARK={ENABLED:'· 켬',PAUSED:'· 멈춤'};
eval(fs.readFileSync('72J_광고실행.js','utf8').match(/var ADENABLE_MODES[\s\S]*?^}/m)[0]
   + '\n' + fs.readFileSync('72J_광고실행.js','utf8').match(/function adTargetState_[\s\S]*?^}/m)[0]);
const cases=[[true],[false],['TRUE'],['FALSE'],[''],['Y'],['O'],[null],['1'],['x']];
console.log('승인 판정:');
for(const [c] of cases) console.log('  ',JSON.stringify(c),'->',adRowApproved_(c));
console.log('\n모드별 목표 상태 (null = 손대지 않음):');
for(const m of ['ON','OFF','SYNC'])
  for(const ap of [true,false])
    console.log('  ',m,'승인='+ap,'->',adTargetState_(m,ap));
