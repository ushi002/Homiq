"""Units and meters of a building, synchronised from InfluxDB tags."""
from typing import Dict, List, Tuple
from sqlmodel import Session, select
from ..models.property import Building, Unit
from ..models.telemetry import Meter
from .influx_utils import (get_unique_units, get_unit_meters, get_meter_last_seen_by_unit,
                           parse_measurements_config, DEFAULT_MEASUREMENTS)


def sync_units_from_influx(building: Building, session: Session) -> dict:
    """
    Add units and meters found in InfluxDB. Nothing is deleted and existing units and meters keep
    their ids (links, owners). After a meter replacement the new meter is added next to the old
    one, which keeps its history.

    A meter reported under several units (e.g. tagged with a wrong unit for a few days after
    installation) belongs to the unit with its latest reading, i.e. where it is now.
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

    # serial number -> [(unit, meter data)] as reported by InfluxDB
    reported: Dict[str, List[Tuple[str, dict]]] = {}
    for unit_name in influx_units:
        for meter_data in get_unit_meters(building.influx_db_name, unit_name, building.influx_unit_tag,
                                          building.influx_measurements, building.influx_device_tag):
            reported.setdefault(meter_data['serial_number'], []).append((unit_name, meter_data))

    measurements = list(parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS)
    created_meters = 0
    moved_meters = 0
    ambiguous = []
    for serial, entries in reported.items():
        unit_name, meter_data = entries[0]
        if len({u for u, _ in entries}) > 1:
            last_seen = get_meter_last_seen_by_unit(building.influx_db_name, measurements,
                                                    building.influx_unit_tag, building.influx_device_tag, serial)
            unit_name, meter_data = max(entries, key=lambda e: last_seen.get(e[0], ''))
            ambiguous.append({"serial_number": serial, "units": sorted({u for u, _ in entries}), "assigned_to": unit_name})
        unit = units_by_number[unit_name]
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
