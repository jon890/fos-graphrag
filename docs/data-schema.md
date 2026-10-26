# 데이터 스키마

## 온톨로지와 지식 데이터

온톨로지는 타입, 속성, 관계의 정의다. Neo4j 의 `:OntologyVersion` 에 버전으로 쌓이고, API 는 최신 버전으로 검증한다(「온톨로지 버전」, [ADR-008](adr/008-ontology-versions-in-db.md)). 저장소의 `ontology/financial-ontology.yaml` 은 첫 버전과 서버 코드가 소유하는 부분의 원본이다.
지식 데이터는 그 정의를 따르는 개별 기업, 종목, 인물, 개념, 주장이다. Neo4j 에 있다.

API 는 저장된 최신 버전으로 모든 쓰기를 검증한다. 저장하면 다음 요청부터 새 버전으로 검증한다.
Neo4j 는 온톨로지 규칙을 집행하지 않는다. 아래 제약 조건은 유일성과 조회 속도만 맡는다.

온톨로지를 바꾸는 절차는 이렇다.

1. ADMIN 이 온톨로지 상세 화면(더보기)의 폼 편집기나 YAML 편집기로 고친다(「온톨로지 편집」, [흐름](flow.md)).
2. 저장하기 전에 기존 데이터가 새 정의를 어기는지 영향 목록으로 본다. 서버와 편집 폼은 바뀐 칸만 검사하므로, 새 정의를 어기는 값이 남아도 다른 칸은 고칠 수 있다. 어긴 칸을 고칠 때는 새 정의에 맞는 값을 넣어야 한다. 문자열 칸을 enum 으로 바꾸거나 enum 값을 뺄 때는 예전 표기를 `valueAliases` 에 적는다. API 가 시작할 때 고친다(「예전 값 정리」).
3. 확인하고 저장하면 새 버전이 생기고 바로 쓰인다. 재배포는 없다.

### 온톨로지 버전

`(:OntologyVersion {version, yaml, createdAt, createdBy, note, restoredFrom})` 가 버전 하나다.

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `version` | Integer | 1 부터 오르는 번호. 유일하다(`ontology_version_unique`) |
| `yaml` | String | 그 버전의 온톨로지 전체. 저장할 때 서버가 정규화한 YAML 이다 |
| `createdAt`, `createdBy` | String | 저장 시각과 `:User` 의 `id`. 서버가 만든 버전은 `system` 이다 |
| `note` | String | 저장할 때 적은 메모. 선택 |
| `restoredFrom` | Integer | 예전 버전으로 되돌린 버전이면 그 번호 |

- 최신 버전은 `version` 이 가장 큰 것이다. 버전은 지우거나 고치지 않는다. 되돌리기도 예전 내용을 담은 새 버전을 만든다.
- 응답과 YAML 의 `schemaVersion` 은 그 버전의 `version` 을 문자열로 쓴 값이다. 저장할 때 서버가 채운다.
- 저장은 `(:OntologyHead {key: 'ontology'})` 노드 하나(유일 제약 `ontology_head_key_unique`)를 잠근 뒤 최신 번호를 확인하고 새 번호로 만든다. 요청의 `baseVersion` 이 최신이 아니면 `409 REVISION_CONFLICT` 다. 동시 수정 처리(ADR-003)와 같은 방식이다.
- 저장하면 같은 트랜잭션에서 `ChangeEvent`(`targetKind = ONTOLOGY`, `targetId` 는 버전 번호, `action` 은 `UPDATE` 나 되돌리기면 `RESTORE`)를 남긴다. `changes` 의 `added`, `removed`, `changed` 에 미리보기와 같은 경로 목록을 담는다. 빈 목록은 담지 않는다.
- 새 관계 종류가 생기면 저장 직후 그 관계의 id 인덱스(`rel_<타입>_id`)를 만든다.

**코드가 소유하는 부분**: 아래는 저장소 YAML 의 값만 쓴다. 웹에서 보내도 저장할 때 저장소 값으로 바꾼다.

- `reviewStatuses`, `changeActions`, `changeFields`, `claimRelationships`
- `managedBy` 가 있는 노드 타입(Claim). 이 타입의 `predicate` 선택지는 `claimPredicates` 에서 만든다

**코드가 이름으로 읽는 키**: 아래 타입과 속성은 서버 코드가 이름으로 읽는다. 빼거나, 속성 타입이나 필수 여부를 바꾸면 미리보기가 `valid: false` 와 오류로 답한다. 표시 이름, 설명, enum 값 더하기는 된다. 목록은 서버 코드의 상수 한 곳(`CodeReadKeys`)이 소유한다.

- `Document` 와 그 속성 `title`, `url`, `publisher`, `documentType`, `publishedAt`, `collectedAt`(주장의 근거 목록이 읽는다)
- `Security` 와 그 속성 `market`, `ticker`(같은 종목 검사와 검색어가 읽는다)

**시작할 때**: 스키마 초기화 뒤, 예전 값 정리 앞에서 아래를 한다.

1. `(:OntologyHead {key: 'ontology'})` 가 없거나 그 `version` 이 0 이면 저장소 YAML 로 버전 1 을 만든다(작업자 `system`, 메모 「저장소 YAML 로 만든 첫 버전」). 그래서 저장소 YAML 을 다시 첫 버전으로 넣으려면 `OntologyHead` 와 모든 `OntologyVersion` 을 함께 지워야 한다. Head 만 남으면 최신 버전을 찾지 못해 시작이 멈추고, 버전만 남으면 버전 번호 유일성 제약에 걸린다.
2. 최신 버전의 코드 소유 부분이 저장소 YAML 과 다르면, 그 부분만 바꾼 새 버전을 만든다(메모 「코드가 소유하는 항목을 갱신」). 편집할 수 있는 부분은 그대로다. 바꾼 정의가 일관성 검사를 통과하지 못하면 새 버전을 만들지 않고 `error` 로그에 오류를 남긴 채 최신 버전으로 시작한다.
   - 최신 버전을 지금 코드의 로더로 읽지 못하면(모델이나 검사 규칙이 바뀐 경우) `error` 로그를 남기고 저장소 YAML 로 새 버전을 만든다(메모 「저장된 최신 버전을 읽지 못해 저장소 YAML 로 만든 버전」). 읽지 못한 버전은 지우지 않는다. 그래서 온톨로지 모델이나 검사 규칙을 바꾸는 코드 변경은, 저장된 YAML 을 새 형식으로 옮기는 시작 작업을 함께 둔다.
3. 저장소 YAML 의 편집할 수 있는 부분에만 있는 타입, 관계 종류, 주장 종류가 있으면 `warn` 로그에 키를 남긴다. 자동으로 더하지 않는다. 배포 뒤 ADMIN 이 웹에서 더한다.

**어긋나는 변경**: 저장 전에 서버가 지금 데이터와 비교해 영향 목록을 만든다. 저장하려면 요청에 `confirm: true` 가 있어야 한다(영향이 없으면 없어도 된다). 데이터는 바꾸지 않는다.
영향은 `OntologyHead` 를 잠그기 전에 세므로, 센 뒤 저장이 끝나기 전에 노드를 쓰면 그 영향은 확인 없이 저장될 수 있다. 어긋나는 데이터를 허용하는 결정에 따라 받아들인 한계다.

| 변경 | `kind` | 영향으로 세는 것(보관된 것 포함) |
| --- | --- | --- |
| 노드 타입 빼기 | `REMOVED_NODE_TYPE` | 그 타입의 노드 수 |
| 속성 빼기 | `REMOVED_PROPERTY` | 그 속성 값이 있는 노드 수 |
| 속성을 필수로 바꾸기, 기존 타입에 필수 속성 더하기 | `NOW_REQUIRED` | 그 속성 값이 없는 노드 수 |
| enum 값 빼기 | `REMOVED_ENUM_VALUE` | 그 값을 쓰는 노드 수 |
| 속성 타입 바꾸기 | `CHANGED_PROPERTY_TYPE` | 그 속성 값이 있는 노드 수 |
| `maxLength` 줄이기, `min`/`max` 좁히기(없던 제한을 새로 두는 것 포함) | `NARROWED_RANGE` | 새 범위를 넘는 노드 수 |
| 관계 종류 빼기 | `REMOVED_RELATIONSHIP_TYPE` | 그 관계 수 |
| 관계의 시작이나 끝 타입 줄이기 | `NARROWED_RELATIONSHIP_ENDS` | 빠진 타입에 걸린 그 관계 수 |
| 주장 종류 빼기 | `REMOVED_CLAIM_PREDICATE` | 그 종류의 주장 수 |
| 주장의 주체나 대상 타입 줄이기 | `NARROWED_CLAIM_TYPES` | 빠진 타입을 주체나 대상으로 둔 그 종류의 주장 수 |

- 영향 항목은 `{path, kind, count}` 다. `path` 는 바뀐 정의의 경로(`nodeTypes.Person.properties.nickname` 등)다. `count` 가 0 인 항목은 담지 않는다.

**정의에서 빠진 데이터**: 빼도 데이터는 지우지 않는다. 남은 데이터는 아래처럼 다룬다. 그 정의를 같은 키로 다시 더하면 처음처럼 쓴다.

