
import requests
import os
import json

INFLUX_HOST = os.getenv("INFLUX_HOST", "http://localhost:8086")
DB_NAME = "svjcornovova28a34db"

def query(q):
    url = f"{INFLUX_HOST}/query"
    params = {'db': DB_NAME, 'q': q}
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e)}

print(f"--- Debugging DB: {DB_NAME} ---")

# 1. Show Measurements
print("\n1. Measurements:")
res = query("SHOW MEASUREMENTS")
if res.get('results'):
    for r in res['results']:
        for s in r.get('series', []):
            print(s['values'])

# 2. Check Tag Keys for sv_l
print("\n2. Tag Keys for sv_l:")
res = query("SHOW TAG KEYS FROM sv_l")
if res.get('results'):
    for r in res['results']:
        for s in r.get('series', []):
            print(s['values'])

# 3. Check Tag Keys for tv_l
print("\n3. Tag Keys for tv_l:")
res = query("SHOW TAG KEYS FROM tv_l")
if res.get('results'):
    for r in res['results']:
        for s in r.get('series', []):
            print(s['values'])

# 4. Sample Data
print("\n4. Sample Data (sv_l):")
res = query("SELECT * FROM sv_l LIMIT 2")
print(json.dumps(res, indent=2))
