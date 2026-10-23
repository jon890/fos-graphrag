# Phase 02. 미리보기, 저장, 되돌리기와 정의에서 빠진 데이터

**Execution profile**: deep

## 목표

ADMIN 이 보낸 온톨로지 정의를 미리보기(바뀐 점, 영향, 무시한 코드 소유 항목)로 보여 주고, 확인하면 새 버전으로 저장하거나 예전 버전으로 되돌리는 API 를 만든다.
저장하면 이력을 남기고, 새 관계 종류의 인덱스를 만들고, 다음 요청부터 새 버전으로 검증한다.
타입이나 관계 종류를 뺀 뒤 남은 데이터도 읽을 수 있게 읽기 경로를 고친다.

**범위 외**: 화면은 phase 03, 04 다. 이 phase 는 `financial-workbench/web/` 을 고치지 않는다. 버전 저장소, holder, 읽기 API, 헤더는 phase 01 이 만들었다.

## 컨텍스트

- phase 01 이 만든 것(`financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/`):
  - `OntologyHolder`: `current()`, `snapshot()`.
  - `OntologyVersionStore`: `latest()`, `get(version)`, `append(edited, actorId, note, restoredFrom, expectedVersion)`. `append` 는 호출한 쓰기 트랜잭션 안에서 `OntologyHead` 를 잠그고, 번호가 `expectedVersion` 과 다르면 `RevisionConflictException` 을 던지고, 커밋 뒤 holder 를 바꾼다.
  - `CodeOwned.merge(edited, repo)`, `CodeOwned.ignoredPaths(edited, repo)`, `CodeReadKeys.violations(edited, repo)`.
  - `OntologyLoader.parse(text)`, `toYaml(o)`, `loadDefault()`. `load` 는 읽기 → `withDerivedClaimPredicate` → `checkConsistency`(첫 오류에서 `require` 예외) 순서다.
  - `Neo4jSchemaInitializer.ensureRelationshipIndexes(types)`.
  - `SecurityConfig` 가 `/api/ontology/preview`, `/api/ontology/versions/**` 를 ADMIN 으로 막는다. `POST /api/ontology/versions` 도 `/api/ontology/versions` 규칙에 걸린다.
  - `OntologyVersionHeaderFilter` 가 체인 전에 `X-Ontology-Version` 을 넣는다.
- 오류는 `web/ApiError.kt` 의 `ApiException(status, code, message, details)` 하위 클래스로 던진다. `GlobalExceptionHandler` 가 `{code, message, details}` 로 바꾼다.
- 이력은 `history/ChangeEventRecorder.kt` 의 `ChangeEventDraft(actorId, action, targetId, targetKind, targetType, targetLabel, revision, changes, note)` 와 `FieldChange(before, after)` 다. `TargetKind` 는 `NODE, RELATIONSHIP, USER` 다. `history/ChangeController.kt` 의 목록은 `targetKind <> 'USER'` 만 ADMIN 에게 한정한다.
- 본문 크기는 `web/RequestSizeFilter.kt` 가 `Limits.MAX_BODY_BYTES`(64KiB)로 막는다. 저장소 YAML 은 지금 약 16KB 다.
- 읽기 경로에서 온톨로지 정의가 없으면 깨지는 곳:
  - `knowledge/KnowledgeReader.kt` 의 `toNodeView` 가 `ontology.requireNodeType(type)` 를 불러, 빠진 타입의 노드가 검색 결과에 하나라도 있으면 그 요청 전체가 `400` 이다. 속성은 `def.properties.keys` 로 나눠 담는다.
  - `ontology/Ontology.kt` 의 `labelOf` 는 정의가 없으면 타입 키를 돌려준다.
  - `knowledge/NodeQueryService.kt` 의 `detail` 이 관계를 `type(r) IN ontology.relationshipTypes.keys` 로 좁혀, 빠진 관계 종류의 관계가 상세에서 사라진다.
