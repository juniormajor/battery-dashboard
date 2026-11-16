// Frame of the card (A01d E1, E2): one instance per view; configured are packs, stacks and the click targets.
// View speicher: header (Ah/kWh, cell analysis), bank display (E16) with the central Emergency (E7), cabinet (E17),
// legend. Speicher and pack are at most MAX_W wide and centered (E2); the cell analysis uses the full width.
// View pack: one pack from input_select.zellen_pack (E5, E19), drawn by pack-card-pack.
// View zellen: cell analysis (E18) from the sql sensors of the cell evaluation (A01c), drawn by pack-card-zellen.
import { LitElement, html, css, unsafeCSS, PropertyValues, TemplateResult } from 'lit';
import { Hass, PackConfig, StackConfig, normalizePacks, normalizeStacks, stackOf } from './entities';
import { CapUnit } from './pack-card-bank';
import { SocFrame, packSocForFrame } from './pack-card-tile';
import { fallback, navigate, sharedStyles, themeVars, unitSwitch, viewPath } from './ui';

type View = 'speicher' | 'pack' | 'zellen';

export interface PackCardConfig {
  type: string;
  view?: View;
  packs: (number | PackConfig)[];
  stacks?: StackConfig[];
  /** path of the pack view, relative to the dashboard or absolute from "/" (default pack) */
  pack_path?: string;
  /** path of the cell analysis, relative to the dashboard or absolute from "/" (default zellen) */
  zellen_path?: string;
  /** path of the speicher view for the back link of the pack view (default speicher) */
  speicher_path?: string;
}

const UNIT_KEY = 'pack-card-unit';
/** Window event: every card instance (speicher, pack) applies a changed unit immediately */
const UNIT_SYNC = 'pack-card-unit-sync';
/** Maximum width of the views speicher and pack; a theme can change it via --pack-card-max-width. */
const MAX_W = '900px';
const TICK_MS = 5000;

function readUnit(): CapUnit {
  try {
    return window.localStorage.getItem(UNIT_KEY) === 'kWh' ? 'kWh' : 'Ah';
  } catch {
    return 'Ah';
  }
}

