"""
Import a building's heat loss calculation into its units (area, heat loss, heated area, position
coefficient) and optionally the floor of each unit. The source data stays out of git: pass the
file path. Without --apply only prints what would change.

The xlsx (sheet TZ) has a block of rows per unit ending with a row "celkem":
  B = unit ("12/3"), D = floor area [m2], I = design heat loss [W], K = heated area [m2],
  M = position coefficient (= lowest heat loss per m2 in the building / the unit's, I/K).

  docker compose cp ztraty.xlsx backend:/tmp/ztraty.xlsx
  docker compose exec backend python scripts/import_heat_losses.py "<building name>" /tmp/ztraty.xlsx \\
      --floors "1=1-3,16;2=4-9;3=10-15" [--apply]
  docker compose exec backend rm /tmp/ztraty.xlsx

Units are matched by the numbers in unit_number (bj-a04 -> 4, np-50 -> 50). A unit made of
several flats (bj-e38bj-e39) gets their sums, and its coefficient is recomputed from the sums.
"""
import argparse
import os
import re
import statistics
import sys
import uuid
import xml.etree.ElementTree as ET
import zipfile

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.property import Building, Unit
import app.models.telemetry  # noqa: F401  (registers the tables)

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}


def read_sheet(path: str, name: str) -> list:
    """Rows of a sheet as {column letter: value} (stdlib only, openpyxl is not installed)."""
    z = zipfile.ZipFile(path)
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            strings.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS):
        if sheet.get('name') != name:
            continue
        target = rels[sheet.get('{%s}id' % NS['r'])].lstrip('/')
        target = target if target.startswith('xl/') else 'xl/' + target
        rows = []
        for row in ET.fromstring(z.read(target)).iter('{%s}row' % NS['m']):
            cells = {}
            for c in row.findall('m:c', NS):
                v = c.find('m:v', NS)
                value = v.text if v is not None else None
                if c.get('t') == 's' and value is not None:
                    value = strings[int(value)]
                if value not in (None, ''):
                    cells[re.match(r'[A-Z]+', c.get('r')).group()] = value
            rows.append(cells)
        return rows
    raise SystemExit(f"Sheet {name!r} not found in {path}")


def heat_losses(path: str) -> dict:
    """{flat number: {"area", "loss", "heated", "coef"}} from the "celkem" rows of sheet TZ."""
    flats, current = {}, None
    for cells in read_sheet(path, 'TZ'):
        if re.match(r'\d+/\d+$', cells.get('B', '')):
            current = int(cells['B'].split('/')[1])
        if 'celkem' in cells.values() and current is not None:
            flats[current] = {"area": float(cells['D']), "loss": float(cells['I']),
                              "heated": float(cells['K']), "coef": float(cells['M'])}
            current = None
    return flats


def parse_floors(spec: str) -> dict:
    """"1=1-3,16;2=4-9" -> {1: 1, 2: 1, 3: 1, 16: 1, 4: 2, ...}"""
    floors = {}
    for part in filter(None, (p.strip() for p in spec.split(';'))):
        floor, numbers = part.split('=')
        for item in numbers.split(','):
            a, _, b = item.strip().partition('-')
            for n in range(int(a), int(b or a) + 1):
                floors[n] = int(floor)
    return floors


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('building', help='building name (or id)')
    parser.add_argument('xlsx', help='path to the heat loss calculation')
    parser.add_argument('--floors', help='floor of each flat number, e.g. "1=1-3,16;2=4-9"')
    parser.add_argument('--apply', action='store_true', help='write the changes (otherwise only print them)')
    args = parser.parse_args()

    flats = heat_losses(args.xlsx)
    floors = parse_floors(args.floors) if args.floors else {}
    # The coefficient is a constant divided by the heat loss per m2 of heated area; the constant
    # (the building's lowest W/m2) is taken from the table to recompute it for joined flats
    constant = statistics.median(f["coef"] * f["loss"] / f["heated"] for f in flats.values())
    print(f"{len(flats)} flats in the table, total heat loss {sum(f['loss'] for f in flats.values()) / 1000:.1f} kW, "
          f"coefficient constant {constant:.3f} W/m2")

    with Session(engine) as session:
        building = session.exec(select(Building).where(Building.name == args.building)).first()
        if not building:
            try:
                building = session.get(Building, uuid.UUID(args.building))
            except ValueError:
                pass
        if not building:
            raise SystemExit(f"Building {args.building!r} not found")
        units = session.exec(select(Unit).where(Unit.building_id == building.id)).all()
        used = set()
        print(f"{'unit':16} {'flats':8} {'floor':>5} {'area':>7} {'heated':>7} {'loss W':>8} {'coef':>6}")
        for unit in sorted(units, key=lambda u: [int(n) for n in re.findall(r'\d+', u.unit_number)]):
            numbers = [int(n) for n in re.findall(r'\d+', unit.unit_number)]
            parts = [flats.get(n) for n in numbers]
            if not numbers or None in parts:
                print(f"{unit.unit_number:16} not in the table, skipped")
                continue
            used.update(numbers)
            area = round(sum(p["area"] for p in parts), 2)
            heated = round(sum(p["heated"] for p in parts), 2)
            loss = round(sum(p["loss"] for p in parts), 1)
            coef = parts[0]["coef"] if len(parts) == 1 else constant / (loss / heated)
            unit_floors = {floors[n] for n in numbers if n in floors}
            floor = unit_floors.pop() if len(unit_floors) == 1 else None
            print(f"{unit.unit_number:16} {'+'.join(map(str, numbers)):8} {floor if floor is not None else '-':>5} "
                  f"{area:7.2f} {heated:7.2f} {loss:8.1f} {coef:6.4f}"
                  + ("" if floor is not None or not floors else "  (floor unknown)"))
            unit.area_m2, unit.heated_area_m2, unit.heat_loss_w, unit.position_coef = area, heated, loss, round(coef, 4)
            if floor is not None:
                unit.floor = floor
            session.add(unit)
        missing = sorted(set(flats) - used)
        if missing:
            print("In the table without a unit: " + ", ".join(map(str, missing)))
        if args.apply:
            session.commit()
            print("Saved.")
        else:
            session.rollback()
            print("Nothing saved (dry run); add --apply to write.")


if __name__ == '__main__':
    main()
