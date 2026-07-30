from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from neo4j import Query

from fos_graphrag import query
from fos_graphrag.config import Neo4jSettings


class FakeRecord:
    def __init__(self, value: dict[str, Any]) -> None:
        self.value = value

    def data(self) -> dict[str, Any]:
        return self.value


class FakeDriver:
    def __init__(self) -> None:
        self.received: dict[str, Any] = {}
        self.closed = False

    def __enter__(self) -> "FakeDriver":
        return self

    def __exit__(self, *_: Any) -> None:
        self.closed = True

    def execute_query(
        self,
        cypher: Query,
        *,
        parameters_: dict[str, Any],
        database_: str,
    ) -> SimpleNamespace:
        self.received = {
            "cypher": cypher.text,
            "parameters": parameters_,
            "database": database_,
        }
        return SimpleNamespace(records=[FakeRecord({"title": "The Matrix"})])


def settings() -> Neo4jSettings:
    return Neo4jSettings(
        uri="bolt://localhost:7688",
        username="neo4j",
        password="password",
    )


def test_load_cypher_file_reads_utf8(tmp_path: Path) -> None:
    query_file = tmp_path / "query.cypher"
    query_file.write_text("  RETURN '영화' AS category  \n", encoding="utf-8")

    assert query.load_cypher_file(query_file) == "RETURN '영화' AS category"


@pytest.mark.parametrize("file_exists", [False, True])
def test_load_cypher_file_rejects_missing_or_empty_file(
    tmp_path: Path,
    file_exists: bool,
) -> None:
    query_file = tmp_path / "query.cypher"
    if file_exists:
        query_file.write_text(" \n", encoding="utf-8")

    with pytest.raises(query.CypherFileError):
        query.load_cypher_file(query_file)


def test_execute_cypher_passes_parameters_and_closes_driver(monkeypatch: Any) -> None:
    fake_driver = FakeDriver()
    monkeypatch.setattr(query, "create_neo4j_driver", lambda _: fake_driver)

    records = query.execute_cypher(
        settings(),
        "MATCH (movie:Movie {title: $title}) RETURN movie.title AS title",
        {"title": "The Matrix"},
    )

    assert records == [{"title": "The Matrix"}]
    assert fake_driver.received == {
        "cypher": "MATCH (movie:Movie {title: $title}) RETURN movie.title AS title",
        "parameters": {"title": "The Matrix"},
        "database": "neo4j",
    }
    assert fake_driver.closed
