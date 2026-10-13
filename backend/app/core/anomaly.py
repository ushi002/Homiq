"""
Typical consumption of a building and unusually high consumption of a unit (a leak, a meter fault),
shared by the building overview and the unit detail.

A unit's consumption in a period is unusual when it is at least 3x the building's typical unit
(median) and at least 2x its own consumption in the same period a year earlier; without a complete
value for last year it has to be at least 5x the median (so households that always use a lot are
not flagged). Only complete values count.
Tested on real data: flags a known leak and nothing else.
"""
import statistics
from typing import Iterable, Optional

from .consumption import PeriodResult

# A median is shown (and used) only when it comes from at least this many units, so it never
# reveals a neighbour's consumption
MIN_UNITS_FOR_MEDIAN = 5
MEDIAN_FACTOR = 3
PREVIOUS_FACTOR = 2
MEDIAN_ONLY_FACTOR = 5


def typical(results: Iterable[Optional[PeriodResult]]) -> Optional[tuple]:
    """(median, number of units) over complete, non-zero values (zero is most likely an empty unit),
    or None with fewer than MIN_UNITS_FOR_MEDIAN units."""
    values = [r.value for r in results if r and r.complete and r.value and r.value > 0]
    if len(values) < MIN_UNITS_FOR_MEDIAN:
        return None
    return statistics.median(values), len(values)


def unusual(current: Optional[PeriodResult], previous: Optional[PeriodResult], median: Optional[float]) -> Optional[dict]:
    """{"median_factor", "previous_factor"} when the consumption is unusually high, else None."""
    if not (current and current.complete and current.value and median):
        return None
    median_factor = current.value / median
    last_year = previous.value if previous and previous.complete and previous.value and previous.value > 0 else None
    if last_year is None:
        if median_factor < MEDIAN_ONLY_FACTOR:
            return None
        return {"median_factor": round(median_factor, 1), "previous_factor": None}
    previous_factor = current.value / last_year
    if median_factor < MEDIAN_FACTOR or previous_factor < PREVIOUS_FACTOR:
        return None
    return {"median_factor": round(median_factor, 1), "previous_factor": round(previous_factor, 1)}
