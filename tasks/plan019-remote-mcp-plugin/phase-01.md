# Phase 01. OAuth 메타데이터와 클라이언트 동적 등록

**Execution profile**: standard

## 목표

MCP 클라이언트가 인가 서버를 찾고 스스로 등록할 수 있게 메타데이터 두 경로와 `POST /oauth/register` 를 만든다. OAuth 저장 모델의 제약 조건과 코드 소유 이름도 이 phase 에서 한 번에 더한다.

**범위 외**: 인가 요청, 동의 API, 토큰 발급(phase 02), `/mcp`(phase 03), 화면(phase 04).

## 컨텍스트

- 계약은 `docs/api-contract.md` 의 「OAuth 인가 서버」 의 표, 「메타데이터」, 「`POST /oauth/register`」 다. 오류 본문은 `{error, error_description}` 이고 기존 `ApiError` 가 아니다.
- 저장 모델은 `docs/data-schema.md` 의 「OAuth 연결」 의 `:OAuthClient` 와 「제약 조건과 인덱스」 의 `oauth_*` 줄이다.
- `{base}` 는 요청의 scheme, host, 포트다. `ServletUriComponentsBuilder.fromCurrentContextPath()` 로 만든다. 운영에서는 `server.forward-headers-strategy=native` 가 `X-Forwarded-*` 를 반영한다(`api/src/main/resources/application.yaml`).
- 보안 체인은 `api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` 의 `agentFilterChain`(`@Order(1)`)을 본뜬다. 세션 없이(`STATELESS`, `RequestAttributeSecurityContextRepository`), CSRF 를 끈다.
- 요청 한도는 `dev.fos.workbench.agent.RateLimiter` 를 IP 키로 쓴다. IP 는 `request.remoteAddr` 다(Tomcat remoteip 가 믿는 프록시 뒤에서 클라이언트 주소다).
- 제약 조건은 `api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` 의 `CREATE CONSTRAINT … IF NOT EXISTS` 목록에 더한다.
- 코드 소유 이름은 `api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` 의 `RESERVED_NODE_TYPES` 다.
- 시각은 `dev.fos.workbench.config.Timestamps.now()` 형식이다.
- 통합 테스트는 `api/src/test/kotlin/dev/fos/workbench/support/IntegrationTest.kt` 를 상속하고 `anonymous()` 의 `ApiClient` 로 부른다.

**근거 문서**: `docs/api-contract.md` 「OAuth 인가 서버」, `docs/data-schema.md` 「OAuth 연결」, `docs/adr/015-remote-mcp-oauth.md`

## 의도 메모

- Spring Security 의 인가 서버를 쓰지 않는다. 이유는 ADR-015 의 대안 표다.
- 클라이언트 비밀을 발급하지 않는다. 공개 클라이언트만 받는다.
- redirect URI 는 등록한 값과 글자까지 같아야 한다. loopback 의 포트 차이도, 접두 일치도 받지 않는다(코디네이터 조건 2026-10-26, 최신 MCP 인증 규격의 정확 일치). 이 규칙은 이 phase 의 `RedirectUris` 가 소유하고 phase 02 가 같은 함수를 쓴다. 실제 클라이언트 확인에서 포트가 바뀌어 막히면 그때 다시 정한다.

## 작업 항목

### 1. `api/src/main/kotlin/dev/fos/workbench/config/WorkbenchProperties.kt` 와 `Limits.kt`

- `WorkbenchProperties` 에 `val oauth: OAuth = OAuth()` 를 더한다. `data class OAuth(accessTokenTtl: Duration = 1h, refreshTokenTtl: Duration = 30d, codeTtl: Duration = 60s, maxGrantsPerUser: Int = 20, registerRateLimitPerMinute: Int = 10, tokenRateLimitPerMinute: Int = 30)`. 키 이름은 `docs/code-architecture.md` 「설정」 표와 같다.
- `Limits` 에 `MAX_OAUTH_BODY_BYTES = 16 * 1024L` 을 더한다.

### 2. `api/src/main/kotlin/dev/fos/workbench/oauth/` 새 패키지

