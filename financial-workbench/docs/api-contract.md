# API 계약

모든 경로는 `/api` 아래에 있다. 요청과 응답 본문은 `application/json` 이고 문자 집합은 UTF-8 이다.
식별자는 서버가 만든 UUID 문자열이다. Neo4j 내부 ID 는 응답에 나오지 않는다.
시각은 자릿수가 고정된 UTC ISO-8601 문자열이다. 날짜는 `YYYY-MM-DD` 다.

| 시각 | 형식 | 예 |
| --- | --- | --- |
| 서버가 기록하는 시각(`createdAt`, `updatedAt`, `archivedAt`, `reviewedAt`, ChangeEvent `at`) | 마이크로초 6자리 | `2026-10-20T03:15:00.123456Z` |
| 사용자가 넣는 `datetime` 속성(`collectedAt`) | 초까지 | `2026-10-20T03:15:00Z` |

자릿수를 고정해 문자열 정렬이 시간 순서와 같다. 입력은 오프셋이 붙은 ISO 시각도 받고 UTC 로 바꿔 저장한다.

## 인증과 CSRF

로그인은 Google OpenID Connect 하나다. 비밀번호 로그인과 공개 가입은 없다.
브라우저가 `/oauth2/authorization/google` 로 이동하면 Google 동의 화면을 거쳐 `/login/oauth2/code/google` 로 돌아온다.
서버는 아래 셋을 모두 만족할 때만 세션을 만든다.

1. Google 이 준 `email_verified` 가 `true` 다.
2. 그 이메일이 허용 사용자 목록에 있다. 대소문자는 구분하지 않는다.
3. 그 사용자가 활성 상태다.

| 결과 | 이동 |
| --- | --- |
| 성공 | `/` |
| 허용되지 않음(위 셋 가운데 하나라도 어김) | `/?login=denied`. 이메일이 목록에 있는지는 드러내지 않는다 |

첫 로그인 때 Google `sub` 을 사용자에 묶는다. 그 뒤에는 `sub` 으로 찾으므로 Google 계정의 이메일이 바뀌어도 같은 사람이다.
다른 `sub` 이 같은 이메일로 오면 거절한다. 로그인에 성공하면 세션 ID 를 새로 발급한다.

세션 쿠키는 `WORKBENCH_SESSION`(HttpOnly, SameSite=Lax, 운영에서 Secure)이다.
아래 표의 공개 경로와 정적 파일, OAuth 경로를 뺀 모든 `/api` 경로는 로그인이 필요하다. 조회도 같다.
서버는 요청마다 사용자 상태와 역할을 다시 읽는다. 비활성화된 사용자의 세션은 다음 요청에서 끊기고 `401 UNAUTHENTICATED` 를 받는다.

상태를 바꾸는 요청(`POST`, `PATCH`, `PUT`, `DELETE`)은 CSRF 토큰이 필요하다.
서버는 `XSRF-TOKEN` 쿠키(HttpOnly 아님)를 내려 주고, 클라이언트는 그 값을 `X-XSRF-TOKEN` 헤더에 담는다.
쿠키가 없으면 먼저 `GET /api/auth/csrf` 를 부른다. 토큰 값은 응답 본문이 아니라 쿠키에서 읽는다.

| 메서드 | 경로 | 인증 | 성공 응답 | 실패 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 불필요 | `200 {"status":"UP"}` | `503 {"status":"DOWN"}` |
| GET | `/api/auth/csrf` | 불필요 | `200 {"headerName":"X-XSRF-TOKEN","cookieName":"XSRF-TOKEN"}` 와 쿠키 | 없음 |
| GET | `/api/auth/me` | 필요 | `200 CurrentUser` | `401 UNAUTHENTICATED` |
| POST | `/api/auth/logout` | 필요 | `204` | `403 CSRF_REJECTED` |

`CurrentUser`

```json
{ "id": "uuid", "email": "alice@example.com", "displayName": "Alice", "role": "EDITOR" }
```

## 역할

역할은 사용자마다 하나다. 권한은 서버가 집행하고, 화면에서 버튼을 숨기는 것은 보조다.

