# 로컬 측정 사용 안내

[English](local-measurement.md)

Node.js 24가 필요합니다. `npm ci && npm run build`로 빌드한 뒤 저장소에서
`node dist/cli.js`를 실행하세요. 로컬 패키지를 설치했다면 `hm`을 사용할 수도 있습니다.
설치만으로 수집이 시작되지는 않습니다. 현재 버전은 **부분 관측값**을 제공하며,
작업 전체 사용량이나 도입 여부를 판단할 수 있는 단계는 아닙니다.
자세한 범위는 [지원 현황과 제한](../decisions/001-adapter-capabilities.md)을 참고하세요.

## 프로젝트·작업 등록과 세션 연결

작업을 시작하기 전에 식별자와 고정된 완료 조건 ID를 정하세요. 식별자에는 개인 정보나
작업 내용을 넣지 마세요. 프로젝트 루트와 로그 파일 경로는 로컬 설정으로만 저장되며
보고서에는 포함되지 않습니다. 아래 경로, 모델, 세션 ID와 버전은 측정할 전용 세션의
실제 값으로 바꿔야 합니다.

```sh
node dist/cli.js --db local.db project add project1 --root /path/to/project
node dist/cli.js --db local.db task register task1 --project project1 --type feature --size small --assignee user1 --product codex --model MODEL_ID --criteria criterion1
node dist/cli.js --db local.db task start task1
node dist/cli.js --db local.db session link SESSION_ID --task task1 --source /path/to/exact-session.jsonl --product codex --version 0.156.1
node dist/cli.js --db local.db collect --task task1
```

`--version`에는 해당 제품의 등록된 정확한 버전만 쓸 수 있습니다.

등록된 프로젝트인지, 작업이 활성 상태인지 확인한 뒤 명시적으로 연결한 파일만 읽습니다.
전체 세션 로그를 자동으로 검색하지 않습니다. 첫 수집에서는 이후 측정을 위한 기준점을 잡습니다.
**수집을 시작한 다음 새 프롬프트 또는 턴을 시작하세요.** 수집 시작·재시작·재개 시점에
이미 진행 중이던 턴은 나중에 도착한 도구 완료 기록까지 포함해 집계에서 제외됩니다.

작업하는 동안 수집 명령을 실행 상태로 유지하세요. Ctrl-C 또는 SIGTERM으로 종료하면
백그라운드 수집도 남지 않습니다. `--once`는 기준점만 잡고 종료합니다. 이를 반복 실행해도
실행 사이에 발생한 사용량은 측정되지 않습니다.

다른 터미널에서 같은 DB를 지정해 일시정지하거나 재개할 수 있습니다.

```sh
node dist/cli.js --db local.db task pause task1
node dist/cli.js --db local.db task resume task1
```

재개 후 첫 수집에서 새 기준점을 잡습니다. 수집 중단이나 재시작으로 빠진 구간은
자동으로 보충하지 않습니다. 마지막 로그 이벤트가 도착하고 수집된 것을 확인한 뒤
작업 결과를 최종 확정하세요.

## 완료 평가·보고서·삭제

아래는 첫 완료 평가에서 실패한 뒤 재작업을 거쳐 최종 성공으로 확정하는 예입니다.

```sh
node dist/cli.js --db local.db task first-complete task1
node dist/cli.js --db local.db task assess-first task1 --result failed
node dist/cli.js --db local.db task rework task1
node dist/cli.js --db local.db task finalize task1 --outcome success --met criterion1
node dist/cli.js --db local.db report task task1 --cutoff 2030-01-02T12:00:00Z --format json
node dist/cli.js --db local.db delete task task1
```

`--cutoff`에는 예시 날짜 대신 실제 보고 기준시각을 UTC로 입력하세요.
사람이 결과와 완료 조건 충족 여부를 명시적으로 평가해야 합니다. 테스트 통과만으로
작업이 자동 확정되지는 않습니다. 최종 확정한 결과는 변경할 수 없으며, 새로운 요구사항은
새 작업으로 등록합니다.

