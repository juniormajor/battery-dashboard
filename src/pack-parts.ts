// Gemeinsame Teile von Gehaeuse (Ansicht speicher, E17) und Packansicht (E19): Datenalter, Lampen RUN/ALM/BAL/EMG,
// BLE-Pegel, hoechste Temperatur mit Fuehler (E21, A01e), Toenung nach ΔU, Extremzellen und Balancer-Zellen.
import { css, html, TemplateResult } from 'lit';
import { Hass, PackConfig, STALE_S, ageSeconds, numberOf, packEntity, stackEntity, stackOf, stateOf, unitOf } from './entities';
import { ageText, snum } from './format';
import { val } from './ui';

export const CELLS = 16;

/** Fuehler in der Benennung der JK-App (E21, A01e „Temperaturfuehler“): ESPHome-Fuehler 3 = JK 5; Fuehler 5 = Spiegel des IC, entfaellt. */
export const TEMPS: [string, string][] = [
  ['IC', 'mosfet_temperature'],
  ['1', 'temperature_sensor_1'],
  ['2', 'temperature_sensor_2'],
  ['4', 'temperature_sensor_4'],
  ['5', 'temperature_sensor_3'],
];

export interface MaxTemp {
  v: number;
  /** Fuehler in JK-Benennung */
  s: string;
  id: string;
}

/** Hoechste Temperatur ueber IC und die vier eigenstaendigen Fuehler (E21). */
export function maxTemp(hass: Hass | undefined, p: PackConfig): MaxTemp | undefined {
  let t: MaxTemp | undefined;
  for (const [label, key] of TEMPS) {
    const id = packEntity(p, 'sensor', key);
    const v = numberOf(hass, id);
    if (v !== undefined && (!t || v > t.v)) t = { v, s: label, id };
  }
  return t;
}

/** Toenung des Bildschirms nach ΔU (Mockup band(): ab 5 mV und ab 15 mV). */
export function band(dmv: number | undefined): string {
  if (dmv === undefined) return '';
  return dmv >= 15 ? 't-warn' : dmv >= 5 ? 't-soft' : '';
}

/** ΔU in mV, unabhaengig davon, ob der Sensor V oder mV meldet. */
export function deltaMv(hass: Hass | undefined, p: PackConfig): number | undefined {
  const id = packEntity(p, 'sensor', 'delta_cell_voltage');
  const d = numberOf(hass, id);
  if (d === undefined) return undefined;
  return unitOf(hass, id) === 'mV' ? d : d * 1000;
}

/** Datenalter aus last_updated von total_runtime; frisch bis STALE_S (E17, Ebene 1 des Watchdogs). */
export function packAge(hass: Hass | undefined, p: PackConfig, now: number): { age: number | undefined; fresh: boolean } {
  const age = ageSeconds(hass, packEntity(p, 'sensor', 'total_runtime'), now || Date.now());
  return { age, fresh: age !== undefined && age <= STALE_S };
}

/** Lampen RUN, ALM, BAL, EMG (E17). */
export function packLeds(hass: Hass | undefined, p: PackConfig, fresh: boolean, alarm: boolean): TemplateResult {
  const bal = stateOf(hass, packEntity(p, 'binary_sensor', 'balancing'))?.state === 'on';
  const em = stateOf(hass, packEntity(p, 'switch', 'emergency'))?.state === 'on';
  const led = (cls: string, on: boolean, label: string, title: string) =>
    html`<span class="led ${cls} ${on ? 'on' : ''}" title=${title}><i></i>${label}</span>`;
  return html`<span class="leds">
    ${led('run', fresh, 'RUN', fresh ? 'Daten frisch' : `keine Daten seit über ${STALE_S} s`)}
    ${led('alm', alarm, 'ALM', alarm ? 'Fehlertext des BMS' : 'kein Fehlertext')}
    ${led('bal', bal, 'BAL', bal ? 'Balancer aktiv' : 'Balancer ruht')} ${led('em', em, 'EMG', em ? 'Notbetrieb an' : 'Notbetrieb aus')}
  </span>`;
}

