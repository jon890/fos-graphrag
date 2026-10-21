# Phase 01. 주장 이름, 그래프의 주장 끝 노드, 문장 틀

**Execution profile**: standard

## 목표

서버가 Claim 의 이름을 읽을 때 「주체 이름 → 대상 이름 관계 표시 이름」 으로 만든다. 주변 그래프는 모은 Claim 의 주체와 대상을 홉 수와 상관없이 함께 돌려주고, 노드마다 `predicate` 를 싣는다.
온톨로지의 모든 predicate 에 주장 문장 틀(`sentence`)을 더하고, 웹에 그 틀을 채우는 함수를 둔다.
다음 phase 의 주장 접기와 그다음 phase 의 문장 채우기 폼이 이 응답과 함수를 쓴다.

**범위 외**: 그래프에서 주장을 선으로 접는 화면은 phase 02 다. 주장 만들기 폼과 입구는 phase 03 이다. 이 phase 는 `GraphPanel.tsx`, `ClaimCreateForm.tsx`, `SearchPanel.tsx` 를 고치지 않는다.

## 컨텍스트

- Claim 의 `labelProperty` 는 `predicate` 다(`financial-workbench/ontology/financial-ontology.yaml` 79행). 그래서 지금 서버의 Claim `label` 은 `SUPPLIES_TO` 같은 키이고, 웹 `nodeDisplayLabel`(`financial-workbench/web/src/lib/labels.ts` 59행부터 63행)이 enum 선택지 이름(「공급한다」)으로 바꿔 보인다.
- 서버의 노드 표현은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/KnowledgeReader.kt` 가 만든다.
  - `nodes(rows)`(25행)가 행마다 `toNodeView(p, refs)`(81행)를 부른다. 검색(`NodeQueryService.search`)과 상세(`node(id)`)가 이 길을 탄다.
  - `ref(p)`(30행)는 `NodeRef` 하나를 만든다. `RelationshipService` 와 `claims()` 의 주체, 대상이 쓴다.
  - `claims(ids)`(37행)는 한 쿼리로 Claim 과 주체(`s`), 대상(`o`), 근거 문서를 읽는다. 행에 `s`, `o` 가 이미 있다.
  - 이름은 `Ontology.labelOf(type, properties)`(`financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` 36행)가 정한다.
- 주변 그래프는 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/graph/GraphService.kt` 다. `GraphNode` 는 15행의 `data class GraphNode(val id: String, val type: String, val label: String, val reviewStatus: String?)` 다. `load()`(57행)가 중심과 이웃을 모으고(62행부터 80행), 모은 id 사이의 관계를 읽고(82행부터 91행), 95행에서 `ontology.labelOf` 로 이름을 붙인다. 이웃 한도는 `neighborLimit = limits.maxNodes - 1` 이다.
- 변경 이력의 대상 이름은 쓰는 시점에 `ChangeEventDraft` 의 여섯째 인자로 저장된다. `ClaimService`(`financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimService.kt`)는 만들기(96행), 고치기(135행), 검토(167행)에서 각각 `request.predicate`, `before["predicate"] as String` 을 넘긴다. Claim 보관과 복원 이력은 `NodeService.record()`(`financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeService.kt` 110행)가 `ontology.labelOf(type, after)` 로 남긴다.
- 온톨로지 로더(`financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt`)는 `FAIL_ON_UNKNOWN_PROPERTIES` 를 켜 두었다. YAML 에 `sentence` 를 적으려면 `ClaimPredicateDef`(`Ontology.kt` 92행)에 필드가 있어야 한다. YAML 의 predicate 정의는 109행부터 129행까지 블록 표기다.
- `OntologyLabelsTest`(`financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt`)가 표시 이름이 빠진 항목을 모아 실패시킨다. 같은 방식으로 문장 틀을 확인한다.
- 통합 테스트는 Testcontainers 의 Neo4j 를 쓴다(`financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/IntegrationTest.kt`). 합성 데이터는 `support/Fixtures.kt` 의 `company(name)`, `document(title)`, `claim(predicate, subjectId, objectId, documentIds)` 로 만든다. 이름 끝에 `-<suffix>` 가 붙는다. `SearchAndGraphIntegrationTest` 는 `workbench.graph.max-nodes=5` 로 돈다.
- 웹 계약 타입은 `financial-workbench/web/src/api/types.ts` 다. `GraphNode`(119행)와 `ClaimPredicateDef`(209행)가 있다. 웹 단위 테스트는 vitest(`npm test` 는 `vitest run`, 대상 `src/**/*.test.{ts,tsx}`)다.
- 변경 이력 탭(`financial-workbench/web/src/components/ChangesTab.tsx` 61행)은 `labels.node({ type: c.targetType, label: c.targetLabel })` 로 대상 이름을 보인다. 이미 저장된 Claim 이력의 대상 이름은 `SUPPLIES_TO` 같은 키다. `ChangesTab.test.tsx` 47행부터 53행이 그 키를 「공급한다」 로 보이는지 확인한다.
- 검토 대기 탭의 처리 안내(`financial-workbench/web/src/components/ReviewTab.tsx` 26행)는 지금 `주체 → 대상 (관계)` 를 직접 이어 붙인다. Claim 이름이 「주체 → 대상 관계」 가 되면 같은 말이 두 번 나온다.
- 브라우저 테스트 `financial-workbench/web/e2e/workbench.spec.ts` 의 4번 테스트(288행부터 311행)는 `graph-node` 를 `filter({ hasText: data.customer })` 로 센다. Claim 이름에 공급사와 고객사 이름이 들어가면 Claim 항목도 걸려 개수가 2 가 된다.

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 `NodeView` 설명과 「주변 그래프」 절, `financial-workbench/docs/data-schema.md` 의 표시 이름 표(`claimPredicates.<predicate>` 의 `sentence` 행)와 그 아래 목록, `financial-workbench/docs/flow.md` 의 「주장의 이름」 과 주변 그래프 설명, `financial-workbench/docs/code-architecture.md` 의 「결정」

