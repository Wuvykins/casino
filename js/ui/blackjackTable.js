// The blackjack table: dealer up top, you in the middle seat, up to two of the family beside you.
import { h, clear, sleep, modal, toast } from './dom.js';
import { cardEl, chipStackEl, portraitEl, creditCardEl, chooseDeckBack, CHIP_DENOMS, askLeave, resultBanner } from './components.js';
import { Shoe, Round, handValue, isBlackjack, aiDecide, cardValue } from '../core/blackjack.js';
import { makeRng } from '../core/rng.js';
import { LUCK, bjLuckyDeal, bjLuckyHit, bjDealerBusts } from '../core/luck.js';
import { bank, fmt$ } from '../core/bank.js';
import { assets } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { characterById } from '../content/characters.js';
import { pickLine } from '../content/lines.js';
import { showSettings } from './lobby.js';

const HUMAN = 'you';
// Hand-total badge (Nic's hit-total design): a dark plate with a gold rim. When the number changes the old one
// slides up and fades while the new one rises in (220 ms), and the rim glows for 0.7 s. 21 turns bright gold with
// a "21" caption; a bust turns red, shakes, and says "BUST". Empty text hides the badge.
function setTotalBadge(el, text, { bust = false, win = false } = {}) {
  if (!el) return;
  if (!el.firstChild) el.append(h('span', { class: 'tb-old' }), h('span', { class: 'tb-num' }), h('span', { class: 'tb-cap' }));
  const num = el.querySelector('.tb-num'), old = el.querySelector('.tb-old'), cap = el.querySelector('.tb-cap');
  const prev = num.textContent;
  if (!text) { el.classList.remove('show', 'bust', 'win', 'change'); num.textContent = ''; old.textContent = ''; cap.textContent = ''; return; }
  el.classList.add('show');
  el.classList.toggle('bust', bust); el.classList.toggle('win', win && !bust);
  cap.textContent = bust ? 'BUST' : win ? '21' : '';
  if (text === prev) return;
  num.textContent = text;
  if (prev) {
    old.textContent = prev;
    el.classList.remove('change'); void el.offsetWidth; el.classList.add('change');
    setTimeout(() => { if (old.textContent === prev) old.textContent = ''; }, 260);
  }
}

// seat spots as % of the felt: [left companion, you, right companion]
const SPOTS = [{ x: 16, y: 50 }, { x: 50, y: 57 }, { x: 84, y: 50 }];
// Nic's painted table (assets/img/table/felt-blackjack.jpg, the whole screen): the three betting circles,
// and where the portraits stand
const SPOTS_ART = [{ x: 24.4, y: 53.6 }, { x: 50, y: 63 }, { x: 76.1, y: 54.3 }];
const PORTRAIT_X_ART = [11, 89];

export class BlackjackTable {
  constructor(root, table, buyIn, companionIds, { onLeave }) {
    this.root = root; this.table = table; this.onLeave = onLeave;
    this.rng = makeRng();
    chooseDeckBack(this.rng);
    this.shoe = new Shoe(6, this.rng);
    this.stopped = false; this.leaving = false;
    this.lastBet = table.minBet;
    // seat order: left companion, you, right companion
    const ids = companionIds.slice(0, 2);
    this.seats = [];
    if (ids[0]) this.seats.push(this.mkSeat(ids[0], 0));
    this.seats.push({ spot: 1, id: HUMAN, name: bank.state.playerName || 'You', isHuman: true, stack: buyIn, char: null, bet: 0 });
    if (ids[1]) this.seats.push(this.mkSeat(ids[1], 2));
    bank.buyIn(buyIn, table.id);
    bank.setAtTable({ tableId: table.id, stack: buyIn, opponents: ids });
    this.build();
  }
  mkSeat(id, spot) { const c = characterById(id); return { spot, id, name: c.name, isHuman: false, stack: this.table.maxBuy, char: c, bet: 0 }; }
  get human() { return this.seats.find((s) => s.isHuman); }
  get speed() { return bank.state.settings.aiSpeed || 1; }
  wait(ms) { return sleep(ms / this.speed); }
  seatById(id) { return this.seats.find((s) => s.id === id); }

