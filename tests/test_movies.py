from types import SimpleNamespace
from typing import Any

import pytest

from fos_graphrag import movies
from fos_graphrag.config import Neo4jSettings

COMPLETE_STATE = {
    "nodes": movies.EXPECTED_MOVIE_NODES,
    "relationships": movies.EXPECTED_MOVIE_RELATIONSHIPS,
    "label_counts": movies.EXPECTED_LABEL_COUNTS,
    "relationship_counts": movies.EXPECTED_RELATIONSHIP_COUNTS,
}


class FakeDriver:
    def __init__(self, records: list[dict[str, Any]]) -> None:
        self.records = records
        self.queries: list[tuple[str, str]] = []
        self.closed = False

    def __enter__(self) -> "FakeDriver":
        return self

    def __exit__(self, *_: Any) -> None:
        self.closed = True

    def execute_query(self, query: str, *, database_: str) -> SimpleNamespace:
        self.queries.append((query, database_))
        return SimpleNamespace(records=self.records)


def settings() -> Neo4jSettings:
    return Neo4jSettings(
        uri="bolt://localhost:7688",
        username="neo4j",
        password="password",
    )


def install_fake_driver(monkeypatch: Any, fake_driver: FakeDriver) -> dict[str, Any]:
    received: dict[str, Any] = {}

    def fake_graph_database_driver(uri: str, auth: tuple[str, str]) -> FakeDriver:
        received["uri"] = uri
        received["auth"] = auth
        return fake_driver

    monkeypatch.setattr(movies.GraphDatabase, "driver", fake_graph_database_driver)
    return received


def test_verify_movies_dataset_returns_official_counts(monkeypatch: Any) -> None:
    fake_driver = FakeDriver([COMPLETE_STATE])
    received = install_fake_driver(monkeypatch, fake_driver)

    result = movies.verify_movies_dataset(settings())

    assert result == movies.MoviesDatasetStats(
        nodes=28_863,
        relationships=166_261,
        movies=9_125,
        users=671,
        ratings=100_004,
    )
    assert received == {
        "uri": "bolt://localhost:7688",
        "auth": ("neo4j", "password"),
    }
    assert fake_driver.queries == [(movies.DATASET_STATE_QUERY, "neo4j")]
    assert fake_driver.closed


def test_verify_movies_dataset_rejects_unexpected_counts(monkeypatch: Any) -> None:
    unexpected_state = {
        **COMPLETE_STATE,
        "relationship_counts": {
            **movies.EXPECTED_RELATIONSHIP_COUNTS,
            "RATED": 0,
        },
    }
    fake_driver = FakeDriver([unexpected_state])
    install_fake_driver(monkeypatch, fake_driver)

    with pytest.raises(movies.MoviesDatasetError, match="RATED 0"):
        movies.verify_movies_dataset(settings())


def test_verify_movies_dataset_rejects_missing_result(monkeypatch: Any) -> None:
    fake_driver = FakeDriver([])
    install_fake_driver(monkeypatch, fake_driver)

    with pytest.raises(movies.MoviesDatasetError, match="하나의 행"):
        movies.verify_movies_dataset(settings())
