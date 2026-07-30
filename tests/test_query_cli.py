from pathlib import Path
from typing import Any

import pytest
from neo4j.exceptions import ServiceUnavailable

from fos_graphrag import query_cli
from fos_graphrag.config import Neo4jSettings


@pytest.fixture(autouse=True)
def stub_settings(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        query_cli.Neo4jSettings,
        "from_env",
        lambda: Neo4jSettings("bolt://localhost:7688", "neo4j", "password"),
    )


def test_query_cli_prints_json_lines(monkeypatch: Any, capsys: Any, tmp_path: Path) -> None:
    query_file = tmp_path / "query.cypher"
    query_file.write_text("RETURN $movie AS movie", encoding="utf-8")
    received: dict[str, Any] = {}

    def fake_execute(
        settings: Neo4jSettings,
        cypher: str,
        parameters: dict[str, Any],
    ) -> list[dict[str, Any]]:
        received.update(
            settings=settings,
            cypher=cypher,
            parameters=parameters,
        )
        return [{"movie": "Crimson Tide"}]

    monkeypatch.setattr(query_cli, "execute_cypher", fake_execute)

    result = query_cli.main([str(query_file), "--params", '{"movie": "Crimson Tide"}'])

    output = capsys.readouterr()
    assert result == 0
    assert output.out == '{"movie": "Crimson Tide"}\n'
    assert output.err == "Cypher 실행 완료 (1개 행)\n"
    assert received["cypher"] == "RETURN $movie AS movie"
    assert received["parameters"] == {"movie": "Crimson Tide"}


@pytest.mark.parametrize("parameters", ["[]", "{invalid"])
def test_query_cli_rejects_invalid_parameters(
    monkeypatch: Any,
    capsys: Any,
    tmp_path: Path,
    parameters: str,
) -> None:
    query_file = tmp_path / "query.cypher"
    query_file.write_text("RETURN 1", encoding="utf-8")
    monkeypatch.setattr(
        query_cli,
        "execute_cypher",
        lambda *_: pytest.fail("입력 오류에서는 쿼리를 실행하면 안 됩니다."),
    )

    assert query_cli.main([str(query_file), "--params", parameters]) == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err.startswith("입력 오류:")


def test_query_cli_reports_database_error(
    monkeypatch: Any,
    capsys: Any,
    tmp_path: Path,
) -> None:
    query_file = tmp_path / "query.cypher"
    query_file.write_text("RETURN 1", encoding="utf-8")

    def raise_database_error(*_: Any) -> list[dict[str, Any]]:
        raise ServiceUnavailable("연결 실패")

    monkeypatch.setattr(query_cli, "execute_cypher", raise_database_error)

    assert query_cli.main([str(query_file)]) == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "Cypher 실행 실패: 연결 실패\n"
