// Tiny DOM helpers.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Swapping the whole screen (#app) needs nothing special: the old screen goes at once and the new one fades up from the
// dark background (screen-in, css). v163 crossfaded the two, which showed the old menus ghosting over the new screen.
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Simple modal. Returns a promise resolving with whatever a button's onClick returns (via close(value)).
export function modal({ title, body, buttons = [], className = '', dismissable = false }) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'overlay' });
    const box = h('div', { class: 'modal ' + className });
    const close = (v) => { overlay.classList.add('closing'); setTimeout(() => overlay.remove(), 180); resolve(v); };
    if (title) box.append(h('h2', {}, title));
    const bodyEl = h('div', { class: 'modal-body' });
    if (typeof body === 'function') body(bodyEl, close); else append(bodyEl, [body]);
    box.append(bodyEl);
    if (buttons.length) {
      box.append(h('div', { class: 'modal-buttons' }, buttons.map((b) => h('button', {
        class: 'btn ' + (b.kind || ''),
        disabled: b.disabled,
        onClick: () => close(b.value !== undefined ? b.value : b.label),
      }, b.label))));
    }
    if (dismissable) overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    overlay.append(box);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
  });
}

export function toast(text, ms = 2200) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}