| 역할 | 할 수 있는 일 |
| --- | --- |
| `VIEWER` | 모든 `GET` 조회(검색, 상세, 주변 그래프, 목록, 변경 이력, 온톨로지) |
| `EDITOR` | VIEWER 권한과 노드, 관계, Claim 의 생성, 수정, 검토, 보관, 복원 |
| `ADMIN` | EDITOR 권한과 `/api/users` 의 사용자 관리 |

역할이 모자라면 `403 FORBIDDEN` 이다.
온톨로지 정의(타입, 관계, 속성)는 Git 의 YAML 로 관리하고 웹에서 바꾸지 않는다. 나중에 웹 편집을 더하면 `ADMIN` 만 하게 한다.

## 오류 형식

모든 오류는 같은 모양이다.

```json
{
  "code": "REVISION_CONFLICT",
  "message": "다른 사용자가 먼저 수정했습니다.",
  "details": { "expectedRevision": 3, "currentRevision": 4 }
}
```

| HTTP | code | 언제 |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | 본문 형식, 필수 값, 길이, 날짜 형식이 틀렸다. `details.fieldErrors` 에 `{필드: 사유}` 가 있다 |
| 400 | `ONTOLOGY_VIOLATION` | 온톨로지에 없는 타입, 속성, 관계, predicate 이거나 시작·끝 노드 타입이 맞지 않는다. `details.rule` 에 위반한 규칙 이름이 있다 |
| 401 | `UNAUTHENTICATED` | 세션이 없다 |
| 403 | `CSRF_REJECTED` | CSRF 토큰이 없거나 틀렸다 |
| 403 | `FORBIDDEN` | 역할이 모자라다 |
| 411 | `LENGTH_REQUIRED` | 본문이 있는 `/api` 요청에 Content-Length 가 없다(chunked 전송) |
| 413 | `PAYLOAD_TOO_LARGE` | 요청 본문이 64KiB 를 넘는다 |
| 403 | `SELF_REVIEW_FORBIDDEN` | 자기가 작성한 Claim 을 검토하려 했다 |
| 404 | `NOT_FOUND` | 그 ID 의 노드나 관계가 없다 |
| 409 | `REVISION_CONFLICT` | `expectedRevision` 이 현재 revision 과 다르다. `details` 에 두 값이 있다 |
| 409 | `ARCHIVED` | 보관된 대상을 수정하려 했다. 먼저 복원한다 |
| 409 | `NOT_ARCHIVED` | 보관되지 않은 대상을 복원하려 했다 |
| 409 | `DUPLICATE` | 같은 시장과 종목 코드의 Security, 같은 이메일의 사용자처럼 유일해야 하는 값이 이미 있다 |
| 409 | `LAST_ADMIN` | 마지막 활성 ADMIN 을 강등하거나 비활성화하려 했다 |
| 409 | `LAST_EVIDENCE` | 어떤 활성 Claim 의 유일한 활성 근거 Document 를 보관하려 했다. `details.claimIds` 에 그 Claim 이 있다 |
| 409 | `NO_ACTIVE_EVIDENCE` | 활성 근거 문서가 없는 Claim 을 복원하거나 `REVIEWED` 로 검토하려 했다 |
| 409 | `TRANSIENT_CONFLICT` | 동시에 처리 중인 다른 요청과 잠금이 겹쳤다. Neo4j 오류 코드가 `DeadlockDetected`, `LockAcquisitionTimeout` 일 때만이다. 최신 내용을 다시 읽고 다시 시도한다 |
| 500 | `INTERNAL_ERROR` | 그 밖의 서버 오류. 내부 메시지는 응답에 담지 않는다 |
| 503 | `QUERY_TIMEOUT` | 트랜잭션이 시간 제한을 넘었다. 그래프 조회는 5초, 쓰기는 8초다 |
| 503 | `DATABASE_UNAVAILABLE` | Neo4j 에 연결할 수 없다. 백업 중이거나 재시작 중이다. 연결 끊김은 Spring 이 일시 예외로 감싸도 이 코드다 |

Neo4j 예외는 시간 초과(`QUERY_TIMEOUT`), 연결 불가(`DATABASE_UNAVAILABLE`), 잠금 충돌(`TRANSIENT_CONFLICT`) 순서로 판정한다. 앞에서 맞으면 뒤는 보지 않는다.

