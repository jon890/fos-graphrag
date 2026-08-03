from neo4j import GraphDatabase

from fos_graphrag.config import Neo4jSettings


def verify_neo4j_connection(settings: Neo4jSettings) -> None:
    """Neo4j 드라이버를 열어 실제 연결과 인증 가능 여부를 확인합니다."""
    with GraphDatabase.driver(
        settings.uri,
        auth=(settings.username, settings.password),
    ) as driver:
        driver.verify_connectivity()
        driver.execute_query("RETURN 1 AS ok", database_=settings.database)
