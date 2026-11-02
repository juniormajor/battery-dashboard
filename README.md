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

Klickziele (optional): `pack_path` ist die Packansicht (Standard `pack`), `zellen_path` die Zellanalyse (Standard `zellen`), `speicher_path` das Ziel des Rücklinks der Packansicht (Standard `speicher`), jeweils relativ zum aktuellen Dashboard (`/<dashboard-url>/pack`) oder absolut ab `/`. Die Zellkennung des BMS-Masters am GX („MM::CC“) erscheint als Pack:Zelle: Modul 00 ist Pack_1, 02 bis 06 sind Pack_2 bis Pack_6. Ein Klick auf „Pack n“ setzt vorher `input_select.zellen_pack` auf `Pack_<n>`.

```yaml
pack_path: pack
zellen_path: zellen
speicher_path: speicher
```

Die Ansicht `speicher` zeigt oben das Bank-Display (Shunt und BMS-Master, „Kapazität: Rest (installiert)“, darin der zentrale Knopf „Emergency“ für alle Packs) und darunter die Packs als Gehäuse nach dem realen Pack: Typenschild oben in der Mitte, SoC-Batterie und Bildschirm im Rahmen, unten Polkappen und die Lampen RUN, ALM, BAL und EMG. Speicher und Pack sind höchstens 900 px breit und mittig; ein Theme kann das über `--pack-card-max-width` ändern. Die Zellanalyse nutzt die volle Breite.

Die Ansicht `pack` zeigt das Pack aus `input_select.zellen_pack` (`Pack_<n>`); fehlt der Helfer oder ist der Wert kein konfiguriertes Pack, das erste Pack aus `packs`. Vor- und Zurückblättern setzt nur den Helfer. Charge, Discharge und Bluetooth schalten mit einfachem Tippen ein, aber nur nach einer Sekunde Halten aus; Emergency und BMS-Neustart verlangen in beide Richtungen eine Sekunde Halten. Liefert ein Pack seit über 180 s keine Daten, sind Charge, Discharge, Balancer, Float, Emergency und BMS-Neustart gesperrt, weil der Befehl das BMS nicht erreicht; Bluetooth bleibt bedienbar. Das zentrale Emergency lässt solche Packs aus. Jede Zelle steht als „Nr Spannung / Innenwiderstand“; fließt Balancing-Strom, zeigt eine Leitung mit wandernden Punkten und Pfeil den Fluss von der höchsten zur niedrigsten Zelle.

Temperaturen stehen mit Thermometer und dem Fühler: im Pack der wärmste von IC (MOSFET), T1, T2, T4 und T5 in der Benennung der JK-App, im Stackkopf „ESP“, im Bank-Display „max“ als höchste Zelltemperatur des BMS-Masters.

Die Ansicht `zellen` zeigt die Zellauswertung aus den `sql`-Sensoren `sensor.zellen_pack_<n>` und `sensor.zellen_status` (Werte als Attribute): oben die Filter `input_select.zellen_zeitraum`, `input_select.zellen_zustand` (Laden, Entladen und Ruhe erscheinen als Charge, Discharge und Idle) und `input_number.zellen_mindestspreizung` mit dem Zeitpunkt der letzten Berechnung und „Neu berechnen“ (`homeassistant.update_entity` auf die Sensoren), darunter die Kennzahlen des gewählten Packs, die Matrizen „Abweichung vom Packmittel“ und „Anteil am Extrem im Pack“ über alle Zellen und die Drift der Leitzellen. Die Drift holt die Karte als Tageswerte aus der Langzeitstatistik von `sensor.zellen_drift_pack_<n>_hoch` und `_tief` (WebSocket `recorder/statistics_during_period`, `period: day`, `mean`) und zeichnet sie als Stufen. Ein Klick auf eine Packzeile setzt `input_select.zellen_pack`. Unter 600 px Breite stehen die Zellen 1–8 und 9–16 in zwei Matrizen untereinander.

Farben kommen aus dem HA-Theme; die Statusfarben und die Gehäusefarben lassen sich über `--pack-card-<name>-color` bzw. `--pack-card-<name>-color-dark` überschreiben (`ok`, `soft`, `warn`, `bad`, `bal`, `low`, `plate`, `plate-text`, `bezel`, `terminal-plus`, `terminal-minus`).

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
