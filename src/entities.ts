// Entity-Ableitung aus der Packnummer (A01d, Abschnitt „Entity-Ableitung“) und Guard-Helfer (E10).

export interface PackConfig {
  pack: number;
  /** abweichendes Praefix statt pv_pack_<n> */
  prefix?: string;
  /** abweichender Stack statt ceil(pack / 3) */
  stack?: number;
}

export interface StackConfig {
  stack: number;
  /** im Editor frei waehlbarer Name (E17) */
  name?: string;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated: string;
}

export interface Hass {
  states: Record<string, HassEntity | undefined>;
}

export const BANK_SHUNT = 'sensor.victron_mqtt_battery_279_battery_';
export const BANK_MASTER = 'sensor.victron_mqtt_battery_512_battery_';

export function stackOf(p: PackConfig): number {
  return p.stack ?? Math.ceil(p.pack / 3);
}

export function packEntity(p: PackConfig, domain: string, key: string): string {
  return `${domain}.${p.prefix ?? `pv_pack_${p.pack}`}_${key}`;
}

export function stackEntity(stack: number, p: PackConfig | null, domain: string, key: string): string {
  return p
    ? `${domain}.pv_battery_stack_${stack}_pack_${p.pack}_${key}`
    : `${domain}.pv_battery_stack_${stack}_${key}`;
}

/** Zustand einer Entitaet oder undefined, wenn sie fehlt, unavailable oder unknown ist. */
export function stateOf(hass: Hass | undefined, entityId: string): HassEntity | undefined {
  const s = hass?.states[entityId];
  if (!s || s.state === 'unavailable' || s.state === 'unknown') return undefined;
  return s;
}

export function numberOf(hass: Hass | undefined, entityId: string): number | undefined {
  const s = stateOf(hass, entityId);
  if (!s) return undefined;
  const n = Number(s.state);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizePacks(raw: unknown): PackConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('pack-card: "packs" muss eine nicht leere Liste sein');
  }
  return raw.map((item, i) => {
    const p: PackConfig = typeof item === 'number' ? { pack: item } : (item as PackConfig);
    if (!p || !Number.isInteger(p.pack) || p.pack < 1) {
      throw new Error(`pack-card: packs[${i}] braucht eine ganze Packnummer ab 1`);
    }
    if (p.stack !== undefined && (!Number.isInteger(p.stack) || p.stack < 1)) {
      throw new Error(`pack-card: packs[${i}].stack muss eine ganze Zahl ab 1 sein`);
    }
    return { pack: p.pack, prefix: p.prefix, stack: p.stack };
  });
}

export function normalizeStacks(raw: unknown, packs: PackConfig[]): StackConfig[] {
  const given = Array.isArray(raw) ? (raw as StackConfig[]) : [];
  const numbers = [...new Set(packs.map(stackOf))].sort((a, b) => a - b);
  return numbers.map((s) => ({ stack: s, name: given.find((g) => g?.stack === s)?.name ?? `Stack ${s}` }));
}
