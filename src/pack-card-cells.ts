// Zellblock der Packansicht (A01d E19): 16 Zellen in zwei Spalten (1–8 links, 9–16 rechts wie jk-bms-card) mit
// Spannung und Innenwiderstand, hoechste Zelle gruen, niedrigste rot umrandet, Hintergrund nach Abweichung vom
// Packmittel (Mockup devClass). Bei Balancing-Strom ungleich 0 die Linie von der hoechsten zur niedrigsten Zelle als
// SVG ueber dem Raster (jk-bms-card _updateFlowLine), die Zellen des Balancers pulsierend markiert. Ohne Begleitzeile
// zu Minimum, Maximum und Delta (E19). Eigenes Element, damit ein Fehler auf den Block begrenzt bleibt (E10).
import { LitElement, html, css, PropertyValues, TemplateResult } from 'lit';
import { Hass, PackConfig, numberOf, packEntity, unitOf } from './entities';
import { num, packCell, signed } from './format';
import { CELLS, balancerState, extremeCells } from './pack-parts';
import { fallback, sharedStyles, val } from './ui';

/** Hintergrund nach Abweichung vom Packmittel in mV (Mockup: ueber 2, 5 und 10 mV). */
function devClass(mv: number | undefined): string {
  if (mv === undefined) return '';
  const a = Math.abs(mv);
  return a > 10 ? 'd-bad' : a > 5 ? 'd-warn' : a > 2 ? 'd-soft' : '';
}

const pad2 = (i: number): string => String(i).padStart(2, '0');

export class PackCardCells extends LitElement {
  static properties = {
    hass: { attribute: false },
    pack: { attribute: false },
  };

