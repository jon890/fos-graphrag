# Phase 04. v1 근거 따라가기, 종목 찾기, 공부 목록

**Execution profile**: deep

## 목표

`GET /api/v1/nodes/{id}/trace`, `GET /api/v1/securities/lookup`, `GET /api/v1/me/knowledge` 를 만든다. 근거 따라가기와 공부 목록은 화면 서비스의 결과를 옮기고, 종목 찾기는 토스증권 커넥터의 종목 코드로 종목과 결정, 밸류에이션을 한 번에 돌려준다.

**범위 외**: 검색, 상세, 주변 그래프(phase 03). 화면(phase 05).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「에이전트 API(`/api/v1`)」 의 `GET /api/v1/nodes/{id}/trace`, `GET /api/v1/securities/lookup`, `GET /api/v1/me/knowledge`, 「요청 한도와 응답 크기」, 같은 문서의 「근거 따라가기」, 「내 이해 표시」, `financial-workbench/docs/data-schema.md` 의 「투자 온톨로지」(종목 찾기가 이름으로 읽는 키), `financial-workbench/docs/code-architecture.md` 의 「API 패키지」(`agent.v1` 의 `SecurityLookupService`).

- phase 02, 03 이 만든 `agent/v1/V1Dtos.kt`, `V1Mapper.kt`(`ref`, `typeLabel`, `sentence`, `document`, `concept`, `cut`, `page`), `AgentV1Controller.kt`, `AgentQueryService.kt` 에 더한다.
- 근거 따라가기: `learning/TraceService.kt` 의 `trace(id, userId): TraceView`. `TraceView`, `TraceStep`, `TraceMissing`, `TraceDependent`, `TraceClaim` 은 `learning/LearningDtos.kt` 에 있다. `TraceStep.knowledge` 는 `userId` 의 표시만 담는다. 보관했거나 없는 항목은 `NotFoundException` 이다.
- 공부 목록: `learning/KnowledgeMarkService.kt` 의 `list(userId, levels, page): Page<StudyItem>`. 지금은 보관된 항목의 표시도 담는다. 쿼리는 `match` 문자열(`MATCH (:User {id: $userId})-[k:KNOWS]->(n:Knowledge) WHERE $levels IS NULL OR k.level IN $levels`) 하나를 개수와 목록이 함께 쓴다. 웹의 `KnowledgeMarkController.list` 가 이 함수를 부른다.
- 읽기 트랜잭션: `graph/GraphService.kt` 의 `readOnly`(`TransactionTemplate`, `isReadOnly = true`, `timeout = properties.graph.timeout`)를 따른다.
- 온톨로지 표시 이름: `Ontology.nodeTypes[type].properties[key].valueLabels`.
- 시장 값: Security 의 `market` 은 `KRX_KOSPI`, `KRX_KOSDAQ`, `NASDAQ`, `NYSE`, `OTHER`(`financial-workbench/ontology/financial-ontology.yaml`).

## 의도 메모

- `KnowledgeMarkService.list` 의 기본 동작(보관 포함)은 웹이 쓰므로 바꾸지 않는다. 인자를 더하고 기본값을 지금 동작으로 둔다.
- 종목 찾기는 화면에 같은 조회가 없어 자기 Cypher 를 쓴다. 타입과 관계 키는 이름으로 읽고, 온톨로지에서 빠지면 결과가 빌 뿐 실패하지 않는다(`docs/data-schema.md` 「투자 온톨로지」).
- 종목 코드는 대소문자를 무시해 비교한다. 국내 코드의 앞 `A` 를 떼는 식의 추측 변환은 하지 않는다. 토스증권 커넥터는 6자리 코드를 그대로 쓴다.
- 맞는 종목이 없으면 404 가 아니라 빈 `matches` 다. 에이전트가 「없다」 를 오류와 가르지 않아도 되게 한다.

## 작업 항목

### 1. `learning/KnowledgeMarkService.kt` 의 `list` 에 `includeArchived` 를 더한다

