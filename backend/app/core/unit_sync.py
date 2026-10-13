"""Units and meters of a building, synchronised from InfluxDB tags."""
import logging
from typing import Dict, List, Optional, Set, Tuple
from sqlmodel import Session, select
from ..models.property import Building, Unit
from ..models.telemetry import Meter
from .database import engine
from .influx_utils import (get_unique_units, get_unit_meters, get_meter_last_seen_by_unit, get_unit_tags,
                           parse_measurements_config, DEFAULT_MEASUREMENTS)


def split_joined(tag: str, tags: Set[str]) -> Optional[List[str]]:
    """The other tags a tag is made of, joined without a separator ("bj-e38bj-e39" -> ["bj-e38",
    "bj-e39"]), or None when it is not such a join."""
    others = sorted(tags - {tag}, key=len, reverse=True)

    def split(rest: str) -> Optional[List[str]]:
        if not rest:
            return []
        for other in others:
            if rest.startswith(other):
                tail = split(rest[len(other):])
                if tail is not None:
                    return [other] + tail
        return None

    parts = split(tag)
    return parts if parts and len(parts) > 1 else None


def sync_units_from_influx(building: Building, session: Session) -> dict:
    """
    Add units and meters found in InfluxDB. Nothing is deleted and existing units and meters keep
    their ids (links, owners). After a meter replacement the new meter is added next to the old
    one, which keeps its history.

    Units come from the unit tags of cold water (other measurements may keep old, unused tags). A
    meter reported under several units (e.g. tagged with a wrong unit for a few days after
    installation) belongs to the unit with its latest reading, i.e. where it is now.

    Joined tag: a unit tag made of tags used in other measurements ("bj-e38bj-e39" = "bj-e38" +
    "bj-e39", flats tagged together for water but separately for heat) is not a unit; its flats are.
    Its meters go to the first flat when new; a meter already in one of the flats stays where it is
    (assigned on purpose, see scripts/split_joined_unit.py).
    """
    units_by_number = {u.unit_number: u for u in session.exec(select(Unit).where(Unit.building_id == building.id)).all()}
    unit_ids = [u.id for u in units_by_number.values()]
    meters_by_serial = {m.serial_number: m for m in session.exec(select(Meter).where(Meter.unit_id.in_(unit_ids))).all()} if unit_ids else {}
    measurements = list(parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS)

    unit_tags = get_unique_units(building.influx_db_name, building.influx_unit_tag)
    all_tags = get_unit_tags(building.influx_db_name, building.influx_unit_tag, measurements) | unit_tags \
        if building.influx_unit_tag else unit_tags
    joined = {tag: parts for tag in unit_tags if (parts := split_joined(tag, all_tags))}
    influx_units = sorted((unit_tags - set(joined)) | {part for parts in joined.values() for part in parts})

    created_units = 0
    for unit_name in influx_units:
        if unit_name not in units_by_number:
            unit = Unit(unit_number=unit_name, floor=0, area_m2=0.0, building_id=building.id)
            session.add(unit)
            session.commit()  # id needed for its meters
            session.refresh(unit)
            units_by_number[unit_name] = unit
            created_units += 1
    unit_names_by_id = {u.id: name for name, u in units_by_number.items()}

    # serial number -> [(InfluxDB tag, meter data)] as reported by InfluxDB
    reported: Dict[str, List[Tuple[str, dict]]] = {}
    for tag in sorted(set(influx_units) | set(joined)):
        for meter_data in get_unit_meters(building.influx_db_name, tag, building.influx_unit_tag,
                                          building.influx_measurements, building.influx_device_tag):
            reported.setdefault(meter_data['serial_number'], []).append((tag, meter_data))

    created_meters = 0
    moved_meters = 0
    ambiguous = []
    for serial, entries in reported.items():
        meter = meters_by_serial.get(serial)
        direct = [(tag, data) for tag, data in entries if tag not in joined]
        if direct:
            unit_name, meter_data = direct[0]
            if len({tag for tag, _ in direct}) > 1:
                last_seen = get_meter_last_seen_by_unit(building.influx_db_name, measurements,
                                                        building.influx_unit_tag, building.influx_device_tag, serial)
                unit_name, meter_data = max(direct, key=lambda e: last_seen.get(e[0], ''))
                ambiguous.append({"serial_number": serial, "units": sorted({tag for tag, _ in direct}), "assigned_to": unit_name})
        else:
            # Only under joined tags: keep it in one of their units, a new one goes to the first
            tag, meter_data = entries[0]
            parts = [part for t, _ in entries for part in joined[t]]
            if meter and unit_names_by_id.get(meter.unit_id) in parts:
                continue
            unit_name = joined[tag][0]
        unit = units_by_number[unit_name]
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
        "joined_tags": {tag: parts for tag, parts in sorted(joined.items())},
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
