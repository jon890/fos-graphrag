# 코드 구조

## 모듈 책임

| 경로 | 책임 |
| --- | --- |
| `compose.yml` | 로컬 Neo4j 실행과 영속 볼륨 |
| `src/fos_graphrag/config.py` | 환경변수 검증과 설정 객체 생성 |
| `src/fos_graphrag/database.py` | Neo4j 드라이버 연결 경계 |
| `src/fos_graphrag/cli.py` | 연결 확인 명령과 종료 코드 |
| `tests/` | 설정·연결 경계의 회귀 검증 |

## 의존 방향

명령 계층은 설정과 데이터베이스 연결 계층을 호출한다.

설정 계층은 Neo4j나 LangChain에 의존하지 않는다.

현재 연결 계층은 Neo4j 공식 드라이버만 사용한다.
LangChain 기반 그래프 조작은 다음 학습 단계에서 별도 모듈로 추가한다.
