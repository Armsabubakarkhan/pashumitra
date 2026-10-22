import { h, mount, field, skeleton, toast, option } from '../ui.js';
import { get, post, state, ApiError } from '../api.js';
import { t, tSpecies, speechLang } from '../i18n.js';
import { empty, speak } from '../components.js';

export async function library() {
  const [lib, med] = await Promise.all([get('/api/library'), get('/api/medication')]);
  return h('div', { class: 'wrap stack', 'data-title': t('nav_library') },
    h('div', { class: 'pagehead' }, h('h1', null, t('nav_library'))),
    h('p', { class: 'lede' }, 'Plain-language notes on common livestock diseases: what to look for, what to do now, and when to call a vet.'),
    h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Condition'), h('th', null, t('species')), h('th', null, 'Summary'))),
      h('tbody', null, lib.items.map((d) => h('tr', null, h('td', null, h('a', { href: '#/library/' + d.id }, d.name)), h('td', null, d.species.map(tSpecies).join(', ')), h('td', null, d.summary)))))),
    h('section', { class: 'panel stack', id: 'medicine' }, h('h2', null, 'About medicines'), h('p', null, med.intro),
      h('div', { class: 'cols2' },
        h('div', null, h('h3', null, 'Safe to do while you wait for the vet'), h('ul', { class: 'plain' }, med.doList.map((x) => h('li', null, x)))),
        h('div', null, h('h3', null, 'Do not do'), h('ul', { class: 'plain' }, med.dontList.map((x) => h('li', null, x))))),
      h('p', { class: 'muted' }, med.why)));
}

export async function libraryItem({ params }) {
  const { item: d } = await get('/api/library/' + encodeURIComponent(params.id));
  const list = (title, arr) => h('div', null, h('h3', null, title), h('ul', { class: 'plain' }, arr.map((x) => h('li', null, x))));
  return h('div', { class: 'wrap stack', 'data-title': d.name },
    h('p', null, h('a', { href: '#/library' }, 'Back to library')),
    h('div', { class: 'pagehead' }, h('h1', null, d.name)),
    h('p', { class: 'lede' }, d.summary), h('p', { class: 'muted' }, 'Affects: ' + d.species.map(tSpecies).join(', ')),
    h('div', { class: 'cols2' }, list('Signs to look for', d.signs), list('What to do now', d.now)),
    h('div', { class: 'panel' }, h('h3', null, 'When to call a vet'), h('p', null, d.vet)),
    h('div', { class: 'panel flat' }, h('h3', null, 'Prevention'), h('p', null, d.prevention)),
    h('p', { class: 'muted' }, 'General awareness only. A veterinarian decides treatment and doses.'));
}

export async function ask() {
  const log = h('div', { class: 'chat', 'aria-live': 'polite' });
  const q = h('input', { type: 'text', maxlength: 500, autocomplete: 'off', required: true, 'aria-label': 'Your question', placeholder: 'For example: my cow is drooling and limping' });
  const sp = h('select', { 'aria-label': t('species') }, option('', 'Species (optional)'), ['cattle', 'buffalo', 'sheep', 'goat', 'poultry'].map((s) => option(s, tSpecies(s))));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = null;
  const mic = SR ? h('button', { type: 'button', onclick: () => {
    if (listening) { listening.stop(); return; }
    const r = new SR(); r.lang = speechLang(); r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { q.value = e.results[0][0].transcript.slice(0, 500); };
    r.onend = () => { listening = null; mic.textContent = 'Speak'; };
    r.onerror = () => { listening = null; mic.textContent = 'Speak'; toast('Could not hear you. Try typing', true); };
    listening = r; mic.textContent = t('stop'); r.start();
  } }, 'Speak') : null;

  function render(a) {
    if (a.kind === 'blocked') return h('div', { class: 'msg blocked' }, h('h3', null, 'I cannot give medicine doses'), h('p', null, a.message), h('a', { href: '#/library#medicine', onclick: (e) => { e.preventDefault(); location.hash = '#/library'; } }, 'Read about medicines'));
    const steps = a.steps && a.steps.length ? h('div', null, h('h3', null, 'What to do now'), h('ol', null, a.steps.map((s) => h('li', null, s)))) : null;
    const read = 'speechSynthesis' in window ? h('button', { class: 'small', onclick: () => speak([a.title, a.message].concat(a.steps || []).filter(Boolean).join('. ')) }, t('read_aloud')) : null;
    return h('div', { class: 'msg ' + (a.kind === 'emergency' ? 'emergency' : '') },
      a.kind === 'emergency' ? h('h3', null, 'Emergency: call a vet now') : (a.title ? h('h3', null, a.title) : null),
      h('p', null, a.message),
      a.signs ? h('div', null, h('h3', null, 'Signs'), h('ul', { class: 'plain' }, a.signs.map((s) => h('li', null, s)))) : null,
      steps, a.vet ? h('p', null, h('strong', null, 'Vet: '), a.vet) : null, a.prevention ? h('p', { class: 'muted' }, 'Prevention: ' + a.prevention) : null,
      h('div', { class: 'row no-print' }, read, a.callVet ? h('a', { class: 'btn small', href: '#/help' }, t('find_help')) : null,
        a.library && a.library[0] && a.library[0] !== 'medication' ? h('a', { class: 'btn small', href: '#/library/' + a.library[0] }, 'Read more') : null),
      h('p', { class: 'muted' }, t('note_screening')));
  }
  const form = h('form', { class: 'panel stack', onsubmit: async (e) => {
    e.preventDefault();
    const question = q.value.trim();
    if (question.length < 3) return;
    log.append(h('div', { class: 'msg me' }, question));
    const wait = h('div', { class: 'msg' }, skeleton()); log.append(wait);
    q.value = '';
    try { const r = await post('/api/ask', { question, species: sp.value || undefined }); wait.replaceWith(render(r.answer)); wait.remove; }
    catch (err) { wait.replaceWith(h('div', { class: 'msg blocked', role: 'alert' }, err.message)); }
    log.lastChild && log.lastChild.scrollIntoView({ block: 'nearest' });
  } }, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { for: 'askq' }, 'Ask a question'), Object.assign(q, { id: 'askq' })), h('div', { class: 'field' }, h('label', { for: 'asksp' }, t('species')), Object.assign(sp, { id: 'asksp' }))),
  h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Ask'), mic));
  return h('div', { class: 'narrow stack', 'data-title': t('nav_ask') },
    h('div', { class: 'pagehead' }, h('h1', null, t('nav_ask'))),
    h('p', { class: 'note' }, 'Answers come from the built-in veterinary library, not from a free-running chatbot. Emergencies are escalated, and medicine names with doses are never given.'),
    log, form);
}

