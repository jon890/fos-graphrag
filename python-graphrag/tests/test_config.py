import pytest

from fos_graphrag.config import (
    ConfigurationError,
    LocalModelSettings,
    Neo4jSettings,
)


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


def test_local_model_settings_use_safe_defaults() -> None:
    settings = LocalModelSettings.from_mapping({})

    assert settings.base_url == "http://localhost:11434"
    assert settings.model == "nemotron-3-nano:4b"


def test_local_model_settings_can_be_overridden() -> None:
    settings = LocalModelSettings.from_mapping(
        {
            "OLLAMA_BASE_URL": "http://localhost:21434",
            "OLLAMA_MODEL": "nemotron-mini:4b",
        }
    )

    assert settings.base_url == "http://localhost:21434"
    assert settings.model == "nemotron-mini:4b"
