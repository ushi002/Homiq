"""
Energy overview of a building (heat), for admins and the building's manager:
- daily heat consumption of the whole building, from the daily maxima of the heat meters;
- energy signature: daily consumption against the outdoor temperature, a line fitted through the
  heating days, compared with the design heat loss of the building;
- units compared with their share of the design heat loss, and their consumption corrected by
  the position coefficient (an estimate for the heating bill).
Pure calculations here, InfluxDB and the weather are read in api/buildings.py.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

# Design temperatures of the heat loss calculation (indoor, outdoor) [°C]
DESIGN_INDOOR_C = 20.0
DESIGN_OUTDOOR_C = -12.0
# Days for the signature: heating days with data from almost all meters. The heating season runs
# from the first to the last day with at least HEATING_SHARE of the highest daily consumption;
# days outside it and days without consumption (heating off) are left out.
HEATING_BELOW_C = 15.0
HEATING_SHARE = 0.1
DAY_COMPLETE_SHARE = 0.9
MIN_SIGNATURE_DAYS = 10
# A unit's consumption against its expected share: at least HIGH or at most LOW times is highlighted
HIGH_RATIO = 2.0
LOW_RATIO = 0.25


def meter_daily(points: List[Tuple[date, float]], start: date, end: date) -> Dict[date, float]:
    """Consumption by day (start <= day < end) of one cumulative meter from its daily maxima (the
    reading at the end of each day). The consumption between two readings further apart is spread
    evenly over the days in between; a drop (meter replaced or reset) is left out."""
    out: Dict[date, float] = {}
    points = sorted(points)
    for (d0, v0), (d1, v1) in zip(points, points[1:]):
        days = (d1 - d0).days
        if v1 < v0 or days <= 0:
            continue
        per_day = (v1 - v0) / days
        for k in range(1, days + 1):
            day = d0 + timedelta(days=k)
            if start <= day < end:
                out[day] = per_day
    return out


def building_daily(meters: Dict[str, Dict[date, float]], temperatures: Dict[date, float],
                   start: date, end: date) -> List[dict]:
    """Per day: the building's consumption (sum of the meters with data that day), whether at least
    DAY_COMPLETE_SHARE of the meters had data (complete; only meters with some data in the period
    count, a meter silent for the whole period does not make every day incomplete) and the
    outdoor temperature."""
    days = []
    for i in range((end - start).days):
        day = start + timedelta(days=i)
        values = [m[day] for m in meters.values() if day in m]
        days.append({
            "date": day.isoformat(),
            "kwh": round(sum(values), 1) if values else None,
            "complete": bool(meters) and len(values) >= DAY_COMPLETE_SHARE * len(meters),
            "temp": temperatures.get(day),
        })
    return days


def signature(days: List[dict]) -> Optional[dict]:
    """Line kWh/day = intercept + slope x temperature through the complete heating days (least
    squares). kw_per_k is the building's heat loss coefficient it implies, balance_temp_c the
    outdoor temperature at which heating stops. None without enough days."""
    usable = [d for d in days if d["complete"] and d["temp"] is not None and d["kwh"] is not None]
    if not usable:
        return None
    threshold = HEATING_SHARE * max(d["kwh"] for d in usable)
    heating = [d["date"] for d in usable if d["kwh"] >= threshold]
    pts = [(d["temp"], d["kwh"]) for d in usable
           if heating and heating[0] <= d["date"] <= heating[-1] and d["kwh"] > 0 and d["temp"] < HEATING_BELOW_C]
    if len(pts) < MIN_SIGNATURE_DAYS:
        return None
    n = len(pts)
    mx = sum(t for t, _ in pts) / n
    my = sum(k for _, k in pts) / n
    sxx = sum((t - mx) ** 2 for t, _ in pts)
    if sxx == 0:
        return None
    slope = sum((t - mx) * (k - my) for t, k in pts) / sxx
    if slope >= 0:
        return None
    intercept = my - slope * mx
    ss_tot = sum((k - my) ** 2 for _, k in pts)
    ss_res = sum((k - (intercept + slope * t)) ** 2 for t, k in pts)
    return {
        "days": n,
        "from": heating[0],
        "to": heating[-1],
        "slope": round(slope, 2),
        "intercept": round(intercept, 1),
        "kw_per_k": round(-slope / 24, 3),
        "balance_temp_c": round(-intercept / slope, 1),
        "r2": round(1 - ss_res / ss_tot, 3) if ss_tot else None,
    }


def design_kw_per_k(heat_losses_w: List[float]) -> Optional[float]:
    """Heat loss coefficient of the building by the calculation: total design loss / design ΔT."""
    total = sum(heat_losses_w)
    return round(total / (DESIGN_INDOOR_C - DESIGN_OUTDOOR_C) / 1000, 3) if total else None


def compare_units(units: List[dict]) -> List[dict]:
    """units: {..., "kwh", "complete", "heat_loss_w", "position_coef", "area_m2"}. Adds:
    expected_kwh = the building's consumption x the unit's share of the design heat loss (units with
    a complete value only), ratio and flag ("high"/"low"), kwh_per_m2, and corrected_kwh = kwh x
    position coefficient with billing_share = its share of all corrected consumption."""
    basis = [u for u in units if u["complete"] and u["kwh"] is not None and u.get("heat_loss_w")]
    in_basis = {id(u) for u in basis}
    total_kwh = sum(u["kwh"] for u in basis)
    total_loss = sum(u["heat_loss_w"] for u in basis)
    corrected = {id(u): u["kwh"] * u["position_coef"] for u in units
                 if u["kwh"] is not None and u.get("position_coef")}
    total_corrected = sum(corrected.values())
    out = []
    for u in units:
        expected = total_kwh * u["heat_loss_w"] / total_loss if id(u) in in_basis and total_loss else None
        ratio = u["kwh"] / expected if expected else None
        c = corrected.get(id(u))
        out.append({
            **u,
            "kwh_per_m2": round(u["kwh"] / u["area_m2"], 2) if u["kwh"] is not None and u.get("area_m2") else None,
            "expected_kwh": round(expected, 1) if expected is not None else None,
            "ratio": round(ratio, 2) if ratio is not None else None,
            "flag": "high" if ratio is not None and ratio >= HIGH_RATIO else "low" if ratio is not None and ratio <= LOW_RATIO else None,
            "corrected_kwh": round(c, 1) if c is not None else None,
            "billing_share": round(c / total_corrected, 4) if c is not None and total_corrected else None,
        })
    return out
