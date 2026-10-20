# Phase 02. 노드, 관계, Claim 쓰기와 변경 이력

**Execution profile**: deep

## 목표

노드 생성, 수정, 보관, 복원과 관계 생성, 보관, 복원, Claim 생성, 수정, 검토, 그리고 변경 이력 기록과 조회를 구현한다.
revision 충돌은 409 로, 데이터와 이력은 한 트랜잭션으로 처리한다.

**범위 외**: 검색과 주변 그래프(Phase 03).

## 컨텍스트

- 경로, 본문, 응답은 `financial-workbench/docs/api-contract.md` 의 「노드」, 「관계」, 「Claim」, 「변경 이력」, 「revision 과 동시 수정」 절이다.
- 저장 모델은 `financial-workbench/docs/data-schema.md` 의 「노드」, 「관계」, 「변경 이력」, 「동시 수정 처리」 절이다.
- 인증과 오류 처리는 Phase 01 의 `config/SecurityConfig.kt`, `web/GlobalExceptionHandler.kt` 를 그대로 쓴다.

**근거 문서**: `financial-workbench/docs/adr/002-claim-as-node.md`, `financial-workbench/docs/adr/003-revision-lock-then-check.md`, `financial-workbench/docs/flow.md` 의 「쓰기 공통 분기」, 「동시 수정」 절

## 의도 메모

- revision 비교는 잠금을 쥔 뒤에 한다. `WHERE n.revision = $expected` 한 쿼리로 끝내지 않는다(ADR 003).
- `ChangeEventRecorder` 는 인터페이스로 둔다. 트랜잭션 일관성 테스트가 실패하는 구현을 주입한다. 이 테스트도 실제 Neo4j 를 쓴다.
- label 과 관계 타입은 `Ontology.requireNodeType()`, `requireRelationshipType()` 을 거친 값만 Cypher 에 넣는다.

## 작업 항목

### 1. 이력

`history/ChangeEventRecorder.kt`(인터페이스와 Neo4j 구현), `history/ChangeController.kt`(`GET /api/changes`).

### 2. 노드와 관계

`knowledge/NodeService.kt`, `NodeController.kt`, `RelationshipService.kt`, `RelationshipController.kt`, `knowledge/Dtos.kt`, `knowledge/RevisionGuard.kt`(잠금, 비교, 404, 409 판정), `knowledge/NodeQueryService.kt` 의 상세 조회(`GET /api/nodes/{id}`). 테스트가 상세 조회로 결과를 확인한다.

### 3. Claim

`knowledge/ClaimService.kt`, `ClaimController.kt`. 생성은 Claim, `SUBJECT`, `OBJECT`, `SUPPORTED_BY`, ChangeEvent 를 한 트랜잭션에서 만든다. 자기 검토는 403.

### 4. 테스트 (모두 실제 Neo4j)

- `api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt`: 생성과 수정과 이력. 없는 타입, 없는 속성, 허용하지 않은 관계(`ISSUES` 를 Company→Sector 로)를 400 으로 거절. 같은 `expectedRevision` 의 두 PATCH 를 두 스레드에서 동시에 보내 하나만 200, 하나는 409. 보관된 노드 수정이 409 `ARCHIVED`.
- `api/src/test/kotlin/dev/fos/workbench/knowledge/TransactionConsistencyIntegrationTest.kt`: 실패하는 `ChangeEventRecorder` 를 주입하고 PATCH 를 보내면 500 이고, 노드 revision 과 속성이 바뀌지 않았다.
- `api/src/test/kotlin/dev/fos/workbench/knowledge/ClaimIntegrationTest.kt`: SUPPLIES_TO Claim 생성, 주어 타입이 Sector 면 400, Document 없으면 400, 작성자 검토 403, 다른 사용자 검토 200 과 `reviewedBy`, 내용 수정 뒤 DRAFT 로 되돌아감.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.knowledge.*'
cd financial-workbench/api && ./gradlew build
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/history/ChangeEventRecorder.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/history/ChangeController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/RelationshipService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/RelationshipController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/Dtos.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/RevisionGuard.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/**` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/TransactionConsistencyIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/ClaimIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/**` | 수정 |
