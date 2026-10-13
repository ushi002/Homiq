"""Units and meters of a building, synchronised from InfluxDB tags."""
import logging
from typing import Dict, List, Tuple
from sqlmodel import Session, select
from ..models.property import Building, Unit
from ..models.telemetry import Meter
from .database import engine
from .influx_utils import (get_unique_units, get_unit_meters, get_meter_last_seen_by_unit, get_unit_tags,
                           parse_measurements_config, DEFAULT_MEASUREMENTS)


def sync_units_from_influx(building: Building, session: Session) -> dict:
    """
    Add units and meters found in InfluxDB. Nothing is deleted and existing units and meters keep
    their ids (links, owners). After a meter replacement the new meter is added next to the old
    one, which keeps its history.

    A meter reported under several units (e.g. tagged with a wrong unit for a few days after
    installation) belongs to the unit with its latest reading, i.e. where it is now.

    Joined flats: a unit is named after its flats ("bj-e38bj-e39") in some measurements, while
    other meters may still be tagged with one of the flats ("bj-e38"). A tag that is not a unit
    but part of exactly one unit's name belongs to that unit.
    """
    units_by_number = {u.unit_number: u for u in session.exec(select(Unit).where(Unit.building_id == building.id)).all()}
    unit_ids = [u.id for u in units_by_number.values()]
    meters_by_serial = {m.serial_number: m for m in session.exec(select(Meter).where(Meter.unit_id.in_(unit_ids))).all()} if unit_ids else {}

    influx_units = sorted(get_unique_units(building.influx_db_name, building.influx_unit_tag))
    created_units = 0
    for unit_name in influx_units:
        if unit_name not in units_by_number:
            unit = Unit(unit_number=unit_name, floor=0, area_m2=0.0, building_id=building.id)
            session.add(unit)
            session.commit()  # id needed for its meters
            session.refresh(unit)
            units_by_number[unit_name] = unit
            created_units += 1

    measurements = list(parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS)
    # InfluxDB tag -> unit: every unit itself, plus tags of single flats of a joined unit
    unit_of_tag = {name: name for name in influx_units}
    if building.influx_unit_tag:
        for tag in get_unit_tags(building.influx_db_name, building.influx_unit_tag, measurements) - set(influx_units):
            containing = [name for name in influx_units if tag in name]
            if len(containing) == 1:
                unit_of_tag[tag] = containing[0]

    # serial number -> [(InfluxDB tag, meter data)] as reported by InfluxDB
    reported: Dict[str, List[Tuple[str, dict]]] = {}
    for tag in unit_of_tag:
        for meter_data in get_unit_meters(building.influx_db_name, tag, building.influx_unit_tag,
                                          building.influx_measurements, building.influx_device_tag):
            reported.setdefault(meter_data['serial_number'], []).append((tag, meter_data))

    created_meters = 0
    moved_meters = 0
    ambiguous = []
    for serial, entries in reported.items():
        tag, meter_data = entries[0]
        if len({unit_of_tag[t] for t, _ in entries}) > 1:
            last_seen = get_meter_last_seen_by_unit(building.influx_db_name, measurements,
                                                    building.influx_unit_tag, building.influx_device_tag, serial)
            tag, meter_data = max(entries, key=lambda e: last_seen.get(e[0], ''))
            ambiguous.append({"serial_number": serial, "units": sorted({unit_of_tag[t] for t, _ in entries}), "assigned_to": unit_of_tag[tag]})
        unit = units_by_number[unit_of_tag[tag]]
        meter = meters_by_serial.get(serial)
        if not meter:
            meter = Meter(serial_number=serial, type=meter_data['type'],
                          unit_of_measure=meter_data['unit_of_measure'], unit_id=unit.id)
            created_meters += 1
        elif meter.unit_id != unit.id:
            meter.unit_id = unit.id
            moved_meters += 1
        else:
            continue
        session.add(meter)
    session.commit()

    if influx_units:
        building.units_fetched = True
        session.add(building)
        session.commit()
        session.refresh(building)

    return {
        "units_created": created_units,
        "meters_connected": created_meters,
        "meters_moved": moved_meters,
        "meters_in_several_units": ambiguous,
        "units_found": len(influx_units),
        "units_fetched": building.units_fetched,
    }


def sync_all_buildings() -> None:
    """Daily job: load new units and meters for every building already set up from InfluxDB
    (units loaded at least once), so a replaced meter shows up without pressing the button."""
    log = logging.getLogger("uvicorn.error")
    with Session(engine) as session:
        buildings = session.exec(select(Building).where(Building.units_fetched == True)).all()  # noqa: E712
        for building in buildings:
            if not (building.influx_db_name and building.influx_device_tag):
                continue
            try:
                result = sync_units_from_influx(building, session)
                log.info("Unit sync %s: %d new units, %d new meters, %d meters moved",
                         building.id, result["units_created"], result["meters_connected"], result["meters_moved"])
            except Exception:
                session.rollback()
                log.exception("Unit sync %s failed", building.id)
