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
