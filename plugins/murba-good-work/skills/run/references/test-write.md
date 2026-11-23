# test-write 단계 (4 기획 기반 진행)

테스트는 **구현보다 먼저**, **AC만 보고** test-writer가 쓴다.

## 순서
1. `murba budget`
2. `murba-good-work:test-writer` 디스패치. kickoff 입력:
   - `.murba/spec.md`, `.murba/ac-test-map.md`, 러너 명령, Playwright 여부
   - 출력 위치: 단위·통합 테스트는 `tests/`(또는 기존 관례), 브라우저 테스트는 `e2e/AC-xxx.spec.*`, 숨긴 검사는 `.murba/hidden/`
   - 규칙: 테스트 이름에 AC ID 포함(`AC-001: …`). 숨긴 검사 = AC의 변형 입력(경계값·빈 입력·다른 예시). 구현 파일을 읽지 않는다
   - **AC 독립**: 각 AC 테스트는 그 AC(와 spec의 `[after:]` 선행 AC)만 구현돼도 통과해야 한다. 다른 AC의 동작을 전제하지 말고 테스트 안에서 직접 준비한다
   - test-writer가 "AC-xxx는 AC-yyy 필요"를 보고하면: 이미 승인 후이므로 spec을 고치지 않는다 → 테스트를 독립적으로 다시 쓰게 재지시. 불가능하면 `murba decide taste "AC 순서: AC-xxx after AC-yyy"`로 기록하고 build 순서를 그에 맞춘다
3. **실패 확인(RED)**: 구현 전이므로 AC 테스트는 실패해야 한다. 직접 실행(종료 코드는 도구 결과에 나온다):
   ```bash
   npm test > .murba/reports/test-write/red.log 2>&1
   ```
   - 통과해 버리는 AC 테스트 = 아무것도 검사하지 않는 테스트 → test-writer 재실행(그 AC ID와 이유 전달)
   - 문법 오류로 실패 = RED 아님 → 재실행
   - RED 결과는 위 명령으로 `.murba/reports/test-write/red.log`에 저장됨(`tail -40 .murba/reports/test-write/red.log`로 확인)
4. 잠금: `murba lock-tests 'tests/**' 'e2e/**' '.murba/hidden/**'` (실제 쓴 경로에 맞게)
5. 커밋: `git add -A` → `git commit -m "test: add failing acceptance tests"` (명령 2번. hidden은 .murba라 커밋 안 됨)
6. base SHA 기록: `git rev-parse HEAD` → handoff에 적는다(이후 evaluator diff 기준)
7. handoff → `murba phase build`
