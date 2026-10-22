# Phase 02. 초기 데이터 적용

**Execution profile**: standard

## 목표

`financial-workbench/ontology/seeds/*.yaml` 을 API 시작 때 한 번만 적용하는 `SeedLoader` 를 만들고, 인물 다섯과 개념 다섯, 개념 사이 관계를 담은 첫 파일을 넣는다.
적용은 `system` 작업자로 하고 노드마다 이력을 남긴다. 같은 이름이 이미 있으면 새로 만들지 않는다.

**범위 외**: 화면은 phase 03 이다. 인용과 주장은 초기 데이터에 넣지 않는다(사용자 결정 2026-10-23).

## 컨텍스트

- 앞 phase 결과: 온톨로지에 `Person`(`name`, `englishName`, `role`, `country`, `birthYear`, `deathYear`, `description`), `Concept`(`name`, `englishName`, `category`, `summary` 필수, `description`), 관계 `AUTHORED`, `RELATED_TO` 가 있다.
- 시작 순서는 `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` 의 `afterSingletonsInstantiated()` 다. 지금은 `initialize()`, `legacyValueCleanup.run()`, `bootstrapAdmin.ifAvailable { it.ensureAdmin() }` 순서다. `STATEMENTS` 목록이 제약 조건과 인덱스를 만든다.
- 시작 때 데이터를 고치는 선례는 `knowledge/LegacyValueCleanup.kt` 다. `TransactionTemplate`(`timeout = Limits.WRITE_TIMEOUT_SECONDS`)으로 트랜잭션을 나누고, 작업자는 `BootstrapAdmin.SYSTEM_ACTOR`(`"system"`)다.
- 노드와 관계 만들기는 `knowledge/NodeService.create(CreateNodeRequest(type, properties), actorId)` 와 `knowledge/RelationshipService.create(CreateRelationshipRequest(type, fromId, toId), actorId)` 다. 둘 다 `@Transactional` 이라 바깥 트랜잭션이 있으면 그 안에서 돈다. 검증, 이력, `searchText` 를 함께 처리한다. 같은 관계가 이미 있으면 `409 DUPLICATE`(예외)다.
- 설정 속성은 `config/WorkbenchProperties.kt` 의 `WorkbenchProperties(graph, detail, security, bootstrap)` 이고 접두사는 `workbench` 다. YAML 은 `api/src/main/resources/application.yaml` 의 `workbench:` 아래다.
- 온톨로지 파일은 빌드할 때 jar 안에 복사된다(`OntologyLoader.RESOURCE = "financial-ontology.yaml"`, `ClassPathResource`). 복사 설정은 `financial-workbench/api/build.gradle.kts` 의 `processResources` 에 있는 `from("../ontology/financial-ontology.yaml")` 이다. seeds 폴더도 같은 방식으로 classpath 의 `seeds/` 아래에 넣는다. 컨테이너 이미지는 `financial-workbench/Dockerfile` 이 빌드 단계에 `ontology/` 를 이미 복사하고(16행), 실행 jar 는 `/app/app.jar` 다. 실행 이미지는 JRE 라 `unzip`, `jar`, `python3` 이 없다.
- `RelationshipService.create` 와 `NodeService.create` 는 `@Transactional` 이다. 바깥 트랜잭션(`TransactionTemplate`) 안에서 부르면 참여 트랜잭션이 되고, 안에서 예외가 프록시를 지나면 바깥 트랜잭션이 rollback-only 로 표시된다(Spring Data Neo4j `Neo4jTransactionManager.doSetRollbackOnly`). 그 예외를 잡아도 커밋 때 `UnexpectedRollbackException` 이 나서 파일 전체가 롤백된다. `RelationshipService.create` 는 잠금(`lockEnds`) 뒤에 같은 관계가 있으면 `DuplicateException` 을 던진다.
- 통합 테스트는 같은 Neo4j 컨테이너를 여러 테스트가 함께 쓴다. 시작 때 초기 데이터가 적용되므로 다른 테스트의 데이터와 함께 있다.

**근거 문서**: `financial-workbench/docs/data-schema.md` 의 「초기 데이터」 절과 「제약 조건과 인덱스」 의 `seed_run_key_unique` 행, `financial-workbench/docs/code-architecture.md` 「결정」 의 초기 데이터 항목과 「API 패키지」 의 `SeedLoader`

## 의도 메모

