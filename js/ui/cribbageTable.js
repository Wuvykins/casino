// The cribbage table: one opponent across from you, a board along the top, your cards big along the bottom.
import { h, clear, sleep, modal, toast } from './dom.js';
import { cardEl, chipStackEl, portraitEl, creditCardEl, chooseDeckBack, askLeave, resultBanner } from './components.js';
import { Game, scorePlay, chooseDiscard, choosePlay, pegValue, TARGET } from '../core/cribbage.js';
import { RANK_LABEL, SUIT_GLYPH, cardKey, sameCard } from '../core/cards.js';
import { makeRng } from '../core/rng.js';
import { bank, fmt$ } from '../core/bank.js';
import { assets } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { characterById } from '../content/characters.js';
import { pickLine } from '../content/lines.js';
import { showSettings, noteButton, icon } from './lobby.js';

const HUMAN = 'you';
// Nic's painted board (assets/img/table/cribbage-board.png): where the holes are, as percentages of the picture.
// Each lane has two rows of 60 holes (twelve groups of five): 1-60 left to right along the top row, 61-120 back along the bottom.
const BOARD_ART = {   // Nic's walnut-and-emerald board (2026-09-22), re-drilled to 60 holes a row by tools/drill_board.py; % of the picture
  holeX: [17.245, 18.383, 19.522, 20.661, 21.799, 23.451, 24.589, 25.728, 26.867, 28.005, 29.657, 30.795, 31.934, 33.073, 34.212, 35.863, 37.001, 38.14, 39.279, 40.418, 42.069, 43.207, 44.346, 45.485, 46.624, 48.275, 49.413, 50.552, 51.691, 52.83, 54.481, 55.619, 56.758, 57.897, 59.036, 60.687, 61.825, 62.964, 64.103, 65.242, 66.893, 68.031, 69.17, 70.309, 71.448, 73.099, 74.237, 75.376, 76.515, 77.654, 79.305, 80.443, 81.582, 82.721, 83.86, 85.511, 86.649, 87.788, 88.927, 90.066],
  rowY: [23.94, 35.77, 63.38, 75.21],       // lane 0 out (0->60), lane 0 back (61->120), lane 1 out, lane 1 back
  start: [[{ x: 12.605, y: 31.55 }, { x: 14.339, y: 31.55 }], [{ x: 12.605, y: 70.99 }, { x: 14.339, y: 70.99 }]],   // the two START holes per lane, side by side
  plate: { left: 1.64, width: 9.18, tops: [9.93, 54.64], height: 34.1 },    // name plates: the painted boxes (30–133 / 165–268 of 302)
  window: { left: 91.85, width: 6.5, tops: [9.93, 53.97], height: 35.1 },   // score windows (30–135 / 163–270)
};

// Nic's cribbage SCENE (assets/img/table/felt-cribbage.jpg, the whole screen, board built in): the holes, measured
// off the picture as % of the screen. Each row has 61 holes (0..60, evenly spaced). Lane 0 = rows 1+2, lane 1 = rows 3+4:
// out along the top row of the pair (0 -> 60, left to right), back along the bottom row (60 -> 120, right to left).
const SCENE = {
  x0: 20.575, dx: 1.0569,                  // hole 0 and the spacing, % of width
  rowY: [15.22, 18.04, 21.42, 24.24],       // lane 0 out, lane 0 back, lane 1 out, lane 1 back (% of height)
  plate: { left: 9.7, width: 6.6, height: 5.2, tops: [14.0, 20.2] },   // name plates beside the pairs of rows
  window: { left: 16.6, width: 3.5, height: 5.2, tops: [14.0, 20.2] },  // score windows
};

export class CribbageTable {
  constructor(root, table, buyIn, opponentIds, { onLeave }) {
    this.root = root; this.table = table; this.onLeave = onLeave;
    this.rng = makeRng();
    chooseDeckBack(this.rng);
    this.char = characterById(opponentIds[0]);
    this.opp = this.char.id;
    this.stopped = false; this.leaving = false;
    this.stack = buyIn; this.oppStack = table.maxBuy;
    this.name = bank.state.playerName || 'You';
    this.games = 0; this.lastLoser = null;
    bank.buyIn(buyIn, table.id);
    bank.setAtTable({ tableId: table.id, stack: buyIn, opponents: [this.opp] });
    this.build();
  }
  get speed() { return bank.state.settings.aiSpeed || 1; }
  wait(ms) { return sleep(ms / this.speed); }
  nameOf(id) { return id === HUMAN ? this.name : this.char.name; }
  boardName(id) { return id === HUMAN ? 'You' : this.char.name; }   // scoreboard rows: 'You' vs the opponent (both can be called Nic)
  poss(id, lower = false) { return id === HUMAN ? (lower ? 'your' : 'Your') : `${this.char.name}'s`; }

