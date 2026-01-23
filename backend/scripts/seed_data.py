from sqlmodel import Session, SQLModel, create_engine, select
from backend.app.core.database import engine
from backend.app.models.property import Building, Unit, User
from backend.app.models.telemetry import Meter, MeterReading
from backend.app.core.security import get_password_hash
import datetime
import random

def seed_data():
    SQLModel.metadata.create_all(engine)
    
    with Session(engine) as session:
        if session.exec(select(User)).first():
            print("Data already exists. Skipping seed.")
            return

        print("Seeding data...")

        # 0. Create Users (Home Lord & Owners)
        # Home Lord for Building 1
        lord1 = User(email="lord1@homiq.cz", full_name="Lord Voldemort", role="home_lord", password_hash=get_password_hash("password"))
        # Home Lord for Building 2
        lord2 = User(email="lord2@homiq.cz", full_name="Lord Farquaad", role="home_lord", password_hash=get_password_hash("password"))
        
        # Owner
        owner1 = User(email="jan.novak@example.com", full_name="Jan Novak", role="owner", password_hash=get_password_hash("password"))

        session.add(lord1)
        session.add(lord2)
        session.add(owner1)
        session.commit()
        session.refresh(lord1)
        session.refresh(lord2)
        session.refresh(owner1)

        # 1. Create Buildings (Assign Manager)
        b1 = Building(
            name="Sunny Side Residence", 
            address="123 Sunshine Blvd, Springfield", 
            description="Modern complex with solar panels.",
            manager_id=lord1.id
        )
        b2 = Building(
            name="Old Town Lofts", 
            address="45 Cobblestone Way, Rivertown", 
            description="Historic building renovated in 2020.",
            manager_id=lord2.id
        )
        session.add(b1)
        session.add(b2)
        session.commit()
        session.refresh(b1)
        session.refresh(b2)

        # 2. Create Units for B1
        units_b1 = []
        for i in range(1, 11): # 10 units
            u = Unit(building_id=b1.id, unit_number=f"A{i}", floor=1 + (i//4), area_m2=50 + (i*2))
            if i == 1: # Assign A1 to Jan Novak
                u.owner_id = owner1.id
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
        print("Seeding complete! Added Users (Lords & Owners), Buildings, Units, Meters, and Readings.")

if __name__ == "__main__":
    seed_data()
