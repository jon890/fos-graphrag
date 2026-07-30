# Phase 01 — Qwen3 로컬 임베딩 연결

**Execution profile**: standard
**Status**: pending

---

## 목표

Ollama의 `qwen3-embedding:0.6b`를 LangChain에서 호출하고
한국어 예문이 1,024차원 벡터로 변환되는지 확인한다.

**범위 외**: 문서 분할, 임베딩 일괄 생성, Neo4j 벡터 저장과 인덱스, 유사도 검색을 구현하지 않는다.

---

## 작업 항목 (4)

### 1. 설정과 명령 진입점

`.env.example`과 `src/fos_graphrag/config.py`에 `OLLAMA_EMBEDDING_MODEL`과
`OLLAMA_EMBEDDING_DIMENSIONS`를 추가한다.
`pyproject.toml`에 `graphrag-check-embedding` 명령을 등록한다.

### 2. 임베딩 호출 경계

`src/fos_graphrag/embedding.py`에
`embed_text(settings: LocalEmbeddingSettings, text: str) -> list[float]`를 구현한다.
`OllamaEmbeddings`를 사용하고 빈 벡터와 설정 차원 불일치를 `LocalEmbeddingError`로 변환한다.

### 3. 연결 확인 명령

`src/fos_graphrag/embedding_cli.py`에 한국어 예문을 임베딩하는 명령을 구현한다.
성공하면 모델명과 벡터 차원을 출력하고, 연결·모델·벡터 검증 실패는 종료 코드 `1`로 반환한다.

### 4. 테스트와 사용 문서

설정 파싱, 임베딩 호출, 오류 변환, 명령 종료 코드를 자동 검증한다.
`README.md`에 모델 다운로드와 연결 확인 명령을 기록한다.
모든 검증이 통과하면 이 파일과 `index.json`의 상태를 `completed`로 바꾼다.

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `pyproject.toml` | 수정 |
| `.env.example` | 수정 |
| `src/fos_graphrag/config.py` | 수정 |
| `src/fos_graphrag/embedding.py` | 신규 |
| `src/fos_graphrag/embedding_cli.py` | 신규 |
| `tests/test_config.py` | 수정 |
| `tests/test_embedding.py` | 신규 |
| `tests/test_embedding_cli.py` | 신규 |
| `README.md` | 수정 |

## 검증

```bash
# cwd: /Users/nhn/personal/fos-graphrag
uv run ruff check .
uv run ruff format --check .
uv run pytest
ollama list
uv run graphrag-check-embedding
```

연결 확인 명령이 종료 코드 `0`과 모델명 `qwen3-embedding:0.6b`,
벡터 차원 `1024`를 출력해야 한다.

## 의도 메모 (왜)

- 기존 `langchain-ollama`를 재사용해 새 Python 의존성을 추가하지 않는다.
- Qwen3 Embedding 0.6B는 한국어를 포함한 100개 이상의 언어와 긴 문서 입력을 지원한다.
- `:0.6b` 태그를 고정해 `latest`가 더 큰 모델을 가리키는 문제를 막는다.
- 고정 차원을 검사해 향후 Neo4j 벡터 인덱스 계약이 조용히 어긋나는 것을 막는다.