보고서에는 관측된 토큰 구성과 부분 합계, 결과, 재작업, 경과시간·활성시간,
확인된 명령/Bash 실행이 표시됩니다. 캐시 입력은 정규화된 전체 입력에 이미 포함되어
있으므로 다시 더하지 마세요. 지원되지 않는 작업 전체 합계, 일반적인 도구 실패 수,
모델 실행시간, 비용, 검색·파일 읽기 분류, 중복 읽기, 컨텍스트 확장,
최초 편집·테스트·자동 성공 판정 시각은 `null`로 남습니다.
값이 없다는 뜻과 0은 다릅니다. 원본에서 명시적으로 관측한 0은 그대로 보존합니다.

보존 기간은 직접 설정해야 합니다. 다음 예는 최종 확정 후 30일이 지난 작업을 정리합니다.
활성 작업은 유지됩니다.

```sh
node dist/cli.js --db local.db retention set project1 --days 30
node dist/cli.js --db local.db retention apply project1
node dist/cli.js --db local.db delete project project1
```

마지막 명령은 프로젝트와 그 작업·관련 데이터를 삭제합니다. 삭제 표식(tombstone)이
남아 같은 식별자의 재사용을 막습니다. 이미 생성한 보고서 파일과 제품의 원본 세션 로그는
로컬 DB 삭제 대상이 아닙니다. 가져오기·동기화 과정의 삭제 보장은 후속 구현 범위입니다.

## 관찰 기간 비교 사전 등록

[기간 설정 예제](../../examples/period.json)를 복사한 뒤 미래의 비교 기간과 모든 대상 조건을
설정하세요. 첫 번째 기간이 시작되기 전에 등록해야 합니다.

```sh
node dist/cli.js --db local.db period register --config period.json
node dist/cli.js --db local.db report period period1 --cutoff 2030-03-01T00:00:00Z --format markdown
```

설정에는 버전이 기록되며 등록 후 변경할 수 없습니다. 비교 대상은 완료일이 아니라
작업 시작시각이 `[start,end)`에 속하는지로 정합니다. 시작 경계는 포함하고 종료 경계는
제외합니다. 각 작업을 지정한 시간 동안 추적하며, 작업별 추적 종료 이후의 결과는 제외합니다.
두 번째 모집 기간과 추적 기간이 모두 끝나기 전까지 보고서는 잠정 결과입니다.

작업 구성과 모든 대상 작업의 결과를 함께 표시하며, 실패·중단·사용량 누락도 남깁니다.
관측이 부분적이면 전체 사용량 평균과 변화율은 제공하지 않습니다. 기간 차이만으로
인과관계나 절감 효과를 확정할 수 없습니다.

JSON과 Markdown에는 같은 데이터 스냅샷과 메타데이터만으로 계산한 지문이 담깁니다.
DB 데이터·설정·보고 기준시각이 같으면 같은 기간 보고서를 재현할 수 있습니다.
삭제나 새 데이터 입력 후에도 이전 결과가 필요하다면 생성한 보고서를 별도로 보관하세요.

## 버전, 적합성 확인, 업데이트 제어

등록된 파일 어댑터는 부분 관측입니다. 현재 허용 버전은 Codex CLI 0.156.1과 Claude Code 2.1.283뿐입니다. 등록되지 않은 버전, 범위, 접미사는 파일을 읽기 전에 거절되며 세션으로 저장되지 않습니다. Codex 0.158.0은 등록되어 있지 않습니다. 자세한 기준은 [ADR 007](../decisions/007-adapter-version-profiles.md)을 참고하세요.

저장소의 적합성 확인 스크립트 `scripts/conformance/`는 수동으로만 실행합니다. 설치, 수집, 훅, CI는 이 스크립트를 실행하지 않습니다. CI는 오프라인 합성 단위 테스트로 보고서 투영, 후보 파서, 확인·훅 신뢰 도우미, exec 출력 축약기를 실행합니다. CI는 적합성 확인 실행기를 실행하지 않습니다. 설계 승인은 실제 제품 실행 승인이 아닙니다.

실제 실행 프로토콜을 승인한 뒤 Codex 0.158.0 exec 적합성 확인을 실행하려면, 스크립트를 무시되는 캐시 디렉터리로 컴파일한 다음 저장소 루트의 대화형 터미널에서 실행기를 시작합니다.

