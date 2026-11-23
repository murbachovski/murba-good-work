# murba-good-work 기획서 v0.1

- 문서 상태: 초안 → 독립 검토 → 보완 (변경 기록은 맨 끝)
- 작성일: 2026-11-24 / 대상: Claude Code 2.1.x (설치본 2.1.316에서 확인)
- 근거: [결정 로그](../decisions/0001-initial-decision-log.md), [조사](../research/plugin-survey.md), [논문](../research/papers.md)

## 0. 요약
사용자가 기획을 확정하면, 그 뒤 개발·검증·QA·실제 브라우저 확인까지 **멈추지 않고 자동으로** 진행하는 Claude Code 플러그인.
신뢰성은 프롬프트가 아니라 **결정적 hook + 파일 원장 + 실행 증거 + 독립 평가자 + 동작이 증명된 테스트**로 만든다.
사람 접점은 3곳: ① 기획 질문(grill) ② 기획서 1회 승인 ③ 결정 큐 일괄 질문(작업을 막지 않음).

## 1. 목표와 비목표
**목표**
1. 사용자의 10단계 흐름(기획→검토→보완→진행→셋팅→전문 에이전트→오케스트레이션→검증→QA→실제 브라우저)을 자동 실행
2. 작업이 중간에 멈추거나 질문하고 끝나는 문제 제거
3. "됐다"는 실행 증거가 있을 때만. 없으면 실패·미검증으로 보고
4. 무엇을 했고 무엇을 못 했는지 읽기 쉬운 보고서
5. 기록·버전 누적, 독립 PR 리뷰, 주기적 자기 개선

**비목표**
- Windows 지원(macOS/Linux만)
- 범용 에이전트 프레임워크·벡터 검색 도입
- 사용자 승인 없는 배포·tag·Release·비가역 작업
- 처리량 극대화(개인용. 안전·정확 우선)

## 2. 전체 흐름과 상태 전이표
오케스트레이션은 **상태 전이표(데이터 파일)**로 정의하고 hook이 지킨다. 오케스트레이터(메인 세션)만 `state.json`의 `phase`를 바꾼다.

| 단계(phase) | 사용자 흐름 | 담당 | 진입 조건(파일) | 산출물 | 다음 |
|---|---|---|---|---|---|
| `triage` | 0 작업 설계 | triage | 요청 | `run-plan.json` | grill |
| `grill` | 1 기획서 작성 | 메인 세션 | run-plan | `spec.md` 초안, AC 목록 | spec-review |
| `spec-review` | 2 기획서 검토 | spec-reviewer | spec 초안 | `review/spec.md` | revise |
| `revise` | 3 기획서 보완 | 메인 세션 | review | `spec.md` 확정본, AC→테스트 대응표 | approve |
| `approve` | 승인(사람) | 사용자 | 확정본 | 승인 기록 + spec·AC 해시 | setup |
| `setup` | 5 개발 셋팅 | 오케스트레이터 | 승인 | 실행 환경, 러너·Playwright 설정, 허용목록, `init.sh`, verify 스킬, (v0.2) 센서 → **권한 점검**(안 맞으면 멈춤 보고) | test-write |
| `test-write` | 4 기획 기반 진행 | test-writer | 셋팅 | AC 테스트, 숨긴 검사, 테스트 해시 | build |
| `build[i]` | 6 전문 에이전트 | builder(+역할 스킬) | 테스트 | AC i 구현 커밋 | evaluate |
| `evaluate` | 8 검증 | evaluator | 커밋 SHA | AC i 판정, 증거 | fix / build[i+1](남은 AC 있음) / qa(남은 AC 없음) |
| `fix` | 수정 루프 | builder | NOT VERIFIED | 수정 커밋 | evaluate (≤3라운드) |
| `qa` | 9 QA | evaluator (+오케스트레이터 스크립트) | 남은 AC 없음 | **현재 head에서 전 AC 일괄 재판정**, 전체 회귀 테스트, flaky 검사. 뮤테이션 주입·복원은 오케스트레이터 스크립트가 하고 evaluator는 결과만 판정 | browser |
| `browser` | 10 실제 브라우저 | evaluator | 보류 안 된 AC 전부 VERIFIED(보류 AC는 보고서에 ❌) | Playwright 증거, 상위 목표 검사 | pr 또는 report |
| `pr` | (v0.2) PR·리뷰 | pr-reviewer | 증거 완비 | 리뷰 판정(SHA) | merge 또는 report |
| `merge` | (v0.3) 머지 | 오케스트레이터 | 조건 충족 | 머지 확인 | report |
| `report` | 보고 | 오케스트레이터 | 모든 단계 종료 | `report.md`(+html), 결정 큐 일괄 질문 | 끝 / build[i](사용자가 추천안과 다르게 답해 재작업 필요) |

