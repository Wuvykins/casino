import assert from 'node:assert/strict';
import { parseCards, freshDeck, shuffle } from '../js/core/cards.js';
import { evaluate, describe, category, bestFive } from '../js/core/evaluator.js';
import { Hand } from '../js/core/poker.js';
import { makeRng } from '../js/core/rng.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok', name); }

console.log('evaluator');
const ev = (s) => evaluate(parseCards(s));
test('categories', () => {
  assert.equal(describe(ev('As Ks Qs Js Ts 2d 3c')), 'Royal Flush');
  assert.equal(describe(ev('9s 8s 7s 6s 5s Ad Ac')), 'Straight Flush, 9 high');
  assert.equal(describe(ev('Ah 2h 3h 4h 5h Kd Kc')), 'Straight Flush, 5 high');
  assert.equal(describe(ev('7s 7h 7d 7c As Kd 2c')), 'Four 7s');
  assert.equal(describe(ev('7s 7h 7d Ac Ad Kd 2c')), 'Full House, 7s full of As');
  assert.equal(describe(ev('7s 7h 7d Ac Ad Ah 2c')), 'Full House, As full of 7s');
  assert.equal(describe(ev('2s 5s 9s Js Ks Ad 3c')), 'Flush, K high');
  assert.equal(describe(ev('As 2d 3h 4c 5s Kd Qc')), 'Straight, 5 high');
  assert.equal(describe(ev('Ts Jd Qh Kc As 2d 2c')), 'Straight, A high');
  assert.equal(describe(ev('9s 9d 9h Kc As 2d 3c')), 'Three 9s');
  assert.equal(describe(ev('9s 9d Kh Kc As 2d 3c')), 'Two Pair, Ks and 9s');
  assert.equal(describe(ev('9s 9d Kh Kc 2s 2d 3c')), 'Two Pair, Ks and 9s');
  assert.equal(describe(ev('9s 9d Kh Qc As 2d 3c')), 'Pair of 9s');
  assert.equal(describe(ev('9s 8d Kh Qc As 2d 3c')), 'A high');
});
test('ordering and kickers', () => {
  assert.ok(ev('As Ad Kh Kd 2c 3c 4c') > ev('As Ad Qh Qd 2c 3c 4c'));
  assert.ok(ev('As Ad Kh 9d 2c 3c 4c') > ev('As Ad Qh 9d 2c 3c 4c'));           // kicker
  assert.ok(ev('2s 2d 2h 2c 3s 4d 5c') > ev('As Ad Ah Kd Kc 4d 5c'));           // quads > boat
});
test('flush beats straight', () => {
  assert.ok(ev('6s 7s 8s 9s 2s 3d 4c') > ev('Ad 2d 3h 4c 5s 6h 7d'));
});
test('two pair kicker comes from third pair when higher', () => {
  const a = ev('Ks Kd 9h 9c 5s 5d 2c'); // K K 9 9 + 5 kicker
  const b = ev('Ks Kd 9h 9c 4s 3d 2c'); // K K 9 9 + 4 kicker
  assert.ok(a > b);
});
test('three-pair board: uses correct two pair', () => {
  assert.equal(describe(ev('As Ad Kh Kc Qs Qd 2c')), 'Two Pair, As and Ks');
});
test('bestFive picks the hand', () => {
  const five = bestFive(parseCards('As Ks Qs Js Ts 2d 3c'));
  assert.equal(five.filter((c) => c.s === 0).length, 5);
});
test('exhaustive category frequencies (10k random 7-card hands are sane)', () => {
  const rng = makeRng(7);
  const counts = new Array(9).fill(0);
  for (let i = 0; i < 20000; i++) {
    const d = shuffle(freshDeck(), rng);
    counts[category(evaluate(d.slice(0, 7)))]++;
  }
  // known 7-card odds: pair ~43.8%, two pair ~23.5%, high card ~17.4%, trips ~4.8%, straight ~4.6%, flush ~3.0%, boat ~2.6%
  const pct = counts.map((c) => c / 200);
  assert.ok(pct[1] > 40 && pct[1] < 48, 'pair ' + pct[1]);
  assert.ok(pct[2] > 20 && pct[2] < 27, 'two pair ' + pct[2]);
  assert.ok(pct[0] > 14 && pct[0] < 21, 'high card ' + pct[0]);
  assert.ok(pct[5] > 2 && pct[5] < 4.2, 'flush ' + pct[5]);
});

