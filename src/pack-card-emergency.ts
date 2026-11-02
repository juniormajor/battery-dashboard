// Zentrales Emergency (A01d E7): ein Knopf „Emergency“ fuer alle Packs im Bank-Display, Ein und Aus je mit einer
// Sekunde Halten; gefuellt, solange mindestens ein Pack Emergency an hat. Einzeln schaltet nur die Packansicht.
// Packs ohne frische Daten gelten als nicht erreichbar und werden nicht geschaltet (A01d-12): ihr Schalter steht dann
// weiter auf on/off; das steht im title des Knopfs.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, packEntity, stateOf } from './entities';
import { packAge } from './pack-parts';
import { fallback, sharedStyles } from './ui';

interface EmergencyState {
  /** schaltbare Schalter (vorhanden, nicht unavailable/unknown) */
  avail: string[];
  /** Packs, deren Schalter fehlt oder nicht verfuegbar ist oder die keine frischen Daten liefern */
  missing: number[];
  on: number;
}

export class PackCardEmergency extends LitElement {
  static properties = {
    hass: { attribute: false },
    packs: { attribute: false },
    now: { type: Number },
  };

  hass?: Hass;
  packs: PackConfig[] = [];
  /** Zeitpunkt fuer das Datenalter; 0 = nicht gesetzt, dann zaehlt jedes Pack als frisch */
  now = 0;

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      pack-card-hold {
        display: block;
      }
    `,
  ];

  private read(): EmergencyState {
    const avail: string[] = [];
    const missing: number[] = [];
    let on = 0;
    for (const p of this.packs) {
      const id = packEntity(p, 'switch', 'emergency');
      const s = stateOf(this.hass, id);
      if (!s || (this.now > 0 && !packAge(this.hass, p, this.now).fresh)) {
        missing.push(p.pack);
        continue;
      }
      avail.push(id);
      if (s.state === 'on') on += 1;
    }
    return { avail, missing, on };
  }

  protected render(): TemplateResult {
    try {
      const st = this.read();
      const all = this.packs.length;
      const canCall = typeof this.hass?.callService === 'function';
      const disabled = !canCall || st.avail.length === 0;
      const reason = !canCall
        ? 'Keine Verbindung zu Home Assistant'
        : 'Kein Emergency-Schalter erreichbar (switch.pv_pack_<n>_emergency nicht verfügbar)';
      const info = [
        `an: ${st.on}/${all} Packs, einzeln in der Packansicht`,
        st.missing.length ? `Pack ${st.missing.join(', ')} nicht erreichbar, wird nicht geschaltet` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return html`<pack-card-hold
        plain
        .label=${'Emergency'}
        .active=${st.on > 0}
        .disabled=${disabled}
        .reason=${reason}
        .info=${info}
        tone="warn"
        @hold-complete=${this._fire}
      ></pack-card-hold>`;
    } catch (e) {
      return fallback('Emergency', e);
    }
  }

  private _fire = (): void => {
    try {
      const st = this.read();
      if (!st.avail.length || !this.hass?.callService) return;
      const service = st.on > 0 ? 'turn_off' : 'turn_on';
      this.hass.callService('switch', service, { entity_id: st.avail })?.catch?.((e: unknown) => console.warn('pack-card: Emergency', e));
    } catch (e) {
      console.warn('pack-card: Emergency', e);
    }
  };
}
