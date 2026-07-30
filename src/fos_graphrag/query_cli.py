from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from neo4j.exceptions import DriverError, Neo4jError

from fos_graphrag.config import ConfigurationError, Neo4jSettings
from fos_graphrag.query import CypherFileError, execute_cypher, load_cypher_file


class QueryInputError(ValueError):
    """쿼리 실행 명령의 입력이 올바르지 않을 때 발생합니다."""


def _parse_parameters(raw_parameters: str) -> dict[str, Any]:
    try:
        parameters = json.loads(raw_parameters)
    except json.JSONDecodeError as error:
        raise QueryInputError("--params는 올바른 JSON 객체여야 합니다.") from error

    if not isinstance(parameters, dict):
        raise QueryInputError("--params는 JSON 객체여야 합니다.")
    return parameters


def _create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="파일에 작성한 Cypher 쿼리를 실행합니다.")
    parser.add_argument("query_file", type=Path, help="실행할 .cypher 파일")
    parser.add_argument(
        "--params",
        default="{}",
        help='Cypher 매개변수 JSON 객체. 예: \'{"movie": "Crimson Tide"}\'',
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _create_parser().parse_args(argv)

    try:
        query = load_cypher_file(args.query_file)
        parameters = _parse_parameters(args.params)
        settings = Neo4jSettings.from_env()
        records = execute_cypher(settings, query, parameters)
    except (ConfigurationError, CypherFileError, QueryInputError) as error:
        print(f"입력 오류: {error}", file=sys.stderr)
        return 2
    except (DriverError, Neo4jError) as error:
        print(f"Cypher 실행 실패: {error}", file=sys.stderr)
        return 1

    for record in records:
        print(json.dumps(record, ensure_ascii=False, default=str))
    print(f"Cypher 실행 완료 ({len(records)}개 행)", file=sys.stderr)
    return 0
