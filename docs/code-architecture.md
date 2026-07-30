# 코드 구조

## 모듈 책임

| 경로 | 책임 |
| --- | --- |
| `compose.yml` | 로컬 Neo4j 실행과 영속 볼륨 |
| `src/fos_graphrag/config.py` | 환경변수 검증과 설정 객체 생성 |
| `src/fos_graphrag/database.py` | Neo4j 드라이버 연결 경계 |
| `src/fos_graphrag/cli.py` | 연결 확인 명령과 종료 코드 |
| `src/fos_graphrag/model.py` | LangChain 로컬 모델 호출 경계 |
| `src/fos_graphrag/model_cli.py` | 로컬 모델 연결 확인 명령과 종료 코드 |
| `src/fos_graphrag/embedding.py` | LangChain 로컬 임베딩 호출과 벡터 검증 경계 |
| `src/fos_graphrag/embedding_cli.py` | 로컬 임베딩 연결 확인 명령과 종료 코드 |
| `tests/` | 설정·연결 경계의 회귀 검증 |

## 의존 방향

명령 계층은 설정과 데이터베이스 연결 계층을 호출한다.

설정 계층은 Neo4j나 LangChain에 의존하지 않는다.

현재 연결 계층은 Neo4j 공식 드라이버만 사용한다.

모델 연결 계층은 `langchain-ollama`만 사용하며 Neo4j에 의존하지 않는다.
임베딩 연결 계층도 `langchain-ollama`만 사용하며 벡터를 저장하지 않는다.
LangChain 기반 그래프 조작은 다음 학습 단계에서 두 연결 경계를 조합해 추가한다.
