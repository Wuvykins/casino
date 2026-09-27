// "Hurry up": while a table is waiting on the player and nothing happens, the opponents take turns telling them to
// get on with it — the first after FIRST ms, then one every EVERY ms, going round the table in a shuffled order
// (nobody twice until everyone has had a go). It stops the moment the player acts or the table closes.
//
// Each table wires it once in its constructor:  wireHurry(this, ['awaitHuman', ...], speakers, say)
//   speakers() -> the opponents who can talk right now;  say(s) -> make that one say their 'hurry' line.
export const HURRY_FIRST = 20000;
export const HURRY_EVERY = 30000;

export function wireHurry(table, methods, speakers, say) {
  for (const m of methods) {
    const orig = table[m].bind(table);
    table[m] = (...args) => {
      table._hurryStop?.();   // one nag per table: a wait started inside another (a Back that re-asks) takes over
      const p = orig(...args);
      const stop = nag(table, speakers, say);
      table._hurryStop = stop;
      Promise.resolve(p).finally(() => { stop(); if (table._hurryStop === stop) table._hurryStop = null; });
      return p;
    };
  }
}

function nag(table, speakers, say) {
  let order = [], t = null, done = false;
  const gone = () => done || table.stopped || (table.el && !table.el.isConnected);
  const tick = () => {
    if (gone()) return;
    const list = speakers();
    if (list.length && !document.hidden) {
      if (!order.length || !order.some((s) => list.includes(s))) order = shuffled(list, table.rng);
      let s = null;
      while (order.length && !s) { const c = order.shift(); if (list.includes(c)) s = c; }
      if (s) say(s);
    }
    t = setTimeout(tick, globalThis.__hurryMs?.[1] ?? HURRY_EVERY);
  };
  t = setTimeout(tick, globalThis.__hurryMs?.[0] ?? HURRY_FIRST);   // tests shorten these with window.__hurryMs = [first, every]
  return () => { done = true; clearTimeout(t); };
}

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rng ? rng.int(i + 1) : Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
