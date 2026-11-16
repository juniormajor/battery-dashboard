// Shared parts of the enclosure (view speicher, E17) and the pack view (E19): data age, lamps RUN/ALM/BAL/EMG,
// BLE level, highest temperature with sensor (E21, A01e), tint by ΔU, extreme cells and balancer cells.
import { css, html, TemplateResult } from 'lit';
import { Hass, PackConfig, STALE_S, ageSeconds, numberOf, packEntity, stackEntity, stackOf, stateOf, unitOf } from './entities';
import { CapUnit, ageText, capText, snum } from './format';
import { GroupLine, val } from './ui';

export const CELLS = 16;

/**
 * Sensors in the naming of the JK app (E21, A01e "Temperaturfuehler"): IC is the MOSFET temperature, ESPHome sensor 3
 * is JK T5, 4 is T4; ESPHome sensor 5 is JK T3, a mirror of the IC, and is dropped.
 */
export const TEMPS: [string, string][] = [
  ['IC', 'mosfet_temperature'],
  ['T1', 'temperature_sensor_1'],
  ['T2', 'temperature_sensor_2'],
  ['T4', 'temperature_sensor_4'],
  ['T5', 'temperature_sensor_3'],
];

export interface MaxTemp {
  v: number;
  /** sensor in JK naming */
  s: string;
  id: string;
}

/** Highest temperature over the IC and the four independent sensors (E21). */
export function maxTemp(hass: Hass | undefined, p: PackConfig): MaxTemp | undefined {
  let t: MaxTemp | undefined;
  for (const [label, key] of TEMPS) {
    const id = packEntity(p, 'sensor', key);
    const v = numberOf(hass, id);
    if (v !== undefined && (!t || v > t.v)) t = { v, s: label, id };
  }
  return t;
}

/** Tint of the screen by ΔU (mockup band(): from 5 mV and from 15 mV). */
export function band(dmv: number | undefined): string {
  if (dmv === undefined) return '';
  return dmv >= 15 ? 't-warn' : dmv >= 5 ? 't-soft' : '';
}

/** ΔU in mV, regardless of whether the sensor reports V or mV. */
export function deltaMv(hass: Hass | undefined, p: PackConfig): number | undefined {
  const id = packEntity(p, 'sensor', 'delta_cell_voltage');
  const d = numberOf(hass, id);
  if (d === undefined) return undefined;
  return unitOf(hass, id) === 'mV' ? d : d * 1000;
}

/** Data age from last_updated of total_runtime; fresh up to STALE_S (E17, level 1 of the watchdog). */
export function packAge(hass: Hass | undefined, p: PackConfig, now: number): { age: number | undefined; fresh: boolean } {
  const age = ageSeconds(hass, packEntity(p, 'sensor', 'total_runtime'), now || Date.now());
  return { age, fresh: age !== undefined && age <= STALE_S };
}

/** Lamps RUN, ALM, BAL, EMG (E17). */
export function packLeds(hass: Hass | undefined, p: PackConfig, fresh: boolean, alarm: boolean): TemplateResult {
  const bal = stateOf(hass, packEntity(p, 'binary_sensor', 'balancing'))?.state === 'on';
  const em = stateOf(hass, packEntity(p, 'switch', 'emergency'))?.state === 'on';
  const led = (cls: string, on: boolean, label: string, title: string) =>
    html`<span class="led ${cls} ${on ? 'on' : ''}" title=${title}><i></i>${label}</span>`;
  return html`<span class="leds">
    ${led('run', fresh, 'RUN', fresh ? 'Daten frisch' : `keine Daten seit über ${STALE_S} s`)}
    ${led('alm', alarm, 'ALM', alarm ? 'Fehlertext des BMS' : 'kein Fehlertext')}
    ${led('bal', bal, 'BAL', bal ? 'Balancer aktiv' : 'Balancer ruht')} ${led('em', em, 'EMG', em ? 'Emergency an' : 'Emergency aus')}
  </span>`;
}

