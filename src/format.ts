// Zahlen- und Zeitformate der Karte: Dezimalkomma, Strich fuer fehlende Werte (E10), Zellkennung nach E20.

export const DASH = '–';

const pad2 = (x: number): string => String(Math.floor(x)).padStart(2, '0');

export function fmt(x: number | undefined, d: number): string {
  if (x === undefined || !Number.isFinite(x)) return DASH;
  return x.toFixed(d).replace('.', ',');
}

/** Mit Vorzeichen (+ / −), null ohne Vorzeichen. */
export function signed(x: number | undefined, d: number): string {
  if (x === undefined || !Number.isFinite(x)) return DASH;
  const a = fmt(Math.abs(x), d);
  if (/^0(,0*)?$/.test(a)) return a;
  return (x > 0 ? '+' : '−') + a;
}

const withUnit = (s: string, unit: string): string =>
  s === DASH || !unit ? s : unit === '%' ? `${s}%` : `${s} ${unit}`;

/** Zahl mit Einheit, fehlend nur „–“. */
export function num(x: number | undefined, d: number, unit = ''): string {
  return withUnit(fmt(x, d), unit);
}

/** Zahl mit Vorzeichen und Einheit, fehlend nur „–“. */
export function snum(x: number | undefined, d: number, unit = ''): string {
  return withUnit(signed(x, d), unit);
}

/** Datenalter: „12 s“, „3:41 min“, „2 h“. */
export function ageText(s: number | undefined): string {
  if (s === undefined) return DASH;
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${pad2(s % 60)} min`;
  return `${Math.floor(s / 3600)} h`;
}

/** Restlaufzeit als Tage:Stunden:Minuten (E16). */
export function dhm(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return DASH;
  const d = Math.floor(sec / 86400);
  return `${d}:${pad2((sec % 86400) / 3600)}:${pad2((sec % 3600) / 60)}`;
}

/** Laufzeit des ESP: „3 T 22 h“, „5 h 12 min“, „7 min“. */
export function uptimeText(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return DASH;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} T ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Restzeit als m:ss, ab einer Stunde h:mm:ss (Notbetrieb-Restzeit). */
export function clock(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return DASH;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}

/** Ganze Zahl (Zaehler), fehlend „–“. */
export function count(x: number | undefined): string {
  return x === undefined || !Number.isFinite(x) ? DASH : String(Math.round(x));
}

/** Zelle als Pack:Zelle, zweistellig (E20): „05:02“ ist Zelle 02 in Pack_5. */
export function packCell(pack: number, cell: number): string {
  return `${pad2(pack)}:${pad2(cell)}`;
}

/**
 * Modul der GX-Kennung „MM::CC“ als Packnummer (A01d-09, Live 2026-11-02): die Module sind die RS485-Adressen der BMS,
 * 00 ist der Master Pack_1, 02 bis 06 sind Pack_2 bis Pack_6; Adresse 01 kommt nicht vor.
 */
export function gxPack(module: number): number | undefined {
  if (module === 0) return 1;
  return module >= 2 && module <= 6 ? module : undefined;
}

/** Kennung der Extremzelle am GX „MM::CC“ als Pack:Zelle (E20, A01d-09); unbekanntes Modul und anderes roh. */
export function cellId(raw: string | undefined): string {
  if (!raw) return DASH;
  const m = /^(\d+)::(\d+)$/.exec(raw.trim());
  if (!m) return raw;
  const pack = gxPack(Number(m[1]));
  return pack === undefined ? raw.trim() : packCell(pack, Number(m[2]));
}
