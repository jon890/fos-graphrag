from __future__ import annotations

from httpx import HTTPError
from langchain_ollama import OllamaEmbeddings
from ollama import ResponseError

from fos_graphrag.config import LocalEmbeddingSettings

CONNECTION_TEXT = "Neo4j와 LangChain으로 한국어 GraphRAG를 학습합니다."


class LocalEmbeddingError(RuntimeError):
    """Ollama 연결 또는 임베딩 결과가 올바르지 않을 때 발생합니다."""


def embed_text(
    settings: LocalEmbeddingSettings,
    text: str = CONNECTION_TEXT,
) -> list[float]:
    if not text.strip():
        raise LocalEmbeddingError("임베딩할 텍스트가 비어 있습니다.")

    try:
        embeddings = OllamaEmbeddings(
            model=settings.model,
            base_url=settings.base_url,
            dimensions=settings.dimensions,
        )
        vector = embeddings.embed_query(text)
    except (HTTPError, ResponseError, ValueError) as error:
        raise LocalEmbeddingError(str(error)) from error

    if not vector:
        raise LocalEmbeddingError("임베딩 모델이 빈 벡터를 반환했습니다.")

    if len(vector) != settings.dimensions:
        raise LocalEmbeddingError(
            f"임베딩 차원이 올바르지 않습니다: 기대 {settings.dimensions}, 실제 {len(vector)}"
        )

    return vector
