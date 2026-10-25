# Phase 01. 연동 토큰 저장과 발급, 폐기 API

**Execution profile**: standard

## 목표

`(:User)-[:OWNS]->(:IntegrationToken)` 저장 모델과 세션 API `GET/POST /api/me/tokens`, `DELETE /api/me/tokens/{id}` 를 만든다. 다음 phase 의 Bearer 인증이 이 저장소로 토큰을 찾는다.

**범위 외**: `/api/v1` 인증 필터와 요청 한도(phase 02), v1 조회 경로(phase 03, 04), 화면(phase 05).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「연동 토큰」, 「제약 조건과 인덱스」, `financial-workbench/docs/api-contract.md` 의 「연동 토큰」, 「오류 형식」(`TOKEN_LIMIT`), 「상한」, `financial-workbench/docs/code-architecture.md` 의 「API 패키지」(`agent`), 「설정」, `financial-workbench/docs/adr/012-agent-integration-token.md`.

- 루트 패키지는 `dev.fos.workbench` 다. 새 패키지 `agent` 를 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/` 에 만든다.
- 저장소 패턴은 `auth/UserRepository.kt`(Neo4jClient, `params(...)`, `properties(u) AS u`)를 따른다. 사용자 노드 잠금 뒤 쓰기는 `learning/KnowledgeMarkService.kt` 의 `put`(`SET u._lock = true ... REMOVE u._lock`, `@Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)`)을 따른다.
- 컨트롤러는 `learning/KnowledgeMarkController.kt` 처럼 `@AuthenticationPrincipal user: WorkbenchPrincipal` 의 `user.id` 로만 사용자를 정한다.
- 보안: `config/SecurityConfig.kt` 의 `.requestMatchers("/api/me/**").hasRole("VIEWER")` 가 이미 이 경로를 모든 역할에 연다. 쓰기는 기존 CSRF 규칙을 탄다. 이 phase 에서 `SecurityConfig` 는 고치지 않는다.
- 제약 조건은 `config/Neo4jSchemaInitializer.kt` 의 `STATEMENTS` 목록에 더한다.
- 시각은 `config/Timestamps.kt` 의 `Timestamps.now()` 다.
- 오류 예외는 `web/ApiError.kt` 의 `ApiException` 하위 클래스로 만든다.
- 설정 속성은 `config/WorkbenchProperties.kt` 의 data class 다. `@ConfigurationProperties("workbench")`.

## 의도 메모

- 폐기는 지우지 않고 `revokedAt` 을 쓴다. 지우면 운영자가 「언제 폐기했나」 를 볼 수 없다.
- 5개 상한은 사용자 노드를 잠근 뒤 센다. 잠금 없이 세면 동시 발급이 6개를 만든다(가계부 ADR-B18 이 감당한 문제를 여기서는 막는다).
- 원문은 응답에만 싣고 로그에 남기지 않는다. 예외 메시지와 로그 인자에도 넣지 않는다.
- ChangeEvent 를 남기지 않는다. 이력 화면은 다른 사용자도 보고, 토큰은 개인 설정이다.

## 작업 항목

### 1. `config/WorkbenchProperties.kt` 에 `agent` 설정을 더한다

```kotlin
val agent: Agent = Agent(),

data class Agent(
    /** 연동 토큰 하나가 1분에 부를 수 있는 /api/v1 요청 수 */
    val rateLimitPerMinute: Int = 60,
    /** 사용자마다 폐기하지 않은 연동 토큰 수 */
    val maxTokensPerUser: Int = 5,
)
```

### 2. `config/Neo4jSchemaInitializer.kt` 의 `STATEMENTS` 에 둘을 더한다

```
"CREATE CONSTRAINT integration_token_id_unique IF NOT EXISTS FOR (t:IntegrationToken) REQUIRE t.id IS UNIQUE",
"CREATE CONSTRAINT integration_token_hash_unique IF NOT EXISTS FOR (t:IntegrationToken) REQUIRE t.hash IS UNIQUE",
```

`seed_run_key_unique` 앞에 둔다(문서 표 순서와 같다).

### 3. `web/ApiError.kt` 에 `TokenLimitException` 을 더한다

```kotlin
class TokenLimitException(max: Int) :
    ApiException(HttpStatus.CONFLICT, "TOKEN_LIMIT", "토큰은 ${max}개까지 만들 수 있습니다. 쓰지 않는 토큰을 폐기하세요.", mapOf("max" to max))
