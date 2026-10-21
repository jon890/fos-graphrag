# Phase 01. 검토 나누기와 이력 이름의 서버 계약

**Execution profile**: standard

## 목표

주장 목록 API 가 요청한 사람 기준으로 「내가 검토할 것」 과 「내가 쓰거나 고친 것」 을 나눠 주고, 주장 응답에 마지막 내용 수정자를 싣는다.
변경 이력 응답이 노드 ID 의 지금 이름을 함께 주고, 이력에 나온 사용자 목록 API 를 더한다. 온톨로지에 이력 항목 이름(`changeFields`)을 더한다.
다음 두 phase 의 화면이 이 계약을 쓴다.

**범위 외**: 웹 화면은 phase 02, 03 이다. 이 phase 는 `financial-workbench/web/src/` 를 고치지 않는다.

## 컨텍스트

- 주장 목록은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimController.kt` 의 `list(reviewStatus, includeArchived, page, size)` 가 `NodeQueryService.claims(reviewStatus, includeArchived, page)` 를 부른다. 쓰기 함수(`create`, `patch`, `review`)는 `@AuthenticationPrincipal user: WorkbenchPrincipal` 로 `user.id` 를 받는다.
- `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` 의 `claims` 는 `WHERE (reviewStatus 조건) AND (includeArchived 조건)` 로 개수와 id 를 읽고 `reader.claims(ids)` 로 바꾼다. 정렬은 `c.createdAt, c.id` 다. 같은 파일의 `requireReviewStatus` 가 잘못된 값을 `ValidationFailedException(mapOf("reviewStatus" to ...))` 로 막는다.
- 자기 검토 금지는 `ClaimService.review` 의 `before["createdBy"] == actorId || before["contentUpdatedBy"] == actorId` 다. Claim 노드에 `contentUpdatedBy`(사용자 id)가 있다.
- `ClaimView`(`knowledge/Dtos.kt`)는 `node`, `reviewedBy: UserRef?`, `reviewedAt`, `reviewNote`, `subject`, `object`, `documents` 다. `KnowledgeReader.claims(ids)` 가 만든다. 사용자 참조는 `users.findRefs(ids)` 로 한 번에 읽는다.
- 변경 이력은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/history/ChangeController.kt` 하나가 쿼리와 변환을 다 한다. `ChangeEventView` 는 같은 파일에 있다. ADMIN 이 아니면 `e.targetKind <> 'USER'` 로 사용자 관리 이벤트를 뺀다. `actor` 파라미터는 이메일이고 `users.findByEmail` 로 id 를 찾는다. `history` 패키지는 `knowledge` 를 부르지 않는다(`financial-workbench/docs/code-architecture.md` 「API 패키지」).
- 이력의 `changes` 에 노드 ID 가 들어가는 키는 `ClaimService.create` 의 `subjectId`, `objectId`, `documentIds`(목록)와 `RelationshipService.create` 의 `fromId`, `toId` 다. 이 ID 는 Company, Security, Sector, Document 라 Claim 이 아니다. 이름은 `Ontology.labelOf(type, properties)` 로 만든다.
- 온톨로지 모델은 `ontology/Ontology.kt` 의 `Ontology` data class 다. `reviewStatuses`, `changeActions` 가 `Map<String, LabelDef> = emptyMap()` 이다. YAML 은 `financial-workbench/ontology/financial-ontology.yaml` 끝의 `changeActions` 블록이다. 로더는 알 수 없는 키가 있으면 멈추므로 모델에 필드가 있어야 한다.
- 테스트: 통합 테스트는 `support/IntegrationTest.kt` 를 상속하고 `loggedIn(ALICE)`, `loggedIn(BOB)`, `loggedIn(ADMIN)`, `loggedIn(VIEWER)` 와 `support/Fixtures.kt` 의 `company`, `document`, `claim(predicate, subjectId, objectId, documentIds)` 를 쓴다. 이름 끝에 `-<suffix>` 가 붙는다. 같은 컨테이너를 여러 테스트가 함께 쓰므로 목록 단언은 이 테스트가 만든 id 가 있는지, 없는지로 한다(전체 개수를 세지 않는다).
- `ClaimIntegrationTest` 의 「내용을 마지막으로 고친 사람도 자기 수정본을 검토할 수 없다」 가 Alice 가 만들고 Bob 이 고치는 흐름을 이미 보인다.
- `OntologyLabelsTest` 의 「서버가 정한 검토 상태와 변경 작업에 표시 이름이 있다」 가 `reviewStatuses`, `changeActions` 키를 서버 enum 과 대조한다.

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 Claim 표(`scope`), `ClaimView` 예시(`contentUpdatedBy`), 「변경 이력」 절(`refs`, `GET /api/changes/actors`), `financial-workbench/docs/data-schema.md` 표시 이름 표의 `changeFields` 행, `financial-workbench/docs/code-architecture.md` 「결정」 의 검토 나누기와 이력 이름 항목

