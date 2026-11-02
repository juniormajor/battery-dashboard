// Ansicht zellen (A01d E18, A01c): Filterzeile mit den Helfern aus E6, Kennzahlen des gewaehlten Packs, zwei Matrizen
// ueber alle Zellen (Abweichung vom Packmittel, Anteil am Extrem im Pack) und darunter die Drift der Leitzellen
// (eigenes Element pack-card-drift, A01c E6). Datenquelle sind die sql-Sensoren der Zellauswertung (A01c E9):
// sensor.zellen_pack_<n> mit den Werten als Attributen und sensor.zellen_status mit Rechenzeitpunkt und Datenbasis.
// Klick auf eine Packzeile setzt input_select.zellen_pack (E6). Jeder Block und jede Matrixzeile in eigenem try/catch
// mit sichtbarem Rueckfall (E10). Unter 600 px Breite stehen die Zellen 1-8 und 9-16 in zwei Matrizen untereinander (R4).
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, HassEntity, PackConfig, ZELLEN_PACK, exists, isAvailable, stateOf } from './entities';
import { DASH, fmt, num, packCell, signed, snum } from './format';
import { fallback, navigate, selectPack, sharedStyles, val, viewPath } from './ui';

export const ZEITRAUM = 'input_select.zellen_zeitraum';
export const ZUSTAND = 'input_select.zellen_zustand';

/** Anzeige der Helferwerte: Laden und Entladen heissen in der Karte Charge und Discharge; der Helferwert bleibt (A01c). */
const OPT_LABEL: Record<string, string> = { Laden: 'Charge', Entladen: 'Discharge' };
const optLabel = (o: string): string => OPT_LABEL[o] ?? o;
export const SPREIZUNG = 'input_number.zellen_mindestspreizung';
export const STATUS = 'sensor.zellen_status';
export const zellenSensor = (n: number): string => `sensor.zellen_pack_${n}`;

const CELLS = Array.from({ length: 16 }, (_, i) => i + 1);
const HALVES = [CELLS.slice(0, 8), CELLS.slice(8)];

