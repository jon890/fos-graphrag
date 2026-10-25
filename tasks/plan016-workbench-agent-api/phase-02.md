# Phase 02. `/api/v1` Bearer 인증, 요청 한도, `me` 와 `ontology`

**Execution profile**: deep

## 목표

`/api/v1/**` 를 맡는 두 번째 보안 필터 체인을 만들어 연동 토큰(`Authorization: Bearer`)으로만 인증하고, 토큰마다 1분에 60번으로 막는다. 연결 확인용 `GET /api/v1/me` 와 `GET /api/v1/ontology` 를 만든다. 인증 규칙 전체를 이 phase 의 통합 테스트로 확인한다.

**범위 외**: 나머지 v1 조회 경로(phase 03, 04), 화면(phase 05).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「에이전트 API(`/api/v1`)」 의 「인증」, 「공통 규칙」, 「요청 한도와 응답 크기」, 「공통 표현」, `GET /api/v1/me`, `GET /api/v1/ontology`, `financial-workbench/docs/flow.md` 의 「에이전트 조회」, `financial-workbench/docs/code-architecture.md` 의 「보안 기본값」(보안 필터 체인), 「API 패키지」(`agent`, `agent.v1`), `financial-workbench/docs/adr/012-agent-integration-token.md`.

- `config/SecurityConfig.kt` 의 `filterChain` 하나가 지금 모든 경로를 맡는다. `securityMatcher` 가 없다. Spring Security 는 `SecurityFilterChain` 빈을 `@Order` 순서로 보고 처음 맞는 체인 하나만 탄다. 새 체인에 `securityMatcher("/api/v1/**")` 와 `@Order(1)` 을, 기존 체인에 `@Order(2)` 를 붙인다.
- 기존 체인의 401 응답은 `ApiError("UNAUTHENTICATED", "로그인이 필요합니다.")` 를 `write(...)` 지역 함수로 쓴다. 새 체인도 같은 JSON 형식이다. 지역 함수와 보안 헤더 설정(CSP, Referrer-Policy, frame, HSTS)은 두 체인이 함께 쓰도록 private 함수로 꺼낸다.
- `auth/CurrentUserFilter.kt` 는 `SecurityConfig` 안에서 `new` 로 만든다(빈이 아니다). 새 `BearerTokenFilter` 도 그렇게 만든다. `@Component` 로 두면 Spring Boot 가 서블릿 필터로도 등록해 모든 요청에서 한 번 더 돈다.
- 역할: `auth/Role.kt` 의 `Role.authorities()`, 계층은 `SecurityConfig.roleHierarchy()`.
- 예외 처리기 `web/GlobalExceptionHandler.kt` 는 `HttpRequestMethodNotSupportedException` 을 `405 METHOD_NOT_ALLOWED`, `NoResourceFoundException` 을 `404 NOT_FOUND` 로 바꾼다. 컨트롤러에 `@GetMapping` 만 두면 쓰기 메서드는 405 가 된다.
- 온톨로지: `ontology/OntologyHolder.kt` 의 `current()` 와 `snapshotOrNull()?.version`(`OntologyVersionHeaderFilter` 가 쓰는 값). 모델은 `ontology/Ontology.kt` 의 `NodeTypeDef`, `PropertyDef`(`type.yaml` 이 `string` 같은 문자열), `RelationshipTypeDef`, `ClaimPredicateDef`.
- 테스트 클라이언트 `support/ApiClient.kt` 는 쿠키를 들고 다닌다. Bearer 헤더를 담는 길이 없어 이 phase 에서 더한다.

## 의도 메모

- 인증에 실패하면 필터는 인증을 넣지 않고 다음으로 넘긴다. 그러면 `AuthorizationFilter` 가 막고 새 체인의 진입점이 401 을 쓴다. 실패 이유를 응답으로 가르지 않는다.
- 세션은 `RequestAttributeSecurityContextRepository` 로 둔다. 세션 쿠키가 와도 읽지 않고 세션을 만들지 않는다. `sessionCreationPolicy(STATELESS)` 만으로는 저장소가 바뀌지 않는 버전이 있어 저장소를 직접 지정한다.
- 요청 한도는 인증에 성공한 뒤 센다. 인증 실패 요청으로 남의 토큰 한도를 깎을 수 없다.
- 마지막 사용 시각은 인증 때 읽은 값이 1분 넘게 지났을 때만 쓴다. 쓰기 실패는 `warn` 로그(토큰 id 만)로 끝낸다.
- `Authorization` 헤더 값과 원문은 로그에 남기지 않는다.

