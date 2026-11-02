// Ansicht pack (A01d E19): ein Pack aus input_select.zellen_pack (E5, E6), im Aufbau des Gehaeuses aus E17 in gross.
// Kopf mit Ruecklink, Name, Master-Abzeichen, Lampen, BLE-Pegel, Datenalter, Stack, Notbetrieb-Restzeit, Fehlertext (E8),
// Zellanalyse und Packwechsel; fuenf Schalter in einer Zeile (E12); SoC-Balken und Werte in zwei Bloecken (E21);
// Zellblock (eigenes Element); BLE-Diagnose; unten Notbetrieb und BMS-Neustart mit einer Sekunde Halten (E7).
// Jeder Block in eigenem try/catch mit sichtbarem Rueckfall (E10), Zustaende nur ueber die Guards aus entities.
import { LitElement, html, css, TemplateResult } from 'lit';
import { Hass, PackConfig, STALE_S, StackConfig, ZELLEN_PACK, exists, numberOf, packEntity, secondsOf, stackOf, stateOf, textOf } from './entities';
import { DASH, ageText, clock, count, num, packCell, snum, uptimeText } from './format';
import { band, balancerState, bleInfo, deltaMv, extremeCells, maxTemp, packAge, packLeds, packPartStyles, CELLS } from './pack-parts';
import { battSvg, fallback, group, navigate, selectPack, sharedStyles, switchStyles, thermo, val, viewPath } from './ui';

interface SwitchDef {
  key: string;
  label: string;
  title: string;
  /** Ausschalten nur mit einer Sekunde Halten (Ergaenzung zu E7: Laden, Entladen, Bluetooth) */
  guard: boolean;
  /** wirkt am ESP, nicht am BMS: bleibt bedienbar, wenn das Pack keine Daten liefert (A01d-12) */
  esp?: boolean;
}

/** Fuenf Schalter (E19; Low-Balance entfaellt seit A01b E28). */
const SWITCHES: SwitchDef[] = [
  { key: 'charging', label: 'Laden', title: 'Laden', guard: true },
  { key: 'discharging', label: 'Entladen', title: 'Entladen', guard: true },
  { key: 'balancer', label: 'Balancer', title: 'Balancer', guard: false },
  { key: 'charging_float_mode', label: 'Float', title: 'Float-Modus', guard: false },
  { key: 'enable_bluetooth_connection', label: 'Bluetooth', title: 'Bluetooth (Aus trennt das Pack)', guard: true, esp: true },
];

/** Client-Zustand beim letzten Eingriff von Ebene 1 (A01f, Live-Abfragen: 0 = keiner seit Boot). */
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
  /** Pack kommt aus dem Helfer; false = Rueckfall auf das erste konfigurierte Pack */
  fromHelper: boolean;
  reason: string;
}

export class PackCardPack extends LitElement {
  static properties = {
    hass: { attribute: false },
    packs: { attribute: false },
    stacks: { attribute: false },
    now: { type: Number },
    speicherPath: {},
    zellenPath: {},
  };

  hass?: Hass;
  packs: PackConfig[] = [];
  stacks: StackConfig[] = [];
  now = 0;
  speicherPath = 'speicher';
  zellenPath = 'zellen';

