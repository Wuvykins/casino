// Headless smoke test for a Sit & Go: lobby → hold'em → tournament tile → 2 opponents → play to a finish (all-in a lot to
// make it quick) → the result modal → back in the lobby with the bank changed by exactly -entry (+prize).
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
const enter = async () => { await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {}); };
await page.goto(url); await enter();
await page.waitForSelector('input[placeholder*="call you"]', { timeout: 10000 }); await page.fill('input[placeholder*="call you"]', 'Nic'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.settings = { ...(s.settings || {}), aiSpeed: 3, sound: false, music: false }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await page.reload(); await enter(); await page.waitForSelector('.lobby');
const bank0 = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')).bank);
await page.click('button.hotspot[data-game="holdem"]'); await page.waitForSelector('.select-screen');
await page.screenshot({ path: 'tests/shots/sng-select.png' });
await page.click('.table-tile:has-text("Sit & Go $200")'); await page.waitForSelector('.modal button:has-text("Sit down")');
// exactly two opponents
for (let i = 0; i < 6; i++) { const on = await page.$('.cast-tile.on'); if (!on) break; await on.click(); await page.waitForTimeout(80); }   // the grid re-renders on every tap
await page.click('.cast-tile:nth-child(1)'); await page.waitForTimeout(80); await page.click('.cast-tile:nth-child(2)'); await page.waitForTimeout(80);
await page.screenshot({ path: 'tests/shots/sng-sit.png' });
await page.click('.modal button:has-text("Sit down")'); await page.waitForSelector('.felt'); await page.waitForTimeout(600);
await page.screenshot({ path: 'tests/shots/sng-table.png' });
let hands = 0, acted = 0, result = null; const t0 = Date.now(); let shotLevel = false;
while (Date.now() - t0 < 300000) {
  if (await page.$('.lobby')) break;
  const champ = await page.$('.champ.open');
  if (champ) {   // won it: the ceremony runs about six seconds, then Collect
    result = 'champion';
    await page.waitForTimeout(1200); await page.screenshot({ path: 'tests/shots/sng-champ-1.png' });
    await page.waitForTimeout(1500); await page.screenshot({ path: 'tests/shots/sng-champ-2.png' });
    await page.waitForTimeout(3000); await page.screenshot({ path: 'tests/shots/sng-champ-3.png' });
    await page.click('.champ-collect'); await page.waitForTimeout(400); continue;
  }
  const res = await page.$('.tourney-result');
  if (res) { result = await res.$eval('h2', (e) => e.textContent); await page.screenshot({ path: 'tests/shots/sng-result.png' }); await page.click('.tourney-result button'); await page.waitForTimeout(400); continue; }
  const tierBtn = await page.$('.tier-change button'); if (tierBtn) { await tierBtn.click(); continue; }
  const bar = await page.$('.actionbar:not(.hidden)');
  if (bar) {
    const buttons = await bar.$$('button.act'); const labels = await Promise.all(buttons.map((b) => b.innerText()));
    // shove often so the tournament ends inside the time limit
    let pick = labels.findIndex((l) => /^Raise|^Bet|^All in/.test(l)); if (pick < 0 || Math.random() < 0.3) pick = labels.findIndex((l) => /^Check|^Call|^All in/.test(l)); if (pick < 0) pick = 0;
    await buttons[pick].click().catch(() => {}); acted++;
    const confirm = await page.waitForSelector('.raise-panel', { timeout: 400 }).catch(() => null);
    if (confirm) { const pres = await page.$$('.pre'); await pres[pres.length - 1].click(); await page.click('.actionbar button.act.raise'); }
    continue;
  }
  const next = await page.$('.nextbar:not(.hidden) button');
  if (next) { hands++; if (!shotLevel && hands === 9) { shotLevel = true; await page.screenshot({ path: 'tests/shots/sng-level.png' }); } await next.click(); await page.waitForTimeout(200); continue; }
  await page.waitForTimeout(120);
}
const bank1 = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')).bank);
const tx = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')).transactions.slice(0, 3));
console.log(`sng: ${hands} hands, ${acted} actions, result "${result}", bank ${bank0} -> ${bank1}`, JSON.stringify(tx));
const delta = bank1 - bank0;
if (![-200, 200, 600].includes(delta)) errors.push('unexpected bank delta ' + delta);
if (!result) errors.push('no tournament result modal');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close(); server.close();
