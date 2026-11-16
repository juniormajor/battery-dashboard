// View pack (A01d E19): one pack from input_select.zellen_pack (E5, E6), in the enclosure layout of E17 at large size.
// Header with back link, name, master badge, stack, emergency remaining time, error text (E8), cell analysis and pack switching;
// five switches in one card (E12, E26); enclosure card with type plate, BLE level and data age, SoC battery,
// the values in two areas (E21) and the lamps; cell card (own element); BLE diagnostics;
// at the bottom Emergency and Pack reboot (BMS restart) with one second of holding (E7).
// Each block in its own try/catch with a visible fallback (E10); states only via the guards from entities.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, STALE_S, StackConfig, ZELLEN_PACK, exists, numberOf, packEntity, secondsOf, stackOf, stateOf, textOf } from './entities';
import { CapUnit, DASH, ageText, clock, count, num, packCell, snum, uptimeText } from './format';
import { band, balancerState, bleInfo, capLine, caseStyles, deltaMv, extremeCells, maxTemp, packAge, packLeds, packPartStyles, caseBottom, CELLS } from './pack-parts';
import { UNIT_EVENT, battSvg, fallback, group, navigate, selectPack, sharedStyles, switchStyles, tempLabel, unitSwitch, val, viewPath } from './ui';

interface SwitchDef {
  key: string;
  label: string;
  title: string;
  /** switching off only with one second of holding (addition to E7: Charge, Discharge, Bluetooth) */
  guard: boolean;
  /** acts on the ESP, not on the BMS: stays operable when the pack delivers no data (A01d-12) */
  esp?: boolean;
}

/** Five switches (E19; low balance dropped since A01b E28). */
const SWITCHES: SwitchDef[] = [
  { key: 'charging', label: 'Charge', title: 'Charge', guard: true },
  { key: 'discharging', label: 'Discharge', title: 'Discharge', guard: true },
  { key: 'balancer', label: 'Balancer', title: 'Balancer', guard: false },
  { key: 'charging_float_mode', label: 'Float', title: 'Float-Modus', guard: false },
  { key: 'enable_bluetooth_connection', label: 'Bluetooth', title: 'Bluetooth (Aus trennt das Pack)', guard: true, esp: true },
];

/** Client state at the last intervention of level 1 (A01f, Live-Abfragen: 0 = none since boot). */
const FIX_STATES: Record<number, string> = {
  0: 'keiner',
  2: 'IDLE',
  3: 'DISCOVERED',
  4: 'CONNECTING',
  5: 'CONNECTED',
  6: 'ESTABLISHED',
};

interface Current {
  p: PackConfig;
  /** pack comes from the helper; false = fallback to the first configured pack */
  fromHelper: boolean;
  reason: string;
}

export class PackCardPack extends LitElement {
  static properties = {
    hass: { attribute: false },
    packs: { attribute: false },
    stacks: { attribute: false },
    now: { type: Number },
    unit: {},
    speicherPath: {},
    zellenPath: {},
  };

  hass?: Hass;
  packs: PackConfig[] = [];
  stacks: StackConfig[] = [];
  now = 0;
  /** capacity unit as in the bank display */
  unit: CapUnit = 'Ah';
  speicherPath = 'speicher';
  zellenPath = 'zellen';

