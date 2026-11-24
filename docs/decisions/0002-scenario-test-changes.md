# 0002 시나리오 시험에서 나온 설계 변경

- 날짜: 2026-11-24
- 상태: 확정. [0001](0001-initial-decision-log.md)과 [기획서 v0.1](../spec/spec-v0.1.md)의 해당 항목을 바꾼다
- 맥락: 플러그인 v0.1을 실제 과제 100개(`scenarios/tasks.json`)로 무인 실행(`claude -p`, sonnet, 서브에이전트도 sonnet 강제). 배치마다 실패 원인을 고치고 다음 배치를 돌렸다
- 근거: 각 실행의 `summary.json`(상태·hook 로그·권한 거부·비용), `stream.jsonl`. 집계는 [보고서](../history/261124-v0.1.0.md)

## 변경 표
| 관찰(실행 증거) | 원인 | 변경 | 커밋 |
|---|---|---|---|
| 무인 실행이 approve에서 멈춤 | 자동 승인이 `--auto-approve` 플래그에만 의존 | `MURBA_HEADLESS=1`이면 init·approve가 스스로 사전 승인으로 판단 | b7ccd63 |
| `node -e "a => b"`가 파일 쓰기로 차단 | 따옴표 안 `>`를 리디렉션으로 해석 | 따옴표를 가린 뒤 리디렉션 파싱 | b7ccd63 |
| 숨긴 검사를 잠글 수 없음 | `lock-tests`가 `.murba/`를 건너뜀 | `.murba/hidden/`은 포함 | b7ccd63 |
| AC마다 evaluator를 부르면 비용·시간이 크고 판정이 흔들림 | LLM 판정 반복 | **AC별 판정 = 오케스트레이터가 AC 테스트를 실행한 종료 코드**. 독립 evaluator는 qa·browser에서 1회, INCONCLUSIVE 2회 연속일 때만 추가 | b7ccd63 |
| 조사·위험 요청이 파이프라인을 건너뛰거나 질문으로 끝남 | 생략 기록 수단 없음, headless 질문 종료 | `murba phase <target> --skip "<사유>"`(보고서 ⏸), headless Stop 게이트가 질문형 종료·보고서 없음 차단 | b7e67dc |
| 마지막 AC 뒤 qa 전이 거부 | `current_ac=null`에서 조건 미충족 | 모든 비보류 AC에 판정이 있으면 충족 | b7e67dc |
| AC 사이 의존 때문에 임시 보류 남발 | 순서 정보 없음 | `[after:AC-x]` 태그, `ac next`가 순서 지킴, `ac unhold`, 최종 VERIFIED면 자동 해제 | b7e67dc |
| 복합 Bash 명령이 권한 거부로 멈춤 | `cd &&`·변수·루프 | 단순 명령 1개 규칙, 여러 단계는 스크립트 파일 | b7e67dc |
| `-p`가 10분 뒤 서브에이전트를 강제 종료 | Agent가 백그라운드로 실행되고 턴이 "알림 대기"로 끝남 | Agent는 항상 `run_in_background: false`, Monitor 금지. 무인 실행 문서에 `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` | 4991f17 |
| 증거 폴더 지정·평가 스크립트가 권한 거부 | 명령 앞 환경변수, heredoc, `/tmp` | `murba evidence-run`(폴더 + `CURRENT` 포인터), evaluator·pr-reviewer에 Write(guard가 자기 경로로 제한) | 4991f17 |
| qa의 독립 평가자가 결함을 찾아도 고치지 못하고 끝남 | 전이표에 qa → fix 없음 | `murba phase fix --ac <ID>`(최종 판정이 VERIFIED 아님 + 수정 상한 안). 반례는 `repro-<AC>.mjs`로 남기고 재판정에 포함 | 7306356 |
| 성능 AC가 측정 노이즈로 실패 | 최대값 기준 | 같은 입력 5회 이상 중앙값 | 7306356 |
| 조사 과제 보고서에 미검증 AC가 ❌로 나옴 | 조사에도 AC 줄 작성 | 조사는 `Q-n` 질문 줄, `ac sync` 안 함 | 7306356 |

## 바꾸지 않은 것
- 승인 1회, 수정 루프 3라운드, 병렬 기본 꺼짐: 시험에서 바꿀 근거가 나오지 않음
- `.claude/settings.local.json` 허용목록 쓰기는 무인 실행에서 Claude Code가 거부함. setup이 결정 큐에 기록하고 계속(차단 아님)

## 틀렸을 때 비용
- 결정적 AC 판정은 테스트가 약하면 거짓 통과가 난다 → qa 뮤테이션 검사와 독립 evaluator 1회로 보완. 둘 다 qa에서만 돈다
- `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`은 무인 실행이 끝없이 기다릴 수 있다 → 실행기 쪽 시간 제한과 `murba budget` 필요
