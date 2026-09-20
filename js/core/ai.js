// Hold'em opponents. A persona is five dials from 0 to 1:
//   skill  - how accurately they read their hand strength and the odds
//   tight  - how many hands they play (1 = rock, 0 = plays anything)
//   aggro  - how often they bet/raise instead of check/call
//   bluff  - how often they bet with nothing
//   tilt   - how badly losing a big pot affects them
// mood is per-session mutable state: { tilt: 0..1 }

import { freshDeck } from './cards.js';
import { evaluate, category } from './evaluator.js';
import { gauss } from './rng.js';

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// ---- preflop strength (Chen formula, normalised to 0..1) ----
// Reference: AA 1.0, KK .93, AKs .63, AKo .53, KQs .53, JTs .49, 88 .44, A5o .35, 22 .30, 72o 0
export function preflopStrength(cards) {
  const [a, b] = cards[0].r >= cards[1].r ? cards : [cards[1], cards[0]];
  const hi = (r) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let pts = hi(a.r);
  if (a.r === b.r) pts = Math.max(5, pts * 2);
  if (a.s === b.s) pts += 2;
  const gap = a.r - b.r;
  if (gap === 2) pts -= 1; else if (gap === 3) pts -= 2; else if (gap === 4) pts -= 4; else if (gap >= 5) pts -= 5;
  if (gap <= 2 && gap > 0 && a.r < 12) pts += 1;
  return clamp((pts + 1.5) / 21.5);
}

// ---- Monte Carlo equity vs nOpp random hands ----
export function equity(hole, board, nOpp, rollouts, rng) {
  const used = new Set([...hole, ...board].map((c) => c.r * 4 + c.s));
  const deck = freshDeck().filter((c) => !used.has(c.r * 4 + c.s));
  const need = nOpp * 2 + (5 - board.length);
  let wins = 0, ties = 0;
  for (let i = 0; i < rollouts; i++) {
    for (let k = 0; k < need; k++) {           // partial Fisher–Yates: draw `need` cards
      const j = k + rng.int(deck.length - k);
      const t = deck[k]; deck[k] = deck[j]; deck[j] = t;
    }
    const fullBoard = board.concat(deck.slice(nOpp * 2, need));
    const my = evaluate(hole.concat(fullBoard));
    let best = -1;
    for (let o = 0; o < nOpp; o++) {
      const s = evaluate([deck[o * 2], deck[o * 2 + 1], ...fullBoard]);
      if (s > best) best = s;
    }
    if (my > best) wins++; else if (my === best) ties++;
  }
  return (wins + ties / 2) / rollouts;
}

// ---- Monte Carlo equity vs opponents with narrowed ranges ----
// opps: [{ f }] where f is the fraction of hands the opponent could hold (1 = anything,
// 0.2 = only the top 20% of hands on this board). Aggressive action shrinks f.
export function equityVsRanges(hole, board, opps, rollouts, rng) {
  const usedBase = new Set([...hole, ...board].map((c) => c.r * 4 + c.s));
  const deck = freshDeck().filter((c) => !usedBase.has(c.r * 4 + c.s));
  const boardNeed = 5 - board.length;
  // build a pool of candidate hands for each ranged opponent
  const pools = opps.map((o) => {
    if (o.f >= 0.98) return null;
    const cands = [];
    for (let i = 0; i < 100; i++) {
      const a = deck[rng.int(deck.length)]; let b = deck[rng.int(deck.length)];
      while (b === a) b = deck[rng.int(deck.length)];
      const s = board.length ? evaluate([a, b, ...board]) : preflopStrength([a, b]) * 1e6;
      cands.push({ h: [a, b], s });
    }
    cands.sort((x, y) => y.s - x.s);
    return cands.slice(0, Math.max(3, Math.ceil(cands.length * o.f)));
  });
  let wins = 0, ties = 0;
  for (let i = 0; i < rollouts; i++) {
    const used = new Set();
    const oppHands = [];
    for (let o = 0; o < opps.length; o++) {
      let h = null;
      if (pools[o]) {
        for (let tries = 0; tries < 6 && !h; tries++) {
          const c = pools[o][rng.int(pools[o].length)].h;
          if (!used.has(c[0].r * 4 + c[0].s) && !used.has(c[1].r * 4 + c[1].s)) h = c;
        }
      }
      if (!h) {
        h = [];
        while (h.length < 2) { const c = deck[rng.int(deck.length)]; const k = c.r * 4 + c.s; if (!used.has(k)) { used.add(k); h.push(c); } }
      } else { used.add(h[0].r * 4 + h[0].s); used.add(h[1].r * 4 + h[1].s); }
      oppHands.push(h);
    }
    const extra = [];
    while (extra.length < boardNeed) { const c = deck[rng.int(deck.length)]; const k = c.r * 4 + c.s; if (!used.has(k)) { used.add(k); extra.push(c); } }
    const fullBoard = board.concat(extra);
    const my = evaluate(hole.concat(fullBoard));
    let best = -1;
    for (const h of oppHands) { const s = evaluate([h[0], h[1], ...fullBoard]); if (s > best) best = s; }
    if (my > best) wins++; else if (my === best) ties++;
  }
  return (wins + ties / 2) / rollouts;
}

