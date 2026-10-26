# Phase 02. 인스턴스 고치기, 보관, 주장 만들기 제안

**Execution profile**: deep

## 목표

에이전트가 항목 속성 고치기(`UPDATE_NODE`), 항목 보관(`ARCHIVE_NODE`), 관계 보관(`ARCHIVE_RELATIONSHIP`), 주장 만들기(`CREATE_CLAIM`)를 제안으로 올리고, 편집자가 승인하면 기존 서비스로 실행되게 한다. 친구가 인스턴스 층을 대화로 끝까지 고칠 수 있게 하는 빈 곳 채우기다.

**범위 외**: 온톨로지 변경(phase 01), 웹의 제안 카드(phase 04), 스킬(phase 05). 주장 내용 고치기와 되살리기는 뒤로 미뤘다(`index.json` 의 `deferred`).

## 컨텍스트

- phase 01 이 `ProposalKind(requiredRole)` 와 `ONTOLOGY_CHANGE` 를 더했다. 같은 파일(`proposal/ProposalPayloads.kt`, `proposal/ProposalService.kt`)의 `when` 에 갈래를 더한다.
- 실행에 쓰는 기존 서비스와 요청:
  - `NodeService.patch(id, PatchNodeRequest(expectedRevision, properties), actorId)`
  - `NodeService.archive(id, RevisionRequest(expectedRevision, reason), actorId)`
  - `RelationshipService.archive(id, RevisionRequest(expectedRevision, reason), actorId)`. 주장 관계면 `OntologyViolationException("claim-relationship", …)` 이다.
  - `ClaimService.create(CreateClaimRequest(predicate, subjectId, objectId, documentIds, description, evidenceText, validFrom, validTo, authoringMethod = "AI", extractionConfidence = null), actorId)`
- 이 서비스들은 변경 이력에 `note` 를 받지 않는 것이 있다. `patch`, `archive`, `ClaimService.create` 의 이력 메모는 지금 그대로 둔다(`archive` 는 `reason` 이 메모다). `CREATE_NODE` 처럼 `NOTE` 를 넘길 수 있는 곳만 넘긴다.
- revision 읽기와 비교는 `knowledge/RevisionGuard.kt`(`lockNode`, `requireRevision`, `requireActive`)가 한다. 올릴 때의 검사는 잠그지 않고 `KnowledgeReader.nodeProps(id)` 로 읽어 비교한다.
- 관계 하나를 id 로 읽는 것은 `RelationshipService.view(id)`(`RelationshipView`)다. 없으면 `NotFoundException` 이다.
- `ProposalService.views` 가 `refs` 를 만든다. 지금은 `nodes`, `trades` 둘이다.
- MCP 의 `submit_proposals` 설명과 `PROPOSAL` 스키마는 `mcp/McpTools.kt` 에 있다.

**근거 문서**: `docs/api-contract.md` 의 「제안」 과 「제안 내용」, 「노드」, 「관계」, 「Claim」, `docs/adr/017-agent-ontology-and-instance-proposals.md`

## 의도 메모

- `ARCHIVE_RELATIONSHIP` 은 `expectedRevision` 을 받지 않는다. 에이전트가 읽는 `V1Relation` 에 관계의 revision 이 없다. 승인할 때 잠근 관계의 지금 revision 을 쓴다.
- `UPDATE_NODE`, `ARCHIVE_NODE` 는 올릴 때와 승인할 때 둘 다 revision 을 비교한다. 그 사이 바뀐 노드를 에이전트의 옛 판단으로 덮어쓰지 않는다.
- 고쳐서 승인은 새 종류에 열지 않는다(화면도 「승인」 만 둔다).

## 작업 항목

### 1. `proposal/ProposalPayloads.kt`

- `ProposalKind` 에 `UPDATE_NODE(EDITOR)`, `ARCHIVE_NODE(EDITOR)`, `ARCHIVE_RELATIONSHIP(EDITOR)`, `CREATE_CLAIM(EDITOR)`.
- `ProposalPayload` 에 `UpdateNode(nodeId, expectedRevision: Long, properties)`, `ArchiveNode(nodeId, expectedRevision: Long, reason: String?)`, `ArchiveRelationship(relationshipId, reason: String?)`, `CreateClaim(predicate, subjectId, objectId, documentIds: List<String>, description: String?, evidenceText: String?, validFrom: String?, validTo: String?)` 와 각 `toMap()`. 모양은 `docs/api-contract.md` 「제안 내용」 의 표다.
- `FIELDS` 에 네 종류의 칸 집합을 더한다.
- 모양 검사: `expectedRevision` 은 0 이상의 정수, `properties` 는 1개 이상인 객체, `reason` 은 선택이고 1000자까지, `documentIds` 는 문자열 1~20개(`Limits.MAX_DOCUMENTS_PER_CLAIM`).
- 내용 검사:
  - `UPDATE_NODE`: 노드를 읽어 Claim(`managedBy` 가 있는 타입)이면 `OntologyViolationException("claim-via-claims-api", …)`, 보관됐으면 `ArchivedException`, revision 이 다르면 `RevisionConflictException`. `validator.validatePatch(type, properties)` 의 칸 오류는 `"$prefix.properties.$k"` 키로 바꾼다(`checkCreateNode` 와 같다). Security 의 시장과 종목 코드가 바뀌면 같은 값의 다른 종목을 막는다(`requireUniqueListing` 을 `exceptId` 를 받게 고친다).
  - `ARCHIVE_NODE`: 노드가 있고 보관되지 않았고 revision 이 같다.
  - `ARCHIVE_RELATIONSHIP`: `RelationshipService.view(relationshipId)` 로 읽어 지금 온톨로지의 `relationshipTypes` 에 없는 타입(주장 관계)이면 `OntologyViolationException("claim-relationship", …)`, 보관됐으면 `ArchivedException`.
  - `CREATE_CLAIM`: `holder.current().requirePredicate(predicate)`, 주체와 대상과 근거 문서가 있고 보관되지 않았는지, 근거가 `Document` 인지, 타입이 `predicate` 의 `subjectTypes`, `objectTypes` 에 드는지, `validFrom <= validTo` 인지 본다. 규칙과 오류는 `ClaimService.create` 와 같게 둔다. 같은 검사를 두 벌 쓰지 않도록 `ClaimService` 에 잠그지 않는 검사 함수(`checkCreate(request)`)를 꺼내 두 곳이 함께 부르면 더 좋다.

