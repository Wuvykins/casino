// Visual building blocks: playing cards, chips, portraits, credit cards. Each uses your art when present.
import { h, modal } from './dom.js';
import { assets } from '../core/assets.js';
import { cardKey, RANK_LABEL, SUIT_GLYPH, isRed } from '../core/cards.js';
import { fmt$ } from '../core/bank.js';
import { TIERS } from '../content/tiers.js';

export const CHIP_DENOMS = [5000, 1000, 500, 100, 25, 5, 1];
export const CHIP_COLORS = { 1: '#e8e8e8', 5: '#d8323c', 25: '#2e9e4f', 100: '#222', 500: '#7b3fbf', 1000: '#e0b93a', 5000: '#d9781e' };

let backKey = 'deck.back';
// Pick which back the deck uses this session (random among the backs that exist).
export function chooseDeckBack(rng) {
  const options = ['deck.back', 'deck.back2'].filter((k) => assets.has(k));
  backKey = options.length ? options[Math.floor((rng ? rng.next() : Math.random()) * options.length)] : 'deck.back';
  return backKey;
}

export function cardEl(card, { faceDown = false, small = false } = {}) {
  const el = h('div', { class: 'pcard' + (small ? ' small' : '') + (faceDown ? ' down' : '') });
  if (faceDown) {
    if (!assets.bg(el, backKey)) el.classList.add('placeholder-back');
    return el;
  }
  const key = 'deck.' + cardKey(card);
  if (assets.bg(el, key)) return el;
  el.classList.add(isRed(card) ? 'red' : 'black');
  el.append(
    h('div', { class: 'corner tl' }, h('span', { class: 'rank' }, RANK_LABEL[card.r]), h('span', { class: 'suit' }, SUIT_GLYPH[card.s])),
    h('div', { class: 'pip' }, SUIT_GLYPH[card.s]),
    h('div', { class: 'corner br' }, h('span', { class: 'rank' }, RANK_LABEL[card.r]), h('span', { class: 'suit' }, SUIT_GLYPH[card.s])),
  );
  return el;
}

export function chipBreakdown(amount, maxChips = 12) {
  const out = [];
  let rem = Math.round(amount);
  for (const d of CHIP_DENOMS) {
    while (rem >= d && out.length < maxChips) { out.push(d); rem -= d; }
  }
  return out;
}

// A stack (or several stacks) of chips representing an amount, with the amount labelled.
export function chipStackEl(amount, { label = true, maxChips = 12, compact = false } = {}) {
  const wrap = h('div', { class: 'chipstack' + (compact ? ' compact' : '') });
  const chips = chipBreakdown(amount, maxChips);
  const columns = new Map();
  for (const d of chips) { if (!columns.has(d)) columns.set(d, []); columns.get(d).push(d); }
  const cols = h('div', { class: 'chipcols' });
  for (const [d, list] of columns) {
    const col = h('div', { class: 'chipcol' });
    list.forEach((den, i) => {
      const c = h('div', { class: 'chip', style: { '--i': i } });
      if (!assets.bg(c, 'chip.' + den)) { c.classList.add('placeholder'); c.style.setProperty('--chip', CHIP_COLORS[den]); c.textContent = den >= 1000 ? den / 1000 + 'k' : den; }
      col.append(c);
    });
    cols.append(col);
  }
  wrap.append(cols);
  if (label) wrap.append(h('div', { class: 'chipamount' }, fmt$(amount)));
  return wrap;
}

export function portraitEl(character, { size = 'md', mood = null } = {}) {
  const el = h('div', { class: `portrait ${size}` });
  const key = mood && assets.has(`portrait.${character.id}.${mood}`) ? `portrait.${character.id}.${mood}` : `portrait.${character.id}`;
  if (assets.bg(el, key)) el.classList.add('cutout');   // your art: a character standing at the rail, no circle
  else {
    el.classList.add('placeholder');
    el.style.setProperty('--tint', character.color || '#666');
    el.append(h('span', { class: 'initials' }, character.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()));
  }
  return el;
}

