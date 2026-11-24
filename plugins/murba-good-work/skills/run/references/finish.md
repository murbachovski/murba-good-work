# report 단계 (마무리)

1. `murba report` → `.murba/report.md`, `.murba/report.html` 생성(결정적 스크립트)
2. `cat .murba/report.md` 로 내용 확인. 빠진 것(예: 보류 이유)이 있으면 `murba decide` 로 보충 후 다시 `murba report`
3. 결정 큐 질문
   - 대화형: `decisions.tsv` 중 class가 taste·user-direction·irreversible인 항목을 골라 **AskUserQuestion 한 번**(최대 4개, 추천안 먼저)
     - 사용자가 추천안과 다르게 답한 항목 → 영향 받는 AC를 다시 build: `murba phase build` (전이표상 report→build 허용)
     - 같으면 그대로
   - headless: 묻지 않는다. 보고서의 "결정 큐" 절에 남긴다
4. `murba phase done`
5. 최종 응답(짧게):
   - 보고서: `.murba/report.html` 절대경로
   - ❌ 실패·보류 AC, ⚠️ 미검증·flaky·약한 테스트
   - 브랜치 이름과 커밋 수. push·PR은 하지 않았다는 사실
