"""
Add columns that the models have but the database does not (SQLModel's create_all creates new
tables, never new columns of existing ones). Safe to run repeatedly; run it after an update that
adds a column, on every instance:
  docker compose exec backend python scripts/migrate_schema.py
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, text
from sqlmodel import SQLModel
from app.core.database import engine
import app.models.property  # noqa: F401  (registers the tables)
import app.models.telemetry  # noqa: F401


def migrate():
    existing = inspect(engine)
    added = 0
    with engine.begin() as connection:
        for table in SQLModel.metadata.sorted_tables:
            if not existing.has_table(table.name):
                continue  # created by create_all at backend start
            have = {c["name"] for c in existing.get_columns(table.name)}
            for column in table.columns:
                if column.name in have:
                    continue
                sql = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column.type.compile(engine.dialect)}'
                default = column.default.arg if column.default is not None and column.default.is_scalar else None
                if default is not None:
                    sql += f" DEFAULT {int(default) if isinstance(default, bool) else repr(default)}"
                connection.execute(text(sql))
                print(f"Added {table.name}.{column.name}")
                added += 1
    print(f"Schema up to date ({added} column(s) added).")


if __name__ == "__main__":
    migrate()
