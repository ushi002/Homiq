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
        cursor.execute("ALTER TABLE buildings ADD COLUMN influx_unit_tag TEXT")
        conn.commit()
        print("Successfully added 'influx_unit_tag' column to 'buildings' table.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("Column 'influx_unit_tag' already exists.")
        else:
            print(f"Error adding column: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    add_column()
