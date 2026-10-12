import sys
import os
import getpass
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlmodel import Session, select
from app.core.database import engine, create_db_and_tables
from app.models.property import Building, Unit, User
from app.models.telemetry import Meter, MeterReading
from app.core.security import get_password_hash

# Usage: python scripts/create_admin.py <email> [full name]
# Password is read from ADMIN_PASSWORD env var, otherwise prompted.
def create_admin(email: str, full_name: str):
    password = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Password: ")
    if len(password) < 8:
        sys.exit("Password must have at least 8 characters.")

    create_db_and_tables()
    with Session(engine) as session:
        if session.exec(select(User).where(User.email == email)).first():
            sys.exit(f"User {email} already exists.")
        session.add(User(email=email, full_name=full_name, role="admin", password_hash=get_password_hash(password)))
        session.commit()
    print(f"Admin {email} created.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: python scripts/create_admin.py <email> [full name]")
    create_admin(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "Admin")