  // ---------- DOM ----------
  build() {
    clear(this.root);
    this.el = h('div', { class: 'table-screen crib' });
    this.topbar = h('div', { class: 'topbar table-top' },
      h('button', { class: 'btn ghost small leave-btn', onClick: () => this.requestLeave() }, '‹ Leave table'),
      h('div', { class: 'tt-title' }, this.table.name),
      h('div', { class: 'topbar-bank' }, 'Bank ', h('b', { class: 'bank-amt' }, fmt$(bank.state.bank))),
    );
    this.felt = h('div', { class: 'felt' });
    // Nic's scene is the whole screen with the board painted in; without it, the poker felt and a drawn board
    this.scene = !!assets.bg(this.el, 'table.felt.cribbage');
    if (this.scene) this.el.classList.add('scene'); else assets.bg(this.felt, 'table.felt.holdem');
    // board
    this.boardEl = h('div', { class: 'cb-board' });
    this.buildBoard();
    // opponent
    this.portrait = portraitEl(this.char, { size: 'md' });
    this.oppPlate = h('div', { class: 'nameplate' }, h('div', { class: 'pname' }, this.char.name), h('div', { class: 'pstack' }, fmt$(this.oppStack)));
    this.bubble = h('div', { class: 'bubble' });
    this.oppEl = h('div', { class: 'cb-opp' }, this.portrait, this.oppPlate, this.bubble);
    this.oppHand = h('div', { class: 'cb-opp-hand' });
    // middle
    this.msgEl = h('div', { class: 'cb-msg' });
    this.pileEl = h('div', { class: 'cb-pile' });
    this.countEl = h('div', { class: 'cb-count' });
    this.centerEl = h('div', { class: 'cb-center' }, this.pileEl, this.countEl);
    this.deckEl = h('div', { class: 'cb-deck' });
    this.cribEl = h('div', { class: 'cb-crib' });
    this.dealerTag = h('div', { class: 'cb-dealer-tag' });
    // you
    this.handEl = h('div', { class: 'cb-hand' });
    this.youPlate = h('div', { class: 'nameplate you' }, h('div', { class: 'pname' }, this.name), h('div', { class: 'pstack' }, fmt$(this.stack)));
    this.oppHand.dataset.name = this.char.name;
    this.felt.append(this.oppEl, this.oppHand, this.msgEl, this.centerEl, this.deckEl, this.cribEl, this.dealerTag, this.handEl, this.youPlate);
    if (!this.scene) this.felt.prepend(this.boardEl);
    this.actionBar = h('div', { class: 'actionbar cb-actions hidden' });
    this.gearBtn = h('button', { class: 'gear-btn', title: 'Settings', onClick: () => { audio.play('tap'); showSettings(this.root, {}, { atTable: true }); } }, icon('gear'));
    this.el.append(this.topbar, this.felt, this.actionBar, this.gearBtn, noteButton(this.root));
    if (this.scene) this.el.append(this.boardEl);   // over the painted board (scene-board: in % of the whole screen; art: sized to cover it)
    this.root.append(this.el);
    this.unsubBank = bank.onChange(() => { const b = this.topbar.querySelector('.bank-amt'); if (b) b.textContent = fmt$(bank.state.bank); });
  }

  // Two lanes, each snaking 1–60 along the top row and 61–120 back along the bottom; 121 is the game hole.
  // With Nic's board art the pegs and labels are laid over the picture; without it the board is drawn in SVG.
  buildBoard() {
    const lanes = [HUMAN, this.opp];
    this.laneOf = (id) => lanes.indexOf(id);
    this.scoreEls = {}; this.pegEls = {};
    // Nic's own board art (cribbage-board.png, with his standing pegs) is the board even on the painted scene:
    // it's laid over the board painted into the picture. The scene's own hole map is only used without it.
    if (assets.bg(this.boardEl, 'table.crib.board')) { this.buildArtBoard(lanes); if (this.scene) this.boardEl.classList.add('on-scene'); return; }
    if (this.scene) { this.buildSceneBoard(lanes); return; }
    this.buildSvgBoard(lanes);
  }

  buildSceneBoard(lanes) {
    this.boardEl.classList.add('scene-board');
    const S = SCENE;
    const hx = (i) => S.x0 + S.dx * i;
    this.plateFit = (id) => { const n = this.boardName(id); return n.length > 7 ? n.slice(0, 7) : n; };
    this.holePos = (lane, s) => {
      const out = S.rowY[lane * 2], back = S.rowY[lane * 2 + 1];
      if (s < 0) return { x: hx(-1), y: out };            // the start slot, before hole 0
      if (s === 0) return { x: hx(0), y: out };
      if (s <= 60) return { x: hx(s), y: out };
      if (s <= 120) return { x: hx(120 - s), y: back };
      return { x: hx(-1), y: back };                       // 121: the game hole, just past the end of the track
    };
    for (const id of lanes) {
      const lane = this.laneOf(id);
      const mk = (cls) => {
        const p = h('div', { class: 'cb-peg ' + cls + (id === HUMAN ? ' you' : ' opp') });
        if (!assets.bg(p, id === HUMAN ? 'table.crib.peg.you' : 'table.crib.peg.opp')) p.classList.add('placeholder');
        const pos = this.holePos(lane, 0); p.style.left = pos.x + '%'; p.style.top = pos.y + '%';
        this.boardEl.append(p); return p;
      };
      this.pegEls[id] = { back: mk('back'), front: mk('front') };
      this.pegEls[id].back.style.left = hx(-1) + '%';       // the trailing peg waits in the start slot before hole 0
      this.boardEl.append(h('div', { class: 'cb-plate' + (id === HUMAN ? ' you' : ' opp'), style: { left: S.plate.left + '%', width: S.plate.width + '%', top: S.plate.tops[lane] + '%', height: S.plate.height + '%' }, title: this.nameOf(id) }, this.boardName(id)));
      this.boardEl.append(this.scoreEls[id] = h('div', { class: 'cb-window' + (id === HUMAN ? ' you' : ' opp'), style: { left: S.window.left + '%', width: S.window.width + '%', top: S.window.tops[lane] + '%', height: S.window.height + '%' } }, '0'));
    }
  }

