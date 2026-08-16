"""Logging configuration: console + rotating file handler."""
import logging
import os
from logging.handlers import RotatingFileHandler

from .config import BACKEND_DIR

_configured = False


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    log_dir = os.path.join(BACKEND_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")

    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(fmt)
    root.addHandler(console)

    try:
        file_handler = RotatingFileHandler(
            os.path.join(log_dir, "app.log"), maxBytes=2_000_000, backupCount=3, encoding="utf-8"
        )
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(fmt)
        root.addHandler(file_handler)
    except OSError:  # pragma: no cover - best effort only
        pass

    # Reduce noisy third-party logs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    _configured = True
