"""
Yearly energy balance of a building from its heating bills (BuildingEnergyYear), for the energy
overview: heat for heating and hot water, prices, heating against the heating degree days (own,
from the outdoor temperature; the bill's figure is shown only for information), energy per m3 of
hot water against the theoretical heating, water billed against metered, and a check of the
bill's meter units against the heat meters. Pure calculations; data are read in api/buildings.py.
"""
from datetime import date
from typing import Dict, Optional

KWH_PER_GJ = 1000 / 3.6
# Heating degree days: Σ(DD_INDOOR_C − t) over the days with a mean temperature below DD_LIMIT_C
DD_INDOOR_C = 20.0
DD_LIMIT_C = 13.0
DD_MIN_DAYS = 360  # a year counts only with (almost) every day's temperature
# Heating 1 m3 of water from 10 to 55 °C: 1.163 kWh/(m3·K) × 45 K
HOT_WATER_THEORY_KWH_M3 = round(1.163 * 45, 1)
# Differences worth a warning
PRICE_MISMATCH = 0.02  # heating and hot water at a different price per GJ
DEGREE_DAYS_MISMATCH = 0.15  # the bill's degree days against our own


def degree_days(temperatures: Dict[date, float], year: int) -> Optional[dict]:
    """Heating degree days of a calendar year from daily mean temperatures, None without data."""
    days = {d: t for d, t in temperatures.items() if d.year == year}
    if not days:
        return None
    value = sum(DD_INDOOR_C - t for t in days.values() if t < DD_LIMIT_C)
    return {"value": round(value), "days": len(days), "complete": len(days) >= DD_MIN_DAYS}


def year_summary(row: dict, dd: Optional[dict]) -> dict:
    """Derived figures of one year. row: the BuildingEnergyYear fields. When the bill is evidently
    wrong and an estimate is stored (est_*), the figures are computed from the estimate."""
    warnings = []
    heating_gj, hot_gj = row.get("heating_gj"), row.get("hot_water_gj")
    estimated = row.get("est_heating_gj") is not None or row.get("est_hot_water_gj") is not None
    if heating_gj is not None and hot_gj is not None and heating_gj == hot_gj:
        warnings.append({"code": "same_gj"})
    prices = [p for p in (row.get("heating_price"), row.get("hot_water_price")) if p]
    if len(prices) == 2 and abs(prices[0] - prices[1]) > PRICE_MISMATCH * max(prices):
        warnings.append({"code": "price_mismatch", "heating": prices[0], "hot_water": prices[1]})
    if estimated:
        heating_gj = row.get("est_heating_gj", heating_gj) or heating_gj
        hot_gj = row.get("est_hot_water_gj", hot_gj) or hot_gj
    costs = [c for c in (row.get("heating_cost"), row.get("hot_water_cost")) if c is not None]
    total_cost = sum(costs) if costs else None
    total_gj = (heating_gj or 0) + (hot_gj or 0) or None
    price = row.get("est_price") if estimated and row.get("est_price") else (
        round(total_cost / total_gj, 2) if total_cost and total_gj else None)

    own_dd = dd["value"] if dd and dd["complete"] else None
    billing_dd = row.get("degree_days_billing")
    if own_dd and billing_dd and abs(billing_dd - own_dd) > DEGREE_DAYS_MISMATCH * own_dd:
        warnings.append({"code": "degree_days", "billing": billing_dd, "own": own_dd})

    heating_kwh = heating_gj * KWH_PER_GJ if heating_gj else None
    hot_kwh = hot_gj * KWH_PER_GJ if hot_gj else None
    hot_m3 = row.get("hot_water_metered_m3")
    hot_kwh_m3 = hot_kwh / hot_m3 if hot_kwh and hot_m3 else None

    def diff(billed, metered):
        return round((billed - metered) / billed, 3) if billed and metered is not None else None

    return {
        "year": row["year"],
        "estimated": estimated,
        "heating_gj": heating_gj,
        "hot_water_gj": hot_gj,
        "heating_cost": row.get("heating_cost"),
        "hot_water_cost": row.get("hot_water_cost"),
        "total_cost": round(total_cost, 2) if total_cost is not None else None,
        "price_per_gj": price,
        "hot_water_share": round(hot_gj / total_gj, 3) if hot_gj and total_gj else None,
        "degree_days": own_dd,
        "degree_days_days": dd["days"] if dd else 0,
        "degree_days_billing": billing_dd,
        "heating_kwh_per_dd": round(heating_kwh / own_dd, 1) if heating_kwh and own_dd else None,
        "heating_kwh_per_m2": round(heating_kwh / row["heated_area_m2"], 1) if heating_kwh and row.get("heated_area_m2") else None,
        "hot_water_kwh_per_m3": round(hot_kwh_m3, 1) if hot_kwh_m3 else None,
        # Part of the hot water energy beyond heating the water (circulation and storage losses)
        "hot_water_losses": round(1 - HOT_WATER_THEORY_KWH_M3 / hot_kwh_m3, 3) if hot_kwh_m3 and hot_kwh_m3 > HOT_WATER_THEORY_KWH_M3 else None,
        "cold_water_diff": diff(row.get("cold_water_billed_m3"), row.get("cold_water_metered_m3")),
        "hot_water_diff": diff(row.get("hot_water_billed_m3"), row.get("hot_water_metered_m3")),
        "hot_water_metered_m3": hot_m3,
        "water_price": row.get("water_price"),
        "heating_units": row.get("heating_units"),
        "base_share_pct": row.get("base_share_pct"),
        "persons": row.get("persons"),
        "note": row.get("note"),
        "warnings": warnings,
    }


def meter_check(measured_units: float, billed_units: Optional[float], dd_period: Optional[float],
                dd_year: Optional[float]) -> dict:
    """The heat meters' kWh × coefficient over the period with data against the bill's units for
    the whole year. With part of the year only, the year is extrapolated by the degree days."""
    share = dd_period / dd_year if dd_period and dd_year else None
    year_estimate = measured_units / share if share else None
    return {
        "measured_units": round(measured_units),
        "billed_units": billed_units,
        "degree_day_share": round(share, 3) if share is not None else None,
        "year_estimate": round(year_estimate) if year_estimate is not None else None,
        "ratio": round(year_estimate / billed_units, 3) if year_estimate and billed_units else None,
    }
