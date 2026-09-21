// Sound: synthesized placeholder effects (WebAudio) with drop-in file overrides, plus character voice lines.
//   assets/sfx/<key>.mp3         overrides a synthesized effect (keys listed in SFX below)
//   assets/voice/<charId>/<file>   recorded lines, named in characters.js next to their text
import { assets, probeAudio } from './assets.js';
import { bank } from './bank.js';

export const SFX = ['tap', 'chip', 'chips', 'deal', 'flip', 'check', 'fold', 'win', 'bigwin', 'lose', 'allin', 'tierup', 'tierdown', 'bailout', 'shuffle', 'yourturn', 'dice'];

let ctx = null;
const fileSfx = new Map();
let unlocked = false;


export const audio = {
  async init() {
    for (const ext of ['mp3', 'm4a', 'wav']) {
      await Promise.all(SFX.map(async (k) => {
        if (fileSfx.has(k)) return;
        const url = assets.fileUrl(`sfx/${k}.${ext}`);
        if (await probeAudio(url)) fileSfx.set(k, url);
      }));
    }
    const unlock = () => {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      unlocked = true;
    };
    for (const ev of ['touchstart', 'touchend', 'mousedown', 'keydown']) document.addEventListener(ev, unlock, { once: false, passive: true });
  },
  get enabled() { return bank.state?.settings?.sound !== false; },
  get musicEnabled() { return bank.state?.settings?.music !== false; },
  get musicVolume() { const v = bank.state?.settings?.musicVolume; return typeof v === 'number' ? v : 0.7; },
  get voicesEnabled() { return bank.state?.settings?.voices !== false; },

  play(key, opts = {}) {
    if (!this.enabled) return;
    const file = fileSfx.get(key);
    if (file) { const a = new Audio(file); a.volume = opts.volume ?? 0.8; a.play().catch(() => {}); return; }
    if (!ctx || !unlocked) return;
    try { synth[key]?.(ctx, opts); } catch { /* ignore */ }
  },

  // Play a recorded line: assets/voice/<characterId>/<file>. Returns true if a clip was started.
  voice(character, file) {
    if (!this.voicesEnabled || !character || !file) return false;
    const a = new Audio(assets.fileUrl(`voice/${character.id}/${file}`));
    a.volume = 1;
    a.play().catch(() => {});
    return true;
  },
};

// ---------- background music ----------
// Files live in assets/music/<key>.mp3 (e.g. lobby.mp3). Loops, fades in/out, honours the music setting.
// iOS won't start audio until the first tap, so a play() before that is retried on the next gesture.
const musicFiles = new Map();
let musicEl = null, musicKey = null, fadeTimer = null, duckLevel = 1;
const DUCK = 0.45; // how loud the music is while you're at a table, relative to the lobby
function fadeTo(target, ms, done) {
  clearInterval(fadeTimer);
  if (!musicEl) return done?.();
  const start = musicEl.volume, steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++; musicEl.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
    if (i >= steps) { clearInterval(fadeTimer); done?.(); }
  }, 50);
}
let playlist = [], queue = [];
function nextTrack() {
  if (!playlist.length) return null;
  if (!queue.length) {                      // reshuffle; don't repeat the song that just ended
    queue = playlist.slice();
    for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
    if (queue.length > 1 && queue[0] === lastTrack) queue.push(queue.shift());
  }
  return queue.shift();
}
let lastTrack = null;
export const music = {
  async init() {
    // playlist: assets/music/song-1.mp3, song-2.mp3, ... (stops at the first missing number)
    for (let n = 1; n <= 20; n++) {
      let found = null;
      for (const ext of ['mp3', 'm4a']) { const url = assets.fileUrl(`music/song-${n}.${ext}`); if (await probeAudio(url)) { found = url; break; } }
      if (!found) break;
      playlist.push(found);
    }
    if (playlist.length) musicFiles.set('lobby', playlist[0]);
    const retry = () => { if (musicKey && musicEl && musicEl.paused && audio.musicEnabled) musicEl.play().catch(() => {}); };
    for (const ev of ['touchend', 'mousedown', 'keydown']) document.addEventListener(ev, retry, { passive: true });
  },
  has(key) { return musicFiles.has(key); },
  play(key) {
    if (musicKey === key && musicEl && !musicEl.paused) return;
    this.stop(300);
    musicKey = key;
    if (!playlist.length || !audio.musicEnabled) return;
    const url = nextTrack(); lastTrack = url;
    const el = new Audio(url); el.volume = 0; el.preload = 'auto';
    el.addEventListener('ended', () => { if (musicEl === el) { musicEl = null; const k = musicKey; musicKey = null; this.play(k); } });
    musicEl = el;
    el.play().catch(() => {}); // may be refused before the first tap; the gesture listener retries
    fadeTo(audio.musicVolume * duckLevel, 1200);
  },
  // Quieter while a game is being played (like walking away from the speaker), back up in the lobby.
  duck(on) {
    duckLevel = on ? DUCK : 1;
    if (musicEl) fadeTo(audio.musicVolume * duckLevel, 900);
  },
  stop(ms = 600) {
    musicKey = null;
    const el = musicEl; if (!el) return;
    musicEl = null;
    clearInterval(fadeTimer);
    const start = el.volume, steps = Math.max(1, Math.round(ms / 50)); let i = 0;
    const t = setInterval(() => { i++; el.volume = Math.max(0, start * (1 - i / steps)); if (i >= steps) { clearInterval(t); el.pause(); el.removeAttribute('src'); } }, 50);
  },
  // settings changed: apply immediately
  refresh() {
    if (!audio.musicEnabled) { const k = musicKey; this.stop(300); musicKey = k; return; }
    if (musicKey && !musicEl) { const k = musicKey; musicKey = null; this.play(k); }
    else if (musicEl) musicEl.volume = audio.musicVolume * duckLevel;
  },
};

