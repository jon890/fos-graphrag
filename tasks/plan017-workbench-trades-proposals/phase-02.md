# Phase 02. 제안의 저장, 승인과 거절, `/api/me/proposals`

**Execution profile**: deep

## 목표

에이전트가 해석한 쓰기를 담는 `(:User)-[:OWNS]->(:Proposal)` 의 내용 검사, 올리기(상한, 같은 키, 오래된 결정 정리), 승인(기존 서비스로 실행, 실패 시 대기 유지와 오류 기록), 거절과 세션 API `/api/me/proposals` 를 만든다.

**범위 외**: `/api/v1/proposals`(phase 03). 이 phase 에서 제안 올리기는 서비스 메서드로만 부른다(테스트가 직접 부른다). 화면(phase 04).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「제안」, 「제안 내용」, 「역할」, 「오류 형식」(`PROPOSAL_LIMIT`, `PROPOSAL_NOT_PENDING`, `FORBIDDEN`), `financial-workbench/docs/data-schema.md` 의 「제안」, 「체결 기록」(`EXECUTES`), `financial-workbench/docs/flow.md` 의 「제안」, `financial-workbench/docs/adr/013-owner-trades-and-agent-proposals.md`, `financial-workbench/docs/code-architecture.md` 의 「API 패키지」(`proposal`)와 작은 결정(실패 기록의 별도 트랜잭션).

경로는 모두 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/` 아래다.

- 실행에 쓰는 서비스: `knowledge/NodeService.kt` 의 `create(request: CreateNodeRequest, actorId: String): NodeView`, `knowledge/RelationshipService.kt` 의 `create(request: CreateRelationshipRequest, actorId: String): RelationshipView`, `learning/KnowledgeMarkService.kt` 의 `put(userId, nodeId, PutKnowledgeRequest(level, note)): KnowledgeMark`. 셋 다 `@Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)` 라 바깥 트랜잭션에 합류한다.
- 변경 이력: `history/ChangeEventRecorder.kt` 의 `ChangeEventDraft(..., note: String? = null)`. `NodeService.create` 와 `RelationshipService.create` 는 지금 `note` 를 넘기지 않는다.
- 검증: `ontology/OntologyValidator.kt` 의 `validateCreate(type, properties)`, `ontology/Ontology.kt` 의 `requireNodeType`, `requireRelationshipType`, `nodeTypes[type].managedBy`.
- 노드 읽기: `knowledge/KnowledgeReader.kt` 의 `nodeProps(id)`(없으면 `NotFoundException`), `node(id)`.
- 체결: phase 01 의 `trade/TradeRepository.kt`(`views`, `lockOwner`). 이 phase 가 `ownedIds`, `linkDecision` 을 더한다.
- 역할: 세션의 `WorkbenchPrincipal.authorities` 에 `ROLE_<역할>` 이 하나 있다(`auth/CurrentUserFilter.kt` 가 요청마다 다시 읽는다). 계층은 `SecurityConfig.roleHierarchy()` 다. 서비스에는 `Role` 을 넘긴다.
- JSON: Spring 이 주입하는 `tools.jackson.databind.json.JsonMapper`(`history/ChangeEventRecorder.kt` 가 `changes` 를 JSON 문자열로 쓰는 방식과 같다).
- 오류 클래스는 `web/ApiError.kt` 에 둔다.

## 의도 메모

- 승인의 실행과 상태 변경은 한 트랜잭션(`TransactionTemplate`, 쓰기 8초)이다. `ApiException` 이 나면 그 트랜잭션은 롤백되고, 별도 `TransactionTemplate` 으로 `lastErrorCode`, `lastErrorMessage`, `lastErrorAt` 을 쓴 뒤 같은 예외를 다시 던진다. 서비스 메서드에 `@Transactional` 을 붙이지 않는다. 붙이면 기록이 실행과 함께 롤백된다.
- 오류 기록은 그 제안이 아직 `PENDING` 일 때만 쓴다(`WHERE p.status = 'PENDING'`).
- 오류를 기록하는 것은 실행 단계의 실패뿐이다. 잠금 뒤의 존재 확인(`404`), 상태 확인(`409 PROPOSAL_NOT_PENDING`), 권한 확인(`403 FORBIDDEN`)에서 난 예외는 기록하지 않고 그대로 던진다. 실행 단계는 내용 다시 검사(`check`)부터 서비스 실행까지다. 코드에서는 실행 단계 예외를 `ExecutionFailed(cause: ApiException)` 같은 내부 표시로 감싸 바깥에서 가른다.
- 같은 제안의 동시 승인: 트랜잭션 처음에 `MATCH (:User {id})-[:OWNS]->(p:Proposal {id}) SET p._lock = true` 로 잠그고 상태를 읽는다. 두 번째는 첫 번째의 커밋을 기다린 뒤 `ACCEPTED` 를 읽고 `409 PROPOSAL_NOT_PENDING` 이다.
- 올리기의 내용 검사와 승인의 내용 검사는 같은 함수(`ProposalPayloads.check`)다. 올릴 때는 노드 존재와 내 체결까지 확인하고, 승인할 때 다시 확인한다.
- 제안끼리 서로 가리키지 않는다. `CREATE_NODE` 의 `links`, `tradeIds` 가 만들 노드에 붙는 것을 대신한다.
- 제안은 변경 이력을 남기지 않는다. 승인으로 생긴 노드와 관계만 `NodeService`, `RelationshipService` 가 남긴다. 그때 `note` 는 「에이전트 제안을 승인했다」 다.

## 작업 항목

### 1. `knowledge/NodeService.kt`, `knowledge/RelationshipService.kt` 에 `note` 인자

`create(request, actorId, note: String? = null)` 로 바꿔 `ChangeEventDraft` 의 `note` 에 넘긴다. 기존 호출부(`NodeController`, `RelationshipController`, `SeedLoader`, 가이드 등)는 기본값으로 그대로다. `git grep -n "nodes.create(\|nodeService.create(\|relationships.create(\|relationshipService.create(" financial-workbench/api/src/main` 로 호출부를 확인하고 바꾸지 않는다.

### 2. `web/ApiError.kt` 의 새 오류

```kotlin
class ProposalLimitException(max: Int, pending: Long) : ApiException(HttpStatus.CONFLICT, "PROPOSAL_LIMIT", "대기 중인 제안이 ${max}개를 넘습니다. 제안을 승인하거나 거절한 뒤 다시 올리세요.", mapOf("max" to max, "pending" to pending))
class ProposalNotPendingException(status: String) : ApiException(HttpStatus.CONFLICT, "PROPOSAL_NOT_PENDING", "이미 처리한 제안입니다.", mapOf("status" to status))
class ForbiddenException(message: String) : ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message)
```

### 3. `proposal/ProposalPayloads.kt`(신규): 종류별 내용 검사

```kotlin
enum class ProposalKind { CREATE_NODE, CREATE_RELATIONSHIP, LINK_TRADE_DECISION, STUDY_NOTE; val requiresEditor: Boolean }