- 바깥 스크립트로 넣지 않는다. 로그인이 Google 로만 되어 스크립트가 API 를 부를 수 없고, 이력 없이 Neo4j 에 직접 쓰지 않는다.
- 실패해도 API 는 시작한다. 초기 데이터는 없어도 쓸 수 있다. 실패는 `warn` 로그로 남기고 다음 시작 때 다시 시도한다.
- 파일 트랜잭션 안에서는 `@Transactional` 서비스가 던진 예외를 잡고 계속하지 않는다. 건너뛸 경우(이미 있는 노드, 이미 있는 관계)는 서비스를 부르기 전에 Cypher 로 먼저 확인한다.
- 소개와 정의는 널리 알려진 사실만 짧게 적는다. 인용과 평가는 넣지 않는다.

## Blocked 조건

- Docker 가 돌지 않아 Testcontainers 가 Neo4j 를 띄우지 못하면 `PHASE_BLOCKED: Docker 를 쓸 수 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. 초기 데이터 파일 `financial-workbench/ontology/seeds/investing-basics-2026-10.yaml` 신규

```yaml
# 처음 넣을 인물과 개념. API 가 시작할 때 한 번만 적용한다(docs/data-schema.md 「초기 데이터」).
# 같은 key 는 다시 적용하지 않는다. 내용을 바꾸려면 새 key 의 파일을 더한다.
key: investing-basics-2026-10
nodes:
  - ref: buffett
    type: Person
    properties: { name: 워런 버핏, englishName: Warren Buffett, role: INVESTOR, country: US, birthYear: 1930, description: "버크셔 해서웨이 회장. 가치 투자를 대표하는 투자자다." }
  # 나머지 노드도 같은 모양이다(아래 표)
relationships:
  - { type: RELATED_TO, from: margin-of-safety, to: intrinsic-value }
```

| ref | type | 속성 |
| --- | --- | --- |
| `buffett` | Person | 워런 버핏, Warren Buffett, INVESTOR, US, 1930, 「버크셔 해서웨이 회장. 가치 투자를 대표하는 투자자다.」 |
| `graham` | Person | 벤저민 그레이엄, Benjamin Graham, INVESTOR, US, 1894, 1976, 「가치 투자의 아버지로 불린다. 『증권 분석』 과 『현명한 투자자』 를 썼다.」 |
| `munger` | Person | 찰리 멍거, Charlie Munger, INVESTOR, US, 1924, 2023, 「버크셔 해서웨이 부회장을 지냈다. 여러 학문의 사고 모형으로 판단하라고 했다.」 |
| `lynch` | Person | 피터 린치, Peter Lynch, INVESTOR, US, 1944, 「피델리티 마젤란 펀드를 운용했다. 생활 속에서 투자 아이디어를 찾으라고 했다.」 |
| `fisher` | Person | 필립 피셔, Philip Fisher, INVESTOR, US, 1907, 2004, 「성장주 투자의 선구자다. 『위대한 기업에 투자하라』 를 썼다.」 |
| `margin-of-safety` | Concept | 안전마진, Margin of Safety, VALUATION, summary 「내재가치보다 충분히 낮은 값에 사서 판단 착오에 대비하는 여유」 |
| `economic-moat` | Concept | 경제적 해자, Economic Moat, BUSINESS, 「경쟁자가 따라오기 어렵게 하는 기업의 오래가는 경쟁 우위」 |
| `intrinsic-value` | Concept | 내재가치, Intrinsic Value, VALUATION, 「기업이 앞으로 벌어들일 현금을 지금 가치로 할인한 값」 |
| `mr-market` | Concept | 미스터 마켓, Mr. Market, BEHAVIOR, 「날마다 감정에 따라 값을 부르는 거래 상대에 시장을 빗댄 비유」 |
| `circle-of-competence` | Concept | 능력 범위, Circle of Competence, STRATEGY, 「자신이 잘 이해하는 사업에만 투자하라는 원칙」 |

관계는 `RELATED_TO` 셋이다. `margin-of-safety → intrinsic-value`, `mr-market → margin-of-safety`, `economic-moat → intrinsic-value`.
흐름 표기 안의 쉼표, 콜론, 따옴표가 든 값은 큰따옴표로 감싼다. 『』 는 그대로 둔다.

### 2. classpath 에 넣기

- `financial-workbench/api/build.gradle.kts` 가 온톨로지 YAML 을 리소스로 복사하는 설정을 읽고, `ontology/seeds/*.yaml` 도 classpath 의 `seeds/` 아래로 복사되게 고친다. 테스트 classpath 에도 들어가야 한다.
- `financial-workbench/Dockerfile` 은 이미 `ontology/` 를 빌드 단계에 넣으므로 고치지 않는다.

### 3. `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/SeedLoader.kt` 신규

```kotlin
/**
 * classpath:seeds/*.yaml 을 key 순서로 한 번씩 적용한다. docs/data-schema.md 「초기 데이터」.
 * 파일 하나가 트랜잭션 하나다. 실패하면 그 파일만 롤백하고 warn 로그를 남긴 뒤 다음 파일로 간다.
 */
