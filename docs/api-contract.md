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
`/api/v1/**` 는 예외다. 세션과 CSRF 를 쓰지 않고 연동 토큰(`Authorization: Bearer`)만 받는다. 규칙은 아래 「에이전트 API」 절이다. 반대로 `/api/v1` 밖의 경로는 연동 토큰을 받지 않는다. 결정과 근거는 [ADR-012](adr/012-agent-integration-token.md) 다.
서버는 요청마다 사용자 상태와 역할을 다시 읽는다. 비활성화된 사용자의 세션은 다음 요청에서 끊기고 `401 UNAUTHENTICATED` 를 받는다.

상태를 바꾸는 요청(`POST`, `PATCH`, `PUT`, `DELETE`)은 CSRF 토큰이 필요하다.
서버는 `XSRF-TOKEN` 쿠키(HttpOnly 아님)를 내려 주고, 클라이언트는 그 값을 `X-XSRF-TOKEN` 헤더에 담는다.
쿠키가 없으면 먼저 `GET /api/auth/csrf` 를 부른다. 토큰 값은 응답 본문이 아니라 쿠키에서 읽는다.

| 메서드 | 경로 | 인증 | 성공 응답 | 실패 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 불필요 | `200 {"status":"UP"}` | `503 {"status":"DOWN"}` |
| GET | `/api/auth/csrf` | 불필요 | `200 {"headerName":"X-XSRF-TOKEN","cookieName":"XSRF-TOKEN"}` 와 쿠키 | 없음 |
| GET | `/api/auth/me` | 필요 | `200 CurrentUser` | `401 UNAUTHENTICATED` |
| POST | `/api/auth/me/guide-done` | 필요(모든 역할) | `200 CurrentUser`. 첫 접속 가이드를 끝냈거나 건너뛰었다고 기록한다. 이미 기록돼 있으면 그대로 둔다 | `401 UNAUTHENTICATED`, `403 CSRF_REJECTED` |
| POST | `/api/auth/logout` | 필요 | `204` | `403 CSRF_REJECTED` |

`CurrentUser`

```json
{ "id": "uuid", "email": "alice@example.com", "displayName": "Alice", "role": "EDITOR", "guideDoneAt": null }
```

`guideDoneAt` 은 첫 접속 가이드를 끝냈거나 건너뛴 시각이고, 아직이면 `null` 이다. 화면은 `null` 이면 로그인한 뒤 가이드를 연다.

## 역할

역할은 사용자마다 하나다. 권한은 서버가 집행하고, 화면에서 버튼을 숨기는 것은 보조다.

| 역할 | 할 수 있는 일 |
| --- | --- |
| `VIEWER` | 모든 `GET` 조회(검색, 상세, 주변 그래프, 근거 따라가기, 목록, 변경 이력, 온톨로지), `/api/me/knowledge` 의 내 이해 표시 쓰기, `/api/me/tokens` 의 내 연동 토큰 발급과 폐기, `/api/me/trades` 의 내 체결 지우기, `/api/me/proposals` 의 내 제안 거절과 개인 기록 제안(`LINK_TRADE_DECISION`, `STUDY_NOTE`)의 승인 |
| `EDITOR` | VIEWER 권한과 노드, 관계, Claim 의 생성, 수정, 검토, 보관, 복원, 공유 지식을 만드는 제안(`CREATE_NODE`, `CREATE_RELATIONSHIP`)의 승인 |
| `ADMIN` | EDITOR 권한과 `/api/users` 의 사용자 관리, `/api/ontology` 아래의 온톨로지 편집(버전 목록, 내보내기, 미리보기, 저장, 되돌리기) |

역할이 모자라면 `403 FORBIDDEN` 이다.
온톨로지 정의(타입, 관계, 속성)는 Neo4j 에 버전으로 쌓이고 `ADMIN` 만 웹에서 바꾼다. 저장소의 YAML 은 첫 버전과 서버 코드가 소유하는 부분의 원본이다(「온톨로지」, [데이터 스키마](data-schema.md) 의 「온톨로지 버전」).

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
| 400 | `ONTOLOGY_INVALID` | 저장하려는 온톨로지 정의가 일관성 검사를 통과하지 못했다. `details.errors` 에 오류 문장 목록이 있다 |
| 401 | `UNAUTHENTICATED` | 세션이 없다. `/api/v1` 에서는 연동 토큰이 없거나 올바르지 않다 |
| 403 | `CSRF_REJECTED` | CSRF 토큰이 없거나 틀렸다 |
| 403 | `FORBIDDEN` | 역할이 모자라다. 열람자가 공유 지식을 만드는 제안을 승인하려 한 경우도 여기 해당한다 |
| 403 | `INSUFFICIENT_SCOPE` | 「조회만」 연동 토큰으로 `/api/v1` 의 쓰기 경로를 불렀다 |
| 411 | `LENGTH_REQUIRED` | 본문이 있는 `/api` 요청에 Content-Length 가 없다(chunked 전송) |
| 413 | `PAYLOAD_TOO_LARGE` | 요청 본문이 64KiB 를 넘는다. 온톨로지 미리보기, 저장, 되돌리기는 512KiB 다 |
| 403 | `SELF_REVIEW_FORBIDDEN` | 자기가 작성한 Claim 을 검토하려 했다 |
| 404 | `NOT_FOUND` | 그 ID 의 노드나 관계가 없다. 온톨로지 버전 조회와 되돌리기에서는 그 버전 번호가 없다. 없는 `/api` 경로도 같다 |
| 405 | `METHOD_NOT_ALLOWED` | 경로는 있지만 그 메서드를 받지 않는다. `/api/v1` 에서는 `POST /api/v1/trades`, `POST /api/v1/proposals` 밖의 `POST`, `PUT`, `PATCH`, `DELETE` 가 여기 해당한다 |
| 409 | `REVISION_CONFLICT` | `expectedRevision` 이 현재 revision 과 다르다. `details` 에 두 값이 있다 |
| 409 | `ARCHIVED` | 보관된 대상을 수정하려 했다. 먼저 복원한다 |
| 409 | `NOT_ARCHIVED` | 보관되지 않은 대상을 복원하려 했다 |
| 409 | `DUPLICATE` | 같은 시장과 종목 코드의 Security, 같은 이메일의 사용자처럼 유일해야 하는 값이 이미 있다 |
| 409 | `LAST_ADMIN` | 마지막 활성 ADMIN 을 강등하거나 비활성화하려 했다 |
| 409 | `TOKEN_LIMIT` | 폐기하지 않은 연동 토큰이 이미 상한(5개)만큼 있다. `details.max` 에 상한이 있다 |
| 409 | `PROPOSAL_LIMIT` | 대기 중인 제안이 상한(200개)을 넘게 된다. `details.max` 에 상한, `details.pending` 에 지금 대기 수가 있다 |
| 409 | `PROPOSAL_NOT_PENDING` | 이미 승인했거나 거절한 제안을 승인하거나 거절하려 했다. `details.status` 에 지금 상태가 있다 |
| 409 | `LAST_EVIDENCE` | 어떤 활성 Claim 의 유일한 활성 근거 Document 를 보관하려 했다. `details.claimIds` 에 그 Claim 이 있다 |
| 409 | `NO_ACTIVE_EVIDENCE` | 활성 근거 문서가 없는 Claim 을 복원하거나 `REVIEWED` 로 검토하려 했다 |
| 409 | `TRANSIENT_CONFLICT` | 동시에 처리 중인 다른 요청과 잠금이 겹쳤다. Neo4j 오류 코드가 `DeadlockDetected`, `LockAcquisitionTimeout` 일 때만이다. 최신 내용을 다시 읽고 다시 시도한다 |
| 409 | `ONTOLOGY_IMPACT_UNCONFIRMED` | 기존 데이터와 어긋나는 온톨로지 변경을 `confirm: true` 없이 저장하려 했다. `details.impacts` 에 영향 목록이 있다 |
| 429 | `RATE_LIMITED` | 연동 토큰 하나로 1분에 60번을 넘게 불렀거나, 쓰기 경로를 1분에 10번 넘게 불렀다. `Retry-After` 헤더와 `details.retryAfterSeconds` 에 다시 부를 수 있을 때까지의 초가 있다 |
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

`label` 은 온톨로지의 `labelProperty` 값이다. 단 Claim 의 `label` 은 읽을 때 만든 「주체 이름 → 대상 이름 관계 표시 이름」(예: `가나전자 → 메모리 반도체 속한다`)이다. 주체나 대상을 찾지 못하면 그 자리를 `?` 로 둔다. `reviewStatus` 는 Claim 일 때만 값이 있다.

`ClaimView`: `NodeView` 의 모든 필드에 아래를 더한다.