/** 검사한 내용. 실행과 저장에 쓴다 */
sealed interface ProposalPayload {
    data class CreateNode(val type: String, val properties: Map<String, Any?>, val links: List<Link>, val tradeIds: List<String>) : ProposalPayload
    data class Link(val type: String, val fromId: String?, val toId: String?)
    data class CreateRelationship(val type: String, val fromId: String, val toId: String) : ProposalPayload
    data class LinkTradeDecision(val tradeIds: List<String>, val decisionId: String) : ProposalPayload
    data class StudyNote(val nodeId: String, val level: String, val note: String?) : ProposalPayload
    fun toMap(): Map<String, Any?>   // 계약의 payload 모양
}

@Component
class ProposalPayloads(holder: OntologyHolder, validator: OntologyValidator, reader: KnowledgeReader, trades: TradeRepository) {
    /** 모양, 온톨로지, 노드 존재, 내 체결을 확인한다. prefix 는 fieldErrors 키 앞부분(`proposals[0].payload`, 승인에서는 `payload`) */
    fun check(ownerId: String, kind: ProposalKind, raw: Any?, prefix: String): ProposalPayload
}
```

규칙은 `docs/api-contract.md` 의 「제안 내용」 이다.

- 모양 오류(필수 칸 없음, 개수, `links` 의 `fromId`/`toId` 둘 다나 둘 다 없음, `tradeIds` 를 `Decision` 밖에 줌, `level` 값)는 `ValidationFailedException(mapOf("$prefix.칸" to 사유))`.
- `CREATE_NODE`: `requireNodeType(type)`, `managedBy` 가 있으면 `OntologyViolationException("claim-via-claims-api", ...)`, `validator.validateCreate(type, properties)`. 링크마다 `requireRelationshipType(link.type)` 과 상대 노드의 존재(`reader.nodeProps`), 상대와 새 노드의 타입이 관계의 `from`/`to` 에 맞는지(`relationship-endpoint` 규칙).
- `LINK_TRADE_DECISION`: 결정 노드가 `type == "Decision"` 이 아니면 `OntologyViolationException("decision-type", "투자 결정에만 체결을 이을 수 있습니다.")`, 보관이면 `ArchivedException()`.
- `tradeIds` 가 `trades.ownedIds(ownerId, ids)` 에 모두 없으면 없는 첫 id 로 `NotFoundException`.
- `STUDY_NOTE`: 노드 존재, `level` 세 값, `note` 1000자(`KnowledgeMarkService` 의 규칙과 같은 문구).

### 4. `trade/TradeRepository.kt` 에 체결 확인과 결정 잇기

```kotlin
fun ownedIds(ownerId: String, ids: Collection<String>): Set<String>   // 그 가운데 내 체결 id
/** 체결마다 결정과 EXECUTES 를 MERGE 한다. ON CREATE 에만 createdAt, proposalId 를 쓴다 */
fun linkDecision(ownerId: String, tradeIds: List<String>, decisionId: String, proposalId: String)
```

`linkDecision` 은 `MATCH (:User {id: $ownerId})-[:OWNS]->(t:Trade) WHERE t.id IN $tradeIds MATCH (d:Knowledge {id: $decisionId}) MERGE (t)-[e:EXECUTES]->(d) ON CREATE SET e.createdAt = $now, e.proposalId = $proposalId` 다.

### 5. `proposal/ProposalRepository.kt`(신규)

```kotlin
@Repository
class ProposalRepository(private val client: Neo4jClient) {
    fun lockOwnerAndCountPending(ownerId: String): Long?
    fun unlockOwner(ownerId: String)
    fun findByDedupeKey(ownerId: String, key: String): Map<String, Any?>?
    fun create(ownerId: String, props: Map<String, Any?>): String
    fun deleteDecidedBefore(ownerId: String, before: String): Long
    fun lock(ownerId: String, id: String): Map<String, Any?>?        // SET p._lock = true, properties(p)
    fun finish(id: String, props: Map<String, Any?>)                  // status, decidedAt, payload, result, decisionNote, REMOVE p._lock, lastError* 지우기
    fun recordError(ownerId: String, id: String, code: String, message: String, at: String)
    fun page(ownerId: String, status: String?, page: PageQuery): Page<Map<String, Any?>>
    fun countPending(ownerId: String): Long
}
```

정렬은 계약과 같다: `status` 가 있으면 대기는 `createdAt, id`, 결정은 `decidedAt DESC, id`. 없으면 `CASE p.status WHEN 'PENDING' THEN 0 ELSE 1 END, coalesce(p.decidedAt, p.createdAt) ...` 로 대기를 앞에 둔다.

### 6. `proposal/ProposalService.kt`(신규)

```kotlin
data class ProposalInput(val kind: String?, val payload: Any?, val rationale: String?, val evidence: Map<String, Any?>?, val dedupeKey: String?)
data class ProposalSaveResult(val index: Int, val status: String, val proposal: StoredProposal)
data class StoredProposal(...)   // 저장된 속성을 읽은 값. payload, evidence, result 는 Map 으로 푼다

