homiq/
├── docs/                 # Detailní dokumentace, schémata, legislativní rešerše
├── backend/              # Python (FastAPI) aplikace
│   ├── app/
│   │   ├── api/          # Endpointy (domy, byty, měřiče, vyúčtování)
│   │   ├── core/         # Konfigurace, zabezpečení, databázové připojení
│   │   ├── models/       # Definice databázových tabulek (SQLAlchemy/SQLModel)
│   │   ├── schemas/      # Pydantic modely pro validaci dat
│   │   ├── services/     # BUSINESS LOGIKA (zde budou ty výpočetní vzorce)
│   │   └── main.py       # Vstupní bod aplikace
│   ├── tests/            # Automatizované testy (zejména pro výpočty)
│   └── requirements.txt  # Seznam Python knihoven
├── frontend/             # Next.js / React aplikace
│   ├── components/       # Znovupoužitelné UI prvky (grafy, tabulky)
│   ├── pages/            # Jednotlivé obrazovky (Admin, Vlastník)
│   └── public/           # Statické soubory (loga, ikony)
├── docker/               # Dockerfile a docker-compose pro snadné spuštění
├── scripts/              # Pomocné skripty (např. pro migraci dat z CSV)
├── .gitignore            # Soubory, které se nemají nahrávat (hesla, venv)
├── README.md             # Hlavní vizitka projektu
└── CONTRIBUTING.md       # Návod pro přispěvatele
