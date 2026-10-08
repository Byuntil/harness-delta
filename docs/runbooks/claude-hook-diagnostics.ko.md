# Claude 훅 기록기 진단

[English](claude-hook-diagnostics.md)

선택적 진단 모드로 생명주기 입력 거절과 receipt 저장 실패를 구분합니다.
이 모드는 소스 허용, 훅 설치, 수집 시작 또는 자식의 종료·전체 카운터 전달을
입증하지 않습니다. 기본 훅 명령은 조용히 실행됩니다. 기존 receipt 스키마와
identity, 프로젝트, 프로세스, 소스 경로, 삭제 및 버전 검증을 유지합니다.

## 증거 범위

현재 [공식 훅 문서](https://code.claude.com/docs/en/hooks#hooks-in-skills-and-agents)는
호출한 skill의 훅이 세션 동안 유지된다고 설명합니다.
[SubagentStop 입력](https://code.claude.com/docs/en/hooks#subagentstop-input)은
메인 세션과 자식 transcript 경로를 구분합니다.
[환경 변수 문서](https://code.claude.com/docs/en/env-vars)는 훅 명령의
`CLAUDE_PID`를 설명합니다. 이 문서는 기대 계약이며 정확한 버전의 native
검증 결과가 아닙니다. 종료 receipt 누락만으로 호출 누락, 입력 오류, 저장 실패,
관측 시점을 구분할 수 없습니다. 시작 receipt는 가족 발견에 사용될 수 있습니다.
종료 증거 부재는 사용량 0 또는 자식의 실행·실패·완료를 뜻하지 않습니다.

## 명시적 활성화 명령

실제 계측을 변경하기 전에 정확한 프로젝트, 새 활성 작업, 연결된 루트 세션,
설치된 훅 바이트와 제한된 native 행동을 승인받습니다. 완료된 시험과 receipt를
보존합니다. 설치, 재로드, trust/auth/전역 설정 변경, native 프로세스 시작 또는
종료를 자동으로 실행하지 않습니다. Node 24를 선택합니다.

명시적으로 선택한 세션에 대해 승인된 훅 명령에 다음 옵션을 추가합니다.

```sh
node <skill-dir>/scripts/claude-session-hook.mjs record --diagnostics-session <selected-session-uuid>
```

유효한 다른 세션은 진단을 출력하지 않습니다. 잘못된 identity 또는 해석할 수
없는 stdin은 명시적으로 범위를 정한 호출에서 내용 없는 이유를 출력할 수
있습니다. 이 경우 세션 귀속은 확인할 수 없습니다. 선택하지 않은 이벤트와
관련 없는 Bash 명령은 조용히 실행됩니다. 잘못된 진단 세션 선택은 진단 출력을
비활성화합니다. 이 옵션은 진단만 필터링하며 일반 receipt 기록을 필터링하거나
확장하지 않습니다. 승인된 사용자 행동으로 native 시험을 제한하고 자동 시간
제한이나 kill을 사용하지 않습니다. stdin, 도구 payload 또는 native 디버그 로그를
리디렉션하거나 보관하지 않습니다.

stderr JSON 한 줄에는 `schema_version`, 고정 `kind`, `status`, `reason_code`만
포함합니다. 식별자, 경로, 시간, 프롬프트, 응답, 도구 명령, 카운터 또는 예외
상세를 포함하지 않습니다. stdout은 비어 있고 `record`는 0을 반환합니다. 예:

```json
{"schema_version":1,"kind":"subagent_stop","status":"rejected","reason_code":"agent_transcript_path_invalid"}
```

| 상태 | 의미 |
| --- | --- |
| `recorded` / `receipt_recorded` | 이번 호출이 receipt를 생성했습니다. 허용된 메타데이터를 별도로 확인합니다. |
| `ignored` / `receipt_exists` | 대상 경로가 이미 존재합니다. 내용 검증을 뜻하지 않습니다. |
| `ignored` / `session_forgotten` | 삭제 때문에 이벤트 기록을 억제했습니다. |
| `rejected` | 필수 입력이 잘못되어 receipt를 생성하지 않았습니다. |
| `error` / `receipt_write_failed` | receipt 저장에 실패했습니다. 원본 오류 상세는 출력하지 않습니다. |

거절 코드는 `session_id`, `claude_pid`, `transcript_path`, `cwd`, `tool_use_id`,
`agent_id`, `agent_transcript_path`에 `_invalid`를 붙입니다. 객체가 아닌 JSON은
`hook_input_invalid`, 잘못된 JSON은 `hook_input_invalid_json`, 4 MiB보다 큰
stdin은 `hook_input_too_large`입니다. 해석할 수 없는 stdin의 `kind`는 `null`입니다.
진단이 없으면 훅 로딩·호출과 명령 시작 여부는 여전히 확인되지 않습니다.
이 경계는 별도로 승인된 메타데이터 관측으로만 확인합니다.

## Synthetic 검증

Node 24 checkout에서 실행합니다.

```sh
npm run build
npm test -- tests/claude-hook-diagnostics.test.ts tests/session-binding-claude.test.ts tests/session-binding-claude-api.test.ts
node --test skills/harness-connect/tests/*.mjs
npm run check
```

이 검사는 synthetic 입력과 임시 receipt 디렉터리를 사용합니다. 기록기 동작,
개인정보 보호, 재실행·삭제 처리와 기존 binding 검증을 확인합니다. Claude 실행,
정확한 native 생명주기·카운터 검증, 누락된 종료 이벤트 복원 또는 과거 측정
변경은 수행하지 않습니다.
