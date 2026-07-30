from __future__ import annotations

import sys

from neo4j.exceptions import DriverError, Neo4jError

from fos_graphrag.config import ConfigurationError, Neo4jSettings
from fos_graphrag.movies import MoviesDatasetError, load_movies_dataset


def main() -> int:
    try:
        settings = Neo4jSettings.from_env()
        stats = load_movies_dataset(settings)
    except ConfigurationError as error:
        print(f"설정 오류: {error}", file=sys.stderr)
        return 2
    except (DriverError, Neo4jError, MoviesDatasetError, ValueError) as error:
        print(f"Movies 데이터 적재 실패: {error}", file=sys.stderr)
        return 1

    state = "이미 적재됨" if stats.already_loaded else "적재 완료"
    print(
        f"Movies 데이터 {state} "
        f"(노드: {stats.nodes}, 관계: {stats.relationships}, 데이터베이스: {settings.database})"
    )
    return 0