// How much of the deck an opponent could still hold, from what they've done this hand.
function rangeFraction(opp, skill, read) {
  let f = opp.aggressions >= 3 ? 0.1 : opp.aggressions === 2 ? 0.22 : opp.aggressions === 1 ? 0.42 : opp.calls >= 2 ? 0.6 : opp.calls === 1 ? 0.8 : 1;
  if (read) f = clamp(f * (1 + (read.aggr - 0.5) * 0.9 + (read.loose - 0.5) * 0.4), 0.05, 1);
  // weak players don't narrow ranges much: they see two pair and think "two pair"
  f = f + (1 - skill) * (1 - f) * 0.75;
  return clamp(f, 0.05, 1);
}

// ---- sizing ----
function roundChips(amount, bb) {
  const unit = bb >= 10 ? bb / 2 : 1;
  return Math.max(unit, Math.round(amount / unit) * unit);
}
function sizeRaise(hand, p, legal, fraction, rng) {
  const { bb } = hand.table;
  let to;
  if (hand.street === 'preflop') {
    if (hand.currentBet === bb) {
      const limpers = hand.players.filter((q) => q.bet === bb && q !== p && q.lastAction === 'call').length;
      to = bb * (2.5 + rng.next() * 1.0) + bb * limpers;
    } else {
      to = hand.currentBet * (2.6 + rng.next() * 0.6);
    }
  } else if (legal.isBet) {
    to = hand.pot * fraction;
  } else {
    to = hand.currentBet * (2.2 + rng.next() * 0.6) + (hand.pot - hand.currentBet) * 0.15;
  }
  to = roundChips(to, bb);
  to = clamp(to, legal.minRaiseTo, legal.maxRaiseTo);
  if (to > p.stack * 0.72 + p.bet) to = legal.maxRaiseTo; // don't leave a silly crumb behind
  return Math.floor(to);
}

// reads: optional { [playerId]: { loose: 0..1, aggr: 0..1 } } — what this player believes about the others.
// Skilled players lean on it: they call down lighter against loose/aggressive bettors and fold more to rocks.
export function readsFromPersonas(seatPersonas) {
  const out = {};
  for (const [id, P] of Object.entries(seatPersonas)) out[id] = { loose: 1 - P.tight, aggr: P.aggro * 0.7 + P.bluff * 0.3 };
  return out;
}

