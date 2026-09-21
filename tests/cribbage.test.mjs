import assert from 'node:assert/strict';
import { parseCards, parseCard } from '../js/core/cards.js';
import { scoreHand, scorePlay, Game, chooseDiscard, choosePlay, rankDiscards } from '../js/core/cribbage.js';
import { makeRng } from '../js/core/rng.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok', name); };
const sh = (hand, starter, crib = false) => scoreHand(parseCards(hand), starter ? parseCard(starter) : null, crib).total;

console.log('cribbage');
test('show scoring: classic hands', () => {
  assert.equal(sh('5h 5d 5c Js', '5s'), 29);            // the perfect hand
  assert.equal(sh('4s 4d 5c 6h', '6s'), 24);            // double-double run + fifteens
  assert.equal(sh('7s 8d 9c Th', 'Js'), 7);             // run of 5 + 7+8 = 15
  assert.equal(sh('6s 7d 8c 8h', '9s'), 16);            // double run of 4 (8) + 6+9, 7+8, 7+8 (6) + pair (2)
  assert.equal(sh('Ks Qd Jc 2h', '3s'), 9);             // run J-Q-K + three fifteens (face+2+3)
  assert.equal(sh('2s 4d 6c 8h', 'Ts'), 0);             // nineteen
  assert.equal(sh('As 2s 3s 4s', '5d'), 4 + 5 + 2);     // flush 4 + run 5 + fifteen (1+2+3+4+5)
  assert.equal(sh('As 2s 3s 4s', '5s'), 5 + 5 + 2);     // five-card flush
  assert.equal(sh('As 2s 3s 4s', '5d', true), 5 + 2);   // crib: no four-flush
  assert.equal(sh('Js 9d 2c 4h', '3s'), 1 + 3 + 4);     // his nobs + run 2-3-4 + fifteens J+2+3, 9+2+4
  assert.equal(sh('Jh 9d 2c 4h', '3s'), 3 + 4);         // wrong-suit jack: no nobs
});
test('fifteens with both fives and three tens', () => { assert.equal(sh('5s 5d Tc Kh', 'Qs'), 2 + 12); });
test('pegging scoring', () => {
  const sp = (s) => scorePlay(parseCards(s));
  assert.equal(sp('7s 8d').total, 2);          // fifteen
  assert.equal(sp('4s 4d 4c').total, 6);       // pair royal
  assert.equal(sp('7s 9d 8c').total, 3);       // run out of order
  assert.equal(sp('Ts Ad 4c 3h 2s').total, 4); // 4-3-2 ... wait: A 4 3 2 = run of 4
  assert.equal(sp('As Td 6c 7h 8s').total, 3);   // only the trailing 6-7-8 counts
});
test('pegging run needs count <= 31 (run of 5 example)', () => {
  const r = scorePlay(parseCards('2s 3d 4c 5h 6s')); assert.equal(r.total, 5); assert.equal(r.count, 20);
  const t = scorePlay(parseCards('Ts Jd 4c 7h')); assert.equal(t.total, 2); // 10+10+4+7 = 31
});

function newGame(seed = 1) { return new Game({ rng: makeRng(seed), players: ['a', 'b'], dealer: 'a' }); }

test('deal, discard, cut, pegging to the show', () => {
  const g = newGame(3);
  g.deal();
  assert.equal(g.phase, 'discard');
  assert.equal(g.hands.a.length, 6); assert.equal(g.hands.b.length, 6);
  g.discard('a', g.hands.a.slice(0, 2));
  assert.equal(g.phase, 'discard');
  g.discard('b', g.hands.b.slice(0, 2));
  assert.equal(g.crib.length, 4);
  assert.ok(g.starter);
  assert.equal(g.phase, 'pegging');
  assert.equal(g.turn, 'b', 'pone leads');
  let guard = 0;
  while (g.phase === 'pegging' && guard++ < 50) {
    const legal = g.legalPlays(g.turn);
    assert.ok(legal.length, 'engine only gives the turn to someone who can play');
    g.play(g.turn, legal[0]);
  }
  assert.equal(g.phase, 'show');
  assert.equal(g.played.a.length + g.played.b.length, 8);
  const order = [];
  let s; while ((s = g.showNext())) order.push(s.who);
  assert.deepEqual(order, ['pone', 'dealer', 'crib']);
  assert.equal(g.phase, 'handOver');
  g.deal();
  assert.equal(g.dealer, 'b', 'deal alternates');
});

