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

## 대량 테스트 (tasks.json + seeds/)
- `tasks.json`: 과제 100개(기능·버그·리팩터·조사·성능·프로토타입, 데이터·위험 유도 포함). 필드: id, title, task_type, seed, browser, risk, brief, answers, expect
- `seeds/`: 과제용 작은 시작 프로젝트(버그 시드는 실제 재현되는 버그 포함)
- 실행: `node scenarios/harness/run.mjs --out <dir> --range 1-10 --concurrency 5 --model sonnet`
  - 과제마다 임시 폴더 + `git init` → `MURBA_HEADLESS=1 claude -p "/murba-good-work:run <brief>"` (서브에이전트도 같은 모델로 강제)
- 요약: `node scenarios/harness/analyze.mjs <dir>`
