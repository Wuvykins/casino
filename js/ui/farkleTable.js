// The farkle table: one to three of the family across from you, six big dice in the middle.
import { h, clear, sleep, modal, toast } from './dom.js';
import { chipStackEl, portraitEl, creditCardEl } from './components.js';
import { Game, scoreSelection, chooseKeep, shouldBank, bestKeep, TARGET, ENTRY } from '../core/farkle.js';
import { makeRng } from '../core/rng.js';
import { bank, fmt$ } from '../core/bank.js';
import { assets } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { characterById } from '../content/characters.js';
import { pickLine } from '../content/lines.js';
import { showSettings } from './lobby.js';

const HUMAN = 'you';
const OPP_SPOTS = { 1: [50], 2: [32, 68], 3: [25, 50, 75] };
// where the dice land, as % of the felt (inside the rail, left of the THIS TURN panel)
const ZONE = { x0: 26, x1: 64, y0: 46, y1: 62 };
const fmtN = (n) => n.toLocaleString('en-US');

export class FarkleTable {
  constructor(root, table, buyIn, opponentIds, { onLeave }) {
    this.root = root; this.table = table; this.onLeave = onLeave;
    this.rng = makeRng();
    this.opps = opponentIds.slice(0, 3).map((id) => characterById(id));
    this.stopped = false; this.leaving = false;
    this.stack = buyIn;
    this.oppStacks = Object.fromEntries(this.opps.map((c) => [c.id, table.maxBuy]));
    this.name = bank.state.playerName || 'You';
    this.games = 0; this.lastWinner = null;
    bank.buyIn(buyIn, table.id);
    bank.setAtTable({ tableId: table.id, stack: buyIn, opponents: this.opps.map((c) => c.id) });
    this.build();
  }
  get speed() { return bank.state.settings.aiSpeed || 1; }
  wait(ms) { return sleep(ms / this.speed); }
  charOf(id) { return this.opps.find((c) => c.id === id); }
  nameOf(id) { return id === HUMAN ? this.name : this.charOf(id).name; }
  get human() { return { stack: this.stack }; }

  // ---------- DOM ----------
  build() {
    clear(this.root);
    this.el = h('div', { class: 'table-screen fk' });
    this.topbar = h('div', { class: 'topbar table-top' },
      h('button', { class: 'btn ghost small', onClick: () => this.requestLeave() }, '‹ Leave table'),
      h('div', { class: 'tt-title fk-title' }, h('b', {}, 'FARKLE'), h('small', {}, `${fmt$(this.table.stake)} a game · First to ${fmtN(TARGET)}`)),
      h('button', { class: 'btn ghost small', onClick: () => { audio.play('tap'); this.showRules(); } }, 'Rules'),
      h('div', { class: 'topbar-bank' }, 'Bank ', h('b', { class: 'bank-amt' }, fmt$(bank.state.bank))),
    );
    this.felt = h('div', { class: 'felt' });
    // the farkle scene is one picture (room + table); it goes behind the whole screen, top bar included
    if (!assets.bg(this.el, 'table.felt.farkle')) assets.bg(this.felt, 'table.felt.holdem');
    this.seatEls = {};
    const spots = OPP_SPOTS[this.opps.length] || OPP_SPOTS[3];
    this.opps.forEach((c, i) => {
      const portrait = portraitEl(c, { size: 'md' });
      const plate = h('div', { class: 'nameplate' }, h('div', { class: 'pname' }, c.name), h('div', { class: 'pscore' }, '0'), h('div', { class: 'pstack' }, fmt$(this.oppStacks[c.id])));
      const bubble = h('div', { class: 'bubble' });
      const seat = h('div', { class: 'fk-seat' + (spots[i] > 60 ? ' right' : ''), style: { left: spots[i] + '%' } }, portrait, plate, bubble);
      this.felt.append(seat);
      this.seatEls[c.id] = { seat, portrait, plate, bubble, scoreEl: plate.children[1] };
    });
    this.youPlate = h('div', { class: 'nameplate you' }, h('div', { class: 'pname' }, this.name), h('div', { class: 'pscore' }, '0'), h('div', { class: 'pstack' }, fmt$(this.stack)));
    this.seatEls[HUMAN] = { plate: this.youPlate, scoreEl: this.youPlate.children[1] };
    this.youPlate.classList.add('fk-you');
    this.youPlate.prepend(h('div', { class: 'fk-avatar' }, (this.name[0] || '?').toUpperCase()));
    this.youPlate.append(h('div', { class: 'fk-yourturn' }, 'YOUR TURN'));
    this.msgEl = h('div', { class: 'fk-msg' });
    this.keptEl = h('div', { class: 'fk-kept' }, h('span', { class: 'fk-kept-label' }, 'KEPT DICE'), this.keptRow = h('div', { class: 'fk-kept-row' }));
    this.trayEl = h('div', { class: 'fk-tray' });
    this.turnEl = h('div', { class: 'fk-turn' }, h('span', { class: 'fk-turn-label' }, 'THIS TURN'), this.turnNum = h('b', {}, '0'));
    this.cupEl = h('div', { class: 'fk-cup' });
    if (!assets.bg(this.cupEl, 'farkle.cup')) this.cupEl.classList.add('placeholder');
    this.felt.append(this.msgEl, this.trayEl, this.cupEl, this.keptEl, this.turnEl, this.youPlate);
    this.actionBar = h('div', { class: 'actionbar fk-actions hidden' });
    this.gearBtn = h('button', { class: 'gear-btn', title: 'Settings', onClick: () => { audio.play('tap'); showSettings(this.root, {}, { atTable: true }); } }, '⚙');
    this.el.append(this.topbar, this.felt, this.actionBar, this.gearBtn);
    this.root.append(this.el);
    this.unsubBank = bank.onChange(() => { const b = this.topbar.querySelector('.bank-amt'); if (b) b.textContent = fmt$(bank.state.bank); });
  }

