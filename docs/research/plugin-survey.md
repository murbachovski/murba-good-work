# 플러그인·공식 문서·실무 엔지니어링 조사

- 조사일: 2026-11-24
- **버전과 수치는 조사일 기준입니다. 3rd-party 저장소·블로그의 주장은 검증하지 않았습니다.**
- 논문은 [papers.md](papers.md)에 따로 정리했습니다.
- 판정: 차용 = 그대로 가져옴, 조정 = 바꿔서 가져옴, 회피 = 가져오지 않음

## 1. 한 줄 결론

신뢰성은 다섯 가지에서 나옵니다: 결정적 hook, 파일 원장, 실행 증거, 새 컨텍스트에서 도는 독립 평가자, 동작이 증명된 테스트. 조사한 플러그인 대부분은 게이트를 프롬프트로만 강제합니다. 규모가 큰 플러그인(bkit: 스킬 44개, hook 핸들러 28개)일수록 고장이 드러나지 않는 사례가 많았습니다.

## 2. 플러그인별 요약

### gstack (garrytan/gstack, v1.103.0.0, MIT)
- **구조**: Claude Code 플러그인이 아니라 스킬 트리입니다. 루트에 스킬 폴더 약 70개가 있고 `bin/gstack-*` CLI 스크립트, `browse/`(Bun + Playwright 데몬)가 있습니다. `./setup`이 전역 hook을 설치합니다.
- **차용**
  - Stop 계약 hook: 스킬 1회 실행당 1번만 차단합니다. 게이트 상한은 단계당 3회, 실행당 12회이고 상한에 닿으면 `exhausted`를 기록하고 통과시킵니다.
  - 기록 어휘: fired / blocked / released / exhausted / skipped / error
  - `careful/bin/check-careful.sh` 가드
    - 판정은 `hookSpecificOutput` 안에 넣습니다.
    - 실제 JSON 파서를 씁니다.
    - 위험도를 HIGH = deny, MEDIUM = ask로 나눕니다.
    - 빌드 산출물 삭제는 예외입니다.
  - 리뷰 지적에 `file:line`과 원문 인용이 없으면 신뢰도를 강등합니다.
  - `gate-integrity.md`의 RH 목록. 특히 RH-10(AC 수정으로 진척을 꾸며냄)
  - QA 증거 폴더 `run-YYYYMMDDTHHMMSSZ`는 덮어쓰지 않습니다. 건강 점수는 테스트하지 않은 범주를 빼고 계산합니다(provisional).
  - autoplan의 결정 3분류: Mechanical / Taste / User Challenge
  - 상태 코드: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT
  - 게이트 설정은 base 브랜치에 커밋된 파일에서만 읽습니다. 판정은 SHA에 묶습니다.
  - 무인 실행에서 차단 메시지에 비상 해제 스위치를 노출하지 않습니다.
- **비판·한계**
  - README 자체 측정에서 fix rate 향상이 없었습니다: 58/100(gstack) 대 61/99(기본).
  - 스킬마다 프리앰블과 텔레메트리가 붙어 토큰 부담이 큽니다.
  - SKILL.md가 큽니다(qa 29.7KB, autoplan 43KB).
  - Bun 바이너리는 서명되지 않았습니다.
- **출처**: https://github.com/garrytan/gstack (`docs/skill-gates.md`, `docs/skill-routing-and-contracts.md`, `careful/bin/check-careful.sh`, `qa/SKILL.md`, `review/gate-integrity.md`, `autoplan/SKILL.md`, `ETHOS.md`)

### pstack (Cursor 원본 v0.15.46 / Claude 포트 pstack-claude v0.9.153)
- **구조**
  - 원본은 `.cursor-plugin/plugin.json`(skills·agents만 선언)이고 hook이 없습니다.
  - 라우터 `poteto-mode`는 플레이북 22개, `principle-*` 스킬 24개, `worker.md` 서브에이전트 서문으로 이루어집니다.
  - Claude Code에 공식 설치할 수 있습니다: `/plugin install pstack@cursor-plugins`.
  - thermo-nuclear-review는 pstack이 아니라 별도 `thermos` 플러그인입니다.
