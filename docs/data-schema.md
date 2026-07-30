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

Movies 예제는 다음 노드와 속성을 생성한다.

| 라벨 | 식별 속성 | 선택 속성 |
| --- | --- | --- |
| `Person` | `name` | `born` |
| `Movie` | `title` | `released`, `tagline` |

`Person`에서 `Movie` 방향으로 다음 관계를 생성한다.

| 관계 | 속성 |
| --- | --- |
| `ACTED_IN` | `roles` |
| `DIRECTED` | 없음 |
| `PRODUCED` | 없음 |
| `WROTE` | 없음 |
| `REVIEWED` | `summary`, `rating` |

완전한 예제 데이터의 기준은 노드 169개와 관계 250개다.
Movies 예제 외의 GraphRAG 저장 모델과 벡터 인덱스는 이후 단계에서 정의한다.
