# Phase 03. 원격 MCP(`/mcp`)와 두 종류 토큰 인증

**Execution profile**: deep

## 목표

MCP Java SDK 의 세션 없는 servlet 전송으로 `POST /mcp` 를 열고, 커넥터와 같은 도구를 서버 서비스로 구현한다. `/mcp` 는 OAuth 접근 토큰(`fwa_`)과 연동 토큰(`fwb_`)을 받고, 토큰이 없으면 MCP 인증 규격의 `401` 과 `WWW-Authenticate` 를 돌려준다.

**범위 외**: 화면(phase 04), 플러그인 파일(phase 05), 실제 Claude Code 와 Codex 로 붙는 확인(구현 마감의 통합 검증).

## 컨텍스트

- 계약은 `docs/api-contract.md` 의 「원격 MCP(`/mcp`)」 절 전체다(연결과 인증, 도구 표, `McpConnection`, 도구 오류). 도구의 입력 칸과 상한은 같은 절이 가리키는 「에이전트 API(`/api/v1`)」 의 경로와 같다.
- 도구가 부를 서비스와 v1 응답은 `api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentV1Controller.kt` 가 이미 부르는 것과 같다: `AgentQueryService.search/detail/neighborhood/trace/knowledge`, `SecurityLookupService.lookup`, `V1Mapper.ontology/page/trade/proposal`, `TradeService.save/list`, `ProposalService.submit/list`. 컨트롤러의 본문 검사(`items`), 시각 검사(`instant`), 범위 확인(`requireWrite`)을 도구도 똑같이 써야 한다.
- 연동 토큰 인증은 `dev.fos.workbench.agent.IntegrationTokenService.authenticate` 와 `BearerTokenFilter` 다. 요청 한도는 `SecurityConfig` 의 `agentRateLimiter`, `agentWriteRateLimiter` 빈이다.
- OAuth 연결 저장소는 phase 02 의 `dev.fos.workbench.oauth.OAuthGrantRepository` 다. 접근 토큰 해시 조회 조건은 `docs/data-schema.md` 「OAuth 연결」 이다(`accessExpiresAt > now`, `resource` 가 요청의 `{base}/mcp`, 주인 활성). `lastUsedAt` 은 연동 토큰과 같이 1분 넘게 지났을 때만 쓰고 실패해도 인증은 통과한다(`IntegrationTokenService.authenticate` 참고).
- 예외를 `{code, message, details}` 로 바꾸는 규칙은 `dev.fos.workbench.web.GlobalExceptionHandler` 다. 도구 오류도 이 빈의 `api(ApiException)` 과 `unexpected(Exception)` 을 불러 같은 `ApiError` 를 얻는다. 검사 오류(`ValidationFailedException`)도 `ApiException` 이다.
- `io.modelcontextprotocol.sdk:mcp:2.1.0` 이 Maven Central 에 없으면(첫 빌드에서 드러난다) 있는 최신 GA 를 쓰고, `docs/code-architecture.md` 「버전」 과 ADR-015 의 버전을 같은 커밋에서 고친다.
- 테스트 클라이언트는 `io.modelcontextprotocol.sdk:mcp` 의 `McpClient.sync(HttpClientStreamableHttpTransport.builder(base).endpoint("/mcp")…)` 다. 요청 헤더는 transport builder 의 요청 사용자 지정(`customizeRequest` 또는 이름이 같은 2.1.0 의 메서드)으로 `Authorization` 을 넣는다. 정확한 메서드 이름은 받은 jar 에서 확인한다.
- phase 02 의 테스트 도우미 `api/src/test/kotlin/dev/fos/workbench/support/OAuthFlow.kt` 의 `connect(session, grantedScope)` 로 접근 토큰을 얻는다. 연동 토큰은 `AgentAuthIntegrationTest` 처럼 `POST /api/me/tokens` 로 발급한다.

**근거 문서**: `docs/api-contract.md` 「원격 MCP(`/mcp`)」, 「에이전트 API(`/api/v1`)」, `docs/code-architecture.md` 「API 패키지」, 「보안 기본값」, `docs/adr/015-remote-mcp-oauth.md`

## 의도 메모

