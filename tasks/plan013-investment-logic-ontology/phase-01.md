# Phase 01. 투자 논리 사슬의 타입과 관계를 저장소 YAML 에 더한다

**Execution profile**: standard

## 목표

`financial-workbench/ontology/financial-ontology.yaml` 에 새 노드 타입 다섯(`Change`, `Bottleneck`, `Valuation`, `Scenario`, `Decision`)과 일반 관계 여덟을 더한다. 웹의 만들기 폼만으로 「변화 → 병목 → 기업 → 종목 → 밸류에이션 → 시나리오 → 결정」 사슬을 만들 수 있게 한다.

**범위 외**: 주장 종류 빼기(phase 02), 초기 데이터 교체(phase 03), 운영 DB 비우기(원격 검증 목록). 서버와 웹의 메인 코드는 바꾸지 않는다. 타입과 관계는 온톨로지만으로 동작한다.

## 컨텍스트

- 온톨로지 YAML 의 형식은 파일 머리 주석과 기존 타입(`Company`, `Document`)을 따른다. 흐름 표기(`{ ... }`) 안의 쉼표나 콜론이 든 문장은 따옴표로 감싼다. 알 수 없는 키가 있으면 API 가 시작하지 않는다.
- 노드 타입 필수 키는 `description`, `labelProperty`, `properties` 다. `labelProperty`, `hintProperties`, `searchProperties` 는 그 타입의 속성이어야 한다. `display.color` 는 `#rrggbb`, `display.shape` 는 `ellipse | round-rectangle | hexagon | round-diamond | round-tag | round-pentagon` 가운데 하나다(`api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` 의 `consistencyErrors`).
- 속성 타입은 `string | text | url | enum | date | datetime | number | integer | boolean` 이다. enum 은 `values` 가 비면 안 되고 `valueLabels` 키는 `values` 안에 있어야 한다. `number` 는 `min`, `max` 를 쓴다.
- 관계 타입은 `description`, `from`, `to` 가 필수이고 `label`, `createPicker{label, description}` 이 선택이다. `createPicker` 는 끝(`to`) 타입의 만들기 폼에 시작(`from`) 노드를 고르는 칸을 더한다(`web/src/components/NodeCreateForm.tsx`). 칸의 testid 는 `create-link-<관계>-picker` 다.
- 관계마다 `rel_<소문자>_id` 인덱스는 시작할 때 자동으로 만든다(`api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt`).
- 테스트는 저장소 YAML 을 그대로 읽는다(`OntologyLoader.loadDefault()`). 테스트용 YAML 은 없다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「노드」, 「관계」, 「투자 논리 사슬」, `financial-workbench/docs/flow.md` 의 「투자 논리 사슬 만들기」, `financial-workbench/docs/adr/009-investment-logic-chain.md`

## 의도 메모

- 사슬은 주장(Claim)이 아니라 일반 관계로 잇는다. 내 판단을 다른 편집자의 검토 대상으로 만들지 않기 위해서다(ADR-009).
- 관계 방향은 「나중에 만드는 노드가 끝」 이다. 그래야 `createPicker` 가 새 노드의 폼에 앞 노드 고르기 칸을 띄운다. 의미상 자연스러운 방향과 달라 보여도 바꾸지 않는다.
- `Valuation.currency` 는 `Security.currency` 와 같은 값 목록을 쓰되 `valueAliases` 는 두지 않는다. 예전 값 정리 대상이 늘지 않게 하려는 것이다.
- 기존 타입과 관계(`Company`, `Security`, `Sector`, `Document`, `Person`, `Concept`, `Claim`, `ISSUES`, `AUTHORED`, `RELATED_TO`)는 그대로 둔다.

## 작업 항목

### 1. `financial-workbench/ontology/financial-ontology.yaml` 에 노드 타입 다섯을 더한다

`Concept` 와 `Claim` 사이에 아래 순서로 넣는다. 설명(`description`) 문장은 개발 용어 없이 쓴다. `schemaVersion` 은 `"2.0.0"` 으로 올린다.

| 타입 | label | labelProperty | hintProperties | display |
| --- | --- | --- | --- | --- |
| `Change` | 세상의 변화 | `title` | `[category]` | `{ color: "#0891b2", shape: round-pentagon }` |
| `Bottleneck` | 병목 | `title` | `[status]` | `{ color: "#dc2626", shape: hexagon }` |
| `Valuation` | 밸류에이션 | `title` | `[asOf, method]` | `{ color: "#16a34a", shape: round-rectangle }` |
| `Scenario` | 시나리오 | `title` | `[kind, valuePerShare]` | `{ color: "#65a30d", shape: round-tag }` |
| `Decision` | 투자 결정 | `title` | `[action, decidedAt]` | `{ color: "#7c3aed", shape: round-diamond }` |

