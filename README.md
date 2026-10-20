# Java·Python 실습 작업공간

이 저장소는 서로 독립적으로 실행하고 검증할 수 있는 두 실습 프로젝트와 금융 온톨로지 워크벤치를 관리한다.

## 프로젝트

- [Python GraphRAG 실습](python-graphrag/README.md): LangChain, Neo4j, Ollama를 사용하는 기존 Python 실습이다.
- [Java 에이전트 실습](java-agent-lab/README.md): Java 21, Spring Boot, Spring AI Ollama, LangGraph4j를 단계적으로 학습하기 위한 뼈대다.
- [금융 온톨로지 워크벤치](financial-workbench/README.md): 기업, 종목, 관계와 근거를 Neo4j 에 두고 두 사람이 웹에서 함께 관리하는 Kotlin, React 애플리케이션이다.

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

금융 온톨로지 워크벤치 검증은 `financial-workbench/`에서 실행한다. 자세한 순서는 그 디렉터리의 README 에 있다.

```bash
bash scripts/tests/test_scripts.sh
(cd api && ./gradlew test)
(cd web && npm ci && npm run typecheck && npm test && npm run build)
```
