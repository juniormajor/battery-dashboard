// Central Emergency (A01d E7): one "Emergency" button for all packs in the bank display, on and off each with
// one second of holding; filled as long as at least one pack has Emergency on. Single packs are switched only in the pack view.
// Packs without fresh data count as unreachable and are not switched (A01d-12): their switch then still
// shows on/off; this is stated in the button's title.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, packEntity, stateOf } from './entities';
import { packAge } from './pack-parts';
import { fallback, sharedStyles } from './ui';

interface EmergencyState {
  /** switchable switches (present, not unavailable/unknown) */
  avail: string[];
  /** packs whose switch is missing or unavailable, or that deliver no fresh data */
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
  /** timestamp for the data age; 0 = not set, then every pack counts as fresh */
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