- Spring AI 의 MCP starter 를 쓰지 않는다(ADR-015). SDK 의 `HttpServletStatelessServerTransport` 를 `ServletRegistrationBean` 으로 `/mcp` 에 건다. Spring Security 필터는 이 servlet 앞에서도 돈다.
- 도구 처리기는 요청 스레드가 아닌 곳에서 돌 수 있다. 인증된 `AgentPrincipal` 을 `SecurityContextHolder` 에서 읽지 말고, 전송의 context extractor 로 요청 속성에서 꺼내 `McpTransportContext` 에 담아 처리기에 넘긴다.
- 쓰기 도구의 범위 거절은 HTTP `403` 이 아니라 도구 오류 `INSUFFICIENT_SCOPE` 다. 연동 토큰에서는 다시 로그인할 방법이 없고, 모델이 사용자에게 다음 할 일을 말하게 하려는 것이다(계약의 「도구 오류」).
- `/mcp` 의 요청은 모두 `POST` 라서, `BearerTokenFilter` 의 「메서드로 쓰기를 가른다」 를 `/mcp` 에 그대로 쓰면 모든 요청이 쓰기 한도에 걸린다. `/mcp` 에서는 쓰기 한도를 도구 안에서 센다.
- 도구 이름과 칸 이름은 fos-assistant 커넥터와 같게 둔다. 바뀌는 것은 `types`, `level` 을 배열로 받는 것뿐이다.
- `/mcp` 는 OAuth 접근 토큰을 받지만 `/api/v1` 은 받지 않는다. `/api/v1` 의 필터는 연동 토큰만 그대로 받는다.

## 작업 항목

### 1. 의존성

- `api/gradle/libs.versions.toml`: `[versions] mcp = "2.1.0"`, `[libraries] mcp = { module = "io.modelcontextprotocol.sdk:mcp", version.ref = "mcp" }`.
- `api/build.gradle.kts`: `implementation(libs.mcp)`. SDK 가 끌어오는 Jackson 3 은 Spring Boot BOM 이 정한 버전을 따른다. `./gradlew dependencies --configuration runtimeClasspath | grep tools.jackson` 으로 한 버전만 남는지 본다.

### 2. `agent` 패키지의 공용화

- `api/src/main/kotlin/dev/fos/workbench/agent/AgentPrincipal.kt`: `val kind: ConnectionKind` 를 더한다. `enum class ConnectionKind { INTEGRATION_TOKEN, OAUTH }` 를 같은 파일에 둔다. OAuth 연결이면 `tokenId` 는 연결 `id`, `tokenName` 은 `clientName`, `last4` 는 빈 문자열이다.
- `IntegrationTokenService.authenticate` 가 `kind = INTEGRATION_TOKEN` 을 넘긴다.
- `BearerTokenFilter.kt`: 생성자를 `(authenticate: (String) -> AgentPrincipal?, limiter, writeLimiter: RateLimiter?, mapper)` 로 바꾼다. `writeLimiter` 가 null 이면 메서드로 쓰기 한도를 세지 않는다. `SecurityConfig.agentFilterChain` 은 `tokens::authenticate` 와 쓰기 한도를 넘겨 지금 동작을 그대로 둔다.
- `api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Inputs.kt`(신규): `AgentV1Controller` 의 `items(raw, key)`, `instant(value, field, errors)`, `requireWrite(principal)`, 체결 목록 조건 만들기(`tradeFilter(ticker, from, to): TradeFilter`)를 옮긴 `object V1Inputs`. 컨트롤러는 이것을 부른다. 동작과 오류 문구는 바꾸지 않는다. 기존 `AgentReadIntegrationTest`, `AgentWriteIntegrationTest` 가 그대로 통과해야 한다.

### 3. `oauth` 의 접근 토큰 확인

- `OAuthGrantRepository.findActiveByAccess(hash, resource, now): ActiveGrant?` 와 `touchLastUsed(grantId, now)`.
- `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthAccessTokenService.kt`: `authenticate(raw: String, resource: String): ActiveGrant?`(연결 id, 클라이언트 이름, 범위, 주인 id, 표시 이름, 역할). `fwa_` 형식이 아니면 null. `AgentPrincipal` 은 만들지 않는다.

### 4. `api/src/main/kotlin/dev/fos/workbench/mcp/` 새 패키지

