## ADR-001: API 는 Kotlin, Spring Boot 4.1, Neo4jClient 로 만든다

- **status**: `accepted`
- **결정**: API 를 Kotlin 과 Spring Boot 4.1.0, Java 21 로 만들고 Neo4j 접근은 Spring Data Neo4j 의 `Neo4jClient` 로 한다. 엔티티 매핑(OGM, `@Node` 리포지토리)은 쓰지 않는다. Neo4j 는 `neo4j:5.26.30-community` 로 고정한다.
- **맥락**: 저장소의 `java-agent-lab` 이 Spring Boot 4.1.0, Gradle 8.14.3, Java 21 을 쓴다. 같은 계열을 쓰면 JDK 와 Gradle 캐시를 나눠 쓴다. 노드 속성이 온톨로지 YAML 에 따라 달라져, 고정 필드 클래스로 매핑하는 방식과 맞지 않는다. Kotlin 과 드라이버 버전은 Spring Boot 4.1.0 BOM 이 관리하는 값(Kotlin 2.3.21, 드라이버 6.1.0, Testcontainers 2.0.5)을 그대로 쓴다.
- **대안 기각**:
  - Spring Data Neo4j 리포지토리와 `@Node` 엔티티: 타입마다 클래스가 필요하고, 온톨로지에 속성을 더할 때마다 코드를 고쳐야 한다. revision 잠금처럼 쿼리 순서를 직접 다뤄야 하는 곳에서 숨은 쿼리가 끼어든다.
  - Neo4j Java 드라이버만 쓰기: 트랜잭션 경계를 Spring `@Transactional` 과 묶는 코드를 직접 써야 한다.
  - Neo4j 2025.x: 최신 기능이 있지만 `python-graphrag` 가 쓰는 5.26 LTS 와 계열이 달라 학습 저장소 안에서 두 버전을 관리하게 된다.
- **결과**:
  - 얻는 것: 온톨로지 속성이 바뀌어도 매핑 코드를 고치지 않는다. 쿼리와 트랜잭션 순서가 코드에 그대로 보인다.
  - 감당할 것: Cypher 를 직접 쓰므로 label 과 관계 타입을 넣는 곳을 한 군데(온톨로지 허용 목록 대조)로 모아야 한다. 결과 매핑 코드를 손수 쓴다. Spring Boot 를 올릴 때 Kotlin 과 드라이버 버전이 함께 바뀐다.
