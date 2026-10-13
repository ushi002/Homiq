# Nasazení Homiq na nový server

Postup pro čistou instalaci Homiq (backend FastAPI + frontend Next.js + nginx) přes Docker Compose.
Je psaný tak, aby ho mohl projít člověk i AI asistent krok za krokem.

## Co aplikace potřebuje

| Co | Poznámka |
|---|---|
| Linux server s Dockerem a Docker Compose v2 | `docker compose version` musí fungovat |
| Git | pro stažení repozitáře |
| InfluxDB **1.x** dostupná přes HTTP | Homiq z ní jen čte odečty měřičů (viz [Požadavky na InfluxDB](#požadavky-na-influxdb)) |
| Volný port (výchozí 80) | nginx v compose publikuje aplikaci na tento port |

Homiq **neobsahuje** InfluxDB ani HTTPS. InfluxDB běží samostatně, HTTPS se řeší reverzní proxy před Homiq
(Traefik, Caddy, nginx s certbotem…), viz [HTTPS a reverzní proxy](#https-a-reverzní-proxy).

## Architektura

```
prohlížeč ──► nginx (:80) ──┬─ /api/*  ──► backend  (FastAPI, :8000) ──► InfluxDB 1.x (jen čtení)
                            │                 │
                            │                 └─► backend/database.db (SQLite: uživatelé, domy, jednotky, měřiče)
                            └─ /*      ──► frontend (Next.js, :3000)
```

- Backend při startu sám vytvoří tabulky v SQLite, žádné migrace se při nové instalaci nespouští.
- Prefix `/api` odstraňuje nginx, backend sám o `/api` neví.
- Frontend volá `PUBLIC_URL/api`. Adresa se **zapéká při buildu**, po změně `PUBLIC_URL` je nutný rebuild.

## Instalace

### 1. Stažení kódu

```bash
sudo mkdir -p /opt/docker && sudo chown "$USER" /opt/docker
cd /opt/docker
git clone https://github.com/ushi002/Homiq.git homiq
cd homiq
```

### 2. Konfigurace `.env`

```bash
cp .env.example .env
chmod 600 .env
python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # výstup vložit do SECRET_KEY
```

Vyplnit v `.env`:

| Proměnná | Význam |
|---|---|
| `PUBLIC_URL` | adresa, na které uživatelé aplikaci otevírají, bez lomítka na konci, např. `https://homiq.example.cz` |
| `HTTP_PORT` | port na hostiteli pro nginx (výchozí `80`; za reverzní proxy klidně jiný, např. `8080`) |
| `SECRET_KEY` | náhodný řetězec pro podepisování přihlašovacích tokenů. **Povinné**, bez něj backend nenastartuje. Změna odhlásí všechny uživatele. |
| `INFLUX_HOST` | URL InfluxDB. `http://host.docker.internal:8086` = InfluxDB běžící přímo na stejném serveru. |
| `INFLUX_USER`, `INFLUX_PASSWORD` | uživatel InfluxDB s právem čtení. Když InfluxDB nemá autentizaci, nechat `INFLUX_PASSWORD` prázdné. |

### 3. Soubor databáze

Databázový soubor se do kontejneru mapuje jako soubor. **Musí existovat před prvním spuštěním**, jinak
Docker místo něj vytvoří adresář a backend spadne:

```bash
touch backend/database.db
```

### 4. Spuštění

```bash
docker compose up -d --build
docker compose ps                 # backend, frontend, nginx: Up
docker compose logs --tail 20 backend   # musí obsahovat "Application startup complete."
curl -s http://localhost:${HTTP_PORT:-80}/api/health    # {"status":"ok"}
```

### 5. Vytvoření prvního admina

```bash
docker compose exec backend python scripts/create_admin.py admin@example.cz "Jméno Příjmení"
# zeptá se na heslo (min. 8 znaků); neinteraktivně: docker compose exec -e ADMIN_PASSWORD=... backend python scripts/create_admin.py ...
```

Pak se přihlásit na `PUBLIC_URL`. Další uživatele (správce domů, vlastníky) zakládá admin v aplikaci.


### 6. Založení domu napojeného na InfluxDB

V aplikaci: **Buildings → New** a vyplnit pole InfluxDB (význam viz další kapitola).
Potom v detailu domu spustit načtení jednotek. Homiq z InfluxDB najde jednotky a jejich měřiče a založí je.

## Požadavky na InfluxDB

Homiq používá **InfluxDB 1.x HTTP API** (`/query`, InfluxQL). InfluxDB 2.x/3.x funguje jen s povoleným 1.x
kompatibilním API (DBRP mapování + uživatel v1 auth).

Každý dům má v Homiq vlastní nastavení:

| Pole domu | Význam | Příklad |
|---|---|---|
| `influx_db_name` | databáze v InfluxDB s daty domu | `svj_priklad_db` |
| `influx_unit_tag` | tag, který nese označení bytu/jednotky | `unit` |
| `influx_device_tag` | tag s výrobním číslem měřiče | `sn` |
| `influx_measurements` | seznam measurementů ve tvaru `název[jednotka,typ]`, oddělené čárkou | `sv_l[L,water_cold], tv_l[L,water_hot], teplo_kWh[kWh,heat]` |

Typy měřičů: `water_cold`, `water_hot`, `heat`, `electricity`, `other`.

Očekávaný tvar dat:

- každý measurement má field **`value`** (stav měřiče, kumulativní hodnota),
- každý bod má tag jednotky (`influx_unit_tag`) a tag výrobního čísla (`influx_device_tag`),
- **jednotky se hledají v measurementu `sv_l`** (studená voda). Ten v databázi musí existovat a obsahovat
  tag jednotky u všech bytů, jinak Homiq žádné jednotky nenajde (omezení kódu v `backend/app/core/influx_utils.py`).

Homiq počítá denní hodnoty dotazem `SELECT MAX("value") ... GROUP BY time(1d)`.

Rychlá kontrola z serveru, že data odpovídají (doplnit vlastní hodnoty):

```bash
curl -G "$INFLUX_HOST/query" -u "$INFLUX_USER:$INFLUX_PASSWORD" \
  --data-urlencode "db=<influx_db_name>" \
  --data-urlencode 'q=SHOW TAG VALUES FROM sv_l WITH KEY = "<influx_unit_tag>"'
```

## HTTPS a reverzní proxy

Compose publikuje aplikaci přes nginx na `HTTP_PORT` bez HTTPS. Pro provoz na internetu dát před ni
reverzní proxy s certifikátem a v `.env` nastavit `PUBLIC_URL=https://…`:

- **Caddy / nginx na hostiteli:** nastavit `HTTP_PORT=8080` a proxy směrovat celou doménu na `http://127.0.0.1:8080`.
- **Traefik v Dockeru:** místo publikovaného portu použít labely na službách `backend` (`PathPrefix(/api)` + middleware
  `stripprefix` pro `/api`, port 8000) a `frontend` (zbytek domény, port 3000); službu `nginx` pak není potřeba.
  Tyto labely patří do souboru `docker-compose.override.yml` vedle `docker-compose.yml` (Docker Compose ho
  načte sám, v gitu není), stejně jako připojení k síti Traefiku a vypnutí nginx (`profiles: ["disabled"]`).
  `docker-compose.yml` se tak nemění a aktualizace zůstává jen `git pull` na `main` – žádná vlastní větev.

## Aktualizace

```bash
cd /opt/docker/homiq
git pull
docker compose up -d --build
docker compose exec backend python scripts/migrate_schema.py   # doplní nové sloupce do DB, jinak nic nedělá
docker builder prune -f   # úklid starých build vrstev
```

Před aktualizací zálohovat databázi (kapitola Záloha).

## Záloha

Stav aplikace je jen v `backend/database.db` (+ `.env`). Konzistentní kopie za běhu:

```bash
docker compose exec backend python -c "import sqlite3; s=sqlite3.connect('/app/database.db'); d=sqlite3.connect('/app/backup.db'); s.backup(d); d.close()"
docker compose cp backend:/app/backup.db ./homiq_db_$(date +%F).db
docker compose exec backend rm /app/backup.db
```

Data měřičů jsou v InfluxDB a zálohují se tam.

## Řešení problémů

| Příznak | Příčina |
|---|---|
| backend restartuje, v logu `SECRET_KEY environment variable is not set` | chybí `SECRET_KEY` v `.env` |
| `docker compose` hlásí `PUBLIC_URL must be set` | chybí `PUBLIC_URL` v `.env` |
| backend padá na `unable to open database file` / `database.db` je adresář | nebyl proveden krok 3: `docker compose down`, `rmdir backend/database.db`, `touch backend/database.db`, znovu `up` |
| přihlášení funguje, ale frontend volá špatnou adresu API | `PUBLIC_URL` se změnil bez rebuildu: `docker compose up -d --build frontend` |
| načtení jednotek domu nenajde nic | špatné pole InfluxDB u domu, chybí measurement `sv_l`, nebo backend InfluxDB nevidí: `docker compose logs backend \| grep "Error querying InfluxDB"` |
| `Error querying InfluxDB: 401` | špatné `INFLUX_USER` / `INFLUX_PASSWORD` |
