# 내부 계약 (구현자용)

모든 구성요소가 지키는 공통 인터페이스. 기획서: 저장소 `docs/spec/spec-v0.1.md`.

## 경로
- 플러그인 루트 `P` = `${CLAUDE_PLUGIN_ROOT}` (= `plugins/murba-good-work`)
- 프로젝트 루트 = `$CLAUDE_PROJECT_DIR`, 없으면 hook 입력 `cwd`, 없으면 `process.cwd()`
- 실행 상태 = `<프로젝트>/.murba/` (init이 `.murba/.gitignore`(`*`)로 git에서 제외. 프로젝트 `.gitignore`는 바꾸지 않음)

## .murba/ 파일
| 파일 | 쓰는 주체 | 내용 |
|---|---|---|
| `state.json` | `murba` CLI만 | `{schema:1, plugin_version, phase, auto:false, approved:false, mode:"interactive"\|"headless", started_at, ac:{<ID>:{text, browser:bool, held:false, verdicts:[{verdict,sha,evidence,at}], final_verdict, fix_rounds, last_pass_sha}}, ac_order:[], current_ac, final_sha, spec_hash, test_hashes:{path:sha256}, counters:{stop:{<phase>:n}, stop_total:n, subagents:n}, budget:{max_minutes:120, max_subagents:40, max_fix_rounds_total:15}}` |
| `events.jsonl` | `murba` CLI, hooks | 추가 전용 `{ts, kind, ...}` |
| `run-plan.json` | 오케스트레이터(triage 응답 기록) | task_type, scope_mode, phases, agents, throughput, budget |
| `spec.md` | 오케스트레이터 | 기획서. AC 줄 형식: `- AC-001 [browser] [after:AC-002] WHEN … THE SYSTEM SHALL …` (태그는 선택, 순서 무관) |
| `ac-test-map.md` | 오케스트레이터 | AC → 테스트 파일 → 검증 방법 |
| `decisions.tsv` | `murba decide` | 열: ts, phase, class, decision, why, evidence, cost_if_wrong |
| `handoff/<phase>.md` | 오케스트레이터 | 목표·접근·완료·현재 실패·다음 1개·근거 파일 |
| `reports/<agent>/*.md` | 해당 에이전트(쓰기 도구 있으면) 또는 오케스트레이터 | 상세 보고 |
| `hidden/` | test-writer | 숨긴 검사. builder 접근 금지 |
| `evidence/run-<UTC>/` | evaluator(Bash 실행 결과) | `AC-001.png`, `AC-001.log` 등. 덮어쓰기 금지 |
| `logs/hooks.jsonl` | hooks | `{ts, hook, event:fired\|blocked\|released\|exhausted\|skipped\|error, ...}` |
| `report.md`, `report.html` | `murba report` | 보고서 |
| `state.sha256` | `murba` CLI·hook(`updateState`)만 | state.json의 sha256. CLI 밖에서 state.json이 바뀌면 어긋남 → `LEDGER_TAMPERED`. init이 state에 `ledger_hash:true`를 남기므로, 해시 파일이 지워져도 `LEDGER_TAMPERED`(다시 만들지 않음) |
| `approve-token` | guard만 | 대화형 `murba approve`에 ask를 낼 때 `{"ts":"<ISO>"}` 기록. CLI approve가 10분 안의 토큰을 확인하고 지운다 |
| `caller` | guard만 | PreToolUse마다 호출자 기록: `murba-good-work:<에이전트>` 또는 `main`. CLI가 읽어 서브에이전트의 상태 변경을 거부 |