  say(text) { this.msgEl.textContent = text || ''; this.msgEl.classList.remove('farkle', 'hot', 'bad'); }
  shout(text, cls) { this.msgEl.textContent = text; this.msgEl.className = 'fk-msg ' + cls; }
  talk(id, trigger, vars = {}, p = 1) {
    const c = this.charOf(id); if (!c) return false;
    if (!this.rng.chance(Math.min(1, p * (c.persona?.chatty ?? 1)))) return false;
    const line = pickLine(c, trigger, { player: this.name, ...vars }, this.rng);
    if (!line) return false;
    audio.voice(c, line.file);
    const E = this.seatEls[id];
    E.bubble.textContent = line.text; E.bubble.classList.add('show');
    clearTimeout(E.bubbleT); E.bubbleT = setTimeout(() => E.bubble.classList.remove('show'), 2600);
    return true;
  }
  setActing(id) {
    for (const [pid, E] of Object.entries(this.seatEls)) { (E.seat || E.plate).classList.toggle('acting', pid === id); }
  }
  updateScores(game) {
    for (const p of game.players) { const el = this.seatEls[p].scoreEl; el.textContent = fmtN(game.scores[p]); el.dataset.note = game.onBoard[p] ? '' : 'not on board'; }
  }
  updateStacks() {
    this.youPlate.lastChild.textContent = fmt$(this.stack);
    for (const c of this.opps) this.seatEls[c.id].plate.lastChild.textContent = fmt$(this.oppStacks[c.id]);
  }
  showButtons(...btns) { clear(this.actionBar); this.actionBar.classList.remove('hidden'); this.actionBar.append(...btns.filter(Boolean)); }
  hideButtons() { this.actionBar.classList.add('hidden'); clear(this.actionBar); }
  waitButton(label, cls = 'raise') {
    return new Promise((resolve) => this.showButtons(h('button', { class: 'act ' + cls, onClick: () => { audio.play('tap'); this.hideButtons(); resolve(); } }, label)));
  }

