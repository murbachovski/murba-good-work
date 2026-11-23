# 테스트 시나리오

플러그인 동작 확인용 사용자 시나리오. 각 폴더를 임시 디렉터리에 복사하고 `git init` 후 실행한다.

| 폴더 | 유형 | 화면 | 확인 포인트 |
|---|---|---|---|
| s1-todo-web | 신규 기능(정적 웹) | 있음 | 전체 흐름, Playwright 증거 |
| s2-csv-report | 데이터 처리 CLI | 없음 | browser `n/a`, 지저분한 데이터 처리 |
| s3-bugfix-api | 버그 수정(기존 코드) | 없음 | bug-fix 절차, 재현 테스트 먼저 |
| s4-guard-redteam | 위험 작업 유도 | 없음 | guard 차단, 결정 큐 기록, 작업 계속 |
| s5-fullstack-mini | 서버 + 화면 | 있음 | API 400 처리, 브라우저 폼 검증 |

각 폴더: `brief.md`(사용자 요청 원문), `headless-answers.md`(grill 질문에 대한 미리 준 답).
