// Sound: synthesized placeholder effects (WebAudio) with drop-in file overrides, plus character voice lines.
//   assets/sfx/<key>.mp3         overrides a synthesized effect (keys listed in SFX below)
//   assets/voice/<charId>/<file>   recorded lines, named in characters.js next to their text
import { assets, probeAudio } from './assets.js';
import { bank } from './bank.js';

export const SFX = ['tap', 'chip', 'chips', 'deal', 'flip', 'check', 'call', 'raise', 'fold', 'win', 'bigwin', 'lose', 'allin', 'tierup', 'tierdown', 'bailout', 'shuffle', 'yourturn', 'dice', 'slotspin', 'slotreels', 'slotsmall', 'slotstop', 'slotteacher', 'slotjackpot', 'victory', 'clap', 'crib1', 'crib2', 'count'];

// effects that reuse another effect's recording when they have no file of their own (Nic, v132)
const ALIAS = { chips: 'allin', flip: 'deal', tierdown: 'lose' };

let ctx = null;
const fileSfx = new Map();
const missingSfx = new Set();   // keys we tried to load a file for and got nothing (synth placeholder from then on)
let manifestP = null;
function manifest() {
  if (!manifestP) manifestP = fetch(assets.fileUrl('manifest.json')).then((r) => r.ok ? r.json() : null).catch(() => null);
  return manifestP;
}
let unlocked = false;
let voiceNow = null;   // the voice clip currently playing, if any
let lastSfxAt = -1000; // when the last effect started (see play: one tap per press)
const TAP_LEVEL = 0.3;  // the button click sits under everything else — it's a UI tick, not an event


export const audio = {
  async init() {
    // assets/manifest.json (written by tools/build_sw.py) says which files exist. Probing each one with an <audio>
    // element used to be the only way, and on an iPhone that's still downloading a new build the probes time out and
    // every effect silently falls back to its synth placeholder ('the sounds are all the old ones' — Nic, twice).
    const man = await manifest();
    if (man?.sfx) {
      for (const f of man.sfx) { const k = f.replace(/\.[^.]+$/, ''); if (!fileSfx.has(k)) fileSfx.set(k, assets.fileUrl(`sfx/${f}`)); }
    } else {
      for (const ext of ['mp3', 'm4a', 'wav']) {
        await Promise.all(SFX.map(async (k) => {
          if (fileSfx.has(k)) return;
          const url = assets.fileUrl(`sfx/${k}.${ext}`);
          if (await probeAudio(url)) fileSfx.set(k, url);
        }));
      }
    }
    const unlock = () => { ctxNow(); if (!unlocked) for (const url of fileSfx.values()) bufferFor(url).catch(() => {}); unlocked = true; };   // first tap: decode every effect once
    for (const ev of ['touchstart', 'touchend', 'mousedown', 'keydown']) document.addEventListener(ev, unlock, { once: false, passive: true });
  },
  get enabled() { return bank.state?.settings?.sound !== false; },
  get musicEnabled() { return bank.state?.settings?.music !== false; },
  get musicVolume() { const v = bank.state?.settings?.musicVolume; return typeof v === 'number' ? v : 0.7; },   // 0..1.5: 0.7 is the standard level, above 1 is a boost
  get sfxVolume() { const v = bank.state?.settings?.sfxVolume; return typeof v === 'number' ? v : 1; },
  get voiceVolume() { const v = bank.state?.settings?.voiceVolume; return typeof v === 'number' ? v : 1; },
  get voicesEnabled() { return bank.state?.settings?.voices !== false; },

  play(key, opts = {}) {
    if (!this.enabled) return;
    // Every <button> press gets a tap from app.js; a button whose own handler already made a sound (a chip, a raise,
    // a slot stop) or that was tapped a moment ago doesn't get a second click on top of it.
    const now = performance.now();
    if (key === 'tap' && now - lastSfxAt < 80) return null;
    lastSfxAt = now;
    let file = fileSfx.get(key) || fileSfx.get(ALIAS[key]);
    if (!file && !missingSfx.has(key) && ctx && unlocked) {   // not found at start-up? try the file once before settling for the placeholder
      const url = assets.fileUrl(`sfx/${key}.mp3`);
      bufferFor(url).then(() => fileSfx.set(key, url), () => { missingSfx.add(key); try { synth[key]?.(ctx, opts); } catch { /* ignore */ } });   // no file after all: the placeholder plays now and from then on
      file = url;
    }
    if (file) return playClip(file, (opts.volume ?? (key === 'tap' ? TAP_LEVEL : 0.8)) * this.sfxVolume, { loop: !!opts.loop, rate: opts.rate || 1 });
    if (!ctx || !unlocked) return null;
    try { synth[key]?.(ctx, opts); } catch { /* ignore */ }
    return null;
  },

  // Play a recorded line: assets/voice/<characterId>/<file>. Returns true if a clip was started.
  voice(character, file) {
    if (!this.voicesEnabled || !character || !file) return false;
    if (voiceNow && !voiceNow.paused && !voiceNow.ended) return false;   // someone is already talking: this line is skipped rather than talked over
    voiceNow = playClip(assets.fileUrl(`voice/${character.id}/${file}`), this.voiceVolume);
    return true;
  },
};

