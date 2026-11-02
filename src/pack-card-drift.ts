// Drift der Leitzellen des gewaehlten Packs (A01d E18, A01c E6 und E10): Tageswerte der Langzeitstatistik von
// sensor.zellen_drift_pack_<n>_hoch/_tief, geholt ueber den WebSocket-Befehl recorder/statistics_during_period
// (period day, type mean, Einheit mV) und als Stufen gezeichnet; Achse symmetrisch um 0, Farben aus dem Theme (E15).
// Je Pack ein Zwischenspeicher, neu geholt, wenn sich die Drift-Basis neu berechnet hat oder nach einer Stunde.
// Eigenes Element, damit ein Fehler beim Abruf oder Zeichnen nur diesen Block trifft (E10).
import { LitElement, html, css, svg, PropertyValues, TemplateResult } from 'lit';
import { Hass, HassEntity, exists, stateOf } from './entities';
import { DASH, fmt, packCell, snum } from './format';
import { fallback, sharedStyles, val } from './ui';

export const DRIFT_BASIS = 'sensor.zellen_drift_basis';
export const driftSensor = (n: number, side: 'hoch' | 'tief'): string => `sensor.zellen_drift_pack_${n}_${side}`;

const DAY = 86400000;
const SPAN_DAYS = 365;
const MIN_SPAN_DAYS = 7;
const MAX_AGE_MS = 3600000;
const NICE = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 50, 100];

export interface Point {
  t: number;
  v: number;
}

interface Entry {
  key: string;
  at: number;
  hoch: Point[];
  tief: Point[];
  err?: string;
}

interface StatRow {
  start: number | string;
  mean?: number | null;
}