/** BLE level at the stack device and data age (Besonderheiten: stack from the pack number, data age instead of online_status). */
export function bleInfo(node: EventTarget, hass: Hass | undefined, p: PackConfig, fresh: boolean, age: number | undefined): TemplateResult {
  const rssiId = stackEntity(stackOf(p), p, 'sensor', 'rssi');
  return html`<span class="ble"
    ><span class="dot ${fresh ? '' : 'off'}"></span>${val(node, hass, rssiId, snum(numberOf(hass, rssiId), 0, 'dBm'))} ·
    ${val(node, hass, packEntity(p, 'sensor', 'total_runtime'), ageText(age))}</span
  >`;
}

/**
 * "Kapazität: Rest (voll)" per pack as in the bank display (E16): capacity_remaining and full_charge_capacity of the BMS,
 * in the unit chosen there; each value opens its entity.
 */
export function capLine(node: EventTarget, hass: Hass | undefined, p: PackConfig, unit: CapUnit): GroupLine {
  const rem = packEntity(p, 'sensor', 'capacity_remaining');
  const full = packEntity(p, 'sensor', 'full_charge_capacity');
  return {
    k: 'Kapazität:',
    v: [
      html`<span class="nw"
        >${val(node, hass, rem, capText(numberOf(hass, rem), unit))} ${val(node, hass, full, `(${capText(numberOf(hass, full), unit)})`)}</span
      >`,
    ],
  };
}

/** Cell number from a numeric sensor (min_voltage_cell, max_voltage_cell report e.g. 8.0), only 1 to 16. */
export function cellNumber(hass: Hass | undefined, id: string): number | undefined {
  const v = numberOf(hass, id);
  if (v === undefined) return undefined;
  const n = Math.round(v);
  return n >= 1 && n <= CELLS ? n : undefined;
}

export interface Extremes {
  max?: number;
  min?: number;
}

/** Highest and lowest cell: values of the BMS; if they are missing, calculated from the cell voltages (as in jk-bms-card). */
export function extremeCells(hass: Hass | undefined, p: PackConfig, volts: (number | undefined)[]): Extremes {
  let max = cellNumber(hass, packEntity(p, 'sensor', 'max_voltage_cell'));
  let min = cellNumber(hass, packEntity(p, 'sensor', 'min_voltage_cell'));
  if (max === undefined || min === undefined) {
    let hi: number | undefined;
    let lo: number | undefined;
    volts.forEach((v, k) => {
      if (v === undefined) return;
      if (hi === undefined || v > volts[hi - 1]!) hi = k + 1;
      if (lo === undefined || v < volts[lo - 1]!) lo = k + 1;
    });
    if (hi !== undefined && lo !== undefined && hi !== lo) {
      max = max ?? hi;
      min = min ?? lo;
    }
  }
  return { max, min };
}

export interface BalancerState {
  /** rounded raw value, undefined without a valid value */
  raw?: number;
  /** marked cells */
  cells: number[];
  title: string;
}

/**
 * sensor.pv_pack_<n>_balancer_status_bitmask. The component jk_bms_ble stores the byte "Balancing action" there
 * (0 off, 1 balancer while charging, 2 balancer while discharging; jk_bms_ble.cpp and docs/protocol-design-ble.md,
 * retrieved 2026-11-01), not a cell mask. The active balancer works from the highest to the lowest cell;
 * therefore, for a value other than 0, these two cells are marked (as in the mockup).
 */
export function balancerState(hass: Hass | undefined, p: PackConfig, ext: Extremes): BalancerState {
  const v = numberOf(hass, packEntity(p, 'sensor', 'balancer_status_bitmask'));
  if (v === undefined) return { cells: [], title: 'Balancer-Status nicht verfügbar' };
  const raw = Math.round(v);
  if (raw === 0) return { raw, cells: [], title: 'Balancer ruht' };
  const cells = [ext.max, ext.min].filter((c): c is number => c !== undefined);
  const what = raw === 1 ? 'Balancer aktiv (Charge)' : raw === 2 ? 'Balancer aktiv (Discharge)' : `Balancer-Status ${raw}`;
  return { raw, cells, title: `${what}: höchste und niedrigste Zelle` };
}

/** Bottom row of the enclosure (E17, E26): the lamps RUN/ALM/BAL/EMG like the LED bar of the BMS board, right-aligned. */
export function caseBottom(leds: TemplateResult): TemplateResult {
  return html`<div class="case-bot">${leds}</div>`;
}

