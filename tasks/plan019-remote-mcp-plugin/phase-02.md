# Phase 02. 인가 요청, 동의 API, 토큰 발급과 갱신, 연결된 앱 API

**Execution profile**: deep

## 목표

동의 화면이 부를 `/api/oauth/authorize`, 인가 코드를 토큰으로 바꾸는 `/oauth/token`, 폐기 `/oauth/revoke`, 연결 목록과 끊기 `/api/me/connections` 를 만든다. 이 phase 가 끝나면 HTTP 만으로 등록부터 갱신까지 OAuth 흐름이 돈다.

**범위 외**: 접근 토큰으로 `/mcp` 를 인증하는 일(phase 03), 동의 화면과 연결된 앱 화면(phase 04).

## 컨텍스트

- 계약은 `docs/api-contract.md` 의 「OAuth 인가 서버」 의 「범위」, 「인가 요청과 동의」, 「`POST /oauth/token`」, 「`POST /oauth/revoke`」 와 「연결된 앱」 절이다. 오류 코드 `OAUTH_INVALID_CLIENT`, `OAUTH_REDIRECT_ERROR` 는 「오류 형식」 표에 있다.
- 저장 모델과 잠금 순서, 지우는 규칙은 `docs/data-schema.md` 「OAuth 연결」 의 `:OAuthCode`, `:OAuthGrant` 와 그 아래 목록이다. 이 phase 의 동작은 그 목록을 그대로 따른다.
- phase 01 이 만든 `dev.fos.workbench.oauth` 의 `OAuthUrls`, `OAuthSecrets`, `RedirectUris`, `OAuthClientRepository`, `OAuthException` 을 쓴다.
- 사용자 노드 잠금(`SET u._lock = true` 뒤 `REMOVE u._lock`)은 `api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenRepository.kt` 의 `countActiveLocked`, `create` 를 본뜬다. 쓰기 트랜잭션 시간 제한은 `Limits.WRITE_TIMEOUT_SECONDS` 다.
- 세션 API 의 인증 사용자는 `@AuthenticationPrincipal user: WorkbenchPrincipal` 이다(`IntegrationTokenController` 와 같다). 오류는 `dev.fos.workbench.web` 의 `ApiException` 계열과 `ValidationFailedException`, `NotFoundException` 이다.
- 세션 체인의 권한 규칙은 `SecurityConfig.filterChain` 이다. `/api/**` 의 쓰기는 기본이 EDITOR 라서 `/api/oauth/**` 를 VIEWER 로 여는 규칙을 그 앞에 둔다. `/api/me/**` 는 이미 VIEWER 다.
- 화면 경로 GET 은 `api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` 가 `index.html` 로 넘긴다. `/connect` 를 더한다. 테스트 리소스 `api/src/test/resources/static/index.html` 이 있다.
- 사용자 활성 조건은 `IntegrationTokenRepository.findActiveByHash` 의 `u.enabled = true AND u.email IS NOT NULL` 과 같다.

**근거 문서**: `docs/api-contract.md` 「OAuth 인가 서버」, 「연결된 앱」, `docs/data-schema.md` 「OAuth 연결」, `docs/flow.md` 「앱 연결」, `docs/adr/015-remote-mcp-oauth.md`

## 의도 메모

- 인가 요청은 서버에 저장하지 않는다. 동의 화면이 query 를 들고 있다가 `GET`, `POST` 때마다 서버가 같은 검사를 다시 한다. 대기 중인 요청을 저장할 노드와 만료 정리가 필요 없다.
- `GET /oauth/authorize` 는 검사하지 않고 `/connect` 로 넘기기만 한다. 오류를 앱에 돌려보낼지 화면에 보일지는 동의 화면 API 가 정한다.
- 같은 갱신 토큰을 동시에 두 번 보내면 연결이 끊긴다. 문서(`docs/prd.md` 「남은 한계」)가 받아들인 동작이다. 완화하지 않는다.
- 토큰 요청 본문과 토큰 원문은 로그에 남기지 않는다.

## 작업 항목

### 1. `api/src/main/kotlin/dev/fos/workbench/oauth/AuthorizationRequest.kt`

인가 요청 값(`responseType`, `clientId`, `redirectUri`, `codeChallenge`, `codeChallengeMethod`, `state`, `scope`, `resource`)과 검사기 `AuthorizationRequestValidator.validate(request): ValidatedRequest`. 검사 순서와 실패 응답은 계약의 「인가 요청과 동의」 표 그대로다.

