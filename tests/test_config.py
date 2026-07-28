import pytest

from fos_graphrag.config import ConfigurationError, Neo4jSettings


def test_settings_from_mapping() -> None:
    settings = Neo4jSettings.from_mapping(
        {
            "NEO4J_URI": "bolt://localhost:7688",
            "NEO4J_USERNAME": "neo4j",
            "NEO4J_PASSWORD": "password",
        }
    )

    assert settings.uri == "bolt://localhost:7688"
    assert settings.username == "neo4j"
    assert settings.password == "password"
    assert settings.database == "neo4j"


def test_settings_reports_all_missing_required_values() -> None:
    with pytest.raises(ConfigurationError) as error:
        Neo4jSettings.from_mapping({})

    assert str(error.value) == (
        "필수 환경변수가 없습니다: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD"
    )


def test_password_is_hidden_from_repr() -> None:
    settings = Neo4jSettings(
        uri="bolt://localhost:7688",
        username="neo4j",
        password="secret",
    )

    assert "secret" not in repr(settings)
