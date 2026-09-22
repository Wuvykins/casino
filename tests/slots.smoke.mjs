// Headless browser smoke test for blackjack: lobby → blackjack → bet → play rounds by tapping → leave.
// Usage: node tests/bj.smoke.mjs [rounds]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const ROUNDS = +process.argv[2] || 8;
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
await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {}); // skip the intro video
await page.waitForSelector('input[placeholder*="call you"]', { timeout: 10000 });
await page.fill('input[placeholder*="call you"]', 'Nic');
await page.click("text=Let's play");
await page.waitForSelector('.lobby');
// speed the AI up
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.settings = { ...(s.settings || {}), aiSpeed: 3 }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await page.reload(); await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {});
await page.waitForSelector('.lobby');
// slots: lobby → slots → sit → a few spins (one forced win, one forced jackpot) → leave
await page.click('button.hotspot[data-game="slots"]'); await page.waitForSelector('.select-screen');
await page.screenshot({ path: 'tests/shots/slots-select.png' });
await page.click('.table-tile:not(.locked)'); await page.waitForSelector('.modal button:has-text("Sit down")');
await page.click('.modal button:has-text("Sit down")'); await page.waitForSelector('.slots-canvas'); await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/shots/slots-idle.png' });
await page.click('.slot-hit.more'); await page.click('.slot-hit.more');
await page.click('.slot-hit.paytable'); await page.waitForSelector('.modal'); await page.screenshot({ path: 'tests/shots/slots-paytable.png' }); await page.click('.modal button:has-text("Rock on")'); await page.waitForTimeout(400);
await page.click('.slot-hit.handle'); await page.waitForTimeout(2000); await page.screenshot({ path: 'tests/shots/slots-spinning.png' });
await page.waitForTimeout(3800); await page.screenshot({ path: 'tests/shots/slots-result.png' });
// STOP: press the button three times mid-spin; all reels should be in and the result shown well before the 3.9 s schedule
await page.click('.slot-hit.handle'); await page.waitForTimeout(1300); await page.screenshot({ path: 'tests/shots/slots-stop.png' });
for (let i = 0; i < 3; i++) { await page.click('.slot-hit.spin'); await page.waitForTimeout(250); }
await page.waitForTimeout(1300); await page.screenshot({ path: 'tests/shots/slots-stopped.png' });
const early = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')).stats?.hands ?? null);
await page.waitForTimeout(1500);
// force a jackpot by rigging the rng-free path: monkeypatch the machine
await page.evaluate(async () => { const mod = await import('/js/core/slots.js'); const t = document.querySelector('.slots'); window.__forceJack = true; });
const forced = await page.evaluate(async () => {
  // reach the live table through the app: find the SlotsTable via a DOM-attached reference is not available, so patch Machine.prototype.spin
  const mod = await import('/js/core/slots.js');
  const orig = mod.Machine.prototype.spin;
  mod.Machine.prototype.spin = function (bet) { const stops = mod.STRIPS.map((s) => s.indexOf(0)); mod.Machine.prototype.spin = orig; return { stops, bet, ...mod.evaluateStops(stops, bet) }; };
  return true;
});
await page.click('.slot-hit.handle'); await page.waitForTimeout(4600); await page.screenshot({ path: 'tests/shots/slots-jackpot.png' });
await page.waitForSelector('.rb.in', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(600); await page.screenshot({ path: 'tests/shots/slots-jackpot-banner.png' });
await page.waitForTimeout(4500);
const bal = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')).atTable);
console.log('at table after spins:', JSON.stringify(bal));
await page.click('.slots .leave-btn'); await page.waitForTimeout(800); const tier = await page.$('.tier-change button'); if (tier) { await page.screenshot({ path: 'tests/shots/slots-tier.png' }); await tier.click(); } await page.waitForSelector('.lobby', { timeout: 10000 });
const bank = await page.$eval('.lobby .bank-balance .amount', (e) => e.textContent);
console.log('slots: back in the lobby, bank', bank);
console.log(errors.length ? errors : 'no page errors');
await browser.close(); server.close();
