from typing import Any

import pytest
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from fos_graphrag import movies_cli
from fos_graphrag.config import ConfigurationError, Neo4jSettings
from fos_graphrag.movies import MoviesDatasetError, MoviesDatasetStats


@pytest.fixture(autouse=True)
def stub_settings(monkeypatch: Any) -> Neo4jSettings:
    settings = Neo4jSettings(
        uri="bolt://localhost:7688",
        username="neo4j",
        password="password",
    )
    monkeypatch.setattr(
        movies_cli.Neo4jSettings,
        "from_env",
        lambda: settings,
    )
    return settings


def test_movies_cli_prints_seeded_stats(monkeypatch: Any, capsys: Any) -> None:
    monkeypatch.setattr(
        movies_cli,
        "load_movies_dataset",
        lambda _: MoviesDatasetStats(169, 250, False),
    )

    assert movies_cli.main() == 0
    output = capsys.readouterr()
    assert output.err == ""
    assert "Movies 데이터 적재 완료" in output.out
    assert "노드: 169, 관계: 250" in output.out


def test_movies_cli_prints_already_loaded_state(
    monkeypatch: Any,
    capsys: Any,
) -> None:
    monkeypatch.setattr(
        movies_cli,
        "load_movies_dataset",
        lambda _: MoviesDatasetStats(169, 250, True),
    )

    assert movies_cli.main() == 0
    output = capsys.readouterr()
    assert output.err == ""
    assert "Movies 데이터 이미 적재됨" in output.out


def test_movies_cli_reports_dataset_failure(monkeypatch: Any, capsys: Any) -> None:
    def raise_dataset_error(_: Neo4jSettings) -> MoviesDatasetStats:
        raise MoviesDatasetError("데이터 존재")

    monkeypatch.setattr(
        movies_cli,
        "load_movies_dataset",
        raise_dataset_error,
    )

    assert movies_cli.main() == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "Movies 데이터 적재 실패: 데이터 존재\n"


@pytest.mark.parametrize(
    "database_error",
    [
        ServiceUnavailable("연결 실패"),
        Neo4jError("APOC 호출 실패"),
    ],
)
def test_movies_cli_reports_database_failure(
    monkeypatch: Any,
    capsys: Any,
    database_error: Exception,
) -> None:
    def raise_database_error(_: Neo4jSettings) -> MoviesDatasetStats:
        raise database_error

    monkeypatch.setattr(
        movies_cli,
        "load_movies_dataset",
        raise_database_error,
    )

    assert movies_cli.main() == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == f"Movies 데이터 적재 실패: {database_error}\n"


def test_movies_cli_reports_configuration_failure(
    monkeypatch: Any,
    capsys: Any,
) -> None:
    def raise_configuration_error() -> Neo4jSettings:
        raise ConfigurationError("환경변수 누락")

    monkeypatch.setattr(
        movies_cli.Neo4jSettings,
        "from_env",
        raise_configuration_error,
    )

    assert movies_cli.main() == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "설정 오류: 환경변수 누락\n"