## 공통 표현

`UserRef`

```json
{ "id": "uuid", "email": "alice@example.com", "displayName": "Alice" }
```

`NodeRef`: 다른 노드를 가리킬 때 쓴다.

```json
{ "id": "uuid", "type": "Company", "label": "가상전자", "archived": false }
```

`NodeView`: 노드 하나의 전체 속성이다.

```json
{
  "id": "uuid",
  "type": "Company",
  "label": "가상전자",
  "properties": { "name": "가상전자", "country": "KR" },
  "revision": 1,
  "archived": false,
  "archivedAt": null,
  "createdAt": "2026-10-20T03:15:00Z",
  "createdBy": { "id": "uuid", "email": "alice@example.com", "displayName": "Alice" },
  "updatedAt": "2026-10-20T03:15:00Z",
  "updatedBy": { "id": "uuid", "email": "alice@example.com", "displayName": "Alice" },
  "reviewStatus": null
}
```

`label` 은 온톨로지의 `labelProperty` 값이다. 단 Claim 의 `label` 은 읽을 때 만든 「주체 이름 → 대상 이름 관계 표시 이름」(예: `다라부품 → 가나전자 공급한다`)이다. 주체나 대상을 찾지 못하면 그 자리를 `?` 로 둔다. `reviewStatus` 는 Claim 일 때만 값이 있다.

`ClaimView`: `NodeView` 의 모든 필드에 아래를 더한다.

```json
{
  "reviewStatus": "REVIEWED",
  "reviewedBy": { "id": "uuid", "email": "bob@example.com", "displayName": "Bob" },
  "reviewedAt": "2026-10-20T04:00:00Z",
  "reviewNote": "공시 원문과 대조함",
  "subject": { "id": "uuid", "type": "Company", "label": "가상부품", "archived": false },
  "object": { "id": "uuid", "type": "Company", "label": "가상전자", "archived": false },
  "documents": [
    {
      "id": "uuid", "title": "2026 사업보고서", "url": "https://example.com/report",
      "publisher": "가상부품", "documentType": "FILING",
      "publishedAt": "2026-03-15", "collectedAt": "2026-10-20T03:10:00Z", "archived": false
    }
  ]
}
```

`validFrom`, `validTo` 는 `properties` 안에 있다. 값이 없으면 키가 빠지고 화면은 「미상」 으로 표시한다.

`RelationshipView`

```json
{
  "id": "uuid", "type": "ISSUES",
  "from": { "id": "uuid", "type": "Company", "label": "가상전자", "archived": false },
  "to": { "id": "uuid", "type": "Security", "label": "가상전자 보통주", "archived": false },
  "revision": 1, "archived": false,
  "createdAt": "...", "createdBy": { "id": "uuid", "email": "alice@example.com", "displayName": "Alice" }
}
```

## 상한

| 항목 | 상한 | 넘으면 |
| --- | --- | --- |
| 요청 본문 | 64KiB, Content-Length 필수 | `413 PAYLOAD_TOO_LARGE`, `411 LENGTH_REQUIRED` |
| 검색어 `q` | 100자 | `400 VALIDATION_FAILED` |
| Claim 의 `documentIds` | 20개 | `400 VALIDATION_FAILED` |
| 페이지 크기 `size` | 100 | `400 VALIDATION_FAILED` |
| 노드 상세의 `relationships`, `claims` | 100개, 50개 | 잘라 내고 `relationshipsTruncated`, `claimsTruncated` 를 `true` 로 둔다 |
| 쓰기 트랜잭션 | 8초 | `503 QUERY_TIMEOUT` |
| 잠금 대기(Neo4j `db.lock.acquisition.timeout`) | 5초 | `409 TRANSIENT_CONFLICT` |
| Neo4j 서버 트랜잭션(`db.transaction.timeout`) | 10초 | `503 QUERY_TIMEOUT` |

## 페이지네이션

목록 응답은 offset 방식이다. `page` 는 0 부터 세고, `size` 기본값은 20, 최댓값은 100 이다.
100 을 넘기면 `400 VALIDATION_FAILED` 다.

