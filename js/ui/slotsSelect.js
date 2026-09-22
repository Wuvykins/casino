// Slots: pick the machine and how much to bring to it. No opponents — it's you and the machine.
import { renderTableSelect } from './tableSelect.js';
import { fmt$ } from '../core/bank.js';
import { SLOT_TABLES } from '../content/tables.js';

export function renderSlotsSelect(root, { onBack, onSit }) {
  renderTableSelect(root, {
    title: 'Slots',
    groups: [{ label: 'Three reels, one line. Three Van Halen logos is the jackpot', tables: SLOT_TABLES }],
    describe: (t) => `Bets ${fmt$(t.minBet)}–${fmt$(t.maxBet)} · Bring ${fmt$(t.minBuy)}–${fmt$(t.maxBuy)}`,
    minOpp: 0, maxOpp: 0, soloNote: 'Just you and the machine. Pull the handle or hit SPIN; the paytable is on the machine.',
    onBack, onSit: (table, buyIn) => onSit(table, buyIn),
  });
}