  hass?: Hass;
  pack?: PackConfig;
  private _flow?: { max: number; min: number };
  private _ro?: ResizeObserver;
  private _raf?: number;

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      .box {
        container-type: inline-size;
        border: 1px solid var(--pc-line);
        border-radius: 10px;
        padding: 8px 10px 10px;
        display: grid;
        gap: 6px;
      }
      .title {
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--pc-fg3);
      }
      .grid {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        column-gap: 30px;
        row-gap: 3px;
      }
      .ch {
        display: flex;
        justify-content: space-between;
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--pc-fg3);
        padding: 0 8px;
      }
      .cell {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 2px 6px;
        border-radius: 6px;
        border: 1px solid var(--pc-line);
        background: var(--pc-card);
        min-width: 0;
        font-size: 13px;
        line-height: 1.5;
      }
      .cell .uv {
        display: inline-flex;
        gap: 8px;
        align-items: baseline;
        min-width: 0;
        white-space: nowrap;
      }
      .cell .n {
        font-size: 11.5px;
        color: var(--pc-fg2);
        min-width: 1.6em;
      }
      .cell .cv {
        font-weight: 500;
      }
      .cell .cr {
        font-size: 12px;
        color: var(--pc-fg2);
        white-space: nowrap;
      }
      .cell.d-soft {
        background: color-mix(in srgb, var(--pc-soft) 12%, var(--pc-card));
      }
      .cell.d-warn {
        background: color-mix(in srgb, var(--pc-warn) 14%, var(--pc-card));
      }
      .cell.d-bad {
        background: color-mix(in srgb, var(--pc-bad) 14%, var(--pc-card));
      }
      .cell.mx {
        border-color: var(--pc-ok);
        box-shadow: 0 0 0 1px var(--pc-ok);
      }
      .cell.mn {
        border-color: var(--pc-bad);
        box-shadow: 0 0 0 1px var(--pc-bad);
      }
      /* Balancer-Zellen: pulsierender Umriss; outline statt Pseudoelement, damit nichts ueber die Zelle hinaus Platz braucht */
      .cell.bm {
        outline: 2px solid var(--pc-bal);
        outline-offset: 2px;
        animation: pulse 1.4s ease-in-out infinite;
      }
      @keyframes pulse {
        50% {
          outline-color: color-mix(in srgb, var(--pc-bal) 20%, transparent);
        }
      }
      .flow {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 3;
        overflow: visible;
      }
      .flow path {
        fill: none;
        stroke: var(--pc-bal);
        stroke-width: 3;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 9 7;
        animation: dash 1.2s linear infinite;
      }
      .flow circle {
        fill: var(--pc-bal);
      }
      @keyframes dash {
        to {
          stroke-dashoffset: -32;
        }
      }
      @container (max-width: 420px) {
        .box {
          padding: 6px 6px 8px;
        }
        .grid {
          column-gap: 16px;
          row-gap: 2px;
        }
        .ch {
          padding: 0 5px;
        }
        .cell {
          padding: 1px 4px;
          gap: 4px;
          font-size: 12px;
        }
        .cell .uv {
          gap: 5px;
        }
        .cell .n {
          font-size: 10.5px;
        }
        .cell .cr {
          font-size: 11px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .flow path,
        .cell.bm {
          animation: none;
        }
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === 'function' && !this._ro) {
      this._ro = new ResizeObserver(() => this._schedule());
      const grid = this.renderRoot?.querySelector('.grid');
      if (grid) this._ro.observe(grid);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = undefined;
    if (this._raf !== undefined) cancelAnimationFrame(this._raf);
    this._raf = undefined;
  }

  protected render(): TemplateResult {
    try {
      return this.renderBox();
    } catch (e) {
      this._flow = undefined;
      return fallback(`Zellen Pack ${this.pack?.pack ?? '?'}`, e);
    }
  }

  protected updated(_changed: PropertyValues): void {
    const grid = this.renderRoot.querySelector('.grid');
    if (grid && this._ro) {
      this._ro.disconnect();
      this._ro.observe(grid);
    }
    this._schedule();
  }

  private renderBox(): TemplateResult {
    const p = this.pack;
    if (!p) return html``;
    const h = this.hass;
    const n = p.pack;
    const vId = (i: number) => packEntity(p, 'sensor', `cell_voltage_${i}`);
    const rId = (i: number) => packEntity(p, 'sensor', `cell_resistance_${i}`);
    const volts = Array.from({ length: CELLS }, (_, k) => numberOf(h, vId(k + 1)));
    const ext = extremeCells(h, p, volts);
    const known = volts.filter((v): v is number => v !== undefined);
    const avg =
      numberOf(h, packEntity(p, 'sensor', 'average_cell_voltage')) ??
      (known.length ? known.reduce((a, b) => a + b, 0) / known.length : undefined);
    const ib = numberOf(h, packEntity(p, 'sensor', 'balancing_current'));
    const bal = balancerState(h, p, ext);
    const marked = new Set(bal.cells);
    this._flow =
      ib !== undefined && ib !== 0 && ext.max !== undefined && ext.min !== undefined && ext.max !== ext.min
        ? { max: ext.max, min: ext.min }
        : undefined;

    const cell = (i: number): TemplateResult => {
      const v = volts[i - 1];
      const dev = v !== undefined && avg !== undefined ? (v - avg) * 1000 : undefined;
      const rRaw = numberOf(h, rId(i));
      const rUnit = unitOf(h, rId(i));
      const r = rRaw === undefined ? undefined : /^m/.test(rUnit) ? rRaw : rRaw * 1000;
      const cls = [devClass(dev), i === ext.max ? 'mx' : '', i === ext.min ? 'mn' : '', marked.has(i) ? 'bm' : '']
        .filter(Boolean)
        .join(' ');
      const title = [
        packCell(n, i),
        dev !== undefined ? `${signed(dev, 1)} mV zum Packmittel` : '',
        i === ext.max ? 'höchste Zelle' : i === ext.min ? 'niedrigste Zelle' : '',
        marked.has(i) ? bal.title : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return html`<div class="cell ${cls}" data-cell=${i} title=${title}>
        ${val(this, h, vId(i), html`<span class="n">${pad2(i)}</span><span class="cv">${num(v, 3, 'V')}</span>`, 'uv')}
        ${val(this, h, rId(i), num(r, 0, 'mΩ'), 'cr')}
      </div>`;
    };

    const rows: TemplateResult[] = [];
    const half = CELLS / 2;
    for (let i = 1; i <= half; i++) rows.push(cell(i), cell(i + half));
    const head = html`<div class="ch" aria-hidden="true"><span>Nr · U</span><span>R</span></div>`;
    return html`<section class="box" aria-label=${`Zellen Pack ${n}`}>
      <div class="title">Zellen</div>
      <div class="grid">
        ${head}${head}${rows}
        ${
          this._flow
            ? html`<svg class="flow" aria-hidden="true">
                <path d=""></path>
                <circle class="a" r="4"></circle>
                <circle class="b" r="4"></circle>
              </svg>`
            : ''
        }
      </div>
    </section>`;
  }

  private _schedule(): void {
    if (this._raf !== undefined) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = undefined;
      this._drawFlow();
    });
  }

  /** Linie wie im Mockup: vom inneren Rand der hoechsten Zelle zur Spaltenfuge, senkrecht, zum inneren Rand der niedrigsten. */
  private _drawFlow(): void {
    try {
      const f = this._flow;
      const root = this.renderRoot;
      const grid = root.querySelector('.grid');
      const path = root.querySelector('.flow path');
      if (!f || !grid || !path) return;
      const a = grid.querySelector(`[data-cell="${f.max}"]`);
      const b = grid.querySelector(`[data-cell="${f.min}"]`);
      const left = grid.querySelector('[data-cell="1"]');
      const right = grid.querySelector(`[data-cell="${CELLS / 2 + 1}"]`);
      if (!a || !b || !left || !right) return;
      const W = grid.getBoundingClientRect();
      if (W.width === 0) return;
      const gx = (left.getBoundingClientRect().right + right.getBoundingClientRect().left) / 2 - W.left;
      const inner = (el: Element) => {
        const R = el.getBoundingClientRect();
        const cx = R.left + R.width / 2 - W.left;
        return { x: cx < gx ? R.right - W.left : R.left - W.left, y: R.top + R.height / 2 - W.top };
      };
      const s = inner(a);
      const t = inner(b);
      path.setAttribute('d', `M${s.x},${s.y} H${gx} V${t.y} H${t.x}`);
      const ca = root.querySelector('.flow circle.a');
      const cb = root.querySelector('.flow circle.b');
      ca?.setAttribute('cx', String(s.x));
      ca?.setAttribute('cy', String(s.y));
      cb?.setAttribute('cx', String(t.x));
      cb?.setAttribute('cy', String(t.y));
    } catch (e) {
      console.warn('pack-card: Balancing-Linie', e);
    }
  }
}
