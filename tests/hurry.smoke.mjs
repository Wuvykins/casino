// Sit at each game, then do nothing: opponents should take turns saying their hurry line (timings shortened here),
// and stop once the player acts.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
await new Promise((r) => server.listen(0, r)); const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.addInitScript(() => { window.__hurryMs = [1500, 2600]; window.__said = []; new MutationObserver((ms) => { for (const m of ms) { const b = m.target.closest?.('.bubble, .speech, [class*="bubble"]'); if (b && b.classList.contains('show')) window.__said.push({ t: performance.now(), text: b.textContent, who: b.closest('[data-id], .seat, .bj-seat, .fk-seat, .cb-opp')?.textContent?.slice(0, 30) }); } }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
await page.goto(url);
await page.waitForSelector('#splash.ready', { timeout: 8000 }).then(() => page.click('#splash')).catch(() => {}); await page.waitForSelector('#splash.can-skip', { timeout: 3000 }).then(() => page.click('#splash')).catch(() => {});
await page.waitForSelector('input[placeholder*="call you"]'); await page.fill('input[placeholder*="call you"]', 'Dad'); await page.click("text=Let's play"); await page.waitForSelector('.lobby');
const out = [];
for (const [game, ready] of [["Texas Hold'em", '.actionbar:not(.hidden) button.act'], ['Blackjack', '.actionbar.betting:not(.hidden)'], ['Cribbage', '.cb-deal-mid.show'], ['Farkle', '.actionbar:not(.hidden) button.act']]) {
  await page.click(`button.hotspot[title="${game}"]`); await page.waitForSelector('.select-screen');
  await page.click('.table-tile:not(.locked)'); await page.waitForSelector('.cast-grid'); await page.click('.modal button:has-text("Sit down")');
  await page.waitForSelector(ready, { timeout: 40000 });
  await page.evaluate(() => { window.__said = []; window.__t0 = performance.now(); });
  await page.waitForTimeout(9000);   // ≈ first at 1.5 s, then every 2.6 s → 3 nags
  const said = await page.evaluate(() => window.__said.map((s) => ({ t: Math.round((s.t - window.__t0) / 100) / 10, text: s.text })));
  out.push(`${game}: ${said.map((s) => `${s.t}s "${s.text}"`).join(' · ') || 'nothing'}`);
  if (said.length < 2) errors.push(`${game}: expected at least 2 hurry lines, got ${said.length}`);
  await page.click('text=Leave table');
  const mid = await page.waitForSelector('.modal button:has-text("Leave now")', { timeout: 3000 }).catch(() => null);
  if (mid) await mid.click();
  await page.waitForSelector('.lobby', { timeout: 15000 });
  await page.evaluate(() => { window.__said = []; }); await page.waitForTimeout(3500);
  const after = await page.evaluate(() => window.__said.length);
  if (after) errors.push(`${game}: still nagging after leaving (${after})`);
}
await browser.close(); server.close();
console.log(out.join('\n'));
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('no page errors');