// ---------- tiny synthesizer ----------
function tone(ctx, { f = 440, t = 0.1, type = 'sine', vol = 0.2, at = 0, slide = 0 }) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime + at);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), ctx.currentTime + at + t);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + t);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + t + 0.02);
}
function noise(ctx, { t = 0.08, vol = 0.15, at = 0, hp = 1000 }) {
  const len = Math.floor(ctx.sampleRate * t);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(ctx.destination);
  s.start(ctx.currentTime + at);
}
const synth = {
  tap: (c) => tone(c, { f: 900, t: 0.03, type: 'square', vol: 0.05 }),
  chip: (c) => tone(c, { f: 2400, t: 0.05, vol: 0.08 }),
  chips: (c) => { for (let i = 0; i < 4; i++) tone(c, { f: 2200 + i * 150, t: 0.05, vol: 0.07, at: i * 0.05 }); },
  deal: (c) => noise(c, { t: 0.07, vol: 0.12, hp: 1500 }),
  flip: (c) => { noise(c, { t: 0.05, vol: 0.1, hp: 2000 }); tone(c, { f: 600, t: 0.05, vol: 0.04, slide: 300 }); },
  check: (c) => { tone(c, { f: 180, t: 0.05, type: 'triangle', vol: 0.25 }); tone(c, { f: 160, t: 0.05, type: 'triangle', vol: 0.2, at: 0.09 }); },
  fold: (c) => synth.tap(c),
  win: (c) => [523, 659, 784].forEach((f, i) => tone(c, { f, t: 0.15, at: i * 0.08, vol: 0.12 })),
  bigwin: (c) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(c, { f, t: 0.2, at: i * 0.1, vol: 0.14 })),
  lose: (c) => tone(c, { f: 220, t: 0.35, type: 'sawtooth', vol: 0.05, slide: -120 }),
  allin: (c) => { noise(c, { t: 0.25, vol: 0.2, hp: 1500 }); [330, 392].forEach((f, i) => tone(c, { f, t: 0.2, at: i * 0.12, vol: 0.1, type: 'triangle' })); },
  tierup: (c) => [392, 523, 659, 784, 1047].forEach((f, i) => tone(c, { f, t: 0.35, at: i * 0.12, vol: 0.12, type: 'triangle' })),
  tierdown: (c) => [523, 440, 349].forEach((f, i) => tone(c, { f, t: 0.35, at: i * 0.18, vol: 0.1, type: 'triangle' })),
  bailout: (c) => [262, 247, 233, 220].forEach((f, i) => tone(c, { f, t: 0.25, at: i * 0.15, vol: 0.1, type: 'square' })),
  shuffle: (c) => { for (let i = 0; i < 8; i++) noise(c, { t: 0.03, vol: 0.06, hp: 2500, at: i * 0.04 }); },
  yourturn: (c) => synth.tap(c),
  dice: (c) => { for (let i = 0; i < 6; i++) noise(c, { t: 0.04, vol: 0.12, hp: 1200, at: i * 0.06 + Math.random() * 0.02 }); },
};
