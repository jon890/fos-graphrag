# Phase 01. 온톨로지 변경 제안(`ONTOLOGY_CHANGE`)과 YAML 받기 도구

**Execution profile**: deep

## 목표

에이전트가 지금 온톨로지 YAML 을 받아 고친 뒤 `ONTOLOGY_CHANGE` 제안으로 올리고, ADMIN 이 승인하면 기존 저장 경로로 새 버전이 생기게 한다.

**범위 외**: 인스턴스 제안 종류(phase 02), 웹 화면(phase 03, 04), 플러그인 스킬(phase 05).

## 컨텍스트

- 제안의 종류와 검사는 `api/src/main/kotlin/dev/fos/workbench/proposal/ProposalPayloads.kt` 의 `ProposalKind`, `ProposalPayload`, `ProposalPayloads.check`, 실행은 `ProposalService.kt` 의 `acceptInTransaction`, `execute` 가 한다. 새 종류는 이 두 곳의 `when` 에 갈래를 더한다.
- 온톨로지 미리보기와 저장은 `ontology/OntologyEditService.kt` 의 `preview(EditInput)`, `save(baseVersion, input, note, confirm, actorId)` 다. `save` 는 기준 버전이 다르면 `RevisionConflictException`, 영향이 있는데 `confirm` 이 없으면 `OntologyImpactUnconfirmedException`, 틀리면 `OntologyInvalidException`, 바뀐 점이 없으면 `OntologyInvalidException(["바뀐 점이 없습니다."])` 를 던진다. 저장한 뒤 새 관계 종류 인덱스는 `OntologyController.saved` 처럼 트랜잭션 밖에서 `Neo4jSchemaInitializer.ensureRelationshipIndexes` 로 만든다.
- 승인 트랜잭션은 `ProposalService.write`(`TransactionTemplate`)다. `OntologyEditService.save` 의 `@Transactional` 은 여기에 합류한다. 새 버전의 `holder.replace` 는 `OntologyVersionStore.append` 의 `afterCommit` 이 한다.
- MCP 도구는 `mcp/McpTools.kt` 의 `specifications()` 에 `tool(...)` 로 더한다. 쓰기 도구는 `write = true` 다. `/api/v1` 경로는 `agent/v1/AgentV1Controller.kt`, 응답 DTO 는 `agent/v1/V1Dtos.kt` 다.
- 본문 상한은 `web/RequestSizeFilter.kt` 와 `config/Limits.kt` 의 `MAX_ONTOLOGY_BODY_BYTES` 다.
- 승인 요청 본문은 `ProposalController.kt` 의 `AcceptProposalRequest(payload)` 다.

**근거 문서**: `docs/api-contract.md` 의 「상한」, 「제안」, 「제안 내용」, 「`GET /api/v1/ontology/yaml`」, 「쓰기」, 「원격 MCP(`/mcp`)」 의 「도구」, `docs/data-schema.md` 의 「제안」, `docs/adr/017-agent-ontology-and-instance-proposals.md`

## 의도 메모

- 패치(JSON Patch) 제안은 기각했다(ADR-017). 정의 전체를 받는다.
- 기준 버전이 다르면 승인하지 않는다. `ONTOLOGY_CHANGE` 는 고친 payload 로 승인할 수 없다. 관리자가 기준 버전을 고쳐 남의 저장을 덮어쓰는 길을 막는다.
- `requiresEditor` 는 화면 호환으로 남기고 `requiredRole` 을 더한다. 열람자 규칙(VIEWER 가 개인 기록 제안을 승인)은 그대로다.
- `403` 역할 거절은 `lastError` 에 남기지 않는다. 지금 `acceptInTransaction` 이 `ExecutionFailed` 로 감싸기 전에 던지는 것과 같다.

## 작업 항목

### 1. `proposal/ProposalPayloads.kt`

