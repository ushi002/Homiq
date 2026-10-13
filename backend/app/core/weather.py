"""
Daily mean outdoor temperature for the energy overview, from Open-Meteo (free, no key). Days are
UTC days, like the daily meter values. Settled days are stored in the table daily_temperatures and
never fetched again; the last days come from the forecast API (the archive lags a few days) and
are not stored, they may still be corrected.
"""
import logging
from datetime import date, timedelta
from typing import Dict, Optional

import requests
from sqlmodel import Session, select

from ..models.telemetry import DailyTemperature

log = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
SETTLED_AFTER = timedelta(days=7)  # the archive has a day for good about a week later


def _fetch(url: str, lat: float, lon: float, extra: dict) -> Optional[Dict[date, float]]:
    try:
        r = requests.get(url, params={"latitude": lat, "longitude": lon, "daily": "temperature_2m_mean",
                                      "timezone": "UTC", **extra}, timeout=20)
        r.raise_for_status()
        daily = r.json().get("daily", {})
        return {date.fromisoformat(d): t for d, t in zip(daily.get("time", []), daily.get("temperature_2m_mean", []))
                if t is not None}
    except Exception as e:  # network, quota: the overview shows consumption without temperature
        log.warning("Open-Meteo request failed: %s", e)
        return None


def daily_temperatures(session: Session, latitude: float, longitude: float, start: date, end: date) -> Dict[date, float]:
    """{day: mean °C} for start <= day < end; days Open-Meteo does not know are left out."""
    lat, lon = round(latitude, 2), round(longitude, 2)
    today = date.today()
    end = min(end, today)
    if start >= end:
        return {}
    stored = {row.day: row.mean_c for row in session.exec(
        select(DailyTemperature).where(DailyTemperature.latitude == lat, DailyTemperature.longitude == lon,
                                       DailyTemperature.day >= start, DailyTemperature.day < end))}
    days = [start + timedelta(days=i) for i in range((end - start).days)]
    settled_until = today - SETTLED_AFTER
    missing = [d for d in days if d not in stored and d < settled_until]
    if missing:
        fetched = _fetch(ARCHIVE_URL, lat, lon, {"start_date": missing[0].isoformat(), "end_date": missing[-1].isoformat()})
        for d, t in (fetched or {}).items():
            if d in missing:
                stored[d] = t
                session.add(DailyTemperature(latitude=lat, longitude=lon, day=d, mean_c=t))
        session.commit()
    recent = [d for d in days if d not in stored and d >= settled_until]
    if recent:
        fetched = _fetch(FORECAST_URL, lat, lon, {"past_days": (today - recent[0]).days + 1, "forecast_days": 1})
        stored.update({d: t for d, t in (fetched or {}).items() if d in recent})
    return stored
