// Hold'em: pick a table, a buy-in, and who sits with you.
import { renderTableSelect } from './tableSelect.js';
import { modal } from './dom.js';
import { bank, fmt$ } from '../core/bank.js';
import { HOLDEM_TABLES, MAX_SEATS, tableById } from '../content/tables.js';

// One line about a saved tournament: chips, players left, blinds.
export function savedTourneyNote(snap) {
  const me = snap.seats?.[0]; const left = (snap.seats || []).filter((s) => s.stack > 0).length;
  return `In progress · ${Math.round(me?.stack || 0).toLocaleString('en-US')} chips · ${left} players left`;
}

export function renderHoldemSelect(root, { onBack, onSit, onResume }) {
  const snap = () => bank.state.tourney;
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
    saved: (t) => snap()?.tableId === t.id,
    savedNote: () => savedTourneyNote(snap()),
    onResume: () => onResume(snap()),
    // starting a different tournament while one is saved gives the saved one up (one seat at a time)
    beforeSit: async (t) => {
      const cur = snap();
      if (t.mode !== 'tourney' || !cur) return true;
      const name = tableById(cur.tableId)?.name || 'your tournament';
      const ok = await modal({
        title: `${name} is still going`, dismissable: true,
        body: `Starting ${t.name} gives up your seat in ${name}, and its entry fee with it.`,
        buttons: [{ label: 'Keep it', kind: 'ghost', value: false }, { label: `Give it up`, kind: 'danger', value: true }],
      });
      if (ok) bank.setTourney(null);
      return !!ok;
    },
  });
}