- `ProposalKind(val requiresEditor: Boolean)` 을 `ProposalKind(val requiredRole: Role)` 로 바꾸고 `val requiresEditor get() = requiredRole != Role.VIEWER` 를 둔다. 값: `CREATE_NODE(EDITOR)`, `CREATE_RELATIONSHIP(EDITOR)`, `LINK_TRADE_DECISION(VIEWER)`, `STUDY_NOTE(VIEWER)`, `ONTOLOGY_CHANGE(ADMIN)`.
- `ProposalPayload.OntologyChange(val baseVersion: Int, val yaml: String, val note: String?)` 와 `toMap()`(`baseVersion`, `yaml`, `note`).
- `FIELDS` 에 `ONTOLOGY_CHANGE to setOf("baseVersion", "yaml", "definition", "note")`.
- 모양 검사: `baseVersion` 은 정수(소수점 없는 수만), `yaml`(문자열)과 `definition`(객체) 가운데 하나만(둘 다나 둘 다 없음은 `fieldErrors.yaml` = 「yaml 이나 definition 가운데 하나만 보냅니다.」), `note` 는 선택이고 1000자(`OntologyEditService.MAX_NOTE_LENGTH`)까지.
- 내용 검사 `checkOntologyChange`: `EditInput(yaml: String?, definition: JsonNode?)` 이라 payload 의 `definition`(Map)은 생성자에 더한 `JsonMapper` 의 `valueToTree<JsonNode>(definition)` 로 바꾼다. 그다음 `OntologyEditService.preview(EditInput(yaml, definition))` 를 부른다. `valid` 가 거짓이면 `OntologyInvalidException(errors)`, `added`, `removed`, `changed` 가 모두 비면 `OntologyInvalidException(listOf("바뀐 점이 없습니다."))`, `baseVersion != OntologyVersionStore.latestNumber()` 면 `RevisionConflictException(baseVersion.toLong(), current.toLong())`. 통과하면 `preview.yaml` 로 바꾼 `OntologyChange` 를 돌려준다. `definition` 으로 보냈어도 저장은 정규화한 YAML 이다.
- 생성자에 `OntologyEditService`, `OntologyVersionStore`, `JsonMapper` 를 더한다. `ProposalPayloads` 를 만드는 다른 곳이 있는지 `git grep -n "ProposalPayloads("` 로 확인하고 함께 고친다.

### 2. `proposal/ProposalService.kt`

- `acceptInTransaction(ownerId, role, id, editedPayload, confirm)`: 역할 검사를 `role.ordinal < proposal.kind.requiredRole.ordinal` 이면 `ForbiddenException` 으로 바꾼다. 문장은 `EDITOR` 면 「편집 권한이 있어야 승인할 수 있습니다.」, `ADMIN` 이면 「관리자만 승인할 수 있습니다.」.
- `ONTOLOGY_CHANGE` 에 `editedPayload` 가 있으면 `ValidationFailedException(mapOf("payload" to "온톨로지 변경 제안은 고쳐서 승인할 수 없습니다."))`. 역할 검사 뒤, `ExecutionFailed` 밖에서 던진다.
- `execute` 의 `OntologyChange` 갈래: `edits.save(baseVersion, EditInput(yaml, null), note ?: NOTE, confirm, ownerId)` 를 부르고 결과의 `newRelationshipTypes` 를 들고 나온다. `result` 는 `nodeIds`, `relationshipIds`, `tradeIds` 를 빈 목록으로, `ontologyVersion` 을 새 번호로 둔다. 다른 종류의 `result` 에는 `ontologyVersion = null` 을 담는다.
- `accept(ownerId, role, id, editedPayload, confirm: Boolean = false)` 는 `write.execute` 가 끝난 뒤(커밋 뒤) 새 관계 종류가 있으면 `Neo4jSchemaInitializer.ensureRelationshipIndexes` 를 부르고 실패하면 경고만 남긴다(`OntologyController.saved` 와 같은 문장). 반환 값으로 새 온톨로지 버전 번호를 알 수 있게 `StoredProposal.result["ontologyVersion"]` 을 쓴다.
- `views` 의 `ProposalView` 에 `requiredRole = item.kind.requiredRole.name` 을 더한다.

### 3. `proposal/ProposalController.kt`