  // ---------- DOM ----------
  build() {
    clear(this.root);
    this.el = h('div', { class: 'table-screen bj' });
    this.topbar = h('div', { class: 'topbar table-top' },
      h('button', { class: 'btn ghost small leave-btn', onClick: () => this.requestLeave() }, '‹ Leave table'),
      h('div', { class: 'tt-title' }, this.table.name),
      h('div', { class: 'topbar-bank' }, 'Bank ', h('b', { class: 'bank-amt' }, fmt$(bank.state.bank))),
    );
    this.felt = h('div', { class: 'felt' });
    // Nic's blackjack scene is the whole screen (room + table); without it, fall back to the poker table on the felt
    const art = !!assets.bg(this.el, 'table.felt.blackjack');
    if (!art) assets.bg(this.felt, 'table.felt.holdem');
    const spots = art ? SPOTS_ART : SPOTS;
    this.dealerEl = h('div', { class: 'bj-dealer' }, h('div', { class: 'bj-cards' }), h('div', { class: 'bj-total' }));
    this.msgEl = h('div', { class: 'bj-msg' });
    this.felt.append(h('div', { class: 'bj-rail' }), h('div', { class: 'bj-arc' }, 'BLACKJACK PAYS 3 TO 2', h('br'), 'DEALER STANDS ON 17'), this.dealerEl, this.msgEl);
    this.seatEls = {};
    for (const s of this.seats) {
      const pos = spots[s.spot];
      const seatEl = h('div', { class: 'bj-seat' + (s.isHuman ? ' human' : ''), style: { left: pos.x + '%', top: pos.y + '%' } });
      const hands = h('div', { class: 'bj-hands' });
      const betEl = h('div', { class: 'bj-bet' });
      const plate = h('div', { class: 'nameplate' }, h('div', { class: 'pname' }, s.name), h('div', { class: 'pstack' }, fmt$(s.stack)));
      const bubble = h('div', { class: 'bubble' });
      seatEl.append(hands, betEl);
      this.felt.append(seatEl);
      let portrait = null;
      if (!s.isHuman) {
        portrait = portraitEl(s.char, { size: 'md' });
        const px = art ? (s.spot === 0 ? PORTRAIT_X_ART[0] : PORTRAIT_X_ART[1]) : pos.x;
        const pw = h('div', { class: 'bj-portrait', style: { left: px + '%' } }, portrait);
        this.felt.append(pw);
        if (art) pw.append(bubble); // on the painted table they speak from where they stand
      }
      if (!bubble.parentNode) seatEl.append(bubble);
      // on the painted table your own plate sits on the felt beside your circle (the action bar would cover it below)
      if (art && s.isHuman) this.felt.append(h('div', { class: 'bj-human-plate' }, plate));
      else seatEl.append(plate);
      this.seatEls[s.id] = { seatEl, hands, betEl, plate, bubble, portrait, stackEl: plate.lastChild };
    }
    this.actionBar = h('div', { class: 'actionbar bj-actions hidden' });
    this.gearBtn = h('button', { class: 'gear-btn', title: 'Settings', onClick: () => { audio.play('tap'); showSettings(this.root, {}, { atTable: true }); } }, '⚙');
    this.el.append(this.topbar, this.felt, this.actionBar, this.gearBtn);
    this.root.append(this.el);
    this.unsubBank = bank.onChange(() => { const b = this.topbar.querySelector('.bank-amt'); if (b) b.textContent = fmt$(bank.state.bank); });
  }

