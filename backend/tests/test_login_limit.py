"""
Limit on failed logins (app/core/login_limit.py). Own temporary database:
  docker compose exec -T -w /tmp backend sh -c "PYTHONPATH=/app python /app/tests/test_login_limit.py"
"""
import os
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.core.database import get_session
from app.core.security import get_password_hash
from app.models.property import User

DB = "test_login_limit.db"
if os.path.exists(DB):
    os.remove(DB)
engine = create_engine(f"sqlite:///{DB}", connect_args={"check_same_thread": False})
SQLModel.metadata.create_all(engine)


def session_override():
    with Session(engine) as session:
        yield session


app.dependency_overrides[get_session] = session_override
client = TestClient(app)
with Session(engine) as s:
    for email in ("a@t.cz", "b@t.cz", "c@t.cz"):
        s.add(User(email=email, role="owner", password_hash=get_password_hash("right-password")))
    s.commit()


def login(email, password, ip="1.1.1.1"):
    return client.post("/token", data={"username": email, "password": password}, headers={"X-Real-Ip": ip}).status_code


# 4 failures, then the right password still works and clears the count
assert [login("a@t.cz", "wrong") for _ in range(4)] == [401] * 4
assert login("a@t.cz", "right-password") == 200
assert [login("a@t.cz", "wrong") for _ in range(5)] == [401] * 5
# after 5 failures the e-mail is locked, even for the right password (also with different case)
assert login("a@t.cz", "right-password") == 429
assert login("A@T.CZ", "right-password", ip="2.2.2.2") == 429
# another account from the same address is not affected
assert login("b@t.cz", "right-password") == 200
# many failures from one address lock the address for every account
for i in range(30):
    login(f"nobody{i}@t.cz", "wrong", ip="3.3.3.3")
assert login("c@t.cz", "right-password", ip="3.3.3.3") == 429
assert login("c@t.cz", "right-password", ip="4.4.4.4") == 200

os.remove(DB)
print("SUCCESS: Login limit verified!")
