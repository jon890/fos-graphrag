# Phase 02. 내 이해 표시 API 와 노드 상세의 개념

**Execution profile**: deep

## 목표

사용자 본인의 이해 표시(`KNOWS`)를 읽고 쓰는 `/api/me/knowledge` API(요약 끝점 제외)와, 노드 상세(`NodeDetail`)의 `concepts` 를 만든다. 근거 따라가기와 공부 목록이 함께 쓸 관계 분류 규칙(따라가는 관계, 근거 관계, 개념 관계)을 한 곳에 둔다.

**범위 외**: `GET /api/nodes/{id}/trace` 와 `GET /api/me/knowledge/summary`(phase 03), 화면(phase 04, 05).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「역할」, 「상한」, 「노드」(`NodeDetail`, `ConceptRef`), 「내 이해 표시」, `financial-workbench/docs/data-schema.md` 의 「이해 표시」, `financial-workbench/docs/adr/011-learning-marks-and-trace.md`, `financial-workbench/docs/code-architecture.md` 의 「API 패키지」.

- 새 패키지는 `dev.fos.workbench.learning` 이다. `learning` 은 `knowledge` 의 `KnowledgeReader` 를 부르고, `knowledge` 는 `learning` 을 부르지 않는다.
- 컨트롤러 모양은 `knowledge/NodeController.kt` 를 따른다. 로그인 사용자는 `@AuthenticationPrincipal user: WorkbenchPrincipal` 의 `user.id` 다. 쪽 나누기는 `web/Paging.kt` 의 `PageQuery.of(page, size)` 와 `PageQuery.of(items, total)` 이다. 오류는 `web/ApiError.kt` 의 `ValidationFailedException(mapOf(필드 to 사유))`, `NotFoundException(id)` 다. 시각은 `config/Timestamps.now()` 다.
- 보안: `config/SecurityConfig.kt` 의 `authorizeHttpRequests` 는 `GET /api/**` 를 VIEWER, 나머지 `/api/**` 를 EDITOR 로 막는다. `/api/me/**` 는 VIEWER 가 `PUT`, `DELETE` 해야 하므로 `.requestMatchers("/api/me/**").hasRole("VIEWER")` 를 `GET /api/**` 줄 앞에 더한다. CSRF 는 그대로 걸린다.
- 상세 쿼리는 `knowledge/NodeQueryService.detail` 이 `MATCH (a:Knowledge)-[r]->(b:Knowledge)` 로 읽는다. 끝이 `:Knowledge` 라 `:User` 의 `KNOWS` 는 섞이지 않는다. 주변 그래프(`graph/GraphService.load`)는 경로 위 모든 노드에 `x.archived = false` 를 걸고 `:User` 에는 `archived` 가 없어 `KNOWS` 를 타지 않는다. 이 phase 의 테스트가 이것을 고정한다.
- 테스트 도우미: `support/IntegrationTest.kt` 의 `loggedIn(email)`, `support/Fixtures.kt` 의 `node`, `company`, `document`, `claim`, `support/ApiClient.kt` 의 `get`, `post`, `send(method, path, body)`(PUT, DELETE 는 `send` 로 보낸다). 기존 통합 테스트(`knowledge/NodeWriteIntegrationTest.kt`)의 사용자 이메일과 역할 준비 방식을 따른다.

## 의도 메모

- 관계 분류는 관계 이름 목록이 아니라 온톨로지의 끝 타입으로 정한다. 근거 관계는 `to` 에 `Document` 가 있는 종류, 개념 관계는 `to` 에 `Concept` 가 있는 종류, 따라가는 관계는 `relationshipTypes` 에서 둘을 뺀 나머지다.
- 쓰기 경쟁: 같은 사용자의 두 요청이 동시에 `MERGE` 하면 관계가 둘 생길 수 있다. 사용자 노드에 `SET u._lock = true` 로 잠근 뒤 `MERGE` 하고 같은 쿼리에서 `REMOVE u._lock` 한다(ADR-003 과 같은 잠금 표시). 사용자의 `revision`, `updatedAt` 은 바꾸지 않는다.
- `Concept` 의 `summary` 는 이름으로 읽되 없으면 `null` 이다. `CodeReadKeys` 에 넣지 않는다(`docs/data-schema.md` 「노드」).

## 작업 항목

### 1. `learning/LearningRules.kt`

