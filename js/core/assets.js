// Art override system. Every piece of art has a key and an expected file path under assets/.
// At startup we check which files exist; anything missing falls back to the built-in placeholder.
// Drop your own image in with the exact file name (.png or .jpg) and it takes over — no code changes.
import { CHARACTERS } from '../content/characters.js';
import { SUITS, RANK_CHAR } from './cards.js';

// Paths are listed without extension; .png and .jpg are both tried (png first).
export const ASSET_FILES = {
  // Lobby
  'lobby.floor':        'img/lobby/floor',          // full-screen casino floor background (landscape, ~2048x1024)
  'lobby.door.holdem':  'img/lobby/door-holdem',    // game doors / signs — only used when there is NO floor art
  'lobby.door.blackjack': 'img/lobby/door-blackjack',
  'lobby.door.slots':   'img/lobby/door-slots',
  'lobby.door.farkle':  'img/lobby/door-farkle',
  'lobby.door.cribbage':'img/lobby/door-cribbage',
  'lobby.cashier':      'img/lobby/cashier',        // bank / cashier window
  'lobby.ken':          'img/portraits/ken',        // Ken the banker (~512x512)
  'lobby.ken.mad':      'img/portraits/ken-mad',    // Ken when you come back for more
  // Credit cards (~860x540, rounded corners are added by the game)
  'card.tier1': 'img/cards/credit-1',
  'card.tier2': 'img/cards/credit-2',
  'card.tier3': 'img/cards/credit-3',
  'card.tier4': 'img/cards/credit-4',
  'card.tier5': 'img/cards/credit-5',
  // Table
  'table.felt.holdem':  'img/table/felt-holdem',    // table background, landscape (~2048x1024)
  'table.felt.blackjack': 'img/table/felt-blackjack', // blackjack table background (falls back to the hold'em felt)
  'table.dealer':       'img/table/dealer-button',  // dealer button (~128x128)
  // Playing cards (~250x350). Faces are optional; the back is the one you'll notice most.
  'deck.back': 'img/cards/back',
  'deck.back2': 'img/cards/back-2',                 // optional second back; the table picks one at random when you sit
};
for (const s of SUITS) for (const r of Object.values(RANK_CHAR)) ASSET_FILES[`deck.${r}${s.toUpperCase()}`] = `img/cards/${r}${s.toUpperCase()}`;
// Chips (~256x256, transparent background)
for (const d of [1, 5, 25, 100, 500, 1000, 5000]) ASSET_FILES[`chip.${d}`] = `img/chips/${d}`;
// Portraits (~512x512). Optional extra expressions: <id>-happy, <id>-mad
for (const c of CHARACTERS) {
  ASSET_FILES[`portrait.${c.id}`] = `img/portraits/${c.id}`;
  ASSET_FILES[`portrait.${c.id}.happy`] = `img/portraits/${c.id}-happy`;
  ASSET_FILES[`portrait.${c.id}.mad`] = `img/portraits/${c.id}-mad`;
}

const EXTS = ['png', 'jpg'];
const base = new URL('../../assets/', import.meta.url).href;
const present = new Map(); // key -> url | null

// Loading as an image is the one check that works the same on every kind of server
// (a plain file server, or a host that answers 200 with an HTML page for missing files).
function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export const assets = {
  async init(onProgress) {
    const entries = Object.entries(ASSET_FILES);
    let done = 0, i = 0;
    const worker = async () => {
      while (i < entries.length) {
        const [key, rel] = entries[i++];
        let found = null;
        for (const ext of EXTS) {
          const url = `${base}${rel}.${ext}`;
          if (await probeImage(url)) { found = url; break; }
        }
        present.set(key, found);
        done++; onProgress?.(done / entries.length);
      }
    };
    await Promise.all(Array.from({ length: 10 }, worker));
    return present;
  },
  has(key) { return !!present.get(key); },
  url(key) { return present.get(key) || null; },
  fileUrl(rel) { return base + rel; },
  // Applies a background-image if the asset exists; adds `has-art` so CSS can hide placeholder bits.
  bg(el, key) {
    const u = this.url(key);
    if (u) { el.style.backgroundImage = `url("${u}")`; el.classList.add('has-art'); }
    return !!u;
  },
  // Optional art: nice to have, the game is complete without it (card faces, extra expressions, a second back...).
  isOptional(key) {
    if (/^deck\.(?!back$)/.test(key)) return true;               // card faces and the second back
    if (/^portrait\..+\.(happy|mad)$/.test(key)) return true;    // extra expressions
    if (key === 'table.felt.blackjack' || key === 'lobby.cashier') return true;
    if (key.startsWith('lobby.door.') && this.has('lobby.floor')) return true; // doors are hidden once there's floor art
    return false;
  },
  report() {
    const have = [], missing = [], optional = [];
    for (const [k, v] of present) {
      if (v) have.push(k);
      else if (this.isOptional(k)) optional.push(k);
      else missing.push(k);
    }
    return { have, missing, optional };
  },
};

// Sound files: ask the browser to load the metadata. Works on any host, and a missing file
// (or an HTML page served in its place) fails to decode.
export function probeAudio(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    let done = false;
    const finish = (v) => { if (!done) { done = true; a.removeAttribute('src'); resolve(v); } };
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => finish(true), { once: true });
    a.addEventListener('error', () => finish(false), { once: true });
    setTimeout(() => finish(false), 6000);
    a.src = url;
  });
}
