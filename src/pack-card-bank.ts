// Bank display (A01d E16): two halves of equal width like the stacks below. Left the SoC battery of the shunt as
// in the enclosures (same width, SoC and SoH below), next to it the shunt block and below it the central button
// "Emergency" (E7, own element); right the BMS master block (E21). Only calculation: remaining = installed
// capacity of the master minus Ah drawn according to the shunt, shown as "Kapazität: Rest (installiert)".
import { LitElement, html, css, TemplateResult } from 'lit';
import { BANK_MASTER, BANK_SHUNT, Hass, PackConfig, numberOf, secondsOf, stateOf, textOf } from './entities';
import { CapUnit, DASH, capText, cellId, dhm, gxPack, num, snum } from './format';
import { battSvg, fallback, group, sharedStyles, tempLabel, val } from './ui';

export type { CapUnit } from './format';

/**
 * Alarms of the BMS master (enum no_alarm / warning / alarm), read live on the old instance on 2026-11-01.
 * Missing entities are skipped (E10).
 */
const ALARMS: [string, string][] = [
  ['cell_imbalance', 'Zellungleichgewicht'],
  ['low_charge_temperature', 'Ladetemperatur niedrig'],
  ['high_charge_temperature', 'Ladetemperatur hoch'],
  ['high_charge_current', 'Ladestrom hoch'],
  ['high_discharge_current', 'Entladestrom hoch'],
  ['internal_failure', 'interner Fehler'],
];

/** 0 = no alarm, 1 = warning, 2 = alarm (Victron encoding 0/1/2 or text). */
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
  /** packs for the central Emergency button */
  packs: PackConfig[] = [];
  /** timestamp for the data age of the packs, clocked by the frame */
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
      /* two halves of equal width, gap as between the stacks */
      .bank {
        padding: 16px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 16px;
        align-items: stretch;
      }
      .lhs {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-areas: 'batt shunt' 'batt em';
        grid-template-rows: minmax(0, 1fr) auto;
        gap: 8px 16px;
        min-width: 0;
      }
      /* battery as in the enclosures (E17): 46 px wide, SoC and SoH below */
      .batt {
        grid-area: batt;
        display: grid;
        justify-items: center;
        align-content: start;
        gap: 2px;
        min-width: 58px;
        text-align: center;
      }
      .batt svg {
        width: 46px;
        height: 71px;
        display: block;
      }
      .batt b,
      .batt .soh {
        font-size: var(--pc-fs-s);
        line-height: 1.2;
        white-space: nowrap;
      }
      .batt b {
        font-weight: var(--ha-font-weight-medium, 500);
      }
      .batt .soh {
        color: var(--pc-fg2);
      }
      /* right half separated by a line instead of its own frame (E26) */
      .grp.bms {
        border-left: 1px solid var(--pc-line);
        padding-left: 16px;
      }
      .grp.shunt {
        grid-area: shunt;
      }
      pack-card-emergency {
        grid-area: em;
      }
      .bad {
        color: var(--pc-bad);
      }
      .grp .narrow {
        display: none;
      }
      /* halves stacked once they no longer fit side by side (E16, about 700 px bank width) */
      @container (max-width: 699px) {
        .bank {
          grid-template-columns: minmax(0, 1fr);
        }
        .grp.bms {
          border-left: 0;
          padding-left: 0;
          border-top: 1px solid var(--pc-line);
          padding-top: 16px;
        }
      }
      @container (max-width: 519px) {
        .bank {
          padding: 12px;
          gap: 12px;
        }
        .grp.bms {
          padding-top: 12px;
        }
        .grp .wide {
          display: none;
        }
        .grp .gk.narrow {
          display: block;
        }
        .grp .gv.narrow {
          display: flex;
        }
        .lhs {
          gap: 8px 12px;
        }
        .grp {
          column-gap: 8px;
        }
      }
    `,
  ];

  protected render(): TemplateResult {
    try {
      return html`<div class="wrap">
        <div class="bank surf">
          <div class="lhs">
            ${this.renderBatt()}${this.renderShunt()}
            <pack-card-emergency .hass=${this.hass} .packs=${this.packs} .now=${this.now}></pack-card-emergency>
          </div>
          ${this.renderMaster()}
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
        ${val(this, h, socId, svg)}${val(this, h, socId, html`<b>SoC ${num(soc, 1, '%')}</b>`)}
        ${val(this, h, sohId, html`<span class="soh">SoH ${num(soh, 0, '%')}</span>`)}
      </div>`;
    } catch (e) {
      return fallback('SoC', e);
    }
  }

  private cap(ah: number | undefined): string {
    return capText(ah, this.unit);
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
          // wide: one line "Zelle max / min", narrow: two lines so nothing wraps (container query below)
          { k: 'Zelle max / min:', v: [cell('max_cell_voltage', 'max_voltage_cell_id'), cell('min_cell_voltage', 'min_voltage_cell_id')], cls: 'wide' },
          { k: 'Zelle max:', v: [cell('max_cell_voltage', 'max_voltage_cell_id')], cls: 'narrow' },
          { k: 'Zelle min:', v: [cell('min_cell_voltage', 'min_voltage_cell_id')], cls: 'narrow' },
          { k: tempLabel('Zelle max'), v: [this.renderTemp()] },
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

  /**
   * Highest cell temperature of the BMS master (battery sensors without MOSFET, A01b) with the pack from the GX ID MM::CC;
   * the second part is not a unique sensor (live 2026-11-02) and is not shown.
   */
  private renderTemp(): TemplateResult {
    const h = this.hass;
    const M = (k: string) => `${BANK_MASTER}${k}`;
    const raw = textOf(h, M('max_temperature_cell_id'));
    const m = raw ? /^(\d+)::\d+$/.exec(raw.trim()) : null;
    const pack = m ? gxPack(Number(m[1])) : undefined;
    return html`<span class="nw"
      >${val(this, h, M('max_cell_temperature'), num(numberOf(h, M('max_cell_temperature')), 1, '°C'))}
      ${pack !== undefined ? html`<span class="src">${val(this, h, M('max_temperature_cell_id'), `(Pack ${pack})`)}</span>` : ''}</span
    >`;
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
