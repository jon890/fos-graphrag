# Java·Python 실습 작업공간

이 저장소는 서로 독립적으로 실행하고 검증할 수 있는 두 실습 프로젝트를 관리한다.

## 프로젝트

- [Python GraphRAG 실습](python-graphrag/README.md): LangChain, Neo4j, Ollama를 사용하는 기존 Python 실습이다.
- [Java 에이전트 실습](java-agent-lab/README.md): Java 21, Spring Boot, Spring AI Ollama, LangGraph4j를 단계적으로 학습하기 위한 뼈대다.

## 검증

Python 검증은 `python-graphrag/`에서 실행한다.

```bash
uv sync --extra dev
uv run pytest
uv run ruff check .
uv run python -c "import fos_graphrag"
docker compose config
```

Java 검증은 `java-agent-lab/`에서 실행한다.

```bash
./gradlew --version
./gradlew dependencies
./gradlew test
```
