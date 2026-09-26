// Hold'em hand rankings: the "?" at the table. Best hand at the top, each with an example and one plain line.
// If you're in a hand with a flop out, your current hand is highlighted so you can see where it sits.
import { h, modal } from './dom.js';
import { cardEl } from './components.js';
import { parseCards } from '../core/cards.js';

// category numbers match core/evaluator.js (8 = straight flush … 0 = high card); royal flush is the top straight flush
export const HAND_RANKS = [
  { cat: 9, name: 'Royal Flush', cards: 'As Ks Qs Js Ts', note: 'A-K-Q-J-10, all one suit' },
  { cat: 8, name: 'Straight Flush', cards: '9h 8h 7h 6h 5h', note: 'Five in a row, all one suit' },
  { cat: 7, name: 'Four of a Kind', cards: 'Qs Qh Qd Qc 7s', note: 'Four cards of the same rank' },
  { cat: 6, name: 'Full House', cards: 'Kh Kd Ks 4c 4h', note: 'Three of one rank and a pair' },
  { cat: 5, name: 'Flush', cards: 'Ad Jd 8d 5d 2d', note: 'Any five of the same suit' },
  { cat: 4, name: 'Straight', cards: 'Tc 9d 8s 7h 6c', note: 'Five in a row, mixed suits' },
  { cat: 3, name: 'Three of a Kind', cards: '8s 8h 8d Kc 3s', note: 'Three cards of the same rank' },
  { cat: 2, name: 'Two Pair', cards: 'Jh Jc 5s 5d Ah', note: 'Two different pairs' },
  { cat: 1, name: 'Pair', cards: 'As Ad 9c 6h 3s', note: 'Two cards of the same rank' },
  { cat: 0, name: 'High Card', cards: 'Ks Jd 8c 6h 2s', note: 'No match — highest card plays' },
];

// current: { cat, text } for the player's hand right now (royal flush arrives as cat 8 with text 'Royal Flush'), or null
export function showHandRankings(current = null) {
  const curCat = current ? (current.cat === 8 && /Royal/.test(current.text) ? 9 : current.cat) : null;
  return modal({
    title: 'Hand rankings', className: 'hand-ranks', dismissable: true,
    buttons: [{ label: 'Got it', kind: 'primary' }],
    body: (el) => {
      el.append(h('p', { class: 'hr-lede' }, 'Best at the top. Your best five cards count, using your two and the five on the table.'));
      const list = h('ol', { class: 'hr-list' });
      HAND_RANKS.forEach((r, i) => {
        const mine = curCat === r.cat;
        list.append(h('li', { class: 'hr-row' + (mine ? ' mine' : '') },
          h('span', { class: 'hr-n' }, String(i + 1)),
          h('div', { class: 'hr-text' }, h('b', {}, r.name, mine ? h('span', { class: 'hr-you' }, 'You have this') : null), h('span', {}, r.note)),
          h('div', { class: 'hr-cards' }, parseCards(r.cards).map((c) => cardEl(c))),
        ));
      });
      el.append(list, h('p', { class: 'hr-foot' }, 'Same hand as someone else? The higher cards win. If those match too, the next-highest card (the kicker) decides. Exactly the same five cards splits the pot.'));
    },
  });
}
