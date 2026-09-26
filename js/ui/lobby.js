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
import { VERSION } from '../version.js';

const GAMES = [
  { id: 'holdem', name: "Texas Hold'em", sub: 'Limit & No-Limit', open: true, icon: '♠' },
  { id: 'blackjack', name: 'Blackjack', sub: '6 decks · 3 to 2', open: true, icon: '21' },
  { id: 'slots', name: 'Slots', sub: 'Van Halen · Hot for Jackpot', open: true, icon: '7' },
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
      radioWidget(root, { onEnter }),
      settingsButton(() => showSettings(root, { onEnter })),
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
    radioWidget(root, { onEnter }),
    settingsButton(() => showSettings(root, { onEnter })),
  );
  floor.append(header, doors, footer);
  root.append(floor);
}

// small gold icons for the lobby bars (paths on a 24-grid; the gear is Material's, Apache-2.0)
const ICONS = {
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  play: 'M7 4l13 8-13 8z',
  skip: 'M4 5l9 7-9 7zM12 5l7 7-7 7zM19 5h2v14h-2z',
  list: 'M3 6h3v3H3zM8 6.5h13v2H8zM3 10.5h3v3H3zM8 11h13v2H8zM3 15h3v3H3zM8 15.5h13v2H8z',
  gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  notes: 'M9 3v10.55A4 4 0 1 0 11 17V7h8v6.55A4 4 0 1 0 21 17V3z',
  exit: 'M4 3h9a1 1 0 0 1 1 1v3h-2V5H5v14h7v-2h2v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12.3 5.3 1.4-1.4L22.4 12l-4.7 5.1-1.4-1.4L18.6 13H9v-2h9.6z',
};
export function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  // the notes' visible shape sits at x 3–23 of the grid: shift the viewBox so the SHAPE is centred, not its box
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', name === 'notes' ? '1 0 24 24' : '0 0 24 24');
  svg.setAttribute('class', 'ico ico-' + name); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path'); path.setAttribute('d', ICONS[name]); svg.append(path);
  return svg;
}

// The big green-and-gold Settings button (lobby); the tables use the round .gear-btn in the same style.
export function settingsButton(onClick) {
  return h('button', { class: 'btn settings-btn', onClick: () => { audio.play('tap'); onClick(); } }, icon('gear'), 'Settings');
}

// Casino Radio: what's playing, pause, skip, the Setlist. Sits in the lobby footer; refreshes itself while on screen.
export function radioWidget(root, ctx) {
  const titleText = h('span', { class: 'radio-title-text' }, ''), title = h('div', { class: 'radio-title' }, titleText), artist = h('div', { class: 'radio-artist' }, '');
  const pause = h('button', { class: 'radio-btn', title: 'Pause / play', onClick: () => { audio.play('tap'); if (!music.toggle()) toast('Music is off — turn it on under Casino Radio'); setTimeout(refresh, 350); } }, icon('pause'));
  const skip = h('button', { class: 'radio-btn', title: 'Next song', onClick: () => { audio.play('tap'); if (!music.skip()) toast('Music is off'); setTimeout(refresh, 400); } }, icon('skip'));
  const setlist = h('button', { class: 'radio-btn wide', onClick: () => { audio.play('tap'); showSetlist().then(refresh); } }, icon('list'), h('span', {}, 'Songs'));
  const head = h('button', { class: 'radio-head', onClick: () => { audio.play('tap'); showRadio(root, ctx).then(refresh); } }, icon('notes'), h('span', { class: 'label' }, 'Casino Radio'), h('span', { class: 'chev' }, '⌄'));
  const el = h('div', { class: 'radio' }, h('div', { class: 'radio-left' }, head, h('div', { class: 'radio-now' }, title, artist)), h('div', { class: 'radio-controls' }, pause, skip, setlist));
  let mounted = false;
  const refresh = () => {
    if (el.isConnected) mounted = true; else if (mounted) { clearInterval(timer); return; }   // stop polling once the lobby is torn down (not before it's on screen)
    const songs = music.songs, cur = songs.find((x) => x.playing);
    const off = !audio.musicEnabled;
    let t = '', a = '';
    if (off) { t = 'Music is off'; a = 'tap Casino Radio to turn it on'; }
    else if (cur) { t = cur.title; a = cur.artist || ''; if (music.paused) a = a ? a + ' · paused' : 'paused'; }
    else if (!songs.length) { t = 'No songs'; a = 'assets/music is empty'; }
    else if (!songs.some((x) => x.on)) { t = 'Quiet on the floor'; a = 'every song is off in the Music Library'; }
    // between songs: the title area simply sits empty (Nic's mockup); the bar keeps its width and the buttons stay put
    if (titleText.textContent !== t) {
      titleText.textContent = t; title.classList.remove('scroll'); titleText.style.removeProperty('--shift');
      requestAnimationFrame(() => {                                   // a long title slowly scrolls back and forth inside its area
        const over = titleText.scrollWidth - title.clientWidth;
        if (over > 4) { titleText.style.setProperty('--shift', -(over + 8) + 'px'); titleText.style.setProperty('--secs', Math.max(8, over / 18 + 6) + 's'); title.classList.add('scroll'); }
      });
    }
    artist.textContent = a;
    const want = music.playing ? 'pause' : 'play'; if (!pause.querySelector('.ico-' + want)) { clear(pause); pause.append(icon(want)); }
    el.classList.toggle('off', off);
  };
  const timer = setInterval(refresh, 800);
  refresh();
  return el;
}

