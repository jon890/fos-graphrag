# Phase 01. 온톨로지 확장과 표시, 검색 속성

**Execution profile**: standard

## 목표

온톨로지에 인물(Person)과 개념(Concept) 타입, `AUTHORED`, `RELATED_TO` 관계, `ADVOCATES`, `CRITICIZES` 주장 종류를 더하고, 근거 문서의 자료 종류에 책, 서한, 강연을 더한다.
노드 타입마다 색과 모양(`display`), 검색에 넣을 속성(`searchProperties`)을 YAML 이 소유하게 하고, 서버가 `searchProperties` 로 `searchText` 를 만든다.
다음 phase 의 초기 데이터와 그다음 phase 의 화면이 이 정의를 쓴다.

**범위 외**: 초기 데이터(`ontology/seeds/`, `SeedLoader`)는 phase 02 다. 화면(색과 모양을 읽는 웹 코드)은 phase 03 이다. 이 phase 는 `financial-workbench/web/src/` 를 고치지 않는다.

## 컨텍스트

- 온톨로지 파일은 `financial-workbench/ontology/financial-ontology.yaml` 이고 `schemaVersion` 은 `"1.3.0"` 이다. 노드 타입은 `Company`, `Security`, `Sector`, `Document`, `Claim` 이다. 속성은 블록 표기와 흐름 표기를 섞어 쓴다. 머리 주석이 흐름 표기 안의 쉼표와 콜론을 따옴표로 감싸라고 적는다. `Document.documentType` 은 `values: [FILING, NEWS, REPORT, IR, OTHER]` 와 `valueLabels` 다. `relationshipTypes.ISSUES` 는 `createPicker` 를 가진다. `claimPredicates` 의 각 항목은 `label`, `description`, `subjectTypes`, `objectTypes`, `sentence`(큰따옴표, `{subject}`, `{object}` 를 한 번씩, 조사는 `이(가)` 같은 표기)다. 끝에 `changeFields` 블록이 있다.
- 모델은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` 의 `NodeTypeDef`(`label`, `description`, `labelProperty`, `managedBy`, `properties`, `hintProperties`), `PropertyDef`, `RelationshipTypeDef`(`createPicker`), `ClaimPredicateDef`(`sentence`)다. `NodeTypeDef` 와 `PropertyDef` 에 `@JsonInclude(NON_NULL)` 이 붙어 있다. 로더 `ontology/OntologyLoader.kt` 는 `FAIL_ON_UNKNOWN_PROPERTIES` 를 켜고, `checkConsistency(o)` 에서 `hintProperties` 가 속성에 있는지, `valueAliases`(`checkAliases`)를 검사한다.
- 검색어는 `knowledge/NodeService.kt` 의 `private fun searchText(type, props) = listOfNotNull(ontology.labelOf(type, props), props["ticker"]).joinToString(" ").lowercase()` 다. 만들기(`create`)와 고치기(`patch`)가 부른다.
- 정수 속성은 `type: integer` 다(`PropertyType.INTEGER`). `min`, `max` 를 줄 수 있다.
- 테스트
  - `api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` 가 모든 타입, 속성, enum 값, 관계, predicate 에 표시 이름이 있는지, 모든 predicate 의 `sentence` 를, `changeFields` 를 확인한다. 「저장되는 값은 표시 이름과 상관없이 그대로다」 가 `claimPredicates.keys` 를 `containsExactly("SUPPLIES_TO", "BELONGS_TO_SECTOR", "COMPETES_WITH", "HAS_EXPOSURE_TO")` 로 단언한다. `minimal(nameProperty)` 도우미가 Company 하나짜리 YAML 을 만든다.
  - `ontology/OntologyValidatorTest.kt` 의 「온톨로지 파일이 스스로 일관되다」 가 `schemaVersion` 과 `nodeTypes.keys`(`containsExactlyInAnyOrder("Company", "Security", "Sector", "Document", "Claim")`)를 단언한다. `AuthIntegrationTest.kt` 도 `/api/ontology` 의 `schemaVersion` 을 단언한다.
  - 통합 테스트는 `support/IntegrationTest.kt` 를 상속하고 `support/Fixtures.kt` 의 `node(type, properties)` 로 노드를 만든다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「만들기 폼과 구분 정보」 표(`display`, `searchProperties` 행)와 그 아래 목록, 「노드」 의 타입 표와 Person, Concept 설명, 「관계」 표와 거장의 생각 문단, `financial-workbench/docs/flow.md` 의 「거장의 생각 담기」, `financial-workbench/docs/code-architecture.md` 「결정」 의 2026-10-23 항목

## 의도 메모

- 인용 타입을 따로 두지 않는다(사용자 결정 2026-10-23). 인용은 Claim 의 `evidenceText`, 출처는 Document 다.
- 기존 다섯 타입의 색과 모양은 지금 웹 코드의 값(`web/src/lib/graph.ts` 의 `TYPE_COLORS`, `GraphPanel.tsx` 의 모양)을 그대로 YAML 로 옮긴다. 화면이 바뀌지 않아야 한다.
- `searchProperties` 는 새 타입에만 둔다. 기존 노드의 `searchText` 를 다시 만들 필요가 없게 하려는 것이다. Security 의 `ticker` 는 지금 코드 그대로 둔다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. YAML

- `schemaVersion` 을 `"1.4.0"` 으로 올린다. 머리 주석의 키 설명에 `display`(그래프와 배지의 색, 모양), `searchProperties`(검색어에 넣을 속성)를 한 줄씩 더한다.
- 기존 타입에 `display` 를 더한다. Company `{ color: "#2563eb", shape: ellipse }`, Security `{ color: "#0d9488", shape: ellipse }`, Sector `{ color: "#9333ea", shape: hexagon }`, Document `{ color: "#d97706", shape: round-rectangle }`, Claim `{ color: "#dc2626", shape: round-diamond }`. 모양은 `financial-workbench/web/src/components/GraphPanel.tsx` 의 노드 스타일(`node[type = "Claim"]` 등)과 기본 모양을 읽고 같게 맞춘다.
- `Document.documentType` 의 `values` 끝(OTHER 앞)에 `BOOK`, `LETTER`, `SPEECH` 를 더하고 `valueLabels` 를 `BOOK: 책`, `LETTER: 서한`, `SPEECH: 강연과 인터뷰` 로 둔다.
- `Person` 타입을 `Document` 다음, `Claim` 앞에 더한다. 아래 두 표의 속성 행에서 「label …」 은 그 속성의 `label`, 「」 안은 `description` 이다.

  | 키 | 값 |
  | --- | --- |
  | `label`, `description` | 인물, 「투자자, 경영자, 경제학자 같은 인물이다.」 |
  | `labelProperty` | `name` |
  | `name` | label 이름, string, 필수, maxLength 200, 「인물의 이름. 예: 워런 버핏」 |
  | `englishName` | label 영문 이름, string, maxLength 200, 「영문 이름. 검색에 쓴다. 예: Warren Buffett」 |
  | `role` | label 구분, enum `[INVESTOR, EXECUTIVE, ECONOMIST, OTHER]`, valueLabels 투자자, 경영자, 경제학자, 기타, 「인물이 주로 한 일」 |
  | `country` | label 국가, Company 의 `country` 와 같은 values, valueLabels(별칭은 두지 않는다), 「주로 활동한 나라」 |
  | `birthYear` | label 태어난 해, integer, min 1000, max 2100, 「태어난 해. 예: 1930」 |
  | `deathYear` | label 세상을 떠난 해, integer, min 1000, max 2100, 「살아 있으면 비워 둔다」 |
  | `description` | label 소개, text, maxLength 4000, 「인물을 소개하는 글」 |
  | `hintProperties` | `[role, country]` |
  | `searchProperties` | `[englishName]` |
  | `display` | `{ color: "#db2777", shape: round-tag }` |
- `Concept` 타입을 `Person` 다음에 더한다.

  | 키 | 값 |
  | --- | --- |
  | `label`, `description` | 개념, 「안전마진, 경제적 해자 같은 투자 개념과 원칙이다.」 |
  | `labelProperty` | `name` |
  | `name` | label 개념 이름, string, 필수, maxLength 200, 「개념의 이름. 예: 안전마진」 |
  | `englishName` | label 영문 이름, string, maxLength 200, 「영문 이름. 검색에 쓴다. 예: Margin of Safety」 |
  | `category` | label 분류, enum `[VALUATION, BUSINESS, RISK, BEHAVIOR, STRATEGY, OTHER]`, valueLabels 가치 평가, 사업의 질, 위험 관리, 투자 심리, 투자 방식, 기타, 「개념이 다루는 영역」 |
  | `summary` | label 한 줄 정의, string, 필수, maxLength 300, 「개념을 한 문장으로 정의한다」 |
  | `description` | label 설명, text, maxLength 4000, 「더 자세한 설명」 |
  | `hintProperties` | `[category]` |
  | `searchProperties` | `[englishName]` |
  | `display` | `{ color: "#475569", shape: round-pentagon }` |

  새 타입의 색은 기존 다섯 타입의 색과 웹의 해시 팔레트(`web/src/lib/graph.ts` 의 `FALLBACK_COLORS`)와 겹치지 않게 골랐다.
- `relationshipTypes` 에 둘을 더한다. `AUTHORED`: label 「썼다」, description 「인물이 책, 서한, 강연 같은 자료를 썼다.」, from `[Person]`, to `[Document]`, `createPicker: { label: 저자, description: "이 자료를 쓴 인물. 고르면 자료를 만든 뒤 「썼다」 관계를 함께 만든다" }`. `RELATED_TO`: label 「관련된다」, description 「두 개념이 서로 관련된다. 근거가 필요 없는 식별 관계다.」, from `[Concept]`, to `[Concept]`.
- `claimPredicates` 에 둘을 더한다. `ADVOCATES`: label 「강조한다」, description 「인물이 개념이나 원칙을 강조한다. 짧은 인용과 출처를 근거로 붙인다.」, subjectTypes `[Person]`, objectTypes `[Concept]`, sentence `"{subject}이(가) {object}을(를) 강조한다"`. `CRITICIZES`: label 「비판한다」, description 「인물이 개념이나 관행을 비판한다.」, 같은 타입, sentence `"{subject}이(가) {object}을(를) 비판한다"`.
- Claim 의 `predicate` enum `values` 에 `ADVOCATES`, `CRITICIZES` 를 더한다(로더가 `valueLabels` 를 `claimPredicates` 에서 채운다).

### 2. 모델과 로더

- `NodeTypeDef` 에 `/** 검색어에 이름과 함께 넣을 속성 */ val searchProperties: List<String> = emptyList()` 와 `/** 그래프와 배지의 색, 모양 */ val display: NodeDisplayDef? = null` 을 더한다. `NodeDisplayDef(val color: String? = null, val shape: String? = null)` 에 `@JsonInclude(NON_NULL)` 을 붙인다.
- `OntologyLoader.checkConsistency` 에 검사를 더한다. 메시지 형식은 기존 `hintProperties` 검사와 같다.
  - `searchProperties` 가 그 타입의 속성에 없으면 멈춘다.
  - `display.color` 가 있으면 `^#[0-9a-fA-F]{6}$` 이어야 한다.
  - `display.shape` 가 있으면 `ellipse`, `round-rectangle`, `hexagon`, `round-diamond`, `round-tag`, `round-pentagon` 가운데 하나여야 한다. 목록은 `NodeDisplayDef` 의 `companion object` 상수 `SHAPES` 로 둔다.

