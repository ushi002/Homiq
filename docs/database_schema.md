# 🗄️ Databázové schéma Homiq (v0.1)

> **Původní návrh (v0.1).** Skutečný stav: SQLite (`backend/database.db`) s domy, jednotkami, měřiči
> a uživateli; odečty se do databáze neukládají, čtou se živě z InfluxDB (viz `DEPLOY.md`).

Tento dokument definuje základní datovou strukturu systému Homiq. Jako primární databázi používáme **PostgreSQL** (s rozšířením **TimescaleDB** pro ukládání časových řad odečtů).

---

## 1. Modul: Nemovitosti a Lidé
Základní entity definující strukturu domu a vlastnické vztahy.

### `buildings` (Domy)
| Sloupec | Typ | Popis |
| :--- | :--- | :--- |
| `id` | UUID | Primární klíč |
| `name` | String | Název objektu (např. SVJ Slunečná 12) |
| `address` | String | Úplná adresa pro potřeby vyúčtování |
| `description` | Text | Volitelná poznámka |

### `units` (Bytové jednotky)
| Sloupec | Typ | Popis |
| :--- | :--- | :--- |
| `id` | UUID | Primární klíč |
| `building_id` | UUID | Cizí klíč (vazba na dům) |
| `unit_number` | String | Číslo bytu/jednotky |
| `floor` | Integer | Patro |
| `area_m2` | Decimal | Výměra bytu pro rozpočítání nákladů |

### `users` (Uživatelé)
| Sloupec | Typ | Popis |
| :--- | :--- | :--- |
| `id` | UUID | Primární klíč |
| `email` | String | Unikátní email (login) |
| `full_name` | String | Jméno a příjmení |
| `role` | Enum | `admin`, `owner`, `board_member` |

---

## 2. Modul: Telemetrie a Měření
Správa hardwaru a historických dat ze senzorů.

### `meters` (Měřiče)
| Sloupec | Typ | Popis |
| :--- | :--- | :--- |
| `id` | UUID | Primární klíč |
| `unit_id` | UUID | Cizí klíč (přiřazení k bytu) |
| `serial_number` | String | Výrobní číslo měřiče |
| `type` | Enum | `water_cold`, `water_hot`, `heat`, `electricity` |
| `unit_of_measure` | String | Jednotka (m3, kWh, atd.) |

### `meter_readings` (Odečty - Hypertable)
| Sloupec | Typ | Popis |
| :--- | :--- | :--- |
| `time` | Timestamp | Čas odečtu (Primární klíč pro TimescaleDB) |
| `meter_id` | UUID | Cizí klíč k měřiči |
| `value` | Decimal | Naměřená hodnota |
| `is_manual` | Boolean | Příznak, zda byl odečet zadán ručně |

---

## 3. Modul: Vyúčtování a Logika
Parametry pro výpočetní engine.

### `coefficients` (Koeficienty)
| Sloupec | Typ | Popis |
| :--- | :--- | :--- |
| `id` | UUID | Primární klíč |
| `target_id` | UUID | ID bytu nebo měřiče, ke kterému se váže |
| `value` | Decimal | Hod
