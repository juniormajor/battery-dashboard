// Rahmen der Karte (A01d E1, E2): eine Instanz je Ansicht, konfiguriert werden nur packs und stacks.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, StackConfig, normalizePacks, normalizeStacks, stackOf } from './entities';

type View = 'speicher' | 'pack' | 'zellen';

export interface PackCardConfig {
  type: string;
  view?: View;
  packs: (number | PackConfig)[];
  stacks?: StackConfig[];
}

export class PackCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _packs: { state: true },
    _stacks: { state: true },
    _view: { state: true },
  };

  hass?: Hass;
  private _packs: PackConfig[] = [];
  private _stacks: StackConfig[] = [];
  private _view: View = 'speicher';

  static styles = css`
    ha-card { padding: 12px; }
    .cab { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 14px; }
    .stack { display: grid; gap: 10px; align-content: start; }
    .stack-h { font-weight: 500; color: var(--primary-text-color); }
    .hint { color: var(--secondary-text-color); }
  `;

  setConfig(config: PackCardConfig): void {
    const packs = normalizePacks(config?.packs);
    const view = config.view ?? 'speicher';
    if (!['speicher', 'pack', 'zellen'].includes(view)) {
      throw new Error('pack-card: "view" muss speicher, pack oder zellen sein');
    }
    this._packs = packs;
    this._stacks = normalizeStacks(config.stacks, packs);
    this._view = view;
  }

  getCardSize(): number {
    return 2 + this._packs.length;
  }

  getGridOptions() {
    return { columns: 'full' };
  }

  static getStubConfig(): PackCardConfig {
    return { type: 'custom:pack-card', view: 'speicher', packs: [1, 2, 3, 4, 5, 6] };
  }

  protected render(): TemplateResult {
    if (this._view !== 'speicher') {
      return html`<ha-card><div class="hint">Ansicht ${this._view} folgt (A01d).</div></ha-card>`;
    }
    return html`<ha-card>
      <div class="cab">
        ${this._stacks.map(
          (s) => html`<div class="stack">
            <div class="stack-h">${s.name}</div>
            ${this._packs
              .filter((p) => stackOf(p) === s.stack)
              .map((p) => html`<pack-card-tile .hass=${this.hass} .pack=${p}></pack-card-tile>`)}
          </div>`,
        )}
      </div>
    </ha-card>`;
  }
}