| 남은 것 | 읽기(검색, 목록, 그래프, 상세) | 쓰기 |
| --- | --- | --- |
| 빠진 타입의 노드 | 그대로 나온다. 이름은 `name` 속성, 없으면 타입 키다. 속성은 시스템 속성을 뺀 저장된 값을 모두 담는다 | 고치기는 `400 ONTOLOGY_VIOLATION`(`unknown-node-type`). 보관과 복원은 된다 |
| 빠진 속성의 값 | 응답에 담지 않는다(지금처럼 정의된 속성만 담는다). 노드에는 남는다 | 고칠 때 보내면 `400 ONTOLOGY_VIOLATION` |
| 빠진 관계 종류의 관계 | 그래프와 상세의 관계 목록에 나온다. 이름은 관계 키다 | 새로 만들 수 없다. 보관과 복원도 할 수 없고(`404 NOT_FOUND`), 화면은 그 단추를 숨긴다 |
| 빠진 주장 종류의 주장 | 그대로 나온다. 이름의 관계 부분은 주장 종류 키다 | 내용 고치기는 `400 ONTOLOGY_VIOLATION`. 검토, 보관, 복원은 된다 |

- 검색, 목록, 그래프의 타입 필터는 지금 정의에 없는 타입 키도 받는다. 키 형식(영문자로 시작하는 영문자, 숫자, 밑줄)만 검사하고 Cypher 에는 parameter 로 넘긴다.
- 저장소에 없는 노드 타입에는 `managedBy` 를 둘 수 없다. 미리보기가 오류로 답한다.

**초기 데이터와의 관계**: 초기 데이터 파일이 최신 버전에 없는 타입, 관계 종류, 주장 종류를 쓰면 그 파일을 적용하지 않고 `warn` 로그를 남긴다. `:SeedRun` 을 만들지 않으므로, ADMIN 이 그 정의를 더한 뒤 다음 시작 때 적용된다. 시작은 멈추지 않는다.

- 키(타입, 속성, 관계 종류, 주장 종류, enum 값의 이름)는 바꾸지 않는다. 바꾸려면 빼고 더해야 하고, 위 표의 영향으로 보인다. 표시 이름(`label`, `valueLabels`, `description`, `sentence`, `display`)은 언제나 바꿀 수 있다.
- 저장된 정의는 로더의 일관성 검사(알 수 없는 키, `labelProperty`, `hintProperties`, `searchProperties`, `display`, `valueAliases`, 타입과 관계 이름 형식)를 지금처럼 통과해야 한다. 통과하지 못하면 `400 ONTOLOGY_INVALID` 와 오류 목록이다.

### 표시 이름

화면에 보이는 이름은 코드가 아니라 같은 YAML 이 소유한다. 타입, 속성, enum 값, 관계, predicate 가 늘어도 YAML 만 고치면 화면이 따라간다.
저장되는 값(`KRX_KOSPI`, `BELONGS_TO_SECTOR`, `DRAFT` 등)과 키는 표시 이름과 상관없이 그대로다.

| 위치 | 키 | 뜻 |
| --- | --- | --- |
| `nodeTypes.<타입>`, `nodeTypes.<타입>.properties.<속성>`, `relationshipTypes.<관계>`, `claimRelationships.<관계>`, `claimPredicates.<predicate>` | `label` | 화면에 보일 이름. 없으면 화면이 키를 그대로 보인다 |
| enum 속성 | `valueLabels` | 선택지 표시 이름. 키는 `values` 안에 있어야 한다 |
| `reviewStatuses.<상태>`, `changeActions.<작업>` | `label`, `description` | Claim 검토 상태와 변경 이력 작업의 표시 이름. 키는 서버가 정한 값이다 |
| `changeFields.<키>` | `label` | 변경 이력의 `changes` 에 나오는 키 가운데 온톨로지 속성이 아닌 것(`subjectId`, `objectId`, `documentIds`, `fromId`, `toId`, `reviewStatus`, `reviewedBy`, `reviewedAt`, `reviewNote`, `archived`, `email`, `displayName`, `role`, `enabled`, 온톨로지 이력의 `added`, `removed`, `changed`)의 표시 이름. 속성인 키는 그 속성의 `label` 을 쓴다. 서버가 이 목록을 상수로 두고 테스트가 YAML 과 대조한다 |
| 속성 | `description` | 입력칸 바로 아래에 보이는 도움말. 개발 용어 없이 쓴다 |
| `nodeTypes.<타입>` | `description` | 타입 설명. 첫 문장은 「＋ 추가」 메뉴의 짧은 설명으로 쓰이므로 그 문장만 읽어도 무엇인지 알게 쓴다 |
| `relationshipTypes.<관계>` | `sentence` | 관계 문장 틀. `{from}` 과 `{to}` 를 한 번씩 담는 한다체 문장이다(예: `{to}은(는) {from}에 대한 결정이다`). 조사 표기는 `claimPredicates` 의 `sentence` 와 같다. 없으면 「{from}이(가) {to}을(를) {label}」 로 보인다. 서버가 두 자리표시를 검사한다. 화면 규칙은 [흐름](flow.md) 의 「관계 문장」 이다 |
| `claimPredicates.<predicate>` | `sentence` | 주장 만들기 폼의 문장 틀. `{subject}` 와 `{object}` 자리에 고르기 칸이 들어간다. 조사는 `이(가)`, `은(는)`, `을(를)`, `와(과)`, `으로(로)` 로 적으면 화면이 고른 이름의 끝소리에 맞춰 하나로 바꾼다. 영문과 숫자로 끝나는 이름은 읽는 소리로 고른다([흐름](flow.md) 의 「조사 고르기」). 없으면 「{subject} {object} 관계 이름」 순서로 보인다 |

- Claim 의 `predicate` 선택지 이름은 `claimPredicates.<predicate>.label` 에서 온다. 로더가 응답의 `valueLabels` 에 채워 주므로 따로 적지 않는다.
- 로더는 알 수 없는 키가 있으면 시작을 멈춘다. YAML 흐름 표기(`{ ... }`) 안에서 쉼표나 콜론이 든 문장을 따옴표로 감싸지 않으면 뒷부분이 값 없는 키가 되기 때문이다.
- `OntologyLabelsTest` 가 모든 타입, 속성, enum 값, 관계, predicate, 검토 상태, 변경 작업, 변경 이력 항목(`changeFields`)에 표시 이름이 있는지, 모든 predicate 에 `sentence` 가 있고 `{subject}` 와 `{object}` 를 한 번씩 담는지 확인한다.

### 만들기 폼과 구분 정보

같은 YAML 이 만들기 폼과 목록에 보일 정보도 정한다.

| 위치 | 키 | 뜻 |
| --- | --- | --- |
| `nodeTypes.<타입>` | `hintProperties` | 이름 옆에 함께 보일 속성 목록. 검색 결과, 고르기 후보, 같은 이름 경고에서 같은 이름의 항목을 구분하게 한다. 화면은 이 속성들의 표시 값과 만든 날을 ` · ` 로 잇는다. 없으면 만든 날만 보인다 |
| `relationshipTypes.<관계>` | `createPicker.label`, `createPicker.description` | 끝(`to`) 타입을 만드는 폼에 시작(`from`) 노드를 고르는 칸을 더한다. 고르지 않아도 만들 수 있다. 고르면 노드를 만든 뒤 이 관계를 이어서 만든다 |
| `nodeTypes.<타입>` | `display.color`, `display.shape` | 그래프 노드, 타입 배지, 범례의 색(`#rrggbb`)과 그래프 노드 모양(`ellipse`, `round-rectangle`, `hexagon`, `round-diamond`, `round-tag`, `round-pentagon` 가운데 하나). 없으면 화면이 타입 이름으로 고른 색과 원을 쓴다 |
| `nodeTypes.<타입>` | `searchProperties` | 검색어(`searchText`)에 이름과 함께 넣을 속성. 영문 이름처럼 다른 표기로도 찾게 한다. Security 의 `ticker` 는 지금처럼 늘 들어간다 |

- `hintProperties`, `searchProperties` 는 그 타입의 속성이어야 한다. `display.color` 는 `#` 과 16진수 여섯 자리, `display.shape` 는 위 목록 가운데 하나여야 한다. 로더가 시작할 때 확인한다.
- `createPicker` 는 저장소 YAML 의 일반 관계 가운데 개념을 잇는 `RELATED_TO`, `USES_CONCEPT` 를 뺀 모두에 있다. 관계의 끝이 나중에 만드는 노드가 되게 방향을 정했다. 예를 들어 병목 폼에는 「이 병목을 만든 변화」 와 「병목이 있는 산업」, 결정 폼에는 「결정한 종목」 과 「결정에 쓴 밸류에이션」 칸이 생긴다. 목록은 「관계」 절의 표가 소유한다.
- `searchProperties` 를 바꾸면 이미 저장된 노드의 `searchText` 는 그 노드를 다음에 고칠 때 새 규칙으로 바뀐다. 바로 맞추려면 「초기 데이터」 와 같은 시작 작업이 필요하다. 이번에는 새 타입에만 쓰므로 기존 노드에 영향이 없다.

### 예전 값 정리

API 는 시작할 때, 스키마 초기화가 끝난 뒤 `valueAliases` 가 있는 enum 속성의 값이 `values` 밖인 노드를 찾아 고친다. 지금은 Company `country` 와 Security `currency` 다.
문자열 칸을 목록으로 바꾸기 전에 저장된 「원」, 「한국」 같은 표기를 목록 값에 맞추기 위해서다.

