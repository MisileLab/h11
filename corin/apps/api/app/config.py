from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    database_url: str = Field(
        default="postgresql+psycopg://corin:corin@localhost:5432/corin"
    )
    redis_url: str = Field(default="redis://localhost:6379/0")

    s3_endpoint_url: str = Field(default="http://localhost:9000")
    s3_region: str = Field(default="us-east-1")
    s3_access_key_id: str = Field(default="minioadmin")
    s3_secret_access_key: str = Field(default="minioadmin")
    s3_bucket: str = Field(default="corin")
    s3_use_path_style: bool = Field(default=True)

    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8080)
    worker_concurrency: int = Field(default=2)
    single_user_email: str | None = Field(default=None)

    openai_api_key: str | None = Field(default=None)
    openai_stt_model: str = Field(default="whisper-1")
    openai_chat_model: str = Field(default="gpt-4o-mini")
    openai_embed_model: str = Field(default="text-embedding-3-small")


@lru_cache
def get_settings() -> Settings:
    return Settings()
