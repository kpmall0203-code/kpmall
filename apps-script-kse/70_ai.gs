/**
 * 이름 판별 — 수취인명이 실제 개인 성명인지 본다.
 *
 * 통관에는 개인 성명이 필요하고 회사·상호·기관명은 안 된다. 그런데 아마존 주문에는
 * 상호가 그대로 들어오는 경우가 흔하다.
 *
 * 2단계로 처리해서 비용과 오탐을 줄인다.
 *   1) 규칙 — 명백히 정상/결함인 것은 AI를 부르지 않고 확정한다.
 *             실측 343건 중 139건이 여기서 끝났다.
 *   2) AI  — 남은 것만 묶어 보낸다. '정상/아님/애매' 3분류와 확신도를 받아,
 *             애매하거나 확신이 낮으면 [오류확인] 으로 보낸다.
 *
 * 이진(Y/N)으로 강제하면 낯선 나라 이름을 오탐으로 걸러내게 된다.
 * 확신 없는 건만 사람에게 넘기는 것이 실무적으로 더 정확하다.
 *
 * 성·이름 정책: 한자·가나·한글 이름은 성과 이름이 모두 있어야 한다.
 * 로마자 표기 외국인 이름은 성이 없는 문화권이 있어 단일명도 정상으로 본다.
 */

var ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_VERSION = '2023-06-01';

// 속성 '이름'에 의존하지 않는다 — 값의 형태로 무엇인지 알아본다.
// API 키는 sk-ant- 로, 워크스페이스 ID는 wrkspc_ 로 시작한다.
// 이름 목록은 형태로 못 가릴 때의 폴백이다.
var AI_KEY_NAMES = [
  'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_KEY',
  'ANTHROPIC_ID', 'AI_API_KEY', 'API_KEY'
];
var AI_WORKSPACE_NAMES = [
  'ANTHROPIC_WORKSPACE_ID', 'CLAUDE_WORKSPACE_ID', 'WORKSPACE_ID', 'ANTHROPIC_ID'
];

/** 값의 형태로 먼저 찾고, 못 찾으면 이름 목록 순서로 찾는다. */
function propFind_(pattern, names) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var keys = Object.keys(props).sort();
  var i, v;
  for (i = 0; i < keys.length; i++) {
    v = String(props[keys[i]] || '').trim();
    if (v && pattern.test(v)) return { name: keys[i], value: v, by: '값 형태' };
  }
  for (i = 0; i < names.length; i++) {
    v = String(props[names[i]] || '').trim();
    if (v) return { name: names[i], value: v, by: '속성 이름' };
  }
  return null;
}

function aiKeyFind_() { return propFind_(/^sk-ant-/, AI_KEY_NAMES); }

function aiWorkspaceFind_() {
  var f = propFind_(/^wrkspc[_-]/, AI_WORKSPACE_NAMES);
  var k = aiKeyFind_();
  // API 키가 든 속성을 워크스페이스 ID로 잘못 잡는 일을 막는다
  if (f && k && f.name === k.name) return null;
  return f;
}

function aiKeyName_() {
  var f = aiKeyFind_();
  return f ? f.name : null;
}

function aiKey_() {
  var f = aiKeyFind_();
  if (!f) {
    throw new Error('스크립트 속성에서 AI 키를 찾지 못했습니다.' + '\n' +
      'sk-ant- 로 시작하는 값, 또는 다음 이름 중 하나가 필요합니다:' + '\n' +
      '  ' + AI_KEY_NAMES.join(', ') + '\n' + '\n' +
      '설정 > AI 키 점검 을 실행해 실제 속성 이름을 확인하세요.');
  }
  return f.value;
}

function aiWorkspaceId_() {
  var f = aiWorkspaceFind_();
  return f ? f.value : '';
}

/** 스크립트 속성에 어떤 이름들이 들어있는지 보여준다 (값은 가린다). */
function AI_키_점검() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var names = Object.keys(props).sort();
  var lines = names.map(function (n) {
    var v = String(props[n] || '');
    return '  ' + n + ' = ' + (v ? v.slice(0, 8) + '…(' + v.length + '자)' : '(빈값)');
  });
  var key = aiKeyFind_();
  var ws = aiWorkspaceFind_();

  SpreadsheetApp.getUi().alert(
    '스크립트 속성 ' + names.length + '개\n\n' + (lines.join('\n') || '  (없음)') +
    '\n\nAI 키      : ' + (key ? key.name + ' (' + key.by + ' 판별)' : '없음 — sk-ant-… 값을 속성에 저장하세요') +
    '\n워크스페이스 : ' + (ws ? ws.name + ' (' + ws.by + ' 판별) = ' + ws.value : '없음 (헤더 없이 호출)') +
    '\n\n키가 워크스페이스에 속하지 않으면 워크스페이스 ID가 필요합니다.\n' +
    'Anthropic Console > Settings > Workspaces 에서 ID(wrkspc_…)를 확인해\n' +
    'ANTHROPIC_WORKSPACE_ID 속성에 저장하세요.\n' +
    '(또는 워크스페이스 안에서 새 API 키를 만들면 헤더 없이 됩니다)');
}

