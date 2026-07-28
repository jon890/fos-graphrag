from __future__ import annotations

import sys

from fos_graphrag.config import LocalModelSettings
from fos_graphrag.model import LocalModelError, invoke_local_model


def main() -> int:
    settings = LocalModelSettings.from_env()

    try:
        response = invoke_local_model(settings)
    except LocalModelError as error:
        print(f"로컬 모델 연결 실패: {error}", file=sys.stderr)
        return 1

    print(f"로컬 모델 연결 성공 (모델: {settings.model})")
    print(f"응답: {response}")
    return 0
