import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import Building, BuildingCreate, BuildingRead, BuildingUpdate, Unit, UnitRead, User, UnitCreate
from ..models.telemetry import Meter, MeterCreate, MeterReading
from ..core.influx_utils import get_unique_units, get_unit_meters, get_period_points, get_raw_readings, parse_measurements_config, DEFAULT_MEASUREMENTS
from ..core.consumption import meter_period, combine_meters
from .deps import get_current_user

router = APIRouter()

@router.post("/", response_model=BuildingRead)
def create_building(
    building: BuildingCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Only Admin can create buildings
    if current_user.role != "admin":
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
        
    statement = select(Unit).where(Unit.building_id == building_id).order_by(Unit.unit_number)
    
    if current_user.role == "owner":
        # Owner can only see their own units
        statement = statement.where(Unit.owner_id == current_user.id)
        
    return session.exec(statement).all()

@router.get("/{building_id}/consumption")
def read_building_consumption(
    building_id: uuid.UUID,
    year: int = Query(ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Consumption of all units by meter type for a month (or a whole year when month is omitted),
    next to the same period of the previous year. Owners have no access (other owners' data)."""
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if current_user.role != "admin" and not (current_user.role == "home_lord" and building.manager_id == current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    units = session.exec(select(Unit).where(Unit.building_id == building_id).order_by(Unit.unit_number)).all()
    meters = session.exec(select(Meter).where(Meter.unit_id.in_([u.id for u in units]))).all() if units else []
    measurements = parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS

    def bounds(y: int):
        start = datetime(y, month or 1, 1, tzinfo=timezone.utc)
        if month and month < 12:
            end = datetime(y, month + 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
        return start, end

    meter_types = []
    jobs = []  # (measurement, type, meters of that type, period, year)
    for meas_name, meta in measurements.items():
        type_meters = [m for m in meters if m.type == meta['type']]
        if not type_meters:
            continue
        if meta['type'] not in [mt['type'] for mt in meter_types]:
            meter_types.append({"type": meta['type'], "unit_of_measure": meta['uom'] or type_meters[0].unit_of_measure})
        for period, y in (("current", year), ("previous", year - 1)):
            jobs.append((meas_name, meta['type'], type_meters, period, y))

    if not (building.influx_db_name and building.influx_device_tag):
        jobs = []

    # Influx queries run in parallel, one per measurement and period
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(
            lambda job: get_period_points(building.influx_db_name, job[0], building.influx_device_tag, *bounds(job[4])),
            jobs,
        ))

    # periods[unit_id][type] = {"current": [MeterPeriod, ...], "previous": [...]}
    periods: dict = {}
    for (_, meter_type, type_meters, period, y), by_sn in zip(jobs, results):
        start, end = (b.timestamp() for b in bounds(y))
        for m in type_meters:
            p = by_sn.get(m.serial_number)
            mp = meter_period(start, end, p.get('before'), p.get('first'), p.get('last'), p.get('after')) if p else None
            if mp:
                cell = periods.setdefault(str(m.unit_id), {}).setdefault(meter_type, {"current": [], "previous": []})
                cell[period].append(mp)

    def combine(parts, y):
        start, end = (b.timestamp() for b in bounds(y))
        r = combine_meters(start, end, parts)
        return {"value": r.value, "complete": r.complete, "missing_days": r.missing_days, "period_days": r.period_days}

    return {
        "year": year,
        "month": month,
        "meter_types": meter_types,
        "units": [
            {
                "id": str(u.id),
                "unit_number": u.unit_number,
                "owner": (u.owner.full_name or u.owner.email) if u.owner else None,
                "values": {
                    t: {"current": combine(cell["current"], year), "previous": combine(cell["previous"], year - 1)}
                    for t, cell in periods.get(str(u.id), {}).items()
                },
            }
            for u in units
        ],
    }

@router.get("/{building_id}/readings")
def read_building_readings(
    building_id: uuid.UUID,
    start: datetime,
    end: datetime,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """All readings of all meters in all units of the building in [start, end) (at most a year),
    for the CSV export. The client sends the boundaries (local midnight). Admins and the
    building's manager only, like the consumption overview."""
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if current_user.role != "admin" and not (current_user.role == "home_lord" and building.manager_id == current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if not timedelta(0) < end - start <= timedelta(days=367):
        raise HTTPException(status_code=422, detail="Invalid period")

    units = {u.id: u for u in session.exec(select(Unit).where(Unit.building_id == building_id)).all()}
    meters = session.exec(select(Meter).where(Meter.unit_id.in_(list(units)))).all() if units else []
    measurements = parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS
    jobs = [(name, meta['type']) for name, meta in measurements.items() if any(m.type == meta['type'] for m in meters)]
    if not (building.influx_db_name and building.influx_device_tag):
        jobs = []

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(
            lambda job: get_raw_readings(building.influx_db_name, job[0], building.influx_device_tag, start, end),
            jobs,
        ))

    type_order = [t for _, t in jobs]
    natural = lambda s: [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', s)]
    out = []
    for (_, meter_type), by_sn in zip(jobs, results):
        for m in meters:
            if m.type == meter_type and by_sn.get(m.serial_number):
                unit = units[m.unit_id]
                out.append({
                    "unit_number": unit.unit_number,
                    "owner": (unit.owner.full_name or unit.owner.email) if unit.owner else None,
                    "type": m.type,
                    "unit_of_measure": m.unit_of_measure,
                    "serial_number": m.serial_number,
                    "readings": by_sn[m.serial_number],
                })
    out.sort(key=lambda r: (natural(r["unit_number"]), type_order.index(r["type"]), r["serial_number"]))
    return {"device_tag": building.influx_device_tag, "meters": out}

@router.patch("/{building_id}/assign_manager", response_model=BuildingRead)
def assign_manager(
    building_id: uuid.UUID, 
    manager_id: Optional[uuid.UUID] = None, # Allow None to unassign 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    
    if manager_id:
        # Verify user exists and is a home_lord
        manager = session.get(User, manager_id)
        if not manager:
            raise HTTPException(status_code=404, detail="Manager not found")
        if manager.role != "home_lord":
            raise HTTPException(status_code=400, detail="User is not a Home Lord")
        building.manager_id = manager_id
    else:
        # Unassign
        building.manager_id = None

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
    influx_units = get_unique_units(building.influx_db_name, building.influx_unit_tag)
    
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
        meters = get_unit_meters(building.influx_db_name, unit_name, building.influx_unit_tag, building.influx_measurements, building.influx_device_tag)
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

@router.post("/{building_id}/reload_units")
def reload_building_units(
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

    # 1. Backup Owner Map
    existing_units = session.exec(select(Unit).where(Unit.building_id == building_id)).all()
    owner_map = {u.unit_number: u.owner_id for u in existing_units if u.owner_id}
    
    # 2. Delete All Units & Meters (Clean slate)
    for unit in existing_units:
        # Delete meters
        meters = session.exec(select(Meter).where(Meter.unit_id == unit.id)).all()
        for meter in meters:
            # Delete readings
            readings = session.exec(select(MeterReading).where(MeterReading.meter_id == meter.id)).all()
            for reading in readings:
                session.delete(reading)
            session.delete(meter)
        
        # Delete unit
        session.delete(unit)
    
    # Commit deletion to ensure clean state before re-creation? 
    # Or keep in transaction. Keeping in transaction is safer if subsequent fails.
    
    # 3. Fetch from Influx
    influx_units = get_unique_units(building.influx_db_name, building.influx_unit_tag)
    
    created_units = 0
    connected_meters = 0

    for unit_name in influx_units:
        # Create Unit
        # Restore owner if exists
        restored_owner_id = owner_map.get(unit_name)
        
        db_unit = Unit(
            unit_number=unit_name,
            floor=0, 
            area_m2=0.0,
            building_id=building_id,
            owner_id=restored_owner_id # RESTORED
        )
        session.add(db_unit)
        session.commit() # Commit needed to get ID for meters
        session.refresh(db_unit)
        created_units += 1
        
        # 4. Fetch Meters for Unit
        meters = get_unit_meters(building.influx_db_name, unit_name, building.influx_unit_tag, building.influx_measurements, building.influx_device_tag)
        for meter_data in meters:
             # Check if meter exists (it might have been created in a previous loop iteration for another unit)
             db_meter = session.exec(select(Meter).where(Meter.serial_number == meter_data['serial_number'])).first()
             
             if not db_meter:
                 db_meter = Meter(
                     serial_number=meter_data['serial_number'],
                     type=meter_data['type'],
                     unit_of_measure=meter_data['unit_of_measure'],
                     unit_id=db_unit.id
                 )
                 session.add(db_meter)
                 connected_meters += 1
             else:
                 # Meter exists (duplicate serial number found in Influx result for different unit?)
                 # Update it to point to this unit, or just skip?
                 # If we update, it might "steal" the meter from the previous unit. 
                 # Given the data structure, let's assume valid reassignment or just update.
                 if db_meter.unit_id != db_unit.id:
                     db_meter.unit_id = db_unit.id
                     session.add(db_meter)
                 # We don't increment connected_meters if we are just moving it, or maybe we do? 
                 # Let's count it as "connected" to this unit.
                 connected_meters += 1
        
        session.commit()

    # Update units_fetched flag
    if len(influx_units) > 0:
        building.units_fetched = True
        session.add(building)
        session.commit()
    
    return {
        "message": "Reload complete (owners restored)", 
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
            # Delete readings first
            readings = session.exec(select(MeterReading).where(MeterReading.meter_id == meter.id)).all()
            for reading in readings:
                session.delete(reading)
            
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
            # Delete readings first
            readings = session.exec(select(MeterReading).where(MeterReading.meter_id == meter.id)).all()
            for reading in readings:
                session.delete(reading)
            session.delete(meter)
        
        # 3. Delete unit
        session.delete(unit)
    
    # 4. Delete building
    session.delete(building)
    session.commit()

    return {"message": f"Building '{building.name}' deleted successfully"}