test('go and last card points, 31 resets the count', () => {
  const g = newGame(1);
  g.deal();
  // rig: a keeps K K K K, b keeps 5 A A A ... build hands directly
  g.hands.a = parseCards('Ks Kd Kc Kh'); g.hands.b = parseCards('9s 9d 9c 9h');
  g.kept = { a: g.hands.a.slice(), b: g.hands.b.slice() }; g.crib = parseCards('2s 3d 4c 6h');
  g.discarded = new Set(['a', 'b']); g.deck = parseCards('7s'); g.cut();
  assert.equal(g.turn, 'b');
  g.play('b', g.hands.b[0]);   // 9
  g.play('a', g.hands.a[0]);   // 19
  g.play('b', g.hands.b[0]);   // 28 -> a cannot play (K=10), b cannot (9) -> b gets 1 for go, reset
  assert.equal(g.scores.b, 1);
  assert.equal(g.count, 0);
  assert.equal(g.turn, 'a', 'new count starts with the player who did not play last');
  g.play('a', g.hands.a[0]);   // 10
  g.play('b', g.hands.b[0]);   // 19
  g.play('a', g.hands.a[0]);   // 29 -> nobody can play -> a +1, reset; b has 1 card, a has 1
  assert.equal(g.scores.a, 1);
  assert.equal(g.turn, 'b');
  g.play('b', g.hands.b[0]);   // 9
  g.play('a', g.hands.a[0]);   // 19, last card -> a +1
  assert.equal(g.scores.a, 2);
  assert.equal(g.phase, 'show');
});

test('game ends the moment someone reaches 121; skunk levels', () => {
  const g = newGame(2);
  g.scores.a = 120; g.scores.b = 50;
  g.deal(); g.hands.a = parseCards('5s 5d Tc Kh'); g.hands.b = parseCards('2s 3d 4c 6h');
  g.kept = { a: g.hands.a.slice(), b: g.hands.b.slice() }; g.crib = parseCards('7s 8d 9c Th');
  g.discarded = new Set(['a', 'b']); g.deck = parseCards('Js'); g.cut();  // his heels: dealer a +2 -> 121
  assert.equal(g.phase, 'over');
  assert.equal(g.result.winner, 'a'); assert.equal(g.result.skunk, 2);
  assert.throws(() => g.deal());
});

test('discard AI keeps the good stuff', () => {
  const rng = makeRng(5);
  const hand = parseCards('5s 5d Tc Kh 2c 7d');
  const t = chooseDiscard(hand, true, { skill: 1 }, rng);
  assert.ok(!t.some((c) => c.r === 5), 'never throws the fives from this hand');
  const ranked = rankDiscards(parseCards('As 2s 3s 4s 9d Kh'), false);
  assert.deepEqual(ranked[0].keep.map((c) => c.r).sort((a, b) => a - b), [2, 3, 4, 14], 'keeps the run/flush A-2-3-4');
});

test('AI vs AI: 300 full games complete, better player wins more', () => {
  const rng = makeRng(9);
  let winsA = 0, totalHands = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const g = new Game({ rng, players: ['a', 'b'], dealer: i % 2 ? 'a' : 'b' });
    const persona = { a: { skill: 0.95 }, b: { skill: 0.15 } };
    while (g.phase !== 'over') {
      g.deal(); totalHands++;
      for (const p of ['a', 'b']) g.discard(p, chooseDiscard(g.hands[p], g.dealer === p, persona[p], rng));
      let guard = 0;
      while (g.phase === 'pegging' && guard++ < 100) g.play(g.turn, choosePlay(g, g.turn, persona[g.turn], rng));
      assert.ok(guard < 100, 'pegging terminates');
      while (g.phase === 'show') g.showNext();
      assert.ok(['handOver', 'over'].includes(g.phase), 'phase after show: ' + g.phase);
    }
    assert.equal(Math.max(g.scores.a, g.scores.b), 121);
    if (g.result.winner === 'a') winsA++;
  }
  console.log(`     skilled player won ${(winsA / N * 100).toFixed(0)}%, ${(totalHands / N).toFixed(1)} hands per game`);
  assert.ok(winsA / N > 0.55, 'skill should matter');
  assert.ok(totalHands / N > 7 && totalHands / N < 12, 'games should take roughly 8-11 hands');
});

console.log(`\n${passed} tests passed`);