- `OAuthUrls.kt`: `fun base(): String`(현재 요청의 `{base}`), `fun resource(): String = base() + "/mcp"`.
- `OAuthSecrets.kt`: `generate(prefix: String)`(접두 뒤에 무작위 32바이트 base64url 43자를 붙인다), `isWellFormed(prefix, raw)`, `hash(raw)`(SHA-256 소문자 16진수. `IntegrationTokens.hash` 와 같은 결과), `s256(verifier)`(PKCE: SHA-256 의 base64url, 채움 없음). 접두 상수 `CODE = "fwc_"`, `ACCESS = "fwa_"`, `REFRESH = "fwr_"`.
- `OAuthErrors.kt`: `class OAuthException(status: HttpStatus, error: String, description: String)` 과 `data class OAuthErrorBody(error, error_description)`. 응답 JSON 키는 `error`, `error_description` 이다. `@RestControllerAdvice(basePackageClasses = [OAuthMetadataController::class])` 같은 범위 지정으로 `oauth` 패키지 컨트롤러의 `OAuthException` 만 이 형식으로 쓴다. `/api/oauth/**` 컨트롤러(phase 02)는 기존 `ApiException` 을 쓰므로, 범위는 `/oauth/**` 컨트롤러 클래스들로 `assignableTypes` 를 준다.
- `RedirectUris.kt`: `fun validate(uri: String): Boolean`(fragment 없음, 절대 주소, `http://127.0.0.1`·`http://localhost`·`http://[::1]` loopback 이거나 `https`), `fun matches(registered: String, requested: String): Boolean`(글자까지 같다), 길이 2000자 상한, `fun isLoopback(uri)`.
- `OAuthClientRepository.kt`: `:OAuthClient` 저장. `create(name, redirectUris): OAuthClientRecord`, `find(id): OAuthClientRecord?`, `deleteStaleUnapproved(before: String): Long`(`approvedAt IS NULL AND createdAt < $before`), `markApproved(id, now)`(phase 02 가 쓴다. `approvedAt` 이 없을 때만 쓴다).
- `OAuthClientService.kt`: `register(body: Map<String, Any?>): RegisteredClient`. 계약의 검사 순서와 기본값을 지킨다. 같은 트랜잭션에서 `deleteStaleUnapproved(지금 - 24시간)` 을 먼저 부른다.
- `OAuthMetadataController.kt`: `GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-protected-resource/mcp`, `GET /.well-known/oauth-authorization-server`. 본문은 계약의 JSON 그대로, `Cache-Control: max-age=300`.
- `OAuthRegisterController.kt`: `POST /oauth/register`. 성공 `201`. 같은 IP 한도를 넘으면 `429 {"error":"too_many_requests"}` 와 `Retry-After`.

### 3. `api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt`

- `@Bean oauthRegisterRateLimiter`, `@Bean oauthTokenRateLimiter`(값은 `properties.oauth`). 컨트롤러가 `@Qualifier` 로 받는다.
- `@Bean @Order(1) oauthFilterChain`: `securityMatcher("/oauth/register", "/oauth/token", "/oauth/revoke", "/.well-known/**")`, `permitAll`, CSRF 끄기, `STATELESS`, `RequestAttributeSecurityContextRepository`, 같은 `securityHeaders`. `formLogin`, `httpBasic`, `logout`, `requestCache` 를 끈다. 기존 `agentFilterChain` 과 matcher 가 겹치지 않는다. 기존 `filterChain` 은 `@Order(2)` 그대로 두거나 뒤로 민다.
- `/oauth/token`, `/oauth/revoke` 는 phase 02 가 만든다. 이 phase 에서는 matcher 만 둔다.

### 4. `api/src/main/kotlin/dev/fos/workbench/web/RequestSizeFilter.kt`

`/oauth/` 로 시작하는 `POST` 도 검사한다. 상한은 `Limits.MAX_OAUTH_BODY_BYTES`. `/mcp` 의 `POST` 도 검사 대상에 넣고 상한은 `Limits.MAX_BODY_BYTES` 다(phase 03 이 쓴다). `/api/` 의 동작은 바꾸지 않는다. 클래스 주석을 고친다.

### 5. 제약 조건과 코드 소유 이름

- `Neo4jSchemaInitializer.kt` 에 `docs/data-schema.md` 「제약 조건과 인덱스」 의 `oauth_client_id_unique`, `oauth_code_hash_unique`, `oauth_grant_id_unique`, `oauth_grant_access_hash_unique`, `oauth_grant_refresh_hash_unique`(유일 제약), `oauth_grant_previous_refresh`(인덱스, `CREATE INDEX … IF NOT EXISTS`)를 더한다.
- `OntologyLoader.RESERVED_NODE_TYPES` 에 `OAuthClient`, `OAuthCode`, `OAuthGrant` 를 더한다. 이 집합의 원소를 하나하나 단언하는 기존 테스트가 있으면(`git grep -n "RESERVED_NODE_TYPES\|IntegrationToken" api/src/test`) 같은 커밋에서 고친다.

