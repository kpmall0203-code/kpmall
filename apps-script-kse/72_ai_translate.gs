/**
 * 상품명 번역 — Claude.
 *
 * 구글 번역은 브랜드·성분명을 통째로 음역하거나 조용히 실패해서 한국어가 비는 일이 있었다.
 * 통관 서류에 들어가는 이름이라 의미가 맞아야 해서 Claude 로 번역한다.
 *
 * 한 번에 묶어 보낸다 (기본 50개). 같은 상품명은 캐시로 한 번만 번역하고,
 * Claude 가 실패하면 구글 번역으로 넘긴다 — 번역이 아예 비는 것보다 낫다.
 */

var TITLE_TOOL = {
  name: 'report_titles',
  description: '상품명 번역 결과를 보고한다',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            ko: { type: 'string' },
            en: { type: 'string' }
          },
          required: ['id', 'ko', 'en'],
          additionalProperties: false
        }
      }
    },
    required: ['items'],
    additionalProperties: false
  }
};

function titlePrompt_() {
  return '당신은 한국 → 일본 소액 화물 수출 통관 서류를 만드는 담당자입니다. ' +
    '아마존 재팬 상품명(일본어·영어 섞임)을 받아 두 가지로 옮깁니다.\n\n' +
    '■ ko — 한국어 상품명 (수출신고용)\n' +
    '- 무엇인지 바로 알 수 있게 옮깁니다. 세관이 품목을 판단할 수 있어야 합니다.\n' +
    '- 브랜드명은 한국에서 쓰는 표기를 씁니다 (TAMBURINS → 탬버린즈, ' +
    'ROUND LAB → 라운드랩, VitaHEIM → 비타하임). 모르는 브랜드는 원문을 그대로 둡니다.\n' +
    '- 용량·수량·개수는 반드시 살립니다 (50ml, 30粒, 5個 → 5개, ×2 → 2개).\n' +
    '- **맨 뒤에 붙은 수량·세트를 특히 빠뜨리지 마십시오.** 상품명 끝의 「6個」「3個セット」' +
    '「10箱」 은 몇 개들이로 파는지를 말하는 자리라, 빠지면 통관 수량이 틀어집니다. ' +
    '앞의 용량과 뒤의 개수가 둘 다 있으면 둘 다 적습니다 (5g×10個入り … 6個 → 5g 10개입 6개).\n' +
    '- 일본어 상품명에 오타가 있어도 (ランンドリーユー) 뜻이 통하게 옮깁니다.\n' +
    '- **모르는 상품명을 비슷한 유명 상품으로 바꾸지 않습니다.** 가타카나 상품명은 소리대로 옮깁니다 ' +
    '(ビチョビ → 비쵸비. 오리온 과자라고 초코송이로 바꾸면 틀립니다).\n' +
    '- 항목에 terms 가 있으면 그 원문은 **반드시** 적힌 ko / en 표기로 옮깁니다 (사람이 정한 사전입니다).\n' +
    '- [並行輸入品] 같은 유통 표시는 뺍니다. 광고 문구도 뺍니다.\n' +
    '- 60자 안쪽. 문장이 아니라 품목명입니다. 길이를 맞추려고 수량·세트를 버리지 않습니다 — ' +
    '버릴 것은 광고 문구와 유통 표시입니다.\n\n' +
    '■ en — 통관용 영문명\n' +
    '- **영문·숫자·공백과 . _ - + ( ) / & % , : # 만** 씁니다. ' +
    '한글·한자·가나를 절대 넣지 않고, 대괄호 [ ] 와 따옴표도 쓰지 않습니다.\n' +
    '- 품목을 알 수 있는 일반명으로 씁니다 (Perfume 11ml, Vitamin C Tablets 20ea).\n' +
    '- 브랜드는 로마자 표기를 씁니다 (탬버린즈 → TAMBURINS).\n' +
    '- 60자 안쪽. 수량은 한국어와 같게 적습니다 (6ea, 3 boxes set).\n\n' +
    '■ 보기\n' +
    '입력: TAMBURINS タンバリンズ パフューム サマーテイルズ 11ml｜韓国コスメ [並行輸入品]\n' +
    '  ko: 탬버린즈 퍼퓸 서머테일즈 11ml\n' +
    '  en: TAMBURINS Perfume Summer Tales 11ml\n' +
    '입력: VitaHEIM ビタハイム マルチビタミン 発泡ビタミン（オレンジ味）20錠入り\n' +
    '  ko: 비타하임 멀티비타민 발포비타민 오렌지맛 20정\n' +
    '  en: VitaHEIM Multivitamin Effervescent Tablets 20ea\n' +
    '입력: ランンドリーユー ソフトボディグローブ クリーン 23ml 5個 [並行輸入品]\n' +
    '  ko: 런드리유 소프트 바디글러브 클린 23ml 5개\n' +
    '  en: Laundry You Soft Body Glove Clean 23ml 5ea\n' +
    '입력: オットゥギ ジンラーメン スティック 辛口 5g×10個入り 50g ラーメン 6個 [並行輸入品]\n' +
    '  ko: 오뚜기 진라면 스틱 매운맛 5g 10개입 50g 6개\n' +
    '  en: Ottogi Jin Ramen Stick Hot 5g 10ea 50g 6ea\n' +
    '입력: クリスタルライト ピンクレモネード 82g(13.6g×6袋) 3個セット｜粉末ドリンク [並行輸入品]\n' +
    '  ko: 크리스탈라이트 핑크레모네이드 82g 13.6g 6포 3개 세트\n' +
    '  en: Crystal Light Pink Lemonade 82g 13.6g 6packs 3ea set\n' +
    '입력: ビチョビ125g2箱 5個お菓子小包装 韓国ビスケット クッキー オリオン 韓国お土産  (terms: ビチョビ → 비쵸비 / Bichobi)\n' +
    '  ko: 오리온 비쵸비 125g 2박스 5개입 과자\n' +
    '  en: Orion Bichobi Biscuit 125g 2 Boxes 5ea\n\n' +
    '입력의 모든 항목에 id를 맞춰 하나씩 결과를 냅니다. 건너뛰지 않습니다.';
}

