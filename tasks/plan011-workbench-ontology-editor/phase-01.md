# Phase 01. 온톨로지 버전 저장과 최신 버전 읽기

**Execution profile**: deep

## 목표

온톨로지를 Neo4j 의 `:OntologyVersion` 에 버전으로 쌓고, 서버의 모든 코드가 메모리의 최신 버전(`OntologyHolder`)으로 검증하게 바꾼다.
시작할 때 첫 버전을 만들고 코드가 소유하는 부분을 저장소 YAML 로 맞춘다. ADMIN 이 버전 목록과 YAML 을 읽는 API, 모든 응답의 `X-Ontology-Version` 헤더를 더한다.
다음 phase 의 저장과 되돌리기가 이 저장소와 holder 를 쓴다.

**범위 외**: 미리보기, 저장, 되돌리기 API 와 영향 계산, 정의에서 빠진 데이터의 읽기는 phase 02 다. 화면은 phase 03, 04 다. 이 phase 는 `financial-workbench/web/` 을 고치지 않는다.

## 컨텍스트

- 지금 온톨로지는 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` 의 `OntologyConfig.ontology()` 빈 하나다. `OntologyLoader.loadDefault()` 가 classpath 의 `financial-ontology.yaml`(원본 `financial-workbench/ontology/financial-ontology.yaml`, 빌드가 jar 에 복사)을 읽는다. `load(input)` 은 `mapper.readValue` → `withDerivedLabels` → `checkConsistency` 순서이고, 검사는 `require` 로 첫 오류에서 `IllegalArgumentException` 을 던진다. mapper 는 `FAIL_ON_UNKNOWN_PROPERTIES` 를 켠 `YAMLMapper` 다.
- 모델은 `ontology/Ontology.kt` 의 `data class Ontology(schemaVersion, nodeTypes, relationshipTypes, claimRelationships, claimPredicates, reviewStatuses, changeActions, changeFields)` 다. `allRelationshipTypes` 는 `@JsonIgnore` 다.
- `Ontology` 를 생성자로 주입받는 main 코드는 13곳이다: `config/Neo4jSchemaInitializer.kt`, `graph/GraphService.kt`, `history/ChangeController.kt`, `knowledge/ClaimService.kt`, `knowledge/KnowledgeReader.kt`, `knowledge/LegacyValueCleanup.kt`, `knowledge/NodeQueryService.kt`, `knowledge/NodeService.kt`, `knowledge/RelationshipService.kt`, `knowledge/RevisionGuard.kt`, `knowledge/SeedLoader.kt`, `ontology/OntologyController.kt`, `ontology/OntologyValidator.kt`. 테스트는 `knowledge/SeedLoaderIntegrationTest.kt` 가 `@Autowired lateinit var ontology: Ontology` 를 쓴다. `ontology/OntologyLabelsTest.kt`, `ontology/OntologyValidatorTest.kt` 는 `OntologyLoader.load(...)`, `loadDefault()` 를 직접 부른다.
- 시작 순서는 `Neo4jSchemaInitializer.afterSingletonsInstantiated()` 의 `initialize()`(검색 인덱스 교체, `STATEMENTS`, 관계 타입마다 `rel_<타입>_id` 인덱스) → `legacyValueCleanup.run()` → `seedLoader.run()` → `bootstrapAdmin.ensureAdmin()` 이다.
- Claim 타입(`managedBy: claims`)의 `predicate` enum 은 저장소 YAML 의 `values` 를 쓰고, `withDerivedLabels` 가 `valueLabels` 만 `claimPredicates` 에서 채운다.
- 보안 규칙은 `config/SecurityConfig.kt` 의 `requestMatchers` 다. `/api/users`, `/api/users/**` 가 `hasRole("ADMIN")`, 그다음 `GET /api/**` 가 `VIEWER`, 나머지 `/api/**` 가 `EDITOR` 다.
- 이력 기록은 `history/ChangeEventRecorder.kt` 의 `ChangeEventDraft` 와 `enum class TargetKind { NODE, RELATIONSHIP, USER }` 다. 서버 작업자는 `auth/BootstrapAdmin.SYSTEM_ACTOR`(`system`)다.
- 사용자 표시는 `auth/UserRef` 다. `history/ChangeController.kt` 가 `users` 로 ID 를 `UserRef` 로 바꾸는 방식을 따른다.
- 통합 테스트는 `support/IntegrationTest.kt` 를 상속한다. Neo4j 컨테이너는 하나(`support/TestcontainersConfig.kt` 의 static `NEO4J`)를 모든 테스트 클래스가 함께 쓴다. Spring 컨텍스트는 대부분 함께 쓰지만, `ForwardedHeadersIntegrationTest`(`@TestPropertySource`), `SearchAndGraphIntegrationTest`, `TransactionConsistencyIntegrationTest`(`@Import`)는 각자 컨텍스트를 만든다. holder 는 컨텍스트마다 따로라서, 한 컨텍스트가 버전을 바꾸면 다른 컨텍스트의 holder 는 낡는다. 그래서 버전 번호는 테스트 순서에 따라 다르다. 테스트는 번호를 상수로 단언하지 않고 시작할 때의 최신 번호를 읽어 비교한다. 로그인은 `loggedIn(ADMIN)`, `loggedIn(ALICE)`(EDITOR), `loggedIn(VIEWER)` 이고, 응답 헤더는 `ApiClient.Response.header(name)` 로 읽는다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「온톨로지와 지식 데이터」, 「온톨로지 버전」(속성 표, 코드가 소유하는 부분, 코드가 이름으로 읽는 키, 시작할 때), 「제약 조건과 인덱스」 의 `ontology_version_unique`, `financial-workbench/docs/api-contract.md` 의 「온톨로지」 표와 그 아래 목록, `financial-workbench/docs/code-architecture.md` 의 「API 패키지」 와 그 아래 `OntologyHolder` 문단, `financial-workbench/docs/adr/008-ontology-versions-in-db.md`

## 의도 메모

- 최신 버전은 메모리에 둔다. 요청마다 DB 를 읽지 않는다. API 가 프로세스 하나로만 돌기 때문이다(`code-architecture.md`). 그 대신 저장 경로는 커밋이 끝난 뒤에만 holder 를 바꾼다. 이 phase 의 버전 추가(`append`)도 같은 규칙을 지킨다.
- 서비스는 메서드 처음에 `val ontology = holder.current()` 로 한 번 받아 그 메서드 끝까지 쓴다. 클래스 필드로 들고 있지 않는다. 검증기와 읽기 도우미는 따로 받으므로 요청 도중에 저장이 끼면 두 버전을 읽을 수 있다. 결과가 대부분 거절 쪽이라 받아들인다(`code-architecture.md`).
- `Ontology` 빈을 남겨 두지 않는다. 남기면 새 코드가 그 빈을 주입받아 낡은 정의를 쓰는 실수를 막을 수 없다.
- 저장소 YAML 의 `schemaVersion: "1.4.0"` 은 그대로 둔다. 저장하는 버전의 `schemaVersion` 은 서버가 `version.toString()` 으로 바꾼다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. 로더: 문자열 읽기, YAML 쓰기, Claim predicate 값 만들기

`ontology/OntologyLoader.kt`

- `fun parse(text: String): Ontology` 를 더한다. `load(text.byteInputStream())` 와 같다.
- `fun toYaml(o: Ontology): String` 을 더한다. 같은 `YAMLMapper` 로 쓴다. `parse(toYaml(o)) == o` 가 성립해야 한다(테스트로 확인).
- `withDerivedLabels` 를 `internal fun withDerivedClaimPredicate` 로 이름을 바꾸고, `managedBy == "claims"` 타입의 `predicate` enum 을 `claimPredicates` 로만 만든다. `values = claimPredicates.keys.toList()`, `valueLabels` 는 `claimPredicates` 의 label 이고, 파일에 적은 `valueLabels` 는 `values` 안에 있으면서 label 이 없는 키만 남긴다(파생 값이 이긴다). 웹에서 주장 종류를 더하거나 빼거나 이름을 바꾸면 Claim 의 선택지도 따라오게 하려는 것이다. 예전처럼 파일 값이 이기면, 주장 종류를 뺀 정의에 values 밖의 `valueLabels` 가 남아 일관성 검사가 늘 실패한다.
- `checkConsistency` 를 `fun consistencyErrors(o: Ontology): List<String>` 로 바꿔 오류를 모두 모은다. 기존 `require` 하나하나가 목록에 문장을 더한다. `load` 는 목록이 비지 않으면 지금처럼 `IllegalArgumentException(첫 오류)` 를 던진다.
- `OntologyConfig` 의 `@Bean fun ontology()` 를 지운다.

### 2. 코드가 소유하는 부분과 코드가 이름으로 읽는 키

새 파일 `ontology/CodeOwned.kt`

- `object CodeOwned` 에 `fun merge(edited: Ontology, repo: Ontology): Ontology` 를 둔다. `reviewStatuses`, `changeActions`, `changeFields`, `claimRelationships`, `managedBy` 가 있는 노드 타입(Claim)을 `repo` 값으로 바꾼다. `edited` 에 Claim 타입이 없거나 달라도 `repo` 의 것을 넣는다. 결과에 `withDerivedClaimPredicate` 를 다시 적용한다(`OntologyLoader` 에 `internal` 로 연다).
- `fun ignoredPaths(edited: Ontology, merged: Ontology): List<String>` 은 위 부분 가운데 `edited` 가 `merge` 결과(파생 뒤)와 다른 경로를 한 단계 아래 키까지(`reviewStatuses.DRAFT`, `nodeTypes.Claim`) 돌려준다. 파생 전 저장소 값과 비교하면 주장 종류를 한 번 더한 뒤로 매번 `nodeTypes.Claim` 이 나오기 때문이다. phase 02 의 미리보기가 `codeOwnedIgnored` 로 쓴다.
- `fun errors(edited: Ontology, repo: Ontology): List<String>`: 저장소에 없는 노드 타입에 `managedBy` 가 있으면 「저장소에 없는 타입 X 에는 managedBy 를 둘 수 없습니다」 다. 웹의 `SearchPanel` 이 `managedBy === 'claims'` 로 Claim 타입을 고르기 때문이다.
- `object CodeReadKeys` 에 `val PROPERTIES: Map<String, Set<String>> = mapOf("Document" to setOf("title", "url", "publisher", "documentType", "publishedAt", "collectedAt"), "Security" to setOf("market", "ticker"))` 를 둔다. 주석에 「`KnowledgeReader.document`, `NodeService.requireUniqueListing`, `NodeService.searchText`, 제약 `security_listing_unique` 가 이 이름을 읽는다」 를 적는다. 검사 함수 `fun violations(edited: Ontology, repo: Ontology): List<String>` 은 타입이나 속성이 빠졌거나, 속성의 `type` 이나 `required` 가 `repo` 와 다르면 오류 문장을 돌려준다(예: 「Document.url 은 서버 코드가 읽는 속성이라 빼거나 타입과 필수 여부를 바꿀 수 없습니다」). phase 02 가 미리보기에서 부른다. 이 phase 에서는 테스트만 한다.

### 3. 버전 저장소와 holder

새 파일 `ontology/OntologyHolder.kt`

- `data class OntologySnapshot(val version: Int, val ontology: Ontology, val createdAt: String, val createdBy: String, val note: String?, val restoredFrom: Int?)`.
- `@Component class OntologyHolder` 에 `fun current(): Ontology`, `fun snapshot(): OntologySnapshot`, `fun snapshotOrNull(): OntologySnapshot?`, `internal fun replace(s: OntologySnapshot)` 를 둔다. 값은 `@Volatile` 필드 하나다. 시작 작업이 `replace` 를 부르기 전에 `current()`, `snapshot()` 을 부르면 `IllegalStateException("온톨로지를 아직 읽지 않았다")` 이다. `replace` 는 들고 있는 번호보다 클 때만 바꾼다(`synchronized`). 두 저장의 `afterCommit` 이 거꾸로 돌아도 낮은 번호로 돌아가지 않게 하려는 것이다. 테스트가 holder 를 DB 최신 버전에 맞출 때도 `replace` 를 쓴다(같은 모듈이라 `internal` 이 보인다).
- 테스트용으로 `companion object { fun fixed(o: Ontology, version: Int = 1): OntologyHolder }` 를 둔다. 단위 테스트가 `OntologyValidator(OntologyHolder.fixed(...))` 로 만든다.

새 파일 `ontology/OntologyVersionStore.kt`

- `@Component class OntologyVersionStore(client: Neo4jClient, holder: OntologyHolder, transactionManager: PlatformTransactionManager)`.
- `fun latestNumber(): Int`: `OntologyHead.version`(없으면 0)이다. YAML 을 읽지 않는다.
- `fun latest(): OntologySnapshot?`: `MATCH (v:OntologyVersion) RETURN v ORDER BY v.version DESC LIMIT 1` 를 읽고 `OntologyLoader.parse(v.yaml)` 로 바꾼다. 읽지 못하면 `OntologyLoader` 의 예외가 그대로 나간다.
- `fun list(page: PageQuery): Page<OntologyVersionSummary>`, `fun get(version: Int): OntologyVersionDetail?`(yaml 포함). 둘 다 YAML 을 읽지 않고 저장된 문자열을 그대로 돌려준다. 요약은 `version, createdAt, createdBy, note, restoredFrom` 이다. 쪽 나누기는 `web/Paging.kt` 의 `PageQuery`, `Page` 를 쓴다.
- `fun append(edited: Ontology, actorId: String, note: String?, restoredFrom: Int?, expectedVersion: Int): OntologySnapshot`: 호출한 쪽의 쓰기 트랜잭션 안에서 돈다. 먼저 `OntologyLoader.consistencyErrors(edited)` 가 비지 않으면 `IllegalArgumentException(오류 목록)` 이다(검사하지 않은 정의가 저장돼 다음 시작에서 읽지 못하는 일을 막는다). 그다음 `MERGE (h:OntologyHead {key: 'ontology'}) ON CREATE SET h.version = 0 SET h._lock = true` 로 잠근 뒤 `h.version` 이 `expectedVersion` 과 다르면 `RevisionConflictException(expectedVersion.toLong(), h.version)` 이다. 새 번호는 `h.version + 1`, `schemaVersion` 은 그 번호의 문자열이다. `CREATE (:OntologyVersion {version, yaml: OntologyLoader.toYaml(...), createdAt: Timestamps.now(), createdBy: actorId, note, restoredFrom})` 와 `SET h.version = 새 번호 REMOVE h._lock` 을 한다. 트랜잭션이 커밋된 뒤 `holder.replace(...)` 가 돌도록 `TransactionSynchronizationManager.registerSynchronization` 의 `afterCommit` 에 건다. 트랜잭션 밖에서 부르면 `IllegalStateException` 이다.
- `fun bootstrap(repo: Ontology)`: 시작 작업이다. 자기 `TransactionTemplate`(시간 제한 `Limits.WRITE_TIMEOUT_SECONDS`)으로 돈다.
  1. 버전이 없으면 `append(repo, SYSTEM_ACTOR, "저장소 YAML 로 만든 첫 버전", null, expectedVersion = 0)`.
  2. 최신 버전을 `latest()` 로 읽는다. 로더가 읽지 못하면(`IllegalArgumentException`, Jackson 의 `DatabindException`, `StreamReadException` 만 잡는다) `log.error` 로 그 번호와 사유를 남기고 `append(repo, SYSTEM_ACTOR, "저장된 최신 버전을 읽지 못해 저장소 YAML 로 만든 버전", null, latestNumber())` 한 뒤 4단계로 간다. Neo4j 시간 초과나 연결 오류 같은 다른 예외는 잡지 않고 시작을 멈춘다. 일시적인 장애로 ADMIN 이 고친 정의를 저장소 YAML 로 밀어내지 않기 위해서다.
  3. `CodeOwned.merge(latest, repo)` 한 결과가 최신과 다르면 `append(merged, SYSTEM_ACTOR, "코드가 소유하는 항목을 갱신", null, latest.version)`. 합친 정의의 `consistencyErrors` 가 비지 않으면 append 하지 않고 `log.error` 로 오류를 남긴 채 최신 버전으로 시작한다.
  4. `repo` 에만 있는 노드 타입, 관계 종류, 주장 종류 키가 있으면 `log.warn("저장소 YAML 에만 있는 온톨로지 항목: {}", keys)`.
  5. 끝에 `holder.replace(latest())`. `afterCommit` 이 이미 바꿨어도 다시 넣는다(같은 번호면 그대로다).
- 버전을 만들 때마다 `ChangeEvent` 를 남기는 일은 phase 02 의 저장 서비스가 맡는다. 시작할 때 만든 버전은 이력을 남기지 않는다.

### 4. 시작 순서와 제약

`config/Neo4jSchemaInitializer.kt`

- 생성자의 `ontology: Ontology` 를 `holder: OntologyHolder`, `versions: OntologyVersionStore` 로 바꾼다.
- `STATEMENTS` 에 `"CREATE CONSTRAINT ontology_version_unique IF NOT EXISTS FOR (v:OntologyVersion) REQUIRE v.version IS UNIQUE"` 와 `"CREATE CONSTRAINT ontology_head_key_unique IF NOT EXISTS FOR (h:OntologyHead) REQUIRE h.key IS UNIQUE"` 를 더한다.
- 순서는 `replaceRangeSearchIndex()`, `STATEMENTS` → `versions.bootstrap(OntologyLoader.loadDefault())` → `holder.current().allRelationshipTypes` 로 관계 인덱스 → `legacyValueCleanup.run()` → `seedLoader.run()` → `ensureAdmin()` 이다. 클래스 주석을 이 순서로 고친다.
- 관계 인덱스 만들기는 `fun ensureRelationshipIndexes(types: Collection<String>)` 로 꺼내 `public` 으로 둔다. phase 02 가 저장 뒤에 부른다.

### 5. 주입을 holder 로 바꾸기

- 위 13곳의 `private val ontology: Ontology` 를 `private val holder: OntologyHolder` 로 바꾸고, 온톨로지를 쓰는 public 메서드 처음에 `val ontology = holder.current()` 를 둔다. private 도우미가 온톨로지를 쓰면 인자로 넘긴다. 동작은 바뀌지 않아야 한다.
- `OntologyValidator` 도 같다. `validateCreate`, `validatePatch` 등 public 메서드마다 한 번 받는다.
- `SeedLoaderIntegrationTest` 의 `@Autowired lateinit var ontology: Ontology` 는 `@Autowired lateinit var holder: OntologyHolder` 로 바꾼다. 「seeds enabled 가 false 이면 …」 테스트가 `SeedLoader(neo4j, nodes, relationships, ontology, …)` 를 직접 만들므로 그 자리에 `holder` 를 넘긴다. 온톨로지 값이 필요한 곳은 `holder.current()` 다.

- `LegacyValueCleanup` 의 `targets` 는 생성 시점 필드 초기화에서 온톨로지를 읽는다. 필드에서 지우고 `run()` 안에서 `holder.current()` 로 계산한다. 빈을 만드는 시점에는 holder 가 비어 있어 필드 초기화에서 부르면 컨텍스트가 뜨지 않는다.

### 6. 읽기 API 와 헤더

`ontology/OntologyController.kt`

- `GET /api/ontology` 는 최신 `Ontology` 를 JSON 으로 바꾼 맵에 `version`, `versionCreatedAt`, `versionCreatedBy`(`UserRef`, `system` 이면 `null`)를 더해 돌려준다. `schemaVersion` 은 버전 번호의 문자열이다.
- `GET /api/ontology/versions?page&size`, `GET /api/ontology/versions/{version}`(없으면 `NotFoundException(version.toString())`), `GET /api/ontology/export` 를 더한다. 목록과 상세의 `createdBy` 는 `UserRef?` 다. `export` 는 `ResponseEntity<String>` 에 `Content-Type: application/yaml;charset=UTF-8`, `Content-Disposition: attachment; filename="financial-ontology-v<버전>.yaml"` 이다.

`config/SecurityConfig.kt`

- `GET /api/**` 규칙 앞에 `.requestMatchers("/api/ontology/versions", "/api/ontology/versions/**", "/api/ontology/export", "/api/ontology/preview").hasRole("ADMIN")` 를 더한다.

새 파일 `ontology/OntologyVersionHeaderFilter.kt`

- `OncePerRequestFilter` 다. `/api/` 로 시작하는 요청이면 체인을 부르기 전에 `X-Ontology-Version: <holder.snapshotOrNull()?.version>` 을 `setHeader` 로 넣는다. holder 가 비어 있으면 넣지 않는다. 인증 실패(401)와 오류 응답에도 붙도록 Security 필터보다 앞에서 돈다(`RequestSizeFilter` 가 더 앞이라 413, 411 응답에는 붙지 않는다. 받아들이는 예외다)(`@Order(Ordered.HIGHEST_PRECEDENCE + 1)`, `web/RequestSizeFilter.kt` 와 같은 방식).

### 7. 저장소 YAML 과 문서

- `financial-workbench/docs/api-contract.md` 의 역할 표에서 ADMIN 권한에 온톨로지 편집을 더하고, 「온톨로지 정의는 Git 의 YAML 로 관리하고 웹에서 바꾸지 않는다」 문장을 새 동작에 맞게 고친다. 변경 파일 표에 이 문서를 더한다.

- `financial-workbench/ontology/financial-ontology.yaml` 머리 주석의 첫 네 줄을 바꾼다. 「이 파일은 DB 가 비었을 때의 첫 버전과, 서버 코드가 소유하는 부분(reviewStatuses, changeActions, changeFields, claimRelationships, Claim 타입)의 원본이다. 그 밖의 부분은 첫 버전을 만든 뒤 ADMIN 이 웹에서 고친다. docs/data-schema.md 의 「온톨로지 버전」.」 과 「schemaVersion 은 저장할 때 서버가 버전 번호로 바꾼다.」 를 쓴다.
- `changeFields` 끝에 phase 02 의 온톨로지 이력이 쓸 키를 더한다: `added: { label: 더한 항목 }`, `removed: { label: 뺀 항목 }`, `changed: { label: 바뀐 항목 }`. 같은 이름의 기존 키가 없는지 `git grep -n "added\|removed\|changed" financial-workbench/ontology` 로 확인한다. `history/ChangeController.kt` 의 `CHANGE_FIELD_KEYS` 에도 세 키를 더한다. `OntologyLabelsTest` 가 `changeFields.keys` 와 이 목록이 정확히 같은지 본다.

### 8. 이 phase 를 검증하는 테스트

- `ontology/OntologyLabelsTest.kt`, `ontology/OntologyValidatorTest.kt`: `OntologyValidator(ontology)` 를 만드는 곳은 `OntologyValidator(OntologyHolder.fixed(ontology))` 로 바꾼다. 새 테스트 「YAML 로 쓰고 다시 읽으면 같다」(`parse(toYaml(loadDefault())) == loadDefault()`). 새 테스트 「주장 종류를 더하면 Claim 의 predicate 선택지도 생긴다」: `claimPredicates` 에 `TEST_PREDICATE` 를 더한 YAML 을 `parse` 하면 Claim `predicate` 의 `values` 에 그 키가 있다. 「주장 종류를 빼도 읽힌다」: 저장소 정의에서 `ADVOCATES` 를 뺀 정의를 `CodeOwned.merge(edited, loadDefault())` 하면 `consistencyErrors` 가 비고 Claim `predicate` 의 `values`, `valueLabels` 에 `ADVOCATES` 가 없다. 「주장 종류 이름을 바꾸면 Claim 선택지 이름도 바뀐다」: `SUPPLIES_TO.label` 을 바꾼 정의를 합치면 Claim `predicate.valueLabels.SUPPLIES_TO` 가 새 이름이다. 「오류를 모두 모은다」: `hintProperties: [nope]` 와 `searchProperties: [nope2]` 를 함께 넣은 정의의 `consistencyErrors` 가 두 문장이다.
- 새 파일 `ontology/CodeOwnedTest.kt`: `merge` 가 고친 `reviewStatuses.DRAFT.label` 을 저장소 값으로 되돌리고 `ignoredPaths` 가 `reviewStatuses.DRAFT` 를 담는다. `nodeTypes` 에서 Claim 을 뺀 정의를 `merge` 하면 Claim 이 돌아온다. `CodeReadKeys.violations` 가 `Document.url` 을 뺀 정의, `Security.ticker` 를 `required: false` 로 바꾼 정의에서 오류를 내고, `Document.title` 의 `label` 만 바꾼 정의에서는 빈 목록이다. `CodeOwned.errors` 가 새 타입 `Fund` 에 `managedBy: claims` 를 단 정의에서 오류를 낸다. `ignoredPaths(edited, merge(edited, repo))` 는 주장 종류만 더한 정의에서 빈 목록이다.
- 새 파일 `ontology/OntologyVersionIntegrationTest.kt`(`IntegrationTest` 상속)
  - 각 테스트 앞(`@BeforeEach`)에 `holder.replace(versions.latest()!!)` 로 이 컨텍스트의 holder 를 DB 최신 버전에 맞춘다.
  - `bootstrap` 을 한 번 더 불러도 버전이 늘지 않는다(최신 번호를 앞뒤로 비교).
  - 저장소에만 있는 주장 종류가 있어도 시작이 멈추지 않는다: 최신 버전에서 `CRITICIZES` 를 뺀 정의를 `append` 한 뒤 `bootstrap(loadDefault())` 가 예외 없이 끝나고, 최신 버전의 Claim `predicate.values` 에 `CRITICIZES` 가 없다(편집한 쪽이 이긴다).
  - 읽지 못하는 최신 버전: Cypher 로 `OntologyHead.version` 을 하나 올리고 그 번호의 `:OntologyVersion` 을 알 수 없는 키가 든 YAML 로 만든 뒤 `bootstrap` 을 부르면, 예외 없이 끝나고 다음 번호의 버전이 메모 「저장된 최신 버전을 읽지 못해 저장소 YAML 로 만든 버전」 으로 생기며 `holder.current()` 가 그 버전이다. 읽지 못한 버전은 `GET /api/ontology/versions/{그 번호}` 로 그대로 읽힌다.
  - 최신 버전의 `reviewStatuses.DRAFT.label` 을 바꿔 `append` 한 뒤(테스트가 `TransactionTemplate` 으로 감싼다) `bootstrap` 을 부르면 버전이 하나 늘고 메모가 「코드가 소유하는 항목을 갱신」 이며 label 이 저장소 값이다.
  - `GET /api/ontology` 가 `version`(정수)과 `schemaVersion == version.toString()` 을 담고, 응답 헤더 `X-Ontology-Version` 이 같은 값이다. 익명 요청의 401 응답에도 헤더가 있다.
  - ADMIN 의 `GET /api/ontology/versions` 첫 항목 번호가 최신과 같고, `GET /api/ontology/versions/{최신}` 의 `yaml` 을 `OntologyLoader.parse` 할 수 있다. `GET /api/ontology/export` 의 `Content-Disposition` 에 `financial-ontology-v<최신>.yaml` 이 있다.
  - EDITOR(`ALICE`)의 `GET /api/ontology/versions` 와 `/export` 는 `403 FORBIDDEN` 이다. VIEWER 의 `GET /api/ontology` 는 `200` 이다.
  - 버전을 바꾼 테스트는 끝(`@AfterEach`)에 저장소 YAML 로 `append` 해 최신 정의를 되돌린다. 다른 테스트 클래스가 같은 컨텍스트를 쓰기 때문이다.
- `AuthIntegrationTest.kt` 의 `assertThat(ontology["schemaVersion"].asString()).isEqualTo("1.4.0")` 은 `assertThat(ontology["schemaVersion"].asString()).isEqualTo(ontology["version"].asInt().toString())` 로 바꾼다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.ontology.*' --tests 'dev.fos.workbench.AuthIntegrationTest' --tests 'dev.fos.workbench.knowledge.SeedLoaderIntegrationTest'
cd financial-workbench/api && ./gradlew test
! git grep -n "private val ontology: Ontology" -- financial-workbench/api/src/main
git grep -q "ontology_version_unique" -- financial-workbench/api/src/main
```

- 각 줄은 저장소 루트에서 돈다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/docs/api-contract.md` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/CodeOwned.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyHolder.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyVersionStore.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyVersionHeaderFilter.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyValidator.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/graph/GraphService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/history/ChangeController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/KnowledgeReader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/LegacyValueCleanup.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/RelationshipService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/RevisionGuard.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/SeedLoader.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/CodeOwnedTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyVersionIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt` | 수정 |
