# Phase 01. 토큰 범위, 예약 이름, 주인 전용 체결 기록과 `/api/me/trades`

**Execution profile**: deep

## 목표

연동 토큰에 범위(`READ`, `READ_WRITE`)를 더하고, 주인만 보는 체결 기록 `(:User)-[:OWNS]->(:Trade)` 의 저장소와 서비스(멱등 저장, 종목 잇기, 조회, 지우기), 세션 API `GET/DELETE /api/me/trades` 를 만든다. 체결이 지식 조회 어디에도 나오지 않음을 통합 테스트로 확인한다.

**범위 외**: 제안(phase 02), `/api/v1` 쓰기 경로와 쓰기 요청 한도(phase 03), 화면(phase 04, 05). 이 phase 에서 체결은 서비스 메서드로만 저장한다(테스트가 직접 부른다).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「체결 기록」, 「연동 토큰」(`scope`), 「코드가 소유하는 이름」, 「사용자를 지울 때」, 「제약 조건과 인덱스」, `financial-workbench/docs/api-contract.md` 의 「내 체결」, 「연동 토큰」, 「역할」, `financial-workbench/docs/adr/013-owner-trades-and-agent-proposals.md`, `financial-workbench/docs/code-architecture.md` 의 「API 패키지」(`trade`).

