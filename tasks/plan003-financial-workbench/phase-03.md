# Phase 03. 검색, 주변 그래프, 목록 조회

**Execution profile**: standard

## 목표

노드 검색과 상세, 주변 그래프, Claim 목록(검토 대기)을 구현한다. 그래프 조회는 홉 수, 결과 개수, 실행 시간을 서버에서 제한한다.

**범위 외**: 웹 화면(Phase 04).

## 컨텍스트

- 응답 모양은 `financial-workbench/docs/api-contract.md` 의 「노드」, 「Claim」, 「주변 그래프」, 「페이지네이션」 절이다.
- 한도 설정 키는 `financial-workbench/docs/code-architecture.md` 의 「설정」 절이다(`workbench.graph.max-hops`, `max-nodes`, `max-relationships`, `timeout`).

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주변 그래프」 절

## 의도 메모

- 홉 수는 정수 상한을 확인한 뒤에만 가변 길이 패턴(`*1..2`)에 넣는다.
- 한도보다 하나 더 가져와 잘림 여부를 판단한다.
- 시간 제한은 읽기 트랜잭션의 timeout 으로 건다. 초과는 `503 QUERY_TIMEOUT`.

## 작업 항목

### 1. 조회 서비스

`knowledge/NodeQueryService.kt` 에 검색 추가, `graph/GraphService.kt`, `graph/GraphController.kt`, `ClaimController.kt` 에 목록 추가.

### 2. 테스트 (실제 Neo4j)

- `api/src/test/kotlin/dev/fos/workbench/graph/SearchAndGraphIntegrationTest.kt`: 보관한 노드가 기본 검색에서 빠지고 `includeArchived=true` 에서 나온다. `hops=3` 이 400. 테스트 설정 `max-nodes=5` 에서 이웃 10개인 중심 노드 조회가 노드 5개와 `truncated=true`. 보관된 이웃은 그래프에서 빠진다. `size=101` 이 400. 검토 대기 목록이 DRAFT 만 돌려준다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.graph.SearchAndGraphIntegrationTest'
cd financial-workbench/api && ./gradlew build
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/graph/GraphService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/graph/GraphController.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/**` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/graph/SearchAndGraphIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/**` | 수정 |
