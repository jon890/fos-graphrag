# Phase 01. 온톨로지 목록과 만들기 폼 정보, 예전 값 정리

**Execution profile**: standard

## 목표

Company 의 `country` 와 Security 의 `currency` 를 목록 선택(enum)으로 바꾸고, 예전 표기를 API 시작 때 목록 값으로 고친다.
온톨로지에 만들기 폼과 목록이 쓸 정보(`hintProperties`, `createPicker`)와 예전 값 별칭(`valueAliases`)을 더하고, 로더가 그 값을 시작할 때 검사한다.
다음 phase 의 만들기 폼과 그 다음 phase 의 충돌 화면이 이 정의를 읽는다.

**범위 외**: 웹 화면은 phase 02 와 phase 03 이다. 이 phase 는 `financial-workbench/web/src/` 를 고치지 않는다. 브라우저 테스트의 기대 문구 한 곳만 고친다(작업 항목 6).

## 컨텍스트

- 온톨로지 파일은 `financial-workbench/ontology/financial-ontology.yaml` 이다. 지금 `schemaVersion` 은 `"1.1.0"` 이다.
  - `Company.properties.country` 는 `{ type: string, label: 국가, required: false, maxLength: 2, description: "두 글자 국가 코드. 예: KR, US" }` 다.
  - `Security.properties.currency` 는 `{ type: string, label: 거래 통화, required: false, maxLength: 3, description: "세 글자 통화 코드. 예: KRW, USD" }` 다.
  - enum 속성은 `values` 와 `valueLabels` 를 블록 표기로 적는다. `Security.market` 이 그 예다.
  - `relationshipTypes.ISSUES` 는 `label`, `description`, `from: [Company]`, `to: [Security]` 다.
  - 같은 파일 머리 주석이 흐름 표기 안의 쉼표와 콜론을 따옴표로 감싸라고 적는다. `₩`, `$` 같은 기호가 든 별칭도 큰따옴표로 감싼다.
- 모델은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` 다. `NodeTypeDef`, `PropertyDef`, `RelationshipTypeDef` 는 YAML 키와 같은 이름의 필드를 가진 data class 다. `NodeTypeDef`, `PropertyDef` 에는 `@JsonInclude(JsonInclude.Include.NON_NULL)` 이 붙어 있다.
- 로더 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` 는 `FAIL_ON_UNKNOWN_PROPERTIES` 를 켜 두었다. 새 YAML 키는 모델에 필드가 있어야 읽힌다. `checkConsistency(o)` 가 시작할 때 정의를 검사하고, `valueLabels` 의 키가 `values` 밖이면 `require` 로 멈춘다. 같은 자리에 새 검사를 더한다.
- `OntologyValidator`(`ontology/OntologyValidator.kt`)의 `validatePatch` 는 요청에 든 칸만 검사한다. 그래서 목록 밖 값이 남아도 다른 칸은 고칠 수 있다. enum 은 `values` 에 정확히 같은 값만 받는다.
- 시작 순서는 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` 의 `afterSingletonsInstantiated()` 다. 지금은 `initialize()` 다음에 `bootstrapAdmin.ifAvailable { it.ensureAdmin() }` 를 부른다. `BootstrapAdmin` 은 `ObjectProvider` 로 받는다.
- 노드 갱신은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/RevisionGuard.kt` 의 `lockNode(id)`, `unlockNode(id)`, `updateNode(id, set, actorId)` 다. `updateNode` 는 `revision` 을 1 올리고 `updatedAt`, `updatedBy` 를 쓰고 `_lock` 을 지운 뒤 갱신된 속성을 돌려준다. `NodeService.patch` 가 쓰는 순서(잠금, 확인, 갱신, 이력)를 따른다.
- 이력은 `history/ChangeEventRecorder.kt` 의 `ChangeEventDraft(actorId, action, targetId, targetKind, targetType, targetLabel, revision, changes, note)` 와 `diff(before, after)` 로 남긴다. 서버가 남기는 이력의 작업자는 `BootstrapAdmin.SYSTEM_ACTOR`(`"system"`)다.
- 쓰기 트랜잭션은 `@Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)` 를 붙인다(`NodeService` 의 각 함수).
- 온톨로지 단위 테스트는 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` 다. `minimal(nameProperty)` 도우미가 Company 하나만 있는 YAML 을 만든다. 로더 오류는 `assertThatThrownBy { OntologyLoader.load(yaml.byteInputStream()) }.isInstanceOf(IllegalArgumentException::class.java)` 로 확인한다.
- 통합 테스트는 `support/IntegrationTest.kt` 를 상속하고 `neo4j: Neo4jClient` 와 `loggedIn(ALICE)` 를 쓴다. 합성 데이터는 `support/Fixtures.kt` 의 `company(name)`(country `KR`), `security(name, ticker)` 다. 이름 끝에 `-<suffix>` 가 붙는다. 같은 컨테이너를 여러 테스트가 함께 쓰므로 정리를 확인할 때는 그 테스트가 만든 id 만 본다.
- 기존 테스트가 쓰는 국가 값은 `KR`, `US`, `JP` 이고 통화는 `KRW` 다(`NodeWriteIntegrationTest`, `TransactionConsistencyIntegrationTest`, `ReviewFixIntegrationTest`, `RoleAndUserAdminIntegrationTest`, `OntologyValidatorTest`). 모두 새 목록 안이라 바꿀 것이 없다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts` 의 `0e)` 테스트가 기업 만들기 폼에 「두 글자 국가 코드. 예: KR, US」 가 보이는지 확인한다. 도움말이 바뀌므로 이 줄을 고친다. `createNode` 도우미는 칸이 `SELECT` 면 `selectOption` 을 쓰므로 `country: 'KR'`, `currency: 'KRW'` 입력은 그대로 통한다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「만들기 폼과 구분 정보」, 「예전 값 정리」 절과 노드 표 아래 국가와 통화 문장, `financial-workbench/docs/api-contract.md` 의 「온톨로지」 절, `financial-workbench/docs/code-architecture.md` 의 「API 패키지」 표와 「결정」 의 예전 값 정리 항목