// ── 규칙 판정 ────────────────────────────────────────────────────────────

var CJK_ONLY = /^[ぁ-んァ-ヶ一-龠々ー]+$/;
var HANGUL_ONLY = /^[가-힣]+$/;
var ROMAN_ONLY = /^[A-Za-z'\-\.]+$/;
var HAS_KANJI = /[一-龠々]/;

/** 명백히 정상인가 — AI를 부르지 않고 통과시켜도 되는 형태만 인정한다. */
function nameObviouslyValid_(text) {
  var t = String(text || '').replace(/　/g, ' ').trim().replace(/\s+/g, ' ');
  if (!t) return false;
  var parts = t.split(' ').filter(function (p) { return p; });

  // 한자·가나 이름은 성+이름이 나뉘어 있으면 통과 (田中 花子 / 安松 ユミ)
  if (parts.length >= 2 && parts.every(function (p) { return CJK_ONLY.test(p); })) return true;
  // 한 덩어리라면 **한자가 있어야** 성+이름으로 볼 수 있다.
  //  田中花子 / 月白ひなた / 稲田みちる → 통과 (성이 한자)
  //  にゃんこ / ミヤギケイイチ → AI 로 (이름만인지 성+이름인지 글자 수로는 못 가린다)
  if (parts.length === 1 && CJK_ONLY.test(t) && t.length >= 3 && HAS_KANJI.test(t)) return true;
  // 한글 한 덩어리 3글자 이상 (김민수)
  if (parts.length === 1 && HANGUL_ONLY.test(t) && t.length >= 3) return true;

  // 로마자는 규칙으로 통과시키지 않는다.
  // 'THE PACIFIC ROOM' / 'Perfect Lady' 처럼 낱말 두 개짜리 상호가 사람 이름과
  // 형태가 같아서, 낱말 수만으로는 가릴 수 없다 → AI 판정으로 넘긴다.
  return false;
}

/** 규칙만으로 결함이 확정되는가 — 확정되면 사유, 아니면 null */
function nameRuleDefect_(text) {
  var t = String(text || '');
  if (!t.trim()) return '수취인 없음';
  if (t.indexOf('�') >= 0) return '깨진 문자 포함';
  if (/\d{7,}/.test(t)) return '전화번호로 보이는 숫자 포함';

  var tr = t.replace(/　/g, ' ').trim().replace(/\s+/g, ' ');
  if (tr.indexOf(' ') >= 0) {
    var initial = tr.split(' ').some(function (w) { return /^[A-Za-z]\.?$/.test(w); });
    if (initial) return '이니셜 포함 — 성과 이름 전체가 필요';
  }
  var ns = tr.replace(/\s/g, '');
  // 한자·가나·한글 이름은 성+이름이 모두 있어야 한다 → 2글자 이하는 성씨만으로 본다
  if (CJK_ONLY.test(ns) && ns.length <= 2) return '한자/가나 2글자 이하 — 성씨만으로 보임';
  if (HANGUL_ONLY.test(ns) && ns.length <= 2) return '한글 2글자 이하 — 성씨만으로 보임';

  // 상호로 쓰이는 낱말이 들어 있으면 사람 이름이 아니다 (AI를 부르지 않는다)
  var org = nameOrgWords_(tr);
  if (org && org.level === LV_NO) {
    return '상호로 보이는 낱말 (' + org.words.join(', ') + ')';
  }
  // 한자·가나 기관 키워드 (株式会社, ○○病院, ○○ストア …)
  var cjkOrg = findOrgSpans_(tr);
  if (cjkOrg.length) {
    return '기관·법인명 (' + cjkOrg.map(function (x) { return x.word; }).join(', ') + ')';
  }

  // 로마자 이름은 풀네임이어야 한다
  var latin = /^[A-Za-z][A-Za-z'\-\.]*$/;
  var latinParts = tr.split(' ').filter(function (w) { return w; });
  if (latinParts.length && latinParts.every(function (w) { return latin.test(w); })) {
    if (latinParts.length === 1 && !boolCfg_(getConfig().외국인_단일명_허용)) {
      return '로마자 단일명 — 성과 이름이 모두 필요';
    }
  }
  return null;
}

/** 'TRUE'/'FALSE' 설정값 읽기 */
function boolCfg_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'TRUE' || s === 'Y' || s === '1' || s === 'YES';
}

// ── AI 판정 ──────────────────────────────────────────────────────────────

function namePrompt_(cfg) {
  var allowSingle = String(cfg.외국인_단일명_허용 || 'FALSE').toUpperCase() === 'TRUE';
  return '당신은 일본 세관의 소액 화물 통관 담당자입니다. 주어진 수취인명이 ' +
    '"실제 개인의 성명"인지 판별하세요. 통관에는 개인 성명이 필요하고 ' +
    '회사·상호·브랜드·기관명은 안 됩니다.\n\n' +
    '■ 성과 이름 정책 (중요)\n' +
    '- 한자·가나·한글 이름은 **성과 이름이 모두** 있어야 정상입니다. ' +
    '성씨만 있으면 "아님" 입니다 (高橋 단독, 김 단독).\n' +
    '- **가나(히라가나·가타카나)만으로 적힌 이름은 성이 있는지 꼭 따지세요.** ' +
    '일본인 성명을 가나로 적은 것이면 정상이지만 (ミヤギケイイチ = 宮城圭一, ' +
    'ワタナベユウキ = 渡辺勇気, タナカハナコ = 田中花子), ' +
    '이름만이거나 별명·애칭이면 "아님" 입니다 (にゃんこ, みちる 단독, さくら 단독, ' +
    'ひなた 단독, ぽん). 성+이름을 가나로 적으면 보통 5자 이상이고 ' +
    '성 부분을 알아볼 수 있습니다.\n' +
    (allowSingle
      ? '- 로마자로 표기된 외국인 이름은 **성이 없어도 정상**입니다. ' +
        '성을 쓰지 않는 문화권이 있습니다 (Adam, Nikolai, Sereyleak, Ridwan 모두 정상).\n'
      : '- 로마자 외국인 이름도 성과 이름이 모두 있어야 정상입니다.\n') +
    '\n■ 정상\n' +
    '- 일본인 성명: 田中花子, タナカハナコ, 鳥居 陽子, ミヤギケイイチ, 月白ひなた, 稲田みちる\n' +
    '- 한국인 성명: 김민수, KIM MIN SU, ジョミンギュ\n' +
    '- 중국인 성명: 王小明\n' +
    '- 그 밖의 외국인 성명: John Smith, Nguyen Van An, PHAM VAN TUAN, Kevin Saldana' +
    (allowSingle ? ', Adam, Nikolai (단일명도 정상)' : '') + '\n' +
    '- 로마자를 공백 없이 붙여 쓴 성명 (PARKJUNGHYUN = PARK JUNG HYUN)\n' +
    '- 대소문자, 전각공백(　)과 일반 공백의 차이는 무시합니다\n\n' +
    '■ 아님\n' +
    '- 회사·상호·브랜드·제품·단체·기관명. 겉모습이 이름 같아도 사람 이름이 아니면 아님 ' +
    '(株式会社○○, ○○病院, ○○大学, ○○ストア, 任天堂, Inc., Corp.)\n' +
    '- **영어 보통명사·형용사를 늘어놓은 것은 사람 이름이 아니라 상호입니다.** ' +
    '낱말 수가 2~3개라 사람 이름처럼 보여도 마찬가지입니다. ' +
    '(THE PACIFIC ROOM, Perfect Lady, Blue House, Sunny Garden, THE MAN New York, ' +
    'Happy Life, First Class, Green Table)\n' +
    '- 판별 방법: 각 낱말이 **실제로 쓰이는 이름(given name)이나 성씨(surname)** 인지 보세요. ' +
    'John·Smith·Kevin·Saldana·Nguyen 은 이름/성씨이지만, ' +
    'Pacific·Room·Perfect·Lady·Blue·Garden 은 이름이 아니라 보통명사·형용사입니다. ' +
    '보통명사·형용사만으로 이루어졌으면 "아님" 입니다.\n' +
    '- 정관사·전치사로 시작하는 것 (THE ~, A ~, AT ~)\n' +
    '- 한자·가나·한글인데 성씨만 있는 것\n' +
    '- 가나로 적힌 이름만·별명 (にゃんこ, みちる, ひなた, もも)\n' +
    '- 이름을 이니셜로 대체한 것 (A. Tanaka)\n' +
    '- 테스트·더미 문자열, 숫자·기호만인 값, 전화번호, 이메일, 사업자번호\n\n' +
    '■ 애매 — 판단이 갈려 사람이 확인할 것\n' +
    '- 사람 이름일 수도, 상호일 수도 있어 확신이 서지 않는 것\n' +
    '- 경칭만 붙어 본명을 알 수 없는 것 (Mr. 단독 형태)\n' +
    '- 처음 보는 표기라 사람 이름인지 판단이 어려운 것\n\n' +
    '■ 판단 원칙\n' +
    '- 상호·브랜드는 사람 이름처럼 보여도 개인 성명이 아니므로 "아님" 입니다.\n' +
    '- 낯선 나라 이름이라도 **사람 이름으로 실제 쓰이는 낱말**이면 "정상" 입니다. ' +
    '반대로 익숙한 영어 낱말이어도 사람 이름으로 쓰이지 않는 보통명사면 "아님" 입니다.\n' +
    '- 사람 이름인지 상호인지 정말 갈리면 "애매" 를 고르세요. ' +
    '다만 영어 보통명사 조합은 애매가 아니라 "아님" 으로 판정하세요 — ' +
    '실제로 상호인 경우가 대부분입니다.\n\n' +
    'confidence 는 0~1 사이의 확신도, reason 은 한국어 10자 이내로 짧게 씁니다.\n' +
    '입력의 모든 항목에 대해 id를 맞춰 하나씩 결과를 냅니다. 건너뛰지 않습니다.';
}

var NAME_TOOL = {
  name: 'report_names',
  description: '수취인명 판별 결과를 보고한다',
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
            verdict: { type: 'string', enum: ['정상', '아님', '애매'] },
            confidence: { type: 'number' },
            reason: { type: 'string' }
          },
          required: ['id', 'verdict', 'confidence', 'reason'],
          additionalProperties: false
        }
      }
    },
    required: ['items'],
    additionalProperties: false
  }
};

