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

def test_user_assignment():
    create_db_and_tables()
    
    # 1. Create Building & Unit
    b_resp = client.post("/buildings/", json={"name": "Test Building", "address": "Address"})
    building_id = b_resp.json()["id"]
    
    u_resp = client.post("/units/", json={
        "building_id": building_id, 
        "unit_number": "101", 
        "floor": 1, 
        "area_m2": 50
    })
    unit_id = u_resp.json()["id"]
    
    # 2. Create User
    user_resp = client.post("/users/", json={
        "email": "jan.novak@example.com",
        "full_name": "Jan Novak",
        "role": "owner"
    })
    user_id = user_resp.json()["id"]
    print(f"Created User: {user_id}")

    # 3. Assign User to Unit
    assign_resp = client.patch(f"/units/{unit_id}/assign?owner_id={user_id}")
    if assign_resp.status_code != 200:
        print(assign_resp.json())
    assert assign_resp.status_code == 200
    print("Assigned User to Unit")

    # 4. Verify Assignment
    u_get_resp = client.get(f"/units/{unit_id}")
    data = u_get_resp.json()
    assert data["owner_id"] == user_id
    print("Verification Successful: Unit.owner_id matches User.id")

if __name__ == "__main__":
    test_user_assignment()
