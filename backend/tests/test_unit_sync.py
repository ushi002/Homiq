"""
Joined unit tags (app/core/unit_sync.py), no database or InfluxDB needed:
  docker compose exec -T backend sh -c "PYTHONPATH=/app python /app/tests/test_unit_sync.py"
"""
from app.core.unit_sync import split_joined

tags = {"bj-e3", "bj-e38", "bj-e39", "bj-e38bj-e39", "bj-e40", "np-50"}
assert split_joined("bj-e38bj-e39", tags) == ["bj-e38", "bj-e39"]
assert split_joined("bj-e38", tags) is None        # a flat, not a join
assert split_joined("bj-e40", tags) is None
assert split_joined("bj-e38bj-e41", tags) is None  # bj-e41 is not a tag
assert split_joined("np-50np-50", tags) == ["np-50", "np-50"]
print("SUCCESS: Unit sync rules verified!")
