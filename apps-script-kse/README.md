# apps-script-kse — 「아마존 KSE Shipnergy 자동 등록」 시트 보조 스크립트

시트: https://docs.google.com/spreadsheets/d/19aNRTYILqu6VWgtEb7fN-g0PCFXH0FPP5Lp__U-NK_4
(바인딩 스크립트 원본은 Apps Script 편집기에 있고, 이 폴더는 추가·수정분의 기록용이다.)

- `99_우편번호보정.gs` — 0으로 시작하는 우편번호·전화번호가 숫자로 바뀌어 앞 0이 잘리는 문제.
  파일을 편집기에 새 파일로 붙여넣고 `fixZipAndTelColumns` 를 한 번 실행하면 기존 행이 복구된다.
  파일 머리말의 "붙이는 곳" 대로 `zipJP_` · `protectTextColumns_` 를 기존 코드에 연결하면 재발하지 않는다.