  static styles = [
    sharedStyles,
    packPartStyles,
    caseStyles,
    switchStyles,
    css`
      :host {
        display: block;
      }
      .pv {
        container-type: inline-size;
        display: grid;
        gap: 8px;
        min-width: 0;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .head .v {
        max-width: 100%;
      }
      .head .errtxt {
        white-space: normal;
        text-align: left;
      }
      .nav {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      /* five switches in one card, separated by lines (E19, E26) */
      .ctrls {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        overflow: hidden;
      }
      .ctrls > * + * {
        border-left: 1px solid var(--pc-line);
      }
      .ctrls pack-card-hold {
        display: block;
        min-width: 0;
      }
      .case {
        border-radius: var(--pc-r-lg);
        padding: 16px;
        gap: 12px;
      }
      .case-mid {
        gap: 16px;
      }
      /* battery as in the bank display (58 px), so the value area stands without empty space above and below */
      .soc {
        width: 76px;
      }
      .soc svg {
        width: 58px;
        height: 90px;
      }
      .soc .soh {
        font-size: var(--pc-fs-s);
      }
      /* two value areas side by side (E21), each on the quiet fill (E26) */
      .bezel .scr.grps {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        padding: 0;
        background: none;
      }
      .grps .grp {
        border-radius: var(--pc-r-md);
        padding: 8px 12px;
        background: var(--pc-screen);
      }
      .grps.t-soft .grp {
        background: color-mix(in srgb, var(--pc-soft) 13%, var(--pc-screen));
      }
      .grps.t-warn .grp {
        background: color-mix(in srgb, var(--pc-warn) 15%, var(--pc-screen));
      }
      .grps.t-bad .grp {
        background: color-mix(in srgb, var(--pc-bad) 18%, var(--pc-screen));
      }
      .diag {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 16px;
        color: var(--pc-fg2);
        padding: 12px 16px;
      }
      .diag b {
        color: var(--pc-fg);
        font-weight: var(--ha-font-weight-medium, 500);
      }
      .diag .v {
        color: var(--pc-fg);
      }
      .holds {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .holds pack-card-hold {
        display: block;
      }
      @container (max-width: 719px) {
        .bezel .scr.grps {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @container (max-width: 639px) {
        .case {
          padding: 12px;
        }
        .case-mid {
          gap: 8px;
        }
        .soc {
          width: 62px;
        }
        .soc svg {
          width: 46px;
          height: 71px;
        }
        .soc b {
          font-size: var(--pc-fs-s);
        }
        .grps .grp {
          font-size: var(--pc-fs-s);
          column-gap: 8px;
          padding: 8px;
        }
        .grps .grp .gk {
          white-space: normal;
          max-width: 7.5em;
        }
      }
      @container (max-width: 519px) {
        .holds {
          grid-template-columns: 1fr;
        }
        .diag {
          font-size: var(--pc-fs-s);
          gap: 4px 12px;
          padding: 12px;
        }
      }
    `,
  ];

  /** Pack from the helper; if it is missing or the value is invalid, the first configured pack (E5, E6). */
  private current(): Current | undefined {
    const first = this.packs[0];
    if (!first) return undefined;
    const helper = stateOf(this.hass, ZELLEN_PACK);
    if (!helper)
      return { p: first, fromHelper: false, reason: `${ZELLEN_PACK} fehlt oder ist nicht verfügbar – angezeigt wird Pack ${first.pack}` };
    const m = /^Pack_(\d+)$/.exec(helper.state.trim());
    const p = m ? this.packs.find((q) => q.pack === Number(m[1])) : undefined;
    if (!p)
      return {
        p: first,
        fromHelper: false,
        reason: `${ZELLEN_PACK} = „${helper.state}“ ist kein konfiguriertes Pack – angezeigt wird Pack ${first.pack}`,
      };
    return { p, fromHelper: true, reason: '' };
  }

  protected render(): TemplateResult {
    try {
      const cur = this.current();
      if (!cur) return html`<div class="pv">${fallback('Ansicht pack', new Error('keine Packs konfiguriert'))}</div>`;
      const p = cur.p;
      return html`<div class="pv" aria-label=${`Pack ${p.pack}`}>
        ${this.block('Kopf', () => this.renderHead(cur))} ${this.block('Schalter', () => this.renderSwitches(p))}
        ${this.block('Packwerte', () => this.renderValues(p))}
        <pack-card-cells .hass=${this.hass} .pack=${p}></pack-card-cells>
        ${this.block('BLE-Diagnose', () => this.renderDiag(p))} ${this.block('Emergency und Neustart', () => this.renderHolds(p))}
      </div>`;
    } catch (e) {
      return fallback('Ansicht pack', e);
    }
  }

