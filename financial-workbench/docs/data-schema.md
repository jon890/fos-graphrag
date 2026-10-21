# 데이터 스키마

## 온톨로지와 지식 데이터

온톨로지는 타입, 속성, 관계의 정의다. `ontology/financial-ontology.yaml` 에 있고 Git 으로 관리한다.
지식 데이터는 그 정의를 따르는 개별 기업, 종목, 주장이다. Neo4j 에 있다.

API 는 시작할 때 온톨로지 파일을 읽고, 모든 쓰기를 그 정의로 검증한다.
Neo4j 는 온톨로지 규칙을 집행하지 않는다. 아래 제약 조건은 유일성과 조회 속도만 맡는다.

온톨로지 파일을 바꾸는 절차는 이렇다.

1. YAML 을 고치고 `schemaVersion` 을 올린다.
2. 기존 데이터가 새 정의를 어기는지 확인한다. 서버와 편집 폼은 바뀐 칸만 검사하므로, 새 정의를 어기는 값이 남아도 다른 칸은 고칠 수 있다. 어긴 칸을 고칠 때는 새 정의에 맞는 값을 넣어야 한다. 문자열 칸을 enum 으로 바꾸거나 enum 값을 뺄 때는 예전 표기를 `valueAliases` 에 적는다. API 가 시작할 때 고친다(「예전 값 정리」).
3. API 를 다시 빌드한다. 파일은 빌드할 때 jar 안에 복사된다.

웹에서 타입과 관계 정의를 바꾸는 기능은 아직 없다.

### 표시 이름

화면에 보이는 이름은 코드가 아니라 같은 YAML 이 소유한다. 타입, 속성, enum 값, 관계, predicate 가 늘어도 YAML 만 고치면 화면이 따라간다.
저장되는 값(`KRX_KOSPI`, `SUPPLIES_TO`, `DRAFT` 등)과 키는 표시 이름과 상관없이 그대로다.

| 위치 | 키 | 뜻 |
| --- | --- | --- |
| `nodeTypes.<타입>`, `nodeTypes.<타입>.properties.<속성>`, `relationshipTypes.<관계>`, `claimRelationships.<관계>`, `claimPredicates.<predicate>` | `label` | 화면에 보일 이름. 없으면 화면이 키를 그대로 보인다 |
| enum 속성 | `valueLabels` | 선택지 표시 이름. 키는 `values` 안에 있어야 한다 |
| `reviewStatuses.<상태>`, `changeActions.<작업>` | `label`, `description` | Claim 검토 상태와 변경 이력 작업의 표시 이름. 키는 서버가 정한 값이다 |
| `changeFields.<키>` | `label` | 변경 이력의 `changes` 에 나오는 키 가운데 온톨로지 속성이 아닌 것(`subjectId`, `objectId`, `documentIds`, `fromId`, `toId`, `reviewStatus`, `archived`, `email`, `displayName`, `role`, `enabled`)의 표시 이름. 속성인 키는 그 속성의 `label` 을 쓴다 |
| 속성 | `description` | 입력칸 바로 아래에 보이는 도움말. 개발 용어 없이 쓴다 |
| `claimPredicates.<predicate>` | `sentence` | 주장 만들기 폼의 문장 틀. `{subject}` 와 `{object}` 자리에 고르기 칸이 들어간다. 조사는 `이(가)`, `은(는)`, `을(를)`, `와(과)` 로 적으면 화면이 고른 이름의 끝소리에 맞춰 하나로 바꾼다. 없으면 「{subject} {object} 관계 이름」 순서로 보인다 |

- Claim 의 `predicate` 선택지 이름은 `claimPredicates.<predicate>.label` 에서 온다. 로더가 응답의 `valueLabels` 에 채워 주므로 따로 적지 않는다.
- 로더는 알 수 없는 키가 있으면 시작을 멈춘다. YAML 흐름 표기(`{ ... }`) 안에서 쉼표나 콜론이 든 문장을 따옴표로 감싸지 않으면 뒷부분이 값 없는 키가 되기 때문이다.
- `OntologyLabelsTest` 가 모든 타입, 속성, enum 값, 관계, predicate, 검토 상태, 변경 작업, 변경 이력 항목(`changeFields`)에 표시 이름이 있는지, 모든 predicate 에 `sentence` 가 있고 `{subject}` 와 `{object}` 를 한 번씩 담는지 확인한다.

### 만들기 폼과 구분 정보

같은 YAML 이 만들기 폼과 목록에 보일 정보도 정한다.

