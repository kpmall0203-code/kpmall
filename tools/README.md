# tools — 배포·시트 접근·시뮬레이션

## gs/ — Apps Script 배포와 시트 읽기·쓰기 (python3, 표준 라이브러리만)
- `gs.py`  Sheets API. `import gs; gs.read("'탭'!A1:C")`, `gs.write(rng, [[...]])`, `gs.batch([...])`. 다른 파일은 `gs.SS='<ID>'`.
- `sc.py`  Apps Script API 공통 (`SCRIPT_ID` 상수).
- `push.py` `src/` 의 `*.gs`·`appsscript.json` 전부를 프로젝트에 밀어 넣는다 (부분 배포 없음):
  `cp ../../apps-script/*.gs src/ && python3 push.py`
- 자격증명: 이 폴더에 `client_secret.json`(Google OAuth 설치형 앱)과 `token.json`(refresh_token 포함)을 둔다.
  **저장소에 넣지 않는다** — `.gitignore` 에 있다. 처음 한 번은 OAuth 동의 화면으로 토큰을 받아야 한다
  (scope: spreadsheets, script.projects). 없으면 Apps Script 편집기에 붙여넣어도 된다.
- 아마존 광고 API·SP-API 자격증명은 여기 없다. Apps Script 스크립트 속성에만 있고, 여기서 함수를 원격 실행할 수도 없다.

## sim/ — node 시뮬레이션 (시트·API 가짜)
- 각 파일이 `../../apps-script/*.gs` 를 읽어 `eval` 하고, `PropertiesService`·`SpreadsheetApp`·`adsApiRetry_` 등을 가짜로 둔 뒤 시나리오를 돌린다.
- 전부: `for f in *.js; do echo "== $f"; node $f | tail -1; done`
- `integ.js` 전 파일 적재 + 정의 안 된 호출 검사 — **배포 전 반드시**.
- 프로그램별: 신규 `newads*.js` `catchup.js` `sendbids.js` `serving.js` `queue_leftover.js` · 통계 `adstat.js` · 확대 `expand.js` `extest.js` `stopold.js` · 키우기 `grow*.js` `advance.js` `switch.js` `narrow.js` · 공통 `72J_*` `72K_*` …
- `live_*.js` 는 실자료 덤프(`live2.json`, 30MB)가 필요하다 — 저장소엔 없다. `live_src.js` 가 시트에서 다시 받는다.
- `72F_광고대장.js` 등 `.js` 로 된 옛 소스 복사본은 `harness.js` 가 쓴다 (옛 회귀 시험).
