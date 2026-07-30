# Phase 01 — 영화 추천 데이터와 Cypher 실습 환경 구성

**Execution profile**: standard
**Status**: in_progress

---

## 목표

Neo4j 공식 영화 추천 예제 데이터 28,863개 노드와 166,261개 관계를
로컬 데이터베이스에 복원하고 Neo4j Browser에서 `RATED` 관계를 직접 조회할 수 있게 한다.

**범위 외**: GraphRAG 체인, 임베딩, 벡터 인덱스, 사용자 정의 영화 데이터 수집을 구현하지 않는다.

---

## 작업 항목 (4)

### 1. 공식 덤프 복원 스크립트

`scripts/load-recommendations.sh`에서 고정된 공식 덤프를 내려받고
SHA-256을 검증한 뒤 기본 데이터베이스를 오프라인 복원한다.
파괴적 실행에는 `--force`를 요구한다.

### 2. 데이터셋 검증 경계

`src/fos_graphrag/movies.py`에
`verify_movies_dataset(settings: Neo4jSettings) -> MoviesDatasetStats`를 구현한다.
노드·관계·라벨·관계 타입별 수가 공식 데이터와 일치하는지 읽기 전용으로 검사한다.

### 3. 적재 명령과 자동 검증

`src/fos_graphrag/movies_cli.py`와 `graphrag-check-movies` 진입점을 제공한다.
결과 수치, 데이터 불일치, 드라이버 오류와 종료 코드를 테스트한다.

### 4. Cypher 실습 안내

`README.md`에 교체 명령, 데이터 삭제 경고, Browser 접속 정보,
평점 조회와 추천 탐색을 위한 예제 Cypher를 기록한다.
모든 검증이 통과하면 이 파일과 `index.json`의 상태를 `completed`로 바꾼다.

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `compose.yml` | 수정 |
| `pyproject.toml` | 수정 |
| `scripts/load-recommendations.sh` | 신규 |
| `src/fos_graphrag/movies.py` | 수정 |
| `src/fos_graphrag/movies_cli.py` | 수정 |
| `tests/test_movies.py` | 수정 |
| `tests/test_movies_cli.py` | 수정 |
| `README.md` | 수정 |

## 검증

```bash
# cwd: /Users/nhn/personal/fos-graphrag
docker compose config --quiet
sh -n scripts/load-recommendations.sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv run graphrag-check-movies
docker compose exec -T neo4j sh -lc \
  'cypher-shell -u neo4j -p "${NEO4J_AUTH#*/}" \
  "MATCH (:User)-[r:RATED]->(:Movie) RETURN count(r) AS ratings"'
```

확인 명령은 노드 `28,863`, 관계 `166,261`, `RATED` 관계 `100,004`를 출력해야 한다.

## 의도 메모 (왜)

- Neo4j 5.26용 공식 덤프를 고정해 Sandbox 계열의 추천 그래프를 재현한다.
- 데이터 삭제 의도를 `--force`로 명시하고 다운로드 무결성을 먼저 확인한다.
- Neo4j Browser를 그대로 사용해 별도 쿼리 도구나 애플리케이션 화면을 추가하지 않는다.
