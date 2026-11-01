// Packzeile der Zellmatrix in der Ansicht zellen (A01d E18). Geruest: zeigt vorerst nur die Packnummer.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig } from './entities';

export class PackCardRow extends LitElement {
  static properties = {
    hass: { attribute: false },
    pack: { attribute: false },
  };

  hass?: Hass;
  pack?: PackConfig;

  static styles = css`
    :host { display: block; color: var(--primary-text-color); }
  `;

  protected render(): TemplateResult {
    try {
      return html`<div>Pack ${this.pack?.pack ?? '?'}</div>`;
    } catch (e) {
      return html`<div>Zeile fehlgeschlagen</div>`;
    }
  }
}
