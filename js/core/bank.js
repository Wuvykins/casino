// The player's bank account, credit card tier, stats and settings. One save, in localStorage.
import { START_BANK, tierFor, tierById } from '../content/tiers.js';

const KEY = 'casino.save.v1';

const defaults = () => ({
  version: 1,
  playerName: '',
  bank: START_BANK,
  tierId: 1,
  bailouts: 0,
  createdAt: Date.now(),
  transactions: [],   // { t, type: 'buyin'|'cashout'|'bailout', amount, table, bankAfter }
  stats: { handsPlayed: 0, handsWon: 0, showdownsWon: 0, biggestPot: 0, lifetimeNet: 0, bestHand: '', bestHandScore: 0, tierHistory: [] },
  settings: { sound: true, voices: true, autoDeal: true, aiSpeed: 1, showTips: true },
  atTable: null,      // { tableId, stack, opponents:[ids] } snapshot so a reload doesn't lose chips
  tourney: null,      // a hold'em tournament in progress, saved before every hand so it can be resumed (see HoldemTable.saveTourney)
});

export const bank = {
  state: null,
  listeners: new Set(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.state = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
      this.state.settings = { ...defaults().settings, ...(this.state.settings || {}) };
      this.state.stats = { ...defaults().stats, ...(this.state.stats || {}) };
    } catch { this.state = defaults(); }
    // If the app closed while sitting at a table, the chips go back to the bank.
    if (this.state.atTable && this.state.atTable.stack > 0) {
      this.state.bank += this.state.atTable.stack;
      this.log('cashout', this.state.atTable.stack, this.state.atTable.tableId + ' (restored)');
      this.reevaluateTier();
    }
    this.state.atTable = null;
    this.save();
    return this.state;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* private mode etc. */ }
    for (const fn of this.listeners) fn(this.state);
  },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  reset() { this.state = defaults(); this.save(); },
  exportJSON() { return JSON.stringify(this.state, null, 2); },
  importJSON(text) { const s = JSON.parse(text); if (typeof s.bank !== 'number') throw new Error('not a save file'); this.state = { ...defaults(), ...s }; this.save(); },

  get tier() { return tierById(this.state.tierId); },
  get isBroke() { return this.state.bank <= 0; },

  log(type, amount, table) {
    this.state.transactions.unshift({ t: Date.now(), type, amount, table, bankAfter: this.state.bank });
    if (this.state.transactions.length > 60) this.state.transactions.length = 60;
  },

  // Sitting down: money leaves the bank. Tier is NOT re-evaluated here — only when you cash out.
  buyIn(amount, tableId) {
    if (amount > this.state.bank) throw new Error('not enough in the bank');
    this.state.bank -= amount;
    this.log('buyin', -amount, tableId);
    this.save();
  },
  // Leaving (or reload recovery): chips return to the bank and the card is re-evaluated, up or down.
  cashOut(amount, tableId) {
    this.state.bank += amount;
    if (amount) this.log('cashout', amount, tableId);   // a tournament bust cashes out nothing: no statement line
    const change = this.reevaluateTier();
    this.state.atTable = null;
    this.save();
    return change;
  },
  reevaluateTier() {
    const old = this.tier;
    const now = tierFor(this.state.bank);
    if (now.id !== old.id) {
      this.state.tierId = now.id;
      this.state.stats.tierHistory.push({ t: Date.now(), from: old.id, to: now.id });
      return { from: old, to: now, up: now.id > old.id };
    }
    return null;
  },
  // Ken's mercy.
  bailout() {
    this.state.bank += START_BANK;
    this.state.bailouts++;
    this.log('bailout', START_BANK, 'Ken');
    const change = this.reevaluateTier();
    this.save();
    return { amount: START_BANK, change };
  },

  setAtTable(snapshot) { this.state.atTable = snapshot; this.save(); },
  setTourney(snapshot) { this.state.tourney = snapshot; this.save(); },
  setName(name) { this.state.playerName = name.trim().slice(0, 18); this.save(); },
  setSetting(k, v) { this.state.settings[k] = v; this.save(); },

  recordHand({ won, showdown, pot, net, handName, handScore }) {
    const s = this.state.stats;
    s.handsPlayed++;
    if (won) s.handsWon++;
    if (won && showdown) s.showdownsWon++;
    if (won && pot > s.biggestPot) s.biggestPot = pot;
    s.lifetimeNet += net;
    if (handScore && handScore > (s.bestHandScore || 0)) { s.bestHandScore = handScore; s.bestHand = handName; }
    this.save();
  },
};

export const fmt$ = (n) => {
  const neg = n < 0; n = Math.abs(Math.round(n));
  return (neg ? '-$' : '$') + n.toLocaleString('en-US');
};