- 시스템 속성 목록은 `OntologyLoader.RESERVED_PROPERTIES` 다.
- 통합 테스트는 `support/IntegrationTest.kt` 를 상속하고 모든 테스트 클래스가 컨텍스트와 Neo4j 를 함께 쓴다. 버전 번호를 상수로 단언하지 않는다. 노드는 `support/Fixtures.kt` 의 `node(type, properties)` 로 만든다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「온톨로지 버전」(저장, ChangeEvent, 새 관계 종류의 인덱스, 코드가 소유하는 부분, 코드가 이름으로 읽는 키, 어긋나는 변경의 영향 표와 `kind`, 키 규칙, 정의에서 빠진 데이터, 초기 데이터와의 관계), `financial-workbench/docs/api-contract.md` 의 「온톨로지」 표와 `OntologyPreview`, 오류 코드 표의 `ONTOLOGY_INVALID`, `ONTOLOGY_IMPACT_UNCONFIRMED`, `PAYLOAD_TOO_LARGE`, 「상한」 표, 「변경 이력」 의 `targetKind`, `financial-workbench/docs/flow.md` 의 「미리보기와 저장」, `financial-workbench/docs/adr/008-ontology-versions-in-db.md`

## 의도 메모

- 영향은 세기만 하고 데이터를 고치지 않는다(사용자 결정 2026-10-23, 경고하고 허용).
- 키는 바꾸지 않는다. 바뀐 키는 「뺌」 과 「더함」 으로 보인다(사용자 결정 2026-10-23).
- 영향을 셀 때 Cypher 에 이름을 잇지 않는다. 노드는 `n.type = $type`, 속성은 `n[$prop]`, 관계는 `type(r) = $rel` 로 비교한다. 이름이 사용자 입력에서 오기 때문이다.
- 미리보기를 저장 트랜잭션 안에서 다시 계산한다. 미리보기 응답을 받은 뒤 데이터가 바뀌어 새 영향이 생기면 저장이 `409 ONTOLOGY_IMPACT_UNCONFIRMED` 다. `confirm: true` 는 그때의 영향 전체를 받아들인다는 뜻이다.
- 인덱스는 저장 트랜잭션 밖에서 만든다. Neo4j 는 한 트랜잭션에서 스키마와 데이터를 함께 바꾸지 못한다. 인덱스 만들기가 실패해도 버전은 남기고 `warn` 로그만 남긴다. 다음 시작이 다시 만든다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. 로더: 오류를 모으는 읽기

`ontology/OntologyLoader.kt`

- `checkConsistency` 를 `fun consistencyErrors(o: Ontology): List<String>` 로 바꿔 오류를 모두 모은다. 기존 `require` 하나하나가 목록에 문장을 더한다. `load` 는 목록이 비지 않으면 지금처럼 `IllegalArgumentException(첫 오류)` 를 던진다. 시작 동작과 기존 테스트는 바뀌지 않는다.
- `fun readEdited(text: String): Result` 와 `fun readEdited(definition: JsonNode): Result` 를 더한다. `Result` 는 `Ok(ontology)` 나 `Invalid(errors)` 다. 읽기 → `CodeOwned.merge(read, loadDefault())` → `withDerivedClaimPredicate` → `consistencyErrors` → `CodeReadKeys.violations` → 더한 키의 형식 검사 순서다.
  - 정의에서 `schemaVersion` 과 `claimRelationships` 는 없어도 되게 `Ontology` 의 두 필드에 기본값(`""`, `emptyMap()`)을 준다. `merge` 가 채운다.
  - Jackson 예외는 문장으로 바꾼다. `UnrecognizedPropertyException` 은 「알 수 없는 키 `<propertyName>` (줄 N)」, 그 밖의 `DatabindException` 은 「값의 형식이 맞지 않습니다: `<path 를 . 으로 이은 것>` (줄 N)」, YAML 문법 오류는 「YAML 을 읽지 못했습니다 (줄 N)」 다. 클래스 이름과 원래 메시지는 담지 않는다.
  - 더한 키의 형식(최신 버전에 없던 키만): 노드 타입 `^[A-Z][A-Za-z0-9]*$`, 관계 종류와 주장 종류 `^[A-Z][A-Z0-9_]*$`, 속성 `^[a-z][A-Za-z0-9]*$`. 틀리면 「새 노드 타입 키는 영문 대문자로 시작하고 영문자와 숫자만 씁니다: `<키>`」 같은 문장이다.

