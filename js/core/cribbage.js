// Two-handed cribbage: six-card deal, two to the crib, pegging to 31, then the show. First to 121.
//
//   const g = new Game({ rng, players: ['you', 'mom'], dealer: 'mom' });
//   g.deal();                              // phase 'discard'; g.hands[id] has 6 cards
//   g.discard('you', [c1, c2]);            // both players discard -> starter is cut -> phase 'pegging'
//   g.legalPlays('you')                    // cards that keep the count <= 31
//   g.play('you', card)                    // scores, handles go / 31 / last card automatically -> events
//   ...until phase 'show'; then g.showNext() three times (pone hand, dealer hand, crib)
//   g.phase === 'over' as soon as someone reaches 121; g.result = { winner, loser, skunk: 0|1|2 }
//   g.deal() again for the next hand (dealer alternates).
import { freshDeck, shuffle, sameCard } from './cards.js';

export const TARGET = 121;
export const pegValue = (c) => (c.r === 14 ? 1 : Math.min(10, c.r));  // A=1, 10/J/Q/K=10
export const runRank = (c) => (c.r === 14 ? 1 : c.r);                  // A=1 ... K=13 for runs

// ---------- scoring the show ----------
export function scoreHand(hand, starter, isCrib = false) {
  const all = starter ? [...hand, starter] : hand.slice();
  const items = [];
  // fifteens
  const n = all.length;
  for (let m = 1; m < (1 << n); m++) {
    let sum = 0, cnt = 0; const cs = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) { sum += pegValue(all[i]); cnt++; cs.push(all[i]); }
    if (cnt >= 2 && sum === 15) items.push({ name: 'Fifteen', points: 2, cards: cs });
  }
  // pairs
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (all[i].r === all[j].r) items.push({ name: 'Pair', points: 2, cards: [all[i], all[j]] });
  // runs (with multiplicity: double run, triple run, double-double)
  const byRank = new Map();
  for (const c of all) byRank.set(runRank(c), [...(byRank.get(runRank(c)) || []), c]);
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  let i = 0;
  while (i < ranks.length) {
    let j = i;
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j++;
    const len = j - i + 1;
    if (len >= 3) {
      const groups = ranks.slice(i, j + 1).map((r) => byRank.get(r));
      const combos = groups.reduce((acc, g) => acc.flatMap((a) => g.map((c) => [...a, c])), [[]]);
      for (const cs of combos) items.push({ name: `Run of ${len}`, points: len, cards: cs });
    }
    i = j + 1;
  }
  // flush: four in hand (not in the crib); five with the starter
  if (hand.length === 4 && hand.every((c) => c.s === hand[0].s)) {
    if (starter && starter.s === hand[0].s) items.push({ name: 'Flush', points: 5, cards: all });
    else if (!isCrib) items.push({ name: 'Flush', points: 4, cards: hand.slice() });
  }
  // his nobs
  if (starter) { const j = hand.find((c) => c.r === 11 && c.s === starter.s); if (j) items.push({ name: 'His nobs', points: 1, cards: [j, starter] }); }
  return { total: items.reduce((s, x) => s + x.points, 0), items };
}

// ---------- scoring a pegging play: points earned by the LAST card of `pile` ----------
export function scorePlay(pile) {
  const items = [];
  const count = pile.reduce((s, c) => s + pegValue(c), 0);
  if (count === 15) items.push({ name: 'Fifteen', points: 2 });
  if (count === 31) items.push({ name: 'Thirty-one', points: 2 });
  // pairs: trailing cards of the same rank
  let k = 1; while (k < pile.length && pile[pile.length - 1 - k].r === pile[pile.length - 1].r) k++;
  if (k === 2) items.push({ name: 'Pair', points: 2 });
  else if (k === 3) items.push({ name: 'Pair royal', points: 6 });
  else if (k >= 4) items.push({ name: 'Double pair royal', points: 12 });
  // runs: the longest trailing set of distinct consecutive ranks (any order)
  for (let len = Math.min(pile.length, 7); len >= 3; len--) {
    const tail = pile.slice(-len).map(runRank).sort((a, b) => a - b);
    let ok = true;
    for (let t = 1; t < tail.length; t++) if (tail[t] !== tail[t - 1] + 1) { ok = false; break; }
    if (ok) { items.push({ name: `Run of ${len}`, points: len }); break; }
  }
  return { total: items.reduce((s, x) => s + x.points, 0), items, count };
}

// ---------- the game ----------
export class Game {
  constructor({ rng, players, dealer, target = TARGET }) {
    this.rng = rng; this.players = players.slice(); this.target = target;
    this.dealer = dealer ?? players[0];
    this.scores = Object.fromEntries(players.map((p) => [p, 0]));
    this.pegHistory = Object.fromEntries(players.map((p) => [p, [0]]));  // for drawing back pegs
    this.handNo = 0;
    this.phase = 'new';
    this.events = [];
    this.result = null;
  }
  other(id) { return this.players.find((p) => p !== id); }
  get pone() { return this.other(this.dealer); }
  emit(type, data = {}) { this.events.push({ type, ...data }); }

