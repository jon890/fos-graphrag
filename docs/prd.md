# GraphRAG 학습 프로젝트

## 목표

Python, LangChain, Neo4j를 단계적으로 연결해 GraphRAG의 구성 요소를 직접 학습한다.

첫 단계에서는 로컬 Neo4j를 재현 가능하게 실행하고 Python 애플리케이션의 연결을 확인한다.

## 현재 범위

- Docker Compose로 Neo4j Community Edition을 실행한다.
- 환경변수에서 Neo4j 접속 정보를 읽는다.
- Python 공식 드라이버로 연결과 인증을 확인한다.
- 이후 단계에서 사용할 LangChain과 Neo4j 통합 패키지를 준비한다.

## 현재 범위 밖

- 문서 수집과 분할
- 개체·관계 추출
- 그래프 저장 스키마와 인덱스
- 임베딩과 벡터 검색
- LLM 호출과 자연어 질의