## 작업 항목

### 1. `agent/IntegrationTokenRepository.kt` 에 인증 조회와 사용 시각 쓰기를 더한다

```kotlin
/** 인증에 쓰는 토큰과 주인. 폐기했거나 주인이 비활성이면 찾지 않는다 */
data class ActiveToken(val tokenId: String, val tokenName: String, val last4: String, val lastUsedAt: String?, val userId: String, val displayName: String, val role: Role)

fun findActiveByHash(hash: String): ActiveToken?
fun touchLastUsed(tokenId: String, now: String)
```

`findActiveByHash`: `MATCH (u:User)-[:OWNS]->(t:IntegrationToken {hash: $hash}) WHERE t.revokedAt IS NULL AND u.enabled = true AND u.email IS NOT NULL RETURN ...`. `role` 은 `Role.parse(...) ?: Role.VIEWER`(`UserRecord.from` 과 같다).

### 2. `agent/IntegrationTokenService.kt` 에 `authenticate` 를 더한다

```kotlin
/** 원문 형식, 해시, 폐기, 주인 활성을 확인한다. 실패하면 null. 성공하면 1분이 지났을 때만 lastUsedAt 을 쓴다 */
fun authenticate(raw: String): AgentPrincipal?
```

- 형식이 틀리면(`IntegrationTokens.isWellFormed`) DB 를 읽지 않고 `null`.
- `lastUsedAt` 이 `null` 이거나 `Timestamps.now()` 기준 60초보다 오래됐으면 `touchLastUsed` 를 `try` 안에서 부른다. 실패는 `log.warn("연동 토큰 {} 의 마지막 사용 시각을 쓰지 못했다", tokenId)`.
- 읽기와 쓰기는 각자 짧은 트랜잭션이다. `TransactionTemplate` 이나 저장소 메서드의 `@Transactional` 로 둔다. 서비스 메서드 전체를 하나의 쓰기 트랜잭션으로 묶지 않는다.

### 3. `agent/AgentPrincipal.kt`

```kotlin
/** 연동 토큰으로 인증한 요청의 주인. 역할은 요청마다 Neo4j 에서 다시 읽은 값이다 */
data class AgentPrincipal(val userId: String, val displayName: String, val role: Role, val tokenId: String, val tokenName: String, val last4: String)
```

### 4. `agent/RateLimiter.kt`

```kotlin
/** 키마다 60초 고정 창으로 센다. 프로세스 메모리에만 있다(docs/code-architecture.md 의 작은 결정) */
class RateLimiter(private val limitPerMinute: Int, private val clock: Clock = Clock.systemUTC()) {
    data class Decision(val allowed: Boolean, val retryAfterSeconds: Long)
    fun tryAcquire(key: String): Decision
}
```

- `ConcurrentHashMap<String, Window(startMillis, count)>` 의 `compute` 로 원자적으로 센다. 창이 끝났으면(지금 - 시작 ≥ 60000) 새 창으로 덮어쓴다.
- 넘으면 `allowed = false`, `retryAfterSeconds` 는 창 끝까지 남은 초를 올림한 값(최소 1)이다.
- 빈으로 둔다: `SecurityConfig` 에 `@Bean fun agentRateLimiter(properties: WorkbenchProperties) = RateLimiter(properties.agent.rateLimitPerMinute)`.

### 5. `agent/BearerTokenFilter.kt`

`OncePerRequestFilter`. 생성자 `(tokens: IntegrationTokenService, limiter: RateLimiter, mapper: JsonMapper)`.

