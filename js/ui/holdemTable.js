// The Hold'em table: seats, chips, action bar, hand loop, opponents' talk. Sits on top of core/poker.js.
import { h, clear, sleep, modal, toast } from './dom.js';
import { cardEl, chipStackEl, portraitEl, playerAvatarEl, creditCardEl, chooseDeckBack, askLeave, resultBanner, countTo } from './components.js';
import { Hand } from '../core/poker.js';
import { decide, updateMood, thinkTime, readsFromPersonas } from '../core/ai.js';
import { evaluate, describe, category } from '../core/evaluator.js';
import { makeRng } from '../core/rng.js';
import { LUCK, luckyHoldemDeck, betterHoleCards, holdemNudge } from '../core/luck.js';
import { bank, fmt$ } from '../core/bank.js';
import { assets } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { CHARACTERS, characterById } from '../content/characters.js';
import { pickLine } from '../content/lines.js';
import { MAX_SEATS, TOURNEY_BLINDS, TOURNEY_LEVEL_HANDS } from '../content/tables.js';
import { showSettings, noteButton, icon } from './lobby.js';
import { championship } from './championship.js';
import { showHandRankings } from './handRankings.js';

// tournament chips are counted, not dollars
export const fmtChips = (n) => Math.round(n).toLocaleString('en-US');

// "TOTAL POT" plaque (Nic's design): dark green plate with a gold rim; the amount counts up over 320 ms with an
// ease-out and the rim flashes gold when the pot grows. Hidden while the pot is empty.
class PotPlaque {
  constructor(fmt = fmt$) {
    this.fmt = fmt;
    this.amtEl = h('div', { class: 'pp-amt' }, fmt(0));
    this.el = h('div', { class: 'pot-plaque' }, h('div', { class: 'pp-label' }, 'TOTAL POT'), this.amtEl);
    this.shown = 0; this.target = 0; this.raf = 0;
  }
  reset() { this.shown = 0; this.target = 0; cancelAnimationFrame(this.raf); this.el.classList.remove('show', 'pulse'); this.amtEl.textContent = this.fmt(0); }
  hide() { this.el.classList.remove('show'); }
  set(next) {
    next = Math.max(0, Math.round(next));
    if (next === this.target) { if (next > 0) this.el.classList.add('show'); return; }
    const from = this.shown, up = next > this.target;
    this.target = next;
    if (next > 0) this.el.classList.add('show');
    cancelAnimationFrame(this.raf);
    if (!up) { this.shown = next; this.amtEl.textContent = this.fmt(next); return; }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 320), e = 1 - Math.pow(1 - t, 3);
      this.shown = Math.round(from + (next - from) * e);
      this.amtEl.textContent = this.fmt(this.shown);
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
    this.el.classList.remove('pulse'); void this.el.offsetWidth; this.el.classList.add('pulse');
  }
}

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
const TEST_CHAMPION = false;   // true = win one tournament hand and the ceremony fires (for testing the champion sequence)

export class HoldemTable {
  // resume: a saved tournament (bank.state.tourney) to pick back up instead of starting a new one — no entry fee is taken
  constructor(root, table, buyIn, opponentIds, { onLeave, resume = null }) {
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
    // Tournament: everyone gets the same stack of tournament chips, the entry fee is spent, blinds rise, busting = out
    this.tourney = table.mode === 'tourney';
    this.fmt = this.tourney ? fmtChips : fmt$;
    this.level = 0; this.levelBoost = 0; this.payout = 0; this.placed = 0;   // levelBoost: one extra blind level per player knocked out
    this.game = this.tourney ? { ...table, mode: 'nolimit', sb: TOURNEY_BLINDS[0][0], bb: TOURNEY_BLINDS[0][1] } : table;   // what the engine and AI play by
    const startStack = this.tourney ? table.chips : buyIn;
    const seats = OPP_SEATS[Math.min(5, opponentIds.length)];
    this.seats = [{ seat: 0, id: HUMAN, name: bank.state.playerName || 'You', isHuman: true, stack: startStack, char: null, mood: null, out: false }];
    opponentIds.slice(0, 5).forEach((id, i) => {
      const c = characterById(id);
      this.seats.push({ seat: seats[i], id, name: c.name, isHuman: false, stack: this.tourney ? table.chips : table.maxBuy, char: c, mood: { tilt: 0 }, out: false });
    });
    this.resumed = !!resume;
    if (resume && this.tourney) this.restoreTourney(resume);
    else if (resume) this.restoreCash(resume.state || {});
    else bank.buyIn(this.tourney ? table.buyIn : buyIn, table.id);
    if (this.tourney) bank.setAtTable({ tableId: table.id, stack: 0, opponents: opponentIds });   // tournament chips aren't money: nothing to restore on a reload
    else this.checkpoint();
    this.refreshReads();
    this.build();
  }

