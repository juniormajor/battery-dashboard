// Gemeinsame Bausteine: anklickbarer Wert (E4), spaltenbuendige Gruppe (E21), Navigation, Rueckfall (E10), Stile (E15).
import { css, html, TemplateResult } from 'lit';
import { Hass, ZELLEN_PACK, exists, stateOf } from './entities';
import { fmt } from './format';

export function fireMoreInfo(node: EventTarget, entityId: string): void {
  node.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
}

/** Wert als Klickziel auf more-info seiner Entitaet; fehlt die Entitaet, ist er nicht anklickbar. */
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
  /** Bezeichnung mit Doppelpunkt */
  k: unknown;
  /** bis zu drei Werte, getrennt durch „/“ */
  v: unknown[];
  /** ein Wert ueber alle Wertspalten */
  span?: boolean;
  /** kein „/“ vor dem dritten Wert (Zusatz wie die Balancer-Zellen) */
  nosep?: boolean;
}

/** „Bezeichnung: Wert / Wert / Wert“, Spalten buendig, Zahlen rechtsbuendig (E21). */
export function group(lines: GroupLine[], cls = ''): TemplateResult {
  return html`<div class="grp ${cls}">
    ${lines.map((l) =>
      l.span
        ? html`<span class="gk">${l.k}</span><span class="gv span">${l.v[0]}</span>`
        : html`<span class="gk">${l.k}</span>${[0, 1, 2].map(
            (i) =>
              html`<span class="gv">${l.v[i] ?? ''}</span>${i < 2
                ? html`<span class="gs">${l.v[i + 1] !== undefined && !(i === 1 && l.nosep) ? '/' : ''}</span>`
                : ''}`,
          )}`,
    )}
  </div>`;
}

export const thermo = html`<svg class="ico" viewBox="0 0 12 20" role="img" aria-label="Temperatur">
  <path d="M4 3a2 2 0 0 1 4 0v9.3a3.6 3.6 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="1.5"></path>
  <circle cx="6" cy="15" r="2" fill="currentColor"></circle>
  <path d="M6 8v6" stroke="currentColor" stroke-width="1.6"></path>
</svg>`;

/** Ansichtspfad: absolut ab „/“, sonst relativ zum aktuellen Dashboard (/<dashboard-url>/<pfad>). */
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
 * Pack-Helfer setzen (E5, E6): input_select.zellen_pack auf Pack_<n>, nur wenn der Helfer da ist und die Option kennt.
 * Fehler werden nur gemeldet; der Aufrufer navigiert danach trotzdem (E6: navigate kann keinen Parameter mitgeben).
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

/** Senkrechte Batterie mit SoC-Fuellung (Bank-Display E16, Packansicht E19); Groesse setzt das CSS des Aufrufers. */
export function battSvg(soc: number | undefined): TemplateResult {
  const fillH = ((soc === undefined ? 0 : Math.max(0, Math.min(100, soc))) / 100) * 86;
  return html`<svg viewBox="0 0 58 108" role="img" aria-label=${`SoC ${fmt(soc, 1)} Prozent`}>
    <rect x="20" y="1" width="18" height="7" rx="2" fill="var(--pc-fg3)"></rect>
    <rect x="3" y="8" width="52" height="98" rx="7" fill="var(--pc-card)" stroke="var(--pc-fg3)" stroke-width="2"></rect>
    <rect x="9" y=${14 + 86 - fillH} width="40" height=${fillH} rx="3" fill=${socColor(soc)}></rect>
    ${[25, 50, 75].map((q) => {
      const y = 14 + 86 - (q / 100) * 86;
      return html`<line x1="9" x2="49" y1=${y} y2=${y} stroke="var(--pc-card)" stroke-width="1.5"></line>`;
    })}
  </svg>`;
}

/** Sichtbarer Rueckfall eines Bausteins (E10). */
export function fallback(what: string, e: unknown): TemplateResult {
  console.warn(`pack-card: ${what} nicht gezeichnet`, e);
  return html`<div class="fail">${what}: Daten unvollständig</div>`;
}

/** Fuellfarbe des SoC: ueber 50 % gut, ueber 20 % Warnung, darunter schlecht (Mockup socColor). */
export function socColor(soc: number | undefined): string {
  if (soc === undefined) return 'transparent';
  return soc > 50 ? 'var(--pc-ok)' : soc > 20 ? 'var(--pc-warn)' : 'var(--pc-bad)';
}

/**
 * Farbvariablen (E15): Flaechen, Text und Linien aus dem HA-Theme; Statusfarben eigene Variablen
 * mit getrennten Werten fuer hell und dunkel, umgeschaltet ueber das Attribut dark (hass.themes.darkMode).
 * Feste Werte nur als Rueckfall im var(); ein Theme kann sie ueber --pack-card-*-color ueberschreiben.
 */
