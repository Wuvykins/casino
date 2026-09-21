import assert from 'node:assert/strict';
import { scoreSelection, hasScore, scoringOptions, Game, chooseKeep, shouldBank } from '../js/core/farkle.js';
import { makeRng } from '../js/core/rng.js';
let passed = 0; const test = (n, f) => { f(); passed++; console.log('  ok', n); };
const sc = (a) => scoreSelection(a)?.points ?? null;
console.log('farkle');
test('scoring table', () => {
  assert.equal(sc([1]), 100); assert.equal(sc([5]), 50); assert.equal(sc([1, 5]), 150); assert.equal(sc([1, 1]), 200);
  assert.equal(sc([2, 2, 2]), 200); assert.equal(sc([1, 1, 1]), 1000); assert.equal(sc([6, 6, 6]), 600);
  assert.equal(sc([3, 3, 3, 3]), 1000); assert.equal(sc([2, 2, 2, 2, 2]), 2000); assert.equal(sc([4, 4, 4, 4, 4, 4]), 3000);
  assert.equal(sc([1, 2, 3, 4, 5, 6]), 1500); assert.equal(sc([2, 2, 4, 4, 6, 6]), 1500); assert.equal(sc([2, 2, 2, 5, 5, 5]), 2500);
  assert.equal(sc([3, 3, 3, 1, 5]), 450); assert.equal(sc([2]), null); assert.equal(sc([1, 2]), null); assert.equal(sc([2, 2]), null);
  assert.equal(hasScore([2, 3, 4, 6, 6, 2]), false); assert.equal(hasScore([2, 3, 4, 6, 6, 5]), true);
});
test('scoring options are sorted best first and include the partial keeps', () => {
  const o = scoringOptions([1, 5, 2, 3, 4, 6]);
  assert.equal(o[0].points, 1500);
  assert.ok(o.some((x) => x.points === 100 && x.left === 5), 'can keep just the 1');
  assert.ok(o.some((x) => x.points === 50 && x.left === 5), 'can keep just the 5');
});
function rigged(seq) { let i = 0; return { int: () => { const v = seq[i++ % seq.length]; return v - 1; }, chance: () => true, pick: (a) => a[0], next: () => 0 }; }
test('a turn: select, hot dice, bank, entry threshold', () => {
  const g = new Game({ rng: rigged([1, 1, 1, 2, 3, 4, 5, 5, 5, 6, 6, 6]), players: ['a', 'b'] });
  assert.equal(g.roll(), 'select');           // 1 1 1 2 3 4
  g.select([0, 1, 2]);                        // 1000, three left
  assert.equal(g.turnTotal, 1000); assert.equal(g.diceLeft, 3); assert.equal(g.canBank, true);
  g.roll();                                   // 5 5 5
  g.select([0, 1, 2]);                        // 500 -> hot dice, six back
  assert.equal(g.turnTotal, 1500); assert.equal(g.diceLeft, 6);
  assert.ok(g.events.some((e) => e.type === 'hotDice'));
  g.bank();
  assert.equal(g.scores.a, 1500); assert.equal(g.current, 'b');
  // b needs 500 to get on the board
  g.roll();                                   // 6 6 6 1 1 1 -> two triplets
  g.select([3]);                              // just one 1 = 100: cannot bank yet
  assert.equal(g.canBank, false);
  assert.throws(() => g.bank());
});
test('farkle loses the turn points and passes the turn', () => {
  const g = new Game({ rng: rigged([1, 2, 3, 4, 6, 6, 2, 3, 4, 6, 6, 2]), players: ['a', 'b'] });
  g.roll(); g.select([0]);                    // keep the 1 (100), five left
  assert.equal(g.roll(), 'farkle');           // 2 3 4 6 6 -> nothing
  assert.equal(g.turnTotal, 0); assert.equal(g.scores.a, 0); assert.equal(g.current, 'b'); assert.equal(g.phase, 'roll');
});
test('final round: everyone else gets exactly one more turn, highest score wins', () => {
  const g = new Game({ rng: makeRng(1), players: ['a', 'b', 'c'] });
  g.scores.a = 9900; g.onBoard = { a: true, b: true, c: true }; g.turnIdx = 1;  // b to play
  const play = () => { g.roll(); if (g.phase === 'select') { const o = g.legalSelections()[0]; g.select(o.idx); if (g.canBank) g.bank(); else while (g.phase === 'decide') { g.roll(); if (g.phase === 'select') { const q = g.legalSelections()[0]; g.select(q.idx); if (g.canBank) g.bank(); } } } };
  // force a to close on its turn
  while (g.current !== 'a') play();
  g.scores.a = 9950; g.turnTotal = 0; g.phase = 'roll';
  g.dice = [1, 2, 3, 4, 6, 6]; g.phase = 'select'; g.select([0]); g.bank();   // a: 10050 -> final round
  assert.equal(g.finalRound, true); assert.equal(g.closer, 'a');
  const order = [];
  while (g.phase !== 'over') { order.push(g.current); play(); }
  assert.deepEqual(order, ['b', 'c']);
  assert.equal(g.result.ranked[0], Object.entries(g.scores).sort((x, y) => y[1] - x[1])[0][0]);
});
test('AI vs AI: 300 games finish, better player wins more', () => {
  const rng = makeRng(5); let w = 0; const N = 300;
  for (let i = 0; i < N; i++) {
    const g = new Game({ rng, players: ['a', 'b'], first: i % 2 ? 'a' : 'b' });
    const P = { a: { farkleSkill: 0.9, aggro: 0.5 }, b: { farkleSkill: 0.15, aggro: 0.9 } };
    let guard = 0;
    while (g.phase !== 'over' && guard++ < 5000) {
      if (g.phase === 'roll') g.roll();
      else if (g.phase === 'select') g.select(chooseKeep(g, P[g.current], rng).idx);
      else if (g.phase === 'decide') { if (shouldBank(g, P[g.current], rng)) g.bank(); else g.roll(); }
    }
    assert.ok(guard < 5000, 'game terminates');
    if (g.result.winner === 'a') w++;
  }
  console.log(`     skilled player won ${(w / N * 100).toFixed(0)}%`);
  assert.ok(w / N > 0.55);
});
console.log(`\n${passed} tests passed`);
