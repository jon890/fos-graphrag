# Phase 03. 근거 따라가기 API 와 내 능력 범위

**Execution profile**: deep

## 목표

`GET /api/nodes/{id}/trace` 와 `GET /api/me/knowledge/summary` 를 만들고, 서버가 화면 경로 `/study`, `/trace` 를 `index.html` 로 돌려주게 한다.

**범위 외**: 화면(phase 04, 05).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「근거 따라가기」(`TraceView`, 따라가는 규칙, `missing` 규칙), 「내 이해 표시」(`KnowledgeSummary`), 「상한」, `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」, `financial-workbench/docs/adr/011-learning-marks-and-trace.md`.

- phase 02 가 만든 것: `learning/LearningRules.kt`(`traversableTypes`, `evidenceTypes`, `conceptTypes`, `DECISION`), `learning/LearningDtos.kt`(`KnowledgeMark`), `learning/KnowledgeMarkService.kt`, `learning/KnowledgeMarkController.kt`, 깊이 6 상수, `KnowledgeReader.concepts(ids, limit)`, `KnowledgeReader.evidenceDocuments(ids, types, limit)`.
- 읽기 트랜잭션 시간 제한은 `graph/GraphService.kt` 의 `readOnly = TransactionTemplate(...).apply { timeout = limits.timeout... }` 를 따른다(`workbench.graph.timeout`). 시간 초과는 기존 예외 처리기가 `503 QUERY_TIMEOUT` 으로 바꾼다.
- 노드 표현은 `KnowledgeReader.node(id)`(`NodeView`, 없으면 `NotFoundException`), `KnowledgeReader.nodes(rows)`, `KnowledgeReader.ref(p)`, `KnowledgeReader.claimLabels(ids)` 를 쓴다.
- `web/SpaRouteController.kt` 의 `@GetMapping("/map", "/workspace", "/list", "/review", "/changes", "/ontology", "/users")` 에 `"/study", "/trace"` 를 더한다. 테스트는 `web/SpaRouteIntegrationTest.kt` 의 기존 경로 단언을 따른다.

## 의도 메모

- 웹이 이웃 API 를 반복해 부르는 안은 ADR-011 에서 버렸다. 서버가 깊이마다 쿼리 하나로 다음 단계를 모은다(최대 6번).
- 같은 노드에 여러 길로 닿으면 처음 찾은 길(얕은 깊이, 같은 깊이면 아래 단계의 순서와 관계의 `createdAt, id` 순서)만 남긴다. 결과가 요청마다 같아야 e2e 와 화면이 흔들리지 않는다.
- 상태 판정은 설명 글을 읽지 않는다. 「원문 대조 대기」 는 화면이 설명 칸을 그대로 보일 뿐이다.

## 작업 항목

### 1. `learning/LearningDtos.kt` 에 응답 타입을 더한다

```kotlin
data class TraceClaim(val id: String, val label: String, val predicate: String, val reviewStatus: String?)
data class TraceMissing(val relationshipType: String, val candidates: List<NodeRef>)
data class TraceStep(
    val node: NodeView, val depth: Int, val childId: String?, val relationshipId: String?, val relationshipType: String?,
    val status: String, val documents: List<DocumentRef>, val claims: List<TraceClaim>, val concepts: List<ConceptRef>,
    val missing: List<TraceMissing>, val knowledge: KnowledgeMark?,
)
data class TraceDependent(val node: NodeRef, val relationshipId: String, val relationshipType: String)
data class TraceLimits(val maxDepth: Int, val maxSteps: Int, val maxDependents: Int, val maxCandidates: Int)
data class TraceView(val rootId: String, val steps: List<TraceStep>, val dependents: List<TraceDependent>,
                     val truncated: Boolean, val dependentsTruncated: Boolean, val limits: TraceLimits)
