# Phase 01 — Neo4j 실행과 연결 확인 스캐폴딩

**Execution profile**: standard
**Status**: completed

---

## 목표

Docker Compose의 Neo4j를 Python 공식 드라이버에서 연결·인증할 수 있는 최소 프로젝트를 만든다.

**범위 외**: 그래프 저장 모델, LangChain 체인, LLM 호출, 검색과 답변 생성을 구현하지 않는다.

---

## 작업 항목 (4)

### 1. 프로젝트와 의존성

`pyproject.toml`에 Python 3.11 이상, LangChain, Neo4j 통합 패키지, Neo4j 공식 드라이버를 정의한다.

### 2. Neo4j 컨테이너

`compose.yml`에 Neo4j 5.26 LTS, Bolt·Browser 포트, 영속 볼륨, Cypher 기반 상태 확인을 정의한다.

### 3. 연결 확인 코드

`src/fos_graphrag/`에 환경변수 검증, 공식 드라이버 연결, 사용자용 명령을 구현한다.

### 4. 문서와 검증

`README.md`, `docs/`와 `tests/`를 현재 범위에 맞게 작성한다.
모든 검증이 통과하면 이 파일과 `index.json`의 상태를 `completed`로 바꾼다.

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `compose.yml` | 신규 |
| `pyproject.toml` | 신규 |
| `src/fos_graphrag/` | 신규 |
| `tests/` | 신규 |
| `README.md` | 신규 |
| `docs/` | 신규 |

## 검증

```bash
# cwd: /Users/nhn/personal/fos-graphrag
uv sync --extra dev
uv run ruff check .
uv run pytest
docker compose config --quiet
docker compose up -d --wait
uv run graphrag-check-neo4j
```

연결 확인 명령이 종료 코드 `0`과 `Neo4j 연결 성공`을 출력해야 한다.

## 의도 메모 (왜)

- Neo4j 5.26은 장기 지원 계열이라 학습 중 예기치 않은 주요 변경을 줄인다.
- 연결 확인을 공식 드라이버 경계로 분리해 이후 LangChain 코드를 작은 단계로 추가한다.
- 현재 GraphRAG 저장 계약을 추측하지 않고 다음 학습 단계에서 별도로 설계한다.
