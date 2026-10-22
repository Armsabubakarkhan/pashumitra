// Tiny DOM helpers. Everything is built with createElement and textContent, never innerHTML, so user text cannot become markup.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'multiple') { if (v) el[k] = true; }
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...kids) { clear(el); append(el, kids); return el; }

export function skeleton() {
  const s = h('div', { class: 'skel', role: 'status', 'aria-label': 'Loading' }, h('i'), h('i'), h('i'), h('i'));
  return s;
}

let toastHost;
export function toast(msg, bad = false) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const el = h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg });
  toastHost.append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3500);
}

export function field(label, input, { hint, id } = {}) {
  const fid = id || 'f' + Math.random().toString(36).slice(2, 9);
  input.id = fid;
  const err = h('div', { class: 'err', role: 'alert' });
  err.hidden = true;
  const wrap = h('div', { class: 'field' }, h('label', { for: fid }, label, hint ? h('span', { class: 'hint' }, ' ', hint) : null), input, err);
  wrap.setError = (m) => { err.textContent = m || ''; err.hidden = !m; input.setAttribute('aria-invalid', m ? 'true' : 'false'); if (m) input.setAttribute('aria-describedby', fid + '-e'); err.id = fid + '-e'; };
  return wrap;
}

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}
export function fmtDay(iso) {
  try { return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; }
}
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function option(value, label, selected) { return h('option', { value, selected: !!selected }, label); }