// the synthesised placeholders share one gain so the Sound effects slider covers them as well
let sfxBus = null;
function bus(c = ctxNow()) { if (!sfxBus || sfxBus.context !== c) { sfxBus = c.createGain(); sfxBus.connect(c.destination); } sfxBus.gain.value = audio.sfxVolume; return sfxBus; }

// Clips (effects and voice lines) play from decoded AudioBuffers: buffer -> gain -> speakers. That gives real volume
// control on iPhone (Safari ignores element.volume) without leaking anything: v111–v128 made a fresh <audio> element
// plus a MediaElementSource for every sound, and neither is ever released once wired into the graph — after a minute
// of play the page held hundreds of them, Safari got laggy and then refused to start new sounds at all (Nic's report).
// Each file is fetched and decoded once (effects at start-up, voice lines on first use). Before the first tap, when
// the context can't run yet, a bare element is used instead. Returns a handle with pause() / paused / ended / loop.
const buffers = new Map();   // url -> AudioBuffer, or the Promise while it decodes
function bufferFor(url) {
  if (buffers.has(url)) return buffers.get(url);
  const c = ctxNow();
  const p = fetch(url).then((r) => r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))
    .then((ab) => new Promise((res, rej) => { const q = c.decodeAudioData(ab, res, rej); if (q && q.then) q.then(res, rej); }))
    .then((buf) => { buffers.set(url, buf); return buf; })
    .catch((e) => { buffers.delete(url); throw e; });
  buffers.set(url, p);
  return p;
}
function playClip(url, volume, { loop = false, rate = 1 } = {}) {
  if (!ctx || !unlocked) {   // no running context yet: a plain element (not wired into the graph, so it's collected when it ends)
    const el = new Audio(url); el.volume = Math.min(1, volume); el.loop = loop; el.play().catch(() => {}); return el;
  }
  const c = ctxNow();
  const gain = c.createGain(); gain.gain.value = volume; gain.connect(c.destination);
  let src = null;
  const handle = {
    paused: false, ended: false, _loop: loop,
    get loop() { return this._loop; }, set loop(v) { this._loop = v; if (src) src.loop = v; },
    pause() { if (this.paused || this.ended) return; this.paused = true; if (src) { try { src.stop(); } catch { /* not started */ } } else finish(); },
    play() { /* one-shot clips don't resume; here for element-compatibility */ },
  };
  const finish = () => { handle.ended = true; try { src?.disconnect(); gain.disconnect(); } catch { /* ignore */ } };
  const start = (buf) => {
    if (handle.paused) { finish(); return; }
    src = c.createBufferSource(); src.buffer = buf; src.loop = handle._loop; if (rate !== 1) src.playbackRate.value = rate;
    src.onended = finish;
    src.connect(gain); src.start();
  };
  const b = buffers.get(url);
  if (b && !b.then) start(b); else bufferFor(url).then(start, finish);
  return handle;
}

