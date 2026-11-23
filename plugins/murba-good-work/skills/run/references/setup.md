# setup 단계 (5 개발 셋팅) — 오케스트레이터가 직접

보호 파일(러너 설정, Playwright 설정, 허용목록)은 builder가 쓸 수 없으므로 **네가** 만든다.

## 순서
1. `murba budget`
2. 스택 확인: `run-plan.json`, `spec.md`, 기존 `package.json`/`pyproject.toml`/`requirements.txt`. 없으면 기획서에 맞는 가장 단순한 스택을 정하고 `murba decide taste`.
3. 테스트 러너 설정
   - Node: `node:test`(의존성 없음) 우선. 프레임워크가 이미 있으면 그대로(vitest/jest)
   - Python: `pytest`
   - `package.json` 의 `"test"` 스크립트를 여기서 확정한다(이후 builder 수정 금지)
4. `[browser]` AC가 있으면 Playwright
   - `npm i -D @playwright/test` (설치는 되돌릴 수 있는 작업)
   - 브라우저: `npx playwright install chromium` — 이미 캐시가 있으면 생략
   - `playwright.config.(js|ts)`: `testDir: 'e2e'`, `retries: 1`, `reporter: [['list'],['json',{outputFile:'.murba/evidence/playwright.json'}]]`, `use: { screenshot: 'on', trace: 'retain-on-failure' }`, `webServer`(dev 서버 명령·포트·`reuseExistingServer:false`)
5. **대화형만**: `.claude/settings.local.json` 허용목록(git 미추적. trust 없이 적용됨). headless에서는 Claude Code가 이 쓰기를 거부하므로 시도하지 않고 `murba decide mechanical "허용목록 생략(headless)" --why "settings 쓰기는 무인 실행에서 거부됨"`만 남긴다. 기존 내용과 병합:
   ```json
   {"permissions":{"allow":["Bash(npm test*)","Bash(npm run *)","Bash(npx playwright *)","Bash(node *)","Bash(python3 *)","Bash(pytest*)","Bash(git status*)","Bash(git diff*)","Bash(git log*)","Bash(git add *)","Bash(git commit *)","Bash(git checkout *)","Bash(git rev-parse *)","Bash(murba *)","Bash(ls *)","Bash(cat *)"]}}
   ```
   `.gitignore`에 `.claude/settings.local.json` 있는지 확인.
6. `.murba/init.sh` — 앱을 기동하고 스모크 1개 실행하는 스크립트(dev 서버 없으면 `npm test -- --help` 수준의 러너 동작 확인). `chmod +x`.
7. **권한 점검**: `sh .murba/init.sh` 를 직접 실행(종료 코드는 도구 결과). 권한 프롬프트·실패가 나면 원인을 고치고, 못 고치면 `murba decide irreversible "권한 부족: …"` 후 report로.
8. 커밋: `git add -A` → `git commit -m "chore: setup test runner and verification"` (명령 2번. `.murba/`는 gitignore)
9. handoff → `murba phase test-write`

## handoff/setup.md 틀
```
목표: 테스트·검증 환경
완료: 러너(<명령>), Playwright(<예/아니오>), 허용목록, init.sh(exit 0)
현재 실패: 없음 | <내용>
다음 1개: test-writer에 AC 목록 전달
근거: package.json, playwright.config.js, .murba/init.sh
```
