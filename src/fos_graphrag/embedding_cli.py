from __future__ import annotations

import sys

from fos_graphrag.config import ConfigurationError, LocalEmbeddingSettings
from fos_graphrag.embedding import LocalEmbeddingError, embed_text


def main() -> int:
    try:
        settings = LocalEmbeddingSettings.from_env()
        vector = embed_text(settings)
    except (ConfigurationError, LocalEmbeddingError) as error:
        print(f"로컬 임베딩 연결 실패: {error}", file=sys.stderr)
        return 1

    print(f"로컬 임베딩 연결 성공 (모델: {settings.model}, 차원: {len(vector)})")
    return 0