속성(`required` 를 적지 않은 것은 `false`):

- `Change`
  - `title`: string, label 「변화」, required, maxLength 300, description 「변화를 한 문장으로 적는다. 예: AI 서버가 늘면서 고성능 메모리 수요가 커진다」
  - `category`: enum, label 「분류」, required, values `[TECHNOLOGY, DEMOGRAPHIC, SOCIOCULTURAL, OTHER]`, valueLabels `{ TECHNOLOGY: 기술, DEMOGRAPHIC: 인구, SOCIOCULTURAL: 사회와 문화, OTHER: 기타 }`
  - `since`: string, label 「언제부터」, maxLength 64, description 「예: 2023년부터. 모르면 비워 둔다」
  - `durability`: text, label 「오래 가는 이유」, maxLength 4000
  - `description`: text, label 「메모」, maxLength 4000
- `Bottleneck`
  - `title`: string, label 「병목」, required, maxLength 300, description 「수요를 공급이 따라가지 못하는 구간. 예: HBM 생산과 고적층 패키징」
  - `status`: enum, label 「상태」, required, values `[HYPOTHESIS, CONFIRMED, RESOLVED]`, valueLabels `{ HYPOTHESIS: 가설, CONFIRMED: 확인, RESOLVED: 해소 }`
  - `demandEvidence`: text, label 「수요 근거」, maxLength 4000
  - `supplyConstraint`: text, label 「공급 제약」, maxLength 4000
  - `resolutionPath`: text, label 「해소 경로」, maxLength 4000, description 「증설, 대체 기술처럼 병목이 풀릴 길」
  - `expectedResolution`: string, label 「예상 해소 시점」, maxLength 64, description 「예: 2027년 하반기. 모르면 비워 둔다」
  - `description`: text, label 「메모」, maxLength 4000
- `Valuation`
  - `title`: string, label 「이름」, required, maxLength 200, description 「예: FLNC 2026-09-14」
  - `asOf`: date, label 「기준일」, description 「평가한 날. 모르면 비워 둔다」
  - `currentPrice`: number, label 「현재가」, required, min 0, description 「기준일의 주가」
  - `currency`: enum, label 「통화」, values `[KRW, USD, JPY, CNY, TWD, HKD, EUR, GBP]`, valueLabels 는 `Security.currency` 와 같은 문구
  - `method`: enum, label 「방법」, values `[PER, PBR, EV_SALES, EV_EBITDA, DCF, REVERSE_DCF, OTHER]`, valueLabels `{ PER: PER, PBR: PBR, EV_SALES: EV/매출, EV_EBITDA: EV/EBITDA, DCF: DCF, REVERSE_DCF: 역DCF, OTHER: 기타 }`
  - `description`: text, label 「메모」, maxLength 4000
- `Scenario`
  - `title`: string, label 「이름」, required, maxLength 200, description 「예: FLNC 비관」
  - `kind`: enum, label 「종류」, required, values `[BEAR, BASE, BULL]`, valueLabels `{ BEAR: 비관, BASE: 기준, BULL: 낙관 }`
  - `valuePerShare`: number, label 「주당 가치」, required, min 0, description 「밸류에이션과 같은 통화. 범위로 받았으면 중간값을 넣고 범위는 메모에 적는다」
  - `assumptions`: text, label 「핵심 가정」, maxLength 4000
  - `description`: text, label 「메모」, maxLength 4000
- `Decision`
  - `title`: string, label 「이름」, required, maxLength 200, description 「예: FLNC 첫 매수」
  - `action`: enum, label 「행동」, required, values `[WATCH, BUY, ADD, TRIM, EXIT, HOLD]`, valueLabels `{ WATCH: 관심 등록, BUY: 매수, ADD: 추가 매수, TRIM: 일부 매도, EXIT: 전량 매도, HOLD: 보류 }`
  - `decidedAt`: date, label 「결정일」, description 「모르면 비워 둔다」
  - `reason`: text, label 「이유」, maxLength 4000

### 2. 같은 파일의 `relationshipTypes` 에 관계 여덟을 더한다

`RELATED_TO` 뒤에 둔다. 모두 `createPicker` 를 둔다.

| 키 | label | from | to | createPicker.label |
| --- | --- | --- | --- | --- |
| `CREATES` | 만든다 | `[Change]` | `[Bottleneck]` | 이 병목을 만든 변화 |
| `HAS_BOTTLENECK` | 병목이 있다 | `[Sector]` | `[Bottleneck]` | 병목이 있는 산업 |
| `BENEFITS` | 이익을 준다 | `[Bottleneck]` | `[Company]` | 이익을 가져가는 병목 |
| `HAS_VALUATION` | 밸류에이션 | `[Company]` | `[Valuation]` | 평가한 기업 |
| `HAS_SCENARIO` | 시나리오 | `[Valuation]` | `[Scenario]` | 시나리오가 속한 밸류에이션 |
| `HAS_DECISION` | 결정 | `[Security]` | `[Decision]` | 결정한 종목 |
| `BASED_ON` | 결정의 근거 | `[Valuation]` | `[Decision]` | 결정에 쓴 밸류에이션 |
| `EVIDENCED_BY` | 근거 자료 | `[Change, Bottleneck, Valuation]` | `[Document]` | 이 자료가 근거인 항목 |

