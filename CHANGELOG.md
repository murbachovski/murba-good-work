# 변경 기록

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/). 추가만 한다.

- **문서 버전**(이 저장소 기록용): 설계 단계는 `v0.0.x`
- **플러그인 버전**(`plugins/murba-good-work/.claude-plugin/plugin.json`의 `version`): SemVer, 첫 동작 버전 `0.1.0`

## [Unreleased]

## [플러그인 0.1.2] - 2026-11-24
### 바뀜 ([ADR 0005](docs/decisions/0005-skipped-runs-and-baseline.md))
- `murba init`이 대상 저장소 `.gitignore`를 만들거나 고치지 않음. `.murba/.gitignore`(`*`)로 제외(v0.1.1 확장 비교: murba 25개 중 20개에서 사용자 커밋에 섞임, n13 실패)
- 승인 없이 생략한 실행(조사·위험 요청 보고)은 init 이후 구현 파일을 바꾸면 `--skip`과 `report → done`에서 거부(`SOURCE_CHANGED_IN_SKIPPED_RUN`). triage에서 과제 성격을 스스로 조사·위험으로 적어 생략한 뒤 직접 고치는 경로를 닫음
- init 때 이미 바뀌어 있던 파일은 내용 해시로 기준선 기록(`base_dirty`). 그대로면 소스 변경 게이트에서 제외. `init --force`는 처음 기준선 유지
### 검증
- 테스트 209개 통과(새 5개). 세 변경 각각을 되돌린 뮤테이션에서 새 테스트가 실패함을 확인

## [플러그인 0.1.1] - 2026-11-24
### 바뀜 ([ADR 0004](docs/decisions/0004-no-pipeline-skip-for-implementation.md))
- 구현 작업은 파이프라인을 건너뛸 수 없음: 모든 `--skip`은 triage를 떠날 때 원장에 고정한 과제 성격이 조사이거나 위험 요청(`risky`)일 때만. 결정 큐 기록은 생략을 열지 않음
- 소스 변경 게이트: `murba approve`·`lock-tests`는 init 이후 구현 파일이 바뀌었으면 거부(`SOURCE_CHANGED_BEFORE_TESTS`)
- 승인 전(triage~approve) 메인 세션의 `.murba/` 밖 쓰기 거부(조사 과제 제외, run-plan 작성 전은 미적용 — 미리 고친 코드는 test-write의 RED 확인에서 드러남)
- 작은 작업도 AC 1~3개 최소 기획서로 진행, 사용자 산출물은 `.murba/` 밖에
- spec-reviewer: brief·사전 답변의 명시 요구 → AC 대응 검사(빠지면 막는 지적, 프롬프트 수준)
- guard 비가역 목록: `git reset --hard`, `git clean -f[d|x]`
- `murba init`이 보고서 폴더를 미리 만듦, 서브에이전트 호출에 `run_in_background`를 넘기지 않음
### 검증
- 독립 리뷰 2회(1차: 자연스러운 생략 우회 8건 → 구조적 수정: 과제 성격 고정, 소스 변경 게이트). 리뷰어 재현 스크립트로 확인
- 회귀 세트 11개(`70aec38`, 사용자 전역 설정 제외 격리 실행): 11/11, guard 차단 0, 비용 $10.71
- 관찰: t093(위험 요청)은 안전한 재작성까지 하지 않고 확인을 요청하며 종료. t057은 test-writer의 기대 행 수 오류(1941 vs 1942)로 AC 3개 보류(조작 없음, `lock-tests --amend` 미사용)
### 함께 들어간 것(v0.1.0 이후 main)
- guard: 프로젝트가 `/tmp` 아래일 때(Linux) 임시 폴더 삭제 오탐 수정, 임시 폴더 안 링크가 가리키는 실제 경로(예: 홈)로 재귀 삭제 판정
- 플러그인 아이콘, GitHub Actions CI(Node 18·20·22 + validate), 리뷰어 재현 입력 회귀 테스트
### 알려진 문제
- spec-reviewer의 요구→AC 대응 검사는 프롬프트 지시이고 CLI가 강제하지 않는다
- triage 중 run-plan의 과제 성격을 스스로 조사·위험으로 적으면 생략이 열릴 수 있다(고정 전). init 전에 이미 고쳐 둔 파일도 소스 변경 게이트에 걸릴 수 있다 → v0.1.2 후보

## [플러그인 0.1.0] - 2026-11-24
### 추가
- 상태 전이표(`assets/state-machine.json`) + 원장 CLI `murba`(init·status·phase·ac·fix-round·approve·lock-tests·check-tests·decide·handoff·evidence-run·budget·report)
- hook 3개: SessionStart(재개 안내), PreToolUse guard(비가역 명령·에이전트별 경로 제한, 실패 시 차단), Stop gate(증거 없으면 멈춤 차단, headless 질문 종료 차단)
- 스킬: run(오케스트레이터), grill(선택형 질문, 막지 않음), resume
- 에이전트: triage, spec-reviewer, test-writer, builder, evaluator, pr-reviewer
- 보고서 `.murba/report.md` + `.html`(결정적 스크립트)
- 테스트 169개(실제 hook 입력 캡처 포함), 시나리오 과제 100개 + 무인 실행기(`scenarios/`)
- GitHub marketplace 설치 경로(`--plugin-dir` 없이)로 과제 1개 끝까지 실행 확인(AC 3/3 VERIFIED)

### 알려진 문제
- 사용자 답변의 명시 요구가 AC로 옮겨지지 않으면 플러그인 자기 판정은 통과한다(t067 감사 2회). v0.1.1에서 spec-review에 요구 → AC 대응 검사 추가 예정
- guard는 실수 방지망. 의도적 난독화는 범위 밖([ADR 0003](docs/decisions/0003-guard-threat-model.md))
- `evals/`(claude plugin eval 스위트) 미작성

### 시험
- 과제 100개를 sonnet으로 무인 실행(총 143회(중단 1회 포함), $361.43. 태그 커밋 b148187 회귀 세트 11/11). 첫 시도 92개 성공, 수정 후 재실행 포함 100개 성공. 시험으로 바꾼 설계는 [ADR 0002](docs/decisions/0002-scenario-test-changes.md)

## [문서 v0.0.1] - 2026-11-24
### 추가
- 지역 지침 `CLAUDE.md`(목차) + `docs/rules/` 4개(작업·플러그인 작성·문서·기록 규칙)
- 조사 `docs/research/plugin-survey.md`, `docs/research/papers.md`
- 기획서 `docs/spec/spec-v0.1.md`(초안 → 독립 검토 → 보완)
- 결정 로그 `docs/decisions/0001-initial-decision-log.md`
- 세션 보고서 `docs/history/261124-v0.0.1.md` + `.html`
- 개발용 공식 플러그인 `plugin-dev@claude-plugins-official`(프로젝트 범위)
