"""
Access control: nobody gets data of a unit, meter or user they have no right to.
Own temporary database, the real one is not touched:
  docker compose exec -T -w /tmp backend sh -c "PYTHONPATH=/app python /app/tests/test_access.py"
"""
import os
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.core.database import get_session
from app.core.security import create_access_token
from app.models.property import User, Building, Unit
from app.models.telemetry import Meter

DB = "test_access.db"
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
    admin = User(email="admin@t.cz", role="admin")
    lord1 = User(email="lord1@t.cz", role="home_lord")
    lord2 = User(email="lord2@t.cz", role="home_lord")
    auditor = User(email="auditor@t.cz", role="auditor")  # a role the app does not know
    s.add_all([admin, lord1, lord2, auditor])
    s.commit()
    owner_a = User(email="a@t.cz", role="owner", created_by_id=lord1.id)
    owner_b = User(email="b@t.cz", role="owner", created_by_id=lord1.id, status="pending",
                   invite_token="secret-invite", invite_expires_at=datetime.utcnow() + timedelta(hours=48))
    b1 = Building(name="B1", address="x", manager_id=lord1.id)
    b2 = Building(name="B2", address="y", manager_id=lord2.id)
    s.add_all([owner_a, owner_b, b1, b2])
    s.commit()
    unit_a = Unit(unit_number="A", floor=0, area_m2=0, building_id=b1.id, owner_id=owner_a.id)
    unit_b = Unit(unit_number="B", floor=0, area_m2=0, building_id=b1.id, owner_id=owner_b.id)
    s.add_all([unit_a, unit_b])
    s.commit()
    meter_a = Meter(serial_number="SA", type="water_cold", unit_of_measure="L", unit_id=unit_a.id)
    meter_b = Meter(serial_number="SB", type="water_cold", unit_of_measure="L", unit_id=unit_b.id)
    s.add_all([meter_a, meter_b])
    s.commit()
    ids = {name: str(obj.id) for name, obj in dict(
        admin=admin, lord1=lord1, lord2=lord2, auditor=auditor, owner_a=owner_a, owner_b=owner_b,
        b1=b1, b2=b2, unit_a=unit_a, unit_b=unit_b, meter_a=meter_a, meter_b=meter_b).items()}


def as_user(name):
    role = {"admin": "admin", "lord1": "home_lord", "lord2": "home_lord", "auditor": "auditor",
            "owner_a": "owner", "owner_b": "owner"}[name]
    return {"Authorization": f"Bearer {create_access_token({'sub': ids[name], 'role': role})}"}


failures = []


def expect(who, path, status, check=None):
    headers = as_user(who) if who else {}
    r = client.get(path, headers=headers)
    ok = r.status_code == status and (check is None or check(r.json()))
    if not ok:
        failures.append(f"{who or 'anonymous'} GET {path}: {r.status_code} {r.text[:120]}")


def no_invite_token(unit):
    return unit.get("owner") is None or "invite_token" not in unit["owner"]


I = ids
# Without login nothing is readable
for path in [f"/units/{I['unit_b']}", f"/users/{I['owner_b']}", f"/telemetry/meters/{I['meter_b']}",
             f"/units/{I['unit_b']}/readings_influx", f"/buildings/{I['b1']}"]:
    expect(None, path, 401)

# Owner A: own unit yes, the neighbour's unit, meter, owner and the building overview no
expect("owner_a", f"/units/{I['unit_a']}", 200, no_invite_token)
expect("owner_a", f"/units/{I['unit_a']}/readings_influx", 200)
expect("owner_a", f"/telemetry/meters/{I['meter_a']}", 200)
expect("owner_a", f"/users/{I['owner_a']}", 200)
for path in [f"/units/{I['unit_b']}", f"/units/{I['unit_b']}/readings_influx", f"/users/{I['owner_b']}",
             f"/telemetry/meters/{I['meter_b']}",
             f"/buildings/{I['b2']}", f"/buildings/{I['b1']}/consumption?year=2025",
             f"/buildings/{I['b1']}/readings?start=2025-01-01T00:00:00Z&end=2025-02-01T00:00:00Z"]:
    expect("owner_a", path, 403)
expect("owner_a", f"/telemetry/meters/?unit_id={I['unit_b']}", 200, lambda m: m == [])
# Building average: own unit only; with two units in the building no average is revealed
expect("owner_a", f"/units/{I['unit_a']}/building_average?start=2025-03-01T00:00:00Z&end=2025-04-01T00:00:00Z", 200, lambda r: r == {"types": {}})
expect("owner_a", f"/units/{I['unit_b']}/building_average?start=2025-03-01T00:00:00Z&end=2025-04-01T00:00:00Z", 403)
expect(None, f"/units/{I['unit_a']}/building_average?start=2025-03-01T00:00:00Z&end=2025-04-01T00:00:00Z", 401)
expect("owner_a", f"/buildings/{I['b1']}/units", 200, lambda units: [u["unit_number"] for u in units] == ["A"])
expect("owner_a", "/users/", 200, lambda users: [u["email"] for u in users] == ["a@t.cz"])

# Manager of another building sees nothing of B1; the manager of B1 sees its units without invite tokens
for path in [f"/units/{I['unit_a']}", f"/buildings/{I['b1']}", f"/buildings/{I['b1']}/units",
             f"/telemetry/meters/{I['meter_a']}", f"/users/{I['owner_b']}"]:
    expect("lord2", path, 403)
expect("lord1", f"/buildings/{I['b1']}/units", 200, lambda units: all(no_invite_token(u) for u in units))
expect("lord1", f"/units/{I['unit_b']}", 200, no_invite_token)
# ...but the manager who sent the invitation still sees its token (to copy the link)
expect("lord1", f"/users/{I['owner_b']}", 200, lambda u: u["invite_token"] == "secret-invite")

# An unknown role gets nothing
for path in [f"/units/{I['unit_a']}", f"/buildings/{I['b1']}", f"/buildings/{I['b1']}/units",
             f"/telemetry/meters/{I['meter_a']}", f"/users/{I['owner_a']}"]:
    expect("auditor", path, 403)
expect("auditor", "/units/", 200, lambda u: u == [])
expect("auditor", "/telemetry/meters/", 200, lambda m: m == [])
expect("auditor", "/users/", 200, lambda users: [u["email"] for u in users] == ["auditor@t.cz"])

# Admin sees everything
expect("admin", f"/units/{I['unit_b']}", 200, no_invite_token)
expect("admin", f"/users/{I['owner_b']}", 200)

# Renewing the login: only with a valid token, the new token works
r = client.post("/token/refresh")
if r.status_code != 401:
    failures.append(f"anonymous POST /token/refresh: {r.status_code}")
r = client.post("/token/refresh", headers=as_user("owner_a"))
if r.status_code != 200 or client.get(f"/units/{I['unit_a']}", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code != 200:
    failures.append(f"owner_a POST /token/refresh: {r.status_code} {r.text[:120]}")

os.remove(DB)
if failures:
    print("FAILED:\n  " + "\n  ".join(failures))
    raise SystemExit(1)
print("SUCCESS: Access control verified!")
