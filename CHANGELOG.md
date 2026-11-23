# 변경 기록

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/). 추가만 한다.

- **문서 버전**(이 저장소 기록용): 설계 단계는 `v0.0.x`
- **플러그인 버전**(`plugins/murba-good-work/.claude-plugin/plugin.json`의 `version`): SemVer, 첫 동작 버전 `0.1.0`

## [플러그인 0.1.0] - 2026-11-24
### 추가
- 상태 전이표(`assets/state-machine.json`) + 원장 CLI `murba`(init·status·phase·ac·fix-round·approve·lock-tests·check-tests·decide·handoff·evidence-run·budget·report)
- hook 3개: SessionStart(재개 안내), PreToolUse guard(비가역 명령·에이전트별 경로 제한, 실패 시 차단), Stop gate(증거 없으면 멈춤 차단, headless 질문 종료 차단)
- 스킬: run(오케스트레이터), grill(선택형 질문, 막지 않음), resume
- 에이전트: triage, spec-reviewer, test-writer, builder, evaluator, pr-reviewer
- 보고서 `.murba/report.md` + `.html`(결정적 스크립트)
- 테스트 129개(실제 hook 입력 캡처 포함), 시나리오 과제 100개 + 무인 실행기(`scenarios/`)
### 시험
- 과제 100개를 sonnet으로 무인 실행(총 115회, $309.91). 첫 시도 92개 성공, 수정 후 재실행 포함 100개 성공. 시험으로 바꾼 설계는 [ADR 0002](docs/decisions/0002-scenario-test-changes.md)

## [문서 v0.0.1] - 2026-11-24
### 추가
- 지역 지침 `CLAUDE.md`(목차) + `docs/rules/` 4개(작업·플러그인 작성·문서·기록 규칙)
- 조사 `docs/research/plugin-survey.md`, `docs/research/papers.md`
- 기획서 `docs/spec/spec-v0.1.md`(초안 → 독립 검토 → 보완)
- 결정 로그 `docs/decisions/0001-initial-decision-log.md`
- 세션 보고서 `docs/history/261124-v0.0.1.md` + `.html`
- 개발용 공식 플러그인 `plugin-dev@claude-plugins-official`(프로젝트 범위)