export async function nearby() {
  const district = h('input', { type: 'search', maxlength: 60, value: state.user.district || '', 'aria-label': t('district') });
  const out = h('div');
  const vetsOut = h('div');
  async function load() {
    mount(out, skeleton());
    const r = await get('/api/help/clinics?district=' + encodeURIComponent(district.value));
    if (!r.clinics.length) { mount(out, empty('No listed clinics for that district yet. Try a nearby district, or call your local Animal Husbandry office.')); return; }
    const anySample = r.clinics.some((c) => c.is_sample);
    mount(out, anySample ? h('p', { class: 'note warn' }, 'Entries marked Sample are placeholders so you can see how this page works. Administrators replace them with real clinics. Do not rely on sample phone numbers.') : null,
      h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Type'), h('th', null, t('district')), h('th', null, 'Services'), h('th', null, 'Contact'))),
        h('tbody', null, r.clinics.map((c) => h('tr', null,
          h('td', null, c.name, c.is_sample ? h('span', { class: 'tag yellow' }, 'sample') : null), h('td', null, c.kind), h('td', null, c.district), h('td', null, c.services),
          h('td', null, c.phone ? h('a', { href: 'tel:' + c.phone }, c.phone) : h('span', { class: 'muted' }, 'No number listed'),
            c.lat !== null && c.lng !== null ? h('div', null, h('a', { href: 'https://www.openstreetmap.org/?mlat=' + c.lat + '&mlon=' + c.lng + '#map=14/' + c.lat + '/' + c.lng, target: '_blank', rel: 'noopener noreferrer' }, 'Map')) : null)))))));
  }
  const form = h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); load().catch((er) => mount(out, h('p', { class: 'note bad' }, er.message))); } },
    h('div', { class: 'field' }, h('label', { for: 'hd' }, t('district')), Object.assign(district, { id: 'hd' })), h('button', { type: 'submit' }, 'Search'));
  const vr = await get('/api/help/vets');
  mount(vetsOut, h('h2', null, 'Verified veterinarians on PashuMitra'),
    vr.vets.length ? h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Clinic'), h('th', null, t('district')), h('th', null, 'Phone'))),
      h('tbody', null, vr.vets.map((v) => h('tr', null, h('td', null, v.name), h('td', null, v.clinic || '-'), h('td', null, v.district), h('td', null, v.phone ? h('a', { href: 'tel:' + v.phone }, v.phone) : '-')))))) : h('p', { class: 'muted' }, 'No verified veterinarians have registered yet.'));
  const root = h('div', { class: 'wrap stack', 'data-title': t('nav_help') }, h('div', { class: 'pagehead' }, h('h1', null, t('nav_help'))),
    h('div', { class: 'note' }, 'In an emergency call a veterinarian first. Helpline numbers differ by state, so ask your local Animal Husbandry office for the number in your area.'),
    h('div', { class: 'panel stack' }, h('h2', null, 'Clinics, hospitals and ambulances'), form, out), h('div', { class: 'panel stack' }, vetsOut));
  load().catch((er) => mount(out, h('p', { class: 'note bad' }, er.message)));
  return root;
}
