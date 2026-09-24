// Bounce the synthesized placeholder effects to WAV files so they can be listened to outside the game:
//   node tools/render_synth.mjs out-dir [key ...]      (default: every key in SYNTH that has no assets/sfx file)
// Renders through a headless Chromium OfflineAudioContext with the game's own recipes (js/core/audio.js SYNTH).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const out = process.argv[2] || 'synth-out'; fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const ext = path.extname(p); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' }[ext] || 'application/octet-stream' }); if (req.method === 'HEAD') return res.end(); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'commit' }); await page.waitForTimeout(500);
const keys = process.argv.slice(3);
const files = await page.evaluate(async (keys) => {
  const { SYNTH, SFX } = await import('/js/core/audio.js');
  const want = keys.length ? keys : Object.keys(SYNTH);
  const res = {};
  for (const k of want) {
    const c = new OfflineAudioContext(1, 44100 * 3, 44100);
    try { SYNTH[k](c, {}); } catch (e) { res[k] = 'error ' + e.message; continue; }
    const buf = await c.startRendering();
    const d = buf.getChannelData(0); let last = d.length - 1; while (last > 0 && Math.abs(d[last]) < 1e-4) last--;
    const n = Math.min(d.length, last + 4410);
    const wav = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
    w(0, 'RIFF'); wav.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, 44100, true); wav.setUint32(28, 88200, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    const u8 = new Uint8Array(wav.buffer); let str = ''; for (let i = 0; i < u8.length; i += 8192) str += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); res[k] = btoa(str);
  }
  return res;
}, keys);
for (const [k, b64] of Object.entries(files)) { if (b64.startsWith('error')) { console.log(k, b64); continue; } fs.writeFileSync(path.join(out, k + '.wav'), Buffer.from(b64, 'base64')); console.log('wrote', k); }
await browser.close(); server.close();