## `murba` CLI (`P/bin/murba` → `P/scripts/murba-cli.mjs`, Bash에서 PATH로 실행)
종료 코드: 0 성공, 1 사용 오류, 2 전이 거부/조건 미충족, 3 상한 도달.
- **호출자 검사**(모든 명령 전): `.murba/caller`가 서브에이전트면 status·check-tests·help·budget(`--subagent` 없이)만 허용, evidence-run은 evaluator만. 그 외 `CALLER_SUBAGENT`(종료 코드 2). 호출 방식(절대 경로·`node murba-cli.mjs`·스크립트 파일)과 무관. 파일이 없으면 main. 한계: 에이전트를 동시에 돌리면 표식이 공유된다(현재 서브에이전트는 전경 실행만)
- **원장 검사**(status·report·init·help 제외): `state.sha256`과 state.json이 어긋나면 `LEDGER_TAMPERED`(종료 코드 2, 이벤트 1회). status·report는 실행하고 ❌로 표시. 변조된 원장에 hook이 쓰더라도 해시는 갱신하지 않는다
| 명령 | 동작 |
|---|---|
| `murba init [--headless] [--auto-approve] [--force]` | `.murba/` 생성(에이전트별 `reports/<이름>/` 포함), state 초기화(phase=triage), `.murba/.gitignore` 작성, 기준선 기록(`base_sha`=git HEAD, `base_dirty`=init 때 이미 바뀐 구현 파일의 내용 해시). 사전 승인(`MURBA_HEADLESS=1` 또는 `--auto-approve`)은 이때만 기록. 재초기화로 사전 승인을 새로 켤 수 없다(이전 원장에 없었거나 원장 변조 시 종료 코드 2). `--force` 재초기화는 승인·테스트 잠금을 지우고 user-direction 결정으로 기록(새 실행: 기준선을 다시 잡음). 대화형 원장을 headless·자동 승인으로 재초기화하면 거부(종료 코드 2) |
| `murba status [--json]` | phase, 다음 가능 단계, 남은 조건, AC 요약 |
| `murba phase <next>` | 현재 phase의 requires 확인 → 전이표 확인 → 기록. `setup` 진입 시 `auto=true`. build·evaluate·fix·qa·browser 진입은 승인 + 테스트 잠금 필요. 승인 후 spec.md가 바뀌었으면 `SPEC_EDITED`(종료 코드 2). 고정 테스트가 바뀌었으면 모든 전이에서 `TESTS_CHANGED`(종료 코드 2) |
| `murba phase <target> --skip "<사유>"` | 기본 순서(`chain`)상 앞의 단계로 건너뜀. 지나간 단계는 `state.skipped[단계]=사유`로 기록하고 requires 검사 안 함. `report` 너머로는 불가. **모든 생략**(어느 단계·어느 목표든)은 원장에 고정된 과제 성격이 `task_type=investigation`이거나 `risky=true`(목표는 `report`만)일 때만. 과제 성격은 triage를 떠날 때(`murba phase grill`) run-plan에서 `state.task_type`·`state.risky`로 고정되고 이후 run-plan 수정은 무시한다. `decisions.tsv`의 irreversible 행은 생략을 허가하지 않는다. 구현 작업은 작아도 생략 불가(AC 1개로 진행). 승인 후 단계 진입 조건은 생략으로도 못 넘는다. 보고서에 ⏸ 행 |
| `murba ac sync` | spec.md의 AC 줄을 파싱해 state.ac 갱신(승인 후 변경은 거부: ACCEPTANCE_EDITED. 승인 없이 approve 뒤 단계에 있으면 거부) |
| `murba ac next` | 선행 AC(`[after:AC-xxx]`)가 모두 VERIFIED/보류인 다음 미완료 AC를 current_ac로 지정. 없으면 종료 코드 2(남은 AC가 선행 미충족이면 그 목록 출력). current_ac=null이면 `@current_ac_verdict`는 보류 안 된 모든 AC에 판정이 있을 때 충족 |
| `murba ac unhold <ID>` | 보류 해제 |
| `murba ac verdict <ID> <VERIFIED\|NOT_VERIFIED\|INCONCLUSIVE> --sha <sha> [--evidence <path>] [--final]` | 판정 기록. VERIFIED면 last_pass_sha 갱신 |
| `murba ac hold <ID> --reason <r>` | 보류(보고서에 ❌). `--final VERIFIED` 판정이 오면 자동 해제(`unheld_by_final`) |
| `murba phase fix --ac <ID>` (qa에서) | 최종 판정이 VERIFIED 아닌 AC를 다시 수정. current_ac=ID. 수정 상한이면 종료 코드 3 |
| `murba fix-round <ID>` | fix_rounds+1, 3 초과 시 종료 코드 3 |
| `murba approve [--human]` | spec_hash 고정, approved=true. headless는 init 때 사전 승인(`--auto-approve` 또는 `MURBA_HEADLESS=1`)이 기록된 경우만(승인 시점 환경변수는 보지 않음). 대화형은 guard가 사람 확인(ask) 때 쓴 `approve-token`(10분)이 있어야 함, 없으면 `APPROVE_NEEDS_HUMAN`(종료 코드 2). `--human`은 hook이 한 번도 돈 적 없는 곳(`caller` 없음: 테스트·사람이 터미널에서 직접)에서만 토큰 대신 인정 |
| `murba lock-tests <glob...>` | 테스트 파일 sha256을 test_hashes에 기록. setup·test-write 단계에서만 |
| `murba lock-tests --amend <glob...> --reason "<r>"` | build·fix·evaluate에서, **이미 고정된** 테스트 자체의 결함을 test-writer가 고친 뒤 재고정. taste 결정 `TEST_AMENDED: <파일>` + 보고서 ⚠️ |
| `murba check-tests` | 해시 비교, 바뀐 파일 있으면 종료 코드 2 + 목록 |
| (게이트) `SOURCE_CHANGED_BEFORE_TESTS` | `murba approve`(조사 제외)와 `murba lock-tests`(--amend 제외)는 `base_sha` 이후 바뀐 구현 파일이 있으면 종료 코드 2. 구현 파일 = impl_globs 또는 코드 확장자, 테스트·설정·`.murba/`·루트 `.gitignore`와 통째로 추적 안 된 의존성 이름 폴더(`node_modules`·`dist` 등) 제외, 추적 안 된 새 파일·삭제·이름 바꾸기(옛 경로) 포함, 경로는 프로젝트 폴더 기준. init 때 이미 바뀐 파일은 내용이 `base_dirty`와 같으면 제외(되돌려도 변경). 어떤 경로(Bash·스크립트·서브에이전트)로 고쳤든 결과로 잡는다. git 저장소가 아니거나 init 때 커밋이 없거나 git이 없으면 검사 생략(이벤트 기록). 기준 커밋이 있는데 git이 실패하면 `SOURCE_GATE_ERROR`로 종료 코드 2 |
| (게이트) `SOURCE_CHANGED_IN_SKIPPED_RUN` | 생략 경로에 build가 있거나(build에서 출발하는 생략 포함), 미검증 AC가 남은 채 evaluate가 있으면 `--skip`과 그 실행의 `report → done`에서 위와 같은 규칙으로 구현 파일 변경이 있으면 종료 코드 2(승인 여부와 무관). `report → build` 재작업은 build 이후의 생략 기록을 지운다. 이 게이트는 어느 폴더의 `.gitignore` 변경도 변경으로 본다(자기 자신을 무시하는 새 파일 포함, init 때 이미 바뀐 것은 기준선). 두 게이트 모두 assume-unchanged·skip-worktree 표시 파일도 내용을 비교 |
| `murba decide <mechanical\|taste\|user-direction\|irreversible> "<결정>" --why "<이유>" [--cost "<틀렸을 때 비용>"] [--evidence <p>]` | decisions.tsv 추가 |
| `murba handoff <phase>` | stdin을 handoff/<phase>.md로 저장 |
| `murba evidence-run` | `.murba/evidence/run-<UTC>/` 생성, 경로를 `.murba/evidence/CURRENT`에 쓰고 출력. 테스트는 `MURBA_EVIDENCE_DIR` 환경변수가 없으면 `CURRENT` 파일 경로를 쓴다(명령 앞 환경변수 지정은 권한 거부되므로) |
| `murba budget` | 경과 시간·서브에이전트 수 확인, 초과 시 종료 코드 3 |
| `murba report` | report.md + report.html 생성(결정적 스크립트) |

