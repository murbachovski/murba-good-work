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
4. "통과"는 **이번에 직접 실행한 명령의 종료 코드**로만. 서브에이전트 보고는 다시 실행해 확인.
5. builder에게 **테스트 원문을 주지 않는다**. AC 본문 + 실패한 AC ID + 관찰된 동작만.
6. 한 번에 **AC 1개**. 커밋은 `feat/<slug>` 브랜치에 AC마다. main 커밋·push 금지.
7. 매 단계 시작에 `murba budget` (종료 코드 3 → report로 가서 멈춤 보고).
8. 서브에이전트 kickoff 첫 줄은 항상: `Read ${CLAUDE_PLUGIN_ROOT}/assets/worker.md first.` kickoff는 20줄 이하, 핵심은 처음과 끝에.

## 시작
```bash
murba status 2>/dev/null || true          # 이미 진행 중이면 resume 스킬 사용
murba init   # 모드(대화형/headless)와 사전 승인 여부는 CLI가 환경변수로 스스로 판별한다. 직접 환경변수를 확인하지 않는다
git checkout -b feat/<짧은-slug>          # git 저장소가 아니면 git init 후 첫 커밋
```
- headless(`MURBA_HEADLESS=1`): 질문 금지. 사용자 프롬프트를 기획 brief로 쓰고, 모르는 것은 추천안으로 정해 `murba decide taste "<가정>" --why "<이유>"`.

## 단계 표 (상세 절차는 references/)
| phase | 할 일 | 담당 | 떠나기 조건 |
|---|---|---|---|
| triage | `murba-good-work:triage`에 요청 전달 → 응답의 JSON을 `.murba/run-plan.json`으로 저장 | triage | run-plan.json |
| grill | **grill 스킬** 실행 → `.murba/spec.md` 작성(AC 줄 형식은 아래) → `murba ac sync` | 나 | spec.md |
| spec-review | `murba-good-work:spec-reviewer`에 spec 경로만 전달 → 응답을 `.murba/reports/spec-reviewer/review.md`로 저장 | spec-reviewer | review.md |
| revise | 증명된 지적만 반영, 나머지는 보류 기록. `.murba/ac-test-map.md` 작성. `murba ac sync` | 나 | spec.md, ac-test-map.md |
| approve | 대화형: 기획서+대응표 요약을 보여주고 AskUserQuestion으로 **1회 승인** + 그동안 쌓인 결정 큐 질문. 승인 → `murba approve`. headless: `murba approve`. 거부되면(사전 승인 없음) 사용자에게 묻지 말고 `murba report`로 보고서를 쓰고 '승인 대기'로 끝낸다 | 사용자 | @approved |
| setup | [references/setup.md](references/setup.md) | 나 | handoff/setup.md, init.sh |
| test-write | [references/test-write.md](references/test-write.md) | test-writer | handoff, @test_hashes |
| build / evaluate / fix | [references/build-loop.md](references/build-loop.md) | builder / evaluator | 표 참고 |
| qa / browser | [references/qa-browser.md](references/qa-browser.md) | evaluator + 나 | @final_verdicts, @browser_evidence |
| report | [references/finish.md](references/finish.md) | 나 | report.md |

AC 줄 형식(spec.md): `- AC-001 [browser] WHEN <조건> THE SYSTEM SHALL <동작>` — `[browser]`는 화면 확인이 필요한 AC에만.

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

## 끝
`report` 후 `murba phase done`. 최종 응답: 보고서 경로(`.murba/report.html`), ❌·⚠️ 항목, 결정 큐 질문 요약.
