from typing import Any

from fos_graphrag import database
from fos_graphrag.config import Neo4jSettings


class FakeDriver:
    def __init__(self) -> None:
        self.connectivity_verified = False
        self.closed = False
        self.query: tuple[str, str] | None = None

    def __enter__(self) -> "FakeDriver":
        return self

    def __exit__(self, *_: Any) -> None:
        self.closed = True

    def verify_connectivity(self) -> None:
        self.connectivity_verified = True

    def execute_query(self, query: str, *, database_: str) -> None:
        self.query = (query, database_)


def test_verify_connection_uses_credentials_and_closes_driver(monkeypatch: Any) -> None:
    fake_driver = FakeDriver()
    received: dict[str, Any] = {}

    def fake_graph_database_driver(uri: str, auth: tuple[str, str]) -> FakeDriver:
        received["uri"] = uri
        received["auth"] = auth
        return fake_driver

    monkeypatch.setattr(
        database.GraphDatabase,
        "driver",
        fake_graph_database_driver,
    )

    database.verify_neo4j_connection(
        Neo4jSettings(
            uri="bolt://localhost:7688",
            username="neo4j",
            password="password",
        )
    )

    assert received == {
        "uri": "bolt://localhost:7688",
        "auth": ("neo4j", "password"),
    }
    assert fake_driver.connectivity_verified
    assert fake_driver.query == ("RETURN 1 AS ok", "neo4j")
    assert fake_driver.closed