/**
 * 상품명 묶음 번역.
 * @param {Array} batch [{id, text}]
 * @return {Object} id → {ko, en}
 */
function titleBody_(batch, cfg, dict) {
  if (!dict) dict = dictList_();
  return {
    model: cfg.번역_모델 || 'claude-sonnet-5',
    // 번역은 판단이 아니라 변환이다. 생각을 길게 하면 느려지기만 한다.
    output_config: { effort: cfg.번역_effort || 'low' },
    max_tokens: 8000,
    system: titlePrompt_(),
    tools: [TITLE_TOOL],
    tool_choice: { type: 'tool', name: 'report_titles' },
    messages: [{
      role: 'user',
      content: JSON.stringify(batch.map(function (b) {
        // 반각 가타카나(ﾋﾞﾁｮﾋﾞ)는 전각으로 펼쳐 보낸다 — 모델이 잘못 읽는 일이 줄어든다
        var name = b.text;
        try { name = name.normalize('NFKC'); } catch (e) { /* 그대로 */ }
        var item = { id: b.id, name: name };
        var hits = dictHits_(b.text, dict);
        if (hits.length) {
          item.terms = hits.map(function (d) { return { src: d.src, ko: d.ko, en: d.en }; });
        }
        return item;
      }))
    }]
  };
}

function aiTranslateBatch_(batch, cfg) {
  var items = aiItems_(titleBody_(batch, cfg), 'report_titles', '상품명번역');
  var out = {};
  items.forEach(function (r) {
    if (r && r.id !== undefined) out[r.id] = { ko: String(r.ko || ''), en: String(r.en || '') };
  });
  return out;
}

/**
 * 상품명 여러 개를 한꺼번에 번역한다.
 *
 * 캐시에 있는 것은 건너뛰고, 없는 것만 배치로 묶어 Claude 에 보낸다.
 * Claude 가 실패하거나 결과가 빠진 것은 구글 번역으로 메운다.
 *
 * @param {string[]} texts 원문 상품명 (중복 있어도 된다)
 * @return {{map: Object, ai: number, google: number, error: string}}
 *         map: 원문 → {ko, en}
 */