## hook 입력·출력
- 비상 해제: 사람이 실행할 때 환경변수 `MURBA_DISABLE=1`이면 모든 hook no-op(프로젝트 안 파일로는 끌 수 없음. 차단 메시지에 언급 금지)
- SessionStart: `.murba/state.json` 있으면 `hookSpecificOutput.additionalContext` 2,000자 이하(첫 줄·끝 줄에 phase와 다음 행동)
- PreToolUse: 차단은 `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`. matcher에 `ScheduleWakeup|CronCreate` 포함: murba 실행 중(phase가 done 아님)에는 예약 호출을 거부(서브에이전트 완료는 턴 종료 뒤 알림으로 옴). 승인 전 메인 세션의 쓰기 차단은 프로젝트 `.gitignore`에도 적용
- Stop: 차단은 최상위 `{"decision":"block","reason":"..."}`. exit 2 사용 금지. headless(`state.mode=headless`)면 승인 전 단계에서도 작동: 질문으로 끝나거나 report.md가 없으면 차단(단계당 3·전체 12회 상한 공유). 보고서가 있고 approve/report 단계면 통과
- `agent_type` 값: `murba-good-work:builder` 등(접두 포함). 메인 세션이면 없음
- 에이전트 이름: `triage`, `spec-reviewer`, `test-writer`, `builder`, `evaluator`, `pr-reviewer`

## 테스트 파일 판정(guard 공용)
테스트·보호 경로 패턴: `**/*.test.*`, `**/*.spec.*`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/e2e/**`, `**/conftest.py`, `**/playwright.config.*`, `**/vitest.config.*`, `**/jest.config.*`, `**/pytest.ini`, `package.json`의 test 스크립트 변경(Bash/Edit로), `.murba/**`, `.claude/settings*.json`