  say(text) { this.msgEl.textContent = text; }
  talk(seat, trigger, vars = {}, p = 1) {
    if (seat.isHuman) return false;
    if (!this.rng.chance(Math.min(1, p * (seat.char.persona?.chatty ?? 1)))) return false;
    const line = pickLine(seat.char, trigger, { player: this.human.name, ...vars }, this.rng);
    if (!line) return false;
    audio.voice(seat.char, line.file);
    const E = this.seatEls[seat.id];
    E.bubble.textContent = line.text; E.bubble.classList.add('show');
    clearTimeout(E.bubbleT); E.bubbleT = setTimeout(() => E.bubble.classList.remove('show'), 2600);
    return true;
  }
  updateStack(s) { this.seatEls[s.id].stackEl.textContent = fmt$(s.stack); }

  // ---------- main loop ----------
  async run() {
    audio.play('shuffle');
    this.say(`Welcome to ${this.table.name}. Place your bet.`);
    for (const s of this.seats) if (!s.isHuman && this.talk(s, 'greet', {}, 0.6)) await this.wait(500);
    while (!this.stopped) {
      const ok = await this.bettingPhase();
      if (!ok) break;
      await this.playRound();
      if (this.stopped) break;
    }
  }

  // ---------- betting ----------
  chipDenoms() {
    const t = this.table;
    return CHIP_DENOMS.slice().reverse().filter((d) => d >= t.minBet && d <= t.maxBet).slice(0, 5);
  }

  bettingPhase() {
    return new Promise((resolve) => {
      const me = this.human;
      // busted?
      if (me.stack < this.table.minBet) { this.bustModal().then((c) => resolve(c === 'rebuy' ? this.bettingPhase() : (this.leave(), false))); return; }
      if (this.leaving) { this.leave(); resolve(false); return; }
      this.clearTable();
      // companions choose their bets now
      for (const s of this.seats) if (!s.isHuman) {
        if (s.stack < this.table.minBet) { s.stack = this.table.maxBuy; this.talk(s, 'rebuy'); }
        const units = 1 + Math.floor(this.rng.next() * (1 + 3 * (s.char.persona.aggro || 0.3)));
        s.bet = Math.min(s.stack, this.table.minBet * units);
        this.renderBet(s);
        this.updateStack(s);
      }
      me.bet = Math.min(this.lastBet, me.stack, this.table.maxBet);
      const bar = this.actionBar; clear(bar); bar.classList.remove('hidden'); bar.classList.add('betting');
      const amt = h('div', { class: 'bet-amt' }, h('div', { class: 'bet-line' }, h('span', { class: 'lbl' }, me.name), h('b', {}, fmt$(me.stack))), h('div', { class: 'bet-line' }, h('span', { class: 'lbl' }, 'Bet'), h('b', { class: 'bet-now' }, '')));
      const refresh = () => { amt.querySelector('.bet-now').textContent = fmt$(me.bet); this.renderBet(me); dealBtn.disabled = me.bet < this.table.minBet; };
      const chips = h('div', { class: 'chip-rack' }, this.chipDenoms().map((d) => {
        const b = h('button', { class: 'rack-chip', onClick: () => { audio.play('chip'); me.bet = Math.min(me.bet + d, me.stack, this.table.maxBet); refresh(); } });
        if (!assets.bg(b, 'chip.' + d)) { b.classList.add('placeholder'); b.textContent = d >= 1000 ? d / 1000 + 'k' : d; }
        return b;
      }));
      const dealBtn = h('button', { class: 'act raise', onClick: () => { audio.play('chips'); this.lastBet = me.bet; bar.classList.add('hidden'); bar.classList.remove('betting'); resolve(true); } }, 'Deal');
      bar.append(
        h('div', { class: 'bet-panel' }, amt, chips,
          h('div', { class: 'row' },
            h('button', { class: 'btn ghost small', onClick: () => { audio.play('tap'); me.bet = 0; refresh(); } }, 'Clear'),
            h('button', { class: 'btn ghost small', onClick: () => { audio.play('tap'); me.bet = Math.min(this.table.minBet, me.stack); refresh(); } }, 'Min'),
            h('button', { class: 'btn ghost small', onClick: () => { audio.play('tap'); me.bet = Math.min(this.table.maxBet, me.stack); refresh(); } }, 'Max'),
          )),
        dealBtn,
      );
      refresh();
      this.resolveBetting = () => { bar.classList.add('hidden'); bar.classList.remove('betting'); this.leave(); resolve(false); };
    });
  }