- 앞뒤 공백을 지우고 대소문자를 무시해 `values` 의 값과 같으면 그 값으로 바꾼다. 예: `kr` 은 `KR` 이 된다.
- `valueAliases` 의 별칭과 같으면 그 키로 바꾼다. 비교는 앞뒤 공백을 지우고 대소문자를 무시한다. 예: `valueAliases: { KRW: [원, 원화, "₩"] }`
- 공백만 있는 값은 속성을 지운다. 빈 문자열은 값이 없는 것으로 보는 규칙과 같다.
- 어디에도 맞지 않는 값은 그대로 둔다. 편집 폼의 선택 칸은 그 값을 「목록에 없는 값: 그 값」 으로 보여 주고, 그 칸을 건드리지 않으면 다른 칸을 저장할 수 있다.
- 보관된 노드는 고치지 않는다. 보관된 노드는 수정할 수 없다는 규칙과 같다. 복원한 뒤 다음 시작 때 고쳐진다.
- Claim 처럼 `managedBy` 가 있는 타입은 고치지 않는다. 검토 규칙의 `contentUpdatedBy` 를 바꾸지 않기 위해서다.
- `valueAliases` 가 없는 enum 속성(`market` 등)은 고치지 않는다. 처음부터 목록이던 칸이고, `market` 을 고치면 (market, ticker) 유일성 제약에 걸릴 수 있다.
- 노드마다 트랜잭션 하나로 고친다. 그 노드를 잠그고, revision 을 올리고, `actorId = system` 인 `UPDATE` ChangeEvent 를 같은 트랜잭션에서 남긴다. 정리 전체를 한 트랜잭션으로 묶으면 대상이 많을 때 시간 제한(8초)을 넘어 매번 롤백된다. `note` 는 「온톨로지 목록에 맞춰 예전 값을 고쳤다」 다. 이력 없이 데이터를 바꾸지 않는다.
- 여러 번 돌아도 결과가 같다. 고칠 값이 없으면 아무것도 쓰지 않는다. 정리가 실패하면 스키마 초기화가 실패한 것과 같이 API 가 시작하지 않는다. 그 앞에서 고친 노드는 커밋된 채 남고, 다음 시작 때 남은 노드부터 다시 고친다.
- `valueAliases` 의 키는 `values` 안에 있어야 하고, 한 속성 안에서 별칭이 겹치거나 다른 값과 같으면 안 된다. 로더가 시작할 때 확인한다.

## 속성 타입

| 온톨로지 타입 | JSON 입력 | Neo4j 저장 |
| --- | --- | --- |
| `string` | 문자열, 앞뒤 공백 제거, `maxLength` 검사 | String |
| `text` | 문자열, 줄바꿈 허용 | String |
| `url` | `http`, `https` 절대 URL | String |
| `enum` | `values` 가운데 하나 | String |
| `date` | `YYYY-MM-DD` | String (ISO 날짜) |
| `datetime` | ISO-8601 시각 | String (UTC, 초까지 고정 자릿수 `YYYY-MM-DDTHH:MM:SSZ`) |
| `number` | 숫자, `min`, `max` 검사 | Float |
| `integer` | 정수 | Integer |
| `boolean` | `true`, `false` | Boolean |

날짜와 시각을 문자열로 저장하는 것은 JSON 계약과 같은 표현을 쓰고 정렬을 사전순으로 하기 위해서다.
그래서 자릿수를 고정한다. 서버가 기록하는 시각은 마이크로초 6자리(`2026-10-20T03:15:00.123456Z`)다.
`Instant.toString()` 처럼 소수 자릿수가 값마다 다르면 `...00.5Z` 가 `...00Z` 보다 앞에 정렬된다.
첫 버전으로 만든 개발 데이터의 시각은 그대로 읽힌다. 다만 그 값끼리의 정렬은 어긋날 수 있다.
온톨로지에 없는 속성 이름은 `400 ONTOLOGY_VIOLATION` 이다. 빈 문자열은 값이 없는 것으로 본다.

## 노드

온톨로지 노드는 모두 `:Knowledge` label 과 타입 label(`:Company` 등)을 함께 가진다.
`:Knowledge` 는 공통 조회와 ID 유일성 제약을 위한 label 이다.

공통 시스템 속성은 API 만 쓴다. 사용자가 `properties` 로 보낼 수 없다.

| 속성 | 타입 | 설명 |
| --- | --- | --- |
| `id` | String | UUID. 외부 계약의 식별자 |
| `type` | String | 타입 label 과 같은 값 |
| `revision` | Integer | 1 부터 시작, 변경마다 1 증가 |
| `archived` | Boolean | 보관 여부 |
| `archivedAt` | String | 보관 시각. 복원하면 지운다 |
| `createdAt`, `updatedAt` | String | UTC ISO 시각 |
| `createdBy`, `updatedBy` | String | `:User` 의 `id` |
| `searchText` | String | `label`, Security 의 `ticker`, 그 타입의 `searchProperties` 값을 공백으로 이어 소문자로 만든 값. 검색용 |

Claim 만 더 가지는 시스템 속성이 있다.

| 속성 | 타입 | 설명 |
| --- | --- | --- |
| `reviewStatus` | String | `DRAFT`, `REVIEWED`, `REJECTED` |
| `reviewedBy` | String | 검토자 `:User` 의 `id`. `DRAFT` 로 돌아가면 지운다 |
| `reviewedAt` | String | 검토 시각 |
| `reviewNote` | String | 검토 메모 |
| `contentUpdatedBy` | String | 내용을 마지막으로 고친 `:User` 의 `id`. 처음에는 작성자다. 이 사람과 작성자는 검토할 수 없다 |

타입별 사용자 속성은 온톨로지 파일이 정한다. 요약은 다음과 같다.

| 타입 | 필수 속성 | 선택 속성 |
| --- | --- | --- |
| Company | `name` | `country`, `registrationNumber`, `description` |
| Security | `market`, `ticker`, `name` | `securityType`, `currency` |
| Sector | `name` | `scheme`, `code` |
| Document | `title`, `url`, `collectedAt` | `publisher`, `documentType`, `publishedAt` |
| Person | `name` | `englishName`, `role`, `country`, `birthYear`, `deathYear`, `description` |
| Concept | `name`, `summary` | `englishName`, `category`, `description` |
| Change | `title`, `category` | `since`, `durability`, `description` |
| Bottleneck | `title`, `status` | `demandEvidence`, `supplyConstraint`, `resolutionPath`, `expectedResolution`, `description` |
| Valuation | `title`, `currentPrice` | `asOf`, `currency`, `method`, `description` |
| Scenario | `title`, `kind`, `valuePerShare` | `assumptions`, `description` |
| Decision | `title`, `action` | `decidedAt`, `reason` |
| Claim | `predicate`, `description`, `evidenceText`, `authoringMethod` | `validFrom`, `validTo`, `extractionConfidence` |

Company 의 `country` 와 Security 의 `currency` 는 목록에서 고른다(enum). 선택지는 온톨로지 파일이 정한다. 국가는 「기타」 를 두고, 통화는 두지 않는다.
Claim 의 `validFrom`, `validTo` 가 비어 있으면 관계의 유효 기간을 모른다는 뜻이다. 미상을 특정 날짜로 바꾸지 않는다.
`extractionConfidence` 는 AI 추출의 확신도다. 투자 성공 확률과 다르고 첫 버전에서는 AI 추출을 하지 않아 비어 있다.
자료 공개 시점은 Document 의 `publishedAt`, 수집 시점은 `collectedAt` 이다.
Document 의 `documentType` 에 책(`BOOK`), 서한(`LETTER`), 강연과 인터뷰(`SPEECH`)가 있다. 책과 서한은 출판사나 원문 페이지 주소를 `url` 에 넣는다.
Change, Bottleneck, Valuation, Scenario, Decision 은 투자 온톨로지의 타입이다. 뜻과 선택지는 아래 「투자 온톨로지」 가 소유한다.
개념 칩과 근거 따라가기는 Concept 의 `summary` 를 이름으로 읽는다. 온톨로지에서 이 속성이나 Concept 타입이 빠지면 칩에 한 줄 정의가 없거나 칩이 보이지 않을 뿐 저장은 막지 않으므로 `CodeReadKeys` 에 넣지 않는다.
Person 은 투자자, 경영자, 학자 같은 인물이다. `role` 은 목록에서 고르고 `birthYear`, `deathYear` 는 정수다. Concept 는 안전마진, 경제적 해자 같은 투자 개념과 원칙이다. `summary` 는 한 줄 정의(300자 이하), `category` 는 목록에서 고른다.

## 관계

모든 관계는 `id`, `revision`, `archived`, `createdAt`, `createdBy` 를 가진다.
보관과 복원을 하는 관계는 `archivedAt`, `updatedAt`, `updatedBy` 도 가진다.