### 6. 이 phase 를 검증하는 테스트

- `api/src/test/kotlin/dev/fos/workbench/oauth/RedirectUrisTest.kt`(단위): `http://localhost:1234/callback` 등록에 `http://localhost:5678/callback`(포트만 다름), `http://localhost:1234/callback/extra`(접두 일치), `http://localhost:1234/callbackx` 는 맞지 않고 같은 글자만 맞는다. 2001자 주소는 `validate` 가 거절한다. `http://example.com/cb`, `custom://cb`, `http://localhost/cb#x` 는 `validate` 가 거절한다.
- `api/src/test/kotlin/dev/fos/workbench/oauth/OAuthSecretsTest.kt`(단위): RFC 7636 부록 B 의 `code_verifier`(`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`)가 `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` 로 바뀐다. `generate("fwa_")` 가 `isWellFormed` 를 통과한다.
- `api/src/test/kotlin/dev/fos/workbench/oauth/OAuthRegistrationIntegrationTest.kt`:
  - 보호 자원 메타데이터 두 경로가 같은 본문이고 `resource` 가 `http://localhost:<port>/mcp`, `authorization_servers` 가 `[http://localhost:<port>]` 다.
  - 인가 서버 메타데이터의 `issuer`, 네 엔드포인트, `code_challenge_methods_supported == ["S256"]`, `token_endpoint_auth_methods_supported == ["none"]`.
  - `X-Forwarded-Proto: https`, `X-Forwarded-Host: graph.example.com` 을 붙인 요청은 이 테스트 환경의 forward headers 설정을 따른다. 기존 `ForwardedHeadersIntegrationTest` 의 설정을 보고, 그 테스트처럼 `native` 를 켠 클래스에서 `issuer == "https://graph.example.com"` 을 단언한다. 같은 클래스에 넣기 어려우면 `ForwardedHeadersIntegrationTest` 에 이 단언을 더한다.
  - 등록 성공은 `201` 이고 `client_id` 가 UUID, `token_endpoint_auth_method == "none"`, `client_name` 이 없으면 「이름 없는 앱」 이다.
  - `redirect_uris` 가 비었거나, `http://example.com/cb` 를 담으면 `400 invalid_redirect_uri` 다. `token_endpoint_auth_method: client_secret_basic`, 101자 `client_name`, 줄바꿈이 든 `client_name` 은 `400 invalid_client_metadata` 다. 오류 본문에 보낸 값이 그대로 실리지 않는다.
  - 승인받지 않은 `:OAuthClient` 의 `createdAt` 을 25시간 전으로 고쳐 두고 새로 등록하면 그 노드가 지워진다. 테스트가 `neo4j` 클라이언트로 그 `id` 의 노드 수가 0 인지 단언한다.
  - 한도: `workbench.oauth.register-rate-limit-per-minute` 를 이 클래스의 `@TestPropertySource` 나 `properties` 로 3 으로 낮추고 네 번째 등록이 `429` 와 `Retry-After` 를 받는다. 다른 테스트 클래스의 컨텍스트와 섞이지 않게 한다.

## 검증

```bash
cd api && ./gradlew test --rerun --tests 'dev.fos.workbench.oauth.*' --tests 'dev.fos.workbench.ForwardedHeadersIntegrationTest' --tests 'dev.fos.workbench.ontology.*'
cd api && ./gradlew test --rerun
```

기대값: 둘 다 `BUILD SUCCESSFUL`. 두 번째 명령은 기존 통합 테스트가 새 체인과 제약 조건에 깨지지 않는지 본다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `api/src/main/kotlin/dev/fos/workbench/config/WorkbenchProperties.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/config/Limits.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/ontology/OntologyLoader.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/web/RequestSizeFilter.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthUrls.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthSecrets.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthErrors.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/RedirectUris.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthClientRepository.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthClientService.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthMetadataController.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthRegisterController.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/oauth/RedirectUrisTest.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/oauth/OAuthSecretsTest.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/oauth/OAuthRegistrationIntegrationTest.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/ForwardedHeadersIntegrationTest.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/ontology/*.kt` | 수정 |
