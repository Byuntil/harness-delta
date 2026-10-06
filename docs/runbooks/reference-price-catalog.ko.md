# 기준가격 카탈로그 사용하기

[English](reference-price-catalog.md) · [비용 상태와 수집 범위](observed-cost.ko.md)

측정 작업과 같은 로컬 DB를 사용하세요. 사전 조건은 Node 24로 빌드한 CLI와
승인된 저장 관측값입니다. 이 명령은 로컬 메타데이터를 읽으며 모델 요청을 시작하지
않습니다. 표준화된 부분 추정은 청구액이나 실지출 절감액이 아닙니다.

## 1. 제공된 카탈로그 읽기

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table catalog-status
```

예상 결과: 카탈로그 ID/버전, 확인일, 마지막 확인/성공 시각, 갱신 상태입니다.
처음 사용하면 번들 카탈로그를 오프라인으로 불러옵니다. 2026-10-06에 확인한
Astra, Sol, Luna, Fable, Opus, Sonnet, Haiku 기준가격이 있습니다.
[출처 정책과 정확한 식별자](../decisions/reference-price-catalog.md)를 확인하세요.
`update_channel`은 `bundled_or_verified_local_artifact`입니다. 온라인 갱신 서비스는
설정되어 있지 않습니다. 오래되었거나 갱신에 실패한 상태는 마지막으로 승인된 카탈로그와
함께 표시해야 합니다. 확인 날짜는 가격 적용 시작 날짜를 입증하지 않습니다.

## 2. 가격 파일을 선택하지 않고 추정하기

```sh
reportCutoff=$(node -p 'new Date().toISOString()')
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table estimate-task task-1 \
  --cutoff "$reportCutoff"
```

예상 결과: `price_selection`, 카탈로그/가격표 출처, 정확한 토큰 범주 매칭,
`partial_amount`, null인 `complete_amount`, 사유와 구간/수집 범위 근거입니다.
배정된 V2 작업은 고정된 비교 기준을, 독립 작업은 현재 카탈로그를 사용합니다.
과거의 명시적 비교 가격표도 계속 사용할 수 있습니다. 새 V2 비교 CLI 설정은
`price_table_id`를 생략할 수 있으며 등록 시 한 번 채웁니다. 갱신은 등록된 기준을
바꾸지 않습니다. 고급 `--price-table`은 [기존 명시적 절차](observed-cost.ko.md#1-가격표-선택하기)를 유지합니다.

V1 기본 입력 기준은 `output-only-v1`입니다. V2는 기록된 서로 겹치지 않는 범주를
유지합니다. 명시적 `--input-basis cache-read-remainder-ordinary-v1`은 기존 형식의
가정이며 캐시 쓰기 수집 범위가 검증되었다는 뜻이 아닙니다. effort에 가격 배수를
적용하지 않으며 추론 토큰은 출력에 이미 포함됩니다. 사용량 누락은 그대로 남깁니다.
알 수 없는 모델/단가는 해당 비용을 계산 불가로 표시하며 측정한 토큰은 보존합니다.
유사한 모델 이름이나 다른 모델의 가격을 대신 적용하지 않습니다.

## 3. 승인된 카탈로그 갱신하기

도구 업데이트 후 번들을 다시 불러오세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table refresh-catalog
```

예상 결과: `unchanged` 또는 `updated`입니다. 번들이 승인된 로컬 카탈로그보다 오래되면
`catalog_rollback`으로 실패하고 더 최신인 캐시를 유지합니다.
신뢰하는 배포자가 제공한 새 릴리스 파일을 사용하려면 파일과 별도로 검증한 SHA-256을
지정하세요. 아래 두 자리표시자를 실제 값으로 바꾸세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table refresh-catalog \
  --artifact /path/to/reviewed-catalog.json --sha256 'TRUSTED_64_CHARACTER_SHA256'
```

예상 결과: `updated`/`unchanged`, 또는 정제된 실패 사유와 종료 코드 2입니다.
이후 `catalog-status`를 확인하세요. 해시는 파일 내용을 확인하며 배포자의 신뢰성을
입증하지 않습니다. 잘못된 파일, 시간 초과, 해시 불일치, ID 충돌, 오래된 버전은
마지막 승인 가격을 유지합니다. 갱신은 향후 기본 준비에만 반영됩니다.
일반 추정 흐름에서 사용자가 모델별 단가를 편집/등록하지 않습니다.
도구의 승인된 공개 공급원에서 검토된 릴리스를 요청하세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table refresh-catalog --online
```

예상 결과: `updated`/`unchanged`, 또는 승인 캐시를 유지하는 안전한 실패입니다.
기본 공급원은 승인된 `Qello-Labs/harness-delta` GitHub 최신 릴리스입니다.
저장소 이전 뒤에는 기존 클라이언트를 이 주소로 갱신하세요. 이전 소유자의
리디렉션은 고정된 다운로드 정책에 없는 경유를 추가합니다. 발행자 ID
`harness-delta`, 릴리스 파일 내용과 기존 작업의 가격 기준은 유지합니다.
첫 가격 릴리스는 2026-10-06에 실제 다운로드/갱신 검증을 통과했습니다.
향후 최신 릴리스에도 manifest와 카탈로그 파일이 있어야 합니다. 파일이 없으면
갱신은 실패하고 캐시 가격을 유지합니다. 서버에서 공급원을 명시적으로 미설정하면
`catalog_source_not_configured`와 종료 코드 2를 반환합니다.
`online_source.status: configured`와 `can_attempt_online_refresh: true`는 공급원 설정을
뜻하며 연결 가능성이나 최신성 검증을 뜻하지 않습니다. `verification_age_days`는
보존 카탈로그의 확인일을 나타냅니다. 브라우저는 모델별 가격 JSON이나 임의 공급원
URL을 요구하지 않습니다.

## 4. 고정 결과를 보존하고 재계산하기

메타데이터를 삭제하기 전에 작업 입력을 보존하세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table snapshot-task task-1 \
  --id cost-input-1 --cutoff "$reportCutoff"
```

기존 V2 비교 보고서는 고정 보고서에서 양군을 함께 보존하세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table snapshot-comparison report-1 \
  --id comparison-cost-input-1
```

예상 결과: 입력 ID/해시와 원래 가격표/마감 시각입니다. 작업과 비교의 구간은 다를 수
있으므로 해당 입력을 선택하세요. 두 명령 모두 세션 내용을 읽지 않습니다.
승인된 갱신 후 해당 입력에서 별도 결과를 만드세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table reprice comparison-cost-input-1 \
  --id repriced-1
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table revaluation repriced-1
```

예상 결과: 원래 작업/양군 모두에 적용되는 하나의 새 카탈로그 기준, 동일한 사용량/구간
해시, 별도 결과 ID, null인 전체 비용입니다. 원래 보고서는 그대로 남습니다.
이 결과는 기술적 재평가이며 도입이나 상대 변화 판정을 제공하지 않습니다.
작업 입력에는 `comparison-cost-input-1` 대신 `cost-input-1`을 사용하세요. 새로 단가가
생긴 모델은 부분 계산이 가능해질 수 있으나 사용량 누락은 여전히 누락입니다. 종속
작업/프로젝트 삭제나 기준 보고서 무효화는 보존 입력/결과를 제거하고 복원을 막습니다.
