from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field

from dotenv import load_dotenv


class ConfigurationError(ValueError):
    """필수 환경변수가 없거나 올바르지 않을 때 발생합니다."""


@dataclass(frozen=True, slots=True)
class Neo4jSettings:
    uri: str
    username: str
    password: str = field(repr=False)
    database: str = "neo4j"

    @classmethod
    def from_env(cls) -> Neo4jSettings:
        load_dotenv()
        return cls.from_mapping(os.environ)

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> Neo4jSettings:
        required_names = ("NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD")
        missing = [name for name in required_names if not values.get(name)]
        if missing:
            joined_names = ", ".join(missing)
            raise ConfigurationError(f"필수 환경변수가 없습니다: {joined_names}")

        return cls(
            uri=values["NEO4J_URI"].strip(),
            username=values["NEO4J_USERNAME"].strip(),
            password=values["NEO4J_PASSWORD"],
            database=values.get("NEO4J_DATABASE", "neo4j").strip() or "neo4j",
        )


@dataclass(frozen=True, slots=True)
class LocalModelSettings:
    base_url: str = "http://localhost:11434"
    model: str = "nemotron-3-nano:4b"

    @classmethod
    def from_env(cls) -> LocalModelSettings:
        load_dotenv()
        return cls.from_mapping(os.environ)

    @classmethod
    def from_mapping(cls, values: Mapping[str, str]) -> LocalModelSettings:
        default_settings = cls()
        return cls(
            base_url=(
                values.get("OLLAMA_BASE_URL", default_settings.base_url).strip()
                or default_settings.base_url
            ),
            model=(
                values.get("OLLAMA_MODEL", default_settings.model).strip() or default_settings.model
            ),
        )