경로는 모두 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/` 아래다(테스트는 `.../src/test/kotlin/dev/fos/workbench/`).

- 연동 토큰: `agent/IntegrationTokenRepository.kt`(`IntegrationTokenView`, `IssueTokenRequest`, `ActiveToken`, `create`, `findActiveByHash`), `agent/IntegrationTokenService.kt`(`issue`, `authenticate`), `agent/AgentPrincipal.kt`.
- 사용자 잠금 패턴: `IntegrationTokenRepository.countActiveLocked` 가 `MATCH (u:User {id}) SET u._lock = true` 로 잠그고 `create` 가 `REMOVE u._lock` 한다. 체결 저장도 같은 패턴이다.
- 시장 변환: `agent/v1/SecurityLookupService.kt` 의 companion `MARKETS`, `MARKET_MESSAGE`, `MAX_TICKER`(private). 체결이 같은 규칙을 쓰므로 공용 객체로 옮긴다.
- 제약 조건: `config/Neo4jSchemaInitializer.kt` 의 `STATEMENTS` 목록(`IF NOT EXISTS` 문자열).
- 예약 이름: `ontology/OntologyLoader.kt` 의 `RESERVED_PROPERTIES` 와 그 일관성 검사(156행 근처 `add("... 시스템 속성 이름을 ...")`). 같은 자리에 노드 타입과 관계 종류 검사를 더한다.
- 시각: `config/Timestamps.kt`(`now()`, `system(Instant)`). 사용자가 넣는 `datetime` 은 초까지 고정 자릿수 UTC 다(`OntologyValidator` 의 `datetime` 처리를 참고한다).
- 오류: `web/ApiError.kt` 의 `ValidationFailedException`, `NotFoundException`. 페이지: `web/Paging.kt` 의 `PageQuery.of`, `Page`.
- 세션 주인: 컨트롤러는 `@AuthenticationPrincipal user: WorkbenchPrincipal` 의 `user.id` 만 쓴다(`agent/IntegrationTokenController.kt`). `/api/me/**` 는 이미 `hasRole("VIEWER")` 다(`config/SecurityConfig.kt`).
- 노드 표현: `knowledge/Dtos.kt` 의 `NodeRef(id, type, label, archived)`. 이름은 `OntologyHolder.current().labelOf(type, props)`.
- 테스트 기반: `support/IntegrationTest.kt`(`loggedIn(email)`, `newUser(role)`, `ALICE`, `BOB`, `ADMIN`, `VIEWER`), `support/Fixtures.kt`(`node(type, properties)`, `security(name, ticker)` 는 시장이 `KRX_KOSPI` 로 고정, `race(vararg calls: () -> ApiClient.Response)` 는 HTTP 호출만 받는다), `support/ApiClient.kt`.

## 의도 메모

- `:Trade` 에 `:Knowledge` label 을 붙이지 않는다. 기존 조회가 `:Knowledge` 로 노드를 고르므로 고치지 않아도 빠진다. 체결과 그 관계에 `archived` 속성을 두지 않아 주변 그래프의 경로 조건에도 걸린다.
- 저장은 「주인 노드 잠금 → 항목마다 `MERGE (t:Trade {ownerId, broker, externalId})`」 다. `ON CREATE SET` 으로 나머지 값과 `t._new = true` 를 쓰고, 돌려받은 뒤 `REMOVE t._new` 로 새로 만든 것인지 가른다. 이미 있으면 값을 고치지 않는다.
- 저장 요청은 전부 또는 전무다. 서비스는 먼저 모든 항목을 검사하고, 하나라도 틀리면 아무것도 쓰지 않고 `ValidationFailedException(mapOf("trades[i].칸" to 사유))` 를 던진다.
- 모르는 필드(계좌 번호 등)를 거절하려고 입력은 `Map<String, Any?>` 로 받아 키를 대조한다. 전역 Jackson 설정(`FAIL_ON_UNKNOWN_PROPERTIES`)은 바꾸지 않는다. 다른 API 의 동작이 바뀌기 때문이다.
- 범위가 없는 기존 토큰은 `READ` 다. `scope` 속성을 채워 넣는 이전 작업은 하지 않는다.
- ADMIN 도 남의 체결을 보지 않는다. 체결 조회는 역할을 보지 않고 세션 사용자 id 로만 찾는다.

## 작업 항목

### 1. `agent/TokenScope.kt`(신규)와 토큰 저장소, 서비스

```kotlin
/** 연동 토큰 범위. 속성이 없는 예전 토큰은 READ 다(docs/data-schema.md 「연동 토큰」) */
enum class TokenScope { READ, READ_WRITE; companion object { fun parse(value: String?): TokenScope? } }
```

- `IssueTokenRequest(name: String? = null, scope: String? = null)`. `issue` 는 `scope` 가 `null` 이나 빈 문자열이면 `READ`, 두 값 밖이면 `ValidationFailedException(mapOf("scope" to "READ, READ_WRITE 가운데 하나여야 합니다."))`.
- `IntegrationTokenRepository.create(userId, name, scope, hash, last4)` 가 `scope` 를 저장한다. `IntegrationTokenView` 에 `scope: String` 을 더하고 `from` 은 속성이 없으면 `"READ"` 다. `ActiveToken` 과 `findActiveByHash` 도 `scope` 를 읽는다(`coalesce(t.scope, 'READ')`).
- `AgentPrincipal` 에 `scope: TokenScope` 를 더한다. `authenticate` 가 채운다.

### 2. `ontology/OntologyLoader.kt` 의 예약 이름

```kotlin
val RESERVED_NODE_TYPES = setOf("Knowledge", "User", "IntegrationToken", "Trade", "Proposal", "ChangeEvent", "OntologyVersion", "OntologyHead", "SeedRun")
val RESERVED_RELATIONSHIP_TYPES = setOf("OWNS", "KNOWS", "OF_SECURITY", "EXECUTES")
```

일관성 검사에 「`<이름>` 은 서버 코드가 쓰는 이름이라 노드 타입(관계 종류)으로 쓸 수 없다」 오류를 더한다. 저장소 YAML 과 시드는 이 이름을 쓰지 않는다(`git grep -n "Trade\|Proposal\|OF_SECURITY\|EXECUTES" financial-workbench/ontology` 결과가 비어야 한다).

### 3. `trade/SecurityMarkets.kt`(신규)

`SecurityLookupService` 의 `MARKETS`, `MARKET_MESSAGE`, `MAX_TICKER` 를 옮긴다.

```kotlin
object SecurityMarkets {
    const val MAX_TICKER = 32
    const val MESSAGE = "KR, US, KOSPI, ... 가운데 하나여야 합니다."
    /** 대문자로 바꾼 시장 값의 워크벤치 시장 목록. 모르는 값이면 null */
    fun workbenchMarkets(market: String): List<String>?
}
```

`SecurityLookupService` 는 이것을 부른다. 종목 찾기의 동작과 오류 문구는 그대로다.

### 4. `trade/Trades.kt`(신규): 입력 검사와 표현

```kotlin
data class TradeInput(val broker: String, val externalId: String, val side: String, val market: String, val ticker: String, val name: String?,
                      val quantity: Double, val price: Double, val currency: String, val amount: Double, val fee: Double?, val executedAt: String)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class TradeView(val id: String, val broker: String, val externalId: String, val side: String, val market: String, val ticker: String,
                     val name: String?, val quantity: Double, val price: Double, val currency: String, val amount: Double, val fee: Double?,
                     val executedAt: String, val createdAt: String, val createdVia: String, val security: NodeRef?, val decisions: List<NodeRef>)