## 의도 메모

- Claim 이름을 만들 때 저장하는 안은 버렸다. 기업 이름을 고치면 주장 이름이 낡고 기존 주장도 채워야 한다. 그래서 `searchText` 는 지금처럼 predicate 소문자로 두고, 주장은 기업 이름으로 검색되지 않는다(`prd.md` 「남은 한계」).
- 변경 이력의 대상 이름만은 그때의 이름을 남긴다. 만들기, 고치기, 검토, 보관, 복원 이력에 조합한 이름을 저장한다.
- 웹 `nodeDisplayLabel` 은 서버가 준 Claim 이름을 그대로 보인다. 다만 이미 저장된 이력처럼 이름이 predicate 키 그대로이면 지금처럼 선택지 이름으로 바꾼다. 조합한 이름은 선택지 키와 같을 수 없어 두 경우가 겹치지 않는다.
- `ClaimPredicateDef.sentence` 는 Kotlin 에서 `String? = null` 로 둔다. `label` 과 같은 방식이다. 빠진 것은 `OntologyLabelsTest` 가 잡고, 웹은 없을 때 「{subject} {object} 관계 이름」 순서로 보인다(`data-schema.md`).
- YAML 에서 `{` 로 시작하는 값은 흐름 표기 맵으로 읽힌다. `sentence` 값은 반드시 큰따옴표로 감싼다.
- 끝 노드를 더하는 쿼리는 이웃 쿼리와 따로 둔다. 이웃 쿼리의 경로 필터(경로 위 모든 노드에 types, reviewStatus 적용)를 바꾸지 않기 위해서다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `financial-workbench/ontology/financial-ontology.yaml` 에 문장 틀

`claimPredicates` 의 네 predicate 에 `sentence` 를 더한다. 값은 큰따옴표로 감싼다. `{subject}` 와 `{object}` 를 한 번씩 담는다.

| predicate | sentence |
| --- | --- |
| `SUPPLIES_TO` | `"{subject}이(가) {object}에 공급한다"` |
| `BELONGS_TO_SECTOR` | `"{subject}이(가) {object}에 속한다"` |
| `COMPETES_WITH` | `"{subject}이(가) {object}와(과) 경쟁한다"` |
| `HAS_EXPOSURE_TO` | `"{subject}의 실적이 {object}의 변화에 영향을 받는다"` |

### 2. `Ontology.kt` 와 `OntologyLoader.kt`

