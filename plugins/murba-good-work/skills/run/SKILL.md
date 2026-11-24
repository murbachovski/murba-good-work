---
name: run
description: "Use when the user wants a feature, app, bug fix or change built end-to-end with spec → review → tests → build → verification → real browser check. 기능·앱·버그 수정을 기획부터 실제 브라우저 확인까지 끝까지 자동 진행해 달라고 할 때. Triggers: 'murba', '처음부터 끝까지 만들어줘', '기획부터 개발까지', 'build this end to end', 'run the full pipeline'."
---

# run — murba 오케스트레이터

너(메인 세션)는 **오케스트레이터**다. 상태 전이표를 따라 단계를 진행하고, 단계 일은 서브에이전트에 맡기고, 상태는 `murba` CLI로만 바꾼다.

## 절대 규칙 (먼저 읽기)
1. 상태 변경은 **`murba` CLI만** (`murba phase`, `murba ac …`, `murba decide`, `murba handoff`). `.murba/state.json`을 직접 고치지 않는다.
2. 단계를 떠나기 전 **handoff 먼저**: `murba handoff <phase> <<'EOF' … EOF` → 그다음 `murba phase <next>`. 거부(종료 코드 2)되면 출력된 부족 조건을 채운다.
3. **승인(approve) 이후에는 사용자에게 묻지 않는다.** 결정이 필요하면 `murba decide` 로 기록하고 추천안으로 계속. 비가역(삭제·배포·push·마이그레이션·비밀)은 하지 않고 `murba decide irreversible …` 후 다른 일을 계속.
   - **headless는 어느 단계에서도 질문으로 턴을 끝내지 않는다**(승인 전 포함). 못 정한 것은 추천안으로 `murba decide`. 안전하게 진행할 것이 없으면 `murba phase report --skip "<사유>"` → `murba report` → 요약으로 끝(질문 없음).
4. "통과"는 **이번에 직접 실행한 명령의 종료 코드**로만. 서브에이전트 보고는 다시 실행해 확인.
5. builder에게 **테스트 원문을 주지 않는다**. AC 본문 + 실패한 AC ID + 관찰된 동작만.
6. 한 번에 **AC 1개**. 커밋은 `feat/<slug>` 브랜치에 AC마다. main 커밋·push 금지.
7. 매 단계 시작에 `murba budget` (종료 코드 3 → report로 가서 멈춤 보고).
8. 서브에이전트 kickoff 첫 줄은 항상: `Read ${CLAUDE_PLUGIN_ROOT}/assets/worker.md first.` kickoff는 20줄 이하, 핵심은 처음과 끝에.
9. **Bash는 단순하게**(권한 프롬프트·거부로 멈추지 않게): 프로젝트 루트에서 실행, `cd x &&` 금지, 셸 변수·`$(...)`·for 루프·서브셸 금지, 호출 1번에 단순 명령 1개. 값(SHA 등)은 앞 명령 출력에서 그대로 복사해 쓴다. 명령 앞 환경변수 지정·파일 쓰기용 heredoc(`cat > f <<EOF`)·`/tmp` 금지(`murba handoff <<'EOF'`는 허용). 여러 단계 로직은 Write 도구로 `.murba/reports/<이름>/`에 스크립트 파일을 쓰고 `node <파일>`로 실행. 테스트는 `node --test <glob>`, `npx playwright test`를 직접. 종료 코드는 Bash 도구 결과에 나온다.
10. **서브에이전트·명령은 전경(foreground)으로만**: Agent 호출에 `run_in_background`를 **넣지 않는다**(문자열 `"false"`를 넣으면 오히려 백그라운드로 돈 사례가 있다). 그래도 백그라운드로 시작되면 완료 알림을 기다려 이어 가고, 질문으로 턴을 끝내지 않는다. Bash `run_in_background`·Monitor로 턴을 끝내지 않는다(headless `-p`는 턴이 끝나면 백그라운드 작업을 기다리다 강제 종료한다). 서버가 필요한 검사는 Playwright `webServer` 설정이나 한 번에 끝나는 스크립트(서버 시작 → 측정 → 종료)로 한다.

## 시작
**`.murba/`는 플러그인 상태 폴더이지 소스 변경이 아니다**(`.murba/.gitignore`로 git에서 제외. 프로젝트 `.gitignore`는 건드리지 않는다). 읽기 전용 조사 과제라도 **항상 `murba init`** 한다.
```bash
murba status                              # 이미 진행 중이면 resume 스킬 사용(없다는 오류는 정상)
murba init   # 모드(대화형/headless)와 사전 승인 여부는 CLI가 환경변수로 스스로 판별한다. 직접 환경변수를 확인하지 않는다
git checkout -b feat/<짧은-slug>          # git 저장소가 아니면 git init 후 첫 커밋
```
- headless(`MURBA_HEADLESS=1`): 질문 금지. 사용자 프롬프트를 기획 brief로 쓰고, 모르는 것은 추천안으로 정해 `murba decide taste "<가정>" --why "<이유>"`.

