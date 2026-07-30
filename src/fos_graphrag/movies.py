from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from neo4j import GraphDatabase

from fos_graphrag.config import Neo4jSettings

EXPECTED_MOVIE_NODES = 28_863
EXPECTED_MOVIE_RELATIONSHIPS = 166_261
EXPECTED_LABEL_COUNTS = {
    "Actor": 15_443,
    "Director": 4_091,
    "Genre": 20,
    "Movie": 9_125,
    "Person": 19_047,
    "User": 671,
}
EXPECTED_RELATIONSHIP_COUNTS = {
    "ACTED_IN": 35_910,
    "DIRECTED": 10_007,
    "IN_GENRE": 20_340,
    "RATED": 100_004,
}

DATASET_STATE_QUERY = """
CALL () {
    MATCH (n)
    RETURN
        count(n) AS nodes,
        count(CASE WHEN 'Actor' IN labels(n) THEN 1 END) AS actor_nodes,
        count(CASE WHEN 'Director' IN labels(n) THEN 1 END) AS director_nodes,
        count(CASE WHEN 'Genre' IN labels(n) THEN 1 END) AS genre_nodes,
        count(CASE WHEN 'Person' IN labels(n) THEN 1 END) AS person_nodes,
        count(CASE WHEN 'Movie' IN labels(n) THEN 1 END) AS movie_nodes,
        count(CASE WHEN 'User' IN labels(n) THEN 1 END) AS user_nodes
}
CALL () {
    MATCH ()-[r]->()
    RETURN
        count(r) AS relationships,
        count(CASE WHEN type(r) = 'ACTED_IN' THEN 1 END) AS acted_in,
        count(CASE WHEN type(r) = 'DIRECTED' THEN 1 END) AS directed,
        count(CASE WHEN type(r) = 'IN_GENRE' THEN 1 END) AS in_genre,
        count(CASE WHEN type(r) = 'RATED' THEN 1 END) AS rated
}
RETURN
    nodes,
    relationships,
    {
        Actor: actor_nodes,
        Director: director_nodes,
        Genre: genre_nodes,
        Movie: movie_nodes,
        Person: person_nodes,
        User: user_nodes
    } AS label_counts,
    {
        ACTED_IN: acted_in,
        DIRECTED: directed,
        IN_GENRE: in_genre,
        RATED: rated
    } AS relationship_counts
"""


class MoviesDatasetError(RuntimeError):
    """영화 추천 예제 데이터가 기대한 상태가 아닐 때 발생합니다."""


@dataclass(frozen=True, slots=True)
class MoviesDatasetStats:
    nodes: int
    relationships: int
    movies: int
    users: int
    ratings: int


@dataclass(frozen=True, slots=True)
class _DatasetState:
    nodes: int
    relationships: int
    label_counts: dict[str, int]
    relationship_counts: dict[str, int]

    @property
    def is_complete(self) -> bool:
        return (
            self.nodes == EXPECTED_MOVIE_NODES
            and self.relationships == EXPECTED_MOVIE_RELATIONSHIPS
            and self.label_counts == EXPECTED_LABEL_COUNTS
            and self.relationship_counts == EXPECTED_RELATIONSHIP_COUNTS
        )


def verify_movies_dataset(settings: Neo4jSettings) -> MoviesDatasetStats:
    with GraphDatabase.driver(
        settings.uri,
        auth=(settings.username, settings.password),
    ) as driver:
        current_state = _read_dataset_state(driver, settings.database)

        if not current_state.is_complete:
            raise MoviesDatasetError(
                "영화 추천 데이터가 기대값과 다릅니다: "
                f"노드 {current_state.nodes}, 관계 {current_state.relationships}, "
                f"RATED {current_state.relationship_counts['RATED']}"
            )

        return MoviesDatasetStats(
            nodes=current_state.nodes,
            relationships=current_state.relationships,
            movies=current_state.label_counts["Movie"],
            users=current_state.label_counts["User"],
            ratings=current_state.relationship_counts["RATED"],
        )


def _read_dataset_state(driver: Any, database: str) -> _DatasetState:
    result = driver.execute_query(DATASET_STATE_QUERY, database_=database)
    record = _single_record(result.records, "데이터베이스 상태")
    return _DatasetState(
        nodes=record["nodes"],
        relationships=record["relationships"],
        label_counts=record["label_counts"],
        relationship_counts=record["relationship_counts"],
    )


def _single_record(records: list[Any], context: str) -> Any:
    if len(records) != 1:
        raise MoviesDatasetError(f"{context}를 하나의 행으로 읽을 수 없습니다.")
    return records[0]
