# Battery Dashboard

Lovelace-Karte `custom:pack-card` für einen Hausspeicher aus sechs JK-BMS-Packs in zwei Stacks, deren Daten über ESPHome (`syssi/esphome-jk-bms`) und Victron (`victron_mqtt`) in Home Assistant liegen. Die Entitäten werden aus der Packnummer abgeleitet (`pv_pack_<n>_…`, Stack `⌈n ÷ 3⌉`); konfiguriert werden nur Packs und Stacks.

Die Karte ist auf eine bestimmte Installation zugeschnitten und kein allgemeines Produkt.

## Installation

HACS → Menü → Custom repositories → `https://github.com/juniormajor/battery-dashboard`, Kategorie Dashboard, danach installieren. HACS legt die Ressource `/hacsfiles/battery-dashboard/battery-dashboard.js` selbst an (Dashboards im Storage-Modus).

## Konfiguration

```yaml
type: custom:pack-card
view: speicher        # speicher | pack | zellen
packs: [1, 2, 3, 4, 5, 6]
stacks:
  - stack: 1
    name: Stack 1
  - stack: 2
    name: Stack 2
```

Klickziele (optional): `pack_path` ist die Packansicht (Standard `pack`), `zellen_path` die Zellanalyse (Standard `zellen`), `speicher_path` das Ziel des Rücklinks der Packansicht (Standard `speicher`), jeweils relativ zum aktuellen Dashboard (`/<dashboard-url>/pack`) oder absolut ab `/`. Ein Klick auf „Pack n“ setzt vorher `input_select.zellen_pack` auf `Pack_<n>`.

```yaml
pack_path: pack
zellen_path: zellen
speicher_path: speicher
```

Die Ansicht `pack` zeigt das Pack aus `input_select.zellen_pack` (`Pack_<n>`); fehlt der Helfer oder ist der Wert kein konfiguriertes Pack, das erste Pack aus `packs`. Vor- und Zurückblättern setzt nur den Helfer. Laden, Entladen und Bluetooth schalten mit einfachem Tippen ein, aber nur nach einer Sekunde Halten aus; Notbetrieb und BMS-Neustart verlangen in beide Richtungen eine Sekunde Halten. Liefert ein Pack seit über 180 s keine Daten, sind Laden, Entladen, Balancer, Float, Notbetrieb und BMS-Neustart gesperrt, weil der Befehl das BMS nicht erreicht; Bluetooth bleibt bedienbar. Der zentrale Notbetrieb lässt solche Packs aus.

Die Ansicht `zellen` zeigt die Zellauswertung aus den `sql`-Sensoren `sensor.zellen_pack_<n>` und `sensor.zellen_status` (Werte als Attribute): oben die Filter `input_select.zellen_zeitraum`, `input_select.zellen_zustand` und `input_number.zellen_mindestspreizung` mit dem Zeitpunkt der letzten Berechnung und „Neu berechnen“ (`homeassistant.update_entity` auf die Sensoren), darunter die Kennzahlen des gewählten Packs, die Matrizen „Abweichung vom Packmittel“ und „Anteil am Extrem im Pack“ über alle Zellen und die Drift der Leitzellen. Die Drift holt die Karte als Tageswerte aus der Langzeitstatistik von `sensor.zellen_drift_pack_<n>_hoch` und `_tief` (WebSocket `recorder/statistics_during_period`, `period: day`, `mean`) und zeichnet sie als Stufen. Ein Klick auf eine Packzeile setzt `input_select.zellen_pack`. Unter 600 px Breite stehen die Zellen 1–8 und 9–16 in zwei Matrizen untereinander.

Abweichende Entitäten je Pack:

```yaml
packs:
  - pack: 1
    prefix: pv_pack_1
    stack: 1
```

## Bauen

```
npm ci
npm run build
```

Ergebnis: `dist/battery-dashboard.js`. Releases entstehen in GitHub Actions: Erhöht ein Push auf `main` die Version in `package.json`, legt der Workflow Tag und Release `v<Version>` mit der Datei an.