## 단계 표 (상세 절차는 references/)
| phase | 할 일 | 담당 | 떠나기 조건 |
|---|---|---|---|
| triage | `murba-good-work:triage`에 요청 전달 → 응답의 JSON(`task_type`, `risky` 포함)을 `.murba/run-plan.json`으로 저장. `murba phase grill`에서 이 두 값이 원장에 고정된다 | triage | run-plan.json |
| grill | 사용자 요청 원문과 사전 답변을 그대로 `.murba/brief.md`에 저장 → **grill 스킬** 실행 → `.murba/spec.md` 작성(AC 줄 형식은 아래) → `murba ac sync` | 나 | spec.md, brief.md |
| spec-review | `murba-good-work:spec-reviewer`에 spec·brief 경로만 전달(요구 → AC 대응 검사 포함) → 응답을 `.murba/reports/spec-reviewer/review.md`로 저장 | spec-reviewer | review.md |
| revise | 증명된 지적만 반영, 나머지는 보류 기록. **요구 → AC 차단 지적은 반드시 AC로 반영**(요구를 약하게 바꾸지 않는다). AC 사이 진짜 선후관계는 `[after:AC-xxx]`로 표시. `.murba/ac-test-map.md` 작성. `murba ac sync` | 나 | spec.md, ac-test-map.md |
| approve | 대화형: 기획서+대응표 요약을 보여주고 AskUserQuestion으로 **1회 승인** + 그동안 쌓인 결정 큐 질문. 승인 → `murba approve`를 **직접 Bash로**(스크립트·래퍼 안 금지). hook이 사람 확인 창을 띄우고, 확인 없이 실행되면 `APPROVE_NEEDS_HUMAN`. headless: `murba approve`. 거부되면(사전 승인 없음) 사용자에게 묻지 말고 `murba report`로 보고서를 쓰고 '승인 대기'로 끝낸다 | 사용자 | @approved |
| setup | [references/setup.md](references/setup.md) | 나 | handoff/setup.md, init.sh |
| test-write | [references/test-write.md](references/test-write.md) | test-writer | handoff, @test_hashes |
| build / evaluate / fix | [references/build-loop.md](references/build-loop.md) | builder / evaluator | 표 참고 |
| qa / browser | [references/qa-browser.md](references/qa-browser.md) | evaluator + 나 | @final_verdicts, @browser_evidence |
| report | [references/finish.md](references/finish.md) | 나 | report.md |

AC 줄 형식(spec.md): `- AC-001 [browser] [after:AC-000] WHEN <조건> THE SYSTEM SHALL <동작>` — `[browser]`는 화면 확인이 필요한 AC에만. `[after:AC-xxx]`는 그 AC가 정말 다른 AC 구현을 전제할 때만(승인 전 grill/revise에서 붙인다). `murba ac next`가 이 순서를 지킨다.

11. **작은 구현 작업도 파이프라인을 탄다.** 기획서는 짧게(AC 1~3개) 쓰되 승인·테스트 선작성·판정은 생략하지 않는다. `--skip`은 조사 작업과 위험 요청(triage가 run-plan에 `risky: true`로 표시, grill로 넘어갈 때 고정)에만 쓴다. CLI가 그 밖의 생략을 거부한다. 승인·테스트 잠금 전에 구현 파일을 고치면 `murba approve`/`lock-tests`가 `SOURCE_CHANGED_BEFORE_TESTS`로 거부한다. 생략한 실행(조사·위험 보고)이 구현 파일을 바꾸면 `--skip`·`murba phase done`이 `SOURCE_CHANGED_IN_SKIPPED_RUN`으로 거부한다(재현 스크립트는 프로젝트 밖에). `SOURCE_GATE_ERROR`(git 실패)는 `git status`로 원인을 확인하고, 못 고치면 `murba decide user-direction`으로 남기고 보고서를 쓴다.
12. **사용자가 요청한 산출물은 `.murba/` 밖에 둔다**(스크립트·보고서·출력 파일). `.murba/`는 원장 전용이고 git에서 제외된다. 조사 결과는 사용자가 정한 경로, 없으면 프로젝트 루트 `INVESTIGATION.md`에 쓰고 `.murba/reports/`에는 그 경로만 적는다.

