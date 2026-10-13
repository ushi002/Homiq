import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from ..core.database import get_session
from ..models.property import Building, BuildingCreate, BuildingEnergyYear, BuildingRead, BuildingUpdate, Unit, UnitRead, User
from ..models.telemetry import Meter
from ..core.influx_utils import get_daily_max, get_last_by_serial, get_raw_readings, get_last_reading_time, parse_measurements_config, DEFAULT_MEASUREMENTS
from ..core.consumption import combine_meters
from ..core.unit_sync import sync_units_from_influx
from ..core.building_consumption import units_consumption
from ..core import energy, energy_years
from ..core.weather import daily_temperatures
from .deps import get_current_user
from .access import can_access_building, can_manage_building, require

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

@router.get("/stats")
def read_buildings_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Numbers for the building cards on the admin's and manager's dashboard: units, units with an
    owner, owners who have not accepted the invitation and the newest reading. Owners get an empty
    list (their dashboard has its own summary)."""
    if current_user.role == "admin":
        buildings = session.exec(select(Building)).all()
    elif current_user.role == "home_lord":
        buildings = session.exec(select(Building).where(Building.manager_id == current_user.id)).all()
    else:
        return []

    stats = []
    for building in buildings:
        units = session.exec(select(Unit).where(Unit.building_id == building.id)).all()
        owners = [u.owner for u in units if u.owner]
        entry = {
            "building_id": str(building.id),
            "units": len(units),
            "units_with_owner": len(owners),
            "pending_invites": len({o.id for o in owners if o.status == "pending"}),
            "last_reading": None,
        }
        if building.influx_db_name and building.influx_device_tag and units:
            measurements = list(parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS)
            last = get_last_reading_time(building.influx_db_name, measurements)
            entry["last_reading"] = last
        stats.append(entry)
    return stats

@router.get("/{building_id}", response_model=BuildingRead)
def read_building(
    building_id: uuid.UUID, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
        
    require(can_access_building(current_user, building, session))
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

    require(can_access_building(current_user, building, session))

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

    def bounds(y: int):
        start = datetime(y, month or 1, 1, tzinfo=timezone.utc)
        if month and month < 12:
            end = datetime(y, month + 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
        return start, end

    meter_types, (current, previous) = units_consumption(building, meters, [bounds(year), bounds(year - 1)])

    def cell(r):
        return {"value": r.value, "complete": r.complete, "missing_days": r.missing_days, "period_days": r.period_days}

    def current_cell(unit_id, t):
        return cell(current.get(unit_id, {}).get(t) or _no_data(bounds(year)))

    measurements = list(parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS)
    return {
        "year": year,
        "month": month,
        # newest reading in the building, so the page can say when data stopped coming
        "last_reading": get_last_reading_time(building.influx_db_name, measurements) if building.influx_db_name else None,
        "meter_types": meter_types,
        "units": [
            {
                "id": str(u.id),
                "unit_number": u.unit_number,
                "owner": (u.owner.full_name or u.owner.email) if u.owner else None,
                "values": {
                    t: {"current": current_cell(str(u.id), t),
                        "previous": cell(previous.get(str(u.id), {}).get(t) or _no_data(bounds(year - 1)))}
                    for t in sorted(set(current.get(str(u.id), {})) | set(previous.get(str(u.id), {})))
                },
            }
            for u in units
        ],
    }


def _no_data(period):
    start, end = period
    return combine_meters(start.timestamp(), end.timestamp(), [])

@router.get("/{building_id}/consumption_monthly")
def read_building_consumption_monthly(
    building_id: uuid.UUID,
    year: int = Query(ge=2000, le=2100),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Consumption of the whole building by month (sum over its units) for the year and the year
    before, by meter type, for the chart in the building overview. Months not started yet are
    null. Access as the building overview (admins and the building's manager)."""
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if current_user.role != "admin" and not (current_user.role == "home_lord" and building.manager_id == current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    units = session.exec(select(Unit).where(Unit.building_id == building_id)).all()
    meters = session.exec(select(Meter).where(Meter.unit_id.in_([u.id for u in units]))).all() if units else []

    now = datetime.now(timezone.utc)
    months = [(y, m) for y in (year, year - 1) for m in range(1, 13)]
    started = [(y, m) for y, m in months if datetime(y, m, 1, tzinfo=timezone.utc) <= now]
    periods = [(datetime(y, m, 1, tzinfo=timezone.utc),
                datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=timezone.utc)) for y, m in started]
    meter_types, results = units_consumption(building, meters, periods)

    totals = {mt["type"]: {"current": [None] * 12, "previous": [None] * 12} for mt in meter_types}
    for (y, m), by_unit in zip(started, results):
        for mt in meter_types:
            values = [r.value for by_type in by_unit.values() if (r := by_type.get(mt["type"])) and r.value is not None]
            if values:
                totals[mt["type"]]["current" if y == year else "previous"][m - 1] = round(sum(values), 2)
    return {"year": year, "meter_types": meter_types, "months": totals}

