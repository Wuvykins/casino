// How often does the person win a tournament? Plays thousands of tournaments with the real engine, AI and blind
// schedule (incl. the knockout bump) and the luck system, with the human played by a stand-in persona.
//   node tests/sng.sim.mjs [tournaments=2000] [opponents=5] [humanSkill=average|weak|good|shark]
import { Hand } from '../js/core/poker.js';
import { decide, updateMood, readsFromPersonas } from '../js/core/ai.js';
import { CHARACTERS } from '../js/content/characters.js';
import { makeRng } from '../js/core/rng.js';
import { LUCK, luckyHoldemDeck, betterHoleCards } from '../js/core/luck.js';
import { TOURNEY_BLINDS, TOURNEY_LEVEL_HANDS, HOLDEM_TABLES } from '../js/content/tables.js';

const N = +process.argv[2] || 2000, OPP = +process.argv[3] || 5, LEVEL = process.argv[4] || 'average';
// 5th arg: a luck scale (0 = honest, 1 = cash-game luck) or a tournament id (sng-200 …) to use that table's own scale
const arg5 = process.argv[5];
const TABLE = arg5 && isNaN(+arg5) ? HOLDEM_TABLES.find((t) => t.id === arg5) : null;
const LUCKSCALE = TABLE ? (TABLE.luck ?? 1) : arg5 === undefined ? 1 : +arg5;
const HUMAN = 'you', CHIPS = 1500;
const HUMANS = {
  weak:    { skill: 0.25, tight: 0.3, aggro: 0.3, bluff: 0.1, tilt: 0.3 },      // a casual player who calls too much
  average: { skill: 0.5,  tight: 0.5, aggro: 0.5, bluff: 0.2, tilt: 0.2 },      // knows the game
  good:    { skill: 0.75, tight: 0.65, aggro: 0.6, bluff: 0.25, tilt: 0.1 },
  shark:   { skill: 0.95, tight: 0.7, aggro: 0.75, bluff: 0.35, tilt: 0.05 },
};
const rng = makeRng(7);
const real = CHARACTERS.filter((c) => c.real);
const places = {}; let handsTotal = 0, luckyHands = 0;
for (let t = 0; t < N; t++) {
  const cast = [...real].sort(() => rng.next() - 0.5).slice(0, OPP);
  const seats = [{ id: HUMAN, name: 'You', seat: 0, stack: CHIPS, persona: HUMANS[LEVEL], mood: { tilt: 0 }, out: false },
    ...cast.map((c, i) => ({ id: c.id, name: c.name, seat: i + 1, stack: CHIPS, persona: c.persona, mood: { tilt: 0 }, out: false }))];
  const reads = readsFromPersonas(Object.fromEntries(seats.map((s) => [s.id, s.persona])));
  const game = { mode: 'nolimit', sb: 10, bb: 20 };
  let button = 0, handNo = 0, boost = 0, level = 0, humanPlace = 0;
  while (true) {
    const alive = seats.filter((s) => s.stack > 0);
    for (const s of seats) if (s.stack <= 0 && !s.out) { s.out = true; if (s.id !== HUMAN) boost++; }
    const human = seats[0];
    if (human.stack <= 0) { humanPlace = alive.length + 1; break; }
    if (alive.length === 1) { humanPlace = 1; break; }
    const lvl = Math.min(TOURNEY_BLINDS.length - 1, Math.floor(handNo / TOURNEY_LEVEL_HANDS) + boost);
    if (lvl !== level) { level = lvl; [game.sb, game.bb] = TOURNEY_BLINDS[lvl]; }
    const players = alive.map((s) => ({ id: s.id, name: s.name, stack: s.stack, seat: s.seat }));
    button = (button + 1) % players.length; handNo++;
    // the luck system, exactly as the table applies it
    const n = players.length, order = players.map((_, k) => players[(button + 1 + k) % n].id);
    const r = rng.next() / (LUCKSCALE || 1e-9); let deck = null;
    if (LUCKSCALE > 0 && r < LUCK.holdemFamily) deck = luckyHoldemDeck(order, HUMAN, 'family', rng);
    else if (LUCKSCALE > 0 && r < LUCK.holdemFamily + LUCK.holdemValue) deck = luckyHoldemDeck(order, HUMAN, 'value', rng);
    else if (LUCKSCALE > 0 && r < LUCK.holdemFamily + LUCK.holdemValue + LUCK.goodHoleCards) deck = betterHoleCards(order, HUMAN, rng);
    if (deck) luckyHands++;
    const hand = new Hand({ table: game, players, button, rng, deck });
    hand.start();
    while (!hand.finished) { const p = hand.actor; const seat = seats.find((s) => s.id === p.id); hand.act(p.id, decide(hand, p, seat.persona, seat.mood, rng, reads)); }
    for (const s of alive) { s.stack = hand.result.stacks[s.id]; updateMood(s.persona, s.mood, hand.result.net[s.id] || 0, game.bb); }
    handsTotal++;
    if (handNo > 400) { humanPlace = alive.length; break; }   // safety
  }
  places[humanPlace] = (places[humanPlace] || 0) + 1;
}
const pct = (k) => ((places[k] || 0) / N * 100).toFixed(1) + '%';
console.log(`${N} tournaments, you (${LEVEL}) vs ${OPP} of the family, luck ×${LUCKSCALE}; ${(handsTotal / N).toFixed(0)} hands per tournament; luck touched ${(luckyHands / handsTotal * 100).toFixed(0)}% of hands`);
console.log(`1st ${pct(1)}   2nd ${pct(2)}   paid (1st or 2nd) ${(((places[1] || 0) + (places[2] || 0)) / N * 100).toFixed(1)}%   fair share of 1st would be ${(100 / (OPP + 1)).toFixed(1)}%`);
const T = TABLE || HOLDEM_TABLES.find((t) => t.id === 'sng-200');
const ev = ((places[1] || 0) * T.prizes[0] + (places[2] || 0) * T.prizes[1]) / N - T.buyIn;
console.log(`${T.name}: average result ${ev >= 0 ? '+' : ''}$${ev.toLocaleString('en-US', { maximumFractionDigits: 0 })} per tournament`);