  private block(what: string, fn: () => TemplateResult): TemplateResult {
    try {
      return fn();
    } catch (e) {
      return fallback(what, e);
    }
  }

  private get canCall(): boolean {
    return typeof this.hass?.callService === 'function';
  }

  /**
   * Reason why a control is disabled; empty if it is operable (E10, Besonderheiten).
   * With bmsPack the command acts on the BMS: without fresh data from the pack it does not reach it, while the switch
   * itself stays on/off instead of unavailable (AU10 2026-11-02, A01d-12).
   */
  private reasonFor(id: string, bmsPack?: PackConfig): string {
    const s = this.hass?.states[id];
    if (!s) return `${id} fehlt`;
    if (s.state === 'unavailable') return `${id} nicht verfügbar – ohne Verbindung zum BMS nicht schaltbar`;
    if (!this.canCall) return 'Keine Verbindung zu Home Assistant';
    if (bmsPack && !packAge(this.hass, bmsPack, this.now).fresh) {
      return `Pack ${bmsPack.pack} ohne Daten seit über ${STALE_S} s – der Befehl erreicht das BMS nicht`;
    }
    return '';
  }

  private renderHead(cur: Current): TemplateResult {
    const h = this.hass;
    const p = cur.p;
    const n = p.pack;
    const E = (dom: string, key: string) => packEntity(p, dom, key);
    const errId = E('sensor', 'errors');
    const err = textOf(h, errId);
    const incomplete = numberOf(h, E('sensor', 'state_of_charge')) === undefined || numberOf(h, E('sensor', 'total_voltage')) === undefined;
    const cdId = E('sensor', 'emergency_time_countdown');
    const cd = secondsOf(h, cdId);
    const s = stackOf(p);
    const stackName = this.stacks.find((x) => x.stack === s)?.name ?? `Stack ${s}`;
    const idx = Math.max(
      0,
      this.packs.findIndex((q) => q.pack === n),
    );
    const prev = this.packs[(idx - 1 + this.packs.length) % this.packs.length].pack;
    const next = this.packs[(idx + 1) % this.packs.length].pack;
    const helper = stateOf(h, ZELLEN_PACK);
    const options = helper?.attributes?.options;
    const canSel = (m: number) => !!helper && this.canCall && (!Array.isArray(options) || options.includes(`Pack_${m}`));
    const selReason = (m: number) =>
      !helper
        ? `${ZELLEN_PACK} fehlt oder ist nicht verfügbar`
        : !this.canCall
          ? 'Keine Verbindung zu Home Assistant'
          : `${ZELLEN_PACK} kennt Pack_${m} nicht`;
    return html`<div class="head">
      <button type="button" class="link" @click=${() => navigate(viewPath(this.speicherPath))}>← Speicher</button>
      <h2 class="ttl">Pack ${n}</h2>
      ${n === 1 ? html`<span class="badge-m" title="Master am CAN zum Cerbo">Master</span>` : ''}
      <span class="badge" title=${`Stack ${s}`}>${stackName}</span>
      ${cd !== undefined && cd > 0 ? val(this, h, cdId, html`<span class="tag warn">Emergency ${clock(cd)}</span>`) : ''}
      ${
        err
          ? val(this, h, errId, html`<span class="tag bad errtxt">${err}</span>`)
          : incomplete
            ? html`<span class="tag mut">Daten unvollständig</span>`
            : ''
      }
      ${cur.fromHelper ? '' : html`<span class="tag warn" title=${cur.reason}>Pack-Auswahl fehlt</span>`}
      <span class="sp"></span>
      <span class="nav">
        ${unitSwitch(this.unit, this._setUnit)}
        <button type="button" class="btn" @click=${this._openCells}>Zellanalyse</button>
        <button
          type="button"
          class="btn prev"
          ?disabled=${!canSel(prev)}
          title=${canSel(prev) ? `Pack ${prev}` : selReason(prev)}
          aria-label=${`Vorheriges Pack: Pack ${prev}`}
          @click=${() => this._select(prev)}
        >
          ‹ ${prev}
        </button>
        <button
          type="button"
          class="btn next"
          ?disabled=${!canSel(next)}
          title=${canSel(next) ? `Pack ${next}` : selReason(next)}
          aria-label=${`Nächstes Pack: Pack ${next}`}
          @click=${() => this._select(next)}
        >
          ${next} ›
        </button>
      </span>
    </div>`;
  }

