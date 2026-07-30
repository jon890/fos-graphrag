from types import SimpleNamespace
from typing import Any

import pytest

from fos_graphrag import movies
from fos_graphrag.config import Neo4jSettings

EMPTY_STATE = {
    "nodes": 0,
    "relationships": 0,
    "label_counts": {
        "Person": 0,
        "Movie": 0,
    },
    "relationship_counts": {
        "ACTED_IN": 0,
        "DIRECTED": 0,
        "FOLLOWS": 0,
        "PRODUCED": 0,
        "REVIEWED": 0,
        "WROTE": 0,
    },
    "matrix_movies": 0,
}
COMPLETE_STATE = {
    "nodes": movies.EXPECTED_MOVIE_NODES,
    "relationships": movies.EXPECTED_MOVIE_RELATIONSHIPS,
    "label_counts": movies.EXPECTED_LABEL_COUNTS,
    "relationship_counts": movies.EXPECTED_RELATIONSHIP_COUNTS,
    "matrix_movies": 1,
}


class FakeDriver:
    def __init__(self, records_by_query: list[list[dict[str, Any]]]) -> None:
        self.records_by_query = records_by_query
        self.queries: list[tuple[str, str]] = []
        self.closed = False

    def __enter__(self) -> "FakeDriver":
        return self

    def __exit__(self, *_: Any) -> None:
        self.closed = True

    def execute_query(self, query: str, *, database_: str) -> SimpleNamespace:
        self.queries.append((query, database_))
        return SimpleNamespace(records=self.records_by_query.pop(0))


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

    monkeypatch.setattr(
        movies.GraphDatabase,
        "driver",
        fake_graph_database_driver,
    )
    return received


def test_load_movies_dataset_seeds_empty_database(monkeypatch: Any) -> None:
    fake_driver = FakeDriver(
        [
            [EMPTY_STATE],
            [{"done": True}],
            [COMPLETE_STATE],
        ]
    )
    received = install_fake_driver(monkeypatch, fake_driver)

    result = movies.load_movies_dataset(settings())

    assert result == movies.MoviesDatasetStats(
        nodes=169,
        relationships=250,
        already_loaded=False,
    )
    assert received == {
        "uri": "bolt://localhost:7688",
        "auth": ("neo4j", "password"),
    }
    assert [query for query, _ in fake_driver.queries] == [
        movies.DATASET_STATE_QUERY,
        movies.LOAD_MOVIES_QUERY,
        movies.DATASET_STATE_QUERY,
    ]
    assert fake_driver.closed


def test_load_movies_dataset_reuses_complete_dataset(monkeypatch: Any) -> None:
    fake_driver = FakeDriver([[COMPLETE_STATE]])
    install_fake_driver(monkeypatch, fake_driver)

    result = movies.load_movies_dataset(settings())

    assert result.already_loaded
    assert len(fake_driver.queries) == 1


@pytest.mark.parametrize(
    "current_state",
    [
        {
            **EMPTY_STATE,
            "nodes": 1,
        },
        {
            **COMPLETE_STATE,
            "nodes": 100,
            "relationships": 80,
        },
    ],
)
def test_load_movies_dataset_rejects_non_empty_or_partial_database(
    monkeypatch: Any,
    current_state: dict[str, Any],
) -> None:
    fake_driver = FakeDriver([[current_state]])
    install_fake_driver(monkeypatch, fake_driver)

    with pytest.raises(movies.MoviesDatasetError, match="비어 있지 않거나"):
        movies.load_movies_dataset(settings())

    assert len(fake_driver.queries) == 1


def test_load_movies_dataset_rejects_unexpected_result(monkeypatch: Any) -> None:
    unexpected_state = {
        **COMPLETE_STATE,
        "nodes": 168,
    }
    fake_driver = FakeDriver(
        [
            [EMPTY_STATE],
            [{"done": True}],
            [unexpected_state],
        ]
    )
    install_fake_driver(monkeypatch, fake_driver)

    with pytest.raises(movies.MoviesDatasetError, match="노드 168, 관계 250"):
        movies.load_movies_dataset(settings())
