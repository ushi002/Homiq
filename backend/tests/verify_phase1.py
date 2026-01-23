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

def test_workflow():
    create_db_and_tables()
    
    # 1. Create Building
    response = client.post("/buildings/", json={
        "name": "Sunset Residency",
        "address": "123 Sunny St",
        "description": "Luxury apartments"
    })
    assert response.status_code == 200
    building_id = response.json()["id"]
    print(f"Created Building: {building_id}")

    # 2. Create Unit
    response = client.post("/units/", json={
        "building_id": building_id,
        "unit_number": "101",
        "floor": 1,
        "area_m2": 75.5
    })
    assert response.status_code == 200
    unit_id = response.json()["id"]
    print(f"Created Unit: {unit_id}")

    # 3. Create User
    response = client.post("/users/", json={
        "email": "owner@example.com",
        "full_name": "John Doe",
        "role": "owner"
    })
    assert response.status_code == 200
    user_id = response.json()["id"]
    print(f"Created User: {user_id}")

    # 4. Verify Listings
    response = client.get("/buildings/")
    assert len(response.json()) == 1
    
    response = client.get(f"/buildings/{building_id}/units")
    assert len(response.json()) == 1
    assert response.json()[0]["unit_number"] == "101"

    print("All verification steps passed!")

if __name__ == "__main__":
    test_workflow()
