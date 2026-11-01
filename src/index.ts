// Einstieg: registriert die Elemente einmal und traegt die Karte in den Kartenwaehler ein.
import { PackCard } from './pack-card';
import { PackCardTile } from './pack-card-tile';
import { PackCardRow } from './pack-card-row';
import { PackCardHold } from './pack-card-hold';
import { PackCardBank } from './pack-card-bank';
import { PackCardEmergency } from './pack-card-emergency';
import { PackCardStackHead } from './pack-card-stack-head';
import { PackCardCells } from './pack-card-cells';
import { PackCardPack } from './pack-card-pack';

declare const __VERSION__: string;

const define = (name: string, ctor: CustomElementConstructor): void => {
  if (!customElements.get(name)) customElements.define(name, ctor);
};

define('pack-card-hold', PackCardHold);
define('pack-card-bank', PackCardBank);
define('pack-card-emergency', PackCardEmergency);
define('pack-card-stack-head', PackCardStackHead);
define('pack-card-tile', PackCardTile);
define('pack-card-row', PackCardRow);
define('pack-card-cells', PackCardCells);
define('pack-card-pack', PackCardPack);
define('pack-card', PackCard);

interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
}

const w = window as unknown as { customCards?: CustomCardEntry[] };
w.customCards = w.customCards ?? [];
if (!w.customCards.some((c) => c.type === 'pack-card')) {
  w.customCards.push({
    type: 'pack-card',
    name: 'Pack-Karte',
    description: 'Hausspeicher mit sechs JK-BMS-Packs: Speicher, Pack und Zellen',
    preview: false,
  });
}

console.info(`%c battery-dashboard %c ${__VERSION__} `, 'background:#0b7fa6;color:#fff', '');
