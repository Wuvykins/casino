// Lobby (casino floor), bank statement, Ken, settings.
import { h, clear, modal, toast, sleep, append } from './dom.js';
import { creditCardEl, portraitEl } from './components.js';
import { bank, fmt$ } from '../core/bank.js';
import { assets } from '../core/assets.js';
import { audio, music } from '../core/audio.js';
import { TIERS, nextTier } from '../content/tiers.js';
import { cheapestBuyIn } from '../content/tables.js';
import { BANKER } from '../content/characters.js';
import { pickLine } from '../content/lines.js';
import { LOBBY_HOTSPOTS, SHOW_HOTSPOT_GUIDES } from '../content/lobby.js';

const GAMES = [
  { id: 'holdem', name: "Texas Hold'em", sub: 'Limit & No-Limit', open: true, icon: '♠' },
  { id: 'blackjack', name: 'Blackjack', sub: '6 decks · 3 to 2', open: true, icon: '21' },
  { id: 'slots', name: 'Slots', sub: 'Coming soon', open: false, icon: '7' },
  { id: 'farkle', name: 'Farkle', sub: 'First to 10,000', open: true, icon: '⚄' },
  { id: 'cribbage', name: 'Cribbage', sub: 'First to 121', open: true, icon: '15' },
];

export function renderLobby(root, { onEnter }) {
  clear(root);
  const s = bank.state;
  const tier = bank.tier;
  const floor = h('div', { class: 'lobby' });
  const hasFloorArt = assets.bg(floor, 'lobby.floor');
  const broke = s.bank < cheapestBuyIn();

  const header = h('div', { class: 'lobby-header' },
    h('div', { class: 'lobby-title' }, h('h1', {}, 'The Casino'), h('div', { class: 'welcome' }, `Welcome back, ${s.playerName || 'friend'}.`)),
    h('button', { class: 'bankcard', onClick: () => { audio.play('tap'); showBank(root, { onEnter }); } },
      creditCardEl(tier, s.playerName, { size: 'sm' }),
      h('div', { class: 'bank-balance' }, h('div', { class: 'label' }, 'Bank'), h('div', { class: 'amount' }, fmt$(s.bank))),
    ),
  );

  if (hasFloorArt) {
    // Your painted floor: the game areas are tappable regions laid over the picture.
    floor.classList.add('art');
    if (SHOW_HOTSPOT_GUIDES) floor.classList.add('guides');
    const spots = h('div', { class: 'hotspots' });
    for (const [id, r] of Object.entries(LOBBY_HOTSPOTS)) {
      const g = GAMES.find((x) => x.id === id);
      const isCashier = id === 'cashier';
      const open = isCashier || g?.open;
      spots.append(h('button', {
        class: 'hotspot' + (open ? '' : ' closed') + (broke && g?.open ? ' broke' : ''), 'data-game': id, title: isCashier ? 'Cashier' : g.name,
        style: { left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' },
        disabled: !open,
        onClick: () => { audio.play('tap'); if (isCashier) showBank(root, { onEnter }); else onEnter(id); },
      }, isCashier || !open || broke   // open games speak for themselves (the signs are in the painting); labels only where they add something
        ? h('span', { class: 'hs-label' }, isCashier ? (broke ? 'Cashier · ask Ken' : 'Cashier') : broke && g.open ? `${g.name} · need money` : `${g.name} · soon`)
        : null));
    }
    const footer = h('div', { class: 'lobby-footer' },
      broke ? h('button', { class: 'btn primary ken-btn', onClick: () => askKen(root, { onEnter }) }, 'Ask Ken for money') : null,
      h('button', { class: 'btn ghost small', onClick: () => { audio.play('tap'); showSettings(root, { onEnter }); } }, 'Settings'),
    );
    floor.append(header, spots, footer);
    root.append(floor);
    return;
  }

  const doors = h('div', { class: 'doors' }, GAMES.map((g) => {
    const door = h('button', { class: 'door' + (g.open ? '' : ' closed') + (broke && g.open ? ' broke' : ''), disabled: !g.open, onClick: () => { audio.play('tap'); onEnter(g.id); } },
      h('div', { class: 'door-icon' }, g.icon),
      h('div', { class: 'door-name' }, g.name),
      h('div', { class: 'door-sub' }, broke && g.open ? 'You need money to play' : g.sub),
    );
    assets.bg(door, 'lobby.door.' + g.id);
    return door;
  }));

  const footer = h('div', { class: 'lobby-footer' },
    broke ? h('button', { class: 'btn primary ken-btn', onClick: () => askKen(root, { onEnter }) }, 'Ask Ken for money') : null,
    h('button', { class: 'btn ghost', onClick: () => { audio.play('tap'); showBank(root, { onEnter }); } }, 'Bank statement'),
    h('button', { class: 'btn ghost', onClick: () => { audio.play('tap'); showSettings(root, { onEnter }); } }, 'Settings'),
  );
  floor.append(header, doors, footer);
  root.append(floor);
}

export function showBank(root, ctx) {
  const s = bank.state;
  const tier = bank.tier;
  const next = nextTier(tier);
  const broke = s.bank < cheapestBuyIn();
  const progress = next ? Math.min(1, s.bank / next.min) : 1;
  const st = s.stats;
  modal({
    title: 'Bank statement', className: 'wide', dismissable: true,
    body: (el, close) => {
      el.append(
        h('div', { class: 'bank-top' },
          creditCardEl(tier, s.playerName, { size: 'md' }),
          h('div', { class: 'bank-info' },
            h('div', { class: 'big' }, fmt$(s.bank)),
            h('div', { class: 'muted' }, `${tier.name} card`),
            next
              ? h('div', { class: 'progress' }, h('div', { class: 'bar' }, h('div', { class: 'fill', style: { width: (progress * 100).toFixed(1) + '%' } })), h('div', { class: 'muted small' }, `${fmt$(next.min - s.bank)} more in the bank for a ${next.name} card`))
              : h('div', { class: 'muted small' }, 'Top tier. Nothing left to prove.'),
            broke ? h('button', { class: 'btn primary', onClick: () => { close(); askKen(root, ctx); } }, 'Ask Ken for money') : null,
          ),
        ),
        h('div', { class: 'tiers-row' }, TIERS.map((t) => h('div', { class: 'tier-pill' + (t.id === tier.id ? ' current' : '') + (t.id < tier.id ? ' done' : '') }, h('b', {}, t.name), h('span', {}, fmt$(t.min) + '+')))),
        h('div', { class: 'stats-grid' },
          stat('Hands played', st.handsPlayed), stat('Hands won', st.handsWon),
          stat('Biggest pot', fmt$(st.biggestPot)), stat('Lifetime', fmt$(st.lifetimeNet)),
          stat('Best hand', st.bestHand || '—'), stat('Bailouts from Ken', s.bailouts),
        ),
        h('h3', {}, 'Recent transactions'),
        h('div', { class: 'txlist' }, s.transactions.length ? s.transactions.slice(0, 15).map((tx) => h('div', { class: 'tx ' + tx.type },
          h('span', { class: 'tx-type' }, tx.type === 'buyin' ? 'Buy-in' : tx.type === 'cashout' ? 'Cash out' : 'Bailout'),
          h('span', { class: 'tx-table' }, tx.table || ''),
          h('span', { class: 'tx-amt ' + (tx.amount < 0 ? 'neg' : 'pos') }, (tx.amount > 0 ? '+' : '') + fmt$(tx.amount)),
          h('span', { class: 'tx-after' }, fmt$(tx.bankAfter)),
        )) : h('div', { class: 'muted' }, 'Nothing yet. Go play.')),
      );
    },
    buttons: [{ label: 'Close', kind: 'ghost' }],
  }).then(() => renderLobby(root, ctx));
}
const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, String(v)));

