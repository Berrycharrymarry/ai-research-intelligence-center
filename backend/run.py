"""Development server entrypoint.

Usage:
    python run.py                # serves http://127.0.0.1:8000
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
for p in (os.path.join(HERE, "vendor"), os.path.join(HERE, "pyenv")):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

import uvicorn  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import init_db  # noqa: E402

if __name__ == "__main__":
    init_db()
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)
