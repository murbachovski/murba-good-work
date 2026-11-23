# qa (9 QA) + browser (10 실제 브라우저)

## qa
1. `murba budget`
2. 최종 SHA: `git rev-parse HEAD` → 출력값을 이후 명령에 그대로 복사(이하 `<HEAD>`)
3. **전 AC 재판정**: 보류 안 된 모든 AC에 대해 테스트 + 숨긴 검사를 직접 실행하고
   `murba ac verdict <ID> <판정> --sha <HEAD> --evidence <로그> --final`
   (AC별 판정은 진행 확인용. 최종은 이것)
4. **전체 회귀**: `npm test > .murba/reports/qa/regression.log 2>&1` (종료 코드는 도구 결과)
5. **flaky**: 재시도로 통과한 테스트가 있으면 ⚠️로 기록(`murba decide mechanical "flaky: <테스트>"`)
6. **뮤테이션 검사**(네가 스크립트로, evaluator 아님). AC마다:
   - 그 AC 구현의 핵심 한 줄을 최소 변경(조건 반전, 반환값 상수화, 경계 ±1)
   - 해당 AC 테스트 실행 → **실패해야 정상**
   - `git checkout -- <파일>` 로 즉시 복원, `git status --short` 깨끗한지 확인
   - 실패하지 않으면 그 AC 테스트는 "동작 미증명" → `murba decide taste "AC-xxx 테스트 약함" --why "뮤턴트 생존"`
   - 결과 표를 `.murba/reports/qa/mutation.md`
7. **독립 평가(1회)**: `murba-good-work:evaluator` 디스패치(단계: qa). 입력: spec 경로, base SHA(`git rev-list --max-parents=0 HEAD` 또는 작업 시작 SHA)와 HEAD, `.murba/evidence/`·`.murba/reports/qa/` 경로. 지시: 테스트·숨긴 검사를 직접 다시 실행, diff에서 테스트 조작 규칙(삭제·skip·특정 입력 분기·몽키패치) 확인, AC별 VERIFIED/NOT_VERIFIED/INCONCLUSIVE.
   - 평가자와 3번의 결정적 판정이 다르면 그 AC는 `--final` INCONCLUSIVE로 다시 기록하고 `murba decide taste "AC-xxx 판정 불일치" --why "<평가자 근거>"`
   - 평가자가 **BLOCKED(도구 거부 등)** 이면: 평가자가 하려던 명령을 네가 직접 실행해 판정은 기록하되 `murba decide taste "evaluator BLOCKED: 독립 평가 미실시" --why "<거부된 명령>"`. 보고서에서 독립 평가는 **⚠️ 미검증**(✅ 아님)
8. 상위 목표 검사 1개: spec의 "성공" 줄을 실제 사용 흐름으로 1회 확인(명령 또는 브라우저)
9. handoff → `[browser]` AC가 있으면 `murba phase browser`, 없으면 `murba phase report`

## browser
1. 증거 폴더: `murba evidence-run` — 출력 경로가 `<RUN>`(새 폴더, 테스트는 `.murba/evidence/CURRENT`로 찾음). 명령 앞 환경변수 지정 금지
2. `murba-good-work:evaluator` 디스패치(단계: browser). 지시:
   - `npx playwright test e2e/ > <RUN>/playwright.log 2>&1` (종료 코드는 도구 결과)
   - 각 `[browser]` AC: 스크린샷을 `<RUN>/AC-xxx.png`로 복사(테스트에서 `page.screenshot({path})` 또는 test-results에서 복사)
   - 콘솔 error·pageerror·4xx/5xx 응답이 있으면 그 AC는 NOT_VERIFIED
   - 브라우저 실행 실패·건너뜀(skipped) = NOT_VERIFIED (통과 아님)
   - 평가자가 BLOCKED이면 qa 7번과 같이 처리(직접 실행 + `murba decide taste "evaluator BLOCKED: 독립 평가 미실시"`, 보고서 ⚠️)
3. 네가 `<RUN>` 에 PNG가 실제로 있는지 `ls <RUN>` 로 확인. 스크린샷을 Read로 열어 화면이 AC와 맞는지 눈으로 확인(참고 의견)
4. 실패한 `[browser]` AC → `murba ac verdict <ID> NOT_VERIFIED --sha <HEAD> --final`, fix 루프로 돌아가지 않고 보고(최종 단계이므로) + decide
5. handoff → `murba phase report`

## 핑계와 실제
| 핑계 | 실제 |
|---|---|
| "AC별로 이미 통과했다" | 이후 커밋이 판정을 무효로 만든다. head에서 다시 |
| "브라우저가 안 떠서 건너뜀" | 건너뜀 = 실패 |
| "뮤턴트가 살아남았지만 괜찮다" | 테스트가 아무것도 검사 안 한다는 뜻. 기록한다 |