  // ---------- dice ----------
  dieEl(v, { small = false } = {}) {
    const el = h('div', { class: 'die' + (small ? ' small' : ''), 'data-v': v });
    if (!assets.bg(el, 'dice.' + v)) {
      for (let i = 0; i < 9; i++) el.append(h('i', { class: 'pip' + (PIPS[v].includes(i) ? ' on' : '') }));
    }
    return el;
  }
  // Dice never land in a neat row: each roll gets fresh spots from a jittered grid, plus a random tilt.
  scatter(n) {
    const cols = n <= 3 ? n : 3, rows = n <= 3 ? 1 : 2;
    const cells = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
    for (let i = cells.length - 1; i > 0; i--) { const j = this.rng.int(i + 1); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const cw = (ZONE.x1 - ZONE.x0) / cols, ch = (ZONE.y1 - ZONE.y0) / rows;
    return cells.slice(0, n).map(([c, r]) => ({
      x: ZONE.x0 + cw * (c + 0.5) + (this.rng.next() - 0.5) * cw * 0.3,
      y: ZONE.y0 + ch * (r + 0.5) + (this.rng.next() - 0.5) * ch * 0.35,
      rot: (this.rng.next() - 0.5) * 44,
    }));
  }
  renderTray(dice, { selected = [], selectable = false, spots = this.spots } = {}) {
    clear(this.trayEl);
    if (!spots || spots.length < dice.length) spots = this.spots = this.scatter(dice.length);
    dice.forEach((v, i) => {
      const el = this.dieEl(v); el.dataset.i = i;
      const sp = spots[i];
      el.style.left = sp.x + '%'; el.style.top = sp.y + '%'; el.style.setProperty('--rot', sp.rot.toFixed(1) + 'deg');
      if (selected.includes(i)) el.classList.add('sel');
      if (selectable) el.classList.add('tappable');
      this.trayEl.append(el);
    });
  }
  renderKept(game) {
    clear(this.keptRow);
    for (const k of game.kept) {
      const grp = h('div', { class: 'fk-kept-group' }, k.values.map((v) => this.dieEl(v, { small: true })), h('span', { class: 'fk-kept-pts' }, '+' + fmtN(k.points)));
      this.keptRow.append(grp);
    }
    this.keptEl.classList.toggle('empty', !game.kept.length);
  }
  renderTurn(game, extra = 0) {
    this.turnNum.textContent = fmtN(game.turnTotal + extra);
    this.turnEl.classList.toggle('pending', extra > 0);
  }
  // The cup rattles, tips over, and the dice tumble out onto the felt.
  async rollAnimation(n, finalDice) {
    clear(this.trayEl);
    this.spots = this.scatter(n);
    const cup = this.cupEl;
    cup.className = cup.className.replace(/\b(shake|tip|show)\b/g, '').trim();
    cup.classList.add('show', 'shake');
    audio.play('dice');
    await sleep(Math.max(250, 620 / this.speed));
    cup.classList.remove('shake'); cup.classList.add('tip');
    await sleep(Math.max(120, 260 / this.speed));
    // dice appear at the cup's mouth, then slide to their spots
    const mouth = { x: 56, y: 54 };
    const els = finalDice.map((v, i) => {
      const el = this.dieEl(v); el.dataset.i = i;
      el.style.left = mouth.x + '%'; el.style.top = mouth.y + '%';
      el.style.setProperty('--rot', (this.spots[i].rot + 540).toFixed(0) + 'deg');
      el.classList.add('tumbling');
      this.trayEl.append(el); return el;
    });
    // force layout so the transition runs from the mouth
    void this.trayEl.offsetWidth;
    els.forEach((el, i) => { const sp = this.spots[i]; el.style.left = sp.x + '%'; el.style.top = sp.y + '%'; el.style.setProperty('--rot', sp.rot.toFixed(1) + 'deg'); });
    await sleep(Math.max(200, 520 / this.speed));
    els.forEach((el) => el.classList.remove('tumbling'));
    cup.classList.remove('tip', 'show');
    this.renderTray(finalDice);
  }

  // ---------- main loop ----------
  async run() {
    this.say(`Welcome, ${this.name}. First to ${fmtN(TARGET)}; you need ${ENTRY} in one turn to get on the board.`);
    for (const c of this.opps) if (this.talk(c.id, 'greet', {}, 0.6)) await this.wait(500);
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
    const players = [HUMAN, ...this.opps.map((c) => c.id)];
    // the winner of the last game rolls first; otherwise a random start
    const first = this.lastWinner && players.includes(this.lastWinner) ? this.lastWinner : this.rng.pick(players);
    const game = new Game({ rng: this.rng, players, first });
    this.game = game; this.games++;
    this.updateScores(game); this.renderKept(game); clear(this.trayEl); this.renderTurn(game);
    this.say(`${fmt$(this.table.stake)} each in the pot. ${this.nameOf(first)} roll${first === HUMAN ? '' : 's'} first.`);
    await this.wait(600);
    while (game.phase !== 'over' && !this.stopped) {
      await this.playTurn(game);
    }
    if (this.stopped) return;
    await this.gameOver(game);
  }

  async playTurn(game) {
    const id = game.current;
    this.setActing(id);
    this.renderKept(game); clear(this.trayEl); this.renderTurn(game);
    if (id === HUMAN) await this.humanTurn(game); else await this.aiTurn(game, id);
    this.setActing(null);
    this.updateScores(game);
  }

  // ----- your turn -----
  async humanTurn(game) {
    this.say('Your roll.');
    audio.play('yourturn');
    await this.waitButton('Roll');
    while (game.current === HUMAN && game.phase !== 'over' && !this.stopped) {
      const n = game.diceLeft;
      const r = game.roll();
      // on a farkle the engine has already cleared the dice, so show what was actually rolled
      const rolled = game.events.slice().reverse().find((e) => e.type === 'roll').dice;
      await this.rollAnimation(n, rolled);
      if (r === 'farkle') { await this.farkleMoment(HUMAN); return; }
      // choose dice
      const choice = await this.awaitSelection(game);
      if (this.stopped) return;
      const s = game.select(choice.idx);
      this.renderKept(game); this.renderTurn(game);
      if (game.diceLeft === 6 && game.kept.length === 0) { this.shout('HOT DICE! Roll all six again.', 'hot'); audio.play('bigwin'); await this.wait(900); }
      else this.say(`${s.name} for ${fmtN(s.points)}.`);
      clear(this.trayEl);
      if (choice.action === 'bank') {
        game.bank();
        await this.bankMoment(HUMAN, game);
        return;
      }
      // roll again (already chosen)
    }
  }

  // Tap dice to pick a scoring set, then Roll again or Bank. Resolves { idx, action }.
  awaitSelection(game) {
    return new Promise((resolve) => {
      let selected = [];
      const opts = game.legalSelections();
      const status = { set textContent(t) { this._t = t; }, get textContent() { return this._t; }, classList: { toggle() {} } };
      const rollBtn = h('button', { class: 'act call', onClick: () => finish('roll') }, 'Roll again');
      const bankBtn = h('button', { class: 'act raise bank' }, h('span', { class: 'act-main' }, 'Bank'), h('span', { class: 'act-sub' }, ''));
      bankBtn.addEventListener('click', () => finish('bank'));
      const bestBtn = h('button', { class: 'act back', onClick: () => { audio.play('tap'); selected = bestKeep(game.dice).idx.slice(); refresh(); } }, 'Pick for me');
      const finish = (action) => { audio.play(action === 'bank' ? 'chips' : 'tap'); this.trayEl.onclick = null; this.hideButtons(); resolve({ idx: selected, action }); };
      const refresh = () => {
        const s = selected.length ? scoreSelection(selected.map((i) => game.dice[i])) : null;
        this.renderTray(game.dice, { selected, selectable: true });
        const left = game.dice.length - selected.length;
        const wouldBank = game.onBoard[HUMAN] || game.turnTotal + (s?.points || 0) >= ENTRY;
        rollBtn.disabled = !s; bankBtn.disabled = !s || !wouldBank;
        rollBtn.textContent = s ? (left === 0 ? 'Roll all six' : `Roll ${left} ${left === 1 ? 'die' : 'dice'}`) : 'Roll again';
        bankBtn.firstChild.textContent = s ? `Bank ${fmtN(game.turnTotal + s.points)}` : 'Bank';
        bankBtn.lastChild.textContent = s && !wouldBank ? `${ENTRY} needed to enter` : '';
        const entryNote = game.onBoard[HUMAN] ? '' : ` · ${ENTRY} in one turn gets you on the board`;
        this.say(!selected.length ? 'Tap the dice you want to keep' + entryNote : s ? `${s.name} = ${fmtN(s.points)}` + (!wouldBank ? ` · reach ${ENTRY} to get on the board` : '') : 'Every die you keep has to score');
        this.msgEl.classList.toggle('bad', selected.length > 0 && !s);
        this.renderTurn(game, s?.points || 0);
      };
      this.trayEl.onclick = (e) => {
        const el = e.target.closest('.die'); if (!el) return;
        const i = +el.dataset.i; audio.play('tap');
        selected = selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i];
        refresh();
      };
      this.showButtons(bestBtn, rollBtn, bankBtn);
      refresh();
    });
  }

