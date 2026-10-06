# 관측된 작업 비용 추정 읽기

[English](observed-cost.md) · [작업 절차](workflow-quickstart.ko.md)

이 보고서는 **저장된 적격 관측값**에 명시적 기준 가격을 적용합니다.
세션 파일이 아니라 DB 이벤트를 읽으며 제품·모델 요청을 시작하지 않습니다.
`complete_amount`는 항상 null입니다. 부분 추정은 청구액·절감액·도입 결과가 아닙니다.
연결된 루트/자식/재작업 이벤트는 소스와 구간이 적격일 때만 포함됩니다.
이 보고서는 소스를 승인하거나 부모/자식 카운터 중복이 없음을 입증하지 못합니다.

일반 흐름은 [제공된 기준가격 카탈로그](reference-price-catalog.ko.md)를 사용하세요.
`estimate-task`에 `--price-table`이 더는 필수가 아닙니다. 배정된 V2 작업은 고정된
비교 가격표를 유지하고 독립 작업은 현재 카탈로그를 사용합니다. 아래 절차는 과거 추정에도
계속 사용할 수 있는 고급 명시적 가격표 경로입니다.

## 1. 가격표 선택하기

측정 작업과 같은 DB를 사용하세요. 가격표를 명시적으로 선택하세요.
파일럿에 이미 `prices-1`을 등록했다면 아래 등록 예제는 건너뛰세요.

저장소의 [기준표](../../config/prices/openai-standard-short-2026-10-04.json)는 **2026-10-04**에 확인한 OpenAI API Standard·short-context 고정 스냅샷입니다.
단위는 토큰 1,000,000개당 USD입니다. `as_of`는 확인 날짜이며 가격 적용 시작 시각을 뜻하지 않습니다.

| 정확한 모델 | 일반 입력 | 캐시 읽기 | 캐시 쓰기 | 출력 |
| --- | ---: | ---: | ---: | ---: |
| gpt-6-astra | 10 | 1 | 12.5 | 50 |
| gpt-6.1-sol | 2 | 0.1 | 2.5 | 10 |

