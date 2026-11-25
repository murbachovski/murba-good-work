# 변경 기록

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/). 추가만 한다.

- **문서 버전**(이 저장소 기록용): 설계 단계는 `v0.0.x`
- **플러그인 버전**(`plugins/murba-good-work/.claude-plugin/plugin.json`의 `version`): SemVer, 첫 동작 버전 `0.1.0`

## [Unreleased]
### 문서
- README 사용 시나리오(대화형 새 기능·버그·조사·위험 작업·재개·무인 실행, 쓰지 말아야 할 때). 무인 실행 예시는 시험한 권한 옵션 그대로
### 알려진 문제
- (0.1.0부터) `grill` 스킬을 run 밖에서 따로 부르면 `murba init` 없이 시작해 `murba ac sync`가 'murba init 먼저' 오류(종료 코드 1)를 낸다. README에서 단독 사용 안내를 뺌

## [플러그인 0.1.5] - 2026-11-25
### 바뀜
- guard: `sed -i`가 고치는 파일을 두 번 훑어 가려냄. BSD `sed -i '' '<스크립트>' <파일>`·`sed -i .bak …`의 접미어와 스크립트를 파일로 보지 않음(0.1.4 알려진 문제: test-write 단계 메인 세션의 정상 편집 오탐)
- guard: GNU가 옵션 순서를 바꾸는 것을 반영. `-e`·`-f`(붙여 쓴 `-es/a/b/`, `--expression=`·`--file=`, 접두 `--expr`·`--fi` 포함)가 어디에든 있으면 모든 피연산자가 파일(`sed -i .gitignore -e …`), 없으면 첫 피연산자가 스크립트. 피연산자 뒤에 온 `-i .파일`은 파일(`sed 's/a/b/' -i .mocharc.yml`)
- guard: 이전에 놓치던 in-place 형태도 잡음: 묶은 옵션(`-Ei`·`-ni`), `-I`, `--in-place=.bak`과 접두(`--i`·`--in-pl`), `gsed`. `-l`·`--line-length`는 다음 단어가 숫자일 때만 값으로 봄(BSD `-l`은 값 없음)
- guard: 맨 앞 `''`는 `-n`이 있거나 다른 파일이 없으면 GNU 해석(빈 스크립트, 뒤 피연산자 모두 파일)도 함께 봄(`sed -n -i '' F`는 GNU에서 F를 비움)
### 검증
- 테스트 251개 중 250 통과, 1 건너뜀(로컬 rg). 해석 분기 20개를 하나씩 되돌린 뮤테이션 중 19개에서 새 테스트 실패. 남은 1개(`--line-length` 값이 숫자가 아니어도 소비)는 GNU가 숫자를 요구해 실제 동작 차이 없음
- 독립 리뷰 3회(ADR 0003 상한): 1차 차단 2건(첫 수정의 `sed -e x -i .파일` 우회, guard 수준 테스트 없음)·중요 3건, 2차 차단 2건(BSD `-l`을 값 있는 옵션으로 봐 생긴 우회, `-e`가 뒤에 오는 GNU 순서)·중요 2건, 3차 차단 1건(GNU `sed -n -i '' F`)·중요 2건·경미 1건 반영. 3차 뒤 수정 1회, 리뷰 없음
- 리뷰어 비교 스크립트(5개 상황 × sed 형태 114개 + 3차 후보)로 마지막 수정 확인: main은 막는데 새로 허용되는 46행은 모두 BSD·GNU 둘 다 오류로 끝나는 형태(`sed -i .bak F`, `sed -i '' 's/a/b/' -e F` 등, 리뷰어가 macOS sed로 실행 확인). GNU `sed -n -i '' F` 계열은 다시 거부. GNU sed 실제 실행은 못 함(문서 근거)
- 실제 실행(`57d604f`, t002·t010·t067): 모두 done, guard 거부는 역할 규칙만. 첫 커밋 `ee41dc1` 실행에서는 t010이 test-write 단계 30분 시간 초과(setup에서 만든 `serve.js`가 잠금 게이트에 걸림 → 메인 세션의 `playwright.config.js` 수정이 0.1.4 규칙에 막혀 test-writer 재호출 → Playwright RED 재실행)
### 회귀 세트
- 11개(머지 뒤 `648a55d`, tag 전): 11/11 done·성공, $11.54, 평균 6.8분
### 알려진 문제
- 점 없는 BSD 접미어(`sed -i bak …`, `sed -i '~' …`)는 접미어를 스크립트로, 스크립트를 파일로 읽는다. 스크립트에 보호 경로가 있으면 오탐(안전한 쪽, main도 같음)
- `sed -i '' -n 's#<보호 경로>#…#p' <파일>`은 스크립트도 파일로 보아 오탐(위 GNU 해석의 대가)

