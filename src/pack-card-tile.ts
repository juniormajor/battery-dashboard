// Gehaeuse eines Packs (A01d E17, E21). Eigenes Element, damit ein Fehler auf dieses Pack begrenzt bleibt (E10, R6).
// Klemmen oben, links senkrechter SoC-Balken mit SoC und SoH, oben Name mit Lampen RUN/ALM/BAL/NOT, BLE-Pegel und
// Datenalter, rechts „U / I / P“, „ΔU / I Bal“ und die hoechste Temperatur mit Fuehler; Fehlertext in der Kopfzeile (E8).
import { LitElement, html, css, TemplateResult } from 'lit';
import {
  Hass,
  PackConfig,
  STALE_S,
  ZELLEN_PACK,
  ageSeconds,
  numberOf,
  packEntity,
  stackEntity,
  stackOf,
  stateOf,
  textOf,
  unitOf,
} from './entities';
import { DASH, ageText, num, snum } from './format';
import { fallback, group, navigate, sharedStyles, socColor, thermo, val, viewPath } from './ui';

export type SocFrame = '' | 'lo' | 'hi';

/** Fuehler in der Benennung der JK-App (E21, A01e „Temperaturfuehler“): ESPHome-Fuehler 3 = JK 5; Fuehler 5 = Spiegel des IC, entfaellt. */
const TEMPS: [string, string][] = [
  ['IC', 'mosfet_temperature'],
  ['1', 'temperature_sensor_1'],
  ['2', 'temperature_sensor_2'],
  ['4', 'temperature_sensor_4'],
  ['5', 'temperature_sensor_3'],
];

/** Toenung des Bildschirms nach ΔU (Mockup band(): ab 5 mV und ab 15 mV). */
function band(dmv: number | undefined): string {
  if (dmv === undefined) return '';
  return dmv >= 15 ? 't-warn' : dmv >= 5 ? 't-soft' : '';
}

/** Daten fuer die Rahmen min/max SoC im Rahmen der Karte: SoC nur, wenn das Pack frische Daten liefert. */
export function packSocForFrame(hass: Hass | undefined, p: PackConfig, now: number): number | undefined {
  const age = ageSeconds(hass, packEntity(p, 'sensor', 'total_runtime'), now);
  if (age === undefined || age > STALE_S) return undefined;
  return numberOf(hass, packEntity(p, 'sensor', 'state_of_charge'));
}

export class PackCardTile extends LitElement {
  static properties = {
    hass: { attribute: false },
    pack: { attribute: false },
    frame: {},
    now: { type: Number },
    packPath: {},
  };

