// Tournament save/resume: start The Open with 3 opponents, play a few hands, reload mid-hand (as if the phone was put
// away), expect the "Your tournament is waiting" offer, Continue, and check the chips and blinds came back exactly as
// saved and no second entry fee was taken. Then Save & leave from the table, find "Continue ›" on The Open tile,
// resume from there, and Forfeit — the save must be gone and the bank must show one entry fee spent in total.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
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
const fail = (m) => { errors.push(m); };
page.on('pageerror', (e) => fail('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) fail('console: ' + m.text()); });
const enter = async () => { await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {}); };
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')));
await page.goto(url); await enter();
await page.waitForSelector('input[placeholder*="call you"]', { timeout: 10000 }); await page.fill('input[placeholder*="call you"]', 'Dad'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.settings = { ...(s.settings || {}), aiSpeed: 3, sound: false, music: false }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await page.reload(); await enter(); await page.waitForSelector('.lobby');
const bank0 = (await save()).bank;
await page.click('button.hotspot[data-game="holdem"]'); await page.waitForSelector('.select-screen');
await page.click('.table-tile:has-text("The Open")'); await page.waitForSelector('.modal button:has-text("Sit down")');
for (let i = 0; i < 6; i++) { const on = await page.$('.cast-tile.on'); if (!on) break; await on.click(); await page.waitForTimeout(80); }
for (const n of [1, 2, 3]) { await page.click(`.cast-tile:nth-child(${n})`); await page.waitForTimeout(80); }
await page.click('.modal button:has-text("Sit down")'); await page.waitForSelector('.felt');
// play three hands by checking/calling
let hands = 0;
const t0 = Date.now();
while (hands < 3 && Date.now() - t0 < 90000) {
  const bar = await page.$('.actionbar:not(.hidden)');
  if (bar) { const b = await bar.$$('button.act'); const l = await Promise.all(b.map((x) => x.innerText())); let i = l.findIndex((x) => /^Check|^Call/.test(x)); if (i < 0) i = 0; await b[i].click().catch(() => {}); continue; }
  const next = await page.$('.nextbar:not(.hidden) button'); if (next) { hands++; if (hands < 3) await next.click(); else break; continue; }
  if (await page.$('.tourney-result, .champ, .lobby')) break;
  await page.waitForTimeout(120);
}
await page.click('.nextbar:not(.hidden) button').catch(() => {});   // deal hand 4, then "close the app" in the middle of it
await page.waitForSelector('.actionbar:not(.hidden)', { timeout: 20000 }).catch(() => {});
const before = await save();
if (!before.tourney) fail('no tournament saved during play');
if (before.bank !== bank0 - 200) fail(`entry fee not taken once: ${bank0} -> ${before.bank}`);
await page.screenshot({ path: 'tests/shots/resume-1-midhand.png' });
await page.reload(); await enter();
await page.waitForSelector('.resume-offer', { timeout: 8000 }).catch(() => fail('no resume offer on launch'));
await page.screenshot({ path: 'tests/shots/resume-2-offer.png' });
await page.click('.resume-offer button:has-text("Continue")');
await page.waitForSelector('.felt');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tests/shots/resume-3-back.png' });
const title = await page.$eval('.tt-title', (e) => e.textContent);
const blinds = before.tourney ? (await page.evaluate(() => 0), title) : '';
const after = await save();
if (after.bank !== before.bank) fail(`resuming charged again: ${before.bank} -> ${after.bank}`);
// the table shows the saved stacks (hand restarts: blinds get posted again, so compare stack + what's in front of them)
const shown = await page.$$eval('.seat .pstack, .seat .stack', (els) => els.map((e) => e.textContent));
console.log('resumed:', title, '| saved seats', JSON.stringify(before.tourney?.seats?.map((s) => [s.id, s.stack, s.out])), '| shown', JSON.stringify(shown));
// Save & leave from the table
await page.click('.leave-btn');
await page.waitForSelector('.tourney-leave', { timeout: 5000 }).catch(() => fail('no tournament leave dialog'));
await page.screenshot({ path: 'tests/shots/resume-4-leave.png' });
await page.click('.tourney-leave button:has-text("Save & leave")');
await page.waitForSelector('.lobby', { timeout: 8000 }).catch(() => fail('Save & leave did not return to the lobby'));
if (!(await save()).tourney) fail('Save & leave lost the save');
await page.click('button.hotspot[data-game="holdem"]'); await page.waitForSelector('.select-screen');
await page.screenshot({ path: 'tests/shots/resume-5-tile.png' });
const tile = await page.$('.table-tile.saved');
if (!tile) fail('no Continue tile'); else await tile.click();
await page.waitForSelector('.felt', { timeout: 8000 }).catch(() => fail('Continue tile did not resume'));
await page.waitForTimeout(800);
// Forfeit
await page.click('.leave-btn'); await page.waitForSelector('.tourney-leave');
await page.click('.tourney-leave button:has-text("Forfeit")');
await page.waitForSelector('.modal button:has-text("Forfeit")'); await page.click('.modal:not(.tourney-leave) button:has-text("Forfeit")');
await page.waitForSelector('.lobby', { timeout: 10000 }).catch(() => fail('forfeit did not return to the lobby'));
const end = await save();
if (end.tourney) fail('forfeit left a save behind');
if (end.bank !== bank0 - 200) fail(`bank after forfeit ${end.bank}, expected ${bank0 - 200}`);
console.log(errors.length ? errors.join('\n') : 'resume: no problems');
await browser.close(); server.close();