- `ProposalView` 에 `val requiredRole: String` 을 `requiresEditor` 다음에 더한다.
- `AcceptProposalRequest(val payload: Any? = null, val confirm: Boolean = false)`.
- `accept` 는 결과의 `result.ontologyVersion` 이 있으면 `HttpServletResponse` 의 `OntologyVersionHeaderFilter.HEADER` 를 그 번호로 바꾼다(`OntologyController.saved` 와 같은 방법).

### 4. 본문 상한 `web/RequestSizeFilter.kt`

`max` 를 고를 때 `POST /api/v1/proposals` 와 `POST /mcp`(`/mcp/` 아래 포함)도 `Limits.MAX_ONTOLOGY_BODY_BYTES` 로 둔다. `Limits.kt` 의 주석을 같은 뜻으로 고친다.

### 5. YAML 받기: `/api/v1/ontology/yaml` 과 MCP `get_ontology_yaml`

- `V1Dtos.kt` 에 `data class V1OntologyYaml(val version: Int, val yaml: String)`.
- `V1Mapper` 나 `AgentQueryService` 에 `ontologyYaml()`: `OntologyVersionStore.latestNumber()` 와 `get(latest).yaml` 로 만든다(`OntologyController.export` 와 같은 읽기, 읽기 전용 트랜잭션).
- `AgentV1Controller` 에 `@GetMapping("/ontology/yaml")`.
- `McpTools` 에 조회 도구 `get_ontology_yaml`(제목 「온톨로지 정의 받기」). 설명: 온톨로지 정의 전체를 YAML 로 받는다, 정의를 바꾸려 할 때만 부른다, 결과의 `version` 을 `propose_ontology_change` 의 `baseVersion` 에 넣는다, 키의 뜻은 `get_ontology` 의 설명을 본다.

### 6. MCP 쓰기 도구 `propose_ontology_change`

- 입력 `baseVersion`(integer, 필수), `yaml`(string, 필수), `rationale`(string, 필수), `note`(string), `dedupeKey`(string). `write = true`.
- 처리기는 `proposals.submit(principal.userId, principal.tokenId, principal.tokenName, listOf(item))` 로 한 건을 올리고 `V1ProposalResult` 하나를 돌려준다. `item` 은 `kind = "ONTOLOGY_CHANGE"`, `payload = {baseVersion, yaml, note}`, `rationale`, `dedupeKey` 다. `baseVersion` 은 `Args.int` 로 읽는다.
- 설명: 올리기만 하고 바로 바뀌지 않는다, 관리자가 웹의 「제안」 에서 승인해야 반영된다, 먼저 `get_ontology_yaml` 로 받은 YAML 을 고쳐 전체를 보낸다, 틀리면 `ONTOLOGY_INVALID` 의 `details.errors`(줄 번호 포함)를 읽고 고쳐 다시 올린다, `REVISION_CONFLICT` 면 YAML 을 다시 받는다.
- `submit_proposals` 의 설명과 `PROPOSAL.kind` 설명에 `ONTOLOGY_CHANGE`({baseVersion, yaml, note})를 더하되 정의 전체는 `propose_ontology_change` 가 맞다고 적는다.
- `McpServerConfig.VERSION` 을 `1.1.0` 으로 올린다.

### 7. 이 phase 를 검증하는 테스트

`api/src/test/kotlin/dev/fos/workbench/proposal/OntologyChangeProposalIntegrationTest.kt`(신규). `ProposalIntegrationTest.kt` 의 `submitOne`, `accept`, `failure` 같은 도우미 모양을 따른다. 이 테스트는 공유 Neo4j 의 온톨로지를 실제로 바꾸므로 `ontology/OntologyEditIntegrationTest.kt` 의 `@BeforeEach`(`holder.replace(versions.latest()!!)`)와 `@AfterEach`(시작 버전 정의로 되돌리는 저장) 정리를 같은 방법으로 둔다. 지우거나 바꾸는 속성과 타입은 테스트가 직접 더한 것만 쓴다(`Fixtures` 가 쓰는 `Company.country` 같은 기존 속성은 건드리지 않는다).

