import assert from 'node:assert/strict';
import { Hand } from '../js/core/poker.js';
import { evaluate, category } from '../js/core/evaluator.js';
import { decide, readsFromPersonas } from '../js/core/ai.js';
import { Shoe, Round, handValue } from '../js/core/blackjack.js';
import { luckyHoldemDeck, betterHoleCards, bjLuckyDeal, bjLuckyHit, bjDealerBusts, LUCK } from '../js/core/luck.js';
import { preflopStrength } from '../js/core/ai.js';
import { makeRng } from '../js/core/rng.js';
import { CHARACTERS } from '../js/content/characters.js';
let passed = 0; const test = (n, f) => { f(); passed++; console.log('  ok', n); };
console.log('luck');
const table = { mode: 'nolimit', sb: 1, bb: 2 };

test('lucky hold\'em deck: dealt through the engine, the human has the best hand at the river and someone has a real hand', () => {
  const rng = makeRng(11);
  let found = 0, checked = 0;
  for (let t = 0; t < 60; t++) {
    const players = ['you', 'a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id, stack: 200, seat: i }));
    const button = t % 5;
    const order = players.map((_, k) => players[(button + 1 + k) % 5].id);
    const deck = luckyHoldemDeck(order, 'you', t % 3 ? 'value' : 'family', rng);
    if (!deck) continue;
    found++;
    const hand = new Hand({ table, players, button, rng, deck });
    hand.start();
    while (!hand.finished) hand.act(hand.actor.id, hand.legalActions().canCheck ? { type: 'check' } : { type: 'call' });
    const rev = hand.result.revealed;
    const me = rev.find((r) => r.playerId === 'you');
    assert.ok(rev.every((r) => r.playerId === 'you' || r.score < me.score), 'human wins outright');
    assert.ok(category(me.score) >= 2);
    assert.ok(rev.some((r) => r.playerId !== 'you' && category(r.score) >= 1), 'an opponent has something');
    checked++;
  }
  console.log(`     scenario found ${found}/60 times`);
  assert.ok(found >= 50 && checked === found);
});

test('better hole cards: only the human\'s two cards change, and they are playable', () => {
  const rng = makeRng(3);
  const order = ['a', 'you', 'b', 'c'];
  let ok = 0;
  for (let t = 0; t < 40; t++) {
    const deck = betterHoleCards(order, 'you', rng);
    if (!deck) continue;
    const players = order.map((id, i) => ({ id, name: id, stack: 200, seat: i }));
    const hand = new Hand({ table, players, button: 3, rng, deck }); // button 3 -> order[0] dealt first
    hand.start();
    const me = hand.players.find((p) => p.id === 'you');
    assert.ok(preflopStrength(me.cards) >= 0.45);
    assert.equal(new Set(deck.map((c) => c.r * 4 + c.s)).size, 52, 'still a full deck');
    ok++;
  }
  assert.ok(ok >= 35);
});

test('blackjack: lucky deal gives the human 20 or 21 through Round.deal', () => {
  const rng = makeRng(5); let hits = 0;
  for (let t = 0; t < 40; t++) {
    const shoe = new Shoe(6, rng);
    const players = [{ id: 'k', bet: 10 }, { id: 'you', bet: 10 }, { id: 'm', bet: 10 }];
    if (!bjLuckyDeal(shoe, players.length, 1, rng)) continue;
    const r = new Round({ shoe, players }); r.deal();
    const tot = handValue(r.player('you').hands[0].cards).total;
    assert.ok(tot === 20 || tot === 21, 'got ' + tot);
    hits++;
  }
  assert.ok(hits >= 35);
});

test('blackjack: lucky hit lands 17-21; dealer bust rig busts the dealer', () => {
  const rng = makeRng(8); let hitOk = 0, bustOk = 0;
  for (let t = 0; t < 60; t++) {
    const shoe = new Shoe(6, rng);
    const cards = [{ r: 10, s: 0 }, { r: 4, s: 1 }]; // 14
    if (bjLuckyHit(shoe, cards, rng)) { const v = handValue([...cards, shoe.draw()]).total; assert.ok(v >= 17 && v <= 21); hitOk++; }
    const shoe2 = new Shoe(6, rng);
    const dealer = [{ r: 10, s: 0 }, { r: 6, s: 1 }];
    if (bjDealerBusts(shoe2, dealer, false, rng)) {
      const hand = dealer.slice(); while (handValue(hand).total < 17) hand.push(shoe2.draw());
      assert.ok(handValue(hand).total > 21, 'dealer should bust'); bustOk++;
    }
  }
  console.log(`     hit rig worked ${hitOk}/60, dealer bust rig ${bustOk}/60`);
  assert.ok(hitOk >= 40 && bustOk >= 25);
});

// How much does it help? A Nathaniel-like stand-in for Dad plays 3000 hands with and without luck.
test('calibration: luck helps a middling stand-in, and touches roughly a fifth of hands', () => {
  const run = (lucky) => {
    const rng = makeRng(77);
    const cast = CHARACTERS.filter((c) => ['nic', 'freddy', 'kurtis', 'mom', 'courtney'].includes(c.id));
    const seats = [{ id: 'you', name: 'Dad', seat: 0, stack: 200, persona: { skill: 0.4, tight: 0.55, aggro: 0.35, bluff: 0.05, tilt: 0.2 }, mood: { tilt: 0 }, net: 0 },
      ...cast.map((c, i) => ({ id: c.id, name: c.name, seat: i + 1, stack: 200, persona: c.persona, mood: { tilt: 0 }, net: 0 }))];
    const reads = readsFromPersonas(Object.fromEntries(seats.map((s) => [s.id, s.persona])));
    let button = 0, luckyHands = 0;
    for (let h = 0; h < 3000; h++) {
      for (const s of seats) if (s.stack <= 0) s.stack = 200;
      const n = seats.length;
      let deck = null;
      if (lucky) {
        const order = seats.map((_, k) => seats[(button + 1 + k) % n].id);
        const r = rng.next();
        if (r < LUCK.holdemFamily) deck = luckyHoldemDeck(order, 'you', 'family', rng);
        else if (r < LUCK.holdemFamily + LUCK.holdemValue) deck = luckyHoldemDeck(order, 'you', 'value', rng);
        else if (r < LUCK.holdemFamily + LUCK.holdemValue + LUCK.goodHoleCards) deck = betterHoleCards(order, 'you', rng);
        if (deck) luckyHands++;
      }
      const hand = new Hand({ table, players: seats, button, rng, deck });
      hand.start();
      while (!hand.finished) { const p = hand.actor; const s = seats.find((x) => x.id === p.id); hand.act(p.id, decide(hand, p, s.persona, s.mood, rng, reads)); }
      for (const s of seats) { s.net += hand.result.net[s.id]; s.stack = hand.result.stacks[s.id]; }
      button = (button + 1) % n;
    }
    return { dad: seats[0].net / 2 / 30, luckyHands };
  };
  const a = run(false), b = run(true);
  console.log(`     Dad without luck: ${a.dad.toFixed(1)} bb/100; with luck: ${b.dad.toFixed(1)} bb/100 (${b.luckyHands} of 3000 hands touched)`);
  assert.ok(b.dad > a.dad, 'luck should help');
  assert.ok(b.luckyHands > 400 && b.luckyHands < 900, 'touched ' + b.luckyHands);
});
console.log(`\n${passed} tests passed`);