  renderBet(s) {
    const E = this.seatEls[s.id]; clear(E.betEl);
    if (s.bet > 0) E.betEl.append(chipStackEl(s.bet, { compact: true, maxChips: 8 }));
  }

  clearTable() {
    clear(this.dealerEl.querySelector('.bj-cards')); setTotalBadge(this.dealerEl.querySelector('.bj-total'), '');
    for (const s of this.seats) { const E = this.seatEls[s.id]; clear(E.hands); clear(E.betEl); E.seatEl.classList.remove('acting'); }
  }

  // ---------- a round ----------
  async playRound() {
    this.resolveBetting = null;
    const players = this.seats.map((s) => ({ id: s.id, bet: s.bet }));
    for (const s of this.seats) { s.stack -= s.bet; this.updateStack(s); }
    const round = new Round({ shoe: this.shoe, players });
    this.round = round; this.cursor = 0;
    this.say('');
    if (!this.shoe.needsShuffle && this.rng.chance(LUCK.bjDeal)) bjLuckyDeal(this.shoe, players.length, players.findIndex((p) => p.id === HUMAN), this.rng);
    round.deal();
    await this.drain();
    if (round.phase === 'insurance') {
      // companions decide instantly (bad players take it), you get asked
      for (const s of this.seats) if (!s.isHuman) {
        round.insurance(s.id, this.rng.chance((1 - (s.char.persona.skill || 0.5)) * 0.5));
        const ins = round.player(s.id).insurance; if (ins) { s.stack -= ins; this.updateStack(s); }
      }
      if (round.phase === 'insurance') {
        const take = await this.askInsurance(Math.floor(this.human.bet / 2));
        if (take) { this.human.stack -= Math.floor(this.human.bet / 2); this.updateStack(this.human); }
        round.insurance(HUMAN, take);
      }
      await this.drain();
    }
    while (round.phase === 'play' && !this.stopped) {
      const seat = this.seatById(round.actor.playerId);
      const { h: hand } = round.currentHand();
      this.highlight(seat, round.actor.handIndex);
      const legal = round.legal();
      const affordable = { ...legal, double: legal.double && seat.stack >= hand.bet, split: legal.split && seat.stack >= hand.bet };
      let action;
      if (seat.isHuman) action = await this.awaitHuman(affordable, hand);
      else { action = aiDecide(hand.cards, round.dealerUp, affordable, seat.char.persona, this.rng); await this.wait(650 + this.rng.next() * 700); }
      if (this.stopped) return;
      if (action === 'double' || action === 'split') { seat.stack -= hand.bet; this.updateStack(seat); }
      if (seat.isHuman && action === 'hit' && this.rng.chance(LUCK.bjHit)) bjLuckyHit(this.shoe, hand.cards, this.rng);
      round.act(action);
      if (!seat.isHuman) this.talk(seat, action, {}, action === 'hit' || action === 'stand' ? 0.3 : 0.7);
      await this.drain();
    }
    this.highlight(null);
    if (round.phase === 'dealer') {
      // standing on a stiff hand? every so often the dealer's draw goes over
      const me = round.player(HUMAN);
      const stiff = me?.hands.some((hd) => hd.result !== 'bust' && !isBlackjack(hd.cards) && handValue(hd.cards).total >= 12 && handValue(hd.cards).total <= 16);
      if (stiff && this.rng.chance(LUCK.bjDealerBust)) bjDealerBusts(this.shoe, round.dealer.cards, round.rules.dealerHitsSoft17, this.rng);
      await this.wait(500); round.playDealer(); await this.drain();
    }
    await this.settleUI();
  }