1. `Authorization` 헤더가 `Bearer ` 로 시작하지 않으면 그대로 `chain.doFilter`.
2. `tokens.authenticate(header.removePrefix("Bearer ").trim())` 가 `null` 이면 그대로 `chain.doFilter`(진입점이 401).
3. `limiter.tryAcquire(principal.tokenId)` 가 막으면 `429`, 헤더 `Retry-After`, 본문 `ApiError("RATE_LIMITED", "요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.", mapOf("retryAfterSeconds" to n))` 를 쓰고 끝낸다.
4. `UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.role.authorities())` 를 새 `SecurityContext` 에 넣고 `chain.doFilter`.

### 6. `config/SecurityConfig.kt`

- `@Bean @Order(1) fun agentFilterChain(http, mapper, tokens: IntegrationTokenService, limiter: RateLimiter, properties)`:
  - `securityMatcher("/api/v1/**")`
  - `authorizeHttpRequests { it.anyRequest().hasRole("VIEWER") }`
  - `csrf { it.disable() }`, `sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }`, `securityContext { it.securityContextRepository(RequestAttributeSecurityContextRepository()) }`, `requestCache { it.disable() }`, `formLogin`, `httpBasic`, `logout` 비활성.
  - `addFilterAfter(BearerTokenFilter(tokens, limiter, mapper), SecurityContextHolderFilter::class.java)`
  - 진입점: `401 ApiError("UNAUTHENTICATED", "연동 토큰이 없거나 올바르지 않습니다.")`. 거부 처리: `403 FORBIDDEN`(기존 문구).
  - 보안 헤더는 기존 체인과 같은 private 함수로 건다.
- 기존 `filterChain` 에 `@Order(2)`.
- 기존 체인의 동작(경로 규칙, OAuth, CSRF)은 바꾸지 않는다.

### 7. `agent/v1/V1Dtos.kt`, `agent/v1/V1Mapper.kt`, `agent/v1/AgentV1Controller.kt`

DTO 이름과 필드는 `docs/api-contract.md` 「에이전트 API(`/api/v1`)」 와 같다. 이 phase 에서는 아래만 만든다.

- `V1NodeRef(id, type, typeLabel, label)`, `V1Me(user: V1MeUser(id, displayName, role), token: V1MeToken(id, name, last4), rateLimitPerMinute)`, `V1Ontology(version, nodeTypes: List<V1NodeType>, relationshipTypes: List<V1RelationshipType>, claimPredicates: List<V1ClaimPredicate>)`, `V1NodeType(key, label, description, labelProperty, properties: List<V1PropertyDef>)`, `V1PropertyDef(key, label, type, required, description, values: List<V1EnumValue>?)`, `V1EnumValue(value, label)`, `V1RelationshipType(key, label, description, from, to, sentence)`, `V1ClaimPredicate(key, label, description, subjectTypes, objectTypes, sentence)`.
- null 필드도 키를 담는다(`@JsonInclude(JsonInclude.Include.ALWAYS)`, `knowledge/Dtos.kt` 의 `NodeView` 와 같다).
- `V1Mapper`(`@Component`, `OntologyHolder` 주입): `typeLabel(type)`(표시 이름이 없으면 키), `ref(id, type, label)`, `ontology(): V1Ontology`(정의 순서 그대로, `label` 이 없으면 키, `values` 는 `enum` 일 때만 `valueLabels` 로 채운 목록), `sentence(type, fromLabel, toLabel): String`(틀의 `{from}`, `{to}` 를 바꾼다. 틀이 없으면 `"$from -[${label ?: type}]-> $to"`). `sentence` 는 phase 03 이 쓴다.
- `AgentV1Controller`(`@RestController @RequestMapping("/api/v1")`): `@GetMapping("/me")`, `@GetMapping("/ontology")`. 주인은 `@AuthenticationPrincipal principal: AgentPrincipal`. `version` 은 `OntologyHolder.snapshotOrNull()?.version`.

### 8. `support/ApiClient.kt` 에 Bearer 요청을 더한다