@Service
class ProposalService(...) {
    fun submit(ownerId: String, tokenId: String?, tokenName: String?, items: List<Map<String, Any?>>?): List<ProposalSaveResult>
    fun accept(ownerId: String, role: Role, id: String, editedPayload: Any?): StoredProposal
    fun reject(ownerId: String, id: String, reason: String?): StoredProposal
    fun list(ownerId: String, status: String?, page: PageQuery): Page<StoredProposal>
    fun pendingCount(ownerId: String): Long
}
```

- `submit`(쓰기 트랜잭션 하나): 입력 모양 검사(키 목록, `kind`, `rationale` 은 1자 이상 2000자 이하, `evidence` 의 개수와 주소 형식, `dedupeKey` 는 1자 이상 100자 이하, 항목은 1건 이상 20건 이하) → `ProposalPayloads.check` → `evidence.nodeIds` 존재와 `tradeIds` 소유 확인 → `lockOwnerAndCountPending` → 항목마다 `dedupeKey` 로 기존을 찾거나(같은 요청의 앞 항목 포함) 만든다 → 새로 만드는 수를 더한 대기 수가 `Limits.MAX_PENDING_PROPOSALS` 를 넘으면 `ProposalLimitException`(아무것도 만들지 않는다. 만들기 전에 센다) → `deleteDecidedBefore(now - 90일)` → `unlockOwner`. 오류 키는 `proposals[i].칸`.
  - 항목 i 의 검사에서 `ValidationFailedException` 이 나면 `fieldErrors` 의 각 키 앞에 `proposals[i].payload.` 를 붙여 다시 던진다. `validator.validateCreate` 의 속성 오류 키는 속성 이름 그대로라 `proposals[i].payload.properties.<속성>` 이 된다. `ProposalPayloads.check` 는 승인에서도 같은 규칙으로 `payload.properties.<속성>` 을 쓴다.
  - 항목 i 의 검사에서 그 밖의 `ApiException`(`ONTOLOGY_VIOLATION`, `NOT_FOUND`, `ARCHIVED`)이 나면 같은 `status`, `code`, `message` 와 `details + ("index" to i)` 로 새 `ApiException` 을 만들어 던진다. `ApiException` 은 `open class` 이고 `details` 가 `val` 이라 새로 만든다.
- `accept`: 위 「의도 메모」 의 두 트랜잭션. 실행 트랜잭션 안에서 `lock` → 없으면 `NotFoundException`, `PENDING` 이 아니면 `ProposalNotPendingException` → `kind.requiresEditor` 인데 `role` 이 `EDITOR`, `ADMIN` 이 아니면 `ForbiddenException("편집 권한이 있어야 승인할 수 있습니다.")` → `editedPayload ?: 저장된 payload` 를 `check(prefix = "payload")` → 실행 → `finish(ACCEPTED, decidedAt, payload, result)`.
  - `CREATE_NODE`: `nodeService.create(CreateNodeRequest(type, properties), ownerId, NOTE)` → 링크마다 `relationshipService.create(CreateRelationshipRequest(type, fromId ?: newId, toId ?: newId), ownerId, NOTE)` → `tradeIds` 가 있으면 `trades.linkDecision(ownerId, tradeIds, newId, proposalId)`. `result = {nodeIds: [newId], relationshipIds: [...], tradeIds}`.
  - `CREATE_RELATIONSHIP`: `relationshipService.create(..., ownerId, NOTE)`.
  - `LINK_TRADE_DECISION`: `trades.linkDecision(...)`. `result.nodeIds = [decisionId]`.
  - `STUDY_NOTE`: `knowledgeMarks.put(ownerId, nodeId, PutKnowledgeRequest(level, note))`.
  - `NOTE = "에이전트 제안을 승인했다"`.
- `reject`: 쓰기 트랜잭션. `lock` → 상태 확인 → `reason` 1000자 → `finish(REJECTED, decidedAt, decisionNote)`.

### 7. `proposal/ProposalController.kt`(신규)와 `ProposalView`

`@RequestMapping("/api/me/proposals")`: `GET`(쿼리 `status`, `page`, `size`), `GET /summary`(`{"pending"}`), `POST /{id}/accept`(본문 `{"payload"}`, 없어도 된다), `POST /{id}/reject`(본문 `{"reason"}`). 역할은 `user.authorities` 의 `ROLE_` 값을 `Role.parse` 로 바꿔 넘긴다.

`ProposalView` 는 계약의 모양이다. `refs.nodes` 는 `payload`, `evidence.nodeIds`, `result.nodeIds` 의 id 를 한 번에 읽어(`MATCH (n:Knowledge) WHERE n.id IN $ids`) `NodeRef` 로, `refs.trades` 는 `TradeRepository.views(ownerId, ids)` 로 채운다. `requiresEditor = kind.requiresEditor`. `token = {id: tokenId, name: tokenName}`(둘 다 없으면 `null`).

### 8. 이 phase 를 검증하는 테스트

내용 검사(`ProposalPayloads`)는 실제 온톨로지와 노드가 있어야 해서 따로 단위 테스트를 두지 않고 아래 통합 테스트에서 확인한다.

`proposal/ProposalIntegrationTest.kt`(신규, `IntegrationTest` 상속). `ProposalService.submit` 과 `TradeService.save` 를 주입받아 부르고, 승인과 거절은 세션 API 로 한다.

- 승인과 이력: ALICE(EDITOR)가 `CREATE_NODE`(`Decision`, `title`, `action = "BUY"`, `links = [{HAS_DECISION, fromId = 종목}]`, `tradeIds = [ALICE 체결]`)를 올리고 `POST /api/me/proposals/{id}/accept` → `200`, `status = ACCEPTED`, `result.nodeIds[0]` 의 노드가 있다. `GET /api/changes?targetId={새 노드}` 에 `CREATE` 이력이 있고 `actor.email = ALICE`, `note = "에이전트 제안을 승인했다"`. 종목 상세의 `relationships` 에 `HAS_DECISION` 이 있다. `GET /api/me/trades?decisionId={새 노드}` 에 그 체결이 있다.
- 고쳐서 승인: `payload.properties.title` 을 바꿔 보내면 그 이름으로 만들어지고, 다시 읽은 제안의 `payload` 도 고친 값이다.
- 열람자: VIEWER 의 `CREATE_RELATIONSHIP` 제안 승인은 `403 FORBIDDEN` 이고 제안은 `PENDING`, `lastError` 는 `null`, 관계가 생기지 않는다. 같은 VIEWER 의 `STUDY_NOTE` 승인은 `200` 이고 `GET /api/me/knowledge/{nodeId}` 의 `level` 이 그 값이다. `LINK_TRADE_DECISION` 도 `200` 이다.
- 실패는 대기로 남음: 승인 전에 대상 결정을 보관(`POST /api/nodes/{id}/archive`)한 `LINK_TRADE_DECISION` 승인은 `409 ARCHIVED`, 다시 읽은 제안은 `PENDING` 이고 `lastError.code = "ARCHIVED"`. 이어 `CREATE_NODE` 의 Security 가 같은 시장, 종목 코드와 겹치면 `409 DUPLICATE` 이고 노드가 생기지 않는다(이력도 없다).
- 이미 결정됨: 승인한 제안을 다시 승인하거나 거절하면 `409 PROPOSAL_NOT_PENDING`(`details.status = "ACCEPTED"`). `race` 로 같은 제안을 동시에 두 번 승인하면 하나는 `200`, 하나는 `409` 이고 노드는 하나다.
- 거절: `reason` 을 담아 거절하면 `REJECTED`, `decisionNote` 가 그 값이다. 1001자면 `400`.
- 주인만: BOB 의 `GET /api/me/proposals` 에 ALICE 의 제안이 없고, BOB 이 ALICE 의 제안을 승인하면 `404`. `GET /api/me/proposals/summary` 는 각자의 대기 수다.
- 올리기 검사: `kind` 가 모르는 값이면 `400`(`proposals[0].kind`). 두 번째 항목이 `Claim` 타입의 `CREATE_NODE` 면 `400 ONTOLOGY_VIOLATION` 이고 `details.index = 1` 이며 첫 항목도 만들어지지 않는다. `Decision` 의 필수 속성 `title` 이 빠진 `CREATE_NODE` 는 `400 VALIDATION_FAILED` 이고 `fieldErrors` 에 `proposals[0].payload.properties.title` 이 있다. BOB 의 체결을 가리킨 `LINK_TRADE_DECISION` 은 `404` 이고 `details.index = 0` 이다. 같은 `dedupeKey` 로 두 번 올리면 두 번째가 `existing` 이고 제안은 하나다.
- 상한: `Limits.MAX_PENDING_PROPOSALS` 를 넘기는 올리기는 `409 PROPOSAL_LIMIT` 이고 아무것도 만들지 않는다. 테스트는 새 사용자에게 `STUDY_NOTE` 199개를 Cypher 로 직접 만든 뒤 2건을 올려 확인한다(200 개를 API 로 올리지 않는다).
- 정리: 결정한 제안의 `decidedAt` 을 Cypher 로 91일 전으로 바꾼 뒤 새 제안을 올리면 그 제안이 지워지고, 89일 전 것은 남는다.
- 지식 조회에서 빠짐: 제안을 올린 뒤 BOB 의 `GET /api/nodes/counts`, 검색 결과에 변화가 없다.
- 사용자 삭제: `data-schema.md` 「사용자를 지울 때」 의 Cypher 로 지운 사용자의 `:Proposal` 이 0 이다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.proposal.*' --tests 'dev.fos.workbench.trade.*' --tests 'dev.fos.workbench.knowledge.*'
cd financial-workbench/api && ./gradlew test --rerun
```

- 새 통합 테스트가 통과하고, `note` 인자를 더한 뒤에도 기존 `knowledge`, `history` 테스트가 그대로 통과한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/RelationshipService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/ApiError.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/proposal/ProposalPayloads.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/proposal/ProposalRepository.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/proposal/ProposalService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/proposal/ProposalController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/trade/TradeRepository.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/proposal/ProposalIntegrationTest.kt` | 신규 |
