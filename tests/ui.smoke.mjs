// Headless browser smoke test: boot, name, lobby, sit at a table, play hands by tapping buttons, leave, bank.
// Usage: node tests/ui.smoke.mjs [hands]   (starts its own static server)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const HANDS = +process.argv[2] || 6;
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
await page.waitForSelector('#splash.can-skip', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); // skip the intro video
await page.waitForSelector('input[placeholder*="call you"]', { timeout: 10000 });
await page.fill('input[placeholder*="call you"]', 'Nic');
await page.click('text=Let\'s play');
await page.waitForSelector('.lobby');
await page.screenshot({ path: 'tests/shots/lobby.png' });

await page.click('.door:not(.closed), .hotspot:not(.closed):not([style*="left: 44%"])');
await page.waitForSelector('.select-screen');
await page.screenshot({ path: 'tests/shots/select.png' });
await page.click('.table-tile:not(.locked)');
await page.waitForSelector('.cast-grid');
await page.screenshot({ path: 'tests/shots/buyin.png' });
await page.click('.modal button:has-text("Sit down")');
await page.waitForSelector('.felt');

// play: whenever the action bar shows, choose an action; prefer check/call, sometimes raise
let hands = 0, acted = 0, raises = 0;
const t0 = Date.now();
let leaveClicked = false;
while (Date.now() - t0 < 240000) {
  if (hands >= HANDS && !leaveClicked && await page.$('.felt')) { await page.click('text=Leave table'); leaveClicked = true; }
  if (await page.$('.lobby')) break;
  const leaveNow = await page.$('.overlay.open .modal button:has-text("Leave now")');
  if (leaveNow) { await leaveNow.click(); await page.waitForTimeout(300); continue; }
  const bar = await page.$('.actionbar:not(.hidden)');
  if (bar) {
    const buttons = await bar.$$('button.act');
    const labels = await Promise.all(buttons.map((b) => b.innerText()));
    let pick = labels.findIndex((l) => /^Check|^Call|^All in/.test(l));
    if (Math.random() < 0.25) { const r = labels.findIndex((l) => /^Raise|^Bet/.test(l)); if (r >= 0) pick = r; }
    if (pick < 0) pick = 0;
    if (acted === 1) await page.screenshot({ path: 'tests/shots/table.png' });
    await buttons[pick].click();
    acted++;
    // raise panel?
    const confirm = await page.waitForSelector('.raise-panel', { timeout: 400 }).catch(() => null);
    if (confirm) {
      const pres = await page.$$('.pre');
      await pres[Math.floor(Math.random() * 3)].click();
      if (raises === 0) await page.screenshot({ path: 'tests/shots/raise.png' });
      await page.click('.actionbar button.act.raise');
      raises++;
    }
    continue;
  }
  if (!globalThis.winShot && await page.$('.win-banner.show')) { globalThis.winShot = true; await page.screenshot({ path: 'tests/shots/win.png' }); }
  if (!globalThis.shownShot && await page.$('.betspot .shown')) { globalThis.shownShot = true; await page.screenshot({ path: 'tests/shots/reveal.png' }); }
  const next = await page.$('.nextbar:not(.hidden) button');
  if (next) { hands++; if (hands === 2) await page.screenshot({ path: 'tests/shots/showdown.png' }); await next.click(); await page.waitForTimeout(300); continue; }
  const tierBtn = await page.$('.tier-change button');
  if (tierBtn) { await tierBtn.click(); continue; }
  const rebuy = await page.$('text=Rebuy');
  if (rebuy) { await page.screenshot({ path: 'tests/shots/bust.png' }); await rebuy.click(); continue; }
  const lobbyBtn = await page.$('text=Back to the lobby');
  if (lobbyBtn) { await lobbyBtn.click(); break; }
  await page.waitForTimeout(150);
}
await page.waitForSelector('.lobby', { timeout: 60000 });
const stackTxt = 'see transactions';
await page.click('.lobby .bankcard');
await page.waitForSelector('.txlist');
await page.screenshot({ path: 'tests/shots/bank.png' });
const bankTxt = await page.$eval('.bank-info .big', (e) => e.textContent);
const txs = await page.$$eval('.tx', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
// ---- Ken: go broke, ask for money ----
await page.keyboard.press('Escape');
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.bank = 0; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await page.reload();
await page.waitForSelector('.lobby');
await page.click('text=Ask Ken for money');
await page.waitForSelector('.ken-scene');
await page.click('.modal button:has-text("Ask Ken for money")');
await page.waitForTimeout(2200);
await page.screenshot({ path: 'tests/shots/ken.png' });
await page.waitForSelector('.lobby .bank-balance .amount', { timeout: 8000 });
await page.waitForFunction(() => document.querySelector('.lobby .bank-balance .amount')?.textContent === '$1,000', null, { timeout: 8000 });
const afterKen = await page.$eval('.lobby .bank-balance .amount', (e) => e.textContent);
// ---- tier upgrade on cash-out: fake a fat stack sitting at a table, reload restores it ----
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.atTable = { tableId: 'nl-1-2', stack: 30000, opponents: [] }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await page.reload();
await page.waitForSelector('.lobby');
const tierTxt = await page.$eval('.lobby .ccard', (e) => e.className);
await page.click('text=Settings');
await page.waitForSelector('.modal');
await page.screenshot({ path: 'tests/shots/settings.png' });
await browser.close();
server.close();
console.log(`after Ken: ${afterKen}; card class after $30k restore: ${tierTxt}`);
if (afterKen !== '$1,000') { console.error('Ken did not pay out'); process.exit(1); }
if (!/tier-4/.test(tierTxt)) { console.error('expected Platinum after restore'); process.exit(1); }

console.log(`played ${hands} hands, ${acted} actions (${raises} raises); stack at leave ${stackTxt}; bank now ${bankTxt}`);
console.log('transactions:', txs.slice(0, 3));
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('no page errors');