### 2. 바뀐 점과 영향

새 파일 `ontology/OntologyDiff.kt`

- `fun diff(latest: Ontology, edited: Ontology): DiffResult(added, removed, changed)`. 코드 소유 부분은 비교하지 않는다. 경로 규칙:
  - 노드 타입, 관계 종류, 주장 종류: 키가 생기거나 빠지면 `nodeTypes.X`, `relationshipTypes.X`, `claimPredicates.X`.
  - 속성: `nodeTypes.X.properties.p`. enum 값은 `nodeTypes.X.properties.p.values.V`.
  - 그 밖의 필드가 바뀌면 `changed` 에 필드 경로(`nodeTypes.X.label`, `nodeTypes.X.properties.p.required`, `relationshipTypes.X.from` 등)를 담는다.
- 목록은 사전순으로 정렬한다.

새 파일 `ontology/OntologyImpactCounter.kt`

- `@Component class OntologyImpactCounter(client: Neo4jClient)` 의 `fun count(latest: Ontology, edited: Ontology): List<OntologyImpact>`. `OntologyImpact(path, kind, count)` 다. 보관된 것도 센다. `count == 0` 은 담지 않는다.
- `kind` 와 세는 쿼리는 `data-schema.md` 「어긋나는 변경」 표를 따른다. `NARROWED_RANGE` 는 `maxLength` 면 `size(toString(n[$prop])) > $max`, `min`/`max` 면 `n[$prop] < $min OR n[$prop] > $max` 다. `NARROWED_RELATIONSHIP_ENDS` 는 `NOT a.type IN $from OR NOT b.type IN $to`, `NARROWED_CLAIM_TYPES` 는 `SUBJECT` 끝의 `type` 이 새 `subjectTypes` 밖이거나 `OBJECT` 끝의 `type` 이 새 `objectTypes` 밖인 그 종류의 주장 수다.
- 빠진 타입의 속성은 따로 세지 않는다. `REMOVED_NODE_TYPE` 하나로 센다.

### 3. 편집 서비스와 API

새 파일 `ontology/OntologyEditService.kt`

- `fun preview(baseVersion: Int, input: EditInput): OntologyPreview`(읽기 트랜잭션). `EditInput` 은 `yaml: String?` 이나 `definition: JsonNode?` 가운데 하나다. 둘 다 있거나 둘 다 없으면 `ValidationFailedException(mapOf("yaml" to "yaml 이나 definition 가운데 하나만 보냅니다."))` 다.
  - 응답은 `api-contract.md` 의 `OntologyPreview` 다(`valid, errors, added, removed, changed, impacts, codeOwnedIgnored, yaml, definition`). 읽지 못하면 `valid: false`, `yaml`, `definition` 은 `null` 이다. 일관성 검사에서만 틀렸으면 `yaml`, `definition` 은 정규화한 값이다.
  - `baseVersion` 이 최신이 아니어도 미리보기는 답한다. 비교는 언제나 최신 버전과 한다.
- `@Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS) fun save(baseVersion: Int, input: EditInput, note: String?, confirm: Boolean, actorId: String, restoredFrom: Int? = null): SaveResult`
  1. 읽기와 검사. `Invalid` 면 `OntologyInvalidException(errors)`(`400 ONTOLOGY_INVALID`, `details.errors`).
  2. `versions.append(...)` 전에 최신 번호가 `baseVersion` 과 다르면 `RevisionConflictException`. `append` 도 잠근 뒤 다시 확인한다.
  3. 영향이 있고 `confirm` 이 아니면 `OntologyImpactUnconfirmedException(impacts)`(`409 ONTOLOGY_IMPACT_UNCONFIRMED`, `details.impacts`).
  4. `append`, 이력: `ChangeEventDraft(actorId, if (restoredFrom != null) RESTORE else UPDATE, 새 번호.toString(), TargetKind.ONTOLOGY, "Ontology", "버전 <새 번호>", 새 번호.toLong(), changes, note)`. `changes` 는 비지 않은 것만 `added → FieldChange(null, 목록)`, `removed → FieldChange(목록, null)`, `changed → FieldChange(null, 목록)` 이다.
  5. `SaveResult(summary, newRelationshipTypes)` 를 돌려준다.
