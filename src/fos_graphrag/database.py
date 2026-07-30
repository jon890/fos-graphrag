from neo4j import Driver, GraphDatabase

from fos_graphrag.config import Neo4jSettings


def create_neo4j_driver(settings: Neo4jSettings) -> Driver:
    """설정에 맞는 Neo4j 드라이버를 생성합니다."""
    return GraphDatabase.driver(
        settings.uri,
        auth=(settings.username, settings.password),
    )


def verify_neo4j_connection(settings: Neo4jSettings) -> None:
    """Neo4j 드라이버를 열어 실제 연결과 인증 가능 여부를 확인합니다."""
    with create_neo4j_driver(settings) as driver:
        driver.verify_connectivity()
        driver.execute_query("RETURN 1 AS ok", database_=settings.database)
