import sys
import os
from sqlalchemy import create_engine, text

# Add parent directory to path to import app modules if needed, 
# but for this script we just need the DB URL.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

def migrate():
    print(f"Connecting to database: {settings.DATABASE_URL}")
    engine = create_engine(str(settings.DATABASE_URL))
    
    with engine.connect() as connection:
        # Check if column exists
        result = connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='last_login_at'"))
        if result.fetchone():
            print("Column 'last_login_at' already exists in 'users' table.")
        else:
            print("Adding 'last_login_at' column to 'users' table...")
            connection.execute(text("ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP"))
            connection.commit()
            print("Migration successful: Added 'last_login_at' column.")

if __name__ == "__main__":
    migrate()
