import sqlite3
from pathlib import Path

# Path to database
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "database.db"

def add_columns():
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    columns = [
        ("invite_token", "TEXT"),
        ("invite_expires_at", "TIMESTAMP"),
        ("status", "TEXT DEFAULT 'active'")
    ]

    for col_name, col_type in columns:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            conn.commit()
            print(f"Successfully added '{col_name}' column to 'users' table.")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print(f"Column '{col_name}' already exists.")
            else:
                print(f"Error adding column '{col_name}': {e}")
    
    conn.close()

if __name__ == "__main__":
    add_columns()
