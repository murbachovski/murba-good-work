# 0005 생략으로 끝나는 실행은 소스를 바꿀 수 없다, init 기준선, 대상 저장소 .gitignore 미변경 (v0.1.2)

- 날짜: 2026-11-24
- 상태: 확정(사용자 선택: "v0.1.2 결함 수정"). [ADR 0004](0004-no-pipeline-skip-for-implementation.md)의 남은 빈틈을 닫는다. 독립 리뷰 1차(PR #12) 지적 반영: 비 ASCII 이름, 승인된 생략, 하위 폴더 프로젝트, 이름 바꾸기, 의존성 폴더, 기준선 되돌림
- 맥락
  - ADR 0004 갱신: triage에서 run-plan에 스스로 조사·위험으로 적으면(고정 전) 생략이 열린다. init 전 작업 중 변경은 소스 변경 게이트 오탐이 될 수 있다
  - [확장 비교](../evaluation/261124-full.md): `murba init`이 대상 저장소 `.gitignore`에 `.murba/`를 써서 murba 25개 중 20개에서 사용자 커밋에 섞였고, "새 파일 금지" 조사 과제 n13이 실패했다

## 결정
| 항목 | v0.1.1 | v0.1.2 |
|---|---|---|
| 생략 실행의 소스 변경 | 검사 없음 | build를 건너뛰는 `--skip`과, build를 건너뛴 실행의 `report → done`에서 init 이후 구현 파일 변경이 있으면 거부(`SOURCE_CHANGED_IN_SKIPPED_RUN`). 승인 여부와 무관(headless 사전 승인은 모델 행동이라 면제 근거가 안 됨) |
| 구현 파일 판정(두 게이트 공통) | 루트 기준 경로, git 따옴표 이스케이프, 이름 바꾸기는 새 경로만 | 프로젝트 폴더 기준 경로(`--relative`, 모노레포 하위 폴더), 비 ASCII 이름 그대로(`-z`), 이름 바꾸기는 옛 경로 삭제로(`--no-renames`), 의존성 폴더(`node_modules`·`.venv` 등) 제외, 코드 확장자 추가(C·C++·C#·Swift·Dart 등) |
| init 전 작업 중 변경 | 게이트에 걸림 | init 때 바뀌어 있던 구현 파일(추적 파일 변경·삭제, 추적 안 된 파일)과 내용 해시를 원장에 기록(`base_dirty`). 내용이 그대로면 게이트에서 제외, 다시 바뀌거나 되돌려지거나 지워지면 포함 |
| 재초기화(`init --force`) | 기준선을 새로 잡음 | 처음 init의 `base_sha`·`base_dirty` 유지(재초기화로 실행 중 변경을 기준선에 넣지 못하게) |
| `.murba/` 제외 방법 | 대상 저장소 `.gitignore`에 `.murba/` 추가 | `.murba/.gitignore`(`*`). 대상 저장소 파일은 바꾸지 않는다. git·rg 모두 하위 폴더 `.gitignore`를 따른다(`git check-ignore`, `rg` 14.1.1에서 확인) |

## 효과
- 자기 신고로 생략을 열어도 결과는 "보고서만": build를 건너뛴 실행은 구현 파일을 바꾸면 done에 갈 수 없다(승인됐어도). 남는 것은 조사·위험 보고로 끝나는 실행뿐이다
- 사용자가 하던 작업이 있는 저장소에서도 approve·lock-tests가 오탐하지 않는다

## 남은 한계
- `report → done`이 거부돼도 headless Stop 게이트는 보고서가 있으면 실행을 끝낸다. 이때 단계는 report로 남고 `events.jsonl`에 `source_changed_in_skipped_run`이 남는다(done이 아님)
- git 저장소가 아니거나 init 때 커밋이 없으면 검사하지 않고 `source_gate_skipped`만 기록한다(사유 `not a git repo`·`no commit at init`). 재초기화로도 기준선을 새로 잡지 않는다(실행 중 커밋을 기준선으로 만들 수 있어서)
- 코드 확장자 목록 밖의 파일(확장자 없는 스크립트, YAML 등)은 impl_globs 안에 있을 때만 검사한다
- `.murba/.gitignore`는 git 저장소 안에서만 효과가 있다(이전 방식과 같음)

## 틀렸을 때 비용
- 조사 과제가 프로젝트 안에 재현 스크립트를 남기면 done이 거부된다. 오류 메시지가 되돌리거나 프로젝트 밖으로 옮기라고 안내한다
- init 전에 바뀐 파일을 에이전트가 같은 내용으로 다시 쓰면 변경으로 보지 않는다(내용이 같으므로 영향 없음)
