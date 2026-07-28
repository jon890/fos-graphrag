from typing import Any

from fos_graphrag import model_cli
from fos_graphrag.config import LocalModelSettings
from fos_graphrag.model import LocalModelError


def test_model_cli_prints_success(monkeypatch: Any, capsys: Any) -> None:
    settings = LocalModelSettings()
    monkeypatch.setattr(
        model_cli.LocalModelSettings,
        "from_env",
        lambda: settings,
    )
    monkeypatch.setattr(
        model_cli,
        "invoke_local_model",
        lambda _: "로컬 모델 연결 성공입니다.",
    )

    assert model_cli.main() == 0
    output = capsys.readouterr()
    assert output.err == ""
    assert "로컬 모델 연결 성공" in output.out
    assert settings.model in output.out


def test_model_cli_reports_connection_failure(monkeypatch: Any, capsys: Any) -> None:
    def raise_connection_error(_: LocalModelSettings) -> str:
        raise LocalModelError("연결 거부")

    monkeypatch.setattr(
        model_cli,
        "invoke_local_model",
        raise_connection_error,
    )

    assert model_cli.main() == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "로컬 모델 연결 실패: 연결 거부\n"
