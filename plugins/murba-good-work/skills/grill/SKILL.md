---
name: grill
description: "Use when a plan, feature request or spec must be clarified before building, or during the murba grill phase. 기획을 확정하기 전에 핵심 질문을 몰아서 묻고 기획서·수용 기준(AC)을 쓸 때. Triggers: 'grill', 'grill me', '기획 질문', '기획서 써줘', '요구사항 정리', 'stress-test this plan'."
---

<!-- mattpocock/skills 의 grill-me, batch-grill-me(MIT)를 개작함 -->

# grill — 기획 질문 일괄 → 기획서 → 1회 승인

## 규칙 (먼저 읽기)
1. 질문은 **AskUserQuestion으로만**. 한 라운드 최대 4개, 추천안을 첫 번째에 `(Recommended)`. 텍스트 질문 금지.
2. **사실은 묻지 않는다.** 파일·문서·명령으로 확인 가능한 것은 직접 확인.
3. **실험으로 답이 나오는 갈림길은 묻지 않고 시험한다**(작은 프로토타입·명령 실행).
4. 다른 질문의 답에 달린 질문은 다음 라운드로. 라운드마다 "지금 물을 수 있는 것 전부"를 묻는다.
5. grill의 답변은 **승인이 아니다.** 마지막에 작성된 기획서로 1회 승인을 받는다.
6. headless(`murba status`의 mode=headless): **묻지 않는다. 질문으로 턴을 끝내지도 않는다.** 각 질문의 추천안을 채택하고 `murba decide taste "<가정>" --why "<근거>" --cost "<틀렸을 때>"` 로 기록. 사용자 방향 자체를 정할 수 없으면 `murba decide user-direction` 후 안전한 범위로 기획을 마무리한다.

## 순서
1. **전제 검증** — 누가 왜 필요한가, 지금은 어떻게 하고 있나, 가장 작은 버전은, 안 하면 무슨 손해
2. **대안 2~3개 + 추천** — 각 대안의 장단점 한 줄
3. **실패 지도** — 빈 입력, 잘못된 입력, 의존성 실패, 조용히 실패하는 곳
4. **핵심 5줄**
   - 왜: / 누가: / 위험: / 성공: (측정 가능한 한 줄) / 범위: (안 하는 것 포함)
5. **수용 기준(AC)** — EARS 형식 + ID + 필요 시 `[browser]`, `[after:AC-xxx]`
   - `- AC-001 [browser] WHEN 사용자가 빈 제목으로 추가를 누르면 THE SYSTEM SHALL 오류 문구를 보여주고 항목을 추가하지 않는다`
   - 명세가 암시하지만 아무 AC도 건드리지 않는 입력(빈 값·경계값·중복)도 AC로 만든다
   - AC는 하나에 하나의 동작. 측정 가능해야 한다
   - **AC는 서로 독립**: 각 AC의 테스트는 그 AC(와 선언된 선행 AC)만 구현돼도 통과해야 한다. 정말 다른 AC가 먼저 필요하면 그 줄에 `[after:AC-xxx]`를 **승인 전에** 붙인다(예: `- AC-003 [after:AC-001] WHEN …`)
6. **기획서 작성** → `.murba/spec.md` (틀 아래) → `murba ac sync`
7. (run 파이프라인에서) spec-review → revise(선후관계 `[after:]` 점검 포함) 후 **`.murba/ac-test-map.md`** 작성:
   `| AC | 테스트 파일 | 종류(unit/e2e/hidden) | 검증 방법 |`
8. **승인 질문 1회**(대화형): 기획서 요약 + AC 수 + 대응표 요약을 보여주고
   - "이 기획서로 진행할까요?" — 승인 (Recommended) / 수정 필요(어느 절)
   - 같은 호출에 쌓인 결정 큐 질문을 함께(최대 4개 합계)

## spec.md 틀
```markdown
# <제목> 기획서
## 핵심 5줄
- 왜: …
- 누가: …
- 위험: …
- 성공: …
- 범위: … / 안 함: …
## 대안과 선택
| 대안 | 장점 | 단점 | 선택 |
## 실패 지도
| 상황 | 기대 동작 |
## 수용 기준
- AC-001 [browser] WHEN … THE SYSTEM SHALL …
- AC-002 [after:AC-001] WHEN … THE SYSTEM SHALL …
## 기술 선택
(스택, 저장 방식 — 결정 이유 한 줄)
## 가정
(사용자 확인 없이 정한 것 — decisions.tsv와 일치)
```

## 핑계와 실제
| 핑계 | 실제 |
|---|---|
| "답이 뻔하니 묻지 않고 정한다" | 되돌릴 수 있는 것만. 방향 결정은 묻는다(대화형) |
| "질문 하나씩 묻는 게 친절" | 모아서 한 번. 막힘을 줄인다 |
| "사용자가 답했으니 승인된 것" | 작성된 기획서로 다시 승인받는다 |
| "AC는 대충 써도 테스트에서 구체화" | 측정 불가능한 AC는 검증 불가. 여기서 구체화 |
