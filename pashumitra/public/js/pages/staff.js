import { h, mount, field, fmtDate, toast, option, skeleton } from '../ui.js';
import { get, post, patch, del, ApiError, state } from '../api.js';
import { t, tLabel, tSpecies, tSign } from '../i18n.js';
import { sevBadge, alertCard, empty } from '../components.js';
import { go } from '../app.js';

const LABELS = ['healthy', 'general_illness', 'fmd', 'lsd', 'mastitis', 'respiratory', 'heat_stress', 'newcastle', 'bloat', 'poisoning', 'down'];

export async function cases() {
  if (!state.user.verified) {
    return h('div', { class: 'narrow stack', 'data-title': t('nav_cases') }, h('h1', null, t('nav_cases')),
      h('div', { class: 'note warn' }, 'Your veterinarian account is waiting for verification by an administrator. You will be able to receive and review cases once it is verified.'));
  }
  const status = h('select', { 'aria-label': 'Filter' }, option('pending', 'Waiting for review'), option('reviewed', 'Reviewed'), option('all', 'All'));
  const out = h('div');
  async function load() {
    mount(out, skeleton());
    const r = await get('/api/vet/cases?status=' + status.value);
    if (!r.cases.length) { mount(out, empty('No cases here.')); return; }
    mount(out, h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'Animal'), h('th', null, 'Farmer'), h('th', null, 'Tool result'), h('th', null, 'Risk'), h('th', null, 'Status'))),
      h('tbody', null, r.cases.map((c) => h('tr', null, h('td', null, fmtDate(c.created_at)), h('td', null, c.tag + ' (' + tSpecies(c.species) + ')'), h('td', null, c.farmer_name, c.district ? h('div', { class: 'muted' }, c.district) : null),
        h('td', null, h('a', { href: '#/cases/' + c.id }, tLabel(c.label))), h('td', null, sevBadge(c.severity)), h('td', null, c.vet_status === 'pending' ? h('strong', null, 'Waiting') : c.vet_status === 'confirmed' ? 'Confirmed' : 'Corrected to ' + tLabel(c.vet_label)))))))); 
  }
  status.addEventListener('change', () => load().catch((e) => mount(out, h('p', { class: 'note bad' }, e.message))));
  const ob = await get('/api/vet/outbreaks');
  const clusters = ob.outbreaks.filter((o) => o.cluster);
  const root = h('div', { class: 'wrap stack', 'data-title': t('nav_cases') }, h('div', { class: 'pagehead' }, h('h1', null, t('nav_cases')), h('div', { class: 'field' }, status)),
    clusters.length ? h('div', { class: 'note warn' }, h('strong', null, 'District clusters (last 14 days): '), clusters.map((o) => o.district + ' ' + tLabel(o.label) + ' ' + o.animals + ' animals on ' + o.farms + ' farms').join('; ')) : null, out);
  await load();
  return root;
}

export async function caseView({ params }) {
  const { case: c } = await get('/api/vet/cases/' + encodeURIComponent(params.id));
  const label = h('select', null, LABELS.map((l) => option(l, tLabel(l), (c.vet_label || c.result.label) === l)));
  const note = h('textarea', { maxlength: 500, rows: 3 }); note.value = c.vet_note || '';
  const msg = h('p', { role: 'status', class: 'muted' });
  const form = h('form', { class: 'panel stack', onsubmit: async (e) => {
    e.preventDefault();
    try { const r = await post('/api/vet/cases/' + c.id + '/review', { label: label.value, note: note.value }); msg.textContent = r.vet_status === 'confirmed' ? 'Confirmed. The farmer can see this.' : 'Corrected. The farmer can see this.'; toast('Review saved'); }
    catch (err) { msg.textContent = err.message; }
  } }, h('h2', null, 'Your review'), field('Your label for this case', label), field('Note for the farmer', note), h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, t('save')), msg));
  const inp = c.input;
  return h('div', { class: 'wrap stack', 'data-title': 'Case ' + c.id },
    h('p', null, h('a', { href: '#/cases' }, 'Back to cases')),
    h('div', { class: 'pagehead' }, h('div', null, h('p', { class: 'eyebrow' }, fmtDate(c.created_at)), h('h1', null, c.tag + ' · ' + tSpecies(c.species)))),
    h('dl', { class: 'defs' }, h('dt', null, 'Farmer'), h('dd', null, c.farmer_name, c.farmer_phone ? h('span', null, ' · ', h('a', { href: 'tel:' + c.farmer_phone }, c.farmer_phone)) : null),
      h('dt', null, t('district')), h('dd', null, c.district || '-'), h('dt', null, 'Breed, age, sex'), h('dd', null, [c.breed || 'breed not given', c.age_months === null ? 'age not given' : c.age_months + ' months', c.sex].join(', ')),
      h('dt', null, 'Signs reported'), h('dd', null, inp.signs.length ? inp.signs.map(tSign).join(', ') : 'None'),
      h('dt', null, 'Body temperature'), h('dd', null, inp.temp_c === null ? 'Not measured' : inp.temp_c + ' C'),
      h('dt', null, 'Shed'), h('dd', null, inp.conditions ? inp.conditions.temperature_c + ' C, ' + inp.conditions.humidity + '% humidity, THI ' + inp.conditions.thi + (inp.conditions.ammonia_ppm !== null ? ', ammonia ' + inp.conditions.ammonia_ppm + ' ppm' : '') : 'Not given'),
      h('dt', null, 'Video'), h('dd', null, inp.motion ? inp.motion.seconds + ' seconds analysed on device' : 'None'), h('dt', null, 'Farmer note'), h('dd', null, inp.note || '-')),
    alertCard(c.result, { headingLevel: 2 }), form);
}

