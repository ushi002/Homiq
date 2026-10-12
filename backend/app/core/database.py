import os
from sqlmodel import SQLModel, create_engine, Session
from pathlib import Path

# Construct absolute path to backend/database.db
# This file is in backend/app/core/database.py
# Parent is backend/app/core
# Parent.parent is backend/app
# Parent.parent.parent is backend
BASE_DIR = Path(__file__).resolve().parent.parent.parent
sqlite_file_name = BASE_DIR / "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

# Every SQL statement in the log only when asked for (SQL_ECHO=1), otherwise it drowns real errors
engine = create_engine(sqlite_url, echo=os.getenv("SQL_ECHO") == "1")

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
