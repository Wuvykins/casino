import assert from 'node:assert/strict';
import { rtp, evaluateStops, Machine, STRIPS, STOPS } from '../js/core/slots.js';
import { makeRng } from '../js/core/rng.js';
let passed = 0; const test = (n, f) => { f(); passed++; console.log('  ok', n); };
console.log('slots');
test('return to player sits between 90% and 95%, and most spins pay something', () => {
  const r = rtp(); console.log(`     RTP ${(r.rtp * 100).toFixed(1)}%, hit rate ${(r.hitRate * 100).toFixed(1)}%`);
  assert.ok(r.rtp > 0.9 && r.rtp < 0.95); assert.ok(r.hitRate > 0.5);
});
test('three VH logos is the jackpot at 200x and every strip has 24 stops', () => {
  STRIPS.forEach((s) => assert.equal(s.length, STOPS));
  const stops = STRIPS.map((s) => s.indexOf(0));
  const r = evaluateStops(stops, 5); assert.equal(r.kind, 'jackpot'); assert.equal(r.payout, 1000);
});
test('spinSmallWin never hands out the jackpot', () => {
  const m = new Machine({ rng: makeRng(4) });
  for (let i = 0; i < 300; i++) { const r = m.spinSmallWin(5); assert.notEqual(r.kind, 'jackpot'); }
});
console.log(`\n${passed} tests passed`);
