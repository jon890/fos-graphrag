# Phase 01. 서버 테스트를 JUnit 안의 Neo4j 와 가짜 OIDC 로 옮긴다

**Execution profile**: deep

## 목표

서버 통합 테스트가 Docker 없이 돌게 한다. Testcontainers 를 걷어내고 Neo4j 5.26 을 테스트 JVM 안에, 가짜 OIDC 공급자를 같은 JVM 안에 띄운다.

**범위 외**: 응답 스냅샷(phase 02), 웹과 화면 테스트(phase 03 이후), `compose.e2e.yml` 삭제(phase 05).

## 컨텍스트

- 지금 구조: `api/src/test/kotlin/dev/fos/workbench/support/TestcontainersConfig.kt` 가 `neo4j:5.26.30-community` 와 `ghcr.io/navikt/mock-oauth2-server:3.0.1` 컨테이너를 띄운다. `IntegrationTest.kt` 가 `@Import(TestcontainersConfig::class)` 와 `@DynamicPropertySource` 로 `MOCK_OIDC_BROWSER_URL`, `MOCK_OIDC_INTERNAL_URL` 을 넣고, Neo4j 접속은 `@ServiceConnection` 이 넣는다.
- `TestcontainersConfig` 를 참조하는 파일은 `IntegrationTest.kt` 하나다(`git grep -n TestcontainersConfig -- api` 로 다시 확인한다).
- 가짜 OIDC 의 경로는 `api/src/main/resources/application.yaml` 의 `mockoidc` 프로필이 `<url>/default/authorize`, `/default/token`, `/default/jwks` 로 정한다. 라이브러리의 `MockOAuth2Server.baseUrl()` 은 끝에 `/` 가 붙으므로 떼고 넘긴다.
- 사전 조사(2026-10-26)에서 확인한 사실:
  - `neo4j-harness:5.26.30` 을 `testImplementation` 에 넣으면 Spring Boot BOM 이 Netty 를 4.2.15 로 올려 Neo4j 가 `IllegalArgumentException: IoHandle of type LocalServerChannel$LocalServerUnsafe not supported` 로 시작하지 못한다. 앱의 Neo4j Java Driver 6.1 은 Netty 4.2 가 필요해 Netty 를 내릴 수도 없다.
  - 하네스를 BOM 이 없는 Gradle 설정으로 받고 그 jar 만 담은 `URLClassLoader`(부모 `ClassLoader.getPlatformClassLoader()`)에서 리플렉션으로 띄우면 전체 `./gradlew test --rerun` 이 `DOCKER_HOST=unix:///nonexistent.sock` 상태로 통과했다(108초). 같은 클래스로더에 두면 하네스의 `neo4j-slf4j-provider` 가 Logback 과 부딪혀 Spring 이 시작하지 못한다. 격리하면 이 문제도 없다.
  - `mock-oauth2-server:3.0.1`(Jackson 2, Netty 4.2.6)은 `testImplementation` 에 그대로 넣어도 충돌하지 않았다. 6.x 는 Jackson 3.2 를 요구해 BOM 의 Jackson 3.1.4 와 어긋난다.

**근거 문서**: `docs/code-architecture.md` 의 「테스트」 와 「JUnit 안의 Neo4j」, `docs/adr/018-tests-without-containers.md`

## 의도 메모

- 하네스를 같은 클래스로더에 두고 Netty 를 맞추는 안, Neo4j 2025 이후 하네스를 쓰는 안은 버렸다(ADR-018).
- 테스트 JVM 하나에 Neo4j 하나를 공유하는 지금 방식을 유지한다. 서버를 테스트 클래스마다 띄우면 시간이 늘어난다.
- `forkEvery` 나 병렬 실행 설정은 바꾸지 않는다.

## 작업 항목

### 1. 바꾸기 전 시간을 잰다

