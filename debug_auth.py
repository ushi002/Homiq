from sqlmodel import Session, select
from backend.app.core.database import engine
from backend.app.models.property import User
from backend.app.core.security import verify_password
import sys

def check_users():
    with Session(engine) as session:
        users = session.exec(select(User)).all()
        print(f"Found {len(users)} users.")
        for user in users:
            print(f"User: {user.email}, Role: {user.role}")
            print(f"Hash start: {user.password_hash[:10]}...")
            
            is_valid = verify_password("password", user.password_hash)
            print(f"Password 'password' valid? {is_valid}")
            print("-" * 20)

if __name__ == "__main__":
    try:
        check_users()
    except Exception as e:
        print(f"Error: {e}")