```json
{ "items": [], "page": 0, "size": 20, "totalItems": 0, "totalPages": 0 }
```

## revision 과 동시 수정

노드와 관계는 모두 `revision` 정수를 가진다. 생성하면 1 이고 변경할 때마다 1 씩 오른다.
수정, 검토, 보관, 복원 요청은 본문에 `expectedRevision` 을 담는다.
서버는 대상에 쓰기 잠금을 먼저 걸고 revision 을 비교한 뒤 같은 트랜잭션에서 갱신하고 변경 이력을 남긴다.
값이 다르면 아무것도 바꾸지 않고 `409 REVISION_CONFLICT` 를 낸다. 클라이언트는 최신 상태를 다시 읽어 사용자에게 보여 준다.
409 응답에는 서버의 현재 값을 담지 않는다. 웹은 상세를 다시 읽어 편집 시작 값, 내 입력, 최신 값을 칸마다 비교한다. 화면 동작은 [흐름](flow.md) 의 「동시 수정」 이다.

바뀐 값이 없는 수정(노드 `PATCH`, Claim `PATCH`, 같은 상태와 메모의 검토, 사용자 `PATCH`)은 `200` 과 현재 표현을 돌려준다.
revision 은 그대로이고 ChangeEvent 도 만들지 않는다. `expectedRevision` 검사는 그대로 해서, 낡은 revision 이면 바뀐 값이 없어도 `409` 다.

## 노드

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/nodes` | 검색. 쿼리: `q`, `types`(쉼표 구분), `reviewStatus`, `includeArchived`(기본 `false`), `page`, `size`. 응답 `Page<NodeView>`. 대소문자를 무시한 `label` 오름차순(Security 는 그 뒤에 `ticker`) |
| GET | `/api/nodes/{id}` | 상세. 응답 `NodeDetail` |
| POST | `/api/nodes` | 생성. 본문 `{"type","properties"}`. 응답 `201 NodeView` |
| PATCH | `/api/nodes/{id}` | 속성 수정. 본문 `{"expectedRevision", "properties": {키: 값 또는 null}}`. `null` 은 그 속성을 지운다. 응답 `NodeView` |
| POST | `/api/nodes/{id}/archive` | 보관. 본문 `{"expectedRevision","reason"}`. `reason` 은 선택. 응답 `NodeView` |
| POST | `/api/nodes/{id}/restore` | 복원. 본문 `{"expectedRevision"}`. 응답 `NodeView` |

- `q` 는 `label` 과 Security 의 `ticker` 에서 대소문자를 무시하고 부분 일치로 찾는다. 100자까지다. 비우면 전체를 돌려준다.
- `POST /api/nodes` 의 `type` 은 `Company`, `Security`, `Sector`, `Document` 가운데 하나다. `Claim` 은 `400 ONTOLOGY_VIOLATION` 이고 `/api/claims` 로 만든다.
- `PATCH` 로 Claim 을 고치면 `400 ONTOLOGY_VIOLATION` 이다. `PATCH /api/claims/{id}` 를 쓴다.
- `relationships` 는 만든 순서로 100개, `claims` 는 오래된 순서로 50개까지 담는다. 넘으면 잘라 내고 `...Truncated` 를 `true` 로 둔다.
- Document 를 보관할 때 그 문서가 어떤 활성 Claim 의 유일한 활성 근거면 `409 LAST_EVIDENCE` 다. Claim 을 먼저 보관하거나 다른 근거를 더한 Claim 으로 새로 만든다.
- 활성 근거 문서가 없는 Claim 은 복원할 수 없다(`409 NO_ACTIVE_EVIDENCE`). 근거 문서를 먼저 복원한다.
- 보관한 노드는 기본 검색, 주변 그래프, 검토 대기 목록에서 빠진다. 상세 조회와 `includeArchived=true` 검색에는 나온다.
- 노드를 보관해도 그 노드에 걸린 관계와 Claim 은 그대로 둔다. 그래프에서는 보관된 끝점 때문에 함께 보이지 않는다.

`NodeDetail`

```json
{
  "node": "NodeView",
  "claim": "ClaimView 또는 null. 노드가 Claim 일 때만 있다",
  "relationships": ["RelationshipView. ISSUES 처럼 일반 관계만. 보관된 관계 포함"],
  "claims": ["ClaimView. 이 노드가 SUBJECT, OBJECT, SUPPORTED_BY 의 끝인 Claim. 보관된 Claim 제외"],
  "relationshipsTruncated": false,
  "claimsTruncated": false,
  "limits": { "maxRelationships": 100, "maxClaims": 50 }
}
```

## 관계

일반 관계는 온톨로지 `relationshipTypes` 에 있는 타입만 만들 수 있다. 현재는 `ISSUES` 하나다.
Claim 에 딸린 `SUBJECT`, `OBJECT`, `SUPPORTED_BY` 는 이 API 로 만들 수 없다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/relationships` | 생성. 본문 `{"type","fromId","toId"}`. 응답 `201 RelationshipView` |
| POST | `/api/relationships/{id}/archive` | 보관. 본문 `{"expectedRevision","reason"}`. 응답 `RelationshipView` |
| POST | `/api/relationships/{id}/restore` | 복원. 본문 `{"expectedRevision"}`. 응답 `RelationshipView` |

