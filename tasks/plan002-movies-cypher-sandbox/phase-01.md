# Phase 01 — Movies 데이터와 Cypher 실습 환경 구성

**Execution profile**: standard
**Status**: pending

---

## 목표

Neo4j 공식 Movies 예제 데이터 169개 노드와 250개 관계를 로컬 데이터베이스에 적재하고,
Neo4j Browser에서 Cypher 쿼리를 직접 실행할 수 있게 한다.

**범위 외**: GraphRAG 체인, 임베딩, 벡터 인덱스, 사용자 정의 영화 데이터 수집을 구현하지 않는다.

---

## 작업 항목 (4)

### 1. APOC Core 최소 권한 구성

`compose.yml`에 개발용 APOC Core 설치를 추가한다.
허용 목록과 제한 해제 목록은 `apoc.example.movies`로 한정한다.

### 2. 안전한 Movies 적재 경계

`src/fos_graphrag/movies.py`에
`load_movies_dataset(settings: Neo4jSettings) -> MoviesDatasetStats`를 구현한다.
빈 데이터베이스에서만 `apoc.example.movies()`를 실행하고,
완전한 Movies 데이터는 재사용하며 다른 데이터나 부분 적재 상태는 거부한다.

### 3. 적재 명령과 자동 검증

`src/fos_graphrag/movies_cli.py`와 `graphrag-load-movies` 진입점을 추가한다.
상태 분기, 결과 수치, 드라이버·APOC 오류와 종료 코드를 테스트한다.

### 4. Cypher 실습 안내

`README.md`에 적재 명령, Browser 주소와 접속 정보,
노드·관계 조회와 경로 탐색을 위한 예제 Cypher를 기록한다.
모든 검증이 통과하면 이 파일과 `index.json`의 상태를 `completed`로 바꾼다.

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `compose.yml` | 수정 |
| `pyproject.toml` | 수정 |
| `src/fos_graphrag/movies.py` | 신규 |
| `src/fos_graphrag/movies_cli.py` | 신규 |
| `tests/test_movies.py` | 신규 |
| `tests/test_movies_cli.py` | 신규 |
| `README.md` | 수정 |

## 검증

```bash
# cwd: /Users/nhn/personal/fos-graphrag
docker compose config --quiet
docker compose up -d --wait
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run graphrag-load-movies
docker compose exec -T neo4j sh -lc \
  'cypher-shell -u neo4j -p "${NEO4J_AUTH#*/}" \
  "MATCH (n) WITH count(n) AS nodes MATCH ()-[r]->() RETURN nodes, count(r) AS relationships"'
```

적재 명령은 노드 `169`, 관계 `250`을 출력해야 한다.
같은 명령을 다시 실행해도 수치가 바뀌지 않아야 한다.

## 의도 메모 (왜)

- Neo4j 공식 APOC 절차를 사용해 Sandbox와 같은 예제 그래프를 재현한다.
- 쓰기 전 상태를 검사해 학습 중 만든 다른 데이터를 덮거나 예제를 중복 생성하지 않는다.
- Neo4j Browser를 그대로 사용해 별도 쿼리 도구나 애플리케이션 화면을 추가하지 않는다.