## 의도 메모

- 별칭을 Kotlin 상수로 두는 안은 버렸다. 표시 이름과 선택지를 YAML 이 소유한다는 규칙(ADR-005)과 어긋나고, 다음에 enum 을 더할 때 코드를 함께 고쳐야 한다.
- 보관된 노드와 `managedBy` 가 있는 타입(Claim)은 정리하지 않는다. 보관된 노드는 수정할 수 없다는 규칙과 검토 규칙의 `contentUpdatedBy` 를 지키기 위해서다.
- 정리는 `searchText` 를 다시 만들지 않는다. 정리 대상은 enum 속성이고 `searchText` 는 `labelProperty` 와 `ticker` 로만 만든다. Claim 의 `labelProperty`(`predicate`)가 enum 이지만 Claim 은 대상이 아니다.
- 국가에는 「기타」(`OTHER`)를 두고 통화에는 두지 않는다(사용자 결정 2026-10-21). enum 은 `maxLength` 를 쓰지 않으므로 두 속성에서 지운다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `financial-workbench/ontology/financial-ontology.yaml`

- `schemaVersion` 을 `"1.2.0"` 으로 올린다.
- 머리 주석의 표시 이름 목록 아래에 세 줄을 더한다.
  - `valueAliases: enum 속성의 예전 표기. API 가 시작할 때 목록 밖 값을 이 표를 보고 고친다. docs/data-schema.md 의 「예전 값 정리」.`
  - `hintProperties: 검색 결과와 고르기 후보에서 이름 옆에 함께 보일 속성.`
  - `createPicker: 끝(to) 타입 만들기 폼에 시작(from) 노드를 고르는 칸을 더한다.`
- `Company.country` 를 블록 표기의 enum 으로 바꾼다.

  | 키 | 값 |
  | --- | --- |
  | `values` | `[KR, US, JP, CN, TW, HK, NL, DE, GB, FR, OTHER]` |
  | `valueLabels` | `KR: 대한민국 (KR)`, `US: 미국 (US)`, `JP: 일본 (JP)`, `CN: 중국 (CN)`, `TW: 대만 (TW)`, `HK: 홍콩 (HK)`, `NL: 네덜란드 (NL)`, `DE: 독일 (DE)`, `GB: 영국 (GB)`, `FR: 프랑스 (FR)`, `OTHER: 기타` |
  | `valueAliases` | `KR: [한국, 대한민국, 남한, KOR, Korea, South Korea]`, `US: [미국, USA, United States]`, `JP: [일본, JPN, Japan]`, `CN: [중국, CHN, China]`, `TW: [대만, TWN, Taiwan]`, `HK: [홍콩, HKG, Hong Kong]`, `NL: [네덜란드, NLD, Netherlands]`, `DE: [독일, DEU, Germany]`, `GB: [영국, GBR, UK, United Kingdom]`, `FR: [프랑스, FRA, France]` |
  | `label`, `required` | 지금 값(`국가`, `false`) |
  | `description` | `기업이 등록된 나라` |

  `valueLabels` 값에 괄호와 공백이 들어 있으므로 흐름 표기로 쓰면 값마다 큰따옴표로 감싼다.