`send` 에 `headers: Map<String, String> = emptyMap()` 인자를 더해 요청에 싣는다. 도우미 `fun bearer(method: String, path: String, token: String?, body: Any? = null): Response` 는 쿠키 없이(새 `HttpClient` 나 쿠키 저장소를 쓰지 않는 클라이언트로) `Authorization: Bearer $token` 만 담아 보낸다. `token` 이 `null` 이면 헤더를 넣지 않는다. 기존 호출부는 그대로 동작한다.

### 9. 이 phase 를 검증하는 테스트

`api/src/test/kotlin/dev/fos/workbench/agent/RateLimiterTest.kt`(Neo4j 없음): 고정 `Clock` 을 바꿔 가며 확인한다. 한도 3 에서 세 번은 허용, 네 번째는 거부와 `retryAfterSeconds` 가 남은 초, 60초 뒤 다시 허용, 키가 다르면 따로 센다.

`api/src/test/kotlin/dev/fos/workbench/agent/AgentAuthIntegrationTest.kt`(`IntegrationTest` 상속, 토큰은 `newUser` 로 만든 사용자가 `POST /api/me/tokens` 로 발급):

- 정상: 토큰으로 `GET /api/v1/ontology` 는 `200`, `version` 이 정수, `nodeTypes` 에 `key = "Decision"` 이 있고 그 `properties` 의 `action` 은 `type = "enum"` 과 `values` 에 `{"value":"BUY","label":"매수"}` 가 있다. `relationshipTypes` 의 `HAS_DECISION` 의 `sentence` 가 저장소 YAML 의 값과 같다. 응답에 `display`, `createPicker`, `valueAliases` 키가 없다. `GET /api/v1/me` 는 `user.displayName`, `token.name`, `token.last4`, `rateLimitPerMinute = 60`.
- 사용 시각: 처음 쓴 뒤 `GET /api/me/tokens`(세션) 의 그 토큰 `lastUsedAt` 이 `null` 이 아니다.
- 401: 헤더 없음, `Bearer` 뒤 빈 값, `Basic abc`, 형식이 틀린 값(`fwb_short`), 형식은 맞지만 없는 토큰(`fwb_` 뒤에 `A` 43자)이 모두 `401 UNAUTHENTICATED` 이고 `message` 가 같다.
- 폐기: 폐기한 토큰은 `401`.
- 비활성 사용자: 관리자(`loggedIn(ADMIN)`)가 `PATCH /api/users/{id}`(`expectedRevision`, `enabled=false`)로 토큰 주인을 비활성화하면 그 토큰은 `401`. 다시 활성화하면 `200`.
- 세션 쿠키만: `loggedIn(newUser(...))` 의 세션 클라이언트로 `get("/api/v1/ontology")` 는 `401` 이다.
- 토큰으로 세션 API: `bearer("GET", "/api/nodes", token)` 와 `bearer("GET", "/api/me/tokens", token)` 은 `401` 이다.
- 쓰기 메서드: 토큰으로 `POST /api/v1/ontology`(본문 `{}`)는 `405 METHOD_NOT_ALLOWED`, `DELETE /api/v1/me` 도 `405`, `POST /api/v1/unknown`(본문 `{}`)은 `404`. CSRF 토큰 없이 보냈는데도 `403` 이 아니다.
- 한도: 새 토큰으로 `GET /api/v1/me` 를 60번 부르면 모두 `200`, 61번째는 `429 RATE_LIMITED`, `Retry-After` 헤더가 1 이상 60 이하 정수, `details.retryAfterSeconds` 가 같다. 같은 주인의 다른 토큰은 그 순간에도 `200` 이다.
- 세션 체인이 그대로다: 기존 `AuthIntegrationTest` 와 다른 통합 테스트가 전체 실행에서 통과한다.

`./gradlew test` 는 `src/test/kotlin` 아래 모든 테스트를 돈다. `--tests` 로 이 phase 의 테스트를 먼저 돌린 뒤 전체를 돈다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.agent.*'
cd financial-workbench/api && ./gradlew test --rerun
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenRepository.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenService.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/AgentPrincipal.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/RateLimiter.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/BearerTokenFilter.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Dtos.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Mapper.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentV1Controller.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/ApiClient.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/agent/RateLimiterTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/agent/AgentAuthIntegrationTest.kt` | 신규 |
