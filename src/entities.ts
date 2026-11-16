// Entity derivation from the pack number (A01d, section "Entity-Ableitung") and guard helpers (E10).

export interface PackConfig {
  pack: number;
  /** custom prefix instead of pv_pack_<n> */
  prefix?: string;
  /** custom stack instead of ceil(pack / 3) */
  stack?: number;
}

export interface StackConfig {
  stack: number;
  /** name chosen freely in the card configuration (E17) */
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
  themes?: { darkMode?: boolean };
  callService?: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ) => Promise<unknown>;
  /** entity registry of the frontend (EntityRegistryDisplayEntry): device of an entity for links to the device page */
  entities?: Record<string, { device_id?: string } | undefined>;
  /** logged-in user; the device page under /config is only reachable for admins */
  user?: { is_admin?: boolean };
  /** WebSocket command over the frontend connection (drift: recorder/statistics_during_period, A01c E6) */
  callWS?: <T>(msg: Record<string, unknown>) => Promise<T>;
}

export const BANK_SHUNT = 'sensor.victron_mqtt_battery_279_battery_';
export const BANK_MASTER = 'sensor.victron_mqtt_battery_512_battery_';

/** Bridge helper for the pack and cell views (E6), options Pack_1 to Pack_6 */
export const ZELLEN_PACK = 'input_select.zellen_pack';

/** From this data age of total_runtime on, a pack counts as without data (level 1 of the ESP watchdog, A01f E21). */
export const STALE_S = 180;

/** Nominal voltage for converting Ah -> kWh (E16: 16 x 3.2 V) */
export const NOMINAL_V = 51.2;

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

/** ESP diagnostics without area prefix (A01b E15): sensor.battery_stack_<s>_<key> */
export function stackDiagEntity(stack: number, key: string): string {
  return `sensor.battery_stack_${stack}_${key}`;
}

/** State of an entity, or undefined if it is missing, unavailable or unknown. */
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

/** Text of a text sensor; empty and missing as undefined. */
export function textOf(hass: Hass | undefined, entityId: string): string | undefined {
  const t = stateOf(hass, entityId)?.state.trim();
  return t ? t : undefined;
}

/** Operable: present and not unavailable. A button that was never pressed is unknown (A01d, Besonderheiten). */
export function isAvailable(hass: Hass | undefined, entityId: string): boolean {
  const s = hass?.states[entityId];
  return !!s && s.state !== 'unavailable';
}

/** Device ID of the first entity with a device from the frontend registry, otherwise undefined. */
export function deviceOf(hass: Hass | undefined, entityIds: string[]): string | undefined {
  for (const id of entityIds) {
    const d = hass?.entities?.[id]?.device_id;
    if (d) return d;
  }
  return undefined;
}

export function exists(hass: Hass | undefined, entityId: string): boolean {
  return !!hass?.states[entityId];
}

export function unitOf(hass: Hass | undefined, entityId: string): string {
  const u = stateOf(hass, entityId)?.attributes?.unit_of_measurement;
  return typeof u === 'string' ? u : '';
}

/** Age of the last valid value in seconds from last_updated (A01d, Besonderheiten: data age). */
export function ageSeconds(hass: Hass | undefined, entityId: string, now: number): number | undefined {
  const s = stateOf(hass, entityId);
  if (!s) return undefined;
  const t = Date.parse(s.last_updated);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, (now - t) / 1000);
}

/** Number in seconds, converted according to unit_of_measurement (remaining time, runtime). */
export function secondsOf(hass: Hass | undefined, entityId: string): number | undefined {
  const v = numberOf(hass, entityId);
  if (v === undefined) return undefined;
  const f: Record<string, number> = { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 };
  return v * (f[unitOf(hass, entityId)] ?? 1);
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
