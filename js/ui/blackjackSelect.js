// Blackjack: pick a table, a buy-in, and up to two people to sit beside you.
import { renderTableSelect } from './tableSelect.js';
import { fmt$ } from '../core/bank.js';
import { BLACKJACK_TABLES } from '../content/tables.js';

export function renderBlackjackSelect(root, { onBack, onSit }) {
  renderTableSelect(root, {
    title: 'Blackjack',
    groups: [{ label: '6 decks · dealer stands on 17 · blackjack pays 3 to 2', tables: BLACKJACK_TABLES }],
    describe: (t) => `Bets ${fmt$(t.minBet)}–${fmt$(t.maxBet)} · Buy-in ${fmt$(t.minBuy)}–${fmt$(t.maxBuy)}`,
    minOpp: 0, maxOpp: 2, whoLabel: 'Who sits with you?',
    onBack, onSit,
  });
}
