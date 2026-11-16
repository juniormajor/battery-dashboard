# Battery Dashboard

Lovelace card `custom:pack-card` for a home battery bank of six JK-BMS packs in two stacks, whose data reach Home Assistant via ESPHome (`syssi/esphome-jk-bms`) and Victron (`victron_mqtt`). Entities are derived from the pack number (`pv_pack_<n>_…`, stack `⌈n ÷ 3⌉`); only packs and stacks are configured.

The card is tailored to one specific installation and is not a general-purpose product. Its user interface is in German.

## Installation

HACS → menu → Custom repositories → `https://github.com/juniormajor/battery-dashboard`, category Dashboard, then install. HACS creates the resource `/hacsfiles/battery-dashboard/battery-dashboard.js` itself (dashboards in storage mode).

## Configuration

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

Click targets (optional): `pack_path` is the pack view (default `pack`), `zellen_path` the cell analysis (default `zellen`), `speicher_path` the target of the pack view's back link (default `speicher`), each relative to the current dashboard (`/<dashboard-url>/pack`) or absolute from `/`. The cell ID of the BMS master at the GX ("MM::CC") is shown as pack:cell: module 00 is Pack_1, 02 to 06 are Pack_2 to Pack_6. A click on "Pack n" first sets `input_select.zellen_pack` to `Pack_<n>`.

```yaml
pack_path: pack
zellen_path: zellen
speicher_path: speicher
```

The view `speicher` shows the bank display at the top in two halves of equal width (left the SoC battery, the shunt with "Kapazität: Rest (installiert)" and the central "Emergency" button for all packs, right the BMS master) and below it the stacks with "ESP reboot" in their header (for admins, the stack name links to the ESP's device page in Home Assistant) and the packs as enclosures modeled on the real pack: type plate top center, SoC battery and a screen in its bezel with "U / I / P", "Kapazität: Rest (voll)" from `capacity_remaining` and `full_charge_capacity` in the unit of the bank display, "ΔU / I Bal" and temperature, at the bottom terminal caps and the lamps RUN, ALM, BAL and EMG. Hold buttons (Emergency, ESP reboot, Pack reboot) show only their name; while held, the button fills for one second, also with reduced motion. Speicher and pack are at most 900 px wide and centered; a theme can change this via `--pack-card-max-width`. The cell analysis uses the full width.

The view `pack` shows the pack from `input_select.zellen_pack` (`Pack_<n>`); if the helper is missing or its value is not a configured pack, the first pack from `packs`. Paging forward and back only sets the helper. Charge, Discharge and Bluetooth switch on with a single tap but off only after holding for one second; Emergency and Pack reboot (BMS restart) require one second of holding in both directions. If a pack has delivered no data for more than 180 s, Charge, Discharge, Balancer, Float, Emergency and Pack reboot are locked because the command would not reach the BMS; Bluetooth stays operable. The central Emergency skips such packs. As in the speicher view, the pack values show the capacity below "U / I / P", with the same Ah/kWh toggle in the header; the choice applies to speicher and pack and is remembered per browser. The "BLE" row summarizes reconnects, watchdog interventions, last intervention, keepalive, BMS runtime and power-ons. Each cell is shown as "no. voltage / internal resistance" in a frame as wide as its content; while balancing current flows, a line with moving dots and an arrow shows the flow from the highest to the lowest cell.

Temperatures are shown with a thermometer and the sensor: in the pack the warmest of IC (MOSFET), T1, T2, T4 and T5 in the naming of the JK app, in the stack header "ESP", in the bank display "Zelle max" as the highest cell temperature of the BMS master (without MOSFET) with the pack from the GX ID.

The view `zellen` shows the cell evaluation from the `sql` sensors `sensor.zellen_pack_<n>` and `sensor.zellen_status` (values as attributes): at the top the filters `input_select.zellen_zeitraum`, `input_select.zellen_zustand` (Laden, Entladen and Ruhe are shown as Charge, Discharge and Idle) and `input_number.zellen_mindestspreizung` with the time of the last calculation and "Neu berechnen" (`homeassistant.update_entity` on the sensors), below them the key figures of the selected pack, the matrices "Abweichung vom Packmittel" (deviation from the pack mean) and "Anteil am Extrem im Pack" (share of the extreme within the pack) over all cells, and the drift of the lead cells. The card fetches the drift as daily values from the long-term statistics of `sensor.zellen_drift_pack_<n>_hoch` and `_tief` (WebSocket `recorder/statistics_during_period`, `period: day`, `mean`) and draws it as steps. A click on a pack row sets `input_select.zellen_pack`. Below 600 px width, cells 1–8 and 9–16 are shown in two matrices one above the other.

Colors come from the HA theme; the status colors and the enclosure colors can be overridden via `--pack-card-<name>-color` or `--pack-card-<name>-color-dark` (`ok`, `soft`, `warn`, `bad`, `bal`, `low`, `plate`, `plate-text`, `bezel`, `terminal-plus`, `terminal-minus`).

Different entities per pack:

```yaml
packs:
  - pack: 1
    prefix: pv_pack_1
    stack: 1
```

## Build

```
npm ci
npm run build
```

Result: `dist/battery-dashboard.js`. esbuild (via `rollup-plugin-esbuild`) transpiles the TypeScript sources using `tsconfig.json`; type checking runs separately with TypeScript 7 (`npm run typecheck`, `tsc --noEmit`). `useDefineForClassFields: false` in `tsconfig.json` must stay, otherwise class fields would shadow Lit's reactive properties. Releases are created in GitHub Actions: if a push to `main` raises the version in `package.json`, the workflow `release` creates tag and release `v<version>` with the file attached.

## Render test

`test/render/` renders the card without Home Assistant in Chromium (Playwright) with a mocked `hass` built from live values (`mock.js`, as of 2026-11-02):

```
npx playwright install chromium
npm test
node test/render/shot.cjs /tmp/render "pack=view=pack&bal=1@1500" "pack-dark=view=pack&dark=1&pack=5@390"
node test/render/hold.cjs
```

`npm test` type-checks and builds the card and renders the default variants into `render-out/`. `shot.cjs` saves a PNG per variant, reports console errors and horizontal overflow, and exits with code 1 if any variant fails; the query selects the variant (`view`, `dark=1`, `unit=kWh`, `pack=<n>`, balancing `bal=<n>`, error text `err=<n>`, Emergency `em=<n>`, without data `off=<n>`, non-admin `admin=0`). `hold.cjs` holds Emergency and ESP reboot during frequent `hass` updates and prints the fill of the button.

## Maintenance

The workflow `ci` runs the type check, the build and the render test on every pull request and push to `main`; its job `build-and-render` is the required check for `main`. Dependabot checks GitHub Actions and npm monthly. Actions updates and npm minor/patch updates are merged automatically once the check has passed; npm major updates stay open for review. Merged updates do not create a release by themselves.

## Credits

Toolchain and the pack view are modeled on [jk-bms-card](https://github.com/Pho3niX90/jk-bms-card) by Pho3niX90 (MIT).

## License

[MIT](LICENSE)
