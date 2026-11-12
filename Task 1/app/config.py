from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://callzo:callzo@db:5432/callzo"
    database_url_sync: str = "postgresql://callzo:callzo@db:5432/callzo"
    webhook_secret: str = "callzo_test_secret_change_me"
    api_key: str = "callzo_api_key_change_me"
    default_monthly_cap_cents: int = 10_000
    log_level: str = "INFO"
    late_event_threshold_days: int = 30
    retry_interval_seconds: int = 30
    retry_max_attempts: int = 5
    reconcile_interval_seconds: int = 300
    background_jobs_enabled: bool = True
    app_name: str = "Usage Metering Service"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()