  askInsurance(cost) {
    return new Promise((resolve) => {
      const bar = this.actionBar; clear(bar); bar.classList.remove('hidden');
      const done = (v) => { bar.classList.add('hidden'); clear(bar); resolve(v); };
      bar.append(
        h('div', { class: 'ins-label' }, `Dealer shows an ace. Insurance for ${fmt$(cost)}?`),
        h('button', { class: 'act fold', onClick: () => { audio.play('tap'); done(false); } }, 'No'),
        h('button', { class: 'act call', disabled: this.human.stack < cost, onClick: () => { audio.play('chip'); done(true); } }, 'Yes'),
      );
    });
  }

  awaitHuman(legal, hand) {
    return new Promise((resolve) => {
      audio.play('yourturn');
      const bar = this.actionBar; clear(bar); bar.classList.remove('hidden');
      const done = (a) => { bar.classList.add('hidden'); clear(bar); resolve(a); };
      const btn = (label, cls, ok, a) => h('button', { class: 'act ' + cls, disabled: !ok, onClick: () => { audio.play(a === 'hit' ? 'deal' : a === 'stand' ? 'check' : 'chips'); done(a); } }, label);
      bar.append(
        btn('Hit', 'call', legal.hit, 'hit'),
        btn('Stand', 'fold', legal.stand, 'stand'),
        btn('Double', 'raise', legal.double, 'double'),
        btn('Split', 'raise', legal.split, 'split'),
      );
    });
  }

  highlight(seat, handIndex = 0) {
    for (const s of this.seats) {
      const E = this.seatEls[s.id];
      E.seatEl.classList.toggle('acting', s === seat);
      [...E.hands.children].forEach((el, i) => el.classList.toggle('active', s === seat && i === handIndex));
    }
  }

  // ---------- rendering from engine events ----------
  async drain() {
    const r = this.round;
    while (this.cursor < r.events.length) {
      const ev = r.events[this.cursor++];
      switch (ev.type) {
        case 'shuffle': this.say('Shuffling a fresh shoe.'); audio.play('shuffle'); await this.wait(700); break;
        case 'card': {
          if (ev.playerId === 'dealer') {
            const row = this.dealerEl.querySelector('.bj-cards');
            const el = cardEl(ev.card, { faceDown: !!ev.hidden }); el.classList.add('dealt');
            if (ev.hidden) el.dataset.hidden = '1';
            row.append(el);
          } else {
            const E = this.seatEls[ev.playerId];
            const handEl = this.handEl(E, ev.handIndex);
            const el = cardEl(ev.card, { small: ev.playerId !== HUMAN }); el.classList.add('dealt');
            handEl.querySelector('.bj-hand-cards').append(el);
          }
          audio.play('deal');
          this.refreshTotals();
          await this.wait(240);
          break;
        }
        case 'split': {
          const E = this.seatEls[ev.playerId];
          // rebuild both hands from engine state
          const p = r.player(ev.playerId);
          clear(E.hands);
          p.hands.forEach((hd, i) => { const he = this.handEl(E, i); for (const c of hd.cards) he.querySelector('.bj-hand-cards').append(cardEl(c, { small: ev.playerId !== HUMAN })); this.setBetTag(he, hd.bet); });
          this.refreshTotals();
          audio.play('chips');
          await this.wait(300);
          break;
        }
        case 'double': { const E = this.seatEls[ev.playerId]; this.setBetTag(this.handEl(E, ev.handIndex), ev.bet); audio.play('chips'); break; }
        case 'bust': {
          const seat = this.seatById(ev.playerId); const E = this.seatEls[ev.playerId];
          this.tag(this.handEl(E, ev.handIndex), 'Bust', 'lose');
          if (!seat.isHuman) this.talk(seat, 'bust', {}, 0.7);
          else { const o = this.seats.filter((x) => !x.isHuman); if (o.length) this.talk(this.rng.pick(o), 'tauntBlackjack', {}, 0.3); }
          await this.wait(350);
          break;
        }
        case 'dealerReveal': {
          const hidden = this.dealerEl.querySelector('.pcard[data-hidden]');
          if (hidden) { hidden.replaceWith(cardEl(ev.card)); audio.play('flip'); }
          this.refreshTotals(true);
          await this.wait(500);
          break;
        }
        case 'dealerBlackjack': {
          const hidden = this.dealerEl.querySelector('.pcard[data-hidden]');
          if (hidden) { hidden.replaceWith(cardEl(r.dealer.cards[1])); audio.play('flip'); }
          this.refreshTotals(true);
          this.say('Dealer has blackjack.');
          await this.wait(700);
          break;
        }
        case 'insuranceLost': { const s = this.seatById(ev.playerId); if (s.isHuman) toast('No blackjack. Insurance lost.'); break; }
        default: break;
      }
    }
  }

