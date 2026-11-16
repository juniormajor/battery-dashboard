// Shared building blocks: clickable value (E4), column-aligned group (E21), navigation, fallback (E10), styles (E15, E26).
import { css, html, TemplateResult } from 'lit';
import { Hass, ZELLEN_PACK, exists, stateOf } from './entities';
import { CapUnit, fmt } from './format';

export function fireMoreInfo(node: EventTarget, entityId: string): void {
  node.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

/** Value as click target opening more-info of its entity; if the entity is missing, it is not clickable. */
export function val(node: EventTarget, hass: Hass | undefined, entityId: string, content: unknown, cls = ''): TemplateResult {
  const ok = exists(hass, entityId);
  return html`<button
    type="button"
    class="v ${cls}"
    data-entity=${entityId}
    ?disabled=${!ok}
    title=${ok ? entityId : `${entityId} fehlt`}
    @click=${(e: Event) => {
      e.stopPropagation();
      fireMoreInfo(node, entityId);
    }}
  >${content}</button>`;
}

export interface GroupLine {
  /** label with colon */
  k: unknown;
  /** up to three values, separated by "/" */
  v: unknown[];
  /** one value spanning all value columns */
  span?: boolean;
  /** no "/" before the third value (addition such as the balancer cells) */
  nosep?: boolean;
  /** class for label and values, e.g. wide/narrow for rows that appear only wide or only narrow */
  cls?: string;
}

/**
 * "Label: value / value / value" (E21): labels aligned in one column, the values of a row directly behind them,
 * left-aligned, separated by "/". No value columns across rows, so values of different length leave no gaps.
 */
export function group(lines: GroupLine[], cls = ''): TemplateResult {
  return html`<div class="grp ${cls}">
    ${lines.map((l) => {
      const vs = l.v.filter((x) => x !== undefined);
      return html`<span class="gk ${l.cls ?? ''}">${l.k}</span><span class="gv ${l.span ? 'span' : ''} ${l.cls ?? ''}"
        >${vs.map((x, i) => html`${i > 0 ? (i === 2 && l.nosep ? html` ` : html`<span class="gs">/</span>`) : ''}${x}`)}</span
      >`;
    })}
  </div>`;
}

export const thermo = html`<svg class="ico" viewBox="0 0 12 20" role="img" aria-label="Temperatur">
  <path d="M4 3a2 2 0 0 1 4 0v9.3a3.6 3.6 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="1.5"></path>
  <circle cx="6" cy="15" r="2" fill="currentColor"></circle>
  <path d="M6 8v6" stroke="currentColor" stroke-width="1.6"></path>
</svg>`;

/**
 * Temperature label with thermometer (E20, E21): "max" only for a true maximum over several sensors,
 * otherwise the sensor itself (IC, T1, T2, T4, T5, ESP).
 */
export function tempLabel(what: string, colon = true): TemplateResult {
  return html`<span class="tl">${thermo}${what}${colon ? ':' : ''}</span>`;
}

/** Event with which a view reports the capacity unit to the card (pack view -> frame). */
export const UNIT_EVENT = 'pack-card-unit';

/**
 * Ah/kWh toggle for the capacity (E16, E19): same look in speicher and pack; the choice applies to all
 * views and is remembered per browser (frame pack-card).
 */
export function unitSwitch(unit: CapUnit, set: (u: CapUnit) => void): TemplateResult {
  const b = (u: CapUnit) =>
    html`<button type="button" aria-pressed=${String(unit === u)} @click=${() => set(u)}>${u}</button>`;
  return html`<span class="seg" role="group" aria-label="Kapazität in">${b('Ah')}${b('kWh')}</span>`;
}

/** View path: absolute from "/", otherwise relative to the current dashboard (/<dashboard-url>/<path>). */
export function viewPath(p: string): string {
  if (p.startsWith('/')) return p;
  const dash = window.location.pathname.split('/').filter(Boolean)[0] ?? 'lovelace';
  return `/${dash}/${p.replace(/^\/+/, '')}`;
}

export function navigate(path: string): void {
  history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}

/**
 * Set the pack helper (E5, E6): input_select.zellen_pack to Pack_<n>, only if the helper exists and knows the option.
 * Errors are only reported; the caller navigates anyway (E6: navigate cannot pass a parameter).
 */
export async function selectPack(hass: Hass | undefined, n: number): Promise<void> {
  const option = `Pack_${n}`;
  try {
    const helper = stateOf(hass, ZELLEN_PACK);
    const options = helper?.attributes?.options;
    if (helper && hass?.callService && (!Array.isArray(options) || options.includes(option))) {
      await hass.callService('input_select', 'select_option', { entity_id: ZELLEN_PACK, option });
    } else {
      console.warn(`pack-card: ${ZELLEN_PACK} nicht verfügbar oder ohne Option ${option}`);
    }
  } catch (e) {
    console.warn(`pack-card: ${ZELLEN_PACK} nicht gesetzt`, e);
  }
}

/**
 * Vertical battery with SoC fill (bank display E16, enclosure E17, pack view E19); size is set by the caller's
 * CSS. vh is the height in the viewBox at width 58: 108 slim, 90 stocky (everywhere since v0.5.2).
 */
export function battSvg(soc: number | undefined, vh = 90): TemplateResult {
  const fillMax = vh - 22;
  const fillH = ((soc === undefined ? 0 : Math.max(0, Math.min(100, soc))) / 100) * fillMax;
  return html`<svg viewBox=${`0 0 58 ${vh}`} role="img" aria-label=${`SoC ${fmt(soc, 1)} Prozent`}>
    <rect x="20" y="1" width="18" height="7" rx="2" fill="var(--pc-fg3)"></rect>
    <rect x="3" y="8" width="52" height=${vh - 10} rx="7" fill="var(--pc-card)" stroke="var(--pc-fg3)" stroke-width="2"></rect>
    <rect x="9" y=${14 + fillMax - fillH} width="40" height=${fillH} rx="3" fill=${socColor(soc)}></rect>
    ${[25, 50, 75].map((q) => {
      const y = 14 + fillMax - (q / 100) * fillMax;
      return html`<line x1="9" x2="49" y1=${y} y2=${y} stroke="var(--pc-card)" stroke-width="1.5"></line>`;
    })}
  </svg>`;
}

/** Visible fallback of a building block (E10). */
export function fallback(what: string, e: unknown): TemplateResult {
  console.warn(`pack-card: ${what} nicht gezeichnet`, e);
  return html`<div class="fail">${what}: Daten unvollständig</div>`;
}

/** SoC fill color: above 50 % good, above 20 % warning, below bad (mockup socColor). */
export function socColor(soc: number | undefined): string {
  if (soc === undefined) return 'transparent';
  return soc > 50 ? 'var(--pc-ok)' : soc > 20 ? 'var(--pc-warn)' : 'var(--pc-bad)';
}

/**
 * Design variables (E15, E26): surfaces, text, lines, status colors, font, font sizes, radii and spacing come from
 * the HA frontend variables, so the card follows the active theme in light and dark mode. The fixed values are only
 * fallbacks for an older frontend; a theme can still override single status colors via --pack-card-*-color.
 */
export const themeVars = css`
  :host {
    --pc-font: var(--ha-font-family-body, Roboto, Noto, sans-serif);
    --pc-fs-xs: var(--ha-font-size-xs, 10px);
    --pc-fs-s: var(--ha-font-size-s, 12px);
    --pc-fs-m: var(--ha-font-size-m, 14px);
    --pc-fs-l: var(--ha-font-size-l, 16px);
    --pc-fs-xl: var(--ha-font-size-xl, 20px);
    --pc-fs-2xl: var(--ha-font-size-2xl, 24px);
    --pc-r-sm: var(--ha-border-radius-sm, 4px);
    --pc-r-md: var(--ha-border-radius-md, 8px);
    --pc-r-lg: var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px));
    --pc-r-pill: var(--ha-border-radius-pill, 9999px);
    --pc-fg: var(--primary-text-color);
    --pc-fg2: var(--secondary-text-color);
    --pc-line: var(--divider-color);
    --pc-card: var(--ha-card-background, var(--card-background-color));
    --pc-fg3: color-mix(in srgb, var(--secondary-text-color) 75%, var(--pc-card));
    --pc-raise: var(--ha-color-fill-neutral-quiet-resting, var(--secondary-background-color));
    --pc-fill-pri: var(--ha-color-fill-primary-quiet-resting, color-mix(in srgb, var(--primary-color) 12%, var(--pc-card)));
    --pc-accent: var(--primary-color);
    --pc-screen: var(--pc-raise);
    --pc-ok: var(--pack-card-ok-color, var(--success-color, #43a047));
    --pc-soft: var(--pack-card-soft-color, var(--amber-color, #ffc107));
    --pc-warn: var(--pack-card-warn-color, var(--warning-color, #ffa600));
    --pc-bad: var(--pack-card-bad-color, var(--error-color, #db4437));
    --pc-bal: var(--pack-card-bal-color, var(--info-color, #039be5));
    --pc-low: var(--pack-card-low-color, var(--info-color, #039be5));
    /* text on quiet status fills and outlined status buttons (readable in light and dark) */
    --pc-ok-on: var(--ha-color-on-success-normal, #036730);
    --pc-warn-on: var(--ha-color-on-warning-normal, #9d3800);
    --pc-bad-on: var(--ha-color-on-danger-normal, #b30532);
    font-family: var(--pc-font);
    -webkit-font-smoothing: var(--ha-font-smoothing, antialiased);
  }
`;

export const sharedStyles = css`
  :host {
    color: var(--pc-fg);
    font-size: var(--pc-fs-m);
    line-height: var(--ha-line-height-normal, 1.6);
  }
  /* surface in the style of ha-card (E26): every group of a view is its own card */
  .surf {
    background: var(--pc-card);
    border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--pc-line));
    border-radius: var(--pc-r-lg);
    box-shadow: var(--ha-card-box-shadow, none);
    box-sizing: border-box;
    min-width: 0;
  }
  /* view and section heading like the heading card: 16 px, normal weight */
  .ttl {
    font-size: var(--pc-fs-l);
    font-weight: var(--ha-font-weight-normal, 400);
    line-height: var(--ha-line-height-normal, 1.6);
    margin: 0;
    white-space: nowrap;
  }
  /* buttons in the style of ha-button: pill, 32 px (small) or 40 px, 14 px medium */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--pc-line);
    border-radius: var(--pc-r-pill);
    background: transparent;
    color: var(--pc-accent);
    cursor: pointer;
    font: inherit;
    font-size: var(--pc-fs-m);
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: 1;
    white-space: nowrap;
    box-sizing: border-box;
  }
  .btn:hover:not(:disabled) {
    background: var(--pc-fill-pri);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn:focus-visible {
    outline: 2px solid var(--pc-accent);
    outline-offset: 2px;
  }
  .btn.pri {
    background: var(--pc-accent);
    border-color: transparent;
    color: var(--text-primary-color, #fff);
  }
  /* badge like the HA badges: pill, 12 px medium */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    border-radius: var(--pc-r-pill);
    border: 1px solid var(--pc-line);
    background: var(--pc-card);
    font-size: var(--pc-fs-s);
    font-weight: var(--ha-font-weight-medium, 500);
    white-space: nowrap;
    box-sizing: border-box;
  }
  .num,
  .v {
    font-variant-numeric: tabular-nums;
  }
  .v {
    border: 0;
    background: none;
    padding: 0 1px;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    text-align: inherit;
    border-radius: var(--pc-r-sm);
  }
  .v:hover:not(:disabled) {
    background: color-mix(in srgb, var(--pc-accent) 12%, transparent);
  }
  .v:disabled {
    cursor: default;
  }
  .v:focus-visible,
  .link:focus-visible {
    outline: 2px solid var(--pc-accent);
    outline-offset: 1px;
  }
  .link {
    border: 0;
    background: none;
    color: var(--pc-accent);
    cursor: pointer;
    padding: 0;
    font: inherit;
    font-weight: 500;
  }
  .link:hover {
    text-decoration: underline;
  }
  .ico {
    width: 9px;
    height: 15px;
    vertical-align: -3px;
    color: var(--pc-fg2);
  }
  .sp {
    flex: 1;
  }
  .seg {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--pc-r-pill);
    background: var(--pc-raise);
    flex: none;
  }
  .seg button {
    border: 0;
    background: transparent;
    padding: 6px 12px;
    border-radius: var(--pc-r-pill);
    cursor: pointer;
    font: inherit;
    font-size: var(--pc-fs-m);
    font-weight: var(--ha-font-weight-medium, 500);
    line-height: 1;
    color: var(--pc-fg2);
  }
  .seg button[aria-pressed='true'] {
    background: var(--pc-card);
    color: var(--pc-fg);
    box-shadow: 0 0 0 1px var(--pc-line);
  }
  .seg button:focus-visible {
    outline: 2px solid var(--pc-accent);
    outline-offset: -2px;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    line-height: 1.2;
    border-radius: var(--pc-r-pill);
    font-size: var(--pc-fs-s);
    font-weight: 500;
    white-space: nowrap;
  }
  .tag.ok {
    color: var(--pc-ok-on);
    background: color-mix(in srgb, var(--pc-ok) 14%, transparent);
  }
  .tag.bad {
    color: var(--pc-bad-on);
    background: color-mix(in srgb, var(--pc-bad) 14%, transparent);
  }
  .tag.warn {
    color: var(--pc-warn-on);
    background: color-mix(in srgb, var(--pc-warn) 15%, transparent);
  }
  .tag.mut {
    color: var(--pc-fg2);
    background: var(--pc-raise);
  }
  .src {
    font-size: 0.85em;
    color: var(--pc-fg3);
  }
  .fail {
    color: var(--pc-bad);
    font-size: var(--pc-fs-m);
    padding: 8px 12px;
    border: 1px dashed var(--pc-bad);
    border-radius: var(--pc-r-md);
  }

  /* group per E21: label | values of the row, left-aligned behind the label column */
  .grp {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 4px;
    justify-content: start;
    align-items: baseline;
    align-content: start;
    font-size: var(--pc-fs-m);
    line-height: 1.4;
    min-width: 0;
  }
  .grp .gk {
    color: var(--pc-fg2);
    white-space: nowrap;
  }
  .grp .gv {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 5px;
    min-width: 0;
    white-space: nowrap;
  }
  .grp .gs {
    color: var(--pc-fg3);
  }
  .nw {
    white-space: nowrap;
  }
  .tl {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
  }
  .tl .ico {
    align-self: center;
  }
`;

/**
 * Switch of the pack view (E19, E12: without on/off labels, the knob shows the state). Shared by the
 * tap switch and the hold button in switch shape. Below 640 px container width the label goes above the knob,
 * so the five switches stay in one row even on a phone.
 */
export const switchStyles = css`
  .sw {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 0;
    border-radius: 0;
    padding: 8px 12px;
    min-height: 56px;
    background: transparent;
    color: var(--pc-fg);
    cursor: pointer;
    font: inherit;
    font-size: var(--pc-fs-m);
    font-weight: var(--ha-font-weight-medium, 500);
    text-align: left;
    user-select: none;
    -webkit-user-select: none;
  }
  .sw:hover:not(:disabled) {
    background: var(--pc-raise);
  }
  .sw:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .sw:focus-visible {
    outline: 2px solid var(--pc-accent);
    outline-offset: -2px;
  }
  .sw .lbl {
    position: relative;
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .sw .lbl > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sw .lbl small {
    font-size: var(--pc-fs-s);
    font-weight: var(--ha-font-weight-normal, 400);
    color: var(--pc-fg2);
    white-space: nowrap;
  }
  .sw .knob {
    position: relative;
    flex: none;
    width: 40px;
    height: 24px;
    border-radius: var(--pc-r-pill);
    background: var(--ha-switch-background-color, color-mix(in srgb, var(--pc-fg3) 45%, transparent));
  }
  .sw .knob::after {
    content: '';
    position: absolute;
    top: 4px;
    left: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--pc-card);
    transition: left 0.15s;
  }
  .sw[aria-checked='true'] .knob {
    background: var(--pc-accent);
  }
  .sw[aria-checked='true'] .knob::after {
    left: 20px;
  }
  @container (max-width: 639px) {
    .sw {
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      padding: 8px 4px;
      font-size: var(--pc-fs-s);
      text-align: center;
    }
    .sw .lbl {
      justify-items: center;
      max-width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sw .knob::after {
      transition: none;
    }
  }
`;
