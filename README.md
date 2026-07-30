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
│   ├── movies_cli.py
│   └── first-query.py
├── scripts/
│   └── load-recommendations.sh
└── tests/
```

현재 코드는 연결 확인과 예제 데이터 적재만 수행하며 GraphRAG 체인은 실행하지 않습니다.

## 영화 추천 데이터와 Cypher 실습

Neo4j 공식 영화 추천 예제 데이터로 기본 데이터베이스를 교체합니다.
이 명령은 기존 로컬 Neo4j 데이터를 삭제하므로 `--force`를 명시해야 합니다.

```bash
./scripts/load-recommendations.sh --force
```

스크립트는 고정된 공식 Neo4j 5.26 덤프를 내려받아 SHA-256을 확인하고,
Neo4j를 중지한 상태에서 기본 데이터베이스를 복원합니다.
정상이라면 노드 `28,863`, 관계 `166,261`, `RATED` 관계 `100,004`가 출력됩니다.

현재 데이터가 공식 데이터셋과 일치하는지만 다시 확인할 수도 있습니다.

```bash
uv run graphrag-check-movies
```

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

사용자가 평가한 영화와 평점을 조회합니다.

```cypher
MATCH (user:User)-[rated:RATED]->(movie:Movie)
RETURN user.name AS user, movie.title AS movie, rated.rating AS rating
ORDER BY rating DESC, movie
LIMIT 25;
```

한 사용자가 높게 평가한 영화를 그래프로 표시합니다.

```cypher
MATCH path = (user:User)-[rated:RATED]->(movie:Movie)
WHERE rated.rating >= 4.5
RETURN path
LIMIT 50;
```

같은 영화를 평가한 사용자 수를 집계합니다.

```cypher
MATCH (:User)-[rated:RATED]->(movie:Movie)
RETURN movie.title AS movie,
       count(rated) AS ratingCount,
       round(avg(rated.rating), 2) AS averageRating
ORDER BY ratingCount DESC
LIMIT 20;
```

사용자가 평가한 영화를 바탕으로 다른 영화를 탐색합니다.

```cypher
MATCH (user:User {name: 'Andrew Freeman'})-[:RATED]->(movie:Movie)
      <-[:RATED]-(other:User)-[:RATED]->(recommendation:Movie)
WHERE user <> other AND NOT (user)-[:RATED]->(recommendation)
RETURN recommendation.title AS movie, count(*) AS score
ORDER BY score DESC
LIMIT 20;
```

### Python 파일에서 Cypher 실행하기

[`src/fos_graphrag/first-query.py`](src/fos_graphrag/first-query.py)의
`CYPHER_QUERY`와 `QUERY_PARAMETERS`를 수정해 원하는 쿼리를 작성합니다.

Neo4j가 실행 중인 상태에서 Python 파일을 실행합니다.

```bash
uv run python src/fos_graphrag/first-query.py
```

쿼리 결과는 터미널에 딕셔너리 형태로 한 줄씩 출력됩니다.

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