  handEl(E, i) {
    while (E.hands.children.length <= i) E.hands.append(h('div', { class: 'bj-hand' }, h('div', { class: 'bj-hand-cards' }), h('div', { class: 'bj-hand-total' }), h('div', { class: 'bj-hand-tag' }), h('div', { class: 'bj-hand-bet' })));
    return E.hands.children[i];
  }
  setBetTag(handEl, bet) { handEl.querySelector('.bj-hand-bet').textContent = fmt$(bet); }
  tag(handEl, text, kind) { const t = handEl.querySelector('.bj-hand-tag'); t.textContent = text; t.className = 'bj-hand-tag show ' + kind; }

  refreshTotals(dealerAll = false) {
    const r = this.round;
    for (const p of r.players) {
      const E = this.seatEls[p.id];
      p.hands.forEach((hd, i) => {
        const he = this.handEl(E, i);
        const nat = isBlackjack(hd.cards) && !hd.fromSplit;
        // the engine deals the whole round at once but the table shows cards one by one: count what's on the table
        const shownCards = he.querySelectorAll('.bj-hand-cards .pcard').length;
        const vShown = handValue(hd.cards.slice(0, shownCards));
        const text = shownCards < 2 ? '' : nat && shownCards >= 2 ? 'Blackjack!' : (vShown.soft && vShown.total < 21 ? `${vShown.total - 10}/${vShown.total}` : String(vShown.total));
        setTotalBadge(he.querySelector('.bj-hand-total'), text, { bust: vShown.total > 21, win: vShown.total === 21 });
        if (p.hands.length > 1 || hd.doubled) this.setBetTag(he, hd.bet);
      });
    }
    const d = r.dealer;
    const shown = dealerAll || !d.holeHidden ? d.cards : d.cards.slice(0, 1);
    const dv = handValue(shown);
    const dealerShown = this.dealerEl.querySelectorAll('.bj-cards .pcard').length;
    const dealerText = dealerShown >= 2 && shown.length ? (dealerAll || !d.holeHidden ? String(handValue(shown.slice(0, dealerShown)).total) : String(cardValue(shown[0]))) : '';
    setTotalBadge(this.dealerEl.querySelector('.bj-total'), dealerText, { bust: dv.total > 21 && shown.length === d.cards.length, win: dv.total === 21 && shown.length > 1 });
  }