  static styles = [
    sharedStyles,
    packPartStyles,
    switchStyles,
    css`
      :host {
        display: block;
      }
      .pv {
        container-type: inline-size;
        display: grid;
        gap: 12px;
        min-width: 0;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 6px 10px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .head h2 {
        font-size: 20px;
        font-weight: 500;
        margin: 0;
        white-space: nowrap;
      }
      .head .v {
        max-width: 100%;
      }
      .head .errtxt {
        white-space: normal;
        text-align: left;
        border-radius: 8px;
      }
      .nav {
        display: inline-flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .btn {
        border: 1px solid var(--pc-line);
        background: var(--pc-raise);
        color: var(--pc-fg);
        border-radius: 8px;
        padding: 5px 11px;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        white-space: nowrap;
      }
      .btn:hover:not(:disabled) {
        border-color: var(--pc-fg3);
      }
      .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .btn:focus-visible {
        outline: 2px solid var(--pc-accent);
        outline-offset: 1px;
      }
      .btn.pri {
        background: var(--pc-accent);
        color: var(--text-primary-color, var(--pc-card));
        border-color: transparent;
        font-weight: 500;
      }
      .ctrls {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 6px;
      }
      .ctrls pack-card-hold {
        display: block;
        min-width: 0;
      }
      .pbig {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }
      .batt {
        width: 104px;
        display: grid;
        justify-items: center;
        gap: 2px;
        text-align: center;
      }
      .batt svg {
        width: 88px;
        height: 164px;
        display: block;
      }
      .batt b {
        font-size: 16px;
        white-space: nowrap;
      }
      .batt .soh {
        font-size: 11.5px;
        color: var(--pc-fg2);
        white-space: nowrap;
      }
      .grps {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 8px;
        padding: 8px;
        max-width: 780px;
      }
      .grps .grp {
        border: 1px solid var(--pc-line);
        border-radius: 8px;
        padding: 6px 10px;
        background: color-mix(in srgb, var(--pc-card) 55%, transparent);
      }
      .diag {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 16px;
        font-size: 12.5px;
        color: var(--pc-fg2);
        padding: 6px 10px;
        border-radius: 8px;
        background: var(--pc-raise);
      }
      .diag b {
        color: var(--pc-fg);
        font-weight: 500;
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
      .holds pack-card-hold::part(button) {
        padding: 10px;
      }
      @container (max-width: 639px) {
        .pbig {
          gap: 10px;
        }
        .batt {
          width: 62px;
        }
        .batt svg {
          width: 50px;
          height: 93px;
        }
        .batt b {
          font-size: 12px;
        }
        .grps {
          grid-template-columns: minmax(0, 1fr);
          gap: 6px;
          padding: 4px;
        }
        .grps .grp {
          font-size: 11px;
          column-gap: 2px;
          padding: 4px 5px;
        }
        .grps .grp .gk {
          white-space: normal;
          max-width: 6.5em;
          padding-right: 3px;
        }
      }
      @container (max-width: 519px) {
        .head h2 {
          font-size: 18px;
        }
        .ctrls {
          gap: 4px;
        }
        .holds {
          grid-template-columns: 1fr;
        }
        .diag {
          font-size: 12px;
          gap: 2px 12px;
          padding: 6px 8px;
        }
      }
    `,
  ];

