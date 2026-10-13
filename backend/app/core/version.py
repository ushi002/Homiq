"""
Version of the running backend: commit date and short hash from git at build time (version-env.sh ->
docker compose build args), the build time recorded in the image, and APP_ENV from the server's .env
("dev" marks a development instance in the app).
"""
import os
from pathlib import Path

BUILD_TIME_FILE = Path(__file__).resolve().parents[2] / "build_time"


def version_info() -> dict:
    return {
        "date": os.getenv("APP_DATE") or None,
        "commit": os.getenv("APP_COMMIT") or None,
        "built": BUILD_TIME_FILE.read_text().strip() if BUILD_TIME_FILE.exists() else None,
        "env": os.getenv("APP_ENV") or None,
    }
