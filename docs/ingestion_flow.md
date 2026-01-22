# 📡 Tok dat (Data Ingestion Flow)

Tento dokument popisuje, jak se data z fyzických měřičů dostávají do databáze Homiq. Cílem je mít modulární systém, který zvládne jak moderní dálkové odečty, tak manuální zadávání.

## 1. Architektura toku dat



1. **Senzory/Měřiče:** (LoRaWAN, NB-IoT, M-Bus, WiFi)
2. **Brána (Gateway):** Přijímá signály a posílá je dál přes internet.
3. **Ingestion API / Broker:** Vstupní brána do našeho systému.
4. **Processing Layer:** Validace dat, aplikace koeficientů a uložení.

---

## 2. Podporované metody příjmu

### A. Automatické (Push přes API/MQTT)
Ideální pro moderní sítě (LoRaWAN/NB-IoT).
* **Endpoint:** `POST /api/v1/telemetry/report`
* **Formát:** JSON
```json
{
  "serial_number": "WAT-123456",
  "timestamp": "2024-05-20T10:00:00Z",
  "value": 124.52,
  "unit": "m3"
}