- `ClaimPredicateDef` 에 `val sentence: String? = null` 을 더한다. 주석에 「주장 만들기 폼의 문장 틀. `{subject}`, `{object}` 자리에 고르기 칸이 들어간다」 를 적는다.
- `Ontology` 에 순수 함수를 둔다.

  ```kotlin
  /** Claim 의 이름. 「주체 → 대상 관계 표시 이름」 이고, 찾지 못한 끝은 ? 로 둔다 */
  fun claimLabel(subjectLabel: String?, objectLabel: String?, predicate: String): String =
      "${subjectLabel ?: "?"} → ${objectLabel ?: "?"} ${claimPredicates[predicate]?.label ?: predicate}"
  ```
- `OntologyLoader.kt` 는 필드가 생기면 그대로 읽는다. 로더 코드를 바꿀 것이 없으면 고치지 않는다. 바꿨다면 변경 파일 표에 더한다.

### 3. `KnowledgeReader.kt` 의 Claim 이름

- 새 함수 둘을 둔다.

  ```kotlin
  /** Claim id 마다 「주체 → 대상 관계」 이름. 쿼리 한 번으로 읽고 Claim 이 아닌 id 는 빠진다 */
  fun claimLabels(ids: Collection<String>): Map<String, String>
  /** Claim 이면 주체와 대상 이름으로 만든 이름, 아니면 labelProperty 값 */
  fun labelOf(p: Map<String, Any?>): String
  ```
- `claimLabels` 는 `ids` 가 비면 쿼리 없이 빈 맵이다. 쿼리는 아래 하나다. 이름은 `ontology.claimLabel(s 의 labelOf, o 의 labelOf, predicate)` 로 만든다.

  ```cypher
  MATCH (c:Knowledge:Claim) WHERE c.id IN $ids
  OPTIONAL MATCH (c)-[:SUBJECT]->(s:Knowledge)
  OPTIONAL MATCH (c)-[:OBJECT]->(o:Knowledge)
  RETURN c.id AS id, c.predicate AS predicate, properties(s) AS s, properties(o) AS o
  ```
- `labelOf(p)` 는 `p["type"] == ClaimService.CLAIM` 이면 `claimLabels(listOf(id))[id]` 를, 아니면 `ontology.labelOf(type, p)` 를 돌려준다.
- `nodes(rows)` 는 행 가운데 Claim 의 id 를 모아 `claimLabels` 를 한 번 부르고, 그 맵을 `toNodeView` 에 넘긴다. `toNodeView(p, refs, label)` 처럼 이름을 인자로 받게 바꾸고, 기본값은 `ontology.labelOf(type, p)` 다.
- `ref(p)` 는 지금처럼 `ontology.labelOf(type, p)` 를 쓴다. `ref` 는 주장의 주체와 대상, 일반 관계의 끝처럼 Claim 이 아닌 노드에 쓰이고, `RelationshipService.views` 가 행마다 부른다. 여기서 `labelOf(p)` 를 쓰면 Claim 이 섞일 때 행마다 쿼리가 돈다. 함수 위에 「Claim 을 넘기지 않는다. Claim 이름은 `labelOf` 나 `claimLabels` 로 만든다」 주석을 단다.
- `claims(ids)` 는 쿼리를 더하지 않는다. 같은 행의 `s`, `o` 와 `c["predicate"]` 로 `ontology.claimLabel(...)` 을 만들어 `toNodeView` 에 넘긴다.

### 4. `ClaimService.kt` 와 `NodeService.kt` 의 이력 대상 이름

- `create` 의 이력(96행)은 `ontology.claimLabel(ontology.labelOf(subject["type"] as String, subject), ontology.labelOf(obj["type"] as String, obj), request.predicate)` 를 넘긴다. `subject`, `obj` 는 이미 잠가 읽은 속성 맵이다.
- `patch` 의 이력(135행)과 `review` 의 이력(167행)은 `reader.labelOf(before)` 를 넘긴다.
- `NodeService.record()`(110행)는 `ontology.labelOf(type, after)` 대신 `reader.labelOf(after)` 를 넘긴다. Claim 보관과 복원 이력도 조합한 이름을 남긴다. `create`, `patch` 는 Claim 을 받지 않으므로 그대로 둔다.

