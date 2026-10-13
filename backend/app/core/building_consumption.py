"""Consumption of every unit of a building by meter type, for the building overview and the
building average shown to owners. Rules: app/core/consumption.py."""
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple
from ..models.property import Building
from ..models.telemetry import Meter
from .consumption import PeriodResult, combine_meters, meter_period
from .influx_utils import get_period_points, parse_measurements_config, DEFAULT_MEASUREMENTS, AFTER_WINDOW

# InfluxDB answers for settled periods, kept in memory. A period is settled once its end is further
# back than the window in which the reading closing it is searched for: none of its points can
# change any more (except for data loaded into InfluxDB retroactively, which a restart clears).
_CACHE_SIZE = 2000
_cache: "OrderedDict[tuple, dict]" = OrderedDict()
_cache_lock = threading.Lock()


def _period_points(db_name: str, measurement: str, device_tag: str, start: datetime, end: datetime,
                   serials: Tuple[str, ...]) -> dict:
    if end + AFTER_WINDOW + timedelta(days=1) > datetime.now(timezone.utc):
        return get_period_points(db_name, measurement, device_tag, start, end, list(serials)) or {}
    key = (db_name, measurement, device_tag, start, end, serials)
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    points = get_period_points(db_name, measurement, device_tag, start, end, list(serials))
    if points is None:  # InfluxDB error: answer empty now, ask again next time
        return {}
    with _cache_lock:
        _cache[key] = points
        if len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return points


def units_consumption(building: Building, meters: List[Meter], periods: List[Tuple[datetime, datetime]]
                      ) -> Tuple[List[dict], List[Dict[str, Dict[str, PeriodResult]]]]:
    """
    Returns the meter types present in the building ({type, unit_of_measure}) and, for each period
    [start, end), {unit_id: {type: PeriodResult}} with the meters of one type in a unit combined
    (old and new meter after a replacement). Units without data for a type are left out.
    """
    measurements = parse_measurements_config(building.influx_measurements) or DEFAULT_MEASUREMENTS
    meter_types = []
    jobs = []  # (measurement, type, meters of that type, period index)
    for meas_name, meta in measurements.items():
        type_meters = [m for m in meters if m.type == meta['type']]
        if not type_meters:
            continue
        if meta['type'] not in [mt['type'] for mt in meter_types]:
            meter_types.append({"type": meta['type'], "unit_of_measure": meta['uom'] or type_meters[0].unit_of_measure})
        for i in range(len(periods)):
            jobs.append((meas_name, meta['type'], type_meters, i))

    if not (building.influx_db_name and building.influx_device_tag):
        jobs = []

    # Influx queries run in parallel, one per measurement and period
    with ThreadPoolExecutor(max_workers=6) as pool:
        points = list(pool.map(
            lambda job: _period_points(building.influx_db_name, job[0], building.influx_device_tag, *periods[job[3]],
                                       tuple(sorted(m.serial_number for m in job[2]))),
            jobs,
        ))

    # parts[period][unit_id][type] = [MeterPeriod, ...]
    parts: List[dict] = [{} for _ in periods]
    for (_, meter_type, type_meters, i), by_sn in zip(jobs, points):
        start, end = (b.timestamp() for b in periods[i])
        for m in type_meters:
            p = by_sn.get(m.serial_number)
            mp = meter_period(start, end, p.get('before'), p.get('first'), p.get('last'), p.get('after')) if p else None
            if mp:
                parts[i].setdefault(str(m.unit_id), {}).setdefault(meter_type, []).append(mp)

    results = []
    for i, (start, end) in enumerate(periods):
        results.append({
            unit_id: {t: combine_meters(start.timestamp(), end.timestamp(), meter_parts) for t, meter_parts in by_type.items()}
            for unit_id, by_type in parts[i].items()
        })
    return meter_types, results
