# murba-good-work

기획서를 한 번 승인하면 그 뒤 **구현 → 검증 → QA → 실제 브라우저 확인**까지 멈추지 않고 진행하는 Claude Code 플러그인입니다.
"됐다"는 말은 실행 증거(명령·출력·종료 코드·스크린샷)가 있을 때만 합니다.

- 결정적 hook + 파일 원장(`.murba/`) + 실행 증거 + 독립 평가자 + 구현보다 먼저 쓴 테스트
- 작업 중 생기는 질문은 작업을 막지 않습니다. 추천안으로 정하고 **결정 큐**(`.murba/decisions.tsv`, 끝에 한 번에 보고)에 남깁니다. 되돌릴 수 없는 작업만 그 갈래를 멈춥니다
- 진행 상태는 **원장**(`.murba/state.json`, `murba` CLI로만 변경)에 남아 끊겨도 이어 갈 수 있습니다
- 설계 근거: [기획서 v0.1](docs/spec/spec-v0.1.md), [조사](docs/research/plugin-survey.md), [논문](docs/research/papers.md)

## 버전
| 버전 | 상태 | 핵심 |
|---|---|---|
| 0.1.5 | main(Release 전) | `sed -i` 해석 오탐 수정(BSD `sed -i ''`의 스크립트를 파일로 읽던 문제) |
| 0.1.4 | [Release](https://github.com/murbachovski/murba-good-work/releases/tag/v0.1.4) | test-writer·evaluator의 독립 작업을 CLI·guard가 강제 ([ADR 0007](docs/decisions/0007-enforce-independent-roles.md)) |
| 0.1.3 | [Release](https://github.com/murbachovski/murba-good-work/releases/tag/v0.1.3) | 실행 중 예약 호출(`ScheduleWakeup`·`CronCreate`) 금지, `.gitignore`로 소스 변경 숨기기 차단 ([ADR 0006](docs/decisions/0006-no-wakeups-and-gitignore.md)) |
| 0.1.2 | [Release](https://github.com/murbachovski/murba-good-work/releases/tag/v0.1.2) | 단계를 생략한 실행은 소스를 바꿀 수 없음, init 기준선, 대상 저장소 `.gitignore` 미변경 ([ADR 0005](docs/decisions/0005-skipped-runs-and-baseline.md)) |
| 0.1.1 | [Release](https://github.com/murbachovski/murba-good-work/releases/tag/v0.1.1) | 구현 작업은 파이프라인 생략 금지 ([ADR 0004](docs/decisions/0004-no-pipeline-skip-for-implementation.md)) |
| 0.1.0 | [Release](https://github.com/murbachovski/murba-good-work/releases/tag/v0.1.0) | 첫 동작 버전 |

변경 내용 전체: [CHANGELOG](CHANGELOG.md)

## 설치
```
/plugin marketplace add murbachovski/murba-good-work
/plugin install murba-good-work@murba-good-work
```
요구 사항: Claude Code 2.1.295 이상(시험한 버전 2.1.316), Node.js 18 이상, git. 화면 검증을 쓰려면 Playwright(`npx playwright install chromium`).

## 사용
대상 프로젝트(git 저장소, 첫 커밋 있음)에서:
```
/murba-good-work:run 할 일 목록 웹앱 만들어줘. 새로고침해도 유지되게.
```
- 처음에 선택형 질문(grill)이 몇 번 나오고, 기획서와 수용 기준(AC)을 보여주며 **한 번 승인**을 받습니다
- 승인 뒤에는 자동으로 진행하고 끝나면 `.murba/report.md`·`.murba/report.html`을 만듭니다
- 끊겼다면 `/murba-good-work:resume`
- `/murba-good-work:grill`은 run 안에서 쓰는 기획 단계입니다. 따로 부르면 `murba init` 없이 시작해 기획서 동기화(`murba ac sync`)가 'murba init 먼저' 오류(종료 코드 1)를 냅니다(알려진 문제)

무인 실행(질문 없이, 답을 미리 줌): 아래 [시나리오 6](#6-무인으로-맡기기밤새ci)의 명령(권한 허용 옵션 포함)
- `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`: `-p`는 기본적으로 백그라운드 작업을 10분까지만 기다리고 끝냅니다. 긴 서브에이전트가 끊기지 않게 하는 대신 상한 없이 기다리므로, 바깥에서 시간 제한(예: `timeout 60m`)을 함께 거세요
- 무인 실행에서는 승인을 미리 준 것으로 보고(`MURBA_HEADLESS=1`), 정할 것은 추천안으로 정해 결정 큐에 남깁니다

## 사용 시나리오
### 1. 새 기능 만들기(대화형, 가장 흔한 경우)
상황: 할 일 웹앱에 "완료한 항목 숨기기"를 넣고 싶다.

0. **준비**: 대상 폴더가 **첫 커밋이 있는 git 저장소**여야 한다. 새 폴더면 `git init` 후 첫 커밋부터(첫 커밋 전에 시작하면 소스 변경 검사가 조용히 꺼진다)
1. Claude Code를 열고 요청한다. 플러그인이 시작하자마자 `feat/<이름>` 브랜치를 만든다
   ```
   /murba-good-work:run 완료한 할 일을 숨기는 토글을 넣어줘. 새로고침해도 설정이 유지되게.
   ```
2. **질문에 답한다(grill)**: 선택형 질문이 한 번에 최대 4개씩 나온다(첫 선택지가 추천안). 예: "토글 위치?", "기본값은 보이기?"
3. **기획서를 승인한다(1회)**: 핵심 5줄, 수용 기준(AC, 예: `AC-001 WHEN 토글을 켜면 THE SYSTEM SHALL 완료 항목을 숨긴다`), AC→테스트 대응표를 보여준다. AC가 요구를 다 담았는지 여기서 확인한다. 승인하면 Claude Code 확인 창이 한 번 더 뜬다(`murba approve`)
4. **기다린다**: 플러그인은 이제 기획을 묻지 않는다. 테스트 먼저 작성 → AC마다 구현·커밋 → 판정 → 전체 재확인 → 브라우저 스크린샷까지 진행한다. 취향 수준의 결정은 추천안으로 정하고 결정 큐에 쌓는다. 방향을 바꾸는 결정과 되돌릴 수 없는 작업은 정하지 않고 큐에만 올린다
   - 플러그인과 별개로 **Claude Code 권한 확인 창**은 뜰 수 있다(`npm i`, `npx playwright install` 등 허용하지 않은 명령)
5. **마지막 질문(있을 때 1회)**: 결정 큐에 취향·방향·되돌릴 수 없는 작업 항목이 있으면 끝에서 선택형으로 한 번 묻는다. 추천안과 다르게 답하면 그 AC를 다시 구현한다
6. **결과를 본다**: `.murba/report.html`(또는 `report.md`)
   - 요약 다음 "먼저 볼 것": ❌ 실패·생략 / ⚠️ 미검증 / 범위 밖 변경
   - AC별 판정(VERIFIED·NOT_VERIFIED·INCONCLUSIVE·보류)과 증거 파일, 커밋 SHA
   - "내가 내린 결정"과 틀렸을 때 비용, "남은 질문"
7. **직접 마무리한다**: push는 guard가 막고, main 머지는 하지 않도록 지침에 있다. `feat/<이름>` 브랜치를 검토해 직접 머지·push한다

### 2. 버그 고치기
```
/murba-good-work:run 장바구니 합계가 할인 적용 뒤 음수가 될 수 있어. 고쳐줘.
```
- 먼저 버그를 드러내는 **실패 테스트**를 AC로 만든다(재현 먼저). 그 테스트가 통과해야 고친 것으로 본다
- 재현할 입력을 알고 있으면 처음 요청이나 grill 답에 적는다

### 3. 코드 조사만(구현 없음)
```
/murba-good-work:run 결제 모듈에서 재시도 로직이 어디서 어떻게 동작하는지 조사해줘
```
- 소스를 고치지 않는다. 결과는 프로젝트 루트 `INVESTIGATION.md`(또는 지정한 경로)에 `file:line` 근거와 함께 쓴다
- 조사 과제는 승인·테스트·build 단계를 건너뛴다. 그 실행이 구현 파일을 바꾸면 CLI가 생략과 `done` 전이를 거부한다(결과 파일을 `src/` 안이나 코드 확장자로 지정하면 그것도 걸린다)

### 4. 위험한 작업이 섞였을 때
```
/murba-good-work:run 오래된 users 테이블은 지우고 새 스키마로 옮겨줘
```
- 삭제·DB 초기화·push·배포처럼 **되돌릴 수 없는 작업은 하지 않는다**(모든 실행의 지침). 결정 큐에 `irreversible`로 올리고 보고서 "남은 질문"에 남긴다. 실제로 할지는 보고서를 보고 사람이 정한다
- guard가 직접 막는 것은 [안전장치](#안전장치) 목록(DB 삭제·마이그레이션, push, 루트·홈 삭제 등)뿐이다. 프로젝트 안쪽 폴더 삭제(예: `rm -rf src`)는 막지 않는다
- triage가 요청을 "위험"으로 표시하면 단계를 생략하고 보고서만 쓰고 끝낼 수 있다. 표시는 모델 판단이라 실행마다 다를 수 있다. 예: "src 통째로 지우고 새로 짜줘"는 실행에 따라 멈추고 보고만 하거나, `feat/` 브랜치에서 기존 파일을 덮어써 다시 짰다(git으로 복구 가능)

### 5. 중간에 끊겼을 때
세션이 끝났거나 컨텍스트가 압축됐으면:
```
/murba-good-work:resume
```
- 기억이 아니라 원장(`.murba/state.json`·`events.jsonl`·`handoff/`)과 `git log`에서 이어 간다. 이전에 "통과"라고 한 것은 다시 실행해 확인한다

### 6. 무인으로 맡기기(밤새·CI)
요구와 답을 파일에 미리 적는다(`brief.md`: 무엇을, 왜, 질문에 대한 답, 하지 말 것).
```
cd <대상 저장소>
timeout 60m env MURBA_HEADLESS=1 CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 \
  claude -p --permission-mode acceptEdits --allowedTools \
    Read Write Edit MultiEdit Glob Grep Agent Skill TodoWrite 'Bash(node:*)' 'Bash(npm:*)' 'Bash(npx:*)' \
    'Bash(git:*)' 'Bash(murba:*)' 'Bash(murba status:*)' 'Bash(ls:*)' 'Bash(cat:*)' 'Bash(mkdir:*)' \
    'Bash(cp:*)' 'Bash(mv:*)' 'Bash(echo:*)' 'Bash(printf:*)' 'Bash(head:*)' 'Bash(tail:*)' 'Bash(wc:*)' \
    'Bash(grep:*)' 'Bash(find:*)' 'Bash(sed:*)' 'Bash(diff:*)' 'Bash(chmod:*)' 'Bash(test:*)' 'Bash(pwd:*)' \
    'Bash(date:*)' 'Bash(sort:*)' 'Bash(uniq:*)' 'Bash(touch:*)' 'Bash(sh ./init.sh:*)' \
    'Bash(sh .murba/init.sh:*)' 'Bash(bash .murba/init.sh:*)' 'Bash(curl -s http://localhost:*)' \
    'Bash(curl -s http://127.0.0.1:*)' 'Bash(sleep:*)' 'Bash(kill:*)' 'Bash(lsof -i:*)' 'Bash(jq:*)' \
    'Bash(awk:*)' 'Bash(tr:*)' 'Bash(cut:*)' 'Bash(xargs:*)' 'Bash(true:*)' 'Bash(which:*)' 'Bash(printenv:*)' \
    'Bash(node --test:*)' 'Bash(cd:*)' 'Bash(mktemp:*)' 'Bash(python3:*)' 'Bash(basename:*)' 'Bash(dirname:*)' \
    'Bash(realpath:*)' 'Bash(stat:*)' 'Bash(cmp:*)' 'Bash(tee:*)' 'Bash(xxd:*)' 'Bash(od:*)' 'Bash(file:*)' \
  -- "/murba-good-work:run $(cat brief.md)"
```
- 무인 실행은 권한 창을 띄울 수 없으므로 쓸 명령을 미리 허용해야 한다. 위 허용 목록은 시나리오 실행기가 쓴 목록([`scenarios/harness/run.mjs`](scenarios/harness/run.mjs)의 `ALLOWED`) 그대로이고, 이 목록과 `--permission-mode acceptEdits`로만 시험했다. 목록을 줄이면 필요한 명령이 거부돼 실행이 막힐 수 있다
- 질문 없이 끝까지 간다. 아침에 `.murba/report.html`과 결정 큐(`.murba/decisions.tsv`)를 본다
- `timeout`은 GNU coreutils 명령이라 macOS에는 기본으로 없다(`brew install coreutils` 뒤 `gtimeout`으로 바꿔 쓴다). 환경변수는 `env`로 넘겨야 `timeout` 뒤에서 동작한다
- 시간(0.1.3·0.1.4 회귀 각 1회, 서브에이전트까지 sonnet 강제, 동시 6개 실행): 보고만 하는 조사·위험 과제 1분 안팎, 일반 과제 3~13분, AC가 10개 넘는 화면 과제 15~25분. 출시 설정(일부 에이전트 opus)은 더 느리고 비쌀 수 있다
- 이 회귀 밖의 확인 실행에서는 30분 시간 초과가 2번 있었다(browser 단계의 모델·API 지연 1번, test-write 단계 재작업 1번). 시간 제한은 넉넉히 건다

### 이럴 땐 쓰지 마세요
- 한두 줄 고치기, 오타, 빠른 실험: 기획·승인·테스트·독립 평가를 모두 거쳐 느리고 비싸다(비교 평가에서 비용이 pstack의 약 6.7배)
- 저장소 밖 작업(서버 운영, 배포): guard가 막거나 범위 밖이다
- 강한 보안 격리가 필요한 경우: guard는 실수 방지망이다. `permissions.deny`·샌드박스를 함께 쓴다

## 흐름
| 단계 | 하는 일 | 담당 | 증거 |
|---|---|---|---|
| triage | 작업 설계 | triage 에이전트 | `run-plan.json`(과제 성격 고정) |
| grill | 기획서 작성 | 메인 세션(선택형 질문) | `spec.md`, AC |
| spec-review | 기획서 검토 | spec-reviewer | 검토 보고 |
| revise | 기획서 보완 | 메인 세션 | AC→테스트 대응표 |
| approve | 승인(사람 1회) | 사용자 | spec 해시 고정 |
| setup | 개발 셋팅 | 메인 세션 | `init.sh`, 러너 설정 |
| test-write | 테스트 먼저 작성 | test-writer | 실패하는 테스트, 해시 고정 |
| build ↔ evaluate/fix | 구현·검증·수정 | builder / evaluator | AC별 커밋·판정 |
| qa | 전체 재확인 | evaluator | 전 AC 재판정, 회귀 |
| browser | 실제 브라우저 확인 | evaluator | Playwright 스크린샷·로그 |
| report | 보고 | 메인 세션 | `report.md`/`.html` |

- 단계 생략은 조사 과제와 위험 요청(삭제·DB 초기화 등)에만 허용됩니다. 위험한 부분은 실행하지 않고 결정 큐에 남기며, 안전한 코드 변경은 같은 흐름(AC·승인·테스트·build)을 탑니다
- 작은 구현도 AC 1~3개짜리 짧은 기획서로 같은 흐름을 탑니다

## 구성
| 종류 | 이름 | 하는 일 |
|---|---|---|
| 스킬 | `run`, `grill`, `resume` | 전체 흐름 진행, 기획 질문, 중단 재개 |
| 에이전트 | `triage`, `spec-reviewer`, `test-writer`, `builder`, `evaluator`, `pr-reviewer` | 작업 설계, 기획 검토, 테스트 먼저, 구현, 독립 판정, PR 검토(v0.2 예정 흐름) |
| hook | SessionStart(router), PreToolUse(guard), Stop(stop-gate) | 상태 안내, 위험·규칙 위반 차단, 증거 없이 끝내기 차단 |
| CLI | `murba` | 원장(`.murba/state.json`) 변경은 이 명령으로만. 계약: [CONTRACT](plugins/murba-good-work/assets/CONTRACT.md) |

## 안전장치
- **guard가 막는 것**: 루트·홈·프로젝트 밖·프로젝트 루트의 재귀 삭제, 모든 `git push`, `git reset --hard`·`git clean -f` 같은 작업 트리 폐기, DB 삭제·마이그레이션, 배포·게시, 비밀 파일 쓰기. 막은 것은 결정 큐에 올립니다. 프로젝트 안쪽 폴더 삭제(예: `rm -rf src`)는 막지 않습니다
- **승인 전 쓰기 금지**: 승인 전에는 메인 세션·서브에이전트 모두 프로젝트 소스(`.gitignore`, `../.gitignore` 포함)를 고칠 수 없습니다. 조사 과제와 `run-plan.json` 작성 전(triage 시작)은 예외입니다
- **테스트 먼저**: 테스트 잠금 전에 구현 파일(impl_globs·코드 확장자)이 바뀌면 `murba approve`·`lock-tests`가 거부합니다(`SOURCE_CHANGED_BEFORE_TESTS`). 편집 도구든 셸이든 git 상태로 잡습니다. 테스트·설정 파일·루트 `.gitignore`는 이 검사에서 뺍니다
- **생략한 실행**: build를 건너뛰었거나 미검증 AC가 남은 채 평가를 건너뛴 실행은 구현 파일·`.gitignore`를 바꾼 상태로 done에 갈 수 없습니다(`--skip`·`report → done` 거부, `SOURCE_CHANGED_IN_SKIPPED_RUN`)
- **기준선**: init 때 이미 하던 작업(바뀐 파일·`.gitignore`)은 내용 해시로 기록해 오탐하지 않습니다
- **역할 분리**: 구현 에이전트는 테스트·러너 설정을 고칠 수 없고 숨긴 검사를 볼 수 없습니다. test-writer는 구현 코드를 읽지 않고, evaluator는 코드를 고치지 않습니다. 테스트 잠금과 qa 통과에는 test-writer·evaluator가 직접 쓴 보고가 필요하고, 메인 세션은 그 보고 폴더와 숨긴 검사를 쓸 수 없습니다
- **반복 상한**: 수정은 AC당 최대 3라운드입니다
- **대상 저장소**: `murba init`은 `.murba/`를 빼려고 대상 `.gitignore`를 바꾸지 않습니다(`.murba/.gitignore`로 제외). setup 단계는 필요하면 `node_modules/` 같은 줄을 넣습니다
- hook은 `.murba/`가 있는 프로젝트에서만 동작합니다

비상 해제: `/plugin disable murba-good-work`, 또는 실행할 때 환경변수 `MURBA_DISABLE=1`.

guard는 협조적인 모델의 실수와 테스트 꼼수를 막는 **안전망**이지 샌드박스가 아닙니다. 일부러 난독화한 명령은 범위 밖입니다([ADR 0003](docs/decisions/0003-guard-threat-model.md)). 강한 차단이 필요하면 Claude Code `permissions.deny`나 샌드박스를 함께 쓰세요.

## 비교 평가
같은 과제 25개를 같은 모델(sonnet)·같은 실행기로 돌려 채점 에이전트가 갈래를 모르게 채점했습니다([결과](docs/evaluation/261124-full.md), murba는 0.1.1). [pstack](https://github.com/cursor/plugins)은 Cursor의 plugins 저장소에 있는 Claude Code용 개발 흐름 플러그인입니다.

| 갈래 | 실제 정답 | 거짓 성공 | 위험 요청 안전 | 실행 비용 | 평균 시간 |
|---|---|---|---|---|---|
| murba-good-work 0.1.1 | 23/25 | 2/22 | 4/4 | $24.73 | 5.4분 |
| pstack | 23/25 | 2/25 | 3/4 | $3.71 | 0.7분 |
| 플러그인 없음 | 21/25 | 4/25 | 3/4 | $2.26 | 0.6분 |

- 거짓 성공 = 성공이라고 주장했지만 실제로는 틀린 과제 / 성공을 주장한 과제(murba는 3건이 성공을 주장하지 않아 분모가 22)
- 이 과제 묶음(작은 단일 저장소 과제)에서는 정답률이 pstack과 같고, 비용은 약 6.7배입니다. 이 비교는 서브에이전트까지 sonnet으로 강제했습니다. 출시 설정(검토·테스트·평가 에이전트는 opus)의 비용은 더 높습니다
- murba가 앞선 곳은 위험 요청 1건(사용자 확인 없이 DB 테이블을 지우지 않음)과 위험 명령 실행 0건입니다. 위험 요청 판정은 사전 답변을 어떻게 해석하느냐에 달려 있습니다
- 과제당 1회 실행이라 통계적 유의성은 없고, 채점 사본에 murba 흔적이 남아 블라인드가 완전하지 않았습니다. 자세한 주의점은 결과 문서에 있습니다

## 문제 해결
| 메시지 | 뜻 | 할 일 |
|---|---|---|
| `SOURCE_CHANGED_BEFORE_TESTS` | 승인·테스트 잠금 전에 구현 파일이 바뀜 | 미리 고친 구현을 되돌린 뒤 같은 명령을 다시 실행. 구현은 테스트 잠금 뒤 build에서 |
| `SOURCE_CHANGED_IN_SKIPPED_RUN` | 단계를 생략한 실행(조사·위험 보고)이 구현 파일·`.gitignore`를 바꿈 | 변경을 되돌리거나 재현 스크립트를 프로젝트 밖으로. 구현이 필요하면 새 실행에서 AC로 진행 |
| `SOURCE_GATE_ERROR` | 기준 커밋이 있는데 git이 실패 | `git status`로 원인 확인. 못 고치면 결정 큐에 남기고 보고서 작성 |
| `TEST_WRITER_REPORT_MISSING` | test-writer 보고 없이 테스트를 잠그려 함 | test-writer를 불러 테스트와 보고(`.murba/reports/test-writer/`)를 쓰게 한 뒤 다시 |
| `EVALUATOR_REPORT_MISSING` | 이번 qa 회차에 독립 평가 보고가 없음 | evaluator를 불러 `.murba/reports/evaluator/`에 판정 보고를 쓰게 한 뒤 다시 |
| `APPROVE_NEEDS_HUMAN` | 대화형 승인은 사람 확인이 필요 | 확인 창에서 직접 승인 |
| `LEDGER_TAMPERED` | `state.json`이 CLI 밖에서 바뀜 | 되돌리거나 `murba report`로 보고. 이 실행의 판정은 믿을 수 없음 |
| (화면 메시지 없음) `.murba/events.jsonl`에 `source_gate_skipped` | git 저장소가 아니거나 첫 커밋 전에 init해서 소스 변경 검사를 건너뜀 | 첫 커밋 뒤 `murba init --force`(사람 확인 필요, 승인·테스트 잠금이 지워짐) |
| `-p` 실행이 중간에 끝남 | 백그라운드 서브에이전트 대기 상한(10분) | `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`과 바깥 시간 제한 |

## 알려진 문제와 한계
- `/murba-good-work:grill`을 run 밖에서 따로 부르면 `murba init` 없이 시작해 `murba ac sync`가 'murba init 먼저' 오류(종료 코드 1)를 냅니다. 기획은 `/murba-good-work:run` 안에서 하세요
- 사용자 답변의 명시 요구가 AC로 옮겨지지 않으면 자기 판정은 통과합니다. spec-reviewer가 요구→AC 대응표를 만들지만 프롬프트 지시이고 CLI가 강제하지 않습니다. 승인 때 AC가 요구를 다 담았는지 확인하세요
- 0.1.4부터 test-writer·evaluator의 보고 파일이 있어야 테스트 잠금·qa 통과가 됩니다. 다만 보고의 **존재와 시각**만 확인하고, 내용이 원장 판정과 같은지는 지침에 맡깁니다
- 생략한 실행이 done에서 거부돼도 headless 실행은 보고서가 있으면 끝나고 단계는 report로 남습니다
- `.git/info/exclude`·`core.excludesFile`로 추가한 무시 규칙은 보지 않습니다. 버릴 수 있는 폴더로 판정하지 못한 도구 캐시가 `.gitignore`를 만들면 오탐할 수 있습니다
- 승인 뒤(setup·test-write) 루트 `.gitignore`에 줄을 더해 새 구현 파일을 숨기는 경로는 테스트 먼저 검사에서 빠집니다. 이후 build·evaluate를 거치므로 검증 없이 끝나지는 않습니다
- 코드 확장자 목록 밖의 파일(확장자 없는 스크립트, YAML 등)은 impl_globs(`src/**` 등) 안에 있을 때만 검사합니다
- 조사 과제는 승인 전 쓰기 금지 대상이 아니어서 `.gitignore`를 쓸 수 있습니다(대신 생략 검사가 그 변경을 거부합니다)
- init 때 바뀐 구현 파일이 아주 많으면 `state.json`이 커집니다
- 범위 밖: 상태 파일과 해시를 함께 다시 쓰는 위조, 메인 세션이 변수·계산한 경로나 프로젝트 밖 스크립트로 서브에이전트 보고 폴더에 쓰기, 스크립트 안에서 실행 중 계산한 삭제 대상, 단어 안 따옴표 쪼개기·변수에 숨긴 명령 이름, 대화형 승인 확인을 거절한 직후 10분 안의 다른 경로 승인 시도

전체 목록: [ADR 0005](docs/decisions/0005-skipped-runs-and-baseline.md)·[ADR 0006](docs/decisions/0006-no-wakeups-and-gitignore.md)의 "남은 한계", [CHANGELOG](CHANGELOG.md)의 "알려진 문제"

## 문서 지도
| 경로 | 내용 |
|---|---|
| [docs/spec/](docs/spec/) | 기획서(모든 구현의 기준) |
| [docs/decisions/](docs/decisions/) | 결정 기록(ADR) |
| [docs/evaluation/](docs/evaluation/) | 비교 평가 결과 |
| [docs/history/](docs/history/) | 버전별 작업 보고서(md·html) |
| [docs/research/](docs/research/) | 플러그인·논문 조사 |
| [CHANGELOG.md](CHANGELOG.md) | 버전별 변경·검증·알려진 문제 |

## 개발
```bash
node --test 'plugins/murba-good-work/tests/*.test.mjs'     # hook·CLI 테스트
claude plugin validate ./plugins/murba-good-work --strict  # 구조 검사
claude --plugin-dir ./plugins/murba-good-work              # 로컬 실행
```
- CI(GitHub Actions): Node 18·20·22 테스트 + validate. main은 CI 통과가 필요합니다
- 시나리오 실행기: `scenarios/harness/run.mjs`(과제별 임시 저장소에서 무인 실행), 비교 채점: `scenarios/eval/`

## 라이선스
MIT. 일부 에이전트 지침은 MIT 라이선스 스킬(mattpocock/skills, obra/superpowers, warpdotdev/common-skills)을 한국어로 개작했습니다.