- 앞의 둘(클라이언트, redirect URI)에 걸리면 `ApiException(400, "OAUTH_INVALID_CLIENT", "연결 요청이 올바르지 않습니다. 앱에서 연결을 다시 시작하세요.")`.
- 그 뒤에 걸리면 `ApiException(400, "OAUTH_REDIRECT_ERROR", <한국어 문장>, details = {redirectUrl})`. `redirectUrl` 은 `redirect_uri` 에 `error`, `state`(있을 때), `iss={base}` 를 URL 인코딩해 붙인다. `redirect_uri` 에 이미 query 가 있으면 `&` 로 잇는다.
- `ValidatedRequest` 는 클라이언트 기록, `requestedScope`(`READ` 또는 `READ_WRITE`), `redirectKind`(`LOOPBACK`, `HTTPS`), `redirectHost` 를 담는다. 범위 해석은 계약의 「범위」 표다.

### 2. `api/src/main/kotlin/dev/fos/workbench/oauth/` 저장소와 서비스

- `OAuthCodeRepository.kt`: `create(userId, code props)`(같은 트랜잭션에서 그 사용자의 `expiresAt < now` 인 코드를 지운다), `findLocked(hash)`(코드 노드에 `_lock` 을 걸고 주인 `userId` 와 함께 읽는다), `markUsed(hash, now, grantId)`.
- `OAuthGrantRepository.kt`: `createReplacing(userId, grant props, maxPerUser)`(사용자 노드를 잠그고 같은 `clientId` 의 연결을 지우고 만든 뒤, 넘친 수만큼 `coalesce(lastUsedAt, createdAt)` 오래된 것부터 지운다), `findByRefreshLocked(hash)`, `findByPreviousRefresh(hash)`, `rotate(grantId, access, refresh, previousRefreshHash, now)`, `delete(grantId)`, `deleteOwned(userId, grantId): Boolean`, `list(userId): List<ConnectionView>`, `findByAccessOrRefresh(hash)`(폐기용). 주인 활성 조건은 컨텍스트의 것과 같다.
- `OAuthAuthorizationService.kt`: `preview(userId, request): AuthorizationPreview`, `decide(userId, request, decision, grantedScope): String`(돌아갈 주소). `ALLOW` 면 `OAuthClientRepository.markApproved` 를 부르고 코드를 만든다. `grantedScope` 가 `requestedScope` 보다 넓거나 없으면 `ValidationFailedException(mapOf("grantedScope" to …))`.
- `OAuthTokenService.kt`: PKCE 비교는 `MessageDigest.isEqual` 로 한다. `exchangeCode(form)`, `refresh(form)`, `revoke(token)`. 실패는 `OAuthException(400, "invalid_grant" | "invalid_request" | "invalid_target" | "unsupported_grant_type")`, 모르는 `client_id` 는 `OAuthException(401, "invalid_client")`. 코드 재사용이면 `grantId` 의 연결을 지운 뒤 `invalid_grant`. 이전 갱신 토큰 재사용이면 그 연결을 지운 뒤 `invalid_grant`. 수명은 `WorkbenchProperties.oauth`. 응답 `TokenResponse(access_token, token_type="Bearer", expires_in, refresh_token, scope)`. 코드 재사용과 이전 갱신 토큰 재사용으로 연결을 지우는 쓰기는 `invalid_grant` 를 던지기 전에 커밋돼야 한다. 예외로 롤백되지 않도록 지우는 쓰기를 별도 `TransactionTemplate` 으로 먼저 끝낸다.
- `ConnectionService.kt`: `list(userId)`, `disconnect(userId, id)`(없으면 `NotFoundException(id)`).

### 3. 컨트롤러

- `OAuthAuthorizeController.kt`: `GET /oauth/authorize` → `302 /connect?<받은 query 그대로>`. query 가 없으면 `/connect`.
- `OAuthConsentController.kt`: `GET /api/oauth/authorize`(query 로 받는다), `POST /api/oauth/authorize`(JSON 본문 `ConsentDecisionRequest`, 필드 이름은 계약의 본문 예와 같다). 응답 `AuthorizationPreview`, `{redirectUrl}`.
- `OAuthTokenController.kt`: `POST /oauth/token`, `POST /oauth/revoke`(`application/x-www-form-urlencoded`. `@RequestParam` 으로 받는다). 응답 헤더 `Cache-Control: no-store`, `Pragma: no-cache`. 같은 IP 의 `oauthTokenRateLimiter` 를 둘이 함께 쓰고 넘으면 `429 {"error":"too_many_requests"}`, `Retry-After`. phase 01 의 `OAuthErrors` 범위(`assignableTypes`)에 이 컨트롤러를 더한다.
- `ConnectionController.kt`: `GET /api/me/connections`, `DELETE /api/me/connections/{id}`(`204`).

