import sys
import os
from sqlalchemy import create_engine, text, inspect

# Add parent directory to path to import app modules if needed, 
# but for this script we just need the DB URL.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine

def migrate():
    print(f"Connecting to database...")
    
    # Use inspector to be DB-agnostic (supports SQLite)
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('users')]
    
    if 'last_login_at' in columns:
        print("Column 'last_login_at' already exists in 'users' table.")
    else:
        print("Adding 'last_login_at' column to 'users' table...")
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP"))
            connection.commit()
            print("Migration successful: Added 'last_login_at' column.")

if __name__ == "__main__":
    migrate()