data class KnowledgeSummary(val counts: Map<String, Long>, val decisions: DecisionUnderstanding, val decisionsTruncated: Boolean)
data class DecisionUnderstanding(val total: Long, val understood: Long)
```

`TraceStep` 과 `TraceView` 는 `null` 필드를 담는다(`@JsonInclude(ALWAYS)`).

### 2. `learning/TraceService.kt`

상수 `MAX_DEPTH = 6`(phase 02 의 상수를 쓴다), `MAX_STEPS = 60`, `MAX_DEPENDENTS = 50`, `MAX_CANDIDATES = 5`, `MAX_STEP_DOCUMENTS = 20`, `MAX_STEP_CLAIMS = 20`, `MAX_STEP_CONCEPTS = 20`, `CANDIDATE_HOPS = 3`.

- `trace(id: String, userId: String): TraceView`: 읽기 트랜잭션 하나.
  1. 지금 항목을 읽는다. 없거나 보관됐으면 `NotFoundException(id)`.
  2. 깊이 1..6 마다 한 쿼리로 다음 단계를 모은다: `MATCH (p:Knowledge)-[r]->(c:Knowledge) WHERE c.id IN $frontier AND type(r) IN $traversable AND r.archived = false AND p.archived = false AND NOT p.id IN $seen RETURN p, r.id, type(r), c.id ORDER BY ...`. `p` 마다 첫 행만 남긴다. 단계 수가 60 을 넘으면 60 까지 남기고 `truncated = true`. 다음 깊이가 비면 멈춘다. 깊이 6 에서 위 단계가 더 있으면 `truncated = true`.
  3. 모은 노드 id 로 `documents`(`reader.evidenceDocuments(ids, evidenceTypes, 20)`), `concepts`(`reader.concepts(ids, 20)`), `claims`(보관되지 않은 Claim 이 `SUBJECT` 나 `OBJECT` 로 가리키는 것, 노드마다 `c.createdAt` 순서 20개, 이름은 `reader.claimLabels`), `knowledge`(`MATCH (:User {id: $userId})-[k:KNOWS]->(n:Knowledge) WHERE n.id IN $ids`)를 한 번씩 읽는다.
  4. `status`: `documents` 가 있거나 `REVIEWED` 주장이 있으면 `SUPPORTED`, 아니고 `DRAFT` 주장이 있으면 `PARTIAL`, 아니면 `MISSING`.
  5. `missing`: 단계 노드 타입 `T` 에 대해 `traversable` 가운데 `to` 에 `T` 가 있는 종류마다, 보관되지 않은 시작 노드에서 오는 보관되지 않은 그 종류 관계가 없으면 항목을 만든다. 후보는 그 종류의 `from` 타입인 보관되지 않은 노드 가운데 이 단계에서 `traversable` 관계(방향 무시, 보관되지 않은 관계와 노드만)로 1..3홉에 닿는 것을 거리, `createdAt DESC`, `id` 순서로 5개다. 관계 종류 이름은 parameter 로만 넘긴다(`type(r) IN $types`).
  6. `dependents`: 지금 항목에서 나가는 `traversable` 관계(보관되지 않은 관계와 끝 노드)의 끝을 `r.createdAt, r.id` 순서로 50개, 넘으면 `dependentsTruncated = true`.
  7. `steps` 정렬은 `depth`, 그 안에서 노드의 `createdAt, id` 다.
- `nodeSet(id: String): Pair<Set<String>, Boolean>`: 위 2 와 같은 규칙으로 모은 단계 id 집합과 잘림 여부. 능력 범위가 쓴다. 2 의 쿼리를 이 함수와 `trace` 가 함께 쓴다.

### 3. `learning/TraceController.kt`

`@RestController @RequestMapping("/api/nodes") class TraceController` 의 `@GetMapping("/{id}/trace") fun trace(@PathVariable id: String, @AuthenticationPrincipal user: WorkbenchPrincipal): TraceView`.

### 4. `learning/KnowledgeMarkService.kt`, `learning/KnowledgeMarkController.kt` 에 요약을 더한다

`summary(userId): KnowledgeSummary`:

- `counts`: `KNOWN`, `UNSURE`, `LEARNING` 세 키를 모두 담고 없는 값은 0. 보관된 항목의 표시도 센다.
- `decisions`: 보관되지 않은 `Decision`(`n.type = 'Decision'`)을 `createdAt, id` 순서로 201개 읽어 200개를 넘으면 `decisionsTruncated = true` 로 두고 200개만 센다. 결정마다 `traceService.nodeSet(id).first` 의 모든 id 에 그 사용자의 `KNOWN` 표시가 있으면 `understood` 로 센다. `total` 은 센 결정 수(최대 200)다.
- 컨트롤러에 `@GetMapping("/summary")` 를 `/{nodeId}` 보다 먼저 선언한다(Spring 은 리터럴 경로를 먼저 고르지만 읽는 사람을 위해).

### 5. `web/SpaRouteController.kt`

`"/study", "/trace"` 를 더하고 주석의 경로 목록 설명은 그대로 둔다.

### 6. `financial-workbench/api/src/test/kotlin/dev/fos/workbench/learning/TraceIntegrationTest.kt`

픽스처로 변화 → 병목(`CREATES`), 산업 → 병목(`HAS_BOTTLENECK`), 병목 → 기업(`BENEFITS`), 기업 → 종목(`ISSUES`), 기업 → 밸류에이션(`HAS_VALUATION`), 종목 → 결정(`HAS_DECISION`) 을 만든다. 병목에 `EVIDENCED_BY` 로 문서를 잇고, 밸류에이션에 `USES_CONCEPT` 로 개념을 잇는다. 기업에 산업 소속 초안 주장을 붙인다(`Fixtures.claim`).

- 결정의 trace: `steps[0]` 은 결정(`depth 0`, `childId null`), 종목(1), 기업(2), 병목(3), 변화와 산업(4) 순서다. 병목은 `SUPPORTED` 이고 `documents` 에 문서가 있다. 기업은 `PARTIAL` 이다. 변화는 `MISSING` 이다. 종목 단계의 `childId` 는 결정, `relationshipType` 은 `HAS_DECISION` 이다. 문서와 개념은 단계가 아니다.
- 결정의 `missing` 에 `BASED_ON` 이 있고 `candidates` 에 그 밸류에이션이 있다. 밸류에이션을 `BASED_ON` 으로 결정에 이으면 다시 읽은 결과에 `missing` 이 없고 밸류에이션 단계(`depth 1`)가 생기며 그 단계의 `concepts` 에 개념이 있다.
- 산업과 병목 사이 관계를 보관하면 산업 단계가 빠진다. 결정을 보관하면 trace 가 404 다. 없는 id 도 404 다.
- 열람자로 병목을 `UNSURE` 로 표시하면 열람자의 trace 에서 병목 `knowledge.level` 이 `UNSURE` 이고, 편집자의 trace 에서는 `null` 이다.
- 기업의 trace 의 `dependents` 에 종목과 밸류에이션이 있다.
- 단계 한도: 병목 하나에 변화 60개를 `CREATES` 로 이으면(지금 항목 포함 61단계) 병목의 trace 가 `truncated = true` 이고 `steps` 가 60개다. 투자 온톨로지의 관계 방향으로는 깊이 6 을 넘는 사슬을 만들 수 없어 깊이 한도는 단위로 따로 검사하지 않는다.
- `GET /api/me/knowledge/summary`: 결정의 모든 단계를 열람자가 `KNOWN` 으로 표시하기 전에는 `understood` 가 이 결정을 세지 않고, 표시한 뒤에는 센다(`understood` 가 1 늘어난다). 다른 테스트가 만든 결정이 섞이므로 전후 차이로 단언한다. `counts` 에 세 키가 있다. 열람자가 표시를 남긴 뒤에도 편집자의 `summary` 의 `counts` 와 `understood` 는 표시 전과 같다(두 사용자의 표시가 섞이지 않는다).

### 7. `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt`

`/study`, `/trace?node=x` 의 GET 이 다른 화면 경로와 같이 `index.html` 을 돌려준다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.learning.*' --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'
cd financial-workbench/api && ./gradlew test --rerun
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/LearningDtos.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/TraceService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/TraceController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/KnowledgeMarkService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/learning/KnowledgeMarkController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/learning/TraceIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` | 수정 |
