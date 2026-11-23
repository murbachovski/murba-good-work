# 플러그인 작성 규칙

근거: [기획서](../spec/spec-v0.1.md), [조사](../research/plugin-survey.md), [논문](../research/papers.md).

## 구조
- 본체는 `plugins/murba-good-work/`. 저장소 루트는 marketplace
- 실행 상태는 **대상 프로젝트의 `.murba/`**(gitignore). 경로는 항상 프로젝트 루트(`CLAUDE_PROJECT_DIR`) 기준
- `${CLAUDE_PLUGIN_DATA}`는 캐시·의존성 전용(플러그인 제거 시 삭제됨). `${CLAUDE_PLUGIN_ROOT}`에 상태 쓰기 금지(업데이트 시 바뀜)
- plugin.json에 커스텀 키를 넣지 않는다

## 스킬
- SKILL.md 500줄 이하, 20KB 이하(자체 규칙. 한국어는 글자당 3바이트)
- **핵심 규칙은 앞 4k 토큰 안에**. 압축 후 스킬은 앞 5k 토큰만 다시 붙는다
- 큰 절은 `references/`로 빼고 필요한 시점에 읽게 한다
- description은 "언제 쓰나"(트리거)만. 한국어·영어 병기. 워크플로 요약 금지(모델이 본문 대신 요약을 따름)
- 규율 스킬에는 `| 핑계 | 실제 |` 표를 넣는다
- 새 스킬은 압력 테스트: 스킬 없이 실패 확인(RED) → 최소 스킬(GREEN) → 새 핑계 막기(REFACTOR)
- 외부 스킬을 개작하면 파일 상단에 출처·라이선스를 적는다

## 에이전트
- 모델은 항상 명시한다(`inherit` 금지). 생략하면 가장 비싼 세션 모델을 물려받는다
- 하위 에이전트 생성 금지는 문장이 아니라 `tools`에서 Agent를 빼서 강제한다
- 읽기 전용 에이전트는 `tools`를 Read/Grep/Glob(+필요한 Bash)로 제한한다
- 플러그인 에이전트는 `hooks`, `mcpServers`, `permissionMode`를 무시한다. hook은 `hooks/hooks.json`, MCP는 `.mcp.json`에
- 응답은 15줄 이하 + 상태 코드(`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`). 상세는 파일로

## hook
- **command 타입만** 쓴다(prompt·agent 타입은 결정적이지 않음)
- sh 래퍼가 먼저 `.murba/` 존재를 확인하고, 없으면 즉시 종료(다른 프로젝트에 영향 없음)
- 가드 hook(비가역 차단)만 실패 시 차단. 나머지는 실패 시 통과 + 기록
- 이벤트별 출력 형식을 지킨다
  - PreToolUse: `hookSpecificOutput.permissionDecision`
  - Stop: 최상위 `{"decision":"block","reason":"..."}`
  - SessionStart: `hookSpecificOutput.additionalContext`(10,000자 이하)
- hook 입력의 `agent_type`은 `murba-good-work:<이름>` 형식이다(접두 없이 비교하면 아무것도 못 막는다)
- Stop 차단은 exit 2가 아니라 JSON `decision` 출력으로 한다(파일 없음 stderr는 비차단 처리됨)
- 비가역 작업은 `deny` + 사유 + 결정 큐 기록. `ask`·`defer`는 무인 실행에서 쓰지 않는다
- Bash 명령은 `; && |` 단위로 나눠 검사하고 실제 JSON 파서를 쓴다
- 상태 파일 쓰기는 lock 또는 추가 전용 로그(hook은 병렬로 실행됨)
- 차단 메시지에 비상 해제 방법을 적지 않는다(모델이 우회함)
- 테스트: 실제 Claude Code에서 캡처한 입력으로, 실제 프로세스를 실행해서, 음성 대조군(막지 말아야 할 명령)과 함께
- 모든 hook은 실행 기록을 남기고, 오래 실행되지 않은 hook은 경고한다

## 테스트·검증
- 테스트는 builder가 아니라 test-writer가 AC만 보고 먼저 쓴다
- 테스트가 실제로 잡아내는지 뮤테이션 검사로 증명한다
- 건너뛴 검사, 브라우저를 못 띄운 검사는 **실패**로 본다
- 재시도로 통과한 테스트는 ⚠️ flaky로 표시한다

## eval
- `claude plugin eval`. 프롬프트는 자연스러운 한국어
- 케이스마다 결과 확인 1개 + 과정 확인 1개
- 후보가 보는 경로·프롬프트에 eval, test, judge 같은 단어를 쓰지 않는다
- 구성요소마다 "담고 있는 가정"을 적고, 빼도 되는지 제거 실험을 한다
