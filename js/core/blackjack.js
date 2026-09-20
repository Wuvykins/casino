// Blackjack engine. Pure logic, no DOM.
//
//   const shoe = new Shoe(rules.decks, rng);
//   const round = new Round({ shoe, rules, players: [{ id: 'you', bet: 25 }, { id: 'mom', bet: 10 }] });
//   round.deal();                      // -> phase 'insurance' (dealer shows an ace) or 'play' or 'settled'
//   round.insurance('you', true);      // during 'insurance' only; when everyone has answered the round continues
//   round.actor -> { playerId, handIndex } ; round.legal() -> { hit, stand, double, split }
//   round.act('hit' | 'stand' | 'double' | 'split')
//   ... phase 'dealer' -> round.playDealer() ; phase 'settled' -> round.results
//
// Cards are the same { r, s } objects as the rest of the casino (r 2..14, 14 = ace).

import { freshDeck, shuffle } from './cards.js';

export const DEFAULT_RULES = {
  decks: 6,
  penetration: 0.75,        // reshuffle when this much of the shoe has been dealt
  dealerHitsSoft17: false,  // S17
  blackjackPays: 1.5,
  doubleAfterSplit: true,
  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  peek: true,               // dealer checks for blackjack under a ten or ace
  insurance: true,
};

export class Shoe {
  constructor(decks, rng) { this.decks = decks; this.rng = rng; this.shuffle(); }
  shuffle() {
    this.cards = [];
    for (let d = 0; d < this.decks; d++) this.cards.push(...freshDeck());
    shuffle(this.cards, this.rng);
    this.dealt = 0;
    this.needsShuffle = false;
  }
  draw() {
    if (!this.cards.length) this.shuffle();
    this.dealt++;
    const c = this.cards.pop();
    if (this.dealt >= this.decks * 52 * (this.penetration || 0.75)) this.needsShuffle = true;
    return c;
  }
}

export function cardValue(c) { return c.r >= 10 && c.r <= 13 ? 10 : c.r === 14 ? 11 : c.r; }

// { total, soft } — best total ≤ 21 if possible; soft = an ace is counting as 11
export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += cardValue(c); if (c.r === 14) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const isBust = (cards) => handValue(cards).total > 21;
export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

