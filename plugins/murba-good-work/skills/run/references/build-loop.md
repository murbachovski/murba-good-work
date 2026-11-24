# build → evaluate → fix 루프 (6 구현 + 8 검증)

AC를 **하나씩** 처리한다. 아래는 절차 요약이다(그대로 셸에 치지 않는다. Bash는 단순 명령 1개씩).

```
반복:
  murba budget                → 종료 코드 3이면 report로
  murba ac next               → 출력된 AC ID를 받는다. 종료 코드 2 = 남은 AC 없음 → qa
  build(ID) → evaluate(ID)
  NOT_VERIFIED/INCONCLUSIVE → fix(ID) → evaluate(ID)   (최대 3라운드)
```
- `murba ac next`는 `[after:AC-xxx]` 선후관계를 지킨다. **순서를 맞추려고 임시 보류(hold)하지 않는다.** 순서 문제가 생기면 `murba decide taste "AC 순서"`로 기록하고 선행 AC를 먼저 진행한다
- 어쩔 수 없이 임시 보류를 썼다면 선행 AC가 VERIFIED 된 뒤 `murba ac unhold <ID>`로 해제한다. qa의 `--final` VERIFIED는 보류를 자동 해제한다

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
   - `git rev-parse --short HEAD` → 출력된 짧은 SHA를 아래에 그대로 쓴다
   - `node --test --test-name-pattern "AC-xxx" <테스트 glob> > .murba/evidence/AC-xxx-<짧은SHA>.log 2>&1` → 종료 코드는 도구 결과에 나온다
   - 숨긴 검사도 같은 방식으로 `.murba/evidence/AC-xxx-<짧은SHA>-hidden.log`
3. 판정: 종료 코드 0 → VERIFIED / 0 아님 → NOT_VERIFIED / 테스트가 0개 실행됨·명령 실패 → INCONCLUSIVE(통과 아님)
4. 기록: `git rev-parse HEAD`의 출력 SHA를 복사해 `murba ac verdict <ID> <판정> --sha <SHA> --evidence .murba/evidence/AC-xxx-<짧은SHA>.log`
5. INCONCLUSIVE가 2번 연속이면 그때만 `murba-good-work:evaluator`를 불러 원인을 본다(입력: AC 본문, base·현재 SHA, 증거 파일 경로)
6. 다음:
   - VERIFIED → 다음 AC: `murba phase build` (남은 AC 없으면 `murba phase qa`)
   - 그 외 → `murba phase fix`

## 테스트 자체가 틀렸을 때 (드묾)
고정된 테스트(숨긴 검사 포함)가 AC와 어긋나는 **결함**이 실행 증거로 드러났을 때만(예: 다른 AC 동작을 전제). 구현이 틀린 것이면 이 절차를 쓰지 않는다.
1. `murba decide taste "AC-xxx 테스트 결함" --why "<관찰: 기대 vs 실제, 근거 AC 문장>"`
2. test-writer를 그 AC만 다시 디스패치: AC 본문 + 관찰된 결함. 구현 코드는 주지 않는다(builder는 여전히 테스트를 못 고친다)
3. 고친 파일만 재고정: `murba lock-tests --amend <파일> --reason "<결함 요약>"` → 보고서 ⚠️에 TEST_AMENDED로 남는다
4. 그 AC의 evaluate부터 다시

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
| "순서 때문에 잠깐 hold" | hold는 실패 상한용. 순서는 `[after:]`와 `murba ac next` |
