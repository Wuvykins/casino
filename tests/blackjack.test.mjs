import assert from 'node:assert/strict';
import { parseCards } from '../js/core/cards.js';
import { Shoe, Round, handValue, basicStrategy, aiDecide, isBlackjack } from '../js/core/blackjack.js';
import { makeRng } from '../js/core/rng.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok', name); };
const hv = (s) => handValue(parseCards(s));

console.log('blackjack');
test('hand values', () => {
  assert.deepEqual(hv('As Kd'), { total: 21, soft: true });
  assert.deepEqual(hv('As 5d'), { total: 16, soft: true });
  assert.deepEqual(hv('As 5d Td'), { total: 16, soft: false });
  assert.deepEqual(hv('As Ad'), { total: 12, soft: true });
  assert.deepEqual(hv('As Ad 9c'), { total: 21, soft: true });
  assert.deepEqual(hv('Ts 9d 5c'), { total: 24, soft: false });
  assert.equal(isBlackjack(parseCards('Ah Qs')), true);
  assert.equal(isBlackjack(parseCards('7h 7s 7d')), false);
});

// a shoe with a scripted order (drawn from the end)
function rigged(cardsInDealOrder) {
  const shoe = new Shoe(1, makeRng(1));
  shoe.cards = parseCards(cardsInDealOrder).reverse();
  shoe.dealt = 0; shoe.needsShuffle = false;
  return shoe;
}

test('player blackjack pays 3:2; dealer 20 loses to it', () => {
  // deal order: p1, dealer up, p2, dealer hole
  const r = new Round({ shoe: rigged('As Kd Qh Tc'), players: [{ id: 'you', bet: 20 }] });
  r.deal();
  assert.equal(r.phase, 'dealer');
  r.playDealer();
  assert.equal(r.results.players[0].net, 30);
  assert.equal(r.results.players[0].hands[0].result, 'blackjack');
});

test('dealer blackjack with ace up: insurance pays 2:1, hand pushes on a natural, loses otherwise', () => {
  const r = new Round({ shoe: rigged('9s Ad 9h Kc'), players: [{ id: 'you', bet: 20 }] });
  assert.equal(r.deal(), 'insurance');
  r.insurance('you', true);
  assert.equal(r.phase, 'settled');
  assert.equal(r.results.players[0].net, -20 + 20); // lose 20, insurance 10 pays 20
  const r2 = new Round({ shoe: rigged('9s Ad 9h Kc'), players: [{ id: 'you', bet: 20 }] });
  r2.deal(); r2.insurance('you', false);
  assert.equal(r2.results.players[0].net, -20);
});

test('hit, bust, dealer does not need to play', () => {
  const r = new Round({ shoe: rigged('Ts 6d 6h 9c 9d'), players: [{ id: 'you', bet: 10 }] });
  r.deal();
  assert.equal(r.phase, 'play');
  r.act('hit'); // 10+6+9 = 25
  assert.equal(r.phase, 'dealer');
  r.playDealer();
  assert.equal(r.dealer.cards.length, 2, 'dealer does not draw when everyone busted');
  assert.equal(r.results.players[0].net, -10);
});

test('double down draws exactly one card and doubles the bet', () => {
  const r = new Round({ shoe: rigged('5s 6d 6h 9c Td 2c 5d'), players: [{ id: 'you', bet: 10 }] });
  r.deal();                // you 5,6 = 11 vs dealer 6 (hole 9)
  assert.equal(r.legal().double, true);
  r.act('double');         // draws Td -> 21
  assert.equal(r.phase, 'dealer');
  r.playDealer();          // dealer 6+9 = 15, draws 2 -> 17, stands
  assert.equal(r.results.players[0].hands[0].bet, 20);
  assert.equal(r.results.players[0].net, 20);
});

