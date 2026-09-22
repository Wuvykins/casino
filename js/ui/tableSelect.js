// Shared "pick a table → buy-in → who's playing" flow, used by every table game.
import { h, clear, modal } from './dom.js';
import { portraitEl, tierBadge } from './components.js';
import { bank, fmt$ } from '../core/bank.js';
import { audio } from '../core/audio.js';
import { tierById } from '../content/tiers.js';
import { CHARACTERS } from '../content/characters.js';

// opts: { title, groups: [{ label, tables }], describe(table) -> subtitle, minOpp, maxOpp, onBack, onSit(table, buyIn, opponentIds) }
export function renderTableSelect(root, opts) {
  clear(root);
  const s = bank.state;
  const tier = bank.tier;
  const screen = h('div', { class: 'select-screen' });
  screen.append(h('div', { class: 'topbar' },
    h('button', { class: 'btn ghost leave-btn', onClick: () => { audio.play('tap'); opts.onBack(); } }, '‹ Lobby'),
    h('h2', {}, opts.title),
    h('div', { class: 'topbar-bank' }, 'Bank ', h('b', {}, fmt$(s.bank)), ' · ', tierBadge(tier)),
  ));
  const list = h('div', { class: 'table-groups' + (opts.groups.length === 1 ? ' single' : '') });
  for (const g of opts.groups) {
    const box = h('div', { class: 'table-group' }, g.label ? h('h3', {}, g.label) : null);
    for (const t of g.tables) {
      const locked = t.tier > tier.id;
      const cantAfford = !locked && s.bank < t.minBuy;
      box.append(h('button', {
        class: 'table-tile' + (locked ? ' locked' : '') + (cantAfford ? ' poor' : ''),
        disabled: locked || cantAfford,
        onClick: () => { audio.play('tap'); chooseBuyIn(root, t, opts); },
      },
        h('div', { class: 'tt-name' }, t.name),
        h('div', { class: 'tt-sub' }, opts.describe(t)),
        locked ? h('div', { class: 'tt-lock' }, `🔒 ${tierById(t.tier).name} card required`) : cantAfford ? h('div', { class: 'tt-lock' }, `Need ${fmt$(t.minBuy)} in the bank`) : h('div', { class: 'tt-go' }, 'Sit down ›'),
      ));
    }
    list.append(box);
  }
  screen.append(list);
  root.append(screen);
}

async function chooseBuyIn(root, table, opts) {
  const s = bank.state;
  const maxOpp = opts.maxOpp ?? 5, minOpp = opts.minOpp ?? 0;
  const step = table.bb || table.minBet || table.stake || 1;
  const max = Math.min(table.maxBuy, s.bank);
  const min = table.minBuy;
  let amount = Math.min(max, Math.max(min, Math.round(table.maxBuy / 2 / step) * step));
  let opponents = maxOpp === 0 ? [] : pickDefault(maxOpp);
  const result = await modal({
    title: table.name, className: 'wide', dismissable: true,
    body: (el, close) => {
      const amountEl = h('div', { class: 'big' }, fmt$(amount));
      const slider = h('input', { type: 'range', min, max, step, value: amount });
      const setAmt = (v) => { amount = Math.max(min, Math.min(max, Math.round(v / step) * step)); amountEl.textContent = fmt$(amount); slider.value = amount; };
      slider.addEventListener('input', () => setAmt(+slider.value));
      const presets = h('div', { class: 'row' }, [['Min', min], ['Half', Math.round((min + max) / 2)], ['Max', max]].map(([l, v]) => h('button', { class: 'btn ghost small', onClick: () => setAmt(v) }, l)));
      const grid = h('div', { class: 'cast-grid' });
      const countEl = h('span', { class: 'muted small' });
      const sitBtn = h('button', { class: 'btn primary', onClick: () => close({ amount, opponents }) }, 'Sit down');
      const refreshGrid = () => {
        clear(grid);
        for (const c of CHARACTERS) {
          const on = opponents.includes(c.id);
          grid.append(h('button', { class: 'cast-tile' + (on ? ' on' : ''), onClick: () => {
            audio.play('tap');
            if (on) opponents = opponents.filter((x) => x !== c.id);
            else if (opponents.length < maxOpp) opponents.push(c.id);
            refreshGrid();
          } }, portraitEl(c, { size: 'sm' }), h('div', { class: 'ct-name' }, c.name), c.real ? null : h('div', { class: 'ct-tag' }, c.tagline)));
        }
        countEl.textContent = maxOpp > 1 ? `${opponents.length} of ${maxOpp} seats taken` : '';
        sitBtn.disabled = opponents.length < minOpp;
      };
      el.append(
        h('div', { class: 'buyin-layout' },
          h('div', { class: 'buyin-row' },
            h('div', { class: 'muted small' }, 'Buy-in · bank ' + fmt$(s.bank)), amountEl, slider, presets,
            h('div', { class: 'modal-buttons', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn ghost', onClick: () => close(null) }, 'Back'), sitBtn),
          ),
          maxOpp === 0 ? h('div', { class: 'muted' }, opts.soloNote || '') : h('div', {},
            h('div', { class: 'row space' }, h('h3', { style: { margin: 0 } }, opts.whoLabel || "Who's playing?"), countEl, h('button', { class: 'btn ghost small', onClick: () => { opponents = pickDefault(maxOpp); refreshGrid(); } }, 'Shuffle')),
            grid,
          ),
        ),
      );
      refreshGrid();
    },
  });
  if (result) opts.onSit(table, result.amount, result.opponents);
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Real people first; the bots only fill seats the family can't.
export function pickDefault(n) {
  const real = shuffled(CHARACTERS.filter((c) => c.real).map((c) => c.id));
  const bots = shuffled(CHARACTERS.filter((c) => !c.real).map((c) => c.id));
  return real.concat(bots).slice(0, n);
}
