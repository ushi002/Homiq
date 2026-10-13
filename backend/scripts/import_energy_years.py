"""
Import a building's yearly energy bills (heating cost allocation) from a JSON file into
building_energy_years. The data stays out of git: pass the file path. Without --apply only prints
what would change. Existing years are replaced.

  docker compose cp bilance.json backend:/tmp/bilance.json
  docker compose exec backend python scripts/import_energy_years.py "<building name>" /tmp/bilance.json [--apply]
  docker compose exec backend rm /tmp/bilance.json

JSON: {"roky": [{"rok": 2024,
  "vytapeni": {"teplo_GJ", "naklady_Kc", "cena_Kc_GJ", "zakladni_slozka_pct", "dilky"},
  "teple_voda_ohrev": {"teplo_GJ", "naklady_Kc", "cena_Kc_GJ"},
  "voda": {"sv_fakturovano_m3", "sv_namereno_m3", "tv_fakturovano_m3", "tv_namereno_m3", "cena_Kc_m3"},
  "zapocitatelna_plocha_vytapeni_m2", "plocha_tv_m2", "prumerny_pocet_osob", "denostupne",
  "upozorneni" (optional note), "nespolehlivy" (optional, true = left out of comparisons),
  "odhad_opravy": {"vytapeni_teplo_GJ", "tv_teplo_GJ"} (optional: heat used instead of the bill's)}]}
"""
import argparse
import json
import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select
from app.core.database import engine
from app.models.property import Building, BuildingEnergyYear
import app.models.telemetry  # noqa: F401  (registers the tables)


def to_row(building_id, y: dict) -> BuildingEnergyYear:
    heating, hot, water, fix = y.get("vytapeni", {}), y.get("teple_voda_ohrev", {}), y.get("voda", {}), y.get("odhad_opravy", {})
    return BuildingEnergyYear(
        building_id=building_id, year=int(y["rok"]),
        heating_gj=heating.get("teplo_GJ"), heating_cost=heating.get("naklady_Kc"), heating_price=heating.get("cena_Kc_GJ"),
        base_share_pct=heating.get("zakladni_slozka_pct"), heating_units=heating.get("dilky"),
        hot_water_gj=hot.get("teplo_GJ"), hot_water_cost=hot.get("naklady_Kc"), hot_water_price=hot.get("cena_Kc_GJ"),
        cold_water_billed_m3=water.get("sv_fakturovano_m3"), cold_water_metered_m3=water.get("sv_namereno_m3"),
        hot_water_billed_m3=water.get("tv_fakturovano_m3"), hot_water_metered_m3=water.get("tv_namereno_m3"),
        water_price=water.get("cena_Kc_m3"),
        heated_area_m2=y.get("zapocitatelna_plocha_vytapeni_m2"), hot_water_area_m2=y.get("plocha_tv_m2"),
        persons=y.get("prumerny_pocet_osob"), degree_days_billing=y.get("denostupne"),
        # a correction only where it differs from the bill
        corrected_heating_gj=fix.get("vytapeni_teplo_GJ") if fix.get("vytapeni_teplo_GJ") != heating.get("teplo_GJ") else None,
        corrected_hot_water_gj=fix.get("tv_teplo_GJ") if fix.get("tv_teplo_GJ") != hot.get("teplo_GJ") else None,
        unreliable=bool(y.get("nespolehlivy")), note=y.get("upozorneni"),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('building', help='building name (or id)')
    parser.add_argument('json', help='path to the yearly bills')
    parser.add_argument('--apply', action='store_true', help='write the changes (otherwise only print them)')
    args = parser.parse_args()
    years = json.load(open(args.json, encoding='utf-8'))["roky"]

    with Session(engine) as session:
        building = session.exec(select(Building).where(Building.name == args.building)).first()
        if not building:
            try:
                building = session.get(Building, uuid.UUID(args.building))
            except ValueError:
                pass
        if not building:
            raise SystemExit(f"Building {args.building!r} not found")
        for y in years:
            row = to_row(building.id, y)
            existing = session.get(BuildingEnergyYear, (building.id, row.year))
            print(f"{row.year}: heating {row.heating_gj} GJ, hot water {row.hot_water_gj} GJ, "
                  f"{(row.heating_cost or 0) + (row.hot_water_cost or 0):.0f} CZK"
                  + (", unreliable" if row.unreliable else "")
                  + (f", corrected to {row.corrected_heating_gj} / {row.corrected_hot_water_gj} GJ" if row.corrected_heating_gj is not None else "")
                  + (" (replaces the stored year)" if existing else ""))
            session.merge(row)
        if args.apply:
            session.commit()
            print("Saved.")
        else:
            session.rollback()
            print("Nothing saved (dry run); add --apply to write.")


if __name__ == '__main__':
    main()