data class TradeSaveResult(val index: Int, val status: String /* created | existing */, val trade: TradeView)

object TradeInputs {
    /** 키 목록, 형식, 범위를 검사해 정규화한다. 틀리면 trades[i].칸 키로 모은 ValidationFailedException */
    fun parse(items: List<Map<String, Any?>>?, max: Int): List<TradeInput>
}
```

필드 규칙은 `docs/api-contract.md` 「에이전트 API」 의 「`POST /api/v1/trades`」 절과 같다. 목록이 없거나 비면 `trades`, 50건을 넘으면 `trades` 키의 오류다. 숫자는 `Number` 만 받는다(문자열 숫자는 거절). `executedAt` 은 `OffsetDateTime.parse` 로 읽어 `Instant` 를 초까지 자른 `YYYY-MM-DDTHH:MM:SSZ` 로 바꾼다. 오프셋이 없으면 거절한다.

상한 상수는 `config/Limits.kt` 에 더한다: `MAX_TRADES_PER_REQUEST = 50`, `MAX_PROPOSALS_PER_REQUEST = 20`, `MAX_PENDING_PROPOSALS = 200`, `DECIDED_PROPOSAL_RETENTION_DAYS = 90L`(뒤의 셋은 phase 02 가 쓴다).

### 5. `trade/TradeRepository.kt`(신규)

```kotlin
@Repository
class TradeRepository(private val client: Neo4jClient) {
    fun lockOwner(ownerId: String): Boolean                 // SET u._lock = true. 사용자가 없으면 false
    fun unlockOwner(ownerId: String)
    /** MERGE 로 하나 만들거나 찾는다. created 가 true 면 새로 만들었다 */
    fun merge(ownerId: String, input: TradeInput, tokenId: String?, createdVia: String): Pair<String, Boolean>
    /** 종목이 아직 없으면 markets 와 ticker 로 찾아 OF_SECURITY 를 만든다 */
    fun linkSecurityIfMissing(tradeId: String, markets: List<String>, ticker: String)
    fun views(ownerId: String, ids: List<String>): List<TradeView>       // 요청한 순서
    fun page(ownerId: String, filter: TradeFilter, page: PageQuery): Page<TradeView>
    fun delete(ownerId: String, tradeId: String): Boolean               // DETACH DELETE
}

data class TradeFilter(val securityId: String? = null, val decisionId: String? = null, val ticker: String? = null,
                       val from: String? = null, val to: String? = null)
