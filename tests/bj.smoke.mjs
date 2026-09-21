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

await page.click('button.hotspot[data-game="blackjack"], .door:has-text("Blackjack")');
await page.waitForSelector('.select-screen');
await page.screenshot({ path: 'tests/shots/bj-select.png' });
await page.click('.table-tile:not(.locked)');
await page.waitForSelector('.cast-grid');
await page.click('.modal button:has-text("Sit down")');
await page.waitForSelector('.table-screen.bj');

let rounds = 0, actions = 0, doubles = 0, splits = 0, insuranceAsks = 0, leaveClicked = false;
const seen = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 180000) {
  if (await page.$('.lobby')) break;
  const betting = await page.$('.actionbar.betting:not(.hidden)');
  if (betting) {
    if (rounds >= ROUNDS) { if (!leaveClicked) { await page.click('text=Leave table'); leaveClicked = true; } await page.waitForTimeout(200); continue; }
    // tap a couple of chips, then deal
    const chips = await betting.$$('.rack-chip');
    await chips[0].click();
    if (Math.random() < 0.5 && chips[1]) await chips[1].click();
    if (rounds === 0) await page.screenshot({ path: 'tests/shots/bj-bet.png' });
    await betting.$eval('button.act.raise', (b) => b.click());
    rounds++;
    continue;
  }
  const bar = await page.$('.actionbar:not(.hidden)');
  if (bar) {
    const buttons = await bar.$$('button.act:not([disabled])');
    const labels = await Promise.all(buttons.map((b) => b.innerText()));
    if (await bar.$('.ins-label')) { insuranceAsks++; await buttons[Math.floor(Math.random() * buttons.length)].click(); continue; }
    if (!seen.has('play')) { seen.add('play'); await page.screenshot({ path: 'tests/shots/bj-table.png' }); }
    // prefer split, then double, otherwise hit under 17 (read own total), else stand
    let pick = labels.indexOf('Split');
    if (pick < 0) pick = labels.indexOf('Double');
    if (pick < 0) {
      const total = await page.$eval('.bj-seat.human .bj-hand.active .bj-hand-total, .bj-seat.human .bj-hand .bj-hand-total', (e) => e.textContent).catch(() => '0');
      const hard = +String(total).split('/').pop();
      pick = hard < 17 ? labels.indexOf('Hit') : labels.indexOf('Stand');
    }
    if (pick < 0) pick = 0;
    if (labels[pick] === 'Double') doubles++;
    if (labels[pick] === 'Split') { splits++; }
    await buttons[pick].click();
    actions++;
    if (labels[pick] === 'Split' && !seen.has('split')) { seen.add('split'); await page.waitForTimeout(600); await page.screenshot({ path: 'tests/shots/bj-split.png' }); }
    continue;
  }
  if (!seen.has('win') && await page.$('.win-banner.show')) { seen.add('win'); await page.screenshot({ path: 'tests/shots/bj-win.png' }); }
  if (!seen.has('tag') && await page.$('.bj-seat.human .bj-hand-tag.show')) { seen.add('tag'); await page.screenshot({ path: 'tests/shots/bj-result.png' }); }
  const tierBtn = await page.$('.tier-change button');
  if (tierBtn) { await tierBtn.click(); continue; }
  const rebuy = await page.$('text=Rebuy');
  if (rebuy) { await rebuy.click(); continue; }
  const lobbyBtn = await page.$('text=Back to the lobby');
  if (lobbyBtn) { await lobbyBtn.click(); break; }
  await page.waitForTimeout(120);
}
await page.waitForSelector('.lobby', { timeout: 30000 });
// settings from the lobby must not print 'null' anywhere
await page.click('text=Settings'); await page.waitForSelector('.modal');
const settingsTxt = await page.$eval('.modal', (e) => e.innerText);
if (/\bnull\b/.test(settingsTxt)) { console.error('settings shows null:\n' + settingsTxt); process.exit(1); }
await page.keyboard.press('Escape');
const bankTxt = await page.$eval('.lobby .bank-balance .amount', (e) => e.textContent);
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')));
await browser.close();
server.close();
console.log(`blackjack: ${rounds} rounds, ${actions} actions (${doubles} doubles, ${splits} splits, ${insuranceAsks} insurance prompts); bank now ${bankTxt}; atTable=${JSON.stringify(save.atTable)}`);
if (rounds < ROUNDS) { console.error('did not finish the rounds'); process.exit(1); }
if (save.atTable) { console.error('still marked as at a table after leaving'); process.exit(1); }
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('no page errors');