### 3. `NodeService.searchText`

- `knowledge/NodeQueryService.kt` 의 `search` 위 주석(「label 과 ticker 를 소문자로 이은 searchText」)도 `searchProperties` 를 함께 적게 고친다.

- `listOfNotNull(ontology.labelOf(type, props), props["ticker"]) + def.searchProperties.mapNotNull { props[it] }` 를 공백으로 이어 소문자로 만든다(`def = ontology.requireNodeType(type)`). Security 의 `ticker` 처리는 그대로다.

### 4. 이 phase 를 검증하는 테스트

- `OntologyLabelsTest`: `claimPredicates.keys` 단언에 `ADVOCATES`, `CRITICIZES` 를 더한다. 새 테스트 「모든 노드 타입에 색과 모양이 있다」(Claim 포함 일곱 타입의 `display.color`, `display.shape` 가 비어 있지 않다). 새 테스트 「색과 모양, 검색 속성이 잘못되면 읽지 않는다」: `minimal(...)` 의 Company 아래에 `display: { color: red }`, `display: { shape: star }`, `searchProperties: [nope]` 를 각각 넣은 YAML 이 `IllegalArgumentException` 이다.
- `OntologyValidatorTest` 의 `nodeTypes.keys` 단언에 `Person`, `Concept` 를 더하고 `schemaVersion` 을 `"1.4.0"` 으로 고친다. `AuthIntegrationTest` 의 `schemaVersion` 단언도 `"1.4.0"` 으로 고친다. 새 테스트 「인물의 연도는 정수 범위를 검사한다」: `validateCreate("Person", mapOf("name" to "x", "birthYear" to 999))` 가 `ValidationFailedException` 이다.
- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` 에 「인물은 영문 이름으로도 찾는다」 를 더한다. 초기 데이터(다음 phase)와 겹치지 않게 `Fixtures(alice).node("Person", mapOf("name" to "가상인물-<suffix>", "englishName" to "Virtual Investor <suffix>"))` 를 만든다. 검색어에 공백이 있으므로 `SearchAndGraphIntegrationTest.kt` 의 `q()` 처럼 URL 인코딩한 `GET /api/nodes?q=<investor <suffix 소문자> 인코딩>&types=Person` 에 그 노드가 있다. 이름을 고쳐도(`PATCH`) 영문 이름 검색이 그대로 된다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.ontology.*' --tests 'dev.fos.workbench.knowledge.NodeWriteIntegrationTest' --tests 'dev.fos.workbench.AuthIntegrationTest'
cd financial-workbench/api && ./gradlew test
grep -q 'ADVOCATES' financial-workbench/ontology/financial-ontology.yaml
```

- 각 줄은 저장소 루트에서 돈다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/ontology/financial-ontology.yaml` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/Ontology.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/NodeQueryService.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyLabelsTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/NodeWriteIntegrationTest.kt` | 수정 |