- 7 오케스트레이션 = 이 전이표 + 오케스트레이터 자체
- 8 검증(AC별 테스트 + 숨긴 검사) / 9 QA(전 AC 재판정 + 전체 회귀 + 뮤테이션 + flaky) / 10 실제 브라우저로 구분한다
- 사용자 흐름상 5 셋팅이 4보다 먼저 실행된다: 테스트를 돌릴 러너·설정이 먼저 있어야 하고, 이 보호 파일은 builder가 쓸 수 없기 때문
- 쓰기 도구가 있는 서브에이전트(test-writer, builder)는 상세 보고를 `.murba/reports/<agent>/`에 쓴다. test-writer는 추가로 `.murba/hidden/`에 쓸 수 있다. 쓰기 도구가 없는 에이전트(triage, spec-reviewer, evaluator, pr-reviewer)는 보고를 응답에 담고 **오케스트레이터가 받아서** `.murba/reports/<agent>/`에 기록한다
- `run-plan.json`, handoff, `decisions.tsv`, `state.json`, 판정·증거 목록은 **오케스트레이터만** 쓴다
- `BLOCKED`, `INCONCLUSIVE`, 예산 초과 → 해당 갈래는 결정 큐로, 나머지는 계속
- 단계 생략은 `run-plan.json`에 `n/a: 사유`로만 가능
- 매 단계 끝에 `.murba/handoff/<phase>.md`(목표·접근·완료·현재 실패·다음 1개 작업·근거 파일). Stop 게이트가 존재를 검사

## 3. 0단계: 작업 설계(triage)
`run-plan.json` 필드:
- `task_type`: feature / bug-fix / investigation / refactor / perf / prototype → 유형별 절차
  - bug-fix: 재현 → 근본 원인 → 실패 테스트 → 수정
  - investigation: 읽기 전용, 산출물은 보고서
  - refactor: 동작 보존(기존 테스트 전부 통과가 조건)
  - perf: 기준 측정 먼저
- `scope_mode`: 확장 / 선택 확장 / 유지 / 축소, `not_in_scope` 목록
- `phases`: 단계별 깊이(light/standard/deep)와 생략 사유
- `agents`: 투입 에이전트와 모델
- `throughput`: 선행 차단 단계 / 독립 작업 / 공유 상태 / 최소 분해
- `budget`: 경과 시간, 서브에이전트 수, 재시도 수 상한
- `versions`: 플러그인 버전, state 스키마 버전, Claude Code 버전

## 4. 1~3단계: 기획(grill → 검토 → 보완 → 승인)
**grill (선택형 질문, 일괄)**
1. 전제 검증: 수요, 현재 우회책, 최소 버전, 안 하면 비용
2. 대안 2~3개 + 추천
3. 실패 지도: 빈 입력·잘못된 입력·의존성 실패·조용한 실패
4. 핵심 5줄: 왜 / 누가 / 위험 / 성공 / 범위
5. 수용 기준(AC): EARS 형식(`WHEN … THE SYSTEM SHALL …`) + ID(AC-001). 명세가 암시하지만 테스트가 안 건드리는 입력도 AC로
- 실행해서 답이 나오는 갈림길은 질문하지 않고 시험한다
- 질문 일괄 방식은 `batch-grill-me`(mattpocock) 개작

**검토**: spec-reviewer 1명이 "이걸로 구현하려면 꼭 물어야 할 질문"을 중요도 순으로 → 이미 답 있음 / 사소(직접 결정) / 사용자 몫으로 분류. 증명 안 된 지적은 `보류`로 기록.
**보완**: 메인 세션이 반영. AC→테스트 대응표와 검증 방법 작성.
**승인**: 사용자에게 기획서 + 대응표 + 검증 방법을 보여주고 1회 승인. grill 답변은 승인이 아니다. 승인 시 spec·AC 본문 해시 고정.

## 5. 에이전트
| 에이전트 | 모델 | 도구 | 역할 | 금지 |
|---|---|---|---|---|
| triage | sonnet | Read, Grep, Glob | run-plan 작성 | 편집 |
| spec-reviewer | opus | Read, Grep, Glob | 기획서 검토 1회 | 편집 |
| test-writer | opus | Read, Write, Edit, Bash(테스트 실행) | AC만 보고 테스트·숨긴 검사(`.murba/hidden/`) 작성 | 구현 코드 열람(guard가 Read도 차단) |
| builder | sonnet (3라운드: opus 새 인스턴스) | Read, Write, Edit, Bash | 1회 실행 = AC 1개 구현, 역할 스킬 로드 | 테스트·러너 설정 수정, Agent |
| evaluator | opus | Read, Grep, Glob, Bash(테스트·Playwright) | 판정·증거 | 코드 수정, Agent |
| pr-reviewer | opus | Read, Grep, Glob, Bash(gh, git) | 독립 PR 리뷰, status check 게시 | 코드 수정, Agent |
| evolve-researcher | sonnet | WebSearch, WebFetch, Read | 생태계·자기 기록 분석 | 편집 |