### 4. `SecurityConfig.kt` 와 `SpaRouteController.kt`

- `filterChain` 에 `.requestMatchers("/api/oauth/**").hasRole("VIEWER")` 를 `/api/**` EDITOR 규칙보다 앞에 둔다.
- `SpaRouteController.route()` 의 경로 목록에 `/connect` 를 더한다.

### 5. 테스트 지원

- `api/src/test/kotlin/dev/fos/workbench/support/ApiClient.kt` 에 `fun form(path: String, fields: Map<String, String?>, headers: Map<String, String> = emptyMap()): Response`(쿠키 없는 클라이언트, `application/x-www-form-urlencoded`, null 값은 뺀다)를 더한다.
- `api/src/test/kotlin/dev/fos/workbench/support/OAuthFlow.kt`: 테스트가 OAuth 흐름을 한 줄로 타게 하는 도우미. `register(redirectUri = "http://127.0.0.1:43210/callback", name = "테스트 앱"): String`(client_id), `newVerifier(): String`, `approve(session: ApiClient, clientId, verifier, scope: String? = null, grantedScope = "READ_WRITE", redirectUri = …): String`(code. 돌아온 `redirectUrl` 에서 `code` 를 읽는다), `exchange(clientId, code, verifier, redirectUri = …): ApiClient.Response`, `connect(session, grantedScope = "READ_WRITE"): Tokens(access, refresh, clientId)`. phase 03 의 MCP 테스트가 쓴다.

### 6. 이 phase 를 검증하는 테스트 `api/src/test/kotlin/dev/fos/workbench/oauth/OAuthAuthorizationIntegrationTest.kt`

