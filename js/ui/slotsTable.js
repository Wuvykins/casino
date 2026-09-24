// The Van Halen slot machine. Nic's painted cabinet (assets/img/slots/background.jpg) is drawn on a canvas at its
// own 1774x887 size and stretched to the screen like the other scenes; the reels, handle, lights and LED readouts
// are drawn over it every frame (after his RockSlotAnimator). Real buttons sit invisibly over the painted ones.
//
// A spin: the handle pulls (0.45–0.94 s), the reels spin up from 0.85 s to a steady 12 rows/s and keep rolling.
// The button is STOP: each press brakes the next rolling reel right where it is (it travels 2–3 more rows and
// lands on a whole row), so where it stops is the player's timing — a quick eye can chase the jackpot. A reel left
// alone brakes on its own around 2.8 / 3.6 / 4.4 s onto the machine's own pick (which carries the luck system).
// The result comes 0.2 s after the last reel lands; the payout counts up over 1.15 s.
// Sounds: the Hot for Teacher drum roll and a reel whir run under the spin and are cut when the last reel lands; a
// win (payout of at least the bet) gets the "I'm hot for teacher" chorus, a few dollars back gets a coin chime,
// nothing at all is silent, the jackpot gets Jump. Any clip still playing is cut when the next spin starts.
import { h, clear, modal, toast } from './dom.js';
import { creditCardEl, askLeave, resultBanner } from './components.js';
import { Machine, PAYTABLE, STOPS, STRIPS, evaluateStops } from '../core/slots.js';
import { LUCK } from '../core/luck.js';
import { makeRng } from '../core/rng.js';
import { bank, fmt$ } from '../core/bank.js';
import { assets } from '../core/assets.js';
import { audio, music } from '../core/audio.js';
import { showRadio } from './lobby.js';

const W = 1774, H = 887;
// where each symbol is on the symbols picture: [sx, sy, sw, sh]  (index = SYMBOLS order)
const TILES = [[431, 235, 263, 133], [751, 235, 276, 133], [1082, 235, 272, 133], [431, 514, 263, 121], [751, 514, 276, 121], [431, 368, 263, 138]];
const REEL_X = [423, 750, 1081], REEL_W = [274, 277, 274], REEL_Y = 230, REEL_H = 408, ROW = 136;
const REEL_START = 0.85, REEL_STAGGER = 0.08, RESULT_GAP = 0.2;
const V = 12, ACCEL = 0.35, BRAKE_ROWS = 2.5, BRAKE_T = 2 * BRAKE_ROWS / V;   // rows per second, spin-up time, braking distance/time
const AUTO_STOP = [2.8, 3.6, 4.4];
const STOP_GRACE = 1.6, STOP_GRACE_STEP = 0.8;

export class SlotsTable {
  constructor(root, table, buyIn, { onLeave }) {
    this.root = root; this.table = table; this.onLeave = onLeave;
    this.rng = makeRng();
    this.machine = new Machine({ rng: this.rng });
    this.stack = buyIn;
    this.bet = Math.min(table.bets.find((b) => b >= 5) || table.bets[0], this.stack);
    this.stopped = false; this.leaving = false; this.spinning = false;
    this.pos = [3, 7, 11];            // where each reel is resting (strip index at the payline)
    this.spin = null;                  // current spin: { t0, stops, from, dist, result }
    this.shownWin = 0; this.lastWin = 0; this.title = 'PULL TO ROCK';
    this.spins = 0; this.won = 0;
    bank.buyIn(buyIn, table.id);
    bank.setAtTable({ tableId: table.id, stack: buyIn, opponents: [] });
    this.build();
  }

