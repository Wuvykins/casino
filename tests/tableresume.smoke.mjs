// Save & resume at the money tables. For each of hold'em (cash), blackjack, cribbage and farkle: sit down, get into
// the game, reload the page (as if the app was closed), expect "Pick up where you left off?", Continue, and check the
// bank didn't move and the stack is back. Cribbage and farkle also check a mid-game score comes back. Last: decline
// one (Cash out) and check the chips land in the bank.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); if (req.method === 'HEAD') return res.end(); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
const enter = async () => { await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {}); };
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('casino.save.v1')));
await page.goto(url); await enter();
await page.waitForSelector('input[placeholder*="call you"]'); await page.fill('input[placeholder*="call you"]', 'Dad'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.settings = { ...(s.settings || {}), aiSpeed: 3, sound: false, music: false }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await page.reload(); await enter(); await page.waitForSelector('.lobby');
const sit = async (game, pick = 1) => {
  await page.click(`button.hotspot[data-game="${game}"]`); await page.waitForSelector('.select-screen');
  await page.click('.table-tile:not(.locked):not(.poor)'); await page.waitForSelector('.overlay .modal');
  if (await page.$('.cast-tile')) { for (let i = 0; i < 6; i++) { const on = await page.$('.cast-tile.on'); if (!on) break; await on.click(); await page.waitForTimeout(60); } for (let n = 1; n <= pick; n++) { await page.click(`.cast-tile:nth-child(${n})`); await page.waitForTimeout(60); } }
  await page.click('.overlay button:has-text("Sit down")'); await page.waitForSelector('.table-screen');
};
const reloadAndContinue = async (label, check) => {
  const before = await save();
  await page.reload(); await enter();
  const offer = await page.waitForSelector('.resume-offer', { timeout: 8000 }).catch(() => null);
  if (!offer) { errors.push(label + ': no resume offer'); return; }
  const text = await offer.innerText();
  await page.click('.resume-offer button:has-text("Continue")');
  await page.waitForSelector('.table-screen', { timeout: 8000 }).catch(() => errors.push(label + ': Continue did not reopen the table'));
  await page.waitForTimeout(1800);
  const after = await save();
  if (after.bank !== before.bank) errors.push(`${label}: bank moved on resume ${before.bank} -> ${after.bank}`);
  if (after.atTable?.stack !== before.atTable?.stack) errors.push(`${label}: stack ${before.atTable?.stack} -> ${after.atTable?.stack}`);
  if (check) await check(before, after);
  console.log(label, '|', text.replace(/\s+/g, ' ').slice(0, 110));
  await page.screenshot({ path: `tests/shots/tresume-${label}.png` });
};
const leave = async () => {
  await page.click('.leave-btn');
  for (let i = 0; i < 8 && !(await page.$('#app > .lobby')); i++) { await page.evaluate(() => { const o = [...document.querySelectorAll('.overlay')].pop(); if (!o) return; const b = [...o.querySelectorAll('button')]; (b.find((x) => /Leave now|Back to the lobby|Nice|Fine/i.test(x.textContent)) || b.find((x) => x.classList.contains('primary')) || b.pop())?.click(); }); await page.waitForTimeout(500); }
};

// hold'em cash: play a couple of hands by calling, then close mid-hand
await sit('holdem', 3);
for (let hands = 0, t0 = Date.now(); hands < 2 && Date.now() - t0 < 60000;) {
  const bar = await page.$('.actionbar:not(.hidden)'); if (bar) { const b = await bar.$$('button.act'); const l = await Promise.all(b.map((x) => x.innerText())); let i = l.findIndex((x) => /^Check|^Call/.test(x)); if (i < 0) i = 0; await b[i].click().catch(() => {}); continue; }
  const next = await page.$('.nextbar:not(.hidden) button'); if (next) { hands++; await next.click(); continue; }
  await page.waitForTimeout(100);
}
await page.waitForSelector('.actionbar:not(.hidden)', { timeout: 15000 }).catch(() => {});
await reloadAndContinue('holdem', async (b, a) => { if (JSON.stringify(b.atTable.state.seats) !== JSON.stringify(a.atTable.state.seats)) errors.push('holdem: opponent stacks changed'); });
await leave();

// blackjack: bet and deal, close in the middle of the round
await sit('blackjack', 2);
await page.waitForSelector('.actionbar.betting:not(.hidden)'); await page.click('.rack-chip'); await page.click('.rack-chip'); await page.$eval('button.act.raise', (b) => b.click());
await page.waitForTimeout(1500);
await reloadAndContinue('blackjack', async (b, a) => { if (!(await page.$('.actionbar.betting:not(.hidden)'))) errors.push('blackjack: not back at the betting screen'); });
await leave();

// cribbage: write a mid-game save (30–22, fourth hand) and check it comes back on the board
await sit('cribbage', 1);
await page.waitForSelector('.cb-deal-mid.show', { timeout: 20000 });
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); const o = s.atTable.opponents[0]; s.atTable.state.game = { scores: { you: 30, [o]: 22 }, pegHistory: { you: [0, 12, 30], [o]: [0, 8, 22] }, dealer: 'you', handNo: 3 }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await reloadAndContinue('cribbage', async () => { const sc = await page.$$eval('.cb-window, .cb-score', (els) => els.map((e) => e.textContent.trim())); if (!sc.join(' ').includes('30') || !sc.join(' ').includes('22')) errors.push('cribbage: scores not restored: ' + sc.join(',')); });
await leave();

// farkle: a mid-game save (you 1,250 / others 800 and 0) — check it's on the scoreboard
await sit('farkle', 2);
await page.waitForSelector('.actionbar:not(.hidden) button.act:has-text("Roll"), .fk-seat', { timeout: 20000 });
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); const [a, b] = s.atTable.opponents; s.atTable.state.game = { scores: { you: 1250, [a]: 800, [b]: 0 }, onBoard: { you: true, [a]: true, [b]: false }, current: 'you', finalRound: false, closer: null, pending: null, turnsTaken: { you: 3, [a]: 3, [b]: 3 } }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
await reloadAndContinue('farkle', async () => { const t = await page.$eval('.table-screen', (e) => e.innerText); if (!t.includes('1,250') || !t.includes('800')) errors.push('farkle: scores not restored'); });

// decline: Cash out puts the table's chips back in the bank
const before = await save();
await page.reload(); await enter();
await page.waitForSelector('.resume-offer'); await page.click('.resume-offer button:has-text("Cash out")');
await page.waitForSelector('#app > .lobby');
const after = await save();
if (after.atTable) errors.push('cash out left the table saved');
if (after.bank !== before.bank + before.atTable.stack) errors.push(`cash out: bank ${before.bank} + ${before.atTable.stack} -> ${after.bank}`);
console.log(errors.length ? errors.join('\n') : 'table resume: no problems');
await browser.close(); server.close();
