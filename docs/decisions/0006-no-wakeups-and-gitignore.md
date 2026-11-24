# 0006 murba 실행 중 예약 호출 금지, .gitignore로 게이트를 숨기지 못하게 (v0.1.3)

- 날짜: 2026-11-24
- 상태: 확정(사용자 선택: "둘 다 v0.1.3에서 수정"). [ADR 0005](0005-skipped-runs-and-baseline.md) 후속
- 맥락
  - v0.1.2 단계 끝 점검: guard가 승인 전 메인 세션의 프로젝트 `.gitignore` 쓰기를 예외로 허용(v0.1.1, init이 이 파일을 쓰던 때 생긴 예외). 게이트는 `--exclude-standard`로 추적 안 된 파일을 나열하므로, 새 파일을 만들고 `.gitignore`에 한 줄 넣으면 소스 변경 게이트가 보지 못한다
  - v0.1.2 실제 실행 t093: 메인 세션이 서브에이전트를 기다리려고 `ScheduleWakeup`을 4회 호출(SKILL 규칙 10 위반). `-p`에서 서브에이전트는 원래 백그라운드로 돌고 완료 알림이 온다(다른 13건은 예약 호출 없이 진행)

## 결정
| 항목 | v0.1.2 | v0.1.3 |
|---|---|---|
| 승인 전 `.gitignore` 쓰기 | 허용 | 다른 프로젝트 파일과 같이 거부(조사 과제 제외) |
| 생략 게이트의 `.gitignore` | 루트 `.gitignore` 제외 | 어느 폴더의 `.gitignore`든 바뀌면 변경으로 봄(`SOURCE_CHANGED_IN_SKIPPED_RUN`). 자기 자신을 무시하는 새 `.gitignore`도 보이게 `--exclude-standard` 없이 따로 나열. 단 새 `.gitignore`가 바깥 규칙으로 이미 무시된 폴더 안이거나, 추적 파일 없는 버릴 수 있는 폴더(의존성·캐시 이름, `pyvenv.cfg`·`CACHEDIR.TAG`가 있는 폴더: venv·mypy·ruff 등) 안이면 제외. 추적 파일이 있는 폴더는 이름과 무관하게 포함. init 때 이미 바뀌어 있던 `.gitignore`는 내용 해시 기준선(`base_dirty`) |
| 상위 폴더 `.gitignore`(모노레포) | 보지 않음 | 프로젝트가 저장소 하위 폴더면 init 때 `../.gitignore` …의 내용 해시를 기록(`base_outer_ignore`)해 생략 게이트에서 비교. guard는 승인 전 `../.gitignore` 쓰기도 거부 |
| git의 '안 바뀜' 표시 | 보지 않음 | `assume-unchanged`(`h`)·`skip-worktree`(`S`) 표시된 추적 파일도 작업 트리 내용을 인덱스와 비교(두 게이트 공통). `ls-files -v -s` 한 번 + `hash-object --stdin-paths` 한 번(파일 2,000개 1초 안팎). 링크는 링크 텍스트로 비교, 서브모듈·폴더·작업 트리에 없는 파일(sparse checkout)은 제외 |
| `ScheduleWakeup`·`CronCreate` | 제한 없음 | murba 실행 중(phase가 있고 done이 아님) guard가 거부(hook matcher에 추가). done 뒤에는 허용 |

## 남은 한계
- approve·lock-tests 게이트(`SOURCE_CHANGED_BEFORE_TESTS`)는 루트 `.gitignore`를 계속 제외한다. setup 단계가 `node_modules/` 등을 정상적으로 넣기 때문이다. 승인 뒤(setup·test-write) `.gitignore`로 새 구현 파일을 숨기는 경로는 남는다. 이후 build·evaluate를 거치므로 검증 없이 끝나지는 않는다
- `.git/info/exclude`와 `git config core.excludesFile`로 추가한 무시 규칙은 보지 않는다(정상 작업에서 쓸 이유가 없는 경로·설정)
- 조사 과제는 승인 전 쓰기 차단 대상이 아니므로 `.gitignore`를 쓸 수 있다. 대신 생략 게이트가 그 변경을 거부한다

## 틀렸을 때 비용
- 승인 전 `.gitignore`에 `.murba/`를 넣으려는 이전 습관은 거부된다(v0.1.2부터 필요 없음)
- 예약 호출이 꼭 필요한 정상 흐름은 없다고 봤다. 거부 메시지는 "할 일이 없으면 턴을 끝내고 알림을 기다린다"로 안내한다(`-p`에서 완료 알림은 턴 종료 뒤에 온다)
- 독립 리뷰(PR #14) 반영: 1차 자기 무시 `.gitignore`, init 전 `.gitignore` 기준선, 예약 호출 거부 범위(done 뒤 허용)와 문구, assume-unchanged·skip-worktree. 2차 추적 폴더(`build/`·`out/`) 안 새 `.gitignore`, 도구 캐시·venv 오탐, 표시 파일 성능·링크, 상위 폴더 `.gitignore`, `check-ignore`에 폴더 끝 `/`를 붙이면 그 폴더 자신의 `*`가 적용되는 문제
- 3차: 모노레포 하위 폴더에서 `hash-object --stdin-paths`가 루트 기준 경로를 여는 문제(루트에서 접두를 붙여 실행), coverage.py 보고서 폴더(`# Created by …` 첫 줄 표식), 프로젝트 경로에 링크가 끼면 상위 `.gitignore`를 엉뚱하게 푸는 문제(실제 경로 기준), 위에서 아래로 걷기(성능), sha256 저장소의 링크 해시
- 버릴 수 있는 폴더 판정(이름·표식 파일·`# Created by …`)에 없는 도구 캐시가 `.gitignore`를 만들면 오탐이 남는다. 반대로 `.gitignore` 첫 줄을 `# Created by`로 쓰거나 `CACHEDIR.TAG`를 심어 숨기는 것은 의도적 위장이라 범위 밖
- `core.autocrlf=true`에서 CRLF로 커밋된 파일에 init 뒤 표시를 붙이면 내용이 같아도 변경으로 볼 수 있다(init 전 표시는 기준선이 가림)
- setup 단계에서 추적 중인 `src/.gitignore`(impl_globs 안)를 고치면 approve·lock-tests 게이트가 구현 파일 변경으로 본다(루트 `.gitignore`만 제외)
