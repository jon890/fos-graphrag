# Phase 01. API 뼈대, 온톨로지 검증, 인증

**Execution profile**: deep
**Status**: completed

## 목표

`financial-workbench/api` Gradle 프로젝트를 만들고, 온톨로지 로딩과 검증, 세션 로그인, CSRF, health, 온톨로지 조회 API 를 구현한다.
이후 phase 의 모든 API 가 이 인증과 오류 형식 위에 올라간다.

**범위 외**: 노드와 Claim 쓰기(Phase 02), 조회(Phase 03), 웹(Phase 04), Compose(Phase 05).

## 컨텍스트

- 버전과 패키지 배치는 `financial-workbench/docs/code-architecture.md` 의 「버전」, 「API 패키지」, 「설정」 절을 따른다.
- Gradle Wrapper 8.14.3 은 `java-agent-lab/gradlew`, `java-agent-lab/gradle/wrapper/` 를 복사해 쓴다. `java-agent-lab` 은 고치지 않는다.
- 버전 카탈로그 형식은 `java-agent-lab/gradle/libs.versions.toml` 을 따른다.
- 오류 형식과 인증 경로는 `financial-workbench/docs/api-contract.md` 의 「인증과 CSRF」, 「오류 형식」 절이다.
- 사용자와 제약 조건은 `financial-workbench/docs/data-schema.md` 의 「사용자」, 「제약 조건과 인덱스」 절이다.

**근거 문서**: `financial-workbench/docs/adr/001-kotlin-spring-neo4jclient.md`, `financial-workbench/docs/adr/004-session-csrf-same-origin.md`, `financial-workbench/docs/adr/005-ontology-yaml-server-validation.md`

## 의도 메모

- 온톨로지 파일은 `processResources` 가 `../ontology/financial-ontology.yaml` 을 classpath 루트로 복사한다. 사본을 저장소에 두지 않는다.
- Testcontainers 는 Spring Boot `@ServiceConnection` 으로 `Neo4jContainer("neo4j:5.26.30-community")` 를 연결한다. 테스트 클래스마다 컨테이너를 새로 띄우지 않게 공용 설정 하나를 둔다.
- `NEO4J_PASSWORD` 기본값을 두지 않는다. 테스트는 ServiceConnection 이 값을 채운다.

## Blocked 조건

- Docker 데몬이 응답하지 않음 → `PHASE_BLOCKED: Testcontainers 가 Docker 에 연결하지 못함`

## 작업 항목

### 1. Gradle 프로젝트

`financial-workbench/api/settings.gradle.kts`, `build.gradle.kts`, `gradle/libs.versions.toml`, Wrapper.
Kotlin JVM, `plugin.spring`, Spring Boot 플러그인. 의존성: `spring-boot-starter-webmvc`, `spring-boot-starter-security`, `spring-boot-starter-data-neo4j`, `spring-boot-starter-validation`, `jackson-module-kotlin`, `jackson-dataformat-yaml`, 테스트에 `spring-boot-starter-test`, `spring-boot-testcontainers`, `testcontainers-neo4j`, `testcontainers-junit-jupiter`.

### 2. 온톨로지

`ontology/Ontology.kt`, `OntologyLoader.kt`, `OntologyValidator.kt`. `Ontology.requireNodeType()`, `requireRelationshipType()` 이 허용 목록 밖의 이름에 `OntologyViolationException` 을 던진다.
검증기는 속성 이름, 타입, 필수 여부, enum 값, 길이, 숫자 범위, 날짜 형식, URL 형식을 본다.

### 3. 인증

`auth/UserRepository.kt`, `Neo4jUserDetailsService.kt`, `AuthController.kt`(`/api/auth/csrf`, `/login`, `/logout`, `/me`), `UserAddCommand.kt`(`user-add <username> <displayName>`, 비밀번호는 `WORKBENCH_USER_PASSWORD`, 12자 이상).
`config/SecurityConfig.kt`: `/api/health`, `/api/auth/csrf`, `/api/auth/login`, 정적 파일만 허용. 미인증은 `401 UNAUTHENTICATED` JSON. CSRF 실패는 `403 CSRF_REJECTED` JSON.

### 4. 공통

`config/Neo4jSchemaInitializer.kt`(제약 조건과 인덱스), `web/ApiError.kt`, `web/GlobalExceptionHandler.kt`, `web/HealthController.kt`, `ontology/OntologyController.kt`(`GET /api/ontology`).

### 5. 테스트

- `api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt`: 정상 Company 속성 통과. 없는 타입, 없는 속성, 잘못된 enum, 필수 누락, 잘못된 날짜를 각각 거절.
- `api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt`: 실제 Neo4j. 미인증 `GET /api/ontology` 가 401. CSRF 없는 로그인이 403. 올바른 로그인 뒤 `GET /api/ontology` 가 200 이고 `schemaVersion` 이 `1.0.0`. 틀린 비밀번호가 401 `INVALID_CREDENTIALS`. `/api/health` 는 인증 없이 200.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.ontology.OntologyValidatorTest' --tests 'dev.fos.workbench.AuthIntegrationTest'
cd financial-workbench/api && ./gradlew build
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/settings.gradle.kts` | 신규 |
| `financial-workbench/api/build.gradle.kts` | 신규 |
| `financial-workbench/api/gradle/libs.versions.toml` | 신규 |
| `financial-workbench/api/gradlew` | 신규 |
| `financial-workbench/api/gradlew.bat` | 신규 |
| `financial-workbench/api/gradle/wrapper/gradle-wrapper.jar` | 신규 |
| `financial-workbench/api/gradle/wrapper/gradle-wrapper.properties` | 신규 |
| `financial-workbench/api/.gitignore` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/WorkbenchApplication.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/**` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/ontology/**` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/auth/**` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/**` | 신규 |
| `financial-workbench/api/src/main/resources/application.yaml` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/ontology/OntologyValidatorTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/support/**` | 신규 |