### 2. `proposal/ProposalService.kt`

- `execute` 에 네 갈래. 결과는 `UPDATE_NODE`, `ARCHIVE_NODE` 가 `nodeIds = [nodeId]`, `ARCHIVE_RELATIONSHIP` 이 `relationshipIds = [relationshipId]`, `CREATE_CLAIM` 이 `nodeIds = [만든 주장 id]` 다.
- `ARCHIVE_RELATIONSHIP` 의 `expectedRevision` 은 실행 직전에 `RelationshipService.view(id).revision` 으로 읽는다.
- `nodeIdsOf` 에 `nodeId`(이미 있음), `subjectId`, `objectId`, `documentIds` 를 더한다. 관계 id 를 모으는 `relationshipIdsOf`(`payload.relationshipId`, `result.relationshipIds`)를 더하고, `views` 가 `RelationshipService.views` 나 `view` 로 읽어 `refs.relationships` 에 담는다. 관계의 양 끝 노드도 `refs.nodes` 에 더한다.
- `ProposalRefs` 에 `val relationships: Map<String, RelationshipView>` 를 더한다(`ProposalController.kt`).

### 3. MCP 설명 `mcp/McpTools.kt`

`submit_proposals` 의 설명과 `PROPOSAL.kind` 설명에 네 종류와 payload 모양을 더한다. `UPDATE_NODE`, `ARCHIVE_NODE` 는 `get_node` 의 `node.revision` 을 `expectedRevision` 에 넣고, `ARCHIVE_RELATIONSHIP` 은 `get_node` 의 `relations[].relationshipId` 를 쓴다고 적는다. `CREATE_CLAIM` 은 근거 문서(`Document`) id 가 하나 이상 필요하다고 적는다.

### 4. 이 phase 를 검증하는 테스트

`api/src/test/kotlin/dev/fos/workbench/proposal/InstanceProposalIntegrationTest.kt`(신규). `ProposalIntegrationTest.kt` 의 도우미 모양을 따른다.

- `UPDATE_NODE`: 편집자가 승인하면 속성이 바뀌고 revision 이 오르며 `ChangeEvent` 의 작업자가 승인한 사람이다. 올린 뒤 사람이 그 노드를 고치면 승인이 `409 REVISION_CONFLICT` 이고 `lastError` 가 남는다. Claim 을 고치는 제안은 올릴 때 `400 ONTOLOGY_VIOLATION` 이다. 알 수 없는 속성은 `400 VALIDATION_FAILED`(`proposals[0].payload.properties.<키>`)다.
- `ARCHIVE_NODE`: 승인하면 노드가 보관되고 `result.nodeIds` 에 그 id 가 있다. 이미 보관된 노드는 올릴 때 `409 ARCHIVED` 다.
- `ARCHIVE_RELATIONSHIP`: 승인하면 관계가 보관된다. `refs.relationships` 에 그 관계가 있다.
- `CREATE_CLAIM`: 승인하면 `DRAFT` 주장이 생기고 `authoringMethod` 가 `AI`, 작성자가 승인한 사람이다. 근거 문서가 없으면 올릴 때 `400 VALIDATION_FAILED` 다.
- 열람자는 네 종류 모두 승인하면 `403 FORBIDDEN` 이고 `requiredRole` 이 `EDITOR` 다.

## 검증

```bash
cd api && ./gradlew test --rerun --tests 'dev.fos.workbench.proposal.*' --tests 'dev.fos.workbench.mcp.*' --tests 'dev.fos.workbench.knowledge.*'
cd api && ./gradlew test --rerun
```

둘 다 `BUILD SUCCESSFUL`. 두 번째는 백그라운드로 돌린다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `api/src/main/kotlin/dev/fos/workbench/proposal/ProposalPayloads.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/proposal/ProposalService.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/proposal/ProposalController.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimService.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpTools.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/proposal/InstanceProposalIntegrationTest.kt` | 신규 |
