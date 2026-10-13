import re
import requests
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Set, Tuple, Optional

import os

INFLUX_HOST = os.getenv("INFLUX_HOST", "http://localhost:8086")
INFLUX_USER = os.getenv("INFLUX_USER", "alarmread")
INFLUX_PASSWORD = os.getenv("INFLUX_PASSWORD", "")

# Used when a building has no measurements configured
DEFAULT_MEASUREMENTS = {
    'sv_l': {'type': 'water_cold', 'uom': 'm3'},
    'tv_l': {'type': 'water_hot', 'uom': 'm3'},
    'teplo_kWh': {'type': 'heat', 'uom': 'kWh'},
}

def query_influx(db_name: str, query: str) -> dict:
    url = f"{INFLUX_HOST}/query"
    params = {'db': db_name, 'q': query}
    auth = None
    if INFLUX_USER and INFLUX_PASSWORD:
        auth = (INFLUX_USER, INFLUX_PASSWORD)
    
    try:
        response = requests.get(url, params=params, auth=auth)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error querying InfluxDB: {e}")
        return {}

def get_unique_units(db_name: str, unit_tag: str = None) -> Set[str]:
    """
    Finds all unique units in the database by checking common measurements.
    """
    units = set()
    
    # Check provided tag or defaults
    tags_to_check = [unit_tag] if unit_tag else []

    # Check 'unit' tag in sv_l (Cold Water)
    for tag in tags_to_check:
        data = query_influx(db_name, f'SHOW TAG VALUES FROM sv_l WITH KEY = "{tag}"')
        if data.get('results'):
            for result in data['results']:
                if 'series' in result:
                    for series in result['series']:
                        for value in series['values']:
                            units.add(value[1]) # value[0] is key name, value[1] is value
    
    return units

def infer_meter_type(measurement_name: str) -> str:
    """Infers meter type from measurement name."""
    name = measurement_name.lower()
    if 'sv' in name or 'water_cold' in name: return 'water_cold'
    if 'tv' in name or 'water_hot' in name: return 'water_hot'
    if 'teplo' in name or 'heat' in name: return 'heat'
    if 'el' in name or 'electricity' in name: return 'electricity'
    return 'other'

def parse_measurements_config(config_str: str) -> Dict[str, Dict]:
    """
    Parses "sv_l[m3],teplo_kWh[kWh]" into dict.
    Returns: {'sv_l': {'type': 'water_cold', 'uom': 'm3'}, ...}
    """
    if not config_str: return {}
    
    measurements = {}
    # Split by comma but ignore commas inside brackets
    parts = re.split(r',\s*(?![^\[]*\])', config_str)
    
    for part in parts:
        part = part.strip()
        if not part: continue
        
        # parse measurement[uom,type_name]
        if '[' in part and part.endswith(']'):
            name = part.split('[')[0].strip()
            content = part.split('[')[1][:-1].strip()
            if ',' in content:
                uom, type_custom = content.split(',', 1)
                uom = uom.strip()
                type_name = type_custom.strip()
            else:
                uom = content
                type_name = infer_meter_type(name)
        else:
            name = part
            uom = '' # or default
            type_name = infer_meter_type(name)
            
        measurements[name] = {
            'type': type_name,
            'uom': uom
        }
    return measurements

def get_unit_meters(db_name: str, unit_name: str, unit_tag: str = None, measurements_config: str = None, device_tag: str = None) -> List[Dict]:
    """
    Finds meters for a specific unit.
    Returns list of dicts: {'serial_number': str, 'type': str, 'unit_of_measure': str}
    """
    meters = []
    
    # Define measurements to check and their metadata
    if measurements_config:
        measurements = parse_measurements_config(measurements_config)
    else:
        # Default fallback
        measurements = {
            'sv_l': {'type': 'water_cold', 'uom': 'm3'},
            'tv_l': {'type': 'water_hot', 'uom': 'm3'},
            'teplo_kWh': {'type': 'heat', 'uom': 'kWh'},
        }

    tags_to_check = [unit_tag] if unit_tag else []

    for measurement, meta in measurements.items():
        # Query series for this unit to find serial numbers (sn) and specs
        
        # Try finding serial numbers (sn) for this unit
        data = {}
        # Guess common serial number tag keys
        sn_tags_to_check = [device_tag] if device_tag else []
        
        
        for tag in tags_to_check:
             # We need to find the SN tag.
             # Let's try to find which tag key holds the serials?
             # Or just try query for each candidate?
             
             for sn_tag in sn_tags_to_check:
                 q = f'SHOW TAG VALUES FROM "{measurement}" WITH KEY = "{sn_tag}" WHERE "{tag}" = \'{unit_name}\''
                 res = query_influx(db_name, q)
                 if res.get('results') and res['results'][0].get('series'):
                     data = res
                     break
             if data: break # Found meters via one of the unit tags
        
        if data.get('results'):
            for result in data['results']:
                if 'series' in result:
                    for series in result['series']:
                        for value in series['values']:
                            # value is [key, value] -> ["sn", "12345"]
                            sn = value[1]
                            if sn:
                                meters.append({
                                    'serial_number': sn,
                                    'type': meta['type'],
                                    'unit_of_measure': meta['uom']
                                })
                            
    return meters