console.log('engine');
const table = (mode = 'nolimit') => ({ mode, sb: 1, bb: 2 });
const mk = (stacks) => stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, stack: s, seat: i }));
const totalChips = (h) => h.players.reduce((s, p) => s + p.stack, 0) + (h.finished ? 0 : h.pot);

test('everyone folds to the big blind', () => {
  const h = new Hand({ table: table(), players: mk([100, 100, 100]), button: 0, rng: makeRng(1) });
  h.start();
  assert.equal(h.actor.id, 'p0'); // UTG (button in 3-handed is UTG)
  h.act('p0', { type: 'fold' });
  h.act('p1', { type: 'fold' });
  assert.ok(h.finished);
  assert.equal(h.result.stacks.p2, 101);
  assert.equal(h.result.stacks.p1, 99);
});

test('heads-up: button is SB and acts first preflop, last postflop', () => {
  const h = new Hand({ table: table(), players: mk([100, 100]), button: 0, rng: makeRng(2) });
  h.start();
  assert.equal(h.actor.id, 'p0');
  h.act('p0', { type: 'call' });
  assert.equal(h.actor.id, 'p1');
  h.act('p1', { type: 'check' });
  assert.equal(h.street, 'flop');
  assert.equal(h.actor.id, 'p1');
});

test('big blind gets the option after limps', () => {
  const h = new Hand({ table: table(), players: mk([100, 100, 100]), button: 0, rng: makeRng(3) });
  h.start();
  h.act('p0', { type: 'call' });
  h.act('p1', { type: 'call' });
  assert.equal(h.actor.id, 'p2');
  const legal = h.legalActions();
  assert.ok(legal.canCheck && legal.canRaise);
  assert.equal(legal.minRaiseTo, 4);
  h.act('p2', { type: 'raise', amount: 6 });
  assert.equal(h.actor.id, 'p0');
  assert.equal(h.legalActions().minRaiseTo, 10); // 6 + raise size 4
});

test('limit: fixed sizes and cap', () => {
  const h = new Hand({ table: table('limit'), players: mk([500, 500, 500]), button: 0, rng: makeRng(4) });
  h.start();
  let l = h.legalActions();
  assert.equal(l.minRaiseTo, 4);
  h.act('p0', { type: 'raise' });
  h.act('p1', { type: 'raise' });
  assert.equal(h.currentBet, 6);
  h.act('p2', { type: 'raise' });
  assert.equal(h.currentBet, 8);
  l = h.legalActions();
  assert.equal(l.canRaise, false, 'capped');
  h.act('p0', { type: 'call' }); h.act('p1', { type: 'call' });
  assert.equal(h.street, 'flop');
  h.act('p1', { type: 'raise' }); // bet 2 on flop (small bet)
  assert.equal(h.currentBet, 2);
  h.act('p2', { type: 'call' }); h.act('p0', { type: 'call' });
  assert.equal(h.street, 'turn');
  h.act('p1', { type: 'raise' }); // bet 4 on turn (big bet)
  assert.equal(h.currentBet, 4);
});

test('side pots: three-way all-in with different stacks', () => {
  // Rig the deck: p0 (short) gets aces, p1 (mid) gets kings, p2 (big) gets 7-2. Board blank.
  const deck = parseCards('2c 3d 4h 8s 9d Jc 5s 5h 6d 7c 2s Kd Ac 7d Kh Ad'); // popped from the end
  // deal order (button=0): p1, p2, p0, p1, p2, p0  => pops: Ad->p1? careful: pop() takes last element first.
  // pops in order: Ad, Kh, 7d, Ac, Kd, 2s -> p1=Ad,Ac  p2=Kh,Kd  p0=7d,2s. Adjust expectations accordingly.
  const h = new Hand({ table: table(), players: mk([30, 60, 100]), button: 0, rng: makeRng(5), deck });
  h.start();
  h.act('p0', { type: 'allin' });                   // p0 (button) shoves 30
  h.act('p1', { type: 'allin' });                   // p1 (sb) shoves 60
  h.act('p2', { type: 'call' });                    // p2 (bb) calls 60
  assert.ok(h.finished);
  assert.ok(h.result.showdown);
  const pots = h.result.pots;
  assert.equal(pots[0].amount, 90); assert.deepEqual(pots[0].eligible, ['p0', 'p1', 'p2']);
  assert.equal(pots[1].amount, 60); assert.deepEqual(pots[1].eligible, ['p1', 'p2']);
  assert.equal(pots.length, 2);
  // p1 has aces: wins main + side; p2's extra 40 returned.
  assert.equal(h.result.stacks.p1, 150);
  assert.equal(h.result.stacks.p0, 0);
  assert.equal(h.result.stacks.p2, 40);
  assert.equal(totalChips(h), 190);
});