## 작업 유형별 진행 (run-plan.json의 task_type)
| task_type | 진행 |
|---|---|
| feature | 전체 단계 |
| bug-fix | grill에서 **재현 먼저**: 버그를 드러내는 실패 테스트가 AC. 이후 보통 흐름 |
| refactor | 기존 테스트가 AC 기준선. test-write에서 기존 테스트를 `murba lock-tests`로 잠그고, 동작 보존(기존 테스트 전부 통과)이 판정 기준 |
| perf | 변경 전 기준 측정을 `.murba/evidence/baseline-*.log`로 저장한 뒤 진행. AC는 측정 비율(예: 5배 이상 빠름)이며 **같은 입력 5회 이상 측정의 중앙값**으로 판정(최대값·1회 측정 금지, 측정 노이즈로 실패하지 않게). 변경 전·후를 같은 스크립트로 번갈아 측정 |
| prototype | 기획서는 가볍게, 그래도 AC와 브라우저 증거는 필수 |
| investigation | triage → grill(질문 목록·조사 범위. spec.md에 **AC 줄을 쓰지 않는다** — 조사 질문은 `Q-1` 형식, `murba ac sync` 안 함) → 조사 결과를 사용자가 정한 경로(없으면 프로젝트 루트 `INVESTIGATION.md`)에 작성(근거 `file:line`·실행 결과), `.murba/reports/investigation.md`에는 그 경로를 기록 → `murba phase report --skip "조사 과제: 구현 없음"` → `murba report`. 소스는 고치지 않는다 |
| 위험 요청(삭제·DB 초기화·push 등) | **실행하지 않는다.** `murba decide irreversible "<요청>" --why "<이유>"`, 안전한 부분은 모두 하고 report로 끝(코드를 바꾸는 안전한 부분은 AC로 기획·승인·테스트·build를 거친다. build를 건너뛰고 고치면 CLI가 거부) |

## 서브에이전트 kickoff 틀
```
Read ${CLAUDE_PLUGIN_ROOT}/assets/worker.md first.
역할: <에이전트 이름>  /  단계: <phase>  /  AC: <ID 또는 없음>
목표: <한 줄>
입력: <파일 경로 목록 — 본문을 붙이지 않는다>
금지: <이 단계 금지 사항>
완료 조건: <측정 가능한 조건 1~3개>
보고: worker.md 응답 형식. 상세는 .murba/reports/<이름>/ 또는 ---DETAIL---
목표(반복): <한 줄>
```
응답의 `---DETAIL---` 아래 내용은 네가 `.murba/reports/<이름>/<phase>.md`로 저장한다.

## 상태 코드 처리
| 코드 | 처리 |
|---|---|
| DONE | 증거 명령을 직접 다시 실행해 확인 후 다음 |
| DONE_WITH_CONCERNS | 확인 + 우려를 `murba decide`로 기록 |
| NEEDS_CONTEXT | 빠진 파일·정보를 채워 같은 에이전트 재실행(SendMessage) |
| BLOCKED | 맥락 보강 / 상위 모델(opus) 새 인스턴스 / 작업 분할 / 계획 수정 중 하나. 같은 조건 재시도 금지 |

## 결정 큐 분류
| 분류 | 예 | 처리 |
|---|---|---|
| mechanical | 이름, 위치 | 그냥 정함(기록 생략 가능) |
| taste | 라이브러리, 구조 | 추천안 + `murba decide taste` |
| user-direction | 사용자 결정을 뒤집음 | 자동 결정 금지, `murba decide user-direction`, 다른 일 계속 |
| irreversible | 삭제·배포·push·마이그레이션·비밀 | 하지 않음, `murba decide irreversible`, 다른 일 계속 |

## 핑계와 실제
| 핑계 | 실제 |
|---|---|
| "간단하니 기획 생략" | 생략은 run-plan에 `n/a: 사유`로만. 임의 생략 금지 |
| "사용자에게 확인하고 진행" | 승인 후엔 묻지 않는다. decide 후 계속 |
| "테스트를 살짝 고치면 통과" | 테스트는 잠겨 있다. `murba check-tests`가 잡는다 |
| "builder가 통과했다고 함" | 직접 실행한 종료 코드만 증거 |
| "브라우저는 생략해도 됨" | `[browser]` AC의 브라우저 미실행 = 실패 |
| "한 번에 여러 AC 구현이 빠름" | AC 1개씩. 판정·롤백 단위가 무너진다 |
| "멈추고 보고할까" | 미완료 단계가 있으면 다음 행동을 한다. 막히면 decide + hold 후 다음 AC |
| "읽기 전용 조사라 init 안 함" | `.murba/`는 소스가 아니다. init 후 investigation 흐름 |
| "작은 수정이라 기획·테스트는 생략" | 생략은 CLI가 거부한다. AC 1개짜리 짧은 기획서로 진행 |
| "결과 스크립트는 .murba에 두면 됨" | `.murba/`는 git 제외 원장. 사용자 산출물은 프로젝트 안에 |
| "headless지만 이건 물어봐야" | 질문으로 끝내지 않는다. 추천안 decide 또는 report --skip |
| "for 루프 한 번이면 끝" | 루프·변수는 권한 거부로 멈춘다. 스크립트 파일 + `node` |

## 끝
`report` 후 `murba phase done`. 최종 응답: 보고서 경로(`.murba/report.html`), ❌·⚠️ 항목, 결정 큐 질문 요약. headless에서는 질문하지 않고 결정 큐를 보고서 항목으로만 남긴다.