  // ----- their turn -----
  async aiTurn(game, id) {
    const c = this.charOf(id);
    this.say(`${c.name} rolls.`);
    this.talk(id, 'fkRoll', {}, 0.25);
    await this.wait(700);
    while (game.current === id && game.phase !== 'over' && !this.stopped) {
      const n = game.diceLeft;
      const r = game.roll();
      // on a farkle the engine has already cleared the dice, so show what was actually rolled
      const rolled = game.events.slice().reverse().find((e) => e.type === 'roll').dice;
      await this.rollAnimation(n, rolled);
      if (r === 'farkle') { await this.farkleMoment(id); return; }
      await this.wait(500);
      const keep = chooseKeep(game, c.persona, this.rng);
      this.renderTray(game.dice, { selected: keep.idx });
      await this.wait(650);
      const s = game.select(keep.idx);
      this.renderKept(game); this.renderTurn(game);
      clear(this.trayEl);
      if (game.diceLeft === 6 && game.kept.length === 0) { this.shout(`HOT DICE! ${c.name} rolls all six again.`, 'hot'); this.talk(id, 'fkHotDice', {}, 0.8); await this.wait(900); }
      else this.say(`${c.name}: ${s.name} for ${fmtN(s.points)}.`);
      await this.wait(500);
      if (shouldBank(game, c.persona, this.rng)) {
        game.bank();
        await this.bankMoment(id, game);
        return;
      }
      this.say(`${c.name} rolls again with ${game.diceLeft}.`);
      this.talk(id, 'fkPush', {}, 0.3);
      await this.wait(500);
    }
  }

