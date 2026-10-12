import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.routing import Match
from .core.database import create_db_and_tables
from .api import buildings, units, users, telemetry, auth
from .core.unit_sync import sync_all_buildings


async def daily_unit_sync():
    """Load new units and meters from InfluxDB every night (UNIT_SYNC_HOUR_UTC, default 2:30 UTC).
    UNIT_SYNC=0 turns it off; the button in the building detail works either way."""
    hour = int(os.getenv("UNIT_SYNC_HOUR_UTC", "2"))
    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=hour, minute=30, second=0, microsecond=0)
        # A minute of margin: waking up a moment early must not run the sync twice the same night
        if next_run <= now + timedelta(minutes=1):
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())
        try:
            await asyncio.to_thread(sync_all_buildings)
        except Exception:
            logging.getLogger("uvicorn.error").exception("Daily unit sync failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    task = asyncio.create_task(daily_unit_sync()) if os.getenv("UNIT_SYNC", "1") != "0" else None
    yield
    if task:
        task.cancel()

app = FastAPI(title="Homiq API", version="0.1.0", lifespan=lifespan)

class TrailingSlashMiddleware:
    """
    Serve "/buildings" as "/buildings/" (and the like) instead of redirecting. The redirect FastAPI
    would send points to http:// without the /api prefix (we run behind Traefik), which browsers
    block; and a browser that once cached a 308 from "/api/buildings/" to "/api/buildings" (the
    frontend answered while the backend was restarting) would otherwise never load the list again.
    """
    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and not scope["path"].endswith("/"):
            def matches(s):
                return any(route.matches(s)[0] == Match.FULL for route in app.router.routes)
            if not matches(scope):
                with_slash = {**scope, "path": scope["path"] + "/", "raw_path": scope.get("raw_path", b"") + b"/"}
                if matches(with_slash):
                    scope = with_slash
        await self.asgi_app(scope, receive, send)

app.add_middleware(TrailingSlashMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, tags=["Authentication"])
app.include_router(buildings.router, prefix="/buildings", tags=["Buildings"])
app.include_router(units.router, prefix="/units", tags=["Units"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(telemetry.router, prefix="/telemetry", tags=["Telemetry"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Homiq API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
