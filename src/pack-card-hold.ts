// Halteknopf (A01d E7): loest erst nach einer Sekunde Halten aus, Loslassen oder Verlassen davor bricht ab.
// Maus, Touch und Tastatur (Leertaste/Enter halten). Deaktiviert mit Grund im title (E10).
// Form „switch“: als Schalter der Packansicht (E19) fuer das Ausschalten von Laden, Entladen und Bluetooth.
import { LitElement, html, css, PropertyValues, TemplateResult } from 'lit';
import { switchStyles } from './ui';

export const HOLD_MS = 1000;

export class PackCardHold extends LitElement {
  static properties = {
    label: {},
    reason: {},
    tone: {},
    disabled: { type: Boolean, reflect: true },
    active: { type: Boolean },
    variant: {},
    _going: { state: true },
  };

  label = '';
  /** Grund, warum der Knopf deaktiviert ist */
  reason = '';
  tone: 'warn' | 'bad' = 'warn';
  disabled = false;
  /** Zustand „an“: Knopf gefuellt bzw. Schalter an */
  active = false;
  /** button: Knopf mit „· halten“; switch: Schalter mit Hinweis „halten“ */
  variant: 'button' | 'switch' = 'button';
  private _going = false;
  private _timer?: number;

  static styles = [
    switchStyles,
    css`
      :host {
        display: inline-block;
      }
      button {
        position: relative;
        overflow: hidden;
        width: 100%;
        border: 1px solid var(--pc-warn);
        color: var(--pc-warn);
        background: transparent;
        border-radius: 8px;
        padding: 6px 11px;
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      button.bad {
        border-color: var(--pc-bad);
        color: var(--pc-bad);
      }
      .fill {
        position: absolute;
        inset: 0;
        background: color-mix(in srgb, var(--pc-warn) 30%, transparent);
        transform: scaleX(0);
        transform-origin: left;
        pointer-events: none;
      }
      .bad .fill {
        background: color-mix(in srgb, var(--pc-bad) 28%, transparent);
      }
      .go .fill {
        transform: scaleX(1);
        transition: transform ${HOLD_MS / 1000}s linear;
      }
      button.on {
        background: var(--pc-warn);
        color: var(--pc-card);
      }
      button.on .fill {
        background: color-mix(in srgb, var(--pc-card) 35%, transparent);
      }
      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      button:focus-visible {
        outline: 2px solid var(--pc-accent);
        outline-offset: 2px;
      }
      .t {
        position: relative;
      }
      button.sw {
        border-color: var(--pc-line);
        color: var(--pc-fg);
        background: var(--pc-card);
        font-size: 12.5px;
        font-weight: 400;
        padding: 5px 8px;
      }
      @media (prefers-reduced-motion: reduce) {
        .go .fill {
          transition-duration: 0s;
        }
      }
    `,
  ];

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has('disabled') && this.disabled) this._cancel();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._cancel();
  }

  protected render(): TemplateResult {
    if (this.variant === 'switch') return this.renderSwitch();
    const cls = `${this.tone === 'bad' ? 'bad' : ''} ${this.active ? 'on' : ''} ${this._going ? 'go' : ''}`;
    return html`<button
      type="button"
      part="button"
      class=${cls}
      ?disabled=${this.disabled}
      title=${this.disabled ? this.reason : `${this.label}: eine Sekunde halten`}
      aria-label=${`${this.label}, eine Sekunde halten`}
      @pointerdown=${this._down}
      @pointerup=${this._cancel}
      @pointerleave=${this._cancel}
      @pointercancel=${this._cancel}
      @keydown=${this._keydown}
      @keyup=${this._keyup}
      @blur=${this._cancel}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      <span class="fill"></span><span class="t">${this.label} · halten</span>
    </button>`;
  }

  private renderSwitch(): TemplateResult {
    const what = this.active ? 'ausschalten' : 'einschalten';
    return html`<button
      type="button"
      part="button"
      role="switch"
      aria-checked=${String(this.active)}
      class="sw ${this._going ? 'go' : ''}"
      ?disabled=${this.disabled}
      title=${this.disabled ? this.reason : `${this.label} ${what}: eine Sekunde halten`}
      aria-label=${`${this.label}, ${what}: eine Sekunde halten`}
      @pointerdown=${this._down}
      @pointerup=${this._cancel}
      @pointerleave=${this._cancel}
      @pointercancel=${this._cancel}
      @keydown=${this._keydown}
      @keyup=${this._keyup}
      @blur=${this._cancel}
      @contextmenu=${(e: Event) => e.preventDefault()}
    >
      <span class="fill"></span><span class="lbl"><span>${this.label}</span><small>halten</small></span
      ><i class="knob"></i>
    </button>`;
  }

  private _down = (e: PointerEvent): void => {
    if (this.disabled || e.button !== 0) return;
    e.preventDefault();
    this._start();
  };

  private _keydown = (e: KeyboardEvent): void => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      this._start();
    }
  };

  private _keyup = (e: KeyboardEvent): void => {
    if (e.key === ' ' || e.key === 'Enter') this._cancel();
  };

  private _start(): void {
    if (this.disabled) return;
    this._cancel();
    this._going = true;
    this._timer = window.setTimeout(() => {
      this._timer = undefined;
      this._going = false;
      this.dispatchEvent(new CustomEvent('hold-complete'));
    }, HOLD_MS);
  }

  private _cancel = (): void => {
    if (this._timer !== undefined) window.clearTimeout(this._timer);
    this._timer = undefined;
    this._going = false;
  };
}
