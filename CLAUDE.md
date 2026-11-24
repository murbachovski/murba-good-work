# murba-good-work 지역 지침

이 폴더는 **매우 신뢰할 수 있는 개발**을 돕는 Claude Code 플러그인 `murba-good-work`를 만드는 저장소다.
이 파일은 목차다. 규칙 본문은 `docs/rules/`에 있고 작업 전에 해당 파일을 읽는다.

## 현재 상태
- 단계: 플러그인 v0.1.0 배포 완료(tag·[Release](https://github.com/murbachovski/murba-good-work/releases/tag/v0.1.0)). 보고서 [261124-v0.1.0](docs/history/261124-v0.1.0.md). 시험 변경 [ADR 0002](docs/decisions/0002-scenario-test-changes.md), guard 위협 모델 [ADR 0003](docs/decisions/0003-guard-threat-model.md)
- CI: GitHub Actions(Node 18·20·22 테스트 + validate), PR #4
- 다음: 대화형 시험(사용자 진행) → v0.1.1(spec-review 요구→AC 대응 검사, guard 비가역 목록에 `git reset --hard`·`git clean -fdx` 추가 — 사용자 결정 2026-11-24)
- 기준 문서: [기획서 v0.1](docs/spec/spec-v0.1.md) — 모든 구현은 기획서가 우선한다
- 결정 기록: [초기 결정 로그](docs/decisions/0001-initial-decision-log.md)

## 저장소 구조
| 경로 | 내용 |
|---|---|
| `.claude-plugin/marketplace.json` | marketplace. 플러그인 목록 |
| `plugins/murba-good-work/` | 플러그인 본체: skills, agents, hooks, scripts, bin, tests |
| `scenarios/` | 시나리오 과제(`tasks.json`)·시드·무인 실행기(`harness/`) |
| `docs/spec/` | 기획서. 버전별 파일 |
| `docs/rules/` | 작업 규칙 (아래 목차) |
| `docs/research/` | 조사 자료: 플러그인·실무, 논문 |
| `docs/decisions/` | 결정 기록(ADR). 번호 순, 추가만 |
| `docs/history/` | 작업 보고서. `YYMMDD-vX.Y.Z.md` + `.html`, 추가만 |
| `CHANGELOG.md` | 버전별 변경 |
| `.claude/settings.json` | 프로젝트 설정. 개발용 `plugin-dev` 플러그인 사용 |

플러그인 루트에 `CLAUDE.md`를 두지 않는다(로드되지 않고 `validate --strict` 실패).

## 규칙 목차 (작업 전 읽기)
| 파일 | 언제 읽나 |
|---|---|
| [docs/rules/workflow.md](docs/rules/workflow.md) | 모든 작업 시작 전. 질문·결정 큐·비가역 작업·커밋 규칙 |
| [docs/rules/plugin-authoring.md](docs/rules/plugin-authoring.md) | 스킬·에이전트·hook·eval 작성 시 |
| [docs/rules/docs-style.md](docs/rules/docs-style.md) | 문서 작성 시. 언어·파일명·형식 |
| [docs/rules/records.md](docs/rules/records.md) | 보고서·결정·버전 기록 시 |

## 핵심 원칙 (상세는 규칙 파일)
1. 기획서가 우선. 기획서와 다르게 하려면 결정 기록 먼저
2. 신뢰성 = 결정적 hook + 파일 원장 + 실행 증거 + 독립 평가자 + 동작이 증명된 테스트
3. "됐다"는 실행 증거(명령 + 출력 + 종료 코드)가 있을 때만
4. 질문은 선택형(AskUserQuestion)으로만, 되돌릴 수 있는 것은 추천안으로 진행하고 결정 큐에 기록
5. 시키지 않은 것은 하지 않는다. 필요해 보이면 먼저 묻는다
6. 이 저장소 커밋은 사용자 지시 때만

## 개발 도구
- 플러그인 작성 참고: `plugin-dev` 스킬(hook-development, plugin-structure, skill-development, agent-development)
  - 주의: plugin-dev의 hook 스킬은 prompt 타입 hook을 많이 다룬다. 이 플러그인은 **command 타입만** 쓴다
- 로컬 실행: `claude --plugin-dir ./plugins/murba-good-work`
- 편집 반영: `/reload-plugins`

## 검증 명령
```bash
claude plugin validate ./plugins/murba-good-work --strict   # 구조 검사
node --test 'plugins/murba-good-work/tests/*.test.mjs'      # hook·CLI 테스트(node 26은 디렉터리 인자 불가)
claude plugin eval ./plugins/murba-good-work                 # 동작 평가(evals/ 미작성 — v0.1.0은 scenarios/harness로 대신)
```

## 참고 자료
- 조사: [플러그인·실무](docs/research/plugin-survey.md), [논문](docs/research/papers.md)
- 공식 문서: https://code.claude.com/docs/en/plugins-reference , https://code.claude.com/docs/en/hooks