  /** Pack aus dem Helfer; fehlt er oder ist der Wert ungueltig, das erste konfigurierte Pack (E5, E6). */
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
        ${this.block('BLE-Diagnose', () => this.renderDiag(p))} ${this.block('Notbetrieb und Neustart', () => this.renderHolds(p))}
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
   * Grund, warum ein Bedienelement deaktiviert ist; leer, wenn es bedienbar ist (E10, Besonderheiten).
   * Mit bmsPack wirkt der Befehl am BMS: ohne frische Daten des Packs erreicht er es nicht, der Schalter
   * selbst bleibt dabei on/off statt unavailable (AU10 2026-11-02, A01d-12).
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
    const { age, fresh } = packAge(h, p, this.now);
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
      <h2>Pack ${n}</h2>
      ${n === 1 ? html`<span class="badge-m" title="Master am CAN zum Cerbo">M</span>` : ''} ${packLeds(h, p, fresh, !!err)}
      ${bleInfo(this, h, p, fresh, age)}
      <span class="tag mut" title=${`Stack ${s}`}>${stackName}</span>
      ${cd !== undefined && cd > 0 ? val(this, h, cdId, html`<span class="tag warn">Notbetrieb ${clock(cd)}</span>`) : ''}
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
        <button type="button" class="btn pri" @click=${this._openCells}>Zellanalyse →</button>
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
    return html`<div class="ctrls" role="group" aria-label="Schalter">${SWITCHES.map((d) => this.renderSwitch(p, d))}</div>`;
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
    // Einschalten (bei Laden, Entladen, Bluetooth) und Balancer/Float mit einfachem Tippen
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
    const { fresh } = packAge(h, p, this.now);
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
      {
        k: html`${thermo} max:`,
        v: [
          tMax
            ? html`${val(this, h, tMax.id, num(tMax.v, 1, '°C'))} <span class="src">(${tMax.s})</span>`
            : val(this, h, E('mosfet_temperature'), DASH),
        ],
      },
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
      { k: 'Ladephase:', v: [val(this, h, E('charge_status'), textOf(h, E('charge_status')) ?? DASH)], span: true },
      {
        k: 'Zyklen / Durchsatz:',
        v: [
          val(this, h, E('charging_cycles'), count(numberOf(h, E('charging_cycles')))),
          val(this, h, E('total_charging_cycle_capacity'), num(numberOf(h, E('total_charging_cycle_capacity')), 0, 'Ah')),
        ],
      },
    ]);
    return html`<div class="pbig">
      <div class="batt">
        ${val(this, h, socId, battSvg(soc))} ${val(this, h, socId, html`<b>SoC ${num(soc, 1, '%')}</b>`)}
        ${val(this, h, E('state_of_health'), html`<span class="soh">SoH ${num(numberOf(h, E('state_of_health')), 0, '%')}</span>`)}
      </div>
      <div class="grps scr ${tint}">${left}${right}</div>
    </div>`;
  }

  /** BLE-Diagnose (Entity-Ableitung): fehlende Entitaeten werden uebersprungen, damit neue nach einem Flash ohne Nacharbeit erscheinen (E10). */
  private renderDiag(p: PackConfig): TemplateResult {
    const h = this.hass;
    const E = (key: string) => packEntity(p, 'sensor', key);
    const items: TemplateResult[] = [];
    const add = (label: string, id: string, text: string, title = '') => {
      if (exists(h, id)) items.push(html`<span title=${title}>${label} ${val(this, h, id, text)}</span>`);
    };
    add(
      'Letzter Aufbau',
      E('ble_reconnect_duration'),
      ageText(secondsOf(h, E('ble_reconnect_duration'))),
      'Dauer des letzten BLE-Wiederaufbaus',
    );
    add(
      'Watchdog-Eingriffe',
      E('ble_watchdog_fixes'),
      count(numberOf(h, E('ble_watchdog_fixes'))),
      'Eingriffe von Ebene 1 seit dem Boot des ESP',
    );
    const fs = numberOf(h, E('ble_last_fix_state'));
    add(
      'Letzter Eingriff',
      E('ble_last_fix_state'),
      fs === undefined ? DASH : (FIX_STATES[Math.round(fs)] ?? String(Math.round(fs))),
      'Client-Zustand beim letzten Eingriff von Ebene 1',
    );
    add('Keepalive', E('ble_keepalive'), count(numberOf(h, E('ble_keepalive'))), 'Keepalive-Befehle 0x96 seit dem Boot des ESP');
    const rtf = textOf(h, E('total_runtime_formatted'));
    if (rtf !== undefined || !exists(h, E('total_runtime'))) add('BMS-Laufzeit', E('total_runtime_formatted'), rtf ?? DASH);
    else add('BMS-Laufzeit', E('total_runtime'), uptimeText(secondsOf(h, E('total_runtime'))));
    add('BMS-Einschaltungen', E('power_on_count'), count(numberOf(h, E('power_on_count'))));
    return html`<div class="diag" aria-label="BLE-Diagnose">
      <b>BLE-Diagnose</b>${items.length ? items : html`<span>keine Diagnosewerte</span>`}
    </div>`;
  }

  private renderHolds(p: PackConfig): TemplateResult {
    const emId = packEntity(p, 'switch', 'emergency');
    const rsId = packEntity(p, 'button', 'restart');
    const emOn = this.hass?.states[emId]?.state === 'on';
    const emReason = this.reasonFor(emId, p);
    // Knopf ohne bisherigen Druck steht auf unknown: Normalzustand, bedienbar (Besonderheiten)
    const rsReason = this.reasonFor(rsId, p);
    // Pack_1 ist Master am CAN zum Cerbo (Besonderheiten); A01f: dort nicht neu starten
    const master = p.pack === 1;
    return html`<div class="holds">
      <pack-card-hold
        class="em"
        .label=${emOn ? 'Notbetrieb aus' : 'Notbetrieb ein'}
        .active=${emOn}
        .disabled=${!!emReason}
        .reason=${emReason}
        tone="warn"
        @hold-complete=${() => this._emergency(emId, p)}
      ></pack-card-hold>
      <pack-card-hold
        class="rs"
        .label=${master ? 'BMS neu starten (Master!)' : 'BMS neu starten'}
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

  /** Schalter: Zustand beim Ausloesen neu lesen; geschuetzte Schalter schalten nie per Tippen aus. */
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
    this._call('switch', on ? 'turn_off' : 'turn_on', id, 'Notbetrieb');
  }

  private _restart(id: string, p: PackConfig): void {
    if (this.reasonFor(id, p)) return;
    this._call('button', 'press', id, 'BMS-Neustart');
  }

  /** Vorheriges/naechstes Pack: nur den Helfer setzen, die Ansicht bleibt (E5). */
  private _select(n: number): void {
    void selectPack(this.hass, n);
  }

  /** „Zellanalyse“: Helfer auf das angezeigte Pack setzen, dann wechseln (Besonderheiten: Pack-Auswahl der Zellansicht). */
  private _openCells = async (): Promise<void> => {
    const cur = this.current();
    if (cur) await selectPack(this.hass, cur.p.pack);
    navigate(viewPath(this.zellenPath || 'zellen'));
  };
}