### 5. `GraphService.kt` 의 끝 노드와 `predicate`

- `GraphNode` 에 마지막 필드 `val predicate: String? = null` 을 더한다. Claim 일 때만 `it["predicate"] as String?` 를 넣고, 다른 타입은 `null` 이다.
- `load()` 에서 `nodes` 를 만든 뒤, 관계를 읽기 전에 Claim 의 주체와 대상을 더한다.
  - `claimIds` 는 `nodes` 가운데 `type` 이 Claim 인 id 다. 비어 있으면 이 단계를 건너뛴다.
  - `room = limits.maxNodes - nodes.size` 로 두고 아래 쿼리를 `limit = room + 1` 로 부른다. `types` 는 `neighborhood` 가 넘긴 값 그대로다.

    ```cypher
    MATCH (c:Knowledge:Claim)-[r:SUBJECT|OBJECT]->(m:Knowledge)
    WHERE c.id IN $claimIds AND NOT m.id IN $ids
      AND r.archived = false AND m.archived = false
      AND ($types IS NULL OR m.type IN $types)
    WITH DISTINCT m
    ORDER BY m.id
    LIMIT $limit
    RETURN properties(m) AS m
    ```
  - 결과에서 `room` 개까지 `nodes` 에 붙인다. 결과가 `room` 보다 많으면 `endpointTruncated = true` 다.
  - `truncated` 는 `nodeTruncated || endpointTruncated || edges.size > limits.maxRelationships` 다.
- 노드 이름은 `reader.claimLabels(claimIds)` 를 한 번 불러 Claim 이면 그 값을, 아니면 `ontology.labelOf` 를 쓴다. 끝 노드를 더한 뒤 부른다.

### 6. 웹 `financial-workbench/web/src/api/types.ts`

- `GraphNode` 에 `/** Claim 일 때만 값이 있다 */ predicate?: string | null` 을 더한다.
- `ClaimPredicateDef` 에 `/** 주장 문장 틀. {subject}, {object} 자리에 고르기 칸이 들어간다 */ sentence?: string | null` 을 더한다.
- 둘 다 선택 필드라 기존 테스트 fixture(`financial-workbench/web/src/lib/graph.test.ts`, `financial-workbench/web/src/components/testSupport.tsx`)는 그대로 컴파일된다.

### 7. 웹 `financial-workbench/web/src/lib/labels.ts`

- `nodeDisplayLabel` 의 주석을 고친다. 「서버의 Claim 이름은 주체 → 대상 관계로 조합한 값이라 그대로 보인다. 예전 이력처럼 이름이 선택지 키이면 표시 이름으로 바꾼다」. 동작은 지금 식(`enumValueLabel` 은 키가 아니면 값을 그대로 돌려준다)을 유지한다.
- 조사 함수를 둔다.

  ```ts
  /** 낱말 끝소리에 맞춰 조사 이(가), 은(는), 을(를), 와(과) 가운데 하나를 고른다. 한글이 아니거나 모르는 조사면 적힌 그대로 붙인다 */
  export function withJosa(word: string, josa: string): string
  ```
  받침이 있으면 이, 은, 을, 과이고 없으면 가, 는, 를, 와다. `withEulReul(word)` 는 `withJosa(word, '을(를)')` 로 바꾼다. 결과는 지금과 같다.
- 문장 틀을 칸과 글로 나누는 함수를 둔다.

  ```ts
  export type SentencePart = { kind: 'slot'; slot: 'subject' | 'object' } | { kind: 'text'; text: string }
  /**
   * predicate 의 문장 틀을 칸과 글로 나눈다. 칸 바로 뒤 글의 맨 앞 조사(이(가), 은(는), 을(를), 와(과))는
   * names 에 그 칸의 이름이 있으면 끝소리에 맞춰 하나로 바꾸고, 없으면 적힌 그대로 둔다.
   * 문장 틀이 없으면 subject 칸, object 칸, 관계 표시 이름 순서다.
   */
  export function claimSentenceParts(o: Ontology, predicate: string, names?: { subject?: string | null; object?: string | null }): SentencePart[]
  ```
  빈 글 조각은 넣지 않는다. 틀이 없을 때는 `[slot subject, text ' ', slot object, text ' ' + predicateLabel(o, predicate)]` 다.

