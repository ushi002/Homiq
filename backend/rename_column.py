import sqlite3
from pathlib import Path

# Path to database
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "database.db"

def rename_column():
    print(f"Connecting to database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # SQLite 3.25.0+ supports RENAME COLUMN
        cursor.execute("ALTER TABLE buildings RENAME COLUMN influx_bucket TO influx_db_name")
        conn.commit()
        print("Successfully renamed 'influx_bucket' to 'influx_db_name'.")
    except sqlite3.OperationalError as e:
        if "no such column" in str(e):
            print("Column 'influx_bucket' does not exist (maybe already renamed?).")
            # Try adding it if it doesn't exist? No, better safe than sorry.
        elif "duplicate column" in str(e):
             print("Column 'influx_db_name' already exists.")
        else:
            print(f"Error renaming column: {e}")
            print("Attempting fallback: Add new column and copy data (if old exists)")
            try:
                cursor.execute("ALTER TABLE buildings ADD COLUMN influx_db_name TEXT")
                cursor.execute("UPDATE buildings SET influx_db_name = influx_bucket")
                # SQLite doesn't support DROP COLUMN easily before newer versions, but we can leave it or ignore it.
                # Actually newer sqlite supports drop column too.
                cursor.execute("ALTER TABLE buildings DROP COLUMN influx_bucket")
                conn.commit()
                print("Fallback migration successful.")
            except Exception as e2:
                print(f"Fallback failed: {e2}")

    finally:
        conn.close()

if __name__ == "__main__":
    rename_column()