같은 타입, 같은 시작과 끝 노드의 보관되지 않은 관계가 이미 있으면 `409 DUPLICATE` 다.
보관된 끝 노드에 관계를 만들면 `409 ARCHIVED` 다. 복원도 같은 규칙이다. 같은 활성 관계가 이미 있으면 `409 DUPLICATE`, 끝 노드가 보관됐으면 `409 ARCHIVED` 다.

## Claim

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/claims` | 목록. 쿼리: `reviewStatus`, `includeArchived`, `page`, `size`. 오래된 것부터. 검토 대기 목록은 `reviewStatus=DRAFT` 다 |
| GET | `/api/claims/{id}` | 상세. 응답 `ClaimView` |
| POST | `/api/claims` | 생성. 응답 `201 ClaimView` |
| PATCH | `/api/claims/{id}` | 내용 수정. 응답 `ClaimView` |
| POST | `/api/claims/{id}/review` | 검토. 본문 `{"expectedRevision","status","note"}`. 응답 `ClaimView` |

`POST /api/claims` 본문

```json
{
  "predicate": "SUPPLIES_TO",
  "subjectId": "uuid",
  "objectId": "uuid",
  "documentIds": ["uuid"],
  "description": "가상부품이 가상전자에 메모리 기판을 공급한다.",
  "evidenceText": "당사의 주요 매출처는 가상전자이다.",
  "validFrom": null,
  "validTo": null,
  "authoringMethod": "MANUAL",
  "extractionConfidence": null
}
```

- `predicate` 와 주어, 목적어 타입은 온톨로지 `claimPredicates` 로 검증한다.
- `documentIds` 는 1개 이상 20개 이하이고 모두 보관되지 않은 Document 여야 한다. 근거 없는 Claim 은 만들 수 없다.
- 새 Claim 의 `reviewStatus` 는 `DRAFT` 다. `authoringMethod` 를 비우면 `MANUAL` 이다.
- `validFrom` 이 `validTo` 보다 늦으면 `400 VALIDATION_FAILED` 다.

`PATCH /api/claims/{id}` 본문은 `expectedRevision` 과 함께 `description`, `evidenceText`, `validFrom`, `validTo`, `extractionConfidence` 가운데 바꿀 것만 담는다.
`validFrom`, `validTo` 에 `null` 을 넣으면 미상으로 되돌린다. predicate, 주어, 목적어, 근거 자료는 바꿀 수 없다. 바꾸려면 보관하고 새로 만든다.
내용을 고치면 `reviewStatus` 가 `DRAFT` 로 돌아가고 검토자 정보가 지워진다. 이력에는 이전 검토자가 남는다.

`review` 의 `status` 는 `REVIEWED`, `REJECTED`, `DRAFT` 가운데 하나다.
Claim 작성자와 마지막으로 내용을 고친 사람은 그 Claim 을 검토할 수 없다(`403 SELF_REVIEW_FORBIDDEN`).
활성 근거 문서가 없는 Claim 은 `REVIEWED` 로 검토할 수 없다(`409 NO_ACTIVE_EVIDENCE`). `REJECTED` 와 `DRAFT` 는 할 수 있다. 두 사람이 모두 손댄 Claim 은 제3자가 검토한다. 보관된 Claim 은 검토할 수 없다(`409 ARCHIVED`).
Claim 보관과 복원은 노드 API(`/api/nodes/{id}/archive`, `/restore`)로 한다.

## 주변 그래프

`GET /api/graph/neighborhood?id={uuid}&hops=1&types=Company,Security&reviewStatus=REVIEWED`

| 쿼리 | 기본값 | 설명 |
| --- | --- | --- |
| `id` | 필수 | 중심 노드 |
| `hops` | 1 | 1 또는 2. 서버 설정 `workbench.graph.max-hops` 보다 크면 `400 VALIDATION_FAILED` |
| `types` | 전체 | 중심을 뺀 경로 위 모든 노드를 이 타입으로 제한한다 |
| `reviewStatus` | 전체 | 경로 위 모든 Claim 노드를 이 검토 상태로 제한한다 |

필터는 결과 노드뿐 아니라 중심에서 그 노드까지 가는 경로 위의 모든 노드(중심 제외)에 적용한다.
필터에서 빠진 노드를 거쳐야만 닿는 노드는 보이지 않는다.

- `hops=2&reviewStatus=REVIEWED` 는 DRAFT Claim 을 거쳐 닿는 기업을 보여 주지 않는다. 검토되지 않은 연결이 생긴 것처럼 보이지 않게 하기 위해서다.
- `hops=2&types=Company` 는 Claim 을 거쳐야 닿는 기업도 보여 주지 않는다. 기업 사이의 근거 있는 연결을 보려면 `types` 에 `Claim` 을 넣는다.

```json
{
  "centerId": "uuid",
  "hops": 1,
  "nodes": [
    { "id": "uuid", "type": "Company", "label": "가상전자", "reviewStatus": null, "predicate": null },
    { "id": "uuid", "type": "Claim", "label": "가상부품 → 가상전자 공급한다", "reviewStatus": "DRAFT", "predicate": "SUPPLIES_TO" }
  ],
  "edges": [{ "id": "uuid", "type": "SUBJECT", "source": "uuid", "target": "uuid" }],
  "truncated": false,
  "limits": { "maxHops": 2, "maxNodes": 150, "maxRelationships": 300 }
}
```

- 모은 노드에 Claim 이 있으면 그 Claim 의 주체와 대상(`SUBJECT`, `OBJECT` 끝 노드)을 홉 수와 상관없이 더한다. `types` 필터에서 빠진 타입과 보관된 노드는 더하지 않는다. 더한 노드도 `maxNodes` 에 센다.
- `predicate` 는 Claim 일 때만 값이 있다. 화면이 주장을 선으로 접어 그릴 때 선 이름을 고르는 데 쓴다.
- 보관된 노드와 관계는 빠진다. 보관된 중심 노드를 요청하면 `404 NOT_FOUND` 다.
- 노드나 관계가 한도를 넘으면 한도까지만 돌려주고 `truncated` 를 `true` 로 둔다. 화면은 이것을 표시한다.
- 조회 트랜잭션은 `workbench.graph.timeout` (기본 5초) 뒤에 끊긴다.
- 이웃 확장은 클라이언트가 다른 노드를 중심으로 이 API 를 다시 부르고 결과를 합친다.

## 변경 이력

`GET /api/changes?targetId={uuid}&actor={email}&page=0&size=20` 은 최근 것부터 `Page<ChangeEventView>` 를 돌려준다.

```json
{
  "id": "uuid",
  "at": "2026-10-20T04:00:00Z",
  "actor": { "id": "uuid", "email": "bob@example.com", "displayName": "Bob" },
  "action": "REVIEW",
  "targetId": "uuid",
  "targetKind": "NODE",
  "targetType": "Claim",
  "targetLabel": "SUPPLIES_TO",
  "revision": 2,
  "changes": { "reviewStatus": { "before": "DRAFT", "after": "REVIEWED" } },
  "note": "공시 원문과 대조함"
}
```

사용자 관리 이벤트(`targetKind = USER`)는 ADMIN 에게만 보인다. 다른 역할의 응답에서는 `targetId`, `actor` 필터와 상관없이 빠진다.
허용 목록의 이메일이 이력으로 새지 않게 하기 위해서다.

`action` 은 `CREATE`, `UPDATE`, `REVIEW`, `ARCHIVE`, `RESTORE` 가운데 하나다. `targetKind` 는 `NODE`, `RELATIONSHIP`, `USER` 가운데 하나다. 사용자 관리 변경도 같은 형식으로 남는다.
`revision` 은 변경 뒤의 revision 이다. 이력은 지우거나 고치는 API 가 없다.

## 온톨로지

| 메서드 | 경로 | 인증 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/ontology` | 필요 | 온톨로지 YAML 을 그대로 옮긴 JSON. 화면용 표시 이름(`label`, `valueLabels`, `reviewStatuses`, `changeActions`), 주장 문장 틀(`claimPredicates.<predicate>.sentence`), 만들기 폼 정보(`nodeTypes.<타입>.hintProperties`, `relationshipTypes.<관계>.createPicker`), 예전 값 별칭(`valueAliases`)이 들어 있다. 저장되는 값과 키는 표시 이름과 따로다. 뜻은 [데이터 스키마](data-schema.md) 의 「표시 이름」 과 그 아래 절이다 |

