// Every game: sit down, get into the middle of a hand/game, hit Leave table -> Leave now, land in the lobby with the right money.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r)); const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url); await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.click('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.click('#splash')).catch(() => {}); await page.waitForSelector('input[placeholder*="call you"]'); await page.fill('input[placeholder*="call you"]', 'Nic'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
const bankOf = async () => +(await page.$eval('.lobby .bank-balance .amount', (e) => e.textContent)).replace(/[^0-9]/g, '');
const results = [];
for (const [game, ready] of [["Texas Hold'em", '.actionbar:not(.hidden) button.act'], ['Blackjack', '.actionbar:not(.hidden) button.act'], ['Cribbage', '.cb-hand .pcard'], ['Farkle', '.actionbar:not(.hidden) button.act']]) {
  const before = await bankOf();
  await page.click(`button.hotspot[title="${game}"]`); await page.waitForSelector('.select-screen');
  await page.click('.table-tile:not(.locked)'); await page.waitForSelector('.cast-grid'); await page.click('.modal button:has-text("Sit down")');
  await page.waitForSelector('.table-screen');
  if (game === 'Blackjack') { await page.waitForSelector('.actionbar.betting:not(.hidden)'); await page.click('.rack-chip'); await page.$eval('button.act.raise', (b) => b.click()); await page.waitForSelector('.actionbar:not(.hidden):not(.betting) button.act, .bj-msg:has-text("Place your bet")', { timeout: 20000 }); }
  else if (game === 'Farkle') { await page.waitForSelector('.actionbar:not(.hidden) button.act:has-text("Roll")', { timeout: 30000 }); await page.click('.actionbar:not(.hidden) button.act:has-text("Roll")'); await page.waitForTimeout(1500); }
  else if (game === 'Cribbage') { await page.waitForSelector('.cb-deal-mid.show', { timeout: 20000 }); await page.click('.cb-deal-mid.show'); await page.waitForSelector(ready, { timeout: 20000 }); }   // the Deal sits mid-felt on the painted table
  else await page.waitForSelector(ready, { timeout: 30000 });
  await page.click('text=Leave table');
  await page.waitForSelector('.modal button:has-text("Leave now")', { timeout: 5000 });
  const note = await page.$eval('.modal', (e) => e.innerText.replace(/\s+/g, ' '));
  await page.click('.modal button:has-text("Leave now")');
  await page.waitForSelector('.lobby', { timeout: 15000 });
  const after = await bankOf();
  results.push(`${game}: ${before} -> ${after} | ${note.slice(0, 110)}`);
}
await browser.close(); server.close();
console.log(results.join('\n'));
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('no page errors');