test('split eights, both hands play, DAS allowed', () => {
  // deal: you 8, dealer 6, you 8, dealer hole T ; then split: hand1 gets 3, (double) gets T ; hand2 gets 2, hit 9 ; dealer draws 5 -> 21? (6+10+5=21)
  const r = new Round({ shoe: rigged('8s 6d 8h Tc 3d Td 2c 9s 5h'), players: [{ id: 'you', bet: 10 }] });
  r.deal();
  assert.equal(r.legal().split, true);
  r.act('split');
  assert.equal(r.player('you').hands.length, 2);
  assert.equal(r.actor.handIndex, 0);
  assert.equal(handValue(r.player('you').hands[0].cards).total, 11);
  assert.equal(r.legal().double, true, 'double after split');
  r.act('double');          // 8+3+T = 21
  assert.equal(r.actor.handIndex, 1);
  assert.equal(handValue(r.player('you').hands[1].cards).total, 10); // 8+2
  r.act('hit');             // +9 = 19
  r.act('stand');
  assert.equal(r.phase, 'dealer');
  r.playDealer();           // 6+T=16, draws 5 -> 21
  const res = r.results.players[0];
  assert.deepEqual(res.hands.map((h) => h.result), ['push', 'lose']);
  assert.equal(res.net, -10);
});

test('split aces get one card each and a 21 is not a blackjack', () => {
  const r = new Round({ shoe: rigged('As 9d Ah 7c Kd Qs 3c'), players: [{ id: 'you', bet: 10 }] });
  r.deal(); r.act('split');
  assert.equal(r.phase, 'dealer', 'no further action on split aces');
  r.playDealer();           // dealer 9+7 = 16, draws 3 -> 19
  const res = r.results.players[0];
  assert.deepEqual(res.hands.map((h) => h.result), ['win', 'win']);
  assert.equal(res.net, 20, 'paid 1:1, not 3:2');
});

test('dealer stands on soft 17', () => {
  const r = new Round({ shoe: rigged('Ts 6d 8h Ac'), players: [{ id: 'you', bet: 10 }] });
  r.deal(); r.act('stand');  // you 18 vs dealer 6 + A (soft 17)
  r.playDealer();
  assert.equal(r.dealer.cards.length, 2);
  assert.equal(r.results.players[0].net, 10);
});

test('basic strategy spot checks', () => {
  const L = { hit: true, stand: true, double: true, split: true };
  const bs = (h, up) => basicStrategy(parseCards(h), parseCards(up)[0], L);
  assert.equal(bs('As Ad', '9s'), 'P');
  assert.equal(bs('8s 8d', 'Ts'), 'P');
  assert.equal(bs('Ts Td', '6s'), 'S');
  assert.equal(bs('5s 6d', '9s'), 'D');
  assert.equal(bs('9s 7d', 'Ts'), 'H');
  assert.equal(bs('Ts 2d', '4s'), 'S');
  assert.equal(bs('Ts 2d', '2s'), 'H');
  assert.equal(bs('As 7d', '9s'), 'H');
  assert.equal(bs('As 7d', '3s'), 'Ds');
  assert.equal(bs('As 8d', '6s'), 'Ds');
});

test('house edge over 1M hands of basic strategy is small and positive', () => {
  const rng = makeRng(7);
  const shoe = new Shoe(6, rng);
  const persona = { skill: 1, aggro: 0.5 };
  let net = 0, wagered = 0;
  for (let i = 0; i < 1000000; i++) {
    const r = new Round({ shoe, players: [{ id: 'p', bet: 10 }] });
    r.deal();
    if (r.phase === 'insurance') r.insurance('p', false);
    while (r.phase === 'play') r.act(aiDecide(r.currentHand().h.cards, r.dealerUp, r.legal(), persona, rng));
    if (r.phase === 'dealer') r.playDealer();
    const p = r.results.players[0];
    net += p.net; wagered += p.hands.reduce((s, h) => s + h.bet, 0);
  }
  const edge = -net / wagered * 100;
  console.log(`     house edge ${edge.toFixed(2)}% (expect roughly 0.4–0.7%)`);
  assert.ok(edge > 0.15 && edge < 0.9, 'edge out of range: ' + edge);
});

console.log(`\n${passed} tests passed`);