코드를 바꾸기 전에 `origin/main` 기준으로 `cd api && ./gradlew test --rerun` 을 Docker 를 켠 상태로 한 번 돌려 두 값을 잰다.
전체 시간은 명령 시작부터 끝까지다. 첫 테스트까지는 명령 시작부터 `api/build/test-results/test/*.xml` 의 테스트 클래스 가운데 가장 먼저 끝난 클래스(`timestamp` + `time`)까지다.
측정 스크립트는 세션 임시 폴더에 두고 커밋하지 않는다. 같은 방법으로 작업 항목 5 뒤에 다시 재고, 두 값을 `.orch/pr-body-plan021-tests-without-containers.md` 의 「시간 비교」 표에 적는다.
측정 뒤 Testcontainers 가 남긴 컨테이너가 없는지 `docker ps -a --filter label=org.testcontainers` 로 확인한다. 남았으면 그 컨테이너만 지운다.

### 2. `api/gradle/libs.versions.toml`

- `[versions]` 에 `neo4j-harness = "5.26.30"`(운영 이미지 `neo4j:5.26.30-community` 와 같은 패치), `mock-oauth2-server = "3.0.1"` 을 더한다.
- `[libraries]` 에서 `spring-boot-testcontainers`, `testcontainers-neo4j`, `testcontainers-junit` 을 지우고 `neo4j-harness = { module = "org.neo4j.test:neo4j-harness", version.ref = "neo4j-harness" }`, `mock-oauth2-server = { module = "no.nav.security:mock-oauth2-server", version.ref = "mock-oauth2-server" }` 를 더한다.

### 3. `api/build.gradle.kts`

- `val neo4jHarness by configurations.creating` 을 만들고 `neo4jHarness(libs.neo4j.harness)` 로 받는다. 이 설정은 `implementation` 을 상속하지 않아 BOM 을 받지 않는다.
- `testImplementation(libs.spring.boot.testcontainers)`, `testcontainers.neo4j`, `testcontainers.junit` 을 지우고 `testImplementation(libs.mock.oauth2.server)` 를 더한다.
- `tasks.withType<Test>` 에서 Colima 와 `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` 블록을 지운다. 대신 `inputs.files(neo4jHarness)` 와 `jvmArgumentProviders.add(CommandLineArgumentProvider { listOf("-Dneo4j.harness.classpath=${neo4jHarness.asPath}") })` 를 둔다. 왜 따로 받는지 한 줄 주석을 단다.

### 4. `api/src/test/kotlin/dev/fos/workbench/support/EmbeddedServers.kt`(신규)와 `TestcontainersConfig.kt`(삭제)

`object EmbeddedServers` 를 만든다.

- `fun startNeo4j(): String` 은 새 하네스를 띄우고 bolt URI 를 돌려준다. 시스템 속성 `neo4j.harness.classpath` 의 jar 로 `URLClassLoader` 를 만들고, `org.neo4j.harness.Neo4jBuilders.newInProcessBuilder()` 에 `GraphDatabaseSettings.transaction_timeout` 10초, `lock_acquisition_timeout` 5초(`java.time.Duration`)를 `withConfig(Setting, Object)` 로 주고 `withDisabledServer()` 뒤 `build()` 한다. `boltURI()` 를 문자열로 돌려준다. 띄운 서버는 JVM 종료 훅에서 `close()` 한다. 시스템 속성이 없으면 「`./gradlew test` 로 돌린다」 는 메시지로 실패한다.
- `val neo4jUri: String by lazy { startNeo4j() }` 는 통합 테스트가 나눠 쓰는 서버다. phase 02 의 스냅샷 테스트는 `startNeo4j()` 를 따로 불러 다른 서버를 쓴다.
- `val mockOidc: MockOAuth2Server by lazy { MockOAuth2Server(OAuth2Config(interactiveLogin = true)).also { it.start() } }` 와 `fun mockOidcUrl(): String = mockOidc.baseUrl().toString().trimEnd('/')`.
- 클래스 주석에 운영 Compose 와 같은 상한을 준다는 것과 격리 클래스로더를 쓰는 이유(Netty 4.1 과 4.2)를 적는다.

`TestcontainersConfig.kt` 는 지운다.

### 5. `api/src/test/kotlin/dev/fos/workbench/support/IntegrationTest.kt`