/** Attribut als Zahl, sonst undefined. */
function attrNum(s: HassEntity | undefined, key: string): number | undefined {
  const v = s?.attributes?.[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function attrText(s: HassEntity | undefined, key: string): string | undefined {
  const v = s?.attributes?.[key];
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Zeitpunkt „02.11. 09:28“ in der Zeitzone des Browsers. */
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
  /** Neu berechnen angestossen, bis der Rechenzeitpunkt sich aendert */
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
        gap: 12px;
        min-width: 0;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 6px 10px;
        flex-wrap: wrap;
      }
      .head h2 {
        font-size: 20px;
        font-weight: 500;
        margin: 0;
      }
      .head .sub {
        color: var(--pc-fg2);
        font-size: 13px;
      }
      .btn {
        border: 1px solid var(--pc-line);
        background: var(--pc-raise);
        color: var(--pc-fg);
        border-radius: 8px;
        padding: 5px 11px;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        white-space: nowrap;
      }
      .btn:hover:not(:disabled) {
        border-color: var(--pc-fg3);
      }
      .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .btn:focus-visible,
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
        gap: 8px 14px;
        align-items: end;
        padding: 10px;
        border-radius: 10px;
        background: var(--pc-raise);
      }
      .filt label {
        display: grid;
        gap: 3px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--pc-fg3);
      }
      .filt select,
      .filt input {
        font: inherit;
        font-size: 13px;
        color: var(--pc-fg);
        background: var(--pc-card);
        border: 1px solid var(--pc-line);
        border-radius: 7px;
        padding: 5px 7px;
        text-transform: none;
        letter-spacing: 0;
      }
      .filt input {
        width: 84px;
      }
      .filt .when {
        font-size: 12.5px;
        color: var(--pc-fg2);
        display: grid;
        gap: 2px;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 8px;
      }
      .kpi {
        border: 1px solid var(--pc-line);
        border-radius: 10px;
        padding: 8px 12px;
        display: grid;
        gap: 1px;
        background: var(--pc-card);
        color: var(--pc-fg);
        text-align: left;
        cursor: pointer;
        font: inherit;
        min-width: 0;
      }
      .kpi:hover:not(:disabled) {
        border-color: var(--pc-fg3);
      }
      .kpi .lbl {
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--pc-fg3);
      }
      .kpi .x {
        font-size: 18px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }
      .kpi .y {
        font-size: 12.5px;
        color: var(--pc-fg2);
      }
      .box {
        border: 1px solid var(--pc-line);
        border-radius: 10px;
        padding: 10px;
        min-width: 0;
      }
      .box h3 {
        font-size: 14px;
        font-weight: 500;
        margin: 0 0 2px;
      }
      .box p {
        margin: 0 0 8px;
        font-size: 12.5px;
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
        border-radius: 6px;
      }
      .hm-row.sel {
        outline: 2px solid var(--pc-accent);
        outline-offset: 1px;
      }
      .hl {
        font: inherit;
        font-size: 12px;
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
        font-size: 10.5px;
        color: var(--pc-fg3);
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .hm-c {
        min-height: 28px;
        border-radius: 4px;
        font: inherit;
        font-size: 10.5px;
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
        font-size: 11.5px;
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
          padding: 6px 8px;
        }
        .kpi .x {
          font-size: 16px;
        }
      }
    `,
  ];

  /** Gewaehltes Pack aus input_select.zellen_pack, sonst das erste konfigurierte (wie die Packansicht). */
  private current(): PackConfig | undefined {
    const st = stateOf(this.hass, ZELLEN_PACK)?.state;
    const m = st ? /^Pack_(\d+)$/.exec(st) : null;
    const n = m ? Number(m[1]) : NaN;
    return this.packs.find((p) => p.pack === n) ?? this.packs[0];
  }

  protected willUpdate(): void {
    // Neu berechnen gilt als erledigt, sobald der Status einen neuen Rechenzeitpunkt meldet
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
      <h2>Zellanalyse</h2>
      <span class="sub">${this.packs.length * 16} Zellen · gewählt Pack ${n ?? DASH}</span>
      <span class="sp"></span>
      ${n !== undefined
        ? html`<button type="button" class="link" @click=${() => navigate(viewPath(this.packPath))}>Pack ${n} →</button>`
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
    // Laeuft die Rechnung den Helfern hinterher? Zustand, Zeitraum und Schwelle des Status gegen die Helfer
    const stale = this._stale(status);
    const zellen = attrNum(status, 'zellsensoren');
    const strom = attrNum(status, 'stromsensoren');
    const basisOk = zellen === this.packs.length * 16 && strom === this.packs.length;
    return html`<div class="filt">
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
    return html`<div class="box dev">
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
    return html`<div class="box share">
      <h3>Anteil am Extrem im Pack</h3>
      <p>▲ höchste, ▼ niedrigste Zelle ihres Packs, Anteil der Stunden des Zustands in %; gewertet nur Stunden ab der Mindestspreizung mit genau einer Extremzelle.</p>
      ${this.matrix(data, cur, cell)}
    </div>`;
  }

  /** Matrix breit (16 Spalten) und schmal (zweimal 8 Spalten untereinander); sichtbar ist je nach Breite eine (R4). */
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

  /** Neu berechnen: die sql-Sensoren der Packs und den Status sofort rechnen (homeassistant.update_entity). */
  private async _recalc(): Promise<void> {
    const ids = [...this.packs.map((p) => zellenSensor(p.pack)), STATUS].filter((id) => exists(this.hass, id));
    if (!ids.length || !this.hass?.callService) return;
    this._busyFrom = stateOf(this.hass, STATUS)?.state ?? '';
    this._busy = true;
    // Sicherung: ohne neuen Rechenzeitpunkt gibt der Knopf nach 30 s wieder frei
    window.setTimeout(() => (this._busy = false), 30000);
    try {
      await this.hass.callService('homeassistant', 'update_entity', { entity_id: ids });
    } catch (e) {
      console.warn('pack-card: Neuberechnung nicht ausgelöst', e);
      this._busy = false;
    }
  }
}
