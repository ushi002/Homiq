from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
from backend.app.main import app
from backend.app.core.database import get_session

# Setup in-memory database for testing
engine = create_engine(
    "sqlite://", 
    connect_args={"check_same_thread": False}, 
    poolclass=StaticPool
)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session_override():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_session] = get_session_override

client = TestClient(app)

def test_telemetry_workflow():
    create_db_and_tables()
    
    # 1. Create Building & Unit (Prerequisites)
    b_resp = client.post("/buildings/", json={"name": "Test Building", "address": "Address"})
    building_id = b_resp.json()["id"]
    
    u_resp = client.post("/units/", json={
        "building_id": building_id, 
        "unit_number": "101", 
        "floor": 1, 
        "area_m2": 50
    })
    unit_id = u_resp.json()["id"]
    print(f"Created Unit: {unit_id}")

    # 2. Create Meter
    m_resp = client.post("/telemetry/meters/", json={
        "serial_number": "WAT-2024-001",
        "type": "water_cold",
        "unit_of_measure": "m3",
        "unit_id": unit_id
    })
    assert m_resp.status_code == 200
    meter_id = m_resp.json()["id"]
    print(f"Created Meter: {meter_id}")

    # 3. Ingest Readings
    r_resp = client.post("/telemetry/readings/", json={
        "meter_id": meter_id,
        "value": 100.5,
        "is_manual": True
    })
    assert r_resp.status_code == 200
    print("Ingested Reading 1")

    r_resp = client.post("/telemetry/readings/", json={
        "meter_id": meter_id,
        "value": 101.0,
        "is_manual": True
    })
    assert r_resp.status_code == 200
    print("Ingested Reading 2")

    # 4. Fetch History
    h_resp = client.get(f"/telemetry/meters/{meter_id}/readings")
    assert h_resp.status_code == 200
    readings = h_resp.json()
    assert len(readings) == 2
    assert readings[0]["value"] == 101.0 # Should be latest first due to desc sort
    print("Fetched History successfully")

if __name__ == "__main__":
    test_telemetry_workflow()