  // A farkle gets its own beat: see the dice land, then the verdict, then a good long look before the turn moves on.
  async farkleMoment(id) {
    const lost = this.game.events.slice().reverse().find((e) => e.type === 'farkle' && e.playerId === id)?.lost || 0;
    await sleep(Math.max(500, 700 / this.speed));
    this.shout(id === HUMAN ? `FARKLE! ${lost ? `${fmtN(lost)} points gone.` : 'Nothing there.'}` : `FARKLE! ${this.nameOf(id)} loses ${lost ? fmtN(lost) + ' points' : 'the turn'}.`, 'farkle');
    audio.play('lose', { volume: 0.5 });
    for (const el of this.trayEl.querySelectorAll('.die')) el.classList.add('dead');
    this.turnEl.classList.add('lost');
    if (id === HUMAN) { const o = this.opps; if (o.length) this.talk(this.rng.pick(o).id, 'tauntFarkle', {}, 0.4); }
    else this.talk(id, 'fkFarkle', {}, 0.8);
    await sleep(Math.max(2200, 2600 / this.speed));   // never rushed, whatever the speed setting
    this.turnEl.classList.remove('lost');
  }
  async bankMoment(id, game) {
    const ev = game.events.slice().reverse().find((e) => e.type === 'bank' && e.playerId === id);
    const pts = ev?.points || 0;
    this.say(`${id === HUMAN ? 'You bank' : this.nameOf(id) + ' banks'} ${fmtN(pts)}.`);
    audio.play(pts >= 1500 ? 'bigwin' : 'chips');
    this.updateScores(game);
    if (id !== HUMAN) this.talk(id, pts >= 1500 ? 'fkBankBig' : 'fkBank', {}, pts >= 1500 ? 0.8 : 0.3);
    if (game.finalRound && game.closer === id) { await this.wait(600); this.shout(`${this.nameOf(id)} passed ${fmtN(TARGET)}! Last turn for everyone else.`, 'hot'); await this.wait(1400); }
    await this.wait(900);
  }