- **차용**
  - 작업 유형별 플레이북(feature, bug-fix, investigation, refactor, perf, prototype)
  - `worker.md` 규칙
    - kickoff에 적힌 기준이 전부이고, 거기에 게이트를 덧붙이지 않습니다.
    - 사람에게 질문하는 도구는 쓰지 않습니다.
    - 되돌릴 수 있는 선택은 직접 하고 보고합니다.
  - `interrogate`: 실행으로 증명한 지적만 남깁니다.
  - `blast-radius`: 증명 사다리 1~5단계
  - 판정은 VERIFIED / NOT VERIFIED / INCONCLUSIVE입니다. 판정은 patch-id와 SHA에 묶고, 머지 후 실제 상태를 다시 읽습니다.
  - `create-verification-skill`: 프로젝트 전용 verify 스킬을 만듭니다. "Never weaken the journey to make it pass."
  - `show-me-your-work`: TSV 원장(추가 전용, 수식 주입 방지)
  - autonomous-run: 종료 조건을 checkable predicate로 쓰고, 정체되었다고 멈추지 않습니다.
  - attack-the-premise: 같은 전제로 2회 실패하면 전제부터 검증합니다.
  - eval 블라인딩
- **비판·한계**
  - 라우터 품질이 하네스마다 다릅니다.
  - 다른 벤더 모델의 리뷰를 전제로 합니다.
  - 기본 원장은 커밋하지 않습니다.
- **출처**: https://github.com/cursor/plugins/tree/main/pstack , https://github.com/michael-denyer/pstack-claude

### superpowers (obra/superpowers, v7.0.2, MIT)
- **구조**: 스킬 15개 내외입니다. hook은 SessionStart(`startup|clear|compact`) 하나이고, 나머지 게이트는 모두 프롬프트와 bash 헬퍼입니다.
- **차용**
  - 구현자 응답: 상세는 파일에 쓰고 응답은 15줄 이하, 상태 코드 4종을 씁니다. 하위 에이전트는 만들지 않습니다.
  - base-SHA 리뷰 패키지: `BASE..HEAD` diff 파일을 만들고, 범위가 비었거나 HEAD가 BASE의 후손이 아니면 거부합니다.
  - `progress.md` 원장: 첫 줄에 plan 식별자를 둡니다. compaction 뒤 재작업을 막습니다.
  - fix-loop circuit breaker. 캡에 닿으면 park 또는 Ruling으로 처리합니다.
  - preflight 충돌표
  - 리뷰어 규율: 구현자 보고를 믿지 않고, 지적 강도를 낮추라고 코칭하지 않습니다.
  - 계획 문서 형식: `Spec:` 포인터, Global Constraints, Interfaces, Review Focus
  - verification Iron Law와 합리화 표(`| 핑계 | 실제 |`)
  - 스킬 압력 테스트: RED → GREEN → REFACTOR
- **릴리스 노트 교훈**
  - spec/plan 리뷰 루프는 약 25분을 더 쓰고도 품질이 같아서 제거됐습니다(v5.0.6).
  - spec reviewer는 builder check로 바뀌었습니다(v7.0.0).
  - 모델을 명시하지 않으면 최상위 모델을 상속합니다. 리뷰어 26개가 전부 최상위 모델로 돈 적이 있습니다(v6.0.0).
  - compaction 뒤 스킬은 20,000자에서 잘립니다(v7.0.1).
- **비판·한계**
  - 토큰 비용이 큽니다: 약 588k에서 약 1.48M로 늘어난 사례가 있습니다(dev.to).
  - 게이트를 hook이 아니라 프롬프트로 강제합니다.
- **출처**: https://github.com/obra/superpowers (`RELEASE-NOTES.md`, `skills/subagent-driven-development/*`, `skills/brainstorming/*`, `skills/writing-plans/SKILL.md`, `skills/writing-skills/*`)

