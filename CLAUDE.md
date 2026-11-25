# murba-good-work 지역 지침

이 폴더는 **매우 신뢰할 수 있는 개발**을 돕는 Claude Code 플러그인 `murba-good-work`를 만드는 저장소다.
이 파일은 목차다. 규칙 본문은 `docs/rules/`에 있고 작업 전에 해당 파일을 읽는다.

## 현재 상태
- 단계: main = 플러그인 0.1.5(`sed -i` 해석, v0.1.4 알려진 문제 수정). tag·Release는 [v0.1.5](https://github.com/murbachovski/murba-good-work/releases/tag/v0.1.5)까지. 독립 역할 강제 [ADR 0007](docs/decisions/0007-enforce-independent-roles.md). 보고서 [261125-v0.1.5](docs/history/261125-v0.1.5.md), [261125-v0.1.4](docs/history/261125-v0.1.4.md), [261124-v0.1.3](docs/history/261124-v0.1.3.md). 시험 변경 [ADR 0002](docs/decisions/0002-scenario-test-changes.md), guard 위협 모델 [ADR 0003](docs/decisions/0003-guard-threat-model.md), `.gitignore`·예약 호출 [ADR 0006](docs/decisions/0006-no-wakeups-and-gitignore.md)
- 비교 평가: [예비 비교](docs/evaluation/261124-pilot.md), [확장 비교 25×3](docs/evaluation/261124-full.md)(murba vs pstack vs 플러그인 없음)
- CI: GitHub Actions(Node 18·20·22 테스트 + validate), main 보호(CI 필수)
- 다음 후보: grill 단독 실행 시 `murba init` 없음(0.1.0부터), 0.1.4 역할 강제의 test-write 단계 마찰(setup 보조 파일 → 러너 설정 수정 막힘) — 사용자 결정 대기
- 사용자용 안내: [README](README.md)
- 기준 문서: [기획서 v0.1](docs/spec/spec-v0.1.md) — 모든 구현은 기획서가 우선한다
- 결정 기록: [초기 결정 로그](docs/decisions/0001-initial-decision-log.md)

## 저장소 구조
| 경로 | 내용 |
|---|---|
| `.claude-plugin/marketplace.json` | marketplace. 플러그인 목록 |
| `plugins/murba-good-work/` | 플러그인 본체: skills, agents, hooks, scripts, bin, tests |
| `scenarios/` | 시나리오 과제(`tasks.json`)·시드·무인 실행기(`harness/`)·비교 평가 과제와 채점기(`eval/`) |
| `docs/spec/` | 기획서. 버전별 파일 |
| `docs/rules/` | 작업 규칙 (아래 목차) |
| `docs/research/` | 조사 자료: 플러그인·실무, 논문 |
| `docs/evaluation/` | 비교 평가 결과 |
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