- `fun restore(version: Int, baseVersion: Int, note: String?, confirm: Boolean, actorId: String)`: `versions.get(version)` 이 없으면 `NotFoundException`. 그 YAML 로 `save(..., restoredFrom = version)` 를 부른다.
- `note` 는 1000자까지다. 넘으면 `ValidationFailedException(mapOf("note" to "1000자까지 적습니다."))`.

`history/ChangeEventRecorder.kt`: `TargetKind` 에 `ONTOLOGY` 를 더한다.

`web/ApiError.kt`: `OntologyInvalidException(errors: List<String>)`, `OntologyImpactUnconfirmedException(impacts: List<OntologyImpact>)` 를 더한다. 메시지는 「온톨로지 정의에 오류가 있습니다.」, 「기존 데이터와 어긋나는 변경입니다. 영향을 확인한 뒤 다시 저장하세요.」 다.

`ontology/OntologyController.kt`

- `POST /api/ontology/preview`, `POST /api/ontology/versions`(`201`), `POST /api/ontology/versions/{version}/restore`(`201`). 본문은 `api-contract.md` 와 같다. 작업자는 기존 컨트롤러처럼 인증 정보에서 사용자 ID 를 꺼낸다(`knowledge` 의 컨트롤러가 쓰는 방식을 따른다).
- 저장과 되돌리기는 서비스가 끝난 뒤(트랜잭션 밖) `schemaInitializer.ensureRelationshipIndexes(result.newRelationshipTypes)` 를 부르고, 실패하면 `warn` 로그만 남긴다. 그다음 `HttpServletResponse.setHeader("X-Ontology-Version", 새 번호)` 로 필터가 넣은 값을 바꾼다. `ResponseEntity` 의 헤더로 넣으면 값이 두 개가 될 수 있다.

`web/RequestSizeFilter.kt`, `config/Limits.kt`: `const val MAX_ONTOLOGY_BODY_BYTES = 512 * 1024L` 를 더하고, `POST /api/ontology/` 로 시작하는 요청은 이 값으로 비교한다. 413 메시지는 그 상한을 적는다.

### 4. 정의에서 빠진 데이터

- `Ontology.labelOf`: 정의가 없으면 `properties["name"]?.toString() ?: type`.
- `KnowledgeReader.toNodeView`: 정의가 없으면 저장된 속성에서 `OntologyLoader.RESERVED_PROPERTIES` 와 `_` 로 시작하는 키를 뺀 나머지를 모두 담는다. 정의가 있으면 지금처럼 정의된 속성만 담는다.
- `NodeQueryService.detail`: 관계를 `NOT type(r) IN $claimRelationships`(`ontology.claimRelationships.keys`)로 좁힌다. 빠진 관계 종류의 관계도 상세에 나온다.
- 고치기와 만들기는 지금처럼 `requireNodeType`, `requireRelationshipType`, `requirePredicate` 가 `400 ONTOLOGY_VIOLATION` 을 낸다. 노드 보관과 복원은 정의를 읽지 않으므로 그대로 된다. 이 동작을 테스트로 고정한다.

### 5. 이 phase 를 검증하는 테스트

