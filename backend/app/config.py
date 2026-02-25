from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/language_diary"

    # OpenAI
    OPENAI_API_KEY: str = ""

    # ElevenLabs (STT/TTS)
    ELEVENLABS_API_KEY: str = ""

    # ElevenLabs Conversational AI Agent
    ELEVENLABS_AGENT_ID: str = ""

    # Azure Speech (optional — kept for potential rollback, not used by GPT-4o pronunciation)
    AZURE_SPEECH_KEY: str = ""
    AZURE_SPEECH_REGION: str = "koreacentral"

    # App
    SECRET_KEY: str = "change-me"
    DEBUG: bool = False

    # CORS — comma-separated origins, "*" for all (dev only)
    ALLOWED_ORIGINS: str = "*"

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    @property
    def sync_database_url(self) -> str:
        return self.DATABASE_URL.replace("+asyncpg", "+psycopg2")

    @property
    def cors_origins(self) -> list[str]:
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
