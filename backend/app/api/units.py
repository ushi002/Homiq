import secrets
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from ..core.database import get_session
from ..core.building_consumption import units_consumption
from ..core.influx_utils import get_meter_readings, parse_measurements_config
from ..models.property import Unit, UnitCreate, UnitRead, User, Building
from ..models.telemetry import Meter
from .access import can_access_unit, require
from .deps import get_current_user

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
    elif current_user.role != "admin":
        return []
        
    return session.exec(statement.offset(offset).limit(limit)).all()

@router.get("/{unit_id}", response_model=UnitRead)
def read_unit(
    unit_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    require(can_access_unit(current_user, unit, session))
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

    require(can_access_unit(current_user, unit, session))
    
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


# The building comparison is shown to owners only when it comes from at least this many units, so
# it never reveals a neighbour's consumption
MIN_UNITS_FOR_AVERAGE = 5

@router.get("/{unit_id}/building_average")
def read_building_average(
    unit_id: uuid.UUID,
    start: datetime,
    end: datetime,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Typical consumption of a unit in the unit's building in [start, end), by meter type, for
    comparison on the unit detail: the median, because a few large consumers (a leak, non-residential
    units) pull the mean up by 10-40 % and most owners would always look "below average". Only units
    with complete, non-zero consumption count (zero is most likely an empty unit); only the median
    and the number of units are returned."""
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    require(can_access_unit(current_user, unit, session))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if not timedelta(0) < end - start <= timedelta(days=367):
        raise HTTPException(status_code=422, detail="Invalid period")

    building = session.get(Building, unit.building_id)
    units = session.exec(select(Unit).where(Unit.building_id == building.id)).all()
    meters = session.exec(select(Meter).where(Meter.unit_id.in_([u.id for u in units]))).all()
    meter_types, (period,) = units_consumption(building, meters, [(start, end)])

    types = {}
    for mt in meter_types:
        values = [r.value for by_type in period.values() if (r := by_type.get(mt["type"])) and r.complete and r.value and r.value > 0]
        if len(values) >= MIN_UNITS_FOR_AVERAGE:
            types[mt["type"]] = {"median": round(statistics.median(values), 2), "units": len(values)}
    return {"types": types}

