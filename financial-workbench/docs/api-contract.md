# API 계약

모든 경로는 `/api` 아래에 있다. 요청과 응답 본문은 `application/json` 이고 문자 집합은 UTF-8 이다.
식별자는 서버가 만든 UUID 문자열이다. Neo4j 내부 ID 는 응답에 나오지 않는다.
시각은 UTC ISO-8601 문자열(`2026-10-20T03:15:00Z`)이고, 날짜는 `YYYY-MM-DD` 다.

## 인증과 CSRF

인증은 서버 세션이다. 로그인에 성공하면 `WORKBENCH_SESSION` 쿠키(HttpOnly, SameSite=Lax)가 생긴다.
`/api/health`, `/api/auth/csrf`, `/api/auth/login` 을 뺀 모든 `/api` 경로는 로그인이 필요하다. 조회도 같다.

상태를 바꾸는 요청(`POST`, `PATCH`, `PUT`, `DELETE`)은 CSRF 토큰이 필요하다.
서버는 `XSRF-TOKEN` 쿠키(HttpOnly 아님)를 내려 주고, 클라이언트는 그 값을 `X-XSRF-TOKEN` 헤더에 담는다.
로그인 요청도 CSRF 토큰이 필요하므로 클라이언트는 먼저 `GET /api/auth/csrf` 를 부른다. 토큰 값은 응답 본문이 아니라 쿠키에서 읽는다.

| 메서드 | 경로 | 입력 | 성공 응답 | 실패 |
| --- | --- | --- | --- | --- |
| GET | `/api/auth/csrf` | 없음 | `200 {"headerName":"X-XSRF-TOKEN","cookieName":"XSRF-TOKEN"}` 와 쿠키 | 없음 |
| POST | `/api/auth/login` | `{"username","password"}` | `200 UserRef` | `401 INVALID_CREDENTIALS`, `403 CSRF_REJECTED` |
| POST | `/api/auth/logout` | 없음 | `204` | `403 CSRF_REJECTED` |
| GET | `/api/auth/me` | 없음 | `200 UserRef` | `401 UNAUTHENTICATED` |

로그인에 성공하면 세션 ID 를 새로 발급하고, CSRF 토큰도 새로 받아야 한다.
공개 가입 API 는 없다. 계정은 [배포 문서](deployment.md)의 `user-add` 명령으로만 만든다.

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
| 401 | `INVALID_CREDENTIALS` | 사용자 이름이나 비밀번호가 틀렸다 |
| 403 | `CSRF_REJECTED` | CSRF 토큰이 없거나 틀렸다 |
| 403 | `SELF_REVIEW_FORBIDDEN` | 자기가 작성한 Claim 을 검토하려 했다 |
| 404 | `NOT_FOUND` | 그 ID 의 노드나 관계가 없다 |
| 409 | `REVISION_CONFLICT` | `expectedRevision` 이 현재 revision 과 다르다. `details` 에 두 값이 있다 |
| 409 | `ARCHIVED` | 보관된 대상을 수정하려 했다. 먼저 복원한다 |
| 409 | `NOT_ARCHIVED` | 보관되지 않은 대상을 복원하려 했다 |
| 409 | `DUPLICATE` | 같은 시장과 종목 코드의 Security 처럼 유일해야 하는 값이 이미 있다 |
| 500 | `INTERNAL_ERROR` | 그 밖의 서버 오류. 내부 메시지는 응답에 담지 않는다 |
| 503 | `QUERY_TIMEOUT` | 그래프 조회가 시간 제한을 넘었다 |

## 공통 표현

`UserRef`

```json
{ "id": "uuid", "username": "alice", "displayName": "Alice" }
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
  "createdBy": { "id": "uuid", "username": "alice", "displayName": "Alice" },
  "updatedAt": "2026-10-20T03:15:00Z",
  "updatedBy": { "id": "uuid", "username": "alice", "displayName": "Alice" },
  "reviewStatus": null
}
```

`label` 은 온톨로지의 `labelProperty` 값이다. `reviewStatus` 는 Claim 일 때만 값이 있다.

