
import requests
import os
import json

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

def get_meter_readings(db_name: str, serial_number: str, measurement: str, device_tag: str):
    print(f"\nSearching for SN: {serial_number} in {measurement} using tag {device_tag}")
    
    q = f'SELECT "value" FROM "{measurement}" WHERE "{device_tag}" = \'{serial_number}\' LIMIT 5'
    print(f"Executing Query: {q}")
    
    data = query_influx(db_name, q)
    print(f"Result: {json.dumps(data, indent=2)}")

# Test Case
DB_NAME = "svjnuselska731db"
SERIAL = "04B6481956320881"
MEASUREMENT = "sv_l"
DEVICE_TAG = "t2deveui"

get_meter_readings(DB_NAME, SERIAL, MEASUREMENT, DEVICE_TAG)