### bkit (ww-w-ai/bkit-claude-code, v2.1.41, Apache-2.0)
- **구조**
  - 스킬 44개, 에이전트 34개, hook 핸들러 28개(21개 이벤트, 모두 command 타입), `lib/` 모듈 약 200개
  - 흐름: PDCA(pm → plan → design → do → check → act → qa → report)
  - check 단계에서 gap-detector가 matchRate를 계산합니다. 90% 미만이면 pdca-iterator가 최대 5회 돕니다.
- **차용**
  - 무인 실행의 가드는 ask가 아니라 deny와 기록으로 합니다(#148: ask 대기로 약 15분씩 2회 손실).
  - 명령은 세그먼트 단위로 매칭하고, 음성 대조군을 둡니다(49/49).
  - hook 입력의 `permission_mode`를 인식합니다. 무해한 명령이 멈춘 횟수가 14건에서 0건이 됐습니다.
  - loop breaker: 같은 에러 3회, 같은 파일 10회, 에이전트 재귀 3회
  - Context Anchor 5줄(WHY / WHO / RISK / SUCCESS / SCOPE)과 plan-plus의 Failure map
  - Functional Depth로 얕은 구현을 감지합니다(보조 신호).
  - hook liveness 기록
  - SessionStart 중복 주입 방지: SHA-256 지문
  - 상태 값마다 쓰는 쪽은 하나
  - 예산 1M 토큰, 단계 시간 4시간
- **교훈(조용한 고장)**
  - FileChanged hook은 한 번도 실행되지 않았습니다.
  - pre-write 가드는 payload에 없는 필드를 읽고 있었습니다.
  - 테스트 파일 148개가 러너에 연결되어 있지 않았습니다.
  - timeout을 ms 단위로 잘못 적었습니다.
  - Chrome 감지 오류로 L3~L5 검사를 매번 건너뛰었는데 결과는 통과로 나왔습니다.
  - 정리하면 "모듈 테스트 통과는 필요조건일 뿐"입니다.
- **비판·한계**
  - SubagentStop이 서브에이전트를 반복해서 깨웠습니다(#162, 약 120k 토큰).
  - 가드 오탐이 약 12건 있었습니다.
  - LLM이 매긴 % 점수가 측정값처럼 보입니다.
  - 확인된 사용자(dogfooder)는 2명입니다.
- **출처**: https://github.com/ww-w-ai/bkit-claude-code (README-FULL, CHANGELOG, `hooks/hooks.json`, `lib/control/loop-breaker.js`, `agents/gap-detector.md`, 이슈 #145 #148 #161 #162 #166)

### spec-kit (github/spec-kit, 1.0)
- **구조**: `constitution` → `specify` → `clarify` → `plan` → `tasks`(`[P]`는 병렬 가능) → `analyze` → `implement` → `converge`
- **차용**
  - 모호한 부분은 `[NEEDS CLARIFICATION]`으로 표시하고 추측하지 않습니다.
  - Test-First 조항
  - converge 루프: 코드와 spec이 수렴할 때까지 반복합니다.
- **비판**: Böckeler는 문서가 장황하고 작은 버그에도 과한 절차라고 지적했습니다.
- **출처**: https://github.com/github/spec-kit , https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html

### BMAD-METHOD (v6.12, v7 alpha)
- **구조**: 역할별 에이전트가 있습니다: Analyst, PM, PO, Architect, UX, Dev. 흐름은 Clarify → Plan → Build & Verify → Learn이고, Ticket Tree로 관리합니다.
- **차용**: 역할마다 산출물 문서를 둡니다. 적대적 리뷰 렌즈(`bmad-review`)를 씁니다.
- **한계**: 역할과 문서가 많아 개인용으로는 무겁습니다.
- **출처**: https://github.com/bmad-code-org/BMAD-METHOD , https://docs.bmad-method.org/

### compound-engineering (EveryInc, 스킬 38개)
- **구조**: brainstorm → plan → work → compound(학습 기록). `/lfg`는 계획부터 PR과 CI 감시까지 무인으로 돌립니다.
- **차용**: 전문 리뷰어를 병렬로 돌린 뒤 P1/P2/P3으로 합칩니다. 브라우저 테스트가 파이프라인에 들어 있습니다.
- **한계**: 현재 리뷰어 페르소나 목록은 확인하지 못했습니다.
- **출처**: https://github.com/EveryInc/compound-engineering-plugin , https://every.to/guides/compound-engineering

### claude-plugins-official (Anthropic)

| 플러그인 | 차용 |
|---|---|
| feature-dev | 구현 전에 병렬로 탐색하고, 아키텍처 안 2~3개와 추천을 냄 |
| code-review | 병렬 에이전트 4개, 신뢰도 0~100 중 80 미만 제거, 오탐 필터 |
| pr-review-toolkit | silent-failure-hunter |
| ralph-loop | Stop hook으로 같은 프롬프트를 반복. 판단이 필요한 작업에는 쓰지 말라는 경고 |
| security-guidance | 편집 시 보안 패턴 경고, Stop 시 diff 리뷰 |
| hookify | markdown 규칙을 hook으로 변환 |
| plugin-dev, skill-creator, session-report | 개발 도구, 비용 측정 |

- **출처**: https://github.com/anthropics/claude-plugins-official

### 기타 커뮤니티

| 이름 | 차용할 아이디어 | 판정 |
|---|---|---|
| GSD (get-shit-done) | 오케스트레이터는 컨텍스트 30~40%만 쓰고 작업자는 새 창에서 돌림. 크기 상한이 있는 STATE.md, resume 명령 | 차용 |
| Everything Claude Code (affaan-m) | "instinct"에 신뢰도를 붙여 기록하고 `/evolve`로 스킬로 승격 | 조정(별도 원장 없이 evolve가 실행 기록 분석) |
| wshobson/agents | 모델 3계층(opus: 설계·보안·리뷰 / inherit / haiku: 결정적 작업) | 차용 |
| oh-my-claudecode | 키워드로 모드 전환, 에이전트별 모델 계층 | 참고 |
| Kiro specs | EARS 형식 요구사항, 작업을 요구사항에 추적 연결, 의존성 순서대로 묶음 | 차용(AC ID) |
| AGENTS.md (Linux Foundation AAIF) | 에이전트 공용 프로젝트 지침 파일 | 셋팅 단계에서 읽고 씀 |
| claude-flow / ruflo | 공개 감사에서 swarm 계층의 상당 부분이 stub으로 나옴 | **회피** |

- **출처**: https://www.mintlify.com/gsd-build/get-shit-done , https://www.mintlify.com/affaan-m/everything-claude-code , https://github.com/wshobson/agents , https://kiro.dev/docs/specs/concepts , https://github.com/ruvnet/ruflo/discussions/1513

## 3. Claude Code 공식 문서에서 확인한 사실 (설계 전제)

| 항목 | 사실 | 문서 |
|---|---|---|
| 플러그인 루트 CLAUDE.md | 로드되지 않고 validate 경고. `--strict`면 실패 | /docs/en/plugins-reference |
| 경로 변수 | `${CLAUDE_PLUGIN_ROOT}`는 업데이트마다 바뀜. `${CLAUDE_PLUGIN_DATA}`는 플러그인별 경로이고 제거 시 삭제. Bash 도구 환경에는 export되지 않음 | 〃 |
| 플러그인 에이전트 | `hooks`, `mcpServers`, `permissionMode`, `initialPrompt`를 무시 | /docs/en/sub-agents |
| 서브에이전트 | AskUserQuestion을 쓸 수 없음. 기본적으로 3단계까지 중첩 | 〃 |
| exit 코드 | exit 2는 차단. exit 1과 JSON 파싱 실패는 비차단 오류 | /docs/en/hooks |
| Stop 출력 | 최상위 `decision:"block"`과 `reason`. 입력에 `stop_hook_active`, `last_assistant_message`, `background_tasks` 포함 | 〃 |
| Stop 연속 차단 | 도구 호출 없이 8회 연속이면 강제 해제(`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) | /docs/en/hooks-guide |
| PreToolUse | `permissionDecision`은 `hookSpecificOutput` 안. `defer`는 `-p` 전용이고 턴을 끝냄. `-p`에서 `ask`는 거부로 처리 | /docs/en/hooks |
| 출력 상한 | 출력 필드는 10,000자에서 잘림 | 〃 |
| `onFailure:"block"` | hook 실패 시 동작을 막음(v2.1.295+) | 〃 |
| 병렬 실행 | 매칭된 hook들은 병렬로 실행 | 〃 |
| 스킬 복원 | auto-compact 뒤 스킬마다 앞 5,000토큰만 복원, 전체 25,000토큰 예산 공유 | /docs/en/skills |
| worktree | `worktree.baseRef`(`fresh` 또는 `head`). 추적 파일과 `.worktreeinclude`만 들어감. 메인 checkout 쓰기 차단. hook 경로는 worktree를 따라가지 않음 | /docs/en/worktrees |
| `claude plugin eval` | 케이스 × 3회 × 2 arm(플러그인 있음·없음). grader 6종. 커스텀 코드 grader 없음. 임시 HOME, sandbox | /docs/en/plugin-evals |
| `/goal` | 세션 범위의 prompt 기반 Stop. 평가자는 도구를 호출하지 않음 | /docs/en/goal |
| routines | GitHub 저장소와 GitHub App 필요. 기본 push 대상은 `claude/` 브랜치. research preview | /docs/en/routines |

문서 기준 URL: https://code.claude.com/docs/en/ . 출력 형식과 상한 값은 실제 구현 전에 스파이크로 다시 확인합니다.

## 4. 하네스·컨텍스트·루프 엔지니어링 실무

| 출처 | 날짜 | 핵심 원칙 | 판정 |
|---|---|---|---|
| [OpenAI, Harness engineering](https://openai.com/index/harness-engineering/) | 2026-02-11 | AGENTS.md는 약 100줄짜리 목차. 커스텀 린터 메시지에 수정 지침. 구조 테스트. 문서 정리·GC 에이전트 | 차용 |
| [Böckeler, Harness engineering](https://martinfowler.com/articles/harness-engineering.html) | 2026-04-02 | 가이드와 센서, 계산형을 먼저. AI가 만든 테스트는 증거로 부족. 한 번도 울리지 않는 센서를 의심 | 차용 |
| [Hashimoto](https://mitchellh.com/writing/my-ai-adoption-journey) | 2026-02-05 | 실수 1건마다 규칙 1줄 또는 도구 1개 | 차용(evolve) |
| [Anthropic, long-running harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | 2025-11-26 | 기능 목록은 JSON이고 `passes`만 수정. 세션당 기능 1개. 시작 시 init.sh와 기본 E2E | 차용 |
| [Anthropic, harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps) | 2026-03-24 | planner·generator·evaluator(Playwright). 구성요소마다 가정이 들어 있으니 모델이 바뀌면 하나씩 빼며 검증 | 차용 |
| [Anthropic, context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 2025-09-29 | 신호 밀도가 높은 최소 토큰, 구조화된 메모, 서브에이전트는 요약해 반환 | 차용 |
| [Huntley, Ralph](https://ghuntley.com/ralph/) | 2025-07-14 | 루프 1회에 작업 1개. 테스트와 타입으로 back-pressure | 차용 |
| [Pragmatic Engineer, loop engineering](https://newsletter.pragmaticengineer.com/p/what-is-loop-engineering) | 2026-07-14 | 목표·검증·종료 조건. drift와 비용 비판 | 참고 |
| [Cognition, Don't build multi-agents](https://cognition.com/blog/dont-build-multi-agents) | 2025-06-12 | 컨텍스트를 공유하라. 행동에는 암묵적 결정이 들어 있음 | 차용 |
| [Cognition, Multi-agents working](https://cognition.com/blog/multi-agents-working) | 2026-04-22 | 쓰기는 단일 스레드. 깨끗한 컨텍스트의 리뷰어는 효과적. 병렬 writer는 실패 | 차용 |
| [Cursor, scaling agents](https://cursor.com/blog/scaling-agents) | 2026-01-14 | planner·worker·judge. integrator를 빼니 나아짐. 역할별 모델 | 참고 |
| [12-factor agents](https://github.com/humanlayer/12-factor-agents) | 2025 | 컨텍스트 창을 직접 관리. 작고 집중된 에이전트 | 차용(이미 일치) |
| [Horthy, ACE-FCA](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md) | 2025-08(추정) | research → plan → implement. 컨텍스트 40~60% 유지. 의도적 compaction | 차용 |
| [Anthropic, best practices](https://code.claude.com/docs/en/best-practices) | 조사일 기준 | 꼭 지켜야 하는 것은 hook과 deny로. 같은 일을 서브에이전트에 넘기는 건 무의미하고 새 리뷰어는 효과적. 리뷰어는 무엇이든 찾아냄 | 차용 |

## 5. 생태계 변화 추적 소스 (evolve 입력)

- Claude Code changelog: https://code.claude.com/docs/en/changelog
- 문서 색인: https://code.claude.com/docs/llms.txt (주간 diff로 새 페이지 확인)
- 공식 marketplace: https://github.com/anthropics/claude-plugins-official 의 `.claude-plugin/marketplace.json` diff
- 커뮤니티 목록: https://github.com/hesreallyhim/awesome-claude-code , https://github.com/marckrenn/claude-code-changelog

## 6. 개작 대상 스킬 라이선스

GitHub API로 2026-11-24 확인했습니다. 저장소 단위 라이선스입니다.

| 스킬 | 저장소 | 라이선스 | 설치 수(skills.sh) | 개작 용도 |
|---|---|---|---|---|
| grill-me | mattpocock/skills | MIT | 1.6M | 1단계 grill |
| batch-grill-me | mattpocock/skills | MIT | 61.4K | 질문 일괄(비차단) |
| tdd | mattpocock/skills | MIT | 1.3M | builder TDD |
| git-guardrails-claude-code | mattpocock/skills | MIT | 579.3K | 비가역 가드 |
| verification-before-completion | obra/superpowers | MIT | 287.3K | 완료 전 증거 |
| review-pr | warpdotdev/common-skills | MIT | 29.9K | pr-reviewer |
| writing-changelogs | riekelt/technical-writer | MIT | 27.4K | CHANGELOG |

개작할 때는 원본 저장소, 라이선스, 저작권 표기를 플러그인 `NOTICE`(또는 각 SKILL.md 끝)에 남깁니다.

## 7. skills.sh 검색 결과 (`npx skills find`, 2026-11-24)

| 용도 | 후보 | 설치 수 | 판단 |
|---|---|---|---|
| Playwright E2E | bobmatnyc/claude-mpm-skills@playwright-e2e-testing | 2.7K | 출처 검증 부족, 참고만 |
| hook 작성 | anthropics/claude-code@hook-development | 14.5K | 개발용 설치 |
| 플러그인 구조 | anthropics/claude-code@plugin-structure | 13.9K | 개발용 설치 |
| 스킬 작성 | anthropics/skills@skill-creator | 440.4K | 이미 설치됨 |
| 기획 | addyosmani/agent-skills@spec-driven-development | 83.3K | 참고 |
| PR 리뷰 | warpdotdev/common-skills@review-pr | 29.9K | 개작 |
| 검증 | affaan-m/ecc@verification-loop | 13.5K | 참고 |
| 변경 기록 | wshobson/agents@changelog-automation | 14.5K | 대안 |
| 서브에이전트 오케스트레이션 | 모두 100 미만 | — | 제외 |
