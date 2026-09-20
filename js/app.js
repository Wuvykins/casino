// App entry: boots the save, probes art, routes between screens.
import { h, $, clear } from './ui/dom.js';
import { bank } from './core/bank.js';
import { assets } from './core/assets.js';
import { audio, music } from './core/audio.js';
import { renderLobby, askName } from './ui/lobby.js';
import { renderHoldemSelect } from './ui/holdemSelect.js';
import { HoldemTable } from './ui/holdemTable.js';
import { renderBlackjackSelect } from './ui/blackjackSelect.js';
import { BlackjackTable } from './ui/blackjackTable.js';

const root = $('#app');
let current = null;

function goLobby() {
  current = null;
  music.play('lobby');
  music.duck(false);
  renderLobby(root, { onEnter: (gameId) => { if (gameId === 'holdem') goHoldemSelect(); else if (gameId === 'blackjack') goBlackjackSelect(); } });
}
function goHoldemSelect() {
  music.duck(true); // keeps playing, much quieter, all the way through the game
  renderHoldemSelect(root, {
    onBack: goLobby,
    onSit: (table, buyIn, opponents) => {
      current = new HoldemTable(root, table, buyIn, opponents, { onLeave: goLobby });
      current.run().catch((err) => { console.error(err); goLobby(); });
    },
  });
}

function goBlackjackSelect() {
  music.duck(true);
  renderBlackjackSelect(root, {
    onBack: goLobby,
    onSit: (table, buyIn, companions) => {
      current = new BlackjackTable(root, table, buyIn, companions, { onLeave: goLobby });
      current.run().catch((err) => { console.error(err); goLobby(); });
    },
  });
}

async function boot() {
  const splash = $('#splash');
  const bar = $('#splash .fill');
  bank.load();
  await assets.init((p) => { if (bar) bar.style.width = (p * 100).toFixed(0) + '%'; });
  await audio.init();
  await music.init();
  splash?.remove();
  if (!bank.state.playerName) await askName();
  goLobby();
}

// Landscape only. Show a rotate prompt in portrait.
function checkOrientation() {
  const portrait = window.innerHeight > window.innerWidth;
  document.body.classList.toggle('portrait', portrait);
}
window.addEventListener('resize', checkOrientation);
checkOrientation();

// Leaving the page mid-session: chips are snapshotted after every hand, and restored to the bank on next load.
window.addEventListener('pagehide', () => { if (current && !current.stopped) bank.setAtTable({ tableId: current.table.id, stack: current.human.stack, opponents: [] }); });

boot();

// Installed as an app: cache everything so it opens offline. Skipped when embedded (e.g. the Claude test link) or on plain http.
if ('serviceWorker' in navigator && window.self === window.top && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
}
