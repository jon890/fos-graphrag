# 데이터 스키마

## 온톨로지와 지식 데이터

온톨로지는 타입, 속성, 관계의 정의다. Neo4j 의 `:OntologyVersion` 에 버전으로 쌓이고, API 는 최신 버전으로 검증한다(「온톨로지 버전」, [ADR-008](adr/008-ontology-versions-in-db.md)). 저장소의 `ontology/financial-ontology.yaml` 은 첫 버전과 서버 코드가 소유하는 부분의 원본이다.
지식 데이터는 그 정의를 따르는 개별 기업, 종목, 인물, 개념, 주장이다. Neo4j 에 있다.

API 는 저장된 최신 버전으로 모든 쓰기를 검증한다. 저장하면 다음 요청부터 새 버전으로 검증한다.
Neo4j 는 온톨로지 규칙을 집행하지 않는다. 아래 제약 조건은 유일성과 조회 속도만 맡는다.

온톨로지를 바꾸는 절차는 이렇다.

1. ADMIN 이 온톨로지 탭의 폼 편집기나 YAML 편집기로 고친다(「온톨로지 편집」, [흐름](flow.md)).
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
- `createPicker` 는 저장소 YAML 의 모든 일반 관계에 있다. 관계의 끝이 나중에 만드는 노드가 되게 방향을 정했다. 예를 들어 병목 폼에는 「이 병목을 만든 변화」 와 「병목이 있는 산업」, 결정 폼에는 「결정한 종목」 과 「결정에 쓴 밸류에이션」 칸이 생긴다. 목록은 「관계」 절의 표가 소유한다.
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
| `SUBJECT` | Claim | predicate 의 `subjectTypes` | Claim API |
| `OBJECT` | Claim | predicate 의 `objectTypes` | Claim API |
| `SUPPORTED_BY` | Claim | Document | Claim API |

산업 분류처럼 다른 편집자가 근거를 확인해야 하는 주장은 선 하나로 저장하지 않는다.
Claim 노드 하나와 `SUBJECT`, `OBJECT`, `SUPPORTED_BY` 관계로 저장한다. 주장마다 근거와 검토 상태가 붙는다.
주장 종류는 `BELONGS_TO_SECTOR`(기업이나 종목이 산업에 속한다), `ADVOCATES`, `CRITICIZES` 셋이다. 기업 사이의 관계(공급, 경쟁, 노출)는 담지 않는다([ADR-009](adr/009-investment-logic-chain.md)).
거장의 생각도 같은 방식이다. 「버핏 → 안전마진 강조한다」 처럼 인물(주체)과 개념(대상)을 잇는 Claim(`ADVOCATES`, `CRITICIZES`)을 만들고, 짧은 인용은 `evidenceText`, 출처인 책이나 서한은 근거 문서다. 저작과 저자는 `AUTHORED` 로 잇는다. `RELATED_TO` 는 개념 사이의 식별 관계라 근거가 필요 없다.

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
- 이 노드도 다른 노드처럼 로그인한 모든 사용자가 본다. 개인 기록의 열람 제한은 아직 없다.

### 초기 데이터

`ontology/seeds/*.yaml` 은 처음 넣을 노드와 관계다. API 는 시작할 때, 예전 값 정리 다음에 아직 적용하지 않은 파일을 적용한다.