/** BLE-Pegel am Stack-Geraet und Datenalter (Besonderheiten: Stack aus der Packnummer, Datenalter statt online_status). */
export function bleInfo(node: EventTarget, hass: Hass | undefined, p: PackConfig, fresh: boolean, age: number | undefined): TemplateResult {
  const rssiId = stackEntity(stackOf(p), p, 'sensor', 'rssi');
  return html`<span class="ble"
    ><span class="dot ${fresh ? '' : 'off'}"></span>${val(node, hass, rssiId, snum(numberOf(hass, rssiId), 0, 'dBm'))} ·
    ${val(node, hass, packEntity(p, 'sensor', 'total_runtime'), ageText(age))}</span
  >`;
}

/** Zellnummer aus einem Zahlensensor (min_voltage_cell, max_voltage_cell melden z. B. 8.0), nur 1 bis 16. */
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

/** Hoechste und niedrigste Zelle: Werte des BMS, fehlen sie, aus den Zellspannungen gerechnet (wie jk-bms-card). */
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
  /** gerundeter Rohwert, undefined ohne gueltigen Wert */
  raw?: number;
  /** markierte Zellen */
  cells: number[];
  title: string;
}

/**
 * sensor.pv_pack_<n>_balancer_status_bitmask. Die Komponente jk_bms_ble legt dort das Byte „Balancing action“ ab
 * (0 aus, 1 Balancer beim Laden, 2 Balancer beim Entladen; jk_bms_ble.cpp und docs/protocol-design-ble.md,
 * abgerufen 2026-11-01), keine Zellmaske. Der aktive Balancer arbeitet von der hoechsten zur niedrigsten Zelle;
 * markiert werden darum bei einem Wert ungleich 0 diese beiden Zellen (wie im Mockup).
 */
export function balancerState(hass: Hass | undefined, p: PackConfig, ext: Extremes): BalancerState {
  const v = numberOf(hass, packEntity(p, 'sensor', 'balancer_status_bitmask'));
  if (v === undefined) return { cells: [], title: 'Balancer-Status nicht verfügbar' };
  const raw = Math.round(v);
  if (raw === 0) return { raw, cells: [], title: 'Balancer ruht' };
  const cells = [ext.max, ext.min].filter((c): c is number => c !== undefined);
  const what = raw === 1 ? 'Balancer beim Laden aktiv' : raw === 2 ? 'Balancer beim Entladen aktiv' : `Balancer-Status ${raw}`;
  return { raw, cells, title: `${what}: höchste und niedrigste Zelle` };
}

/** Stile von Lampen, BLE-Anzeige, Master-Abzeichen und Bildschirm-Toenung, gemeinsam fuer Gehaeuse und Packansicht. */
export const packPartStyles = css`
  .badge-m {
    font-size: 10px;
    font-weight: 700;
    border: 1px solid var(--pc-accent);
    color: var(--pc-accent);
    border-radius: 4px;
    padding: 0 4px;
  }
  .leds {
    display: inline-flex;
    gap: 8px;
    font-size: 10px;
    letter-spacing: 0.05em;
    color: var(--pc-fg3);
    align-items: center;
  }
  .led {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .led i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--pc-fg3) 40%, transparent);
  }
  .led.on.run i {
    background: var(--pc-ok);
    box-shadow: 0 0 6px var(--pc-ok);
  }
  .led.on.alm i {
    background: var(--pc-bad);
    box-shadow: 0 0 6px var(--pc-bad);
  }
  .led.on.bal i {
    background: var(--pc-bal);
    box-shadow: 0 0 6px var(--pc-bal);
    animation: blink 1.2s ease-in-out infinite;
  }
  .led.on.em i {
    background: var(--pc-warn);
    box-shadow: 0 0 6px var(--pc-warn);
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
    font-size: 11.5px;
    color: var(--pc-fg2);
    white-space: nowrap;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: inline-block;
    background: var(--pc-ok);
    flex: none;
  }
  .dot.off {
    background: var(--pc-bad);
  }
  .scr {
    border-radius: 6px;
    padding: 5px 8px;
    background: var(--pc-screen);
    border: 1px solid var(--pc-line);
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