- `GET /oauth/authorize?x=1` 은 `302` 이고 `Location` 이 `/connect?x=1` 로 끝난다.
- 로그인 없이 `GET /api/oauth/authorize?...` 는 `401`.
- 정상 흐름: VIEWER 가 `preview` 로 `clientName`, `redirectKind == "LOOPBACK"`, `requestedScope == "READ_WRITE"` 를 받고, `ALLOW` 로 받은 코드를 바꿔 `fwa_`, `fwr_` 로 시작하는 토큰과 `expires_in == 3600`, `scope == "read write"`, `Cache-Control: no-store` 를 받는다. `GET /api/me/connections` 에 `clientName`, `scope == "READ_WRITE"` 인 한 줄이 있다.
- `scope=read` 로 요청하고 `grantedScope=READ_WRITE` 로 허용하면 `400 VALIDATION_FAILED`.
- PKCE 없음(`code_challenge` 빠짐)과 `code_challenge_method=plain` 은 `400 OAUTH_REDIRECT_ERROR` 이고 `details.redirectUrl` 에 `error=invalid_request` 와 `state` 가 있다.
- 등록하지 않은 redirect URI(`http://127.0.0.1:43210/other`), 포트만 다른 주소(`http://127.0.0.1:43211/callback`), 접두 일치(`http://127.0.0.1:43210/callback/x`)는 모두 `400 OAUTH_INVALID_CLIENT`.
- `code_challenge` 가 43자 base64url 이 아니면(빈 값, 42자) `OAUTH_REDIRECT_ERROR`.
- `X-XSRF-TOKEN` 없이 보낸 `POST /api/oauth/authorize` 는 `403 CSRF_REJECTED` 이고 코드가 생기지 않는다. 다른 사용자의 세션으로 받은 코드는 그 사용자의 연결이 된다(코드는 결정한 세션의 사용자에 묶인다).
- 코드는 60초 뒤 끝난다: 만든 코드 노드의 `expiresAt` 과 `createdAt` 의 차가 60초다. 코드 노드의 `expiresAt` 을 과거로 고친 뒤 바꾸면 `invalid_grant`.
- `code_verifier` 없이 바꾸면 `400 invalid_request`, `grant_type` 이 없으면 `400 invalid_request` 다(전역 처리기의 `VALIDATION_FAILED` 가 아니다).
- 갱신 요청의 `client_id` 가 연결의 클라이언트와 다르면 `invalid_grant`.
- `state` 501자는 `OAUTH_REDIRECT_ERROR`(`invalid_request`), `scope=admin` 은 `OAUTH_REDIRECT_ERROR`(`invalid_scope`).
- `/oauth/revoke` 도 토큰 한도를 함께 쓴다: 한도 nested 클래스에서 토큰 요청과 폐기 요청을 섞어 한도를 넘기면 `429`.
- 코드를 만든 요청과 다른 `client_id`(다른 등록 클라이언트), 다른 `resource` 로 바꾸면 각각 `invalid_grant`, `invalid_target`.
- 원문이 새지 않는다: 실패한 토큰 요청의 응답 본문에 보낸 코드, 갱신 토큰, `code_verifier` 문자열이 없다. 테스트 클래스에 `OutputCaptureExtension` 을 걸고 흐름 전체를 돈 뒤 캡처한 로그에 접근 토큰, 갱신 토큰, 코드 원문이 없다.
- `resource=http://evil.example/mcp` 는 `OAUTH_REDIRECT_ERROR`, `error=invalid_target`.
- `DENY` 의 `redirectUrl` 에 `error=access_denied` 가 있다.
- 토큰 요청에서 `code_verifier` 가 틀리면 `400 invalid_grant`, `redirect_uri` 가 다르면 `400 invalid_grant`.
- 같은 코드를 두 번 바꾸면 두 번째가 `400 invalid_grant` 이고 첫 번째로 만든 연결이 목록에서 사라지며 그 갱신 토큰도 `invalid_grant` 다.
- 갱신: 새 접근 토큰과 새 갱신 토큰이 나오고 둘 다 앞의 것과 다르다. 이전 갱신 토큰을 다시 보내면 `invalid_grant` 이고, 그 뒤에는 방금 받은 새 갱신 토큰도 `invalid_grant` 다(연결이 끊겼다).
- 같은 앱으로 두 번 연결하면 연결 목록에 한 줄만 남는다.
- 연결 끊기(`DELETE /api/me/connections/{id}`) 뒤 그 갱신 토큰은 `invalid_grant`. 남의 연결 id 로 끊으면 `404`.
- `/oauth/revoke` 에 갱신 토큰을 보내면 `200` 이고 연결이 사라진다. 모르는 값도 `200`.
- 주인을 비활성화(관리자 API `PATCH /api/users/{id}`, `RoleAndUserAdminIntegrationTest` 의 방식)하면 갱신이 `invalid_grant`.
- 모르는 `client_id` 로 토큰을 요청하면 `401 invalid_client`, `grant_type=password` 는 `400 unsupported_grant_type`.
- 같은 IP 한도는 phase 01 의 등록 한도 테스트와 같은 방식(`@Nested inner class` 와 `@TestPropertySource` 로 `token-rate-limit-per-minute` 를 낮춘다)으로 한 번 확인한다. `support/IntegrationTest.kt` 는 phase 01 이 한도를 크게 잡아 두었다.
- 연결 목록의 줄 수를 단언하는 테스트는 공용 사용자(`VIEWER`, `ALICE` 등)가 아니라 `newUser(Role.VIEWER)` 로 만든 사용자를 쓴다. Neo4j 를 테스트끼리 함께 써서 다른 테스트의 연결이 섞인다.
- `GET /connect` 가 `200` 이고 본문이 테스트 `index.html` 이다(`SpaRouteIntegrationTest` 의 방식을 따르거나 그 테스트에 경로를 더한다).

## 검증

```bash
cd api && ./gradlew test --rerun --tests 'dev.fos.workbench.oauth.*' --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'
cd api && ./gradlew test --rerun
```

기대값: 둘 다 `BUILD SUCCESSFUL`.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `api/src/main/kotlin/dev/fos/workbench/oauth/AuthorizationRequest.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthCodeRepository.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthGrantRepository.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthAuthorizationService.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthTokenService.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/ConnectionService.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthAuthorizeController.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthConsentController.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthTokenController.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/ConnectionController.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthErrors.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthClientRepository.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/support/ApiClient.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/support/OAuthFlow.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/oauth/OAuthAuthorizationIntegrationTest.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` | 수정 |
