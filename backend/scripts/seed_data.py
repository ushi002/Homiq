from sqlmodel import Session, SQLModel, create_engine, select
from backend.app.core.database import engine
from backend.app.models.property import Building, Unit, User
from backend.app.models.telemetry import Meter, MeterReading
import datetime
import random

def seed_data():
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        # Check if data exists
        existing_building = session.exec(select(Building)).first()
        if existing_building:
            print("Data already exists. Skipping seed.")
            return

        print("Seeding data...")

        # 1. Create Buildings
        b1 = Building(name="Sunny Side Residence", address="123 Sunshine Blvd, Springfield", description="Modern complex with solar panels.")
        b2 = Building(name="Old Town Lofts", address="45 Cobblestone Way, Rivertown", description="Historic building renovated in 2020.")
        session.add(b1)
        session.add(b2)
        session.commit()
        session.refresh(b1)
        session.refresh(b2)

        # 2. Create Units for B1
        units_b1 = []
        for i in range(1, 11): # 10 units
            u = Unit(building_id=b1.id, unit_number=f"A{i}", floor=1 + (i//4), area_m2=50 + (i*2))
            session.add(u)
            units_b1.append(u)
        
        # 3. Create Units for B2
        units_b2 = []
        for i in range(1, 6): # 5 units
            u = Unit(building_id=b2.id, unit_number=f"B{i}", floor=i, area_m2=80)
            session.add(u)
            units_b2.append(u)

        session.commit()
        for u in units_b1 + units_b2:
            session.refresh(u)

        # 4. Create Meters & Readings
        meters = []
        for unit in units_b1 + units_b2:
            # Water Cold
            m_water = Meter(serial_number=f"WAT-{unit.unit_number}", type="water_cold", unit_of_measure="m3", unit_id=unit.id)
            session.add(m_water)
            meters.append(m_water)
            
            # Electricity
            m_elec = Meter(serial_number=f"ELE-{unit.unit_number}", type="electricity", unit_of_measure="kWh", unit_id=unit.id)
            session.add(m_elec)
            meters.append(m_elec)

        session.commit()
        for m in meters:
            session.refresh(m)

        # 5. Add Readings
        for m in meters:
            base_value = 100.0
            for day in range(10):
                val = base_value + (day * random.uniform(0.1, 0.5))
                # Create reading for past days
                r = MeterReading(
                    meter_id=m.id, 
                    value=round(val, 2), 
                    is_manual=False,
                    time=datetime.datetime.utcnow() - datetime.timedelta(days=10-day)
                )
                session.add(r)
        
        session.commit()
        print("Seeding complete! Added 2 buildings, 15 units, 30 meters, and 300 readings.")

if __name__ == "__main__":
    seed_data()