test('short all-in raise does not reopen action for the original bettor', () => {
  const h = new Hand({ table: table(), players: mk([100, 100, 5]), button: 0, rng: makeRng(6) });
  h.start();                                          // p0 UTG, p1 sb, p2 bb (posts 2, has 3 left)
  h.act('p0', { type: 'raise', amount: 6 });          // raise to 6
  h.act('p1', { type: 'call' });
  h.act('p2', { type: 'allin' });                     // all-in to 5 total... which is below 6 => it's a call
  assert.ok(h.street === 'flop' || h.finished);
  const h2 = new Hand({ table: table(), players: mk([100, 100, 9]), button: 0, rng: makeRng(6) });
  h2.start();
  h2.act('p0', { type: 'raise', amount: 6 });
  h2.act('p1', { type: 'call' });
  h2.act('p2', { type: 'allin' });                    // to 9: a raise of 3 (< min raise 4) => short
  assert.equal(h2.actor.id, 'p0');
  assert.equal(h2.legalActions().canRaise, false, 'p0 already acted at 6 — may only call');
  h2.act('p0', { type: 'call' });
  assert.equal(h2.legalActions().canRaise, false);
  h2.act('p1', { type: 'call' });
  assert.equal(h2.street, 'flop');
});

test('fuzz: random legal play conserves chips (NL + limit, 2–9 players)', () => {
  const rng = makeRng(42);
  let hands = 0, showdowns = 0, sidePotHands = 0;
  for (let iter = 0; iter < 3000; iter++) {
    const n = 2 + rng.int(8);
    const stacks = Array.from({ length: n }, () => 5 + rng.int(300));
    const mode = rng.chance(0.5) ? 'nolimit' : 'limit';
    const h = new Hand({ table: { mode, sb: 1, bb: 2 }, players: mk(stacks), button: rng.int(n), rng });
    const before = stacks.reduce((a, b) => a + b, 0);
    h.start();
    let guard = 0;
    while (!h.finished) {
      if (++guard > 500) throw new Error('hand did not terminate');
      const p = h.actor; const l = h.legalActions();
      const opts = [];
      if (l.canCheck) opts.push({ type: 'check' }, { type: 'check' });
      if (l.canCall) opts.push({ type: 'call' }, { type: 'call' });
      if (l.canFold && !l.canCheck) opts.push({ type: 'fold' });
      if (l.canRaise) {
        const to = l.fixed ? l.minRaiseTo : l.minRaiseTo + rng.int(l.maxRaiseTo - l.minRaiseTo + 1);
        opts.push({ type: 'raise', amount: to });
        opts.push({ type: 'allin' });
      }
      h.act(p.id, rng.pick(opts));
      assert.equal(totalChips(h), before, 'chips conserved mid-hand');
      for (const q of h.players) assert.ok(q.stack >= 0, 'no negative stacks');
    }
    assert.equal(totalChips(h), before, 'chips conserved at end');
    assert.equal(h.pot, Object.values(h.result.awards).reduce((s, a) => s + a.amount, 0), 'pot fully awarded');
    if (h.result.showdown) showdowns++;
    if (h.result.pots.length > 1) sidePotHands++;
    hands++;
  }
  console.log(`     ${hands} hands, ${showdowns} showdowns, ${sidePotHands} with side pots`);
  assert.ok(showdowns > 500 && sidePotHands > 200);
});

console.log(`\n${passed} tests passed`);
