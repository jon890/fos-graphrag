from types import SimpleNamespace
from typing import Any

import pytest

from fos_graphrag import model
from fos_graphrag.config import LocalModelSettings


class FakeChatModel:
    def __init__(self, content: object) -> None:
        self.content = content
        self.messages: list[Any] | None = None

    def invoke(self, messages: list[Any]) -> SimpleNamespace:
        self.messages = messages
        return SimpleNamespace(content=self.content)


def test_invoke_local_model_uses_ollama_and_returns_text(monkeypatch: Any) -> None:
    fake_model = FakeChatModel("로컬 모델 연결 성공입니다.")
    received: dict[str, Any] = {}

    def fake_chat_ollama(**kwargs: Any) -> FakeChatModel:
        received.update(kwargs)
        return fake_model

    monkeypatch.setattr(model, "ChatOllama", fake_chat_ollama)

    result = model.invoke_local_model(
        LocalModelSettings(
            base_url="http://localhost:11434",
            model="nemotron-3-nano:4b",
        )
    )

    assert result == "로컬 모델 연결 성공입니다."
    assert received == {
        "model": "nemotron-3-nano:4b",
        "base_url": "http://localhost:11434",
        "temperature": 0,
        "reasoning": False,
        "num_ctx": 8192,
        "num_predict": 128,
    }
    assert fake_model.messages is not None


@pytest.mark.parametrize("content", ["", "   ", []])
def test_invoke_local_model_rejects_empty_content(
    monkeypatch: Any,
    content: object,
) -> None:
    monkeypatch.setattr(model, "ChatOllama", lambda **_: FakeChatModel(content))

    with pytest.raises(model.LocalModelError, match="빈 응답"):
        model.invoke_local_model(LocalModelSettings())