  buildArtBoard(lanes) {
    this.boardEl.classList.add('art');
    this.el.classList.add('art-board');
    const A = BOARD_ART, n = A.holeX.length;
    // score -> position on the picture, in %
    this.holePos = (lane, s) => {
      const top = A.rowY[lane * 2], bot = A.rowY[lane * 2 + 1];
      if (s < 0) return A.start[lane][1];                  // the second START hole (the back peg before play)
      if (s === 0) return A.start[lane][0];
      if (s <= 60) return { x: A.holeX[Math.round((s - 1) / 59 * (n - 1))], y: top };
      if (s <= 120) return { x: A.holeX[n - 1 - Math.round((s - 61) / 59 * (n - 1))], y: bot };
      return A.start[lane][0];                              // 121: pegged out — home
    };
    for (const id of lanes) {
      const lane = this.laneOf(id);
      const mk = (cls) => {
        const p = h('div', { class: 'cb-peg ' + cls + (id === HUMAN ? ' you' : ' opp') });
        if (!assets.bg(p, id === HUMAN ? 'table.crib.peg.you' : 'table.crib.peg.opp')) p.classList.add('placeholder');
        const pos = this.holePos(lane, 0); p.style.left = pos.x + '%'; p.style.top = pos.y + '%';
        this.boardEl.append(p); return p;
      };
      this.pegEls[id] = { back: mk('back'), front: mk('front') };
      this.pegEls[id].back.style.left = this.holePos(lane, -1).x + '%';
      this.boardEl.append(h('div', { class: 'cb-plate' + (id === HUMAN ? ' you' : ' opp'), style: { left: A.plate.left + '%', width: A.plate.width + '%', top: A.plate.tops[lane] + '%', height: A.plate.height + '%' } }, this.boardName(id)));
      this.boardEl.append(this.scoreEls[id] = h('div', { class: 'cb-window' + (id === HUMAN ? ' you' : ' opp'), style: { left: A.window.left + '%', width: A.window.width + '%', top: A.window.tops[lane] + '%', height: A.window.height + '%' } }, '0'));
    }
  }