## 사용자 관리

모두 `ADMIN` 만 부를 수 있다. 사용자 노드도 revision 을 가지며 수정은 `expectedRevision` 을 받는다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/users` | 전체 사용자. 이메일 오름차순. 응답 `UserView[]` |
| POST | `/api/users` | 허용 사용자 추가. 본문 `{"email","displayName","role"}`. 응답 `201 UserView`. 같은 이메일이 있으면 `409 DUPLICATE` |
| PATCH | `/api/users/{id}` | 본문 `{"expectedRevision","role","displayName","enabled"}`. `expectedRevision` 밖의 필드는 바꿀 것만 담는다. 응답 `UserView` |

`UserView`

```json
{
  "id": "uuid", "email": "bob@example.com", "displayName": "Bob", "role": "EDITOR",
  "enabled": true, "linked": true, "revision": 2,
  "createdAt": "...", "updatedAt": "...", "lastLoginAt": "..."
}
```

- `linked` 는 Google `sub` 이 묶였는지다. 처음 로그인하기 전에는 `false` 다. `sub` 값은 응답에 담지 않는다.
- 마지막 활성 `ADMIN` 을 다른 역할로 바꾸거나 비활성화하면 `409 LAST_ADMIN` 이다. 자기 자신에게도 같다.
- 이메일은 바꿀 수 없다. 잘못 넣었으면 비활성화하고 새로 추가한다.
- 추가, 역할 변경, 비활성화, 다시 활성화는 ChangeEvent(`targetKind = USER`)로 같은 트랜잭션에 남는다.

## 후속 도구가 쓸 필드

FOS 의 `search_financial_knowledge`, `get_company_context`, `get_evidence` 는 이 API 의 조회 응답을 그대로 쓸 수 있게 했다.

| 도구 | 쓸 API | 기대는 필드 |
| --- | --- | --- |
| `search_financial_knowledge` | `GET /api/nodes`, `GET /api/claims` | `id`, `type`, `label`, `revision`, `reviewStatus`, `updatedAt` |
| `get_company_context` | `GET /api/nodes/{id}`, `GET /api/graph/neighborhood` | `relationships`, `claims[].subject`, `claims[].object`, `claims[].reviewStatus`, `properties.validFrom`, `properties.validTo` |
| `get_evidence` | `GET /api/claims/{id}` | `properties.evidenceText`, `documents[].url`, `documents[].publishedAt`, `documents[].collectedAt`, `reviewedBy`, `reviewedAt`, `revision` |

도구는 `revision` 과 `updatedAt` 을 답변에 함께 남겨 어느 시점의 지식을 근거로 삼았는지 추적한다.
도구 쪽 인증 방식(서비스 계정이나 읽기 전용 토큰)은 연동할 때 정한다. 이 API 는 아직 Google 로그인 세션만 받는다.