```json
{
  "reviewStatus": "REVIEWED",
  "reviewedBy": { "id": "uuid", "email": "bob@example.com", "displayName": "Bob" },
  "reviewedAt": "2026-10-20T04:00:00Z",
  "reviewNote": "공시 원문과 대조함",
  "contentUpdatedBy": { "id": "uuid", "email": "alice@example.com", "displayName": "Alice" },
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
| 요청 본문 | 64KiB, 온톨로지 미리보기와 저장, 되돌리기(`POST /api/ontology/**`)는 512KiB. Content-Length 필수 | `413 PAYLOAD_TOO_LARGE`, `411 LENGTH_REQUIRED` |
| 검색어 `q` | 100자 | `400 VALIDATION_FAILED` |
| Claim 의 `documentIds` | 20개 | `400 VALIDATION_FAILED` |
| 페이지 크기 `size` | 100 | `400 VALIDATION_FAILED` |
| 노드 상세의 `relationships`, `claims` | 100개, 50개 | 잘라 내고 `relationshipsTruncated`, `claimsTruncated` 를 `true` 로 둔다 |
| 노드 상세의 `concepts` | 20개 | 만든 순서로 앞 20개만 담는다 |
| 근거 따라가기의 깊이, 단계 수, 아래쪽 항목 | 6, 60개(지금 항목 포함), 50개 | 한도까지만 담고 `truncated`, `dependentsTruncated` 를 `true` 로 둔다 |
| 내 이해 표시의 메모 `note` | 1000자 | `400 VALIDATION_FAILED` |
| 연동 토큰 이름 `name`, 사용자당 폐기하지 않은 토큰 | 50자, 5개 | `400 VALIDATION_FAILED`, `409 TOKEN_LIMIT` |
| 사용자당 대기 중인 제안 | 200개 | `409 PROPOSAL_LIMIT` |
| 제안 거절 이유 `reason` | 1000자 | `400 VALIDATION_FAILED` |
| `/api/v1` 의 요청 수, 페이지 크기, 응답 항목 | 「에이전트 API(`/api/v1`)」 의 「요청 한도와 응답 크기」 | 그 절의 표 |
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
| GET | `/api/nodes` | 검색. 쿼리: `q`, `types`(쉼표 구분), `reviewStatus`, `includeArchived`(기본 `false`), `sort`(`label` 이 기본, `recent`), `page`, `size`. 응답 `Page<NodeView>`. `label` 은 대소문자를 무시한 `label` 오름차순(Security 는 그 뒤에 `ticker`), `recent` 는 만든 시각(`createdAt`)이 늦은 순서다 |
| GET | `/api/nodes/counts` | 타입별 항목 수. 응답 `200 {"counts": {"<타입 키>": <정수>}}`. 로그인한 모든 역할이 읽는다 |
| GET | `/api/nodes/{id}` | 상세. 응답 `NodeDetail` |
| GET | `/api/nodes/{id}/trace` | 근거 따라가기. 응답 `TraceView`(아래 「근거 따라가기」) |
| POST | `/api/nodes` | 생성. 본문 `{"type","properties"}`. 응답 `201 NodeView` |
| PATCH | `/api/nodes/{id}` | 속성 수정. 본문 `{"expectedRevision", "properties": {키: 값 또는 null}}`. `null` 은 그 속성을 지운다. 응답 `NodeView` |
| POST | `/api/nodes/{id}/archive` | 보관. 본문 `{"expectedRevision","reason"}`. `reason` 은 선택. 응답 `NodeView` |
| POST | `/api/nodes/{id}/restore` | 복원. 본문 `{"expectedRevision"}`. 응답 `NodeView` |

- `sort` 가 `label`, `recent` 가 아니면 `400 VALIDATION_FAILED` 다. 같은 순서 안에서는 `id` 로 순서를 고정한다. 개념 지도의 최근 항목이 `sort=recent` 를 쓴다.
- `counts` 는 보관하지 않은 노드만 센다. 지금 온톨로지의 모든 노드 타입 키(Claim 포함)를 담고, 항목이 없는 타입은 `0` 이다. 온톨로지에 없는 타입의 노드는 담지 않는다. 쿼리는 `MATCH (n:Knowledge) WHERE n.archived = false RETURN n.type, count(n)` 하나다.
- `q` 는 `label`, Security 의 `ticker`, 그 타입의 `searchProperties` 값(예: 인물과 개념의 `englishName`)에서 대소문자를 무시하고 부분 일치로 찾는다. 100자까지다. 비우면 전체를 돌려준다.
- `POST /api/nodes` 의 `type` 은 현재 온톨로지에서 `managedBy` 가 없는 노드 타입이다. `Claim` 처럼 별도 API 가 관리하는 타입은 `400 ONTOLOGY_VIOLATION` 이고, `Claim` 은 `/api/claims` 로 만든다.
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
  "concepts": ["ConceptRef. 이 노드에서 Concept 으로 나가는 보관되지 않은 일반 관계의 끝. 주장 관계(SUBJECT, OBJECT, SUPPORTED_BY)와 보관된 개념은 뺀다"],
  "relationshipsTruncated": false,
  "claimsTruncated": false,
  "limits": { "maxRelationships": 100, "maxClaims": 50 }
}
```

`ConceptRef`

```json
{ "id": "uuid", "label": "DCF", "summary": "앞으로 벌어들일 현금흐름을 할인율로 지금 가치로 바꿔 더하는 평가 방법", "relationshipType": "USES_CONCEPT" }
```

- 주장의 대상이 개념이어도(`ADVOCATES` 주장의 `OBJECT`) 그 주장의 `concepts` 에는 담지 않는다. 주장과 개념의 연결은 주장 카드가 보인다.
- `summary` 는 개념의 한 줄 정의(`summary` 속성)다. 값이 없으면 `null` 이다.
- `relationshipType` 은 이 노드와 개념을 잇는 관계 종류다. 같은 개념이 두 관계로 이어져 있으면 먼저 만든 관계 하나로 담는다.
- 개념 노드 자신의 상세에도 `concepts` 가 있다(`RELATED_TO` 로 나가는 개념). 화면은 개념 상세에서는 칩 대신 「관련 개념」 절로 보인다.

## 관계

일반 관계는 온톨로지 `relationshipTypes` 에 있는 타입만 만들 수 있다. 목록은 [데이터 스키마](data-schema.md) 의 「관계」 가 소유한다.
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
| GET | `/api/claims` | 목록. 쿼리: `reviewStatus`, `scope`, `includeArchived`, `page`, `size`. 오래된 것부터. 검토 대기 목록은 `reviewStatus=DRAFT` 다. `scope=reviewable` 은 요청한 사람이 작성자도 마지막 내용 수정자도 아닌 것, `scope=mine` 은 둘 중 하나인 것만 준다. 없으면 나누지 않는다. 다른 값은 `400 VALIDATION_FAILED` 다 |
| GET | `/api/claims/{id}` | 상세. 응답 `ClaimView` |
| POST | `/api/claims` | 생성. 응답 `201 ClaimView` |
| PATCH | `/api/claims/{id}` | 내용 수정. 응답 `ClaimView` |
| POST | `/api/claims/{id}/review` | 검토. 본문 `{"expectedRevision","status","note"}`. 응답 `ClaimView` |

`POST /api/claims` 본문

```json
{
  "predicate": "BELONGS_TO_SECTOR",
  "subjectId": "uuid",
  "objectId": "uuid",
  "documentIds": ["uuid"],
  "description": "가상전자는 메모리 반도체 산업에 속한다.",
  "evidenceText": "당사는 D램과 낸드 플래시를 주력으로 생산한다.",
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

## 근거 따라가기

`GET /api/nodes/{id}/trace` 는 지금 항목에서 들어오는 관계를 거꾸로 따라 올라가 모은 조상과, 이 항목에 기대는 아래쪽 항목을 한 단계 돌려준다. 결정과 근거는 [ADR-011](adr/011-learning-marks-and-trace.md), 화면은 [흐름](flow.md) 의 「근거 따라가기」 다.

따라가는 규칙은 아래와 같다.

- 단계 `n` 의 위 단계는 `(p:Knowledge)-[r]->(n)` 인 `p` 다. `r` 은 지금 온톨로지의 `relationshipTypes` 에 있고, 보관되지 않았고, 근거 관계도 개념 관계도 아니어야 한다. `p` 도 보관되지 않아야 한다.
- 근거 관계는 온톨로지에서 끝(`to`) 타입에 `Document` 가 있는 관계 종류다(`EVIDENCED_BY`, `AUTHORED`). 개념 관계는 끝 타입에 `Concept` 가 있는 관계 종류다(`RELATED_TO`, `USES_CONCEPT`). 둘은 따라가지 않고 단계의 `documents`, `concepts` 로 붙인다. 주장 관계(`SUBJECT`, `OBJECT`, `SUPPORTED_BY`)와 `:User` 의 `KNOWS` 도 따라가지 않는다.
- 너비 우선으로 깊이 6 까지, 단계 60개(지금 항목 포함)까지 모은다. 이미 모은 항목은 다시 펼치지 않는다. 한도를 넘으면 그 앞까지만 담고 `truncated` 를 `true` 로 둔다.
- 지금 항목이 없거나 보관됐으면 `404 NOT_FOUND` 다. 주장(Claim)도 따라갈 수 있지만 일반 관계가 없어 지금 항목 한 단계만 돌아온다.
- 조회 트랜잭션은 주변 그래프와 같은 `workbench.graph.timeout`(기본 5초)이고, 넘으면 `503 QUERY_TIMEOUT` 이다.

`TraceView`

```json
{
  "rootId": "uuid",
  "steps": [
    {
      "node": "NodeView",
      "depth": 0,
      "childId": null,
      "relationshipId": null,
      "relationshipType": null,
      "status": "MISSING",
      "documents": ["DocumentRef"],
      "claims": [{ "id": "uuid", "label": "Fluence Energy → 에너지 저장(ESS) 속한다", "predicate": "BELONGS_TO_SECTOR", "reviewStatus": "REVIEWED" }],
      "concepts": ["ConceptRef"],
      "missing": [{ "relationshipType": "BASED_ON", "candidates": ["NodeRef"] }],
      "knowledge": { "nodeId": "uuid", "level": "UNSURE", "note": "왜 이 가정이 낙관인지 모르겠다", "updatedAt": "2026-10-25T03:15:00.123456Z" }
    }
  ],
  "dependents": [{ "node": "NodeRef", "relationshipId": "uuid", "relationshipType": "HAS_DECISION" }],
  "truncated": false,
  "dependentsTruncated": false,
  "limits": { "maxDepth": 6, "maxSteps": 60, "maxDependents": 50, "maxCandidates": 5 }
}
```

| 필드 | 뜻 |
| --- | --- |
| `steps` | 깊이 순서, 같은 깊이에서는 만든 순서다. 첫 단계가 지금 항목(`depth = 0`)이다 |
| `childId`, `relationshipId`, `relationshipType` | 이 단계에서 한 단계 아래(지금 항목 쪽) 단계로 가는 관계. 처음 찾은 길 하나다. 지금 항목은 `null` 이다. 관계 문장은 화면이 온톨로지의 `sentence` 로 만든다 |
| `documents` | 이 단계에서 근거 관계로 이어진 보관되지 않은 근거 문서. 20개까지 |
| `claims` | 이 단계가 주체나 대상인 보관되지 않은 주장. 20개까지, 만든 순서 |
| `concepts` | 노드 상세의 `concepts` 와 같다 |
| `status` | `SUPPORTED`(근거 문서가 있거나 검토 완료 주장이 있다), `PARTIAL`(근거 문서 없이 초안 주장만 있다), `MISSING`(둘 다 없다). 반려된 주장은 세지 않는다. 설명 글(「원문 대조 대기」 등)은 해석하지 않는다 |
| `missing` | 아직 잇지 않은 관계. 아래 규칙 |
| `knowledge` | 요청한 사람의 이해 표시(「내 이해 표시」 의 `KnowledgeMark`). 없으면 `null` 이다. 다른 사람의 표시는 담지 않는다 |
| `dependents` | 지금 항목에서 나가는 관계(따라가는 관계와 같은 규칙)의 끝. 이 항목에 기대는 것이다. 한 단계만, 50개까지, 만든 순서 |

`missing` 은 단계마다 이렇게 만든다.

- 따라가는 관계 종류 가운데 끝 타입에 이 단계의 타입이 있는 것마다, 보관되지 않은 노드에서 들어오는 보관되지 않은 관계가 하나도 없으면 항목 하나다. 예: 결정에 `BASED_ON` 이 없으면 `{"relationshipType": "BASED_ON"}` 이다.
- `candidates` 는 그 관계의 시작 타입인 보관되지 않은 노드 가운데, 이 단계에서 따라가는 관계(방향 무시)로 3홉 안에 닿는 것이다. 가까운 순서, 같으면 늦게 만든 순서로 5개까지다. 결정이면 같은 종목을 발행한 기업의 밸류에이션이 여기 든다(결정, 종목, 기업, 밸류에이션). 없으면 빈 목록이다.

## 내 이해 표시

요청한 사람 본인의 이해 표시만 읽고 쓴다. 다른 사람의 표시를 읽는 API 는 없다. 모든 역할(VIEWER 포함)이 부르고, 쓰기는 다른 쓰기와 같이 CSRF 토큰이 필요하다. 저장 모델은 [데이터 스키마](data-schema.md) 의 「이해 표시」 다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/me/knowledge` | 공부 목록. 쿼리: `level`(쉼표 구분, `KNOWN`, `UNSURE`, `LEARNING`. 없으면 전체), `page`, `size`. 바꾼 시각이 늦은 순서, 같으면 노드 id 순서. 응답 `Page<StudyItem>` |
| GET | `/api/me/knowledge/summary` | 개수와 내 능력 범위. 응답 `KnowledgeSummary` |
| GET | `/api/me/knowledge/{nodeId}` | 한 항목의 내 표시. 응답 `KnowledgeMark`. 표시가 없으면 `level`, `note`, `updatedAt` 이 `null` 이다 |
| PUT | `/api/me/knowledge/{nodeId}` | 표시를 쓴다. 본문 `{"level", "note"}`. `note` 는 선택이고 비우거나 `null` 이면 메모를 지운다. 응답 `KnowledgeMark` |
| DELETE | `/api/me/knowledge/{nodeId}` | 표시를 지운다. 표시가 없어도 `204` 다 |

- `level` 이 세 값 밖이거나 없으면 `400 VALIDATION_FAILED`(`details.fieldErrors.level`)다. `note` 가 1000자를 넘으면 `400 VALIDATION_FAILED`(`details.fieldErrors.note`)다. 쿼리의 `level` 이 세 값 밖이면 `400 VALIDATION_FAILED` 다.
- 그 id 의 지식 노드가 없으면 `404 NOT_FOUND` 다. 보관된 노드에도 쓰고 지울 수 있다.
- revision 이 없고 `expectedRevision` 을 받지 않는다. 나중 쓰기가 남는다. 변경 이력을 남기지 않는다.

`KnowledgeMark`

```json
{ "nodeId": "uuid", "level": "UNSURE", "note": "계통 접속이 왜 막히는지 모르겠다", "updatedAt": "2026-10-25T03:15:00.123456Z" }
```

`StudyItem`

```json
{
  "node": "NodeRef",
  "level": "UNSURE",
  "note": "계통 접속이 왜 막히는지 모르겠다",
  "updatedAt": "2026-10-25T03:15:00.123456Z",
  "contexts": [{ "decision": "NodeRef", "depth": 4 }],
  "documents": ["DocumentRef"],
  "concepts": ["ConceptRef"]
}
```

- `contexts` 는 이 항목을 근거 따라가기의 단계로 가지는 투자 결정(Decision)이다. 이 항목에서 따라가는 관계를 정방향으로 6홉 안에 닿는 보관되지 않은 결정을 가까운 순서로 3개까지 담는다. `depth` 는 결정에서 이 항목까지의 단계 수이고, 항목이 결정이면 `0` 이다. 보관된 항목은 빈 목록이다.
- `documents` 는 근거 따라가기 단계의 `documents` 와 같은 규칙으로 5개까지, `concepts` 는 노드 상세의 `concepts` 와 같은 규칙으로 10개까지다.

`KnowledgeSummary`

```json
{ "counts": { "KNOWN": 5, "UNSURE": 2, "LEARNING": 1 }, "decisions": { "total": 4, "understood": 1 }, "decisionsTruncated": false }
```

- `counts` 는 표시 수다. 보관된 항목의 표시도 센다. 표시가 없는 값은 `0` 이다.
- `decisions.total` 은 보관되지 않은 투자 결정 수, `understood` 는 그 가운데 근거 따라가기의 모든 단계(결정 자신 포함, 같은 한도)를 내가 `KNOWN` 으로 표시한 결정 수다. 결정은 만든 순서로 200개까지 세고, 넘으면 `decisionsTruncated` 가 `true` 다.
- 결정 타입은 이름(`Decision`)으로 읽는다. 온톨로지에 이 타입이 없으면 `total` 은 `0` 이다.

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
    { "id": "uuid", "type": "Claim", "label": "가상전자 → 메모리 반도체 속한다", "reviewStatus": "DRAFT", "predicate": "BELONGS_TO_SECTOR" }
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
`GET /api/changes/actors` 는 이력에 한 번이라도 나온 사용자의 `UserRef` 목록을 표시 이름 순서로 돌려준다. 이력 화면의 사용자 고르기 칸이 쓴다. ADMIN 이 아니면 사용자 관리 이벤트(`targetKind = USER`)만 남긴 사용자는 빠진다. 서버가 남긴 이력(`system`)의 작업자는 사용자가 아니라 목록에 없다.

```json
{
  "id": "uuid",
  "at": "2026-10-20T04:00:00Z",
  "actor": { "id": "uuid", "email": "bob@example.com", "displayName": "Bob" },
  "action": "REVIEW",
  "targetId": "uuid",
  "targetKind": "NODE",
  "targetType": "Claim",
  "targetLabel": "BELONGS_TO_SECTOR",
  "revision": 2,
  "changes": { "reviewStatus": { "before": "DRAFT", "after": "REVIEWED" } },
  "refs": {},
  "note": "공시 원문과 대조함"
}
```

사용자 관리 이벤트(`targetKind = USER`)는 ADMIN 에게만 보인다. 다른 역할의 응답에서는 `targetId`, `actor` 필터와 상관없이 빠진다.
허용 목록의 이메일이 이력으로 새지 않게 하기 위해서다.

`action` 은 `CREATE`, `UPDATE`, `REVIEW`, `ARCHIVE`, `RESTORE` 가운데 하나다. `targetKind` 는 `NODE`, `RELATIONSHIP`, `USER`, `ONTOLOGY` 가운데 하나다. `ONTOLOGY` 의 `targetId` 는 버전 번호(문자열)다. 사용자 관리 변경도 같은 형식으로 남는다.
`revision` 은 변경 뒤의 revision 이다. 이력은 지우거나 고치는 API 가 없다.

`refs` 는 `changes` 안의 ID 를 지금 이름으로 바꾼 맵이다. 키는 ID, 값은 `{"id","type","label","archived"}` 다. 노드 ID 키는 `subjectId`, `objectId`, `documentIds`, `fromId`, `toId` 이고 `type` 은 노드 타입이다. 사용자 ID 키는 `reviewedBy` 이고 `type` 은 `User`, `label` 은 표시 이름, `archived` 는 `false` 다. 이 키의 `before`, `after` 에 든 ID 를 모두 담는다. 찾지 못한 ID 는 빠진다.
이름은 읽는 시점의 이름이다. 노드 이름을 바꾸면 예전 이력에도 새 이름이 보인다. 그때의 이름은 `targetLabel` 만 남긴다.

## 온톨로지

| 메서드 | 경로 | 인증 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/ontology` | 필요 | 최신 온톨로지 버전을 옮긴 JSON. `version`(정수), `versionCreatedAt`, `versionCreatedBy`(UserRef, 서버가 만든 버전이면 `null`)가 더 있다. 화면용 표시 이름(`label`, `valueLabels`, `reviewStatuses`, `changeActions`), 주장 문장 틀(`claimPredicates.<predicate>.sentence`), 관계 문장 틀(`relationshipTypes.<관계>.sentence`), 만들기 폼 정보(`nodeTypes.<타입>.hintProperties`, `relationshipTypes.<관계>.createPicker`), 타입의 색과 모양(`nodeTypes.<타입>.display`), 검색에 넣을 속성(`nodeTypes.<타입>.searchProperties`), 변경 이력의 항목 이름(`changeFields`), 예전 값 별칭(`valueAliases`)이 들어 있다. 저장되는 값과 키는 표시 이름과 따로다. 뜻은 [데이터 스키마](data-schema.md) 의 「표시 이름」 과 그 아래 절이다 |
| GET | `/api/ontology/versions` | ADMIN | 버전 목록. 최근 것부터 `Page<{"version","createdAt","createdBy":UserRef?,"note","restoredFrom"}>`. 쪽 나누기는 `page`, `size` |
| GET | `/api/ontology/versions/{version}` | ADMIN | 그 버전의 `{"version", "yaml", …목록의 필드}` |
| GET | `/api/ontology/export` | ADMIN | 최신 버전의 YAML 파일. `Content-Type: application/yaml;charset=UTF-8`, `Content-Disposition: attachment; filename="financial-ontology-v<버전>.yaml"` |
| POST | `/api/ontology/preview` | ADMIN | 본문 `{"baseVersion", "yaml"}` 또는 `{"baseVersion", "definition"}`(JSON 정의). 저장하지 않고 `OntologyPreview` 를 돌려준다 |
| POST | `/api/ontology/versions` | ADMIN | 저장. 본문은 preview 와 같고 `note`, `confirm` 이 더 있다. 응답 `201` 과 새 버전의 목록 항목 |
| POST | `/api/ontology/versions/{version}/restore` | ADMIN | 그 버전의 내용으로 새 버전을 만든다. 본문 `{"baseVersion", "note", "confirm"}`. 영향 검사와 응답은 저장과 같다 |

`OntologyPreview`

```json
{
  "valid": true,
  "errors": [],
  "added": ["nodeTypes.Book", "nodeTypes.Person.properties.nickname"],
  "removed": ["relationshipTypes.RELATED_TO"],
  "changed": ["nodeTypes.Company.properties.name.label"],
  "impacts": [{ "path": "relationshipTypes.RELATED_TO", "kind": "REMOVED_RELATIONSHIP_TYPE", "count": 3 }],
  "codeOwnedIgnored": ["reviewStatuses.DRAFT"],
  "yaml": "nodeTypes:\n  Company:\n …",
  "definition": { "nodeTypes": {}, "relationshipTypes": {}, "claimPredicates": {} }
}
```

- `yaml` 과 `definition` 은 보낸 정의를 정규화하고 코드 소유 부분을 저장소 값으로 바꾼 결과다. 화면은 폼과 YAML 편집기를 오갈 때 이것으로 바꾼다. `valid` 가 거짓이고 YAML 을 읽지도 못했으면 둘 다 `null` 이다.
- `added`, `removed`, `changed` 는 `baseVersion` 이 아니라 최신 버전과 비교한 경로다.

- `valid` 가 거짓이면 `errors` 에 로더 검사 오류가 있고 저장할 수 없다(`400 ONTOLOGY_INVALID`, `details.errors`).
- `impacts` 가 있는데 저장 요청에 `confirm: true` 가 없으면 `409 ONTOLOGY_IMPACT_UNCONFIRMED` 와 `details.impacts` 다.
- `baseVersion` 이 최신이 아니면 `409 REVISION_CONFLICT`(`details.expectedRevision`, `details.currentRevision` 에 버전 번호)다.
- `codeOwnedIgnored` 는 보낸 값 가운데 코드가 소유해 무시한 경로다. 경로는 한 단계 아래 키까지다(`reviewStatuses.DRAFT`, `nodeTypes.Claim`).
- 최신 버전과 바뀐 점이 없으면(`added`, `removed`, `changed` 가 모두 비면) 저장과 되돌리기는 `400 ONTOLOGY_INVALID`(「바뀐 점이 없습니다.」)다. 새 버전을 만들지 않는다.
- 저장과 되돌리기의 `note` 는 1000자까지다. 넘으면 `400 VALIDATION_FAILED` 다. `yaml` 과 `definition` 은 하나만 보낸다.
- ADMIN 이 아니면 `GET /api/ontology` 를 뺀 위 여섯 끝점은 `403 FORBIDDEN` 이다. `GET /api/ontology` 는 모든 역할이 읽는다.
- 모든 API 응답에 `X-Ontology-Version` 헤더(최신 버전 번호)가 있다. 요청 크기 검사가 거절한 `413`, `411` 응답에는 붙지 않는다. 화면은 이 값이 들고 있는 버전과 다르면 온톨로지를 다시 읽으라는 안내를 보인다.

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

## 연동 토큰

사용자가 외부 에이전트(Hermes)에 넣을 개인 연동 토큰을 발급하고 폐기한다. 세션 API 라서 쓰기는 CSRF 토큰이 필요하다. 모든 역할(VIEWER 포함)이 자기 토큰만 다룬다. 다른 사람의 토큰을 읽거나 폐기하는 API 는 없다. 결정은 [ADR-012](adr/012-agent-integration-token.md), 저장 모델은 [데이터 스키마](data-schema.md) 의 「연동 토큰」 이다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/me/tokens` | 내 토큰 목록. 폐기하지 않은 것만 만든 순서(오래된 것부터)로 준다. 응답 `IntegrationTokenView[]` |
| POST | `/api/me/tokens` | 발급. 본문 `{"name", "scope"}`. 응답 `201 IssuedIntegrationToken` |
| DELETE | `/api/me/tokens/{id}` | 폐기. 응답 `204`. 내 토큰이 아니거나, 없거나, 이미 폐기했으면 `404 NOT_FOUND` |

`IntegrationTokenView`

```json
{ "id": "uuid", "name": "Hermes", "scope": "READ_WRITE", "last4": "x9Qa", "createdAt": "2026-10-25T03:15:00.123456Z", "lastUsedAt": null }
```

`IssuedIntegrationToken`: `IntegrationTokenView` 의 모든 필드에 `token` 을 더한다.

```json
{ "id": "uuid", "name": "Hermes", "scope": "READ_WRITE", "last4": "x9Qa", "createdAt": "2026-10-25T03:15:00.123456Z", "lastUsedAt": null, "token": "fwb_3q2K…x9Qa" }
```

- `token` 은 `fwb_` 뒤에 무작위 32바이트를 base64url(채움 문자 없음)로 쓴 43자를 붙인 47자다. 원문은 이 응답에만 실린다. 서버는 해시만 저장하므로 다시 보여 줄 수 없다.
- `name` 은 앞뒤 공백을 지운 1자 이상 50자 이하다. 어기면 `400 VALIDATION_FAILED`(`details.fieldErrors.name`)다. 같은 이름의 토큰도 만들 수 있다.
- `scope` 는 `READ`(조회만)나 `READ_WRITE`(조회와 기록)다. 비우거나 `null` 이면 `READ` 다. 그 밖의 값은 `400 VALIDATION_FAILED`(`details.fieldErrors.scope`)다. 발급한 뒤에는 바꿀 수 없다. 범위를 두기 전에 발급한 토큰은 `READ` 로 보인다. 결정은 [ADR-013](adr/013-owner-trades-and-agent-proposals.md) 이다.
- 폐기하지 않은 토큰이 이미 5개면 `409 TOKEN_LIMIT`(`details.max`)다. 사용자 노드를 잠근 뒤 세므로 동시에 발급해도 5개를 넘지 않는다.
- `last4` 는 원문의 끝 네 글자다. 화면은 `…x9Qa` 로 보인다.
- `lastUsedAt` 은 그 토큰으로 `/api/v1` 인증에 마지막으로 성공한 시각이다. 서버는 1분에 한 번만 고쳐 쓰므로 최대 1분 늦다. 한 번도 쓰지 않았으면 `null` 이다.
- 발급과 폐기는 변경 이력(ChangeEvent)에 남지 않는다.

## 내 체결

요청한 사람 본인의 체결 기록만 읽고 지운다. 다른 사람의 체결을 읽는 API 는 없고, ADMIN 도 같다. 모든 역할(VIEWER 포함)이 부르고, 지우기는 다른 쓰기와 같이 CSRF 토큰이 필요하다. 체결은 에이전트가 「에이전트 API」 의 `POST /api/v1/trades` 로 넣는다. 저장 모델은 [데이터 스키마](data-schema.md) 의 「체결 기록」, 결정은 [ADR-013](adr/013-owner-trades-and-agent-proposals.md) 이다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/me/trades` | 내 체결. 쿼리: `securityId`(그 종목에 이어진 것), `decisionId`(그 결정에 이어진 것), `ticker`(대소문자를 무시하고 같은 것), `page`, `size`. 조건을 여럿 주면 모두 맞는 것이다. 체결 시각이 늦은 순서, 같으면 `id` 순서. 응답 `Page<TradeView>` |
| DELETE | `/api/me/trades/{id}` | 지운다. 응답 `204`. 내 체결이 아니거나 없으면 `404 NOT_FOUND` |

`TradeView`

```json
{
  "id": "uuid",
  "broker": "TOSS",
  "externalId": "20261024-000123",
  "side": "BUY",
  "market": "US",
  "ticker": "FLNC",
  "name": "Fluence Energy",
  "quantity": 10.0,
  "price": 12.3,
  "currency": "USD",
  "amount": 123.0,
  "fee": 0.12,
  "executedAt": "2026-10-24T14:31:05Z",
  "createdAt": "2026-10-25T03:15:00.123456Z",
  "createdVia": "AGENT",
  "security": { "id": "uuid", "type": "Security", "label": "Fluence Energy 보통주", "archived": false },
  "decisions": [{ "id": "uuid", "type": "Decision", "label": "FLNC 첫 매수", "archived": false }]
}
```

- `name`, `fee` 는 없으면 `null` 이다. `security` 는 이어진 종목이 없으면 `null` 이다.
- `security`, `decisions` 는 보관된 것도 담고 `archived` 로 표시한다. `decisions` 는 이은 순서다.
- `securityId`, `decisionId` 에 없는 id 를 주면 빈 목록이다.

## 제안

에이전트가 올린 해석(투자 결정 만들기, 관계 잇기, 체결과 결정 잇기, 공부 메모)을 사람이 보고 승인하거나 거절한다. 제안은 올린 연동 토큰의 주인만 본다. 모든 역할이 부르고 쓰기는 CSRF 토큰이 필요하다. 저장 모델은 [데이터 스키마](data-schema.md) 의 「제안」, 결정은 [ADR-013](adr/013-owner-trades-and-agent-proposals.md) 이다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/me/proposals` | 내 제안. 쿼리: `status`(`PENDING`, `ACCEPTED`, `REJECTED` 가운데 하나. 없으면 전체), `page`, `size`. 대기는 오래된 것부터, 그 밖은 결정한 시각이 늦은 것부터. 전체면 대기를 앞에 둔다. 응답 `Page<ProposalView>` |
| GET | `/api/me/proposals/summary` | 대기 수. 응답 `{"pending": 3}`. 머리글의 배지가 쓴다 |
| POST | `/api/me/proposals/{id}/accept` | 승인. 본문 `{"payload"}`. `payload` 는 선택이고, 있으면 고친 내용으로 바꿔 실행한다. 응답 `ProposalView`(`ACCEPTED`) |
| POST | `/api/me/proposals/{id}/reject` | 거절. 본문 `{"reason"}`. `reason` 은 선택이고 1000자까지. 응답 `ProposalView`(`REJECTED`) |

- `status` 가 세 값 밖이면 `400 VALIDATION_FAILED` 다.
- 내 제안이 아니거나 없으면 `404 NOT_FOUND` 다. 대기가 아니면 `409 PROPOSAL_NOT_PENDING`(`details.status`)이다.
- `CREATE_NODE`, `CREATE_RELATIONSHIP` 은 공유 지식을 만든다. 승인하는 사람의 역할이 `EDITOR` 이상이 아니면 `403 FORBIDDEN` 이다. 거절은 모든 역할이 한다.
- 승인은 「제안 내용」 의 종류별 실행을 한 트랜잭션에서 하고 상태를 `ACCEPTED` 로 바꾼다. 실행이 실패하면 그 오류(`400 ONTOLOGY_VIOLATION`, `404 NOT_FOUND`, `409 DUPLICATE`, `409 ARCHIVED` 등)로 답하고 아무것도 바꾸지 않는다. 제안은 `PENDING` 으로 남고 `lastError` 에 그 오류가 남는다.
- 고친 `payload` 는 그 종류의 모양과 규칙으로 다시 검사한다. 종류는 바꿀 수 없다.
- 승인으로 만든 노드와 관계는 지금처럼 변경 이력에 남는다. 작업자는 승인한 사람이고 `note` 는 「에이전트 제안을 승인했다」 다. 제안 자체의 승인과 거절은 이력에 남지 않는다.

`ProposalView`

```json
{
  "id": "uuid",
  "kind": "CREATE_NODE",
  "status": "PENDING",
  "payload": { "type": "Decision", "properties": { "title": "FLNC 추가 매수", "action": "ADD", "decidedAt": "2026-10-24" }, "links": [{ "type": "HAS_DECISION", "fromId": "uuid" }], "tradeIds": ["uuid"] },
  "rationale": "10월 24일 FLNC 10주 매수 체결이 있고, 같은 날의 결정이 없다.",
  "evidence": { "nodeIds": ["uuid"], "tradeIds": ["uuid"], "urls": ["https://example.com/news"] },
  "createdAt": "2026-10-25T03:15:00.123456Z",
  "createdVia": "AGENT",
  "token": { "id": "uuid", "name": "Hermes" },
  "decidedAt": null,
  "decisionNote": null,
  "result": null,
  "lastError": null,
  "requiresEditor": true,
  "refs": {
    "nodes": { "uuid": { "id": "uuid", "type": "Security", "label": "Fluence Energy 보통주", "archived": false } },
    "trades": { "uuid": "TradeView" }
  }
}
```

| 필드 | 뜻 |
| --- | --- |
| `payload` | 종류별 내용. 「제안 내용」 의 모양이다. 승인할 때 고쳤으면 고친 값이다 |
| `evidence` | 에이전트가 붙인 근거 참조. 셋 다 빈 배열일 수 있다 |
| `token` | 올린 연동 토큰의 `id` 와 그때의 이름. 토큰을 폐기해도 남는다 |
| `result` | 승인으로 생긴 것 `{"nodeIds", "relationshipIds", "tradeIds"}`. 승인 전과 거절은 `null` 이다. 이해 표시는 `nodeIds` 에 그 항목을 담는다 |
| `lastError` | 마지막 승인 실패 `{"code", "message", "at"}`. 없으면 `null`. 승인에 성공하면 지운다 |
| `requiresEditor` | `CREATE_NODE`, `CREATE_RELATIONSHIP` 이면 `true` 다. 화면은 열람자에게 승인 단추를 끈다 |
| `refs` | `payload`, `evidence`, `result` 가 가리키는 노드와 체결을 지금 값으로 담은 맵. 찾지 못한 id 는 빠진다. 노드는 보관된 것도 담는다. 체결은 내 체결만 담는다 |

### 제안 내용

`payload` 는 종류마다 아래 모양이다. 에이전트가 올릴 때(`POST /api/v1/proposals`)와 사람이 고쳐 승인할 때 같은 규칙으로 검사한다.

| `kind` | `payload` | 승인할 때 하는 일 |
| --- | --- | --- |
| `CREATE_NODE` | `{"type", "properties", "links", "tradeIds"}` | `POST /api/nodes` 와 같이 노드를 만들고, `links` 마다 `POST /api/relationships` 와 같이 새 노드와 잇는다. `tradeIds` 의 체결을 새 노드에 `EXECUTES` 로 잇는다 |
| `CREATE_RELATIONSHIP` | `{"type", "fromId", "toId"}` | `POST /api/relationships` 와 같다 |
| `LINK_TRADE_DECISION` | `{"tradeIds", "decisionId"}` | 체결마다 결정과 `EXECUTES` 로 잇는다. 이미 이어져 있으면 그대로 둔다 |
| `STUDY_NOTE` | `{"nodeId", "level", "note"}` | `PUT /api/me/knowledge/{nodeId}` 와 같이 승인한 사람의 이해 표시를 쓴다 |

- `CREATE_NODE`: `type` 과 `properties` 는 `POST /api/nodes` 의 규칙(온톨로지 검증, `managedBy` 가 있는 타입 거절, 같은 시장과 종목 코드의 Security 거절)과 같다. `links` 는 선택이고 10개까지다. 항목은 `{"type", "fromId"}` 나 `{"type", "toId"}` 하나다. `fromId` 를 주면 그 노드에서 새 노드로, `toId` 를 주면 새 노드에서 그 노드로 잇는다. 둘 다 주거나 둘 다 없으면 `400 VALIDATION_FAILED` 다. `tradeIds` 는 선택이고 50개까지이며 `type` 이 `Decision` 일 때만 받는다.
- `CREATE_RELATIONSHIP`: 관계 API 의 규칙(온톨로지의 관계 종류와 양 끝 타입, 보관된 끝 거절, 같은 활성 관계 거절)과 같다.
- `LINK_TRADE_DECISION`: `tradeIds` 는 1개 이상 50개 이하의 내 체결이다. `decisionId` 는 타입이 `Decision` 인 보관되지 않은 노드다. 타입이 다르면 `400 ONTOLOGY_VIOLATION`(`details.rule = "decision-type"`), 보관됐으면 `409 ARCHIVED` 다.
- `STUDY_NOTE`: `level` 은 `KNOWN`, `UNSURE`, `LEARNING`, `note` 는 1000자까지다. 「내 이해 표시」 와 같다.
- 가리키는 노드가 없으면 `404 NOT_FOUND`, 내 체결이 아니거나 없으면 `404 NOT_FOUND` 다. 올릴 때 한 번, 승인할 때 다시 확인한다. 그 사이 노드가 보관되거나 온톨로지가 바뀌면 승인이 실패한다.

## 에이전트 API(`/api/v1`)

외부 에이전트가 워크벤치를 조회하고 체결과 제안을 쓰는 API 다. fos-assistant 의 Hermes 커넥터는 이 절만 읽고 구현한다. 결정과 근거는 [ADR-012](adr/012-agent-integration-token.md) 와 [ADR-013](adr/013-owner-trades-and-agent-proposals.md) 이다.
이 절이 쓰는 노드 타입과 관계는 [데이터 스키마](data-schema.md) 의 「노드」, 「관계」, 「투자 온톨로지」 가 소유한다. 이 절의 응답 필드는 화면용 응답(`NodeView` 등)과 따로 유지한다.

### 인증

- 모든 요청에 `Authorization: Bearer <연동 토큰>` 을 담는다. 토큰은 사용자가 웹의 더보기 메뉴 「연동 토큰」 에서 발급한다(「연동 토큰」).
- 세션 쿠키는 읽지 않고, CSRF 토큰도 요구하지 않는다. 쿠키만 담은 요청은 `401` 이다.
- 토큰은 발급한 사용자로 인증된다. 조회 경로는 모든 역할과 범위가 부른다. 쓰기 경로는 「조회와 기록」 범위의 토큰만 부른다(「쓰기」).
- 아래 가운데 하나면 `401 UNAUTHENTICATED`(「연동 토큰이 없거나 올바르지 않습니다.」)다. 어느 경우인지는 응답에 드러내지 않는다.
  - `Authorization` 헤더가 없거나 `Bearer ` 로 시작하지 않는다.
  - 토큰이 `fwb_` 로 시작하는 47자가 아니다.
  - 그런 토큰이 없거나 폐기됐다.
  - 토큰 주인이 비활성화됐거나 허용 목록에서 빠졌다.
- 연동 토큰은 `/api/v1` 밖의 경로(`/api/nodes` 등)에서 받지 않는다. 그 경로에 토큰만 담아 부르면 세션이 없으므로 `401` 이다.

### 공통 규칙

- 메서드는 `GET` 과, 「쓰기」 의 두 `POST` 만 있다. 있는 경로에 다른 메서드를 쓰면 `405 METHOD_NOT_ALLOWED`, 없는 경로는 `404 NOT_FOUND` 다.
- 오류 본문은 이 문서의 「오류 형식」 과 같은 `{code, message, details}` 다.
- 시각과 날짜 형식은 문서 첫머리의 규칙과 같다. 응답의 `X-Ontology-Version` 헤더는 다른 `/api` 응답과 같다.
- 보관한 노드와 관계는 모든 응답에서 빠진다. 보관한 노드의 상세, 근거 따라가기, 주변 그래프는 `404 NOT_FOUND` 다.
- `typeLabel`, `label`, `valueLabel`, 관계와 주장의 `label` 은 지금 온톨로지의 표시 이름이다. 표시 이름이 없으면 키를 그대로 담는다.
- 관계 문장(`sentence`)은 관계 종류의 문장 틀(온톨로지 `sentence`)의 `{from}`, `{to}` 를 두 끝의 이름으로 바꾼 것이다. 조사는 고르지 않고 틀의 「은(는)」 같은 표기를 그대로 둔다. 틀이 없으면 `{from} -[{관계 표시 이름}]-> {to}` 다.
- 응답에 사용자 이메일은 담지 않는다. 사람은 표시 이름으로만 나온다.

### 요청 한도와 응답 크기

| 항목 | 상한 | 넘으면 |
| --- | --- | --- |
| 토큰 하나의 요청 수 | 1분에 60번. 그 토큰의 첫 요청부터 60초 단위로 센다. 인증에 실패한 요청은 세지 않는다 | `429 RATE_LIMITED`, `Retry-After` 헤더(초), `details.retryAfterSeconds` |
| 토큰 하나의 쓰기 요청 수 | 1분에 10번. 위 60번과 따로 세고, 쓰기 요청은 둘 다에 센다 | 위와 같다 |
| 한 요청의 체결, 제안 | 50건, 20건 | `400 VALIDATION_FAILED` |
| 검색어 `q` | 100자 | `400 VALIDATION_FAILED` |
| 페이지 크기 `size` | 기본 20, 최대 50 | `400 VALIDATION_FAILED` |
| 노드 상세의 `relations`, `claims`, `documents`, `concepts` | 100개, 20개, 20개, 20개 | 잘라 내고 `relationsTruncated`, `claimsTruncated` 를 `true` 로 둔다. `documents`, `concepts` 는 앞에서부터 담는다 |
| 상세 밖에 끼워 넣은 긴 글(주장의 `description`, `evidenceText`, 결정의 `reason`, 시나리오의 `assumptions`) | 500자 | 500자에서 자르고 끝에 `…` 를 붙인다. 전체는 그 항목의 상세(`GET /api/v1/nodes/{id}`)로 읽는다 |
| 근거 따라가기 | 깊이 6, 단계 60개, 아래쪽 항목 50개, 후보 5개 | 「근거 따라가기」 와 같다 |
| 주변 그래프 | 홉 2, 노드 150개, 관계 300개 | `hops` 가 1, 2 밖이면 `400`. 노드와 관계는 잘라 내고 `truncated` 를 `true` 로 둔다 |
| 종목 찾기 | 맞는 종목 10개, 종목마다 결정 20개, 밸류에이션 10개, 밸류에이션마다 시나리오 10개 | 잘라 내고 `...Truncated` 를 `true` 로 둔다 |

요청 한도는 API 프로세스 메모리에 있어 API 를 다시 시작하면 처음부터 센다.

### 공통 표현

`V1NodeRef`

```json
{ "id": "uuid", "type": "Decision", "typeLabel": "투자 결정", "label": "FLNC 첫 매수" }
```

`V1Document`

```json
{ "id": "uuid", "title": "Fluence 2025 10-K", "url": "https://example.com/10k", "publisher": "Fluence Energy", "documentType": "FILING", "publishedAt": "2025-11-25", "collectedAt": "2026-10-24T03:00:00Z" }
```

`publisher`, `documentType`, `publishedAt` 은 없으면 `null` 이다.

`V1Concept`

```json
{ "id": "uuid", "label": "DCF", "summary": "앞으로 벌어들일 현금흐름을 할인율로 지금 가치로 바꿔 더하는 기업 가치 평가 방법" }
```

`V1Claim`

```json
{
  "id": "uuid",
  "label": "Fluence Energy → 에너지 저장(ESS) 속한다",
  "predicate": "BELONGS_TO_SECTOR",
  "predicateLabel": "속한다",
  "reviewStatus": "REVIEWED",
  "subject": "V1NodeRef 또는 null",
  "object": "V1NodeRef 또는 null",
  "description": "Fluence 는 에너지 저장 시스템을 만든다.",
  "evidenceText": "Fluence is a global market leader in energy storage products…",
  "validFrom": null,
  "validTo": null,
  "documents": ["V1Document"]
}
```

- `reviewStatus` 는 `DRAFT`(검토 전), `REVIEWED`(검토 완료), `REJECTED`(반려)다. 근거로 쓸 때는 `REVIEWED` 를 앞에 둔다.
- `subject`, `object` 가 보관됐거나 없으면 `null` 이다. `documents` 는 보관하지 않은 근거 문서다.

### 경로

| 경로 | 쿼리 | 응답 |
| --- | --- | --- |
| `/api/v1/me` | 없음 | `V1Me`. 연결 확인용 |
| `/api/v1/ontology` | 없음 | `V1Ontology` |
| `/api/v1/nodes` | `q`, `types`, `page`, `size` | `Page<V1NodeSummary>` |
| `/api/v1/nodes/{id}` | 없음 | `V1NodeDetail` |
| `/api/v1/nodes/{id}/trace` | 없음 | `V1Trace` |
| `/api/v1/graph/neighborhood` | `id`(필수), `hops`(기본 1) | `V1Graph` |
| `/api/v1/securities/lookup` | `ticker`(필수), `market` | `V1SecurityLookup` |
| `/api/v1/me/knowledge` | `level`, `page`, `size` | `Page<V1StudyItem>` |
| `/api/v1/trades` | `ticker`, `from`, `to`, `page`, `size` | `Page<V1Trade>`(「쓰기」) |
| `/api/v1/proposals` | `status`, `page`, `size` | `Page<V1Proposal>`(「쓰기」) |

`Page` 는 이 문서의 「페이지네이션」 과 같은 모양이다.

#### `GET /api/v1/me`

```json
{ "user": { "id": "uuid", "displayName": "Alice", "role": "EDITOR" }, "token": { "id": "uuid", "name": "Hermes", "last4": "x9Qa", "scope": "READ_WRITE" }, "rateLimitPerMinute": 60, "writeRateLimitPerMinute": 10 }
```

토큰을 넣은 뒤 연결이 되는지 확인할 때 부른다. `token.scope` 가 `READ` 면 쓰기 경로를 부르지 않는다.

#### `GET /api/v1/ontology`

지금 온톨로지에서 에이전트가 타입과 관계를 고르는 데 필요한 것만 담는다. 화면용 값(색, 모양, 만들기 폼 정보, 예전 값 별칭)은 담지 않는다.

```json
{
  "version": 7,
  "nodeTypes": [
    {
      "key": "Decision", "label": "투자 결정", "description": "종목에 대해 내린 투자 행동의 기록이다.", "labelProperty": "title",
      "properties": [
        { "key": "action", "label": "행동", "type": "enum", "required": true, "description": "…", "values": [{ "value": "WATCH", "label": "관심 등록" }, { "value": "BUY", "label": "매수" }] },
        { "key": "decidedAt", "label": "결정일", "type": "date", "required": false, "description": "모르면 비워 둔다", "values": null }
      ]
    }
  ],
  "relationshipTypes": [
    { "key": "HAS_DECISION", "label": "결정", "description": "종목에 투자 결정이 있다.", "from": ["Security"], "to": ["Decision"], "sentence": "{to}은(는) {from}에 대한 결정이다" }
  ],
  "claimPredicates": [
    { "key": "BELONGS_TO_SECTOR", "label": "속한다", "description": "…", "subjectTypes": ["Company", "Security"], "objectTypes": ["Sector"], "sentence": "{subject}이(가) {object}에 속한다" }
  ]
}
```

- 순서는 온톨로지 정의의 순서다. `type` 은 `string`, `text`, `url`, `enum`, `date`, `datetime`, `number`, `integer`, `boolean` 가운데 하나다.
- `values` 는 `enum` 일 때만 있고 그 밖에는 `null` 이다. `sentence` 는 틀이 없으면 `null` 이다.

#### `GET /api/v1/nodes`

보관하지 않은 노드를 검색한다. 검색 규칙은 「노드」 의 `GET /api/nodes` 와 같다(`q` 는 이름, Security 의 `ticker`, 그 타입의 `searchProperties` 에서 대소문자를 무시하고 부분 일치, 이름 오름차순).

| 쿼리 | 기본값 | 설명 |
| --- | --- | --- |
| `q` | 전체 | 100자까지 |
| `types` | 전체 | 쉼표로 구분한 타입 키. 예: `Decision,Valuation` |
| `page`, `size` | 0, 20 | `size` 는 50까지 |

`V1NodeSummary`

```json
{ "id": "uuid", "type": "Decision", "typeLabel": "투자 결정", "label": "FLNC 첫 매수", "reviewStatus": null, "revision": 3, "updatedAt": "2026-10-24T03:15:00.123456Z" }
```

`reviewStatus` 는 주장(Claim)일 때만 값이 있다. 속성은 담지 않으므로 상세로 읽는다.

#### `GET /api/v1/nodes/{id}`

```json
{
  "node": {
    "id": "uuid", "type": "Decision", "typeLabel": "투자 결정", "label": "FLNC 첫 매수", "revision": 3,
    "createdAt": "…", "createdBy": "Alice", "updatedAt": "…", "updatedBy": "Alice"
  },
  "properties": [
    { "key": "action", "label": "행동", "type": "enum", "value": "BUY", "valueLabel": "매수" },
    { "key": "decidedAt", "label": "결정일", "type": "date", "value": "2026-09-14", "valueLabel": null }
  ],
  "relations": [
    {
      "relationshipId": "uuid", "type": "HAS_DECISION", "label": "결정", "direction": "IN",
      "sentence": "FLNC 첫 매수은(는) Fluence Energy 보통주에 대한 결정이다",
      "other": { "id": "uuid", "type": "Security", "typeLabel": "종목", "label": "Fluence Energy 보통주" }
    }
  ],
  "claim": null,
  "claims": ["V1Claim"],
  "documents": ["V1Document"],
  "concepts": ["V1Concept"],
  "relationsTruncated": false,
  "claimsTruncated": false
}
```

| 필드 | 뜻 |
| --- | --- |
| `node.createdBy`, `node.updatedBy` | 사용자의 표시 이름. 서버가 만든 항목(초기 데이터 등)이나 찾지 못한 사용자는 `null` 이다 |
| `properties` | 온톨로지에 정의된 속성 가운데 값이 있는 것. 정의 순서다. 글을 자르지 않는다. `valueLabel` 은 `enum` 값의 표시 이름이고 그 밖에는 `null` 이다. 정의에서 빠진 타입의 노드는 저장된 값을 모두 담고 `label` 은 키, `type` 은 `null` 이다 |
| `relations` | 이 노드에 걸린 보관하지 않은 일반 관계(온톨로지 `relationshipTypes`). 상대 노드가 보관됐으면 뺀다. `direction` 은 이 노드가 시작이면 `OUT`, 끝이면 `IN` 이다. 만든 순서로 100개까지 |
| `claim` | 이 노드가 주장(Claim)이면 그 주장의 `V1Claim`, 아니면 `null` |
| `claims` | 이 노드가 주체, 대상, 근거 문서인 보관하지 않은 주장. 만든 순서로 20개까지. 글은 500자에서 자른다 |
| `documents` | 근거 관계(끝 타입에 Document 가 있는 관계, 예: `EVIDENCED_BY`)로 이어진 보관하지 않은 근거 문서. 20개까지 |
| `concepts` | 이 노드에서 개념으로 나가는 관계의 끝. 노드 상세의 `concepts` 와 같은 규칙으로 20개까지 |

#### `GET /api/v1/nodes/{id}/trace`

「근거 따라가기」 의 결과를 에이전트용으로 옮긴다. 따라가는 규칙, 한도, 상태 판정은 그 절과 같다.

```json
{
  "root": "V1NodeRef",
  "steps": [
    {
      "node": "V1NodeRef",
      "depth": 1,
      "via": { "relationshipId": "uuid", "relationshipType": "HAS_DECISION", "childId": "uuid", "sentence": "FLNC 첫 매수은(는) Fluence Energy 보통주에 대한 결정이다" },
      "status": "SUPPORTED",
      "documents": ["V1Document"],
      "claims": [{ "id": "uuid", "label": "Fluence Energy → 에너지 저장(ESS) 속한다", "predicate": "BELONGS_TO_SECTOR", "reviewStatus": "REVIEWED" }],
      "concepts": ["V1Concept"],
      "missing": [{ "relationshipType": "BASED_ON", "label": "결정의 근거", "candidates": ["V1NodeRef"] }],
      "myKnowledge": { "level": "UNSURE", "note": "왜 이 가정이 낙관인지 모르겠다", "updatedAt": "2026-10-25T03:15:00.123456Z" }
    }
  ],
  "dependents": [{ "node": "V1NodeRef", "relationshipType": "HAS_DECISION", "sentence": "…" }],
  "truncated": false,
  "dependentsTruncated": false
}
```

- 첫 단계가 지금 항목(`depth = 0`)이고 `via` 는 `null` 이다. 다른 단계의 `via` 는 이 단계에서 한 단계 아래(지금 항목 쪽, `childId`)로 가는 관계다.
- `status` 는 `SUPPORTED`(근거 문서가 있거나 검토 완료 주장이 있다), `PARTIAL`(근거 문서 없이 검토 전 주장만 있다), `MISSING`(둘 다 없다)다.
- `missing` 은 아직 잇지 않은 관계 종류와 이을 만한 후보다. 「근거 따라가기」 의 `missing` 과 같다.
- `myKnowledge` 는 토큰 주인의 이해 표시다. 없으면 `null` 이다. 다른 사람의 표시는 담지 않는다.

#### `GET /api/v1/graph/neighborhood`

```json
{
  "center": "V1NodeRef",
  "hops": 1,
  "nodes": [{ "id": "uuid", "type": "Company", "typeLabel": "기업", "label": "Fluence Energy", "reviewStatus": null }],
  "edges": [{ "id": "uuid", "type": "ISSUES", "from": "uuid", "to": "uuid", "sentence": "Fluence Energy이(가) Fluence Energy 보통주을(를) 발행한다" }],
  "truncated": false
}
```

- 규칙과 한도는 「주변 그래프」 와 같다. 타입과 검토 상태 필터는 없다.
- `nodes` 는 중심을 포함한다. 주장(Claim)은 노드로 담고 `reviewStatus` 가 있다. 주장 관계(`SUBJECT`, `OBJECT`, `SUPPORTED_BY`) 선의 `sentence` 는 `null` 이다.

#### `GET /api/v1/securities/lookup`

시장과 종목 코드로 종목을 찾고, 그 종목에 걸린 투자 결정과 발행 기업의 밸류에이션을 함께 준다. 토스증권 커넥터의 종목 코드를 그대로 넣는다.

| 쿼리 | 설명 |
| --- | --- |
| `ticker` | 필수. 국내 6자리 종목 코드(`005930`, `0101N0`)나 미국 티커(`FLNC`, `BRK.B`). 앞뒤 공백을 지우고 대소문자를 무시해 저장된 `ticker` 와 같은지 본다. 32자까지 |
| `market` | 선택. 없으면 모든 시장에서 찾는다. 아래 값만 받고 대소문자를 무시한다. 그 밖이면 `400 VALIDATION_FAILED`(`details.fieldErrors.market`) |

| `market` | 찾는 워크벤치 시장 |
| --- | --- |
| `KR` | `KRX_KOSPI`, `KRX_KOSDAQ`, `OTHER` |
| `US` | `NASDAQ`, `NYSE`, `OTHER` |
| `KOSPI`, `KOSDAQ`, `NASDAQ`, `NYSE` | 각각 `KRX_KOSPI`, `KRX_KOSDAQ`, `NASDAQ`, `NYSE` |
| `AMEX`, `KR_ETC`, `US_ETC` | `OTHER` |
| `KRX_KOSPI`, `KRX_KOSDAQ`, `OTHER` | 그 값 그대로 |

```json
{
  "market": "US",
  "ticker": "FLNC",
  "matches": [
    {
      "security": { "id": "uuid", "type": "Security", "typeLabel": "종목", "label": "Fluence Energy 보통주", "market": "NASDAQ", "marketLabel": "나스닥", "ticker": "FLNC", "currency": "USD" },
      "issuer": "V1NodeRef 또는 null",
      "decisions": [
        { "node": "V1NodeRef", "action": "BUY", "actionLabel": "매수", "decidedAt": "2026-09-14", "reason": "…", "basedOn": ["V1NodeRef"] }
      ],
      "valuations": [
        {
          "node": "V1NodeRef", "asOf": "2026-09-14", "currentPrice": 12.3, "currency": "USD", "method": "DCF",
          "scenarios": [{ "node": "V1NodeRef", "kind": "BEAR", "valuePerShare": 8.0, "assumptions": "…" }],
          "scenariosTruncated": false
        }
      ],
      "decisionsTruncated": false,
      "valuationsTruncated": false
    }
  ],
  "matchesTruncated": false
}
```

- 맞는 종목이 없으면 `matches` 가 빈 배열인 `200` 이다. `market` 은 받은 값을 대문자로 바꿔 돌려주고, 없었으면 `null` 이다.
- `issuer` 는 `ISSUES` 로 이 종목을 발행한 보관하지 않은 기업이다. 여럿이면 먼저 이은 하나다.
- `decisions` 는 `HAS_DECISION` 으로 이 종목에 걸린 결정이다. `decidedAt` 이 늦은 순서이고 `decidedAt` 이 없으면 뒤에 둔다. `basedOn` 은 `BASED_ON` 으로 그 결정에 이어진 밸류에이션이다.
- `valuations` 는 발행 기업에 `HAS_VALUATION` 으로 이어진 밸류에이션이다. `asOf` 가 늦은 순서이고 없으면 뒤에 둔다. `scenarios` 는 `HAS_SCENARIO` 로 이어진 시나리오다. 비관(`BEAR`), 기준(`BASE`), 낙관(`BULL`) 순서다.
- 같은 순서 안에서는 만든 시각, 그다음 `id` 로 순서를 고정한다. 값이 없는 속성은 `null` 이다.

#### `GET /api/v1/me/knowledge`

토큰 주인의 공부 목록이다. 규칙은 「내 이해 표시」 의 `GET /api/me/knowledge` 와 같고, 보관한 항목의 표시는 뺀다.

| 쿼리 | 기본값 | 설명 |
| --- | --- | --- |
| `level` | 전체 | 쉼표로 구분한 `KNOWN`, `UNSURE`, `LEARNING`. 그 밖이면 `400 VALIDATION_FAILED` |
| `page`, `size` | 0, 20 | `size` 는 50까지 |

`V1StudyItem`

```json
{
  "node": "V1NodeRef",
  "level": "UNSURE",
  "note": "계통 접속이 왜 막히는지 모르겠다",
  "updatedAt": "2026-10-25T03:15:00.123456Z",
  "contexts": [{ "decision": "V1NodeRef", "depth": 4 }],
  "documents": ["V1Document"],
  "concepts": ["V1Concept"]
}
```

### 쓰기

에이전트가 체결 사실을 넣고 해석을 제안으로 올리는 경로다. 체결은 바로 저장하고, 해석은 사람이 웹의 「제안」 에서 승인해야 공유 지식이나 이해 표시가 바뀐다. 결정과 근거는 [ADR-013](adr/013-owner-trades-and-agent-proposals.md) 이다.

- 쓰기(`POST`)는 「조회와 기록」 범위(`scope = READ_WRITE`)로 발급한 토큰만 한다. 「조회만」 토큰이면 `403 INSUFFICIENT_SCOPE`(「이 토큰은 조회만 할 수 있습니다. 「조회와 기록」 토큰을 새로 발급하세요.」)다. 범위는 `GET /api/v1/me` 의 `token.scope` 로 확인한다. 범위 확인은 본문 검사보다 먼저다. 다만 JSON 으로 읽을 수 없는 본문은 범위와 상관없이 `400 VALIDATION_FAILED` 다.
- 두 `GET`(`/api/v1/trades`, `/api/v1/proposals`)은 모든 범위가 부른다.
- 토큰 주인의 역할과 상관없이 쓴다. 열람자의 토큰도 체결을 넣고 제안을 올린다. 공유 지식을 만드는 제안의 승인만 편집 권한이 필요하다(「제안」).
- 한 요청은 전부 저장되거나 전부 거절된다. 항목 하나라도 틀리면 아무것도 저장하지 않고 오류로 답한다. `details.fieldErrors` 의 키는 `trades[2].quantity`, `proposals[0].payload.type` 처럼 몇 번째 항목의 어느 칸인지 담는다. 온톨로지 위반은 `400 ONTOLOGY_VIOLATION` 에 `details.index`(몇 번째 항목)를 더한다. 가리키는 노드나 체결이 없으면 `404 NOT_FOUND` 에 `details.index` 를 더한다.
- 같은 요청을 다시 보내도 된다. 체결은 `(broker, externalId)`, 제안은 `dedupeKey` 로 이미 있는 것을 찾아 새로 만들지 않고 돌려준다. 응답은 항목마다 `created` 나 `existing` 이다.
- 요청 본문은 64KiB 까지다(`413 PAYLOAD_TOO_LARGE`). 쓰기 경로는 토큰마다 1분에 10번까지다(`429 RATE_LIMITED`). 이 요청도 1분 60번 한도에 함께 센다.

| 메서드 | 경로 | 본문이나 쿼리 | 응답 |
| --- | --- | --- | --- |
| POST | `/api/v1/trades` | `{"trades": [V1TradeInput]}`. 1개 이상 50개 이하 | `200 {"results": [V1TradeResult]}` |
| GET | `/api/v1/trades` | `ticker`, `from`, `to`, `page`, `size` | `Page<V1Trade>` |
| POST | `/api/v1/proposals` | `{"proposals": [V1ProposalInput]}`. 1개 이상 20개 이하 | `200 {"results": [V1ProposalResult]}` |
| GET | `/api/v1/proposals` | `status`, `page`, `size` | `Page<V1Proposal>` |

#### `POST /api/v1/trades`

```json
{
  "trades": [
    {
      "broker": "TOSS",
      "externalId": "20261024-000123",
      "side": "BUY",
      "market": "US",
      "ticker": "FLNC",
      "name": "Fluence Energy",
      "quantity": 10,
      "price": 12.3,
      "currency": "USD",
      "amount": 123.0,
      "fee": 0.12,
      "executedAt": "2026-10-24T23:31:05+09:00"
    }
  ]
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `broker` | 예 | `TOSS`, `OTHER` |
| `externalId` | 예 | 증권사의 체결 식별자. 앞뒤 공백을 지운 1자 이상 100자 이하. 체결 식별자가 없으면 주문 식별자를 넣는다. 같은 `broker` 안에서 같은 체결이면 늘 같은 값이어야 한다 |
| `side` | 예 | `BUY`, `SELL` |
| `market` | 예 | 「종목 찾기」 의 `market` 이 받는 값(`KR`, `US`, `KOSPI`, `KOSDAQ`, `NASDAQ`, `NYSE`, `AMEX`, `KR_ETC`, `US_ETC`, `KRX_KOSPI`, `KRX_KOSDAQ`, `OTHER`). 대소문자를 무시한다 |
| `ticker` | 예 | 1자 이상 32자 이하. 앞뒤 공백을 지우고 대문자로 저장한다 |
| `name` | 아니오 | 100자까지 |
| `quantity` | 예 | 0 보다 큰 수. 소수를 받는다 |
| `price`, `amount` | 예 | 0 이상의 수 |
| `currency` | 예 | 영문 세 자리. 대문자로 저장한다 |
| `fee` | 아니오 | 0 이상의 수. 수수료와 세금을 더한 값 |
| `executedAt` | 예 | 오프셋이 붙은 ISO-8601 시각. UTC 초까지로 바꿔 저장한다 |

- 이 표 밖의 필드(계좌 번호 등)가 있으면 `400 VALIDATION_FAILED` 다. 계좌 정보는 보내지 않는다.
- 저장할 때 `market` 과 `ticker` 로 「종목 찾기」 와 같은 규칙으로 보관되지 않은 종목을 찾아 잇는다. 여럿이면 먼저 만든 것이다. 없으면 잇지 않고 저장하고 `security` 가 `null` 이다. 종목을 만들고 싶으면 `CREATE_NODE` 제안을 올린다. 같은 체결을 다시 보내면 그때 다시 찾는다.
- 이미 있는 체결은 저장된 값을 고치지 않는다. 보낸 값이 달라도 저장된 값을 돌려준다.

`V1TradeResult`

```json
{ "index": 0, "status": "created", "trade": "V1Trade" }
```

`status` 는 `created`(새로 저장) 또는 `existing`(이미 있음)이다. 같은 요청 안에서 같은 체결이 두 번 나오면 뒤의 것은 `existing` 이다.

`V1Trade`

```json
{
  "id": "uuid", "broker": "TOSS", "externalId": "20261024-000123", "side": "BUY", "market": "US", "ticker": "FLNC", "name": "Fluence Energy",
  "quantity": 10.0, "price": 12.3, "currency": "USD", "amount": 123.0, "fee": 0.12,
  "executedAt": "2026-10-24T14:31:05Z", "createdAt": "2026-10-25T03:15:00.123456Z",
  "security": "V1NodeRef 또는 null",
  "decisions": ["V1NodeRef"]
}
```

`security` 와 `decisions` 에서 보관된 노드는 뺀다. `decisions` 는 사람이 승인한 제안으로 이어진 투자 결정이다.

#### `GET /api/v1/trades`

토큰 주인의 체결이다. 체결 시각이 늦은 순서, 같으면 `id` 순서다.

| 쿼리 | 기본값 | 설명 |
| --- | --- | --- |
| `ticker` | 전체 | 대소문자를 무시하고 같은 것. 32자까지 |
| `from`, `to` | 없음 | 오프셋이 붙은 ISO-8601 시각. `from` 이상, `to` 미만의 체결 시각이다. 형식이 틀리면 `400 VALIDATION_FAILED`(`details.fieldErrors.from`) |
| `page`, `size` | 0, 20 | `size` 는 50까지 |

#### `POST /api/v1/proposals`

```json
{
  "proposals": [
    {
      "kind": "LINK_TRADE_DECISION",
      "payload": { "tradeIds": ["uuid"], "decisionId": "uuid" },
      "rationale": "10월 24일 FLNC 매수 체결은 같은 날 기록한 「FLNC 추가 매수」 결정을 실행한 것이다.",
      "evidence": { "nodeIds": ["uuid"], "tradeIds": ["uuid"], "urls": [] },
      "dedupeKey": "link:20261024-000123:uuid"
    }
  ]
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `kind` | 예 | `CREATE_NODE`, `CREATE_RELATIONSHIP`, `LINK_TRADE_DECISION`, `STUDY_NOTE` |
| `payload` | 예 | 「제안」 의 「제안 내용」 의 모양과 규칙 |
| `rationale` | 예 | 사람이 승인할지 판단할 까닭. 앞뒤 공백을 지운 1자 이상 2000자 이하 |
| `evidence` | 아니오 | `{"nodeIds", "tradeIds", "urls"}`. 각각 20개, 50개, 10개까지. `urls` 는 `http`, `https` 절대 주소 2000자까지. `nodeIds` 는 있는 노드, `tradeIds` 는 내 체결이어야 한다 |
| `dedupeKey` | 아니오 | 1자 이상 100자 이하. 같은 키로 다시 올리면 상태와 상관없이 있던 제안을 돌려준다. 이미 있는 제안은 `payload` 의 모양과 내용을 다시 검사하지 않고 돌려준다. 항목의 칸(`kind`, `payload` 가 있는지, `rationale`, `evidence`, `dedupeKey`)은 검사한다. 같은 해석을 매번 다시 올리는 에이전트는 키를 붙인다 |

- 올린 뒤 대기 중인 제안이 200개를 넘으면 아무것도 저장하지 않고 `409 PROPOSAL_LIMIT`(`details.max`, `details.pending`)이다. 이미 있는 제안(`existing`)은 세지 않는다.
- 같은 요청 안에서 같은 `dedupeKey` 가 두 번 나오면 뒤의 것은 `existing` 이다.
- 한 요청의 제안끼리는 서로 가리킬 수 없다. 만들 노드를 가리키는 관계는 `CREATE_NODE` 의 `links` 에 담는다.

`V1ProposalResult`

```json
{ "index": 0, "status": "created", "proposal": "V1Proposal" }
```

`V1Proposal`

```json
{
  "id": "uuid", "kind": "LINK_TRADE_DECISION", "status": "PENDING",
  "payload": { "tradeIds": ["uuid"], "decisionId": "uuid" },
  "rationale": "…", "evidence": { "nodeIds": ["uuid"], "tradeIds": ["uuid"], "urls": [] }, "dedupeKey": "link:20261024-000123:uuid",
  "createdAt": "2026-10-25T03:15:00.123456Z", "decidedAt": null, "decisionNote": null,
  "result": null, "lastError": null
}
```

필드의 뜻은 「제안」 의 `ProposalView` 와 같다. `refs`, `token`, `requiresEditor`, `createdVia` 는 담지 않고 `dedupeKey` 를 더 담는다. 결과의 노드는 `GET /api/v1/nodes/{id}` 로 읽는다.

#### `GET /api/v1/proposals`

토큰 주인의 제안이다. 규칙은 「제안」 의 `GET /api/me/proposals` 와 같다. 에이전트는 이것으로 사람이 승인했는지, 거절했다면 왜인지 읽고 같은 제안을 다시 올리지 않는다.

| 쿼리 | 기본값 | 설명 |
| --- | --- | --- |
| `status` | 전체 | `PENDING`, `ACCEPTED`, `REJECTED` 가운데 하나 |
| `page`, `size` | 0, 20 | `size` 는 50까지 |

## 후속 도구가 쓸 필드

FOS 의 `search_financial_knowledge`, `get_company_context`, `get_evidence` 는 이 API 의 조회 응답을 그대로 쓸 수 있게 했다.

| 도구 | 쓸 API | 기대는 필드 |
| --- | --- | --- |
| `search_financial_knowledge` | `GET /api/nodes`, `GET /api/claims` | `id`, `type`, `label`, `revision`, `reviewStatus`, `updatedAt` |
| `get_company_context` | `GET /api/nodes/{id}`, `GET /api/graph/neighborhood` | `relationships`, `claims[].subject`, `claims[].object`, `claims[].reviewStatus`, `properties.validFrom`, `properties.validTo` |
| `get_evidence` | `GET /api/claims/{id}` | `properties.evidenceText`, `documents[].url`, `documents[].publishedAt`, `documents[].collectedAt`, `reviewedBy`, `reviewedAt`, `revision` |

도구는 `revision` 과 `updatedAt` 을 답변에 함께 남겨 어느 시점의 지식을 근거로 삼았는지 추적한다.
이 표의 세션 API 는 Google 로그인 세션만 받는다. 에이전트는 연동 토큰으로 「에이전트 API(`/api/v1`)」 를 부른다.
