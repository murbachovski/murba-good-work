# build → evaluate → fix 루프 (6 구현 + 8 검증)

AC를 **하나씩** 처리한다.

```
loop:
  murba budget                         (3이면 report로)
  ID=$(murba ac next) || break         (종료 코드 2 = 남은 AC 없음 → qa)
  build(ID) → evaluate(ID)
  NOT_VERIFIED/INCONCLUSIVE → fix(ID) → evaluate(ID)   (최대 3라운드)
```

## build(ID)
- `murba-good-work:builder` 디스패치. kickoff 입력:
  - AC 본문(spec.md의 그 줄)과 관련 spec 절 경로
  - 이전 AC의 handoff 경로
  - **주지 않는 것**: 테스트 파일 내용, hidden 경로
- 완료 조건: 구현 + 커밋 1개(`feat: AC-xxx …`) + 자기가 실행한 명령 요약
- 응답 받으면: `git log -1 --format=%H` 로 커밋 확인, `murba check-tests`(테스트 변조 검사, 종료 코드 2면 즉시 `git revert` 후 builder에 "테스트 수정 금지" 재지시)
- handoff → `murba phase evaluate`

## evaluate(ID) — 결정적 판정(에이전트 호출 없음)
AC별 판정은 진행 확인용이다. **오케스트레이터가 직접** 실행해 종료 코드로 정한다. 독립 평가자(evaluator)는 qa·browser 단계에서 전체를 본다(비용 절감, 결과는 같은 실행 증거).
1. `murba check-tests` — 종료 코드 2면 테스트 변조 → 그 커밋 `git revert --no-edit`, builder에 "테스트 수정 금지" 재지시
2. 해당 AC 테스트 + 그 AC의 숨긴 검사를 실행하고 출력을 증거 파일로 남긴다:
   `node --test --test-name-pattern "AC-xxx" <테스트 glob> > .murba/evidence/AC-xxx-<짧은SHA>.log 2>&1; echo "exit=$?" >> 같은 파일`
3. 판정: 종료 코드 0 → VERIFIED / 0 아님 → NOT_VERIFIED / 테스트가 0개 실행됨·명령 실패 → INCONCLUSIVE(통과 아님)
4. 기록: `murba ac verdict <ID> <판정> --sha $(git rev-parse HEAD) --evidence .murba/evidence/AC-xxx-<짧은SHA>.log`
5. INCONCLUSIVE가 2번 연속이면 그때만 `murba-good-work:evaluator`를 불러 원인을 본다(입력: AC 본문, base·현재 SHA, 증거 파일 경로)
6. 다음:
   - VERIFIED → 다음 AC: `murba phase build` (남은 AC 없으면 `murba phase qa`)
   - 그 외 → `murba phase fix`

## fix(ID)
1. `murba fix-round <ID>` — 종료 코드 3(상한) →
   `murba ac hold <ID> --reason "<마지막 실패>"`, `murba decide taste "AC-xxx 보류" --why "3라운드 실패" --cost "<기능 누락 영향>"`, 다음 AC로(`murba phase build` 또는 `qa`).
2. 라운드 1~2: **같은 builder**에 SendMessage. 라운드 3: **opus 새 builder**(새 컨텍스트, model: opus).
3. 전달하는 것: 실패한 AC ID, 관찰된 동작(기대 vs 실제 출력 몇 줄), 이전 시도 요약. **테스트 원문 금지.**
4. 2회 연속 개선 없음(같은 실패) → 라운드 3 전에 전제 검증: 실패 원인 가설을 적고 직접 실행으로 확인한 뒤 전달.
5. **회귀 방지**: 수정 후 이전에 VERIFIED였던 AC가 깨지면 `git reset --hard <last_pass_sha>` 는 비가역이므로 쓰지 않는다 → `git revert --no-edit <수정 커밋>` 으로 되돌리고 다른 접근 지시.
6. 무관한 파일 수정이나 되돌리기 2회 → 그 AC 보류.
7. handoff → `murba phase evaluate`

## 핑계와 실제
| 핑계 | 실제 |
|---|---|
| "테스트를 보여주면 더 빨리 고침" | 테스트에 맞춘 꼼수가 나온다. 관찰된 동작만 준다 |
| "4라운드면 될 것 같다" | 3라운드 상한. 보류하고 다음 AC |
| "통과한 AC도 더 다듬자" | 통과한 결과는 다시 고치지 않는다 |
