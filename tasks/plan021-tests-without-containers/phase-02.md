# Phase 02. 서버 테스트가 화면 테스트용 응답 스냅샷을 남긴다

**Execution profile**: deep

## 목표

서버 JUnit 테스트 하나가 대표 데이터를 API 로 만들고, 화면 테스트가 쓸 대표 응답을 정규화한 JSON 으로 `web/e2e/fixtures/` 에 쓴다. 응답 모양이 바뀌면 이 파일의 diff 가 리뷰에 드러난다.

**범위 외**: 스냅샷을 읽는 가짜 API(phase 03). 화면 테스트를 옮기다 필요해진 스냅샷 추가는 phase 03~05 가 이 테스트에 더한다.

## 컨텍스트

- phase 01 이 만든 `api/src/test/kotlin/dev/fos/workbench/support/EmbeddedServers.kt` 의 `startNeo4j()` 는 새 Neo4j 를 띄워 bolt URI 를 돌려준다. `neo4jUri` 는 다른 통합 테스트가 나눠 쓰는 서버다.
- 요청을 보내는 도우미는 `support/ApiClient.kt`(`get`, `post`, `patch`, `send`, `bearer`, `form`, `oidcLogin`), OAuth 흐름은 `support/OAuthFlow.kt`(`register`, `approve`, `exchange`, `connect`)다. 기존 통합 테스트(`agent/AgentReadIntegrationTest.kt`, `proposal/ProposalIntegrationTest.kt`, `learning/TraceIntegrationTest.kt`)가 데이터를 만드는 순서를 따른다.
- 서버의 id 는 `UUID.randomUUID().toString()` 이고, 시각은 `config/Timestamps.kt` 의 `Timestamps.system` 이 만든 고정 자릿수 문자열이다. 연동 토큰 원문은 `fwb_` 로 시작한다.
- API 의 경로와 응답 모양은 `docs/api-contract.md` 가 소유한다.

**근거 문서**: `docs/code-architecture.md` 의 「응답 스냅샷」, `docs/adr/018-tests-without-containers.md`

## 의도 메모

- 스냅샷 테스트는 다른 테스트의 데이터가 섞이지 않게 자기 Neo4j 를 따로 띄운다. 같은 서버를 쓰면 개념 지도의 개수와 검색 결과가 실행 순서에 따라 달라진다.
- 테스트는 돌 때마다 파일을 다시 쓴다. 비교해서 실패시키는 방식은 갱신 명령이 따로 필요해 버렸다. 바뀜은 `git diff` 로 본다.
- 정렬이 같은 시각에 기대는 응답은 데이터를 만드는 사이에 시각이 겹치지 않게 만든다. 두 번 돌려 diff 가 비어야 한다.

## 작업 항목

### 1. `api/src/test/kotlin/dev/fos/workbench/snapshot/SnapshotNormalizer.kt`(신규)

`class SnapshotNormalizer` 는 한 번의 실행 동안 상태를 들고 JSON 트리(`tools.jackson.databind.JsonNode`)를 바꾼다.

- UUID 형식 문자열(`[0-9a-f]{8}-[0-9a-f]{4}-...`)은 처음 나온 순서대로 `00000000-0000-4000-8000-000000000001`, `...0002` 로 바꾼다. 문자열 안에 섞인 UUID(경로, `redirectUrl`)도 바꾼다.
- `Timestamps.system` 형식의 시각은 처음 나온 순서대로 `2026-01-01T00:00:00` 부터 1초씩 늘린 값으로 바꾸되 원래 자릿수와 끝 표기를 지킨다. 실제 형식은 `Timestamps.kt` 에서 읽어 맞춘다.
- 연동 토큰 원문(`fwb_...`), OAuth 접근 토큰과 갱신 토큰, `client_id`, 인가 코드는 종류마다 고정 문자열(예: `fwb_` + `A` 43자)로 바꾼다. 같은 값은 같은 자리표시가 된다.
- 같은 실제 값은 모든 스냅샷 파일에서 같은 자리표시가 된다. 요청 경로와 query 도 같은 규칙으로 바꾼다.

### 2. `api/src/test/kotlin/dev/fos/workbench/snapshot/ApiSnapshotTest.kt`(신규)

- `IntegrationTest` 를 상속하지 않고 같은 `@SpringBootTest` 속성과 `@ActiveProfiles("mockoidc")` 를 쓴다. `@DynamicPropertySource` 에서 `spring.neo4j.uri` 는 이 클래스가 `EmbeddedServers.startNeo4j()` 로 띄운 서버, OIDC 는 `EmbeddedServers.mockOidcUrl()` 이다. 사용자는 `IntegrationTest.USERS` 와 같은 네 사람을 만든다.
- 테스트 하나(`writes api snapshots`)가 아래 순서로 데이터를 만들고 응답을 저장한다. 저장은 `fun save(name: String, method: String, pathAndQuery: String, response: ApiClient.Response)` 로 한다.
- 파일은 `web/e2e/fixtures/<name>.json` 이고 모양은 `{"request": {"method", "path", "query"}, "status", "body"}` 다. `query` 는 없으면 `""` 다. 키 순서를 고정하고 2칸 들여쓰기, 끝 줄바꿈으로 쓴다. 위치는 테스트 작업 디렉터리(`api/`)의 `../web/e2e/fixtures` 다.
- 시작할 때 `web/e2e/fixtures/*.json` 을 지우고 다시 쓴다. 지운 파일이 다시 생기지 않으면 diff 에 삭제로 드러난다.

