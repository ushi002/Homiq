import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import Unit, UnitCreate, UnitRead

router = APIRouter()

@router.post("/", response_model=UnitRead)
def create_unit(unit: UnitCreate, session: Session = Depends(get_session)):
    db_unit = Unit.model_validate(unit)
    session.add(db_unit)
    session.commit()
    session.refresh(db_unit)
    return db_unit

@router.get("/", response_model=List[UnitRead])
def read_units(offset: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    units = session.exec(select(Unit).offset(offset).limit(limit)).all()
    return units

@router.get("/{unit_id}", response_model=UnitRead)
def read_unit(unit_id: uuid.UUID, session: Session = Depends(get_session)):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit

@router.patch("/{unit_id}/assign", response_model=UnitRead)
def assign_owner(unit_id: uuid.UUID, owner_id: uuid.UUID, session: Session = Depends(get_session)):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Verify user exists (optional but good practice)
    # from ..models.property import User
    # user = session.get(User, owner_id)
    # if not user:
    #    raise HTTPException(status_code=404, detail="User not found")

    unit.owner_id = owner_id
    session.add(unit)
    session.commit()
    session.refresh(unit)
    return unit
