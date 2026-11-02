// Gehaeuse eines Packs (A01d E17, E21) nach dem realen Pack im PV-Raum. Eigenes Element, damit ein Fehler auf dieses
// Pack begrenzt bleibt (E10, R6). Oben in der Mitte das Typenschild „Pack n“ (Klickziel E4), rechts BLE-Pegel und
// Datenalter; darunter links die SoC-Batterie mit SoC und SoH, rechts der Bildschirm im Rahmen mit Fehlertext (E8),
// „U / I / P“, „Kapazität“ (Rest und volle Kapazitaet in der Einheit des Bank-Displays), „ΔU / I Bal“ und der
// hoechsten Temperatur mit Fuehler; unten Polkappen und Lampen RUN/ALM/BAL/EMG.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, STALE_S, ZELLEN_PACK, ageSeconds, numberOf, packEntity, stateOf, textOf } from './entities';
import { CapUnit, DASH, num, snum } from './format';
import { band, bleInfo, capLine, caseStyles, deltaMv, maxTemp, packAge, packLeds, packPartStyles, caseBottom } from './pack-parts';
import { battSvg, fallback, group, navigate, selectPack, sharedStyles, tempLabel, val, viewPath } from './ui';

export type SocFrame = '' | 'lo' | 'hi';

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
    unit: {},
    packPath: {},
  };

  hass?: Hass;
  pack?: PackConfig;
  frame: SocFrame = '';
  /** Zeitpunkt fuer das Datenalter, vom Rahmen getaktet */
  now = 0;
  /** Einheit der Kapazitaet wie im Bank-Display (Ah/kWh, gemerkt je Browser) */
  unit: CapUnit = 'Ah';
  /** Pfad der Packansicht (Kartenkonfiguration pack_path) */
  packPath = 'pack';

  static styles = [
    sharedStyles,
    packPartStyles,
    caseStyles,
    css`
      :host {
        display: block;
      }
      .wrap {
        container-type: inline-size;
      }
      .soc {
        min-width: 58px;
      }
      .soc svg {
        width: 46px;
        height: 71px;
      }
      .soc b,
      .soc .soh {
        font-size: 11px;
      }
      .err {
        display: block;
        margin-bottom: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: var(--pc-bad);
      }
      .err .v {
        display: inline;
        max-width: 100%;
      }
      .scr {
        padding: 6px 9px;
      }
      .scr .grp {
        font-size: 12.5px;
      }
      @container (max-width: 359px) {
        .case {
          padding: 5px 7px 0;
        }
        .case-top {
          grid-template-columns: auto minmax(0, 1fr);
        }
        .case-top .plate-w {
          grid-column: 1;
        }
        .case-top .ble {
          grid-column: 2;
        }
        .terms {
          gap: 4px;
          padding: 0;
        }
        .term {
          width: 20px;
        }
        .term::before {
          left: 5px;
        }
        .case-mid {
          gap: 7px;
        }
        .soc {
          min-width: 50px;
        }
        .soc svg {
          width: 40px;
          height: 62px;
        }
        .scr {
          padding: 4px 6px;
        }
        .scr .grp {
          font-size: 11.5px;
          column-gap: 6px;
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
    const sohId = E('sensor', 'state_of_health');
    const { age, fresh } = packAge(h, p, this.now);
    const err = textOf(h, E('sensor', 'errors'));
    const incomplete = soc === undefined || numberOf(h, E('sensor', 'total_voltage')) === undefined;
    const dmv = deltaMv(h, p);
    const tint = !fresh ? 't-off' : err ? 't-bad' : band(dmv);
    const frame = this.frame === 'lo' ? 'soc-lo' : this.frame === 'hi' ? 'soc-hi' : '';

    return html`<div class="wrap">
      <article class="case ${frame}" aria-label=${`Pack ${n}`}>
        <div class="case-top">
          <span class="plate-w">${this.renderName()}</span>
          ${bleInfo(this, h, p, fresh, age)}
        </div>
        <div class="case-mid">
          <div class="soc">
            ${val(this, h, socId, battSvg(soc))} ${val(this, h, socId, html`<b>SoC ${num(soc, 1, '%')}</b>`)}
            ${val(this, h, sohId, html`<span class="soh">SoH ${num(numberOf(h, sohId), 0, '%')}</span>`)}
          </div>
          <div class="bezel">
            <div class="scr ${tint}">
              ${err
                ? html`<span class="err">${val(this, h, E('sensor', 'errors'), err)}</span>`
                : incomplete
                  ? html`<span class="err">Daten unvollständig</span>`
                  : ''}
              ${this.renderValues(dmv)}
            </div>
          </div>
        </div>
        ${caseBottom(packLeds(h, p, fresh, !!err))}
      </article>
    </div>`;
  }

  private renderName(): TemplateResult {
    const n = this.pack!.pack;
    const helper = stateOf(this.hass, ZELLEN_PACK);
    const title = helper
      ? `Packansicht für Pack ${n}`
      : `Packansicht – ${ZELLEN_PACK} nicht verfügbar, die Ansicht zeigt das zuletzt gewählte Pack`;
    return html`<button type="button" class="plate" title=${title} @click=${this._openPack}>Pack ${n}</button>
      ${n === 1 ? html`<span class="badge-m" title="Master am CAN zum Cerbo">M</span>` : ''}`;
  }

  private renderValues(dmv: number | undefined): TemplateResult {
    const h = this.hass;
    const p = this.pack!;
    const E = (key: string) => packEntity(p, 'sensor', key);
    const bal = stateOf(h, packEntity(p, 'binary_sensor', 'balancing'))?.state === 'on';
    const tMax = maxTemp(h, p);
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
        capLine(this, h, p, this.unit),
        {
          k: 'ΔU / I Bal:',
          v: [
            val(this, h, E('delta_cell_voltage'), num(dmv, 0, 'mV')),
            val(this, h, E('balancing_current'), html`<span class=${bal ? 'balv' : ''}>${num(numberOf(h, E('balancing_current')), 2, 'A')}</span>`),
          ],
        },
        tMax
          ? { k: tempLabel(tMax.s), v: [val(this, h, tMax.id, num(tMax.v, 1, '°C'))] }
          : { k: tempLabel('IC'), v: [val(this, h, E('mosfet_temperature'), DASH)] },
      ],
      'plain',
    );
  }

  /** „Pack n“: Helfer setzen, danach Ansicht wechseln (E4, E5, E6). */
  private _openPack = async (): Promise<void> => {
    const p = this.pack;
    if (!p) return;
    await selectPack(this.hass, p.pack);
    navigate(viewPath(this.packPath || 'pack'));
  };
}