- `McpAuthenticator.kt`: `authenticate(raw)` 가 `fwb_` 면 `IntegrationTokenService`, `fwa_` 면 `OAuthAccessTokenService`(자원은 `OAuthUrls.resource()`)로 보낸다. 둘 다 아니면 null. `OAuthAccessTokenService` 가 돌려준 `ActiveGrant` 를 여기서 `AgentPrincipal` 로 바꾼다(`oauth` 가 `agent` 에 기대지 않게 한다. `docs/code-architecture.md` 「API 패키지」).
- `McpSecurity.kt`: `/mcp` 의 인증 실패 응답(`401`, `WWW-Authenticate: Bearer resource_metadata="{base}/.well-known/oauth-protected-resource/mcp", scope="read write"`, 토큰을 보냈으면 `error="invalid_token"` 을 더한다. 본문은 `ApiError("UNAUTHENTICATED", "연결이 필요합니다. 앱에서 다시 로그인하세요.")`)과 `Origin` 검사 필터(헤더가 있고 `OAuthUrls.base()` 와 다르면 `403 FORBIDDEN`).
- `McpTools.kt`: 계약의 도구 표의 도구를 `McpStatelessServerFeatures.SyncToolSpecification` 으로 만든다(세션 없는 서버의 타입. 처리기는 `(McpTransportContext, CallToolRequest) -> CallToolResult`). 세션 있는 `McpServerFeatures` 를 쓰지 않는다. 각 도구는 이름, 제목(`title`), 한국어 설명(무엇을 하는지, 언제 쓰는지. fos-assistant 커넥터의 설명에서 HTTP 와 토큰 이야기를 빼고 비개발자 대화 기준으로 다듬는다), 입력 JSON Schema, `ToolAnnotations`(계약의 힌트 규칙)를 가진다. 처리기는 `McpTransportContext` 에서 `AgentPrincipal` 을 꺼내 서비스를 부르고, 결과 객체를 `JsonMapper` 로 직렬화해 `TextContent` 하나로 돌려준다. 쓰기 도구는 `V1Inputs.requireWrite` 를 먼저 부르고, 통과하면 `agentWriteRateLimiter.tryAcquire(principal.tokenId)` 로 센다. 넘으면 `RATE_LIMITED` 도구 오류(`details.retryAfterSeconds`)다. `get_connection` 은 `McpConnection` 을 돌려준다(DTO 는 이 패키지의 `McpDtos.kt`).
- `McpToolErrors.kt`: 처리기의 예외를 `GlobalExceptionHandler` 로 `ApiError` 로 바꿔 `isError = true` 결과로 만든다. `INSUFFICIENT_SCOPE` 의 문장은 계약의 「도구 오류」 표의 문장으로 바꾼다(`/api/v1` 의 문장과 다르다).
- `McpServerConfig.kt`: `HttpServletStatelessServerTransport.builder()` 에 `jsonMapper(JacksonMcpJsonMapper(<Spring 의 JsonMapper>))`(`io.modelcontextprotocol.json.jackson3`), `messageEndpoint("/mcp")`, `contextExtractor`(요청 속성의 `AgentPrincipal` 을 `McpTransportContext` 에 담는다)를 준다. `McpServer.sync(transport)` 는 `StatelessSyncSpecification` 을 돌려준다. 여기 에 `serverInfo("valuation-ontology", 버전)`, 제목 「가치투자 온톨로지」, 도구들을 등록한다. `ServletRegistrationBean(transport, "/mcp")`. `GET`, `DELETE` 가 `405` 인지 SDK 동작을 확인하고, 아니면 `McpSecurity` 의 필터에서 `405` 로 막는다.

### 5. `api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt`

`@Bean @Order(1) mcpFilterChain`: `securityMatcher("/mcp", "/mcp/**")`, `anyRequest().hasRole("VIEWER")`, CSRF 끄기, `STATELESS`, `RequestAttributeSecurityContextRepository`, `BearerTokenFilter(mcpAuthenticator::authenticate, agentRateLimiter, null, mapper)` 와 Origin 필터(`SecurityContextHolderFilter` 뒤, `BearerTokenFilter` 앞. 토큰이 없어도 `Origin` 이 틀리면 `403` 이다), 인증 실패 진입점은 `McpSecurity` 의 `401`, 권한 거절은 `403 FORBIDDEN`. 인증된 주체를 SDK context extractor 가 읽을 수 있게 요청 속성에도 둔다(`BearerTokenFilter` 가 `request.setAttribute(AgentPrincipal::class.java.name, principal)`).

### 6. 이 phase 를 검증하는 테스트 `api/src/test/kotlin/dev/fos/workbench/mcp/McpIntegrationTest.kt`