```

### 4. `agent/IntegrationTokens.kt`: 원문 만들기와 해시

```kotlin
object IntegrationTokens {
    const val PREFIX = "fwb_"
    private val FORMAT = Regex("^fwb_[A-Za-z0-9_-]{43}$")
    fun generate(): String   // SecureRandom 32바이트, Base64.getUrlEncoder().withoutPadding()
    fun isWellFormed(raw: String): Boolean = FORMAT.matches(raw)
    fun hash(raw: String): String  // MessageDigest SHA-256, 소문자 16진수 64자
    fun last4(raw: String): String = raw.takeLast(4)
}
```

### 5. `agent/IntegrationTokenRepository.kt`

DTO 는 같은 파일에 둔다.

```kotlin
@JsonInclude(JsonInclude.Include.ALWAYS)
data class IntegrationTokenView(val id: String, val name: String, val last4: String, val createdAt: String, val lastUsedAt: String?)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class IssuedIntegrationToken(@get:JsonUnwrapped val view: IntegrationTokenView, val token: String)

data class IssueTokenRequest(val name: String? = null)
```

`JsonUnwrapped` 는 `knowledge/Dtos.kt` 의 `ClaimView` 가 쓰는 `com.fasterxml.jackson.annotation.JsonUnwrapped` 다.

메서드:

- `list(userId): List<IntegrationTokenView>`: `MATCH (:User {id: $userId})-[:OWNS]->(t:IntegrationToken) WHERE t.revokedAt IS NULL RETURN properties(t) AS t ORDER BY t.createdAt, t.id`.
- `countActiveLocked(userId): Long?`: 사용자 노드에 `SET u._lock = true` 를 걸고 폐기하지 않은 토큰 수를 센다. 사용자가 없으면 `null`.
- `create(userId, name, hash, last4): IntegrationTokenView`: `MATCH (u:User {id: $userId}) CREATE (u)-[:OWNS]->(t:IntegrationToken) SET t = $props REMOVE u._lock RETURN properties(t) AS t`. `id` 는 `UUID.randomUUID()`, `createdAt` 은 `Timestamps.now()`.
- `revoke(userId, tokenId): Boolean`: `MATCH (:User {id: $userId})-[:OWNS]->(t:IntegrationToken {id: $tokenId}) WHERE t.revokedAt IS NULL SET t.revokedAt = $now RETURN t.id AS id`. 바뀐 것이 없으면 `false`.

phase 02 가 같은 저장소에 `findActiveByHash`, `touchLastUsed` 를 더한다.

### 6. `agent/IntegrationTokenService.kt`

```kotlin
@Service
class IntegrationTokenService(private val tokens: IntegrationTokenRepository, private val properties: WorkbenchProperties) {
    @Transactional(readOnly = true) fun list(userId: String): List<IntegrationTokenView>
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS) fun issue(userId: String, body: IssueTokenRequest): IssuedIntegrationToken
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS) fun revoke(userId: String, tokenId: String)
}
```

- `issue`: `name` 을 trim 하고 비었거나 50자를 넘으면 `ValidationFailedException(mapOf("name" to "1자 이상 50자 이하여야 합니다."))`. `countActiveLocked` 가 `properties.agent.maxTokensPerUser` 이상이면 `TokenLimitException`. `null`(사용자 노드 없음)이면 `IllegalStateException("사용자를 찾을 수 없다: $userId")` 를 던진다. 세션 필터가 지운 사용자를 이미 막으므로 정상 흐름에서는 나오지 않는다. `IntegrationTokens.generate()` 로 원문을 만들고 해시와 끝 네 글자를 저장한다.
- `revoke`: `revoke` 가 `false` 면 `NotFoundException(tokenId)`.
- 클래스 주석에 「원문은 발급 응답에만 싣는다. 이력을 남기지 않는다(docs/data-schema.md 「연동 토큰」)」 를 적는다.

### 7. `agent/IntegrationTokenController.kt`

```kotlin
@RestController
@RequestMapping("/api/me/tokens")
class IntegrationTokenController(private val tokens: IntegrationTokenService) {
    @GetMapping fun list(@AuthenticationPrincipal user: WorkbenchPrincipal): List<IntegrationTokenView>
    @PostMapping @ResponseStatus(HttpStatus.CREATED) fun issue(@RequestBody body: IssueTokenRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): IssuedIntegrationToken
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) fun revoke(@PathVariable id: String, @AuthenticationPrincipal user: WorkbenchPrincipal)
}
```

### 8. 테스트 지원: `support/IntegrationTest.kt` 에 새 사용자 도우미

토큰 상한(5개)이 같은 Spring 컨텍스트의 테스트끼리 섞이지 않게, 토큰 테스트는 고정 사용자(`ALICE` 등) 대신 새 사용자를 쓴다.

```kotlin
/** 실행마다 다른 이메일의 허용 사용자를 만들고 그 이메일을 돌려준다 */
fun newUser(role: Role, name: String = "새사용자"): String {
    val email = "u-${UUID.randomUUID().toString().take(8)}@example.com"
    users.create(email, name, role, "system")
    return email
}
```

### 9. 이 phase 를 검증하는 `api/src/test/kotlin/dev/fos/workbench/agent/IntegrationTokenIntegrationTest.kt`

`IntegrationTest` 를 상속한다. 각 테스트는 `newUser` 로 만든 사용자로 `loggedIn` 한다.

- 발급: 열람자(`Role.VIEWER`)가 `POST /api/me/tokens {"name":"  Hermes  "}` 하면 `201`, `name` 이 `Hermes`, `token` 이 `^fwb_[A-Za-z0-9_-]{43}$`, `last4` 가 `token` 의 끝 네 글자, `lastUsedAt` 이 `null` 이다. Neo4j 의 `(:IntegrationToken {id})` 에 `hash` 가 `IntegrationTokens.hash(token)` 과 같고, 원문 문자열을 담은 속성이 없다(`properties(t)` 의 값 가운데 `token` 과 같은 것이 없다).
- 목록: 응답 배열에 그 토큰이 있고 `token` 필드가 없다.
- 다른 사용자: 두 번째 새 사용자의 `GET /api/me/tokens` 는 빈 배열이고, 그 사용자가 첫 사용자의 토큰 id 로 `DELETE` 하면 `404 NOT_FOUND` 다. 첫 사용자의 목록에는 그 토큰이 남는다.
- 폐기: 주인이 `DELETE` 하면 `204`, 목록에서 빠지고 Neo4j 에 `revokedAt` 이 있다. 같은 id 로 다시 `DELETE` 하면 `404`.
- 이름 검사: `{"name":"   "}` 와 51자 이름은 `400 VALIDATION_FAILED`, `details.fieldErrors.name` 이 있다.
- 상한: 다섯 번 발급한 뒤 여섯 번째는 `409 TOKEN_LIMIT`, `details.max` 가 5 다. 하나를 폐기하면 다시 발급된다.
- 동시 발급: 토큰 넷을 가진 새 사용자가 `race` 로 발급 두 개를 동시에 보내면 상태가 하나는 `201`, 하나는 `409` 이고 폐기하지 않은 토큰은 5개다.
- CSRF: `send("POST", "/api/me/tokens", mapOf("name" to "x"), withCsrf = false)` 는 `403 CSRF_REJECTED` 다.
- 로그인 없이 `GET /api/me/tokens` 는 `401 UNAUTHENTICATED` 다.
- 발급과 폐기 뒤에 ADMIN 의 `GET /api/changes?targetId=<토큰 id>` 의 `totalItems` 가 0 이다(`ConcurrencyIntegrationTest.kt` 의 이력 조회 패턴).

`./gradlew test` 는 `src/test/kotlin` 아래 모든 테스트를 돈다(`api/build.gradle.kts` 의 기본 `test`). `--tests` 로 이 phase 의 테스트를 먼저 돌린 뒤 전체를 돈다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.agent.IntegrationTokenIntegrationTest'
cd financial-workbench/api && ./gradlew test --rerun
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/WorkbenchProperties.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/ApiError.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokens.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenRepository.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/IntegrationTokenController.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/IntegrationTest.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/agent/IntegrationTokenIntegrationTest.kt` | 신규 |
