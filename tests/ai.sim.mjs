// Simulate the whole cast against each other and report who wins. Sanity check that the
// personalities produce different play and that no one crashes the engine.
import { Hand } from '../js/core/poker.js';
import { decide, updateMood, readsFromPersonas } from '../js/core/ai.js';
import { CHARACTERS } from '../js/content/characters.js';
import { makeRng } from '../js/core/rng.js';

const mode = process.argv[2] || 'nolimit';
const HANDS = +process.argv[3] || 2000;
const rng = makeRng(2024);
const table = { mode, sb: 1, bb: 2 };
const BUYIN = 200;

const EXCLUDE = (process.argv[4] || '').split(',');
const seats = CHARACTERS.filter((c) => !EXCLUDE.includes(c.id)).slice(0, 6).map((c, i) => ({ id: c.id, name: c.name, seat: i, stack: BUYIN, char: c, mood: { tilt: 0 }, rebuys: 0, net: 0, hands: 0, vpip: 0, pfr: 0, wtsd: 0, won: 0 }));
let button = 0;
const reads = readsFromPersonas(Object.fromEntries(seats.map((s) => [s.id, s.char.persona])));
const t0 = Date.now();
let totalActions = 0;
for (let h = 0; h < HANDS; h++) {
  for (const s of seats) if (s.stack <= 0) { s.stack = BUYIN; s.rebuys++; }
  const hand = new Hand({ table, players: seats, button, rng });
  hand.start();
  const voluntarily = new Set(), raisedPre = new Set();
  while (!hand.finished) {
    const p = hand.actor;
    const seat = seats.find((s) => s.id === p.id);
    const action = decide(hand, p, seat.char.persona, seat.mood, rng, reads);
    if (hand.street === 'preflop' && (action.type === 'call' || action.type === 'raise' || action.type === 'allin')) voluntarily.add(p.id);
    if (hand.street === 'preflop' && (action.type === 'raise' || action.type === 'allin')) raisedPre.add(p.id);
    hand.act(p.id, action);
    totalActions++;
  }
  for (const s of seats) {
    const net = hand.result.net[s.id];
    s.stack = hand.result.stacks[s.id];
    s.net += net; s.hands++;
    if (voluntarily.has(s.id)) s.vpip++;
    if (raisedPre.has(s.id)) s.pfr++;
    if (hand.result.showdown && hand.result.revealed.some((r) => r.playerId === s.id)) s.wtsd++;
    if (hand.result.awards.some((a) => a.playerId === s.id)) s.won++;
    updateMood(s.char.persona, s.mood, net, table.bb);
  }
  button = (button + 1) % seats.length;
}
const ms = Date.now() - t0;
console.log(`${mode}: ${HANDS} hands, ${totalActions} decisions in ${ms}ms (${(ms / HANDS).toFixed(1)} ms/hand)\n`);
console.log('name'.padEnd(12), 'net'.padStart(8), 'bb/100'.padStart(8), 'VPIP'.padStart(6), 'PFR'.padStart(6), 'WTSD'.padStart(6), 'won%'.padStart(6), 'rebuys'.padStart(7), ' persona');
for (const s of [...seats].sort((a, b) => b.net - a.net)) {
  const P = s.char.persona;
  console.log(
    s.name.padEnd(12),
    String(s.net).padStart(8),
    (s.net / table.bb / s.hands * 100).toFixed(1).padStart(8),
    (s.vpip / s.hands * 100).toFixed(0).padStart(5) + '%',
    (s.pfr / s.hands * 100).toFixed(0).padStart(5) + '%',
    (s.wtsd / s.hands * 100).toFixed(0).padStart(5) + '%',
    (s.won / s.hands * 100).toFixed(0).padStart(5) + '%',
    String(s.rebuys).padStart(7),
    ` skill ${P.skill} tight ${P.tight} aggro ${P.aggro} bluff ${P.bluff}`,
  );
}
const sum = seats.reduce((a, s) => a + s.net, 0);
if (sum !== 0) { console.error('CHIPS NOT CONSERVED', sum); process.exit(1); }
