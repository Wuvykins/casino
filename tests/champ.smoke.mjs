// Visual check of the tournament-champion ceremony: sit at The Open, then run the ceremony directly over the table
// (no need to win) and screenshot it at three points — chips falling, mid-clap, settled. Phone (844x390) and iPad sizes.
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
const errors = [];
for (const [tag, viewport, safe] of [['phone', { width: 844, height: 390 }, true], ['ipad', { width: 1180, height: 820 }, false]]) {
  const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
  const enter = async () => { await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {}); };
  await page.goto(url); await enter();
  await page.waitForSelector('input[placeholder*="call you"]', { timeout: 10000 }); await page.fill('input[placeholder*="call you"]', 'Nic'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
  if (safe) await page.addStyleTag({ content: ':root{--safe-l:47px;--safe-r:47px;--safe-b:21px}' });
  await page.click('button.hotspot[data-game="holdem"]'); await page.waitForSelector('.select-screen');
  await page.click('.table-tile:has-text("The Open")'); await page.waitForSelector('.modal button:has-text("Sit down")');
  await page.click('.modal button:has-text("Sit down")'); await page.waitForSelector('.felt'); await page.waitForTimeout(800);
  const run = page.evaluate(async () => {
    const { championship } = await import('/js/ui/championship.js');
    await championship({ winner: 'Nic', prize: 800, players: 6, tableName: 'The Open' });
    return 'collected';
  });
  await page.waitForSelector('.champ.open');
  await page.waitForTimeout(2000); await page.screenshot({ path: `tests/shots/champ-${tag}-1.png` });
  await page.waitForTimeout(700); await page.screenshot({ path: `tests/shots/champ-${tag}-2.png` });
  await page.waitForTimeout(3300); await page.screenshot({ path: `tests/shots/champ-${tag}-3.png` });
  await page.click('.champ-collect');
  const out = await run;
  if (out !== 'collected') errors.push(tag + ': ceremony did not resolve');
  if (await page.$('.champ')) { await page.waitForTimeout(400); if (await page.$('.champ')) errors.push(tag + ': overlay still present after Collect'); }
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'champ: no page errors');
await browser.close(); server.close();
