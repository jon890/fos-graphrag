# Phase 03. `/api/v1` 쓰기 경로, 범위 확인, 쓰기 요청 한도

**Execution profile**: deep

## 목표

에이전트가 `POST /api/v1/trades`, `POST /api/v1/proposals` 로 쓰고 `GET /api/v1/trades`, `GET /api/v1/proposals` 로 자기 기록을 읽게 한다. 「조회만」 토큰의 쓰기는 `403 INSUFFICIENT_SCOPE`, 쓰기 요청은 토큰마다 1분에 10번이다. 두 사용자 사이에 체결과 제안이 `/api/v1` 어느 응답에도 섞이지 않음을 확인한다.

**범위 외**: 화면(phase 04, 05), 브라우저 테스트(phase 06).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/api-contract.md` 의 「에이전트 API(`/api/v1`)」 전체(특히 「인증」, 「공통 규칙」, 「요청 한도와 응답 크기」, 「경로」, `GET /api/v1/me`, 「쓰기」), 「오류 형식」(`INSUFFICIENT_SCOPE`, `RATE_LIMITED`), `financial-workbench/docs/flow.md` 의 「에이전트 쓰기」, `financial-workbench/docs/code-architecture.md` 의 「설정」(`workbench.agent.write-rate-limit-per-minute`), `financial-workbench/docs/adr/013-owner-trades-and-agent-proposals.md`.

경로는 모두 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/` 아래다.

- 컨트롤러: `agent/v1/AgentV1Controller.kt`(`@GetMapping` 만 있어 다른 메서드는 `GlobalExceptionHandler` 가 `405` 로 바꾼다). 주인은 `@AuthenticationPrincipal principal: AgentPrincipal`(phase 01 에서 `scope` 를 더했다).
- DTO: `agent/v1/V1Dtos.kt`(`V1NodeRef`, `V1Me`, `V1MeToken`. null 필드도 담는 `@JsonInclude(ALWAYS)`), 옮기기: `agent/v1/V1Mapper.kt`(`ref(NodeRef)`, `page(page, size)` 는 `size` 50 상한).
- 요청 한도: `agent/RateLimiter.kt`, `agent/BearerTokenFilter.kt`(인증 뒤 `limiter.tryAcquire(principal.tokenId)`, 넘으면 `429` 본문과 `Retry-After`), `config/SecurityConfig.kt` 의 `agentRateLimiter` 빈과 `agentFilterChain`.
- 설정: `config/WorkbenchProperties.kt` 의 `Agent(rateLimitPerMinute, maxTokensPerUser)`.
- 쓰기 서비스: phase 01 의 `trade/TradeService.save(ownerId, items, tokenId)`, `list`. phase 02 의 `proposal/ProposalService.submit(ownerId, tokenId, tokenName, items)`, `list`.
- 테스트: `support/ApiClient.kt` 의 `bearer(method, path, token, body)`(쿠키 없이 Bearer 만), 토큰 발급은 세션 `POST /api/me/tokens`. 기존 `agent/AgentAuthIntegrationTest.kt` 의 「v1 의 쓰기 메서드는 CSRF 없이도 405」 테스트는 `/api/v1/ontology` 를 쓰므로 그대로 통과해야 한다.

## 의도 메모

- 범위 확인은 컨트롤러 메서드 처음에 한다(`requireWrite(principal)`). 보안 설정의 경로 규칙으로 두면 `403` 의 `code` 가 `FORBIDDEN` 이 되어 계약의 `INSUFFICIENT_SCOPE` 와 다르다.
- 쓰기 한도는 두 번째 `RateLimiter` 빈(`agentWriteRateLimiter`, 키는 토큰 id)으로 센다. 필터에서 전체 한도를 통과한 뒤, 메서드가 `GET`, `HEAD`, `OPTIONS` 가 아니면 쓰기 한도를 센다. 넘으면 같은 `429` 본문이다. 두 빈을 이름으로 구분해 주입한다(`@Qualifier` 나 빈 메서드 이름).
- 범위 확인보다 한도가 먼저다. 「조회만」 토큰의 `POST` 도 쓰기 한도에 센다. 순서를 바꾸면 필터가 컨트롤러 규칙을 알아야 한다.
- 본문은 `Map<String, Any?>` 로 받아 `trades`, `proposals` 키만 꺼낸다. 다른 최상위 키가 있으면 `400 VALIDATION_FAILED` 다.
- v1 응답에서는 보관된 노드를 뺀다(계약 「공통 규칙」). `TradeView` 의 `security.archived`, `decisions[].archived` 가 `true` 인 것을 빼고 `V1Trade` 로 옮긴다.

## 작업 항목

### 1. `config/WorkbenchProperties.kt`, `config/SecurityConfig.kt`, `agent/BearerTokenFilter.kt`

- `Agent` 에 `writeRateLimitPerMinute: Int = 10`.
- `@Bean fun agentWriteRateLimiter(properties) = RateLimiter(properties.agent.writeRateLimitPerMinute)` 를 더하고 `agentFilterChain` 이 두 한도를 필터에 넘긴다.
- `BearerTokenFilter(tokens, limiter, writeLimiter, mapper)`. 429 응답 쓰기는 지금 코드를 함수로 꺼내 두 곳에서 쓴다.

### 2. `web/ApiError.kt`

```kotlin
class InsufficientScopeException : ApiException(HttpStatus.FORBIDDEN, "INSUFFICIENT_SCOPE", "이 토큰은 조회만 할 수 있습니다. 「조회와 기록」 토큰을 새로 발급하세요.")
```

### 3. `agent/v1/V1Dtos.kt`, `agent/v1/V1Mapper.kt`