| 관계 | 시작 | 끝 | 만드는 곳 |
| --- | --- | --- | --- |
| `ISSUES` | Company | Security | 관계 API |
| `AUTHORED` | Person | Document | 관계 API |
| `RELATED_TO` | Concept | Concept | 관계 API |
| `CREATES` | Change | Bottleneck | 관계 API |
| `HAS_BOTTLENECK` | Sector | Bottleneck | 관계 API |
| `BENEFITS` | Bottleneck | Company | 관계 API |
| `HAS_VALUATION` | Company | Valuation | 관계 API |
| `HAS_SCENARIO` | Valuation | Scenario | 관계 API |
| `HAS_DECISION` | Security | Decision | 관계 API |
| `BASED_ON` | Valuation | Decision | 관계 API |
| `EVIDENCED_BY` | Change, Bottleneck, Valuation | Document | 관계 API |
| `USES_CONCEPT` | Change, Bottleneck, Company, Valuation, Scenario, Decision | Concept | 관계 API |
| `SUBJECT` | Claim | predicate 의 `subjectTypes` | Claim API |
| `OBJECT` | Claim | predicate 의 `objectTypes` | Claim API |
| `SUPPORTED_BY` | Claim | Document | Claim API |

산업 분류처럼 다른 편집자가 근거를 확인해야 하는 주장은 선 하나로 저장하지 않는다.
Claim 노드 하나와 `SUBJECT`, `OBJECT`, `SUPPORTED_BY` 관계로 저장한다. 주장마다 근거와 검토 상태가 붙는다.
주장 종류는 `BELONGS_TO_SECTOR`(기업이나 종목이 산업에 속한다), `ADVOCATES`, `CRITICIZES` 셋이다. 기업 사이의 관계(공급, 경쟁, 노출)는 담지 않는다([ADR-009](adr/009-investment-logic-chain.md)).
거장의 생각도 같은 방식이다. 「버핏 → 안전마진 강조한다」 처럼 인물(주체)과 개념(대상)을 잇는 Claim(`ADVOCATES`, `CRITICIZES`)을 만들고, 짧은 인용은 `evidenceText`, 출처인 책이나 서한은 근거 문서다. 저작과 저자는 `AUTHORED` 로 잇는다. `RELATED_TO` 는 개념 사이의 식별 관계라 근거가 필요 없다.
`USES_CONCEPT`(「쓰는 개념」)는 투자 온톨로지 항목이 판단에 쓴 개념을 가리킨다. 「FLNC 간이 DCF 는 DCF 개념을 쓴다」 처럼 잇는다. 근거 검토가 없는 일반 관계이고, 화면은 이 관계를 항목 상세와 근거 따라가기의 개념 칩으로 보인다([흐름](flow.md) 의 「개념 설명」). 만들기 폼의 고르기 칸(`createPicker`)은 두지 않는다. 항목을 만든 뒤 상세의 「＋ 연결 추가」 로 잇는다.

### 투자 온톨로지

내 투자 논리는 세상의 변화에서 투자 결정까지 아래처럼 이어진 노드로 남긴다. 결정 하나에서 밸류에이션, 기업, 병목, 변화까지 거슬러 갈 수 있게 하는 것이 목적이다([ADR-009](adr/009-investment-logic-chain.md)).
이 노드를 잇는 관계는 일반 관계다. 근거 검토와 근거 문장이 없고, 근거 자료는 `EVIDENCED_BY` 로 붙인다.

```text
Change ─CREATES→ Bottleneck ←HAS_BOTTLENECK─ Sector
                     │
                  BENEFITS
                     ↓
                  Company ─HAS_VALUATION→ Valuation ─HAS_SCENARIO→ Scenario
                     │                        │
                  ISSUES                   BASED_ON
                     ↓                        ↓
                  Security ─HAS_DECISION──→ Decision
```

| 타입 | 화면 이름 | 뜻 |
| --- | --- | --- |
| Change | 세상의 변화 | 오래 이어질 변화 하나. `category` 는 `TECHNOLOGY`(기술), `DEMOGRAPHIC`(인구), `SOCIOCULTURAL`(사회와 문화), `OTHER`(기타) |
| Bottleneck | 병목 | 변화가 만든 수요를 공급이 따라가지 못하는 가치사슬 구간. `status` 는 `HYPOTHESIS`(가설), `CONFIRMED`(확인), `RESOLVED`(해소) |
| Valuation | 밸류에이션 | 한 기업을 한 기준일에 평가한 결과. 다시 평가하면 고치지 않고 새로 만든다. `currentPrice` 는 그 기준일의 주가이고 `currency` 는 Security 의 통화 목록과 같다. `method` 는 `PER`, `PBR`, `EV_SALES`, `EV_EBITDA`, `DCF`, `REVERSE_DCF`, `OTHER` |
| Scenario | 시나리오 | 밸류에이션 하나의 비관, 기준, 낙관 가운데 하나. `kind` 는 `BEAR`, `BASE`, `BULL`. `valuePerShare` 는 밸류에이션과 같은 통화의 주당 가치이고, 핵심 가정은 `assumptions` 에 글로 적는다 |
| Decision | 투자 결정 | 어느 날 한 종목에 대해 내린 결정. `action` 은 `WATCH`(관심 등록), `BUY`(매수), `ADD`(추가 매수), `TRIM`(일부 매도), `EXIT`(전량 매도), `HOLD`(보류). `decidedAt` 을 모르면 비워 둔다 |

- `asOf`, `decidedAt`, `since`, `expectedResolution` 이 비어 있으면 모른다는 뜻이다. 미상을 특정 날짜로 바꾸지 않는다.
- 범위로 받은 가치는 중간값을 `valuePerShare` 에 넣고 범위는 `description` 에 적는다.
- 하방률, 상방률 같은 계산값은 아직 저장하지도 보이지도 않는다.
- 이 노드도 다른 노드처럼 로그인한 모든 사용자가 본다. 본인만 보는 것은 이해 표시, 체결 기록, 제안이다(「이해 표시」, 「체결 기록」, 「제안」).
- 에이전트 API 의 종목 찾기(`GET /api/v1/securities/lookup`)는 타입 키 `Security`, `Company`, `Decision`, `Valuation`, `Scenario`, 관계 키 `ISSUES`, `HAS_DECISION`, `BASED_ON`, `HAS_VALUATION`, `HAS_SCENARIO`, 속성 `market`, `ticker`, `currency`, `action`, `decidedAt`, `reason`, `asOf`, `currentPrice`, `method`, `kind`, `valuePerShare`, `assumptions` 를 이름으로 읽는다. 온톨로지에서 빠지면 그 칸이 `null` 이거나 목록이 빌 뿐 저장은 막지 않으므로 `CodeReadKeys` 에 넣지 않는다.

### 초기 데이터

`ontology/seeds/*.yaml` 은 처음 넣을 노드와 관계다. API 는 시작할 때, 예전 값 정리 다음에 아직 적용하지 않은 파일을 적용한다.

- 파일마다 `key` 가 있고, 적용하면 `(:SeedRun {key, appliedAt})` 를 남긴다. 같은 `key` 는 다시 적용하지 않는다. 그래서 초기 데이터로 만든 노드를 사람이 보관하거나 이름을 바꿔도 되살아나지 않는다.
- 노드는 `NodeService` 와 같은 검증과 이력으로 만든다. 작업자는 `system` 이다. 같은 타입에 같은 이름(앞뒤 공백과 대소문자를 무시하고 비교)의 보관되지 않은 노드가 이미 있으면 만들지 않고 그 노드를 쓴다.
- 노드에 `existing: true` 를 두면 그 노드는 만들지 않고 같은 타입, 같은 이름의 보관되지 않은 노드를 찾기만 한다. 찾지 못하면 그 노드에 걸린 관계를 건너뛰고 `warn` 로그를 남긴다. 앞 파일의 노드를 가리킬 때 쓴다. 사람이 그 노드를 보관하거나 이름을 바꿨으면 되살리지 않기 위해서다. 이름 칸(`labelProperty`) 밖의 속성은 적지 않아도 된다.
- 파일은 파일 이름 순서로 적용한다. 앞 파일의 노드를 `existing: true` 로 가리키는 파일은 이름이 그 파일보다 뒤에 와야 한다. 앞에 오면 빈 DB 에서 그 노드를 찾지 못해 관계를 건너뛴 채 `SeedRun` 이 남는다.
- 관계는 파일 안의 `ref` 로 끝을 찾는다. 끝을 찾지 못하거나 같은 타입, 같은 끝의 보관되지 않은 관계가 이미 있으면 만들지 않고 넘어간다. 그래서 새 파일이 앞 파일의 노드와 관계를 다시 적어도 된다.
- 파일을 읽지 못하면(문법 오류, 알 수 없는 키) 그 파일만 건너뛰고 파일 이름으로 `warn` 로그를 남긴다. 같은 `key` 가 여러 파일에 있으면 파일 이름 순서로 처음 것만 적용하고 나머지는 `warn` 로그로 남긴다.
- 한 파일은 트랜잭션 하나로 적용한다. 실패하면 그 파일 전체가 롤백되고 `SeedRun` 도 남지 않아 다음 시작 때 다시 시도한다. 실패해도 API 는 시작한다. 초기 데이터는 없어도 쓸 수 있기 때문이다.
- 끄려면 `workbench.seeds.enabled=false` 다. 기본은 켜짐이다.
- 지금 파일은 `investment-logic-2026-10` 과 `learning-concepts-2026-10` 둘이다.
- `investment-logic-2026-10` 은 친구가 Obsidian 에 정리한 투자 기록에서 옮긴 투자 온톨로지 항목이다. 메모리(HBM, 범용 DRAM), 데이터센터 전력과 에너지 저장, 칩 사이 광 연결의 변화와 병목, 그 산업과 기업과 종목, 공개 근거 자료, FLNC 의 밸류에이션 둘과 시나리오, 세 종목(SK하이닉스, FLNC, POET)의 결정 넷을 담는다. 원문과 대조하지 못한 값은 노드의 `description` 이나 `reason` 에 「원문 대조 대기」 라고 적었다. 친구의 실제 매매 날짜와 밸류에이션이 들어 있고 이 저장소는 공개다(사용자 결정 2026-10-24).
- `learning-concepts-2026-10` 은 투자 개념(안전마진, 경제적 해자, 내재가치, 미스터 마켓, 능력 범위, DCF, 매출총이익률, 수주 잔고, 공급 제약)과 개념 사이의 `RELATED_TO`, 그리고 `investment-logic-2026-10` 의 밸류에이션, 시나리오, 병목을 `existing: true` 로 가리켜 잇는 `USES_CONCEPT` 를 담는다. 개념의 한 줄 정의는 일반적인 교과서 정의만 쓰고, 출처가 필요한 수치나 인용은 넣지 않는다. 인물과 주장은 넣지 않는다.
- 이 파일은 `USES_CONCEPT` 를 쓴다. 최신 온톨로지 버전에 그 관계 종류가 없으면 관계를 만들다 `ONTOLOGY_VIOLATION` 으로 실패하고, 파일 전체(먼저 만든 개념 포함)가 롤백되어 `SeedRun` 이 남지 않는다. 로그는 `초기 데이터 learning-concepts-2026-10 를 적용하지 못했다` 다. ADMIN 이 온톨로지에 `USES_CONCEPT` 를 더한 뒤 API 를 다시 시작하면 그때 적용된다(`SeedLoader.run` 이 시작할 때마다 `SeedRun` 이 없는 파일을 다시 시도한다). 운영 순서는 [배포](deployment.md) 의 「개념 설명을 운영에 반영할 때」 다.
- 시드는 주장(Claim)을 만들지 못한다. 기업이나 종목의 산업 소속 주장은 사람이 근거를 붙여 만든다.