- 모든 에이전트 `tools`에서 Agent 제외(하위 에이전트 생성 금지를 도구로 강제)
- 모든 kickoff 첫 줄: `worker.md`를 읽어라. worker.md 내용: kickoff 기준 외 게이트 추가 금지 / 되돌릴 수 있는 선택은 직접 하고 이유 보고 / 응답 15줄 이하 + 상태 코드 / 상세는 파일(쓰기 도구가 없으면 응답 끝에 붙이고 오케스트레이터가 기록)
- 상태 코드: `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`
  - NEEDS_CONTEXT → 맥락 보강 후 재실행. BLOCKED → 맥락 보강 / 상위 모델 / 작업 분할 / 계획 수정 중 하나. 같은 조건 재시도 금지
- (v0.2) 역할 스킬(frontend, backend, ai, design)은 builder 에이전트 `skills:`로 미리 로드
- 수정 루프 1~2라운드의 "같은 builder"는 SendMessage로 같은 서브에이전트를 이어서 실행
- 도구 표의 `Bash(…)` 범위 표기는 의도다. 실제 제한은 guard hook이 `agent_type`별로 강제한다
- **에이전트 추가·제거 절차**: ① 필요 근거(실행 기록의 반복 실패 2회 이상) ② 결정 기록 작성 ③ eval에 있을 때/없을 때 비교 케이스 추가 ④ 통과 시 반영. 제거도 같은 절차(eval에서 차이 없음 확인)
- 같은 모델 계열 평가의 자기선호 편향은 알려진 한계. builder(sonnet)와 평가자(opus) 등급을 나눠 완화(효과 실증은 없음)

## 6. 결정 큐 (질문이 작업을 막지 않게)
원장: `.murba/decisions.tsv` (추가만. 열: 시각, 단계, 분류, 결정, 이유, 근거 포인터, 결과, 틀렸을 때 비용). 셀이 `= + - @`로 시작하면 앞에 `'`.

| 분류 | 처리 |
|---|---|
| 기계적 | 자동 결정, 기록 생략 가능 |
| 취향 | 추천안 적용 + 기록 + 영향 파일 표시 |
| 사용자 방향 변경 | 자동 결정 금지. 큐에 올리고 다른 작업 계속 |
| 비가역 | 해당 작업만 PreToolUse가 차단. 큐에 올리고 다른 작업 계속 |

- 일괄 질문 시점: 두 번만. ① approve 때 승인과 함께 ② report 때. 그 사이엔 묻지 않는다. 선택형 최대 4개씩
- 사용자가 추천안과 다른 답 → 영향 파일만 재작업
- 큐 추가 알림 방법은 미정(열린 질문 Q5)

## 7. 멈춤 방지
| 원인 | 장치 |
|---|---|
| 모델이 "진행할까요?" 하고 턴 종료 | Stop 게이트: 미완료 단계 + handoff 없음 → 차단. 질문형 종료는 결정 큐 + 경고 |
| 권한 프롬프트 대기 | setup이 대상 프로젝트 `.claude/settings.local.json`(git 미추적, trust 없이 적용 — M24)에 안전 명령 허용목록 작성. setup 직후 권한 점검, 안 맞으면 멈춤 보고 |
| 컨텍스트 압축 후 길 잃음 | SessionStart(`startup\|resume\|clear\|compact\|fork`)가 원장 포인터 재주입(짧게, 핵심은 첫 줄·끝 줄, 같은 내용 중복 주입 방지) |
| 세션 끊김 | `resume` 스킬: 원장 + git log 기준 재개, 남은 항목마다 출처 태그(run/read/assumed) |
| 같은 실패 반복 | 수정 루프 상한 + 반복 감지(같은 에러 3회, 같은 파일 편집 10회) |
| 비용 폭주 | 예산 상한(시간·서브에이전트 수·재시도 수) |

