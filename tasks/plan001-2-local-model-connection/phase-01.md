# Phase 01 — Ollama 로컬 모델 연결

**Execution profile**: standard
**Status**: completed

---

## 목표

Ollama의 `nemotron-3-nano:4b`를 LangChain에서 호출하고 비어 있지 않은 응답을 확인한다.

**범위 외**: 문서 처리, 그래프 생성, Neo4j 저장, 검색, GraphRAG 답변 체인을 구현하지 않는다.

---

## 작업 항목 (4)

### 1. 의존성과 설정

`pyproject.toml`에 `langchain-ollama`를 추가하고 `.env.example`에 Ollama 주소와 모델명을 정의한다.

### 2. 모델 호출 경계

`src/fos_graphrag/model.py`에 `ChatOllama` 생성과 짧은 메시지 호출을 구현한다.

### 3. 연결 확인 명령

`src/fos_graphrag/model_cli.py`에 성공 출력과 Ollama 미실행·모델 미설치 오류 처리를 구현한다.

### 4. 테스트와 문서

설정·모델 호출·명령 종료 코드를 자동 검증하고 `README.md`에 설치와 실행 방법을 기록한다.
모든 검증이 통과하면 이 파일과 `index.json`의 상태를 `completed`로 바꾼다.

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `pyproject.toml` | 수정 |
| `.env.example` | 수정 |
| `src/fos_graphrag/config.py` | 수정 |
| `src/fos_graphrag/model.py` | 신규 |
| `src/fos_graphrag/model_cli.py` | 신규 |
| `tests/` | 수정·신규 |
| `README.md` | 수정 |

## 검증

```bash
# cwd: /Users/nhn/personal/fos-graphrag
uv sync --extra dev
uv run ruff check .
uv run ruff format --check .
uv run pytest
ollama list
uv run graphrag-check-model
```

모델 연결 명령이 종료 코드 `0`과 비어 있지 않은 모델 응답을 출력해야 한다.

## 의도 메모 (왜)

- 로컬 Ollama는 외부 API 키와 호출 비용 없이 LangChain 모델 경계를 학습할 수 있다.
- `nemotron-3-nano:4b`는 약 2.8GB라 현재 학습 환경에서 연결 확인에 적합하다.
- Ollama를 호스트에서 실행해 macOS 로컬 가속을 활용한다.
