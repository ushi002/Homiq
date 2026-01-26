
# import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from app.main import app
from app.core.database import get_session
from app.models.property import User
from app.core.security import get_password_hash
from app.api.deps import get_current_user

# Setup test DB
import os
if os.path.exists("test.db"):
    os.remove("test.db")
engine = create_engine("sqlite:///test.db", connect_args={"check_same_thread": False})

# Ensure models are imported
from app.models.property import User, Building, Unit

print("Tables in metadata:", SQLModel.metadata.tables.keys())
SQLModel.metadata.create_all(engine)

def get_session_override():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_session] = get_session_override

client = TestClient(app)

def setup_admin():
    with Session(engine) as session:
        # Check if admin exists
        stmt = select(User).where(User.email == "admin@test.com")
        if not session.exec(stmt).first():
            admin = User(
                email="admin@test.com", 
                password_hash=get_password_hash("adminpass"), 
                role="admin",
                full_name="Admin User"
            )
            session.add(admin)
            session.commit()
            session.refresh(admin)
            return admin
        return session.exec(stmt).first()

def test_invite_flow_script():
    print("Setting up Admin...")
    admin = setup_admin()
    
    # 1. Login as Admin to get token
    print("Logging in as Admin...")
    response = client.post("/token", data={"username": "admin@test.com", "password": "adminpass"})
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Invite a new Home Lord (create without password)
    print("Inviting Home Lord...")
    new_user_email = "newlord@test.com"
    payload = {
        "email": new_user_email,
        "full_name": "New Lord",
        "role": "home_lord"
        # No password provided
    }
    response = client.post("/users/", json=payload, headers=headers)
    assert response.status_code == 200, f"Invite failed: {response.text}"
    data = response.json()
    assert data["invite_token"] is not None, "Invite token missing"
    assert data["status"] == "pending", "Status not pending"
    invite_token = data["invite_token"]
    print(f"Invite Token: {invite_token}")
    
    # 3. Accept Invite
    print("Accepting Invite...")
    accept_payload = {
        "token": invite_token,
        "password": "newsecurepassword"
    }
    response = client.post("/accept-invite", json=accept_payload) # Changed URL to root based on auth router include?
    # Wait, auth router is included directly? 
    # In main.py: app.include_router(auth.router, tags=["Authentication"]) -> No prefix. The endpoint is /accept-invite
    
    assert response.status_code == 200, f"Accept invite failed: {response.text}"
    token_data = response.json()
    assert "access_token" in token_data, "No access token returned after acceptance"
    
    # 4. Verify original invite token is cleared (via DB check or trying to reuse)
    print("Verifying Token Cleared...")
    response = client.post("/accept-invite", json=accept_payload)
    assert response.status_code == 400, "Should handle used/invalid token"
    
    # 5. Verify Login with new password
    print("Verifying New Login...")
    response = client.post("/token", data={"username": new_user_email, "password": "newsecurepassword"})
    assert response.status_code == 200, "New login failed"
    
    print("SUCCESS: Invite Flow Verified!")

if __name__ == "__main__":
    test_invite_flow_script()