- 파일마다 `key` 가 있고, 적용하면 `(:SeedRun {key, appliedAt})` 를 남긴다. 같은 `key` 는 다시 적용하지 않는다. 그래서 초기 데이터로 만든 노드를 사람이 보관하거나 이름을 바꿔도 되살아나지 않는다.
- 노드는 `NodeService` 와 같은 검증과 이력으로 만든다. 작업자는 `system` 이다. 같은 타입에 같은 이름(앞뒤 공백과 대소문자를 무시하고 비교)의 보관되지 않은 노드가 이미 있으면 만들지 않고 그 노드를 쓴다.
- 관계는 파일 안의 `ref` 로 끝을 찾는다. 끝을 찾지 못하거나 같은 타입, 같은 끝의 보관되지 않은 관계가 이미 있으면 만들지 않고 넘어간다. 그래서 새 파일이 앞 파일의 노드와 관계를 다시 적어도 된다.
- 파일을 읽지 못하면(문법 오류, 알 수 없는 키) 그 파일만 건너뛰고 파일 이름으로 `warn` 로그를 남긴다. 같은 `key` 가 여러 파일에 있으면 파일 이름 순서로 처음 것만 적용하고 나머지는 `warn` 로그로 남긴다.
- 한 파일은 트랜잭션 하나로 적용한다. 실패하면 그 파일 전체가 롤백되고 `SeedRun` 도 남지 않아 다음 시작 때 다시 시도한다. 실패해도 API 는 시작한다. 초기 데이터는 없어도 쓸 수 있기 때문이다.
- 끄려면 `workbench.seeds.enabled=false` 다. 기본은 켜짐이다.
- 지금 파일은 `investment-logic-2026-10` 하나다. 친구가 Obsidian 에 정리한 투자 기록에서 옮긴 투자 온톨로지 항목이다. 메모리(HBM, 범용 DRAM), 데이터센터 전력과 에너지 저장, 칩 사이 광 연결의 변화와 병목, 그 산업과 기업과 종목, 공개 근거 자료, FLNC 의 밸류에이션 둘과 시나리오, 세 종목(SK하이닉스, FLNC, POET)의 결정 넷을 담는다. 원문과 대조하지 못한 값은 노드의 `description` 이나 `reason` 에 「원문 대조 대기」 라고 적었다. 친구의 실제 매매 날짜와 밸류에이션이 들어 있고 이 저장소는 공개다(사용자 결정 2026-10-24).
- 시드는 주장(Claim)을 만들지 못한다. 기업이나 종목의 산업 소속 주장은 사람이 근거를 붙여 만든다.

## 사용자

`(:User {id, email, displayName, role, enabled, googleSub, revision, createdAt, createdBy, updatedAt, updatedBy, lastLoginAt, guideDoneAt})`

- `email` 은 소문자로 저장한다. 허용 목록의 키다.
- 사용자 강등이나 비활성화는 대상과 활성 ADMIN 을 ID 순서로 한 번에 잠근 뒤 마지막 관리자인지 판정한다.
- `googleSub` 은 첫 Google 로그인 때 묶는다. 그 뒤에는 이 값으로 사용자를 찾는다. 응답에는 담지 않는다.
- `role` 은 `VIEWER`, `EDITOR`, `ADMIN` 가운데 하나다.
- 비밀번호는 저장하지 않는다. 로그인은 Google OpenID Connect 로만 한다.
- 개인 계좌 키, 잔고, 주문 내역은 이 모델에 넣지 않는다.
- `:User` 는 `:Knowledge` label 이 없어 검색과 그래프에 나오지 않는다.
- `guideDoneAt` 은 첫 접속 가이드를 끝내거나 건너뛴 시각이다. 없으면 로그인할 때 가이드가 열린다([흐름](flow.md) 의 「첫 접속 가이드」). 화면 상태라 `revision`, `updatedAt`, `updatedBy` 를 바꾸지 않고 ChangeEvent 도 남기지 않는다. 한 번 쓰면 지우지 않는다.
- 사용자 관리 변경도 ChangeEvent(`targetKind = USER`)로 남는다. 첫 관리자를 만든 이벤트의 actor 는 `system` 이다.

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
| `seed_run_key_unique` | `(:SeedRun).key` 유일 | 초기 데이터 파일을 한 번만 적용한다. `:SeedRun` 은 `:Knowledge` 가 아니라 검색과 그래프에 나오지 않는다 |
| `knowledge_search_text` | `(:Knowledge).searchText` TEXT 인덱스 | 검색어 `CONTAINS`. 첫 버전의 RANGE 인덱스가 있으면 시작할 때 지우고 TEXT 로 다시 만든다 |
| `rel_<타입>_id` | 관계 타입마다 `()-[r:<타입>]-()` 의 `r.id` 인덱스 | 관계 보관, 복원, 조회. 타입은 온톨로지의 관계와 Claim 관계 전부다 |

`security_listing_unique` 는 보관된 Security 에도 걸린다. 보관한 종목을 다시 쓰려면 새로 만들지 않고 복원한다.

## 보관과 삭제

데이터를 지우는 API 는 없다. 보관은 `archived = true` 로 표시만 한다.

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
