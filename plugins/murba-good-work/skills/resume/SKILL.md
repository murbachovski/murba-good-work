---
name: resume
description: "Use when a murba run was interrupted (session ended, context compacted, crash) and must continue from where it stopped. 중단된 murba 작업을 이어서 할 때. Triggers: 'resume', '이어서 해줘', '계속 진행', '중단된 작업', 'continue the murba run'."
---

# resume — 중단된 실행 이어가기

## 규칙
1. **기억보다 원장.** `.murba/state.json`, `events.jsonl`, `handoff/`, `git log`가 진실이다.
2. 이전 기록이 끝냈다고 한 일은 **다시 하지 않는다.** 다만 "통과" 주장은 다시 실행해 확인한다.
3. 상태 변경은 `murba` CLI로만.

## 순서
1. `murba status` — 현재 phase, 남은 조건, AC 요약
2. `git status --short && git log --oneline -15 && git branch --show-current`
   - 작업 브랜치(`feat/*`)가 아니면 해당 브랜치로 이동
   - 커밋 안 된 변경이 있으면: 현재 phase가 build/fix면 builder 작업 중이었던 것 → `git diff`를 보고 계속할지 `git stash`할지 판단(stash는 되돌릴 수 있음)
3. `tail -20 .murba/events.jsonl`, 현재 phase의 `handoff/<phase>.md`(있으면), `decisions.tsv` 마지막 줄들
4. **남은 일 목록**을 만들고 항목마다 출처 태그:
   - `(run)` 이번에 명령을 실행해 확인함 — 예: `(run) npm test → exit 0`
   - `(read)` 파일·로그를 읽어 확인함
   - `(assumed)` 확인 못 함 → 바로 실행해 `(run)`으로 바꾼다
5. 마지막 VERIFIED AC는 `murba status`의 SHA와 `git rev-parse HEAD` 비교. 다르면 그 AC 테스트를 다시 실행
6. `murba check-tests` — 테스트 변조 여부
7. **run 스킬**의 해당 phase 절차로 이어서 진행

## 출력(사용자에게 한 번)
```
재개: phase=<phase>, AC <완료>/<전체>, 브랜치 <이름>
확인: (run) …, (read) …
다음: <첫 행동>
```
