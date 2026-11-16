// View zellen (A01d E18, A01c): filter row with the helpers from E6, key figures of the selected pack, two matrices
// over all cells (deviation from the pack mean, share of the extreme within the pack) and below them the drift of the lead cells
// (own element pack-card-drift, A01c E6). Data source are the sql sensors of the cell evaluation (A01c E9):
// sensor.zellen_pack_<n> with the values as attributes and sensor.zellen_status with calculation time and data basis.
// Clicking a pack row sets input_select.zellen_pack (E6). Each block and each matrix row in its own try/catch
// with a visible fallback (E10). Below 600 px width, cells 1-8 and 9-16 are shown in two matrices one above the other (R4).
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, HassEntity, PackConfig, ZELLEN_PACK, exists, isAvailable, stateOf } from './entities';
import { DASH, fmt, num, packCell, signed, snum } from './format';
import { fallback, navigate, selectPack, sharedStyles, val, viewPath } from './ui';

export const ZEITRAUM = 'input_select.zellen_zeitraum';
export const ZUSTAND = 'input_select.zellen_zustand';

/** Display of the helper values: Laden, Entladen and Ruhe are called Charge, Discharge and Idle in the card; the helper value stays (A01c). */
const OPT_LABEL: Record<string, string> = { Laden: 'Charge', Entladen: 'Discharge', Ruhe: 'Idle' };
const optLabel = (o: string): string => OPT_LABEL[o] ?? o;
export const SPREIZUNG = 'input_number.zellen_mindestspreizung';
export const STATUS = 'sensor.zellen_status';
export const zellenSensor = (n: number): string => `sensor.zellen_pack_${n}`;

const CELLS = Array.from({ length: 16 }, (_, i) => i + 1);
const HALVES = [CELLS.slice(0, 8), CELLS.slice(8)];