**Stop 게이트 수치**: 단계당 3회·실행당 12회(파일 카운터). `stop_hook_active` 확인. Stop 입력의 `background_tasks`에 실행 중 작업이 있으면 보류. 내장 상한(도구 호출 없이 연속 8회 → 강제 해제, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`)보다 자체 카운터가 먼저 작동하게 한다. `/goal`은 평가자가 도구를 못 써 증거 파일을 볼 수 없으므로 대화형 편의로만 둔다.

## 8. 수정 루프
- 최대 3라운드: 1~2라운드 같은 builder, 3라운드 opus 새 builder(새 컨텍스트)
- 2회 연속 개선 없음 → 중단. 같은 전제로 2회 실패 → 전제부터 검증
- 입력은 실행 결과만: 실패한 AC ID + 관찰된 동작. 테스트 원문은 주지 않는다
- 마지막 통과 SHA 보관, 회귀하면 복원. 통과한 결과를 다시 고치게 하지 않는다
- 되돌리기 2회 또는 무관 파일 수정 → 정지
- 상한 도달: 지적별로 보류+결정 기록 후 다음 작업 계속, 최종 보고에 노출

## 9. 테스트 신뢰
- test-writer가 셋팅 직후 AC만 보고 테스트 작성(builder보다 먼저). 구현 전이므로 새 테스트는 실패해야 정상(실패 확인을 증거로 남김)
- 뮤테이션 검사(qa 단계): 오케스트레이터 스크립트가 구현에 최소 뮤턴트를 주입해 AC 테스트가 실패하는지 확인. 실패하지 않으면 그 테스트는 "동작 미증명" ⚠️
- 승인 시 AC 본문 해시, 테스트 작성 후 테스트 파일 해시를 `state.json`에 고정 → 변경 시 `ACCEPTANCE_EDITED` 결정 큐
- **숨긴 검사**: test-writer가 `.murba/hidden/`에 작성하는 AC 변형 입력. 실행은 evaluator. builder의 이 경로 Read·Grep·Glob·Bash 접근은 guard가 차단
- builder 쓰기 금지(PreToolUse): 테스트 파일, conftest, `playwright.config.*`, test 스크립트, 러너·타이머·평가 유틸, `.murba/`, hook·eval·허용목록
- 결정적 diff 규칙으로 조작 감지: 테스트 삭제·skip·only, 특정 입력 분기, 몽키패치, `--no-verify`, suppress 주석, 수용 기준 수정. LLM 감시는 보조
- 자식의 "통과" 보고는 부모(오케스트레이터)가 재실행 확인
- flaky: 재시도 통과 = ⚠️. 생성 테스트에 순서 의존 검사

## 10. 결정적 센서 (v0.2)
setup 단계가 대상 프로젝트에 만든다: 타입체크, 린터, 구조 테스트(계층 의존 방향, 파일 크기 상한). 오류 메시지에 에이전트용 수정 지침. 각 센서는 1회 실행으로 실제로 잡는지 증명. 빠른 센서는 편집 직후, 비싼 센서(뮤테이션, 아키텍처)는 evaluate에서.

## 11. 브라우저 검증
- AC마다 결정적 `@playwright/test` 스크립트. 종료 코드가 증거
- 실패 조건: 콘솔 error(`console.error`, `error`, `unhandledrejection` 수집), 네트워크 4xx/5xx, AC 미충족
- **건너뜀·브라우저 불가·dev 서버 실패 = 실패**
- dev 서버: 헬스체크 후 실행, 포트 지정, 종료 정리
- 증거: `.murba/evidence/run-<UTC시각>/AC-001.png` 등 고정 명명, 덮어쓰기 금지. 증거 줄(URL, 콘솔 에러 수)
- trace는 실패 시만, 비밀(쿠키·헤더·토큰) 마스킹. 원본 증거는 git 제외
- setup이 프로젝트 전용 verify 스킬 생성(실행·점검·조작·증거·정리 절) → 1회 실행으로 증명
- 상위 목표 검사 1개(핵심 5줄의 "성공" 기준)
- 스크린샷 비전 판정·건강 점수는 참고용(게이트 아님)
- Claude in Chrome: 로그인 필요한 실제 환경에서만 보조

## 12. 판정
- `VERIFIED / NOT VERIFIED / INCONCLUSIVE`. INCONCLUSIVE는 통과가 아니다
- 평가자 입력: diff(base SHA부터) + AC + 실행 증거만. builder 실행 기록·주장은 주지 않음
- 판정은 커밋 SHA에 묶는다. AC별 판정은 진행 확인용이고, 최종 판정은 qa 단계에서 현재 head SHA로 전 AC를 다시 판정한 결과다. 그 뒤 커밋이 생기면 최종 판정은 무효
- 리뷰 지적: `file:line` + 원문 인용 필수, 실행으로 증명된 지적만 차단, 나머지는 `보류`로 기록

## 13. Hook 명세
| hook | 이벤트 | 하는 일 | 실패 시 |
|---|---|---|---|
| router | SessionStart `startup\|resume\|clear\|compact\|fork` | `.murba/` 있으면 원장 포인터·현재 단계 주입, node 존재 확인 | 통과 |
| guard | PreToolUse `Bash\|Edit\|Write\|Read\|Grep\|Glob` | 비가역 명령 deny + 결정 큐, `agent_type`별 경로 제한(builder: 테스트·설정·`.murba/` 쓰기와 `.murba/hidden/` 읽기 금지, test-writer: 구현 경로 읽기 금지, evaluator·pr-reviewer: 코드 쓰기 금지, 모든 서브에이전트: 자기 보고 경로 외 `.murba/` 쓰기 금지. 예외: test-writer의 `.murba/hidden/`), 상태 전이표 위반 deny. `agent_type` 비교는 `murba-good-work:<이름>` 형식(M25) | **차단** (`"onFailure":"block"`, v2.1.295+) |
| stop-gate | Stop | 단계 산출물·handoff·증거 확인, 카운터. 차단은 exit 2가 아니라 JSON `decision` 출력(M5) | 통과 + 기록 |
| (v0.2) subagent-gate | SubagentStop | builder가 DONE 보고 시 증거 확인 | 통과 + 기록 |
| (선택) notify | Notification | 결정 큐 알림 | 통과 |

**이벤트별 출력 형식**
| 이벤트 | 차단 형식 |
|---|---|
| PreToolUse | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` |
| Stop / SubagentStop | 최상위 `{"decision":"block","reason":"..."}` |
| SessionStart | `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}` (10,000자 이하) |

**공통 규칙**
- 모두 command 타입. sh 래퍼가 `.murba/` 확인 후 node 실행(없으면 즉시 종료 → 다른 프로젝트 무영향)
- 상태 경로는 `CLAUDE_PROJECT_DIR` 기준(worktree에서도 같은 원장)
- 가드: 명령을 `; && |` 단위로 분해, 실제 JSON 파서, heredoc·난독화(`${IFS}`, base64→sh) 처리, 빌드 산출물·/tmp 삭제 예외, `permission_mode` 인식
- 비가역 목록(1차): 루트·홈 재귀 삭제, force-push, main·기본 브랜치 push, DB DROP/TRUNCATE/마이그레이션 적용, 배포 명령, 비밀 파일 쓰기, 결제 SDK 호출, tag·release 생성, 외부 게시
- 예외: (v0.2) pr 단계에서 `feat/*` 브랜치 push와 PR 생성은 허용
- Bash를 통한 쓰기(리다이렉션, `tee`, `sed -i` 등) 검사는 최선 노력이다. 완전 차단이 아니므로 diff 규칙(§9)으로 사후 감지를 함께 한다
- 상태 쓰기는 lock 파일 또는 추가 전용 이벤트 로그
- 실행 기록 `.murba/logs/hooks.jsonl` (fired/blocked/released/exhausted/skipped/error), liveness 경고
- 비상 해제(`/plugin disable`, `disableAllHooks`)는 이 문서에만. 차단 메시지에 쓰지 않음
- 테스트: 실제 Claude Code에서 캡처한 입력 픽스처, 실제 프로세스 실행, 음성 대조군(막으면 안 되는 명령), 모든 테스트 파일이 러너에 연결됐는지 확인

## 14. 컨텍스트 관리
- 오케스트레이터는 포인터만, 본문은 파일
- 컨텍스트 사용률 40~60% 목표. 단계 끝 handoff 후 다음 단계
- 서브에이전트는 새 컨텍스트, 결과는 파일, 응답 15줄 이하
- kickoff는 짧게, 핵심은 앞과 끝에. 작업 전 "AC와 근거 다시 쓰기"
- 원장: `state.json`(필드별 쓰는 주체 1명) + `progress.md`(첫 줄 계획 식별자)
- 오케스트레이터 스킬 `run`은 핵심 규칙을 앞 4k 토큰 안에 둔다(압축 후 앞 5k 토큰만 복원)

## 15. 코드 그래프 (v0.2, 조건부)
파일 수가 기준을 넘을 때만. base SHA마다 결정적 import 그래프를 `.murba/graph/<sha>.json`에 만든다. 바뀐 파일의 1-hop만 조회해 ① 다시 돌릴 테스트 선택 ② PR 영향 범위 ③ 병렬 충돌표에 쓴다. 그래프 전체를 컨텍스트에 넣지 않는다. understand-anything 플러그인은 자동 구간에서 쓰지 않는다(사용자 확인 단계·커밋 hook 때문). import 추출 스크립트 재사용만 검토.

## 16. 병렬
구현은 builder 1개 순차. 독립 산출물 병렬은 기본 꺼짐, 자체 eval 근거가 생기면 켬. 켤 때: 파일·인터페이스 충돌표로 판정, `worktree.baseRef: "head"`(setup이 사용자 설정에 기록), 시작 전 커밋, 병합 순서·충돌 시 순차 재실행·병합 후 전체 재테스트. 조사·리뷰는 병렬 허용.

## 17. git·PR·머지
- 대상 프로젝트: `feat/<작업>` 브랜치에 작업(AC)별 자동 커밋. main 직접 커밋·push 금지
- (v0.2) PR: 본문 40줄 이하(Why / What changed / Scope / Tradeoffs / Blast Radius / Verification). pr-reviewer가 base-SHA 리뷰 패키지로 독립 리뷰, 판정을 status check로 게시
- status check는 쓰기 권한이 있으면 누구나 올릴 수 있다(M26). 자동 머지 게이트로 쓰려면 필수 체크의 출처를 전용 GitHub App으로 지정해야 하고, private 저장소는 Pro 이상 또는 public이어야 한다(M23). 조건 미충족 시 자동 머지 끄고 PR까지만
- (v0.3) 자동 squash 머지 조건: 독립 리뷰 통과 + 테스트 + 브라우저 증거 + 판정 SHA = 현재 head. 머지 후 실제 상태 재확인
- 항상 사용자: hook·정책·eval·비가역 변경 PR, tag, Release
- 게이트 설정은 base 브랜치의 커밋본에서만 읽는다(PR이 자기 게이트를 못 바꾸게)

## 18. 보고
`.murba/report.md` → 스크립트로 HTML(LLM 비용 없음). 양식은 [기록 규칙](../rules/records.md):
1. 요약 3줄
2. 고정 첫 표: ❌ 실패·생략 / ⚠️ 미검증 / 범위 밖 변경
3. 단계별 ✅⚠️❌⏸ + 증거
4. 내가 내린 결정(틀렸을 때 비용)
5. 결정 큐 질문
6. 다음 할 일

## 19. 기록·버전
main에 누적(추가만): `CHANGELOG.md`, `docs/history/`, `docs/decisions/`, `docs/evolve/`. 문서 버전과 플러그인 버전 분리. tag·Release는 사용자 승인.

## 20. evolve (v0.3)
- 실행: GitHub 공개 후 `/schedule` 클라우드 예약 작업(구 routine) 주 1회 + 로컬에서 수동 실행(`/murba-good-work:evolve`)
- 입력 우선순위: ① 자기 실행 기록(hooks.jsonl, report, decisions)의 2회 이상 반복 실수 ② 삭제 후보(구성요소별 "담은 가정" 재검토) ③ 외부: Claude Code changelog, docs `llms.txt`, claude-plugins-official marketplace, awesome 목록, 논문
- 결과: `evolve/YYMMDD` 브랜치 + `docs/evolve/YYMMDD.md`. eval 점수 유지·상승(모델 고정, 여유폭, 비용 상한) 시만 PR
- evolve는 `evals/`·hook·정책 수정 금지(결정 큐로)
- 별도 학습 원장 없음

## 21. eval
- `claude plugin eval`(v2.1.269+). 프롬프트는 자연스러운 한국어
- 케이스마다 결과 grader(`file_exists`는 `--allow-tools Write` 필요, `regex`) + 과정 grader(`tool_used`. 단 `Skill` 대상은 비교 점수 제외 — M27)
- hook별 비교는 hook을 뺀 변형 플러그인 디렉터리로
- 블라인딩: 후보가 보는 경로·프롬프트에 eval·test·judge 금지
- 3회 실행은 잡음이 크다 → 모델 고정, 여유폭, `--max-cost-usd`
- 제약: 임시 HOME, 프로젝트 `.claude/` 미반영, Bash 샌드박스 → setup 결과·Playwright는 eval 밖 스파이크로 검증
- eval 안에서도 hook과 실제 MCP 서버는 샌드박스 밖에서 실행된다(hook 동작은 eval로 검사 가능, 단 hook이 건드리는 파일 경로 주의)

## 22. 디렉터리 구조(안)
```
murba_good_work_plugin/
├── .claude-plugin/marketplace.json
├── CLAUDE.md
├── docs/{spec,rules,research,decisions,history,evolve}/
└── plugins/murba-good-work/
    ├── .claude-plugin/plugin.json
    ├── skills/{run,grill,resume,setup,evolve,verify-template,frontend,backend,ai,design}/SKILL.md
    ├── agents/{triage,spec-reviewer,test-writer,builder,evaluator,pr-reviewer,evolve-researcher}.md
    ├── hooks/hooks.json
    ├── scripts/{router,guard,stop-gate}.{sh,mjs}, report-html.mjs
    ├── assets/{worker.md,state-machine.json,run-plan.schema.json}
    ├── tests/ (hook 픽스처·실제 실행)
    └── evals/
대상 프로젝트/.murba/  (gitignore)
    run-plan.json state.json progress.md decisions.tsv handoff/ evidence/ logs/ graph/ report.md
```

## 23. 외부 스킬 개작
라이선스 확인 후 한국어 개작 + 출처 표기. 라이선스는 [조사 문서](../research/plugin-survey.md) 표 참고.
| 원본 | 쓰임 |
|---|---|
| mattpocock grill-me, batch-grill-me | grill 스킬 |
| mattpocock tdd | test-writer·builder |
| obra/superpowers verification-before-completion | worker.md·evaluator 규칙 |
| mattpocock git-guardrails-claude-code | guard 비가역 목록 |
| warpdotdev review-pr | pr-reviewer |
| riekelt writing-changelogs | 기록 |

## 24. 로드맵
| 단계 | 내용 | 완료 조건 |
|---|---|---|
| 스파이크 | hook(대화형·`-p`: Stop 카운터·내장 상한, deny, agent_type, node 부재), Playwright(권한·샌드박스), 상태 전이표 + 얇은 E2E(장난감 앱) | 각 가정 표 항목 확인/반증 |
| v0.1 | triage, grill+승인, spec-reviewer, test-writer, 순차 builder, evaluator+Playwright, 결정 큐, 상태 전이표, hook 3개, handoff·resume, 수정 루프, 테스트 해시·숨긴 검사, 예산, report.md, 기본 eval | 장난감 앱 1개를 승인 후 무인으로 끝까지, 증거·보고서 생성 |
| v0.2 | PR·pr-reviewer, HTML 보고, 결정적 센서, 조건부 코드 그래프, 역할 스킬, SubagentStop 게이트, 병렬(기본 꺼짐) | 실제 프로젝트 1개 적용 |
| v0.3 | 조건부 자동 머지, evolve + 클라우드 루틴 | 1주 무인 루틴 1회 성공 |

## 25. 메커니즘 가정 표
확인 = 공식 문서 원문 대조(2026-11-24, Claude Code 2.1.316, `https://code.claude.com/docs/en/<page>`). 스파이크에서 실제 동작으로 재확인한다.

| # | 가정 | 상태 | 원문 근거 | 문서 |
|---|---|---|---|---|
| M1 | PreToolUse `deny`는 그 도구 호출만 막고 모델은 사유를 읽고 계속한다 | 확인 | "the tool call is blocked and Claude Code continues" | hooks |
| M2 | `defer`는 `-p`에서, 그 턴의 도구 호출이 1개일 때만 턴을 끝낸다. 여러 개면 무시, 대화형은 경고 후 무시 | 확인 | "honors \"defer\" only in non-interactive mode with the -p flag, and only when Claude makes a single tool call in the turn" | hooks |
| M3 | Stop 차단 형식은 최상위 `decision:"block"` + `reason`(필수) | 확인 | "`decision` \"block\" prevents Claude from stopping… `reason` Required" | hooks |
| M4 | Stop hook이 연속 8회 계속시키면 강제 해제. 도구 호출 시 초기화. `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`로 조정 | 확인 | "after stop hooks have continued the turn eight times in a row… resets each time Claude calls a tool" | hooks, hooks-guide |
| M5 | exit 1, 또는 exit 0의 파싱 불가 JSON은 비차단. exit 2는 차단. **단 Stop/SubagentStop에서 stdout이 비고 stderr가 파일 없음 오류면 비차단** → stop-gate는 exit 2 대신 JSON `decision` 출력으로 차단 | 확인 | "exits 2 with nothing on stdout and its stderr says a file is missing… non-blocking error" | hooks |
| M6 | `"onFailure":"block"`이면 hook이 죽거나 시간 초과돼도 차단(v2.1.295+). 기본은 비차단. Stop에는 효과 없음 | 확인 | "Requires Claude Code v2.1.295 or later" / "a crashing script then lets everything through" | hooks |
| M7 | 같은 이벤트의 hook들은 병렬 실행 | 확인 | "its matching hooks run in parallel" | hooks |
| M8 | 출력 10,000자 초과 시 버려지지 않고 파일로 저장, 앞 2,000자 미리보기만 주입 | 확인 | "capped at 10,000 characters… saves the output to a file… preview of up to the first 2,000 characters" | hooks |
| M9 | 플러그인 에이전트는 `hooks`, `mcpServers`, `permissionMode` 무시. `skills` 미리 로드는 유효 | 확인 | "plugin subagents don't support the hooks, mcpServers, or permissionMode" | sub-agents |
| M10 | 서브에이전트에서 AskUserQuestion 사용 불가 | 확인 | 제거 도구 목록에 `AskUserQuestion` | sub-agents |
| M11 | 서브에이전트는 3단계까지 중첩 생성 가능. tools에서 Agent를 빼면 막힘(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`로도 조정) | 확인 | "up to three layers below the main conversation" | sub-agents |
| M12 | 압축 후 스킬은 각 앞 5,000토큰, 합계 25,000토큰만 복원 | 확인 | "keeping the first 5,000 tokens of each… combined budget of 25,000 tokens" | skills |
| M13 | 세션 중 worktree 진입 시 `CLAUDE_PROJECT_DIR`은 세션 시작 루트, hook 입력 `cwd`는 worktree. **서브에이전트 `isolation: worktree`는 문서에 명시 없음** | 부분 확인 | "points at the project root where the session started" / "`cwd`… is the worktree root" | worktrees, hooks |
| M14 | `worktree.baseRef`: `fresh`(기본, 원격 기본 브랜치) / `head`(로컬 HEAD) | 확인 | "\"head\": branch from your current local HEAD" | worktrees |
| M15 | 플러그인 루트 CLAUDE.md는 로드 안 됨, validate 경고, `--strict`면 실패 | 확인 | "A CLAUDE.md at the plugin root isn't loaded… validate warns" | plugins-reference |
| M16 | `${CLAUDE_PLUGIN_DATA}`는 마지막 설치 위치에서 제거 시 삭제(`--keep-data`로 보존), Bash 도구 환경엔 없음 | 확인 | "aren't present in the environment of commands Claude runs through the Bash tool" | plugins-reference |
| M17 | eval은 임시 HOME. 기본은 읽기 전용 도구만이고 Bash·Write·Edit는 `--allow-tools`로 허용, Bash는 OS 샌드박스. 기본 케이스당 with 3 + without 3(`--ablation none`은 1개 arm) | 확인 | "Each run gets a temporary home directory" / "When you grant Bash… OS-level sandbox" | plugin-evals |
| M18 | `/goal` 평가자는 명령 실행·파일 읽기를 하지 않는다 | 확인 | "It doesn't run commands or read files independently" | goal |
| M19 | hook 입력에 대화형/headless 구분 필드 없음. hook은 부모 환경변수를 물려받으므로 `-p` 실행기가 `MURBA_HEADLESS=1`을 설정해 구분 | 확인(대안) | "A hook process inherits the parent environment" | hooks |
| M20 | hook 입력에 누적 토큰 없음(Agent PostToolUse의 usage는 마지막 요청만). 누적은 transcript 파싱 또는 OTel `claude_code.token.usage` | 확인 | "cover the final request only" | hooks, monitoring-usage |
| M21 | 클라우드 예약 작업(구 routine) 안에서 `claude plugin eval` 실행 가능 | **미확인** | 문서에 언급 없음 | routines |
| M22 | Playwright가 사용자 권한 모드·eval 샌드박스에서 브라우저 실행 가능 | **미확인**(어려울 정황) | eval 샌드박스 "home directory… unreadable" | plugin-evals, sandboxing |
| M23 | Free 플랜 **private** 저장소는 보호 브랜치(필수 status check) 사용 불가. public 저장소이거나 Pro 이상 필요 | 확인 | Pro 항목 "Advanced tools and insights in private repositories: … Protected branches" | docs.github.com/en/get-started/learning-about-github/githubs-plans |
| M24 | 커밋된 settings의 `permissions.allow`는 workspace trust 후 적용, git 미추적 `settings.local.json`은 trust 없이 적용. 프로젝트 설정의 `defaultMode` auto·bypass는 미적용 | 확인 | "applies its allow rules without the trust step" | settings |
| M25 | 플러그인 에이전트의 hook 입력 `agent_type`은 `murba-good-work:builder`처럼 플러그인 접두가 붙는다 | 확인 | "the plugin-scoped identifier such as `my-plugin:reviewer`, not the bare frontmatter name" | hooks |
| M26 | status check는 쓰기 권한이 있으면 누구나 게시 가능. 출처를 특정 GitHub App으로 지정해야 위조 방지 | 확인 | "Any person or integration with write permissions… can set the state of any status check" | GitHub 문서 |
| M27 | eval의 `tool_used: Skill` grader는 with/without 비교 점수에 들어가지 않음. `file_exists`는 Write 허용 필요 | 확인 | "`scored: false`" | plugin-evals |

## 26. 위험과 열린 질문
| 위험 | 대응 |
|---|---|
| 가드 정규식 오탐으로 무인 실행 정지 | 음성 대조군 테스트, 세그먼트 매칭, 오탐 기록 → evolve |
| hook이 실제로 안 돌았는데 테스트는 통과(bkit 사례) | 실제 캡처 입력 + 실제 실행 테스트, liveness |
| 테스트 조작 | 해시 고정, 숨긴 검사, 쓰기 금지, diff 규칙 |
| 같은 모델 계열 평가 편향 | 등급 분리, 실행 증거 우선, 한계 문서화 |
| 벤치마크 수치 부풀림 | 자체 eval만 신뢰 |
| 비용 | 예산 상한, 수정 3라운드, 병렬 기본 꺼짐 |

열린 질문
- Q1 토큰 예산 측정 방법: transcript 파싱 vs OTel(M20)
- Q2 자동 머지용 GitHub App 구성 방법과 저장소 공개 여부(M23·M26 확인 결과 App 필요)
- Q3 대상 프로젝트용 문서 정리(doc-gardening) 루틴이 필요한가 — 요청 범위 밖, 사용자 확인 필요
- Q4 단계별 새 세션(`-p` 단계 실행) 방식이 메인 세션 오케스트레이터보다 나은가 — 스파이크 비교
- Q5 결정 큐 추가 시 사용자 알림 방법(Notification 이벤트로 가능한지 미확인)
- Q6 에이전트 `tools`의 `Bash(패턴)` 표기가 실제로 범위를 제한하는지 미확인(현재는 guard로 강제)

## 변경 기록
- 2026-11-24 초안 작성
- 2026-11-24 독립 검토(기획서) 13건 반영: setup을 test-write 앞으로 이동·오케스트레이터 담당, evaluate→build[i+1] 전이, qa 단계 신설(전 AC 재판정·뮤테이션), browser 진입 조건 완화(보류 AC 제외), 숨긴 검사 경로·읽기 차단, 산출물 쓰기 주체 명확화, SessionStart에 resume·fork, report→재작업 전이, guard `onFailure`, 역할 스킬 v0.2 표기, feat/* push 예외
- 2026-11-24 최종 검토 반영: 쓰기 주체 정리(읽기 전용 에이전트 보고는 오케스트레이터가 기록, test-writer의 hidden 예외), qa 뮤테이션 담당을 스크립트로 일치, eval 샌드박스 밖 hook·MCP 명시
- 2026-11-24 가정 표 원문 대조 반영: M2·M5·M8·M13·M17·M19·M20 정정, M23 확인, M25~M27 추가, agent_type 접두, status check 위조 가능성·GitHub App, settings.local.json, stop-gate 출력 방식, 클라우드 예약 작업 명칭