## 사용자

`(:User {id, email, displayName, role, enabled, googleSub, revision, createdAt, createdBy, updatedAt, updatedBy, lastLoginAt, guideDoneAt})`

- `email` 은 소문자로 저장한다. 허용 목록의 키다.
- 사용자 강등이나 비활성화는 대상과 활성 ADMIN 을 ID 순서로 한 번에 잠근 뒤 마지막 관리자인지 판정한다.
- `googleSub` 은 첫 Google 로그인 때 묶는다. 그 뒤에는 이 값으로 사용자를 찾는다. 응답에는 담지 않는다.
- `role` 은 `VIEWER`, `EDITOR`, `ADMIN` 가운데 하나다.
- 비밀번호는 저장하지 않는다. 로그인은 Google OpenID Connect 로만 한다.
- 개인 계좌 키, 잔고, 주문 내역은 이 모델에 넣지 않는다.
- 사용자가 발급한 연동 토큰, 사용자의 체결 기록과 제안은 `OWNS` 로 이어진 `:IntegrationToken`, `:Trade`, `:Proposal` 이다(「연동 토큰」, 「체결 기록」, 「제안」).
- `:User` 는 `:Knowledge` label 이 없어 검색과 그래프에 나오지 않는다.
- `guideDoneAt` 은 첫 접속 가이드를 끝내거나 건너뛴 시각이다. 없으면 로그인할 때 가이드가 열린다([흐름](flow.md) 의 「첫 접속 가이드」). 화면 상태라 `revision`, `updatedAt`, `updatedBy` 를 바꾸지 않고 ChangeEvent 도 남기지 않는다. 한 번 쓰면 지우지 않는다.
- 사용자 관리 변경도 ChangeEvent(`targetKind = USER`)로 남는다. 첫 관리자를 만든 이벤트의 actor 는 `system` 이다.

## 이해 표시

`(:User)-[:KNOWS {level, note, updatedAt}]->(:Knowledge)` 가 사용자 한 사람이 항목 하나에 남긴 이해 표시다. 결정과 근거는 [ADR-011](adr/011-learning-marks-and-trace.md) 이다.

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `level` | String | `KNOWN`(알아요), `UNSURE`(잘 모르겠어요), `LEARNING`(공부 중) 가운데 하나 |
| `note` | String | 내 메모. 1000자까지. 비우면 속성을 지운다 |
| `updatedAt` | String | 마지막으로 바꾼 시각. 서버가 기록하는 시각 형식이다 |

- 한 사용자와 한 항목 사이에는 관계가 하나만 있다. 쓰기는 그 사용자 노드에 쓰기 잠금(`_lock`)을 건 뒤 `MERGE` 한다. 같은 사람이 두 탭에서 동시에 써도 관계가 둘로 늘지 않고 나중 쓰기가 남는다.
- 본인만 읽고 쓴다. API 는 세션의 사용자 id 로만 관계를 찾으므로 다른 사람의 표시는 어느 응답에도 나오지 않는다.
- 지식 데이터가 아니라 개인 기록이다. 항목과 사용자의 `revision`, `updatedAt`, `updatedBy` 를 바꾸지 않고 ChangeEvent 도 남기지 않는다.
- 열람자(VIEWER)도 쓴다.
- 항목을 보관해도 표시는 남는다. 공부 목록은 그 항목을 「보관됨」 으로 보인다. 보관된 항목에도 표시를 쓰고 지울 수 있다.
- 사용자를 비활성화해도 표시는 남는다. 사용자 노드를 지우면(`DETACH DELETE`) 함께 사라진다. 지금은 사용자를 지우는 API 가 없다.
- `:User` 는 `:Knowledge` 가 아니다. 상세의 관계와 근거 따라가기는 양 끝을 `:Knowledge` 로 묶어 이 관계를 타지 않는다. 주변 그래프의 여러 단계 경로는 경로 위 관계와 노드에 거는 `archived = false` 조건 때문에 `KNOWS` 와 `:User` 를 지나지 않는다. 그래서 `KNOWS` 와 `:User` 에 `archived` 속성을 두지 않는다. 관계 id, revision 이 없고 `rel_<타입>_id` 인덱스도 만들지 않는다.

## 연동 토큰

`(:User)-[:OWNS]->(:IntegrationToken {id, name, scope, hash, last4, createdAt, lastUsedAt, revokedAt})` 가 사용자가 외부 에이전트에 넣으려고 발급한 개인 연동 토큰이다. 결정과 근거는 [ADR-012](adr/012-agent-integration-token.md), 계약은 [API 계약](api-contract.md) 의 「연동 토큰」 이다.

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `id` | String | UUID. 목록과 폐기에 쓰는 식별자 |
| `name` | String | 사용자가 붙인 이름. 50자까지 |
| `scope` | String | `READ`(조회만) 또는 `READ_WRITE`(조회와 기록). 속성이 없으면 `READ` 로 읽는다. 기록 범위를 처음 둔 배포 전에 발급한 토큰에는 이 속성이 없다 |
| `hash` | String | 토큰 원문(`fwb_` 포함 47자)의 SHA-256 을 소문자 16진수 64자로 쓴 값. 원문은 저장하지 않는다 |
| `last4` | String | 원문의 끝 네 글자. 목록에서 토큰을 구분하는 데 쓴다 |
| `createdAt` | String | 발급 시각. 서버가 기록하는 시각 형식이다 |
| `lastUsedAt` | String | `/api/v1` 이나 `/mcp` 인증에 마지막으로 성공한 시각. 쓴 적이 없으면 속성이 없다 |
| `revokedAt` | String | 폐기한 시각. 폐기하지 않았으면 속성이 없다 |

- 토큰 원문은 `fwb_` 뒤에 `SecureRandom` 32바이트를 base64url(채움 문자 없음)로 쓴 43자를 붙인다. 앞자리 `fwb_` 는 유출 검사 도구가 찾을 수 있게 붙인다.
- 인증할 때 받은 원문의 SHA-256 으로 `hash` 를 찾는다. 원문이 무작위 32바이트라 느린 해시(bcrypt)를 쓰지 않는다.
- 폐기는 지우지 않고 `revokedAt` 을 쓴다. 폐기한 토큰은 인증에 실패하고 목록에 나오지 않는다. 다시 살리는 API 는 없다.
- 사용자마다 폐기하지 않은 토큰은 5개까지다. 발급은 그 사용자 노드에 쓰기 잠금(`_lock`)을 건 뒤 세고 만든다. 같은 사람이 동시에 발급해도 5개를 넘지 않는다.
- `lastUsedAt` 은 앞 값보다 1분 넘게 지났을 때만 고쳐 쓴다. 요청마다 쓰기를 만들지 않으려는 것이다. 이 쓰기가 실패해도 요청은 처리한다.
- 토큰은 사용자 노드에만 이어진다. `:IntegrationToken` 은 `:Knowledge` 가 아니어서 검색, 그래프, 근거 따라가기에 나오지 않는다. `OWNS` 와 `:IntegrationToken` 에 `archived` 속성을 두지 않아 주변 그래프의 경로 조건(`archived = false`)에 걸려 지나가지 않는다.
- 사용자를 비활성화해도 토큰은 남지만 인증은 실패한다. 다시 활성화하면 폐기하지 않은 토큰이 다시 통한다. 사용자 노드를 지울 때 함께 지우는 규칙은 「사용자를 지울 때」 다.
- 범위는 발급할 때 정하고 바꾸지 않는다. 범위를 바꾸려면 새로 발급하고 예전 토큰을 폐기한다.
- 발급, 폐기, 사용 시각은 변경 이력(ChangeEvent)에 남기지 않는다. 지식 데이터가 아니라 개인 설정이고, 이력 화면은 다른 사용자에게도 보이기 때문이다.

