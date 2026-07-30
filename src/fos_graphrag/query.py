from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any, LiteralString, cast

from neo4j import Query

from fos_graphrag.config import Neo4jSettings
from fos_graphrag.database import create_neo4j_driver


class CypherFileError(ValueError):
    """Cypher 파일을 읽거나 실행할 수 있는 형태로 해석하지 못했을 때 발생합니다."""


def load_cypher_file(path: Path) -> str:
    try:
        query = path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as error:
        raise CypherFileError(f"Cypher 파일을 읽을 수 없습니다: {path}") from error

    if not query:
        raise CypherFileError(f"Cypher 파일이 비어 있습니다: {path}")
    return query


def execute_cypher(
    settings: Neo4jSettings,
    query: str,
    parameters: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    # Cypher 파일 자체를 실행 가능한 소스로 취급하고 값은 parameters_로 분리합니다.
    with create_neo4j_driver(settings) as driver:
        result = driver.execute_query(
            Query(cast(LiteralString, query)),
            parameters_=dict(parameters or {}),
            database_=settings.database,
        )
        return [record.data() for record in result.records]
