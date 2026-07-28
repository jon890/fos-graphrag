from __future__ import annotations

import sys

from neo4j.exceptions import DriverError, Neo4jError

from fos_graphrag.config import ConfigurationError, Neo4jSettings
from fos_graphrag.database import verify_neo4j_connection


def main() -> int:
    try:
        settings = Neo4jSettings.from_env()
        verify_neo4j_connection(settings)
    except ConfigurationError as error:
        print(f"설정 오류: {error}", file=sys.stderr)
        return 2
    except (DriverError, Neo4jError, ValueError) as error:
        print(f"Neo4j 연결 실패: {error}", file=sys.stderr)
        return 1

    print(f"Neo4j 연결 성공 (주소: {settings.uri}, 데이터베이스: {settings.database})")
    return 0
