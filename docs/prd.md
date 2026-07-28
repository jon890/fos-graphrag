# GraphRAG 학습 프로젝트

## 목표

Python, LangChain, Neo4j를 단계적으로 연결해 GraphRAG의 구성 요소를 직접 학습한다.

첫 단계에서는 로컬 Neo4j를 재현 가능하게 실행하고 Python 애플리케이션의 연결을 확인한다.
두 번째 단계에서는 API 키 없이 로컬 언어 모델을 실행하고 LangChain 연결을 확인한다.

## 현재 범위

- Docker Compose로 Neo4j Community Edition을 실행한다.
- 환경변수에서 Neo4j 접속 정보를 읽는다.
- Python 공식 드라이버로 연결과 인증을 확인한다.
- 이후 단계에서 사용할 LangChain과 Neo4j 통합 패키지를 준비한다.
- Ollama의 소형 Nemotron 모델을 LangChain에서 호출하고 응답을 확인한다.

## 현재 범위 밖

- 문서 수집과 분할
- 개체·관계 추출
- 그래프 저장 스키마와 인덱스
- 임베딩과 벡터 검색
- GraphRAG 검색 결과를 사용하는 자연어 질의 체인