```kotlin
object LearningRules {
    const val DOCUMENT = "Document"
    const val CONCEPT = "Concept"
    const val DECISION = "Decision"
    fun evidenceTypes(o: Ontology): List<String>   // to 에 Document 가 있는 relationshipTypes 키
    fun conceptTypes(o: Ontology): List<String>    // to 에 Concept 가 있는 relationshipTypes 키
    fun traversableTypes(o: Ontology): List<String> // 나머지 relationshipTypes 키
}
```

키 목록은 Cypher 에 parameter(`type(r) IN $types`)로 넘긴다. 문자열에 잇지 않는다.

### 2. `knowledge/Dtos.kt`, `knowledge/KnowledgeReader.kt`, `knowledge/NodeQueryService.kt`

- `data class ConceptRef(val id: String, val label: String, val summary: String?, val relationshipType: String)`.
- `NodeDetail` 에 `val concepts: List<ConceptRef>` 를 `claims` 다음에 더한다.
- `KnowledgeReader.concepts(nodeIds: Collection<String>, limit: Int): Map<String, List<ConceptRef>>`: 노드마다 `(n:Knowledge)-[r]->(c:Knowledge:Concept)` 에서 `r.archived = false AND c.archived = false` 인 개념을 `r.createdAt, r.id` 순서로, 같은 개념은 처음 것 하나만, `limit` 개까지. 관계 종류로 좁히지 않는다(개념으로 나가는 모든 관계). `label` 은 `ontology.labelOf`, `summary` 는 `c.summary`.
- `KnowledgeReader.evidenceDocuments(nodeIds: Collection<String>, types: List<String>, limit: Int): Map<String, List<DocumentRef>>`: `(n)-[r]->(d:Knowledge:Document)` 에서 `type(r) IN $types`, 둘 다 보관되지 않은 것, `r.createdAt` 순서로 `limit` 개. 기존 `document(...)` 변환을 쓴다.
- `NodeQueryService.detail` 은 `concepts = reader.concepts(listOf(id), 20)[id].orEmpty()` 를 채운다. 20 은 `docs/api-contract.md` 「상한」 의 값이다.

`NodeDetail` 생성자를 부르는 곳을 `git grep -n "NodeDetail(" -- financial-workbench/api/src` 로 찾아 모두 고친다.

### 3. `learning/LearningDtos.kt`

```kotlin
data class KnowledgeMark(val nodeId: String, val level: String?, val note: String?, val updatedAt: String?)
data class PutKnowledgeRequest(val level: String? = null, val note: String? = null)
data class StudyContext(val decision: NodeRef, val depth: Int)
data class StudyItem(val node: NodeRef, val level: String, val note: String?, val updatedAt: String,
                     val contexts: List<StudyContext>, val documents: List<DocumentRef>, val concepts: List<ConceptRef>)
```

`KnowledgeMark` 는 `@JsonInclude(JsonInclude.Include.ALWAYS)` 로 `null` 필드를 담는다(`NodeView` 와 같다).

### 4. `learning/KnowledgeMarkService.kt`

- `LEVELS = setOf("KNOWN", "UNSURE", "LEARNING")`, `MAX_NOTE = 1000`.
- `get(userId, nodeId)`: 노드가 없으면 `NotFoundException`. 관계가 없으면 `KnowledgeMark(nodeId, null, null, null)`.
- `put(userId, nodeId, body)`: `level` 이 `LEVELS` 밖이거나 없으면 `ValidationFailedException(mapOf("level" to "KNOWN, UNSURE, LEARNING 가운데 하나여야 합니다."))`. `note` 는 앞뒤 공백을 지우고 1000자를 넘으면 `ValidationFailedException(mapOf("note" to "1000자 이하여야 합니다."))`, 비면 속성을 지운다. 노드가 없으면 `NotFoundException`. 보관된 노드에도 쓴다. 쓰기 트랜잭션(`@Transactional`) 하나에서 사용자 잠금, `MERGE (u)-[k:KNOWS]->(n)`, `SET k.level, k.updatedAt`, `note` 설정이나 제거, 잠금 해제.
- `delete(userId, nodeId)`: 노드가 없으면 `NotFoundException`, 관계가 없어도 그대로 끝낸다.
- `list(userId, levels: List<String>?, page: PageQuery)`: `levels` 가 `LEVELS` 밖이면 `ValidationFailedException(mapOf("level" to ...))`. `k.updatedAt DESC, n.id` 순서. 항목마다 `contexts`, `documents`(5개), `concepts`(10개)를 채운다. `documents` 는 `reader.evidenceDocuments(ids, LearningRules.evidenceTypes(o), 5)`, `concepts` 는 `reader.concepts(ids, 10)` 이다.
- `contexts`: 보관되지 않은 항목에서 `LearningRules.traversableTypes` 관계만 정방향으로 0~6홉 따라 닿는 보관되지 않은 `Decision`. 경로 위 모든 노드는 `:Knowledge` 이고 보관되지 않았으며 모든 관계는 보관되지 않았다. 결정마다 가장 짧은 길이를 `depth` 로, `depth, d.createdAt` 순서로 3개까지. 항목이 보관됐으면 빈 목록이다. 6 은 `TraceLimits` 같은 상수 한 곳에 둔다(phase 03 이 같은 값을 쓴다).