def get_meter_readings(db_name: str, serial_number: str, measurement: str = None, device_tag: str = None) -> List[Tuple[str, float]]:
    """
    Fetches readings for a specific meter serial number.
    Returns list of (time, value).
    """
    readings = []
    
    # If measurement is not known, we might have to search all?
    # But usually we know it from meter type. 
    # For now, let's assume we search all known measurements if not provided?
    # Or better, search distinct ones.
    
    measurements_to_check = [measurement] if measurement else ['sv_l', 'tv_l', 'teplo_kWh']
    
    sn_tags_to_check = [device_tag] if device_tag else []

    for meas in measurements_to_check:
        if not meas: continue
        
        # Query value where sn = serial_number
        # Try all SN tags
        for sn_tag in sn_tags_to_check:
            # Plain readings, one per day: the last one of each UTC day with its own time (some meters
            # send their state more than once a day)
            q = f'SELECT "value" FROM "{meas}" WHERE "{sn_tag}" = \'{serial_number}\''
            data = query_influx(db_name, q)
            
            if data.get('results') and data['results'][0].get('series'):
                 by_day = {}
                 for series in data['results'][0]['series']:
                     for time_str, value in series['values']:
                         by_day[time_str[:10]] = (time_str, value)
                 # If we found data with this tag, break (assuming SN unique)
                 return [by_day[day] for day in sorted(by_day)]
                            
    return readings

# A period is not cached (app/core/building_consumption.py) until this long after its end: a meter
# that was silent across the end may still send the reading that closes it
AFTER_WINDOW = timedelta(days=62)
# Readings around a period are looked for this close first
NEAR = timedelta(days=7)

def get_period_points(db_name: str, measurement: str, device_tag: str, start: datetime, end: datetime,
                      serials: Optional[List[str]] = None) -> Optional[Dict[str, Dict[str, Tuple[float, float]]]]:
    """
    Readings around the period [start, end) for every meter of a measurement, keyed by serial
    number: 'before' (last before the start), 'first' and 'last' (inside the period) and 'after'
    (first at or after the end). `serials` are the meters expected (also those silent through the
    whole period, whose consumption is interpolated across it). Each point is (unix timestamp, value) of a raw reading; plain
    FIRST/LAST selectors keep InfluxDB from aggregating the whole period, which a small server
    cannot afford. See app/core/consumption.py for how the points are turned into consumption.
    """
    def fmt(d: datetime) -> str:
        return d.strftime('%Y-%m-%dT%H:%M:%SZ')

    def select(fn: str, a: Optional[datetime], b: Optional[datetime]) -> str:
        where = ' AND '.join(([f"time >= '{fmt(a)}'"] if a else []) + ([f"time < '{fmt(b)}'"] if b else []))
        return f'SELECT {fn}("value") FROM "{measurement}" WHERE {where} GROUP BY "{device_tag}"'

    def parse(statements, results, points):
        for (key, _), result in zip(statements, results):
            for series in result.get('series', []):
                sn = series.get('tags', {}).get(device_tag)
                if sn and series.get('values'):
                    time_str, value = series['values'][0][:2]
                    ts = datetime.fromisoformat(time_str.replace('Z', '+00:00')).timestamp()
                    points.setdefault(sn, {})[key] = (ts, value)

    # Meters report daily, so the neighbouring readings are almost always within a week; only meters
    # without one there are asked again without a time limit (a search back to the oldest data is slow)
    statements = [
        ('before', select('LAST', start - NEAR, start)),
        ('first', select('FIRST', start, end)),
        ('last', select('LAST', start, end)),
        ('after', select('FIRST', end, end + NEAR)),
    ]
    data = query_influx(db_name, ';'.join(q for _, q in statements))
    if 'results' not in data:
        return None  # InfluxDB not reachable or the query failed (no data at all is an empty dict)
    points: Dict[str, Dict[str, Tuple[float, float]]] = {}
    parse(statements, data['results'], points)

    def unbounded(key: str, fn: str, a: Optional[datetime], b: Optional[datetime], serials) -> bool:
        if not serials:
            return True
        pattern = '|'.join(re.escape(sn) for sn in sorted(serials))
        q = select(fn, a, b).replace(' GROUP BY', f' AND "{device_tag}" =~ /^({pattern})$/ GROUP BY')
        data = query_influx(db_name, q)
        if 'results' not in data:
            return False
        parse([(key, q)], data['results'], points)
        return True

    # 'after' also for the building's meters silent through the whole period, then 'before' for the
    # meters that have something to interpolate it with (an old meter replaced long ago has not)
    expected = set(points) | set(serials or [])
    if not unbounded('after', 'FIRST', end, None, {sn for sn in expected if 'after' not in points.get(sn, {})}):
        return None
    if not unbounded('before', 'LAST', None, start, {sn for sn, p in points.items() if 'before' not in p}):
        return None

    # The unit detail keeps one reading per day, the last one (get_meter_readings): replace 'first'
    # and 'after' by the last reading of their day, asked once per distinct day
    days = sorted({datetime.fromtimestamp(p[key][0], timezone.utc).date() for p in points.values()
                   for key in ('first', 'after') if key in p})
    if days:
        statements = [select('LAST', datetime(d.year, d.month, d.day, tzinfo=timezone.utc),
                             datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(days=1)) for d in days]
        data = query_influx(db_name, ';'.join(statements))
        if 'results' not in data:
            return None
        day_last = {}
        for d, result in zip(days, data['results']):
            for series in result.get('series', []):
                time_str, value = series['values'][0][:2]
                day_last[(series.get('tags', {}).get(device_tag), d)] = (
                    datetime.fromisoformat(time_str.replace('Z', '+00:00')).timestamp(), value)
        for sn, p in points.items():
            for key in ('first', 'after'):
                if key in p:
                    p[key] = day_last.get((sn, datetime.fromtimestamp(p[key][0], timezone.utc).date()), p[key])
    return points