  buildSvgBoard(lanes) {
    const W = 1000, laneH = 44, pad = 8, rowH = 16;
    const H = pad * 2 + laneH * 2 + 6;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.classList.add('cb-board-svg');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0); bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('rx', 10); bg.setAttribute('class', 'board-wood');
    svg.append(bg);
    const x0 = 120, x1 = W - 90, step = (x1 - x0) / 59;
    this.holePos = (lane, n) => {
      const yTop = pad + lane * (laneH + 6) + 8, yBot = yTop + rowH + 8;
      if (n <= 0) return { x: x0 - step * 1.6, y: yTop + (rowH + 8) / 2 };
      if (n <= 60) return { x: x0 + (n - 1) * step, y: yTop };
      if (n <= 120) return { x: x1 - (n - 61) * step, y: yBot };
      return { x: x0 - step * 1.6, y: yBot }; // 121: game hole
    };
    for (let lane = 0; lane < 2; lane++) {
      for (let n = 1; n <= 121; n++) {
        const { x, y } = this.holePos(lane, n);
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', n === 121 ? 5 : 3.2);
        c.setAttribute('class', 'hole' + (n % 5 === 0 ? ' five' : '') + (n === 121 ? ' game' : ''));
        svg.append(c);
      }
      const s = this.holePos(lane, 0);
      const sc = document.createElementNS(ns, 'circle'); sc.setAttribute('cx', s.x); sc.setAttribute('cy', s.y); sc.setAttribute('r', 4); sc.setAttribute('class', 'hole start'); svg.append(sc);
      for (const n of (lane === 0 ? [15, 30, 45, 60] : [75, 90, 105, 120])) {
        const p = this.holePos(lane, n); const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', p.x); t.setAttribute('y', p.y + (n <= 60 ? -7 : 15)); t.setAttribute('class', 'hole-num'); t.textContent = n; svg.append(t);
      }
    }
    for (const id of lanes) {
      const lane = this.laneOf(id);
      const mk = (cls) => { const p = document.createElementNS(ns, 'circle'); p.setAttribute('r', 6); p.setAttribute('class', 'peg ' + cls + (id === HUMAN ? ' you' : ' opp')); svg.append(p); return p; };
      this.pegEls[id] = { back: mk('back'), front: mk('front') };
      const pos = this.holePos(lane, 0);
      for (const k of ['back', 'front']) { this.pegEls[id][k].setAttribute('cx', pos.x); this.pegEls[id][k].setAttribute('cy', pos.y); }
    }
    const labels = h('div', { class: 'cb-board-labels' },
      ...lanes.map((id) => h('div', { class: 'cb-lane-label' + (id === HUMAN ? ' you' : ' opp') }, h('span', { class: 'who' }, this.boardName(id)), this.scoreEls[id] = h('b', { class: 'sc' }, '0'))),
    );
    this.boardEl.append(svg, labels);
  }

  updatePegs(game) {
    for (const id of [HUMAN, this.opp]) {
      const hist = game.pegHistory[id];
      const front = hist[hist.length - 1], back = hist.length > 1 ? hist[hist.length - 2] : 0;
      const lane = this.laneOf(id);
      const f = this.holePos(lane, front); let b = this.holePos(lane, back);
      // never stack the two pegs on one hole
      for (let k = 1; k <= 3 && b.x === f.x && b.y === f.y && back - k >= -1; k++) b = this.holePos(lane, back - k);
      const put = (el, p) => { if (el instanceof SVGElement) { el.setAttribute('cx', p.x); el.setAttribute('cy', p.y); } else { el.style.left = p.x + '%'; el.style.top = p.y + '%'; } };
      put(this.pegEls[id].front, f); put(this.pegEls[id].back, b);
      this.scoreEls[id].textContent = String(game.scores[id]);
    }
  }

  say(text) { this.msgEl.textContent = text || ''; }
  talk(trigger, vars = {}, p = 1) {
    if (!this.rng.chance(Math.min(1, p * (this.char.persona?.chatty ?? 1)))) return false;
    const line = pickLine(this.char, trigger, { player: this.name, ...vars }, this.rng);
    if (!line) return false;
    audio.voice(this.char, line.file);
    this.bubble.textContent = line.text; this.bubble.classList.add('show');
    clearTimeout(this.bubbleT); this.bubbleT = setTimeout(() => this.bubble.classList.remove('show'), 2600);
  }
  updateStacks() { this.youPlate.lastChild.textContent = fmt$(this.stack); this.oppPlate.lastChild.textContent = fmt$(this.oppStack); }
  setActing(id) {
    this.oppEl.classList.toggle('acting', id === this.opp);
    this.youPlate.classList.toggle('acting', id === HUMAN);
  }
  showButtons(...btns) { clear(this.actionBar); this.actionBar.classList.remove('hidden'); this.actionBar.append(...btns); }
  hideButtons() { this.actionBar.classList.add('hidden'); clear(this.actionBar); }
  // Shows one button and waits for it. `alsoTap` = other elements that count as pressing it (e.g. the count panel).
  // Between hands: a big gold Deal in the middle of the empty felt (the corner button on the plain table).
  waitDeal() {
    if (!this.scene) return this.waitButton('Deal');
    return new Promise((resolve) => {
      const btn = h('button', { class: 'act raise cb-deal-mid', onClick: () => { audio.play('tap'); btn.remove(); this.el.classList.remove('deal-ready'); resolve(); } }, 'Deal');
      this.felt.append(btn);
      this.el.classList.add('deal-ready');                          // the status line ("Kurtis deals first") sits right under the button
      requestAnimationFrame(() => btn.classList.add('show'));
    });
  }
  waitButton(label, cls = 'raise', alsoTap = []) {
    return new Promise((resolve) => {
      const go = () => { audio.play('tap'); this.hideButtons(); for (const el of alsoTap) { el.removeEventListener('click', go); el.classList.remove('tappable'); } resolve(); };
      this.showButtons(h('button', { class: 'act ' + cls, onClick: go }, label));
      for (const el of alsoTap) { el.addEventListener('click', go); el.classList.add('tappable'); }
    });
  }
  pointsPop(id, points, reason) {
    const mine = id === HUMAN;
    const pop = h('div', { class: 'cb-points' + (mine ? ' you' : ' opp') },
      h('span', { class: 'who' }, mine ? 'YOUR POINTS' : `${this.char.name.toUpperCase()}'S POINTS`),
      h('span', { class: 'pts' }, `+${points}`),
      h('span', { class: 'why' }, reason));
    this.felt.append(pop);
    requestAnimationFrame(() => pop.classList.add('show'));
    setTimeout(() => { pop.classList.remove('show'); setTimeout(() => pop.remove(), 300); }, 1900);
  }

  // ---------- main loop ----------
  async run() {
    audio.play('shuffle');
    this.say(`Welcome, ${this.name}. First to 121.`);
    await this.wait(400); this.talk('greet', {}, 0.7);
    while (!this.stopped) {
      if (this.stack < this.table.stake) {
        const c = await this.bustModal();
        if (c !== 'rebuy') { this.leave(); break; }
      }
      if (this.leaving) { this.leave(); break; }
      await this.playGame();
      if (this.stopped) break;
    }
  }

  async playGame() {
    // the loser of the last game deals; the first game is a cut
    const dealer = this.lastLoser || (this.rng.chance(0.5) ? HUMAN : this.opp);
    const game = new Game({ rng: this.rng, players: [HUMAN, this.opp], dealer });
    this.game = game; this.cursor = 0; this.games++;
    this.updatePegs(game);
    this.stakeNote(game);
    await this.wait(400);
    this.say(`${this.nameOf(dealer)} deal${dealer === HUMAN ? '' : 's'} first.`);
    await this.waitDeal();
    while (game.phase !== 'over' && !this.stopped) {
      await this.playHand(game);
      if (this.stopped || game.phase === 'over') break;
      if (this.leaving) this.say('Finishing the game, then we go.');
      else this.say(`${this.nameOf(game.pone)} deal${game.pone === HUMAN ? '' : 's'} next.`);   // the count is done; the deal passes to the pone
      await this.waitDeal();
    }
    if (this.stopped) return;
    await this.gameOver(game);
  }

  stakeNote() { this.dealerTag.textContent = `${fmt$(this.table.stake)} a game`; }

  async playHand(game) {
    game.deal();
    this.clearHandUI();
    this.renderDealerTag(game);
    audio.play('shuffle');
    await this.wait(300);
    await this.dealAnimation(game);
    // discard
    this.say(`Two to ${this.poss(game.dealer, true)} crib.`);
    const oppThrow = chooseDiscard(game.hands[this.opp], game.dealer === this.opp, this.char.persona, this.rng);
    const mine = await this.awaitDiscard(game);
    game.discard(HUMAN, mine);
    await this.animateDiscard(HUMAN, mine);
    await this.wait(300);
    game.discard(this.opp, oppThrow);
    await this.animateDiscard(this.opp, oppThrow);
    await this.drain(game);
    if (game.phase === 'over') return;
    // pegging
    this.renderHand(game, { pegging: true });
    while (game.phase === 'pegging' && !this.stopped) {
      const who = game.turn;
      this.setActing(who);
      let card;
      if (who === HUMAN) card = await this.awaitPlay(game);
      else { await this.wait(650 + this.rng.next() * 600); card = choosePlay(game, this.opp, this.char.persona, this.rng); }
      if (this.stopped) return;
      game.play(who, card);
      await this.drain(game);
    }
    this.setActing(null);
    if (game.phase === 'over') return;
    // the show
    await this.wait(400);
    let s;
    while ((s = game.showNext())) {
      await this.showHand(game, s);
      await this.drain(game);
      if (game.phase === 'over') return;
    }
  }

  // ---------- events from the engine ----------
  async drain(game) {
    while (this.cursor < game.events.length) {
      const ev = game.events[this.cursor++];
      switch (ev.type) {
        case 'cut': {
          this.renderDeck(game);
          audio.play('flip');
          this.say(`${this.nameOf(game.pone)} cut${game.pone === HUMAN ? '' : 's'} the ${cardName(ev.card)}.`);
          await this.wait(600);
          break;
        }
        case 'play': {
          const el = cardEl(ev.card); el.classList.add('dealt');
          this.pileEl.append(el);
          this.countEl.textContent = String(ev.count);
          audio.play('deal');
          if (ev.playerId === this.opp) { const back = this.oppHand.firstChild; if (back) back.remove(); }
          else this.renderHand(game, { pegging: true });
          await this.wait(ev.points ? 250 : 350);
          break;
        }
        case 'score': {
          this.updatePegs(game);
          this.pointsPop(ev.playerId, ev.points, ev.reason);
          audio.play(ev.playerId === HUMAN ? 'chip' : 'tap');
          if (ev.playerId === this.opp && ev.peg) this.talk(ev.reason.startsWith('Thirty') ? 'cribThirtyOne' : 'cribPeg', {}, 0.4);
          if (ev.reason === 'His heels' && ev.playerId === this.opp) this.talk('cribHeels');
          await this.wait(ev.peg ? 700 : 400);
          break;
        }
        case 'go': {
          this.say(ev.playerId === HUMAN ? 'You have no play. Go.' : `${this.char.name}: "Go."`);
          if (ev.playerId === this.opp) this.talk('cribGo');
          audio.play('check');
          await this.wait(700);
          break;
        }
        case 'reset': {
          const cards = [...this.pileEl.children];
          cards.forEach((c) => c.classList.add('spent'));
          await this.wait(500);
          clear(this.pileEl); this.countEl.textContent = '';
          break;
        }
        case 'turn': {
          if (ev.playerId === HUMAN && game.legalPlays(HUMAN).length) this.say('Your play.');
          break;
        }
        case 'showStart': { this.say('Counting hands.'); clear(this.pileEl); this.countEl.textContent = ''; break; }
        case 'over': { this.updatePegs(game); break; }
        default: break;
      }
    }
  }

  // ---------- rendering ----------
  clearHandUI() {
    clear(this.pileEl); this.countEl.textContent = ''; clear(this.oppHand); clear(this.deckEl); clear(this.cribEl); clear(this.handEl);
    this.setActing(null);
  }
  renderDealerTag(game) {
    this.dealerTag.textContent = `${this.poss(game.dealer)} crib · ${fmt$(this.table.stake)} a game`;
    this.cribEl.classList.toggle('mine', game.dealer === HUMAN);
  }
  renderDeck(game) {
    clear(this.deckEl);
    const back = cardEl(null, { faceDown: true }); back.classList.add('deckcard');
    this.deckEl.append(back);
    if (game.starter) { const st = cardEl(game.starter); st.classList.add('starter', 'dealt'); this.deckEl.append(st); }
  }
  async dealAnimation(game) {
    this.renderDeck(game);
    for (let i = 0; i < 6; i++) {
      this.oppHand.append(cardEl(null, { faceDown: true, small: true }));
      audio.play('deal'); await this.wait(90);
      this.renderHand(game, { upTo: i + 1 });
      audio.play('deal'); await this.wait(90);
    }
    this.renderHand(game);
  }
  renderHand(game, { pegging = false, upTo = 99, selected = [] } = {}) {
    clear(this.handEl);
    const legal = pegging ? game.legalPlays(HUMAN) : null;
    const cards = game.hands[HUMAN].slice().sort((a, b) => runRankForSort(a) - runRankForSort(b) || a.s - b.s).slice(0, upTo);
    for (const c of cards) {
      const el = cardEl(c); el.dataset.key = cardKey(c);
      if (selected.some((s) => sameCard(s, c))) el.classList.add('sel');
      if (legal && !legal.some((l) => sameCard(l, c))) el.classList.add('dim');
      this.handEl.append(el);
    }
  }
  renderCrib(game) {
    clear(this.cribEl);
    const n = game.crib.length;
    const lbl = h('div', { class: 'cb-crib-label' }, game.dealer ? `${this.poss(game.dealer, true)} crib` : 'Crib');
    if (this.scene) {
      // painted table: label above a little fanned stack
      const stack = h('div', { class: 'cb-crib-stack' });
      for (let i = 0; i < n; i++) { const b = cardEl(null, { faceDown: true, small: true }); b.style.setProperty('--i', i); stack.append(b); }
      if (n) this.cribEl.append(lbl, stack);
    } else {
      for (let i = 0; i < n; i++) { const b = cardEl(null, { faceDown: true, small: true }); b.style.setProperty('--i', i); this.cribEl.append(b); }
      this.cribEl.append(lbl);
    }
  }

  // ---------- human input ----------
  awaitDiscard(game) {
    return new Promise((resolve) => {
      let selected = [];
      const btn = h('button', { class: 'act raise', disabled: true, onClick: () => { audio.play('chips'); this.handEl.onclick = null; this.hideButtons(); resolve(selected); } }, 'Send to crib');
      const refresh = () => { this.renderHand(game, { selected }); btn.disabled = selected.length !== 2; btn.textContent = selected.length === 2 ? 'Send to crib' : `Pick ${2 - selected.length} more`; };
      this.handEl.onclick = (e) => {
        const el = e.target.closest('.pcard'); if (!el) return;
        const c = game.hands[HUMAN].find((x) => cardKey(x) === el.dataset.key); if (!c) return;
        audio.play('tap');
        if (selected.some((s) => sameCard(s, c))) selected = selected.filter((s) => !sameCard(s, c));
        else if (selected.length < 2) selected.push(c);
        else { selected.shift(); selected.push(c); }
        refresh();
      };
      this.showButtons(btn);
      refresh();
    });
  }
  async animateDiscard(id, cards) {
    if (id === HUMAN) { this.renderHand(this.game); audio.play('deal'); }
    else { for (let i = 0; i < 2; i++) { const back = this.oppHand.lastChild; if (back) back.remove(); } audio.play('deal'); }
    this.renderCrib(this.game);
    await this.wait(250);
  }
  awaitPlay(game) {
    return new Promise((resolve) => {
      audio.play('yourturn');
      this.renderHand(game, { pegging: true });
      this.handEl.onclick = (e) => {
        const el = e.target.closest('.pcard'); if (!el || el.classList.contains('dim')) return;
        const c = game.hands[HUMAN].find((x) => cardKey(x) === el.dataset.key); if (!c) return;
        this.handEl.onclick = null;
        resolve(c);
      };
    });
  }

  // ---------- the show: count a hand out loud ----------
  async showHand(game, s) {
    // Nic's fixed count panel: the cards on the left with ONE line describing the combination being counted (it
    // replaces itself, so the panel never grows), the running total anchored on the right. 800 ms per combination,
    // the total ticks up 200 ms in. When it's done, the left says how many combinations there were and the right
    // shows a short category summary (Fifteens ×7 14 / Pairs ×3 6). "Show breakdown" lists every combination.
    const title = s.who === 'crib' ? `${this.poss(s.playerId)} crib` : `${this.poss(s.playerId)} hand`;
    const cardsRow = h('div', { class: 'cb-show-cards' });
    const sorted = s.cards.slice().sort((a, b) => runRankForSort(a) - runRankForSort(b) || a.s - b.s);
    const els = sorted.map((c) => { const el = cardEl(c); el.dataset.key = cardKey(c); cardsRow.append(el); return el; });
    const stEl = cardEl(game.starter); stEl.classList.add('starter'); stEl.dataset.key = cardKey(game.starter); cardsRow.append(stEl);
    const name = (c) => RANK_LABEL[c.r] + SUIT_GLYPH[c.s];
    const items = s.items;
    const n = items.length;
    const expr = h('div', { class: 'cs-expr' }, n ? 'Ready to count' : (s.who === 'crib' ? 'Nothing in the crib' : 'Nineteen'));
    const note = h('div', { class: 'cs-note' }, n ? 'Watch the highlighted cards' : 'No scoring combinations');
    const dots = h('div', { class: 'cs-dots' });   // one dot per combination, added as each lands
    const left = h('div', { class: 'cs-left' }, h('div', { class: 'cs-title' }, title), cardsRow, expr, note, dots);
    const cap = h('div', { class: 'cs-cap' }, 'COUNTING');
    const label = h('div', { class: 'cs-label' }, n ? 'Counting soon' : 'Nothing');
    const step = h('div', { class: 'cs-step' }, '');
    const totalEl = h('div', { class: 'cs-total' }, '0');
    const summary = h('div', { class: 'cs-summary' });
    const right = h('div', { class: 'cs-right' }, cap, label, step, summary, totalEl, h('div', { class: 'cs-pts' }, 'POINTS'));
    const foot = h('div', { class: 'cs-foot' }, '0 scoring combinations counted');
    const breakdownBtn = h('button', { class: 'cs-break' }, 'Show breakdown');
    const breakdown = h('div', { class: 'cs-breakdown' });
    const panel = h('div', { class: 'cb-show cs' }, left, right, foot, breakdownBtn, breakdown);
    for (const old of this.felt.querySelectorAll('.cb-points')) old.remove();   // a lingering pegging pop would sit on the panel
    this.felt.append(panel);
    requestAnimationFrame(() => panel.classList.add('show'));
    audio.play('flip');
    await this.wait(800);
    let running = 0, credited = 0;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const on = new Set((it.cards || []).map(cardKey));
      for (const el of [...els, stEl]) { el.classList.toggle('hl', on.has(el.dataset.key)); el.classList.toggle('dim', on.size > 0 && !on.has(el.dataset.key)); }
      expr.textContent = it.cards?.length ? it.cards.map(name).join(' + ') : it.name;
      note.textContent = it.name === 'Fifteen' ? 'These cards total 15' : it.name === 'Pair' ? 'These cards make a pair' : it.name.startsWith('Run') ? 'These cards run in sequence' : it.name === 'Flush' ? 'All one suit' : it.name === 'His nobs' ? 'Jack of the starter\u2019s suit' : `${it.name} scores ${it.points}`;
      label.textContent = `${it.name} for ${it.points}`; label.classList.remove('in'); void label.offsetWidth; label.classList.add('in');
      step.textContent = `Combination ${i + 1}`;   // no total ahead of time — that's the fun part
      await this.wait(200);
      running += it.points; credited++;
      totalEl.textContent = String(running); totalEl.classList.remove('pulse'); void totalEl.offsetWidth; totalEl.classList.add('pulse');
      dots.append(h('i', { class: 'on' }));
      foot.textContent = `${credited} scoring combination${credited === 1 ? '' : 's'} counted`;
      audio.play('chip');
      await this.wait(600);
    }
    for (const el of [...els, stEl]) el.classList.remove('hl', 'dim');
    // done
    panel.classList.add('done');
    cap.textContent = 'HAND TOTAL';
    expr.textContent = n ? 'All combinations counted' : (s.who === 'crib' ? 'Nothing in the crib' : 'Nineteen \u2014 nothing');
    note.textContent = n ? `${n} scoring combination${n === 1 ? '' : 's'}` : 'No points this time';
    foot.textContent = 'Counting complete';
    const cats = new Map();
    for (const it of items) { const k = it.name === 'Fifteen' ? 'Fifteens' : it.name === 'Pair' ? 'Pairs' : it.name.startsWith('Run') ? 'Runs' : it.name; const c = cats.get(k) || { count: 0, points: 0 }; c.count++; c.points += it.points; cats.set(k, c); }
    for (const [k, v] of cats) summary.append(h('div', { class: 'cs-cat' }, h('span', {}, `${k} \u00d7${v.count}`), h('b', {}, String(v.points))));
    totalEl.textContent = String(s.total);
    if (n) {
      // the full list, two columns, ten per page
      items.forEach((it) => breakdown.append(h('div', { class: 'cs-row' }, h('span', {}, it.cards?.length ? it.cards.map(name).join(' + ') : it.name), h('b', {}, '+' + it.points))));
      breakdownBtn.addEventListener('click', (e) => { e.stopPropagation(); audio.play('tap'); const on = panel.classList.toggle('breakdown'); breakdownBtn.textContent = on ? 'Back to cards' : 'Show breakdown'; });
    } else breakdownBtn.remove();
    if (s.playerId === this.opp) {
      if (s.who === 'crib') { if (s.total >= 8) this.talk('cribGoodCrib'); else if (s.total <= 1) this.talk('cribBadCrib'); }
      else if (s.total >= 12) this.talk('cribGoodHand'); else if (s.total === 0) this.talk('cribBadHand');
    } else if (s.who !== 'crib' && s.total <= 2) this.talk('tauntCribbage', {}, 0.35);
    await this.wait(600);
    // apply the points on the board now (engine already added them)
    this.updatePegs(game);
    if (s.total) this.pointsPop(s.playerId, s.total, s.who === 'crib' ? 'Crib' : 'Hand');
    await this.waitButton(s.who === 'crib' ? 'Done' : 'Next', 'call', [panel]);   // tapping the panel moves on too
    panel.classList.remove('show'); setTimeout(() => panel.remove(), 250);
  }

  // ---------- game over, money ----------
  async gameOver(game) {
    const r = game.result;
    const mult = 1 + r.skunk;
    const amount = Math.min(this.table.stake * mult, r.loser === HUMAN ? this.stack : this.oppStack);
    const humanWon = r.winner === HUMAN;
    if (humanWon) { this.stack += amount; this.oppStack -= amount; } else { this.stack -= amount; this.oppStack += amount; }
    this.updateStacks();
    this.lastLoser = r.loser;
    const label = r.skunk === 2 ? 'Double skunk!' : r.skunk === 1 ? 'Skunk!' : null;
    const tail = label ? ' — a ' + label.toLowerCase().replace('!', '') : '';
    this.say(humanWon ? `You win the game${tail}!` : `${this.char.name} wins the game${tail}.`);
    if (humanWon) this.talk(r.skunk ? 'cribGotSkunked' : 'cribGameLose'); else this.talk(r.skunk ? 'cribSkunked' : 'cribGameWin');
    bank.recordHand({ won: humanWon, showdown: false, pot: amount, net: humanWon ? amount : -amount, handName: humanWon && r.skunk ? (r.skunk === 2 ? 'Double skunk' : 'Skunk') : null, handScore: humanWon ? r.skunk : 0 });
    bank.setAtTable({ tableId: this.table.id, stack: this.stack, opponents: [this.opp] });
    if (humanWon) { audio.play(r.skunk ? 'bigwin' : 'win'); await this.wait(300); if (r.skunk) await this.winBanner(amount, label, true); else await resultBanner(this.el, { type: 'win', amount, caption: '\u2660   GAME WON   \u2660', hold: 2600 }); }
    else { audio.play('lose', { volume: 0.4 }); await this.wait(300); await resultBanner(this.el, { type: 'lose', amount: -amount, title: `${this.char.name} wins`, caption: label ? label.toUpperCase().replace('!', '') : 'GAME OVER', hold: 2600 }); }
    const choice = await modal({
      title: humanWon ? 'You won!' : `${this.char.name} won`, dismissable: false,
      body: (el) => el.append(
        h('p', { class: 'big' }, `${game.scores[HUMAN]} – ${game.scores[this.opp]}`),
        h('p', {}, label ? `${label} That pays ${mult}× the stake.` : 'Stake paid.'),
        h('p', { class: humanWon ? 'pos' : 'neg' }, (humanWon ? '+' : '−') + fmt$(amount)),
      ),
      buttons: [{ label: 'Leave table', kind: 'ghost', value: 'leave' }, { label: 'Play again', kind: 'primary', value: 'again', disabled: this.leaving }],
    });
    if (choice === 'leave') this.leaving = true;
  }

  winBanner(amount, label, big) {
    return new Promise((resolve) => {
      const banner = h('div', { class: 'win-banner' + (big ? ' big' : '') },
        h('div', { class: 'wb-title' }, big ? label.toUpperCase() : 'You win!'),
        chipStackEl(amount, { maxChips: big ? 20 : 12, label: false }),
        h('div', { class: 'wb-amount' }, '+' + fmt$(amount)),
      );
      if (big) for (let i = 0; i < 16; i++) banner.append(h('i', { class: 'spark', style: { '--x': (Math.random() * 100).toFixed(0) + '%', '--d': (Math.random() * .8).toFixed(2) + 's', '--c': ['#e6c36a', '#fff', '#8fe0a2', '#f0a0a0'][i % 4] } }));
      this.felt.append(banner);
      requestAnimationFrame(() => banner.classList.add('show'));
      setTimeout(() => { banner.classList.remove('show'); setTimeout(() => { banner.remove(); resolve(); }, 300); }, big ? 2400 : 1700);
    });
  }

  bustModal() {
    const t = this.table; const b = bank.state.bank;
    const canRebuy = b >= t.minBuy;
    const max = Math.min(t.maxBuy, b);
    let amount = max;
    return modal({
      title: "You can't cover the stake", dismissable: false,
      body: (el, close) => {
        el.append(h('p', {}, canRebuy ? `Take more out of the bank? You have ${fmt$(b)}.` : b > 0 ? `You have ${fmt$(b)} in the bank — not enough for this table's ${fmt$(t.minBuy)} minimum.` : 'And the bank is empty. Ken is in the lobby.'));
        if (canRebuy) {
          const amt = h('div', { class: 'big' }, fmt$(amount));
          const slider = h('input', { type: 'range', min: t.minBuy, max, step: t.stake, value: amount });
          slider.addEventListener('input', () => { amount = +slider.value; amt.textContent = fmt$(amount); });
          el.append(amt, slider);
        }
        el.append(h('div', { class: 'modal-buttons' },
          h('button', { class: 'btn ghost', onClick: () => close('leave') }, 'Back to the lobby'),
          canRebuy ? h('button', { class: 'btn primary', onClick: () => { bank.buyIn(amount, t.id); this.stack += amount; this.updateStacks(); audio.play('chips'); close('rebuy'); } }, 'Rebuy') : null,
        ));
      },
    });
  }

  async requestLeave() {
    audio.play('tap');
    // between games (or before the first deal) we can go right away
    if (!this.game || this.game.phase === 'over' || this.game.phase === 'new') {
      this.leaving = true;
      const btn = this.actionBar.querySelector('button');
      if (btn && /Deal/.test(btn.textContent)) { this.hideButtons(); this.leave(); }
      return;
    }
    const choice = await askLeave({
      text: `A game is in progress (${this.game.scores[HUMAN]} – ${this.game.scores[this.opp]}).`,
      afterLabel: 'Finish this game', nowLabel: 'Leave now',
      nowNote: `Leaving now counts as a loss: ${fmt$(this.table.stake)} goes to ${this.char.name}.`,
    });
    if (choice === 'now') { this.forfeit(); this.leave(); return; }
    this.leaving = choice === 'after';
    if (this.leaving) toast('Leaving after this game.');
  }
  forfeit() {
    const amount = Math.min(this.table.stake, this.stack);
    this.stack -= amount; this.oppStack += amount;
    bank.recordHand({ won: false, showdown: false, pot: amount, net: -amount, handName: null, handScore: 0 });
  }

  async leave() {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubBank?.();
    const stack = this.stack;
    const change = bank.cashOut(stack, this.table.id);
    if (change) {
      audio.play(change.up ? 'tierup' : 'tierdown');
      await modal({
        className: 'tier-change ' + (change.up ? 'up' : 'down'), dismissable: true,
        body: (el) => {
          el.append(creditCardEl(change.to, bank.state.playerName, { size: 'md' }), h('h2', {}, change.up ? 'Card upgraded!' : 'Card downgraded'),
            h('p', {}, change.up ? `Your bank hit ${fmt$(change.to.min)}. Welcome to ${change.to.name}.` : `Your bank fell below ${fmt$(change.from.min)}. You're back to ${change.to.name}.`));
        },
        buttons: [{ label: change.up ? 'Nice' : 'Fine', kind: 'primary' }],
      });
    }
    this.onLeave({ stack });
  }
  // app.js snapshots this on pagehide
  get human() { return { stack: this.stack }; }
}

const runRankForSort = (c) => (c.r === 14 ? 1 : c.r);
const NAMES = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const SUITN = ['spades', 'hearts', 'diamonds', 'clubs'];
function cardName(c) { return `${NAMES[c.r] || c.r} of ${SUITN[c.s]}`; }
