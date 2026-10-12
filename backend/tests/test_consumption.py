"""
Consumption rules (app/core/consumption.py), no database or InfluxDB needed:
  docker compose exec -T backend sh -c "PYTHONPATH=/app python /app/tests/test_consumption.py"
"""
from datetime import datetime, timezone
from app.core.consumption import meter_period, combine_meters


def ts(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc).timestamp()


def period(meters, start, end):
    return combine_meters(start, end, meters)


JAN = (ts(2025, 1, 1), ts(2025, 2, 1))
YEAR = (ts(2025, 1, 1), ts(2026, 1, 1))

# Readings exactly on the boundaries
m = meter_period(*JAN, (ts(2024, 12, 31), 90), (ts(2025, 1, 1), 100), (ts(2025, 1, 31), 160), (ts(2025, 2, 1), 162))
r = period([m], *JAN)
assert (r.value, r.missing_days, r.complete) == (62, 0, True), r

# No reading on the 1st: the boundary is interpolated (102 on 1 Jan, 164 on 1 Feb), nothing is missing
m = meter_period(*JAN, (ts(2024, 12, 31), 100), (ts(2025, 1, 2), 104), (ts(2025, 1, 30), 160), (ts(2025, 2, 3), 168))
r = period([m], *JAN)
assert (r.value, r.missing_days, r.complete) == (62, 0, True), r

# Gap across the boundary (no readings 6 Dec - 26 Mar): split by days, not counted as missing
m = meter_period(*YEAR, (ts(2024, 12, 6), 15234), (ts(2025, 3, 26), 15346), (ts(2025, 12, 31), 20000), (ts(2026, 1, 1), 20010))
r = period([m], *YEAR)
assert r.complete and r.missing_days == 0, r
assert r.value == round(20010 - (15234 + 112 * 26 / 110)), r  # 26 of the 110 gap days fall into 2024

# Meter started recording on 16 Jan: 15 days missing at the start
m = meter_period(*JAN, None, (ts(2025, 1, 16), 500), (ts(2025, 1, 31), 530), (ts(2025, 2, 1), 532))
r = period([m], *JAN)
assert (r.value, r.missing_days, r.complete) == (32, 15, False), r
m = meter_period(*YEAR, None, (ts(2025, 1, 16), 500), (ts(2025, 12, 31), 1500), (ts(2026, 1, 1), 1504))
assert not period([m], *YEAR).complete  # 15 of 365 days = 4.1 % > 3 %

# Period not closed yet: last reading 17 Feb, no reading after the end
m = meter_period(*YEAR, (ts(2024, 12, 31), 0), (ts(2025, 1, 1), 2), (ts(2025, 2, 17), 300), None)
r = period([m], *YEAR)
assert (r.value, r.missing_days, r.complete) == (298, 318, False), r

# Threshold 97 %: up to 10.95 missing days of 365 is fine
m = meter_period(*YEAR, (ts(2024, 12, 31), 0), (ts(2025, 1, 1), 1), (ts(2025, 12, 21), 900), None)
assert period([m], *YEAR).missing_days == 11 and not period([m], *YEAR).complete
m = meter_period(*YEAR, (ts(2024, 12, 31), 0), (ts(2025, 1, 1), 1), (ts(2025, 12, 22), 900), None)
assert period([m], *YEAR).missing_days == 10 and period([m], *YEAR).complete

# Meter replacement: old meter until 16 Mar, new one from 29 Mar; the gap is in the middle
old = meter_period(*YEAR, (ts(2024, 12, 31), 5675), (ts(2025, 1, 1), 5689), (ts(2025, 3, 16), 6824), None)
new = meter_period(*YEAR, None, (ts(2025, 3, 29), 99), (ts(2025, 12, 31), 3000), (ts(2026, 1, 1), 3010))
r = period([old, new], *YEAR)
assert r.complete and r.missing_days == 0, r
assert r.value == (6824 - 5689) + (3010 - 99), r

# Each of them alone is incomplete
assert not period([old], *YEAR).complete and not period([new], *YEAR).complete

# No data at all
assert meter_period(*JAN, None, None, None, None) is None
assert period([None], *JAN).value is None and not period([None], *JAN).complete

# Decimal readings (m3) keep their precision, integer ones are rounded to whole units
m = meter_period(*JAN, (ts(2024, 12, 31), 1.234), (ts(2025, 1, 2), 1.240), (ts(2025, 1, 31), 2.5), (ts(2025, 2, 1), 2.51))
assert period([m], *JAN).value == round(2.51 - 1.237, 3), period([m], *JAN)

print("SUCCESS: Consumption rules verified!")
