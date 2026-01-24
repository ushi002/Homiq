from app.core.influx_utils import get_unique_units, get_unit_meters, query_influx

DB_NAME = "svjkk469db2"
UNIT_NAME = "bj-b17"

print(f"Testing get_unit_meters for {UNIT_NAME}...")
meters = get_unit_meters(DB_NAME, UNIT_NAME)
print(f"Found {len(meters)} meters: {meters}")

print("\nManual Query Check:")
q = f'SHOW SERIES FROM "sv_l" WHERE "unit" = \'{UNIT_NAME}\''
data = query_influx(DB_NAME, q)
print(data)