@router.get("/{building_id}/energy")
def read_building_energy(
    building_id: uuid.UUID,
    start: Optional[date] = None,
    end: Optional[date] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Energy overview of the building (heat) for days start <= day < end, at most a year (without
    them: the heating season up to the last reading, from 1 September): the
    building's daily consumption with the outdoor temperature, the energy signature against the
    design heat loss, and every unit against its share of the design heat loss with the
    consumption corrected by its position coefficient. Rules: core/energy.py. Admins and the
    building's manager only (every unit's data)."""
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    require(can_manage_building(current_user, building))

    units = session.exec(select(Unit).where(Unit.building_id == building_id)).all()
    meters = session.exec(select(Meter).where(Meter.unit_id.in_([u.id for u in units]), Meter.type == "heat")).all() if units else []
    unit_of_serial = {m.serial_number: str(m.unit_id) for m in meters}
    measurements = [name for name, meta in (parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS).items()
                    if meta["type"] == "heat"]
    # The period ends with the last reading at the latest: days without data yet would make every
    # unit incomplete (the response says which period was used)
    last_reading = get_last_reading_time(building.influx_db_name, measurements) if building.influx_db_name and measurements else None
    if start is None or end is None:
        end = date.fromisoformat(last_reading[:10]) if last_reading else date.today()
        last_day = end - timedelta(days=1)
        start = date(last_day.year if last_day.month >= 9 else last_day.year - 1, 9, 1)
    if not timedelta(0) < end - start <= timedelta(days=366):
        raise HTTPException(status_code=422, detail="Invalid period")
    if last_reading:
        end = max(start + timedelta(days=1), min(end, date.fromisoformat(last_reading[:10])))
    start_dt = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
    end_dt = datetime(end.year, end.month, end.day, tzinfo=timezone.utc)

    # Daily consumption of each heat meter; a week before the start gives the first day its base
    per_meter = {}
    if building.influx_db_name and building.influx_device_tag and meters:
        serials = {m.serial_number for m in meters}
        for measurement in measurements:
            for sn, points in (get_daily_max(building.influx_db_name, measurement, building.influx_device_tag,
                                             start_dt - timedelta(days=7), end_dt) or {}).items():
                if sn in serials:
                    daily = energy.meter_daily(points, start, end)
                    if daily:
                        per_meter[sn] = daily
    temperatures = daily_temperatures(session, building.latitude, building.longitude, start, end) \
        if building.latitude is not None and building.longitude is not None else {}
    days = energy.building_daily(energy.by_unit(per_meter, unit_of_serial), temperatures, start, end)

    # Newest reading of each unit's heat meters: shown for units without data ("silent since")
    last_by_serial = {}
    if building.influx_db_name and building.influx_device_tag and meters:
        for measurement in measurements:
            last_by_serial.update(get_last_by_serial(building.influx_db_name, measurement, building.influx_device_tag))
    heat_units = []
    _, (results,) = units_consumption(building, meters, [(start_dt, end_dt)])
    for u in units:
        r = results.get(str(u.id), {}).get("heat")
        times = [last_by_serial[m.serial_number] for m in meters if m.unit_id == u.id and m.serial_number in last_by_serial]
        heat_units.append({
            "id": str(u.id), "unit_number": u.unit_number, "floor": u.floor, "area_m2": u.area_m2 or None,
            "heated_area_m2": u.heated_area_m2, "heat_loss_w": u.heat_loss_w, "position_coef": u.position_coef,
            "kwh": r.value if r else None, "complete": bool(r and r.complete),
            "has_meter": any(m.unit_id == u.id for m in meters),
            "last_reading": max(times) if times else None,
        })
    # The design coefficient from the same units as the measured one: those with consumption data
    losses = [u["heat_loss_w"] for u in heat_units if u["heat_loss_w"] and u["kwh"] is not None]
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "has_location": building.latitude is not None and building.longitude is not None,
        "last_reading": last_reading,
        "design": {"indoor_c": energy.DESIGN_INDOOR_C, "outdoor_c": energy.DESIGN_OUTDOOR_C,
                   "heat_loss_kw": round(sum(losses) / 1000, 2) if losses else None,
                   "kw_per_k": energy.design_kw_per_k(losses), "units_with_loss": len(losses),
                   "units_with_loss_total": sum(1 for u in units if u.heat_loss_w)},
        "rules": {"heating_below_c": energy.HEATING_BELOW_C},
        "days": days,
        "signature": energy.signature(days),
        "units": energy.compare_units(heat_units),
    }

@router.get("/{building_id}/energy_years")
def read_building_energy_years(
    building_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Yearly energy balance from the heating bills (core/energy_years.py), with own heating
    degree days from the outdoor temperature and, for years with heat meter data, the meters'
    kWh x position coefficient against the bill's units. Admins and the building's manager only."""
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    require(can_manage_building(current_user, building))
    rows = session.exec(select(BuildingEnergyYear).where(BuildingEnergyYear.building_id == building_id)
                        .order_by(BuildingEnergyYear.year)).all()
    if not rows:
        return {"years": [], "meter_checks": [], "constants": {}}

    temperatures = {}
    if building.latitude is not None and building.longitude is not None:
        temperatures = daily_temperatures(session, building.latitude, building.longitude,
                                          date(rows[0].year, 1, 1), date(rows[-1].year + 1, 1, 1))
    years = []
    for row in rows:
        dd = energy_years.degree_days(temperatures, row.year)
        years.append(energy_years.year_summary(row.model_dump(), dd))

    # Heat meters against the bill's units, for the part of each year with meter data
    units = session.exec(select(Unit).where(Unit.building_id == building_id)).all()
    meters = session.exec(select(Meter).where(Meter.unit_id.in_([u.id for u in units]), Meter.type == "heat")).all() if units else []
    coefs = {str(u.id): u.position_coef for u in units if u.position_coef}
    measurements = [name for name, meta in (parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS).items()
                    if meta["type"] == "heat"]
    checks = []
    if building.influx_db_name and building.influx_device_tag and meters and coefs:
        serials = {m.serial_number for m in meters}
        for row, summary in zip(rows, years):
            start, end = date(row.year, 1, 1), date(row.year + 1, 1, 1)
            per_meter = {}
            for measurement in measurements:
                for sn, points in (get_daily_max(building.influx_db_name, measurement, building.influx_device_tag,
                                                 datetime(row.year, 1, 1, tzinfo=timezone.utc) - timedelta(days=7),
                                                 datetime(row.year + 1, 1, 1, tzinfo=timezone.utc)) or {}).items():
                    if sn in serials and (daily := energy.meter_daily(points, start, end)):
                        per_meter[sn] = daily
            covered = [d["date"] for d in energy.building_daily(per_meter, {}, start, end) if d["complete"]]
            if not covered:
                continue
            first, last = date.fromisoformat(covered[0]), date.fromisoformat(covered[-1])
            _, (results,) = units_consumption(building, meters, [
                (datetime(first.year, first.month, first.day, tzinfo=timezone.utc),
                 datetime(last.year, last.month, last.day, tzinfo=timezone.utc) + timedelta(days=1))])
            measured = sum(r["heat"].value * coefs[uid] for uid, r in results.items()
                           if uid in coefs and r.get("heat") and r["heat"].value is not None)
            dd_period = sum(energy_years.DD_INDOOR_C - t for d, t in temperatures.items()
                            if first <= d <= last and t < energy_years.DD_LIMIT_C) or None
            checks.append({"year": row.year, "from": first.isoformat(), "to": last.isoformat(),
                           **energy_years.meter_check(measured, row.heating_units, dd_period, summary["degree_days"])})
    return {
        "years": years,
        "meter_checks": checks,
        "constants": {"dd_indoor_c": energy_years.DD_INDOOR_C, "dd_limit_c": energy_years.DD_LIMIT_C,
                      "hot_water_theory_kwh_m3": energy_years.HOT_WATER_THEORY_KWH_M3},
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

    return {"message": "Units fetched", **sync_units_from_influx(building, session)}

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

    return {"message": "Reload complete (existing units and meters kept)", **sync_units_from_influx(building, session)}

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
