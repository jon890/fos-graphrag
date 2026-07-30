# FOS GraphRAG

Python, LangChain, Neo4j로 GraphRAG를 단계적으로 구현하는 학습 프로젝트입니다.

현재는 Neo4j 연결, Movies 예제 데이터, API 키가 필요 없는 로컬 언어 모델 연결까지 구현되어 있습니다.

## 준비물

- Python 3.11 이상
- Docker와 Docker Compose
- Ollama
- 권장: `uv`

## 시작하기

환경 파일을 준비합니다.

```bash
cp .env.example .env
```

의존성을 설치합니다.

```bash
uv sync --extra dev
```

`uv`를 사용하지 않는다면 표준 가상환경에서도 설치할 수 있습니다.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
```

Neo4j를 시작하고 준비 완료까지 기다립니다.

```bash
docker compose up -d --wait
```

Python에서 연결을 확인합니다.

```bash
uv run graphrag-check-neo4j
```

정상이라면 다음과 비슷한 메시지가 출력됩니다.

```text
Neo4j 연결 성공 (주소: bolt://localhost:7688, 데이터베이스: neo4j)
```

Neo4j Browser는 <http://localhost:7475>에서 열 수 있습니다.
기본 학습용 계정은 `.env.example`에 정의되어 있습니다.

기본 Neo4j 포트를 이미 사용하는 다른 프로젝트와 충돌하지 않도록 이 프로젝트는 호스트의 `7475`와 `7688`을 사용합니다.
필요하면 `.env`의 `NEO4J_HTTP_PORT`, `NEO4J_BOLT_PORT`, `NEO4J_URI`를 함께 바꾸세요.
로컬 Docker 이미지를 사용할 때 `NEO4J_USERNAME`은 `neo4j`로 유지합니다.

## 종료하기

컨테이너만 종료하고 데이터는 보존합니다.

```bash
docker compose down
```

볼륨까지 제거하면 저장한 Neo4j 데이터가 복구되지 않습니다.

```bash
docker compose down --volumes
```

## 현재 프로젝트 구조

```text
.
├── compose.yml
├── pyproject.toml
├── src/fos_graphrag/
│   ├── cli.py
│   ├── config.py
│   ├── database.py
│   ├── model.py
│   ├── model_cli.py
│   ├── movies.py
│   └── movies_cli.py
└── tests/
```

현재 코드는 연결 확인과 예제 데이터 적재만 수행하며 GraphRAG 체인은 실행하지 않습니다.

## Movies 데이터와 Cypher 실습

Neo4j 공식 Movies 예제 데이터를 빈 로컬 데이터베이스에 적재합니다.

```bash
uv run graphrag-load-movies
```

정상이라면 노드 `169`, 관계 `250`이 출력됩니다.
같은 명령을 다시 실행해도 데이터를 중복 생성하지 않습니다.
다른 데이터가 있거나 Movies 데이터가 일부만 적재된 경우에는 기존 데이터를 보호하기 위해 중단합니다.

Neo4j Browser <http://localhost:7475>에 접속해 다음 정보를 입력합니다.

- 접속 주소: `bolt://localhost:7688`
- 사용자명: `neo4j`
- 비밀번호: `.env`의 `NEO4J_PASSWORD`

Browser의 입력창에서 아래 Cypher를 하나씩 실행할 수 있습니다.

라벨별 노드 수를 확인합니다.

```cypher
MATCH (n)
RETURN labels(n) AS labels, count(*) AS count
ORDER BY count DESC;
```

영화와 출연 배우를 조회합니다.

```cypher
MATCH (person:Person)-[:ACTED_IN]->(movie:Movie)
RETURN person.name AS actor, movie.title AS movie
ORDER BY movie, actor
LIMIT 25;
```

`The Matrix`와 연결된 사람과 관계를 그래프로 표시합니다.

```cypher
MATCH path = (person:Person)-[relationship]->(movie:Movie {title: 'The Matrix'})
RETURN path;
```

두 배우 사이의 최단 경로를 찾습니다.

```cypher
MATCH
  (keanu:Person {name: 'Keanu Reeves'}),
  (tom:Person {name: 'Tom Hanks'}),
  path = shortestPath((keanu)-[*]-(tom))
RETURN path;
```

## 로컬 모델 연결

Ollama를 설치하고 호스트 서비스로 시작합니다.

```bash
brew install ollama
brew services start ollama
```

학습용 기본 모델을 내려받습니다.

```bash
ollama pull nemotron-3-nano:4b
```

LangChain에서 모델 연결과 응답을 확인합니다.

```bash
uv run graphrag-check-model
```

이 구성은 OpenAI나 NVIDIA API 키를 사용하지 않습니다.
모델 파일은 약 2.8GB이며 추론은 로컬 컴퓨터의 메모리와 연산 자원을 사용합니다.

## 다음 학습 단계

다음 단계에서는 별도 범위로 아래 내용을 설계할 수 있습니다.

1. 문서 수집과 분할
2. 개체·관계 추출
3. Neo4j 그래프 저장 모델과 제약 조건
4. 그래프 검색과 답변 생성
