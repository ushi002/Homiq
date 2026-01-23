from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.database import create_db_and_tables
from .api import buildings, units, users, telemetry, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(title="Homiq API", version="0.1.0", lifespan=lifespan)

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