function translateMany_(texts, cfg) {
  cfg = cfg || getConfig();
  var useAi = String(cfg.번역_엔진 || 'Claude').trim().toLowerCase() !== '구글' &&
    String(cfg.번역_엔진 || 'Claude').trim() !== 'google';

  // 중복을 없앤다
  var uniq = [];
  var seen = {};
  texts.forEach(function (t) {
    var s = String(t == null ? '' : t).trim();
    if (!s || seen[s]) return;
    seen[s] = true;
    uniq.push(s);
  });

  var map = {};
  var todo = [];
  uniq.forEach(function (s) {
    var hit = _trCache['ai ' + s];
    if (hit) { map[s] = hit; return; }
    todo.push(s);
  });

  var aiCount = 0;
  var gCount = 0;
  var error = '';

  if (useAi && todo.length && aiKeyName_()) {
    var size = Math.max(1, parseInt(cfg.번역_배치크기, 10) || 25);
    var batches = chunk_(todo.map(function (s, i) { return { id: i, text: s }; }), size);

    // 묶음을 한꺼번에 병렬로 보낸다 — 배치 수만큼 기다리지 않는다
    var dict = dictList_();
    var results = aiItemsAll_(batches.map(function (batch) {
      return titleBody_(batch, cfg, dict);
    }), '상품명번역');

    var ngBatch = 0;
    results.forEach(function (res, b) {
      if (res.error) {
        ngBatch++;
        if (!error) error = '번역 묶음 ' + (b + 1) + '/' + batches.length + ' 실패 — ' + res.error;
        return;                      // 이 묶음은 구글 번역이 메운다
      }
      var got = {};
      res.items.forEach(function (x) {
        if (x && x.id !== undefined) got[x.id] = x;
      });
      batches[b].forEach(function (item) {
        var r = got[item.id];
        if (!r || !r.ko) return;
        // 통관영문명은 영문·숫자만 받는다 — 안 되는 글자만 떼어낸다
        var en = isAsciiSafe_(r.en) ? r.en : asciiClean_(r.en);
        // 모델이 뒤쪽 수량을 빠뜨렸으면 되살린다 (73_qty.gs)
        map[item.text] = {
          ko: keepQty_(item.text, String(r.ko), 'ko'),
          en: keepQty_(item.text, en, 'en')
        };
        _trCache['ai ' + item.text] = map[item.text];
        aiCount++;
      });
    });
    if (ngBatch > 1) error += ' (실패 ' + ngBatch + '묶음)';
    if (error) log_('상품명번역', error);
  } else if (useAi && todo.length && !aiKeyName_()) {
    error = 'AI 키가 없어 구글 번역으로 했습니다 (설정 > AI 키 점검)';
  }

  // 남은 것은 구글 번역.
  // 구글은 상품명마다 따로 부르고 실패하면 쉬었다 다시 하므로 느리다.
  // 오래 붙잡고 있으면 Apps Script 실행 시간을 다 써버리니 예산을 둔다.
  var budget = Math.max(5, num_(cfg.번역_폴백제한초, 90)) * 1000;
  var t0 = Date.now();
  var skipped = 0;
  todo.forEach(function (s) {
    if (map[s]) return;
    if (Date.now() - t0 > budget) { skipped++; return; }
    var tr = translateTitle_(s);
    if (tr.ko) {
      tr = { ko: keepQty_(s, tr.ko, 'ko'), en: keepQty_(s, tr.en, 'en') };
      map[s] = tr;
      _trCache['ai ' + s] = tr;
      gCount++;
    }
  });
  if (skipped) {
    var msg = '시간이 걸려 ' + skipped + '개는 번역하지 않았습니다 — ' +
      '[정리 > 번역 채우기] 로 나중에 채우세요';
    error = error ? error + ' / ' + msg : msg;
    log_('상품명번역', msg);
  }

  return { map: map, ai: aiCount, google: gCount, error: error };
}

/** 번역 테스트 — 샘플 상품명 몇 개를 실제로 번역해 보여준다 */
function 번역_테스트() {
  var ui = SpreadsheetApp.getUi();
  var cfg = getConfig();
  var samples = [
    'TAMBURINS タンバリンズ パフューム サマーテイルズ 11ml｜韓国コスメ [並行輸入品]',
    'VitaHEIM ビタハイム マルチビタミン 発泡ビタミン（オレンジ味）20錠入り',
    'ランンドリーユー ソフトボディグローブ クリーン 23ml 5個 [並行輸入品]',
    'ROUND LAB 1025 独島アンプル/低分子/保湿アンプル 45g クリア',
    'オレオ ホットク味 300g(50g×6袋) 韓国お菓子 BTSデザインパッケージ',
    'オットゥギ ジンラーメン スティック 辛口 5g×10個入り 50g ラーメン 6個 [並行輸入品]'
  ];

  _trCache = {};
  var r;
  try {
    r = translateMany_(samples, cfg);
  } catch (e) {
    ui.alert('번역 테스트 실패\n\n' + e);
    return;
  }

  var lines = samples.map(function (s) {
    var t = r.map[s] || {};
    return '  ' + s.slice(0, 42) + '\n      ko: ' + (t.ko || '(없음)') +
      '\n      en: ' + (t.en || '(없음)');
  });

  ui.alert('번역 테스트\n\n' +
    '엔진   : ' + (cfg.번역_엔진 || 'Claude') + '\n' +
    '모델   : ' + (cfg.번역_모델 || 'claude-sonnet-5') + '\n' +
    '배치   : ' + (cfg.번역_배치크기 || '50') + '개씩\n' +
    'AI ' + r.ai + '건 / 구글 ' + r.google + '건\n\n' +
    lines.join('\n') +
    (r.error ? '\n\n' + r.error : '') +
    '\n\n토큰 사용량은 [' + SHEET_LOG + '] 시트에 남았습니다.');
}
