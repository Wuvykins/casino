// Tournament champion ceremony: the table dims, gold and emerald chips rain down, a guest in a blazer rises in beside
// the plaque and applauds (one clap sound per clap), and the plaque shows the prize. Resolves when Collect is tapped.
// Timeline (seconds from start) follows the applause mockup: dim 0.6–1.45, plaque rises 1.35–2.15, clapper appears
// 1.55–2.15, hands meet at 2.55 / 3.35 / 4.15 / 4.95, then he holds his hands together. victory.mp3 plays from 0.
import { h } from './dom.js';
import { audio, music } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { fmt$ } from '../core/bank.js';

const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
const CLAP_START = 2.15, CLAP_PERIOD = 0.8, CLAP_CYCLE = [0, 1, 2, 3, 2, 1];
const CLAP_END = CLAP_START + 3.5 * CLAP_PERIOD;   // 4.95: the fourth clap, after which the hands stay together
const CLAPS = [2.55, 3.35, 4.15, 4.95];

function loadImage(url) {
  return new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = url; });
}

export async function championship({ winner, prize, players, tableName }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [clapper, trophy] = await Promise.all([loadImage(assets.fileUrl('img/table/applause.webp')), loadImage(assets.fileUrl('img/table/trophy.webp'))]);
  return new Promise((resolve) => {
    let done = false;
    const canvas = h('canvas', { class: 'champ-canvas' });
    const ctx = canvas.getContext('2d');
    const plaque = h('div', { class: 'champ-plaque' },
      trophy ? h('img', { class: 'champ-trophy', src: trophy.src, alt: '' }) : h('div', { class: 'champ-trophy' }),
      h('div', { class: 'champ-eyebrow' }, 'TOURNAMENT CHAMPION'),
      h('div', { class: 'champ-name' }, winner),
      h('div', { class: 'champ-sub' }, `1st of ${players} players`),
      h('div', { class: 'champ-rule' }),
      h('div', { class: 'champ-eyebrow small' }, 'PRIZE'),
      h('div', { class: 'champ-prize' }, fmt$(prize)),
      h('div', { class: 'champ-sub' }, tableName),
      h('button', { class: 'btn primary champ-collect', onClick: () => finish() }, 'Collect'),
    );
    const root = h('div', { class: 'champ' }, canvas, plaque);
    document.body.append(root);

    const timers = [];
    const finish = () => {
      if (done) return; done = true;
      timers.forEach(clearTimeout);
      music.duck(false);
      root.classList.add('closing');
      setTimeout(() => { root.remove(); resolve(); }, 220);
    };

    music.duck(true);
    audio.play('victory', { volume: 0.9 });
    for (const at of CLAPS) timers.push(setTimeout(() => { if (!done) audio.play('clap', { volume: 0.7 }); }, at * 1000));

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);

    const t0 = performance.now();
    const frame = () => {
      if (done) { window.removeEventListener('resize', size); return; }
      const t = (performance.now() - t0) / 1000;
      const d = ease((t - 0.6) / 0.85), a = ease((t - 1.35) / 0.8);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = `rgba(2,12,8,${0.62 * d})`; ctx.fillRect(0, 0, W, H);
      const k = W / 1200;   // the mockup was laid out on a 1200-wide canvas
      if (!reduced) chips(ctx, t, W, k);
      // the plaque is DOM: rise + fade in, then the canvas sparkles around its trophy
      plaque.style.opacity = a; plaque.style.transform = `translate(-50%, calc(-50% + ${reduced ? 0 : 16 * (1 - a)}px))`;
      const rect = plaque.getBoundingClientRect();
      const pop = ease((t - 1.55) / 0.6);
      if (pop > 0 && clapper) cameo(ctx, clapper, t, pop, rect, reduced);
      if (a > 0 && !reduced) sparkles(ctx, t, a, rect);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    requestAnimationFrame(() => root.classList.add('open'));
  });
}

