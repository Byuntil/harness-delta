# 첫 A/B 워크플로 실행

[English](workflow-quickstart.md)

이 문서는 승인된 Codex 0.160.0 루트 프로필(`codex-workflow-own-response-v1`)로
배정된 작업 하나를 준비부터 보고서까지 진행하는 순서와 각 출력의 의미를 설명합니다.
세부 계약과 한계는 [네이티브 워크플로 런북](task-native-workflow.md),
[유연 비교 런북](flexible-comparison.md), [기능 파일럿 안내](functional-task-pilot.md)를
따릅니다. 사용량은 항상 부분 관찰이며, 여기의 어떤 명령도 전체 작업 비용, 절감 주장,
도입 결정을 만들지 않습니다.

실제 제품 실행은 매번 해당 실행에 대한 명시적 승인이 필요합니다. 파일 준비,
`workflow status`, `workflow task`는 제품을 실행하지 않습니다.

## 판정이 집계되는지를 정하는 타임라인

```text
배정/launch ──► 작업 (launch, resume, collect) ──► finish ──► followup_ends_at ──► report
                                                   │                                │
                                    반드시 기한 "전"에 실행            cutoff는 기한 "이후"로
```

- 배정 시점에 고정된 `followup_ends_at` = 배정 시각 + 프로토콜의 `followup_seconds`가
  정해집니다. 일시정지, 재개, 재작업은 이 기한을 바꾸지 않습니다.
- `workflow finish`는 `followup_ends_at` **이전**에 실행해야 합니다. 이후의 판정도 저장되지만
  보고서에서는 해당 작업이 `outcome_missing`(기한 전에 시작하지 않았다면 `not_started`)으로 표시되고, 판정은 `late_outcome`에 따로
  표시됩니다. 이 경우 `finish`가 `assessment_after_followup_deadline` 경고를 출력합니다.
- cutoff가 기한 **이전**인 보고서는 완료된 작업도 `followup_pending`으로 표시합니다.
  최종 판정을 보려면 기한이 지난 뒤, 기한 이후의 cutoff로 보고서를 만드세요.
  cutoff는 미래 시각일 수 없습니다.

작업과 사람의 검토가 모두 들어갈 만큼 `followup_seconds`를 넉넉히 정하세요.

## 0. 준비

- Node.js 24 선택 후 이 체크아웃에서 `npm ci`, `npm run build`.
- 바이너리 SHA-256이 [`examples/workflow/launch.json`](../../examples/workflow/launch.json)의
  고정 값과 같은 Codex 0.160.0.
- 전용 실제 데이터베이스(예: `.harness-delta/pilot/local.sqlite`). 데이터베이스, 프롬프트,
  지시 파일은 Git에서 제외되는 `.harness-delta/` 아래에 두세요.

아래에서 `hm`은 `node dist/cli.js --db .harness-delta/pilot/local.sqlite`를 뜻합니다.

## 1. 프로토콜 1회 설정

가격표, 두 변형, v2 프로토콜을 [유연 비교](flexible-comparison.md)에 따라 작성하고,
소스 프로필은
`{"product":"codex","product_version":"0.160.0","profile_id":"codex-workflow-own-response-v1"}`로 둡니다.

```sh
hm project add project-1 --root /absolute/path/to/project
hm price-table register --config prices.json
hm variant register --config variant-a.json
hm variant register --config variant-b.json
hm comparison register --config protocol.json
hm comparison freeze pilot-1
hm workflow status pilot-1
```

`workflow status`의 `native_source_unqualified` 또는 `native_adapter_not_wired`는 아직
네이티브 실행을 시작할 수 없다는 뜻입니다. `whole_task_cost_unconfirmed`,
`analysis_unverified`는 예상된 항목이며 실행을 막지 않습니다.

## 2. 작업별 파일

[예시 파일](../../examples/workflow/)을 복사해 수정합니다.

| 파일 | 용도 | 작업마다 바꾸나요? |
| --- | --- | --- |
| `workflow.json` | 배정(작업, 프로토콜, 기준)과 A/B 지시 파일 | 아니요, 재사용 |
| `runtime.json` | 이번 실행의 모델과 effort, `null`은 미지정 | 바꿀 때만 |
| `launch.json`, `resume.json`, `collect.json` | 바이너리, Codex home, recorder, 프롬프트, sandbox, 시간 제한 | 매번 새 `run_id` |

`workflow.json`의 artifact 경로는 파일 위치가 아니라 명령을 실행하는 디렉터리 기준입니다.
`confirmation_id`는 작업마다 새 값이어야 합니다. `workflow.json`을 고치는 대신
명령마다 `--confirmation <새-id>`를 붙이세요.

## 3. 실행(launch)

```sh
hm workflow codex launch --config workflow.json --runtime runtime.json \
  --execution launch.json --confirmation confirmation-1
```

배정 전에 CLI가 바이너리 해시, hook recorder, 프롬프트 파일, Codex home을 먼저 검사합니다.
하나라도 실패하면 `binary_mismatch` 같은 코드와 힌트를 출력하고, 작업은 배정되지도 시작되지도
않으며 시간도 측정되지 않습니다. 파일을 고친 뒤 같은 명령을 다시 실행하세요.

이 검사 이후에 발견된 이유로 제품을 실행하지 못했고 이 명령이 작업을 시작한 경우,
활성 시간이 쌓이지 않도록 작업이 다시 일시정지되고 영수증에 `activation_reverted: true`가 표시됩니다.

영수증에는 ID와 해시, 그리고 `adapter_result`만 출력됩니다.