/** Attribute as number, otherwise undefined. */
function attrNum(s: HassEntity | undefined, key: string): number | undefined {
  const v = s?.attributes?.[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function attrText(s: HassEntity | undefined, key: string): string | undefined {
  const v = s?.attributes?.[key];
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Timestamp "02.11. 09:28" in the browser's time zone. */
export function shortTime(iso: string | undefined, withTime = true): string {
  if (!iso) return DASH;
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return DASH;
  const p = (x: number) => String(x).padStart(2, '0');
  const d = `${p(t.getDate())}.${p(t.getMonth() + 1)}.`;
  return withTime ? `${d} ${p(t.getHours())}:${p(t.getMinutes())}` : d;
}

interface PackData {
  p: PackConfig;
  s?: HassEntity;
  abw: (number | undefined)[];
  hoch: (number | undefined)[];
  tief: (number | undefined)[];
  leitHoch?: number;
  leitTief?: number;
}

function packData(hass: Hass | undefined, p: PackConfig): PackData {
  const s = stateOf(hass, zellenSensor(p.pack));
  return {
    p,
    s,
    abw: CELLS.map((z) => attrNum(s, `abw_${z}`)),
    hoch: CELLS.map((z) => attrNum(s, `anteil_hoch_${z}`)),
    tief: CELLS.map((z) => attrNum(s, `anteil_tief_${z}`)),
    leitHoch: attrNum(s, 'leit_hoch'),
    leitTief: attrNum(s, 'leit_tief'),
  };
}

export class PackCardZellen extends LitElement {
  static properties = {
    hass: { attribute: false },
    packs: { attribute: false },
    speicherPath: {},
    packPath: {},
    _busy: { state: true },
  };

  hass?: Hass;
  packs: PackConfig[] = [];
  speicherPath = 'speicher';
  packPath = 'pack';
  /** recalculation triggered, until the calculation time changes */
  private _busy = false;
  private _busyFrom = '';

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      .zv {
        container-type: inline-size;
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        flex-wrap: wrap;
      }
      .head .sub {
        color: var(--pc-fg2);
        font-weight: var(--ha-font-weight-medium, 500);
      }
      .filt select:focus-visible,
      .filt input:focus-visible,
      .kpi:focus-visible,
      .hm-c:focus-visible,
      .hl:focus-visible {
        outline: 2px solid var(--pc-accent);
        outline-offset: 1px;
      }
      .filt {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        align-items: end;
        padding: 12px 16px;
      }
      .filt label {
        display: grid;
        gap: 4px;
        font-size: var(--pc-fs-s);
        line-height: 1.2;
        color: var(--pc-fg2);
      }
      .filt select,
      .filt input {
        font: inherit;
        font-size: var(--pc-fs-m);
        color: var(--pc-fg);
        background: var(--pc-raise);
        border: 0;
        border-radius: var(--pc-r-md);
        padding: 8px 12px;
      }
      .filt input {
        width: 84px;
      }
      .filt .when {
        font-size: var(--pc-fs-s);
        color: var(--pc-fg2);
        display: grid;
        gap: 2px;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 8px;
      }
      /* key figures as cards in the style of the tile card (E26) */
      .kpi {
        border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--pc-line));
        border-radius: var(--pc-r-lg);
        padding: 8px 12px;
        display: grid;
        gap: 2px;
        background: var(--pc-card);
        color: var(--pc-fg);
        text-align: left;
        cursor: pointer;
        font: inherit;
        min-width: 0;
      }
      .kpi:hover:not(:disabled) {
        background: var(--pc-raise);
      }
      .kpi .lbl {
        font-size: var(--pc-fs-m);
        font-weight: var(--ha-font-weight-medium, 500);
        color: var(--pc-fg);
      }
      .kpi .x {
        font-size: var(--pc-fs-xl);
        font-weight: var(--ha-font-weight-normal, 400);
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
      .kpi .y {
        font-size: var(--pc-fs-s);
        color: var(--pc-fg2);
      }
      .box {
        padding: 12px 16px 16px;
        min-width: 0;
      }
      .box h3 {
        font-size: var(--pc-fs-l);
        font-weight: var(--ha-font-weight-normal, 400);
        margin: 0 0 4px;
      }
      .box p {
        margin: 0 0 8px;
        font-size: var(--pc-fs-s);
        color: var(--pc-fg2);
      }
      .hm {
        display: grid;
        gap: 3px;
      }
      .hm + .hm {
        margin-top: 10px;
      }
      .hm-row {
        display: grid;
        grid-template-columns: 64px repeat(var(--n), minmax(0, 1fr));
        gap: 3px;
        align-items: stretch;
        border-radius: var(--pc-r-md);
      }
      .hm-row.sel {
        outline: 2px solid var(--pc-accent);
        outline-offset: 1px;
      }
      .hl {
        font: inherit;
        font-size: var(--pc-fs-s);
        display: flex;
        align-items: center;
        border: 0;
        background: none;
        cursor: pointer;
        color: var(--pc-accent);
        font-weight: 500;
        padding: 0;
        text-align: left;
      }
      .hm-head {
        font-size: var(--pc-fs-s);
        color: var(--pc-fg3);
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .hm-c {
        min-height: 28px;
        border-radius: var(--pc-r-sm);
        font: inherit;
        font-size: var(--pc-fs-s);
        line-height: 1.1;
        display: grid;
        place-items: center;
        color: var(--pc-fg);
        border: 1px solid transparent;
        cursor: pointer;
        padding: 1px 0;
        font-variant-numeric: tabular-nums;
        min-width: 0;
        overflow: hidden;
        background: var(--pc-raise);
      }
      .hm-c.top {
        border-color: var(--pc-fg);
      }
      .hm-c.miss {
        color: var(--pc-fg3);
      }
      .halves {
        display: none;
      }
      .tag {
        font-size: var(--pc-fs-s);
      }
      @container (max-width: 599px) {
        .wide {
          display: none;
        }
        .halves {
          display: block;
        }
        .hm-row {
          grid-template-columns: 46px repeat(var(--n), minmax(0, 1fr));
        }
        .kpis {
          grid-template-columns: 1fr 1fr;
        }
        .kpi {
          padding: 8px;
        }
        .kpi .x {
          font-size: var(--pc-fs-l);
        }
      }
    `,
  ];

  /** Selected pack from input_select.zellen_pack, otherwise the first configured one (as in the pack view). */
  private current(): PackConfig | undefined {
    const st = stateOf(this.hass, ZELLEN_PACK)?.state;
    const m = st ? /^Pack_(\d+)$/.exec(st) : null;
    const n = m ? Number(m[1]) : NaN;
    return this.packs.find((p) => p.pack === n) ?? this.packs[0];
  }

  protected willUpdate(): void {
    // recalculation counts as done as soon as the status reports a new calculation time
    if (this._busy && stateOf(this.hass, STATUS)?.state !== this._busyFrom) this._busy = false;
  }

  protected render(): TemplateResult {
    const cur = this.current();
    const data = this.packs.map((p) => {
      try {
        return packData(this.hass, p);
      } catch (e) {
        console.warn(`pack-card: Zellwerte Pack ${p.pack}`, e);
        return { p, abw: [], hoch: [], tief: [] } as PackData;
      }
    });
    const sel = data.find((d) => d.p.pack === cur?.pack);
    return html`<div class="zv">
      ${this.block('Kopf', () => this.renderHead(cur))} ${this.block('Filter', () => this.renderFilter())}
      ${this.block('Kennzahlen', () => this.renderKpis(sel))} ${this.block('Abweichung', () => this.renderDev(data, cur))}
      ${this.block('Anteil am Extrem', () => this.renderShare(data, cur))}
      <pack-card-drift .hass=${this.hass} .pack=${cur?.pack ?? 0}></pack-card-drift>
    </div>`;
  }

  private block(what: string, fn: () => TemplateResult): TemplateResult {
    try {
      return fn();
    } catch (e) {
      return fallback(what, e);
    }
  }

  private renderHead(cur: PackConfig | undefined): TemplateResult {
    const n = cur?.pack;
    return html`<div class="head">
      <button type="button" class="link" @click=${() => navigate(viewPath(this.speicherPath))}>← Speicher</button>
      <h2 class="ttl">Zellanalyse</h2>
      <span class="sub">${this.packs.length * 16} Zellen · gewählt Pack ${n ?? DASH}</span>
      <span class="sp"></span>
      ${n !== undefined
        ? html`<button type="button" class="btn" @click=${() => navigate(viewPath(this.packPath))}>Pack ${n}</button>`
        : ''}
    </div>`;
  }

  private renderFilter(): TemplateResult {
    const hass = this.hass;
    const status = stateOf(hass, STATUS);
    const sel = (id: string, label: string, cls: string) => {
      const s = stateOf(hass, id);
      const opts = Array.isArray(s?.attributes?.options) ? (s!.attributes.options as unknown[]).map(String) : [];
      const ok = !!s && isAvailable(hass, id) && opts.length > 0;
      return html`<label class=${cls}
        >${label}<select
          ?disabled=${!ok}
          title=${ok ? id : `${id} fehlt oder ist nicht verfügbar`}
          @change=${(e: Event) => this._select(id, (e.target as HTMLSelectElement).value)}
        >
          ${ok ? opts.map((o) => html`<option value=${o} ?selected=${o === s!.state}>${optLabel(o)}</option>`) : html`<option>${DASH}</option>`}
        </select></label
      >`;
    };
    const sp = stateOf(hass, SPREIZUNG);
    const spOk = !!sp && Number.isFinite(Number(sp.state));
    const a = (k: string, d: number) => {
      const v = attrNum(sp, k);
      return v === undefined ? String(d) : String(v);
    };
    // is the calculation lagging behind the helpers? State, period and threshold of the status against the helpers
    const stale = this._stale(status);
    const zellen = attrNum(status, 'zellsensoren');
    const strom = attrNum(status, 'stromsensoren');
    const basisOk = zellen === this.packs.length * 16 && strom === this.packs.length;
    return html`<div class="filt surf">
      ${sel(ZEITRAUM, 'Zeitraum', 'f-zeit')} ${sel(ZUSTAND, 'Zustand', 'f-zust')}
      <label class="f-spr"
        >Mindestspreizung mV<input
          type="number"
          inputmode="decimal"
          min=${a('min', 0)}
          max=${a('max', 2)}
          step=${a('step', 0.1)}
          .value=${spOk ? String(Number(sp!.state)) : ''}
          ?disabled=${!spOk}
          title=${spOk ? SPREIZUNG : `${SPREIZUNG} fehlt oder ist nicht verfügbar`}
          @change=${(e: Event) => this._spread((e.target as HTMLInputElement).value)}
      /></label>
      <span class="when">
        <span
          >berechnet
          ${exists(hass, STATUS)
            ? val(this, hass, STATUS, shortTime(attrText(status, 'berechnet') ?? status?.state))
            : html`<span title="${STATUS} fehlt">${DASH}</span>`}
          ${this._busy || stale ? html`<span class="tag warn">rechnet …</span>` : ''}</span
        >
        <span
          >Daten ab ${shortTime(attrText(status, 'daten_von'), false)} ·
          <span class=${basisOk ? '' : 'tag warn'} title="Zell- und Stromsensoren mit Statistik"
            >${num(zellen, 0)}/${this.packs.length * 16} Zellen, ${num(strom, 0)}/${this.packs.length} Strom</span
          ></span
        >
      </span>
      <span class="sp"></span>
      <button
        type="button"
        class="btn recalc"
        ?disabled=${!hass?.callService || this._busy}
        title="sql-Sensoren der Zellauswertung jetzt neu rechnen"
        @click=${() => this._recalc()}
      >
        Neu berechnen
      </button>
    </div>`;
  }

  private _stale(status: HassEntity | undefined): boolean {
    if (!status) return false;
    const z = stateOf(this.hass, ZEITRAUM)?.state;
    const zu = stateOf(this.hass, ZUSTAND)?.state;
    const sp = Number(stateOf(this.hass, SPREIZUNG)?.state);
    const sz = attrText(status, 'zeitraum');
    const szu = attrText(status, 'zustand');
    const ssp = attrNum(status, 'schwelle_mv');
    return (
      (z !== undefined && sz !== undefined && z !== sz) ||
      (zu !== undefined && szu !== undefined && zu.toLowerCase() !== szu.toLowerCase()) ||
      (Number.isFinite(sp) && ssp !== undefined && Math.abs(sp - ssp) > 1e-6)
    );
  }

  private renderKpis(d: PackData | undefined): TemplateResult {
    const s = d?.s;
    const n = d?.p.pack;
    const id = n !== undefined ? zellenSensor(n) : '';
    const ok = !!id && exists(this.hass, id);
    const kpi = (cls: string, label: string, x: string, y: string) => html`<button
      type="button"
      class="kpi ${cls}"
      ?disabled=${!ok}
      title=${ok ? id : `${id || 'Ergebnissensor'} fehlt`}
      @click=${() => ok && this._more(id)}
    >
      <span class="lbl">${label}</span><span class="x">${x}</span><span class="y">${y}</span>
    </button>`;
    const hi = d?.leitHoch;
    const lo = d?.leitTief;
    const stunden = attrNum(s, 'stunden');
    const gew = attrNum(s, 'stunden_gewertet');
    return html`<div class="kpis">
      ${kpi(
        'k-hoch',
        'Leitzelle hoch',
        n !== undefined && hi !== undefined ? packCell(n, hi) : DASH,
        `${num(attrNum(s, 'leit_hoch_anteil'), 1, '%')} der Stunden · ${snum(attrNum(s, 'leit_hoch_abw'), 2, 'mV')}`,
      )}
      ${kpi(
        'k-tief',
        'Leitzelle tief',
        n !== undefined && lo !== undefined ? packCell(n, lo) : DASH,
        `${num(attrNum(s, 'leit_tief_anteil'), 1, '%')} der Stunden · ${snum(attrNum(s, 'leit_tief_abw'), 2, 'mV')}`,
      )}
      ${kpi(
        'k-spr',
        'Spreizung im Mittel',
        num(attrNum(s, 'spreizung_mittel'), 2, 'mV'),
        `höchste Stunde ${num(attrNum(s, 'spreizung_max'), 1, 'mV')}`,
      )}
      ${kpi(
        'k-ohne',
        'Ohne klares Extrem',
        num(attrNum(s, 'ohne_extrem'), 1, '%'),
        `${num(gew, 0)} von ${num(stunden, 0)} Stunden gewertet`,
      )}
    </div>`;
  }

  private renderDev(data: PackData[], cur: PackConfig | undefined): TemplateResult {
    let vmax = 0;
    for (const d of data) for (const v of d.abw) if (v !== undefined) vmax = Math.max(vmax, Math.abs(v));
    const cell = (d: PackData, z: number) => {
      const v = d.abw[z - 1];
      if (v === undefined) return html`<button type="button" class="hm-c miss" data-cell=${z} @click=${() => this._pick(d.p.pack)}>${DASH}</button>`;
      const a = Math.round(Math.min(1, Math.abs(v) / (vmax || 1)) * 70);
      const col = v >= 0 ? 'var(--pc-warn)' : 'var(--pc-low)';
      const lead = z === d.leitHoch || z === d.leitTief;
      return html`<button
        type="button"
        class="hm-c ${lead ? 'top' : ''}"
        data-cell=${z}
        style="background:color-mix(in srgb,${col} ${a}%,var(--pc-raise))"
        title="${packCell(d.p.pack, z)}: ${signed(v, 2)} mV zum Packmittel"
        @click=${() => this._pick(d.p.pack)}
      >${signed(v, 1)}</button>`;
    };
    return html`<div class="box dev surf">
      <h3>Abweichung vom Packmittel</h3>
      <p>mV je Zelle, gemittelt über die Stunden des Zustands; orange über, blau unter dem Packmittel, umrandet die Leitzellen. Klick wählt das Pack.</p>
      ${this.matrix(data, cur, cell)}
    </div>`;
  }

  private renderShare(data: PackData[], cur: PackConfig | undefined): TemplateResult {
    const cell = (d: PackData, z: number) => {
      const up = d.hoch[z - 1];
      const dn = d.tief[z - 1];
      if (up === undefined && dn === undefined) {
        return html`<button type="button" class="hm-c miss" data-cell=${z} @click=${() => this._pick(d.p.pack)}>${DASH}</button>`;
      }
      const u = up ?? 0;
      const t = dn ?? 0;
      const bg =
        u >= t && u > 0
          ? `color-mix(in srgb,var(--pc-ok) ${Math.round(Math.min(100, u) * 0.7)}%,var(--pc-raise))`
          : t > 0
            ? `color-mix(in srgb,var(--pc-bad) ${Math.round(Math.min(100, t) * 0.7)}%,var(--pc-raise))`
            : 'var(--pc-raise)';
      const parts: string[] = [];
      if (u > 0) parts.push(`höchste in ${fmt(u, 1)} %`);
      if (t > 0) parts.push(`niedrigste in ${fmt(t, 1)} %`);
      return html`<button
        type="button"
        class="hm-c"
        data-cell=${z}
        style="background:${bg}"
        title="${packCell(d.p.pack, z)}: ${parts.length ? parts.join(', ') : 'nie Extrem'}"
        @click=${() => this._pick(d.p.pack)}
      >${u > 0 ? html`<span>▲${Math.round(u)}</span>` : ''}${t > 0 ? html`<span>▼${Math.round(t)}</span>` : ''}</button>`;
    };
    return html`<div class="box share surf">
      <h3>Anteil am Extrem im Pack</h3>
      <p>▲ höchste, ▼ niedrigste Zelle ihres Packs, Anteil der Stunden des Zustands in %; gewertet nur Stunden ab der Mindestspreizung mit genau einer Extremzelle.</p>
      ${this.matrix(data, cur, cell)}
    </div>`;
  }

  /** Matrix wide (16 columns) and narrow (twice 8 columns stacked); depending on the width one of them is visible (R4). */
  private matrix(data: PackData[], cur: PackConfig | undefined, cell: (d: PackData, z: number) => TemplateResult): TemplateResult {
    const grid = (cols: number[], narrow: boolean) => html`<div class="hm" style="--n:${cols.length}">
      <div class="hm-row hm-hd"><span></span>${cols.map((z) => html`<span class="hm-head">${String(z).padStart(2, '0')}</span>`)}</div>
      ${data.map((d) => {
        try {
          return html`<div class="hm-row ${d.p.pack === cur?.pack ? 'sel' : ''}" data-pack=${d.p.pack}>
            <button type="button" class="hl" title="Pack ${d.p.pack} wählen" @click=${() => this._pick(d.p.pack)}>
              ${narrow ? `P${d.p.pack}` : `Pack ${d.p.pack}`}
            </button>
            ${cols.map((z) => cell(d, z))}
          </div>`;
        } catch (e) {
          return fallback(`Pack ${d.p.pack}`, e);
        }
      })}
    </div>`;
    return html`<div class="wide">${grid(CELLS, false)}</div>
      <div class="halves">${HALVES.map((h) => grid(h, true))}</div>`;
  }

  private _more(entityId: string): void {
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  private _pick(n: number): void {
    void selectPack(this.hass, n);
  }

  private async _select(id: string, option: string): Promise<void> {
    try {
      await this.hass?.callService?.('input_select', 'select_option', { entity_id: id, option });
    } catch (e) {
      console.warn(`pack-card: ${id} nicht gesetzt`, e);
    }
  }

  private async _spread(raw: string): Promise<void> {
    const sp = stateOf(this.hass, SPREIZUNG);
    let v = Number(String(raw).replace(',', '.'));
    if (!sp || !Number.isFinite(v)) return;
    const min = attrNum(sp, 'min') ?? 0;
    const max = attrNum(sp, 'max') ?? 2;
    const step = attrNum(sp, 'step') ?? 0.1;
    v = Math.min(max, Math.max(min, Math.round(v / step) * step));
    v = Math.round(v * 1000) / 1000;
    if (Math.abs(v - Number(sp.state)) < 1e-9) {
      this.requestUpdate();
      return;
    }
    try {
      await this.hass?.callService?.('input_number', 'set_value', { entity_id: SPREIZUNG, value: v });
    } catch (e) {
      console.warn(`pack-card: ${SPREIZUNG} nicht gesetzt`, e);
    }
  }

  /** Recalculate: compute the sql sensors of the packs and the status immediately (homeassistant.update_entity). */
  private async _recalc(): Promise<void> {
    const ids = [...this.packs.map((p) => zellenSensor(p.pack)), STATUS].filter((id) => exists(this.hass, id));
    if (!ids.length || !this.hass?.callService) return;
    this._busyFrom = stateOf(this.hass, STATUS)?.state ?? '';
    this._busy = true;
    // safeguard: without a new calculation time the button is released again after 30 s
    window.setTimeout(() => (this._busy = false), 30000);
    try {
      await this.hass.callService('homeassistant', 'update_entity', { entity_id: ids });
    } catch (e) {
      console.warn('pack-card: Neuberechnung nicht ausgelöst', e);
      this._busy = false;
    }
  }
}
