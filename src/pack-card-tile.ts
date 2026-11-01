// Gehaeuse eines Packs (A01d E17). Eigenes Element, damit ein Fehler auf dieses Pack begrenzt bleibt (E10, R6).
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, numberOf, packEntity } from './entities';

export class PackCardTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    pack: { attribute: false },
  };

  hass?: Hass;
  pack?: PackConfig;

  static styles = css`
    :host { display: block; }
    .case {
      border: 2px solid var(--divider-color);
      border-radius: 8px;
      padding: 8px 10px;
      color: var(--primary-text-color);
    }
    .name { font-weight: 500; }
    .val { font-variant-numeric: tabular-nums; }
    .off { color: var(--secondary-text-color); }
    .err { color: var(--error-color); }
  `;

  protected render(): TemplateResult {
    try {
      return this.renderCase();
    } catch (e) {
      return html`<div class="case err">Pack ${this.pack?.pack ?? '?'}: Anzeige fehlgeschlagen</div>`;
    }
  }

  private renderCase(): TemplateResult {
    const p = this.pack;
    if (!p) return html``;
    const soc = numberOf(this.hass, packEntity(p, 'sensor', 'state_of_charge'));
    return html`<div class="case">
      <span class="name">Pack ${p.pack}</span>
      ${soc === undefined
        ? html`<span class="off">nicht verfügbar</span>`
        : html`<span class="val">SoC ${soc.toFixed(1).replace('.', ',')}%</span>`}
    </div>`;
  }
}
