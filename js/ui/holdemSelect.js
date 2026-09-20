// Hold'em: pick a table, a buy-in, and who sits with you.
import { renderTableSelect } from './tableSelect.js';
import { fmt$ } from '../core/bank.js';
import { HOLDEM_TABLES, MAX_SEATS } from '../content/tables.js';

export function renderHoldemSelect(root, { onBack, onSit }) {
  renderTableSelect(root, {
    title: "Texas Hold'em",
    groups: [
      { label: 'No-Limit', tables: HOLDEM_TABLES.filter((t) => t.mode === 'nolimit') },
      { label: 'Fixed Limit', tables: HOLDEM_TABLES.filter((t) => t.mode === 'limit') },
    ],
    describe: (t) => `Blinds ${fmt$(t.sb)}/${fmt$(t.bb)} · Buy-in ${fmt$(t.minBuy)}–${fmt$(t.maxBuy)}`,
    minOpp: 1, maxOpp: MAX_SEATS - 1,
    onBack, onSit,
  });
}