  private renderSwitches(p: PackConfig): TemplateResult {
    return html`<div class="ctrls surf" role="group" aria-label="Schalter">${SWITCHES.map((d) => this.renderSwitch(p, d))}</div>`;
  }

  private renderSwitch(p: PackConfig, d: SwitchDef): TemplateResult {
    const id = packEntity(p, 'switch', d.key);
    const on = this.hass?.states[id]?.state === 'on';
    const bms = d.esp ? undefined : p;
    const reason = this.reasonFor(id, bms);
    if (d.guard && on && !reason) {
      return html`<pack-card-hold
        variant="switch"
        data-entity=${id}
        .label=${d.label}
        .active=${true}
        @hold-complete=${() => this._switch(id, 'turn_off', true, bms)}
      ></pack-card-hold>`;
    }
    // switching on (for Charge, Discharge, Bluetooth) and Balancer/Float with a single tap
    const service = d.guard ? 'turn_on' : 'toggle';
    return html`<button
      type="button"
      class="sw"
      role="switch"
      data-entity=${id}
      aria-checked=${String(on)}
      aria-label=${d.title}
      ?disabled=${!!reason}
      title=${reason || `${d.title}: antippen ${d.guard ? 'schaltet ein' : 'schaltet um'}`}
      @click=${() => this._switch(id, service, d.guard, bms)}
    >
      <span class="lbl"><span>${d.label}</span></span
      ><i class="knob"></i>
    </button>`;
  }