  // ---------- tournament save ----------
  // Saved at the start of every hand, so closing the game mid-hand picks up by replaying that hand from the top with
  // everyone's chips as they were. Cleared when the tournament ends or the player leaves it.
  saveTourney() {
    if (!this.tourney || this.stopped) return;
    bank.setTourney({
      tableId: this.table.id, savedAt: Date.now(),
      handNo: this.handNo, button: this.button, level: this.level, levelBoost: this.levelBoost,
      seats: this.seats.map((s) => ({ id: s.id, stack: s.stack, out: !!s.out, tilt: s.mood?.tilt || 0 })),
      humanStats: this.humanStats,
    });
  }
  restoreTourney(r) {
    this.handNo = r.handNo || 0; this.button = r.button || 0; this.levelBoost = r.levelBoost || 0;
    this.level = Math.min(TOURNEY_BLINDS.length - 1, r.level || 0);
    [this.game.sb, this.game.bb] = TOURNEY_BLINDS[this.level];
    for (const saved of r.seats || []) {
      const s = this.seatById(saved.id); if (!s) continue;
      s.stack = saved.stack; s.out = !!saved.out;
      if (s.mood) s.mood.tilt = saved.tilt || 0;
    }
    if (r.humanStats) this.humanStats = { ...this.humanStats, ...r.humanStats };
  }

