// Texas Hold'em hand engine. Pure logic, no DOM. Drives one hand at a time.
//
//   const hand = new Hand({ table, players, button, rng });
//   hand.start();
//   while (!hand.finished) {
//     const p = hand.actor;                 // player who must act
//     const legal = hand.legalActions();    // what they may do
//     hand.act(p.id, { type: 'call' });     // or fold/check/bet/raise/allin with amount (raise-to)
//   }
//   hand.result -> winners etc.  hand.events -> ordered log for the UI to animate.
//
// table = { mode: 'limit'|'nolimit', sb, bb }
// players = [{ id, name, stack, seat }] in clockwise seat order (only players dealt in)

import { freshDeck, shuffle } from './cards.js';
import { evaluate, describe, bestFive, describeVs } from './evaluator.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];
const LIMIT_CAP = 4; // bet + 3 raises per street (no cap when heads-up)

export class Hand {
  constructor({ table, players, button, rng, deck }) {
    this.table = table;
    this.rng = rng;
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, seat: p.seat, idx: i,
      stack: p.stack, startStack: p.stack,
      cards: [], folded: false, allIn: false,
      bet: 0,          // this street
      committed: 0,    // whole hand
      needsAction: false,
      actedAtBet: -1,  // currentBet value when this player last acted this street
      lastAction: null,
      aggressions: 0,  // bets/raises made this hand (for opponent range reads)
      calls: 0,
    }));
    if (this.players.length < 2) throw new Error('need at least 2 players');
    this.button = button % this.players.length;
    this.deck = deck ? deck.slice() : shuffle(freshDeck(), rng);
    this.board = [];
    this.street = 'preflop';
    this.streetIdx = 0;
    this.currentBet = 0;
    this.lastRaiseSize = 0;
    this.lastFullRaiseBet = 0;
    this.raisesThisStreet = 0;
    this.actorIdx = -1;
    this.events = [];
    this.finished = false;
    this.result = null;
    this.lastAggressor = null;
  }

  // ---------- helpers ----------
  get n() { return this.players.length; }
  get actor() { return this.actorIdx >= 0 ? this.players[this.actorIdx] : null; }
  get pot() { return this.players.reduce((s, p) => s + p.committed, 0); }
  get potBeforeStreet() { return this.pot - this.players.reduce((s, p) => s + p.bet, 0); }
  byId(id) { return this.players.find((p) => p.id === id); }
  next(i) { return (i + 1) % this.n; }
  active() { return this.players.filter((p) => !p.folded); }
  canAct(p) { return !p.folded && !p.allIn; }
  actors() { return this.players.filter((p) => this.canAct(p)); }
  betSize() { return (this.streetIdx >= 2 ? 2 : 1) * this.table.bb; } // limit: big bet on turn/river
  emit(type, data = {}) { this.events.push({ type, street: this.street, ...data }); }

  sbIdx() { return this.n === 2 ? this.button : this.next(this.button); }
  bbIdx() { return this.next(this.sbIdx()); }

  // ---------- flow ----------
  start() {
    const { sb, bb } = this.table;
    this.postBlind(this.players[this.sbIdx()], sb, 'sb');
    this.postBlind(this.players[this.bbIdx()], bb, 'bb');
    this.currentBet = bb;
    this.lastRaiseSize = bb;
    this.lastFullRaiseBet = bb;
    this.raisesThisStreet = 1; // the blind counts as the first bet in limit
    // deal two cards each, starting left of the button
    for (let round = 0; round < 2; round++) {
      for (let k = 1; k <= this.n; k++) {
        const p = this.players[(this.button + k) % this.n];
        p.cards.push(this.deck.pop());
      }
    }
    this.emit('deal', { players: this.players.map((p) => ({ id: p.id, cards: p.cards.slice() })), button: this.players[this.button].id });
    this.openStreetAction(this.bbIdx());
  }

  postBlind(p, amount, kind) {
    const a = Math.min(amount, p.stack);
    p.stack -= a; p.bet += a; p.committed += a;
    if (p.stack === 0) p.allIn = true;
    p.lastAction = kind;
    this.emit('blind', { playerId: p.id, kind, amount: a });
  }

  // Set needsAction flags and pick the first actor after `afterIdx`.
  openStreetAction(afterIdx) {
    const actors = this.actors();
    for (const p of this.players) {
      p.needsAction = this.canAct(p) && (actors.length > 1 || p.bet < this.currentBet);
    }
    this.actorIdx = -1;
    for (let k = 1; k <= this.n; k++) {
      const i = (afterIdx + k) % this.n;
      if (this.players[i].needsAction) { this.actorIdx = i; break; }
    }
    if (this.actorIdx === -1) this.advanceStreet();
    else this.emit('turn', { playerId: this.actor.id });
  }

  legalActions(p = this.actor) {
    if (!p || this.finished) return null;
    const toCall = Math.min(this.currentBet - p.bet, p.stack);
    const out = {
      playerId: p.id,
      canFold: true,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      callAmount: toCall,
      canRaise: false,
      isBet: this.currentBet === 0,
      minRaiseTo: 0, maxRaiseTo: 0,
      fixed: this.table.mode === 'limit',
      allInAmount: p.bet + p.stack,
      pot: this.pot,
    };
    if (p.stack <= toCall) return out; // calling puts us all-in; no raise possible
    const maxTo = p.bet + p.stack;
    if (this.table.mode === 'limit') {
      const capped = this.raisesThisStreet >= LIMIT_CAP && this.active().length > 2;
      if (!capped) {
        const to = Math.min(this.currentBet + this.betSize(), maxTo);
        if (to > this.currentBet) { out.canRaise = true; out.minRaiseTo = to; out.maxRaiseTo = to; }
      }
    } else {
      const reopened = p.actedAtBet < this.lastFullRaiseBet;
      if (reopened) {
        let minTo = this.currentBet === 0 ? this.table.bb : this.currentBet + this.lastRaiseSize;
        if (minTo > maxTo) minTo = maxTo;
        if (maxTo > this.currentBet) { out.canRaise = true; out.minRaiseTo = minTo; out.maxRaiseTo = maxTo; }
      }
    }
    return out;
  }

  act(playerId, action) {
    if (this.finished) throw new Error('hand finished');
    const p = this.actor;
    if (!p || p.id !== playerId) throw new Error(`not ${playerId}'s turn`);
    const legal = this.legalActions(p);
    let { type, amount } = action;
    if (type === 'allin') {
      if (legal.canRaise) { type = 'raise'; amount = legal.maxRaiseTo; }
      else if (legal.canCall) type = 'call';
      else type = 'check';
    }
    const prevBet = this.currentBet;
    let ev = { playerId: p.id, action: type, amount: 0 };
    switch (type) {
      case 'fold':
        p.folded = true; p.needsAction = false; p.lastAction = 'fold';
        break;
      case 'check':
        if (!legal.canCheck) throw new Error('cannot check');
        p.lastAction = 'check';
        break;
      case 'call': {
        if (!legal.canCall) throw new Error('nothing to call');
        const a = legal.callAmount;
        p.stack -= a; p.bet += a; p.committed += a; ev.amount = a;
        if (p.stack === 0) p.allIn = true;
        p.lastAction = 'call';
        if (this.street !== 'preflop' || a > this.table.bb) p.calls++;
        break;
      }
      case 'bet':
      case 'raise': {
        if (!legal.canRaise) throw new Error('cannot raise');
        let to = legal.fixed ? legal.minRaiseTo : Math.floor(amount);
        if (!(to >= legal.minRaiseTo && to <= legal.maxRaiseTo)) throw new Error(`raise to ${to} out of range ${legal.minRaiseTo}-${legal.maxRaiseTo}`);
        const add = to - p.bet;
        p.stack -= add; p.bet = to; p.committed += add; ev.amount = add; ev.to = to;
        if (p.stack === 0) p.allIn = true;
        const raiseSize = to - prevBet;
        const full = raiseSize >= this.lastRaiseSize || legal.fixed;
        this.currentBet = to;
        this.raisesThisStreet++;
        this.lastAggressor = p.id;
        p.aggressions++;
        if (full) {
          this.lastRaiseSize = raiseSize;
          this.lastFullRaiseBet = to;
        }
        // everyone else who can act must respond
        for (const q of this.players) if (q !== p && this.canAct(q)) q.needsAction = true;
        p.lastAction = prevBet === 0 ? 'bet' : 'raise';
        ev.action = p.lastAction;
        break;
      }
      default: throw new Error('unknown action ' + type);
    }
    p.needsAction = false;
    p.actedAtBet = this.currentBet;
    ev.allIn = p.allIn;
    ev.stack = p.stack;
    this.emit('action', ev);
    this.advance();
  }

  advance() {
    if (this.active().length === 1) return this.finishUncontested();
    // next player who still needs to act
    for (let k = 1; k <= this.n; k++) {
      const i = (this.actorIdx + k) % this.n;
      if (this.players[i].needsAction && this.canAct(this.players[i])) {
        this.actorIdx = i;
        this.emit('turn', { playerId: this.actor.id });
        return;
      }
    }
    this.advanceStreet();
  }

  advanceStreet() {
    // gather bets
    for (const p of this.players) { p.bet = 0; p.actedAtBet = -1; p.needsAction = false; p.lastAction = null; }
    this.currentBet = 0; this.lastRaiseSize = this.table.bb; this.lastFullRaiseBet = 0; this.raisesThisStreet = 0;
    if (this.street === 'river') return this.showdown();
    this.streetIdx++;
    this.street = STREETS[this.streetIdx];
    this.deck.pop(); // burn
    const dealt = this.street === 'flop' ? [this.deck.pop(), this.deck.pop(), this.deck.pop()] : [this.deck.pop()];
    this.board.push(...dealt);
    const runout = this.actors().length <= 1;
    this.emit('street', { cards: dealt, board: this.board.slice(), pot: this.pot, runout });
    if (runout) return this.advanceStreet();
    this.actorIdx = this.button;
    this.openStreetAction(this.button);
  }

  // ---------- resolution ----------
  buildPots() {
    const levels = [...new Set(this.players.map((p) => p.committed).filter((c) => c > 0))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const level of levels) {
      const contributors = this.players.filter((p) => p.committed >= level);
      const amount = (level - prev) * contributors.length;
      const eligible = contributors.filter((p) => !p.folded).map((p) => p.id);
      const last = pots[pots.length - 1];
      if (last && last.eligible.length === eligible.length && last.eligible.every((id) => eligible.includes(id))) last.amount += amount;
      else pots.push({ amount, eligible });
      prev = level;
    }
    return pots;
  }

  finishUncontested() {
    const winner = this.active()[0];
    const total = this.pot;
    winner.stack += total;
    const awards = [{ playerId: winner.id, amount: total, potIndex: 0, hand: null }];
    this.emit('award', { awards, pots: [{ amount: total, eligible: [winner.id] }], showdown: false });
    this.finish({ showdown: false, awards, revealed: [], pots: [{ amount: total, eligible: [winner.id] }] });
  }

  showdown() {
    const pots = this.buildPots();
    const scores = {};
    const revealed = [];
    for (const p of this.active()) {
      const all = [...p.cards, ...this.board];
      scores[p.id] = evaluate(all);
      revealed.push({ playerId: p.id, cards: p.cards.slice(), score: scores[p.id], hand: describe(scores[p.id]), best: bestFive(all) });
    }
    const awards = [];
    pots.forEach((pot, potIndex) => {
      let best = -1; let winners = [];
      for (const id of pot.eligible) {
        const s = scores[id];
        if (s > best) { best = s; winners = [id]; } else if (s === best) winners.push(id);
      }
      // order winners clockwise from left of button for odd-chip distribution
      winners.sort((a, b) => this.relPos(a) - this.relPos(b));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      // the name to announce: with the kicker when it's what beat an equal-looking hand (a split pot never needs one)
      const beaten = pot.eligible.filter((id) => !winners.includes(id)).map((id) => scores[id]);
      const told = winners.length === 1 ? describeVs(best, beaten) : describe(best);
      for (const id of winners) {
        const amt = share + (odd > 0 ? 1 : 0); if (odd > 0) odd--;
        this.byId(id).stack += amt;
        awards.push({ playerId: id, amount: amt, potIndex, hand: describe(best), told });
      }
    });
    this.emit('showdown', { revealed, pots });
    this.emit('award', { awards, pots, showdown: true });
    this.finish({ showdown: true, awards, revealed, pots });
  }

  relPos(id) { const i = this.byId(id).idx; return (i - this.button - 1 + this.n) % this.n; }

  finish(result) {
    this.finished = true;
    this.actorIdx = -1;
    result.net = Object.fromEntries(this.players.map((p) => [p.id, p.stack - p.startStack]));
    result.stacks = Object.fromEntries(this.players.map((p) => [p.id, p.stack]));
    result.board = this.board.slice();
    this.result = result;
    this.emit('end', { net: result.net });
  }

  // ---------- read-only views for AI/UI ----------
  // The five board cards this hand will end with, read from the deck without dealing (burn, flop, burn, turn, burn, river).
  finalBoard() {
    const d = this.deck.slice(), b = this.board.slice();
    if (b.length === 0) { d.pop(); b.push(d.pop(), d.pop(), d.pop()); }
    while (b.length < 5) { d.pop(); b.push(d.pop()); }
    return b;
  }
  activeOpponents(p) { return this.active().filter((q) => q.id !== p.id).length; }
  positionOf(p) { // 0 = first to act preflop … n-1 = big blind (as a fraction of table)
    const order = (p.idx - this.bbIdx() - 1 + this.n) % this.n; // 0 = UTG
    return this.n <= 2 ? (p.idx === this.button ? 0 : 1) : order;
  }
}