  build() {
    clear(this.root);
    this.el = h('div', { class: 'table-screen slots' });
    this.canvas = h('canvas', { width: W, height: H, class: 'slots-canvas' });
    this.ctx = this.canvas.getContext('2d');
    const hit = (cls, box, onClick, label) => h('button', { class: 'slot-hit ' + cls, 'aria-label': label, style: { left: box[0] + '%', top: box[1] + '%', width: (box[2] - box[0]) + '%', height: (box[3] - box[1]) + '%' }, onClick });
    this.hits = {
      paytable: hit('paytable', [13, 84.5, 20.3, 96.5], () => { audio.play('tap'); this.showPaytable(); }, 'Paytable'),
      sound: hit('sound', [21, 84.5, 28, 96.5], () => { audio.play('tap'); showRadio(this.root, {}, { atTable: true }); }, 'Casino Radio'),
      less: hit('less', [57.3, 87, 61.3, 95], () => this.changeBet(-1), 'Lower bet'),
      more: hit('more', [68.8, 87, 72.8, 95], () => this.changeBet(1), 'Raise bet'),
      spin: hit('spin', [76.5, 80.5, 89.5, 98.5], () => this.stopNext(), 'Stop'),
      handle: hit('handle', [85.5, 36, 94, 79], () => this.pull(), 'Pull the handle'),
    };
    this.leaveBtn = h('button', { class: 'btn ghost small leave-btn', onClick: () => this.requestLeave() }, '‹ Leave table');
    this.el.append(this.canvas, ...Object.values(this.hits), this.leaveBtn);
    this.root.append(this.el);
  }

