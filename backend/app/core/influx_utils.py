import requests
from typing import List, Dict, Set, Tuple

import os

INFLUX_HOST = os.getenv("INFLUX_HOST", "http://localhost:8086")

def query_influx(db_name: str, query: str) -> dict:
    url = f"{INFLUX_HOST}/query"
    params = {'db': db_name, 'q': query}
    try:
        response = requests.get(url, params=params)
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
    tags_to_check = [unit_tag] if unit_tag else ['unit', 'jednotka']

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
    import re
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

def get_unit_meters(db_name: str, unit_name: str, unit_tag: str = None, measurements_config: str = None) -> List[Dict]:
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

    tags_to_check = [unit_tag] if unit_tag else ['unit', 'jednotka']

    for measurement, meta in measurements.items():
        # Query series for this unit to find serial numbers (sn) and specs
        
        # Try finding serial numbers (sn) for this unit
        data = {}
        # Guess common serial number tag keys
        sn_tags_to_check = ['sn', 'serial', 'serial_number', 'device', 'device_id', 'meter_id']
        
        found_sn_tag = None
        
        for tag in tags_to_check:
             # We need to find the SN tag.
             # Let's try to find which tag key holds the serials?
             # Or just try query for each candidate?
             
             for sn_tag in sn_tags_to_check:
                 q = f'SHOW TAG VALUES FROM "{measurement}" WITH KEY = "{sn_tag}" WHERE "{tag}" = \'{unit_name}\''
                 res = query_influx(db_name, q)
                 if res.get('results') and res['results'][0].get('series'):
                     data = res
                     found_sn_tag = sn_tag
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

def parse_series_tags(series_str: str) -> Dict[str, str]:
    """
    Parses "measurement,tag1=val1,tag2=val2" into a dict.
    (Kept for reference or other uses, but used less now)
    """
    parts = series_str.split(',')
    tags = {}
    for part in parts[1:]: 
        if '=' in part:
            k, v = part.split('=', 1)
            tags[k.strip()] = v.strip()
    return tags

def get_meter_readings(db_name: str, serial_number: str, measurement: str = None) -> List[Tuple[str, float]]:
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
    
    sn_tags_to_check = ['sn', 'serial', 'serial_number', 'device', 'device_id', 'meter_id']

    for meas in measurements_to_check:
        if not meas: continue
        
        # Query value where sn = serial_number
        # Try all SN tags
        for sn_tag in sn_tags_to_check:
            q = f'SELECT "value" FROM "{meas}" WHERE "{sn_tag}" = \'{serial_number}\''
            data = query_influx(db_name, q)
            
            if data.get('results') and data['results'][0].get('series'):
                 # Found data
                 for result in data['results']:
                    if 'series' in result:
                        for series in result['series']:
                            for value in series['values']:
                                # value is [time, value]
                                readings.append((value[0], value[1]))
                 # If we found data with this tag, break (assuming SN unique)
                 return readings # Return immediately as duplicate readings from other tags unlikely/redundant
                            
    return readings
