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

## 그래프 저장 모델

현재 단계에서는 노드, 관계, 제약 조건, 인덱스를 생성하지 않는다.

GraphRAG 저장 모델은 문서 수집과 개체·관계 추출 범위를 설계하는 다음 단계에서 정의한다.
