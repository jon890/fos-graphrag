# Phase 01. 개수 API, 최근 정렬, /map 화면 경로

**Execution profile**: standard

## 목표

개념 지도가 쓸 서버 기능을 만든다. 타입별 항목 수 API(`GET /api/nodes/counts`), 검색 API 의 최근 정렬(`sort=recent`), 화면 경로 `/map` 의 `index.html` 전달이다.

**범위 외**: 웹 화면(Phase 02 부터). 온톨로지 YAML 의 표시 이름(Phase 06).

## 컨텍스트

- 계약은 이미 문서에 있다. `financial-workbench/docs/api-contract.md` 의 「노드」 표와 그 아래 `sort`, `counts` 항목을 그대로 구현한다.
- 검색은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` 의 `search(q, types, reviewStatus, includeArchived, page)` 다. 지금 정렬은 `ORDER BY n.searchText, n.id` 다. 컨트롤러는 같은 패키지의 `NodeController.kt` 다.
- 화면 경로는 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` 의 `@GetMapping("/workspace", "/list", "/review", "/changes", "/ontology", "/users")` 다.
- 온톨로지는 `OntologyHolder.current()` 로 받는다(`docs/code-architecture.md` 「API 패키지」). 노드 타입 키는 `ontology.nodeTypes` 의 키다. 서비스 메서드 처음에 한 번 받는다.
- 통합 테스트는 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/graph/SearchAndGraphIntegrationTest.kt`(검색)와 `.../web/SpaRouteIntegrationTest.kt`(화면 경로) 패턴을 따른다. 로그인과 노드 만들기 도우미는 `.../support/` 에 있다.

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「노드」, `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」, 「개념 지도」, `financial-workbench/docs/adr/010-concept-map-first-screen.md`

## 의도 메모

- 개수 쿼리는 `MATCH (n:Knowledge) WHERE n.archived = false RETURN n.type AS type, count(n) AS count` 하나다. 타입마다 따로 세는 쿼리를 돌리지 않는다.
- 응답에는 지금 온톨로지의 모든 노드 타입 키를 넣고 결과에 없는 타입은 0 으로 채운다. 온톨로지에 없는 타입(정의에서 빠진 타입)의 노드는 응답에 넣지 않는다. 화면이 온톨로지 타입만 그리기 때문이다.
- `sort` 는 `label`(기본)과 `recent` 둘만 받는다. 다른 값은 `ValidationFailedException(mapOf("sort" to "..."))` 로 `400 VALIDATION_FAILED` 다. `recent` 는 `ORDER BY n.createdAt DESC, n.id`. 시각 문자열은 자릿수가 고정이라 문자열 정렬이 시간 순서와 같다(`docs/api-contract.md` 머리).
- `/api/nodes/counts` 는 `/api/nodes/{id}` 보다 구체적인 경로라 Spring 이 먼저 고른다. 그래도 테스트로 `counts` 가 상세 조회로 가지 않는지 확인한다.

## 작업 항목

### 1. `NodeQueryService.kt`, `NodeController.kt`, `Dtos.kt`

- `Dtos.kt` 에 `data class NodeCounts(val counts: Map<String, Long>)` 를 더한다.
- `NodeQueryService` 에 `@Transactional(readOnly = true) fun counts(): NodeCounts` 를 더한다. 위 쿼리 결과를 온톨로지 노드 타입 키 순서(`LinkedHashMap`)로 채운다.
- `NodeQueryService.search` 에 `sort: String?` 인자를 더한다. `null` 이나 `label` 은 지금 정렬, `recent` 는 `ORDER BY n.createdAt DESC, n.id`, 그 밖은 400.
- `NodeController` 에 `@GetMapping("/counts") fun counts(): NodeCounts = queries.counts()` 를 더하고, `search` 에 `@RequestParam(required = false) sort: String?` 를 더해 넘긴다.
- `search` 를 부르는 다른 곳이 있으면 함께 고친다(`git grep -n "queries.search\|\.search(" financial-workbench/api/src/main` 로 확인).

### 2. `SpaRouteController.kt`

`@GetMapping` 경로 목록 맨 앞에 `"/map"` 을 더한다. 주석의 「docs/flow.md 「주소와 뒤로가기」 의 표」 는 그대로다.

### 3. 테스트: `SearchAndGraphIntegrationTest.kt`, `SpaRouteIntegrationTest.kt`

`SearchAndGraphIntegrationTest` 에 아래를 더한다.

- `개수 API 는 보관하지 않은 노드를 타입마다 세고 없는 타입은 0 이다`: 기업 둘을 만들고 하나를 보관, 산업 하나를 만든 뒤 `GET /api/nodes/counts` 가 `200` 이고 `counts.Company == 1`, `counts.Sector == 1`, 온톨로지의 다른 타입 키(예: `Decision`, `Claim`)가 모두 있고 0 인지 본다. 다른 테스트가 만든 노드가 섞이면 테스트 시작 때 개수를 먼저 읽고 차이로 비교한다.
- `열람자도 개수를 읽고 로그인하지 않으면 401 이다`: VIEWER 세션으로 `200`, 세션 없이 `401 UNAUTHENTICATED`.
- `최근 정렬은 만든 순서의 역순이고 모르는 정렬은 400 이다`: 같은 타입 셋을 차례로 만들고 `GET /api/nodes?types=Concept&sort=recent&size=3` 의 첫 항목이 마지막에 만든 것인지, `sort=nope` 가 `400 VALIDATION_FAILED` 인지 본다.

`SpaRouteIntegrationTest` 의 `화면 경로는 로그인 없이 index html 을 돌려준다` 경로 목록에 `"/map?type=Bottleneck"` 을 더한다.

### 4. 이름만 바꾸는 곳

- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` 의 테스트 이름 `투자 논리 사슬의 노드와 관계를 만들고 방향과 필수값을 검사한다` 를 `투자 온톨로지의 노드와 관계를 만들고 방향과 필수값을 검사한다` 로 바꾼다.
- `.../knowledge/SeedLoaderIntegrationTest.kt` 의 `초기 데이터의 사슬이 모두 들어간다` 를 `초기 데이터의 투자 온톨로지 항목과 관계가 모두 들어간다` 로 바꾼다.
- `financial-workbench/ontology/seeds/investment-logic-2026-10.yaml` 1행 주석의 「투자 논리 사슬」 을 「투자 온톨로지 항목」 으로 바꾼다. 시드 `key` 와 파일 이름은 바꾸지 않는다.
- `Neo4jErrorClassifier.kt` 의 「원인 사슬」 은 예외 원인을 뜻하는 다른 말이라 그대로 둔다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.graph.SearchAndGraphIntegrationTest' --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'
git grep -n "사슬" -- financial-workbench/api financial-workbench/ontology
```

- `./gradlew test --rerun` 이 통과한다(백그라운드로 돌린다).
- `./gradlew test --rerun --tests 'dev.fos.workbench.graph.SearchAndGraphIntegrationTest' --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'` 가 통과하고 새 테스트 셋이 실행 목록에 있다.
- `git grep -n "사슬" -- financial-workbench/api financial-workbench/ontology` 결과가 `Neo4jErrorClassifier.kt` 한 줄뿐이다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/Dtos.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/graph/SearchAndGraphIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt` | 수정 |
| `financial-workbench/ontology/seeds/investment-logic-2026-10.yaml` | 수정 |
