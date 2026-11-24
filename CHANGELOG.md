# 변경 기록

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/). 추가만 한다.

- **문서 버전**(이 저장소 기록용): 설계 단계는 `v0.0.x`
- **플러그인 버전**(`plugins/murba-good-work/.claude-plugin/plugin.json`의 `version`): SemVer, 첫 동작 버전 `0.1.0`

## [Unreleased]
### 바뀜
- guard: 프로젝트가 `/tmp` 아래일 때(Linux) 임시 폴더 삭제 오탐 수정, 임시 폴더 안 링크가 가리키는 실제 경로(예: 홈)로 재귀 삭제 판정
- 플러그인 아이콘, GitHub Actions CI(Node 18·20·22 + validate), 테스트 190개(리뷰어 재현 입력 회귀 포함)
### 검증 상태
- 단위 테스트·CI만 통과. 시나리오 회귀 세트(과제 11개)는 v0.1.1 변경과 함께 1회 실행 예정(사용자 결정 2026-11-24). marketplace 설치는 기본 브랜치(main)를 받으므로 v0.1.0과 다를 수 있음

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