/**
 * Enclosure modeled on the real pack (E17, E19, E26): type plate as pill on the left, BLE level and data age on the
 * right; below SoC battery and the value area; at the bottom the lamps. Without bezel and terminal caps (E26).
 * Shared by speicher and the pack view.
 */
export const caseStyles = css`
  .case {
    position: relative;
    background: var(--pc-card);
    border: 1px solid var(--pc-line);
    border-radius: var(--pc-r-md);
    padding: 8px 12px;
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .case.soc-lo {
    border: 2px solid var(--pc-bad);
    padding: 7px 11px;
  }
  .case.soc-hi {
    border: 2px solid var(--pc-ok);
    padding: 7px 11px;
  }
  .case-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px 8px;
    min-width: 0;
  }
  .plate-w {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .plate {
    border: 0;
    background: var(--pc-raise);
    color: var(--pc-fg);
    border-radius: var(--pc-r-pill);
    padding: 6px 12px;
    font: inherit;
    font-size: var(--pc-fs-m);
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: 1;
    white-space: nowrap;
  }
  button.plate {
    cursor: pointer;
  }
  button.plate:hover {
    background: var(--pc-fill-pri);
    color: var(--pc-accent);
  }
  button.plate:focus-visible {
    outline: 2px solid var(--pc-accent);
    outline-offset: 2px;
  }
  /* value area as high as the battery including SoC and SoH */
  .case-mid {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
    min-width: 0;
  }
  .soc {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
    text-align: center;
    line-height: 1.2;
  }
  .soc svg {
    display: block;
  }
  .soc b {
    font-weight: var(--ha-font-weight-medium, 500);
    white-space: nowrap;
  }
  .soc .soh {
    color: var(--pc-fg2);
    white-space: nowrap;
  }
  /* former bezel: only a layout wrapper around the value area (E26) */
  .bezel {
    display: flex;
    min-width: 0;
  }
  .bezel .scr {
    flex: 1;
    display: grid;
    align-content: center;
  }
  .case-bot {
    display: flex;
    justify-content: flex-end;
    min-width: 0;
  }
  .case-bot .leds {
    flex-wrap: wrap;
    justify-content: flex-end;
    row-gap: 2px;
  }
`;

/** Styles of lamps, BLE indicator, master badge and screen tint, shared by enclosure and pack view. */
export const packPartStyles = css`
  .badge-m {
    font-size: var(--pc-fs-s);
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: 1.2;
    background: var(--pc-fill-pri);
    color: var(--pc-accent);
    border-radius: var(--pc-r-pill);
    padding: 2px 8px;
    white-space: nowrap;
  }
  .leds {
    display: inline-flex;
    gap: 12px;
    font-size: var(--pc-fs-s);
    line-height: 1.2;
    color: var(--pc-fg3);
    align-items: center;
  }
  .led {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .led i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--pc-fg3) 40%, transparent);
  }
  .led.on.run i {
    background: var(--pc-ok);
  }
  .led.on.alm i {
    background: var(--pc-bad);
  }
  .led.on.bal i {
    background: var(--pc-bal);
    animation: blink 1.2s ease-in-out infinite;
  }
  .led.on.em i {
    background: var(--pc-warn);
  }
  @keyframes blink {
    50% {
      opacity: 0.35;
    }
  }
  .ble {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--pc-fs-s);
    line-height: 1.2;
    color: var(--pc-fg2);
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    background: var(--pc-ok);
    flex: none;
  }
  .dot.off {
    background: var(--pc-bad);
  }
  .scr {
    border-radius: var(--pc-r-md);
    padding: 8px 12px;
    background: var(--pc-screen);
    min-width: 0;
  }
  .scr.t-soft {
    background: color-mix(in srgb, var(--pc-soft) 13%, var(--pc-screen));
  }
  .scr.t-warn {
    background: color-mix(in srgb, var(--pc-warn) 15%, var(--pc-screen));
  }
  .scr.t-bad {
    background: color-mix(in srgb, var(--pc-bad) 18%, var(--pc-screen));
  }
  .scr.t-off {
    opacity: 0.55;
  }
  .balv {
    color: var(--pc-bal);
  }
  @media (prefers-reduced-motion: reduce) {
    .led.on.bal i {
      animation: none;
    }
  }
`;