### 5. `learning/KnowledgeMarkController.kt`

`@RequestMapping("/api/me/knowledge")`: `GET`(쿼리 `level` 쉼표 구분 `List<String>?`, `page`, `size`), `GET /{nodeId}`, `PUT /{nodeId}`(본문 `PutKnowledgeRequest`), `DELETE /{nodeId}`(`@ResponseStatus(HttpStatus.NO_CONTENT)`). `GET /summary` 는 phase 03 이 더한다.

### 6. `config/SecurityConfig.kt`

위 컨텍스트대로 `/api/me/**` 를 VIEWER 로 연다.

### 7. `financial-workbench/api/src/test/kotlin/dev/fos/workbench/learning/KnowledgeMarkIntegrationTest.kt`

- 열람자가 `PUT {level: UNSURE, note: "  메모  "}` 하면 200 이고 `note` 는 `메모`, `GET /{id}` 가 같은 값을 준다. 같은 항목의 `revision` 과 `GET /api/changes?targetId=` 의 이력 수는 그대로다.
- 다른 사용자(편집자)의 `GET /{id}` 와 `GET /api/me/knowledge` 에는 열람자의 표시가 없다(`level` 이 `null`, 목록이 비었다).
- `level` 이 `WRONG` 이면 400 `VALIDATION_FAILED` 이고 `details.fieldErrors.level` 이 있다. `note` 가 1001자면 400 이고 `details.fieldErrors.note` 가 있다. 없는 노드 id 는 404 다. CSRF 헤더 없이 `send("PUT", ..., withCsrf = false)` 는 403 `CSRF_REJECTED` 다.
- `DELETE` 는 204 이고, 다시 `DELETE` 해도 204 다.
- 보관한 노드에 `PUT` 해도 200 이다. 목록 항목의 `node.archived` 가 `true` 이고 `contexts` 가 비었다.
- 공부 목록: 변화 → 병목(`CREATES`), 병목 → 기업(`BENEFITS`), 기업 → 종목(`ISSUES`), 종목 → 결정(`HAS_DECISION`) 을 만들고 변화를 `UNSURE` 로 표시하면 `GET ?level=UNSURE,LEARNING` 항목의 `contexts[0].decision.id` 가 그 결정이고 `depth` 가 4 다. 병목에 `EVIDENCED_BY` 로 문서를 이으면 병목 항목의 `documents` 에 그 문서가 있다. `?level=WRONG` 은 400 이다.
- 같은 사용자가 같은 항목에 `PUT` 두 번을 `support/Fixtures.kt` 의 `race` 로 동시에 보내도 `MATCH (:User {id})-[k:KNOWS]->(:Knowledge {id}) RETURN count(k)` 는 1 이다.
- 주변 그래프: 사용자 둘이 서로 다른 두 기업에 표시를 남겨도, 서로 이어지지 않은 그 두 기업 사이에서 `GET /api/graph/neighborhood?id=<기업1>&hops=2` 에 기업2 가 없다.

### 8. `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeConceptsIntegrationTest.kt`

밸류에이션과 개념 둘을 만들고 `USES_CONCEPT` 로 잇는다. 상세의 `concepts` 에 두 개념이 만든 순서로 있고 `summary`, `relationshipType` 이 맞다. 관계 하나를 보관하면 그 개념이 빠진다. 개념을 보관하면 그 개념도 빠진다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.learning.*' --tests 'dev.fos.workbench.knowledge.NodeConceptsIntegrationTest'
cd financial-workbench/api && ./gradlew test --rerun
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/LearningRules.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/LearningDtos.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/KnowledgeMarkService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/KnowledgeMarkController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/Dtos.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/KnowledgeReader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/learning/KnowledgeMarkIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeConceptsIntegrationTest.kt` | 신규 |