// "Please sir, can I have some more?"
export async function askKen(root, ctx) {
  const s = bank.state;
  const name = s.playerName || 'kid';
  await modal({
    className: 'ken', dismissable: false,
    body: (el, close) => {
      const kenFace = portraitEl({ id: 'ken', name: 'Ken', color: BANKER.color }, { size: 'lg' });
      const face = s.bailouts > 0 && assets.has('lobby.ken.mad') ? 'lobby.ken.mad' : 'lobby.ken';
      if (assets.bg(kenFace, face)) { kenFace.classList.remove('placeholder'); clear(kenFace); }
      const bubble = h('div', { class: 'ken-bubble' }, '…');
      const youLine = h('div', { class: 'you-line' }, '');
      const btn = h('button', { class: 'btn primary', onClick: async () => {
        btn.disabled = true;
        audio.play('tap');
        await sleep(700);
        const { amount, change } = bank.bailout();
        const trigger = s.bailouts > 1 ? 'bailoutAgain' : 'bailout';
        const line = pickLine(BANKER, trigger, { player: name, amount: fmt$(amount) });
        bubble.textContent = line?.text || `Ken gave you ${fmt$(amount)}, go have fun.`;
        audio.voice(BANKER, line?.file) || audio.play('bailout');
        await sleep(1800);
        close(change);
      } }, 'Ask Ken for money');
      el.append(h('div', { class: 'ken-scene' }, kenFace, h('div', { class: 'ken-right' }, h('div', { class: 'ken-name' }, 'Ken'), bubble, youLine, btn)));
    },
  }).then(async (change) => {
    if (change && !change.up) { audio.play('tierdown'); toast(`Your card is back to ${change.to.name}.`); }
    renderLobby(root, ctx);
  });
}

