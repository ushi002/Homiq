from sqlmodel import Session, select
from app.core.database import engine
from app.models.telemetry import Meter
from app.models.property import Unit

def check_orphans():
    with Session(engine) as session:
        meters = session.exec(select(Meter)).all()
        print(f"Total Meters in DB: {len(meters)}")
        
        orphans = 0
        for m in meters:
            # Check if unit exists
            unit = session.get(Unit, m.unit_id)
            if not unit:
                print(f"Orphan Meter found! SN: {m.serial_number}, Unit ID: {m.unit_id}")
                orphans += 1
        
        if orphans == 0:
            print("No orphan meters found.")
        else:
            print(f"Found {orphans} orphan meters.")

if __name__ == "__main__":
    check_orphans()
