// Farkle: pick a stake and one to three people to play against.
import { renderTableSelect } from './tableSelect.js';
import { fmt$ } from '../core/bank.js';
import { FARKLE_TABLES } from '../content/tables.js';

export function renderFarkleSelect(root, { onBack, onSit }) {
  renderTableSelect(root, {
    title: 'Farkle',
    groups: [{ label: 'First to 10,000 · everyone puts up the stake, the winner takes the pot', tables: FARKLE_TABLES }],
    describe: (t) => `${fmt$(t.stake)} a game · Buy-in ${fmt$(t.minBuy)}–${fmt$(t.maxBuy)}`,
    minOpp: 1, maxOpp: 3, whoLabel: 'Who are you playing?',
    onBack, onSit,
  });
}