// ---------- background music + lobby room sound ----------
// Songs live in assets/music/song-N.mp3 (shuffled, no repeats back to back). The lobby also has a room-sound loop,
// assets/music/lobby-room.mp3 (crowd, chips, murmur), that only plays on the casino floor.
// Everything runs through WebAudio: element -> lowpass -> gain -> speakers. That gives us real volume control on
// iPhone (Safari ignores element.volume) and a muffle we can turn up at the tables, like walking away from the speaker.
const musicFiles = new Map();
const DUCK = 0.4;          // music level at a table, relative to the lobby
const TABLE_MUFFLE = 1400; // lowpass cutoff (Hz) at a table; 20000 = wide open in the lobby
const ROOM_LEVEL = 0.4;    // room sound relative to the music volume setting
const SONG_GAP = 3000;     // ms of quiet between songs
let playlist = [], queue = [], lastTrack = null;
const titles = new Map();  // file name -> { title, artist } from setlist.json
let track = null;          // { el, gain, filter }
let room = null;           // { el, gain }
let ducked = false;

function ctxNow() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// element -> (lowpass) -> gain -> out. Falls back to plain element volume if the graph can't be built.
function wire(el, { filtered = false } = {}) {
  const c = ctxNow();
  const gain = c.createGain(); gain.gain.value = 0;
  let filter = null;
  try {
    const src = c.createMediaElementSource(el);
    if (filtered) { filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 20000; filter.Q.value = 0.6; src.connect(filter).connect(gain); }
    else src.connect(gain);
    gain.connect(c.destination);
    el.volume = 1;
    return { el, gain, filter, graph: true };
  } catch { el.volume = 0; return { el, gain: null, filter: null, graph: false }; }
}
function rampGain(node, target, ms) {
  if (!node) return;
  if (node.gain) { const c = ctxNow(); node.gain.gain.cancelScheduledValues(c.currentTime); node.gain.gain.setValueAtTime(node.gain.gain.value, c.currentTime); node.gain.gain.linearRampToValueAtTime(target, c.currentTime + ms / 1000); }
  else { const el = node.el, start = el.volume, steps = Math.max(1, Math.round(ms / 50)); let i = 0; const t = setInterval(() => { i++; el.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps))); if (i >= steps) clearInterval(t); }, 50); }
}
function rampFilter(node, hz, ms) {
  if (!node?.filter) return;
  const c = ctxNow(); node.filter.frequency.cancelScheduledValues(c.currentTime); node.filter.frequency.setValueAtTime(node.filter.frequency.value, c.currentTime); node.filter.frequency.exponentialRampToValueAtTime(hz, c.currentTime + ms / 1000);
}
function stopNode(node, ms) {
  if (!node) return;
  rampGain(node, 0, ms);
  setTimeout(() => { try { node.el.pause(); node.el.removeAttribute('src'); node.el.load(); } catch { /* ignore */ } if (node.blobUrl) URL.revokeObjectURL(node.blobUrl); }, ms + 60);
}
// ---------- songs on the device (offline music, v165) ----------
// Every song is kept in its own cache ('casino-music', which the service worker never clears on updates) the first time
// it plays, and 'Save all songs' in Casino Radio fetches the rest. A saved song plays from a blob: URL made from the
// cached file, so it works with no connection (and no range-request tricks in the service worker). Offline, the
// shuffle only picks songs that are saved.
const MUSIC_CACHE = 'casino-music';
const savedSongs = new Set();   // song URLs present in the cache
const hasCaches = () => typeof caches !== 'undefined';
async function loadSavedList() {
  if (!hasCaches()) return;
  try { const c = await caches.open(MUSIC_CACHE); for (const req of await c.keys()) savedSongs.add(new URL(req.url).pathname.split('/').pop()); } catch { /* storage blocked */ }
}
const isSaved = (url) => savedSongs.has(url.split('/').pop());
async function saveSong(url) {
  if (!hasCaches() || isSaved(url)) return true;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok || res.status !== 200) return false;
    const c = await caches.open(MUSIC_CACHE);
    await c.put(url, res);
    savedSongs.add(url.split('/').pop());
    return true;
  } catch { return false; }
}
async function songSource(url) {
  if (hasCaches() && isSaved(url)) {
    try { const c = await caches.open(MUSIC_CACHE); const hit = await c.match(url); if (hit) { const blobUrl = URL.createObjectURL(await hit.blob()); return { src: blobUrl, blobUrl }; } } catch { /* fall through to the network */ }
  }
  return { src: url, blobUrl: null };
}
// the songs switched on in the Setlist editor (settings.setlistOff holds the file names that are off)
function activeList() {
  const off = new Set(bank.state?.settings?.setlistOff || []);
  const on = playlist.filter((u) => !off.has(u.split('/').pop()));
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { const saved = on.filter(isSaved); if (saved.length) return saved; }   // no connection: only what's on the device
  return on;
}
function nextTrack() {
  const active = activeList();
  if (!active.length) return null;
  if (!queue.length || queue.some((u) => !active.includes(u))) {   // reshuffle (or the setlist changed); don't repeat the song that just ended
    queue = active.slice();
    for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
    if (queue.length > 1 && queue[0] === lastTrack) queue.push(queue.shift());
  }
  return queue.shift();
}
const musicLevel = () => audio.musicVolume * (ducked ? DUCK : 1);
const roomLevel = () => audio.musicVolume * ROOM_LEVEL;
export const music = {
  async init() {
    // playlist: assets/music/song-1.mp3, song-2.mp3, ... (stops at the first missing number)
    const man = await manifest();
    if (man?.music) {
      for (const f of man.music) if (/^song-\d+\./.test(f)) playlist.push(assets.fileUrl(`music/${f}`));
    } else {
      for (let n = 1; n <= 60; n++) {
        let found = null;
        for (const ext of ['mp3', 'm4a']) { const url = assets.fileUrl(`music/song-${n}.${ext}`); if (await probeAudio(url)) { found = url; break; } }
        if (!found) break;
        playlist.push(found);
      }
    }
    if (playlist.length) musicFiles.set('lobby', playlist[0]);
    await loadSavedList();
    try { navigator.storage?.persist?.(); } catch { /* ask the browser not to clear saved songs when space runs low */ }
    // titles for the Setlist editor: assets/music/setlist.json = [{ file: 'song-1.mp3', title, artist }]
    try { const r = await fetch(assets.fileUrl('music/setlist.json'), { cache: 'no-cache' }); if (r.ok) for (const row of await r.json()) titles.set(row.file, row); } catch { /* no manifest: numbered songs */ }
    const roomUrl = assets.fileUrl('music/lobby-room.mp3');
    if (man?.music ? man.music.includes('lobby-room.mp3') : await probeAudio(roomUrl)) musicFiles.set('room', roomUrl);
    // iOS won't start audio until the first tap: retry anything that's meant to be playing on the next gesture
    const retry = () => { ctxNow(); if (track && track.el.paused && audio.musicEnabled && !this.userPaused) track.el.play().catch(() => {}); if (room && room.el.paused && this.roomWanted) room.el.play().catch(() => {}); };
    for (const ev of ['touchend', 'mousedown', 'keydown']) document.addEventListener(ev, retry, { passive: true });
  },
  get roomEnabled() { return bank.state?.settings?.roomSound !== false; },
  get roomWanted() { return !ducked && this.roomEnabled && audio.musicEnabled && musicFiles.has('room'); },
  has(key) { return musicFiles.has(key); },
  // every song the game found, for the Setlist editor
  get songs() { const off = new Set(bank.state?.settings?.setlistOff || []); return playlist.map((url, i) => { const file = url.split('/').pop(); const t = titles.get(file) || {}; return { url, file, title: t.title || `Song ${i + 1}`, artist: t.artist || '', on: !off.has(file), playing: !!track && track.file === file, saved: savedSongs.has(url) }; }); },
  // pause / resume for the Casino Radio widget (a pause keeps the song where it is; resume picks it back up)
  get paused() { return !!track && track.el.paused && this.userPaused; },
  get playing() { return !!track && !track.el.paused; },
  userPaused: false,
  // offline music: how many of the songs are on this device, and fetch the rest (onProgress(saved, total))
  get savedCount() { return playlist.filter(isSaved).length; },
  get songCount() { return playlist.length; },
  async saveAll(onProgress) {
    let failed = 0;
    for (const url of playlist) { if (!(await saveSong(url))) failed++; onProgress?.(this.savedCount, playlist.length); }
    return { saved: this.savedCount, total: playlist.length, failed };
  },
  toggle() {
    if (!audio.musicEnabled) return false;
    if (track && !track.el.paused) { this.userPaused = true; rampGain(track, 0, 250); const t = track; setTimeout(() => { if (track === t && this.userPaused) t.el.pause(); }, 280); return true; }
    if (track && track.el.paused) { this.userPaused = false; track.el.play().catch(() => {}); rampGain(track, musicLevel(), 400); return true; }
    this.userPaused = false; const k = this.key || 'lobby'; this.key = null; this.play(k); return true;
  },
  get nowPlaying() { if (!track) return null; const file = track.file; const t = titles.get(file) || {}; return t.title || file; },
  setSongOn(file, on) {
    const off = new Set(bank.state.settings.setlistOff || []);
    if (on) off.delete(file); else off.add(file);
    bank.setSetting('setlistOff', [...off]);
    queue = [];                                                          // rebuild the shuffle from the new list
    if (track && !on && track.file === file) this.skip();   // switched off the one that's playing: move on
    else if (!track && on && this.key) { const k = this.key; this.key = null; this.play(k); }   // the floor was quiet: start it up
  },
  // play this one now (from the Setlist editor)
  playSong(url) {
    if (!audio.musicEnabled) return false;
    const file = url.split('/').pop();
    const off = bank.state.settings.setlistOff || [];
    if (off.includes(file)) bank.setSetting('setlistOff', off.filter((f) => f !== file));   // playing it switches it back on
    const k = this.key || 'lobby';
    this.stop(250); this.key = null;
    queue = [url, ...activeList().filter((u) => u !== url).sort(() => Math.random() - 0.5)];
    this.play(k);
    return true;
  },
  debug() { return { track: track ? track.file + ' ' + (track.el.paused ? 'paused' : 'playing') + (track.filter ? ` lp ${Math.round(track.filter.frequency.value)}` : '') + ` gain ${track.gain?.gain.value.toFixed(2)}` : null, room: room ? (room.el.paused ? 'paused' : 'playing') + ` gain ${room.gain?.gain.value.toFixed(2)}` : null, ducked }; },
  key: null,
  play(key) {
    if (this.key === key && track && !track.el.paused) return;
    this.stop(300);
    this.key = key;
    if (!playlist.length || !audio.musicEnabled) return;
    const url = nextTrack(); if (!url) return;   // every song is switched off in the Setlist: the floor stays quiet (key stays set, so switching one on starts it)
    lastTrack = url;
    const el = new Audio(); el.preload = 'auto';
    const node = wire(el, { filtered: true });
    node.file = url.split('/').pop();
    if (node.filter) node.filter.frequency.value = ducked ? TABLE_MUFFLE : 20000;
    const next = () => { if (track !== node) return; track = null; const k = this.key; this.key = null; setTimeout(() => { if (!track && !this.key) this.play(k); }, SONG_GAP); };
    el.addEventListener('ended', next); // a little quiet between songs
    el.addEventListener('error', () => { if (!el.getAttribute('src')) return; if (track === node) { stopNode(node, 0); next(); } });   // not reachable (offline, not saved): move on
    track = node;
    songSource(url).then(({ src, blobUrl }) => {
      if (track !== node) { if (blobUrl) URL.revokeObjectURL(blobUrl); return; }
      node.blobUrl = blobUrl;
      el.src = src;
      el.play().catch(() => {}); // may be refused before the first tap; the gesture listener retries
      rampGain(node, musicLevel(), 1200);
      if (!blobUrl) saveSong(url);   // heard it once: keep it for next time
    });
    this.room();
  },
  // Quieter and muffled while a game is being played (like walking away from the speaker); the room sound stays in the lobby.
  duck(on) {
    ducked = on;
    if (track) { rampGain(track, musicLevel(), 900); rampFilter(track, on ? TABLE_MUFFLE : 20000, 900); }
    this.room();
  },
  // start or stop the lobby room-sound loop to match where we are and what's switched on
  room() {
    const want = this.roomWanted;
    if (want && !room) {
      const el = new Audio(musicFiles.get('room')); el.loop = true; el.preload = 'auto';
      room = wire(el);
      el.play().catch(() => {});
      rampGain(room, roomLevel(), 1500);
    } else if (!want && room) { const r = room; room = null; stopNode(r, 700); }
    else if (room) rampGain(room, roomLevel(), 300);
  },
  // Next song, please. Fades the current one out quickly and starts another straight away (no gap).
  skip() {
    if (!playlist.length || !audio.musicEnabled) return false;
    this.userPaused = false;
    const k = this.key || 'lobby';
    this.stop(250); this.key = null;
    this.play(k);
    return true;
  },
  stop(ms = 600) {
    this.key = null;
    const t = track; if (!t) return;
    track = null;
    stopNode(t, ms);
  },
  // settings changed: apply immediately
  refresh() {
    if (!audio.musicEnabled) { const k = this.key; this.stop(300); this.key = k; }
    else if (this.key && !track) { const k = this.key; this.key = null; this.play(k); }
    else if (track) rampGain(track, musicLevel(), 200);
    this.room();
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
  o.connect(g).connect(bus(ctx));
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
  s.connect(f).connect(g).connect(bus(ctx));
  s.start(ctx.currentTime + at);
}
const synth = {
  tap: (c) => tone(c, { f: 900, t: 0.03, type: 'square', vol: 0.05 }),
  chip: (c) => tone(c, { f: 2400, t: 0.05, vol: 0.08 }),
  count: (c) => tone(c, { f: 1318, t: 0.18, vol: 0.2 }),   // the cribbage count ping (count.mp3 is a brighter rendered version)
  chips: (c) => { for (let i = 0; i < 4; i++) tone(c, { f: 2200 + i * 150, t: 0.05, vol: 0.07, at: i * 0.05 }); },
  deal: (c) => noise(c, { t: 0.07, vol: 0.12, hp: 1500 }),
  flip: (c) => { noise(c, { t: 0.05, vol: 0.1, hp: 2000 }); tone(c, { f: 600, t: 0.05, vol: 0.04, slide: 300 }); },
  check: (c) => { tone(c, { f: 180, t: 0.05, type: 'triangle', vol: 0.25 }); tone(c, { f: 160, t: 0.05, type: 'triangle', vol: 0.2, at: 0.09 }); },
  call: (c) => synth.chip(c),
  raise: (c) => synth.chips(c),
  fold: (c) => synth.tap(c),
  win: (c) => [523, 659, 784].forEach((f, i) => tone(c, { f, t: 0.15, at: i * 0.08, vol: 0.12 })),
  bigwin: (c) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(c, { f, t: 0.2, at: i * 0.1, vol: 0.14 })),
  lose: (c) => tone(c, { f: 220, t: 0.35, type: 'sawtooth', vol: 0.05, slide: -120 }),
  allin: (c) => { noise(c, { t: 0.25, vol: 0.2, hp: 1500 }); [330, 392].forEach((f, i) => tone(c, { f, t: 0.2, at: i * 0.12, vol: 0.1, type: 'triangle' })); },
  tierup: (c) => [392, 523, 659, 784, 1047].forEach((f, i) => tone(c, { f, t: 0.35, at: i * 0.12, vol: 0.12, type: 'triangle' })),
  tierdown: (c) => { [466, 415, 370].forEach((f, i) => tone(c, { f, t: 0.42, at: i * 0.3, vol: 0.1, type: 'triangle' })); tone(c, { f: 311, t: 1.2, at: 0.9, vol: 0.11, type: 'triangle', slide: -40 }); tone(c, { f: 155, t: 1.3, at: 0.9, vol: 0.05, type: 'sine', slide: -20 }); },   // the sad trombone: three steps down and a long droop
  bailout: (c) => [262, 247, 233, 220].forEach((f, i) => tone(c, { f, t: 0.25, at: i * 0.15, vol: 0.1, type: 'square' })),
  shuffle: (c) => { for (let i = 0; i < 8; i++) noise(c, { t: 0.03, vol: 0.06, hp: 2500, at: i * 0.04 }); },
  yourturn: (c) => synth.tap(c),
  dice: (c) => { for (let i = 0; i < 6; i++) noise(c, { t: 0.04, vol: 0.12, hp: 1200, at: i * 0.06 + Math.random() * 0.02 }); },
  slotspin: (c) => { for (let i = 0; i < 24; i++) tone(c, { f: 500 + (i % 3) * 40, t: 0.03, type: 'square', vol: 0.04, at: 0.9 + i * 0.12 }); },
  slotstop: (c) => synth.tap(c),
  slotreels: () => {},
  slotsmall: (c) => synth.chips(c),
  slotjackpot: (c) => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(c, { f, t: 0.25, at: i * 0.12, vol: 0.14 })),
};
// the placeholder recipes, exported so tools/render_synth.mjs can bounce them to files for listening
export const SYNTH = synth;
