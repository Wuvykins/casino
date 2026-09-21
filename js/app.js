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
import { renderCribbageSelect } from './ui/cribbageSelect.js';
import { CribbageTable } from './ui/cribbageTable.js';
import { renderFarkleSelect } from './ui/farkleSelect.js';
import { FarkleTable } from './ui/farkleTable.js';

const root = $('#app');
let current = null;

function goLobby() {
  current = null;
  music.play('lobby');
  music.duck(false);
  renderLobby(root, { onEnter: (gameId) => { if (gameId === 'holdem') goHoldemSelect(); else if (gameId === 'blackjack') goBlackjackSelect(); else if (gameId === 'cribbage') goCribbageSelect(); else if (gameId === 'farkle') goFarkleSelect(); } });
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

function goCribbageSelect() {
  music.duck(true);
  renderCribbageSelect(root, {
    onBack: goLobby,
    onSit: (table, buyIn, opponents) => {
      current = new CribbageTable(root, table, buyIn, opponents, { onLeave: goLobby });
      current.run().catch((err) => { console.error(err); goLobby(); });
    },
  });
}

function goFarkleSelect() {
  music.duck(true);
  renderFarkleSelect(root, {
    onBack: goLobby,
    onSit: (table, buyIn, opponents) => {
      current = new FarkleTable(root, table, buyIn, opponents, { onLeave: goLobby });
      current.run().catch((err) => { console.error(err); goLobby(); });
    },
  });
}

// Startup: Nic's intro video plays while the save, art and sounds load (about a second). The logo forms at normal
// speed; once loading is done the rest of the video runs faster, so the whole thing takes ~8 s instead of 12.
// A tap skips the video (and, since a tap is a gesture, unmutes it for whatever is left).
const INTRO_LOGO_AT = 5.2;   // seconds into the video when the logo has formed
const INTRO_FAST = 2.2;      // once loading is done, the rest of the video (the progress bar) runs this much faster
function playIntro(splash) {
  const video = splash?.querySelector('video');
  if (!video) return { done: Promise.resolve(), loaded() {} };
  let loadedFlag = false;
  const hurry = () => { if (loadedFlag && video.currentTime >= INTRO_LOGO_AT) video.playbackRate = INTRO_FAST; };
  video.addEventListener('timeupdate', hurry);
  const done = new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    video.play().catch(finish);                       // can't autoplay here? go straight in
    setTimeout(() => splash.classList.add('can-skip'), 2500);
    setTimeout(finish, 15000);                        // never hold the door longer than this
    splash.addEventListener('pointerdown', () => { if (splash.classList.contains('can-skip')) finish(); else { video.muted = false; } });
  });
  return { done, loaded() { loadedFlag = true; hurry(); } };
}

async function boot() {
  const splash = $('#splash');
  const intro = playIntro(splash);
  bank.load();
  await assets.init();
  await audio.init();
  await music.init();
  intro.loaded();          // the real loading is done; let the video's bar hurry to the end
  await intro.done;
  if (splash) { splash.classList.add('out'); setTimeout(() => splash.remove(), 600); }
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
