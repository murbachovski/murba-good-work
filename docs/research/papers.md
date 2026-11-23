# 논문 조사: 루프·검증·그래프·하네스

- 조사일: 2026-11-24
- 확인 수준
  - **초록**: arXiv 초록을 직접 읽음
  - **본문**: HTML 본문을 직접 읽음
  - **스니펫**: 검색 요약만 봄(미검증)
  - **‡**: 2026년 v1 프리프린트(동료 심사 전)
- 판정: 적용 / 조정 / 참고 / 무시
- 연관 문서: [plugin-survey.md](plugin-survey.md)

## 1. 루프·자기수정·검증·평가자

| 논문 | 연도·arXiv | 핵심 수치 | 플러그인 함의 | 판정 | 확인 |
|---|---|---|---|---|---|
| Reflexion (Shinn 외) | 2023·[2303.11366](https://arxiv.org/abs/2303.11366) | HumanEval pass@1 91% (GPT-4 80%) | 실행 피드백 기반 반복은 유효 | 적용 | 초록 |
| Self-Refine (Madaan 외) | 2023·[2303.17651](https://arxiv.org/abs/2303.17651) | 7개 과제 평균 약 +20%p | 외부 신호가 없는 코드 정확성에는 일반화하기 어려움 | 무시 | 초록 |
| LLMs Cannot Self-Correct Reasoning Yet (Huang 외) | 2023·[2310.01798](https://arxiv.org/abs/2310.01798) (ICLR'24) | 외부 피드백 없는 자기수정은 성능을 떨어뜨림: GPT-4 GSM8K 95.5→89.0 | builder 자기 검토 루프를 넣지 않음 | 적용 | 본문 |
| When Can LLMs Actually Correct… (Kamoi 외) | 2024·[2406.01297](https://arxiv.org/abs/2406.01297) (TACL) | LLM이 쓴 피드백만으로 자기수정에 성공한 사례가 없음 | 수정 루프 입력은 실행 결과로 한정 | 적용 | 초록 |
| Is Self-Repair a Silver Bullet? (Olausson 외) | 2023·[2306.09896](https://arxiv.org/abs/2306.09896) (ICLR'24) | 비용을 감안하면 이득이 작음. 피드백 품질이 병목 | 상위 모델로 일찍 교체 | 조정 | 초록 |
| Debugging Decay Index (Adnan, Kuhn) | 2025·[2506.18403](https://arxiv.org/abs/2506.18403) | 2~3회 시도 안에 효과가 60~80% 감소 | 라운드 상한을 줄이고 새 컨텍스트로 재시작 | 조정 | 스니펫 |
| Looping Is Not Reliability (Gao 외) | 2026·[2607.24604](https://arxiv.org/abs/2607.24604) | 강제로 다시 수정시키면 0.820→0.673. 오래된 트레이스가 정답을 망친 비율 34/135 | 통과한 결과는 다시 수정하지 않음. 통과 SHA로 복원 | 적용 | 초록 |
| Rethinking Verification in Agent Harnesses‡ | 2026·[2610.34577](https://arxiv.org/abs/2610.34577) | 독립 리뷰: SWE-V +3.9~6.6, 비용 1.0~1.25배. 4라운드까지 가도 +0.5. diff만 보는 리뷰가 트레이스까지 보는 리뷰 이상이고 토큰은 29~43% 적음 | 평가자 입력은 diff + AC로, 라운드 축소 | 적용 | 본문 |
| AgentCoder (Huang 외) | 2023·[2312.13010](https://arxiv.org/abs/2312.13010) | 테스트 설계 에이전트를 분리하면 96.3%(기존 90.2%), 토큰 56.9K vs 138.2K | test-writer 분리 | 적용 | 초록 |
| CodeT (Chen 외) | 2022·[2207.10397](https://arxiv.org/abs/2207.10397) | 생성한 테스트로 후보를 고르면 pass@1 +18.8%p | 기초 근거 | 참고 | 초록 |
| AlphaCodium (Ridnik 외) | 2024·[2401.08500](https://arxiv.org/abs/2401.08500) | 흐름 설계로 GPT-4 pass@5 19%→44% | 단계별 게이트 흐름 | 적용 | 초록 |
| EvalPlus (Liu 외) | 2023·[2305.01210](https://arxiv.org/abs/2305.01210) | 테스트를 80배로 늘리면 pass@k 19.3~28.9% 하락 | 약한 테스트로는 통과가 정답을 뜻하지 않음 | 적용 | 초록 |
| Are "Solved Issues" Really Solved? | 2025·[2503.15223](https://arxiv.org/abs/2503.15223) | 그럴듯한 패치의 29.6%가 다르게 동작. 해결률 +6.2%p 부풀려짐 | 회귀 테스트 전체 실행 | 적용 | 초록 |
| TestSuiteBench‡ | 2026·[2610.13065](https://arxiv.org/abs/2610.13065) | 에이전트 테스트의 뮤테이션 점수 60% 미만 | 뮤테이션 검사 | 적용 | 초록 |
| BOBA‡ | 2026·[2611.02207](https://arxiv.org/abs/2611.02207) | 단건 95%가 20건 연쇄하면 51%. 자기 정확성 판단 53% | 자기 테스트 통과를 완료로 보지 않음 | 적용 | 초록 |
| Rethinking Agent-Generated Tests | 2026·[2602.07900](https://arxiv.org/abs/2602.07900) | 에이전트가 쓴 테스트 유무에 따른 해결 수 차이 0~13/500 | builder가 즉석에서 쓴 테스트는 증거가 아님 | 적용 | 초록 |
| Test Overfitting on SWE-bench | 2025·[2511.16858](https://arxiv.org/abs/2511.16858) | 생성 테스트 과적합에 대한 실증 연구 | 분리 원칙의 보조 근거 | 참고 | 초록 |
| ImpossibleBench (Zhong 외) | 2025·[2510.20270](https://arxiv.org/abs/2510.20270) | Claude는 테스트 수정 79% 이상. 읽기 전용으로 막아도 하드코딩은 남음. LLM 감시 적발률 42~65% | 숨긴 검사, 결정적 diff 규칙 | 조정 | 본문 |
| METR reward hacking (블로그) | 2025-06 | o3 보상 해킹 30.4%. "하지 마라" 프롬프트는 효과가 약함 | 쓰기 금지 범위 확대 | 적용 | 원문 |
| Monitoring Reasoning Models (Baker 외) | 2025·[2503.11926](https://arxiv.org/abs/2503.11926) | 감시 신호에 맞춰 강하게 최적화하면 모델이 의도를 숨김 | 감시 결과를 builder에게 되먹이지 않음 | 참고 | 초록 |
| MAST (Cemri 외) | 2025·[2503.13657](https://arxiv.org/abs/2503.13657) | 실패 모드 14개, κ=0.88. 종료 조건 인지 실패 12.4%. 상위 목표 검증을 넣으면 +15.6% | 상위 목표 검사 1개. 실패 분류를 기록 태그로 | 적용 | 본문 |
| LLM-as-judge (Zheng [2306.05685](https://arxiv.org/abs/2306.05685), Wang [2305.17926](https://arxiv.org/abs/2305.17926)) | 2023 | 위치·장황함·자기강화 편향. 순서를 바꾸면 66/80에서 결과가 뒤집힘 | 이진 판정, 근거 먼저, 순서 교차 | 적용 | 초록 |
| 자기선호 편향 (Panickssery [2404.13076](https://arxiv.org/abs/2404.13076), Wataoka [2410.21819](https://arxiv.org/abs/2410.21819)) | 2024 | 자기 출력을 알아보는 능력과 자기선호가 비례 | 같은 모델 계열로 평가할 때의 한계를 문서화 | 조정 | 초록 |
| CodeJudgeBench | 2025·[2507.10535](https://arxiv.org/abs/2507.10535) | 쌍대 비교가 점수형보다 나음. 판정 일관성에 우려 | LLM 판정은 참고용 | 참고 | 스니펫 |
| Flakiness of LLM-Generated Tests | 2026·[2601.08998](https://arxiv.org/abs/2601.08998) | flaky의 63%가 순서 보장 없는 컬렉션에 의존 | 순서 의존 lint, flaky 테스트를 예시로 주지 않음 | 적용 | 초록 |

## 2. 그래프·하네스·멀티에이전트 구조

| 논문 | 연도·arXiv | 핵심 수치 | 플러그인 함의 | 판정 | 확인 |
|---|---|---|---|---|---|
| SWE-agent | 2024·[2405.15793](https://arxiv.org/abs/2405.15793) | 에이전트-컴퓨터 인터페이스 설계가 성능을 좌우 | hook 메시지는 짧게. 출력은 파일로 내보내고 요약만 | 적용 | 초록 |
| Agentless | 2024·[2407.01489](https://arxiv.org/abs/2407.01489) | 고정 파이프라인으로 Lite 32.00%, $0.70 | 고정 순서 파이프라인. 필요 없는 단계는 생략 | 적용 | 초록 |
| AutoCodeRover | 2024·[2404.05427](https://arxiv.org/abs/2404.05427) | Lite 19%, $0.43. 구조 기반 검색 | 구조 검색이 싸고 효과적 | 참고 | 초록 |
| OpenHands SDK | 2025·[2511.03690](https://arxiv.org/abs/2511.03690) | 이벤트 소싱으로 시스템 실패 감소 | 추가 전용 원장 | 적용 | 초록 |
| RepoGraph | 2024·[2410.14684](https://arxiv.org/abs/2410.14684) | 그래프를 요약해 넣으면 28.67%. **k=2 전체를 넣으면 26.00%로 기준선 27.33%보다 낮음** | 그래프는 필요할 때 1-hop만 조회. 전체 주입 금지 | 조정 | 본문 |
| LocAgent | 2025·[2503.09089](https://arxiv.org/abs/2503.09089) | 파일 위치 찾기 최대 92.7%, 비용 86% 절감 | 큰 저장소에서만 그래프 사용 | 조정 | 초록 |
| StateFlow | 2024·[2403.11322](https://arxiv.org/abs/2403.11322) | ReAct 대비 정확도 +13~28%, 비용 1/3~1/5 | 상태 전이표를 데이터로 두고 hook이 강제 | 적용 | 초록 |
| MetaGPT | 2023·[2308.00352](https://arxiv.org/abs/2308.00352) | 단계별 표준 절차(SOP)와 구조화된 산출물 | 이미 반영 | 적용 | 초록 |
| Towards a Science of Scaling Agent Systems (Kim 외) | 2025·[2512.08296](https://arxiv.org/abs/2512.08296) | 단일 에이전트 대비 +80.8%(분해 가능 과제) ~ −70.0%(순차 계획 과제) | builder는 순차, 병렬은 기본 꺼짐 | 적용 | 초록 |
| Lost in the Middle | 2023·[2307.03172](https://arxiv.org/abs/2307.03172) | 정보가 중간에 있으면 성능이 가장 낮음 | 재주입 포인터의 핵심은 앞과 끝에 배치 | 적용 | 초록 |
| Context Length Alone Hurts | 2025·[2510.05381](https://arxiv.org/abs/2510.05381) | 입력 길이만으로 −13.9~85% | kickoff를 짧게, 근거를 먼저 다시 쓰게 함 | 적용 | 초록 |
| Context Rot (Chroma, 기술 보고서) | 2025 | 집중된 약 300토큰이 약 113k토큰보다 나음 | 새 컨텍스트 서브에이전트, 응답 15줄 이하 | 적용 | 원문 |
| Empirical Study of Harness Design‡ | 2026·[2609.20804](https://arxiv.org/abs/2609.20804) | 계획 단계는 강한 모델에서 주로 비용을 개선. bash만으로 충분 | 전용 그래프 도구보다 grep 가능한 JSON | 적용 | 초록 |
| Agentic Harness Engineering | 2026·[2604.25850](https://arxiv.org/abs/2604.25850) | Terminal-Bench 2에서 69.7→77.0 | evolve 입력은 관측 기록 중심 | 적용 | 초록 |
| ACE | 2025·[2510.04618](https://arxiv.org/abs/2510.04618) (ICLR'26) | +10.6%. 통째로 다시 쓰면 context collapse | 기록은 조금씩 고치고 전체 재작성 금지 | 적용 | 초록 |
| Live-SWE-agent | 2025·[2511.13646](https://arxiv.org/abs/2511.13646) | Verified 77.4%. 최소 골격에서 도구를 스스로 생성 | 최소 골격의 근거. 실행 중 도구 생성은 게이트 우회 위험 | 조정 | 초록 |
| Darwin Gödel Machine | 2025·[2505.22954](https://arxiv.org/abs/2505.22954) | SWE-bench 20→50% | evolve를 eval로 게이트 | 참고 | 초록 |
| The SWE-Bench Illusion | 2025·[2506.12286](https://arxiv.org/abs/2506.12286) | 이슈 문장만으로 경로를 76% 맞힘 | 벤치마크 수치는 부풀려질 수 있음. 자체 eval만 신뢰 | 적용 | 초록 |
| Harness or Model?‡ | 2026·[2609.11987](https://arxiv.org/abs/2609.11987) | 하네스 차이 ±1.25pt, 신뢰구간이 0을 포함. 시간 초과로 취소된 81건 중 22건은 이미 통과한 상태 | 시간 초과 시에도 통과 증거부터 저장 | 조정 | 초록 |
| Harness Engineering: Eleven Systems‡ | 2026·[2609.00006](https://arxiv.org/abs/2609.00006) | 운영 중인 하네스 11개 모두 직접 만든 루프와 결정적 검색 사용 | 프레임워크 없이 직접 구현. 메타데이터 재확인 필요 | 적용 | 초록 |
| ChatDev, MapCoder, AFlow, ReWOO, CodeAct, More Agents | 2023~2024 | 역할 대화, 계획 후 실행 등 | 대부분 이미 반영되었거나 비용 대비 효과 낮음 | 참고·무시 | 초록 |

**미검증으로 표에서 뺀 항목**: [2610.04433](https://arxiv.org/abs/2610.04433), [2603.25723](https://arxiv.org/abs/2603.25723), [2606.20683](https://arxiv.org/abs/2606.20683), [2608.08950](https://arxiv.org/abs/2608.08950), [2605.12925](https://arxiv.org/abs/2605.12925), [2606.28436](https://arxiv.org/abs/2606.28436), [2602.04254](https://arxiv.org/abs/2602.04254), [2605.20456](https://arxiv.org/abs/2605.20456). 그리고 Stack Overflow 블로그의 "버그 3~5배 발견" 수치.

## 3. 근거 기반 설계 변경 (plan v3에 반영)

1. **자기 검토 루프 금지**: 수정 루프 입력은 테스트와 브라우저 실행 결과만 씁니다(Huang, Kamoi).
2. **수정 루프는 최대 3라운드**
   - 1~2라운드는 같은 builder, 3라운드는 상위 모델로 새 builder를 띄웁니다.
   - 2회 연속 개선이 없으면 중단합니다.
   - 근거: DDI, [2610.34577](https://arxiv.org/abs/2610.34577), Olausson
3. **통과한 결과는 다시 고치지 않음**: 마지막 통과 SHA를 보관하고, 회귀하면 복원합니다([2607.24604](https://arxiv.org/abs/2607.24604)).
4. **test-writer 분리와 뮤테이션 검사**: AC만 보고 테스트를 먼저 씁니다(AgentCoder, TestSuiteBench, EvalPlus, BOBA).
5. **테스트 조작 방지**
   - evaluator만 아는 숨긴 검사를 둡니다.
   - builder에게는 실패한 AC ID만 전달합니다.
   - 러너 설정 파일은 쓰기 금지입니다.
   - 조작 감지는 결정적 diff 규칙을 먼저 쓰고, LLM 감시는 보조로만 씁니다.
   - 근거: ImpossibleBench, METR
6. **평가자 입력 제한**: diff + AC + 실행 증거만 줍니다. 판정은 이진이고, 근거를 먼저 쓰게 합니다([2610.34577](https://arxiv.org/abs/2610.34577), LLM-as-judge 편향).
7. **상위 목표 검사 1개 추가**(MAST).
8. **flaky 대응**: 재시도로 통과하면 ⚠️로 표시하고, 순서 의존 lint를 둡니다([2601.08998](https://arxiv.org/abs/2601.08998)).
9. **상태 전이표**: 프레임워크 없이 데이터 파일로 두고 hook이 강제합니다(StateFlow, Eleven Systems).
10. **병렬 builder 기본 꺼짐**(Kim 외 [2512.08296](https://arxiv.org/abs/2512.08296)).
11. **조건부 코드 그래프**: 결정적 import 그래프를 만들고 1-hop만 조회합니다. 전체 주입은 금지합니다(RepoGraph, LocAgent).
12. **컨텍스트**
    - kickoff를 짧게 쓰고 핵심은 앞과 끝에 둡니다.
    - 단계마다 handoff 파일을 남기고, 사용률은 40~60%를 유지합니다.
    - 근거: Lost in the Middle, [2510.05381](https://arxiv.org/abs/2510.05381), Context Rot
13. **시간 초과 시 통과 증거 먼저 저장**([2609.11987](https://arxiv.org/abs/2609.11987)).
14. **evolve**: 관측 기록 중심으로 조금씩 고칩니다. 벤치마크 수치를 믿지 않고 자체 eval로 게이트합니다(AHE, ACE, SWE-Bench Illusion).
15. **같은 모델 계열 평가의 한계를 문서화**(자기선호 편향). 다른 모델을 쓰는 것은 완화책으로 추정할 뿐 실증되지 않았습니다.
