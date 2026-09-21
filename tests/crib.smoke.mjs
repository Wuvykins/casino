// Headless browser smoke test for cribbage: lobby → cribbage → play whole games by tapping → leave.
// Usage: node tests/crib.smoke.mjs [games]
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
await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {}); // skip the intro video
await page.waitForSelector('input[placeholder*="call you"]', { timeout: 10000 });
await page.fill('input[placeholder*="call you"]', 'Nic');
await page.click("text=Let's play");
await page.waitForSelector('.lobby');
// speed the AI up
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.settings = { ...(s.settings || {}), aiSpeed: 3 }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await page.reload(); await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {});
await page.waitForSelector('.lobby');

await page.click('button.hotspot[data-game="cribbage"], .door:has-text("Cribbage")');
await page.waitForSelector('.select-screen');
await page.click('.table-tile:not(.locked)');
await page.waitForSelector('.cast-grid');
await page.click('.modal button:has-text("Sit down")');
await page.waitForSelector('.table-screen.crib');

const GAMES = +process.argv[2] || 1;
let games = 0, plays = 0, discards = 0, shows = 0, leaveClicked = false;
const seen = new Set();
const shot = async (k) => { if (!seen.has(k)) { seen.add(k); await page.screenshot({ path: `tests/shots/crib-${k}.png` }); } };
const t0 = Date.now();
while (Date.now() - t0 < 420000) {
  if (await page.$('.lobby')) break;
  const again = await page.$('.modal button:has-text("Play again")');
  if (again) { games++; await shot('gameover'); if (games >= GAMES) { await page.click('.modal button:has-text("Leave table")'); leaveClicked = true; } else await again.click(); continue; }
  const bar = await page.$('.actionbar:not(.hidden) button.act:not([disabled])');
  if (bar) {
    const label = await bar.innerText();
    if (/Pick/.test(label)) { /* need to select cards first */ }
    else {
      if (/Send/.test(label)) { discards++; await shot('discard'); }
      if (/Next|Done/.test(label)) { shows++; await shot('show'); }
      if (/Deal/.test(label) && games === 0 && discards === 0) await shot('start');
      await bar.click(); await page.waitForTimeout(150); continue;
    }
  }
  // discard: pick two cards
  const pick = await page.$('.actionbar:not(.hidden) button.act:has-text("Pick")');
  if (pick) {
    const cards = await page.$$('.cb-hand .pcard:not(.sel)');
    if (cards.length) { await cards[Math.floor(Math.random() * cards.length)].click(); await page.waitForTimeout(120); }
    continue;
  }
  // pegging: our turn when our nameplate glows and there are playable cards
  if (await page.$('.nameplate.you.acting')) {
    const playable = await page.$$('.cb-hand .pcard:not(.dim)');
    if (playable.length) { await shot('pegging'); await playable[Math.floor(Math.random() * playable.length)].click(); plays++; await page.waitForTimeout(150); continue; }
  }
  const tierBtn = await page.$('.tier-change button');
  if (tierBtn) { await tierBtn.click(); continue; }
  const rebuy = await page.$('text=Rebuy');
  if (rebuy) { await rebuy.click(); continue; }
  const lobbyBtn = await page.$('text=Back to the lobby');
  if (lobbyBtn) { await lobbyBtn.click(); break; }
  await page.waitForTimeout(120);
}
await page.waitForSelector('.lobby', { timeout: 30000 });
const bankTxt = await page.$eval('.lobby .bank-balance .amount', (e) => e.textContent);
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')));
await browser.close();
server.close();
console.log(`cribbage: ${games} games, ${discards} discards, ${plays} pegging plays, ${shows} counts; bank now ${bankTxt}; atTable=${JSON.stringify(save.atTable)}`);
if (games < GAMES) { console.error('did not finish a game'); process.exit(1); }
if (save.atTable) { console.error('still marked as at a table after leaving'); process.exit(1); }
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('no page errors');