// Casino Radio is a page of the Settings panel (same box, no stacking): Back returns to Settings, Done closes.
export const showRadio = (root, ctx, opts = {}) => showSettings(root, ctx, { ...opts, page: 'radio' });

// The little ♫ button that sits beside a table's gear and opens Casino Radio straight away.
export function noteButton(root) {
  return h('button', { class: 'note-btn', title: 'Casino Radio', onClick: () => { audio.play('tap'); showRadio(root, {}, { atTable: true }); } }, icon('notes'));
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

// opts.atTable: opened from a game — no name/save changes mid-hand, and don't rebuild the lobby on close.
// opts.page: 'settings' (default) or 'radio' — Casino Radio lives inside the same panel; 'Back' returns to Settings.
export function showSettings(root, ctx, opts = {}) {
  const s = bank.state;
  const atTable = !!opts.atTable;
  let page = opts.page || 'settings';
  let fromSettings = page === 'settings';   // Back only makes sense when the radio was reached through Settings
  let timer = null;
  return modal({
    dismissable: true, className: 'settings-modal',
    body: (el, close) => {
      const buttons = (...bs) => h('div', { class: 'modal-buttons' }, bs);
      const renderSettings = () => {
        const nameIn = h('input', { type: 'text', value: s.playerName, maxlength: 18, placeholder: 'Your name' });
        const check = (key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.settings[key] ? true : null, onChange: (e) => bank.setSetting(key, e.target.checked) }), label);
        const speed = h('select', { onChange: (e) => bank.setSetting('aiSpeed', +e.target.value) }, [[0.5, 'Slow'], [1, 'Normal'], [1.6, 'Fast'], [3, 'Very fast']].map(([v, l]) => h('option', { value: v, selected: s.settings.aiSpeed === v ? true : null }, l)));
        append(el, [
          h('h2', {}, 'Settings'),
          atTable ? null : h('div', { class: 'field' }, h('label', {}, 'Your name'), nameIn),
          h('div', { class: 'vol-row' }, check('sound', 'Sound effects'), h('input', { type: 'range', 'aria-label': 'Effects volume', min: 0, max: 1, step: 0.05, value: audio.sfxVolume, onInput: (e) => bank.setSetting('sfxVolume', +e.target.value), onChange: () => audio.play('chips') })),
          h('div', { class: 'vol-row' }, check('voices', 'Voice lines'), h('input', { type: 'range', 'aria-label': 'Voices volume', min: 0, max: 1, step: 0.05, value: audio.voiceVolume, onInput: (e) => bank.setSetting('voiceVolume', +e.target.value) })),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.settings.roomSound !== false ? true : null, onChange: (e) => { bank.setSetting('roomSound', e.target.checked); music.refresh(); } }), 'Lobby room sound'),
          h('div', { class: 'field' }, h('label', {}, 'Opponent speed'), speed),
          h('button', { class: 'btn ghost small radio-link', onClick: () => { audio.play('tap'); page = 'radio'; fromSettings = true; render(); } }, icon('notes'), h('span', {}, 'Casino Radio'), h('span', { class: 'chev' }, '›')),
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
          h('div', { class: 'modal-buttons split' },
            h('button', { class: 'btn exit-btn', onClick: async () => {
              audio.play('tap');
              const ok = await modal({ title: 'Exit the casino?', body: atTable ? (bank.state.tourney ? 'Your tournament is saved. It picks up right where you left off next time.' : 'Your chips go back to the bank. Everything is saved.') : 'Everything is saved.', buttons: [{ label: 'Stay', kind: 'ghost', value: false }, { label: 'Exit Game', kind: 'primary', value: true }] });
              if (ok) { close(); document.dispatchEvent(new Event('casino:exit')); }
            } }, icon('exit'), h('span', {}, 'Exit Game')),
            h('button', { class: 'btn primary', onClick: () => close() }, 'Done')),
          h('div', { class: 'build-tag' }, VERSION),   // which build this phone has (temporary, until the game is finished)
        ]);
        nameIn.addEventListener('change', () => bank.setName(nameIn.value));
      };
      const renderRadio = () => {
        const title = h('div', { class: 'np-title' }), artist = h('div', { class: 'np-artist' });
        const label = h('div', { class: 'np-label' }, 'Now playing');
        const now = h('div', { class: 'now-playing-box' }, label, title, artist);
        const pauseBtn = h('button', { class: 'btn ghost small pause-btn', onClick: () => { audio.play('tap'); if (music.toggle()) setTimeout(refresh, 400); else toast('Music is off'); } }, 'Pause');
        const refresh = () => {
          const cur = music.songs.find((x) => x.playing);
          if (!audio.musicEnabled) { title.textContent = 'Music is off'; artist.textContent = ''; }
          else if (cur) { title.textContent = cur.title; artist.textContent = cur.artist || ''; }
          else { title.textContent = music.songs.some((x) => x.on) ? 'Between songs' : 'Every song is off'; artist.textContent = ''; }
          label.textContent = cur && music.paused ? 'Paused' : 'Now playing';
          pauseBtn.textContent = music.playing ? 'Pause' : 'Play';
        };
        refresh(); timer = setInterval(refresh, 800);
        append(el, [
          h('h2', {}, 'Casino Radio'),
          now,
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.settings.music !== false ? true : null, onChange: (e) => { bank.setSetting('music', e.target.checked); music.refresh(); setTimeout(refresh, 300); } }), 'Music'),
          h('div', { class: 'field slider' }, h('label', {}, 'Volume', h('span', { class: 'muted small' }, ' — standard is the mark; past it is a boost')), h('input', { type: 'range', min: 0, max: 1.5, step: 0.05, list: 'music-vol-marks', value: audio.musicVolume, onInput: (e) => { bank.setSetting('musicVolume', +e.target.value); music.refresh(); } }), h('datalist', { id: 'music-vol-marks' }, h('option', { value: 0.7, label: 'Standard' }))),
          h('div', { class: 'row' },
            pauseBtn,
            h('button', { class: 'btn ghost small', onClick: () => { audio.play('tap'); if (music.skip()) { toast('Next song'); setTimeout(refresh, 500); } else toast('Music is off'); } }, 'Skip song ⏭'),
            h('button', { class: 'btn ghost small', onClick: () => { audio.play('tap'); showSetlist().then(refresh); } }, 'Music Library ♪'),
          ),
          buttons(fromSettings ? h('button', { class: 'btn ghost', onClick: () => { audio.play('tap'); page = 'settings'; render(); } }, '‹ Back') : null, h('button', { class: 'btn primary', onClick: () => close() }, 'Done')),
        ]);
      };
      const render = () => { clearInterval(timer); timer = null; clear(el); if (page === 'radio') renderRadio(); else renderSettings(); };
      render();
    },
  }).then(() => { clearInterval(timer); if (!atTable && root) renderLobby(root, ctx); });
}

