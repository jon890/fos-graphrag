from __future__ import annotations

import sys

from neo4j.exceptions import DriverError, Neo4jError

from fos_graphrag.config import ConfigurationError, Neo4jSettings
from fos_graphrag.movies import MoviesDatasetError, verify_movies_dataset


def main() -> int:
    try:
        settings = Neo4jSettings.from_env()
        stats = verify_movies_dataset(settings)
    except ConfigurationError as error:
        print(f"설정 오류: {error}", file=sys.stderr)
        return 2
    except (DriverError, Neo4jError, MoviesDatasetError, ValueError) as error:
        print(f"영화 추천 데이터 확인 실패: {error}", file=sys.stderr)
        return 1

    print(
        "영화 추천 데이터 확인 성공 "
        f"(노드: {stats.nodes}, 관계: {stats.relationships}, "
        f"영화: {stats.movies}, 사용자: {stats.users}, RATED: {stats.ratings}, "
        f"데이터베이스: {settings.database})"
    )
    return 0
