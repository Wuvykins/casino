// The Hold'em table: seats, chips, action bar, hand loop, opponents' talk. Sits on top of core/poker.js.
import { h, clear, sleep, modal, toast } from './dom.js';
import { cardEl, chipStackEl, portraitEl, playerAvatarEl, creditCardEl, chooseDeckBack } from './components.js';
import { Hand } from '../core/poker.js';
import { decide, updateMood, thinkTime, readsFromPersonas } from '../core/ai.js';
import { evaluate, describe, category } from '../core/evaluator.js';
import { makeRng } from '../core/rng.js';
import { bank, fmt$ } from '../core/bank.js';
import { assets } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { CHARACTERS, characterById } from '../content/characters.js';
import { pickLine } from '../content/lines.js';
import { MAX_SEATS } from '../content/tables.js';
import { showSettings } from './lobby.js';

const SEAT_POS = [
  { x: 42, y: 99 },   // you (anchored by its bottom edge)
  { x: 12, y: 62 },
  { x: 15, y: 2 },    // top seats are anchored by their top edge
  { x: 50, y: 0 },
  { x: 85, y: 2 },
  { x: 88, y: 62 },
];
const CENTER = { x: 50, y: 47 };
const OPP_SEATS = { 1: [3], 2: [2, 4], 3: [2, 3, 4], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
const HUMAN = 'you';

export class HoldemTable {
  constructor(root, table, buyIn, opponentIds, { onLeave }) {
    this.root = root; this.table = table; this.onLeave = onLeave;
    this.rng = makeRng();
    chooseDeckBack(this.rng);
    this.button = 0;
    this.handNo = 0;
    this.leaving = false;
    this.stopped = false;
    this.pendingHuman = null;
    this.reads = {};
    this.humanStats = { hands: 0, vpip: 0, aggr: 0, passive: 0 };
    const seats = OPP_SEATS[Math.min(5, opponentIds.length)];
    this.seats = [{ seat: 0, id: HUMAN, name: bank.state.playerName || 'You', isHuman: true, stack: buyIn, char: null, mood: null, out: false }];
    opponentIds.slice(0, 5).forEach((id, i) => {
      const c = characterById(id);
      this.seats.push({ seat: seats[i], id, name: c.name, isHuman: false, stack: table.maxBuy, char: c, mood: { tilt: 0 }, out: false });
    });
    bank.buyIn(buyIn, table.id);
    bank.setAtTable({ tableId: table.id, stack: buyIn, opponents: opponentIds });
    this.refreshReads();
    this.build();
  }

  // Everyone at the table knows everyone else's tendencies (they're friends and family, after all).
  // The human's read is learned from how they actually play; see updateReads().
  refreshReads() {
    const human = this.reads[HUMAN];
    this.reads = readsFromPersonas(Object.fromEntries(this.seats.slice(1).map((s) => [s.id, s.char.persona])));
    if (human) this.reads[HUMAN] = human;
  }

  get human() { return this.seats[0]; }
  get speed() { return bank.state.settings.aiSpeed || 1; }
  wait(ms) { return sleep(ms / this.speed); }

  // ---------- DOM ----------
  build() {
    clear(this.root);
    this.el = h('div', { class: 'table-screen' });
    this.topbar = h('div', { class: 'topbar table-top' },
      h('button', { class: 'btn ghost small', onClick: () => this.requestLeave() }, '‹ Leave table'),
      h('div', { class: 'tt-title' }, this.table.name),
      h('div', { class: 'topbar-bank' }, 'Bank ', h('b', { class: 'bank-amt' }, fmt$(bank.state.bank))),
    );
    this.felt = h('div', { class: 'felt' });
    assets.bg(this.felt, 'table.felt.holdem');
    this.boardEl = h('div', { class: 'board' });
    this.potEl = h('div', { class: 'pot' });
    this.msgEl = h('div', { class: 'table-msg' });
    this.felt.append(h('div', { class: 'rail' }), this.boardEl, h('div', { class: 'under-board' }, this.potEl, this.msgEl));
    this.seatEls = {};
    for (const s of this.seats) {
      const pos = SEAT_POS[s.seat];
      const seatEl = h('div', { class: 'seat' + (s.isHuman ? ' human' : '') + (pos.x > 50 ? ' right' : ''), style: { left: pos.x + '%', top: pos.y + '%' }, dataset: { pos: pos.y < 30 ? 'top' : 'bottom' } });
      const portrait = s.isHuman ? playerAvatarEl(s.name) : portraitEl(s.char, { size: 'md' });
      const cards = h('div', { class: 'holecards' });
      const plate = h('div', { class: 'nameplate' }, h('div', { class: 'pname' }, s.name), h('div', { class: 'pstack' }, fmt$(s.stack)));
      const tag = h('div', { class: 'action-tag' });
      const bubble = h('div', { class: 'bubble' });
      const dealer = h('div', { class: 'dealer-btn' }, 'D');
      assets.bg(dealer, 'table.dealer');
      seatEl.append(cards, portrait, plate, tag, bubble, dealer);
      const vy = pos.y < 30 ? pos.y + 22 : pos.y; // visual centre of top-anchored seats
      const bp = s.isHuman ? { x: pos.x + 14, y: 74 }
        : pos.y > 50 ? { x: pos.x + (CENTER.x - pos.x) * 0.3, y: pos.y - 4 }                       // lower side seats: chips beside them, below the board
        : { x: pos.x + (CENTER.x - pos.x) * 0.42 + (pos.x === 50 ? 14 : 0), y: vy + (CENTER.y - vy) * 0.5 };
      const betEl = h('div', { class: 'betspot', style: { left: bp.x + '%', top: bp.y + '%' } });
      this.felt.append(seatEl, betEl);
      this.seatEls[s.id] = { seatEl, portrait, cards, plate, tag, bubble, dealer, betEl, stackEl: plate.lastChild };
    }
    this.handInfo = h('div', { class: 'handinfo' });
    this.actionBar = h('div', { class: 'actionbar hidden' });
    this.nextBar = h('div', { class: 'nextbar hidden' });
    this.gearBtn = h('button', { class: 'gear-btn', title: 'Settings', onClick: () => { audio.play('tap'); showSettings(this.root, {}, { atTable: true }); } }, '⚙');
    this.el.append(this.topbar, this.felt, this.handInfo, this.actionBar, this.nextBar, this.gearBtn);
    this.root.append(this.el);
    this.unsubBank = bank.onChange(() => { const b = this.topbar.querySelector('.bank-amt'); if (b) b.textContent = fmt$(bank.state.bank); });
  }

  seatById(id) { return this.seats.find((s) => s.id === id); }

  // ---------- main loop ----------
  async run() {
    audio.play('shuffle');
    this.say(null, `Welcome to ${this.table.name}. Blinds ${fmt$(this.table.sb)}/${fmt$(this.table.bb)}.`);
    await this.wait(600);
    for (const s of this.seats.slice(1)) if (this.talk(s, 'greet', {}, 0.5)) await this.wait(500);
    await this.wait(600);
    while (!this.stopped) {
      await this.playHand();
      if (this.stopped) break;
      const cont = await this.betweenHands();
      if (!cont) break;
    }
  }

  async playHand() {
    // seat maintenance: busted opponents rebuy or get replaced
    for (const s of this.seats.slice(1)) {
      if (s.stack <= 0) {
        if (this.rng.chance(0.25)) {
          const pool = CHARACTERS.filter((c) => !this.seats.some((x) => x.id === c.id));
          if (pool.length) {
            const c = this.rng.pick(pool);
            this.say(null, `${s.name} leaves. ${c.name} sits down.`);
            const oldId = s.id;
            Object.assign(s, { id: c.id, name: c.name, char: c, mood: { tilt: 0 } });
            this.rebindSeat(oldId, s);
            this.refreshReads();
            await this.wait(900);
          }
        }
        s.stack = this.table.maxBuy; s.mood.tilt = 0;
        this.talk(s, 'rebuy');
        this.updateSeat(s);
      }
    }
    const players = this.seats.filter((s) => s.stack > 0).map((s) => ({ id: s.id, name: s.name, stack: s.stack, seat: s.seat }));
    // move the button to the next occupied seat
    this.button = (this.button + 1) % players.length;
    this.handNo++;
    const hand = new Hand({ table: this.table, players, button: this.button, rng: this.rng });
    this.hand = hand; this.cursor = 0; this.resolveNext = null;
    this.resetHandUI();
    hand.start();
    await this.drainEvents();

    let voluntary = false;
    while (!hand.finished && !this.stopped) {
      const p = hand.actor;
      const seat = this.seatById(p.id);
      const legal = hand.legalActions();
      this.highlightActor(p.id);
      let action;
      if (seat.isHuman) {
        this.playHandInfo();
        action = await this.awaitHuman(legal);
        if (this.stopped) return;
        if (hand.street === 'preflop' && (action.type === 'call' || action.type === 'raise' || action.type === 'allin')) voluntary = true;
        if (action.type === 'raise' || action.type === 'allin') this.humanStats.aggr++; else if (action.type === 'call') this.humanStats.passive++;
      } else {
        action = decide(hand, p, seat.char.persona, seat.mood, this.rng, this.reads);
        await this.wait(thinkTime(action, legal, this.rng));
        if (this.stopped) return;
      }
      hand.act(p.id, action);
      this.afterAction(seat, action, legal);
      await this.drainEvents();
    }
    this.humanStats.hands++; if (voluntary) this.humanStats.vpip++;
    this.updateReads();
    await this.finishHand();
  }

  resetHandUI() {
    clear(this.boardEl); this.potEl.textContent = ''; this.handInfo.textContent = ''; this.msgEl.textContent = '';
    for (const s of this.seats) {
      const E = this.seatEls[s.id];
      clear(E.cards); clear(E.betEl); E.tag.textContent = ''; E.tag.className = 'action-tag';
      E.seatEl.classList.remove('folded', 'acting', 'winner', 'allin');
      E.dealer.classList.remove('show');
      E.seatEl.classList.toggle('sitting-out', s.stack <= 0);
    }
  }
  rebindSeat(oldId, s) {
    const E = this.seatEls[oldId];
    if (!E) return;
    const newPortrait = portraitEl(s.char, { size: 'md' });
    E.portrait.replaceWith(newPortrait); E.portrait = newPortrait;
    E.plate.firstChild.textContent = s.name;
    delete this.seatEls[oldId];
    this.seatEls[s.id] = E;
  }

  // process engine events since last time, with animation pauses
  async drainEvents() {
    const hand = this.hand;
    while (this.cursor < hand.events.length) {
      const ev = hand.events[this.cursor++];
      switch (ev.type) {
        case 'deal': {
          this.seatEls[this.seatById(ev.button).id].dealer.classList.add('show');
          this.renderMoney();
          for (const p of ev.players) clear(this.seatEls[p.id].cards);
          // one card at a time, around the table, like a real deal
          for (let round = 0; round < 2; round++) {
            for (const p of ev.players) {
              const seat = this.seatById(p.id); const E = this.seatEls[p.id];
              const el = cardEl(p.cards[round], { faceDown: !seat.isHuman, small: !seat.isHuman }); el.classList.add('dealt');
              E.cards.append(el);
              audio.play('deal');
              await this.wait(130);
            }
          }
          await this.wait(250);
          break;
        }
        case 'blind': {
          this.setTag(ev.playerId, ev.kind === 'sb' ? 'Small blind' : 'Big blind');
          this.renderMoney();
          break;
        }
        case 'street': {
          this.renderMoney();
          await this.wait(450);
          for (const c of ev.cards) {
            const el = cardEl(c); el.classList.add('dealt');
            this.boardEl.append(el); audio.play('deal');
            await this.wait(260);
          }
          for (const s of this.seats) { const E = this.seatEls[s.id]; if (!E.seatEl.classList.contains('folded')) { E.tag.textContent = ''; E.tag.className = 'action-tag'; } }
          this.playHandInfo();
          if (ev.runout) await this.wait(500);
          break;
        }
        case 'showdown': {
          for (const r of ev.revealed) {
            const seat = this.seatById(r.playerId); const E = this.seatEls[r.playerId];
            if (!seat.isHuman) {
              clear(E.cards); clear(E.betEl);
              const shown = h('div', { class: 'shown' }); for (const c of r.cards) shown.append(cardEl(c, { small: true }));
              E.betEl.append(shown);
            }
            this.setTag(r.playerId, r.hand, 'hand');
          }
          audio.play('flip');
          await this.wait(900);
          break;
        }
        case 'award': {
          this.renderMoney(true);
          const totalPot = ev.pots.reduce((a, p) => a + p.amount, 0);
          const winners = [...new Set(ev.awards.map((a) => a.playerId))];
          for (const id of winners) {
            const E = this.seatEls[id]; E.seatEl.classList.add('winner');
            const amt = ev.awards.filter((a) => a.playerId === id).reduce((s, a) => s + a.amount, 0);
            const pop = h('div', { class: 'winpop' }, '+' + fmt$(amt));
            E.seatEl.append(pop); setTimeout(() => pop.remove(), 2200);
          }
          if (ev.showdown) {
            // everyone who won a share of the main pot gets their five cards lit up (ties included)
            const mainWinners = new Set(ev.awards.filter((a) => a.potIndex === 0).map((a) => a.playerId));
            const rev = this.hand.result?.revealed || this.hand.events.find((e) => e.type === 'showdown')?.revealed || [];
            this.highlightBest(rev.filter((x) => mainWinners.has(x.playerId)));
          }
          const humanWon = winners.includes(HUMAN);
          // what you actually gained: the pot you were awarded minus the chips you put in yourself
          const humanAward = ev.awards.filter((a) => a.playerId === HUMAN).reduce((s, a) => s + a.amount, 0);
          const humanGain = humanAward - (this.hand.players.find((p) => p.id === HUMAN)?.committed || 0);
          const bigWin = humanGain >= this.table.bb * 25;
          audio.play(humanWon ? (bigWin ? 'bigwin' : 'win') : 'chips');
          const names = winners.map((id) => this.seatById(id).name).join(' & ');
          this.say(null, ev.showdown ? `${names} win${winners.length > 1 ? '' : 's'} ${fmt$(totalPot)} with ${ev.awards[0].hand}` : `${names} take${winners.length > 1 ? '' : 's'} ${fmt$(totalPot)}`);
          // chips slide from the pot to each winner
          await this.wait(350);
          for (const id of winners) {
            const amt = ev.awards.filter((a) => a.playerId === id).reduce((s, a) => s + a.amount, 0);
            this.flyChips(this.potEl, this.seatEls[id].plate, amt);
          }
          if (humanWon) {
            const hand = ev.showdown ? ev.awards.find((a) => a.playerId === HUMAN)?.hand : null;
            await this.wait(500);
            if (humanGain > 0) await this.winBanner(humanGain, hand, bigWin);
            else await this.wait(900); // got your own chips back (split pot, or an all-in that only pushed)
          } else {
            await this.wait(700);
          }
          for (const s of this.seats) { s.stack = this.hand.players.find((p) => p.id === s.id)?.stack ?? s.stack; this.updateSeat(s); }
          for (const E of Object.values(this.seatEls)) { const shown = E.betEl.querySelector('.shown'); if (!shown) clear(E.betEl); }
          this.potEl.textContent = '';
          break;
        }
        default: break;
      }
    }
  }

  // A stack of chips that slides across the felt from one element to another.
  flyChips(fromEl, toEl, amount) {
    const felt = this.felt.getBoundingClientRect();
    let from = fromEl.getBoundingClientRect();
    if (!from.width) from = { left: felt.left + felt.width * 0.5 - 20, top: felt.top + felt.height * 0.47, width: 40, height: 40 };
    const to = toEl.getBoundingClientRect();
    const stack = chipStackEl(amount, { maxChips: 10, label: true });
    stack.classList.add('flying');
    stack.style.left = (from.left - felt.left + from.width / 2) + 'px';
    stack.style.top = (from.top - felt.top + from.height / 2) + 'px';
    this.felt.append(stack);
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      stack.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`;
      stack.style.opacity = '0.15';
    }));
    audio.play('chips');
    setTimeout(() => stack.remove(), 950);
  }

  // The big moment: your winnings stacked up in the middle of the table.
  winBanner(amount, handName, big) {
    return new Promise((resolve) => {
      const banner = h('div', { class: 'win-banner' + (big ? ' big' : '') },
        h('div', { class: 'wb-title' }, big ? 'BIG WIN!' : 'You win!'),
        chipStackEl(amount, { maxChips: big ? 24 : 14, label: false }),
        h('div', { class: 'wb-amount' }, '+' + fmt$(amount)),
        handName ? h('div', { class: 'wb-hand' }, handName) : null,
      );
      if (big) for (let i = 0; i < 18; i++) banner.append(h('i', { class: 'spark', style: { '--x': (Math.random() * 100).toFixed(0) + '%', '--d': (Math.random() * .8).toFixed(2) + 's', '--c': ['#e6c36a', '#fff', '#8fe0a2', '#f0a0a0'][i % 4] } }));
      this.felt.append(banner);
      requestAnimationFrame(() => banner.classList.add('show'));
      setTimeout(() => { banner.classList.remove('show'); setTimeout(() => { banner.remove(); resolve(); }, 300); }, big ? 2600 : 1900);
    });
  }

  // Swap in a character's happy / mad portrait for a few seconds, if that art exists.
  setExpression(s, mood, ms = 5000) {
    if (s.isHuman || !assets.has(`portrait.${s.id}.${mood}`)) return;
    const E = this.seatEls[s.id];
    const swap = (m) => { const np = portraitEl(s.char, { size: 'md', mood: m }); E.portrait.replaceWith(np); E.portrait = np; };
    swap(mood);
    clearTimeout(E.exprT); E.exprT = setTimeout(() => { if (E.portrait.isConnected) swap(null); }, ms);
  }

  highlightBest(results) {
    if (!results.length) return;
    const keyOf = (c) => c.r * 4 + c.s;
    const mark = (container, cards, keys) => { [...container.children].forEach((el, i) => { const c = cards[i]; el.classList.add(c && keys.has(keyOf(c)) ? 'hl' : 'dim'); }); };
    // the board lights up any card that is part of some winner's best five
    const boardKeys = new Set(results.flatMap((r) => r.best.map(keyOf)));
    mark(this.boardEl, this.hand.board, boardKeys);
    for (const r of results) {
      const keys = new Set(r.best.map(keyOf));
      const E = this.seatEls[r.playerId];
      const shown = E.betEl.querySelector('.shown');
      mark(shown || E.cards, r.cards, keys);
    }
  }

  afterAction(seat, action, legal) {
    const p = this.hand.players.find((x) => x.id === seat.id);
    const ev = this.hand.events.filter((e) => e.type === 'action').pop();
    const label = ev.action === 'fold' ? 'Fold' : ev.action === 'check' ? 'Check' : ev.action === 'call' ? `Call ${fmt$(ev.amount)}` : ev.action === 'bet' ? `Bet ${fmt$(ev.to)}` : `Raise to ${fmt$(ev.to)}`;
    this.setTag(seat.id, p.allIn && ev.action !== 'fold' ? 'ALL IN' : label, ev.action);
    const E = this.seatEls[seat.id];
    if (ev.action === 'fold') {
      E.seatEl.classList.add('folded'); if (!seat.isHuman) clear(E.cards); audio.play('fold');
      if (seat.isHuman && this.hand.lastAggressor && this.hand.lastAggressor !== HUMAN) { const a = this.seatById(this.hand.lastAggressor); if (a) setTimeout(() => this.talk(a, 'tauntPoker', {}, 0.3), 500); }
    }
    else if (ev.action === 'check') audio.play('check');
    else if (p.allIn) { audio.play('allin'); E.seatEl.classList.add('allin'); }
    else audio.play(ev.amount > this.table.bb * 6 ? 'chips' : 'chip');
    this.renderMoney();
    if (!seat.isHuman) {
      const trig = action.why === 'too much checking' ? 'tooMuchChecking' : p.allIn && ev.action !== 'fold' ? 'allin' : ev.action === 'bet' ? 'raise' : ev.action;
      const prob = trig === 'allin' ? 1 : trig === 'tooMuchChecking' ? 0.9 : trig === 'raise' ? 0.55 : trig === 'fold' ? 0.25 : 0.3;
      this.talk(seat, trig, {}, prob);
    }
  }

  renderMoney(final = false) {
    const hand = this.hand;
    for (const p of hand.players) {
      const E = this.seatEls[p.id]; if (!E) continue;
      E.stackEl.textContent = fmt$(p.stack);
      if (E.betEl.querySelector('.shown')) continue; // revealed cards live here at showdown
      clear(E.betEl);
      if (p.bet > 0 && !final) E.betEl.append(chipStackEl(p.bet, { compact: true, maxChips: 8 }));
    }
    const collected = final ? hand.pot : hand.potBeforeStreet;
    clear(this.potEl);
    if (collected > 0) this.potEl.append(chipStackEl(collected, { maxChips: 8, compact: true, label: false }), h('div', { class: 'pot-label' }, 'Pot ' + fmt$(hand.pot)));
    else if (hand.pot > 0) this.potEl.append(h('div', { class: 'pot-label' }, 'Pot ' + fmt$(hand.pot)));
  }
  updateSeat(s) { const E = this.seatEls[s.id]; if (E) { E.stackEl.textContent = fmt$(s.stack); E.seatEl.classList.toggle('sitting-out', s.stack <= 0); } }
  setTag(id, text, kind = '') { const E = this.seatEls[id]; if (!E) return; E.tag.textContent = text; E.tag.className = 'action-tag show ' + kind; }
  highlightActor(id) { for (const [k, E] of Object.entries(this.seatEls)) E.seatEl.classList.toggle('acting', k === id); }
  say(seat, text) { this.msgEl.textContent = text; }

  // p = how likely they are to say something here; a character's `chatty` dial scales it (2 = twice as mouthy, 0.5 = quiet).
  // The text bubble always shows, and the recording plays too when the line has one.
  talk(seat, trigger, vars = {}, p = 1) {
    if (!seat?.char) return false;
    if (!this.rng.chance(Math.min(1, p * (seat.char.persona?.chatty ?? 1)))) return false;
    const line = pickLine(seat.char, trigger, { player: this.human.name, ...vars }, this.rng);
    if (!line) return false;
    audio.voice(seat.char, line.file);          // the recording, if this line has one
    const E = this.seatEls[seat.id]; if (!E) return false;
    E.bubble.textContent = line.text || '…'; E.bubble.classList.add('show');
    clearTimeout(E.bubbleT); E.bubbleT = setTimeout(() => E.bubble.classList.remove('show'), 2600);
    return true;
  }

  playHandInfo() {
    const p = this.hand.players.find((x) => x.id === HUMAN);
    if (!p || p.folded) { this.handInfo.textContent = ''; return; }
    if (this.hand.board.length >= 3) this.handInfo.textContent = describe(evaluate([...p.cards, ...this.hand.board]));
    else this.handInfo.textContent = '';
  }

  updateReads() {
    const st = this.humanStats;
    if (st.hands < 8) return;
    const aggr = st.aggr + st.passive ? st.aggr / (st.aggr + st.passive) : 0.5;
    this.reads[HUMAN] = { loose: Math.min(1, st.vpip / st.hands * 1.6), aggr };
  }

  // ---------- human input ----------
  awaitHuman(legal) {
    return new Promise((resolve) => {
      this.pendingHuman = resolve;
      audio.play('yourturn');
      const bar = this.actionBar; clear(bar); bar.classList.remove('hidden', 'raising');
      const done = (a) => { bar.classList.add('hidden'); bar.classList.remove('raising'); clear(bar); clearTimeout(this.hurryT); this.pendingHuman = null; resolve(a); };
      const p = this.hand.players.find((x) => x.id === HUMAN);
      const btn = (label, cls, fn) => h('button', { class: 'act ' + cls, onClick: () => { audio.play('tap'); fn(); } }, label);
      bar.append(btn('Fold', 'fold', () => done({ type: 'fold' })));
      if (legal.canCheck) bar.append(btn('Check', 'check', () => done({ type: 'check' })));
      else bar.append(btn(`Call ${fmt$(legal.callAmount)}`, 'call', () => done({ type: 'call' })));
      if (legal.canRaise) {
        const verb = legal.isBet ? 'Bet' : 'Raise';
        if (legal.fixed) bar.append(btn(`${verb} ${fmt$(legal.minRaiseTo)}`, 'raise', () => done({ type: 'raise', amount: legal.minRaiseTo })));
        else bar.append(btn(verb + '…', 'raise', () => this.raisePanel(legal, p, done)));
      } else if (legal.canCall && legal.callAmount >= p.stack) {
        // the call is all-in; make that obvious
        bar.querySelector('.call').textContent = `All in ${fmt$(legal.callAmount)}`;
      }
      // opponents get impatient
      this.hurryT = setTimeout(() => { const s = this.rng.pick(this.seats.slice(1).filter((x) => x.stack > 0)); if (s) this.talk(s, 'hurry'); }, 14000);
    });
  }

  raisePanel(legal, p, done) {
    const hand = this.hand;
    const step = this.table.bb >= 10 ? this.table.sb : 1;
    let to = legal.minRaiseTo;
    const potAfterCall = hand.pot + legal.callAmount;
    const preset = (frac) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round((p.bet + legal.callAmount + potAfterCall * frac) / step) * step));
    const bar = this.actionBar; clear(bar); bar.classList.add('raising');
    const amt = h('div', { class: 'raise-amt' });
    const slider = h('input', { type: 'range', min: legal.minRaiseTo, max: legal.maxRaiseTo, step, value: to });
    const confirm = h('button', { class: 'act raise' }, '');
    const set = (v) => { to = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(v / step) * step)); slider.value = to; amt.textContent = fmt$(to); confirm.textContent = to >= legal.maxRaiseTo ? `All in ${fmt$(to)}` : `${legal.isBet ? 'Bet' : 'Raise to'} ${fmt$(to)}`; };
    slider.addEventListener('input', () => set(+slider.value));
    confirm.addEventListener('click', () => { audio.play('chips'); done({ type: 'raise', amount: to }); });
    const presets = h('div', { class: 'presets' },
      h('button', { class: 'pre', onClick: () => set(legal.minRaiseTo) }, 'Min'),
      h('button', { class: 'pre', onClick: () => set(preset(0.5)) }, '½ Pot'),
      h('button', { class: 'pre', onClick: () => set(preset(0.75)) }, '¾ Pot'),
      h('button', { class: 'pre', onClick: () => set(preset(1)) }, 'Pot'),
      h('button', { class: 'pre', onClick: () => set(legal.maxRaiseTo) }, 'All in'),
    );
    bar.append(
      h('div', { class: 'raise-panel' }, presets, h('div', { class: 'slider-row' }, slider, amt)),
      h('div', { class: 'raise-row' },
        h('button', { class: 'act back', onClick: () => { clear(bar); bar.classList.remove('raising'); this.pendingHuman = null; clearTimeout(this.hurryT); bar.classList.add('hidden'); this.awaitHuman(legal).then(done); } }, '‹ Back'),
        confirm,
      ),
    );
    set(to);
  }

  // ---------- end of hand ----------
  async finishHand() {
    const hand = this.hand; const res = hand.result;
    const human = this.human;
    const pot = res.awards.reduce((a, b) => a + b.amount, 0);
    const humanNet = res.net[HUMAN] || 0;
    const humanWon = res.awards.some((a) => a.playerId === HUMAN);
    const humanRev = res.revealed.find((r) => r.playerId === HUMAN);
    bank.recordHand({ won: humanWon, showdown: res.showdown, pot, net: humanNet, handName: humanRev?.hand, handScore: humanRev?.score });
    for (const s of this.seats) s.stack = res.stacks[s.id] ?? s.stack;
    bank.setAtTable({ tableId: this.table.id, stack: human.stack, opponents: this.seats.slice(1).map((s) => s.id) });

    // table talk about the result
    const bigPot = humanNet >= this.table.bb * 25; // a big win for you, judged by what you gained
    for (const s of this.seats.slice(1)) {
      const won = res.awards.some((a) => a.playerId === s.id);
      const rev = res.revealed.find((r) => r.playerId === s.id);
      const net = res.net[s.id] || 0;
      const bigForThem = net >= this.table.bb * 25;
      updateMood(s.char.persona, s.mood, net, this.table.bb);
      const expr = bigForThem ? 'happy' : net <= -8 * this.table.bb ? 'mad' : null;
      if (expr) this.setExpression(s, expr);
      if (won) { this.talk(s, bigForThem ? 'winBig' : 'winSmall', {}, bigForThem ? 0.9 : 0.35); }
      else if (rev) {
        const cat = category(rev.score);
        if (cat >= 3 || (cat === 2 && -net >= this.table.bb * 12)) { this.talk(s, 'badBeat', {}, 0.85); }
        else if (hand.lastAggressor === s.id && cat <= 1) { this.talk(s, 'caughtBluff', {}, 0.7); }
        else if ((res.net[s.id] || 0) <= -25 * this.table.bb) { this.talk(s, 'loseBig', {}, 0.85); }
        else this.talk(s, 'lose', {}, 0.4);
      }
      if (s.stack <= 0) { this.talk(s, 'bustOut'); this.updateSeat(s); }
    }
    if (humanWon && bigPot) { const s = this.rng.pick(this.seats.slice(1)); if (s) setTimeout(() => this.talk(s, 'playerWin', {}, 0.5), 900); }
    if (humanNet < 0 && !humanWon) audio.play('lose', { volume: 0.4 });
    await this.wait(1600);
  }

  async betweenHands() {
    const human = this.human;
    if (human.stack <= 0) {
      const s = this.rng.pick(this.seats.slice(1)); if (s) this.talk(s, 'playerBust');
      const choice = await this.bustModal();
      if (choice === 'leave') { await this.leave(); return false; }
    }
    if (this.leaving) { await this.leave(); return false; }
    // next hand: only when the player asks for it
    return new Promise((resolve) => {
      const bar = this.nextBar; clear(bar); bar.classList.remove('hidden');
      bar.append(h('button', { class: 'btn primary', onClick: () => { audio.play('tap'); bar.classList.add('hidden'); resolve(true); } }, 'Deal'));
      this.resolveNext = async () => { bar.classList.add('hidden'); await this.leave(); resolve(false); };
    });
  }

  async bustModal() {
    const t = this.table; const b = bank.state.bank;
    const canRebuy = b >= t.minBuy;
    const max = Math.min(t.maxBuy, b);
    let amount = Math.min(max, t.maxBuy);
    return modal({
      title: "You're out of chips", dismissable: false,
      body: (el, close) => {
        el.append(h('p', {}, canRebuy ? `Take more out of the bank? You have ${fmt$(b)}.` : b > 0 ? `You have ${fmt$(b)} in the bank — not enough for this table's ${fmt$(t.minBuy)} minimum.` : 'And the bank is empty. Ken is in the lobby.'));
        if (canRebuy) {
          const amt = h('div', { class: 'big' }, fmt$(amount));
          const slider = h('input', { type: 'range', min: t.minBuy, max, step: t.bb, value: amount });
          slider.addEventListener('input', () => { amount = +slider.value; amt.textContent = fmt$(amount); });
          el.append(amt, slider);
        }
        el.append(h('div', { class: 'modal-buttons' },
          h('button', { class: 'btn ghost', onClick: () => close('leave') }, 'Back to the lobby'),
          canRebuy ? h('button', { class: 'btn primary', onClick: () => { bank.buyIn(amount, t.id); this.human.stack = amount; this.updateSeat(this.human); audio.play('chips'); close('rebuy'); } }, 'Rebuy') : null,
        ));
      },
    });
  }

  requestLeave() {
    audio.play('tap');
    if (this.hand && !this.hand.finished) {
      this.leaving = !this.leaving;
      toast(this.leaving ? 'Leaving after this hand.' : 'Staying.');
      // if it's our turn and we haven't acted, a fold is still ours to choose; nothing forced
    } else if (this.resolveNext) {
      this.resolveNext();
    } else {
      this.leaving = true;
    }
  }

  async leave() {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubBank?.();
    const stack = this.human.stack;
    const change = bank.cashOut(stack, this.table.id);
    if (change) {
      audio.play(change.up ? 'tierup' : 'tierdown');
      await modal({
        className: 'tier-change ' + (change.up ? 'up' : 'down'), dismissable: true,
        body: (el) => {
          el.append(h('h2', {}, change.up ? 'Card upgraded!' : 'Card downgraded'),
            h('p', {}, change.up ? `Your bank hit ${fmt$(change.to.min)}. Welcome to ${change.to.name}.` : `Your bank fell below ${fmt$(change.from.min)}. You're back to ${change.to.name} — the higher tables are locked until you earn it back.`));
          el.prepend(creditCardEl(change.to, bank.state.playerName, { size: 'md' }));
        },
        buttons: [{ label: change.up ? 'Nice' : 'Fine', kind: 'primary' }],
      });
    }
    if (this.pendingHuman) this.pendingHuman({ type: 'fold' });
    this.onLeave({ stack });
  }
}