## OAuth 연결

MCP 클라이언트(Claude Code, Codex)가 OAuth 로그인으로 받은 연결이다. 결정과 근거는 [ADR-015](adr/015-remote-mcp-oauth.md), 계약은 [API 계약](api-contract.md) 의 「OAuth 인가 서버」, 「연결된 앱」, 「원격 MCP(`/mcp`)」 다. 저장하는 것은 셋이다.

| 노드 | 이어지는 곳 | 뜻 |
| --- | --- | --- |
| `:OAuthClient` | 어디에도 잇지 않는다 | 동적 등록한 클라이언트 하나 |
| `:OAuthCode` | `(:User)-[:OWNS]->(:OAuthCode)` | 「연결 허용」 으로 만든 인가 코드 하나 |
| `:OAuthGrant` | `(:User)-[:OWNS]->(:OAuthGrant)` | 연결 하나. 「연결된 앱」 목록의 한 줄이고 지금 쓰는 접근 토큰과 갱신 토큰을 가진다 |

`:OAuthClient {id, name, redirectUris, createdAt, approvedAt}`

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `id` | String | UUID. OAuth `client_id` 다 |
| `name` | String | 등록할 때 받은 `client_name`. 100자까지. 없으면 「이름 없는 앱」 |
| `redirectUris` | `List<String>` | 등록한 `redirect_uris`. 10개까지 |
| `createdAt` | String | 등록 시각 |
| `approvedAt` | String | 처음 「연결 허용」 을 받은 시각. 받은 적이 없으면 속성이 없다 |

`:OAuthCode {hash, clientId, redirectUri, scope, codeChallenge, resource, createdAt, expiresAt, usedAt, grantId}`

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `hash` | String | 코드 원문(`fwc_` 포함 47자)의 SHA-256 소문자 16진수 64자 |
| `clientId` | String | 코드를 받을 `:OAuthClient` 의 `id` |
| `redirectUri` | String | 인가 요청의 `redirect_uri`. 토큰 요청과 글자까지 같아야 한다 |
| `scope` | String | 사용자가 고른 범위. `READ` 또는 `READ_WRITE` |
| `codeChallenge` | String | PKCE `code_challenge`(S256) |
| `resource` | String | 토큰의 자원 주소 `{base}/mcp` |
| `createdAt`, `expiresAt` | String | 만든 시각과 그 5분 뒤 |
| `usedAt` | String | 토큰으로 바꾼 시각. 쓰지 않았으면 속성이 없다 |
| `grantId` | String | 이 코드로 만든 `:OAuthGrant` 의 `id`. 쓰지 않았으면 속성이 없다 |

`:OAuthGrant {id, clientId, clientName, scope, resource, accessHash, accessExpiresAt, refreshHash, refreshExpiresAt, previousRefreshHash, createdAt, lastUsedAt}`

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `id` | String | UUID. 「연결된 앱」 의 식별자이고, 이 연결로 저장한 체결과 제안의 `tokenId` 다 |
| `clientId` | String | `:OAuthClient` 의 `id` |
| `clientName` | String | 연결할 때의 클라이언트 이름. 제안의 `tokenName` 으로 쓴다 |
| `scope` | String | `READ` 또는 `READ_WRITE`. 연결하는 동안 바꾸지 않는다 |
| `resource` | String | 토큰의 자원 주소. `/mcp` 인증 때 요청의 `{base}/mcp` 와 같아야 한다 |
| `accessHash`, `accessExpiresAt` | String | 지금 접근 토큰(`fwa_`)의 SHA-256 과 끝나는 시각(발급 1시간 뒤) |
| `refreshHash`, `refreshExpiresAt` | String | 지금 갱신 토큰(`fwr_`)의 SHA-256 과 끝나는 시각(발급 30일 뒤) |
| `previousRefreshHash` | String | 바로 앞의 갱신 토큰 해시. 다시 쓰이면 도난으로 보고 연결을 끊는다. 처음 연결에는 속성이 없다 |
| `createdAt` | String | 코드를 토큰으로 바꿔 연결이 생긴 시각 |
| `lastUsedAt` | String | `/mcp` 인증이나 갱신에 마지막으로 성공한 시각. 1분 넘게 지났을 때만 고쳐 쓴다. 쓰지 않았으면 속성이 없다 |

- 원문(코드, 접근 토큰, 갱신 토큰)은 저장하지 않는다. 연동 토큰과 같이 무작위 32바이트라 SHA-256 으로 바로 찾는다.
- 시각은 서버가 기록하는 시각 형식이다. 자릿수가 고정이라 끝나는 시각은 문자열로 비교한다.
- 연결은 코드를 토큰으로 바꿀 때 생긴다. 그 트랜잭션은 주인 사용자 노드에 쓰기 잠금(`_lock`)을 건 뒤 같은 `clientId` 의 이전 연결을 지우고, 남은 연결이 20개를 넘으면 `coalesce(lastUsedAt, createdAt)` 가 가장 오래된 것부터 지운다. 같은 앱에서 다시 로그인하면 연결이 하나로 남는다.
- 코드는 바꾸는 트랜잭션에서 코드 노드에 쓰기 잠금을 건 뒤 `usedAt` 을 확인한다. 같은 코드가 동시에 와도 하나만 바뀐다. 이미 쓴 코드가 다시 오면 `grantId` 의 연결을 지운다. 「연결 허용」 이 새 코드를 만들 때 그 사용자의 끝난 코드(`expiresAt` 이 지난 것)를 지운다.
- 갱신은 연결 노드에 쓰기 잠금을 건 뒤 `refreshHash` 를 확인한다. 성공하면 접근 토큰과 갱신 토큰을 새로 쓰고 이전 갱신 해시를 `previousRefreshHash` 로 옮긴다. 같은 갱신 토큰이 동시에 두 번 오면 하나는 성공하고 다른 하나는 이전 토큰으로 읽혀 연결이 끊긴다. 갱신 토큰을 바꾸는 규칙(MCP 인증 규격)이 그렇게 정한다.
- 연결 끊기(「연결된 앱」 의 끊기, `/oauth/revoke`, 코드나 갱신 토큰의 재사용)는 `:OAuthGrant` 를 지운다(`DETACH DELETE`). 보관하지 않는다. 그 연결로 저장한 체결과 제안의 `tokenId` 는 남는다.
- 인증은 요청마다 연결과 주인을 다시 읽는다. 주인이 비활성이거나 허용 목록에서 빠졌으면(`email` 이 없으면) 접근 토큰과 갱신 토큰이 막힌다. 역할은 요청마다 읽은 지금 값이다. 다시 활성화하면 끝나지 않은 토큰이 다시 통한다.
- 클라이언트 등록은 누구나 할 수 있다. 등록하는 트랜잭션에서 `approvedAt` 이 없고 `createdAt` 이 24시간보다 오래된 `:OAuthClient` 를 지운다. 승인받은 클라이언트는 지우지 않는다.
- 세 노드와 `OWNS` 에 `archived` 를 두지 않는다. `:Knowledge` 가 아니어서 검색, 그래프, 근거 따라가기에 나오지 않는다.
- 변경 이력(ChangeEvent)에 남기지 않는다. 개인 설정이고 이력 화면은 다른 사용자에게도 보이기 때문이다.

## 체결 기록

`(:User)-[:OWNS]->(:Trade)` 가 증권사에서 확정된 체결 하나다. 주인만 읽고 지운다. 결정과 근거는 [ADR-013](adr/013-owner-trades-and-agent-proposals.md), 계약은 [API 계약](api-contract.md) 의 「내 체결」 과 「에이전트 API(`/api/v1`)」 의 「쓰기」 다.

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `id` | String | UUID |
| `ownerId` | String | 주인 `:User` 의 `id`. 같은 체결 검사의 유일 제약에 쓴다 |
| `broker` | String | 증권사. `TOSS`(토스증권), `OTHER`(그 밖) |
| `externalId` | String | 증권사의 체결이나 주문 식별자. 100자까지 |
| `side` | String | `BUY`(매수), `SELL`(매도) |
| `market` | String | 받은 시장 값을 대문자로 바꾼 것. 받는 값은 종목 찾기의 `market` 과 같다(`KR`, `US`, `KOSPI`, `KOSDAQ`, `NASDAQ`, `NYSE`, `AMEX`, `KR_ETC`, `US_ETC`, `KRX_KOSPI`, `KRX_KOSDAQ`, `OTHER`) |
| `ticker` | String | 종목 코드. 앞뒤 공백을 지우고 대문자로 바꾼다. 32자까지 |
| `name` | String | 증권사가 준 종목 이름. 100자까지. 없으면 속성이 없다 |
| `quantity` | Float | 체결 수량. 0 보다 크다. 소수 주식을 위해 소수를 받는다 |
| `price` | Float | 체결 단가. 0 이상 |
| `currency` | String | 통화. 영문 대문자 세 자리(`KRW`, `USD`) |
| `amount` | Float | 체결 금액. 0 이상. 증권사가 준 값을 그대로 둔다. 수량과 단가로 다시 계산하지 않는다 |
| `fee` | Float | 수수료와 세금. 0 이상. 없으면 속성이 없다 |
| `executedAt` | String | 체결 시각. UTC 초까지 고정 자릿수(`YYYY-MM-DDTHH:MM:SSZ`) |
| `createdAt` | String | 저장 시각. 서버가 기록하는 시각 형식이다 |
| `createdVia` | String | `AGENT`(연동 토큰이나 OAuth 연결) 또는 `WEB`. 지금은 `AGENT` 만 쓴다 |
| `tokenId` | String | 저장한 연동 토큰이나 OAuth 연결(`:OAuthGrant`)의 `id`. 그 토큰을 폐기하거나 연결을 끊어도 남는다 |

