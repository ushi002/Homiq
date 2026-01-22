# Homiq 🏠

**Otevřená platforma pro transparentní správu energií, odečtů a vyúčtování v bytových domech.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 O projektu

**Homiq** vzniká jako reakce na uzavřenost a vysokou cenu komerčních systémů pro rozúčtování tepla a vody. Naším cílem je poskytnout společenstvím vlastníků (SVJ) a bytovým družstvům nástroj, který jim vrátí kontrolu nad jejich daty, umožní vlastníkům sledovat spotřebu v reálném čase a automatizuje proces vyúčtování.

### Hlavní přínosy:
* **Transparentnost:** Každý vlastník vidí, jak se dospělo k jeho částce.
* **Nezávislost:** Data patří vám, nikoliv rozúčtovací firmě.
* **Efektivita:** Automatický příjem dat z moderních měřičů (LoRaWAN, NB-IoT, M-Bus).

---

## 🛠️ Klíčové funkce (Vize)

Platforma je rozdělena do tří hlavních modulů:

### 1. Administrační portál
* Import a správa bytových jednotek a vlastníků.
* Evidence měřičů a senzorů (voda, teplo, plyn, elektřina).
* Nastavení bytových a polohových koeficientů.

### 2. Výpočetní Engine
* Implementace výpočetních logik dle platné legislativy (např. vyhláška č. 269/2015 Sb.).
* Možnost definovat vlastní pravidla pro rozúčtování společných prostor a nákladů.
* Generování PDF vyúčtování k určenému datu.

### 3. Klientská zóna (Portál vlastníka)
* Přehledné grafy spotřeby v čase.
* Porovnání spotřeby s průměrem domu (anonymizovaně).
* Historie vyúčtování ke stažení.

---

## 🏗️ Technická architektura

Projekt stavíme na moderních a udržitelných technologiích:
* **Backend:** Python (FastAPI) – pro precizní matematické výpočty.
* **Databáze:** PostgreSQL s TimescaleDB – optimalizováno pro časové řady z měřičů.
* **Frontend:** React / Next.js – responzivní rozhraní pro desktop i mobil.
* **Integrace:** Podpora MQTT pro IoT brány a CSV/XLSX pro manuální importy.

---

## 📈 Roadmapa

- [ ] **Fáze 1:** Návrh datového modelu a základní API pro správu domů/bytů.
- [ ] **Fáze 2:** Modul pro import historických odečtů a základní vizualizaci.
- [ ] **Fáze 3:** Implementace výpočetních vzorců a generování PDF.
- [ ] **Fáze 4:** Integrace s IoT sítěmi pro automatický sběr dat.

---

## 🤝 Zapojte se!

Homiq je na samém začátku a hledáme nadšence, kteří nám pomohou:
* **Programátoři:** Pomozte nám s architekturou a logikou výpočtů.
* **Doménoví experti:** Rozumíte rozúčtování tepla a legislativě? Potřebujeme vaše rady!
* **Testeři:** Máte přístup k datům z měřičů? Pomozte nám systém vyladit.

Pokud máte zájem přispět, podívejte se do sekce [CONTRIBUTING.md](CONTRIBUTING.md) nebo otevřete nové **Issue**.

---

## 📜 Licence

Tento projekt je šířen pod licencí **MIT**. To znamená, že jej můžete volně používat, upravovat i šířit, a to i pro komerční účely, pokud zachováte informaci o autorech.

---
*Vytvořeno s vizí pro férové sousedské soužití.*
