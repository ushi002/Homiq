import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import Building, BuildingCreate, BuildingRead, Unit, UnitRead, User
from .deps import get_current_user

router = APIRouter()

@router.post("/", response_model=BuildingRead)
def create_building(
    building: BuildingCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Only Admin can create buildings? Or Home Lord too?
    # For now, let's allow Admin and Home Lord
    if current_user.role not in ["admin", "home_lord"]:
       raise HTTPException(status_code=403, detail="Not authorized")
       
    db_building = Building.model_validate(building)
    # If home_lord creates it, assign them as manager if not specified? 
    # Or just let them be created.
    session.add(db_building)
    session.commit()
    session.refresh(db_building)
    return db_building

@router.get("/", response_model=List[BuildingRead])
def read_buildings(
    offset: int = 0, 
    limit: int = 100, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == "admin":
        return session.exec(select(Building).offset(offset).limit(limit)).all()
    
    elif current_user.role == "home_lord":
        # See only managed buildings
        return session.exec(select(Building).where(Building.manager_id == current_user.id).offset(offset).limit(limit)).all()
    
    elif current_user.role == "owner":
        # See buildings where they own a unit
        # This is a bit more complex. Join Building with Unit
        statement = (
            select(Building)
            .join(Unit)
            .where(Unit.owner_id == current_user.id)
            .distinct()
            .offset(offset)
            .limit(limit)
        )
        return session.exec(statement).all()
    
    return []

@router.get("/{building_id}", response_model=BuildingRead)
def read_building(
    building_id: uuid.UUID, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
        
    # Check access
    if current_user.role == "admin":
        pass
    elif current_user.role == "home_lord":
        if building.manager_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
    elif current_user.role == "owner":
        # Check if they own a unit in this building
        unit = session.exec(select(Unit).where(Unit.building_id == building_id, Unit.owner_id == current_user.id)).first()
        if not unit:
             raise HTTPException(status_code=403, detail="Not authorized")
             
    return building

@router.get("/{building_id}/units", response_model=List[UnitRead])
def read_building_units(
    building_id: uuid.UUID, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Check access to building first
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    if current_user.role == "home_lord" and building.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    statement = select(Unit).where(Unit.building_id == building_id)
    
    if current_user.role == "owner":
        # Owner can only see their own units
        statement = statement.where(Unit.owner_id == current_user.id)
        
    return session.exec(statement).all()

@router.patch("/{building_id}/assign_manager", response_model=BuildingRead)
def assign_manager(
    building_id: uuid.UUID, 
    manager_id: uuid.UUID, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    
    # Verify user exists and is a home_lord? Not strictly enforced by model but logical business rule
    manager = session.get(User, manager_id)
    if not manager:
        raise HTTPException(status_code=404, detail="Manager not found")
    if manager.role != "home_lord":
        raise HTTPException(status_code=400, detail="User is not a Home Lord")

    building.manager_id = manager_id
    session.add(building)
    session.commit()
    session.refresh(building)
    return building
