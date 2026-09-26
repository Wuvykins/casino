// Hold'em "?" button: opens the hand-rankings card, lists all ten hands with five cards each, fits the screen, closes.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SHOTS = path.join(ROOT, 'tests/shots'); fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r)); const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = []; const out = [];
for (const [label, vp, notch] of [['phone', { width: 844, height: 390 }, true], ['ipad', { width: 1180, height: 820 }, false]]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', (e) => errors.push(label + ' pageerror: ' + e.message));
  await page.goto(url);
  if (notch) await page.addStyleTag({ content: ':root{--safe-l:47px;--safe-r:47px;--safe-b:21px}' });
  await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.click('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.click('#splash')).catch(() => {});
  await page.waitForSelector('input[placeholder*="call you"]'); await page.fill('input[placeholder*="call you"]', 'Nic'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
  await page.click(`button.hotspot[title="Texas Hold'em"]`); await page.waitForSelector('.select-screen');
  await page.click('.table-tile:not(.locked)'); await page.waitForSelector('.cast-grid'); await page.click('.modal button:has-text("Sit down")');
  await page.waitForSelector('.table-screen .help-btn');
  await page.screenshot({ path: `${SHOTS}/ranks-topbar-${label}.png` });
  await page.click('.help-btn'); await page.waitForSelector('.modal.hand-ranks');
  await page.waitForTimeout(400);
  const info = await page.$eval('.modal.hand-ranks', (m) => ({ rows: m.querySelectorAll('.hr-row').length, cards: m.querySelectorAll('.hr-cards .pcard').length, fits: m.scrollHeight <= m.clientHeight + 1, h: m.getBoundingClientRect().height, first: m.querySelector('.hr-row b').textContent }));
  await page.screenshot({ path: `${SHOTS}/ranks-${label}.png` });
  await page.click('.modal.hand-ranks button:has-text("Got it")'); await page.waitForTimeout(300);
  const gone = !(await page.$('.modal.hand-ranks'));
  out.push(`${label}: rows ${info.rows}, cards ${info.cards}, fits ${info.fits} (h ${Math.round(info.h)}), first "${info.first}", closed ${gone}`);
  if (info.rows !== 10 || info.cards !== 50 || !info.fits || !gone) errors.push(label + ' layout/behaviour wrong');
  await page.close();
}
await browser.close(); server.close();
console.log(out.join('\n'));
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('no page errors');
