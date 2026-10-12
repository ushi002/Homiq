import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import User, Building, Unit # Import User model
from ..models.telemetry import Meter, MeterCreate, MeterRead
from .deps import get_current_user
from .access import can_access_unit, require

router = APIRouter()

# --- Meters ---
@router.post("/meters/", response_model=MeterRead)
def create_meter(
    meter: MeterCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # Check if unit exists
    unit = session.get(Unit, meter.unit_id)
    if not unit:
         raise HTTPException(status_code=404, detail="Unit not found")

    db_meter = Meter.model_validate(meter)
    session.add(db_meter)
    session.commit()
    session.refresh(db_meter)
    return db_meter

@router.get("/meters/", response_model=List[MeterRead])
def read_meters(
    offset: int = 0, 
    limit: int = 100, 
    unit_id: Optional[uuid.UUID] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(Meter)
    if unit_id:
        statement = statement.where(Meter.unit_id == unit_id)

    if current_user.role == "home_lord":
        # Meters in managed buildings
        statement = statement.join(Unit).join(Building).where(Building.manager_id == current_user.id)
    elif current_user.role == "owner":
        # Meters in owned units
        # If unit_id is provided, check if owner owns it?
        statement = statement.join(Unit).where(Unit.owner_id == current_user.id)
    elif current_user.role != "admin":
        return []

    return session.exec(statement.offset(offset).limit(limit)).all()

@router.get("/meters/{meter_id}", response_model=MeterRead)
def read_meter(
    meter_id: uuid.UUID, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    meter = session.get(Meter, meter_id)
    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")
        
    require(can_access_unit(current_user, session.get(Unit, meter.unit_id), session))
    return meter