## 의도 메모

- 나누기를 화면이 하는 안은 버렸다. 한 쪽에 두 종류가 섞이고 마지막 내용 수정자 규칙을 화면이 알 수 없다(사용자 결정 2026-10-21).
- 이력 이름을 쓸 때 저장하는 안은 버렸다. 이미 쌓인 이력은 ID 그대로 남는다(사용자 결정 2026-10-21).
- `history` 가 `KnowledgeReader` 를 부르지 않는다. 호출 방향을 지키려고 `ChangeController` 가 자기 쿼리로 이름을 읽는다.
- 사용자 목록 API 는 사용자 관리 API(`/api/users`, ADMIN 전용)를 넓히지 않고 이력 쪽에 둔다. 응답은 이미 이력 행이 주는 `UserRef` 와 같은 모양이라 새로 드러나는 정보가 없다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. 주장 목록의 `scope`

- `ClaimController.list` 에 `@RequestParam(required = false) scope: String?` 와 `@AuthenticationPrincipal user: WorkbenchPrincipal` 을 더하고 `queries.claims(reviewStatus, scope, user.id, includeArchived, PageQuery.of(page, size))` 로 넘긴다.
- `NodeQueryService.claims` 시그니처를 `claims(reviewStatus: String?, scope: String?, userId: String, includeArchived: Boolean, page: PageQuery)` 로 바꾼다. 다른 호출부가 있으면 함께 고친다(`git grep -n "queries.claims\|\.claims(" -- financial-workbench/api/src/main` 로 찾는다).
- `scope` 는 `requireScope(value)` 로 검사한다. 비면 `null`, `reviewable`, `mine` 이 아니면 `ValidationFailedException(mapOf("scope" to "reviewable, mine 가운데 하나여야 합니다."))` 다.
- WHERE 에 아래를 더한다. `$userId` 를 파라미터로 넘긴다.

  ```cypher
  AND ($scope IS NULL
       OR ($scope = 'reviewable' AND c.createdBy <> $userId AND coalesce(c.contentUpdatedBy, c.createdBy) <> $userId)
       OR ($scope = 'mine' AND (c.createdBy = $userId OR c.contentUpdatedBy = $userId)))
  ```

### 2. `ClaimView.contentUpdatedBy`

- `ClaimView` 의 `reviewNote` 다음에 `val contentUpdatedBy: UserRef?` 를 더한다.
- `KnowledgeReader.claims(ids)` 는 `listOfNotNull(c["createdBy"], c["updatedBy"], c["reviewedBy"])` 로 사용자 id 를 모으고 `reviewedBy = (c["reviewedBy"] as String?)?.let { refs[it] }` 로 채운다. 같은 방식으로 `contentUpdatedBy` 사용자 id 를 `findRefs` 에 함께 넣고 채운다. 값이 없는 예전 Claim 은 `null` 이다.
- `ClaimView` 를 만드는 다른 곳이 있으면 함께 고친다(`git grep -n "ClaimView(" -- financial-workbench/api/src/main`).

### 3. 이력의 `refs` 와 사용자 목록