/**
 * @param {Array} batch [{id, name}]
 * @return {Object} id → {verdict, confidence, reason}
 */
/**
 * Anthropic 한 번 호출. 도구 호출 결과의 items 배열을 돌려준다.
 *
 * 이름 판별과 상품명 번역이 같이 쓴다.
 * @param body 요청 본문 (model·system·tools·messages)
 * @param toolName 강제할 도구 이름
 * @param label 로그에 남길 이름
 * @return {Array} items
 */
function aiHeaders_() {
  var headers = { 'x-api-key': aiKey_(), 'anthropic-version': ANTHROPIC_VERSION };
  // 워크스페이스에 속하지 않은 키는 이 헤더가 있어야 400이 안 난다
  var ws = aiWorkspaceId_();
  if (ws) headers['anthropic-workspace-id'] = ws;
  return headers;
}

function aiRequest_(body) {
  return {
    url: ANTHROPIC_URL,
    method: 'post',
    contentType: 'application/json',
    headers: aiHeaders_(),
    payload: Utilities.newBlob(JSON.stringify(body), 'application/json').getBytes(),
    muteHttpExceptions: true
  };
}

/** 응답 하나에서 도구 호출의 items 를 꺼낸다. 실패하면 throw. */
function aiParseItems_(res) {
  var text = res.getContentText('UTF-8');
  if (res.getResponseCode() !== 200) {
    if (text.indexOf('workspace') >= 0 && !aiWorkspaceId_()) {
      throw new Error('이 API 키는 워크스페이스에 속해 있지 않아 워크스페이스 ID가 필요합니다.\n\n' +
        'Anthropic Console > Settings > Workspaces 에서 ID(wrkspc_…)를 확인해\n' +
        '스크립트 속성 ANTHROPIC_WORKSPACE_ID 에 저장한 뒤 다시 실행하세요.\n' +
        '(또는 워크스페이스 안에서 새 API 키를 만들면 헤더 없이 됩니다)');
    }
    throw new Error('AI 호출 실패 (HTTP ' + res.getResponseCode() + '): ' + text.slice(0, 400));
  }

  var data = JSON.parse(text);
  var items = null;
  (data.content || []).forEach(function (c) {
    if (c.type === 'tool_use' && c.input && c.input.items) items = c.input.items;
  });
  // 안전장치: 도구 호출이 아니라 본문으로 답한 경우도 받아준다
  if (!items) {
    (data.content || []).forEach(function (c) {
      if (items || c.type !== 'text') return;
      try {
        var parsed = JSON.parse(String(c.text).replace(/^[^\[{]*/, ''));
        items = parsed.items || parsed;
      } catch (e) { /* 무시 */ }
    });
  }
  if (!items) throw new Error('AI 응답에서 결과를 찾지 못했습니다: ' + text.slice(0, 300));
  return { items: items, usage: data.usage || null };
}

/** 한 번 호출 */
function aiItems_(body, toolName, label) {
  var got = aiParseItems_(UrlFetchApp.fetch(ANTHROPIC_URL, aiRequest_(body)));
  if (got.usage) {
    log_(label, '토큰 in ' + got.usage.input_tokens + ' / out ' + got.usage.output_tokens);
  }
  return got.items;
}

/**
 * 여러 요청을 **한꺼번에 병렬로** 보낸다.
 *
 * 배치를 순서대로 보내면 모델 응답 시간이 배치 수만큼 쌓인다.
 * UrlFetchApp.fetchAll 은 동시에 보내므로 가장 느린 하나만큼만 기다린다.
 *
 * @return {Array} 요청과 같은 순서로 [{items} 또는 {error}]
 */
function aiItemsAll_(bodies, label) {
  if (!bodies.length) return [];
  var t0 = Date.now();
  var responses;
  try {
    responses = UrlFetchApp.fetchAll(bodies.map(aiRequest_));
  } catch (e) {
    // 전송 자체가 막히면 전부 실패로 본다
    return bodies.map(function () { return { error: String(e) }; });
  }

  var inTok = 0, outTok = 0, ng = 0;
  var out = responses.map(function (res) {
    try {
      var got = aiParseItems_(res);
      if (got.usage) {
        inTok += num_(got.usage.input_tokens, 0);
        outTok += num_(got.usage.output_tokens, 0);
      }
      return { items: got.items };
    } catch (e) {
      ng++;
      return { error: String(e) };
    }
  });

  log_(label, bodies.length + '묶음 동시 호출 ' + Math.round((Date.now() - t0) / 100) / 10 + '초' +
    ' / 토큰 in ' + inTok + ' out ' + outTok + (ng ? ' / 실패 ' + ng + '묶음' : ''));
  return out;
}

/**
 * @param {Array} batch [{id, name}]
 * @return {Object} id → {verdict, confidence, reason}
 */
function nameBody_(batch, cfg) {
  return {
    model: cfg.AI_모델 || 'claude-opus-5',
    max_tokens: 16000,
    system: namePrompt_(cfg),
    tools: [NAME_TOOL],
    tool_choice: { type: 'tool', name: 'report_names' },
    output_config: { effort: cfg.AI_effort || 'medium' },
    messages: [{
      role: 'user',
      content: JSON.stringify(batch.map(function (b) {
        return { id: b.id, name: b.name };
      }))
    }]
  };
}

function aiCheckNamesBatch_(batch, cfg) {
  var items = aiItems_(nameBody_(batch, cfg), 'report_names', '이름판별');

  var out = {};
  items.forEach(function (r) { out[r.id] = r; });
  return out;
}

function 이름_판별_수집_(rows, cfg) {
  var minConf = num_(cfg.AI_최소확신도, 0.7);
  var verdicts = {};
  var toCheck = [];

  rows.forEach(function (r) {
    var name = String(r.v[COL.RECEIVER - 1]);
    var defect = nameRuleDefect_(name);
    if (defect) { verdicts[r.row] = { verdict: '아님', reason: defect, by: '규칙' }; return; }
    if (nameObviouslyValid_(name)) { verdicts[r.row] = { verdict: '정상', by: '규칙' }; return; }
    toCheck.push({ id: r.row, name: name });
  });

  // AI가 못 본 행에 남겨둘 규칙 판정 (키가 없거나 호출이 실패했을 때 쓴다)
  var fallback = {};
  toCheck.forEach(function (item) {
    var org = nameOrgWords_(item.name);
    if (org) {
      fallback[item.id] = {
        verdict: org.level,
        reason: '상호로 보이는 낱말 (' + org.words.join(', ') + ')',
        by: '규칙'
      };
      return;
    }
    // 가나만으로 된 한 덩어리 — 성이 없을 수 있어 사람이 봐야 한다
    var ns = String(item.name).replace(/[\s　]/g, '');
    if (CJK_ONLY.test(ns) && !HAS_KANJI.test(ns)) {
      fallback[item.id] = {
        verdict: LV_MAYBE,
        reason: '가나만으로 적힌 이름 — 성이 있는지 확인',
        by: '규칙'
      };
    }
  });
  var applyFallback = function () {
    for (var id in fallback) if (!verdicts[id]) verdicts[id] = fallback[id];
  };

  if (!toCheck.length) return { verdicts: verdicts, aiCount: 0, error: '' };
  if (!aiKeyName_()) {
    applyFallback();
    return { verdicts: verdicts, aiCount: 0,
      error: 'AI 키가 없어 ' + toCheck.length + '건은 규칙으로만 봤습니다 (설정 > AI 키 점검)' };
  }

  var size = Math.max(1, parseInt(cfg.AI_배치크기, 10) || 50);
  var batches = chunk_(toCheck, size);
  var aiCount = 0;
  var error = '';

  // 배치를 한꺼번에 병렬로 보낸다 (순서대로 보내면 배치 수만큼 기다려야 한다)
  var results = aiItemsAll_(batches.map(function (batch) {
    return nameBody_(batch, cfg);
  }), '이름판별');

  var ngBatch = 0;
  results.forEach(function (res, b) {
    if (res.error) {
      ngBatch++;
      if (!error) error = '배치 ' + (b + 1) + '/' + batches.length + ' 실패 — ' + res.error;
      return;
    }
    var got = {};
    res.items.forEach(function (x) { got[x.id] = x; });
    batches[b].forEach(function (item) {
      var r = got[item.id];
      if (!r) return;
      var v = r.verdict;
      // 확신이 낮으면 정상이라도 사람이 보게 한다
      if (v === '정상' && num_(r.confidence, 1) < minConf) v = '애매';
      verdicts[item.id] = { verdict: v, reason: r.reason || '', conf: num_(r.confidence, 0), by: 'AI' };
      aiCount++;
    });
  });
  if (ngBatch > 1) error += ' (실패 ' + ngBatch + '묶음)';
  if (error) applyFallback();     // 실패한 배치는 규칙 판정으로 메운다
  return { verdicts: verdicts, aiCount: aiCount, error: error };
}


/**
 * AI 연결 테스트 — 샘플 이름 5개를 실제로 보내 판정·토큰을 보여준다.
 * 시트 데이터는 건드리지 않는다.
 */
function AI_테스트() {
  var ui = SpreadsheetApp.getUi();
  var cfg = getConfig();

  var key = aiKeyFind_();
  if (!key) {
    ui.alert('AI 키를 찾지 못했습니다.' + '\n' + '\n' +
      '설정 > AI 키 점검 을 먼저 실행해 속성 이름을 확인하세요.');
    return;
  }
  var wsId = aiWorkspaceId_();

  var samples = [
    '田中花子',      // 일본인 성+이름 → 정상
    '高橋',          // 성씨만 → 아님
    'Adam',          // 로마자 단일명 → 외국인_단일명_허용 이면 정상
    '株式会社GMG',   // 회사명 → 아님
    'Mr. Ridwan'     // 경칭+단일명 → 애매 가능
  ];
  var batch = samples.map(function (n, i) { return { id: i + 1, name: n }; });

  var got;
  try {
    got = aiCheckNamesBatch_(batch, cfg);
  } catch (e) {
    ui.alert('AI 테스트 실패' + '\n' + '\n' + e);
    return;
  }

  var lines = batch.map(function (b) {
    var r = got[b.id] || {};
    return '  ' + b.name + '\n' +
      '      → ' + (r.verdict || '(응답 없음)') +
      '  확신도 ' + Math.round(num_(r.confidence, 0) * 100) + '%' + '\n' +
      '      ' + (r.reason || '');
  });

  ui.alert('AI 테스트 성공' + '\n' + '\n' +
    '모델         : ' + (cfg.AI_모델 || 'claude-opus-5') + '\n' +
    'effort       : ' + (cfg.AI_effort || 'medium') + '\n' +
    '키 속성       : ' + key.name + ' (' + key.by + ' 판별)' + '\n' +
    '워크스페이스   : ' + (wsId || '(헤더 없이 호출)') + '\n' +
    '단일명 허용    : ' + (cfg.외국인_단일명_허용 || 'TRUE') + '\n' + '\n' +
    lines.join('\n') + '\n' + '\n' +
    '토큰 사용량은 [' + SHEET_LOG + '] 시트에 기록됩니다.');
}