- 토큰 없이 `POST /mcp`(JSON-RPC `initialize`)는 `401` 이고 `WWW-Authenticate` 에 `resource_metadata="http://localhost:<port>/.well-known/oauth-protected-resource/mcp"` 와 `scope="read write"` 가 있다. 틀린 `fwa_` 토큰은 `error="invalid_token"` 이 더 있다.
- 토큰 없이 `Origin: https://evil.example` 을 붙인 요청은 `403`(Origin 검사가 인증보다 앞이다). 유효한 토큰을 붙인 `GET /mcp` 는 `405`(토큰이 없으면 체인이 먼저 `401` 을 낸다).
- OAuth 접근 토큰으로 SDK 클라이언트가 `initialize` 하면 서버 이름이 `valuation-ontology` 다. `tools/list` 에 계약 표의 도구 이름이 모두 있고, 각 도구에 한국어 설명과 `annotations` 가 있다. `record_trades`, `submit_proposals` 는 `readOnlyHint == false`, `destructiveHint == false` 이고 나머지는 `readOnlyHint == true` 다. 도구 수를 상수로 단언하지 않는다.
- `get_connection` 결과의 `connection.kind == "OAUTH"`, `connection.name` 이 등록한 앱 이름, `scope == "READ_WRITE"` 다.
- 연동 토큰(`fwb_`)으로도 `tools/call get_connection` 이 되고 `kind == "INTEGRATION_TOKEN"` 이다.
- `search_nodes` 가 `Fixtures` 로 만든 기업을 찾는다. `get_node` 에 없는 UUID 를 주면 `isError == true` 이고 `code == "NOT_FOUND"` 다.
- 「조회만」(`grantedScope = "READ"`) 연결로 `record_trades` 를 부르면 `isError == true`, `code == "INSUFFICIENT_SCOPE"` 이고 체결이 저장되지 않는다. 「조회와 기록」 연결로 같은 체결을 두 번 보내면 `created`, `existing` 이고, 그 체결의 `tokenId` 가 연결 id 다. 테스트가 `neo4j` 클라이언트로 `:Trade` 의 `tokenId` 를 읽어 단언한다.
- 사용자 A 가 MCP 로 기록한 체결은 사용자 B 의 연결로 부른 `list_my_trades` 결과에 없다.
- 연결을 끊은 뒤(`DELETE /api/me/connections/{id}`) 같은 접근 토큰은 `401` 이다. `accessExpiresAt` 을 과거로 고친 연결의 토큰도 `401` 이다.
- `/api/v1/me` 에 OAuth 접근 토큰을 보내면 `401` 이다(`/api/v1` 은 연동 토큰만 받는다).
- 요청 한도: `@Nested inner class` 와 `@TestPropertySource` 로 `workbench.agent.rate-limit-per-minute` 를 낮춘 곳에서 넘는 요청이 `429` 와 `Retry-After` 다.
- 쓰기 한도: 다른 nested 클래스에서 `workbench.agent.write-rate-limit-per-minute=2` 로 두고, 조회 도구를 세 번 넘게 불러도 통과한다(`/mcp` 는 메서드로 쓰기 한도를 세지 않는다). 세 번째 `record_trades` 는 `isError == true`, `code == "RATE_LIMITED"`, `details.retryAfterSeconds` 가 있다.

## 검증

```bash
cd api && ./gradlew test --rerun --tests 'dev.fos.workbench.mcp.*' --tests 'dev.fos.workbench.agent.*' --tests 'dev.fos.workbench.oauth.*'
cd api && ./gradlew test --rerun
cd api && ./gradlew dependencies --configuration runtimeClasspath | grep -E 'io.modelcontextprotocol|tools.jackson.core:jackson-databind'
```

기대값: 앞의 둘은 `BUILD SUCCESSFUL`. 세 번째는 `io.modelcontextprotocol.sdk:mcp:2.1.0` 이 보이고 `jackson-databind` 가 한 버전으로 해석된다(`->` 로 다른 버전에 끌려간 줄이 있으면 그 버전으로 테스트가 통과했는지 위 두 명령으로 확인한다).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `api/gradle/libs.versions.toml` | 수정 |
| `api/build.gradle.kts` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/agent/AgentPrincipal.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenService.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/agent/BearerTokenFilter.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Inputs.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentV1Controller.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthGrantRepository.kt` | 수정 |
| `api/src/main/kotlin/dev/fos/workbench/oauth/OAuthAccessTokenService.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpAuthenticator.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpSecurity.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpDtos.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpTools.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpToolErrors.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/mcp/McpServerConfig.kt` | 신규 |
| `api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/mcp/McpIntegrationTest.kt` | 신규 |
| `docs/code-architecture.md` | 수정(SDK 버전을 바꿀 때만) |
| `docs/adr/015-remote-mcp-oauth.md` | 수정(SDK 버전을 바꿀 때만) |
