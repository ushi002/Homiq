import uuid
from typing import List, Optional
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
    owner_id: Optional[uuid.UUID] = None, # Allow None to unassign
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
    
    if owner_id:
        # Verify user exists if assigning
        user = session.get(User, owner_id)
        if not user:
           raise HTTPException(status_code=404, detail="User not found")
        unit.owner_id = owner_id
    else:
        # Unassign
        unit.owner_id = None

    session.add(unit)
    session.commit()
    session.refresh(unit)
    return unit

# Import needed models for sync
from ..models.telemetry import Meter, MeterReading
from ..core.influx_utils import get_meter_readings, parse_measurements_config
from datetime import datetime

@router.post("/{unit_id}/sync_readings")
def sync_unit_readings(
    unit_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Authorization? 
    # Allow admins, home lords, and owners (to view their own up-to-date data)?
    # Let's verify access first.
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
        
    building = session.get(Building, unit.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    if current_user.role == "admin":
        pass
    elif current_user.role == "home_lord":
        if building.manager_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
    elif current_user.role == "owner":
        if unit.owner_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
    
    if not building.influx_db_name:
         return {"message": "No InfluxDB configured", "readings_synced": 0}

    # Parse measurements config
    if building.influx_measurements:
        measurements_config = parse_measurements_config(building.influx_measurements)
    else:
        # Default fallback
        measurements_config = {
            'sv_l': {'type': 'water_cold', 'uom': 'm3'},
            'tv_l': {'type': 'water_hot', 'uom': 'm3'},
            'teplo_kWh': {'type': 'heat', 'uom': 'kWh'},
        }

    # Get meters for unit
    meters = session.exec(select(Meter).where(Meter.unit_id == unit_id)).all()
    
    total_synced = 0
    
    for meter in meters:
        # We need to look up readings for this meter.
        # We don't know exactly which measurement it came from unless we stored it?
        # But we can try all measurements that match its type OR just all measurements?
        # Simpler: Iterate all configured measurements. If a reading exists for this meter's SN in that measurement, take it.
        # This is robust because SN should be unique globally or at least within the building/db context.
        
        found_readings = False
        
        for meas_name, meta in measurements_config.items():
            # Optimization: Only check measurements that match the meter type?
            # if meta['type'] != meter.type: continue 
            
            readings = get_meter_readings(building.influx_db_name, meter.serial_number, meas_name, building.influx_device_tag)
            
            if readings:
                found_readings = True
                for (time_str, value) in readings:
                    try:
                        dt = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    except ValueError:
                        continue

                    # Check if reading exists
                    existing = session.exec(select(MeterReading).where(
                        MeterReading.meter_id == meter.id, 
                        MeterReading.time == dt
                    )).first()
                    
                    if not existing:
                        new_reading = MeterReading(
                            meter_id=meter.id,
                            value=value,
                            time=dt,
                            is_manual=False
                        )
                        session.add(new_reading)
                        total_synced += 1
                
                # If we found readings in one measurement, should we stop? 
                # Probably yes, a meter typically reports to one measurement.
                # break 
        
        if found_readings:
            session.commit() # Commit per meter

    return {"message": "Readings synced", "readings_synced": total_synced}

import secrets
from datetime import timedelta

@router.post("/{unit_id}/assign_by_email", response_model=UnitRead)
def assign_owner_by_email(
    unit_id: uuid.UUID,
    email: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Authorization: Admin or Home Lord managing the building
    if current_user.role not in ["admin", "home_lord"]:
          raise HTTPException(status_code=403, detail="Not authorized")

    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
        
    building = session.get(Building, unit.building_id)
    if not building:
         raise HTTPException(status_code=404, detail="Building not found")

    if current_user.role == "home_lord":
        if building.manager_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized to manage this unit")
    
    # Check if user exists
    statement = select(User).where(User.email == email)
    user = session.exec(statement).first()
    
    if not user:
        # Create new pending user
        user = User(
            email=email,
            full_name=email.split('@')[0], # Default name from email
            role="owner",
            password_hash="pending", # Or null? But schema might require hash? existing logic uses optional password
            status="pending",
            invite_token=secrets.token_urlsafe(32),
            invite_expires_at=datetime.utcnow() + timedelta(hours=48),
            created_by_id=current_user.id
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
    # Assign user to unit
    unit.owner_id = user.id
    session.add(unit)
    session.commit()
    session.refresh(unit)
    
    return unit

@router.get("/{unit_id}/readings_influx")
def read_unit_readings_influx(
    unit_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
        
    building = session.get(Building, unit.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    if current_user.role == "home_lord":
        if building.manager_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
    elif current_user.role == "owner":
        if unit.owner_id != current_user.id:
             raise HTTPException(status_code=403, detail="Not authorized")
    
    if not building.influx_db_name:
         return {}

    # Parse measurements config
    if building.influx_measurements:
        measurements_config = parse_measurements_config(building.influx_measurements)
    else:
        # Default fallback
        measurements_config = {
            'sv_l': {'type': 'water_cold', 'uom': 'm3'},
            'tv_l': {'type': 'water_hot', 'uom': 'm3'},
            'teplo_kWh': {'type': 'heat', 'uom': 'kWh'},
        }

    # Get meters for unit
    meters = session.exec(select(Meter).where(Meter.unit_id == unit_id)).all()
    
    results = {}
    
    for meter in meters:
        readings = []
        # Find readings in any configured measurement
        for meas_name, meta in measurements_config.items():
            # Optimization: could check meta['type'] == meter.type
            
            influx_data = get_meter_readings(building.influx_db_name, meter.serial_number, meas_name, building.influx_device_tag)
            
            if influx_data:
                # influx_data is list of (time, value)
                for idx, (time_str, value) in enumerate(influx_data):
                    readings.append({
                        "id": idx, # Mock ID
                        "value": value,
                        "time": time_str,
                        "is_manual": False
                    })
                break # Assume meter is only in one measurement type
        
        results[str(meter.id)] = readings
        
    return results
