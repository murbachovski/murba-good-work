# murba-good-work

기획서를 한 번 승인하면 그 뒤 **구현 → 검증 → QA → 실제 브라우저 확인**까지 멈추지 않고 진행하는 Claude Code 플러그인입니다.
"됐다"는 말은 실행 증거(명령·출력·종료 코드·스크린샷)가 있을 때만 합니다.

- 결정적 hook + 파일 원장(`.murba/`) + 실행 증거 + 독립 평가자 + 구현보다 먼저 쓴 테스트
- 작업 중 생기는 질문은 작업을 막지 않습니다(결정 큐). 되돌릴 수 없는 작업만 그 갈래를 멈춥니다
- 설계 근거: [기획서 v0.1](docs/spec/spec-v0.1.md), [조사](docs/research/plugin-survey.md), [논문](docs/research/papers.md)

## 설치
```
/plugin marketplace add murbachovski/murba-good-work
/plugin install murba-good-work@murba-good-work
```
요구 사항: Claude Code 2.1.295 이상(시험한 버전 2.1.316), Node.js 18 이상, git. 화면 검증을 쓰려면 Playwright(`npx playwright install chromium`).

## 사용
대상 프로젝트(git 저장소)에서:
```
/murba-good-work:run 할 일 목록 웹앱 만들어줘. 새로고침해도 유지되게.
```
- 처음에 선택형 질문(grill)이 몇 번 나오고, 기획서와 수용 기준(AC)을 보여주며 **한 번 승인**을 받습니다
- 승인 뒤에는 자동으로 진행하고 끝나면 `.murba/report.md`·`.murba/report.html`을 만듭니다
- 끊겼다면 `/murba-good-work:resume`

무인 실행(질문 없이, 답을 미리 줌):
```
MURBA_HEADLESS=1 CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude -p "/murba-good-work:run $(cat brief.md)"
```
- `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`: `-p`는 기본적으로 백그라운드 작업을 10분까지만 기다리고 끝낸다. 긴 서브에이전트가 끊기지 않게 한다

## 흐름
| 단계 | 사용자 흐름 | 담당 | 증거 |
|---|---|---|---|
| triage | 0 작업 설계 | triage 에이전트 | `run-plan.json` |
| grill | 1 기획서 작성 | 메인 세션(선택형 질문) | `spec.md`, AC |
| spec-review | 2 기획서 검토 | spec-reviewer | 검토 보고 |
| revise | 3 기획서 보완 | 메인 세션 | AC→테스트 대응표 |
| approve | 승인(사람 1회) | 사용자 | spec 해시 고정 |
| setup | 5 개발 셋팅 | 메인 세션 | `init.sh`, 러너 설정 |
| test-write | 4 기획 기반 진행 | test-writer | 실패하는 테스트, 해시 고정 |
| build ↔ evaluate/fix | 6 구현·8 검증 | builder / evaluator | AC별 커밋·판정 |
| qa | 9 QA | evaluator | 전 AC 재판정, 회귀 |
| browser | 10 실제 브라우저 | evaluator | Playwright 스크린샷·로그 |
| report | 보고 | 메인 세션 | `report.md`/`.html` |

## 안전장치
- 삭제·배포·main push·DB 변경·비밀 파일 쓰기 같은 비가역 작업은 hook이 차단하고 결정 큐에 올립니다
- 구현 에이전트는 테스트·러너 설정을 고칠 수 없고 숨긴 검사를 볼 수 없습니다
- 수정은 AC당 최대 3라운드, 끝없이 반복하지 않습니다
- hook은 `.murba/`가 있는 프로젝트에서만 동작합니다

비상 해제: `/plugin disable murba-good-work`, 또는 실행할 때 환경변수 `MURBA_DISABLE=1`.

guard는 협조적인 모델의 실수와 테스트 꼼수를 막는 **안전망**이지 샌드박스가 아닙니다. 일부러 난독화한 명령은 범위 밖입니다([ADR 0003](docs/decisions/0003-guard-threat-model.md)). 강한 차단이 필요하면 Claude Code `permissions.deny`나 샌드박스를 함께 쓰세요.

알려진 문제: 사용자 답변의 명시 요구가 수용 기준(AC)으로 옮겨지지 않으면 자기 판정은 통과합니다. 기획서 승인 때 AC가 요구를 다 담았는지 확인하세요. v0.1.1부터 spec-reviewer가 요구→AC 대응표를 만들지만, 이것은 프롬프트 지시이고 CLI가 강제하지는 않습니다.

알려진 한계(범위 밖): 상태 파일과 해시를 함께 다시 쓰는 위조, 스크립트 안에서 실행 중 계산한 삭제 대상, 단어 안 따옴표 쪼개기·변수에 숨긴 명령 이름. 대화형 승인 확인을 거절한 직후 10분 안의 다른 경로 승인 시도.

## 라이선스
MIT. 일부 에이전트 지침은 MIT 라이선스 스킬(mattpocock/skills, obra/superpowers, warpdotdev/common-skills)을 한국어로 개작했습니다.