- 계좌 번호, 계좌 이름, 잔고는 저장하지 않는다. 요청에 와도 모르는 필드라 `400 VALIDATION_FAILED` 다.
- 같은 주인 안에서 `(broker, externalId)` 는 하나다. 유일 제약 `trade_owner_external_unique` 가 `(ownerId, broker, externalId)` 에 걸린다. 저장은 주인 사용자 노드에 쓰기 잠금(`_lock`)을 건 뒤 `MERGE` 한다. 같은 체결을 다시 보내거나 동시에 보내도 하나만 남고, 이미 있으면 저장된 값을 고치지 않고 돌려준다.
- 금액은 Float 로 둔다. 화면과 에이전트가 읽는 기록이고 회계 계산을 하지 않는다.
- `(:Trade)-[:OF_SECURITY]->(:Knowledge:Security)` 는 체결의 종목이다. 저장할 때 `market` 을 종목 찾기와 같은 규칙으로 워크벤치 시장 목록으로 바꾸고, 그 시장 가운데 `ticker` 가 대소문자를 무시하고 같은 보관되지 않은 Security 를 만든 순서로 하나 찾아 잇는다. 없으면 잇지 않고 저장한다. 같은 체결을 다시 보낼 때 아직 종목이 이어지지 않았으면 그때 다시 찾는다. 나중에 Security 를 만든 경우 다음 저장 요청에서 이어진다.
- `(:Trade)-[:EXECUTES {createdAt, proposalId}]->(:Knowledge:Decision)` 는 그 체결이 실행한 투자 결정이다. 제안(`LINK_TRADE_DECISION`, 또는 `CREATE_NODE` 의 `tradeIds`)을 승인할 때만 생긴다. 한 체결이 여러 결정에, 한 결정이 여러 체결에 이어질 수 있다. 같은 체결과 결정 사이에는 관계가 하나다(`MERGE`).
- 체결, `OF_SECURITY`, `EXECUTES` 에는 `id`, `revision`, `archived` 를 두지 않는다. 주변 그래프의 경로 조건(`archived = false`)에 걸려 지나가지 않고, 상세와 근거 따라가기는 양 끝을 `:Knowledge` 로 묶어 이 관계를 타지 않는다. `:Trade` 는 `:Knowledge` 가 아니어서 검색, 개념 지도 개수, 목록에 나오지 않는다.
- 변경 이력(ChangeEvent)에 남기지 않는다. 이력 화면은 다른 사용자에게도 보이기 때문이다. 이은 Security 나 Decision 의 `revision`, `updatedAt` 도 바꾸지 않는다.
- 주인이 지우면(`DELETE /api/me/trades/{id}`) 체결과 그 관계(`OWNS`, `OF_SECURITY`, `EXECUTES`)를 함께 지운다(`DETACH DELETE`). 보관은 없다. 지운 체결을 가리키는 대기 중인 제안은 승인할 때 `404 NOT_FOUND` 다.
- 이은 Security 나 Decision 을 보관해도 관계는 남는다. 화면용 응답은 그 끝을 `archived: true` 로 보이고, 에이전트 응답은 뺀다.

## 제안

`(:User)-[:OWNS]->(:Proposal)` 가 에이전트가 해석해 올린 쓰기 하나다. 사람이 승인하면 기존 서비스로 실행한다. 주인만 읽고 승인하고 거절한다. 결정과 근거는 [ADR-013](adr/013-owner-trades-and-agent-proposals.md), 계약은 [API 계약](api-contract.md) 의 「제안」 이다.

| 속성 | 타입 | 뜻 |
| --- | --- | --- |
| `id` | String | UUID |
| `ownerId` | String | 주인 `:User` 의 `id`. 토큰의 주인이다 |
| `kind` | String | `CREATE_NODE`, `CREATE_RELATIONSHIP`, `LINK_TRADE_DECISION`, `STUDY_NOTE` |
| `status` | String | `PENDING`(대기), `ACCEPTED`(승인), `REJECTED`(거절) |
| `payload` | String | 종류별 내용을 JSON 문자열로 둔다. 승인할 때 사용자가 고친 값이면 고친 값으로 바꿔 둔다. 모양은 [API 계약](api-contract.md) 의 「제안 내용」 이다 |
| `rationale` | String | 에이전트가 붙인 까닭. 2000자까지 |
| `evidence` | String | 근거 참조 `{nodeIds, tradeIds, urls}` 의 JSON 문자열 |
| `dedupeKey` | String | 에이전트가 붙인 같은 제안 검사 키. 100자까지. 없으면 속성이 없다 |
| `createdAt` | String | 올린 시각 |
| `createdVia` | String | `AGENT`. 연동 토큰이나 OAuth 연결로 올린다 |
| `tokenId`, `tokenName` | String | 올린 연동 토큰과 그때의 토큰 이름. OAuth 연결로 올렸으면 연결의 `id` 와 클라이언트 이름 |
| `decidedAt` | String | 승인하거나 거절한 시각 |
| `decisionNote` | String | 거절 이유. 1000자까지 |
| `result` | String | 승인으로 생긴 것 `{nodeIds, relationshipIds, tradeIds}` 의 JSON 문자열 |
| `lastErrorCode`, `lastErrorMessage`, `lastErrorAt` | String | 마지막 승인 실패의 오류 코드, 문장, 시각. 승인하면 지운다 |

- 같은 주인 안에서 `dedupeKey` 는 하나다(유일 제약 `proposal_owner_dedupe_unique`, `(ownerId, dedupeKey)`). 같은 키로 다시 올리면 상태와 상관없이 새로 만들지 않고 있던 제안을 돌려준다. 이때 `payload` 의 모양과 내용(온톨로지, 가리키는 노드, 내 체결)은 다시 검사하지 않는다. 항목의 칸(`kind`, `payload` 가 있는지, `rationale`, `evidence`, `dedupeKey`)만 검사한다. 키가 없는 제안은 검사하지 않는다.
- 올리기는 주인 사용자 노드에 쓰기 잠금(`_lock`)을 건 뒤 대기 수를 세고 만든다. 대기 중인 제안은 사용자마다 200개까지다. 같은 트랜잭션에서 그 사용자의 결정한 제안 가운데 `decidedAt` 이 90일보다 오래된 것을 지운다. 이번 요청이 같은 `dedupeKey` 로 돌려준 제안은 오래됐어도 지우지 않는다. 대기 중인 제안은 저절로 지우지 않는다.
- 승인과 거절은 그 제안 노드에 쓰기 잠금을 건 뒤 상태를 확인한다. 같은 제안을 두 탭에서 동시에 승인해도 한 번만 실행된다.
- 승인의 실행은 기존 서비스가 한다. 노드와 관계는 `NodeService`, `RelationshipService` 로 만들어 온톨로지 검증, 같은 종목 검사, 잠금, 변경 이력이 그대로다. 이력의 작업자는 승인한 사용자이고 메모는 「에이전트 제안을 승인했다」 다. 이해 표시는 `KnowledgeMarkService` 로 쓴다(이력 없음). 실행과 상태 변경은 한 트랜잭션이다. 실행이 실패하면 함께 롤백되고, 별도 트랜잭션으로 `lastError*` 만 쓴다. 상태는 `PENDING` 그대로다.
- 제안은 변경 이력에 남기지 않는다. 승인으로 생긴 노드와 관계의 이력만 남는다.
- 제안과 `OWNS` 에는 `archived` 를 두지 않는다. 다른 노드와 관계로 잇지 않고, 가리키는 노드와 체결은 `payload` 와 `evidence` 의 id 로만 가진다. 그래서 그래프 조회에 섞이지 않는다.

## 사용자를 지울 때

지금은 사용자를 지우는 API 가 없다. 운영자가 Neo4j 에서 사용자를 지울 때는 그 사용자가 가진 개인 기록을 함께 지운다.

```cypher
MATCH (u:User {id: $id})
OPTIONAL MATCH (u)-[:OWNS]->(x)
DETACH DELETE u, x
```

- `OWNS` 로 이어진 연동 토큰, OAuth 코드와 연결, 체결 기록, 제안이 함께 지워진다. 그 사용자만 쓰던 `:OAuthClient` 는 남는다. `DETACH DELETE` 라 이해 표시(`KNOWS`)와 체결의 `OF_SECURITY`, `EXECUTES` 도 사라진다.
- 그 사용자가 만든 지식 노드와 변경 이력은 남는다. 작업자 id 는 이름을 찾지 못해 화면에 보이지 않는다.