- `ChangeController.kt` 에 `data class ChangeRef(val id: String, val type: String, val label: String, val archived: Boolean)` 를 두고, `ChangeEventView` 의 `changes` 다음에 `val refs: Map<String, ChangeRef>` 를 더한다.
- 생성자에 `private val ontology: Ontology` 를 더한다.
- 같은 파일의 `companion object` 에 상수 셋을 둔다. `NODE_REF_KEYS = setOf("subjectId", "objectId", "documentIds", "fromId", "toId")`, `USER_REF_KEYS = setOf("reviewedBy")`, 그리고 이력 `changes` 에 나오는 키 가운데 온톨로지 속성이 아닌 것 전부인 `CHANGE_FIELD_KEYS = NODE_REF_KEYS + USER_REF_KEYS + setOf("reviewStatus", "reviewedAt", "reviewNote", "archived", "email", "displayName", "role", "enabled")` 다. 새 키를 이력에 남기는 코드를 더하면 이 상수에 더한다는 주석을 단다. `reviewedBy`, `reviewedAt`, `reviewNote` 는 검토된 주장을 고칠 때 `ClaimService.patch` 의 `diff(before, reset - "contentUpdatedBy")` 가 남긴다.
- `list` 에서 행을 읽은 뒤, 모든 행의 `changes` 에서 `NODE_REF_KEYS` 키의 `before`, `after` 에 든 문자열(목록이면 그 원소)을 모아 쿼리 한 번으로 읽는다. 모은 것이 없으면 쿼리하지 않는다.

  ```cypher
  MATCH (n:Knowledge) WHERE n.id IN $ids RETURN properties(n) AS n
  ```
  이름은 `ontology.labelOf(n["type"], n)` 이다. `USER_REF_KEYS` 키의 사용자 ID 는 `users.findRefs` 로 읽어 `ChangeRef(id, "User", displayName, false)` 로 둔다(작업자 refs 를 읽을 때 함께 넘겨 한 번에 읽는다). 각 행의 `refs` 는 그 행에 나온 ID 만 담는다. 찾지 못한 ID 는 빠진다.
- 새 끝점 `@GetMapping("/api/changes/actors")` `fun actors(authentication: Authentication): List<UserRef>` 를 둔다. `list` 와 같은 `admin` 판정으로 `MATCH (e:ChangeEvent) WHERE $admin OR e.targetKind <> 'USER' RETURN DISTINCT e.actorId AS id` 를 읽고 `users.findRefs(ids).values` 를 `displayName` 순서로 돌려준다. 사용자가 아닌 `system` 은 `findRefs` 에서 빠진다. `@Transactional(readOnly = true)` 를 붙인다.
- 보안 설정은 고치지 않는다. `config/SecurityConfig.kt` 가 `GET /api/**` 를 VIEWER 이상에게 연다. 열람자도 이력과 사용자 목록을 읽는다.

### 4. 온톨로지 `changeFields`

- `Ontology` 에 `/** 변경 이력의 changes 키 가운데 온톨로지 속성이 아닌 것의 표시 이름 */ val changeFields: Map<String, LabelDef> = emptyMap()` 을 더한다.
- YAML 끝에 블록을 더한다. 주석은 「변경 이력에 나오는 서버 키의 이름. 값은 서버가 정한다」 다.

  | 키 | label |
  | --- | --- |
  | `subjectId` | 주체 |
  | `objectId` | 대상 |
  | `documentIds` | 근거 문서 |
  | `fromId` | 시작 |
  | `toId` | 끝 |
  | `reviewStatus` | 검토 상태 |
  | `reviewedBy` | 검토자 |
  | `reviewedAt` | 검토 시각 |
  | `reviewNote` | 검토 메모 |
  | `archived` | 보관 |
  | `email` | 이메일 |
  | `displayName` | 표시 이름 |
  | `role` | 역할 |
  | `enabled` | 활성 |
