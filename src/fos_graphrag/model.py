from __future__ import annotations

from httpx import HTTPError
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from ollama import ResponseError

from fos_graphrag.config import LocalModelSettings

CONNECTION_PROMPT = (
    "GraphRAG를 공부 중입니다. "
    "'로컬 모델 연결 성공'이라는 문구를 포함해 한국어 한 문장으로 인사해 주세요."
)


class LocalModelError(RuntimeError):
    """Ollama 연결 또는 모델 응답이 올바르지 않을 때 발생합니다."""


def invoke_local_model(
    settings: LocalModelSettings,
    prompt: str = CONNECTION_PROMPT,
) -> str:
    try:
        model = ChatOllama(
            model=settings.model,
            base_url=settings.base_url,
            temperature=0,
            reasoning=False,
            num_ctx=8192,
            num_predict=128,
        )
        response = model.invoke(
            [
                SystemMessage(content="간결하고 정확한 한국어로 답하세요."),
                HumanMessage(content=prompt),
            ]
        )
    except (HTTPError, ResponseError) as error:
        raise LocalModelError(str(error)) from error

    if not isinstance(response.content, str) or not response.content.strip():
        raise LocalModelError("모델이 빈 응답을 반환했습니다.")

    return response.content.strip()