## 코드가 소유하는 이름

아래 이름은 서버 코드가 지식 그래프 밖의 저장에 쓴다. 온톨로지의 노드 타입이나 관계 종류로 쓸 수 없고, 쓰면 로더의 일관성 검사가 오류로 답한다(미리보기 `valid: false`, 저장 `400 ONTOLOGY_INVALID`).

- 노드 label: `Knowledge`, `User`, `IntegrationToken`, `OAuthClient`, `OAuthCode`, `OAuthGrant`, `Trade`, `Proposal`, `ChangeEvent`, `OntologyVersion`, `OntologyHead`, `SeedRun`
- 관계 종류: `OWNS`, `KNOWS`, `OF_SECURITY`, `EXECUTES`

목록은 서버 코드의 상수 한 곳(`OntologyLoader` 의 `RESERVED_NODE_TYPES`, `RESERVED_RELATIONSHIP_TYPES`)이 소유한다. 저장된 온톨로지 버전 가운데 이 이름을 쓰는 것은 없다.

## 변경 이력

`(:ChangeEvent {id, at, actorId, action, targetId, targetKind, targetType, targetLabel, revision, changes, note})`

- 노드와 관계를 바꾸는 모든 API 는 같은 트랜잭션에서 ChangeEvent 를 하나 만든다. 데이터 변경과 이력 중 하나만 남는 일이 없다.
- `changes` 는 `{속성: {before, after}}` 를 JSON 문자열로 저장한다. Neo4j 속성이 중첩 객체를 받지 않기 때문이다.
- ChangeEvent 는 대상과 관계로 잇지 않고 `targetId` 로만 가리킨다. 그래프 조회 결과에 이력이 섞이지 않는다.
- 이력을 지우거나 고치는 API 는 없다. 복원도 새 ChangeEvent 를 만든다.
- 서버가 스스로 남긴 이력의 `actorId` 는 `system` 이다. 첫 관리자 생성, 예전 값 정리, 초기 데이터 적용이 여기 해당한다. 화면은 「시스템」 으로 보인다.

## 제약 조건과 인덱스

API 가 시작할 때, 웹 서버가 요청을 받기 전에 `IF NOT EXISTS` 로 만든다. 여러 번 돌아도 결과가 같다. 실패하면 API 가 시작하지 않는다.

| 이름 | 정의 | 용도 |
| --- | --- | --- |
| `knowledge_id_unique` | `(:Knowledge).id` 유일 | 외부 ID |
| `user_id_unique` | `(:User).id` 유일 | 사용자 ID |
| `user_email_unique` | `(:User).email` 유일 | 허용 목록 |
| `user_google_sub_unique` | `(:User).googleSub` 유일 | 같은 Google 계정이 두 사용자에 묶이지 않게 한다 |
| `security_listing_unique` | `(:Security).(market, ticker)` 유일 | 같은 시장의 같은 종목 코드 중복 방지 |
| `change_event_id_unique` | `(:ChangeEvent).id` 유일 | 이력 ID |
| `change_event_target` | `(:ChangeEvent).targetId` 인덱스 | 대상별 이력 조회 |
| `change_event_at` | `(:ChangeEvent).at` 인덱스 | 최근 이력 조회 |
| `ontology_version_unique` | `(:OntologyVersion).version` 유일 | 온톨로지 버전 번호 |
| `ontology_head_key_unique` | `(:OntologyHead).key` 유일 | 온톨로지 저장 잠금 노드가 하나만 생기게 한다 |
| `integration_token_id_unique` | `(:IntegrationToken).id` 유일 | 연동 토큰 ID |
| `integration_token_hash_unique` | `(:IntegrationToken).hash` 유일 | 인증할 때 해시로 토큰을 바로 찾는다 |
| `oauth_client_id_unique` | `(:OAuthClient).id` 유일 | OAuth `client_id` |
| `oauth_code_hash_unique` | `(:OAuthCode).hash` 유일 | 토큰 요청에서 코드를 해시로 찾는다 |
| `oauth_grant_id_unique` | `(:OAuthGrant).id` 유일 | 연결 ID |
| `oauth_grant_access_hash_unique` | `(:OAuthGrant).accessHash` 유일 | `/mcp` 인증에서 접근 토큰을 해시로 찾는다 |
| `oauth_grant_refresh_hash_unique` | `(:OAuthGrant).refreshHash` 유일 | 갱신 요청에서 갱신 토큰을 해시로 찾는다 |
| `oauth_grant_previous_refresh` | `(:OAuthGrant).previousRefreshHash` 인덱스 | 이전 갱신 토큰의 재사용을 찾는다 |
| `trade_id_unique` | `(:Trade).id` 유일 | 체결 ID |
| `trade_owner_external_unique` | `(:Trade).(ownerId, broker, externalId)` 유일 | 같은 주인의 같은 체결을 하나로 둔다 |
| `trade_owner_executed` | `(:Trade).(ownerId, executedAt)` 인덱스 | 내 체결을 최근 것부터 읽는다 |
| `proposal_id_unique` | `(:Proposal).id` 유일 | 제안 ID |
| `proposal_owner_dedupe_unique` | `(:Proposal).(ownerId, dedupeKey)` 유일 | 같은 키의 제안을 하나로 둔다. 키가 없는 제안에는 걸리지 않는다 |
| `proposal_owner_status` | `(:Proposal).(ownerId, status)` 인덱스 | 내 대기 제안 수와 목록 |
| `seed_run_key_unique` | `(:SeedRun).key` 유일 | 초기 데이터 파일을 한 번만 적용한다. `:SeedRun` 은 `:Knowledge` 가 아니라 검색과 그래프에 나오지 않는다 |
| `knowledge_search_text` | `(:Knowledge).searchText` TEXT 인덱스 | 검색어 `CONTAINS`. 첫 버전의 RANGE 인덱스가 있으면 시작할 때 지우고 TEXT 로 다시 만든다 |
| `rel_<타입>_id` | 관계 타입마다 `()-[r:<타입>]-()` 의 `r.id` 인덱스 | 관계 보관, 복원, 조회. 타입은 온톨로지의 관계와 Claim 관계 전부다 |

`security_listing_unique` 는 보관된 Security 에도 걸린다. 보관한 종목을 다시 쓰려면 새로 만들지 않고 복원한다.

## 보관과 삭제

지식 데이터를 지우는 API 는 없다. 보관은 `archived = true` 로 표시만 한다. 개인 기록 가운데 체결 기록만 주인이 지운다(「체결 기록」).

- 보관된 노드와 관계는 기본 검색, 주변 그래프, 검토 대기 목록에서 빠진다.
- 노드를 보관해도 붙은 관계와 Claim 은 바뀌지 않는다. 복원하면 그대로 다시 보인다.
- 다만 Claim 의 마지막 활성 근거 Document 는 보관할 수 없다. 활성 근거가 없는 Claim 은 복원하거나 `REVIEWED` 로 검토할 수 없다.
  잠금 순서는 Document 다음 Claim 이다. Document 를 보관할 때는 그 Document 를 잠근 뒤 연결된 Claim 을 보관 여부와 상관없이 ID 순서로 잠그고,
  잠금 뒤의 값으로 판정한다. Claim 을 복원하거나 `REVIEWED` 로 검토할 때는 근거 Document 를 ID 순서로 먼저 잠근 뒤 Claim 을 잠근다.
  그래서 「Claim 복원」 과 「그 Claim 의 마지막 근거 보관」 이 동시에 와도 한쪽이 다른 쪽을 기다리고, 하나만 성공한다.
- 보관된 노드는 수정할 수 없다(`409 ARCHIVED`). 복원한 뒤 수정한다.

## 동시 수정 처리

수정, 검토, 보관, 복원은 한 트랜잭션에서 아래 순서로 처리한다.

1. `MATCH (n:Knowledge {id: $id}) SET n._lock = true` 로 대상에 쓰기 잠금을 건다.
2. 잠금을 쥔 상태에서 현재 `revision`, `archived` 와 속성을 읽는다.
3. `expectedRevision` 과 다르면 예외를 던진다. 트랜잭션이 롤백되어 `_lock` 표시도 남지 않는다.
4. 같으면 속성을 바꾸고 `revision` 을 올리고 `_lock` 을 지운 뒤 ChangeEvent 를 만든다.

조건 검사와 갱신을 한 Cypher 의 `WHERE` 로만 처리하면, 두 트랜잭션이 같은 값을 읽고 잠금 대기 뒤 차례로 덮어쓸 수 있다.
잠금을 먼저 쥐면 두 번째 트랜잭션은 첫 번째가 커밋한 뒤의 revision 을 읽고 409 를 받는다.

여러 노드를 잠그는 쓰기(관계 생성, Claim 생성, 사용자 강등)는 ID 순서로 잠가 교착을 줄인다.
그래도 교착이 감지되거나 잠금 대기(5초)를 넘으면 `409 TRANSIENT_CONFLICT` 로 다시 시도하게 한다.
바뀐 값이 없는 수정은 잠금만 풀고 revision 과 이력을 그대로 둔다.