// ---- the decision ----
export function decide(hand, p, persona, mood, rng, reads = {}) {
  const legal = hand.legalActions(p);
  const { skill, tight, aggro, bluff } = persona;
  const tilt = mood?.tilt || 0;
  const t = clamp(tight - 0.35 * tilt);
  const a = clamp(aggro + 0.3 * tilt);
  const bb = hand.table.bb;
  const nOpp = hand.activeOpponents(p);
  const toCall = legal.callAmount;
  const potOdds = toCall > 0 ? toCall / (hand.pot + toCall) : 0;
  const bigDecision = toCall >= p.stack * 0.4;
  const shortStack = p.stack < 15 * bb;
  const chance = (x) => rng.chance(clamp(x));
  const noise = () => gauss(rng) * (1 - skill) * 0.1;
  const readAdj = () => {
    const r = hand.lastAggressor && hand.lastAggressor !== p.id ? reads[hand.lastAggressor] : null;
    return r ? skill * ((r.loose - 0.5) * 0.14 + (r.aggr - 0.5) * 0.1) : 0;
  };
  let perceived = 0;
  const tag = (action, why) => { action.why = why; action.perceived = perceived; return action; };
  const callOrCheck = () => (legal.canCall ? { type: 'call' } : { type: 'check' });
  const foldOrCheck = () => (legal.canCheck ? { type: 'check' } : { type: 'fold' });

  // A raise that respects how much of the stack it commits. purpose: 'value' | 'thin' | 'bluff'
  // Returns null when the player shouldn't make this raise after all.
  const raise = (purpose, fraction = 0.6) => {
    if (!legal.canRaise) return null;
    const to = sizeRaise(hand, p, legal, fraction, rng);
    const committing = to - p.bet > p.stack * 0.5;
    if (committing && !shortStack) {
      if (purpose === 'bluff' && !chance(persona.shove || 0)) return null;
      if (purpose === 'thin') return null;
      if (purpose === 'value' && perceived < 0.66 - 0.1 * tilt) return null; // not strong enough to stack off
    }
    return { type: 'raise', amount: to };
  };
  const raiseOr = (purpose, fallback, fraction) => raise(purpose, fraction) || fallback();

  // ================= preflop =================
  if (hand.street === 'preflop') {
    const n = hand.n;
    const pos = n > 2 ? hand.positionOf(p) / (n - 1) : hand.positionOf(p);
    const raisesFaced = Math.max(0, hand.raisesThisStreet - 1);
    perceived = preflopStrength(p.cards) + pos * 0.08 + noise() + tilt * 0.06 + (raisesFaced > 0 ? readAdj() : 0);
    const raiseThresh = 0.40 + 0.18 * t + 0.1 * raisesFaced + 0.015 * Math.max(0, nOpp - 3);
    const callThresh = 0.26 + 0.22 * t + 0.09 * raisesFaced - 0.1 * (1 - skill);
    const cheap = toCall > 0 && potOdds < 0.15;

    if (perceived > raiseThresh) {
      if (chance(0.55 + 0.45 * a)) return tag(raiseOr('value', callOrCheck), 'strong');
      return tag(callOrCheck(), 'strong-flat');
    }
    if (legal.canCheck) {
      if (chance(a * 0.15 + bluff * 0.1)) return tag(raiseOr('bluff', () => ({ type: 'check' })), 'steal');
      return tag({ type: 'check' }, 'option');
    }
    if (bigDecision) return tag(foldOrCheck(), 'weak');
    if (perceived > callThresh || (cheap && perceived > callThresh - 0.1)) {
      if (raisesFaced === 0 && pos > 0.6 && chance(a * 0.3)) return tag(raiseOr('bluff', callOrCheck), 'steal');
      return tag(callOrCheck(), 'playable');
    }
    if (raisesFaced === 0 && chance(bluff * 0.12 + tilt * 0.05)) return tag(raiseOr('bluff', foldOrCheck), 'bluff');
    if (raisesFaced === 0 && chance((1 - t) * (1 - skill) * 0.2)) return tag(callOrCheck(), 'station');
    if (persona.pairLover && p.cards[0].r === p.cards[1].r && toCall <= p.stack * 0.15 && chance(persona.pairLover)) return tag(callOrCheck(), 'pocket pair');
    return tag(foldOrCheck(), 'weak');
  }

  // ================= postflop =================
  const rollouts = Math.round(80 + 220 * skill);
  const opps = hand.active().filter((q) => q.id !== p.id).map((q) => ({ f: rangeFraction(q, skill, reads[q.id]) }));
  const eq = equityVsRanges(p.cards, hand.board, opps, rollouts, rng);
  perceived = clamp(eq + noise() + tilt * 0.04);
  const strong = 0.62 + 0.04 * Math.max(0, nOpp - 1);
  const medium = 0.45;

  if (legal.canCheck) {
    if (perceived > strong) {
      if (chance(0.55 + 0.45 * a)) return tag(raiseOr('value', () => ({ type: 'check' }), 0.45 + rng.next() * 0.3), 'value');
      return tag({ type: 'check' }, 'trap');
    }
    if (perceived > medium) {
      if (chance(0.3 * a)) return tag(raiseOr('thin', () => ({ type: 'check' }), 0.4), 'thin value');
      return tag({ type: 'check' }, 'medium');
    }
    const bluffP = bluff * 0.2 * (nOpp === 1 ? 1 : 0.5) + tilt * 0.08;
    if (chance(bluffP)) return tag(raiseOr('bluff', () => ({ type: 'check' }), 0.5), 'bluff');
    return tag({ type: 'check' }, 'weak');
  }

  // facing a bet (opponent reads are already baked into the range fractions above)
  const margin = 0.02 + 0.07 * t - 0.08 * (1 - skill) + (bigDecision ? 0.06 : 0);
  if (perceived > 0.78) {
    if (chance(0.45 + 0.55 * a)) return tag(raiseOr('value', () => ({ type: 'call' })), 'value raise');
    return tag({ type: 'call' }, 'slowplay');
  }
  if (perceived > potOdds + margin) {
    if (perceived > strong && chance(a * 0.35)) return tag(raiseOr('value', () => ({ type: 'call' })), 'value raise');
    if (shortStack && perceived > strong && legal.canRaise) return tag({ type: 'allin' }, 'short shove');
    return tag({ type: 'call' }, 'call');
  }
  // "I have a pair": some people can't fold one, as long as the bet isn't for their whole stack
  if (persona.pairLover && !bigDecision && toCall <= p.stack * 0.25 && category(evaluate([...p.cards, ...hand.board])) >= 1 && chance(persona.pairLover)) return tag({ type: 'call' }, 'pair lover');
  // calling stations pay off bets they shouldn't, mostly when the price isn't terrible
  const stationP = (1 - t) * (1 - skill) * 0.28 * (perceived > potOdds * 0.8 ? 1.4 : 0.5) + tilt * 0.12;
  if (!bigDecision && chance(stationP)) return tag({ type: 'call' }, 'station');
  if (!bigDecision && chance(bluff * 0.07 + tilt * 0.04)) return tag(raiseOr('bluff', () => ({ type: 'fold' })), 'bluff raise');
  return tag({ type: 'fold' }, 'fold');
}

// mood bookkeeping after each hand
export function updateMood(persona, mood, net, bb) {
  const bbs = net / bb;
  if (bbs < -25) mood.tilt = clamp(mood.tilt + persona.tilt * 0.6);
  else if (bbs < -8) mood.tilt = clamp(mood.tilt + persona.tilt * 0.3);
  else if (bbs > 0) mood.tilt *= 0.65;
  else mood.tilt *= 0.9;
  if (mood.tilt < 0.05) mood.tilt = 0;
  return mood;
}

// how long they pretend to think, in ms
export function thinkTime(action, legal, rng) {
  let t = 500 + rng.next() * 900;
  if (action.type === 'raise' || action.type === 'allin') t += 400 + rng.next() * 600;
  if (legal && legal.callAmount > 0 && legal.callAmount >= legal.pot * 0.5) t += 500 + rng.next() * 900;
  if (action.type === 'fold' && legal && legal.callAmount === 0) t = 300;
  return t;
}