`ClaimView`: `NodeView` 의 모든 필드에 아래를 더한다.

```json
{
  "reviewStatus": "REVIEWED",
  "reviewedBy": { "id": "uuid", "username": "bob", "displayName": "Bob" },
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
  "createdAt": "...", "createdBy": { "id": "uuid", "username": "alice", "displayName": "Alice" }
}
```

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

## 노드

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/nodes` | 검색. 쿼리: `q`, `types`(쉼표 구분), `reviewStatus`, `includeArchived`(기본 `false`), `page`, `size`. 응답 `Page<NodeView>`. `label` 오름차순 |
| GET | `/api/nodes/{id}` | 상세. 응답 `NodeDetail` |
| POST | `/api/nodes` | 생성. 본문 `{"type","properties"}`. 응답 `201 NodeView` |
| PATCH | `/api/nodes/{id}` | 속성 수정. 본문 `{"expectedRevision", "properties": {키: 값 또는 null}}`. `null` 은 그 속성을 지운다. 응답 `NodeView` |
| POST | `/api/nodes/{id}/archive` | 보관. 본문 `{"expectedRevision","reason"}`. `reason` 은 선택. 응답 `NodeView` |
| POST | `/api/nodes/{id}/restore` | 복원. 본문 `{"expectedRevision"}`. 응답 `NodeView` |

- `q` 는 `label` 과 Security 의 `ticker` 에서 대소문자를 무시하고 부분 일치로 찾는다. 비우면 전체를 돌려준다.
- `POST /api/nodes` 의 `type` 은 `Company`, `Security`, `Sector`, `Document` 가운데 하나다. `Claim` 은 `400 ONTOLOGY_VIOLATION` 이고 `/api/claims` 로 만든다.
- `PATCH` 로 Claim 을 고치면 `400 ONTOLOGY_VIOLATION` 이다. `PATCH /api/claims/{id}` 를 쓴다.
- 보관한 노드는 기본 검색, 주변 그래프, 검토 대기 목록에서 빠진다. 상세 조회와 `includeArchived=true` 검색에는 나온다.
- 노드를 보관해도 그 노드에 걸린 관계와 Claim 은 그대로 둔다. 그래프에서는 보관된 끝점 때문에 함께 보이지 않는다.

`NodeDetail`

```json
{
  "node": "NodeView",
  "claim": "ClaimView 또는 null. 노드가 Claim 일 때만 있다",
  "relationships": ["RelationshipView. ISSUES 처럼 일반 관계만. 보관된 관계 포함"],
  "claims": ["ClaimView. 이 노드가 SUBJECT, OBJECT, SUPPORTED_BY 의 끝인 Claim. 보관된 Claim 제외"]
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
보관된 끝 노드에 관계를 만들면 `409 ARCHIVED` 다.

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
- `documentIds` 는 한 개 이상이고 모두 보관되지 않은 Document 여야 한다. 근거 없는 Claim 은 만들 수 없다.
- 새 Claim 의 `reviewStatus` 는 `DRAFT` 다. `authoringMethod` 를 비우면 `MANUAL` 이다.
- `validFrom` 이 `validTo` 보다 늦으면 `400 VALIDATION_FAILED` 다.

`PATCH /api/claims/{id}` 본문은 `expectedRevision` 과 함께 `description`, `evidenceText`, `validFrom`, `validTo`, `extractionConfidence` 가운데 바꿀 것만 담는다.
`validFrom`, `validTo` 에 `null` 을 넣으면 미상으로 되돌린다. predicate, 주어, 목적어, 근거 자료는 바꿀 수 없다. 바꾸려면 보관하고 새로 만든다.
내용을 고치면 `reviewStatus` 가 `DRAFT` 로 돌아가고 검토자 정보가 지워진다. 이력에는 이전 검토자가 남는다.

`review` 의 `status` 는 `REVIEWED`, `REJECTED`, `DRAFT` 가운데 하나다.
Claim 작성자는 자기 Claim 을 검토할 수 없다(`403 SELF_REVIEW_FORBIDDEN`). 보관된 Claim 은 검토할 수 없다(`409 ARCHIVED`).
Claim 보관과 복원은 노드 API(`/api/nodes/{id}/archive`, `/restore`)로 한다.

## 주변 그래프

`GET /api/graph/neighborhood?id={uuid}&hops=1&types=Company,Security&reviewStatus=REVIEWED`

| 쿼리 | 기본값 | 설명 |
| --- | --- | --- |
| `id` | 필수 | 중심 노드 |
| `hops` | 1 | 1 또는 2. 서버 설정 `workbench.graph.max-hops` 보다 크면 `400 VALIDATION_FAILED` |
| `types` | 전체 | 중심이 아닌 노드를 이 타입으로 제한한다 |
| `reviewStatus` | 전체 | Claim 노드를 이 검토 상태로 제한한다 |

```json
{
  "centerId": "uuid",
  "hops": 1,
  "nodes": [{ "id": "uuid", "type": "Company", "label": "가상전자", "reviewStatus": null }],
  "edges": [{ "id": "uuid", "type": "SUBJECT", "source": "uuid", "target": "uuid" }],
  "truncated": false,
  "limits": { "maxHops": 2, "maxNodes": 150, "maxRelationships": 300 }
}
```

- 보관된 노드와 관계는 빠진다. 보관된 중심 노드를 요청하면 `404 NOT_FOUND` 다.
- 노드나 관계가 한도를 넘으면 한도까지만 돌려주고 `truncated` 를 `true` 로 둔다. 화면은 이것을 표시한다.
- 조회 트랜잭션은 `workbench.graph.timeout` (기본 5초) 뒤에 끊긴다.
- 이웃 확장은 클라이언트가 다른 노드를 중심으로 이 API 를 다시 부르고 결과를 합친다.

## 변경 이력

`GET /api/changes?targetId={uuid}&actor={username}&page=0&size=20` 은 최근 것부터 `Page<ChangeEventView>` 를 돌려준다.

```json
{
  "id": "uuid",
  "at": "2026-10-20T04:00:00Z",
  "actor": { "id": "uuid", "username": "bob", "displayName": "Bob" },
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

`action` 은 `CREATE`, `UPDATE`, `REVIEW`, `ARCHIVE`, `RESTORE` 가운데 하나다. `targetKind` 는 `NODE` 나 `RELATIONSHIP` 이다.
`revision` 은 변경 뒤의 revision 이다. 이력은 지우거나 고치는 API 가 없다.

## 온톨로지와 health

| 메서드 | 경로 | 인증 | 응답 |
| --- | --- | --- | --- |
| GET | `/api/ontology` | 필요 | 온톨로지 YAML 을 그대로 옮긴 JSON |
| GET | `/api/health` | 불필요 | `200 {"status":"UP","neo4j":"UP","ontologyVersion":"1.0.0"}`. Neo4j 가 응답하지 않으면 `503` 과 `"status":"DOWN"` |

## 후속 도구가 쓸 필드

FOS 의 `search_financial_knowledge`, `get_company_context`, `get_evidence` 는 이 API 의 조회 응답을 그대로 쓸 수 있게 했다.

| 도구 | 쓸 API | 기대는 필드 |
| --- | --- | --- |
| `search_financial_knowledge` | `GET /api/nodes`, `GET /api/claims` | `id`, `type`, `label`, `revision`, `reviewStatus`, `updatedAt` |
| `get_company_context` | `GET /api/nodes/{id}`, `GET /api/graph/neighborhood` | `relationships`, `claims[].subject`, `claims[].object`, `claims[].reviewStatus`, `properties.validFrom`, `properties.validTo` |
| `get_evidence` | `GET /api/claims/{id}` | `evidenceText`, `documents[].url`, `documents[].publishedAt`, `documents[].collectedAt`, `reviewedBy`, `reviewedAt`, `revision` |

도구는 `revision` 과 `updatedAt` 을 답변에 함께 남겨 어느 시점의 지식을 근거로 삼았는지 추적한다.
도구 쪽 인증 방식(서비스 계정이나 읽기 전용 토큰)은 연동할 때 정한다. 이 API 는 아직 세션 로그인만 받는다.
