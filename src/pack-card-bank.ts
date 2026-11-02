// Bank-Display (A01d E16): SoC des Shunts als senkrechte Batterie mit SoH, daneben Shunt- und BMS-Master-Block (E21),
// unter dem Shunt-Block der zentrale Knopf „Emergency“ (E7, eigenes Element). Einzige Rechnung: Rest = installierte
// Kapazitaet des Masters minus entnommene Ah des Shunts, gezeigt als „Kapazität: Rest (installiert)“.
import { LitElement, html, css, TemplateResult } from 'lit';
import { BANK_MASTER, BANK_SHUNT, Hass, NOMINAL_V, PackConfig, numberOf, secondsOf, stateOf, textOf } from './entities';
import { DASH, cellId, dhm, fmt, num, snum } from './format';
import { battSvg, fallback, group, sharedStyles, tempLabel, val } from './ui';

export type CapUnit = 'Ah' | 'kWh';

/**
 * Alarme des BMS-Masters (enum no_alarm / warning / alarm), live gelesen an der Alt-Instanz am 2026-11-01.
 * Fehlende Entitaeten werden uebersprungen (E10).
 */
const ALARMS: [string, string][] = [
  ['cell_imbalance', 'Zellungleichgewicht'],
  ['low_charge_temperature', 'Ladetemperatur niedrig'],
  ['high_charge_temperature', 'Ladetemperatur hoch'],
  ['high_charge_current', 'Ladestrom hoch'],
  ['high_discharge_current', 'Entladestrom hoch'],
  ['internal_failure', 'interner Fehler'],
];

/** 0 = kein Alarm, 1 = Warnung, 2 = Alarm (Victron-Kodierung 0/1/2 bzw. Text). */
function alarmLevel(state: string): number {
  const n = Number(state);
  if (state.trim() !== '' && Number.isFinite(n)) return n <= 0 ? 0 : n >= 2 ? 2 : 1;
  const s = state.trim().toLowerCase();
  if (['', 'ok', 'off', 'false', 'none', 'normal', 'no alarm', 'no_alarm', 'kein alarm'].includes(s)) return 0;
  if (['warning', 'warn', 'warnung'].includes(s)) return 1;
  return 2;
}

export class PackCardBank extends LitElement {
  static properties = {
    hass: { attribute: false },
    unit: {},
    packs: { attribute: false },
    now: { type: Number },
  };

