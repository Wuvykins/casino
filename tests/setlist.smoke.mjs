// Headless smoke test for the Setlist editor: lobby → Settings → Setlist → 25 songs listed, toggle one off, play-now, leave all off → quiet.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {});
await page.waitForSelector('input[placeholder*="call you"]', { timeout: 10000 });
await page.fill('input[placeholder*="call you"]', 'Nic'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
await page.waitForTimeout(1500);
await page.click('.lobby button:has-text("Settings")'); await page.waitForSelector('.modal');
await page.click('.modal button:has-text("Setlist")'); await page.waitForSelector('.setlist-row');
const rows = await page.$$eval('.setlist-row', (r) => r.length);
const titles = await page.$$eval('.setlist-title', (r) => r.slice(12, 16).map((x) => x.textContent));
console.log('setlist rows:', rows, titles);
await page.screenshot({ path: 'tests/shots/setlist.png' });
await page.click('.setlist-row:nth-child(14) input'); await page.waitForTimeout(500);
const off = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')).settings.setlistOff);
console.log('off after one toggle:', JSON.stringify(off));
await page.click('.setlist-row:nth-child(16) .setlist-play'); await page.waitForTimeout(700);
const now = await page.$eval('.setlist-now', (e) => e.textContent);
console.log('now:', now);
const playing = await page.$eval('.setlist-row.playing .setlist-title', (e) => e.textContent).catch(() => null);
console.log('playing row:', playing);
// switch everything off
for (let i = 1; i <= rows; i++) { const on = await page.$eval(`.setlist-row:nth-child(${i}) input`, (e) => e.checked); if (on) await page.click(`.setlist-row:nth-child(${i}) input`); }
await page.waitForTimeout(800);
console.log('all off:', await page.$eval('.setlist-now', (e) => e.textContent), '| debug:', JSON.stringify(await page.evaluate(async () => (await import('/js/core/audio.js')).music.debug())));
await page.click('.setlist-row:nth-child(20) input'); await page.waitForTimeout(800);
console.log('one back on:', await page.$eval('.setlist-now', (e) => e.textContent));
await page.screenshot({ path: 'tests/shots/setlist-2.png' });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close(); server.close();