  deal() {
    if (this.phase === 'over') throw new Error('game over');
    if (this.handNo > 0) this.dealer = this.pone;
    this.handNo++;
    const deck = shuffle(freshDeck(), this.rng);
    this.deck = deck;
    this.hands = {}; this.kept = {}; this.crib = []; this.starter = null;
    for (const p of this.players) this.hands[p] = [];
    for (let i = 0; i < 6; i++) for (const p of [this.pone, this.dealer]) this.hands[p].push(deck.pop());
    this.discarded = new Set();
    this.pile = []; this.count = 0; this.played = Object.fromEntries(this.players.map((p) => [p, []]));
    this.turn = null; this.lastPlayer = null; this.goSaid = false; this.showStep = 0; this.shows = [];
    this.phase = 'discard';
    this.emit('deal', { dealer: this.dealer, handNo: this.handNo });
    return this.phase;
  }

  discard(playerId, cards) {
    if (this.phase !== 'discard' || this.discarded.has(playerId)) return false;
    if (cards.length !== 2) throw new Error('discard exactly two');
    for (const c of cards) {
      const i = this.hands[playerId].findIndex((x) => sameCard(x, c));
      if (i < 0) throw new Error('not in hand');
      this.crib.push(this.hands[playerId].splice(i, 1)[0]);
    }
    this.discarded.add(playerId);
    this.kept[playerId] = this.hands[playerId].slice();
    this.emit('discard', { playerId });
    if (this.discarded.size === 2) this.cut();
    return true;
  }

  cut() {
    this.starter = this.deck.pop();
    this.emit('cut', { card: this.starter });
    if (this.starter.r === 11) this.award(this.dealer, 2, 'His heels');
    if (this.phase === 'over') return;
    this.phase = 'pegging';
    this.turn = this.pone;
    this.emit('turn', { playerId: this.turn });
  }

  award(playerId, points, reason, extra = {}) {
    if (points <= 0) return;
    this.scores[playerId] = Math.min(this.target, this.scores[playerId] + points);
    this.pegHistory[playerId].push(this.scores[playerId]);
    this.emit('score', { playerId, points, reason, score: this.scores[playerId], ...extra });
    if (this.scores[playerId] >= this.target) this.finish(playerId);
  }

  finish(winner) {
    const loser = this.other(winner);
    const ls = this.scores[loser];
    this.result = { winner, loser, skunk: ls < 61 ? 2 : ls < 91 ? 1 : 0, loserScore: ls };
    this.phase = 'over';
    this.emit('over', this.result);
  }

  legalPlays(playerId) {
    if (this.phase !== 'pegging') return [];
    return this.hands[playerId].filter((c) => this.count + pegValue(c) <= 31);
  }

  play(playerId, card) {
    if (this.phase !== 'pegging' || this.turn !== playerId) throw new Error('not your turn');
    const i = this.hands[playerId].findIndex((x) => sameCard(x, card));
    if (i < 0) throw new Error('not in hand');
    if (this.count + pegValue(card) > 31) throw new Error('too high');
    const c = this.hands[playerId].splice(i, 1)[0];
    this.pile.push(c); this.played[playerId].push(c);
    this.count += pegValue(c);
    this.lastPlayer = playerId;
    const sc = scorePlay(this.pile);
    this.emit('play', { playerId, card: c, count: this.count, points: sc.total, items: sc.items });
    if (sc.total) this.award(playerId, sc.total, sc.items.map((x) => x.name).join(', '), { peg: true });
    if (this.phase === 'over') return;
    if (this.count === 31) { this.resetCount(this.other(playerId)); return; }
    this.advance(playerId);
  }

  // who plays next after `playerId` just played (or said go)
  advance(playerId) {
    const opp = this.other(playerId);
    const oppCan = this.legalPlays(opp).length > 0;
    const meCan = this.legalPlays(playerId).length > 0;
    if (oppCan) { this.turn = opp; this.emit('turn', { playerId: opp }); return; }
    if (this.hands[opp].length && !this.goSaid) { this.goSaid = true; this.emit('go', { playerId: opp }); }  // opponent has cards but can't play
    if (meCan) { this.turn = playerId; this.emit('turn', { playerId }); return; }
    // nobody can play: last card / go point, then a fresh count
    const allDone = this.players.every((p) => this.hands[p].length === 0);
    this.award(this.lastPlayer, 1, allDone ? 'Last card' : 'Go');
    if (this.phase === 'over') return;
    this.resetCount(this.other(this.lastPlayer));
  }

  resetCount(nextPlayer) {
    this.pile = []; this.count = 0; this.goSaid = false;
    this.emit('reset');
    const allDone = this.players.every((p) => this.hands[p].length === 0);
    if (allDone) { this.phase = 'show'; this.prepareShow(); this.emit('showStart'); return; }
    // the next count starts with the other player if they have cards, otherwise whoever does
    const np = this.hands[nextPlayer].length ? nextPlayer : this.other(nextPlayer);
    this.turn = np; this.emit('turn', { playerId: np });
  }

