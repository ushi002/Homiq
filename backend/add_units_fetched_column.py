import sqlite3
from pathlib import Path

# Path to database
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "database.db"

def add_column():
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # SQLite uses 0/1 for booleans
        cursor.execute("ALTER TABLE buildings ADD COLUMN units_fetched BOOLEAN DEFAULT 0")
        conn.commit()
        print("Successfully added 'units_fetched' column to 'buildings' table.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("Column 'units_fetched' already exists.")
        else:
            print(f"Error adding column: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_column()