- `Security.currency` 를 같은 방식으로 바꾼다.

  | 키 | 값 |
  | --- | --- |
  | `values` | `[KRW, USD, JPY, CNY, TWD, HKD, EUR, GBP]` |
  | `valueLabels` | `KRW: 원 (KRW)`, `USD: 미국 달러 (USD)`, `JPY: 엔 (JPY)`, `CNY: 위안 (CNY)`, `TWD: 대만 달러 (TWD)`, `HKD: 홍콩 달러 (HKD)`, `EUR: 유로 (EUR)`, `GBP: 파운드 (GBP)` |
  | `valueAliases` | `KRW: [원, 원화, "₩", 한국 원]`, `USD: [달러, 미국 달러, 미화, "$", "US$"]`, `JPY: [엔, 엔화, "¥"]`, `CNY: [위안, 위안화, RMB]`, `TWD: [대만 달러, "NT$"]`, `HKD: [홍콩 달러, "HK$"]`, `EUR: [유로, "€"]`, `GBP: [파운드, "£"]` |
  | `label`, `required` | 지금 값(`거래 통화`, `false`) |
  | `description` | `종목이 거래되는 통화` |
- 노드 타입마다 `hintProperties` 를 더한다. Company `[country]`, Security `[market, ticker]`, Sector `[scheme, code]`, Document `[publisher, publishedAt]`. Claim 에는 두지 않는다.
- `relationshipTypes.ISSUES` 에 `createPicker: { label: 발행 기업, description: "이 종목을 발행한 기업. 고르면 종목을 만든 뒤 발행 관계를 함께 만든다. 몰라도 비워 둘 수 있다" }` 를 더한다.

### 2. `Ontology.kt` 와 `OntologyLoader.kt`

- `PropertyDef` 에 `valueLabels` 다음 필드로 `/** enum 값의 예전 표기. 키는 [values] 안에 있어야 한다. 시작할 때 목록 밖 값을 고치는 데 쓴다 */ val valueAliases: Map<String, List<String>>? = null` 을 더한다.
- `NodeTypeDef` 에 `/** 검색 결과와 고르기 후보에서 이름 옆에 함께 보일 속성 */ val hintProperties: List<String> = emptyList()` 를 더한다.
- `RelationshipTypeDef` 에 `/** 끝(to) 타입 만들기 폼에 시작(from) 노드를 고르는 칸. 없으면 칸이 없다 */ val createPicker: CreatePickerDef? = null` 을 더하고, 같은 파일에 아래 class 를 둔다.

  ```kotlin
  @JsonInclude(JsonInclude.Include.NON_NULL)
  data class CreatePickerDef(
      val label: String,
      val description: String? = null,
  )
  ```
- `PropertyDef` 에 순수 함수를 둔다. 로더 검사와 정리가 같은 규칙을 쓴다.

  ```kotlin
  /**
   * 목록 밖 enum 값을 목록 값으로 바꾼다. 앞뒤 공백과 대소문자를 무시하고 values 나 valueAliases 와 비교한다.
   * 이미 목록 값이면 그대로, 공백뿐이면 null(속성을 지운다), 어디에도 맞지 않으면 원래 값을 돌려준다.
   */
  fun canonicalEnumValue(raw: String): String?
  ```
- `OntologyLoader.checkConsistency` 의 속성 반복 안에 검사를 더한다. 메시지 형식은 기존 `valueLabels` 검사와 같게 `"$name.$prop ..."` 로 쓴다.
  - `valueAliases` 의 키가 `values` 밖이면 멈춘다.
  - 한 속성 안의 별칭을 `trim().lowercase()` 로 모았을 때 겹치거나, 어떤 별칭이 그 속성의 `values` 가운데 하나와 같으면 멈춘다. 메시지에 겹친 별칭을 넣는다.
  - `valueAliases` 가 enum 이 아닌 속성에 있으면 멈춘다.