- `state: completed`: 실행이 끝났고 자체 사용량을 수집했습니다.
- `state: failed`: `reason`과 `diagnostic`을 확인하세요. 명령은 `codex_workflow_failed`로 끝납니다.
- `state: stopped`: 요청에 따라 중지되었습니다.

## 4. 언제든 작업 상태 확인

```sh
hm workflow task task-1
```

상태, `followup_ends_at`, 기한이 아직 `open`인지, 판정과 집계 여부, 모든 실행 기록,
`next_actions`를 보여줍니다.

| 다음 행동 | 의미 |
| --- | --- |
| `launch` | 배정되었지만 시작 전 |
| `continue_with_launch_or_resume` | 일시정지됨(예: 실행 실패 후). 다음 launch 또는 resume이 다시 활성화 |
| `finish_before_followup_deadline` | 작업을 계속하고 기한 전에 판정 기록 |
| `finish_now_outcome_excluded_after_deadline` | 기한이 지남. 판정은 저장되지만 집계되지 않음 |
| `stop_or_recover_running_run` | 아직 running으로 남은 실행이 있음(6단계) |
| `report_after_followup_deadline` | 완료됨. 최종 보고서는 기한 이후에 |
| `create_report` | 완료됐고 기한도 지남 |

## 5. 같은 작업 이어가기

매번 새 `run_id`와 confirmation ID를 쓰세요. 배정은 바뀌지 않습니다.

```sh
hm workflow codex resume --config workflow.json --runtime runtime.json \
  --execution resume.json --confirmation confirmation-2
```

`resume.json`에는 launch 영수증의 `session_id`가 필요합니다. CLI 밖에서 시작한 세션에는
`link`와 `collect`를 씁니다. [네이티브 워크플로 런북](task-native-workflow.md)을 보세요.

## 6. 실행 중지 또는 복구

```sh
hm workflow codex stop run-3      # 살아 있는 실행에 중지 요청
hm workflow codex recover run-3   # 프로세스가 사라짐(크래시, 강제 종료, 재부팅)
```

수집기가 사라진 뒤 `running`으로 남은 실행은 새 실행을 `workflow_run_active`로 막습니다.
`recover`는 이를 사유 `abandoned`의 `failed`로 표시하고, 관찰하지 못한 시간을 관찰 공백으로
기록합니다. 사용량을 추가하지는 않습니다. 작업을 일시정지하거나 완료하기 전에 recover하세요.
비활성 작업에는 공백을 기록할 수 없으며, 이때 결과에 `gap_warning: task_not_active`가 표시됩니다.
살아 있는 harness-delta 수집기는 다음 검사에서 멈춥니다. Codex 프로세스 자체는 별도 프로세스
그룹에서 실행되어 수집기가 강제 종료된 뒤에도 남을 수 있고 `recover`는 이를 종료할 수 없으므로,
남은 Codex 프로세스는 직접 종료하세요.

## 7. 완료 판정

```sh
hm workflow finish task-1 --outcome success --met criterion-1
```

`success`는 모든 기준 ID가 필요하고, `failed`와 `aborted`는 일부만 허용합니다. 결과에
`followup_ends_at`과 `counted_in_deadline_status`가 표시됩니다.

## 8. 보고서

`followup_ends_at`이 지난 뒤:

```sh
hm workflow report pilot-1 --id report-1 --cutoff 2026-10-12T00:00:00Z --reason initial
```

작업별 `deadline_status`는 `success`, `failed`, `aborted`, `outcome_missing`, `not_started`,
`followup_pending` 중 하나입니다. 서술 버전 `flexible-cost-descriptive-2` 보고서에서는 기한 이후
판정이 `late_outcome`에 표시됩니다. 비용은 관찰된 부분 사용량의 표준화 추정치이며 실제 청구액이
아닙니다.

## 자주 보는 오류 코드

CLI는 실패마다 코드 하나와, 자주 나오는 코드에는 `hint:` 줄을 출력합니다. 경로, 파일 내용,
제품 메시지는 출력하지 않으며, 그 밖의 실패는 `input_or_state_error`로 표시됩니다.

| 코드 | 할 일 |
| --- | --- |
| `invalid_command: ...` | 필수 옵션이나 인자가 빠짐. `--help`로 사용법 확인 |
| `config_file_unreadable`, `*_file_invalid_json` | 해당 파일의 경로와 JSON 문법 확인 |
| `invalid_execution` | execution 파일이 작업 종류와 맞지 않음. 예시와 비교 |
| `binary_mismatch`, `binary_unreadable` | 정확한 Codex 0.160.0 바이너리와 절대·정규 경로 사용 |
| `invalid_hook_recorder` | `hook_recorder`를 이 체크아웃의 수정되지 않은 recorder로 지정 |
| `invalid_prompt`, `unsafe_home` | 1 MiB 이하 UTF-8 프롬프트 파일과 존재하는 Codex home 사용 |
| `confirmation_conflict` | 새 `--confirmation` ID 전달 |
| `workflow_run_active` | 실행 중인 run을 기다리거나 stop 또는 recover |
| `real_experiment_disabled` | 프로토콜을 freeze하고 `workflow status` 확인 |
| `workflow_manifest_mismatch` | 변형 등록 뒤 지시 파일이 바뀜 |
| `invalid_transition` | 현재 작업 상태에서 허용되지 않음. `workflow task` 확인 |
| `invalid_criteria` | `success`는 `--met`에 모든 기준 ID가 필요 |
| `invalid_cutoff` | 미래가 아닌 UTC cutoff 사용 |
