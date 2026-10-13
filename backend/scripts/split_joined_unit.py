"""
Split a unit that stands for several joined flats into one unit per flat: the flats' units are
created when missing, the joined unit's meters are moved (each to the given flat, the rest to the
first flat), the owner is copied to the flats without one, and the joined unit is deleted.
Real serial numbers are passed as parameters, not kept in git. Without --apply only prints what
would change. Run the unit sync afterwards; it then keeps the meters where they were put.

  docker compose exec backend python scripts/split_joined_unit.py "<building name>" bj-e38bj-e39 \\
      --into bj-e38 bj-e39 --meter SERIAL=bj-e39 --meter SERIAL2=bj-e39 [--apply]
"""
import argparse
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.property import Building, Unit
from app.models.telemetry import Meter


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('building', help='building name (or id)')
    parser.add_argument('joined', help='unit_number of the joined unit')
    parser.add_argument('--into', nargs='+', required=True, help='unit_numbers of the flats, the first gets the unassigned meters')
    parser.add_argument('--meter', action='append', default=[], metavar='SERIAL=UNIT', help='put a meter into a flat')
    parser.add_argument('--apply', action='store_true', help='write the changes (otherwise only print them)')
    args = parser.parse_args()
    targets = dict(m.split('=', 1) for m in args.meter)
    if not set(targets.values()) <= set(args.into):
        raise SystemExit("--meter must name one of the --into units")

    with Session(engine) as session:
        building = session.exec(select(Building).where(Building.name == args.building)).first()
        if not building:
            try:
                building = session.get(Building, uuid.UUID(args.building))
            except ValueError:
                pass
        if not building:
            raise SystemExit(f"Building {args.building!r} not found")
        units = {u.unit_number: u for u in session.exec(select(Unit).where(Unit.building_id == building.id)).all()}
        joined = units.get(args.joined)
        if not joined:
            raise SystemExit(f"Unit {args.joined!r} not found")

        flats = {}
        for name in args.into:
            flat = units.get(name)
            if not flat:
                flat = Unit(unit_number=name, floor=joined.floor, area_m2=0.0, building_id=building.id)
                session.add(flat)
                session.flush()
                print(f"create unit {name}")
            if flat.owner_id is None and joined.owner_id is not None:
                flat.owner_id = joined.owner_id
                session.add(flat)
                print(f"{name}: owner of {args.joined}")
            flats[name] = flat

        meters = session.exec(select(Meter).where(Meter.unit_id == joined.id)).all()
        unknown = set(targets) - {m.serial_number for m in meters}
        if unknown:
            # also accept meters already moved to one of the flats (repeated run)
            unknown -= {m.serial_number for m in session.exec(select(Meter).where(Meter.unit_id.in_([f.id for f in flats.values()]))).all()}
        if unknown:
            raise SystemExit("Not meters of the joined unit or its flats: " + ", ".join(sorted(unknown)))
        for meter in meters:
            target = targets.get(meter.serial_number, args.into[0])
            meter.unit_id = flats[target].id
            session.add(meter)
            print(f"meter {meter.type:10} {meter.serial_number} -> {target}")
        for serial, target in targets.items():
            meter = session.exec(select(Meter).where(Meter.serial_number == serial)).first()
            if meter and meter.unit_id != flats[target].id:
                meter.unit_id = flats[target].id
                session.add(meter)
                print(f"meter {meter.type:10} {serial} -> {target}")

        session.flush()
        session.delete(joined)
        print(f"delete unit {args.joined}")
        if args.apply:
            session.commit()
            print("Saved.")
        else:
            session.rollback()
            print("Nothing saved (dry run); add --apply to write.")


if __name__ == '__main__':
    main()