  // ---------- cash table save ----------
  // Written before every deal and after every hand: closing the game resumes at this table with everyone's chips,
  // and a hand cut off in the middle is dealt again from the top (nothing the hand took is lost).
  checkpoint() {
    if (this.tourney || this.stopped) return;
    bank.setAtTable({
      game: 'holdem', tableId: this.table.id, stack: this.human.stack, opponents: this.seats.slice(1).map((s) => s.id), savedAt: Date.now(),
      state: { button: this.button, handNo: this.handNo, seats: this.seats.slice(1).map((s) => ({ id: s.id, stack: s.stack, tilt: s.mood?.tilt || 0 })), humanStats: this.humanStats },
    });
  }
  restoreCash(st) {
    this.button = st.button || 0; this.handNo = st.handNo || 0;
    for (const saved of st.seats || []) { const s = this.seatById(saved.id); if (!s) continue; s.stack = saved.stack; if (s.mood) s.mood.tilt = saved.tilt || 0; }
    if (st.humanStats) this.humanStats = { ...this.humanStats, ...st.humanStats };
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
    this.el = h('div', { class: 'table-screen holdem' });
    this.topbar = h('div', { class: 'topbar table-top' },
      h('button', { class: 'btn ghost small leave-btn', onClick: () => this.requestLeave() }, '‹ Leave table'),
      h('div', { class: 'tt-title' }, this.tourney ? `${this.table.name} · Blinds ${fmtChips(this.game.sb)}/${fmtChips(this.game.bb)}` : this.table.name),
      h('div', { class: 'topbar-right' },
        h('button', { class: 'help-btn', title: 'Hand rankings', 'aria-label': 'Hand rankings', onClick: () => { audio.play('tap'); showHandRankings(this.currentHand()); } }, '?'),
        h('div', { class: 'topbar-bank' }, 'Bank ', h('b', { class: 'bank-amt' }, fmt$(bank.state.bank))),
      ),
    );
    this.felt = h('div', { class: 'felt' });
    assets.bg(this.felt, 'table.felt.holdem');
    this.boardEl = h('div', { class: 'board' });
    this.potEl = h('div', { class: 'pot' });
    this.plaque = new PotPlaque(this.fmt);   // Nic's "TOTAL POT" plaque, above the community cards
    this.msgEl = h('div', { class: 'table-msg' });
    // tall screens (iPad, desktop): the plaque floats above the community cards. Phones have no room up there
    // (the top seat sits right over the board), so it goes in the middle of the row under the cards instead.
    const tall = window.innerHeight >= 560;
    this.el.classList.toggle('plaque-below', !tall);
    if (tall) this.felt.append(h('div', { class: 'rail' }), this.plaque.el, this.boardEl, h('div', { class: 'under-board' }, this.potEl, this.msgEl));
    else this.felt.append(h('div', { class: 'rail' }), this.boardEl, h('div', { class: 'under-board' }, this.potEl, this.plaque.el, this.msgEl));
    this.seatEls = {};
    for (const s of this.seats) {
      const pos = s.isHuman && !tall ? { x: 39, y: 99 } : SEAT_POS[s.seat];   // phones: your cards a little further left, clear of the tray
      const seatEl = h('div', { class: 'seat' + (s.isHuman ? ' human' : '') + (pos.x > 50 ? ' right' : ''), style: { left: pos.x + '%', top: pos.y + '%' }, dataset: { pos: pos.y < 30 ? 'top' : 'bottom' } });
      const portrait = s.isHuman ? playerAvatarEl(s.name) : portraitEl(s.char, { size: 'md' });
      const cards = h('div', { class: 'holecards' });
      const plate = h('div', { class: 'nameplate' }, h('div', { class: 'pname' }, s.name), h('div', { class: 'pstack' }, this.fmt(s.stack)));
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
    this.gearBtn = h('button', { class: 'gear-btn', title: 'Settings', onClick: () => { audio.play('tap'); showSettings(this.root, {}, { atTable: true }); } }, icon('gear'));
    this.el.append(this.topbar, this.felt, this.handInfo, this.actionBar, this.nextBar, this.gearBtn, noteButton(this.root));
    this.root.append(this.el);
    this.unsubBank = bank.onChange(() => countTo(this.topbar.querySelector('.bank-amt'), bank.state.bank, fmt$));
  }

  seatById(id) { return this.seats.find((s) => s.id === id); }

  // ---------- main loop ----------
  async run() {
    if (this.resumed) {
      const left = this.seats.filter((x) => x.stack > 0).length;
      this.say(null, this.tourney ? `Welcome back. ${left} players left, blinds ${fmtChips(this.game.sb)}/${fmtChips(this.game.bb)}.` : `Welcome back to ${this.table.name}.`);
      for (const s of this.seats) this.updateSeat(s);
      await this.wait(1200);
    } else this.say(null, this.tourney ? `Welcome to the ${this.table.name}. ${fmtChips(this.table.chips)} chips each, blinds ${fmtChips(this.game.sb)}/${fmtChips(this.game.bb)} — last two standing get paid.` : `Welcome to ${this.table.name}. Blinds ${fmt$(this.table.sb)}/${fmt$(this.table.bb)}.`);
    if (!this.resumed) {
      await this.wait(600);
      for (const s of this.seats.slice(1)) if (this.talk(s, 'greet', {}, 0.5)) await this.wait(500);
      await this.wait(600);
    }
    while (!this.stopped) {
      await this.playHand();
      if (this.stopped) break;
      const cont = await this.betweenHands();
      if (!cont) break;
    }
  }

  async playHand() {
    if (this.tourney) {
      // blinds climb every few hands
      for (const s of this.seats.slice(1)) if (s.stack <= 0 && !s.out) { s.out = true; this.levelBoost++; this.updateSeat(s); }
      const lvl = Math.min(TOURNEY_BLINDS.length - 1, Math.floor(this.handNo / TOURNEY_LEVEL_HANDS) + this.levelBoost);
      if (lvl !== this.level) { this.level = lvl; [this.game.sb, this.game.bb] = TOURNEY_BLINDS[lvl]; this.topbar.querySelector('.tt-title').textContent = `${this.table.name} · Blinds ${fmtChips(this.game.sb)}/${fmtChips(this.game.bb)}`; this.say(null, `Blinds up: ${fmtChips(this.game.sb)}/${fmtChips(this.game.bb)}.`); toast(`Blinds up: ${fmtChips(this.game.sb)}/${fmtChips(this.game.bb)}`); audio.play('yourturn'); await this.wait(900); }
    }
    // cash game seat maintenance: busted opponents rebuy or get replaced
    for (const s of this.seats.slice(1)) {
      if (s.stack <= 0 && !this.tourney) {
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
    this.saveTourney();   // tournament: closing the game from here on resumes at this hand
    this.checkpoint();    // cash table: same idea
    const players = this.seats.filter((s) => s.stack > 0).map((s) => ({ id: s.id, name: s.name, stack: s.stack, seat: s.seat }));
    // move the button to the next occupied seat
    this.button = (this.button + 1) % players.length;
    this.handNo++;
    const hand = new Hand({ table: this.game, players, button: this.button, rng: this.rng, deck: this.luckyDeck(players) });
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
        // once you've folded, the others still play it out at a watchable pace (Nic: 'felt like it all happened at once')
        const humanOut = !!hand.players.find((x) => x.id === HUMAN)?.folded;
        await this.wait(Math.max(thinkTime(action, legal, this.rng), humanOut ? 1000 : 0));
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

  // Now and then the deck is arranged in your favour (see core/luck.js). null = an honest shuffle.
  luckyDeck(players) {
    if (!players.some((p) => p.id === HUMAN) || players.length < 2) return null;
    const n = players.length;
    const order = players.map((_, k) => players[(this.button + 1 + k) % n].id);
    const kind = holdemNudge(this.rng, this.table.nudge ?? 25);   // the table's own hands-per-100
    if (kind === 'family' || kind === 'value') return luckyHoldemDeck(order, HUMAN, kind, this.rng);
    if (kind === 'hole') return betterHoleCards(order, HUMAN, this.rng);
    return null;
  }

  resetHandUI() {
    clear(this.boardEl); this.potEl.textContent = ''; this.handInfo.textContent = ''; this.msgEl.textContent = ''; this.plaque.reset();
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
          audio.play('shuffle', { volume: 0.8 }); await this.wait(1750);   // riffle, bridge, tap — then the cards go out (Nic's shuffle clip)
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
          audio.play('call', { volume: 0.5 }); // ante up
          this.renderMoney();
          break;
        }
        case 'street': {
          this.renderMoney();
          await this.wait(600);
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
            const pop = h('div', { class: 'winpop' }, '+' + this.fmt(amt));
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
          const bigWin = humanGain >= this.game.bb * 25;
          audio.play(humanWon ? (bigWin ? 'bigwin' : 'win') : 'chips');
          const names = winners.map((id) => this.seatById(id).name).join(' & ');
          this.say(null, ev.showdown ? `${names} win${winners.length > 1 ? '' : 's'} ${this.fmt(totalPot)} with ${ev.awards[0].told || ev.awards[0].hand}` : `${names} take${winners.length > 1 ? '' : 's'} ${this.fmt(totalPot)}`);
          // chips slide from the pot to each winner
          await this.wait(350);
          for (const id of winners) {
            const amt = ev.awards.filter((a) => a.playerId === id).reduce((s, a) => s + a.amount, 0);
            this.flyChips(this.potEl, this.seatEls[id].plate, amt);
          }
          if (humanWon) {
            const hand = ev.showdown ? ev.awards.find((a) => a.playerId === HUMAN)?.hand : null;
            await this.wait(500);
            if (humanGain > 0 && bigWin) await this.winBanner(humanGain, hand, true);
            else if (humanGain > 0) await resultBanner(this.felt, { type: 'win', amount: humanGain, caption: hand ? '\u2660   ' + hand.toUpperCase() + '   \u2660' : '\u2660   HAND WON   \u2660' });
            else await this.wait(900); // got your own chips back (split pot, or an all-in that only pushed)
          } else if (ev.showdown && this.hand.players.find((p) => p.id === HUMAN && !p.folded) && (this.hand.result.net[HUMAN] || 0) < 0) {
            // you went to the river and came second: say so properly (the loss sound goes with the banner)
            await this.wait(400);
            audio.play('lose', { volume: 0.4 }); this.lossSoundPlayed = true;
            await resultBanner(this.felt, { type: 'lose', amount: this.hand.result.net[HUMAN], title: `${names} win${winners.length > 1 ? '' : 's'}`, caption: ev.awards[0].hand ? (ev.awards[0].told || ev.awards[0].hand).toUpperCase() : 'HAND COMPLETE' });
          } else {
            await this.wait(700);
          }
          for (const s of this.seats) { s.stack = this.hand.players.find((p) => p.id === s.id)?.stack ?? s.stack; this.updateSeat(s); }
          for (const E of Object.values(this.seatEls)) { const shown = E.betEl.querySelector('.shown'); if (!shown) clear(E.betEl); }
          this.potEl.textContent = '';
          this.plaque.hide();
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
        h('div', { class: 'wb-amount' }, '+' + this.fmt(amount)),
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
    const label = ev.action === 'fold' ? 'Fold' : ev.action === 'check' ? 'Check' : ev.action === 'call' ? `Call ${this.fmt(ev.amount)}` : ev.action === 'bet' ? `Bet ${this.fmt(ev.to)}` : `Raise to ${this.fmt(ev.to)}`;
    this.setTag(seat.id, p.allIn && ev.action !== 'fold' ? 'ALL IN' : label, ev.action);
    const E = this.seatEls[seat.id];
    if (ev.action === 'fold') {
      E.seatEl.classList.add('folded'); if (!seat.isHuman) clear(E.cards); audio.play('fold');
      if (seat.isHuman && this.hand.lastAggressor && this.hand.lastAggressor !== HUMAN) { const a = this.seatById(this.hand.lastAggressor); if (a) setTimeout(() => this.talk(a, 'tauntPoker', {}, 0.3), 500); }
    }
    else if (ev.action === 'check') audio.play('check');
    else if (p.allIn) { audio.play('allin'); E.seatEl.classList.add('allin'); }
    else if (ev.action === 'call' && this.hand.street === 'preflop' && this.hand.currentBet <= this.game.bb) audio.play('call'); // just calling the blind
    else audio.play('raise'); // bet, raise, or calling a raise
    this.renderMoney();
    if (!seat.isHuman && (ev.action === 'bet' || ev.action === 'raise') && this.maybeBeSmart(seat)) return;
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
      countTo(E.stackEl, p.stack, this.fmt);
      if (E.betEl.querySelector('.shown')) continue; // revealed cards live here at showdown
      clear(E.betEl);
      if (p.bet > 0 && !final) E.betEl.append(chipStackEl(p.bet, { compact: true, maxChips: 8 }));
    }
    const collected = final ? hand.pot : hand.potBeforeStreet;
    clear(this.potEl);
    if (collected > 0) this.potEl.append(chipStackEl(collected, { maxChips: 8, compact: true, label: false }));
    this.plaque.set(hand.pot);   // blinds + every bet count toward the total
  }
  updateSeat(s) { const E = this.seatEls[s.id]; if (E) { if (s.out) { cancelAnimationFrame(E.stackEl._countRaf); delete E.stackEl.dataset.v; E.stackEl.textContent = 'OUT'; } else countTo(E.stackEl, s.stack, this.fmt); E.seatEl.classList.toggle('sitting-out', s.stack <= 0); E.seatEl.classList.toggle('out', !!s.out); } }
  setTag(id, text, kind = '') { const E = this.seatEls[id]; if (!E) return; E.tag.textContent = text; E.tag.className = 'action-tag show ' + kind; }
  highlightActor(id) { for (const [k, E] of Object.entries(this.seatEls)) E.seatEl.classList.toggle('acting', k === id); }
  say(seat, text) { this.msgEl.textContent = text; }

  // p = how likely they are to say something here; a character's `chatty` dial scales it (2 = twice as mouthy, 0.5 = quiet).
  // The text bubble always shows, and the recording plays too when the line has one.
  talk(seat, trigger, vars = {}, p = 1) {
    if (!seat?.char) return false;
    const E0 = this.seatEls[seat.id]; if (E0 && Date.now() - (E0.spokeAt || 0) < 2200) return false;   // still saying the last thing
    if (!this.rng.chance(Math.min(1, p * (seat.char.persona?.chatty ?? 1)))) return false;
    const line = pickLine(seat.char, trigger, { player: this.human.name, ...vars }, this.rng);
    if (!line) return false;
    audio.voice(seat.char, line.file);          // the recording, if this line has one
    const E = this.seatEls[seat.id]; if (!E) return false;
    E.spokeAt = Date.now(); E.bubble.textContent = line.text || '…'; E.bubble.classList.add('show');
    clearTimeout(E.bubbleT); E.bubbleT = setTimeout(() => E.bubble.classList.remove('show'), 2600);
    return true;
  }

  // Nic's inside joke: heads-up against you, he bets or raises with the hand that's going to win, and half the time
  // he tells you to be smart. Once per hand. Knowing the outcome is fine — it's the deck that decides, not him.
  maybeBeSmart(seat) {
    if (seat.char?.id !== 'nic' || this.saidBeSmart === this.hand) return false;
    const live = this.hand.active();
    if (live.length !== 2 || !live.some((x) => x.id === HUMAN)) return false;
    const board = this.hand.finalBoard();
    const nic = live.find((x) => x.id === seat.id), you = live.find((x) => x.id === HUMAN);
    if (evaluate([...nic.cards, ...board]) <= evaluate([...you.cards, ...board])) return false;
    if (!this.rng.chance(0.5)) return false;
    if (!this.talk(seat, 'beSmart', {}, 1)) return false;
    this.saidBeSmart = this.hand;
    return true;
  }

  // You bet big and got beat at showdown: Nic feels for you ('That sucks.' / 'Brutal.'). With Freddy at the table too,
  // half the time it's the double act instead — Nic: 'You hate to see it.'  Freddy: 'You really do.'
  sympathy() {
    const seated = (id) => this.seats.find((s) => s.char?.id === id && !s.out);
    const nic = seated('nic'); if (!nic) return;
    const freddy = seated('freddy');
    const E = this.seatEls[nic.id];
    const delay = Math.max(900, 2300 - (Date.now() - (E?.spokeAt || 0)));   // let him finish whatever he just said
    setTimeout(() => {
      if (this.stopped) return;
      if (freddy && this.rng.chance(0.5)) {
        if (this.talk(nic, 'hateToSee', {}, 1)) setTimeout(() => { if (!this.stopped) { const F = this.seatEls[freddy.id]; if (F) F.spokeAt = 0; this.talk(freddy, 'reallyDo', {}, 1); } }, 1700);
      } else if (this.rng.chance(0.7)) this.talk(nic, 'brutal', {}, 1);
    }, delay);
  }

  // your hand right now, for the rankings card (only once the flop is out and you're still in)
  currentHand() {
    const p = this.hand?.players.find((x) => x.id === HUMAN);
    if (!p || p.folded || this.hand.finished || this.hand.board.length < 3) return null;
    const score = evaluate([...p.cards, ...this.hand.board]);
    return { cat: category(score), text: describe(score) };
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
      const btn = (label, cls, fn) => h('button', { class: 'act ' + cls, onClick: fn }, label);   // no click here: fold/check/call/raise each have their own sound the moment they land
      bar.append(btn('Fold', 'fold', () => done({ type: 'fold' })));
      if (legal.canCheck) bar.append(btn('Check', 'check', () => done({ type: 'check' })));
      else bar.append(btn(['Call ', h('span', { class: 'amt' }, this.fmt(legal.callAmount))], 'call', () => done({ type: 'call' })));
      if (legal.canRaise) {
        const verb = legal.isBet ? 'Bet' : 'Raise';
        if (legal.fixed) bar.append(btn(`${verb} ${this.fmt(legal.minRaiseTo)}`, 'raise', () => done({ type: 'raise', amount: legal.minRaiseTo })));
        else bar.append(btn(verb + '…', 'raise', () => this.raisePanel(legal, p, done)));
      } else if (legal.canCall && legal.callAmount >= p.stack) {
        // the call is all-in; make that obvious
        const c = bar.querySelector('.call'); clear(c); c.append('All in ', h('span', { class: 'amt' }, this.fmt(legal.callAmount)));
      }
      // opponents get impatient
      this.hurryT = setTimeout(() => { const s = this.rng.pick(this.seats.slice(1).filter((x) => x.stack > 0)); if (s) this.talk(s, 'hurry'); }, 14000);
    });
  }

  raisePanel(legal, p, done) {
    const hand = this.hand;
    const step = this.game.bb >= 10 ? this.game.sb : 1;
    let to = legal.minRaiseTo;
    const potAfterCall = hand.pot + legal.callAmount;
    const preset = (frac) => Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round((p.bet + legal.callAmount + potAfterCall * frac) / step) * step));
    const bar = this.actionBar; clear(bar); bar.classList.add('raising');
    const amt = h('div', { class: 'raise-amt' });
    const slider = h('input', { type: 'range', min: legal.minRaiseTo, max: legal.maxRaiseTo, step, value: to });
    const confirm = h('button', { class: 'act raise' }, '');
    const set = (v) => { to = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, Math.round(v / step) * step)); slider.value = to; amt.textContent = this.fmt(to); confirm.textContent = to >= legal.maxRaiseTo ? `All in ${this.fmt(to)}` : `${legal.isBet ? 'Bet' : 'Raise to'} ${this.fmt(to)}`; };
    slider.addEventListener('input', () => set(+slider.value));
    confirm.addEventListener('click', () => done({ type: 'raise', amount: to })); // the chip sound plays when the raise lands
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
    this.lastHumanWon = humanWon;
    const humanRev = res.revealed.find((r) => r.playerId === HUMAN);
    bank.recordHand({ won: humanWon, showdown: res.showdown, pot: this.tourney ? 0 : pot, net: this.tourney ? 0 : humanNet, handName: humanRev?.hand, handScore: humanRev?.score });   // tournament chips don't count as money
    for (const s of this.seats) s.stack = res.stacks[s.id] ?? s.stack;
    if (this.tourney) bank.setAtTable({ tableId: this.table.id, stack: 0, opponents: this.seats.slice(1).map((s) => s.id) }); else this.checkpoint();

    // table talk about the result
    const bigPot = humanNet >= this.game.bb * 25; // a big win for you, judged by what you gained
    for (const s of this.seats.slice(1)) {
      const won = res.awards.some((a) => a.playerId === s.id);
      const rev = res.revealed.find((r) => r.playerId === s.id);
      const net = res.net[s.id] || 0;
      const bigForThem = net >= this.game.bb * 25;
      updateMood(s.char.persona, s.mood, net, this.game.bb);
      const expr = bigForThem ? 'happy' : net <= -8 * this.game.bb ? 'mad' : null;
      if (expr) this.setExpression(s, expr);
      if (won) { this.talk(s, bigForThem ? 'winBig' : 'winSmall', {}, bigForThem ? 0.9 : 0.35); }
      else if (rev) {
        const cat = category(rev.score);
        if (cat >= 3 || (cat === 2 && -net >= this.game.bb * 12)) { this.talk(s, 'badBeat', {}, 0.85); }
        else if (hand.lastAggressor === s.id && cat <= 1) { this.talk(s, 'caughtBluff', {}, 0.7); }
        else if ((res.net[s.id] || 0) <= -25 * this.game.bb) { this.talk(s, 'loseBig', {}, 0.85); }
        else this.talk(s, 'lose', {}, 0.4);
      }
      if (s.stack <= 0) { this.talk(s, 'bustOut'); this.updateSeat(s); }
    }
    // someone who was still in the hand and lost chips to you may have something to say about it (folded players stay quiet)
    if (humanWon && bigPot) {
      const losers = this.seats.slice(1).filter((s) => { const p = hand.players.find((x) => x.id === s.id); return p && !p.folded && (res.net[s.id] || 0) < 0; });
      const s = losers.length ? this.rng.pick(losers) : null;
      if (s) setTimeout(() => this.talk(s, 'playerWin', {}, 0.5), 900);
    }
    const humanFolded = !!hand.players.find((p) => p.id === HUMAN)?.folded;
    if (res.showdown && !humanFolded && !humanWon && humanNet <= -25 * this.game.bb) this.sympathy();
    if (humanNet < 0 && !humanWon && !humanFolded && !this.lossSoundPlayed) audio.play('lose', { volume: 0.4 });   // folding isn't losing: no sound for blinds or bets you let go of (Nic)
    this.lossSoundPlayed = false;
    await this.wait(1600);
  }

  async betweenHands() {
    const human = this.human;
    if (this.tourney) {
      if (TEST_CHAMPION && this.lastHumanWon) for (const s of this.seats.slice(1)) s.stack = 0;   // TEST: one won hand = everyone else busts
      const alive = this.seats.filter((s) => s.stack > 0);
      for (const s of this.seats.slice(1)) if (s.stack <= 0 && !s.out) { s.out = true; this.levelBoost++; this.updateSeat(s); }   // every knockout also pushes the blinds up a level (next hand)
      if (human.stack <= 0 || alive.length === 1) {
        const place = human.stack > 0 ? 1 : alive.length + 1;   // busted: everyone still holding chips finished ahead of you
        this.placed = place; this.payout = this.table.prizes[place - 1] || 0;
        bank.setTourney(null);   // decided: a restart now can't replay it
        if (place === 1) {   // the ceremony: victory fanfare, chip rain, an applauding guest and the prize plaque (it has its own Collect)
          await this.wait(500);
          await championship({ winner: human.name, prize: this.payout, players: this.seats.length, tableName: this.table.name });
          await this.leave(); return false;
        }
        if (this.payout) { audio.play('win'); await this.wait(300); }
        else { const s = this.rng.pick(this.seats.slice(1).filter((x) => !x.out)); if (s) this.talk(s, 'playerBust'); audio.play('lose', { volume: 0.4 }); }
        const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 10 > 3 || Math.floor(n % 100 / 10) === 1) ? 0 : n % 10]);
        await modal({
          title: this.payout ? `${ordinal(place)} place — in the money` : `Out in ${ordinal(place)}`,
          className: this.payout ? 'tourney-result paid' : 'tourney-result', dismissable: false,
          body: (el) => el.append(h('p', {}, this.payout ? `${fmt$(this.payout)} goes to your bank.` : `The ${fmt$(this.table.buyIn)} entry is gone, and so are you. Next time.`)),
          buttons: [{ label: this.payout ? 'Collect' : 'Back to the lobby', kind: 'primary' }],
        });
        await this.leave(); return false;
      }
    } else if (human.stack <= 0) {
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

  async requestLeave() {
    audio.play('tap');
    if (this.tourney) return this.requestLeaveTourney();
    if (this.hand && !this.hand.finished) {
      const p = this.hand.players.find((x) => x.id === HUMAN);
      const inPot = p?.committed || 0;
      const choice = await askLeave({
        text: this.tourney ? "You're in the middle of a tournament hand." : "You're in the middle of a hand.",
        afterLabel: 'After this hand', nowLabel: 'Leave now',
        nowNote: this.tourney ? `Leaving forfeits the tournament — the ${fmt$(this.table.buyIn)} entry stays behind.` : inPot ? `Leaving now folds your hand; the ${this.fmt(inPot)} you've put in the pot stays behind.` : 'Leaving now folds your hand.',
      });
      if (choice === 'now') { this.leaveNow(); return; }
      this.leaving = choice === 'after';
      if (this.leaving) toast('Leaving after this hand.');
    } else if (this.resolveNext) {
      this.resolveNext();
    } else {
      this.leaving = true;
    }
  }
  // Tournament: the seat can be kept. Save & leave goes back to the lobby with the tournament saved (it resumes at the
  // start of the current hand); Forfeit gives it up and the entry fee is gone.
  async requestLeaveTourney() {
    const choice = await modal({
      title: 'Leave the tournament?', dismissable: true, className: 'tourney-leave',
      body: (el) => el.append(
        h('p', {}, 'Your seat is saved. Come back any time and pick up right where you left off.'),
        this.hand && !this.hand.finished ? h('p', { class: 'muted small' }, 'The hand in progress starts over when you come back.') : null,
      ),
      buttons: [
        { label: 'Forfeit', kind: 'danger', value: 'forfeit' },
        { label: 'Keep playing', kind: 'ghost', value: 'stay' },
        { label: 'Save & leave', kind: 'primary', value: 'save' },
      ],
    });
    if (choice === 'save') return this.saveAndLeave();
    if (choice !== 'forfeit') return;
    const sure = await modal({
      title: 'Give up your seat?', dismissable: true,
      body: `The ${fmt$(this.table.buyIn)} entry fee won't come back.`,
      buttons: [{ label: 'Keep my seat', kind: 'ghost', value: false }, { label: 'Forfeit', kind: 'danger', value: true }],
    });
    if (sure) this.leaveNow();
  }
  saveAndLeave() {
    if (this.stopped) return;
    clearTimeout(this.hurryT);
    if (!bank.state.tourney) this.saveTourney();
    this.stopped = true;
    this.unsubBank?.();
    if (this.pendingHuman) this.pendingHuman({ type: 'fold' });   // unblocks the hand loop; it sees `stopped` and does nothing
    toast('Tournament saved. Pick it up from the Hold\'em room.', 3200);
    this.onLeave({ stack: 0, saved: true });
  }

  // Walk out mid-hand: whatever is in the pot is forfeited, the rest of the stack goes back to the bank.
  leaveNow() {
    clearTimeout(this.hurryT);
    const p = this.hand?.players.find((x) => x.id === HUMAN);
    if (p) this.human.stack = p.stack;
    this.leave();
  }

  async leave() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.tourney) bank.setTourney(null);   // finished or forfeited: nothing left to resume
    this.unsubBank?.();
    const stack = this.tourney ? this.payout : this.human.stack;   // tournament: only a prize comes back, the chips were never money
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