  hass?: Hass;
  pack?: PackConfig;
  frame: SocFrame = '';
  /** Zeitpunkt fuer das Datenalter, vom Rahmen getaktet */
  now = 0;
  /** Pfad der Packansicht (Kartenkonfiguration pack_path) */
  packPath = 'pack';

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      .wrap {
        container-type: inline-size;
      }
      .case {
        position: relative;
        margin-top: 8px;
        background: var(--pc-card);
        border: 2px solid var(--pc-line);
        border-radius: 8px;
        padding: 8px 10px 8px 8px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
        min-width: 0;
      }
      .case.soc-lo {
        border-color: var(--pc-bad);
      }
      .case.soc-hi {
        border-color: var(--pc-ok);
      }
      /* Klemmen oben: links Minus, rechts Plus */
      .case::before,
      .case::after {
        content: '';
        position: absolute;
        top: -9px;
        width: 22px;
        height: 7px;
        border-radius: 3px 3px 0 0;
      }
      .case::before {
        left: 20px;
        background: var(--pc-fg3);
      }
      .case::after {
        right: 20px;
        background: var(--pc-bad);
      }
      .case-l {
        display: grid;
        justify-items: center;
        align-content: start;
        gap: 2px;
        min-width: 46px;
      }
      .vbar {
        display: flex;
        align-items: flex-end;
        width: 18px;
        height: 58px;
        border: 2px solid var(--pc-fg3);
        border-radius: 5px;
        padding: 2px;
        position: relative;
        box-sizing: border-box;
        margin-top: 4px;
      }
      .vbar::before {
        content: '';
        position: absolute;
        top: -6px;
        left: 4px;
        width: 6px;
        height: 4px;
        border-radius: 2px 2px 0 0;
        background: var(--pc-fg3);
      }
      .vbar i {
        display: block;
        width: 100%;
        border-radius: 2px;
      }
      .case-l b,
      .case-l .soh {
        font-size: 11px;
        white-space: nowrap;
      }
      .case-l .soh {
        color: var(--pc-fg2);
      }
      .case-c {
        display: grid;
        gap: 5px;
        min-width: 0;
      }
      .case-h {
        display: flex;
        align-items: center;
        gap: 4px 8px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .case-h .link {
        font-size: 15px;
      }
      .badge-m {
        font-size: 10px;
        font-weight: 700;
        border: 1px solid var(--pc-accent);
        color: var(--pc-accent);
        border-radius: 4px;
        padding: 0 4px;
      }
      .leds {
        display: inline-flex;
        gap: 8px;
        font-size: 10px;
        letter-spacing: 0.05em;
        color: var(--pc-fg3);
        align-items: center;
      }
      .led {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .led i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--pc-fg3) 40%, transparent);
      }
      .led.on.run i {
        background: var(--pc-ok);
        box-shadow: 0 0 6px var(--pc-ok);
      }
      .led.on.alm i {
        background: var(--pc-bad);
        box-shadow: 0 0 6px var(--pc-bad);
      }
      .led.on.bal i {
        background: var(--pc-bal);
        box-shadow: 0 0 6px var(--pc-bal);
        animation: blink 1.2s ease-in-out infinite;
      }
      .led.on.em i {
        background: var(--pc-warn);
        box-shadow: 0 0 6px var(--pc-warn);
      }
      @keyframes blink {
        50% {
          opacity: 0.35;
        }
      }
      .err {
        flex: 1 1 7em;
        min-width: 0;
        max-width: 100%;
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--pc-bad);
        background: color-mix(in srgb, var(--pc-bad) 12%, transparent);
        border-radius: 6px;
        padding: 1px 7px;
      }
      .err .v {
        display: inline;
        max-width: 100%;
      }
      .ble {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11.5px;
        color: var(--pc-fg2);
        white-space: nowrap;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        display: inline-block;
        background: var(--pc-ok);
        flex: none;
      }
      .dot.off {
        background: var(--pc-bad);
      }
      .scr {
        border-radius: 6px;
        padding: 5px 8px;
        background: var(--pc-screen);
        border: 1px solid var(--pc-line);
        min-width: 0;
      }
      .scr.t-soft {
        background: color-mix(in srgb, var(--pc-soft) 13%, var(--pc-screen));
      }
      .scr.t-warn {
        background: color-mix(in srgb, var(--pc-warn) 15%, var(--pc-screen));
      }
      .scr.t-bad {
        background: color-mix(in srgb, var(--pc-bad) 18%, var(--pc-screen));
      }
      .scr.t-off {
        opacity: 0.55;
      }
      .scr .grp {
        font-size: 12.5px;
        justify-content: start;
      }
      .balv {
        color: var(--pc-bal);
      }
      @container (max-width: 340px) {
        .case {
          padding: 7px 7px 7px 6px;
          gap: 7px;
        }
        .scr {
          padding: 4px 5px;
        }
        .scr .grp {
          font-size: 11.5px;
          column-gap: 3px;
        }
        .scr .grp .gk {
          padding-right: 3px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .led.on.bal i {
          animation: none;
        }
      }
    `,
  ];

  protected render(): TemplateResult {
    try {
      return this.renderCase();
    } catch (e) {
      return html`<div class="wrap"><div class="case">${fallback(`Pack ${this.pack?.pack ?? '?'}`, e)}</div></div>`;
    }
  }

  private renderCase(): TemplateResult {
    const p = this.pack;
    if (!p) return html``;
    const h = this.hass;
    const n = p.pack;
    const E = (dom: string, key: string) => packEntity(p, dom, key);
    const socId = E('sensor', 'state_of_charge');
    const soc = numberOf(h, socId);
    const age = ageSeconds(h, E('sensor', 'total_runtime'), this.now || Date.now());
    const fresh = age !== undefined && age <= STALE_S;
    const err = textOf(h, E('sensor', 'errors'));
    const incomplete = soc === undefined || numberOf(h, E('sensor', 'total_voltage')) === undefined;
    const dmv = this.deltaMv();
    const tint = !fresh ? 't-off' : err ? 't-bad' : band(dmv);
    const frame = this.frame === 'lo' ? 'soc-lo' : this.frame === 'hi' ? 'soc-hi' : '';

    return html`<div class="wrap">
      <article class="case ${frame}" aria-label=${`Pack ${n}`}>
        <div class="case-l">
          ${val(this, h, socId, html`<span class="vbar" aria-hidden="true"
              ><i style="height:${soc === undefined ? 0 : Math.max(0, Math.min(100, soc))}%;background:${socColor(soc)}"></i
            ></span>`)}
          ${val(this, h, socId, html`<b>SoC ${num(soc, 1, '%')}</b>`)}
          ${val(this, h, E('sensor', 'state_of_health'), html`<span class="soh">SoH ${num(numberOf(h, E('sensor', 'state_of_health')), 0, '%')}</span>`)}
        </div>
        <div class="case-c">
          <div class="case-h">
            ${this.renderName()} ${this.renderLeds(fresh, !!err)}
            ${err
              ? html`<span class="err">${val(this, h, E('sensor', 'errors'), err)}</span>`
              : incomplete
                ? html`<span class="tag mut">Daten unvollständig</span>`
                : ''}
            <span class="sp"></span>
            ${this.renderBle(fresh, age)}
          </div>
          <div class="scr ${tint}">${this.renderValues(dmv)}</div>
        </div>
      </article>
    </div>`;
  }

  private deltaMv(): number | undefined {
    const id = packEntity(this.pack!, 'sensor', 'delta_cell_voltage');
    const d = numberOf(this.hass, id);
    if (d === undefined) return undefined;
    return unitOf(this.hass, id) === 'mV' ? d : d * 1000;
  }

  private renderName(): TemplateResult {
    const n = this.pack!.pack;
    const helper = stateOf(this.hass, ZELLEN_PACK);
    const title = helper
      ? `Packansicht für Pack ${n}`
      : `Packansicht – ${ZELLEN_PACK} nicht verfügbar, die Ansicht zeigt das zuletzt gewählte Pack`;
    return html`<button type="button" class="link" title=${title} @click=${this._openPack}>Pack ${n}</button>
      ${n === 1 ? html`<span class="badge-m" title="Master am CAN zum Cerbo">M</span>` : ''}`;
  }

  private renderLeds(fresh: boolean, alarm: boolean): TemplateResult {
    const h = this.hass;
    const p = this.pack!;
    const bal = stateOf(h, packEntity(p, 'binary_sensor', 'balancing'))?.state === 'on';
    const em = stateOf(h, packEntity(p, 'switch', 'emergency'))?.state === 'on';
    const led = (cls: string, on: boolean, label: string, title: string) =>
      html`<span class="led ${cls} ${on ? 'on' : ''}" title=${title}><i></i>${label}</span>`;
    return html`<span class="leds">
      ${led('run', fresh, 'RUN', fresh ? 'Daten frisch' : `keine Daten seit über ${STALE_S} s`)}
      ${led('alm', alarm, 'ALM', alarm ? 'Fehlertext des BMS' : 'kein Fehlertext')}
      ${led('bal', bal, 'BAL', bal ? 'Balancer aktiv' : 'Balancer ruht')} ${led('em', em, 'EMG', em ? 'Notbetrieb an' : 'Notbetrieb aus')}
    </span>`;
  }

  private renderBle(fresh: boolean, age: number | undefined): TemplateResult {
    const h = this.hass;
    const p = this.pack!;
    const rssiId = stackEntity(stackOf(p), p, 'sensor', 'rssi');
    return html`<span class="ble"
      ><span class="dot ${fresh ? '' : 'off'}"></span>${val(this, h, rssiId, snum(numberOf(h, rssiId), 0, 'dBm'))} ·
      ${val(this, h, packEntity(p, 'sensor', 'total_runtime'), ageText(age))}</span
    >`;
  }

  private renderValues(dmv: number | undefined): TemplateResult {
    const h = this.hass;
    const p = this.pack!;
    const E = (key: string) => packEntity(p, 'sensor', key);
    const bal = stateOf(h, packEntity(p, 'binary_sensor', 'balancing'))?.state === 'on';
    let tMax: { v: number; s: string; id: string } | undefined;
    for (const [label, key] of TEMPS) {
      const v = numberOf(h, E(key));
      if (v !== undefined && (!tMax || v > tMax.v)) tMax = { v, s: label, id: E(key) };
    }
    return group(
      [
        {
          k: 'U / I / P:',
          v: [
            val(this, h, E('total_voltage'), num(numberOf(h, E('total_voltage')), 2, 'V')),
            val(this, h, E('current'), snum(numberOf(h, E('current')), 1, 'A')),
            val(this, h, E('power'), snum(numberOf(h, E('power')), 0, 'W')),
          ],
        },
        {
          k: 'ΔU / I Bal:',
          v: [
            val(this, h, E('delta_cell_voltage'), num(dmv, 0, 'mV')),
            val(this, h, E('balancing_current'), html`<span class=${bal ? 'balv' : ''}>${num(numberOf(h, E('balancing_current')), 2, 'A')}</span>`),
          ],
        },
        {
          k: html`${thermo} max:`,
          v: [
            tMax
              ? html`${val(this, h, tMax.id, num(tMax.v, 1, '°C'))} <span class="src">(${tMax.s})</span>`
              : val(this, h, E('mosfet_temperature'), DASH),
          ],
        },
      ],
      'plain',
    );
  }

  /** „Pack n“: Helfer setzen, danach Ansicht wechseln (E4, E5, E6). */
  private _openPack = async (): Promise<void> => {
    const p = this.pack;
    if (!p) return;
    const option = `Pack_${p.pack}`;
    try {
      const helper = stateOf(this.hass, ZELLEN_PACK);
      const options = helper?.attributes?.options;
      if (helper && this.hass?.callService && (!Array.isArray(options) || options.includes(option))) {
        await this.hass.callService('input_select', 'select_option', { entity_id: ZELLEN_PACK, option });
      } else {
        console.warn(`pack-card: ${ZELLEN_PACK} nicht verfügbar oder ohne Option ${option}`);
      }
    } catch (e) {
      console.warn(`pack-card: ${ZELLEN_PACK} nicht gesetzt`, e);
    }
    navigate(viewPath(this.packPath || 'pack'));
  };
}
