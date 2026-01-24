import requests
from typing import List, Dict, Set, Tuple

INFLUX_HOST = "http://localhost:8086"

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

def get_unique_units(db_name: str) -> Set[str]:
    """
    Finds all unique units in the database by checking common measurements.
    """
    units = set()
    # Check 'unit' tag in sv_l (Cold Water)
    data = query_influx(db_name, 'SHOW TAG VALUES FROM sv_l WITH KEY = "unit"')
    if data.get('results'):
        for result in data['results']:
            if 'series' in result:
                for series in result['series']:
                    for value in series['values']:
                        units.add(value[1]) # value[0] is key name, value[1] is value
    
    # Check 'jednotka' tag just in case
    data = query_influx(db_name, 'SHOW TAG VALUES FROM sv_l WITH KEY = "jednotka"')
    if data.get('results'):
         for result in data['results']:
            if 'series' in result:
                for series in result['series']:
                    for value in series['values']:
                        units.add(value[1])
                        
    return units

def get_unit_meters(db_name: str, unit_name: str) -> List[Dict]:
    """
    Finds meters for a specific unit.
    Returns list of dicts: {'serial_number': str, 'type': str, 'unit_of_measure': str}
    """
    meters = []
    
    # Define measurements to check and their metadata
    measurements = {
        'sv_l': {'type': 'water_cold', 'uom': 'm3'}, # Usually liters but we might standardize
        'tv_l': {'type': 'water_hot', 'uom': 'm3'},
        'teplo_kWh': {'type': 'heat', 'uom': 'kWh'},
        # 'teplo_kwh': {'type': 'heat', 'uom': 'kWh'} # normalize?
    }

    for measurement, meta in measurements.items():
        # Query series for this unit to find serial numbers (sn) and specs
        # Tag 'unit' OR 'jednotka' could be used. Let's try WHERE unit='name' OR jednotka='name'
        # InfluxQL doesn't support OR in tag values easily in SHOW SERIES without FULL scan sometimes?
        # Better to query specific tags.
        
        # Try finding series where unit tag matches
        q = f'SHOW SERIES FROM "{measurement}" WHERE "unit" = \'{unit_name}\''
        data = query_influx(db_name, q)
        
        # If empty, try 'jednotka'
        if not data.get('results') or not data['results'][0].get('series'):
             q = f'SHOW SERIES FROM "{measurement}" WHERE "jednotka" = \'{unit_name}\''
             data = query_influx(db_name, q)

        if data.get('results'):
            for result in data['results']:
                if 'series' in result:
                    for series_line in result['series'][0]['values']:
                        # series_line is like "sv_l,app=foo,sn=12345,unit=bj-a01"
                        # We need to parse tags.
                        tags = parse_series_tags(series_line[0])
                        sn = tags.get('sn')
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
    """
    parts = series_str.split(',')
    tags = {}
    for part in parts[1:]: # Skip measurement name
        if '=' in part:
            k, v = part.split('=', 1)
            tags[k] = v
    return tags