  hass?: Hass;
  unit: CapUnit = 'Ah';
  /** Packs fuer den zentralen Knopf Emergency */
  packs: PackConfig[] = [];
  /** Zeitpunkt fuer das Datenalter der Packs, vom Rahmen getaktet */
  now = 0;

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }
      .wrap {
        container-type: inline-size;
      }
      .bank {
        background: var(--pc-screen);
        border: 1px solid var(--pc-line);
        border-radius: 10px;
        padding: 12px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 12px 20px;
        align-items: center;
      }
      .batt {
        width: 80px;
        display: grid;
        justify-items: center;
        gap: 2px;
        text-align: center;
      }
      .batt svg {
        width: 58px;
        height: 108px;
        display: block;
      }
      .batt b {
        font-size: 14px;
        white-space: nowrap;
      }
      .soh {
        font-size: 11.5px;
        color: var(--pc-fg2);
      }
      /* Shunt-Block und Emergency links, BMS-Master rechts ueber beide Zeilen; Breite nach Inhalt (E21) */
      .grps {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-areas: 'shunt bms' 'em bms';
        align-items: start;
        gap: 8px;
        min-width: 0;
      }
      .grp {
        border: 1px solid var(--pc-line);
        border-radius: 8px;
        padding: 6px 10px;
        background: color-mix(in srgb, var(--pc-card) 55%, transparent);
      }
      .grp.shunt {
        grid-area: shunt;
      }
      .grp.bms {
        grid-area: bms;
        align-self: stretch;
      }
      pack-card-emergency {
        grid-area: em;
        align-self: end;
      }
      .bad {
        color: var(--pc-bad);
      }
      /* Bloecke untereinander, sobald beide nicht mehr nebeneinander passen (E16, rund 860 px Bankbreite) */
      @container (max-width: 859px) {
        .grps {
          grid-template-columns: minmax(0, 1fr);
          grid-template-areas: 'shunt' 'bms' 'em';
        }
      }
      /* Handy: Batterie, SoC und SoH klein in einer Zeile (E16, Umbruch rund 520 px) */
      @container (max-width: 519px) {
        .bank {
          grid-template-columns: 1fr;
          gap: 8px;
          padding: 10px;
        }
        .batt {
          width: auto;
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: flex-start;
        }
        .batt svg {
          width: 30px;
          height: 56px;
        }
        .grps {
          gap: 6px;
        }
        .grp {
          font-size: 12px;
          column-gap: 6px;
          padding: 5px 6px;
        }
        .grp .gk {
          white-space: normal;
          max-width: 9em;
        }
      }
    `,
  ];

  protected render(): TemplateResult {
    try {
      return html`<div class="wrap">
        <div class="bank">
          ${this.renderBatt()}
          <div class="grps">
            ${this.renderShunt()}${this.renderMaster()}
            <pack-card-emergency .hass=${this.hass} .packs=${this.packs} .now=${this.now}></pack-card-emergency>
          </div>
        </div>
      </div>`;
    } catch (e) {
      return fallback('Bank-Display', e);
    }
  }

  private renderBatt(): TemplateResult {
    try {
      const h = this.hass;
      const socId = `${BANK_SHUNT}soc`;
      const sohId = `${BANK_MASTER}soh`;
      const soc = numberOf(h, socId);
      const soh = numberOf(h, sohId);
      const svg = battSvg(soc);
      return html`<div class="batt">
        ${val(this, h, socId, svg)} ${val(this, h, socId, html`<b>SoC ${num(soc, 1, '%')}</b>`)}
        ${val(this, h, sohId, html`<span class="soh">SoH ${num(soh, 0, '%')}</span>`)}
      </div>`;
    } catch (e) {
      return fallback('SoC', e);
    }
  }

  /** Kapazitaet in der gewaehlten Einheit mit Einheit, fehlend „–“. */
  private cap(ah: number | undefined): string {
    if (ah === undefined) return DASH;
    return `${this.unit === 'kWh' ? fmt((ah * NOMINAL_V) / 1000, 1) : fmt(ah, 0)} ${this.unit}`;
  }

  private renderShunt(): TemplateResult {
    try {
      const h = this.hass;
      const S = (k: string) => `${BANK_SHUNT}${k}`;
      const inst = numberOf(h, `${BANK_MASTER}installed_capacity`);
      const used = numberOf(h, S('consumed_amphours'));
      const rest = inst !== undefined && used !== undefined ? Math.max(0, inst - Math.abs(used)) : undefined;
      return group(
        [
          {
            k: 'U / I / P:',
            v: [
              val(this, h, S('voltage'), num(numberOf(h, S('voltage')), 2, 'V')),
              val(this, h, S('current'), snum(numberOf(h, S('current')), 1, 'A')),
              val(this, h, S('power'), snum(numberOf(h, S('power')), 0, 'W')),
            ],
          },
          {
            k: 'Kapazität:',
            v: [
              html`<span class="nw"
                >${val(this, h, S('consumed_amphours'), this.cap(rest))}
                ${val(this, h, `${BANK_MASTER}installed_capacity`, `(${this.cap(inst)})`)}</span
              >`,
            ],
          },
          { k: 'Restlaufzeit:', v: [val(this, h, S('time_to_go'), dhm(secondsOf(h, S('time_to_go'))))] },
        ],
        'shunt',
      );
    } catch (e) {
      return fallback('Shunt', e);
    }
  }

  private renderMaster(): TemplateResult {
    try {
      const h = this.hass;
      const M = (k: string) => `${BANK_MASTER}${k}`;
      const cell = (vKey: string, idKey: string) =>
        html`<span class="nw"
          >${val(this, h, M(vKey), num(numberOf(h, M(vKey)), 3, 'V'))}
          <span class="src">${val(this, h, M(idKey), `(${cellId(textOf(h, M(idKey)))})`)}</span></span
        >`;
      const on = numberOf(h, M('nr_modules_online'));
      const off = numberOf(h, M('nr_modules_offline'));
      const bc = numberOf(h, M('nr_modules_blocking_charge'));
      const bd = numberOf(h, M('nr_modules_blocking_discharge'));
      const cnt = (x: number | undefined) => (x === undefined ? DASH : String(Math.round(x)));
      return group(
        [
          { k: 'Zelle max / min:', v: [cell('max_cell_voltage', 'max_voltage_cell_id'), cell('min_cell_voltage', 'min_voltage_cell_id')] },
          { k: tempLabel('max'), v: [val(this, h, M('max_cell_temperature'), num(numberOf(h, M('max_cell_temperature')), 1, '°C'))] },
          {
            k: 'Online / Charge / Discharge:',
            v: [
              val(this, h, M('nr_modules_online'), html`<span class=${off ? 'bad' : ''} title=${off ? `${off} offline` : ''}>${cnt(on)}</span>`),
              val(this, h, M('nr_modules_blocking_charge'), cnt(on !== undefined && bc !== undefined ? on - bc : undefined)),
              val(this, h, M('nr_modules_blocking_discharge'), cnt(on !== undefined && bd !== undefined ? on - bd : undefined)),
            ],
          },
          { k: 'Alarm:', v: [this.renderAlarm()], span: true },
        ],
        'bms',
      );
    } catch (e) {
      return fallback('BMS-Master', e);
    }
  }

  private renderAlarm(): TemplateResult {
    const h = this.hass;
    const known = ALARMS.map(([k, label]) => ({ id: `${BANK_MASTER}${k}`, label, s: stateOf(h, `${BANK_MASTER}${k}`) })).filter((a) => a.s);
    if (!known.length) return val(this, h, `${BANK_MASTER}${ALARMS[0][0]}`, DASH);
    const active = known.map((a) => ({ ...a, lvl: alarmLevel(a.s!.state) })).filter((a) => a.lvl > 0);
    if (!active.length) return val(this, h, known[0].id, html`<span class="tag ok">keiner</span>`);
    return html`${active.map((a) => val(this, h, a.id, html`<span class="tag ${a.lvl >= 2 ? 'bad' : 'warn'}">${a.label}</span>`))}`;
  }
}
