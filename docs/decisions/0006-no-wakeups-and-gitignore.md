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
| 생략 게이트의 `.gitignore` | 루트 `.gitignore` 제외 | 어느 폴더의 `.gitignore`든 바뀌면 변경으로 봄(`SOURCE_CHANGED_IN_SKIPPED_RUN`) |
| `ScheduleWakeup`·`CronCreate` | 제한 없음 | `.murba/`가 있는 프로젝트에서 guard가 거부(hook matcher에 추가) |

## 남은 한계
- approve·lock-tests 게이트(`SOURCE_CHANGED_BEFORE_TESTS`)는 루트 `.gitignore`를 계속 제외한다. setup 단계가 `node_modules/` 등을 정상적으로 넣기 때문이다. 승인 뒤(setup·test-write) `.gitignore`로 새 구현 파일을 숨기는 경로는 남는다. 이후 build·evaluate를 거치므로 검증 없이 끝나지는 않는다
- `.git/info/exclude`는 보지 않는다(정상 작업에서 쓸 이유가 없는 경로)
- 조사 과제는 승인 전 쓰기 차단 대상이 아니므로 `.gitignore`를 쓸 수 있다. 대신 생략 게이트가 그 변경을 거부한다

## 틀렸을 때 비용
- 승인 전 `.gitignore`에 `.murba/`를 넣으려는 이전 습관은 거부된다(v0.1.2부터 필요 없음)
- 예약 호출이 꼭 필요한 정상 흐름은 없다고 봤다. 있으면 그 실행에서 거부 메시지를 보고 알림 대기로 바꾼다
