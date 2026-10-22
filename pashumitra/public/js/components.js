import { h, mount } from './ui.js';
import { t, tSign, tLabel, tAction, tAudio, tBand, tAmmonia, speechLang } from './i18n.js';

export function sevBadge(sev) {
  return h('span', { class: 'sev ' + sev }, h('i', { 'aria-hidden': 'true' }), t('sev_' + (sev === 'green' ? 'green' : sev === 'yellow' ? 'yellow' : 'red')));
}

function reasonText(r) {
  switch (r.k) {
    case 'signs': return t('r_signs', { list: r.ids.map(tSign).join(', ') });
    case 'fever_temp': return t('r_fever_temp', { v: r.v });
    case 'pattern': return t('r_pattern', { list: r.ids.map(tSign).join(', ') });
    case 'motion': return t('r_motion', { uneven: r.uneven, active: r.active });
    case 'motion_still': return t('r_motion_still');
    case 'audio': return t('r_audio', { cls: tAudio(r.cls), c: r.c });
    case 'thi': return t('r_thi', { v: r.v, band: tBand(r.band) });
    case 'ammonia': return t('r_ammonia', { v: r.v, band: tAmmonia(r.band) });
    case 'signs_only': return t('r_signs_only');
    default: return t('r_nothing');
  }
}

export function alertText(result) {
  const lines = [t('sev_' + result.severity) + ': ' + tLabel(result.label) + ' (' + result.confidence + '% ' + t('confidence') + ')'];
  lines.push(t('why') + ':');
  for (const r of result.reasons) lines.push('- ' + reasonText(r));
  lines.push(t('what_to_do') + ':');
  result.actions.forEach((a, i) => lines.push((i + 1) + '. ' + tAction(a)));
  lines.push(t('note_screening'));
  return lines.join('\n');
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLang();
  window.speechSynthesis.speak(u);
  return true;
}

// The explainable alert card. `extra` is an optional node appended before the disclaimer.
export function alertCard(result, { headingLevel = 2, extra, heat } = {}) {
  const Hn = 'h' + headingLevel;
  const read = 'speechSynthesis' in window ? h('button', { class: 'small', onclick: () => speak(alertText(result)) }, t('read_aloud')) : null;
  const card = h('section', { class: 'alert ' + result.severity, 'aria-live': 'polite' },
    h('div', { class: 'alert-head' },
      h('div', { class: 'row' }, sevBadge(result.severity), h('span', { class: 'tag ' + result.severity }, t('risk_score') + ' ' + result.score + '/100'),
        h('span', { class: 'num muted' }, result.confidence + '% ' + t('confidence'))),
      h(Hn, null, tLabel(result.label)),
      result.also && result.also.length ? h('p', { class: 'muted' }, 'Also possible: ' + result.also.map(tLabel).join(', ')) : null),
    h('div', { class: 'alert-body' },
      h('div', null, h('h3', null, t('why')), h('ul', null, result.reasons.map((r) => h('li', null, reasonText(r))))),
      h('div', null, h('h3', null, t('what_to_do')), h('ol', null, result.actions.map((a) => h('li', { class: a.startsWith('call_vet') ? 'strong' : null }, a.startsWith('call_vet') ? h('strong', null, tAction(a)) : tAction(a)))))),
    heat || null,
    h('div', { class: 'alert-foot no-print' }, read, h('span', { class: 'muted num' }, 'Signs ' + result.parts.signs + ' + Video ' + result.parts.motion + ' + Sound ' + result.parts.audio + ' + Shed ' + result.parts.environment)),
    extra || null,
    h('p', { class: 'disclaimer' }, t('note_screening')));
  return card;
}

export function meter(pct) {
  const s = h('span');
  s.style.width = Math.max(0, Math.min(100, pct)) + '%';
  return h('div', { class: 'meter', role: 'img', 'aria-label': pct + '%' }, s);
}

export function bars(values, hotFrom) {
  const wrap = h('div', { class: 'bars', role: 'img', 'aria-label': 'Movement per second' });
  const max = Math.max(0.0001, ...values.map((v) => v[0]));
  for (const [e, cv] of values) {
    const s = h('span', { class: cv >= hotFrom && e >= 0.004 ? 'hot' : '' });
    s.style.height = Math.max(3, Math.round((e / max) * 100)) + '%';
    wrap.append(s);
  }
  return wrap;
}

// draws the movement heat picture on a canvas (blends last frame with heat)
export function heatCanvas(motionOut) {
  const { w, h: hh, heat, lastFrame } = motionOut;
  const c = document.createElement('canvas');
  c.width = w; c.height = hh; c.className = 'canv';
  c.style.width = Math.min(480, w * 5) + 'px';
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', 'Movement picture: brighter areas moved more');
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hh);
  for (let i = 0; i < w * hh; i++) {
    const base = lastFrame ? lastFrame[i] * 0.45 : 20;
    const v = heat[i];
    img.data[i * 4] = Math.min(255, base + v * 235);
    img.data[i * 4 + 1] = Math.min(255, base + v * 150);
    img.data[i * 4 + 2] = Math.min(255, base + v * 40);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function empty(msg, action) {
  return h('div', { class: 'panel flat' }, h('p', null, msg), action || null);
}

export function showErrors(form, err) {
  for (const el of form.querySelectorAll('.err')) { el.hidden = true; el.textContent = ''; }
  return err;
}
export { mount };