시그니처를 `list(userId: String, levels: List<String>?, page: PageQuery, includeArchived: Boolean = true)` 로 바꾼다. `false` 면 `match` 에 `AND n.archived = false` 를 더한다(개수와 목록이 같은 조건을 쓴다). `KnowledgeMarkController.list` 는 인자를 넘기지 않아 지금 동작 그대로다. 함수 주석의 「보관된 항목도 담는다」 를 「`includeArchived` 가 거짓이면 보관된 항목을 뺀다」 로 고친다.

### 2. `agent/v1/V1Dtos.kt` 에 DTO 를 더한다

계약의 이름 그대로: `V1TraceVia(relationshipId, relationshipType, childId, sentence)`, `V1TraceClaim(id, label, predicate, reviewStatus)`, `V1TraceMissing(relationshipType, label, candidates: List<V1NodeRef>)`, `V1Knowledge(level, note, updatedAt)`, `V1TraceStep(node, depth, via: V1TraceVia?, status, documents, claims, concepts, missing, myKnowledge: V1Knowledge?)`, `V1TraceDependent(node, relationshipType, sentence)`, `V1Trace(root, steps, dependents, truncated, dependentsTruncated)`, `V1SecurityRef(id, type, typeLabel, label, market, marketLabel, ticker, currency)`, `V1Decision(node, action, actionLabel, decidedAt, reason, basedOn)`, `V1Scenario(node, kind, valuePerShare, assumptions)`, `V1Valuation(node, asOf, currentPrice, currency, method, scenarios, scenariosTruncated)`, `V1SecurityMatch(security, issuer, decisions, valuations, decisionsTruncated, valuationsTruncated)`, `V1SecurityLookup(market, ticker, matches, matchesTruncated)`, `V1StudyContext(decision, depth)`, `V1StudyItem(node, level, note, updatedAt, contexts, documents, concepts)`.

### 3. `agent/v1/AgentQueryService.kt` 에 근거 따라가기와 공부 목록을 더한다

- `AgentQueryService` 클래스에는 `@Transactional` 을 붙이지 않는다(phase 03 과 같은 이유). `trace` 는 `TraceService` 자체의 시간 제한 트랜잭션에, `knowledge` 는 `KnowledgeMarkService.list` 의 트랜잭션에 맡긴다.
- `trace(id, userId): V1Trace`: `traces.trace(id, userId)` 를 옮긴다. 단계의 `via` 는 `relationshipId` 가 있을 때만 만들고 `sentence` 는 `mapper.sentence(relationshipType, 이 단계 이름, childId 단계의 이름)` 이다(관계 방향이 이 단계 → 아래 단계다). 문서의 `archived` 는 이미 빠져 있으므로 그대로 옮긴다. `missing[].label` 은 관계 종류의 표시 이름. `dependents[].sentence` 는 `mapper.sentence(type, 지금 항목 이름, 그 항목 이름)`.
- `knowledge(userId, level: List<String>?, page, size): Page<V1StudyItem>`: `marks.list(userId, level, mapper.page(page, size), includeArchived = false)` 를 옮긴다.

### 4. `agent/v1/SecurityLookupService.kt`

```kotlin
@Service
class SecurityLookupService(private val client: Neo4jClient, private val holder: OntologyHolder, private val mapper: V1Mapper, properties: WorkbenchProperties, transactionManager: PlatformTransactionManager) {
    fun lookup(market: String?, ticker: String?): V1SecurityLookup
}
```

