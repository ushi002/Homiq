"""
Energy overview rules (app/core/energy.py), no database, InfluxDB or weather needed:
  docker compose exec -T backend sh -c "PYTHONPATH=/app python /app/tests/test_energy.py"
"""
from datetime import date, timedelta
from app.core.energy import meter_daily, building_daily, signature, design_kw_per_k, compare_units

d = lambda day: date(2026, 1, day)

# Daily maxima -> consumption per day; a gap is spread evenly, a drop (replaced meter) left out
daily = meter_daily([(d(1), 100), (d(2), 110), (d(5), 140), (d(6), 5), (d(7), 8)], d(2), d(8))
assert daily == {d(2): 10, d(3): 10, d(4): 10, d(5): 10, d(7): 3}, daily
assert meter_daily([(d(1), 100)], d(1), d(5)) == {}

# Building per day: complete only with data from at least 90 % of the meters
meters = {f"m{i}": {d(2): 1.0} for i in range(10)}
meters["m0"] = {d(2): 1.0, d(3): 2.0}
days = building_daily(meters, {d(2): -3.0}, d(2), d(4))
assert days[0] == {"date": "2026-01-02", "kwh": 10.0, "complete": True, "temp": -3.0}, days[0]
assert days[1] == {"date": "2026-01-03", "kwh": 2.0, "complete": False, "temp": None}, days[1]

# Signature: kWh/day = 480 - 24 x T  ->  1 kW/K, heating stops at 20 °C. Left out: days before the
# heating starts (no consumption at 12 °C), warm days, incomplete days
day = lambda i: (date(2025, 10, 1) + timedelta(days=i)).isoformat()
days = [{"date": day(0), "kwh": 0.0, "complete": True, "temp": 12.0}, {"date": day(1), "kwh": 3.0, "complete": True, "temp": 13.0}]
days += [{"date": day(2 + i), "kwh": 480 - 24 * t, "complete": True, "temp": t} for i, t in enumerate(range(-5, 15))]
days += [{"date": day(30), "kwh": 5, "complete": True, "temp": 18}, {"date": day(31), "kwh": 999, "complete": False, "temp": 0}]
s = signature(days)
assert s["kw_per_k"] == 1.0 and s["balance_temp_c"] == 20.0 and s["r2"] == 1.0 and s["days"] == 20, s
assert s["from"] == day(2) and s["to"] == day(21), s
assert signature(days[:7]) is None  # too few days

# Design: 32 kW at ΔT 32 K -> 1 kW/K
assert design_kw_per_k([16000, 16000]) == 1.0
assert design_kw_per_k([]) is None

# Units: expected share by heat loss, flags, position coefficient correction
units = [
    {"id": "a", "kwh": 300.0, "complete": True, "heat_loss_w": 1000, "position_coef": 0.5, "area_m2": 50},
    {"id": "b", "kwh": 100.0, "complete": True, "heat_loss_w": 1000, "position_coef": 1.0, "area_m2": 50},
    {"id": "c", "kwh": 0.0, "complete": True, "heat_loss_w": 2000, "position_coef": 1.0, "area_m2": 100},
    {"id": "d", "kwh": 50.0, "complete": False, "heat_loss_w": 1000, "position_coef": 1.0, "area_m2": 50},
    {"id": "e", "kwh": None, "complete": False, "heat_loss_w": None, "position_coef": None, "area_m2": None},
]
out = {u["id"]: u for u in compare_units(units)}
assert out["a"]["expected_kwh"] == 100.0 and out["a"]["ratio"] == 3.0 and out["a"]["flag"] == "high", out["a"]
assert out["c"]["expected_kwh"] == 200.0 and out["c"]["flag"] == "low"
assert out["b"]["flag"] is None and out["b"]["kwh_per_m2"] == 2.0
assert out["d"]["expected_kwh"] is None and out["d"]["ratio"] is None  # incomplete: no comparison
assert out["a"]["corrected_kwh"] == 150.0 and out["a"]["billing_share"] == 0.5, out["a"]  # 150 / (150+100+0+50)
assert out["e"]["corrected_kwh"] is None and out["e"]["billing_share"] is None

print("SUCCESS: Energy rules verified!")
