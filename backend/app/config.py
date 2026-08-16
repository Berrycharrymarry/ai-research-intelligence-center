"""Runtime configuration. All values can be overridden via environment variables
prefixed with RESEARCH_ (e.g. RESEARCH_MAX_PAPERS=500)."""
import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Settings:
    research_db_path: str = os.environ.get(
        "RESEARCH_DB_PATH", os.path.join(BACKEND_DIR, "data", "research.db")
    )
    max_papers: int = _env_int("RESEARCH_MAX_PAPERS", 250)
    openalex_mailto: str = os.environ.get("RESEARCH_OPENALEX_MAILTO", "research-intel@example.com")
    openalex_base_url: str = os.environ.get("RESEARCH_OPENALEX_BASE_URL", "https://api.openalex.org")
    request_interval: float = _env_float("RESEARCH_REQUEST_INTERVAL", 0.35)
    cors_origins: str = os.environ.get(
        "RESEARCH_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    )
    host: str = os.environ.get("RESEARCH_HOST", "127.0.0.1")
    port: int = _env_int("RESEARCH_PORT", 8000)


settings = Settings()
