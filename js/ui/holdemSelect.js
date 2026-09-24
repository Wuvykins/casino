// Hold'em: pick a table, a buy-in, and who sits with you.
import { renderTableSelect } from './tableSelect.js';
import { fmt$ } from '../core/bank.js';
import { HOLDEM_TABLES, MAX_SEATS } from '../content/tables.js';

export function renderHoldemSelect(root, { onBack, onSit }) {
  renderTableSelect(root, {
    title: "Texas Hold'em",
    groups: [
      { label: 'No-Limit', tables: HOLDEM_TABLES.filter((t) => t.mode === 'nolimit') },
      { label: 'Tournaments', tables: HOLDEM_TABLES.filter((t) => t.mode === 'tourney') },
    ],
    describe: (t) => t.mode === 'tourney'
      ? `Buy-in ${fmt$(t.buyIn)} · 1st ${fmt$(t.prizes[0])} · 2nd ${fmt$(t.prizes[1])} · bust and you're out`
      : `Blinds ${fmt$(t.sb)}/${fmt$(t.bb)} · Buy-in ${fmt$(t.minBuy)}–${fmt$(t.maxBuy)}`,
    minOpp: 1, minOppFor: (t) => (t.mode === 'tourney' ? 2 : 1), maxOpp: MAX_SEATS - 1,
    buyInNote: (t) => (t.mode === 'tourney' ? `Everyone starts with ${t.chips.toLocaleString('en-US')} chips. Blinds go up every few hands. Two prizes: ${fmt$(t.prizes[0])} and ${fmt$(t.prizes[1])}.` : null),
    onBack, onSit,
  });
}