export const themeVars = css`
  :host {
    --pc-fg: var(--primary-text-color);
    --pc-fg2: var(--secondary-text-color);
    --pc-line: var(--divider-color);
    --pc-card: var(--ha-card-background, var(--card-background-color));
    --pc-fg3: color-mix(in srgb, var(--secondary-text-color) 75%, var(--pc-card));
    --pc-raise: var(--secondary-background-color);
    --pc-accent: var(--primary-color);
    --pc-screen: color-mix(in srgb, var(--primary-color) 7%, var(--pc-raise));
    --pc-ok: var(--pack-card-ok-color, #2b8a52);
    --pc-soft: var(--pack-card-soft-color, #8c8a12);
    --pc-warn: var(--pack-card-warn-color, #c46f00);
    --pc-bad: var(--pack-card-bad-color, #c62828);
    --pc-bal: var(--pack-card-bal-color, #00838f);
  }
  :host([dark]) {
    --pc-ok: var(--pack-card-ok-color-dark, #5cc68b);
    --pc-soft: var(--pack-card-soft-color-dark, #cfcb4f);
    --pc-warn: var(--pack-card-warn-color-dark, #f2a33c);
    --pc-bad: var(--pack-card-bad-color-dark, #f06663);
    --pc-bal: var(--pack-card-bal-color-dark, #3fd2de);
  }
`;

export const sharedStyles = css`
  :host {
    color: var(--pc-fg);
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
    border-radius: 4px;
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
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .tag.ok {
    color: var(--pc-ok);
    background: color-mix(in srgb, var(--pc-ok) 14%, transparent);
  }
  .tag.bad {
    color: var(--pc-bad);
    background: color-mix(in srgb, var(--pc-bad) 14%, transparent);
  }
  .tag.warn {
    color: var(--pc-warn);
    background: color-mix(in srgb, var(--pc-warn) 15%, transparent);
  }
  .tag.mut {
    color: var(--pc-fg2);
    background: var(--pc-raise);
    border: 1px solid var(--pc-line);
  }
  .src {
    font-size: 0.85em;
    color: var(--pc-fg3);
  }
  .fail {
    color: var(--pc-bad);
    font-size: 13px;
    padding: 6px 8px;
    border: 1px dashed var(--pc-bad);
    border-radius: 8px;
  }

  /* Gruppe nach E21: Bezeichnung | Wert | / | Wert | / | Wert */
  .grp {
    display: grid;
    grid-template-columns: max-content auto max-content auto max-content auto;
    column-gap: 5px;
    row-gap: 3px;
    justify-content: safe center;
    align-items: baseline;
    align-content: center;
    font-size: 13.5px;
    line-height: 1.4;
    min-width: 0;
    overflow-x: auto;
  }
  .grp .gk {
    color: var(--pc-fg2);
    padding-right: 6px;
    white-space: nowrap;
  }
  .grp .gv {
    text-align: right;
    white-space: nowrap;
  }
  .grp .gv.span {
    grid-column: 2 / -1;
    white-space: normal;
  }
  .grp .gs {
    color: var(--pc-fg3);
    text-align: center;
  }
`;

/**
 * Schalter der Packansicht (E19, E12: ohne Ein-/Aus-Beschriftung, der Knopf zeigt den Zustand). Gemeinsam fuer den
 * Tippschalter und den Halteknopf in Schalterform. Unter 640 px Containerbreite Bezeichnung ueber dem Knopf,
 * damit die fuenf Schalter auch auf dem Handy in einer Zeile bleiben.
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
    border: 1px solid var(--pc-line);
    border-radius: 8px;
    padding: 5px 8px;
    background: var(--pc-card);
    color: var(--pc-fg);
    cursor: pointer;
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    user-select: none;
    -webkit-user-select: none;
  }
  .sw:hover:not(:disabled) {
    border-color: var(--pc-fg3);
  }
  .sw:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .sw:focus-visible {
    outline: 2px solid var(--pc-accent);
    outline-offset: 1px;
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
    font-size: 10px;
    color: var(--pc-fg3);
    white-space: nowrap;
  }
  .sw .knob {
    position: relative;
    flex: none;
    width: 30px;
    height: 17px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--pc-fg3) 45%, transparent);
  }
  .sw .knob::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--pc-card);
    transition: left 0.15s;
  }
  .sw[aria-checked='true'] .knob {
    background: var(--pc-accent);
  }
  .sw[aria-checked='true'] .knob::after {
    left: 15px;
  }
  @container (max-width: 639px) {
    .sw {
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      padding: 5px 3px;
      font-size: 11.5px;
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
