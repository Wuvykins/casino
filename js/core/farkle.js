// Farkle: six dice, set aside scoring dice, push your luck. First to 10,000 (everyone else gets one last turn).
//
// Scoring (a common family set):
//   single 1 = 100, single 5 = 50
//   three 1s = 1000, three of anything else = face × 100
//   four of a kind = 1000, five of a kind = 2000, six of a kind = 3000
//   1-2-3-4-5-6 straight = 1500, three pairs = 1500, two triplets = 2500
//   no scoring dice = FARKLE, the turn's points are lost
//   use all six dice = HOT DICE, roll all six again (turn points stay)
//   you need 500 in one turn to get on the board the first time
//
//   const g = new Game({ rng, players: ['you', 'mom'] });
//   g.roll();                 // -> phase 'select' (or 'farkle' -> turn passes automatically)
//   g.select([0, 3]);         // indices of dice to set aside; must all score -> phase 'decide'
//   g.roll() or g.bank();
//   events: roll{playerId,dice}, farkle, select{...}, hotDice, bank{points,score}, turn{playerId}, finalRound, over{winner}
export const TARGET = 10000;
export const ENTRY = 500;

export function counts(vals) { const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of vals) c[v]++; return c; }

// Score a set of dice values IF every die takes part in a scoring combination; otherwise null.
export function scoreSelection(vals) {
  if (!vals.length) return null;
  const c = counts(vals);
  const n = vals.length;
  if (n === 6) {
    if (c.slice(1).every((x) => x === 1)) return { points: 1500, name: 'Straight' };
    if (c.slice(1).filter((x) => x === 2).length === 3) return { points: 1500, name: 'Three pairs' };
    if (c.slice(1).filter((x) => x === 3).length === 2) return { points: 2500, name: 'Two triplets' };
    if (c.slice(1).filter((x) => x === 4).length === 1 && c.slice(1).filter((x) => x === 2).length === 1) return { points: 1500, name: 'Four and a pair' };
  }
  let points = 0; const parts = [];
  for (let f = 1; f <= 6; f++) {
    const k = c[f];
    if (k === 0) continue;
    if (k >= 3) {
      const base = k === 3 ? (f === 1 ? 1000 : f * 100) : k === 4 ? 1000 : k === 5 ? 2000 : 3000;
      points += base; parts.push(`${k === 3 ? 'Three' : k === 4 ? 'Four' : k === 5 ? 'Five' : 'Six'} ${f}s`);
    } else if (f === 1) { points += 100 * k; parts.push(k === 1 ? 'A 1' : 'Two 1s'); }
    else if (f === 5) { points += 50 * k; parts.push(k === 1 ? 'A 5' : 'Two 5s'); }
    else return null;  // a 2, 3, 4 or 6 that isn't part of a set
  }
  return { points, name: parts.join(' + ') };
}

// Does this roll contain anything at all?
export function hasScore(vals) { return bestKeep(vals).points > 0; }