  async settleUI() {
    const r = this.round; const res = r.results;
    if (res.dealerBust) { this.say(`Dealer busts with ${res.dealerTotal}.`); audio.play('chips'); for (const s of this.seats) if (!s.isHuman) this.talk(s, 'dealerBust', {}, 0.6); }
    else this.say(res.dealerBlackjack ? 'Dealer has blackjack.' : `Dealer stands on ${res.dealerTotal}.`);
    await this.wait(500);
    let humanNet = 0, humanNatural = false, humanBet = 0; let humanAllBust = false;
    for (const pr of res.players) {
      const seat = this.seatById(pr.playerId); const E = this.seatEls[pr.playerId];
      const p = r.player(pr.playerId);
      // pay the table: the bet comes back plus the win, or nothing on a loss; insurance settles too
      let back = 0;
      pr.hands.forEach((hd, i) => {
        back += hd.bet + hd.payout;
        const he = this.handEl(E, i);
        const label = hd.result === 'blackjack' ? `BLACKJACK +${fmt$(hd.payout)}` : hd.result === 'win' ? `WIN +${fmt$(hd.payout)}` : hd.result === 'push' ? 'PUSH' : hd.result === 'bust' ? 'BUST' : 'LOSE';
        this.tag(he, label, hd.result === 'push' ? 'push' : hd.payout > 0 ? 'win' : 'lose');
      });
      if (p.insurance && res.dealerBlackjack) back += p.insurance * 3;
      seat.stack += back; this.updateStack(seat);
      if (seat.isHuman) { humanNet = pr.net; humanBet = pr.hands.reduce((s, x) => s + x.bet, 0); humanNatural = pr.hands.some((x) => x.result === 'blackjack'); humanAllBust = pr.hands.length > 0 && pr.hands.every((x) => x.result === 'bust'); }
      else if (pr.net > 0) {
        const natural = pr.hands.some((x) => x.result === 'blackjack');
        this.talk(seat, natural ? 'blackjack' : pr.net >= this.table.minBet * 6 ? 'winBig' : 'winSmall', {}, 0.5);
        if (natural || pr.net >= this.table.minBet * 6) this.setExpression(seat, 'happy');
      }
      else if (pr.net < 0) {
        this.talk(seat, pr.net <= -this.table.minBet * 6 ? 'loseBig' : 'lose', {}, 0.35);
        if (pr.net <= -this.table.minBet * 4 || pr.hands.some((x) => x.result === 'bust')) this.setExpression(seat, 'mad');
      }
      else if (pr.net === 0) this.talk(seat, 'push', {}, 0.4);
      if (pr.net > 0) this.flyChips(this.dealerEl, E.betEl, pr.net);
      else if (pr.net < 0) this.flyChips(E.betEl, this.dealerEl, -pr.net);
    }
    bank.recordHand({ won: humanNet > 0, showdown: false, pot: humanNet > 0 ? humanNet + humanBet : 0, net: humanNet, handName: humanNatural ? 'Blackjack' : null, handScore: humanNatural ? 1 : 0 });
    bank.setAtTable({ tableId: this.table.id, stack: this.human.stack, opponents: this.seats.filter((s) => !s.isHuman).map((s) => s.id) });
    const big = humanNatural || humanNet >= this.table.minBet * 8;
    if (humanNet > 0) { audio.play(big ? 'bigwin' : 'win'); await this.wait(400); if (big) await this.winBanner(humanNet, humanNatural ? 'Blackjack!' : null, true); else await resultBanner(this.felt, { type: 'win', amount: humanNet }); }
    else if (humanNet < 0) { audio.play('lose', { volume: 0.4 }); await this.wait(300); await resultBanner(this.felt, { type: humanAllBust ? 'bust' : 'lose', amount: humanNet }); }
    else if (humanBet > 0) { await this.wait(300); await resultBanner(this.felt, { type: 'push', amount: 0 }); }
    else await this.wait(1400);
  }

  // Swap in a companion's happy / mad portrait for a few seconds, if that art exists.
  setExpression(s, mood, ms = 4000) {
    if (s.isHuman || !assets.has(`portrait.${s.id}.${mood}`)) return;
    const E = this.seatEls[s.id];
    const swap = (m) => { const np = portraitEl(s.char, { size: 'md', mood: m }); E.portrait.replaceWith(np); E.portrait = np; };
    swap(mood);
    clearTimeout(E.exprT); E.exprT = setTimeout(() => { if (E.portrait.isConnected) swap(null); }, ms);
  }