// The Music Library: every song in assets/music, with a switch to keep it in or out of the shuffle and a play-now button.
export function showSetlist() {
  return modal({
    dismissable: true, className: 'library-modal',
    body: (el, close) => {
      const list = h('div', { class: 'setlist' });
      const render = () => {
        const songs = music.songs;
        clear(list);
        if (!songs.length) list.append(h('div', { class: 'muted small', style: { padding: '12px' } }, 'No songs found in assets/music.'));
        for (const song of songs) {
          list.append(h('div', { class: 'setlist-row' + (song.playing ? ' playing' : '') + (song.on ? '' : ' off') },
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: song.on ? true : null, onChange: (e) => { music.setSongOn(song.file, e.target.checked); setTimeout(render, 350); } }),
              h('span', { class: 'setlist-text' },
                h('span', { class: 'setlist-title' }, song.title, song.playing ? h('span', { class: 'now-playing' }, h('span', { class: 'note' }, '♪'), 'Now playing') : null),
                song.artist ? h('span', { class: 'setlist-artist' }, song.artist) : null)),
            h('button', { class: 'setlist-play' + (song.playing ? ' on' : ''), title: 'Play this now', onClick: () => { audio.play('tap'); if (music.playSong(song.url)) { toast(song.title); setTimeout(render, 350); } else toast('Music is off'); } }, song.playing ? '♪' : '▶'),
          ));
        }
      };
      render();
      el.append(
        h('button', { class: 'library-close', 'aria-label': 'Close', onClick: () => { audio.play('tap'); close(); } }, '✕'),
        h('div', { class: 'library-head' }, h('div', { class: 'eyebrow' }, 'Casino Radio'), h('h1', {}, 'Music Library'), h('p', {}, 'Checked songs play in shuffle.', h('br'), 'Press ▶ to play any song now.'), h('div', { class: 'rule' }, '✤')),
        list,
        h('div', { class: 'library-foot' }, h('span', { class: 'muted small' }, 'Changes save automatically.'), h('button', { class: 'btn primary', onClick: () => close() }, 'Done')),
      );
    },
  });
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
