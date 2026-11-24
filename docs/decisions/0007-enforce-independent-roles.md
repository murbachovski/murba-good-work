# 0007 test-writer·evaluator의 독립 작업을 CLI가 강제 (v0.1.4)

- 날짜: 2026-11-24
- 상태: 확정(사용자 선택: "v0.1.4에서 강제")
- 맥락: 실제 실행에서 메인 세션이 test-writer 없이 테스트를 쓰거나(확장 비교 t067, v0.1.3 t093), qa의 독립 평가(evaluator)를 부르지 않고 판정을 기록하고 끝냈다(n12·t045, v0.1.3 t093). 기획서의 신뢰성 원칙(독립 평가자, 테스트 먼저)은 프롬프트 지시였고 CLI가 강제하지 않았다

## 결정
| 항목 | v0.1.3 | v0.1.4 |
|---|---|---|
| 서브에이전트 보고 폴더 | 메인 세션도 쓸 수 있음 | `.murba/reports/{test-writer,builder,evaluator,pr-reviewer}/`는 그 서브에이전트만 쓴다(guard가 메인 세션의 Write·Bash 쓰기 거부). 이 폴더의 파일이 독립 작업의 증거 |
| test-write 단계의 테스트 파일 | 메인 세션도 씀 | 메인 세션 쓰기 거부(test-writer만) |
| `murba lock-tests` | 조건 없음 | 승인 뒤 test-writer 보고 파일이 있어야 함(`TEST_WRITER_REPORT_MISSING`). `--amend`는 마지막 잠금 뒤의 test-writer 보고 |
| qa → browser·report | 최종 판정만 확인 | 이번 qa 진입 뒤 evaluator 보고 파일이 있어야 함(`EVALUATOR_REPORT_MISSING`). BLOCKED여도 evaluator가 그 사실을 쓴다 |

AC별 evaluate는 지금처럼 메인 세션이 테스트 종료 코드로 결정적으로 판정한다(비용 절감, 기획서·build-loop.md). 독립 평가는 qa에서 전체를 한 번 본다.

## 남은 한계
- 보고 파일의 **존재와 시각**만 본다. 내용(판정이 기록과 같은지)은 보지 않는다. 메인 세션이 evaluator 판정과 다르게 기록하는 것은 qa-browser.md 지시(불일치 시 INCONCLUSIVE)에 맡긴다
- 메인 세션이 스크립트 안에서 계산한 경로로 보고 폴더에 쓰는 것은 막지 못한다(의도적 우회, ADR 0003 범위 밖)
- setup 단계(승인 뒤, test-write 전)에는 메인 세션이 테스트 파일을 쓸 수 있다(러너 설정 확인용). 잠금에는 test-writer 보고가 필요하다

## 틀렸을 때 비용
- 서브에이전트 호출이 실패하는 환경(권한 등)에서는 test-write·qa를 넘어갈 수 없다. 이때는 결정 큐에 남기고 보고서로 끝낸다(보고서에 ❌)
