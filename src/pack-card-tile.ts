// Gehaeuse eines Packs (A01d E17, E21). Eigenes Element, damit ein Fehler auf dieses Pack begrenzt bleibt (E10, R6).
// Klemmen oben, links senkrechter SoC-Balken mit SoC und SoH, oben Name mit Lampen RUN/ALM/BAL/EMG, BLE-Pegel und
// Datenalter, rechts „U / I / P“, „ΔU / I Bal“ und die hoechste Temperatur mit Fuehler; Fehlertext in der Kopfzeile (E8).
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, STALE_S, ZELLEN_PACK, ageSeconds, numberOf, packEntity, stateOf, textOf } from './entities';
import { DASH, num, snum } from './format';
import { band, bleInfo, deltaMv, maxTemp, packAge, packLeds, packPartStyles } from './pack-parts';
import { fallback, group, navigate, selectPack, sharedStyles, socColor, thermo, val, viewPath } from './ui';

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
    packPartStyles,
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
      .scr .grp {
        font-size: 12.5px;
        justify-content: start;
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
    const { age, fresh } = packAge(h, p, this.now);
    const err = textOf(h, E('sensor', 'errors'));
    const incomplete = soc === undefined || numberOf(h, E('sensor', 'total_voltage')) === undefined;
    const dmv = deltaMv(h, p);
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
            ${this.renderName()} ${packLeds(h, p, fresh, !!err)}
            ${err
              ? html`<span class="err">${val(this, h, E('sensor', 'errors'), err)}</span>`
              : incomplete
                ? html`<span class="tag mut">Daten unvollständig</span>`
                : ''}
            <span class="sp"></span>
            ${bleInfo(this, h, p, fresh, age)}
          </div>
          <div class="scr ${tint}">${this.renderValues(dmv)}</div>
        </div>
      </article>
    </div>`;
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
    await selectPack(this.hass, p.pack);
    navigate(viewPath(this.packPath || 'pack'));
  };
}
