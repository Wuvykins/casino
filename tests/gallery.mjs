// Screenshot every screen and dialog at phone (iPhone 14-ish, with notch insets) and iPad sizes, for a visual audit.
//   node tests/gallery.mjs   → tests/shots/gallery/<size>-<nn>-<name>.png
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); if (req.method === 'HEAD') return res.end(); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
for (const [size, viewport, notch] of [['phone', { width: 844, height: 390 }, true], ['ipad', { width: 1180, height: 820 }, false]]) {
  const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(size + ' ' + e.message));
  let n = 0;
  const shot = async (name) => { await page.waitForTimeout(650); await page.screenshot({ path: `tests/shots/gallery/${size}-${String(++n).padStart(2, '0')}-${name}.png` }); };
  const close = async () => { const d = await page.$('.overlay .modal-buttons .btn.primary, .overlay .btn:has-text("Done"), .overlay .btn:has-text("Close")'); if (d) await d.click(); else await page.keyboard.press('Escape'); await page.waitForTimeout(350); };
  const enter = async () => { await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.tap('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.tap('#splash')).catch(() => {}); };
  await page.goto(url);
  await page.waitForSelector('#splash.ready', { timeout: 8000 }).catch(() => {}); await shot('splash');
  await enter();
  if (notch) await page.addStyleTag({ content: ':root{--safe-l:47px;--safe-r:47px;--safe-b:21px}' });
  await page.waitForSelector('input[placeholder*="call you"]'); await shot('name');
  await page.fill('input[placeholder*="call you"]', 'Nic'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('casino.save.v1')); s.bank = 60000; s.tierId = 3; s.settings = { ...(s.settings || {}), sound: false, music: false, aiSpeed: 3 }; localStorage.setItem('casino.save.v1', JSON.stringify(s)); });
  await page.reload(); await enter(); await page.waitForSelector('.lobby');
  if (notch) await page.addStyleTag({ content: ':root{--safe-l:47px;--safe-r:47px;--safe-b:21px}' });
  await shot('lobby');
  await page.click('.settings-btn'); await shot('settings');
  await page.click('.overlay button:has-text("Casino Radio")'); await shot('radio');
  // topmost dialog: press its Done / primary / last button, until none are left
  const closeAll = async () => { for (let i = 0; i < 5; i++) { const left = await page.evaluate(() => { const o = [...document.querySelectorAll('.overlay')].pop(); if (!o) return false; const b = [...o.querySelectorAll('button')]; const pick = b.find((x) => /^(Done|Close|Nice|Fine|OK)$/i.test(x.textContent.trim())) || b.find((x) => x.classList.contains('primary')) || b.pop(); pick?.click(); return true; }); if (!left) break; await page.waitForTimeout(350); } };
  await page.evaluate(() => [...document.querySelectorAll('.overlay button')].find((b) => /Music Library|Library/.test(b.textContent))?.click()); await shot('library');
  await closeAll();
  const card = await page.$('.lobby .card-slot, .lobby .ccard, .lobby .bank-card, .lobby .creditcard'); if (card) { await card.click(); await shot('bank-card'); await closeAll(); }
  const cashier = await page.$('button.hotspot[data-game="cashier"]'); if (cashier) { await cashier.click(); await shot('cashier'); await closeAll(); }
  for (const game of ['holdem', 'blackjack', 'cribbage', 'farkle', 'slots']) {
    await page.click(`button.hotspot[data-game="${game}"]`); await page.waitForSelector('.select-screen'); await shot(`${game}-select`);
    await page.click('.table-tile:not(.locked):not(.poor)'); await page.waitForSelector('.overlay .modal'); await shot(`${game}-sit`);
    await page.click('.overlay button:has-text("Sit down")'); await page.waitForSelector('.table-screen'); await page.waitForTimeout(2600); await shot(`${game}-table`);
    const gear = await page.$('.gear-btn'); if (gear) { await gear.click(); await shot(`${game}-settings`); await closeAll(); }
    await page.click('.leave-btn'); await page.waitForTimeout(450);
    if (await page.$('.overlay')) await shot(`${game}-leave`);
    for (let i = 0; i < 12 && !(await page.$('#app > .lobby')); i++) {
      await page.evaluate(() => { const o = [...document.querySelectorAll('.overlay')].pop(); if (!o) return; const b = [...o.querySelectorAll('button')]; (b.find((x) => /Leave now|^Leave|Back to the lobby|Forfeit|Collect|Fine|Nice|Cash out/i.test(x.textContent.trim())) || b.find((x) => x.classList.contains('primary')) || b.pop())?.click(); });
      await page.waitForTimeout(700);
    }
    if (!(await page.$('#app > .lobby'))) { errors.push(size + ' stuck leaving ' + game); await page.screenshot({ path: `tests/shots/gallery/${size}-stuck-${game}.png` }); break; }
  }
  await page.close();
}
console.log(errors.length ? errors.join('\n') : 'gallery done');
await browser.close(); server.close();
