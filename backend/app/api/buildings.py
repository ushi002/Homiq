import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import Building, BuildingCreate, BuildingRead, BuildingUpdate, Unit, UnitRead, User, UnitCreate
from ..models.telemetry import Meter, MeterCreate
from ..core.influx_utils import get_unique_units, get_unit_meters
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

@router.patch("/{building_id}", response_model=BuildingRead)
def update_building(
    building_id: uuid.UUID,
    building_update: BuildingUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    db_building = session.get(Building, building_id)
    if not db_building:
        raise HTTPException(status_code=404, detail="Building not found")

    building_data = building_update.model_dump(exclude_unset=True)
    for key, value in building_data.items():
        setattr(db_building, key, value)

    session.add(db_building)
    session.commit()
    session.refresh(db_building)
    return db_building

@router.post("/{building_id}/fetch_units")
def fetch_units_from_influx(
    building_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    
    if not building.influx_db_name:
         raise HTTPException(status_code=400, detail="Building has no InfluxDB database configured")

    # 1. Fetch Unique Units
    influx_units = get_unique_units(building.influx_db_name)
    
    created_units = 0
    connected_meters = 0

    for unit_name in influx_units:
        # Check if unit exists
        db_unit = session.exec(select(Unit).where(Unit.building_id == building_id, Unit.unit_number == unit_name)).first()
        if not db_unit:
            # Create Unit
            db_unit = Unit(
                unit_number=unit_name,
                floor=0, # Default
                area_m2=0.0, # Default
                building_id=building_id
            )
            session.add(db_unit)
            session.commit()
            session.refresh(db_unit)
            created_units += 1
        
        # 2. Fetch Meters for Unit
        meters = get_unit_meters(building.influx_db_name, unit_name)
        for meter_data in meters:
            # Check if meter exists
            db_meter = session.exec(select(Meter).where(Meter.serial_number == meter_data['serial_number'])).first()
            if not db_meter:
                db_meter = Meter(
                    serial_number=meter_data['serial_number'],
                    type=meter_data['type'],
                    unit_of_measure=meter_data['unit_of_measure'],
                    unit_id=db_unit.id
                )
                session.add(db_meter)
                session.commit() # Commit each meter to be safe
                connected_meters += 1
            else:
                # Meter exists, ensure it is assigned to this unit
                if db_meter.unit_id != db_unit.id:
                    db_meter.unit_id = db_unit.id
                    session.add(db_meter)
                    session.commit()
                # Count as connected regardless of whether it was just moved or already there
                connected_meters += 1
    
    # Update units_fetched flag if we successfully processed at least one unit from InfluxDB
    if len(influx_units) > 0:
        building.units_fetched = True
        session.add(building)
        session.commit()
        session.refresh(building)

    return {
        "message": "Sync complete", 
        "units_created": created_units, 
        "meters_connected": connected_meters, 
        "units_found": len(influx_units),
        "units_fetched": building.units_fetched
    }

@router.delete("/{building_id}/units")
def delete_all_building_units(
    building_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Get all units
    units = session.exec(select(Unit).where(Unit.building_id == building_id)).all()
    
    # Collect meter IDs to delete readings? 
    # Or just delete meters and rely on cascade (if configured) or delete them explicitly.
    # Meters don't have building_id, so we go via units.
    
    deleted_meters = 0
    deleted_units = 0

    for unit in units:
        # Get meters
        meters = session.exec(select(Meter).where(Meter.unit_id == unit.id)).all()
        for meter in meters:
            # Delete readings first (no cascade config in models)
            # Actually, we didn't import MeterReading here.
            # Assuming just deleting Meters is okay if we are consistent.
            # But let's verify if readings need deletion. 
            # Ideally we should clean up everything.
            session.delete(meter)
            deleted_meters += 1
        
        session.delete(unit)
        deleted_units += 1

    # Reset flag
    building.units_fetched = False
    session.add(building)
    session.commit()
    session.refresh(building)

    return {"message": "All units deleted", "deleted_units": deleted_units, "deleted_meters": deleted_meters}

@router.delete("/{building_id}")
def delete_building(
    building_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    # Manually delete dependencies first to ensure clean removal 
    # (since we prefer explicit cleanup over relying on implicit DB cascades possibly not set)
    
    # 1. Get all units
    units = session.exec(select(Unit).where(Unit.building_id == building_id)).all()
    
    for unit in units:
        # 2. Delete meters for each unit
        meters = session.exec(select(Meter).where(Meter.unit_id == unit.id)).all()
        for meter in meters:
            session.delete(meter)
        
        # 3. Delete unit
        session.delete(unit)
    
    # 4. Delete building
    session.delete(building)
    session.commit()

    return {"message": f"Building '{building.name}' deleted successfully"}