  private renderValues(p: PackConfig): TemplateResult {
    const h = this.hass;
    const n = p.pack;
    const E = (key: string) => packEntity(p, 'sensor', key);
    const socId = E('state_of_charge');
    const soc = numberOf(h, socId);
    const { age, fresh } = packAge(h, p, this.now);
    const err = textOf(h, E('errors'));
    const dmv = deltaMv(h, p);
    const tint = !fresh ? 't-off' : err ? 't-bad' : band(dmv);
    const bal = stateOf(h, packEntity(p, 'binary_sensor', 'balancing'))?.state === 'on';
    const tMax = maxTemp(h, p);
    const volts = Array.from({ length: CELLS }, (_, k) => numberOf(h, E(`cell_voltage_${k + 1}`)));
    const bs = balancerState(h, p, extremeCells(h, p, volts));
    const bmId = E('balancer_status_bitmask');
    const bitmask = bs.cells.length
      ? html`<span class="src"
          >${val(this, h, bmId, html`<span title=${bs.title}>(${bs.cells.map((c) => packCell(n, c)).join(', ')})</span>`)}</span
        >`
      : bs.raw === undefined && exists(h, bmId)
        ? html`<span class="src">${val(this, h, bmId, `(${DASH})`)}</span>`
        : undefined;
    const left = group([
      tMax
        ? { k: tempLabel(tMax.s), v: [val(this, h, tMax.id, num(tMax.v, 1, '°C'))] }
        : { k: tempLabel('IC'), v: [val(this, h, E('mosfet_temperature'), DASH)] },
      {
        k: 'Zellen min / Ø / max:',
        v: [
          val(this, h, E('min_cell_voltage'), num(numberOf(h, E('min_cell_voltage')), 3)),
          val(this, h, E('average_cell_voltage'), num(numberOf(h, E('average_cell_voltage')), 3)),
          val(this, h, E('max_cell_voltage'), num(numberOf(h, E('max_cell_voltage')), 3, 'V')),
        ],
      },
      {
        k: 'ΔU / I Bal:',
        v: [
          val(this, h, E('delta_cell_voltage'), num(dmv, 0, 'mV')),
          val(
            this,
            h,
            E('balancing_current'),
            html`<span class=${bal ? 'balv' : ''}>${num(numberOf(h, E('balancing_current')), 2, 'A')}</span>`,
          ),
          bitmask,
        ],
        nosep: true,
      },
    ]);
    const right = group([
      {
        k: 'U / I / P:',
        v: [
          val(this, h, E('total_voltage'), num(numberOf(h, E('total_voltage')), 2, 'V')),
          val(this, h, E('current'), snum(numberOf(h, E('current')), 2, 'A')),
          val(this, h, E('power'), snum(numberOf(h, E('power')), 0, 'W')),
        ],
      },
      capLine(this, h, p, this.unit),
      { k: 'Ladephase:', v: [val(this, h, E('charge_status'), textOf(h, E('charge_status')) ?? DASH)], span: true },
      {
        k: 'Zyklen / Durchsatz:',
        v: [
          val(this, h, E('charging_cycles'), count(numberOf(h, E('charging_cycles')))),
          val(this, h, E('total_charging_cycle_capacity'), num(numberOf(h, E('total_charging_cycle_capacity')), 0, 'Ah')),
        ],
      },
    ]);
    return html`<article class="case surf" aria-label=${`Pack ${n}`}>
      <div class="case-top">
        <span class="plate-w"
          ><span class="plate">Pack ${n}</span>${n === 1 ? html`<span class="badge-m" title="Master am CAN zum Cerbo">Master</span>` : ''}</span
        >
        ${bleInfo(this, h, p, fresh, age)}
      </div>
      <div class="case-mid">
        <div class="soc">
          ${val(this, h, socId, battSvg(soc))} ${val(this, h, socId, html`<b>SoC ${num(soc, 1, '%')}</b>`)}
          ${val(this, h, E('state_of_health'), html`<span class="soh">SoH ${num(numberOf(h, E('state_of_health')), 0, '%')}</span>`)}
        </div>
        <div class="bezel"><div class="grps scr ${tint}">${left}${right}</div></div>
      </div>
      ${caseBottom(packLeds(h, p, fresh, !!err))}
    </article>`;
  }

  /**
   * BLE line (entity derivation): short labels in one line, the detailed meaning in the title; missing
   * entities are skipped so that new ones appear after a flash without rework (E10).
   */
  private renderDiag(p: PackConfig): TemplateResult {
    const h = this.hass;
    const E = (key: string) => packEntity(p, 'sensor', key);
    const items: TemplateResult[] = [];
    const add = (label: string, id: string, text: string, title = '') => {
      if (exists(h, id)) items.push(html`<span title=${title}>${label} ${val(this, h, id, text)}</span>`);
    };
    add('Aufbau', E('ble_reconnect_duration'), ageText(secondsOf(h, E('ble_reconnect_duration'))), 'Dauer des letzten BLE-Wiederaufbaus');
    add('Watchdog', E('ble_watchdog_fixes'), count(numberOf(h, E('ble_watchdog_fixes'))), 'Eingriffe von Ebene 1 seit dem Boot des ESP');
    const fs = numberOf(h, E('ble_last_fix_state'));
    add(
      'Eingriff',
      E('ble_last_fix_state'),
      fs === undefined ? DASH : (FIX_STATES[Math.round(fs)] ?? String(Math.round(fs))),
      'Client-Zustand beim letzten Eingriff von Ebene 1',
    );
    add('Keepalive', E('ble_keepalive'), count(numberOf(h, E('ble_keepalive'))), 'Keepalive-Befehle 0x96 seit dem Boot des ESP');
    const rtf = textOf(h, E('total_runtime_formatted'));
    if (rtf !== undefined || !exists(h, E('total_runtime'))) add('BMS', E('total_runtime_formatted'), rtf ?? DASH, 'Laufzeit des BMS');
    else add('BMS', E('total_runtime'), uptimeText(secondsOf(h, E('total_runtime'))), 'Laufzeit des BMS');
    add('Starts', E('power_on_count'), count(numberOf(h, E('power_on_count'))), 'Einschaltungen des BMS');
    return html`<div class="diag surf" aria-label="BLE-Diagnose">
      <b>BLE</b>${items.length ? items : html`<span>keine Diagnosewerte</span>`}
    </div>`;
  }