// Finite chip shower, drawn under the cameo and the plaque.
function chips(ctx, t, W, k) {
  for (let i = 0; i < 64; i++) {
    const spawn = 1.75 + (i % 16) * 0.11, age = t - spawn;
    if (age < 0 || age > 3.5) continue;
    const seed = ((i * 137.508) % 1200) * k;
    const x = seed + Math.sin(i * 2.1 + age * 1.5) * 28 * k, y = (-45 + age * (105 + (i % 5) * 15) + age * age * 40) * k;
    if (y > window.innerHeight + 40) continue;
    const r = (8 + (i % 5) * 2) * Math.max(0.8, k);
    ctx.save(); ctx.translate(x, y); ctx.rotate(i + age * (i % 2 ? 1.3 : -1.5));
    ctx.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(i * 0.8 + age * 2.4)));
    ctx.globalAlpha = Math.min(1, age * 3) * 0.88;
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
    ctx.fillStyle = i % 3 ? '#0e6544' : '#d7ae46'; ctx.strokeStyle = '#f1d080'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    for (let j = 0; j < 8; j++) { ctx.save(); ctx.rotate(j * Math.PI / 4); ctx.fillStyle = i % 3 ? '#f4db91' : '#163e2b'; ctx.fillRect(-r * 0.12, -r + 1, r * 0.24, r * 0.23); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.64, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = i % 3 ? '#f6d887' : '#153e2a'; ctx.textAlign = 'center'; ctx.font = `bold ${r * 0.8}px Georgia`; ctx.fillText('W', 0, r * 0.28);
    ctx.restore();
  }
}

// The applauding guest: head and shoulders are one still frame, only the lower half (forearms and hands) changes.
function cameo(ctx, clapper, t, pop, rect, reduced) {
  const safeL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-l')) || 0;
  const size = Math.max(120, Math.min(rect.height * 1.05, rect.left - safeL - 6, 300));   // beside the plaque, never behind it
  const x = Math.max(safeL, rect.left - size - 6);
  const y = rect.bottom - size + (reduced ? 0 : 65 * (1 - pop));
  let index = 3, next = 3, mix = 0;
  if (!reduced && t < CLAP_END) {
    if (t < CLAP_START) { index = 0; next = 0; }
    else { const p = (t - CLAP_START) / CLAP_PERIOD * 6; index = CLAP_CYCLE[Math.floor(p) % 6]; next = CLAP_CYCLE[(Math.floor(p) + 1) % 6]; mix = p - Math.floor(p); }
  }
  const cw = clapper.width / 2, ch = clapper.height / 2;
  ctx.save();
  ctx.globalAlpha = pop;
  ctx.drawImage(clapper, 0, 0, cw, ch * 0.5, x, y, size, size * 0.5);
  const pose = (i, alpha) => { ctx.globalAlpha = pop * alpha; ctx.drawImage(clapper, (i % 2) * cw, Math.floor(i / 2) * ch + ch * 0.5, cw, ch * 0.5, x, y + size * 0.5, size, size * 0.5); };
  pose(index, 1); if (mix > 0) pose(next, mix);
  ctx.restore();
}

// One restrained burst around the trophy; nothing keeps moving once the celebration settles.
function sparkles(ctx, t, a, rect) {
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.06;
  const k = Math.min(1, rect.width / 440);
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const age = t - (1.72 + (i % 5) * 0.06), life = 1.2 + (i % 4) * 0.17; if (age < 0 || age > life) continue;
    const angle = i * 2.39996, speed = (33 + (i % 7) * 8) * k;
    const x = cx + Math.cos(angle) * (51 * k + speed * age), y = cy + Math.sin(angle) * (40 * k + speed * age) - 34 * age + 19 * age * age;
    ctx.globalAlpha = a * Math.sin(Math.PI * age / life) * 0.85; ctx.fillStyle = i % 3 ? '#e9c461' : '#fff4bf'; ctx.shadowColor = '#eec85b'; ctx.shadowBlur = 8;
    const s = i % 4 === 0 ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.lineTo(x + s / 2, y - s / 2); ctx.lineTo(x + s * 2, y); ctx.lineTo(x + s / 2, y + s / 2); ctx.lineTo(x, y + s * 2); ctx.lineTo(x - s / 2, y + s / 2); ctx.lineTo(x - s * 2, y); ctx.lineTo(x - s / 2, y - s / 2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