각 관계의 `description` 은 「변화가 병목을 만든다.」 처럼 시작에서 끝으로 읽는 한 문장이다. 새 키가 기존 관계, 주장 관계(`SUBJECT`, `OBJECT`, `SUPPORTED_BY`)와 겹치지 않는지 `git grep -n "CREATES:\|HAS_BOTTLENECK:\|BENEFITS:\|HAS_VALUATION:\|HAS_SCENARIO:\|HAS_DECISION:\|BASED_ON:\|EVIDENCED_BY:" financial-workbench` 로 확인한다.

### 3. 타입 수와 목록을 고정한 API 테스트를 고친다

- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt:70` 의 `schemaVersion` 단언을 `2.0.0` 으로 바꾼다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt:71` 의 `containsExactlyInAnyOrder(...)` 에 새 타입 다섯을 더한다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt:141` 의 `hasSize(7)` 을 `hasSize(12)` 로 바꾼다. 같은 파일에 새 타입의 enum 이 모두 `valueLabels` 를 갖는지 확인하는 테스트가 이미 있으면 그대로 통과하는지 본다.

- 같은 파일에서 새 관계 여덟의 `from`, `to`, `createPicker.label` 이 작업 항목 2의 표와 같은지 단언한다. `HAS_BOTTLENECK` 과 `EVIDENCED_BY` 도 포함한다.

### 4. 사슬 관계를 확인하는 API 테스트를 더한다

`financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` 에 테스트 하나를 더한다. `support/Fixtures.kt` 의 `node(type, properties)` 로 `Change`, `Bottleneck`, `Company`, `Security`, `Valuation`, `Scenario`, `Decision` 을 만들고 `POST /api/relationships` 로 여덟 관계 가운데 `CREATES`, `BENEFITS`, `HAS_VALUATION`, `HAS_SCENARIO`, `HAS_DECISION`, `BASED_ON` 을 만든다.

- 정상: 각 요청이 성공하고 `GET /api/nodes/{Decision id}` 의 `relationships` 에 `HAS_DECISION`, `BASED_ON` 이 있다.
- 실패: 방향을 뒤집은 `CREATES`(from Bottleneck, to Change)는 `400 ONTOLOGY_VIOLATION` 이다. 기존 `ISSUES` 끝 타입 검사(같은 파일 62행 근처)와 같은 단언 방식을 쓴다.
- 실패: `Scenario` 를 `valuePerShare` 없이 만들면 `400` 이다.

### 5. 브라우저 테스트를 고치고 사슬 만들기 흐름을 더한다

- `financial-workbench/web/e2e/workbench.spec.ts:201` 의 만들기 타입 선택지 목록과 `toHaveCount(8)` 을 새 YAML 순서(기존 여섯, 새 다섯, 주장)에 맞춘다. 순서는 YAML 의 `nodeTypes` 순서다. `managedBy` 가 있는 주장은 맨 끝에 붙는다(`web/src/components/SearchPanel.tsx`).
- 같은 파일에 새 테스트 「투자 논리 사슬을 만들고 결정에서 변화까지 따라간다」 를 더한다. 파일의 `suffix` 를 붙인 이름으로 변화, 병목, 기업, 종목(발행 기업 고르기), 밸류에이션(평가한 기업), 시나리오(시나리오가 속한 밸류에이션), 결정(결정한 종목, 결정에 쓴 밸류에이션)을 차례로 만든다. 고르기는 기존 `pick(page, 'create-link-<관계>-picker', 이름)` 도우미를 쓴다.
  - 정상: 결정 상세의 관계 목록에 종목과 밸류에이션이 보이고, 그래프의 이웃 확장으로 변화 이름이 보인다. 화면을 `shot(page, '13a-investment-chain')` 으로 남긴다.
  - 실패: 시나리오 폼에서 주당 가치를 비우고 저장하면 칸 아래 오류가 보이고 저장되지 않는다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun
cd financial-workbench/web && npm run typecheck && npm test && npm run build
cd financial-workbench && bash scripts/tests/test_scripts.sh
cd financial-workbench && COMPOSE_PROJECT_NAME=plan013-p1-verify NEO4J_PASSWORD=e2e-local-password COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && COMPOSE_PROJECT_NAME=plan013-p1-verify COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- `web/test-results/screenshots/13a-investment-chain.png` 를 열어 사슬이 보이는지 본다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
