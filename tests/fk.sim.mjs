// Farkle win rates: a simulated human (skill dial) against 1 or 3 of the cast, at a given save rate
// (your farkles in 100 that get saved). node tests/fk.sim.mjs [games=2000] [humanSkill=0.4] [save=0 | table id] [opponents=1]
import { Game, chooseKeep, shouldBank } from '../js/core/farkle.js';
import { farkleSave } from '../js/core/luck.js';
import { makeRng } from '../js/core/rng.js';
import { CHARACTERS } from '../js/content/characters.js';
import { FARKLE_TABLES } from '../js/content/tables.js';
const N = +(process.argv[2] || 2000), HS = +(process.argv[3] || 0.4), arg = process.argv[4] || '0', K = +(process.argv[5] || 1);
const save = isNaN(+arg) ? FARKLE_TABLES.find((t) => t.id === arg).save : +arg;
const human = { farkleSkill: HS, aggro: 0.5 };
const rng = makeRng(4242);
function play(opps) {
  const personas = { you: human, ...Object.fromEntries(opps.map((c) => [c.id, c.persona])) };
  const g = new Game({ rng, players: ['you', ...opps.map((c) => c.id)], first: rng.pick(['you', ...opps.map((c) => c.id)]) });
  g.luckyRoll = (game) => farkleSave(game, 'you', save, rng);
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 20000) {
    if (g.roll() === 'farkle') continue;
    const p = personas[g.current];
    g.select(chooseKeep(g, p, rng).idx);
    if (shouldBank(g, p, rng)) g.bank();
  }
  return g.result.winner === 'you';
}
const out = [];
if (K === 1) for (const c of CHARACTERS) { let w = 0; for (let i = 0; i < N; i++) w += play([c]); out.push(`${c.name.padEnd(10)} farkle skill ${String(c.persona.farkleSkill ?? c.persona.cribSkill ?? c.persona.skill).padEnd(5)} you win ${(100 * w / N).toFixed(0)}%`); }
else { let w = 0; for (let i = 0; i < N; i++) { const pool = CHARACTERS.slice(); const opps = []; for (let k = 0; k < K; k++) opps.push(pool.splice(rng.int(pool.length), 1)[0]); w += play(opps); } out.push(`vs ${K} random opponents: you win ${(100 * w / N).toFixed(0)}% (fair share ${(100 / (K + 1)).toFixed(0)}%)`); }
console.log(`human skill ${HS}, save ${save} in 100, ${N} games\n` + out.join('\n'));