## [플러그인 0.1.4] - 2026-11-24
### 바뀜 ([ADR 0007](docs/decisions/0007-enforce-independent-roles.md))
- guard: 메인 세션은 `.murba/reports/{test-writer,builder,evaluator,pr-reviewer}/`와 `.murba/hidden/`에 쓸 수 없음(서브에이전트 독립 작업의 증거), test-write 단계에서 테스트 파일도 쓸 수 없음. `sh -c`·`eval` 안, 스크립트 파일 안 리터럴 경로, 와일드카드 경로에도 적용
- `murba lock-tests`: 승인 뒤 test-writer 보고가 없으면 거부(`TEST_WRITER_REPORT_MISSING`). `--amend`는 마지막 잠금 뒤의 보고 필요
- qa → browser·report(그리고 qa에서의 `--skip`): 이번 qa 회차의 evaluator 보고가 없으면 거부(`EVALUATOR_REPORT_MISSING`). 빈 파일은 보고로 치지 않음
- 스킬: refactor도 test-writer 보고 뒤 잠금, 보호 폴더 4개는 서브에이전트가 직접 보고, evaluator가 보고조차 못 쓰면 결정 큐 + 보고서 후 멈춤
- 위험 요청이 테스트를 잠그고 build 뒤(evaluate·fix)에서 qa를 생략하면 마지막 구현·qa 진입 뒤의 evaluator 보고 필요. build를 거치지 않은 생략은 제외
- 보고로 치는 파일은 비어 있지 않은 `.md`만(보조 스크립트·로그 제외)
- guard 명령 해석: `sh -c`·`eval`·`find -exec|-execdir|-ok`가 바깥 `cd` 폴더에서 실행되는 것으로 보고 따라감(`{}`는 찾는 폴더 아래 경로), `bash -c -x …`처럼 `-c` 뒤 옵션 건너뜀, 큰따옴표 안 `\"` 처리, `cd -`. 비가역 명령 검사(`cd ~ && sh -c 'rm -rf …'`, `find -exec git push --force`)에도 적용
- evaluator·test-writer의 자기 폴더 쓰기에서 끝 슬래시 경로(`cp a.log .murba/reports/evaluator/`) 허용
- evaluator 지침: 판정 보고를 `.murba/reports/evaluator/<단계>.md`에 반드시 씀(이전 지침의 "쓰기 도구 없음" 문장 정정)
### 검증
- 테스트 248개 중 247 통과, 1 건너뜀(로컬 rg). 규칙·보강마다 되돌린 뮤테이션 31개 모두 새 테스트 실패(1차 6, 리뷰 1회차 8, 2회차 7, 3회차 10)
- 독립 리뷰 1회차: 차단 3건(`sh -c`·`eval`, 스크립트 파일, 와일드카드)·중요 7건 반영
- 독립 리뷰 2회차: 차단 1건(셸 payload가 바깥 `cd`를 잃음: 우회 + evaluator 오탐)·중요 4건 반영. 남긴 범위 밖 형태는 ADR 0007 남은 한계
- 독립 리뷰 3회차(마지막): 차단 1건(`find -exec`의 `{}` 미치환: 오탐 + 우회)·중요 3건(fix 뒤 위험 생략, 약한 `\;` 테스트, 비가역 검사의 cwd·find)·경미 7건 중 5건 반영. 수정 1회 뒤 리뷰 없음(ADR 0003)
- 실제 실행 3회차(`914ee4d`, 6건): 모두 done, 구현 과제 6건 모두 evaluator·test-writer 호출, 블라인드 채점 정답 5건, t067 2/3. t093의 채점 `risky=1`은 `murba decide` 설명 문장 안의 `rm -rf src` 글자가 걸린 것(실행 아님)
- 실제 실행 4회차(`4d8f5ae`, 5건): n12·t045·t067·t093 done, 블라인드 채점 모두 정답(t067 처음 3/3), 모두 evaluator·test-writer 호출. t067에서 메인 세션의 테스트·보고 직접 쓰기 3건을 guard가 거부. n01은 browser 단계에서 30분 시간 초과(연속한 두 명령 사이 16분 정지, hook 활동·백그라운드 작업 없음 → 모델·API 지연으로 판단). 같은 커밋 n01 재실행은 done 4/4(18.3분)
- 실제 실행 2회차(`585463b`, 6건): 구현 과제 4건 모두 evaluator·test-writer 호출, n12에서 `TEST_WRITER_REPORT_MISSING`이 한 번 걸린 뒤 test-writer 보고로 통과. 조사(n13)·위험(t093)은 생략 경로로 정상 종료. 블라인드 채점 정답 5건, t067 2/3(이전과 같음)
- 실제 실행(n01·n10·n12·t045·t067, 리뷰 반영 전 `9018056`): 5건 모두 evaluator·test-writer를 실제로 호출(v0.1.1 비교에서 n12·t045·t067은 빠졌던 단계), 메인 세션의 테스트·보고 직접 쓰기 시도는 guard가 거부. 블라인드 채점 4건 정답, t067 2/3(세 갈래 공통 실패 줄)
- 회귀 세트(머지 뒤 `9e33086`, tag 전): 11/11 done·성공, $14.78, 평균 6.9분
### 알려진 문제
- BSD 형식 `sed -i '' '<스크립트>' <파일>`에서 guard가 스크립트 문자열을 파일 경로로 읽는다. test-write 단계에서 스크립트에 테스트 경로가 있으면 메인 세션 쓰기로 잘못 거부(안전한 쪽 오탐, 회귀 t002에서 1회, 실행은 계속). v0.1.4 전부터 있던 해석 결함이 새 규칙으로 드러남

