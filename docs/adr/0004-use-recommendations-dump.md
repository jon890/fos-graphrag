# 영화 추천 예제는 공식 덤프로 복원한다

## 맥락

APOC의 classic Movies 예제에는 `Person`의 `REVIEWED` 관계만 있고,
사용자 영화 평점 학습에 필요한 `User`의 `RATED` 관계가 없다.
로컬 Neo4j Community Edition의 기본 데이터베이스에서 Sandbox 계열의 추천 그래프를 재현해야 한다.

## 결정

Neo4j 공식 `neo4j-graph-examples/recommendations` 저장소의
Neo4j 5.26 덤프를 고정된 커밋과 SHA-256으로 검증한 뒤 오프라인 복원한다.
복원 명령은 기존 기본 데이터베이스를 교체하므로 명시적인 `--force` 인자가 있어야 실행한다.
APOC는 이 데이터셋에 필요하지 않으므로 Compose 구성에서 제거한다.

## 기각한 대안

- classic APOC Movies 예제를 유지하면 `RATED` 관계를 실습할 수 없다.
- 저장소의 최신 파일을 고정 없이 내려받으면 같은 명령의 결과가 바뀔 수 있다.
- Cypher로 10만 건 이상의 평점을 직접 생성하면 공식 덤프보다 느리고 원본 재현성이 떨어진다.

## 결과

로컬 그래프는 `Movie`, `User`, `Genre`, `Person` 중심의 추천 스키마와
`RATED`, `IN_GENRE`, `ACTED_IN`, `DIRECTED` 관계를 제공한다.
데이터 교체는 파괴적 작업이며 기존 사용자 그래프를 자동으로 보존하지 않는다.
