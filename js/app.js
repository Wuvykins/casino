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
import { renderSlotsSelect } from './ui/slotsSelect.js';
import { SlotsTable } from './ui/slotsTable.js';

const root = $('#app');
let current = null;

function goLobby() {
  current = null;
  music.play('lobby');
  music.duck(false);
  renderLobby(root, { onEnter: (gameId) => { if (gameId === 'holdem') goHoldemSelect(); else if (gameId === 'blackjack') goBlackjackSelect(); else if (gameId === 'cribbage') goCribbageSelect(); else if (gameId === 'farkle') goFarkleSelect(); else if (gameId === 'slots') goSlotsSelect(); } });
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

// Startup: the intro video starts by itself, with sound, wherever the browser allows that. Phones refuse to play
// sound until the person has tapped once, so there the app shows "Tap to enter" on the intro's first frame and
// that tap starts Nic's intro video — with sound — while the save, art and sounds load
// (about a second). The logo forms at normal speed; once loading is done the rest runs faster (~8 s instead of 12).
// A tap after 2.5 s skips the rest.
const INTRO_LOGO_AT = 5.2;   // seconds into the video when the logo has formed
const INTRO_FAST = 2.2;      // once loading is done, the rest of the video (the progress bar) runs this much faster
function playIntro(splash) {
  const video = splash?.querySelector('video');
  if (!video) return { done: Promise.resolve(), loaded() {} };
  let loadedFlag = false, started = false, finished = false;
  const hurry = () => { if (loadedFlag && video.currentTime >= INTRO_LOGO_AT) video.playbackRate = INTRO_FAST; };
  video.addEventListener('timeupdate', hurry);
  const done = new Promise((resolve) => {
    const finish = () => { if (!finished) { finished = true; resolve(); } };
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    const start = () => {
      if (started) return;
      started = true; splash.classList.add('started');
      video.muted = false;
      if (video.paused) video.play().catch(finish);     // can't play here? go straight in
      setTimeout(() => splash.classList.add('can-skip'), 2500);
      setTimeout(finish, 15000);                        // never hold the door longer than this
      setTimeout(() => { if (video.readyState === 0) finish(); }, 4000); // nothing decoded after 4 s? the file isn't playable here
    };
    splash.addEventListener('pointerdown', () => { if (!started) start(); else if (splash.classList.contains('can-skip')) finish(); });
    splash.classList.add('ready');
    // Try to just go, with sound. Browsers that allow it (desktop, most of the time) never see the gate; the ones
    // that insist on a tap first (iPhone, iPad) refuse here, and then we ask for the tap.
    video.muted = false;
    video.play().then(() => { if (!started) start(); }).catch(() => { if (!started) splash.classList.add('gate'); });
  });
  return { done, loaded() { loadedFlag = true; hurry(); } };
}

function goSlotsSelect() {
  music.duck(true);
  renderSlotsSelect(root, {
    onBack: goLobby,
    onSit: (table, buyIn) => {
      current = new SlotsTable(root, table, buyIn, { onLeave: goLobby });
      current.run().catch((err) => { console.error(err); goLobby(); });
    },
  });
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
const snapshot = () => { if (current && !current.stopped) bank.setAtTable({ tableId: current.table.id, stack: current.tourney ? 0 : current.human.stack, opponents: [] }); };   // tournament chips aren't money
window.addEventListener('pagehide', snapshot);

// "Exit Game" (Settings): chips are snapshotted, the sound stops, and the window closes where the platform allows
// it (Android home-screen apps usually do). iPhone/iPad refuse to let a web app close itself, so there the game
// shows a closed-casino screen: everything is saved and the person swipes home; a tap on "Come back in" reopens.
const exitGame = () => {
  snapshot();
  try { current?.stopClips?.(); } catch { /* ignore */ }
  try { music.stop(200); } catch { /* ignore */ }
  const closedScreen = () => {
    if (document.getElementById('exit-screen')) return;
    const scr = h('div', { id: 'exit-screen' },
      h('div', { class: 'exit-card' },
        h('div', { class: 'exit-eyebrow' }, 'The Casino'),
        h('h1', {}, 'Closed for the night'),
        h('p', {}, `Your bank is safe at ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(bank.state.bank + (bank.state.atTable?.stack || 0))}. You can swipe home now.`),
        h('button', { class: 'btn primary', onClick: () => location.reload() }, 'Come back in')));
    document.body.append(scr);
    requestAnimationFrame(() => scr.classList.add('show'));
  };
  try { window.close(); } catch { /* ignore */ }
  setTimeout(() => { if (!document.hidden) closedScreen(); }, 350);   // still here? the platform wouldn't close us
};
document.addEventListener('casino:exit', exitGame);
// The menu-style buttons (.btn: Back, Done, Min/Half/Max, Shuffle, modal buttons, Leave table) and the player tiles click
// when pressed (Nic: Back had no sound). Table actions — fold/check/call/raise, bet chips, dice, cards, the slot machine —
// make their own sounds and are left alone; audio.play also drops a tap that lands on top of another effect.
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('button');
  if (!b || b.disabled || b.closest('.actionbar, .slot-hit, .fk-dice, .cb-hand')) return;
  if (b.matches('.btn:not(.act), .cast-tile')) audio.play('tap');
});

// Phone locked or app put away: after a while away the game goes back to the title on its own rather than
// resuming a hand from an hour ago (a quick switch to a message and back is left alone).
const AWAY_LIMIT = 60_000;
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); snapshot(); }
  else if (hiddenAt && Date.now() - hiddenAt > AWAY_LIMIT && !document.getElementById('splash') && !document.getElementById('exit-screen')) { snapshot(); location.reload(); }
  else hiddenAt = 0;
});

boot();

// Installed as an app: cache everything so it opens offline. Skipped when embedded (e.g. the Claude test link) or on plain http.
if ('serviceWorker' in navigator && window.self === window.top && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  // A new build took over (the phone launched an old cached copy while the new one installed): reload once while we
  // are still on the intro so the new version shows on THIS launch instead of the next one; mid-game, just say so.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }          // first install, nothing to swap
    const splash = document.getElementById('splash');
    if (splash && !splash.classList.contains('out')) location.reload();
    else import('./ui/dom.js').then(({ toast }) => toast('Casino updated — the new version loads next time you open it.', 4000));
  });
}