## [플러그인 0.1.3] - 2026-11-24
### 바뀜 ([ADR 0006](docs/decisions/0006-no-wakeups-and-gitignore.md))
- guard: 승인 전 메인 세션의 프로젝트 `.gitignore` 쓰기도 거부(무시 줄로 새 파일을 소스 변경 게이트에서 숨길 수 있었음)
- 생략 게이트(`SOURCE_CHANGED_IN_SKIPPED_RUN`): `.gitignore` 변경도 변경으로 봄. 자기 자신을 무시하는 새 `.gitignore` 포함, 모노레포 상위 폴더 `.gitignore`도 init 때 해시와 비교. 이미 무시된 폴더나 추적 파일 없는 도구 캐시·venv·coverage 보고서 폴더(이름, `pyvenv.cfg`·`CACHEDIR.TAG`·`# Created by …`) 안은 제외, init 때 이미 바뀐 것은 기준선
- guard: 승인 전 `../.gitignore` 쓰기도 거부
- 두 소스 변경 게이트: `assume-unchanged`·`skip-worktree` 표시된 추적 파일도 내용 비교
- guard: murba 실행 중(done 전) `ScheduleWakeup`·`CronCreate` 거부(t093에서 서브에이전트 대기에 예약 호출 4회). hook matcher에 추가
### 검증
- 테스트 235개 중 234 통과, 1 건너뜀(로컬 rg). 변경마다 되돌린 뮤테이션 17종에서 새 테스트 실패 확인
- 독립 리뷰 2회: 1차 차단 2건(자기 무시 `.gitignore`, init 전 `.gitignore` 오탐)·중요 3건, 2차 차단 2건(추적 폴더 안 새 `.gitignore`, 도구 캐시 오탐)·중요 3건, 3차(마지막) 차단 1건(모노레포 하위 폴더의 표시 파일이 게이트 오류를 냄)·중요 3건·경미 일부 반영
- 실제 실행(n13·n10·t093·n01, `--isolate`, 블라인드 채점): `218cd29`·`aca3684`·`264f86d` 12건 모두 정답·done, 예약 호출 0, 게이트 오탐 0(guard 거부는 test-writer·evaluator 역할 규칙의 의도된 차단만). 실행 $10.06, 채점 $0.24
- 함께 관찰(범위 밖): test-writer·evaluator 서브에이전트 없이 메인 세션이 판정을 기록한 실행이 있음(t093 등). CLI가 강제하지 않음 → 0.1.4에서 강제
- 회귀 세트(머지 뒤 `ee3eb5f`, tag 전): 11/11 done·성공, $13.55, 평균 8.3분