- 새 파일 `ontology/OntologyDiffTest.kt`: 저장소 YAML 에 타입 하나를 더하고, 속성 하나를 빼고, label 하나를 바꾼 정의의 `diff` 가 세 목록에 그 경로를 하나씩 담는다. enum 값을 빼면 `...values.V` 가 `removed` 에 있다.
- `ontology/OntologyLabelsTest.kt` 에 「오류를 모두 모은다」: `hintProperties: [nope]` 와 `searchProperties: [nope2]` 를 함께 넣은 정의의 `consistencyErrors` 가 두 문장이다. 「알 수 없는 키는 줄 번호와 함께 알린다」: `readEdited` 가 `Invalid` 이고 문장에 키 이름과 「줄」 이 있으며 `dev.fos` 가 없다.
- 새 파일 `ontology/OntologyEditIntegrationTest.kt`(`IntegrationTest` 상속). `@BeforeEach` 에 시작 번호를 읽고, `@AfterEach` 에 ADMIN 으로 그 번호를 `restore`(`confirm: true`)해 정의를 되돌린다. 타입과 관계 키에는 테스트마다 다른 영문 접미사를 붙인다.
  - EDITOR 의 `POST /api/ontology/preview`, `POST /api/ontology/versions` 는 `403 FORBIDDEN` 이다.
  - 새 노드 타입을 YAML 로 더해 저장하면 `201`, 응답 헤더 `X-Ontology-Version` 이 새 번호다. 바로 EDITOR 가 그 타입의 노드를 `POST /api/nodes` 로 만들면 `201` 이다. `GET /api/changes?targetId=<새 번호>` 에 `targetKind == ONTOLOGY`, `action == UPDATE`, `changes.added` 가 있다.
  - 예전 `baseVersion` 으로 저장하면 `409 REVISION_CONFLICT` 다.
  - 값이 있는 속성을 빼는 정의: 미리보기의 `impacts` 에 `REMOVED_PROPERTY`, `count == 1` 이 있다. `confirm` 없이 저장하면 `409 ONTOLOGY_IMPACT_UNCONFIRMED` 와 `details.impacts`, `confirm: true` 면 `201` 이다. 그 뒤 노드 상세에 그 속성이 없고, 그 속성을 담은 `PATCH` 는 `400 ONTOLOGY_VIOLATION` 이다.
  - `Document.url` 을 뺀 정의는 미리보기가 `valid: false` 이고 저장이 `400 ONTOLOGY_INVALID` 다.
  - `reviewStatuses.DRAFT.label` 을 바꾼 정의는 미리보기 `codeOwnedIgnored` 에 `reviewStatuses.DRAFT` 가 있고, 저장한 뒤 `GET /api/ontology` 의 그 label 은 저장소 값이다.
  - 미리보기 응답의 `definition` 을 그대로 다시 미리보기로 보내면 `added`, `removed`, `changed` 가 모두 비어 있다.
  - 되돌리기: 시작 번호로 `restore` 하면 `201`, 새 버전의 `restoredFrom` 이 시작 번호이고 이력 `action` 이 `RESTORE` 다.
  - 새 관계 종류를 더해 저장하면 `SHOW INDEXES YIELD name` 에 `rel_<소문자 키>_id` 가 있다.
  - 새 타입의 노드를 만든 뒤 그 타입을 빼고(`confirm: true`) 저장하면, `GET /api/nodes/{id}` 가 `200` 이고 `label` 이 `name` 값, `properties` 에 저장한 값이 있다. `GET /api/nodes?q=<이름>` 도 `200` 이다. `PATCH` 는 `400 ONTOLOGY_VIOLATION`(`details.rule == unknown-node-type`), 보관은 `200` 이다.
  - 새 관계 종류로 관계를 만든 뒤 그 종류를 빼고 저장하면, 시작 노드의 `GET /api/nodes/{id}`(`NodeController` 가 `NodeQueryService.detail` 로 답하는 상세) 관계 목록에 그 관계가 남아 있다.
  - 주석으로 100KiB 를 채운 YAML 의 미리보기는 `413` 이 아니다. 600KiB 는 `413 PAYLOAD_TOO_LARGE` 다.
- `knowledge/SeedLoaderIntegrationTest.kt` 에 「최신 버전에 없는 타입을 쓰는 파일은 적용하지 않고 기록도 남기지 않는다」: `SeedFile(key = "test-unknown-<접미사>", nodes = listOf(SeedNode("a", "NoSuchType", mapOf("name" to "x"))))` 를 `applyInTransaction` 하면 `OntologyViolationException` 이고, `(:SeedRun {key})` 가 없다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.ontology.*' --tests 'dev.fos.workbench.knowledge.SeedLoaderIntegrationTest'
cd financial-workbench/api && ./gradlew test
git grep -q "ONTOLOGY_IMPACT_UNCONFIRMED" -- financial-workbench/api/src/main
```

- 각 줄은 저장소 루트에서 돈다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyDiff.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyImpactCounter.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyEditService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/history/ChangeEventRecorder.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/ApiError.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/RequestSizeFilter.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Limits.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/KnowledgeReader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyDiffTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyEditIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt` | 수정 |
