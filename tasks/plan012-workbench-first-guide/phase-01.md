# Phase 01. 가이드 완료 기록 API

**Execution profile**: fast

## 목표

사용자마다 첫 접속 가이드를 끝냈거나 건너뛴 시각(`:User.guideDoneAt`)을 서버에 남기고, `GET /api/auth/me` 가 그 값을 돌려주게 한다.
다음 phase 의 화면이 이 값으로 가이드를 열지 정하고, 끝나면 `POST /api/auth/me/guide-done` 을 부른다.

**범위 외**: 화면(가이드, 말풍선, 사용법 단추)은 phase 02, 03 이다. 이 phase 는 `financial-workbench/web/` 을 고치지 않는다.

## 컨텍스트

- 사용자 모델은 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/auth/UserRepository.kt` 의 `data class UserRecord(id, email, displayName, role, enabled, googleSub, revision, createdAt, updatedAt, lastLoginAt)` 와 `UserRecord.from(map)` 이다. 갱신 함수는 `touchLogin(id)`(`SET u.lastLoginAt = $now`, `Timestamps.now()`), `bindGoogleSub(id, sub)` 처럼 Cypher 한 줄이고, 한 건을 읽는 도우미는 `private fun one(cypher, value, vararg extra)` 다.
- `auth/AuthController.kt` 의 `data class CurrentUser(val id, val email, val displayName, val role)` 를 `GET /api/auth/me` 가 돌려준다. `@AuthenticationPrincipal principal: WorkbenchPrincipal` 로 사용자 ID 를 얻는다.
- 보안 규칙은 `config/SecurityConfig.kt` 의 `requestMatchers` 순서다. `GET /api/**` 는 `VIEWER`, `/api/auth/logout` 은 `authenticated()`, 그 밖의 `/api/**` 는 `EDITOR` 다. 그래서 새 POST 끝점을 VIEWER 도 쓰려면 `/api/**` 규칙 앞에 따로 둬야 한다. CSRF 는 모든 쓰기에 그대로 걸린다.
- 통합 테스트는 `api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt`(`IntegrationTest` 상속)다. `loggedIn(VIEWER)` 로 로그인하고, `client.post(path)` 가 CSRF 토큰을 붙인다. 「CSRF 토큰 없는 쓰기는 로그인해도 거절한다」 테스트가 토큰 없이 보내는 방법(`send(..., withCsrf = false)`)을 보여 준다. 사용자 노드는 `neo4j`(`Neo4jClient`)로 직접 읽을 수 있다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「사용자」(`guideDoneAt`), `financial-workbench/docs/api-contract.md` 의 인증 표(`POST /api/auth/me/guide-done`)와 `CurrentUser`, `financial-workbench/docs/flow.md` 의 「첫 접속 가이드」, `financial-workbench/docs/code-architecture.md` 「결정」 의 첫 접속 가이드 항목

## 의도 메모

- 끝낸 기록은 서버에 둔다(사용자 결정 2026-10-23). 기기를 바꿔도 다시 열리지 않게 하려는 것이다.
- 화면 상태라 사용자 관리의 `revision`, `updatedAt`, `updatedBy` 를 바꾸지 않고 이력도 남기지 않는다. 관리자가 같은 사용자를 고치다 `409` 를 받지 않게 하려는 것이다.
- 한 번 쓰면 바꾸지 않는다(`coalesce`). 「사용법」 으로 다시 본 뒤 끝내도 처음 시각이 남는다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. 모델과 저장소

`auth/UserRepository.kt`

- `UserRecord` 에 `val guideDoneAt: String?` 을 더하고 `from` 이 `u["guideDoneAt"] as String?` 으로 읽는다.
- `fun markGuideDone(id: String): UserRecord?` 를 더한다. `MATCH (u:User {id: $v}) SET u.guideDoneAt = coalesce(u.guideDoneAt, $now) RETURN properties(u) AS u`. `revision`, `updatedAt`, `updatedBy` 는 건드리지 않는다.
- `UserRecord(...)` 를 직접 만드는 곳이 있으면 함께 고친다(`git grep -n "UserRecord(" -- financial-workbench/api/src` 로 찾는다).

### 2. API

`auth/AuthController.kt`

- `CurrentUser` 에 `val guideDoneAt: String?` 를 더하고 `me()` 가 채운다.
- `@PostMapping("/me/guide-done") fun guideDone(principal): CurrentUser`: `users.markGuideDone(principal.id)` 의 결과로 `CurrentUser` 를 돌려준다. 없으면 `me()` 와 같은 `IllegalStateException`.

`config/SecurityConfig.kt`

- `/api/**` 의 `EDITOR` 규칙 앞에 `.requestMatchers(HttpMethod.POST, "/api/auth/me/guide-done").authenticated()` 를 더한다. 열람자도 가이드를 끝낼 수 있어야 한다.

### 3. 이 phase 를 검증하는 테스트

`AuthIntegrationTest.kt` 에 「가이드 완료는 열람자도 기록하고 한 번만 쓴다」 를 더한다.

- 새로 만든 사용자로 시작하려면 테스트 안에서 `users.create("guide-<접미사>@example.com", "Guide", Role.VIEWER, "system")` 로 만들고 그 이메일로 `loggedIn` 한다. 다른 테스트가 같은 사용자의 기록을 이미 남겼을 수 있기 때문이다.
- `GET /api/auth/me` 의 `guideDoneAt` 이 `null` 이다.
- `POST /api/auth/me/guide-done` 이 `200` 이고 `guideDoneAt` 이 채워져 있다. 그 사용자 노드의 `revision`, `updatedAt` 은 호출 전과 같다.
- 한 번 더 부르면 `200` 이고 `guideDoneAt` 이 처음 값과 같다. `GET /api/auth/me` 도 같은 값이다.
- CSRF 토큰 없이 보내면 `403 CSRF_REJECTED`, 로그인하지 않으면 `401` 이다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.AuthIntegrationTest'
cd financial-workbench/api && ./gradlew test
```

- 각 줄은 저장소 루트에서 돈다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/auth/UserRepository.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/auth/AuthController.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/SecurityConfig.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt` | 수정 |