```sh
npx tsc -p tsconfig.conformance.json
node node_modules/.cache/conformance/scripts/conformance/runner.js --out "$PWD/.harness-delta/work/<work-id>/live"
```

실행기는 계획을 출력하고, `confirm`을 직접 입력하기 전에는 제품 프로세스를 시작하지 않습니다. 이 확인을 건너뛰는 옵션은 없습니다. 대화형 터미널이 아니거나, `CODEX_HOME`이 설정되어 있거나, 출력 디렉터리가 `.harness-delta/` 밖이면 실행을 거부합니다. 실행 전후에 `codex --version`을 확인하고, 합성 프롬프트로 `codex exec` 한 턴과 같은 세션의 resume 한 번을 실행합니다. rollout 파일은 exec 출력의 스레드 ID로 찾고, 호출 단위 SessionStart 훅으로 교차 확인합니다. 보고서에는 검사 결과, 개수, 카탈로그 키 이름만 제한된 권한으로 기록하며 ID, 경로, 본문, 토큰 값은 남기지 않습니다. 실행으로 생긴 rollout 파일에는 합성 프롬프트, 응답, 지시문이 들어 있으며 삭제하지 않고 남겨 둡니다. 수동 테스트 `npx vitest run --config scripts/conformance/vitest.config.ts`는 실제 제품이 아닌 합성 대역으로 실행기를 검증합니다.

호출 단위 훅 재정의는 `codex exec` 0.158.0에서 동작함을 관찰했습니다. 소스 검토에 따르면 이미 실행 중인 app-server 데몬에 연결되는 대화형 Codex 시작은 호출 단위 훅 설정을 그 데몬에 전달하지 않습니다. 대조 실행 결과도 이와 일치했지만 이를 증명하지는 못했습니다. 대화형 세션 연결은 계속 지원하지 않습니다.

실험 전에는 고정한 바이너리에서 업데이트 제어를 따로 확인합니다. 제품, 애플리케이션, 실행 파일의 출처, 모델과 설정을 고정합니다. 프로세스 단위 제어만 사용하고 설정 파일은 수정하지 않습니다. Codex 문서의 일회성 재정의는 `-c check_for_update_on_startup=false`입니다. Claude Code 문서의 프로세스 환경 변수는 `DISABLE_AUTOUPDATER=1`이며, `DISABLE_UPDATES=1`은 수동 업데이트도 막습니다. 이 값은 2026-09-29 문서 확인 결과이며 고정 바이너리의 실행 검증이 아닙니다. 실행 전후에 버전을 확인합니다. 버전이 달라지면 측정을 멈추고 불확실로 표시한 뒤, 고정된 이탈 정책을 따릅니다. 세션을 다시 연결하거나 빈 구간을 채우거나 배정을 바꾸지 않습니다. 이 절차는 R09를 활성화하지 않으며 R10 관문을 면제하지 않습니다.

## 오류 복구와 제한

오류는 고정된 코드로 표시합니다. 원본 파일 식별 변경·잘림, 범위·버전 불일치,
상충하는 메타데이터, 카운터 초기화, 지원되지 않는 세션 관계가 발견되면 불확실한
수집 묶음을 제외합니다. 이전 관측값은 부분 관측으로 남습니다.
명시적인 연결 정보를 바로잡고 다시 시작하면 새 기준점을 잡으며 과거 데이터를 가져오지 않습니다.

초기 구현은 16 MiB를 넘는 원본 파일을 지원하지 않습니다. 매 수집 주기마다 허용된 파일의
크기가 제한된 스냅샷을 읽는 방식이며, 무제한 크기의 운영 로그를 계속 추적하는 수집기는 아닙니다.

`npm run check`로 CLI 흐름, 민감 정보 대체 문자열의 유출 방지, 트랜잭션 롤백,
일시정지·재시작, 보고서에 대한 합성 인수 테스트를 실행할 수 있습니다.
현재 실제 검증 범위는 macOS arm64, Codex CLI 0.156.1, Claude Code 2.1.283입니다.
앱 세션, 부모·자식 세션의 완전한 합산, 0이 아닌 추론 토큰의 의미, 다른 버전과 플랫폼은
별도 검증이 필요합니다. 현재 버전을 실제 실험이나 통계적 추론을 통한 도입 결정에 사용하지 마세요.