| 위치 | 키 | 뜻 |
| --- | --- | --- |
| `nodeTypes.<타입>` | `hintProperties` | 이름 옆에 함께 보일 속성 목록. 검색 결과, 고르기 후보, 같은 이름 경고에서 같은 이름의 항목을 구분하게 한다. 화면은 이 속성들의 표시 값과 만든 날을 ` · ` 로 잇는다. 없으면 만든 날만 보인다 |
| `relationshipTypes.<관계>` | `createPicker.label`, `createPicker.description` | 끝(`to`) 타입을 만드는 폼에 시작(`from`) 노드를 고르는 칸을 더한다. 고르지 않아도 만들 수 있다. 고르면 노드를 만든 뒤 이 관계를 이어서 만든다 |

- `hintProperties` 는 그 타입의 속성이어야 한다. 로더가 시작할 때 확인한다.
- 지금 `createPicker` 가 있는 관계는 `ISSUES` 하나다. 종목 만들기 폼에 「발행 기업」 칸이 생긴다.

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
| `searchText` | String | `label` 과 `ticker` 를 소문자로 이은 값. 검색용 |

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
| Claim | `predicate`, `description`, `evidenceText`, `authoringMethod` | `validFrom`, `validTo`, `extractionConfidence` |

Company 의 `country` 와 Security 의 `currency` 는 목록에서 고른다(enum). 선택지는 온톨로지 파일이 정한다. 국가는 「기타」 를 두고, 통화는 두지 않는다.
Claim 의 `validFrom`, `validTo` 가 비어 있으면 관계의 유효 기간을 모른다는 뜻이다. 미상을 특정 날짜로 바꾸지 않는다.
`extractionConfidence` 는 AI 추출의 확신도다. 투자 성공 확률과 다르고 첫 버전에서는 AI 추출을 하지 않아 비어 있다.
자료 공개 시점은 Document 의 `publishedAt`, 수집 시점은 `collectedAt` 이다.

## 관계

모든 관계는 `id`, `revision`, `archived`, `createdAt`, `createdBy` 를 가진다.
보관과 복원을 하는 관계는 `archivedAt`, `updatedAt`, `updatedBy` 도 가진다.

| 관계 | 시작 | 끝 | 만드는 곳 |
| --- | --- | --- | --- |
| `ISSUES` | Company | Security | 관계 API |
| `SUBJECT` | Claim | predicate 의 `subjectTypes` | Claim API |
| `OBJECT` | Claim | predicate 의 `objectTypes` | Claim API |
| `SUPPORTED_BY` | Claim | Document | Claim API |

공급 관계나 산업 분류처럼 근거가 필요한 금융 주장은 기업 사이의 선 하나로 저장하지 않는다.
Claim 노드 하나와 `SUBJECT`, `OBJECT`, `SUPPORTED_BY` 관계로 저장한다. 주장마다 근거와 검토 상태가 붙는다.

## 사용자

`(:User {id, email, displayName, role, enabled, googleSub, revision, createdAt, createdBy, updatedAt, updatedBy, lastLoginAt})`

- `email` 은 소문자로 저장한다. 허용 목록의 키다.
- 사용자 강등이나 비활성화는 대상과 활성 ADMIN 을 ID 순서로 한 번에 잠근 뒤 마지막 관리자인지 판정한다.
- `googleSub` 은 첫 Google 로그인 때 묶는다. 그 뒤에는 이 값으로 사용자를 찾는다. 응답에는 담지 않는다.
- `role` 은 `VIEWER`, `EDITOR`, `ADMIN` 가운데 하나다.
- 비밀번호는 저장하지 않는다. 로그인은 Google OpenID Connect 로만 한다.
- 개인 계좌 키, 잔고, 주문 내역은 이 모델에 넣지 않는다.
- `:User` 는 `:Knowledge` label 이 없어 검색과 그래프에 나오지 않는다.
- 사용자 관리 변경도 ChangeEvent(`targetKind = USER`)로 남는다. 첫 관리자를 만든 이벤트의 actor 는 `system` 이다.

## 변경 이력

`(:ChangeEvent {id, at, actorId, action, targetId, targetKind, targetType, targetLabel, revision, changes, note})`

- 노드와 관계를 바꾸는 모든 API 는 같은 트랜잭션에서 ChangeEvent 를 하나 만든다. 데이터 변경과 이력 중 하나만 남는 일이 없다.
- `changes` 는 `{속성: {before, after}}` 를 JSON 문자열로 저장한다. Neo4j 속성이 중첩 객체를 받지 않기 때문이다.
- ChangeEvent 는 대상과 관계로 잇지 않고 `targetId` 로만 가리킨다. 그래프 조회 결과에 이력이 섞이지 않는다.
- 이력을 지우거나 고치는 API 는 없다. 복원도 새 ChangeEvent 를 만든다.
- 서버가 스스로 남긴 이력의 `actorId` 는 `system` 이다. 첫 관리자 생성과 예전 값 정리가 여기 해당한다. 화면은 「시스템」 으로 보인다.

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