export class PackCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _packs: { state: true },
    _stacks: { state: true },
    _view: { state: true },
    _unit: { state: true },
    _now: { state: true },
  };

  hass?: Hass;
  private _packs: PackConfig[] = [];
  private _stacks: StackConfig[] = [];
  private _view: View = 'speicher';
  private _packPath = 'pack';
  private _zellenPath = 'zellen';
  private _speicherPath = 'speicher';
  private _unit: CapUnit = readUnit();
  private _now = Date.now();
  private _tick?: number;

  static styles = [
    themeVars,
    sharedStyles,
    css`
      :host {
        display: block;
        max-width: var(--pack-card-max-width, ${unsafeCSS(MAX_W)});
        margin: 0 auto;
      }
      :host([view='zellen']) {
        max-width: none;
      }
      /* the frame draws no card of its own: every group is its own surface in the style of ha-card (E26) */
      ha-card {
        display: block;
        background: none;
        border: 0;
        box-shadow: none;
        border-radius: 0;
        color: var(--pc-fg);
      }
      .speicher {
        display: grid;
        gap: 8px;
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
      /* cabinet: stacks side by side, below about 700 px (2 x 330 px) stacked; never wider than the card (R4) */
      .cab {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(330px, 100%), 1fr));
        gap: 8px;
        margin-top: 8px;
      }
      .stack {
        display: grid;
        gap: 8px;
        align-content: start;
        min-width: 0;
      }
      .packs {
        display: grid;
        gap: 8px;
        padding: 8px;
      }
      .note {
        color: var(--pc-fg2);
        margin: 0;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        font-size: var(--pc-fs-s);
        line-height: 1.2;
        color: var(--pc-fg2);
        margin-top: 8px;
      }
      .legend i {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: var(--pc-r-sm);
        vertical-align: -2px;
        margin-right: 4px;
        box-sizing: border-box;
      }
    `,
  ];

  setConfig(config: PackCardConfig): void {
    const packs = normalizePacks(config?.packs);
    const view = config.view ?? 'speicher';
    if (!['speicher', 'pack', 'zellen'].includes(view)) {
      throw new Error('pack-card: "view" muss speicher, pack oder zellen sein');
    }
    for (const key of ['pack_path', 'zellen_path', 'speicher_path'] as const) {
      const v = config[key];
      if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
        throw new Error(`pack-card: "${key}" muss ein nicht leerer Pfad sein`);
      }
    }
    this._packs = packs;
    this._stacks = normalizeStacks(config.stacks, packs);
    this._view = view;
    this._packPath = config.pack_path?.trim() || 'pack';
    this._zellenPath = config.zellen_path?.trim() || 'zellen';
    this._speicherPath = config.speicher_path?.trim() || 'speicher';
    this.setAttribute('view', view);
  }

  getCardSize(): number {
    return this._view === 'pack' ? 12 : this._view === 'zellen' ? 14 : 2 + this._packs.length;
  }

  getGridOptions() {
    return { columns: 'full' };
  }

  static getStubConfig(): PackCardConfig {
    return { type: 'custom:pack-card', view: 'speicher', packs: [1, 2, 3, 4, 5, 6] };
  }

  connectedCallback(): void {
    super.connectedCallback();
    // HA keeps views mounted: on reconnect apply the remembered unit and listen for changes
    this._unit = readUnit();
    window.addEventListener(UNIT_SYNC, this._onUnitSync);
    this._tick = window.setInterval(() => {
      this._now = Date.now();
    }, TICK_MS);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(UNIT_SYNC, this._onUnitSync);
    if (this._tick !== undefined) window.clearInterval(this._tick);
    this._tick = undefined;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('hass')) {
      this._now = Date.now();
      // status colors for light/dark (E15)
      this.toggleAttribute('dark', !!this.hass?.themes?.darkMode);
    }
  }

  protected render(): TemplateResult {
    if (this._view === 'pack') {
      try {
        return html`<ha-card>
          <pack-card-pack
            .hass=${this.hass}
            .packs=${this._packs}
            .stacks=${this._stacks}
            .now=${this._now}
            .unit=${this._unit}
            .speicherPath=${this._speicherPath}
            .zellenPath=${this._zellenPath}
            @pack-card-unit=${(e: CustomEvent<CapUnit>) => {
              e.stopPropagation();
              this._setUnit(e.detail);
            }}
          ></pack-card-pack>
        </ha-card>`;
      } catch (e) {
        return html`<ha-card>${fallback('Ansicht pack', e)}</ha-card>`;
      }
    }
    if (this._view === 'zellen') {
      try {
        return html`<ha-card>
          <pack-card-zellen
            .hass=${this.hass}
            .packs=${this._packs}
            .speicherPath=${this._speicherPath}
            .packPath=${this._packPath}
          ></pack-card-zellen>
        </ha-card>`;
      } catch (e) {
        return html`<ha-card>${fallback('Ansicht zellen', e)}</ha-card>`;
      }
    }
    try {
      return html`<ha-card>
        <div class="speicher">
          ${this.renderHead()}
          <pack-card-bank .hass=${this.hass} .unit=${this._unit} .packs=${this._packs} .now=${this._now}></pack-card-bank>
          ${this.renderCabinet()} ${this.renderLegend()}
        </div>
      </ha-card>`;
    } catch (e) {
      return html`<ha-card>${fallback('Ansicht speicher', e)}</ha-card>`;
    }
  }

  private renderHead(): TemplateResult {
    return html`<div class="head">
      <h2 class="ttl">Speicher</h2>
      <span class="sub">${this._packs.length} Packs · ${this._stacks.length} Stacks</span>
      <span class="sp"></span>
      ${unitSwitch(this._unit, (u) => this._setUnit(u))}
      <button type="button" class="btn" @click=${() => navigate(viewPath(this._zellenPath))}>Zellanalyse</button>
    </div>`;
  }

  /** Min/max SoC frames over the packs with fresh data; one try per pack so that one pack does not take the others down. */
  private frames(): Map<number, SocFrame> {
    const socs = new Map<number, number>();
    for (const p of this._packs) {
      try {
        const s = packSocForFrame(this.hass, p, this._now);
        if (s !== undefined) socs.set(p.pack, s);
      } catch (e) {
        console.warn(`pack-card: SoC Pack ${p.pack}`, e);
      }
    }
    const out = new Map<number, SocFrame>();
    if (socs.size < 2) return out;
    const vals = [...socs.values()];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (lo === hi) return out;
    for (const [n, s] of socs) out.set(n, s === lo ? 'lo' : s === hi ? 'hi' : '');
    return out;
  }

  private renderCabinet(): TemplateResult {
    let frames = new Map<number, SocFrame>();
    try {
      frames = this.frames();
    } catch (e) {
      console.warn('pack-card: Rahmen min/max SoC', e);
    }
    return html`<div class="cab">
      ${this._stacks.map((s) => {
        const mine = this._packs.filter((p) => stackOf(p) === s.stack);
        return html`<section class="stack" aria-label=${s.name ?? `Stack ${s.stack}`}>
          <pack-card-stack-head .hass=${this.hass} .stack=${s}></pack-card-stack-head>
          <div class="packs surf">
            ${mine.length
              ? mine.map(
                  (p) =>
                    html`<pack-card-tile
                      .hass=${this.hass}
                      .pack=${p}
                      .frame=${frames.get(p.pack) ?? ''}
                      .now=${this._now}
                      .unit=${this._unit}
                      .packPath=${this._packPath}
                    ></pack-card-tile>`,
                )
              : html`<p class="note">Keine Packs in diesem Stack.</p>`}
          </div>
        </section>`;
      })}
    </div>`;
  }

  private renderLegend(): TemplateResult {
    return html`<div class="legend" aria-label="Legende">
      <span><i style="background:var(--pc-screen)"></i>ΔU unter 5 mV</span>
      <span><i style="background:color-mix(in srgb,var(--pc-soft) 13%,var(--pc-screen))"></i>ΔU ab 5 mV</span>
      <span><i style="background:color-mix(in srgb,var(--pc-warn) 15%,var(--pc-screen))"></i>ΔU ab 15 mV</span>
      <span><i style="background:color-mix(in srgb,var(--pc-bad) 18%,var(--pc-screen))"></i>Fehlertext</span>
      <span><i style="border:2px solid var(--pc-bad)"></i>niedrigster SoC</span>
      <span><i style="border:2px solid var(--pc-ok)"></i>höchster SoC</span>
    </div>`;
  }

  private _setUnit(u: CapUnit): void {
    this._unit = u;
    try {
      window.localStorage.setItem(UNIT_KEY, u);
    } catch {
      /* without storage the choice applies only to this page */
    }
    window.dispatchEvent(new CustomEvent(UNIT_SYNC, { detail: u }));
  }

  private _onUnitSync = (e: Event): void => {
    const u = (e as CustomEvent<CapUnit>).detail;
    if ((u === 'Ah' || u === 'kWh') && u !== this._unit) this._unit = u;
  };
}
