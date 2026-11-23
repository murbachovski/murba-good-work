# qa (9 QA) + browser (10 실제 브라우저)

## qa
1. `murba budget`
2. 최종 SHA: `HEAD=$(git rev-parse HEAD)`
3. **전 AC 재판정**: 보류 안 된 모든 AC에 대해 테스트 + 숨긴 검사를 직접 실행하고
   `murba ac verdict <ID> <판정> --sha $HEAD --evidence <로그> --final`
   (AC별 판정은 진행 확인용. 최종은 이것)
4. **전체 회귀**: 러너 전체 실행 `npm test; echo exit=$?` → `.murba/reports/qa/regression.log`
5. **flaky**: 재시도로 통과한 테스트가 있으면 ⚠️로 기록(`murba decide mechanical "flaky: <테스트>"`)
6. **뮤테이션 검사**(네가 스크립트로, evaluator 아님). AC마다:
   - 그 AC 구현의 핵심 한 줄을 최소 변경(조건 반전, 반환값 상수화, 경계 ±1)
   - 해당 AC 테스트 실행 → **실패해야 정상**
   - `git checkout -- <파일>` 로 즉시 복원, `git status --short` 깨끗한지 확인
   - 실패하지 않으면 그 AC 테스트는 "동작 미증명" → `murba decide taste "AC-xxx 테스트 약함" --why "뮤턴트 생존"`
   - 결과 표를 `.murba/reports/qa/mutation.md`
7. 상위 목표 검사 1개: spec의 "성공" 줄을 실제 사용 흐름으로 1회 확인(명령 또는 브라우저)
8. handoff → `[browser]` AC가 있으면 `murba phase browser`, 없으면 `murba phase report`

## browser
1. 증거 폴더: `RUN=.murba/evidence/run-$(date -u +%Y%m%dT%H%M%SZ)` — 기존 폴더 덮어쓰기 금지
2. `murba-good-work:evaluator` 디스패치(단계: browser). 지시:
   - `npx playwright test e2e/ 2>&1 | tee $RUN/playwright.log; echo exit=$?`
   - 각 `[browser]` AC: 스크린샷을 `$RUN/AC-xxx.png`로 복사(테스트에서 `page.screenshot({path})` 또는 test-results에서 복사)
   - 콘솔 error·pageerror·4xx/5xx 응답이 있으면 그 AC는 NOT_VERIFIED
   - 브라우저 실행 실패·건너뜀(skipped) = NOT_VERIFIED (통과 아님)
3. 네가 `$RUN` 에 PNG가 실제로 있는지 `ls` 로 확인. 스크린샷을 Read로 열어 화면이 AC와 맞는지 눈으로 확인(참고 의견)
4. 실패한 `[browser]` AC → `murba ac verdict <ID> NOT_VERIFIED --sha $HEAD --final`, fix 루프로 돌아가지 않고 보고(최종 단계이므로) + decide
5. handoff → `murba phase report`

## 핑계와 실제
| 핑계 | 실제 |
|---|---|
| "AC별로 이미 통과했다" | 이후 커밋이 판정을 무효로 만든다. head에서 다시 |
| "브라우저가 안 떠서 건너뜀" | 건너뜀 = 실패 |
| "뮤턴트가 살아남았지만 괜찮다" | 테스트가 아무것도 검사 안 한다는 뜻. 기록한다 |