출처는 [공식 API 가격표](https://developers.openai.com/api/docs/pricing)의 Flagship models / Standard / Short context입니다.
[Astra 발표](https://openai.com/index/gpt-6-astra/)는 일반 입력/출력 가격을 확인합니다.
[Sol 발표](https://openai.com/index/introducing-gpt-6-1-sol/)는 캐시 입력 가격도 확인합니다.
캐시 쓰기 가격의 출처는 가격표입니다.
[Astra 모델 안내](https://developers.openai.com/api/docs/models/gpt-6-astra)와 [Sol 모델 안내](https://developers.openai.com/api/docs/models/gpt-6.1-sol)는 입력 272K 초과를 long context로 구분합니다.
이 스냅샷은 해당 경계 이하의 기준 가격을 사용합니다.

**가격 주의:** 가격표 선택은 관측 요청의 서비스 등급·context 범위를 입증하지 않습니다.
Fast/Ultrafast, Batch/Flex, long-context, 지역별 가격은 자동 선택하지 않습니다.
API 추정은 구독 청구액이나 구독 한도 사용량을 측정하지 않습니다.
모델 별칭이나 가격 대체를 적용하지 않습니다.

1. 이 표가 합의된 기준이면 등록하세요.

   ```sh
   node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table register \
     --config config/prices/openai-standard-short-2026-10-04.json
   ```

2. 등록된 내용을 확인하세요.

   ```sh
   node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table show openai-standard-short-2026-10-04
   ```

예상 결과: 변경할 수 없는 가격과 선택한 출처/버전.
같은 내용의 재등록은 같은 결과를 냅니다. 같은 ID의 변경 내용은 거부합니다.
다른 가격은 새 ID/버전을 이후에 선택하세요. 동결된 프로토콜은 원래 가격표를 유지합니다.

다른 모델은 명시적으로 선택한 가격을 제공하거나 모델 항목을 생략하세요.
완전한 `prices.json` 예제에 새 ID/버전/출처/날짜, 통화 하나, `unit_tokens`, 표시 정책, 정확한 성분 가격을 넣으세요.
로컬 설정 옆에 출처 URL·등급/context 범위·확인 날짜를 기록하세요.
사용자 기준 가격은 공식 제공자 가격이 아닙니다.
없는 모델은 unavailable로 남기며 다른 모델 가격을 쓰지 마세요.
저장소의 제한된 표에는 `gpt-6-sol`과 다른 모델을 의도적으로 넣지 않았습니다.

## 2. 추정 생성하기

사전 조건: 이 DB에 승인된 작업 관측값이 이미 있습니다.
파일럿의 작업/가격표 ID가 다르면 교체하세요.
포함할 관측 이후의 UTC cutoff를 저장하세요.

```sh
reportCutoff=$(node -p 'new Date().toISOString()')
```

기존 출력만 계산하는 기본 가정으로 추정하세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table estimate-task task-1 \
  --price-table prices-1 --cutoff "$reportCutoff" --input-basis output-only-v1
```

저장소 기준표를 선택했다면 `prices-1`을 `openai-standard-short-2026-10-04`로 교체하세요.
이 동작은 기존 데이터를 추정하며 추가 사용량 수집이나 인증 조회를 하지 않습니다.

예상 결과: `partial_amount`, null `complete_amount`, 명시적 이유, 관측 구간 근거.
작업이 삭제되었으면 추정은 실패합니다. 삭제가 이전 이벤트를 복구하지는 않습니다.
[workflow 비교 보고서](workflow-quickstart.ko.md)는 자체 배정/판정 기간 구간을 고정합니다.
이 작업 추정은 작업 시작/활성 구간과 cutoff/최종 판정을 사용합니다.
두 보고서가 같은 시간 구간을 포함한다고 가정하지 마세요.

## 3. 의도된 경우에만 기존 입력 가정 선택하기

| 가정 | 효과 |
| --- | --- |
| `output-only-v1` | 알려진 기존 출력 계산; 기존 입력 분리는 unavailable |
| `cache-read-remainder-ordinary-v1` | 전체 입력에서 캐시 입력을 뺀 값을 일반 입력으로 가정; 캐시 입력은 캐시 읽기 가격 적용 |

V1 이벤트는 검증된 일반 입력/캐시 쓰기 분리를 기록하지 않습니다.
remainder 가정은 나머지에 별도 청구되는 캐시 쓰기가 없다고 가정합니다.
관측되지 않은 캐시 쓰기는 **0으로 검증되지 않았습니다**.
전체/캐시 카운터가 없으면 입력 추정을 보류하며 캐시가 전체보다 크면 실패합니다.
reasoning output은 total output에 이미 포함됩니다. 다시 더하지 마세요.
V2 이벤트는 어느 기존 가정을 선택해도 기록된 분리 성분과 귀속을 유지합니다.

가정에 합의했다면 명시적으로 요청하세요.

```sh
node dist/cli.js --db .harness-delta/pilot/local.sqlite price-table estimate-task task-1 \
  --price-table prices-1 --cutoff "$reportCutoff" --input-basis cache-read-remainder-ordinary-v1
```

예상 결과: 보고서가 가정 이름과 입력 가정을 적용한 이벤트 수를 표시합니다.
가격·성분 관측 범위·입력 가정·시간 구간이 비교 가능할 때만 추정값을 비교하세요.
출력만 계산한 추정은 입력 가격을 가정한 추정과 같지 않습니다.

## 4. 금액·누락·관측 범위를 따로 읽기

| 필드/상태 | 뜻 |
| --- | --- |
| `partial_amount` | 적격 가격 성분의 합계; 명시적 입력 가정을 포함할 수 있음 |
| `partial_amount: "0"` | 적격 가격 관측의 합계가 0 |
| `partial_amount: null` | 적격 가격 금액 없음; 0이 아님 |
| `complete_amount: null` | 작업 전체 비용 제공 불가 |
| `unpriced_events` | 기록 이벤트에 가격 없는 성분이 하나 이상 있음 |
| `unavailable_events` | 부분 가격 금액을 계산할 수 없는 이벤트 |
| `excluded_event_count` | 관측 구간 정책으로 제외한 저장 후보 수 |
| Missing / error / excluded / unmeasurable | 서로 다른 관측 상태이며 관측된 0이 아님 |
| `observed_components_priced: true` | 적격 관측 성분에 가격 적용 가능; 작업 전체 관측 범위는 여전히 미확정 |

금액과 함께 이유를 읽으세요. 관측이 비었거나 모두 unavailable이면 부분 비용은 null입니다.
사용량 부재·알 수 없는 귀속/성분·가격 누락을 표시해야 합니다.
cached/reasoning 부분집합을 다시 더하거나 집계로 부모/자식 완전성을 추론하지 마세요.

cutoff는 해당 시각을 제외합니다. 작업 시작 전·최종 판정 시각 이상의 이벤트는 포함하지 않습니다.
기록된 활성 구간만 포함합니다. paused·미관측 구간은 backfill하지 않습니다.
명시적 손실/오류/제외 구간은 작업 전체에서 이벤트를 보수적으로 제외합니다.
일반 incomplete/unavailable 관측 범위는 독립 관측된 적격 이벤트를 유지하지만 완전하게 만들지는 않습니다.
후보 Claude의 구간 밖 span은 listener 구간을 offline으로 표시해 동반 이벤트를 보수적으로 제외할 수 있습니다.

`coverage`는 감시된 범위/identity 사실·미확정 사실·부적격 판정을 표시합니다.
source 변경 실패는 identity 위반을 유지합니다.
cutoff 뒤에 끝난 journal은 이전 관측 범위를 입증하지 못합니다.
빈 구간의 coverage 근거는 null이고 판정은 부적격입니다.
가격 적용 가능은 요청 전체 집합이나 마지막 전달 완료를 입증하지 않습니다.

## 출처와 검증 참조

JSON은 가격표 내용/hash, 중복 제거된 사용량 hash, 공식 `decimal160-disjoint-v1`, 보고서 버전 `observed-cost-v1`, 입력 가정을 포함합니다.
경계·이벤트/세션 수·가정 입력 수·누락/미가격 이유도 포함합니다.
금액은 decimal 문자열이며 반올림은 표시에만 적용합니다.
관측 테이블·공백 이유·버전 구간 정책은 observation-window hash에 포함됩니다.
coverage hash는 적격 이벤트·journal 메타데이터·가격·가정을 묶으며 source 경로를 반환하지 않습니다.

개발자 산술/보고서 검증은 [CONTRIBUTING](../../CONTRIBUTING.md#observed-cost-verification)에 있습니다.
합성 fixture 검증이며 production 완전성이나 실제 실험 효과를 입증하지 않습니다.
