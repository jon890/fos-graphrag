from fos_graphrag.config import Neo4jSettings
from fos_graphrag.database import create_neo4j_driver

CYPHER_QUERY = """
MATCH (movie:Movie {title: $movie})<-[:RATED]-(user:User)-[:RATED]->(recommendation:Movie)
RETURN DISTINCT recommendation.title AS recommendation
ORDER BY recommendation
LIMIT 20
"""

MOVIE_TITLE = "Crimson Tide"


def main() -> None:
    settings = Neo4jSettings.from_env()

    with create_neo4j_driver(settings) as driver:
        result = driver.execute_query(
            CYPHER_QUERY,
            movie=MOVIE_TITLE,
            database_=settings.database,
        )

        for record in result.records:
            print(record["recommendation"])


if __name__ == "__main__":
    main()