```

- 모든 쿼리는 `MATCH (:User {id: $ownerId})-[:OWNS]->(t:Trade)` 로 시작한다. `ownerId` 속성만으로 찾지 않는다.
- `merge`: `MATCH (u:User {id: $ownerId}) MERGE (t:Trade {ownerId: $ownerId, broker: $broker, externalId: $externalId}) ON CREATE SET t += $props, t._new = true MERGE (u)-[:OWNS]->(t) WITH t, coalesce(t._new, false) AS created REMOVE t._new RETURN t.id AS id, created`. `props` 에 `id`(UUID), `createdAt = Timestamps.now()`, `createdVia`, `tokenId`(있을 때) 를 넣고 `name`, `fee` 는 `null` 이면 넣지 않는다.
- `linkSecurityIfMissing`: `MATCH (t:Trade {id}) WHERE NOT (t)-[:OF_SECURITY]->() CALL { MATCH (s:Knowledge:Security) WHERE s.archived = false AND toUpper(s.ticker) = $ticker AND s.market IN $markets RETURN s ORDER BY s.createdAt, s.id LIMIT 1 } MERGE (t)-[:OF_SECURITY]->(s)`.
- `views`, `page`: 종목은 `OPTIONAL MATCH (t)-[:OF_SECURITY]->(s:Knowledge)`, 결정은 `OPTIONAL MATCH (t)-[e:EXECUTES]->(d:Knowledge)` 를 `e.createdAt` 순서로 모은다. `NodeRef` 의 이름은 `OntologyHolder.current().labelOf`. 정렬은 `t.executedAt DESC, t.id`. `filter.ticker` 는 `toUpper(t.ticker) = toUpper($ticker)`, `from`, `to` 는 `t.executedAt >= $from`, `< $to`(UTC 초 문자열 비교).

### 6. `trade/TradeService.kt`(신규)

```kotlin
@Service
class TradeService(...) {
    /** 주인 노드를 잠그고 항목 순서대로 merge 와 종목 잇기를 한다. 같은 요청 안의 같은 체결은 뒤의 것이 existing 이다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun save(ownerId: String, items: List<Map<String, Any?>>?, tokenId: String?): List<TradeSaveResult>
    @Transactional(readOnly = true)
    fun list(ownerId: String, filter: TradeFilter, page: PageQuery): Page<TradeView>
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun delete(ownerId: String, tradeId: String)   // 없으면 NotFoundException
}
```

`save` 의 `createdVia` 는 `"AGENT"` 다. 저장 뒤 결과는 `views` 로 다시 읽어 돌려준다.

### 7. `trade/TradeController.kt`(신규)

`@RequestMapping("/api/me/trades")`: `GET`(쿼리 `securityId`, `decisionId`, `ticker`, `page`, `size`. `PageQuery.of`) 과 `DELETE /{id}`(`204`). 주인은 세션의 `user.id` 다.

### 8. `config/Neo4jSchemaInitializer.kt`

`STATEMENTS` 에 더한다.

```
CREATE CONSTRAINT trade_id_unique IF NOT EXISTS FOR (t:Trade) REQUIRE t.id IS UNIQUE
CREATE CONSTRAINT trade_owner_external_unique IF NOT EXISTS FOR (t:Trade) REQUIRE (t.ownerId, t.broker, t.externalId) IS UNIQUE
CREATE INDEX trade_owner_executed IF NOT EXISTS FOR (t:Trade) ON (t.ownerId, t.executedAt)
CREATE CONSTRAINT proposal_id_unique IF NOT EXISTS FOR (p:Proposal) REQUIRE p.id IS UNIQUE
CREATE CONSTRAINT proposal_owner_dedupe_unique IF NOT EXISTS FOR (p:Proposal) REQUIRE (p.ownerId, p.dedupeKey) IS UNIQUE
CREATE INDEX proposal_owner_status IF NOT EXISTS FOR (p:Proposal) ON (p.ownerId, p.status)
```

### 9. 이 phase 를 검증하는 테스트

`trade/TradeInputsTest.kt`(신규, Neo4j 없음): 정상 항목 하나가 정규화된다(`ticker` 대문자, `executedAt` 이 `+09:00` 에서 UTC 로). 실패: 모르는 필드 `accountNo` → `trades[0].accountNo`, `quantity = 0` → `trades[0].quantity`, `executedAt` 에 오프셋 없음 → `trades[0].executedAt`, 51건 → `trades`, `market = "XX"` → `trades[0].market`.

`ontology/OntologyLoaderReservedTest.kt`(신규, Neo4j 없음): 저장소 YAML 에 노드 타입 `Trade` 를 더한 정의와 관계 종류 `OWNS` 를 더한 정의가 각각 검사 오류를 낸다. 저장소 YAML 그대로는 통과한다.

`trade/TradeIntegrationTest.kt`(신규, `IntegrationTest` 상속). `TradeService` 를 주입받아 저장하고 세션 API 로 확인한다.

- 멱등: 같은 `(TOSS, "e1")` 를 두 번 `save` 하면 첫 결과 `created`, 두 번째 `existing`, `MATCH (t:Trade {ownerId}) RETURN count(t)` 가 1. 두 번째에 보낸 다른 `price` 는 저장되지 않는다. 한 요청 안의 같은 체결 둘은 `created`, `existing`.
- 동시: `support/Fixtures.kt` 에 더한 `raceAll` 로 두 스레드가 같은 체결을 동시에 `save` 하면 체결은 하나다. 두 호출 모두 예외 없이 끝나고 결과는 `created` 하나와 `existing` 하나다.
- 종목: `fixtures.node("Security", mapOf("market" to "NASDAQ", "ticker" to "T${fixtures.suffix}".uppercase(), "name" to "미국 종목-${fixtures.suffix}", "securityType" to "COMMON"))` 로 나스닥 종목을 만든 뒤 `market = "US"`, 같은 ticker 소문자로 저장하면 `security.id` 가 그 종목이다. 종목 없이 저장한 체결은 `security = null` 이고, 종목을 만든 뒤 같은 체결을 다시 보내면 이어진다.
- 세션 API: ALICE 의 `GET /api/me/trades` 는 자기 체결만, `securityId` 로 좁힌 결과가 맞다. BOB 과 ADMIN 의 `GET /api/me/trades` 에는 ALICE 의 체결이 없다. BOB 의 `DELETE /api/me/trades/{ALICE 체결}` 은 `404`, ALICE 는 `204` 이고 다시 읽으면 없다.
- 지식 조회에서 빠짐: ALICE 가 체결을 저장한 뒤 BOB 세션으로 `GET /api/nodes?q=<ticker>`, `GET /api/nodes/counts`(저장 전후 같은 값), `GET /api/nodes/{securityId}`(`relationships` 에 `OF_SECURITY` 없음), `GET /api/graph/neighborhood?id={securityId}&hops=2`(노드 수와 id 목록이 저장 전과 같음), `GET /api/nodes/{securityId}/trace`, `GET /api/changes?targetId={securityId}`(새 이력 없음) 를 확인한다. 응답 본문에 체결의 `externalId` 문자열이 들어 있지 않다.
- 사용자 삭제: `data-schema.md` 「사용자를 지울 때」 의 Cypher 를 테스트용 사용자(`newUser`)에 실행하면 그 사용자의 `:Trade` 가 0 이고 ALICE 의 체결은 남는다.

`support/Fixtures.kt`(수정): `race` 옆에 같은 방식(`CountDownLatch` 로 함께 출발, 60초 제한)의 `fun <T> raceAll(vararg calls: () -> T): List<T>` 를 더한다. 기존 `race` 는 그대로 둔다.

`agent/IntegrationTokenIntegrationTest.kt`(수정): 범위 없이 발급하면 `scope = "READ"`, `READ_WRITE` 로 발급하면 목록에도 `READ_WRITE`, `scope = "ADMIN"` 은 `400`(`fieldErrors.scope`). 테스트에서 `scope` 속성을 지운 토큰(`REMOVE t.scope`)도 목록에 `READ` 로 나온다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.trade.*' --tests 'dev.fos.workbench.ontology.*' --tests 'dev.fos.workbench.agent.*'
cd financial-workbench/api && ./gradlew test --rerun
! git grep -n "Trade\|Proposal\|OF_SECURITY\|EXECUTES" -- financial-workbench/ontology
```

- 첫 줄의 새 테스트와 수정한 테스트가 모두 통과한다. 둘째 줄의 전체 테스트(종목 찾기 `AgentReadIntegrationTest` 포함)가 통과한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/TokenScope.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenRepository.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/AgentPrincipal.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/SecurityLookupService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Limits.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/trade/SecurityMarkets.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/trade/Trades.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/trade/TradeRepository.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/trade/TradeService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/trade/TradeController.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/trade/TradeInputsTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/trade/TradeIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLoaderReservedTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/agent/IntegrationTokenIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/Fixtures.kt` | 수정 |
