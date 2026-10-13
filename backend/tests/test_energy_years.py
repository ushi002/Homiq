"""
Yearly energy balance rules (app/core/energy_years.py), no database, InfluxDB or weather needed:
  docker compose exec -T backend sh -c "PYTHONPATH=/app python /app/tests/test_energy_years.py"
"""
from datetime import date, timedelta
from app.core.energy_years import degree_days, year_summary, split_info, meter_check, KWH_PER_GJ

# Degree days: Σ(20 − t) over days below 13 °C; complete only with (almost) every day of the year
temps = {date(2023, 1, 1) + timedelta(days=i): (0.0 if i < 100 else 15.0) for i in range(365)}
assert degree_days(temps, 2023) == {"value": 2000, "exact": 2000.0, "days": 365, "complete": True}
assert degree_days({d: t for d, t in temps.items() if d.month < 6}, 2023)["complete"] is False
assert degree_days(temps, 2024) is None

row = {"year": 2023, "heating_gj": 600.0, "heating_cost": 300000.0, "heating_price": 500.0,
       "hot_water_gj": 400.0, "hot_water_cost": 200000.0, "hot_water_price": 500.0,
       "cold_water_billed_m3": 1000.0, "cold_water_metered_m3": 900.0,
       "hot_water_billed_m3": 800.0, "hot_water_metered_m3": 1000.0, "heated_area_m2": 2000.0,
       "degree_days_billing": 2100.0}
s = year_summary(row, {"value": 2000, "days": 365, "complete": True})
assert s["price_per_gj"] == 500.0 and s["total_cost"] == 500000.0 and s["hot_water_share"] == 0.4, s
assert s["heating_kwh_per_dd"] == round(600 * KWH_PER_GJ / 2000, 1)
assert s["hot_water_kwh_per_m3"] == round(400 * KWH_PER_GJ / 1000, 1)  # 111.1 kWh/m3
assert s["cold_water_diff"] == 0.1 and s["hot_water_diff"] == -0.25
assert s["warnings"] == [] and s["unreliable"] is False and s["corrected"] is False

# Degree days in the bill far from ours: a warning, ours are used
s = year_summary({**row, "degree_days_billing": 3000.0}, {"value": 2000, "days": 365, "complete": True})
assert s["warnings"] == [{"code": "degree_days", "billing": 3000.0, "own": 2000}] and s["degree_days"] == 2000
# Incomplete temperature year: no degree days, no per-degree-day figure
s = year_summary(row, {"value": 900, "days": 150, "complete": False})
assert s["degree_days"] is None and s["heating_kwh_per_dd"] is None

# Heating and hot water at different prices: a warning
bad = {**row, "heating_gj": 500.0, "hot_water_gj": 500.0, "heating_price": 600.0, "hot_water_price": 400.0}
s = year_summary(bad, None)
assert [w["code"] for w in s["warnings"]] == ["price_mismatch"], s["warnings"]
# An unreliable year: billed figures only, nothing derived, no warnings
s = year_summary({**bad, "unreliable": True, "degree_days_billing": 9999.0}, {"value": 2000, "days": 365, "complete": True})
assert s["unreliable"] and s["warnings"] == [] and s["heating_gj"] == 500.0 and s["total_cost"] == 500000.0
assert all(s[k] is None for k in ("price_per_gj", "heating_kwh_per_dd", "heating_kwh_per_m2", "hot_water_kwh_per_m3",
                                  "cold_water_diff", "hot_water_diff", "hot_water_share")), s

# Corrected heat: used in every figure, the bill's kept in a warning, no price warning
# (only the heating figure wrong: the hot water stays as billed)
s = year_summary({**bad, "hot_water_gj": 400.0, "corrected_heating_gj": 600.0}, {"value": 2000, "days": 365, "complete": True})
assert s["corrected"] and s["corrected_heating"] and not s["corrected_hot_water"], s
assert s["heating_gj"] == 600.0 and s["hot_water_gj"] == 400.0 and s["price_per_gj"] == 500.0, s
assert s["warnings"] == [{"code": "corrected", "part": "heating", "billed_gj": 500.0, "gj": 600.0}], s["warnings"]
assert s["hot_water_share"] == 0.4 and s["heating_kwh_per_dd"] == round(600 * KWH_PER_GJ / 2000, 1)

# The bills split the heat by a fixed share: energy per m3 of hot water is removed
years = [year_summary({**row, "year": y}, None) for y in (2022, 2023, 2024)]
assert split_info(years) == {"hot_water_share": 0.4, "fixed": True}
assert all(y["hot_water_kwh_per_m3"] is None and y["warnings"] == [] for y in years)
# A measured split varies; a year far from the usual share gets a warning
years = [year_summary({**row, "year": 2022, "hot_water_gj": 380.0}, None), year_summary({**row, "year": 2023}, None),
         year_summary({**row, "year": 2024, "hot_water_gj": 600.0}, None)]
info = split_info(years)
assert info["fixed"] is False and years[1]["hot_water_kwh_per_m3"] is not None
assert [w["code"] for w in years[2]["warnings"]] == ["split_differs"] and years[0]["warnings"] == [], years
assert split_info([year_summary({**row, "unreliable": True}, None)]) is None

# Heat meters against the bill: part of the year extrapolated by the degree days
c = meter_check(20000.0, 70000.0, 1000.0, 3500.0)
assert c["year_estimate"] == 70000 and c["ratio"] == 1.0 and c["degree_day_share"] == 0.286, c
assert meter_check(100.0, None, None, None)["ratio"] is None

print("SUCCESS: Energy year rules verified!")