- 노드 타입 반복 안에서 `hintProperties` 가 그 타입의 `properties` 에 없으면 `"$name 의 hintProperties 가 속성에 없는 이름을 가리킨다: ..."` 로 멈춘다.

### 3. `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/LegacyValueCleanup.kt` 신규

```kotlin
/**
 * 목록 밖 enum 값을 온톨로지의 values 와 valueAliases 로 고친다. docs/data-schema.md 의 「예전 값 정리」.
 * 보관된 노드와 managedBy 가 있는 타입은 건드리지 않는다. 고친 노드마다 system 작업자로 UPDATE 이력을 남긴다.
 */
@Component
class LegacyValueCleanup(
    private val client: Neo4jClient,
    private val ontology: Ontology,
    private val guard: RevisionGuard,
    private val recorder: ChangeEventRecorder,
) {
    /** 고친 노드 수를 돌려준다. 여러 번 불러도 결과가 같다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun run(): Int
}
```

- 대상은 `managedBy == null` 인 노드 타입의 enum 속성이다. 타입마다 아래 쿼리로 후보 id 를 읽는다. 타입 이름은 `ontology.nodeTypes` 의 키라 허용 목록 안이다.

  ```cypher
  MATCH (n:Knowledge)
  WHERE n.type = $type AND n.archived = false
    AND any(p IN $props WHERE n[p] IS NOT NULL AND NOT n[p] IN $allowed[p])
  RETURN n.id AS id ORDER BY id
  ```
  `$props` 는 그 타입의 enum 속성 이름 목록, `$allowed` 는 `{속성: values}` 맵이다. enum 속성이 없는 타입은 건너뛴다.
- 후보마다 `guard.lockNode(id)` 로 잠그고 다시 읽은 값으로 판정한다. 잠근 뒤 `archived == true` 면 `guard.unlockNode(id)` 하고 건너뛴다.
  - 속성마다 값이 문자열이고 `values` 밖이면 `canonicalEnumValue` 를 부른다. 결과가 원래 값과 다를 때만 `changes[속성] = 결과` 다(결과 `null` 은 지우기).
  - `changes` 가 비면 `guard.unlockNode(id)` 하고 넘어간다.
  - 있으면 `guard.updateNode(id, changes, BootstrapAdmin.SYSTEM_ACTOR)` 뒤에 `ChangeEventDraft(BootstrapAdmin.SYSTEM_ACTOR, ChangeAction.UPDATE, id, TargetKind.NODE, type, ontology.labelOf(type, after), revision, diff(before, changes), "온톨로지 목록에 맞춰 예전 값을 고쳤다")` 를 남긴다. `revision` 은 `(after["revision"] as Number).toLong()` 이다.
- 고친 노드가 하나 이상이면 `LoggerFactory.getLogger` 로 `info` 한 줄(고친 노드 수)을 남긴다. 속성 값은 로그에 쓰지 않는다.

### 4. `Neo4jSchemaInitializer.kt` 의 시작 순서

- 생성자에 `private val legacyValueCleanup: LegacyValueCleanup` 을 더한다.
- `afterSingletonsInstantiated()` 는 `initialize()`, `legacyValueCleanup.run()`, `bootstrapAdmin.ifAvailable { it.ensureAdmin() }` 순서로 부른다. 클래스 주석의 「제약 조건과 인덱스를 만든다」 아래에 「그다음 목록 밖 enum 값을 고친다(`LegacyValueCleanup`)」 를 더한다.
- `ReviewFixIntegrationTest` 는 이 빈을 `@Autowired` 로 받아 `initialize()` 만 부르므로 고칠 것이 없다.

### 5. 이 phase 를 검증하는 테스트

- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt`
  - 「저장되는 값은 표시 이름과 상관없이 그대로다」 에 국가와 통화 목록을 더한다. `country.values` 가 작업 항목 1 의 11개와 같고, `valueLabels["KR"]` 이 `대한민국 (KR)`, `currency.valueAliases?.get("KRW")` 에 `원` 이 든다.
  - 새 테스트 「목록 밖 값은 공백, 대소문자, 별칭으로 목록 값에 맞춘다」: 기본 온톨로지의 `currency` 로 `" 원 "` 이 `KRW`, `"usd"` 가 `USD`, `"   "` 이 `null`, `"KRW"` 가 `KRW`, `"루피"` 가 `루피` 인지 본다.
  - 새 테스트 「별칭과 구분 정보가 잘못되면 읽지 않는다」: `minimal(...)` 로 세 YAML 을 만든다. 키가 `values` 밖인 `valueAliases`(`{ type: enum, values: [A], valueAliases: { B: [b] } }`), 두 값에 같은 별칭(`{ type: enum, values: [A, B], valueAliases: { A: [x], B: [" X "] } }`), enum 이 아닌 속성의 별칭(`{ type: string, valueAliases: { A: [a] } }`)은 모두 `IllegalArgumentException` 이다. `hintProperties: [nope]` 는 `minimal` 의 Company 아래에 줄을 더한 문자열로 만들고 `nope` 이 메시지에 든다.
  - 새 테스트 「발행 관계는 종목 만들기 폼에 발행 기업 칸을 둔다」: `ontology.relationshipTypes.getValue("ISSUES").createPicker?.label` 이 `발행 기업` 이다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/LegacyValueCleanupIntegrationTest.kt` 신규. `IntegrationTest` 를 상속하고 `@Autowired lateinit var cleanup: LegacyValueCleanup` 을 받는다.
  - 「목록 밖 국가와 통화를 고치고 system 이력을 남긴다」: `Fixtures(loggedIn(ALICE))` 로 기업과 종목을 만든 뒤 `neo4j` 로 기업 `country` 를 `" 한국 "`, 종목 `currency` 를 `"원"` 으로 직접 바꾼다(`MATCH (n:Knowledge {id: $id}) SET n.country = $v`). `cleanup.run()` 이 2 이상이다. 두 노드의 값이 `KR`, `KRW` 이고 revision 이 2 다. `/api/changes?targetId=<id>` 의 첫 항목이 `UPDATE`, `actor` 가 비어 있고 `note` 가 「온톨로지 목록에 맞춰 예전 값을 고쳤다」, `changes.country.before` 가 `" 한국 "` 이다.
  - 「다시 돌려도 바꾸지 않고, 맞지 않는 값과 보관된 노드는 그대로 둔다」: 기업 하나는 `country` 를 `"루피아"` 로, 다른 기업은 `"한국"` 으로 바꾸고 `archived = true` 로 둔다. `run()` 뒤 두 노드의 값과 revision 이 그대로다. 앞 테스트에서 고친 노드도 두 번째 `run()` 에서 revision 이 오르지 않는다. 같은 컨테이너의 다른 테스트 데이터가 있으므로 반환값이 아니라 이 테스트가 만든 노드의 값과 revision 으로 판정한다.
  - 이력 응답(`history/ChangeController.kt`)의 `actor` 는 `users.findRefs` 로 찾은 `UserRef?` 라서 `system` 이면 비어 있다. `latest["actor"] == null || latest["actor"].isNull` 로 본다. `note` 는 `latest["note"].asString()` 이다.

### 6. 브라우저 테스트의 도움말 문구

`financial-workbench/web/e2e/workbench.spec.ts` 의 `0e)` 에서 `toContainText('두 글자 국가 코드. 예: KR, US')` 를 `toContainText('기업이 등록된 나라')` 로 바꾸고, 그 다음 줄에 국가 선택지 확인을 더한다.

```ts
await expect(pageAdmin.getByTestId('create-prop-country').locator('option[value="KR"]')).toHaveText('대한민국 (KR)')
```

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.ontology.OntologyLabelsTest' --tests 'dev.fos.workbench.knowledge.LegacyValueCleanupIntegrationTest'
cd financial-workbench/api && ./gradlew test
grep -q 'valueAliases' financial-workbench/ontology/financial-ontology.yaml
grep -q 'legacyValueCleanup.run()' financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan007 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && npm ci && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan007 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 전체 `./gradlew test` 가 통과해야 한다. 기존 통합 테스트의 국가와 통화 값은 새 목록 안이다.
- 브라우저 테스트 두 project 가 모두 통과해야 한다. 웹은 이 phase 에서 바뀌지 않았으므로 국가와 통화가 선택 칸으로 보이는 것은 `PropertyFields` 가 enum 을 이미 선택 칸으로 그리기 때문이다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/LegacyValueCleanup.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/LegacyValueCleanupIntegrationTest.kt` | 신규 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
