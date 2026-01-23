import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import Building, BuildingCreate, BuildingRead, Unit, UnitRead

router = APIRouter()

@router.post("/", response_model=BuildingRead)
def create_building(building: BuildingCreate, session: Session = Depends(get_session)):
    db_building = Building.model_validate(building)
    session.add(db_building)
    session.commit()
    session.refresh(db_building)
    return db_building

@router.get("/", response_model=List[BuildingRead])
def read_buildings(offset: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    buildings = session.exec(select(Building).offset(offset).limit(limit)).all()
    return buildings

@router.get("/{building_id}", response_model=BuildingRead)
def read_building(building_id: uuid.UUID, session: Session = Depends(get_session)):
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building

@router.get("/{building_id}/units", response_model=List[UnitRead])
def read_building_units(building_id: uuid.UUID, session: Session = Depends(get_session)):
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building.units
