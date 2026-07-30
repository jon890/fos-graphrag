from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from neo4j import GraphDatabase

from fos_graphrag.config import Neo4jSettings

EXPECTED_MOVIE_NODES = 169
EXPECTED_MOVIE_RELATIONSHIPS = 250
EXPECTED_LABEL_COUNTS = {
    "Person": 131,
    "Movie": 38,
}
EXPECTED_RELATIONSHIP_COUNTS = {
    "ACTED_IN": 172,
    "DIRECTED": 44,
    "FOLLOWS": 3,
    "PRODUCED": 14,
    "REVIEWED": 8,
    "WROTE": 9,
}

DATASET_STATE_QUERY = """
CALL () {
    MATCH (n)
    RETURN
        count(n) AS nodes,
        count(CASE WHEN 'Person' IN labels(n) THEN 1 END) AS person_nodes,
        count(CASE WHEN 'Movie' IN labels(n) THEN 1 END) AS movie_nodes,
        count(
            CASE
                WHEN 'Movie' IN labels(n) AND n['title'] = 'The Matrix' THEN 1
            END
        ) AS matrix_movies
}
CALL () {
    MATCH ()-[r]->()
    RETURN
        count(r) AS relationships,
        count(CASE WHEN type(r) = 'ACTED_IN' THEN 1 END) AS acted_in,
        count(CASE WHEN type(r) = 'DIRECTED' THEN 1 END) AS directed,
        count(CASE WHEN type(r) = 'FOLLOWS' THEN 1 END) AS follows,
        count(CASE WHEN type(r) = 'PRODUCED' THEN 1 END) AS produced,
        count(CASE WHEN type(r) = 'REVIEWED' THEN 1 END) AS reviewed,
        count(CASE WHEN type(r) = 'WROTE' THEN 1 END) AS wrote
}
RETURN
    nodes,
    relationships,
    {Person: person_nodes, Movie: movie_nodes} AS label_counts,
    {
        ACTED_IN: acted_in,
        DIRECTED: directed,
        FOLLOWS: follows,
        PRODUCED: produced,
        REVIEWED: reviewed,
        WROTE: wrote
    } AS relationship_counts,
    matrix_movies
"""

LOAD_MOVIES_QUERY = """
CALL apoc.example.movies()
YIELD done
RETURN done
"""


class MoviesDatasetError(RuntimeError):
    """Movies 예제 데이터를 안전하게 적재할 수 없을 때 발생합니다."""


@dataclass(frozen=True, slots=True)
class MoviesDatasetStats:
    nodes: int
    relationships: int
    already_loaded: bool


@dataclass(frozen=True, slots=True)
class _DatasetState:
    nodes: int
    relationships: int
    label_counts: dict[str, int]
    relationship_counts: dict[str, int]
    matrix_movies: int

    @property
    def is_empty(self) -> bool:
        return self.nodes == 0 and self.relationships == 0

    @property
    def is_complete_movies_dataset(self) -> bool:
        return (
            self.nodes == EXPECTED_MOVIE_NODES
            and self.relationships == EXPECTED_MOVIE_RELATIONSHIPS
            and self.label_counts == EXPECTED_LABEL_COUNTS
            and self.relationship_counts == EXPECTED_RELATIONSHIP_COUNTS
            and self.matrix_movies == 1
        )


def load_movies_dataset(settings: Neo4jSettings) -> MoviesDatasetStats:
    with GraphDatabase.driver(
        settings.uri,
        auth=(settings.username, settings.password),
    ) as driver:
        current_state = _read_dataset_state(driver, settings.database)

        if current_state.is_complete_movies_dataset:
            return MoviesDatasetStats(
                nodes=current_state.nodes,
                relationships=current_state.relationships,
                already_loaded=True,
            )

        if not current_state.is_empty:
            raise MoviesDatasetError(
                "대상 데이터베이스가 비어 있지 않거나 Movies 데이터가 일부만 적재되어 있습니다."
            )

        load_result = driver.execute_query(
            LOAD_MOVIES_QUERY,
            database_=settings.database,
        )
        load_record = _single_record(load_result.records, "Movies 적재 결과")
        if not load_record["done"]:
            raise MoviesDatasetError("APOC Movies 적재 절차가 완료되지 않았습니다.")

        loaded_state = _read_dataset_state(driver, settings.database)
        if not loaded_state.is_complete_movies_dataset:
            raise MoviesDatasetError(
                "Movies 적재 결과가 기대값과 다릅니다: "
                f"노드 {loaded_state.nodes}, 관계 {loaded_state.relationships}"
            )

        return MoviesDatasetStats(
            nodes=loaded_state.nodes,
            relationships=loaded_state.relationships,
            already_loaded=False,
        )


def _read_dataset_state(driver: Any, database: str) -> _DatasetState:
    result = driver.execute_query(DATASET_STATE_QUERY, database_=database)
    record = _single_record(result.records, "데이터베이스 상태")
    return _DatasetState(
        nodes=record["nodes"],
        relationships=record["relationships"],
        label_counts=record["label_counts"],
        relationship_counts=record["relationship_counts"],
        matrix_movies=record["matrix_movies"],
    )


def _single_record(records: list[Any], context: str) -> Any:
    if len(records) != 1:
        raise MoviesDatasetError(f"{context}를 하나의 행으로 읽을 수 없습니다.")
    return records[0]