만들 데이터(편집자 A 가 만들고 B 가 검토): 변화, 병목, 산업, 기업, 종목(발행 기업 연결), 밸류에이션, 시나리오, 투자 결정을 잇는 사슬, 근거 문서와 그 문서를 근거로 한 주장 하나(B 가 검토 완료), 검토 대기 주장 하나, A 의 이해 표시(「잘 모르겠어요」) 하나, A 의 기록 연동 토큰 하나, A 의 OAuth 연결 하나, A 의 체결 하나와 대기 제안 하나, 보관한 노드 하나.

저장할 응답(이름은 파일 이름이다). 각 파일은 `docs/api-contract.md` 의 해당 절과 모양이 같아야 한다.

| 이름 | 요청 |
|---|---|
| `auth-me-viewer`, `auth-me-editor`, `auth-me-admin` | 각 역할 사용자의 `GET /api/auth/me` |
| `auth-me-anonymous` | 로그인하지 않은 `GET /api/auth/me`(401) |
| `ontology` | `GET /api/ontology` |
| `ontology-versions` | `GET /api/ontology/versions?page=0&size=20` |
| `nodes-counts` | `GET /api/nodes/counts` |
| `nodes-recent` | 개념 지도가 부르는 `sort=recent` 검색. query 는 `web/src` 의 호출(`api.nodes.search`)에서 읽는다 |
| `nodes-search` | 기업 이름으로 한 검색 |
| `node-company`, `node-security`, `node-decision`, `node-document`, `node-archived` | `GET /api/nodes/{id}` |
| `node-decision-trace` | `GET /api/nodes/{id}/trace` |
| `graph-company` | 기업의 `GET /api/graph/neighborhood` |
| `claims-pending-review`, `claims-mine` | `GET /api/claims` 의 두 `scope` |
| `claim-reviewed` | `GET /api/claims/{id}` |
| `changes`, `changes-actors` | `GET /api/changes`, `GET /api/changes/actors` |
| `users` | 관리자의 `GET /api/users` |
| `knowledge-mark`, `knowledge-study`, `knowledge-summary` | `/api/me/knowledge/{nodeId}`, `/api/me/knowledge`, `/api/me/knowledge/summary` |
| `tokens`, `token-issued` | `GET /api/me/tokens`, 발급 응답 |
| `oauth-authorize-preview`, `oauth-authorize-decide` | 동의 화면의 `GET /api/oauth/authorize?...`, 허용 응답 |
| `connections` | `GET /api/me/connections` |
| `proposals-pending`, `proposals-summary` | `GET /api/me/proposals?status=PENDING&page=0&size=20`, `/summary` |
| `trades` | `GET /api/me/trades?page=0&size=20` |
| `v1-me`, `v1-nodes-search`, `v1-node`, `v1-node-trace` | 연동 토큰으로 부른 `/api/v1` 대표 경로 |
| `oauth-protected-resource`, `oauth-authorization-server` | `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server` |

query 의 실제 모양은 `web/src/api/client.ts` 의 `buildQuery` 가 만드는 순서와 같아야 가짜 API 가 찾는다. 화면이 같은 경로를 다른 query 로 부르면 phase 03 이 스냅샷을 더한다.

### 3. 이 phase 를 검증하는 `api/src/test/kotlin/dev/fos/workbench/snapshot/SnapshotNormalizerTest.kt`(신규)

- 정상: 같은 UUID 가 두 문서에 나오면 같은 자리표시가 되고, 다른 UUID 는 순번이 늘어난다. 시각의 순서가 유지된다. 토큰 원문이 고정 문자열이 된다. 기대값은 테스트 안에 문자열로 직접 적는다.
- 실패 입력: UUID 형식이 아닌 문자열(`not-a-uuid`, 숫자)은 그대로 남는다.

### 4. `README.md` 의 「검증」

스냅샷 갱신 명령을 더한다.

```bash
# cwd: api
./gradlew test --rerun --tests '*ApiSnapshotTest'   # web/e2e/fixtures/*.json 을 다시 쓴다. 바뀐 파일은 함께 커밋한다
git diff --stat -- ../web/e2e/fixtures
```

## 검증

```bash
cd api && DOCKER_HOST=unix:///nonexistent.sock ./gradlew test --rerun
cd api && ./gradlew test --rerun --tests '*ApiSnapshotTest' --tests '*SnapshotNormalizerTest' && git diff --exit-code -- ../web/e2e/fixtures
cd web && npm run typecheck && npm test && npm run build
bash scripts/tests/test_scripts.sh
```

- 첫 줄이 만든 스냅샷을 커밋할 파일로 두고, 둘째 줄로 한 번 더 만들었을 때 diff 가 비어야 한다(두 번째 실행 전에 `git add web/e2e/fixtures` 로 첫 결과를 stage 한다).
- `grep -rn "fwb_[A-Za-z0-9_-]\{43\}" web/e2e/fixtures | grep -v "fwb_AAAA"` 가 비어 있어 실제 토큰이 남지 않는다.
- 화면 테스트는 phase 03 에서 가짜 API 를 만든 뒤부터 돈다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `api/src/test/kotlin/dev/fos/workbench/snapshot/SnapshotNormalizer.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/snapshot/ApiSnapshotTest.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/snapshot/SnapshotNormalizerTest.kt` | 신규 |
| `web/e2e/fixtures/*.json` | 신규 |
| `README.md` | 수정 |
