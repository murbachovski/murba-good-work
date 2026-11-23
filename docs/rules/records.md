# 기록 규칙

기록은 main 브랜치에 **추가만** 한다. 지난 기록을 고치지 않는다. 틀린 기록은 새 기록으로 바로잡고 이전 기록을 가리킨다.

## 무엇을 어디에
| 기록 | 위치 | 언제 |
|---|---|---|
| 작업 보고서 | `docs/history/YYMMDD-vX.Y.Z.md` + `.html` | 세션·작업 끝날 때 |
| 결정 기록(ADR) | `docs/decisions/NNNN-<제목>.md` | 논쟁이 있었거나 되돌리기 어려운 결정 |
| 버전별 변경 | `CHANGELOG.md` | 버전 올릴 때 |
| 주간 검토 | `docs/evolve/YYMMDD.md` | evolve 실행 후 |

## 작업 보고서 양식
1. 요약 3줄: 무엇을 했나 / 결과 / 다음 할 일
2. 첫 표 고정: ❌ 실패·생략 / ⚠️ 미검증 / 범위 밖 변경
3. 단계별 표: 단계 | 상태(✅⚠️❌⏸) | 증거(명령·파일·URL)
4. 내가 내린 결정(틀렸을 때 비용 포함)
5. 남은 질문(결정 큐)
6. 다음 할 일

HTML은 같은 내용을 브라우저에서 보기 좋게 만든 것이다. 원본은 md다.

## 버전
- 문서 버전(이 저장소 기록용)과 플러그인 버전(`plugin.json`의 `version`)은 따로 관리한다
- 문서 버전: 설계 단계 `v0.0.x`
- 플러그인 버전: SemVer. 첫 동작 버전 `0.1.0`
- 버전 tag와 GitHub Release는 사용자 승인 후

## 브랜치
- 기록 전용 브랜치를 만들지 않는다. 기록은 main에 누적
- 작업은 `feat/*`, `fix/*`, `evolve/*` 브랜치 → PR → 리뷰 → main 머지
- PR 본문 40줄 이하: Why / What changed / Scope / Tradeoffs / Blast Radius / Verification
