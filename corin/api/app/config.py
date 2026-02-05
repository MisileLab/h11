"""Application configuration."""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Environment
    dev: bool = True
    node_env: str = "development"

    # Database
    database_url: str

    # Redis
    redis_url: str

    # S3 / MinIO
    s3_endpoint_url: Optional[str] = None
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_region: str = "us-east-1"
    s3_bucket_originals: str = "corin-originals"
    s3_bucket_playback: str = "corin-playback"
    s3_bucket_clips: str = "corin-clips"
    s3_presigned_url_expiry: int = 3600

    # Google OAuth
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    # OpenAI
    openai_api_key: str
    openai_stt_model: str = "gpt-4o-transcribe"
    openai_diarize_model: str = "gpt-4o-transcribe-diarize"
    openai_chat_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Pricing (USD per 1M tokens)
    transcribe_input_usd_per_1m: float = 10.0
    transcribe_audio_usd_per_1m: float = 60.0
    transcribe_output_usd_per_1m: float = 40.0
    embedding_usd_per_1m: float = 0.13
    chat_input_usd_per_1m: float = 0.15
    chat_output_usd_per_1m: float = 0.60

    # VAD Configuration
    vad_provider: str = "silero"
    vad_padding_ms: int = 300
    vad_min_speech_ms: int = 200
    vad_merge_gap_ms: int = 200
    vad_min_segment_ms: int = 400

    # Processing
    max_upload_size_mb: int = 2048
    stt_max_chunk_size_mb: int = 24
    audio_sample_rate: int = 16000
    playback_bitrate: str = "64k"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_workers: int = 1
    api_cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins into list."""
        return [origin.strip() for origin in self.api_cors_origins.split(",")]

    @property
    def use_minio(self) -> bool:
        """Determine if using MinIO based on DEV flag."""
        return self.dev


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