export function playerAvatarEl(name) {
  const el = h('div', { class: 'portrait md placeholder you' });
  el.style.setProperty('--tint', '#2b6cb0');
  el.append(h('span', { class: 'initials' }, (name || 'You').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()));
  return el;
}

export function creditCardEl(tier, playerName, { size = 'md' } = {}) {
  const el = h('div', { class: `ccard tier-${tier.id} ${size}` });
  if (assets.bg(el, `card.tier${tier.id}`)) {
    // your card art has the name row blank; the cardholder's name is printed on top
    el.append(h('div', { class: 'cc-holder' }, (playerName || 'Player One').toUpperCase()));
    return el;
  }
  el.style.setProperty('--c1', tier.colors[0]);
  el.style.setProperty('--c2', tier.colors[1]);
  el.style.setProperty('--ct', tier.text);
  el.append(
    h('div', { class: 'cc-bank' }, 'CASINO BANK'),
    h('div', { class: 'cc-chip' }),
    h('div', { class: 'cc-number' }, '•••• •••• •••• ' + String(1000 + tier.id * 1111).slice(0, 4)),
    h('div', { class: 'cc-row' }, h('span', { class: 'cc-name' }, (playerName || 'MEMBER').toUpperCase()), h('span', { class: 'cc-tier' }, tier.name.toUpperCase())),
  );
  return el;
}

export function tierBadge(tier) { return h('span', { class: `tierbadge tier-${tier.id}` }, tier.name); }
export { TIERS };


// "Leave table" while something is in progress: stay, finish first, or walk out now (with whatever that costs).
// Resolves 'stay' | 'after' | 'now'.
export function askLeave({ title = 'Leave the table?', text, afterLabel = 'After this hand', nowLabel = 'Leave now', nowNote = '' }) {
  return modal({
    title, dismissable: true,
    body: (el) => el.append(h('p', {}, text), nowNote ? h('p', { class: 'muted small' }, nowNote) : null),
    buttons: [
      { label: 'Stay', kind: 'ghost', value: 'stay' },
      { label: afterLabel, kind: 'ghost', value: 'after' },
      { label: nowLabel, kind: 'danger', value: 'now' },
    ],
  }).then((v) => v || 'stay');
}

// Result banner (Nic's blackjack-results.js, built in DOM). type: 'win' | 'lose' | 'bust' | 'push'.
// Rises in over .38 s, holds, and fades out over the last .35 s (2.2 s total by default). Wins get a warm halo, a gleam that sweeps across
// and a few gold sparks; a bust shakes on entry; losses and pushes stay quiet. Resolves when it has gone.
export function resultBanner(container, { type = 'win', amount = 0, title, caption, sub, hold = 2200 } = {}) {
  const win = type === 'win', push = type === 'push', bust = type === 'bust';
  const money = (win ? '+' : push ? '' : '\u2212') + fmt$(Math.abs(amount));
  const el = h('div', { class: 'rb ' + type },
    h('div', { class: 'rb-cap' }, caption ?? (win ? '\u2660   HAND WON   \u2660' : push ? 'HAND TIED' : bust ? 'OVER 21' : 'HAND COMPLETE')),
    h('div', { class: 'rb-title' }, title ?? (win ? 'You win' : push ? 'Push' : bust ? 'Bust' : 'Dealer wins')),
    h('div', { class: 'rb-amt' }, sub ?? (push ? 'Bet returned' : money)),
  );
  if (win) {
    el.append(h('i', { class: 'rb-gleam' }));
    for (let i = 0; i < 14; i++) el.append(h('i', { class: 'rb-spark', style: { '--a': (i * 2.399).toFixed(3) + 'rad', '--r': (110 + (i % 4) * 15) + 'px', '--c': i % 2 ? '#f7d77e' : '#fff0c5' } }));
  }
  container.append(el);
  return new Promise((resolve) => {
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => el.classList.add('out'), hold - 350);
    setTimeout(() => { el.remove(); resolve(); }, hold);
  });
}
