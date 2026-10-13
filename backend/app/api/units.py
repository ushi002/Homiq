import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from ..core.database import get_session
from ..core.anomaly import typical, unusual
from ..core.consumption import PeriodResult, combine_meters
from ..core.building_consumption import units_consumption
from ..core.influx_utils import get_meter_readings, get_meters_last_time, parse_measurements_config, DEFAULT_MEASUREMENTS
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

@router.get("/summary")
def read_owner_summary(
    year: int = Query(ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Consumption of all units of the logged-in owner (possibly in several buildings) for a month
    (or the whole year without month) and the same period a year earlier, per unit and in total.
    Same rules as the building overview. Other roles get an empty list (they use the overview).
    Totals add up only the same meter type and unit of measure (litres and m3 are not mixed)."""
    empty = {"year": year, "month": month, "last_reading": None, "meter_types": [], "units": [], "totals": {}}
    if current_user.role != "owner":
        return empty

    def bounds(y: int):
        start = datetime(y, month or 1, 1, tzinfo=timezone.utc)
        end = datetime(y + (not month or month == 12), (month % 12 + 1) if month else 1, 1, tzinfo=timezone.utc)
        return start, end

    def cell(r: Optional[PeriodResult], y: int) -> dict:
        r = r or combine_meters(*(b.timestamp() for b in bounds(y)), [])
        return {"value": r.value, "complete": r.complete, "missing_days": r.missing_days, "period_days": r.period_days}

    natural = lambda text: [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", text)]
    units = session.exec(select(Unit).where(Unit.owner_id == current_user.id)).all()
    buildings = sorted((session.get(Building, b) for b in {u.building_id for u in units}), key=lambda b: natural(b.name))
    result_units, meter_types, totals, last_times = [], [], {}, []
    for building in buildings:
        building_id = building.id
        own = sorted((u for u in units if u.building_id == building_id), key=lambda u: natural(u.unit_number))
        # All meters of the building: the median for the unusual-consumption flag needs every unit
        all_units = session.exec(select(Unit).where(Unit.building_id == building_id)).all()
        meters = session.exec(select(Meter).where(Meter.unit_id.in_([u.id for u in all_units]))).all()
        types, (current, previous) = units_consumption(building, meters, [bounds(year), bounds(year - 1)])
        uom = {mt["type"]: mt["unit_of_measure"] for mt in types}
        # newest reading of the owner's own meters, regardless of the period (to open on data)
        if building.influx_db_name and building.influx_device_tag:
            own_ids = {u.id for u in own}
            last = get_meters_last_time(building.influx_db_name,
                                        list(parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS),
                                        building.influx_device_tag, [m.serial_number for m in meters if m.unit_id in own_ids])
            if last:
                last_times.append(last)
        medians = {t: typical(by_type.get(t) for by_type in current.values()) for t in uom}
        own_types = {t for u in own for t in current.get(str(u.id), {}) | previous.get(str(u.id), {})}
        for mt in types:
            if mt["type"] in own_types and mt not in meter_types:
                meter_types.append(mt)
        for u in own:
            values = {}
            for t in sorted(set(current.get(str(u.id), {})) | set(previous.get(str(u.id), {}))):
                median = medians.get(t)
                values[t] = {"unit_of_measure": uom.get(t),
                             "current": cell(current.get(str(u.id), {}).get(t), year),
                             "previous": cell(previous.get(str(u.id), {}).get(t), year - 1),
                             "unusual": unusual(current.get(str(u.id), {}).get(t), previous.get(str(u.id), {}).get(t),
                                                median[0] if median else None)}
                total = totals.setdefault(f"{t}|{uom.get(t)}", {"type": t, "unit_of_measure": uom.get(t), "current": [], "previous": []})
                total["current"].append(values[t]["current"])
                total["previous"].append(values[t]["previous"])
            result_units.append({"id": str(u.id), "unit_number": u.unit_number, "building_id": str(building_id),
                                 "building_name": building.name, "values": values})

    def add_up(cells: List[dict]) -> dict:
        known = [c["value"] for c in cells if c["value"] is not None]
        return {"value": round(sum(known), 3) if known else None,
                "complete": bool(cells) and all(c["complete"] for c in cells)}

    return {
        "year": year, "month": month, "last_reading": max(last_times) if last_times else None,
        "meter_types": meter_types, "units": result_units,
        "totals": {k: {"type": v["type"], "unit_of_measure": v["unit_of_measure"],
                       "current": add_up(v["current"]), "previous": add_up(v["previous"])} for k, v in totals.items()},
    }

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
    units) pull the mean up by 10-40 % and most owners would always look "below average". Only the
    median and the number of units are returned (rules in core/anomaly.py), plus whether this unit's
    consumption is unusually high."""
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
    year_ago = lambda d: d.replace(year=d.year - 1) if not (d.month == 2 and d.day == 29) else d.replace(year=d.year - 1, day=28)
    meter_types, (period, last_year) = units_consumption(building, meters, [(start, end), (year_ago(start), year_ago(end))])

    types = {}
    own, own_last_year = period.get(str(unit.id), {}), last_year.get(str(unit.id), {})
    for mt in meter_types:
        t = mt["type"]
        median = typical(by_type.get(t) for by_type in period.values())
        if median:
            types[t] = {"median": round(median[0], 2), "units": median[1],
                        "unusual": unusual(own.get(t), own_last_year.get(t), median[0])}
    return {"types": types}

