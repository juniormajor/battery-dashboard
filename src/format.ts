// Number and time formats of the card: decimal comma, dash for missing values (E10), cell ID per E20.

import { NOMINAL_V } from './entities';

export const DASH = '–';

export type CapUnit = 'Ah' | 'kWh';


/** Capacity in the chosen unit, with unit (Ah as integer, kWh with one decimal); missing "–". */
export function capText(ah: number | undefined, unit: CapUnit): string {
  if (ah === undefined || !Number.isFinite(ah)) return '–';
  return unit === 'kWh' ? `${((ah * NOMINAL_V) / 1000).toFixed(1).replace('.', ',')} kWh` : `${Math.round(ah)} Ah`;
}

const pad2 = (x: number): string => String(Math.floor(x)).padStart(2, '0');

export function fmt(x: number | undefined, d: number): string {
  if (x === undefined || !Number.isFinite(x)) return DASH;
  return x.toFixed(d).replace('.', ',');
}

/** With sign (+ / −); zero without sign. */
export function signed(x: number | undefined, d: number): string {
  if (x === undefined || !Number.isFinite(x)) return DASH;
  const a = fmt(Math.abs(x), d);
  if (/^0(,0*)?$/.test(a)) return a;
  return (x > 0 ? '+' : '−') + a;
}

const withUnit = (s: string, unit: string): string =>
  s === DASH || !unit ? s : unit === '%' ? `${s}%` : `${s} ${unit}`;

/** Number with unit; missing just "–". */
export function num(x: number | undefined, d: number, unit = ''): string {
  return withUnit(fmt(x, d), unit);
}

/** Number with sign and unit; missing just "–". */
export function snum(x: number | undefined, d: number, unit = ''): string {
  return withUnit(signed(x, d), unit);
}

/** Data age: "12 s", "3:41 min", "2 h". */
export function ageText(s: number | undefined): string {
  if (s === undefined) return DASH;
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${pad2(s % 60)} min`;
  return `${Math.floor(s / 3600)} h`;
}

/** Remaining time as days:hours:minutes (E16). */
export function dhm(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return DASH;
  const d = Math.floor(sec / 86400);
  return `${d}:${pad2((sec % 86400) / 3600)}:${pad2((sec % 3600) / 60)}`;
}

/** ESP runtime: "3 T 22 h", "5 h 12 min", "7 min". */
export function uptimeText(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return DASH;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} T ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Remaining time as m:ss, from one hour on h:mm:ss (emergency remaining time). */
export function clock(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return DASH;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}

/** Integer (counter); missing "–". */
export function count(x: number | undefined): string {
  return x === undefined || !Number.isFinite(x) ? DASH : String(Math.round(x));
}

/** Cell as pack:cell, two digits (E20): "05:02" is cell 02 in Pack_5. */
export function packCell(pack: number, cell: number): string {
  return `${pad2(pack)}:${pad2(cell)}`;
}

/**
 * Module of the GX ID "MM::CC" as pack number (A01d-09, live 2026-11-02): the modules are the RS485 addresses of the BMS,
 * 00 is the master Pack_1, 02 to 06 are Pack_2 to Pack_6; address 01 does not occur.
 */
export function gxPack(module: number): number | undefined {
  if (module === 0) return 1;
  return module >= 2 && module <= 6 ? module : undefined;
}

/** ID of the extreme cell at the GX "MM::CC" as pack:cell (E20, A01d-09); unknown module and anything else raw. */
export function cellId(raw: string | undefined): string {
  if (!raw) return DASH;
  const m = /^(\d+)::(\d+)$/.exec(raw.trim());
  if (!m) return raw;
  const pack = gxPack(Number(m[1]));
  return pack === undefined ? raw.trim() : packCell(pack, Number(m[2]));
}