export class Round {
  constructor({ shoe, rules = DEFAULT_RULES, players }) {
    this.shoe = shoe; this.rules = { ...DEFAULT_RULES, ...rules };
    this.shoe.penetration = this.rules.penetration;
    this.players = players.map((p) => ({ id: p.id, bet: p.bet, hands: [], insurance: 0, insuranceAsked: false, insuranceAnswered: false }));
    this.dealer = { cards: [], holeHidden: true };
    this.phase = 'new';       // new -> (insurance) -> play -> dealer -> settled
    this.actor = null;        // { playerId, handIndex }
    this.results = null;
    this.events = [];
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  player(id) { return this.players.find((p) => p.id === id); }
  get dealerUp() { return this.dealer.cards[0]; }

  deal() {
    if (this.shoe.needsShuffle) { this.shoe.shuffle(); this.emit('shuffle'); }
    for (const p of this.players) p.hands = [{ cards: [], bet: p.bet, done: false, doubled: false, fromSplit: false, splitAces: false, result: null, payout: 0 }];
    // two rounds, players first then dealer, like a real table
    for (let r = 0; r < 2; r++) {
      for (const p of this.players) { const c = this.shoe.draw(); p.hands[0].cards.push(c); this.emit('card', { playerId: p.id, handIndex: 0, card: c }); }
      const c = this.shoe.draw(); this.dealer.cards.push(c); this.emit('card', { playerId: 'dealer', card: c, hidden: r === 1 });
    }
    const up = cardValue(this.dealerUp);
    if (this.rules.insurance && up === 11) {
      this.phase = 'insurance';
      for (const p of this.players) p.insuranceAsked = true;
      this.emit('insuranceOffer');
      return this.phase;
    }
    return this.afterInsurance();
  }

  // answer for one player; when all have answered the round moves on
  insurance(playerId, take) {
    const p = this.player(playerId);
    if (!p || this.phase !== 'insurance' || p.insuranceAnswered) return;
    p.insuranceAnswered = true;
    p.insurance = take ? Math.floor(p.bet / 2) : 0;
    this.emit('insurance', { playerId, take });
    if (this.players.every((q) => q.insuranceAnswered)) this.afterInsurance();
    return this.phase;
  }

  afterInsurance() {
    const up = cardValue(this.dealerUp);
    if (this.rules.peek && (up === 10 || up === 11) && isBlackjack(this.dealer.cards)) {
      this.dealer.holeHidden = false;
      this.emit('dealerBlackjack');
      return this.settle();
    }
    // insurance lost (dealer has no blackjack); the side bet is resolved right away
    for (const p of this.players) if (p.insurance) this.emit('insuranceLost', { playerId: p.id, amount: p.insurance });
    // players with a natural are done immediately
    for (const p of this.players) if (isBlackjack(p.hands[0].cards)) p.hands[0].done = true;
    this.phase = 'play';
    return this.nextActor();
  }

  nextActor() {
    for (const p of this.players) for (let i = 0; i < p.hands.length; i++) {
      const h = p.hands[i];
      if (!h.done) {
        // a split hand that has only one card gets its second card now
        if (h.cards.length === 1) {
          const c = this.shoe.draw(); h.cards.push(c); this.emit('card', { playerId: p.id, handIndex: i, card: c });
          if (h.splitAces && !this.rules.hitSplitAces) { h.done = true; continue; }
          if (handValue(h.cards).total === 21) { h.done = true; continue; }
        }
        this.actor = { playerId: p.id, handIndex: i };
        this.emit('turn', { ...this.actor });
        return this.phase;
      }
    }
    this.actor = null;
    this.phase = 'dealer';
    return this.phase;
  }

  currentHand() { const p = this.player(this.actor.playerId); return { p, h: p.hands[this.actor.handIndex] }; }

  legal() {
    if (this.phase !== 'play' || !this.actor) return null;
    const { p, h } = this.currentHand();
    const two = h.cards.length === 2;
    const pairRank = two && cardValue(h.cards[0]) === cardValue(h.cards[1]);
    const canSplit = pairRank && p.hands.length < this.rules.maxSplitHands && !(h.splitAces && !this.rules.resplitAces);
    const canDouble = two && (!h.fromSplit || this.rules.doubleAfterSplit) && !(h.splitAces && !this.rules.hitSplitAces);
    return { hit: true, stand: true, double: canDouble, split: canSplit, bet: h.bet };
  }

  act(action) {
    if (this.phase !== 'play' || !this.actor) throw new Error('no one to act');
    const legal = this.legal();
    const { p, h } = this.currentHand();
    const i = this.actor.handIndex;
    switch (action) {
      case 'hit': {
        const c = this.shoe.draw(); h.cards.push(c); this.emit('card', { playerId: p.id, handIndex: i, card: c });
        const v = handValue(h.cards).total;
        if (v > 21) { h.done = true; h.result = 'bust'; this.emit('bust', { playerId: p.id, handIndex: i }); }
        else if (v === 21) h.done = true;
        break;
      }
      case 'stand': h.done = true; this.emit('stand', { playerId: p.id, handIndex: i }); break;
      case 'double': {
        if (!legal.double) throw new Error('cannot double');
        h.bet *= 2; h.doubled = true;
        const c = this.shoe.draw(); h.cards.push(c); this.emit('card', { playerId: p.id, handIndex: i, card: c });
        this.emit('double', { playerId: p.id, handIndex: i, bet: h.bet });
        h.done = true;
        if (handValue(h.cards).total > 21) { h.result = 'bust'; this.emit('bust', { playerId: p.id, handIndex: i }); }
        break;
      }
      case 'split': {
        if (!legal.split) throw new Error('cannot split');
        const aces = h.cards[0].r === 14;
        const second = h.cards.pop();
        const nh = { cards: [second], bet: h.bet, done: false, doubled: false, fromSplit: true, splitAces: aces, result: null, payout: 0 };
        h.fromSplit = true; h.splitAces = aces;
        p.hands.splice(i + 1, 0, nh);
        this.emit('split', { playerId: p.id, handIndex: i });
        // first hand draws its second card now
        const c = this.shoe.draw(); h.cards.push(c); this.emit('card', { playerId: p.id, handIndex: i, card: c });
        if (aces && !this.rules.hitSplitAces) h.done = true;
        else if (handValue(h.cards).total === 21) h.done = true;
        break;
      }
      default: throw new Error('unknown action ' + action);
    }
    if (h.done) return this.nextActor();
    this.emit('turn', { ...this.actor });
    return this.phase;
  }

  playDealer() {
    if (this.phase !== 'dealer') throw new Error('not dealer time');
    this.dealer.holeHidden = false;
    this.emit('dealerReveal', { card: this.dealer.cards[1] });
    const anyoneLive = this.players.some((p) => p.hands.some((h) => h.result !== 'bust' && !isBlackjack(h.cards)));
    if (anyoneLive) {
      for (;;) {
        const v = handValue(this.dealer.cards);
        if (v.total > 17 || (v.total === 17 && !(v.soft && this.rules.dealerHitsSoft17))) break;
        const c = this.shoe.draw(); this.dealer.cards.push(c); this.emit('card', { playerId: 'dealer', card: c });
      }
    }
    return this.settle();
  }

  settle() {
    const dv = handValue(this.dealer.cards).total;
    const dealerBJ = isBlackjack(this.dealer.cards);
    const dealerBust = dv > 21;
    const results = [];
    for (const p of this.players) {
      let net = 0;
      if (p.insurance) net += dealerBJ ? p.insurance * 2 : -p.insurance;
      for (const h of p.hands) {
        const v = handValue(h.cards).total;
        const natural = isBlackjack(h.cards) && !h.fromSplit;
        if (h.result === 'bust') h.payout = -h.bet;
        else if (dealerBJ) { h.result = natural ? 'push' : 'lose'; h.payout = natural ? 0 : -h.bet; }
        else if (natural) { h.result = 'blackjack'; h.payout = Math.floor(h.bet * this.rules.blackjackPays); }
        else if (dealerBust || v > dv) { h.result = 'win'; h.payout = h.bet; }
        else if (v === dv) { h.result = 'push'; h.payout = 0; }
        else { h.result = 'lose'; h.payout = -h.bet; }
        net += h.payout;
      }
      results.push({ playerId: p.id, net, hands: p.hands.map((h) => ({ result: h.result, payout: h.payout, bet: h.bet, total: handValue(h.cards).total })) });
    }
    this.phase = 'settled';
    this.actor = null;
    this.dealer.holeHidden = false;
    this.results = { dealerTotal: dv, dealerBust, dealerBlackjack: dealerBJ, players: results };
    this.emit('settled', this.results);
    return this.phase;
  }
}

// ---- basic strategy (multi-deck, S17, DAS) — what a good player does ----
// returns 'H' hit, 'S' stand, 'D' double (else hit), 'Ds' double (else stand), 'P' split
export function basicStrategy(cards, dealerUp, legal) {
  const up = cardValue(dealerUp);           // 2..11
  const v = handValue(cards);
  const two = cards.length === 2;
  const pair = two && cardValue(cards[0]) === cardValue(cards[1]);
  if (pair && legal?.split) {
    const r = cardValue(cards[0]);
    if (r === 11 || r === 8) return 'P';
    if (r === 10 || r === 5) { /* never split */ }
    else if (r === 9) { if (up !== 7 && up !== 10 && up !== 11) return 'P'; }
    else if (r === 7) { if (up <= 7) return 'P'; }
    else if (r === 6) { if (up >= 2 && up <= 6) return 'P'; }
    else if (r === 4) { if (up === 5 || up === 6) return 'P'; }
    else if (r === 3 || r === 2) { if (up <= 7) return 'P'; }
  }
  const dbl = (alt) => (two && legal?.double ? 'D' : alt);
  if (v.soft) {
    const t = v.total;
    if (t >= 20) return 'S';
    if (t === 19) return up === 6 && two && legal?.double ? 'Ds' : 'S';
    if (t === 18) { if (up >= 2 && up <= 6) return two && legal?.double ? 'Ds' : 'S'; if (up === 7 || up === 8) return 'S'; return 'H'; }
    if (t === 17) return up >= 3 && up <= 6 ? dbl('H') : 'H';
    if (t === 16 || t === 15) return up >= 4 && up <= 6 ? dbl('H') : 'H';
    return up === 5 || up === 6 ? dbl('H') : 'H';      // soft 13-14
  }
  const t = v.total;
  if (t >= 17) return 'S';
  if (t >= 13) return up <= 6 ? 'S' : 'H';
  if (t === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
  if (t === 11) return dbl('H');
  if (t === 10) return up <= 9 ? dbl('H') : 'H';
  if (t === 9) return up >= 3 && up <= 6 ? dbl('H') : 'H';
  return 'H';
}

// An opponent's decision: basic strategy with mistakes proportional to (1 - skill),
// and a few personality tells (aggressive players double/split more, timid ones stand early).
export function aiDecide(cards, dealerUp, legal, persona, rng) {
  let move = basicStrategy(cards, dealerUp, legal);
  const v = handValue(cards).total;
  const err = (1 - (persona.skill ?? 0.5)) * 0.35;
  if (rng.chance(err)) {
    // typical amateur mistakes
    if (move === 'H' && v >= 12 && rng.chance(0.6)) move = 'S';            // scared of busting
    else if (move === 'S' && v <= 16 && rng.chance(0.5)) move = 'H';       // "one more"
    else if ((move === 'D' || move === 'Ds') && rng.chance(0.5)) move = move === 'D' ? 'H' : 'S';
    else if (move === 'P' && rng.chance(0.5)) move = 'H';
  }
  if ((move === 'H') && legal?.double && v >= 9 && v <= 11 && rng.chance((persona.aggro ?? 0.5) * 0.25)) move = 'D';
  if (move === 'D' && !legal?.double) move = 'H';
  if (move === 'Ds' && !legal?.double) move = 'S';
  if (move === 'P' && !legal?.split) move = 'H';
  return { D: 'double', Ds: 'double', P: 'split', H: 'hit', S: 'stand' }[move];
}
