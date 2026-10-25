# Phase 03. v1 검색, 노드 상세, 주변 그래프

**Execution profile**: deep

## 목표

`GET /api/v1/nodes`, `GET /api/v1/nodes/{id}`, `GET /api/v1/graph/neighborhood` 를 만든다. 화면용 조회 서비스의 결과를 v1 DTO 로 옮기고, 보관한 항목을 빼고, 항목 수와 긴 글을 계약의 상한으로 자른다.

**범위 외**: 근거 따라가기, 종목 찾기, 공부 목록(phase 04). 인증과 요청 한도(phase 02 에서 끝남).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「에이전트 API(`/api/v1`)」 의 「공통 규칙」, 「요청 한도와 응답 크기」, 「공통 표현」(`V1NodeRef`, `V1Document`, `V1Concept`, `V1Claim`), `GET /api/v1/nodes`, `GET /api/v1/nodes/{id}`, `GET /api/v1/graph/neighborhood`, 같은 문서의 「노드」, 「주변 그래프」, `financial-workbench/docs/code-architecture.md` 의 작은 결정(v1 응답은 화면용 조회 서비스의 결과를 옮긴다, 관계 문장).

- phase 02 가 만든 `agent/v1/V1Dtos.kt`, `agent/v1/V1Mapper.kt`(`ref`, `typeLabel`, `sentence`), `agent/v1/AgentV1Controller.kt` 에 더한다. 테스트 클라이언트의 `ApiClient.bearer(...)` 와 `IntegrationTest.newUser(...)` 도 phase 01, 02 에 있다.
- 검색: `knowledge/NodeQueryService.kt` 의 `search(q, types, reviewStatus, includeArchived, sort, page: PageQuery): Page<NodeView>`. `q` 길이와 `types` 형식 검사는 그 안에서 한다.
- 상세: 같은 파일의 `detail(id): NodeDetail`. `NodeDetail.relationships` 는 보관된 관계와 보관된 끝 노드를 포함한다(`RelationshipView.archived`, `from.archived`, `to.archived`). `claims` 는 보관하지 않은 주장만 50개까지이고 `ClaimView.subject`, `object`, `documents` 에 `archived` 가 있다. `reader.node(id)` 는 없는 id 면 `NotFoundException` 이다. 보관한 노드도 돌려주므로 v1 은 `node.archived` 면 `NotFoundException(id)` 를 던진다.
- 근거 문서: `knowledge/KnowledgeReader.kt` 의 `evidenceDocuments(nodeIds, types, limit)`, 근거 관계 종류는 `learning/LearningRules.kt` 의 `evidenceTypes(ontology)`.
- 그래프: `graph/GraphService.kt` 의 `neighborhood(id, hops, types, reviewStatus): GraphView`. 중심은 `nodes` 의 첫 항목이다. 보관된 중심은 404, `hops` 검사도 그 안에서 한다.
- 페이지: `web/Paging.kt` 의 `PageQuery`, `Page`. `PageQuery.of` 는 `size` 100 까지 받으므로 v1 은 50 을 따로 검사한다.
- 시스템 작업자: `NodeView.createdBy`, `updatedBy` 는 사용자를 찾지 못하면(`system` 포함) `null` 이다.

## 의도 메모

- v1 전용 Cypher 를 쓰지 않는다. 보관, 한도, 주장 이름 규칙이 두 벌이 되기 때문이다. 화면 서비스가 넉넉히 읽은 결과에서 v1 이 보관한 것을 빼고 상한으로 자른다.
- 상세의 `properties` 는 자르지 않는다. 에이전트가 판단 근거를 읽는 곳이다. 끼워 넣은 주장의 글만 500자에서 자른다.
- 관계 문장의 조사는 고르지 않는다. 틀의 「은(는)」 표기를 그대로 둔다.

## 작업 항목

### 1. `agent/v1/V1Dtos.kt` 에 DTO 를 더한다

계약의 이름 그대로: `V1Document`, `V1Concept`, `V1Claim`, `V1NodeSummary`, `V1NodeHeader`(상세의 `node`: `id, type, typeLabel, label, revision, createdAt, createdBy: String?, updatedAt, updatedBy: String?`), `V1Property(key, label, type: String?, value: Any?, valueLabel: String?)`, `V1Relation(relationshipId, type, label, direction, sentence, other: V1NodeRef)`, `V1NodeDetail(node, properties, relations, claim: V1Claim?, claims, documents, concepts, relationsTruncated, claimsTruncated)`, `V1GraphNode(id, type, typeLabel, label, reviewStatus)`, `V1GraphEdge(id, type, from, to, sentence: String?)`, `V1Graph(center: V1NodeRef, hops, nodes, edges, truncated)`. 모두 null 도 키를 담는다.

### 2. `agent/v1/V1Mapper.kt` 에 옮기기 함수를 더한다

- `const val MAX_PAGE_SIZE = 50`, `MAX_RELATIONS = 100`, `MAX_CLAIMS = 20`, `MAX_DOCUMENTS = 20`, `MAX_CONCEPTS = 20`, `MAX_TEXT = 500`.
- `page(page: Int?, size: Int?): PageQuery`: `size` 가 1~50 밖이면 `ValidationFailedException(mapOf("size" to "1 이상 50 이하여야 합니다."))`, 나머지는 `PageQuery.of`.
- `cut(text: String?): String?`: 500자를 넘으면 앞 500자 뒤에 `…`.
- `ref(NodeRef)`, `ref(NodeView)`, `document(DocumentRef)`, `concept(ConceptRef)`, `claim(ClaimView, cutText: Boolean)`(`cutText` 면 `description`, `evidenceText` 를 `cut` 한다, 보관된 `subject`, `object` 는 `null`, 보관된 문서는 뺀다, `predicateLabel` 은 온톨로지 표시 이름), `summary(NodeView)`, `properties(NodeView)`(정의된 타입이면 정의 순서로 `label`, `type.yaml`, enum 이면 `valueLabels[value]`. 정의에서 빠진 타입이면 `label = key`, `type = null`).