function toPoints(rows: StatRow[] | undefined): Point[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ t: typeof r.start === 'number' ? r.start : Date.parse(String(r.start)), v: Number(r.mean) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

/** Naechster runder Wert fuer die halbe Achse (mV). */
export function niceMax(m: number): number {
  return NICE.find((x) => x >= m - 1e-9) ?? Math.ceil(m / 100) * 100;
}

function attrNum(s: HassEntity | undefined, key: string): number | undefined {
  const v = s?.attributes?.[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

const dm = (t: number): string => {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
};

export class PackCardDrift extends LitElement {
  static properties = {
    hass: { attribute: false },
    pack: { type: Number },
    _entry: { state: true },
    _loading: { state: true },
    _w: { state: true },
    _hover: { state: true },
  };

  hass?: Hass;
  pack = 0;
  private _cache = new Map<number, Entry>();
  private _entry?: Entry;
  private _loading = false;
  private _w = 0;
  private _hover?: number;
  private _ro?: ResizeObserver;
  private _req = 0;

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      .box {
        border: 1px solid var(--pc-line);
        border-radius: 10px;
        padding: 10px;
        min-width: 0;
        display: grid;
        gap: 6px;
      }
      h3 {
        font-size: 14px;
        font-weight: 500;
        margin: 0;
      }
      p {
        margin: 0;
        font-size: 12.5px;
        color: var(--pc-fg2);
      }
      .leg {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        font-size: 12.5px;
        align-items: center;
      }
      .leg i {
        display: inline-block;
        width: 14px;
        height: 3px;
        border-radius: 2px;
        vertical-align: 3px;
        margin-right: 5px;
      }
      .read {
        font-size: 12.5px;
        color: var(--pc-fg2);
        min-height: 1.4em;
        font-variant-numeric: tabular-nums;
      }
      .plot {
        position: relative;
        min-width: 0;
      }
      svg {
        display: block;
        width: 100%;
        touch-action: pan-y;
      }
      svg text {
        fill: var(--pc-fg2);
        font-size: 10.5px;
        font-variant-numeric: tabular-nums;
      }
      .grid line {
        stroke: var(--pc-line);
      }
      .zero {
        stroke: var(--pc-fg3);
      }
      .hi {
        stroke: var(--pc-ok);
      }
      .lo {
        stroke: var(--pc-bad);
      }
      .cur {
        stroke: var(--pc-fg3);
        stroke-dasharray: 3 3;
      }
      .msg {
        font-size: 12.5px;
        color: var(--pc-fg2);
        padding: 18px 4px;
        text-align: center;
      }
      .msg.err {
        color: var(--pc-bad);
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    try {
      this._ro = new ResizeObserver((es) => {
        const w = Math.round(es[0]?.contentRect.width ?? 0);
        if (w && Math.abs(w - this._w) > 1) this._w = w;
      });
      this._ro.observe(this);
    } catch {
      this._w = 600;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = undefined;
  }

  /** Schluessel des Datenstands: Rechenzeitpunkt der Drift-Basis. */
  private _key(): string {
    return stateOf(this.hass, DRIFT_BASIS)?.state ?? '';
  }

  protected updated(changed: PropertyValues): void {
    if (!changed.has('hass') && !changed.has('pack')) return;
    const n = this.pack;
    if (!n || !this.hass) return;
    const key = this._key();
    const c = this._cache.get(n);
    // Fehler erst nach einer Minute erneut versuchen, sonst bei jedem Zustandswechsel
    if (c && c.key === key && Date.now() - c.at < (c.err ? 60000 : MAX_AGE_MS)) {
      if (this._entry !== c) {
        this._entry = c;
        this._hover = undefined;
      }
      return;
    }
    if (changed.has('pack')) {
      this._entry = c;
      this._hover = undefined;
    }
    if (!this._loading || changed.has('pack')) void this._fetch(n, key);
  }

  private async _fetch(n: number, key: string): Promise<void> {
    const req = ++this._req;
    this._loading = true;
    const ids = [driftSensor(n, 'hoch'), driftSensor(n, 'tief')];
    let entry: Entry;
    try {
      if (!this.hass?.callWS) throw new Error('keine WebSocket-Verbindung');
      const start = new Date(Date.now() - SPAN_DAYS * DAY);
      start.setHours(0, 0, 0, 0);
      const res = await this.hass.callWS<Record<string, StatRow[]>>({
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        statistic_ids: ids,
        period: 'day',
        types: ['mean'],
        units: { voltage: 'mV' },
      });
      entry = { key, at: Date.now(), hoch: toPoints(res?.[ids[0]]), tief: toPoints(res?.[ids[1]]) };
    } catch (e) {
      console.warn(`pack-card: Drift Pack ${n} nicht abgerufen`, e);
      entry = { key, at: Date.now(), hoch: [], tief: [], err: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) };
    }
    this._cache.set(n, entry);
    if (req !== this._req) return;
    this._loading = false;
    if (n === this.pack) {
      this._entry = entry;
      this._hover = undefined;
    }
  }

  protected render(): TemplateResult {
    try {
      return this.renderBox();
    } catch (e) {
      return fallback('Drift', e);
    }
  }

  private renderBox(): TemplateResult {
    const n = this.pack;
    const basis = stateOf(this.hass, DRIFT_BASIS);
    const lead = (side: 'hoch' | 'tief') => {
      const z = attrNum(basis, `leit_${side}_${n}`);
      const v = attrNum(basis, `leit_${side}_abw_${n}`);
      const id = driftSensor(n, side);
      const label = html`<i style="background:var(${side === 'hoch' ? '--pc-ok' : '--pc-bad'})"></i>${side === 'hoch' ? 'hoch' : 'tief'}
        ${z !== undefined ? packCell(n, z) : DASH} · ${snum(v, 2, 'mV')}`;
      return exists(this.hass, id) ? val(this, this.hass, id, label, `lg-${side}`) : html`<span class="lg-${side}" title="${id} fehlt">${label}</span>`;
    };
    return html`<div class="box drift">
      <h3>Drift der Leitzellen · Pack ${n || DASH}</h3>
      <p>
        Tageswerte der Abweichung der jeweils führenden Zelle vom Packmittel, Charge, gleitend über 30 Tage (fest, unabhängig
        von den Filtern). Wandert eine Linie von 0 weg, entfernt sich die Zelle vom Pack.
      </p>
      <div class="leg">${lead('hoch')} ${lead('tief')}</div>
      ${this.renderPlot()}
    </div>`;
  }

  private renderPlot(): TemplateResult {
    const e = this._entry;
    if (!this.pack) return html`<div class="msg">Kein Pack gewählt.</div>`;
    if (!e) return html`<div class="msg">Drift wird geladen …</div>`;
    if (e.err) return html`<div class="msg err">Drift nicht abrufbar: ${e.err}</div>`;
    if (!e.hoch.length && !e.tief.length) {
      return html`<div class="msg">Noch keine Tageswerte in der Langzeitstatistik; der erste Wert entsteht eine Stunde nach dem Anlegen der Drift-Sensoren.</div>`;
    }
    const w = Math.max(280, this._w || 600);
    const narrow = w < 480;
    const h = narrow ? 170 : 210;
    const pl = 40;
    const pr = 10;
    const pt = 8;
    const pb = 22;
    const all = [...e.hoch, ...e.tief];
    const now = Date.now();
    const first = Math.min(...all.map((p) => p.t));
    const lastStart = Math.max(...all.map((p) => p.t));
    const t1 = Math.max(now, lastStart + DAY);
    const t0 = Math.min(first, t1 - MIN_SPAN_DAYS * DAY);
    const m = niceMax(Math.max(0.5, ...all.map((p) => Math.abs(p.v))));
    const x = (t: number) => pl + ((t - t0) / (t1 - t0)) * (w - pl - pr);
    const y0 = pt + (h - pt - pb) / 2;
    const y = (v: number) => y0 - (v / m) * ((h - pt - pb) / 2);
    const step = (pts: Point[]) =>
      pts
        .map((p, i) => {
          const xe = x(i + 1 < pts.length ? pts[i + 1].t : Math.min(t1, p.t + DAY));
          return `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)} H${xe.toFixed(1)}`;
        })
        .join(' ');
    const ticksY = [-m, -m / 2, m / 2, m];
    const nx = narrow ? 3 : 5;
    const ticksX = Array.from({ length: nx }, (_, i) => t0 + ((t1 - t0) * i) / (nx - 1));
    const days = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b);
    const hv = this._hover !== undefined ? days[this._hover] : undefined;
    const at = (pts: Point[], t: number | undefined) => (t === undefined ? undefined : pts.find((p) => p.t === t)?.v);
    const move = (ev: PointerEvent) => {
      const box = (ev.currentTarget as SVGSVGElement).getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * w;
      let best = 0;
      let bd = Infinity;
      days.forEach((t, i) => {
        const d = Math.abs(x(t + DAY / 2) - px);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      this._hover = best;
    };
    return html`<div class="read">
        ${hv !== undefined
          ? `${dm(hv)}: hoch ${snum(at(e.hoch, hv), 2, 'mV')} · tief ${snum(at(e.tief, hv), 2, 'mV')}`
          : `${days.length} Tage, ${dm(days[0])} bis ${dm(days[days.length - 1])}; Achse ±${fmt(m, 1)} mV`}
      </div>
      <div class="plot">
        <svg
          viewBox="0 0 ${w} ${h}"
          height=${h}
          role="img"
          aria-label="Drift der Leitzellen"
          @pointermove=${move}
          @pointerdown=${move}
          @pointerleave=${() => (this._hover = undefined)}
        >
          <g class="grid">
            ${ticksY.map(
              (t) => svg`<line x1=${pl} x2=${w - pr} y1=${y(t)} y2=${y(t)}></line>
                <text x=${pl - 6} y=${y(t) + 3.5} text-anchor="end">${snum(t, m < 2 ? 1 : 0)}</text>`,
            )}
          </g>
          <line class="zero" x1=${pl} x2=${w - pr} y1=${y0} y2=${y0}></line>
          <text x=${pl - 6} y=${y0 + 3.5} text-anchor="end">0</text>
          ${ticksX.map(
            (t, i) => svg`<text x=${x(t)} y=${h - 6} text-anchor=${i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle'}>${dm(t)}</text>`,
          )}
          ${hv !== undefined ? svg`<line class="cur" x1=${x(hv + DAY / 2)} x2=${x(hv + DAY / 2)} y1=${pt} y2=${h - pb}></line>` : ''}
          ${e.hoch.length ? svg`<path class="hi" d=${step(e.hoch)} fill="none" stroke-width="2"></path>` : ''}
          ${e.tief.length ? svg`<path class="lo" d=${step(e.tief)} fill="none" stroke-width="2"></path>` : ''}
        </svg>
      </div>`;
  }
}