// opts.atTable: opened from a game — no name/save changes mid-hand, and don't rebuild the lobby on close
export function showSettings(root, ctx, opts = {}) {
  const s = bank.state;
  const atTable = !!opts.atTable;
  return modal({
    title: 'Settings', dismissable: true,
    body: (el, close) => {
      const nameIn = h('input', { type: 'text', value: s.playerName, maxlength: 18, placeholder: 'Your name' });
      const check = (key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.settings[key] ? true : null, onChange: (e) => bank.setSetting(key, e.target.checked) }), label);
      const speed = h('select', { onChange: (e) => bank.setSetting('aiSpeed', +e.target.value) }, [[0.5, 'Slow'], [1, 'Normal'], [1.6, 'Fast'], [3, 'Very fast']].map(([v, l]) => h('option', { value: v, selected: s.settings.aiSpeed === v ? true : null }, l)));
      const rep = assets.report();
      append(el, [
        atTable ? null : h('div', { class: 'field' }, h('label', {}, 'Your name'), nameIn),
        check('sound', 'Sound effects'), check('voices', 'Voice lines'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.settings.music !== false ? true : null, onChange: (e) => { bank.setSetting('music', e.target.checked); music.refresh(); } }), 'Music'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.settings.roomSound !== false ? true : null, onChange: (e) => { bank.setSetting('roomSound', e.target.checked); music.refresh(); } }), 'Lobby room sound'),
      h('div', { class: 'field' }, h('label', {}, 'Music volume'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: typeof s.settings.musicVolume === 'number' ? s.settings.musicVolume : 0.7, onInput: (e) => { bank.setSetting('musicVolume', +e.target.value); music.refresh(); } })),
        h('div', { class: 'field' }, h('label', {}, 'Opponent speed'), speed),
        atTable ? null : h('details', {}, h('summary', {}, rep.missing.length ? `Art files: ${rep.missing.length} still placeholders` : 'Art files: all in place'),
          h('div', { class: 'muted small' }, rep.missing.length ? 'Still drawn by the game: ' + rep.missing.join(', ') : 'Everything the game needs has your art.'),
          rep.optional.length ? h('div', { class: 'muted small', style: { marginTop: '6px' } }, `Optional extras you haven't made (${rep.optional.length}): ` + rep.optional.join(', ')) : null),
        atTable ? null : h('details', {}, h('summary', {}, 'Save data'),
          h('div', { class: 'row' },
            h('button', { class: 'btn ghost', onClick: async () => { await navigator.clipboard?.writeText(bank.exportJSON()); toast('Save copied to clipboard'); } }, 'Copy save'),
            h('button', { class: 'btn ghost', onClick: async () => {
              const txt = prompt('Paste a save here'); if (!txt) return;
              try { bank.importJSON(txt); toast('Save imported'); close(); } catch (e) { toast('That is not a save file'); }
            } }, 'Paste save'),
            h('button', { class: 'btn danger', onClick: async () => {
              const ok = await modal({ title: 'Start over?', body: 'This wipes your bank, card and stats.', buttons: [{ label: 'Cancel', kind: 'ghost', value: false }, { label: 'Wipe it', kind: 'danger', value: true }] });
              if (ok) { bank.reset(); bank.setName(nameIn.value); close(); }
            } }, 'Reset everything'),
          )),
      ]);
      nameIn.addEventListener('change', () => bank.setName(nameIn.value));
    },
    buttons: [{ label: 'Done', kind: 'primary' }],
  }).then(() => { if (!atTable) renderLobby(root, ctx); });
}

export async function askName() {
  let name = '';
  await modal({
    title: 'Welcome to the casino', dismissable: false,
    body: (el, close) => {
      const input = h('input', { type: 'text', maxlength: 18, placeholder: 'What should we call you?', autofocus: true });
      const go = () => { name = input.value.trim(); if (name) close(); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      el.append(h('p', {}, 'Ken at the bank will need a name for your card.'), input, h('div', { class: 'modal-buttons' }, h('button', { class: 'btn primary', onClick: go }, "Let's play")));
      setTimeout(() => input.focus(), 250);
    },
  });
  bank.setName(name);
}