- 형식 오류: 알 수 없는 키가 든 YAML 로 올리면 `400 ONTOLOGY_INVALID` 이고 `details.errors` 에 `(줄 ` 이 있다. 바뀐 점이 없는 YAML 도 `400 ONTOLOGY_INVALID` 다. 낡은 `baseVersion` 은 `409 REVISION_CONFLICT` 다. 셋 다 제안이 생기지 않는다.
- 비관리자 승인 거절: EDITOR 가 자기 `ONTOLOGY_CHANGE` 를 승인하면 `403 FORBIDDEN` 이고 제안은 `PENDING`, `lastError` 가 없다.
- 기준 버전이 바뀐 뒤 승인 거절: ADMIN 이 올린 뒤 같은 ADMIN 이 `POST /api/ontology/versions` 로 저장하면, 승인은 `409 REVISION_CONFLICT` 이고 버전 수가 그대로이며 `lastError.code` 가 `REVISION_CONFLICT` 다.
- 승인 뒤 새 버전과 변경 이력: 새 노드 타입을 더한 YAML 을 ADMIN 이 승인하면 `200` 과 `ProposalView(ACCEPTED)` 이고, `result.ontologyVersion` 이 이전 번호보다 1 크고, 응답 헤더 `X-Ontology-Version` 이 같은 값, `GET /api/ontology/versions` 맨 위의 `note` 가 payload 의 `note`, `ChangeEvent`(`targetKind = ONTOLOGY`)의 작업자가 승인한 ADMIN 이다. 그 뒤 새 타입의 노드를 `POST /api/nodes` 로 만들 수 있다.
- 영향 확인: 테스트가 먼저 더한 타입에 노드를 만든 뒤, 그 노드가 쓰는 속성을 지운 YAML 은 `confirm` 없이 승인하면 `409 ONTOLOGY_IMPACT_UNCONFIRMED`, `confirm: true` 면 승인된다.
- 고쳐서 승인 거절: `payload` 를 담은 승인은 `400 VALIDATION_FAILED`(`fieldErrors.payload`).

`api/src/test/kotlin/dev/fos/workbench/mcp/McpIntegrationTest.kt`(수정):

- `contractTools` 에 `get_ontology_yaml`, `propose_ontology_change`, `writeTools` 에 `propose_ontology_change` 를 더한다.
- 「조회만」 연결로 `propose_ontology_change` 를 부르면 `INSUFFICIENT_SCOPE` 도구 오류이고 제안이 생기지 않는다.
- 「조회와 기록」 연결로 `get_ontology_yaml` 의 `version`, `yaml` 을 받아 타입 하나를 더해 `propose_ontology_change` 를 부르면 결과 `V1ProposalResult` 의 `status` 가 `created`, `proposal.kind` 가 `ONTOLOGY_CHANGE` 다.
- 64KiB 를 넘고 512KiB 안인 YAML(긴 `description` 을 더한 정의)을 담은 `propose_ontology_change` 가 `413` 없이 처리된다.

`api/src/test/kotlin/dev/fos/workbench/agent/AgentWriteIntegrationTest.kt`(수정): `GET /api/v1/ontology/yaml` 이 `GET /api/ontology/export` 와 같은 YAML 과 지금 버전 번호를 준다.

`ProposalIntegrationTest.kt` 에 `requiredRole` 단언을 하나 더한다(`CREATE_NODE` 는 `EDITOR`, `STUDY_NOTE` 는 `VIEWER`).

## 검증

```bash
cd api && ./gradlew test --rerun --tests 'dev.fos.workbench.proposal.*' --tests 'dev.fos.workbench.mcp.*' --tests 'dev.fos.workbench.agent.*' --tests 'dev.fos.workbench.ontology.*'
cd api && ./gradlew test --rerun
```

둘 다 `BUILD SUCCESSFUL`. 두 번째는 오래 걸리니 백그라운드로 돌린다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `api/src/main/kotlin/dev/fos/workbench/proposal/ProposalPayloads.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/proposal/ProposalService.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/proposal/ProposalController.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/web/RequestSizeFilter.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/config/Limits.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Dtos.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Mapper.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentV1Controller.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpTools.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpServerConfig.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/proposal/OntologyChangeProposalIntegrationTest.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/proposal/ProposalIntegrationTest.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/mcp/McpIntegrationTest.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/agent/AgentWriteIntegrationTest.kt` | 수정 |