- `V1Me` 에 `writeRateLimitPerMinute`, `V1MeToken` 에 `scope` 를 더한다.
- `V1Trade(id, broker, externalId, side, market, ticker, name, quantity, price, currency, amount, fee, executedAt, createdAt, security: V1NodeRef?, decisions: List<V1NodeRef>)`, `V1TradeResult(index, status, trade)`, `V1Proposal(id, kind, status, payload, rationale, evidence, dedupeKey, createdAt, decidedAt, decisionNote, result, lastError)`, `V1ProposalResult(index, status, proposal)`, `V1Results<T>(results: List<T>)`.
- `V1Mapper.trade(t: TradeView): V1Trade`(보관된 끝을 뺀다), `proposal(p: StoredProposal): V1Proposal`.

### 4. `agent/v1/AgentV1Controller.kt`

```kotlin
@PostMapping("/trades") fun saveTrades(@RequestBody body: Map<String, Any?>, @AuthenticationPrincipal principal: AgentPrincipal): V1Results<V1TradeResult>
@GetMapping("/trades") fun trades(ticker: String?, from: String?, to: String?, page: Int?, size: Int?, principal): Page<V1Trade>
@PostMapping("/proposals") fun submitProposals(@RequestBody body: Map<String, Any?>, principal): V1Results<V1ProposalResult>
@GetMapping("/proposals") fun proposals(status: String?, page: Int?, size: Int?, principal): Page<V1Proposal>
```

- 두 `POST` 는 `principal.scope != TokenScope.READ_WRITE` 면 `InsufficientScopeException` 을 먼저 던진다. 응답은 `200`.
- `trades` 의 `from`, `to` 는 `OffsetDateTime.parse` 로 읽어 UTC 초 문자열로 바꿔 `TradeFilter` 에 넣는다. 틀리면 `ValidationFailedException(mapOf("from" to ...))`. `ticker` 는 32자까지.
- `GET /me` 의 응답에 `scope` 와 `writeRateLimitPerMinute` 를 채운다.

### 5. 이 phase 를 검증하는 테스트

`agent/AgentWriteIntegrationTest.kt`(신규, `IntegrationTest` 상속). 토큰은 세션 `POST /api/me/tokens` 로 `scope` 를 골라 발급한다.

- 범위: `READ` 토큰의 `POST /api/v1/trades` 와 `POST /api/v1/proposals` 는 `403 INSUFFICIENT_SCOPE` 이고 체결이 생기지 않는다. 같은 토큰의 `GET /api/v1/trades` 는 `200`. `GET /api/v1/me` 의 `token.scope` 가 발급한 값이다.
- 저장과 멱등: `READ_WRITE` 토큰으로 체결 두 건을 보내면 `results[*].status` 가 `created`, 같은 본문을 다시 보내면 `existing` 이고 `GET /api/v1/trades` 의 `totalItems` 가 2 다. 두 요청을 `race` 로 동시에 보내도 2 다.
- 전부 또는 전무: 두 번째 항목의 `quantity` 가 `-1` 이면 `400`(`details.fieldErrors["trades[1].quantity"]`)이고 첫 항목도 저장되지 않는다. 최상위에 `accounts` 키가 있으면 `400`. 51건은 `400`.
- 조회 필터: `from`, `to`, `ticker` 로 좁힌 결과가 맞다. `from=2026-10-01` 처럼 오프셋 없는 값은 `400`(`fieldErrors.from`).
- 제안: `LINK_TRADE_DECISION` 을 올리면 `created`, `GET /api/v1/proposals?status=PENDING` 에 있다. 세션으로 거절한 뒤 `GET /api/v1/proposals?status=REJECTED` 에 `decisionNote` 가 보인다. 같은 `dedupeKey` 의 두 번째 올리기는 `existing`. 열람자(VIEWER)의 `READ_WRITE` 토큰도 체결과 제안을 쓴다.
- 쓰기 한도: `workbench.agent.write-rate-limit-per-minute` 기본값(10)에서 같은 토큰의 11번째 `POST` 는 `429 RATE_LIMITED` 와 `Retry-After` 다. 한도 테스트는 다른 테스트와 토큰을 나눠 쓴다.
- 두 사용자 분리: ALICE 의 토큰으로 체결과 제안을 쓴 뒤 BOB 의 토큰으로 `GET /api/v1/trades`, `GET /api/v1/proposals`, `GET /api/v1/nodes?q=<ticker>`, `GET /api/v1/nodes/{securityId}`, `GET /api/v1/nodes/{securityId}/trace`, `GET /api/v1/graph/neighborhood?id={securityId}&hops=2`, `GET /api/v1/securities/lookup?ticker=<ticker>`, `GET /api/v1/me/knowledge` 를 부르면 어느 응답 본문에도 ALICE 체결의 `externalId` 와 제안 `id` 가 없다. ALICE 의 토큰으로 BOB 의 체결 id 를 가리킨 `LINK_TRADE_DECISION` 은 `404` 다.
- 기존 동작: `POST /api/v1/ontology` 는 여전히 `405`, `POST /api/v1/unknown` 은 `404` 다(기존 테스트가 확인한다).

`agent/RateLimiterTest.kt` 는 바꾸지 않는다. 한도 판정 자체는 같은 클래스다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.agent.*'
cd financial-workbench/api && ./gradlew test --rerun
```

- `AgentWriteIntegrationTest` 와 기존 `AgentAuthIntegrationTest`, `AgentReadIntegrationTest`, `AgentLearningIntegrationTest` 가 모두 통과한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/WorkbenchProperties.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/BearerTokenFilter.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/ApiError.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Dtos.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/V1Mapper.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/agent/v1/AgentV1Controller.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/agent/AgentWriteIntegrationTest.kt` | 신규 |