### 8. 웹 `ReviewTab.tsx` 와 `ClaimCard.tsx` 의 겹침

Claim 이름에 주체와 대상이 들어가면, 주체와 대상을 따로 보이는 화면에서 같은 말이 두 번 나온다.

- `financial-workbench/web/src/components/ReviewTab.tsx`
  - 26행의 처리 안내를 `「${labels.node(claim)}」 주장을 ${labels.status(status)} 처리했습니다.` 로 바꾼다.
  - 38행의 첫 칸(머리는 119행의 「관계 종류」)은 `labels.node(claim)` 대신 `labels.predicate(String(claim.properties.predicate))` 를 보인다. 칸 안의 단추가 주장을 여는 동작은 그대로다.
- `financial-workbench/web/src/components/ClaimCard.tsx` 34행의 `claim-predicate` 도 `labels.predicate(String(claim.properties.predicate))` 를 보인다. 45행의 `claim-triple`(주체 → 대상)은 그대로 둔다.

### 9. 웹 `financial-workbench/web/TESTIDS.md`

「Claim 카드와 Claim 노드 상세」 절의 `claim-predicate` 설명을 「관계 종류의 표시 이름(예: 공급한다)」 으로 고친다. 작업 항목 8 뒤로 그 값을 보이기 때문이다.

### 10. 이 phase 를 검증하는 테스트

- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` 에 테스트 하나를 더한다. 모든 `claimPredicates` 에 `sentence` 가 있고 비어 있지 않으며, `{subject}` 와 `{object}` 가 각각 정확히 한 번 나온다. 어긋난 predicate 이름을 모아 `isEmpty()` 로 단언한다. `SUPPLIES_TO` 의 `sentence` 가 `{subject}이(가) {object}에 공급한다` 인지도 본다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/ClaimIntegrationTest.kt` 에 테스트 하나를 더한다.
  1. `fx.company("가상부품")`, `fx.company("가상전자")`, `fx.document(...)` 로 SUPPLIES_TO Claim 을 만든다. 응답의 `label` 이 `"가상부품-${fx.suffix} → 가상전자-${fx.suffix} 공급한다"` 다.
  2. `/api/changes?targetId=<claim>` 의 CREATE 행 `targetLabel` 이 같은 값이다.
  3. 공급사 이름을 `PATCH /api/nodes/{id}` 로 `가상소재-<suffix>` 로 바꾼다. `GET /api/claims/{id}` 의 `label`(`ClaimView` 는 `node` 를 펼친다), `GET /api/nodes/{claimId}` 의 `node.label`, `GET /api/nodes/{customerId}` 의 `claims[0].label` 이 모두 새 이름으로 시작한다.
  4. BOB 이 검토하면 REVIEW 이력의 `targetLabel` 은 새 이름이고, CREATE 이력의 `targetLabel` 은 처음 이름 그대로다.
  5. Claim 을 보관하면 ARCHIVE 이력의 `targetLabel` 도 조합한 새 이름이다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/graph/SearchAndGraphIntegrationTest.kt`
  - 기존 「보관된 이웃과 관계는 그래프에서 빠지고 2홉은 Claim 너머까지 본다」 의 1홉 기대값(130행)을 `supplier.id, claim.id, customer.id` 로 바꾼다. 1홉 응답의 `edges` 타입이 `SUBJECT`, `OBJECT` 두 개이고 `SUPPORTED_BY` 는 없다. Claim 노드의 `predicate` 는 `SUPPLIES_TO`, `label` 은 `공급사-<suffix> → 고객사-<suffix> 공급한다` 이고, 기업 노드의 `predicate` 는 null 이다.
  - 새 테스트 「1홉 그래프는 주장의 주체와 대상을 더하고 종류 필터와 노드 한도를 지킨다」:
    - 고객사를 중심으로 1홉을 부르면 공급사(주체)가 함께 온다.
    - `types=Claim` 으로 공급사를 중심으로 부르면 `supplier.id, claim.id` 만 온다. 고객사는 Company 라 더하지 않는다.
    - 중심 기업 하나에서 고객 기업 넷으로 SUPPLIES_TO Claim 넷을 만든다(근거 문서 하나 공유). 1홉을 부르면 노드는 5개(중심과 Claim 넷)이고 `truncated` 가 `true` 다. 이웃 쿼리만으로는 잘리지 않으므로, 끝 노드를 더하지 못해 잘렸음을 확인하는 경우다.
  - 기존 「필터는 경로 위 모든 노드에 적용되어...」 의 기대값은 바뀌지 않는다. 바뀌면 구현이 경로 필터를 건드린 것이다.
- `financial-workbench/web/src/lib/labels.test.ts`
  - `withJosa`: `withJosa('가나전자', '이(가)')` 는 `가나전자가`, `withJosa('다라부품', '이(가)')` 는 `다라부품이`, `withJosa('삼성', '와(과)')` 는 `삼성과`, `withJosa('가나전자', '와(과)')` 는 `가나전자와`, `withJosa('ABC', '이(가)')` 는 `ABC이(가)` 다. 기존 `withEulReul` 테스트는 그대로 통과한다.
  - `claimSentenceParts`: 테스트 온톨로지의 predicate `MENTORED` 에 `sentence: '{subject}이(가) {object}에 가르쳤다'` 를 더한다. 이름 없이 부르면 `[slot subject, text '이(가) ', slot object, text '에 가르쳤다']`, `names.subject` 가 `가나전자` 면 둘째 조각이 `가 ` 다. 문장 틀이 없는 경우는 fixture 에 없는 키 `'UNKNOWN'` 으로 부른다. `[slot subject, text ' ', slot object, text ' UNKNOWN']` 이다(표시 이름이 없으면 키를 그대로 쓴다).
  - `nodeDisplayLabel`: `{ type: 'Claim', label: '가 → 나 가르쳤다' }` 는 그대로, `{ type: 'Claim', label: 'MENTORED' }` 는 `가르쳤다` 다.
- `financial-workbench/web/e2e/workbench.spec.ts`
  - 3번 테스트: 승인 뒤 `review-message` 가 `${data.supplier} → ${data.customer} 공급한다` 를 담는다.
  - 4번 테스트: `searchAndOpen(pageA, data.supplier)` 직후 `[data-testid="graph-node"][data-node-type="Company"]` 를 `data.customer` 로 좁힌 항목이 1개다. 1홉에서도 고객사가 보인다는 근거다. Claim 항목은 `${data.supplier} → ${data.customer} 공급한다` 를 담는다.
  - 4번 테스트의 확장 뒤 세 개수 확인(307행부터 309행)은 `data-node-type` 으로 좁힌다. 기업 둘은 `[data-node-type="Company"]`, 문서는 `[data-node-type="Document"]` 다.
  - 4번 테스트 298행의 주석 「고객사와 문서는 Claim 너머(2홉)에 있다」 를 「고객사는 1홉에서도 주장의 대상으로 함께 온다. 문서는 주장 너머(2홉)에 있다」 로 고친다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.ontology.OntologyLabelsTest' --tests 'dev.fos.workbench.knowledge.ClaimIntegrationTest' --tests 'dev.fos.workbench.graph.SearchAndGraphIntegrationTest'
cd financial-workbench/api && ./gradlew test
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/lib/labels.test.ts src/components/ChangesTab.test.tsx
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan006 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan006 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- `./gradlew test` 전체가 통과해야 한다. `OntologyValidatorTest` 와 `OntologyLabelsTest` 의 최소 YAML 은 `claimPredicates: {}` 라 `sentence` 를 요구하지 않는다.
- 브라우저 테스트 두 project 가 모두 통과해야 한다. `ChangesTab.test.tsx` 가 통과하면 예전 이력의 키 이름이 여전히 표시 이름으로 보인다는 근거다.
- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/KnowledgeReader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/ClaimService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/graph/GraphService.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/ClaimIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/graph/SearchAndGraphIntegrationTest.kt` | 수정 |
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/lib/labels.ts` | 수정 |
| `financial-workbench/web/src/lib/labels.test.ts` | 수정 |
| `financial-workbench/web/src/components/ReviewTab.tsx` | 수정 |
| `financial-workbench/web/src/components/ClaimCard.tsx` | 수정 |
| `financial-workbench/web/TESTIDS.md` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
