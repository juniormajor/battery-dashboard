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

Klickziele (optional): `pack_path` ist die Packansicht (Standard `pack`), `zellen_path` die Zellanalyse (Standard `zellen`), jeweils relativ zum aktuellen Dashboard (`/<dashboard-url>/pack`) oder absolut ab `/`. Ein Klick auf „Pack n“ setzt vorher `input_select.zellen_pack` auf `Pack_<n>`.

```yaml
pack_path: pack
zellen_path: zellen
```

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