- 입력: `ticker` 가 없거나 trim 뒤 비었거나 32자를 넘으면 `ValidationFailedException(mapOf("ticker" to "1자 이상 32자 이하여야 합니다."))`. `market` 은 trim 뒤 대문자로 바꿔 아래 표로 시장 목록을 정한다. 표에 없으면 `ValidationFailedException(mapOf("market" to "KR, US, KOSPI, KOSDAQ, NASDAQ, NYSE, AMEX, KR_ETC, US_ETC, KRX_KOSPI, KRX_KOSDAQ, OTHER 가운데 하나여야 합니다."))`. 비었으면 시장을 좁히지 않는다.

  | 입력 | 시장 목록 |
  | --- | --- |
  | `KR` | `KRX_KOSPI`, `KRX_KOSDAQ`, `OTHER` |
  | `US` | `NASDAQ`, `NYSE`, `OTHER` |
  | `KOSPI`, `KRX_KOSPI` | `KRX_KOSPI` |
  | `KOSDAQ`, `KRX_KOSDAQ` | `KRX_KOSDAQ` |
  | `NASDAQ` | `NASDAQ` |
  | `NYSE` | `NYSE` |
  | `AMEX`, `KR_ETC`, `US_ETC`, `OTHER` | `OTHER` |

- 쿼리는 읽기 전용 `TransactionTemplate`(시간 제한 `properties.graph.timeout`) 하나에서 돈다. 값은 모두 parameter 다.
  1. 종목: parameter `ticker` 는 trim 한 뒤 `uppercase()` 한 값이다. `MATCH (s:Knowledge:Security) WHERE s.archived = false AND toUpper(s.ticker) = $ticker AND ($markets IS NULL OR s.market IN $markets) RETURN properties(s) AS s ORDER BY s.market, s.createdAt, s.id LIMIT 11`. 10개를 넘으면 `matchesTruncated`.
  2. 발행 기업: 종목마다 `(c:Knowledge:Company)-[r:ISSUES]->(s)` 가운데 `r.archived = false AND c.archived = false` 를 `r.createdAt, r.id` 순서로 첫 하나.
  3. 결정: 종목마다 `(s)-[r:HAS_DECISION]->(d:Knowledge:Decision)`(둘 다 보관 안 됨)를 `d.decidedAt IS NULL, d.decidedAt DESC, d.createdAt, d.id` 순서로 21개. `basedOn` 은 `(v:Knowledge:Valuation)-[b:BASED_ON]->(d)`(둘 다 보관 안 됨)를 `b.createdAt, b.id` 순서로.
  4. 밸류에이션: 발행 기업마다 `(c)-[r:HAS_VALUATION]->(v:Knowledge:Valuation)`(`r.archived = false AND v.archived = false`)을 `v.asOf IS NULL, v.asOf DESC, v.createdAt, v.id` 순서로 11개. 시나리오는 `(v)-[h:HAS_SCENARIO]->(sc:Knowledge:Scenario)`(`h.archived = false AND sc.archived = false`)를 `CASE sc.kind WHEN 'BEAR' THEN 0 WHEN 'BASE' THEN 1 WHEN 'BULL' THEN 2 ELSE 3 END, sc.createdAt, sc.id` 순서로 11개.
- 옮기기: `marketLabel`, `actionLabel` 은 온톨로지 `valueLabels`(없으면 값). `reason`, `assumptions` 는 `mapper.cut`. 숫자는 저장된 값 그대로(`Number`). 응답의 `market` 은 입력을 대문자로 바꾼 값이고 없으면 `null`, `ticker` 는 trim 한 입력 그대로.

### 5. `agent/v1/AgentV1Controller.kt` 에 경로를 더한다

- `GET /api/v1/nodes/{id}/trace` → `queries.trace(id, principal.userId)`.
- `GET /api/v1/securities/lookup`(`market: String?`, `ticker: String?`) → `lookups.lookup(market, ticker)`. `ticker` 를 `required = false` 로 받아 서비스가 계약의 오류 문구로 검사한다.
- `GET /api/v1/me/knowledge`(`level: List<String>?`, `page`, `size`) → `queries.knowledge(principal.userId, level, page, size)`.

### 6. 이 phase 를 검증하는 `api/src/test/kotlin/dev/fos/workbench/agent/AgentLearningIntegrationTest.kt`

