// Stackkopf (A01d E17): frei waehlbarer Name, ESP-Werte (Innentemperatur mit Thermometer und „ESP“, WLAN) und in
// derselben Zeile „ESP reboot“ mit einer Sekunde Halten (E7); die Laufzeit des ESP steht im Hinweis des Knopfs.
// Diagnose-IDs ohne Bereichspraefix nach A01b E15.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, StackConfig, isAvailable, numberOf, secondsOf, stackDiagEntity, stackEntity } from './entities';
import { num, snum, uptimeText } from './format';
import { fallback, sharedStyles, tempLabel, val } from './ui';

export class PackCardStackHead extends LitElement {
  static properties = {
    hass: { attribute: false },
    stack: { attribute: false },
  };

  hass?: Hass;
  stack?: StackConfig;

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        container-type: inline-size;
      }
      .h {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 10px;
        padding: 7px 10px;
        background: var(--pc-raise);
        border-bottom: 1px solid var(--pc-line);
      }
      .name {
        font-weight: 500;
        font-size: 15px;
      }
      .esp {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 10px;
        font-size: 12px;
        color: var(--pc-fg2);
      }
      pack-card-hold::part(button) {
        padding: 3px 10px;
        font-size: 12.5px;
      }
      /* Handy: Name, ESP-Werte und „ESP reboot“ in einer Zeile */
      @container (max-width: 379px) {
        .h {
          gap: 4px 7px;
          padding: 7px 8px;
        }
        .name {
          font-size: 14px;
        }
        .esp {
          gap: 2px 7px;
          font-size: 11.5px;
        }
        pack-card-hold::part(button) {
          padding: 3px 7px;
          font-size: 12px;
        }
      }
      .esp .v {
        color: var(--pc-fg);
      }
    `,
  ];

  protected render(): TemplateResult {
    try {
      const st = this.stack;
      if (!st) return html``;
      const h = this.hass;
      const s = st.stack;
      const temp = stackDiagEntity(s, 'internal_temperature');
      const wifi = stackDiagEntity(s, 'wifi_signal_strength');
      const up = stackDiagEntity(s, 'uptime_sensor');
      const restart = stackEntity(s, null, 'button', 'restart');
      const canPress = isAvailable(h, restart) && typeof h?.callService === 'function';
      return html`<div class="h">
        <span class="name">${st.name ?? `Stack ${s}`}</span>
        <span class="esp">
          <span>${tempLabel('ESP', false)} ${val(this, h, temp, num(numberOf(h, temp), 1, '°C'))}</span>
          <span>WLAN ${val(this, h, wifi, snum(numberOf(h, wifi), 0, 'dBm'))}</span>
        </span>
        <span class="sp"></span>
        <pack-card-hold
          plain
          .label=${'ESP reboot'}
          .info=${`ESP-Laufzeit ${uptimeText(secondsOf(h, up))}`}
          .disabled=${!canPress}
          .reason=${`${restart} nicht verfügbar – ESP nicht erreichbar`}
          tone="bad"
          @hold-complete=${this._restart}
        ></pack-card-hold>
      </div>`;
    } catch (e) {
      return fallback(`Stack ${this.stack?.stack ?? '?'}`, e);
    }
  }

  private _restart = (): void => {
    try {
      const st = this.stack;
      if (!st || !this.hass?.callService) return;
      const id = stackEntity(st.stack, null, 'button', 'restart');
      if (!isAvailable(this.hass, id)) return;
      this.hass.callService('button', 'press', { entity_id: id })?.catch?.((e: unknown) => console.warn('pack-card: ESP-Neustart', e));
    } catch (e) {
      console.warn('pack-card: ESP-Neustart', e);
    }
  };
}