def get_raw_readings(db_name: str, measurement: str, device_tag: str, start: datetime, end: datetime) -> Dict[str, List[Tuple[str, float]]]:
    """All readings of every meter of a measurement in [start, end), keyed by serial number."""
    def fmt(d: datetime) -> str:
        return d.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    q = (f'SELECT "value" FROM "{measurement}" WHERE time >= \'{fmt(start)}\' AND time < \'{fmt(end)}\' '
         f'GROUP BY "{device_tag}"')
    data = query_influx(db_name, q)
    readings: Dict[str, List[Tuple[str, float]]] = {}
    for result in data.get('results', []):
        for series in result.get('series', []):
            sn = series.get('tags', {}).get(device_tag)
            if sn:
                readings[sn] = [(v[0], v[1]) for v in series.get('values', []) if v[1] is not None]
    return readings

def get_meter_last_seen_by_unit(db_name: str, measurements: List[str], unit_tag: str, device_tag: str, serial_number: str) -> Dict[str, str]:
    """Time of the latest reading of a meter under each unit tag it was ever reported with."""
    last_seen: Dict[str, str] = {}
    for measurement in measurements:
        q = (f'SELECT LAST("value") FROM "{measurement}" WHERE "{device_tag}" = \'{serial_number}\' '
             f'GROUP BY "{unit_tag}"')
        for result in query_influx(db_name, q).get('results', []):
            for series in result.get('series', []):
                unit = series.get('tags', {}).get(unit_tag)
                if unit and series.get('values'):
                    last_seen[unit] = max(last_seen.get(unit, ''), series['values'][0][0])
    return last_seen


def get_last_reading_time(db_name: str, measurements: List[str]) -> Optional[str]:
    """Time of the newest reading of any meter in the database (one database per building)."""
    times = []
    for measurement in measurements:
        for result in query_influx(db_name, f'SELECT LAST("value") FROM "{measurement}"').get('results', []):
            for series in result.get('series', []):
                if series.get('values'):
                    times.append(series['values'][0][0])
    return max(times) if times else None


def get_meters_last_time(db_name: str, measurements: List[str], device_tag: str, serials: List[str]) -> Optional[str]:
    """Time of the newest reading of the given meters (serial numbers), or None."""
    if not serials:
        return None
    pattern = "|".join(re.escape(s) for s in serials)
    times = []
    for measurement in measurements:
        q = f'SELECT LAST("value") FROM "{measurement}" WHERE "{device_tag}" =~ /^({pattern})$/'
        for result in query_influx(db_name, q).get('results', []):
            for series in result.get('series', []):
                if series.get('values'):
                    times.append(series['values'][0][0])
    return max(times) if times else None