  async run() {
    this.bg = await loadImg(assets.fileUrl('img/slots/background.jpg'));
    this.sym = await loadImg(assets.fileUrl('img/slots/symbols.jpg'));
    if (!this.bg || !this.sym) { toast('The slot machine art is missing.'); return this.leave(); }
    const loop = (now) => { if (this.stopped) return; this.draw(now / 1000); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- controls ----------
  changeBet(dir) {
    if (this.spinning) return;
    const bets = this.table.bets.filter((b) => b <= Math.max(this.stack, this.table.minBet));
    let i = bets.indexOf(this.bet); if (i < 0) i = 0;
    i = Math.max(0, Math.min(bets.length - 1, i + dir));
    if (bets[i] !== this.bet) { this.bet = bets[i]; audio.play('chip'); }
  }

  pull() {
    if (this.spinning || this.stopped) return;
    if (this.stack < this.bet) { if (this.stack >= this.table.minBet) { this.bet = Math.max(...this.table.bets.filter((b) => b <= this.stack)); } else { this.bustModal(); return; } }
    this.spinning = true;
    this.stack -= this.bet;
    // the machine's own pick: where each reel lands if the player never touches STOP (with the odd bit of luck)
    let auto = this.machine.spin(this.bet);
    if (auto.kind === 'miss' && this.rng.chance(LUCK.slotSave)) auto = this.machine.spinSmallWin(this.bet);
    // the house is generous: one spin in twenty is a jackpot whatever the reels rolled (a hand stop lands on it too)
    let rigged = false;
    if (auto.kind !== 'jackpot' && this.rng.chance(LUCK.slotJackpot)) { const stops = STRIPS.map((st) => st.indexOf(0)); auto = { stops, bet: this.bet, ...evaluateStops(stops, this.bet) }; rigged = true; }
    const from = this.pos.slice();
    const reels = from.map((f, i) => {
      const r = { from: f, startAt: REEL_START + i * REEL_STAGGER, target: auto.stops[i], brake: null, stop: null, manual: false };
      this.planAuto(r, AUTO_STOP[i] - 1);
      return r;
    });
    this.spin = { t0: performance.now() / 1000, reels, result: null, settled: false, landed: false, settling: false, rigged };
    this.spin.endAt = Math.max(...reels.map((r) => r.end)); this.spin.resultAt = this.spin.endAt + RESULT_GAP;
    this.shownWin = 0; this.title = 'GOOD LUCK';
    // sounds: the drum roll plus the reel whir, both cut when the last reel lands (see draw())
    this.stopClips();
    this.spinClip = audio.play('slotspin', { volume: 0.75 });
    this.cueClip = audio.play('slotreels', { volume: 0.45 }); if (this.cueClip) this.cueClip.loop = true;
  }

  // Plan a reel's automatic stop: the first moment at or after `lower` when its target is exactly BRAKE_ROWS ahead
  // (the reel comes round every STOPS / V seconds, so that is within 2 s of `lower`).
  planAuto(r, lower) {
    const cruise0 = r.startAt + ACCEL, p0 = r.from - V * ACCEL / 2;                  // pos when cruising begins
    const want = r.target + BRAKE_ROWS; lower = Math.max(cruise0, lower);
    let best = Infinity;
    for (let k = 2; k > -120; k--) { const tp = cruise0 + (p0 - (want + k * STOPS)) / V; if (tp >= lower && tp < best) best = tp; }
    r.autoAt = best; r.end = best + BRAKE_T;
  }

  // Reel kinematics. Positions are strip indices at the payline; the reels roll downward so pos falls. A reel spins
  // up over ACCEL seconds to V rows/s, cruises, then brakes: from the moment the brake goes on it travels BRAKE_ROWS
  // (2–3 rows, ease-out) and lands on a whole row. STOP brakes a reel wherever it happens to be — so where it lands
  // is the player's timing, not the machine's pick; a reel left alone brakes at its planned autoAt onto the target.
  reelPos(i, t) {
    const r = this.spin.reels[i];
    if (r.brake) { const b = r.brake; if (t >= b.tp + b.D) return r.stop; const u = (t - b.tp) / b.D; return b.p0 - b.d2 * (1 - (1 - u) * (1 - u)); }
    const tau = t - r.startAt;
    if (tau <= 0) return r.from;
    if (tau < ACCEL) return r.from - V * tau * tau / (2 * ACCEL);
    return r.from - V * ACCEL / 2 - V * (tau - ACCEL);
  }
  cruising(i, t) { const r = this.spin.reels[i]; return !r.brake && t >= r.startAt + ACCEL; }
  // put the brake on reel i at spin-time tp, landing `rows` (2–3) further on, on a whole row
  brake(i, tp, rows) {
    const s = this.spin, r = s.reels[i];
    const p0 = this.reelPos(i, tp);
    const stop = Math.floor(p0 - rows + 1e-6);                        // the whole row 2–3 rows on
    const d2 = p0 - stop, D = 2 * d2 / V;                              // ease-out from V to rest covers d2 in 2·d2/V
    r.brake = { tp, p0, d2, D }; r.stop = ((stop % STOPS) + STOPS) % STOPS; r.end = tp + D;
    s.endAt = Math.max(...s.reels.map((x) => x.end)); s.resultAt = s.endAt + RESULT_GAP;
  }

  // STOP: brake the next reel that is still rolling, right where it is.
  stopNext() {
    const s = this.spin; if (!s || s.settled || this.stopped) return;
    const t = performance.now() / 1000 - s.t0;
    const i = s.reels.findIndex((_, k) => this.cruising(k, t));
    if (i < 0) return;                                                 // nothing rolling yet
    audio.play('slotstop', { volume: 0.9 });
    s.reels[i].manual = true;
    if (s.rigged) { this.planAuto(s.reels[i], t); }                    // a gifted jackpot: the hand stop brakes at the next pass of the logo, so it still lands
    else this.brake(i, t, BRAKE_ROWS);
    // the player is stopping them by hand: give the reels still rolling more time before they stop on their own
    let n = 0;
    for (const r of s.reels) if (!r.brake) { this.planAuto(r, Math.max(r.autoAt, t + STOP_GRACE + n * STOP_GRACE_STEP)); n++; }
    s.endAt = Math.max(...s.reels.map((x) => x.end)); s.resultAt = s.endAt + RESULT_GAP;
  }

  async settle() {
    if (this.stopped || !this.spin) return;
    const stops = this.spin.reels.map((x) => x.stop);
    const r = { stops, bet: this.bet, ...evaluateStops(stops, this.bet) };
    this.spin.result = r;
    this.pos = stops.slice();
    this.spin.settled = true;
    this.stack += r.payout; this.lastWin = r.payout;
    this.spins++; if (r.payout > 0) this.won++;
    bank.recordHand({ won: r.payout > this.bet, showdown: false, pot: r.payout, net: r.payout - this.bet, handName: r.kind === 'jackpot' ? 'Jackpot' : null, handScore: r.kind === 'jackpot' ? 2 : 0 });
    bank.setAtTable({ tableId: this.table.id, stack: this.stack, opponents: [] });
    stopClip(this.spinClip); stopClip(this.cueClip);
    if (r.kind === 'jackpot') {
      music.duck(true);
      this.jackClip = audio.play('slotjackpot', { volume: 0.9 });
      await wait(6900);                                          // the synth intro runs ~7 s; the banner lands with "Ah, might as well jump"
      await resultBanner(this.el, { type: 'win', amount: r.payout, caption: '★   JACKPOT   ★', title: 'Might as well jump!', hold: 3600 });
    } else if (r.payout >= r.bet) {
      this.winClip = audio.play('slotteacher', { volume: 0.85 });     // "got it bad… I'm hot for teacher"
      if (r.payout >= r.bet * 10) { await wait(1300); await resultBanner(this.el, { type: 'win', amount: r.payout - r.bet, caption: r.name.toUpperCase(), title: 'Big win' }); }
      else await wait(1400);
    } else {
      if (r.payout > 0) audio.play('slotsmall', { volume: 0.8 });   // a few dollars back: the coin chime; nothing at all: silence (Nic's call)
      await wait(1400);
    }
    this.spinning = false;
    this.spin = null;
    this.title = 'PULL TO ROCK';
    if (this.leaving) return this.leave();
    if (this.stack < this.table.minBet) this.bustModal();
  }

  stopClips() { for (const k of ['spinClip', 'cueClip', 'winClip', 'jackClip']) { stopClip(this[k]); this[k] = null; } }

  // ---------- drawing ----------
  draw(nowSec) {
    const c = this.ctx, s = this.spin;
    const t = s ? nowSec - s.t0 : 0;
    const clamp = (v) => Math.max(0, Math.min(1, v)), smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
    c.save();
    c.drawImage(this.bg, 0, 0, W, H);
    // reels
    for (let i = 0; i < 3; i++) {
      const strip = STRIPS[i];
      let pos = this.pos[i], bounce = 0;
      if (s && !s.settled) {
        const reel = s.reels[i];
        if (!reel.brake && t >= reel.autoAt) this.brake(i, reel.autoAt, BRAKE_ROWS);   // left alone: the machine's stop
        const end = reel.end;
        pos = this.reelPos(i, t);
        if (t > end && t < end + 0.18) bounce = Math.sin((t - end) / 0.18 * Math.PI) * 4;
      }
      const x = REEL_X[i], w = REEL_W[i];
      c.save(); c.beginPath(); c.roundRect(x, REEL_Y, w, REEL_H, 10); c.clip();
      c.fillStyle = '#eee0be'; c.fillRect(x, REEL_Y, w, REEL_H);
      const base = Math.floor(pos), frac = pos - base;
      for (let j = -2; j <= 3; j++) {
        const idx = ((base + j) % STOPS + STOPS) % STOPS;
        const tile = TILES[strip[idx]];
        const y = REEL_Y + ROW * (1 + j - frac) + bounce;
        c.drawImage(this.sym, ...tile, x, y, w, ROW + 0.7);
      }
      const shade = c.createLinearGradient(0, REEL_Y, 0, REEL_Y + REEL_H);
      shade.addColorStop(0, '#0009'); shade.addColorStop(.23, '#0000'); shade.addColorStop(.7, '#0000'); shade.addColorStop(1, '#0009');
      c.fillStyle = shade; c.fillRect(x, REEL_Y, w, REEL_H);
      c.restore();
      c.shadowColor = '#db8d16'; c.shadowBlur = 4; c.strokeStyle = '#f2c76b'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(x - 4, 433); c.lineTo(x + w + 1, 433); c.stroke(); c.shadowBlur = 0;
    }
    // handle: pulls, holds, springs back
    let pull = 0;
    if (s) { if (t >= .45 && t < .78) pull = smooth((t - .45) / .33); else if (t >= .78 && t < .94) pull = 1; else if (t >= .94 && t < 1.8) { const u = t - .94; pull = Math.exp(-u * 7) * Math.cos(u * 12); } }
    const bx = 1587 + pull * 28, by = 378 + pull * 205;
    c.lineCap = 'round'; c.strokeStyle = '#2d1708'; c.lineWidth = 25; c.beginPath(); c.moveTo(1546, 663); c.lineTo(bx, by + 30); c.stroke();
    const shaft = c.createLinearGradient(1535, 0, 1570, 0); shaft.addColorStop(0, '#855013'); shaft.addColorStop(.4, '#ffe799'); shaft.addColorStop(.6, '#bf872c'); shaft.addColorStop(1, '#fff0a3');
    c.strokeStyle = shaft; c.lineWidth = 16; c.stroke();
    c.save(); c.beginPath(); c.arc(bx, by, 51, 0, Math.PI * 2); c.clip(); c.drawImage(this.sym, 1532, 326, 110, 108, bx - 53, by - 53, 106, 106); c.restore();
    // the last reel is in: cut the drum roll; a beat later, the result
    if (s && !s.landed && t >= s.endAt) { s.landed = true; stopClip(this.spinClip); stopClip(this.cueClip); }
    if (s && !s.settling && t >= s.resultAt) { s.settling = true; this.settle(); }
    // readouts
    const RESULT_AT = s ? s.resultAt : 0;
    const settled = s && t >= RESULT_AT, r = s?.result;
    const won = settled && r.payout >= r.bet, jack = settled && r.kind === 'jackpot';
    if (settled) this.shownWin = Math.round(r.payout * smooth((t - RESULT_AT) / 1.15));
    const shownCash = settled ? this.stack - r.payout + this.shownWin : this.stack;
    const led = (text, x, y, size) => { c.font = 'bold ' + size + 'px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffcf4a'; c.shadowColor = '#e98b00'; c.shadowBlur = 9; c.fillText(text, x, y); c.shadowBlur = 0; };
    const title = !s ? (this.lastWin > 0 ? `LAST WIN  $${this.lastWin.toLocaleString('en-US')}` : 'PULL TO ROCK') : !settled ? 'GOOD LUCK' : r.kind === 'miss' ? 'READY FOR THE NEXT SPIN' : jack ? 'JACKPOT  $' + this.shownWin.toLocaleString('en-US') : (r.name.toUpperCase() + '  $' + this.shownWin.toLocaleString('en-US'));
    led(title, 889, 696, title.length > 22 ? 26 : 36);
    led('$' + shownCash.toLocaleString('en-US'), 651, 813, 38);
    led('$' + (s ? this.shownWin : this.lastWin).toLocaleString('en-US'), 887, 813, 38);
    c.fillStyle = '#0d0905'; c.beginPath(); c.roundRect(1098, 782, 116, 48, 8); c.fill();   // the painted "$5" lives here
    led('$' + this.bet, 1156, 806, 34);
    // lights
    const tt = nowSec;
    const cycle = won ? (.5 + .5 * Math.sin((t - RESULT_AT) * Math.PI * 2 / 1.1)) : (.15 + .1 * Math.sin(tt * 2));
    for (const [x, y] of [[382, 162], [1394, 163], [491, 696], [1283, 696]]) { c.save(); c.globalAlpha = cycle * (won ? .7 : .22); const g = c.createRadialGradient(x, y, 1, x, y, won ? 48 : 22); g.addColorStop(0, '#ffde7499'); g.addColorStop(.45, '#ff392e66'); g.addColorStop(1, '#ff220000'); c.fillStyle = g; c.fillRect(x - 50, y - 50, 100, 100); c.restore(); }
    if (jack) {
      for (const x of [309, 1467]) { c.save(); c.globalAlpha = .45 + .3 * Math.sin((t - RESULT_AT) * 4 + (x === 309 ? 0 : Math.PI)); const g = c.createRadialGradient(x, 82, 0, x, 82, 85); g.addColorStop(0, '#ffbf5999'); g.addColorStop(1, '#ff240000'); c.fillStyle = g; c.fillRect(x - 85, -3, 170, 170); c.restore(); }
      c.strokeStyle = '#fbd36b'; c.lineWidth = 2 + cycle * 2; c.shadowColor = '#ffbb34'; c.shadowBlur = 18 * cycle; c.strokeRect(411, 369, 958, 133); c.shadowBlur = 0;
      for (let k = 0; k < 30; k++) { let u = ((t - RESULT_AT) * .6 - k * .025) % 1.6; if (u < 0 || u > 1.4) continue; const x = 887 + Math.sin(k * 2.39) * (100 + u * 480), y = 470 - u * 190 + u * u * 130; c.globalAlpha = Math.max(0, 1 - u / 1.4) * .75; c.fillStyle = '#f9d47d'; c.fillRect(x, y, 3 + (k % 3), 3 + (k % 3)); }
      c.globalAlpha = 1;
    }
    if (won) { c.strokeStyle = '#f3d489'; c.lineWidth = 3; c.shadowColor = '#e8ae32'; c.shadowBlur = 10 * cycle; c.beginPath(); c.roundRect(656, 670, 466, 46, 8); c.stroke(); c.shadowBlur = 0; }
    {                                                               // the painted SPIN reads STOP; lit while a reel can still be braked
      const g = c.createRadialGradient(1465, 771, 4, 1465, 771, 72); g.addColorStop(0, '#fdeec3'); g.addColorStop(1, '#fcdb95');
      c.fillStyle = g; c.beginPath(); c.ellipse(1466, 771, 76, 27, 0, 0, Math.PI * 2); c.fill();
      const live = s && !settled && s.reels.some((_, i) => this.cruising(i, t));
      c.font = 'bold 40px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = live ? '#c4161c' : '#8a6d45'; if (live) { c.shadowColor = '#ff6a5a'; c.shadowBlur = 6; } c.fillText('STOP', 1465, 773); c.shadowBlur = 0;
    }
    if (pull > .05) { c.save(); c.globalAlpha = pull * .22; c.fillStyle = '#4b150a'; c.beginPath(); c.ellipse(1464, 774, 87, 56, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.restore();
  }

  // ---------- paytable / bust / leave ----------
  showPaytable() {
    modal({
      title: 'Hot for Jackpot · paytable', dismissable: true,
      body: (el) => {
        el.append(h('p', { class: 'muted small' }, 'One payline, three reels. Pays are multiples of your bet.'));
        el.append(h('div', { class: 'paytable' }, PAYTABLE.map((row) => h('div', { class: 'pt-row' + (row.jackpot ? ' jack' : '') }, h('span', {}, row.name + (row.jackpot ? ' — JACKPOT' : '')), h('b', {}, (row.mult >= 1 ? row.mult + '×' : Math.round(row.mult * 100) + '% back'))))));
        el.append(h('p', { class: 'muted small' }, `At ${fmt$(this.bet)} a spin the jackpot pays ${fmt$(this.bet * 25)}.`));
      },
      buttons: [{ label: 'Rock on', kind: 'primary' }],
    });
  }

  bustModal() {
    const t = this.table;
    const amount = Math.min(Math.max(t.minBuy, Math.round(t.maxBuy / 4)), bank.state.bank);
    const canRebuy = bank.state.bank >= t.minBuy;
    return modal({
      title: "You're out of credits", dismissable: false,
      body: (el) => el.append(h('p', {}, canRebuy ? `Put another ${fmt$(amount)} in the machine? (Bank: ${fmt$(bank.state.bank)})` : 'The machine took the last of it. Time to see Ken.')),
      buttons: [{ label: 'Back to the lobby', kind: 'ghost', value: 'leave' }, canRebuy ? { label: 'Buy more credits', kind: 'primary', value: 'rebuy' } : null].filter(Boolean),
    }).then((c) => { if (c === 'rebuy') { bank.buyIn(amount, t.id); this.stack += amount; audio.play('chips'); } else this.leave(); });
  }

  async requestLeave() {
    audio.play('tap');
    if (!this.spinning) return this.leave();
    const choice = await askLeave({ text: 'The reels are still spinning.', afterLabel: 'After this spin', nowLabel: 'Leave now', nowNote: 'Leaving now forfeits this spin.' });
    if (choice === 'now') { this.spin = null; this.spinning = false; this.leave(); return; }
    this.leaving = choice === 'after';
  }

  async leave() {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.stopClips();
    const change = bank.cashOut(this.stack, this.table.id);
    if (change) {
      audio.play(change.up ? 'tierup' : 'tierdown');
      await modal({
        className: 'tier-change ' + (change.up ? 'up' : 'down'), dismissable: true,
        body: (el) => { el.append(creditCardEl(change.to, bank.state.playerName, { size: 'md' }), h('h2', {}, change.up ? 'Card upgraded!' : 'Card downgraded'), h('p', {}, change.up ? `Your bank hit ${fmt$(change.to.min)}. Welcome to ${change.to.name}.` : `Your bank fell below ${fmt$(change.from.min)}. You're back to ${change.to.name}.`)); },
        buttons: [{ label: change.up ? 'Nice' : 'Fine', kind: 'primary' }],
      });
    }
    this.onLeave();
  }
}

function loadImg(url) { return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function stopClip(a) { try { a?.pause(); } catch { /* ignore */ } }
