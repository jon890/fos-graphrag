from typing import Any

from fos_graphrag import embedding_cli
from fos_graphrag.config import ConfigurationError, LocalEmbeddingSettings
from fos_graphrag.embedding import LocalEmbeddingError


def test_embedding_cli_prints_success(monkeypatch: Any, capsys: Any) -> None:
    settings = LocalEmbeddingSettings(dimensions=3)
    monkeypatch.setattr(
        embedding_cli.LocalEmbeddingSettings,
        "from_env",
        lambda: settings,
    )
    monkeypatch.setattr(
        embedding_cli,
        "embed_text",
        lambda _: [0.1, 0.2, 0.3],
    )

    assert embedding_cli.main() == 0
    output = capsys.readouterr()
    assert output.err == ""
    assert settings.model in output.out
    assert "차원: 3" in output.out


def test_embedding_cli_reports_connection_failure(
    monkeypatch: Any,
    capsys: Any,
) -> None:
    def raise_connection_error(_: LocalEmbeddingSettings) -> list[float]:
        raise LocalEmbeddingError("연결 거부")

    monkeypatch.setattr(
        embedding_cli,
        "embed_text",
        raise_connection_error,
    )

    assert embedding_cli.main() == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "로컬 임베딩 연결 실패: 연결 거부\n"


def test_embedding_cli_reports_configuration_failure(
    monkeypatch: Any,
    capsys: Any,
) -> None:
    def raise_configuration_error() -> LocalEmbeddingSettings:
        raise ConfigurationError("잘못된 차원")

    monkeypatch.setattr(
        embedding_cli.LocalEmbeddingSettings,
        "from_env",
        raise_configuration_error,
    )

    assert embedding_cli.main() == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "로컬 임베딩 연결 실패: 잘못된 차원\n"