- `@Import(TestcontainersConfig::class)` 를 지운다.
- `properties` 의 `NEO4J_PASSWORD=placeholder-overridden-by-service-connection` 은 `NEO4J_PASSWORD=unused-auth-disabled` 로 바꾸고 주석을 「하네스는 인증이 꺼져 있어(`dbms.security.auth_enabled` 기본값 false) 이 비밀번호를 무시한다. placeholder 만 채운다」 로 고친다.
- `@DynamicPropertySource` 에 `spring.neo4j.uri` = `EmbeddedServers.neo4jUri` 를 더하고 OIDC 두 값은 `EmbeddedServers.mockOidcUrl()` 로 바꾼다. `spring.neo4j.authentication.kind` 같은 속성은 Spring Boot 4.1 에 없으니 넣지 않는다.
- 클래스 주석의 「실제 Neo4j, 가짜 OIDC 공급자」 를 「테스트 JVM 안의 Neo4j 와 가짜 OIDC 공급자」 로 고친다.

### 6. 기존 테스트가 그대로 통과하는지 본다

테스트 파일은 고치지 않는 것이 목표다. 동시성(`ConcurrencyIntegrationTest`), 트랜잭션 시간 제한과 일관성(`TransactionConsistencyIntegrationTest`), OAuth(`OAuthAuthorizationIntegrationTest`), 로그인(`AuthIntegrationTest`)이 바뀌지 않은 채 통과해야 한다.
테스트를 고쳐야 통과하면 고치기 전에 원인을 적고, 서버 동작이 컨테이너와 다른 것이면 `PHASE_BLOCKED` 로 멈춘다.

### 7. 문서

- `docs/code-architecture.md` 의 「버전」 표에서 `Testcontainers` 줄을 지우고 `Neo4j 테스트 하네스(neo4j-harness) | 5.26.30 | 운영 이미지와 같은 패치. BOM 밖의 Gradle 설정 neo4jHarness` 와 `가짜 OIDC 공급자 라이브러리(mock-oauth2-server) | 3.0.1 | 개발 Compose 의 이미지와 같은 버전` 줄을 더한다. 표 아래 「드라이버 6.1.0 과 Neo4j 5.26.30 의 조합은 Testcontainers 통합 테스트와 ...」 문장의 `Testcontainers 통합 테스트` 를 `JUnit 안의 Neo4j 통합 테스트` 로 고친다.
- `README.md` 의 「검증」 블록에서 `./gradlew test` 주석을 `# Docker 없이 테스트 JVM 안에 Neo4j 와 가짜 OIDC 공급자를 띄운다` 로 고치고, Colima 와 Testcontainers 소켓을 설명하는 문장을 지운다(`git grep -n "TESTCONTAINERS\|Colima"` 로 남은 곳을 찾는다). `README.md` 는 해요체로 쓰여 있으니 같은 문체로 고친다.
- `.orch/overlay.md` 의 「검증 명령」 서버 줄에 「Docker 없이 돈다」 를 덧붙인다.

## 검증

```bash
cd api && DOCKER_HOST=unix:///nonexistent.sock ./gradlew test --rerun
cd api && ! grep -rn "testcontainers\|Testcontainers" src/test build.gradle.kts gradle/libs.versions.toml
cd web && npm ci && npm run typecheck && npm test && npm run build
bash scripts/tests/test_scripts.sh
```

- 첫 줄은 Docker 에 붙을 수 없는 상태로 전체 서버 테스트가 통과해야 한다. 끝난 뒤 `docker ps -a --filter label=org.testcontainers` 가 비어 있다.
- 화면 테스트는 이 phase 에서 돌리지 않는다. 웹을 바꾸지 않았고, 화면 테스트는 phase 03 에서 가짜 API 로 옮긴 뒤부터 돈다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `api/gradle/libs.versions.toml` | 수정 |
| `api/build.gradle.kts` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/support/EmbeddedServers.kt` | 신규 |
| `api/src/test/kotlin/dev/fos/workbench/support/TestcontainersConfig.kt` | 삭제 |
| `api/src/test/kotlin/dev/fos/workbench/support/IntegrationTest.kt` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `README.md` | 수정 |
| `.orch/overlay.md` | 수정 |
