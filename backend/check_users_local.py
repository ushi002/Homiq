from sqlmodel import Session, select, create_engine
from app.models.property import User, Building

# Use absolute path to ensure we hit the right DB
import os
db_path = "database.db"
engine = create_engine(f"sqlite:///{db_path}")

def list_users():
    try:
        with Session(engine) as session:
            users = session.exec(select(User)).all()
            print(f"Found {len(users)} users:")
            for u in users:
                print(f"- {u.email} (Role: {u.role}, Status: {u.status})")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_users()