  // ---------- game over, money ----------
  async gameOver(game) {
    const r = game.result;
    const humanWon = r.winner === HUMAN;
    const stake = this.table.stake;
    const pot = stake * game.players.length;
    let amount;
    if (humanWon) {
      amount = Math.min(pot - stake, this.opps.reduce((s, c) => s + Math.min(stake, this.oppStacks[c.id]), 0));
      for (const c of this.opps) this.oppStacks[c.id] -= Math.min(stake, this.oppStacks[c.id]);
      this.stack += amount;
    } else {
      amount = Math.min(stake, this.stack);
      this.stack -= amount;
      this.oppStacks[r.winner] += amount + (this.opps.length - 1) * stake;
      for (const c of this.opps) if (c.id !== r.winner) this.oppStacks[c.id] -= stake;
    }
    this.updateStacks();
    this.lastWinner = r.winner;
    this.say(humanWon ? 'You win the game!' : `${this.nameOf(r.winner)} wins the game.`);
    if (humanWon) { for (const c of this.opps) this.talk(c.id, 'cribGameLose', {}, 0.5); } else this.talk(r.winner, 'cribGameWin', {}, 0.9);
    bank.recordHand({ won: humanWon, showdown: false, pot, net: humanWon ? amount : -amount, handName: null, handScore: 0 });
    bank.setAtTable({ tableId: this.table.id, stack: this.stack, opponents: this.opps.map((c) => c.id) });
    if (humanWon) { audio.play(this.opps.length > 1 ? 'bigwin' : 'win'); await this.wait(300); await this.winBanner(amount, this.opps.length > 1); }
    else { audio.play('lose', { volume: 0.4 }); await this.wait(1200); }
    const choice = await modal({
      title: humanWon ? 'You won!' : `${this.nameOf(r.winner)} won`, dismissable: false,
      body: (el) => el.append(
        h('div', { class: 'fk-results' }, r.ranked.map((p, i) => h('div', { class: 'fk-result' + (p === HUMAN ? ' you' : '') }, h('span', {}, `${i + 1}. ${this.nameOf(p)}`), h('b', {}, fmtN(r.scores[p]))))),
        h('p', { class: humanWon ? 'pos' : 'neg' }, (humanWon ? '+' : '−') + fmt$(amount)),
      ),
      buttons: [{ label: 'Leave table', kind: 'ghost', value: 'leave' }, { label: 'Play again', kind: 'primary', value: 'again', disabled: this.leaving }],
    });
    if (choice === 'leave') this.leaving = true;
  }

  showRules() {
    modal({ title: 'Farkle', dismissable: true, buttons: [{ label: 'Got it', kind: 'primary' }], body: (el) => el.append(
      h('table', { class: 'fk-rules' },
        ...[['Each 1', '100'], ['Each 5', '50'], ['Three 1s', '1,000'], ['Three of a kind', 'face × 100'], ['Four of a kind', '1,000'], ['Five of a kind', '2,000'], ['Six of a kind', '3,000'], ['1-2-3-4-5-6', '1,500'], ['Three pairs', '1,500'], ['Two triplets', '2,500']].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))),
      ),
      h('p', {}, `Roll, set aside scoring dice, then roll the rest or bank. No scoring dice is a FARKLE — the turn's points are lost. Use all six and roll them all again (hot dice). You need ${ENTRY} in one turn to get on the board. First to ${fmtN(TARGET)}; everyone else gets one last turn.`),
    ) });
  }

  winBanner(amount, big) {
    return new Promise((resolve) => {
      const banner = h('div', { class: 'win-banner' + (big ? ' big' : '') },
        h('div', { class: 'wb-title' }, big ? 'YOU WIN!' : 'You win!'),
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

  requestLeave() {
    audio.play('tap');
    if (!this.game || this.game.phase === 'over') { this.leaving = true; return; }
    this.leaving = !this.leaving;
    toast(this.leaving ? 'Leaving after this game.' : 'Staying.');
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
}

// which of the 3x3 cells light up for each face
const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
