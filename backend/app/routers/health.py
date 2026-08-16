"""Health check."""
from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": "1.0.0",
        "db": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
    }
