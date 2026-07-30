# 데이터 계약

## 접속 설정

| 환경변수 | 필수 | 의미 |
| --- | --- | --- |
| `NEO4J_URI` | 예 | Bolt 접속 주소 |
| `NEO4J_USERNAME` | 예 | Neo4j 사용자명이며 로컬 Docker 이미지의 초기값은 `neo4j`로 고정 |
| `NEO4J_PASSWORD` | 예 | Neo4j 비밀번호 |
| `NEO4J_DATABASE` | 아니요 | 대상 데이터베이스이며 기본값은 `neo4j` |
| `NEO4J_HTTP_PORT` | 아니요 | Neo4j Browser 호스트 포트이며 기본값은 `7475` |
| `NEO4J_BOLT_PORT` | 아니요 | Bolt 호스트 포트이며 기본값은 `7688` |

## 로컬 모델 설정

| 환경변수 | 필수 | 의미 |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | 아니요 | Ollama API 주소이며 기본값은 `http://localhost:11434` |
| `OLLAMA_MODEL` | 아니요 | 호출할 로컬 모델이며 기본값은 `nemotron-3-nano:4b` |

## 그래프 저장 모델

영화 추천 예제는 다음 노드 라벨을 사용한다.

| 라벨 | 역할 |
| --- | --- | --- |
| `Movie` | 영화 |
| `Person` | 배우와 감독의 공통 라벨 |
| `Actor` | 배우이며 `Person` 라벨을 함께 가짐 |
| `Director` | 감독이며 `Person` 라벨을 함께 가짐 |
| `Genre` | 장르 |
| `User` | 영화 평점 사용자 |

예제 데이터는 다음 관계를 생성한다.

| 관계 | 방향 | 속성 |
| --- | --- | --- |
| `ACTED_IN` | `Person` → `Movie` | `roles` |
| `DIRECTED` | `Person` → `Movie` | 없음 |
| `IN_GENRE` | `Movie` → `Genre` | 없음 |
| `RATED` | `User` → `Movie` | `rating`, `timestamp` |

완전한 예제 데이터는 노드 28,863개와 관계 166,261개다.
`Movie` 9,125개, `User` 671개, `RATED` 관계 100,004개를 포함한다.
Movies 예제 외의 GraphRAG 저장 모델과 벡터 인덱스는 이후 단계에서 정의한다.
