import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from .deps import get_current_user
from ..models.property import Unit, UnitCreate, UnitRead, User, Building

router = APIRouter()

@router.post("/", response_model=UnitRead)
def create_unit(
    unit: UnitCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "home_lord"]:
         raise HTTPException(status_code=403, detail="Not authorized")
         
    # If home_lord, verify they manage the building
    if current_user.role == "home_lord":
        building = session.get(Building, unit.building_id)
        if not building or building.manager_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized to add unit to this building")
             
    db_unit = Unit.model_validate(unit)
    session.add(db_unit)
    session.commit()
    session.refresh(db_unit)
    return db_unit

@router.get("/", response_model=List[UnitRead])
def read_units(
    offset: int = 0, 
    limit: int = 100, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(Unit)
    if current_user.role == "home_lord":
        # Units in managed buildings
        statement = statement.join(Building).where(Building.manager_id == current_user.id)
    elif current_user.role == "owner":
        # Only owned units
        statement = statement.where(Unit.owner_id == current_user.id)
        
    return session.exec(statement.offset(offset).limit(limit)).all()

@router.get("/{unit_id}", response_model=UnitRead)
def read_unit(unit_id: uuid.UUID, session: Session = Depends(get_session)):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit

@router.patch("/{unit_id}/assign", response_model=UnitRead)
def assign_owner(
    unit_id: uuid.UUID, 
    owner_id: uuid.UUID, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Only Admin and Home Lord can assign owners
    if current_user.role not in ["admin", "home_lord"]:
          raise HTTPException(status_code=403, detail="Not authorized")

    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
        
    # If Home Lord, verify they manage the building
    if current_user.role == "home_lord":
        building = session.get(Building, unit.building_id)
        if not building or building.manager_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized to manage this unit")
    
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