## [플러그인 0.1.2] - 2026-11-24
### 바뀜 ([ADR 0005](docs/decisions/0005-skipped-runs-and-baseline.md))
- `murba init`이 대상 저장소 `.gitignore`를 만들거나 고치지 않음. `.murba/.gitignore`(`*`)로 제외(v0.1.1 확장 비교: murba 25개 중 20개에서 사용자 커밋에 섞임, n13 실패)
- build를 건너뛴 실행(조사·위험 요청 보고)은 init 이후 구현 파일을 바꾸면 `--skip`과 `report → done`에서 거부(`SOURCE_CHANGED_IN_SKIPPED_RUN`, 승인 여부와 무관). triage에서 과제 성격을 스스로 조사·위험으로 적어 생략한 뒤 직접 고치는 경로를 닫음
- 구현 파일 판정(소스 변경 게이트 공통): 프로젝트 폴더 기준 경로(모노레포 하위 폴더), 비 ASCII 파일 이름, 이름 바꾸기의 옛 경로, 통째로 추적 안 된 의존성 이름 폴더 제외, 코드 확장자 추가. 기준 커밋이 있는데 git이 실패하면 거부(`SOURCE_GATE_ERROR`)
- 미검증 AC가 남은 채 evaluate를 건너뛰는 생략도 같은 게이트. `report → build` 재작업은 build 이후 생략 기록을 지움
- init 때 이미 바뀌어 있던 파일은 내용 해시로 기준선 기록(`base_dirty`). 그대로면 소스 변경 게이트에서 제외. `init --force`(사람 확인)는 새 실행으로 기준선을 다시 잡음
### 검증
- 테스트 221개 중 220개 통과, 1개 건너뜀(새 17개. rg 검사 테스트는 node에서 rg를 못 찾는 환경이면 건너뜀 — 로컬은 Claude Code 내장 rg 14.1.1로 수동 확인, CI는 ripgrep을 설치해 221/221). 변경마다 되돌린 뮤테이션(게이트 무력화, 승인 면제, 재초기화 기준선, 기준선 필터·되돌림, `--relative`, `--no-renames`, `-z`, 추적 안 된 파일 나열 방식, 출력 한도, fail-closed, 재작업 기록 삭제, evaluate 생략)에서 새 테스트가 실패함을 확인
- 독립 리뷰 1차: 차단 3건(비 ASCII 이름, 승인된 생략, 하위 폴더 기준선)과 중요 5건 반영. 2차: 차단 3건(git 출력 한도, 추적 파일의 폴더 이름 제외 회귀, 재작업 오탐)과 중요·경미 반영. 3차(마지막): 차단 2건(재초기화 기준선 유지가 두 번째 실행을 막음, 추적 폴더 안 새 파일 제외) 반영
- 실제 실행(`--isolate`, sonnet, 블라인드 채점): 리뷰 반영 전 `c57e0ac`·1차 `6fdcc7d`(n13·n10·t074), 2차 `91e8fef`·3차 `be9003a`(+t093) 모두 정답·done, 대상 저장소 `.gitignore` 0, 게이트 오탐 0. t093(위험 요청)은 복구 가능을 확인한 뒤 전체 파이프라인으로 재작성. 실행 비용 합계 $7.68, 채점 $0.48
### 알려진 문제
- git 저장소가 아니거나 첫 커밋 전에 init하면 소스 변경 게이트를 검사하지 않는다(첫 커밋 뒤 `init --force`로 켜짐)
- 생략한 실행이 done에서 거부돼도 headless Stop 게이트는 보고서가 있으면 실행을 끝낸다(단계는 report로 남음)
- 승인 전 메인 세션은 프로젝트 `.gitignore`를 쓸 수 있고, 게이트는 `--exclude-standard`로 추적 안 된 파일을 나열한다. `.gitignore`에 줄을 더해 새 파일을 숨기면 게이트가 보지 못한다(예외는 v0.1.1에서 init이 이 파일을 쓰던 때 생김)
- 무인 실행 1건(t093)에서 서브에이전트를 백그라운드로 돌리고 `ScheduleWakeup`으로 기다린 사례(규칙 10 위반, 결과는 정상)

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