### 3. `agent/v1/AgentV1Controller.kt` 에 경로를 더한다

- `GET /api/v1/nodes`(`q`, `types: List<String>?`, `page`, `size`): `queries.search(q, types, null, false, null, mapper.page(page, size))` 를 `Page<V1NodeSummary>` 로 옮긴다.
- `GET /api/v1/nodes/{id}`: `queries.detail(id)`. 보관한 노드면 `NotFoundException`. `relations` 는 보관하지 않은 관계 가운데 상대 끝이 보관되지 않은 것만, 만든 순서 그대로 100개까지. `direction` 은 `from.id == id` 면 `OUT`. `sentence` 는 `mapper.sentence(type, from.label, to.label)`. `relationsTruncated` 는 보관한 것을 뺀 뒤 100개를 넘었거나 `detail.relationshipsTruncated` 다. `claims` 는 앞 20개를 `cutText = true` 로, `claimsTruncated` 는 21개 이상이었거나 `detail.claimsTruncated`. `claim` 은 `detail.claim` 을 `cutText = false` 로. `documents` 는 `reader.evidenceDocuments(listOf(id), LearningRules.evidenceTypes(holder.current()), 20)`. `concepts` 는 `detail.concepts` 앞 20개.
- `GET /api/v1/graph/neighborhood`(`id` 필수, `hops` 기본 1): `graph.neighborhood(id, hops, null, null)`. `center` 는 `nodes` 의 첫 항목. 선의 `sentence` 는 관계 종류가 온톨로지 `relationshipTypes` 에 있을 때만 두 끝의 `label` 로 만들고, 주장 관계는 `null`.
- 읽기 서비스를 부르고 v1 으로 옮기는 일은 `agent/v1/AgentQueryService.kt`(`@Service`, 신규)에 둔다. 컨트롤러는 한 줄 호출이다.
- `AgentQueryService` 클래스에는 `@Transactional` 을 붙이지 않는다. `GraphService.neighborhood` 와 `TraceService.trace` 는 스스로 연 `TransactionTemplate` 에만 시간 제한(`workbench.graph.timeout`)이 걸린다. 바깥 트랜잭션이 있으면 그 안에 합류해 제한이 사라진다. 그래서 `neighborhood` 는 서비스 자체 트랜잭션에 맡기고, 상세(`detail`, `evidenceDocuments`)만 메서드 단위 `@Transactional(readOnly = true)` 로 묶는다. 검색(`search`)은 `NodeQueryService` 의 트랜잭션에 맡긴다.

### 4. 이 phase 를 검증하는 `api/src/test/kotlin/dev/fos/workbench/agent/AgentReadIntegrationTest.kt`

`IntegrationTest` 를 상속한다. 데이터는 `loggedIn(ALICE)` 와 `support/Fixtures.kt` 로 만들고, 조회는 `newUser(Role.VIEWER)` 가 발급한 토큰으로 `bearer(...)` 한다.

- 검색: 기업 하나를 만들고 `GET /api/v1/nodes?q=<그 이름>` 의 `items[0]` 이 `id`, `type = "Company"`, `typeLabel = "기업"`, `label`, `revision`, `updatedAt` 을 갖고 `properties` 키가 없다. 그 기업을 보관(`POST /api/nodes/{id}/archive`)하면 같은 검색 결과에 없다. `size=51` 은 `400 VALIDATION_FAILED`, `size=50` 은 `200`.
- 상세: 기업과 종목을 `ISSUES` 로 잇고, 산업, 근거 문서와 함께 산업 소속 주장을 `description` 600자로 만든다. `Fixtures.claim` 은 설명을 고정하므로 같은 본문 모양으로 `POST /api/claims` 를 직접 부른다. 기업의 `GET /api/v1/nodes/{id}` 에서 `properties` 에 `{"key":"country","type":"enum","value":"KR","valueLabel":<온톨로지의 KR 표시 이름>}` 이 있고, `relations` 에 `direction = "OUT"`, `type = "ISSUES"`, `other.type = "Security"`, `sentence` 가 `"<기업 이름>이(가) <종목 이름>을(를) 발행한다"` 인 항목이 있다. `claims[0].description` 은 501자이고 `…` 로 끝난다. 그 주장 자체의 상세(`GET /api/v1/nodes/<주장 id>`)의 `claim.description` 은 600자 그대로다. `node.createdBy` 는 `"Alice"` 다.
- 보관 제외: 종목을 보관하면 기업 상세의 `relations` 에서 그 관계가 빠진다. 보관한 종목의 상세는 `404 NOT_FOUND` 다.
- 주변 그래프: 기업을 중심으로 `hops=1` 이면 `center.id` 가 기업이고 `nodes` 에 기업이 있고 `edges` 의 `ISSUES` 선은 `sentence` 가 있고 주장 관계(`SUBJECT`) 선은 `sentence` 가 `null` 이다. `hops=3` 은 `400 VALIDATION_FAILED`.
- 응답에 이메일이 없다: 상세 응답 문자열에 `alice@example.com` 이 들어 있지 않다.

`./gradlew test` 는 `src/test/kotlin` 아래 모든 테스트를 돈다. `--tests` 로 이 phase 의 테스트를 먼저 돌린 뒤 전체를 돈다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.agent.AgentReadIntegrationTest'
cd financial-workbench/api && ./gradlew test --rerun
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Dtos.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Mapper.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentV1Controller.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentQueryService.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/agent/AgentReadIntegrationTest.kt` | 신규 |
