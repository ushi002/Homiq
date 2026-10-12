"""
Consumption of a period from cumulative meter readings.

Same rule as frontend/src/lib/consumption.ts (the unit detail view), keep them in sync:
- The meter state at a period boundary is interpolated linearly between the nearest reading
  before and after it, so a missing reading on the 1st or a gap across the boundary does not matter.
- If the meter has no reading before the start (it started recording inside the period), the
  period starts at its first reading; if there is no reading after the end yet, it ends at the
  last one. Those days at the edges are missing; gaps in the middle are not counted.
- A value is complete when at most 3 % of the period's days are missing.
"""
import math
from dataclasses import dataclass
from typing import List, Optional, Tuple

COVERAGE_THRESHOLD = 0.97
DAY = 86400.0

# (unix timestamp, value)
Point = Tuple[float, float]


@dataclass
class MeterPeriod:
    value: float
    covered_from: float
    covered_to: float
    decimals: int


@dataclass
class PeriodResult:
    value: Optional[float]
    missing_days: float
    period_days: float

    @property
    def complete(self) -> bool:
        return self.value is not None and self.missing_days <= self.period_days * (1 - COVERAGE_THRESHOLD)


def _round(value: float, places: int) -> float:
    """Half up, exactly like Math.round in the frontend (Python's round() rounds half to even)."""
    factor = 10 ** places
    return math.floor(value * factor + 0.5) / factor


def _decimals(value: float) -> int:
    text = repr(float(value))
    return 0 if text.endswith('.0') else min(len(text.split('.')[1]), 3)


def _interpolate(a: Point, b: Point, t: float) -> float:
    if b[0] == a[0]:
        return a[1]
    return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0])


def meter_period(start: float, end: float, before: Optional[Point], first: Optional[Point],
                 last: Optional[Point], after: Optional[Point]) -> Optional[MeterPeriod]:
    """
    One meter in [start, end): `before` is its last reading before the start, `first`/`last` its
    first and last reading inside the period, `after` its first reading at or after the end.
    Returns None when the meter has no data for the period.
    """
    if first is None and not (before and after):
        return None
    if before:
        start_value = _interpolate(before, first or after, start)
        covered_from = start
    else:
        start_value, covered_from = first[1], first[0]
    if after:
        end_value = _interpolate(last or before, after, end)
        covered_to = end
    else:
        end_value, covered_to = last[1], last[0]
    decimals = max(_decimals(p[1]) for p in (before, first, last, after) if p)
    return MeterPeriod(end_value - start_value, covered_from, covered_to, decimals)


def combine_meters(start: float, end: float, meters: List[Optional[MeterPeriod]]) -> PeriodResult:
    """
    Meters of one type in a unit, e.g. an old and a new meter after a replacement. The unit is
    covered from the earliest start to the latest end of its meters; a gap between them is in
    the middle of the period and is not counted as missing.
    """
    period_days = (end - start) / DAY
    known = [m for m in meters if m]
    if not known:
        return PeriodResult(None, period_days, period_days)
    covered_from = min(m.covered_from for m in known)
    covered_to = max(m.covered_to for m in known)
    value = _round(sum(m.value for m in known), max(m.decimals for m in known))
    missing = ((covered_from - start) + (end - covered_to)) / DAY
    return PeriodResult(value, _round(missing, 1), _round(period_days, 1))
