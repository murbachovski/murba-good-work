# 내부 계약 (구현자용)

모든 구성요소가 지키는 공통 인터페이스. 기획서: 저장소 `docs/spec/spec-v0.1.md`.

## 경로
- 플러그인 루트 `P` = `${CLAUDE_PLUGIN_ROOT}` (= `plugins/murba-good-work`)
- 프로젝트 루트 = `$CLAUDE_PROJECT_DIR`, 없으면 hook 입력 `cwd`, 없으면 `process.cwd()`
- 실행 상태 = `<프로젝트>/.murba/` (init 시 `.gitignore`에 추가)

## .murba/ 파일
| 파일 | 쓰는 주체 | 내용 |
|---|---|---|
| `state.json` | `murba` CLI만 | `{schema:1, plugin_version, phase, auto:false, approved:false, mode:"interactive"\|"headless", started_at, ac:{<ID>:{text, browser:bool, held:false, verdicts:[{verdict,sha,evidence,at}], final_verdict, fix_rounds, last_pass_sha}}, ac_order:[], current_ac, final_sha, spec_hash, test_hashes:{path:sha256}, counters:{stop:{<phase>:n}, stop_total:n, subagents:n}, budget:{max_minutes:120, max_subagents:40, max_fix_rounds_total:15}}` |
| `events.jsonl` | `murba` CLI, hooks | 추가 전용 `{ts, kind, ...}` |
| `run-plan.json` | 오케스트레이터(triage 응답 기록) | task_type, scope_mode, phases, agents, throughput, budget |
| `spec.md` | 오케스트레이터 | 기획서. AC 줄 형식: `- AC-001 [browser] WHEN … THE SYSTEM SHALL …` (`[browser]`는 선택) |
| `ac-test-map.md` | 오케스트레이터 | AC → 테스트 파일 → 검증 방법 |
| `decisions.tsv` | `murba decide` | 열: ts, phase, class, decision, why, evidence, cost_if_wrong |
| `handoff/<phase>.md` | 오케스트레이터 | 목표·접근·완료·현재 실패·다음 1개·근거 파일 |
| `reports/<agent>/*.md` | 해당 에이전트(쓰기 도구 있으면) 또는 오케스트레이터 | 상세 보고 |
| `hidden/` | test-writer | 숨긴 검사. builder 접근 금지 |
| `evidence/run-<UTC>/` | evaluator(Bash 실행 결과) | `AC-001.png`, `AC-001.log` 등. 덮어쓰기 금지 |
| `logs/hooks.jsonl` | hooks | `{ts, hook, event:fired\|blocked\|released\|exhausted\|skipped\|error, ...}` |
| `report.md`, `report.html` | `murba report` | 보고서 |
| `disable` | 사람만 | 있으면 모든 hook no-op (차단 메시지에 언급 금지) |

## `murba` CLI (`P/bin/murba`, Bash에서 PATH로 실행)
종료 코드: 0 성공, 1 사용 오류, 2 전이 거부/조건 미충족, 3 상한 도달.
| 명령 | 동작 |
|---|---|
| `murba init [--headless] [--auto-approve]` | `.murba/` 생성, state 초기화(phase=triage), `.gitignore`에 `.murba/` 추가 |
| `murba status [--json]` | phase, 다음 가능 단계, 남은 조건, AC 요약 |
| `murba phase <next>` | 현재 phase의 requires 확인 → 전이표 확인 → 기록. `setup` 진입 시 `auto=true` |
| `murba ac sync` | spec.md의 AC 줄을 파싱해 state.ac 갱신(approve 이후엔 거부: ACCEPTANCE_EDITED) |
| `murba ac next` | 다음 미완료 AC를 current_ac로 지정해 출력, 없으면 종료 코드 2 |
| `murba ac verdict <ID> <VERIFIED\|NOT_VERIFIED\|INCONCLUSIVE> --sha <sha> [--evidence <path>] [--final]` | 판정 기록. VERIFIED면 last_pass_sha 갱신 |
| `murba ac hold <ID> --reason <r>` | 보류(보고서에 ❌) |
| `murba fix-round <ID>` | fix_rounds+1, 3 초과 시 종료 코드 3 |
| `murba approve` | spec_hash 고정, approved=true. headless는 `--auto-approve`로 init된 경우만 |
| `murba lock-tests <glob...>` | 테스트 파일 sha256을 test_hashes에 기록 |
| `murba check-tests` | 해시 비교, 바뀐 파일 있으면 종료 코드 2 + 목록 |
| `murba decide <mechanical\|taste\|user-direction\|irreversible> "<결정>" --why "<이유>" [--cost "<틀렸을 때 비용>"] [--evidence <p>]` | decisions.tsv 추가 |
| `murba handoff <phase>` | stdin을 handoff/<phase>.md로 저장 |
| `murba budget` | 경과 시간·서브에이전트 수 확인, 초과 시 종료 코드 3 |
| `murba report` | report.md + report.html 생성(결정적 스크립트) |

## hook 입력·출력
- SessionStart: `.murba/state.json` 있으면 `hookSpecificOutput.additionalContext` 2,000자 이하(첫 줄·끝 줄에 phase와 다음 행동)
- PreToolUse: 차단은 `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`
- Stop: 차단은 최상위 `{"decision":"block","reason":"..."}`. exit 2 사용 금지
- `agent_type` 값: `murba-good-work:builder` 등(접두 포함). 메인 세션이면 없음
- 에이전트 이름: `triage`, `spec-reviewer`, `test-writer`, `builder`, `evaluator`, `pr-reviewer`

## 테스트 파일 판정(guard 공용)
테스트·보호 경로 패턴: `**/*.test.*`, `**/*.spec.*`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/e2e/**`, `**/conftest.py`, `**/playwright.config.*`, `**/vitest.config.*`, `**/jest.config.*`, `**/pytest.ini`, `package.json`의 test 스크립트 변경(Bash/Edit로), `.murba/**`, `.claude/settings*.json`