export async function admin() {
  const [stats, users, audit] = await Promise.all([get('/api/admin/stats'), get('/api/admin/users'), get('/api/admin/audit?limit=60')]);
  const s = stats;
  const usersOut = h('div');
  function drawUsers(list) {
    mount(usersOut, h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Role'), h('th', null, 'Status'), h('th', null, 'Actions'))),
      h('tbody', null, list.map((u) => h('tr', null, h('td', null, u.name), h('td', null, u.email), h('td', null, u.role),
        h('td', null, u.disabled ? 'Disabled' : u.role === 'vet' ? (u.verified ? 'Verified' : 'Unverified') : 'Active'),
        h('td', null, u.id === state.user.id ? h('span', { class: 'muted' }, 'You') : h('div', { class: 'row' },
          u.role === 'vet' ? h('button', { class: 'small', onclick: () => act(u, { verified: !u.verified }) }, u.verified ? 'Unverify' : 'Verify') : null,
          h('button', { class: 'small ' + (u.disabled ? '' : 'danger'), onclick: () => act(u, { disabled: !u.disabled }) }, u.disabled ? 'Enable' : 'Disable'))))))))); 
  }
  async function act(u, body) {
    try { await patch('/api/admin/users/' + u.id, body); const r = await get('/api/admin/users'); drawUsers(r.users); toast('Updated'); } catch (e) { toast(e.message, true); }
  }
  drawUsers(users.users);

  const cn = h('input', { type: 'text', maxlength: 100 });
  const ck = h('select', null, ['hospital', 'clinic', 'ambulance', 'college'].map((k) => option(k, k)));
  const cd = h('input', { type: 'text', maxlength: 60 });
  const cp = h('input', { type: 'tel', maxlength: 30 });
  const cs = h('input', { type: 'text', maxlength: 200 });
  const cf = { name: field('Name', cn), kind: field('Type', ck), district: field(t('district'), cd), phone: field(t('phone'), cp), services: field('Services', cs) };
  const clinicForm = h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); for (const k of Object.keys(cf)) cf[k].setError('');
    try { await post('/api/admin/clinics', { name: cn.value, kind: ck.value, district: cd.value, phone: cp.value, services: cs.value }); cn.value = ''; cp.value = ''; cs.value = ''; toast('Clinic added'); }
    catch (err) { if (err instanceof ApiError && err.field && cf[err.field]) cf[err.field].setError(err.message); else toast(err.message, true); }
  } }, h('h2', null, 'Add a clinic to Nearby help'), h('div', { class: 'grid2' }, cf.name, cf.kind, cf.district, cf.phone), cf.services, h('button', { class: 'primary', type: 'submit' }, t('add')));

  return h('div', { class: 'wrap stack', 'data-title': t('nav_admin') },
    h('div', { class: 'pagehead' }, h('h1', null, t('nav_admin')), h('a', { class: 'btn', href: '/api/admin/labelled.csv', download: 'pashumitra-labelled.csv' }, 'Export labelled data (CSV)')),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'v' }, s.users.farmers), h('div', { class: 'k' }, 'Farmers')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, s.users.vets), h('div', { class: 'k' }, 'Vets (' + s.users.vets_unverified + ' unverified)')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, s.animals), h('div', { class: 'k' }, 'Animals')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, s.scans), h('div', { class: 'k' }, 'Scans')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, s.scans_reviewed), h('div', { class: 'k' }, 'Vet reviewed')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, s.scans_marked_wrong), h('div', { class: 'k' }, 'Marked wrong by farmers'))),
    h('section', { class: 'stack' }, h('h2', null, 'Users'), usersOut),
    clinicForm,
    h('section', { class: 'stack' }, h('h2', null, 'Security log'), h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'User'), h('th', null, 'Action'), h('th', null, 'Detail'), h('th', null, 'Network address'))),
      h('tbody', null, audit.entries.map((a) => h('tr', null, h('td', null, fmtDate(a.created_at)), h('td', { class: 'num' }, a.user_id === null ? '-' : a.user_id), h('td', null, a.action), h('td', null, a.detail), h('td', { class: 'num' }, a.ip))))))));
}
