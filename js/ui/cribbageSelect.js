// Cribbage: pick a stake and one opponent.
import { renderTableSelect } from './tableSelect.js';
import { fmt$ } from '../core/bank.js';
import { CRIBBAGE_TABLES } from '../content/tables.js';

export function renderCribbageSelect(root, { onBack, onSit }) {
  renderTableSelect(root, {
    title: 'Cribbage',
    groups: [{ label: 'First to 121 · skunk pays double · double skunk pays triple', tables: CRIBBAGE_TABLES }],
    describe: (t) => `${fmt$(t.stake)} a game · Buy-in ${fmt$(t.minBuy)}–${fmt$(t.maxBuy)}`,
    minOpp: 1, maxOpp: 1, whoLabel: 'Who are you playing?',
    onBack, onSit,
  });
}
