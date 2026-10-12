from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.routing import Match
from .core.database import create_db_and_tables
from .api import buildings, units, users, telemetry, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

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