- `schemaVersion` 을 `"1.2.0"` 에서 `"1.3.0"` 으로 올린다. `financial-workbench/api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt` 와 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt` 의 `schemaVersion` 단언도 `"1.3.0"` 으로 고친다.

### 5. 이 phase 를 검증하는 테스트

- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/ClaimIntegrationTest.kt` 에 「검토 대기는 요청한 사람 기준으로 나뉜다」 를 더한다.
  - Alice 가 주장 A 를 만든다. Bob 이 주장 B 를 만든다. Alice 가 만든 주장 C 를 Bob 이 내용 수정(`PATCH /api/claims/{id}`)한다.
  - Alice 의 `GET /api/claims?reviewStatus=DRAFT&scope=reviewable&size=100` 에 B 가 있고 A, C 가 없다. `scope=mine` 에 A, C 가 있고 B 가 없다.
  - Bob 의 `scope=reviewable` 에 A 가 있고 B, C 가 없다. `scope=mine` 에 B, C 가 있다.
  - Admin(제3자)의 `scope=reviewable` 에 A, B, C 가 모두 있다.
  - `scope=everything` 은 `400` 이고 `code` 가 `VALIDATION_FAILED` 다.
  - C 의 `GET /api/claims/{id}` 응답 `contentUpdatedBy.email` 이 Bob 이다.
  - 같은 컨테이너의 다른 데이터가 있으므로 「있다, 없다」 로만 단언한다. 한 쪽 100개를 넘을 만큼 데이터가 쌓이지 않는다는 전제를 주석으로 남긴다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/history/ChangeHistoryIntegrationTest.kt` 신규
  - 「이력의 노드 ID 는 지금 이름으로 함께 온다」: Alice 가 기업 둘, 문서 하나, 주장 하나를 만든다. 주장의 `CREATE` 이력(`/api/changes?targetId=<주장 id>`)의 `refs[주체 id].label` 이 주체 기업 이름이고 `refs[문서 id].type` 이 `Document` 다. 주체 기업 이름을 `PATCH /api/nodes` 로 바꾸면 같은 이력의 `refs[주체 id].label` 이 새 이름이다.
  - 「검토된 주장을 고친 이력의 검토자도 이름으로 온다」: Alice 가 주장을 만들고 Bob 이 `REVIEWED` 로 검토한 뒤 Alice 가 내용을 고친다. 그 `UPDATE` 이력의 `changes.reviewedBy.before` 가 Bob 의 id 이고 `refs[Bob id].label` 이 `Bob`, `type` 이 `User` 다.
  - 「사용자 목록은 이력에 나온 사람만, ADMIN 이 아니면 사용자 관리 이벤트만 남긴 사람은 빠진다」: 같은 컨테이너에서 기본 ADMIN 계정은 다른 테스트가 지식 데이터를 바꾸므로 쓰지 않는다. `loggedIn(ADMIN)` 으로 이 테스트 전용 관리자(이메일 `admin-actors-<suffix>@example.com`, 역할 ADMIN)를 `POST /api/users` 로 만들고 그 이메일로 `loggedIn` 한다. 이 전용 관리자로 사용자 하나를 `POST /api/users` 로 만든다. Bob 의 `GET /api/changes/actors` 에 전용 관리자 email 이 없고, 기본 ADMIN 의 응답에는 있다. Alice 가 노드 하나를 만든 뒤 Bob 의 응답에 Alice 의 email 이 있다. 같은 방식으로 관리자를 만드는 예는 `ConcurrencyIntegrationTest.kt` 에 있다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` 의 서버 키 테스트에 `ontology.changeFields.keys` 가 `ChangeController.CHANGE_FIELD_KEYS` 와 같고(`containsExactlyInAnyOrderElementsOf`) `label` 이 비어 있지 않은지 단언을 더한다. 서버가 새 키를 남기면 이 테스트가 YAML 에 이름을 더하라고 실패한다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.knowledge.ClaimIntegrationTest' --tests 'dev.fos.workbench.history.ChangeHistoryIntegrationTest' --tests 'dev.fos.workbench.ontology.OntologyLabelsTest'
cd financial-workbench/api && ./gradlew test
grep -q 'changeFields' financial-workbench/ontology/financial-ontology.yaml
grep -q '/api/changes/actors' financial-workbench/api/src/main/kotlin/dev/fos/workbench/history/ChangeController.kt
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/Dtos.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/KnowledgeReader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/history/ChangeController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` | 수정 |
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/ClaimIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/history/ChangeHistoryIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt` | 수정 |