@Component
class SeedLoader(
    private val client: Neo4jClient,
    private val nodes: NodeService,
    private val relationships: RelationshipService,
    private val ontology: Ontology,
    private val properties: WorkbenchProperties,
    transactionManager: PlatformTransactionManager,
) {
    /** 적용한 파일 수 */
    fun run(): Int
}
```

- `properties.seeds.enabled` 가 `false` 면 아무것도 하지 않는다. `WorkbenchProperties` 에 `val seeds: Seeds = Seeds()`, `data class Seeds(val enabled: Boolean = true)` 를 더한다.
- `PathMatchingResourcePatternResolver().getResources("classpath*:seeds/*.yaml")` 로 자원을 모아 파일 이름 순서로 정렬한다. 자원마다 따로 읽는다. YAML 은 `tools.jackson.dataformat.yaml.YAMLMapper`(로더와 같은 라이브러리, `FAIL_ON_UNKNOWN_PROPERTIES` 켬)로 아래 클래스에 읽는다. 읽기에 실패한 자원은 `log.warn("초기 데이터 파일 {} 를 읽지 못했다: {}", resource.filename, e.message)` 뒤 건너뛴다. 같은 `key` 가 이미 나온 파일이면 `warn` 로그 뒤 건너뛴다.

  ```kotlin
  data class SeedFile(val key: String, val nodes: List<SeedNode> = emptyList(), val relationships: List<SeedRelationship> = emptyList())
  /** ref 는 이 파일 안에서만 쓰는 이름이다 */
  data class SeedNode(val ref: String, val type: String, val properties: Map<String, Any?> = emptyMap())
  data class SeedRelationship(val type: String, val from: String, val to: String)
  ```
- `run()` 은 어떤 경우에도 예외를 밖으로 던지지 않는다. 파일마다 `try` 로 감싼다.
- 파일마다 `MATCH (s:SeedRun {key: $key}) RETURN count(s) > 0` 이 참이면 건너뛴다. 아니면 `internal fun apply(file: SeedFile)` 를 `TransactionTemplate`(`timeout = Limits.WRITE_TIMEOUT_SECONDS`. 서버의 `db.transaction.timeout` 보다 짧아야 한다는 `Limits` 의 규칙을 지킨다)에서 부른다. `apply` 는:
  - 노드마다 `findExisting(type, name)` 으로 같은 타입, 같은 이름의 보관되지 않은 노드를 찾는다. 이름은 그 타입의 `labelProperty` 값이고, 비교는 `toLower(trim(n[$prop])) = toLower(trim($name))` 다. 있으면 그 id 를 `ref` 에 묶고 만들지 않는다. 없으면 `nodes.create(CreateNodeRequest(type, properties), BootstrapAdmin.SYSTEM_ACTOR)` 로 만들고 id 를 묶는다.
  - 관계마다 `from`, `to` 의 `ref` 로 id 를 찾는다. 하나라도 없으면 건너뛰고 로그를 남긴다. 타입은 `ontology.requireRelationshipType(type)` 으로 확인한 값만 Cypher 에 넣고, `MATCH (:Knowledge {id: $from})-[r:\`TYPE\`]->(:Knowledge {id: $to}) WHERE r.archived = false RETURN count(r) > 0` 이 참이면 만들지 않는다. 아니면 `relationships.create(...)` 로 만든다. `DuplicateException` 을 잡지 않는다.
  - 끝에 `CREATE (:SeedRun {key: $key, appliedAt: $now})` 를 남긴다(`Timestamps.now()`).
- 파일 하나가 예외로 끝나면 `log.warn("초기 데이터 {} 를 적용하지 못했다: {}", key, e.message)` 를 남기고 다음 파일로 간다. 예외를 밖으로 던지지 않는다. 고친 노드 수가 아니라 적용한 파일 수를 `info` 로 남긴다.

### 4. 시작 순서와 제약 조건

- `Neo4jSchemaInitializer` 의 생성자에 `SeedLoader` 를 더하고 `afterSingletonsInstantiated()` 를 `initialize()`, `legacyValueCleanup.run()`, `seedLoader.run()`, `bootstrapAdmin…` 순서로 고친다. 클래스 주석의 순서 설명도 고친다.
- `STATEMENTS` 에 `"CREATE CONSTRAINT seed_run_key_unique IF NOT EXISTS FOR (s:SeedRun) REQUIRE s.key IS UNIQUE"` 를 더한다. 제약 조건 개수나 이름을 단언하는 기존 테스트(`ReviewFixIntegrationTest` 의 인덱스 테스트 등)가 있으면 함께 고친다.
- `application.yaml` 의 `workbench:` 아래에 `seeds: { enabled: ${WORKBENCH_SEEDS_ENABLED:true} }` 를 둔다. `docs/deployment.md` 의 환경 변수 표에 이 값이 이미 있다(이 계획의 docs 커밋).

### 5. 이 phase 를 검증하는 테스트

- `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt` 신규(`IntegrationTest` 상속, `@Autowired lateinit var seeds: SeedLoader`).
  - 「시작할 때 초기 데이터가 들어가고 이력은 system 이다」: URL 인코딩한 `GET /api/nodes?q=warren%20buffett&types=Person` 에 label 이 정확히 「워런 버핏」 인 항목이 있고, 그 노드의 이력 첫 항목이 `CREATE`, 작업자가 비어 있다(system). `MATCH (s:SeedRun {key: 'investing-basics-2026-10'})` 가 하나다. 「안전마진」 상세의 관계에 `RELATED_TO` 로 「내재가치」 가 있다.
  - 「다시 돌려도 새로 만들지 않는다」: `seeds.run()` 을 한 번 더 부른 뒤 `MATCH (n:Knowledge:Person {name: '워런 버핏', archived: false}) RETURN count(n)` 이 1 이다. 검색(`CONTAINS`)으로 세지 않는다. 다른 테스트의 데이터가 같은 글자를 담을 수 있다.
  - 「이미 있는 관계를 다시 적은 파일도 적용된다」: `seeds.apply(SeedFile(key = "test-dup-<suffix>", nodes = 안전마진, 내재가치 두 개념(이름과 summary 를 초기 데이터와 같게), relationships = [RELATED_TO 안전마진 → 내재가치]))` 를 `TransactionTemplate` 으로 부른 뒤 예외 없이 끝나고 `SeedRun {key: 'test-dup-<suffix>'}` 가 남는다. 두 개념 사이 `RELATED_TO` 는 여전히 하나다. `apply` 가 `SeedRun` 도 남기게 하거나, 테스트가 `run()` 과 같은 경로를 타도록 `internal fun applyInTransaction(file)` 를 두어 그것을 부른다.
  - 「같은 이름이 이미 있으면 그 노드를 쓴다」: 이름으로 찾는 부분을 `SeedLoader` 의 `internal fun findExisting(type: String, name: String): String?` 로 뺀다. 테스트에서 Alice 가 Concept(`name` 「테스트개념-<suffix>」, 필수인 `summary` 「테스트」)를 만든 뒤 `findExisting("Concept", "테스트개념-<SUFFIX 대문자>")` 가 그 id 를 돌려준다. 그 노드를 보관하면 `null` 이다.
  - `workbench.seeds.enabled=false` 이면 `run()` 이 0 을 돌려준다. 이것은 `SeedLoader` 를 직접 만들어 `WorkbenchProperties(seeds = Seeds(enabled = false))` 를 넘겨 본다.

## 검증

```bash
cd financial-workbench/api && ./gradlew test --tests 'dev.fos.workbench.knowledge.SeedLoaderIntegrationTest'
cd financial-workbench/api && ./gradlew test
test -f financial-workbench/ontology/seeds/investing-basics-2026-10.yaml
cd financial-workbench && docker build --platform linux/amd64 -q -t workbench-seed-check . && cid=$(docker create workbench-seed-check) && docker cp "$cid":/app/app.jar /tmp/wb-seed-check.jar && docker rm "$cid" && unzip -l /tmp/wb-seed-check.jar | grep -q 'BOOT-INF/classes/seeds/investing-basics-2026-10.yaml'
```

- 각 줄은 저장소 루트에서 돈다. 마지막 줄은 컨테이너 이미지의 jar 를 밖으로 꺼내 호스트의 `unzip` 으로 초기 데이터 파일이 들어갔는지 본다(실행 이미지에는 압축 도구가 없다).

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/ontology/seeds/investing-basics-2026-10.yaml` | 신규 |
| `financial-workbench/api/build.gradle.kts` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/knowledge/SeedLoader.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/WorkbenchProperties.kt` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/config/Neo4jSchemaInitializer.kt` | 수정 |
| `financial-workbench/api/src/main/resources/application.yaml` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/knowledge/SeedLoaderIntegrationTest.kt` | 신규 |
