# 0007 test-writer·evaluator의 독립 작업을 CLI가 강제 (v0.1.4)

- 날짜: 2026-11-24
- 상태: 확정(사용자 선택: "v0.1.4에서 강제")
- 맥락: 실제 실행에서 메인 세션이 test-writer 없이 테스트를 쓰거나(확장 비교 t067, v0.1.3 t093), qa의 독립 평가(evaluator)를 부르지 않고 판정을 기록하고 끝냈다(n12·t045, v0.1.3 t093). 기획서의 신뢰성 원칙(독립 평가자, 테스트 먼저)은 프롬프트 지시였고 CLI가 강제하지 않았다

## 결정
| 항목 | v0.1.3 | v0.1.4 |
|---|---|---|
| 서브에이전트 보고 폴더 | 메인 세션도 쓸 수 있음 | `.murba/reports/{test-writer,builder,evaluator,pr-reviewer}/`는 그 서브에이전트만 쓴다(guard가 메인 세션의 Write·Bash 쓰기 거부). 이 폴더의 파일이 독립 작업의 증거 |
| test-write 단계의 테스트 파일, 숨긴 검사 | 메인 세션도 씀 | test-write 단계 테스트 파일과 `.murba/hidden/`은 메인 세션 쓰기 거부(test-writer만) |
| 쓰기 경로 판정 | Write·Edit·Bash 리터럴 | `sh -c`·`bash -lc`·`eval` 안, 메인 세션이 만든 스크립트 파일 안의 리터럴 경로, 와일드카드 경로까지 같은 규칙(이 과정에서 `bashWriteRels`가 셸 payload를 따라가게 되어 원장 파일 보호도 같이 강화) |
| `murba lock-tests` | 조건 없음 | 승인 뒤 test-writer 보고 파일이 있어야 함(`TEST_WRITER_REPORT_MISSING`). `--amend`는 마지막 잠금 뒤의 test-writer 보고 |
| 테스트를 잠근 위험 요청이 build 뒤에서 qa를 생략 | 검사 없음 | 마지막 구현(build·fix 진입)·qa 진입·승인 뒤 evaluator 보고가 있어야 함 |
| qa → browser·report | 최종 판정만 확인 | 이번 qa 진입 뒤 evaluator 보고 파일(빈 파일 제외)이 있어야 함(`EVALUATOR_REPORT_MISSING`). qa에서 `--skip`으로 떠날 때(위험 요청)도 같음. BLOCKED여도 evaluator가 그 사실을 쓴다. 진입 시각 기록이 없는 이전 원장은 마지막 qa 진입 이벤트로 판단 |

AC별 evaluate는 지금처럼 메인 세션이 테스트 종료 코드로 결정적으로 판정한다(비용 절감, 기획서·build-loop.md). 독립 평가는 qa에서 전체를 한 번 본다.

## 남은 한계
- 보고 파일의 **존재와 시각**만 본다. 내용(판정이 기록과 같은지)은 보지 않는다. 메인 세션이 evaluator 판정과 다르게 기록하는 것은 qa-browser.md 지시(불일치 시 INCONCLUSIVE)에 맡긴다
- 메인 세션이 스크립트 안에서 변수·상수에 담거나 계산한 경로(`const out = '…'`, `path.join(…)`)로 보고 폴더에 쓰는 것은 막지 못한다. 스크립트 검사는 쓰기 호출에 직접 쓴 리터럴만 본다(ADR 0003 범위 밖)
- Bash heredoc으로 프로젝트 밖(`/tmp` 등)에 만든 스크립트를 실행하는 것, 디스크에 이미 있던 스크립트를 실행하는 것, 셸 payload 4단 이상 중첩, `cp -t`·`curl -o`·`perl -e` 같은 드문 쓰기 형태는 보지 않는다
- 보고는 `.md` 파일만 센다(보조 스크립트·로그 제외). 내용이 판정 보고인지는 보지 않는다
- 괄호 서브셸 안의 `cd`(`(cd /tmp) && …`)는 뒤 명령의 폴더로 잘못 이어진다(괄호 범위를 추적하지 않음)
- `rm -rf "\$HOME"`(이름이 `$HOME`인 파일)은 홈 삭제로 보고 거부한다(안전한 쪽 오탐)
- setup 단계(승인 뒤, test-write 전)에는 메인 세션이 테스트 파일을 쓸 수 있다(러너 설정 확인용). 잠금에는 test-writer 보고가 필요하다

## 틀렸을 때 비용
- 서브에이전트 호출이 실패하는 환경(권한 등)에서는 test-write·qa를 넘어갈 수 없다. 이때는 결정 큐에 남기고 보고서로 끝낸다(보고서에 ❌, qa-browser.md 절차)
- 독립 리뷰 3회차 반영: `find -exec`의 `{}`를 찾는 폴더 아래 경로로, `-execdir`는 그 폴더와 상위 폴더에서 실행으로 해석. 비가역 명령 검사도 payload의 바깥 `cd`와 `find -exec`를 따라감. `bash -c -x`, `cd -`, evaluator 끝 슬래시 오탐, 위험 생략 기준 시각(마지막 build·fix 진입 포함, build를 거치지 않은 생략 제외)
- 독립 리뷰 2회차 반영: 셸 payload가 바깥 `cd`를 잃던 결함(우회와 evaluator 오탐), 큰따옴표 안 `\"`·`-c --`·`find -exec` 추적, 위험 요청이 evaluate에서 qa를 건너뛰는 생략(테스트를 잠근 실행은 승인 뒤 evaluator 보고 필요), `--amend`의 이전 원장 대체 시각(마지막 잠금 이벤트), 보고는 `.md`만
- 독립 리뷰(PR #16) 1회차 반영: `sh -c`·`eval`·스크립트 파일·와일드카드 우회, 메인 세션의 숨긴 검사 쓰기, refactor 흐름, DETAIL 저장 지시, BLOCKED·보고 실패 절차, 위험 요청의 qa 생략, 시각 기록 없는 이전 원장