  flyChips(fromEl, toEl, amount) {
    const felt = this.felt.getBoundingClientRect();
    const from = fromEl.getBoundingClientRect(), to = toEl.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const stack = chipStackEl(amount, { maxChips: 8, label: true }); stack.classList.add('flying');
    stack.style.left = (from.left - felt.left + from.width / 2) + 'px'; stack.style.top = (from.top - felt.top + from.height / 2) + 'px';
    this.felt.append(stack);
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2), dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    requestAnimationFrame(() => requestAnimationFrame(() => { stack.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`; stack.style.opacity = '0.15'; }));
    setTimeout(() => stack.remove(), 950);
  }

  winBanner(amount, handName, big) {
    return new Promise((resolve) => {
      const banner = h('div', { class: 'win-banner' + (big ? ' big' : '') },
        h('div', { class: 'wb-title' }, big ? (handName ? 'BLACKJACK!' : 'BIG WIN!') : 'You win!'),
        chipStackEl(amount, { maxChips: big ? 20 : 12, label: false }),
        h('div', { class: 'wb-amount' }, '+' + fmt$(amount)),
      );
      if (big) for (let i = 0; i < 16; i++) banner.append(h('i', { class: 'spark', style: { '--x': (Math.random() * 100).toFixed(0) + '%', '--d': (Math.random() * .8).toFixed(2) + 's', '--c': ['#e6c36a', '#fff', '#8fe0a2', '#f0a0a0'][i % 4] } }));
      this.felt.append(banner);
      requestAnimationFrame(() => banner.classList.add('show'));
      setTimeout(() => { banner.classList.remove('show'); setTimeout(() => { banner.remove(); resolve(); }, 300); }, big ? 2400 : 1700);
    });
  }

  // ---------- bust / leave ----------
  bustModal() {
    const t = this.table; const b = bank.state.bank;
    const canRebuy = b >= t.minBuy;
    const max = Math.min(t.maxBuy, b);
    let amount = max;
    return modal({
      title: "You're out of chips", dismissable: false,
      body: (el, close) => {
        el.append(h('p', {}, canRebuy ? `Take more out of the bank? You have ${fmt$(b)}.` : b > 0 ? `You have ${fmt$(b)} in the bank — not enough for this table's ${fmt$(t.minBuy)} minimum.` : 'And the bank is empty. Ken is in the lobby.'));
        if (canRebuy) {
          const amt = h('div', { class: 'big' }, fmt$(amount));
          const slider = h('input', { type: 'range', min: t.minBuy, max, step: t.minBet, value: amount });
          slider.addEventListener('input', () => { amount = +slider.value; amt.textContent = fmt$(amount); });
          el.append(amt, slider);
        }
        el.append(h('div', { class: 'modal-buttons' },
          h('button', { class: 'btn ghost', onClick: () => close('leave') }, 'Back to the lobby'),
          canRebuy ? h('button', { class: 'btn primary', onClick: () => { bank.buyIn(amount, t.id); this.human.stack += amount; this.updateStack(this.human); audio.play('chips'); close('rebuy'); } }, 'Rebuy') : null,
        ));
      },
    });
  }

  async requestLeave() {
    audio.play('tap');
    if (this.resolveBetting) { this.resolveBetting(); return; }
    const bet = this.round ? this.round.player(HUMAN)?.hands.reduce((s, h) => s + h.bet, 0) || 0 : 0;
    const choice = await askLeave({
      text: 'A hand is being played.',
      afterLabel: 'After this hand', nowLabel: 'Leave now',
      nowNote: bet ? `Leaving now forfeits the ${fmt$(bet)} you have on the table this hand.` : '',
    });
    if (choice === 'now') { this.leave(); return; }
    this.leaving = choice === 'after';
    if (this.leaving) toast('Leaving after this hand.');
  }

  async leave() {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubBank?.();
    const stack = this.human.stack;
    const change = bank.cashOut(stack, this.table.id);
    if (change) {
      audio.play(change.up ? 'tierup' : 'tierdown');
      await modal({
        className: 'tier-change ' + (change.up ? 'up' : 'down'), dismissable: true,
        body: (el) => {
          el.append(creditCardEl(change.to, bank.state.playerName, { size: 'md' }), h('h2', {}, change.up ? 'Card upgraded!' : 'Card downgraded'),
            h('p', {}, change.up ? `Your bank hit ${fmt$(change.to.min)}. Welcome to ${change.to.name}.` : `Your bank fell below ${fmt$(change.from.min)}. You're back to ${change.to.name}.`));
        },
        buttons: [{ label: change.up ? 'Nice' : 'Fine', kind: 'primary' }],
      });
    }
    this.onLeave({ stack });
  }
}