  prepareShow() {
    this.shows = [
      { who: 'pone', playerId: this.pone, cards: this.kept[this.pone], ...scoreHand(this.kept[this.pone], this.starter) },
      { who: 'dealer', playerId: this.dealer, cards: this.kept[this.dealer], ...scoreHand(this.kept[this.dealer], this.starter) },
      { who: 'crib', playerId: this.dealer, cards: this.crib, ...scoreHand(this.crib, this.starter, true) },
    ];
  }

  // Score the next of: pone's hand, dealer's hand, dealer's crib. Returns the entry (already applied), or null when done.
  showNext() {
    if (this.phase !== 'show') return null;
    const s = this.shows[this.showStep++];
    if (!s) return null;
    this.emit('show', { who: s.who, playerId: s.playerId, total: s.total });
    this.award(s.playerId, s.total, s.who === 'crib' ? 'Crib' : 'Hand');
    if (this.phase !== 'over' && this.showStep >= 3) { this.phase = 'handOver'; this.emit('handOver'); }
    return s;
  }
}

// ---------- AI ----------
const ALL_RANKS_SUITS = freshDeck();

// Average show score of a 4-card keep over every possible starter.
export function expectedHandScore(keep, exclude) {
  let sum = 0, n = 0;
  for (const c of ALL_RANKS_SUITS) {
    if (exclude.some((x) => sameCard(x, c))) continue;
    sum += scoreHand(keep, c).total; n++;
  }
  return sum / n;
}

// Rough value of two cards thrown to a crib (positive = good for the crib's owner).
export function cribThrowValue(a, b) {
  let v = 0;
  const va = pegValue(a), vb = pegValue(b);
  if (a.r === b.r) v += 2;
  if (va + vb === 15) v += 2;
  if (a.r === 5) v += 1.6; if (b.r === 5) v += 1.6;
  const d = Math.abs(runRank(a) - runRank(b));
  if (d === 1) v += 0.9; else if (d === 2) v += 0.4;
  if (a.s === b.s) v += 0.25;
  if (a.r === 11 || b.r === 11) v += 0.3;
  if (va === 10 && vb === 10 && a.r !== b.r) v -= 0.4;  // two different tens is a poor throw
  return v;
}

export function rankDiscards(hand6, ownCrib) {
  const out = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const throwing = [hand6[i], hand6[j]];
    const keep = hand6.filter((_, k) => k !== i && k !== j);
    const ev = expectedHandScore(keep, hand6);
    const cv = cribThrowValue(throwing[0], throwing[1]);
    out.push({ keep, throwing, ev, cv, total: ownCrib ? ev + cv : ev - cv });
  }
  return out.sort((a, b) => b.total - a.total);
}

// A character's cribbage ability is persona.cribSkill when set, otherwise their general skill dial.
export const cribSkillOf = (persona) => persona?.cribSkill ?? persona?.skill ?? 0.5;

export function chooseDiscard(hand6, ownCrib, persona, rng) {
  const ranked = rankDiscards(hand6, ownCrib);
  const skill = cribSkillOf(persona);
  if (rng.chance(skill)) return ranked[0].throwing;
  // a weaker player still avoids the truly awful throws
  const pool = ranked.slice(0, Math.max(2, Math.round(3 + (1 - skill) * 6)));
  return rng.pick(pool).throwing;
}

export function choosePlay(game, playerId, persona, rng) {
  const legal = game.legalPlays(playerId);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];
  const skill = cribSkillOf(persona);
  const scored = legal.map((c) => {
    const pile = [...game.pile, c];
    const sc = scorePlay(pile);
    const count = sc.count;
    let v = sc.total * 2;
    if (count === 5 || count === 21) v -= 2.5;          // hands the opponent a 15 / 31 with any ten
    if (game.pile.length === 0) {                        // leading
      if (pegValue(c) <= 4) v += 0.8;                    // can't be fifteened
      if (c.r === 5) v -= 1.5;
    }
    if (count > 15 && count < 21) v += 0.3;              // awkward zone for the opponent
    if (count >= 27 && count < 31) v += 0.3;
    // leaving a pairable card or an obvious run for the opponent
    const tail = game.pile[game.pile.length - 1];
    if (tail && Math.abs(runRank(tail) - runRank(c)) === 1 && count <= 26) v -= 0.6;
    v += pegValue(c) / 25;                               // spend big cards early, keep small ones for the end
    return { c, v };
  });
  scored.sort((a, b) => b.v - a.v);
  if (rng.chance(skill)) return scored[0].c;
  // weak players don't just miss the best play, they play whatever's in their hand
  return rng.pick(scored.slice(0, skill < 0.3 ? scored.length : Math.min(scored.length, 3))).c;
}
