// Cribbage win rates: a simulated human (skill dial) vs each opponent, at a given nudge (hands in 100 that go your way).
// node tests/crib.sim.mjs [games=2000] [humanSkill=0.4] [nudge=0 | table id]
import { Game, chooseDiscard, choosePlay } from '../js/core/cribbage.js';
import { cribNudge, luckyCribDeck, luckyStarter } from '../js/core/luck.js';
import { makeRng } from '../js/core/rng.js';
import { CHARACTERS } from '../js/content/characters.js';
import { CRIBBAGE_TABLES as TABLES } from '../js/content/tables.js';
const N = +(process.argv[2] || 2000), HS = +(process.argv[3] || 0.4);
const arg = process.argv[4] || '0';
const nudge = isNaN(+arg) ? TABLES.find((t) => t.id === arg).nudge : +arg;
const human = { cribSkill: HS };
function playGame(rng, opp, persona, dealer) {
  const g = new Game({ rng, players: ['you', opp], dealer });
  while (g.phase !== 'over') {
    const kind = cribNudge(rng, nudge);
    g.deal(kind === 'hand' ? (d, p) => luckyCribDeck(p === 'you', rng) : null);
    g.beforeCut = kind === 'cut' ? (game) => luckyStarter(game, 'you', rng) : null;
    g.discard('you', chooseDiscard(g.hands.you, g.dealer === 'you', human, rng));
    if (g.phase === 'over') break;
    g.discard(opp, chooseDiscard(g.hands[opp], g.dealer === opp, persona, rng));
    while (g.phase === 'pegging') g.play(g.turn, choosePlay(g, g.turn, g.turn === 'you' ? human : persona, rng));
    while (g.phase === 'show') g.showNext();
  }
  return g.result;
}
const rows = [];
const rng = makeRng(12345);
for (const c of CHARACTERS) {
  let wins = 0, loser = null;
  for (let i = 0; i < N; i++) { const r = playGame(rng, c.id, c.persona, loser || (rng.chance(0.5) ? 'you' : c.id)); if (r.winner === 'you') wins++; loser = r.loser; }
  rows.push(`${c.name.padEnd(10)} crib skill ${String(c.persona.cribSkill ?? c.persona.skill).padEnd(5)} you win ${(100 * wins / N).toFixed(0)}%`);
}
console.log(`human skill ${HS}, nudge ${nudge} in 100, ${N} games each\n` + rows.join('\n'));
