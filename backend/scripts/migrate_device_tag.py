
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database.db')

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    print(f"Migrating database at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("PRAGMA table_info(buildings)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'influx_device_tag' not in columns:
            print("Adding influx_device_tag column...")
            cursor.execute("ALTER TABLE buildings ADD COLUMN influx_device_tag VARCHAR")
            conn.commit()
            print("Migration successful.")
        else:
            print("Column influx_device_tag already exists.")
            
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