  private renderHolds(p: PackConfig): TemplateResult {
    const emId = packEntity(p, 'switch', 'emergency');
    const rsId = packEntity(p, 'button', 'restart');
    const emOn = this.hass?.states[emId]?.state === 'on';
    const emReason = this.reasonFor(emId, p);
    // a button never pressed is unknown: normal state, operable (Besonderheiten)
    const rsReason = this.reasonFor(rsId, p);
    // Pack_1 is master on the CAN bus to the Cerbo (Besonderheiten); A01f: do not restart it there
    const master = p.pack === 1;
    return html`<div class="holds">
      <pack-card-hold
        class="em"
        plain
        .label=${'Emergency'}
        .active=${emOn}
        .disabled=${!!emReason}
        .reason=${emReason}
        tone="warn"
        @hold-complete=${() => this._emergency(emId, p)}
      ></pack-card-hold>
      <pack-card-hold
        class="rs"
        plain
        .label=${master ? 'Pack reboot (Master!)' : 'Pack reboot'}
        .disabled=${!!rsReason}
        .reason=${rsReason}
        tone="bad"
        @hold-complete=${() => this._restart(rsId, p)}
      ></pack-card-hold>
    </div>`;
  }

  private _call(domain: string, service: string, entityId: string, what: string): void {
    try {
      if (!this.hass?.callService) return;
      this.hass.callService(domain, service, { entity_id: entityId })?.catch?.((e: unknown) => console.warn(`pack-card: ${what}`, e));
    } catch (e) {
      console.warn(`pack-card: ${what}`, e);
    }
  }

  /** Switch: re-read the state when triggered; protected switches never switch off by tapping. */
  private _switch(id: string, service: 'toggle' | 'turn_on' | 'turn_off', guard: boolean, bms?: PackConfig): void {
    if (this.reasonFor(id, bms)) return;
    const on = this.hass?.states[id]?.state === 'on';
    if (guard && service === 'turn_on' && on) return;
    if (service === 'turn_off' && !on) return;
    this._call('switch', service, id, `Schalter ${id}`);
  }

  private _emergency(id: string, p: PackConfig): void {
    if (this.reasonFor(id, p)) return;
    const on = this.hass?.states[id]?.state === 'on';
    this._call('switch', on ? 'turn_off' : 'turn_on', id, 'Emergency');
  }

  private _restart(id: string, p: PackConfig): void {
    if (this.reasonFor(id, p)) return;
    this._call('button', 'press', id, 'BMS-Neustart');
  }

  /** Ah/kWh: report to the frame, which remembers the choice and passes it to all views (E19). */
  private _setUnit = (u: CapUnit): void => {
    this.dispatchEvent(new CustomEvent(UNIT_EVENT, { detail: u, bubbles: true, composed: true }));
  };

  /** Previous/next pack: only set the helper, the view stays (E5). */
  private _select(n: number): void {
    void selectPack(this.hass, n);
  }

  /** "Zellanalyse": set the helper to the displayed pack, then switch (Besonderheiten: pack selection of the cell view). */
  private _openCells = async (): Promise<void> => {
    const cur = this.current();
    if (cur) await selectPack(this.hass, cur.p.pack);
    navigate(viewPath(this.zellenPath || 'zellen'));
  };
}