// Every scoring subset of a roll (by index), with points and how many dice would be left to roll.
export function scoringOptions(vals) {
  const out = [];
  const n = vals.length;
  for (let m = 1; m < (1 << n); m++) {
    const idx = []; for (let i = 0; i < n; i++) if (m & (1 << i)) idx.push(i);
    const s = scoreSelection(idx.map((i) => vals[i]));
    if (s) out.push({ idx, points: s.points, name: s.name, left: n - idx.length });
  }
  // dedupe identical value-sets (same points, same left, same multiset) to keep it small
  const seen = new Set();
  return out.filter((o) => { const key = o.idx.map((i) => vals[i]).sort().join('') + '|' + o.points; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => b.points - a.points || b.left - a.left);
}
export function bestKeep(vals) { const o = scoringOptions(vals); return o[0] || { idx: [], points: 0, left: vals.length }; }

export class Game {
  constructor({ rng, players, target = TARGET, entry = ENTRY, first }) {
    this.rng = rng; this.players = players.slice(); this.target = target; this.entry = entry;
    this.scores = Object.fromEntries(players.map((p) => [p, 0]));
    this.onBoard = Object.fromEntries(players.map((p) => [p, false]));
    this.turnIdx = first !== undefined ? players.indexOf(first) : 0;
    this.turnTotal = 0; this.diceLeft = 6; this.dice = []; this.kept = [];  // kept: dice set aside this turn [{v, points}]
    this.phase = 'roll';      // roll -> select -> decide -> (roll | bank) ... ; 'over' at the end
    this.finalRound = false; this.closer = null;   // who triggered the final round
    this.turnsTaken = Object.fromEntries(players.map((p) => [p, 0]));
    this.events = []; this.result = null;
    this.emit('turn', { playerId: this.current });
  }
  get current() { return this.players[this.turnIdx]; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }

  roll() {
    if (this.phase !== 'roll' && this.phase !== 'decide') throw new Error('cannot roll now');
    this.dice = Array.from({ length: this.diceLeft }, () => 1 + this.rng.int(6));
    this.emit('roll', { playerId: this.current, dice: this.dice.slice(), turnTotal: this.turnTotal });
    if (!hasScore(this.dice)) {
      this.emit('farkle', { playerId: this.current, lost: this.turnTotal });
      this.turnTotal = 0;
      this.endTurn();
      return 'farkle';
    }
    this.phase = 'select';
    return 'select';
  }

  legalSelections() { return this.phase === 'select' ? scoringOptions(this.dice) : []; }

  select(indices) {
    if (this.phase !== 'select') throw new Error('nothing to select');
    const idx = [...new Set(indices)].sort((a, b) => a - b);
    const s = scoreSelection(idx.map((i) => this.dice[i]));
    if (!s) throw new Error('that selection does not score');
    const values = idx.map((i) => this.dice[i]);
    this.turnTotal += s.points;
    this.kept.push({ values, points: s.points, name: s.name });
    this.dice = this.dice.filter((_, i) => !idx.includes(i));
    this.diceLeft = this.dice.length;
    this.emit('select', { playerId: this.current, indices: idx, values, points: s.points, name: s.name, turnTotal: this.turnTotal, left: this.diceLeft });
    if (this.diceLeft === 0) { this.diceLeft = 6; this.kept = []; this.emit('hotDice', { playerId: this.current, turnTotal: this.turnTotal }); }
    this.phase = 'decide';
    return s;
  }

  get canBank() { return this.phase === 'decide' && (this.onBoard[this.current] || this.turnTotal >= this.entry); }

  bank() {
    if (!this.canBank) throw new Error('cannot bank yet');
    const p = this.current;
    this.scores[p] += this.turnTotal; this.onBoard[p] = true;
    this.emit('bank', { playerId: p, points: this.turnTotal, score: this.scores[p] });
    if (!this.finalRound && this.scores[p] >= this.target) {
      this.finalRound = true; this.closer = p; this.pending = new Set(this.players.filter((q) => q !== p));
      this.emit('finalRound', { playerId: p, score: this.scores[p] });
    }
    this.turnTotal = 0;
    this.endTurn();
  }

  endTurn() {
    const p = this.current;
    this.turnsTaken[p]++;
    this.dice = []; this.kept = []; this.diceLeft = 6;
    if (this.finalRound) {
      // everyone except the closer gets exactly one more turn
      if (p !== this.closer) this.pending.delete(p);
      if (!this.pending.size) return this.finish();
    }
    do { this.turnIdx = (this.turnIdx + 1) % this.players.length; } while (this.finalRound && !this.pending.has(this.current));
    this.phase = 'roll';
    this.emit('turn', { playerId: this.current });
  }

  finish() {
    const ranked = this.players.slice().sort((a, b) => this.scores[b] - this.scores[a]);
    this.result = { winner: ranked[0], ranked, scores: { ...this.scores } };
    this.phase = 'over';
    this.emit('over', this.result);
  }
}

// ---------- AI ----------
export const farkleSkillOf = (persona) => persona?.farkleSkill ?? persona?.cribSkill ?? persona?.skill ?? 0.5;

// Which dice to keep. Good players keep the fewest dice that score well (leaving more to roll);
// weak players grab every scoring die they see.
export function chooseKeep(game, persona, rng) {
  const opts = game.legalSelections();
  if (!opts.length) return null;
  const skill = farkleSkillOf(persona);
  const n = game.dice.length;
  const scored = opts.map((o) => {
    // value = points now + a rough expected value of what's left to roll (0 if we'd bank anyway)
    const left = o.left === 0 ? 6 : o.left;
    const ev = [0, 25, 50, 90, 140, 200, 400][left];
    const bust = [0, 0.67, 0.44, 0.28, 0.16, 0.08, 0.02][left];
    const cont = left >= 3 || (game.turnTotal + o.points < 300 && left >= 2);
    const v = o.points + (cont ? ev - bust * (game.turnTotal + o.points) * 0.5 : 0);
    return { o, v, hot: o.left === 0 };
  }).sort((a, b) => (b.hot - a.hot) || (b.v - a.v));
  if (rng.chance(skill)) return scored[0].o;
  // weak player: take everything that scores (the greedy option)
  const greedy = opts.slice().sort((a, b) => b.idx.length - a.idx.length || b.points - a.points)[0];
  return rng.chance(0.7) ? greedy : rng.pick(opts);
}

// Roll again or bank?
export function shouldBank(game, persona, rng) {
  if (!game.canBank) return false;
  const skill = farkleSkillOf(persona);
  const left = game.diceLeft, t = game.turnTotal;
  const me = game.scores[game.current];
  // final round: must beat the leader, keep rolling until you do
  if (game.finalRound) {
    const best = Math.max(...game.players.filter((p) => p !== game.current).map((p) => game.scores[p]));
    if (me + t <= best) return false;
    return true;
  }
  if (me + t >= game.target) return true;
  // sensible thresholds by dice left
  const stop = { 6: 99999, 5: 2000, 4: 1000, 3: 400, 2: 300, 1: 300 }[left];
  const sensible = t >= stop;
  if (rng.chance(skill)) return sensible;
  // weak players: either chicken out early or push way too far
  const aggro = persona?.aggro ?? 0.5;
  if (rng.chance(aggro)) return t >= stop * 2.5 + 300;   // gambler
  return t >= Math.min(stop, 350);                        // nervous
}
