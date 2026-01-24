from sqlmodel import Session, select
from app.core.database import engine
from app.models.property import Unit, Building
from app.models.telemetry import Meter

def check_structure():
    with Session(engine) as session:
        buildings = session.exec(select(Building)).all()
        print(f"Total Buildings: {len(buildings)}")
        
        for b in buildings:
            units = session.exec(select(Unit).where(Unit.building_id == b.id)).all()
            print(f"Building: {b.name} (ID: {b.id}) - Units: {len(units)}")
            
            meter_count = 0
            for u in units:
                meters = session.exec(select(Meter).where(Meter.unit_id == u.id)).all()
                meter_count += len(meters)
                
            print(f"  -> Total Meters linked to this building: {meter_count}")

        # Check for unlinked units?
        # Check for meters linked to units that are linked to ...
        
        all_meters = session.exec(select(Meter)).all()
        print(f"Total Meters in DB: {len(all_meters)}")

if __name__ == "__main__":
    check_structure()