`IntegrationTest` 를 상속한다. 데이터는 `loggedIn(ALICE)` 가 API(`POST /api/nodes`, `POST /api/relationships`)로 만든다. 이름과 종목 코드에는 `Fixtures(alice).suffix` 를 붙인다. 조회는 `newUser(Role.VIEWER)` 두 명(P, Q)이 각자 발급한 토큰으로 한다.

준비는 테스트마다 새로 만든다(`@BeforeAll` 이나 공유 필드로 나누지 않는다. 종목 찾기 테스트가 `BASED_ON` 을 이어 근거 따라가기의 `missing` 이 달라지기 때문이다). 준비: 기업 C, 종목 S(`market = NASDAQ`, `ticker = "ZQ" + suffix.uppercase()`, `currency = USD`), `ISSUES` C→S, 결정 D(`action = BUY`, `decidedAt = 2026-09-14`, `reason` 600자), `HAS_DECISION` S→D, 밸류에이션 V(`currentPrice = 12.5`, `asOf = 2026-09-14`), `HAS_VALUATION` C→V, 시나리오 낙관(`BULL`)과 비관(`BEAR`)을 그 순서로 만들고 `HAS_SCENARIO` V→각각.

- 근거 따라가기: P 가 세션으로 `PUT /api/me/knowledge/<S id> {"level":"UNSURE","note":"P 메모"}` 한 뒤, P 토큰의 `GET /api/v1/nodes/<D id>/trace` 는 `root.id = D`, 단계에 S(`depth = 1`, `via.relationshipType = "HAS_DECISION"`, `via.childId = D`, `via.sentence` 가 `"<D 이름>은(는) <S 이름>에 대한 결정이다"`, `myKnowledge.level = "UNSURE"`)와 C(`depth = 2`)가 있다. D 단계의 `missing` 에 `relationshipType = "BASED_ON"` 과 `candidates` 에 V 가 있다. Q 토큰의 같은 요청에서 S 단계의 `myKnowledge` 는 `null` 이다. 보관한 항목의 근거 따라가기는 `404`.
- 종목 찾기: `?market=us&ticker=<ticker 소문자>` 는 `matches` 하나, `security.marketLabel = "나스닥"`, `issuer.id = C`, `decisions[0].actionLabel = "매수"`, `decisions[0].reason` 은 501자이고 `…` 로 끝난다, `valuations[0].scenarios` 의 `kind` 가 `["BEAR", "BULL"]` 순서다. V→D `BASED_ON` 을 이은 뒤 다시 부르면 `decisions[0].basedOn[0].id = V`. 비관 시나리오를 보관(`POST /api/nodes/{id}/archive`)하면 `valuations[0].scenarios` 에서 빠진다. `market=KR` 은 `matches` 가 빈 배열인 `200`. `market` 없이도 찾는다. `market=XX` 와 `ticker` 없음은 `400 VALIDATION_FAILED` 이고 `details.fieldErrors` 에 각각 `market`, `ticker` 가 있다.
- 공부 목록: P 토큰의 `GET /api/v1/me/knowledge` 에 S 가 `level = "UNSURE"`, `note = "P 메모"` 로 있고, Q 토큰의 목록에는 S 가 없다. P 가 표시한 다른 항목을 Alice 가 보관하면 P 의 v1 목록에서 빠지고 세션 `GET /api/me/knowledge` 에는 남는다. `level=BAD` 는 `400`, `size=51` 은 `400`.

`./gradlew test` 는 `src/test/kotlin` 아래 모든 테스트를 돈다. `KnowledgeMarkIntegrationTest` 가 `includeArchived` 기본값의 동작(보관된 항목 포함)을 계속 확인한다. `--tests` 로 이 phase 의 테스트를 먼저 돌린 뒤 전체를 돈다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.agent.AgentLearningIntegrationTest' --tests 'dev.fos.workbench.learning.KnowledgeMarkIntegrationTest'
cd financial-workbench/api && ./gradlew test --rerun
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/KnowledgeMarkService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Dtos.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentQueryService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/SecurityLookupService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentV1Controller.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/agent/AgentLearningIntegrationTest.kt` | 신규 |
