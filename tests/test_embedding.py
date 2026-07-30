import re
from typing import Any

import pytest
from httpx import HTTPError
from ollama import ResponseError

from fos_graphrag import embedding
from fos_graphrag.config import LocalEmbeddingSettings


class FakeEmbeddings:
    def __init__(self, vector: list[float]) -> None:
        self.vector = vector
        self.text: str | None = None

    def embed_query(self, text: str) -> list[float]:
        self.text = text
        return self.vector


def test_embed_text_uses_ollama_and_returns_vector(monkeypatch: Any) -> None:
    fake_embeddings = FakeEmbeddings([0.1, 0.2, 0.3])
    received: dict[str, Any] = {}

    def fake_ollama_embeddings(**kwargs: Any) -> FakeEmbeddings:
        received.update(kwargs)
        return fake_embeddings

    monkeypatch.setattr(embedding, "OllamaEmbeddings", fake_ollama_embeddings)

    result = embedding.embed_text(
        LocalEmbeddingSettings(
            base_url="http://localhost:11434",
            model="qwen3-embedding:0.6b",
            dimensions=3,
        ),
        "한국어 문장",
    )

    assert result == [0.1, 0.2, 0.3]
    assert received == {
        "model": "qwen3-embedding:0.6b",
        "base_url": "http://localhost:11434",
        "dimensions": 3,
    }
    assert fake_embeddings.text == "한국어 문장"


def test_embed_text_rejects_blank_input() -> None:
    with pytest.raises(embedding.LocalEmbeddingError, match="텍스트가 비어"):
        embedding.embed_text(LocalEmbeddingSettings(), " ")


def test_embed_text_rejects_empty_vector(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        embedding,
        "OllamaEmbeddings",
        lambda **_: FakeEmbeddings([]),
    )

    with pytest.raises(embedding.LocalEmbeddingError, match="빈 벡터"):
        embedding.embed_text(LocalEmbeddingSettings())


def test_embed_text_rejects_unexpected_dimensions(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        embedding,
        "OllamaEmbeddings",
        lambda **_: FakeEmbeddings([0.1, 0.2]),
    )

    with pytest.raises(
        embedding.LocalEmbeddingError,
        match="기대 1024, 실제 2",
    ):
        embedding.embed_text(LocalEmbeddingSettings())


@pytest.mark.parametrize(
    "upstream_error",
    [
        HTTPError("연결 실패"),
        ResponseError("모델 없음", 404),
        ValueError("잘못된 요청"),
    ],
)
def test_embed_text_wraps_upstream_errors(
    monkeypatch: Any,
    upstream_error: Exception,
) -> None:
    def raise_upstream_error(**_: Any) -> FakeEmbeddings:
        raise upstream_error

    monkeypatch.setattr(
        embedding,
        "OllamaEmbeddings",
        raise_upstream_error,
    )

    with pytest.raises(
        embedding.LocalEmbeddingError,
        match=re.escape(str(upstream_error)),
    ) as error:
        embedding.embed_text(LocalEmbeddingSettings())

    assert error.value.__cause__ is upstream_error
