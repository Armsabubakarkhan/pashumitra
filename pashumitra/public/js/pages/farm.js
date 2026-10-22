import { h, mount, field, fmtDate, fmtDay, skeleton, toast, option } from '../ui.js';
import { get, post, patch, del, ApiError, state } from '../api.js';
import { t, tLabel, tSpecies, tBand, tAmmonia } from '../i18n.js';
import { sevBadge, meter, empty, alertCard } from '../components.js';
import { go } from '../app.js';
import { computeTHI } from '../analysis.js';

const SPECIES = ['cattle', 'buffalo', 'sheep', 'goat', 'poultry'];

function conditionsForm(onSaved) {
  const temp = h('input', { type: 'number', step: '0.1', min: -10, max: 60, inputmode: 'decimal' });
  const hum = h('input', { type: 'number', step: '1', min: 0, max: 100, inputmode: 'numeric' });
  const amm = h('input', { type: 'number', step: '1', min: 0, max: 500, inputmode: 'numeric' });
  const city = h('input', { type: 'text', maxlength: 80, placeholder: 'Nearest town' });
  const f = { temperature_c: field(t('temperature'), temp), humidity: field(t('humidity'), hum), ammonia_ppm: field(t('ammonia'), amm, { hint: '(optional)' }) };
  const live = h('output', { class: 'num muted', 'aria-live': 'polite' });
  const upd = () => { const a = parseFloat(temp.value), b = parseFloat(hum.value); live.textContent = isFinite(a) && isFinite(b) ? 'THI ' + computeTHI(a, b) : ''; };
  temp.addEventListener('input', upd); hum.addEventListener('input', upd);
  const wmsg = h('p', { class: 'muted', role: 'status' });
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); for (const k of Object.keys(f)) f[k].setError('');
    try {
      await post('/api/conditions', { temperature_c: temp.value, humidity: hum.value, ammonia_ppm: amm.value });
      toast('Saved'); onSaved && onSaved();
    } catch (err) { if (err instanceof ApiError && err.field && f[err.field]) f[err.field].setError(err.message); else toast(err.message, true); }
  } },
  h('div', { class: 'grid2' }, f.temperature_c, f.humidity_c || f.humidity), f.ammonia_ppm, live,
  h('div', { class: 'field' }, h('label', null, 'Fill from live weather'), h('div', { class: 'row' }, city,
    h('button', { type: 'button', onclick: async () => {
      wmsg.textContent = '...';
      try { const r = await get('/api/weather?city=' + encodeURIComponent(city.value)); temp.value = r.weather.temperature_c; hum.value = r.weather.humidity; upd(); wmsg.textContent = 'Outdoor reading for ' + r.weather.place + '. Shed air can differ, so adjust if needed.'; }
      catch (err) { wmsg.textContent = err.message; }
    } }, 'Get weather')), wmsg),
  h('button', { class: 'primary', type: 'submit' }, t('save')));
  return form;
}

export async function dashboard() {
  const d = await get('/api/dashboard');
  const tot = d.totals;
  const c = d.conditions;
  const root = h('div', { class: 'wrap stack', 'data-title': t('nav_farm') },
    h('div', { class: 'pagehead' }, h('h1', null, t('nav_farm')), h('a', { class: 'btn primary', href: '#/scan' }, t('new_scan'))));

  if (tot.animals === 0) {
    root.append(h('div', { class: 'panel' }, h('h2', null, 'Start by adding an animal'), h('p', null, 'Add each animal you want to track. Then run a scan to get its first health result.'), h('a', { class: 'btn primary', href: '#/animals' }, t('nav_animals'))));
  } else {
    root.append(h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'v' }, d.farm_health_score === null ? '-' : d.farm_health_score), h('div', { class: 'k' }, t('farm_health') + ' (0 to 100)')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, tot.healthy), h('div', { class: 'k' }, t('healthy'))),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, tot.at_risk), h('div', { class: 'k' }, t('at_risk'))),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, tot.critical), h('div', { class: 'k' }, t('critical'))),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, tot.unscanned), h('div', { class: 'k' }, t('not_scanned')))));
  }

  const attn = h('div', { class: 'panel' }, h('h2', null, t('needs_attention')));
  if (d.attention.length === 0) attn.append(h('p', { class: 'muted' }, tot.animals ? 'No animal needs attention in the latest scans.' : 'Nothing yet.'));
  else attn.append(h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Animal'), h('th', null, 'Result'), h('th', null, 'Risk'), h('th', null, 'When'))),
    h('tbody', null, d.attention.map((a) => h('tr', null,
      h('td', null, h('a', { href: '#/animals/' + a.animal_id }, a.tag), ' ', h('span', { class: 'muted' }, tSpecies(a.species))),
      h('td', null, h('a', { href: '#/scans/' + a.scan_id }, tLabel(a.label))), h('td', null, sevBadge(a.severity)), h('td', { class: 'muted' }, fmtDate(a.created_at))))))));

  const condBox = h('div', { class: 'panel' }, h('h2', null, t('farm_conditions')));
  const showCond = (cond) => {
    if (!cond) return h('p', { class: 'muted' }, 'No readings yet.');
    return h('div', null, h('p', { class: 'num' }, cond.temperature_c + ' C, ' + cond.humidity + '% humidity, THI ' + cond.thi), h('p', null, 'Heat stress: ', h('strong', null, tBand(cond.thi_band))),
      cond.ammonia_ppm !== null ? h('p', null, 'Ammonia ' + cond.ammonia_ppm + ' ppm: ', h('strong', null, tAmmonia(cond.ammonia_band))) : null,
      h('p', { class: 'muted' }, 'Updated ' + fmtDate(cond.created_at)));
  };
  const condView = h('div', null, showCond(c));
  condBox.append(condView, h('details', null, h('summary', null, 'Add a reading'), conditionsForm(() => go('/farm'))));

  const side = h('div', { class: 'grid2' }, condBox);
  const info = h('div', { class: 'panel' }, h('h2', null, 'Reminders'));
  info.append(h('p', null, d.vaccinations.overdue ? h('strong', null, d.vaccinations.overdue + ' vaccination(s) overdue') : 'No overdue vaccinations.'), h('p', { class: 'muted' }, d.vaccinations.due_soon + ' due in the next 14 days.'), h('a', { href: '#/vaccines' }, t('nav_vaccines')));
  side.append(info);
  root.append(attn, side);

  const ob = d.outbreaks.filter((o) => o.cluster);
  if (d.district) {
    root.append(h('div', { class: ob.length ? 'note warn' : 'panel flat' }, h('h2', null, 'District watch: ' + d.district),
      d.outbreaks.length === 0 ? h('p', { class: 'muted' }, 'No suspected FMD, LSD or Newcastle cases reported in your district in the last 14 days.') :
        h('ul', { class: 'plain' }, d.outbreaks.map((o) => h('li', null, tLabel(o.label) + ': ' + o.animals + ' animal(s) on ' + o.farms + ' farm(s)' + (o.cluster ? '. Several farms are affected. Isolate new animals and call your vet.' : '.')))),
      h('p', { class: 'muted' }, 'Counts are anonymous and come from scans in the last 14 days.')));
  } else {
    root.append(h('p', { class: 'note' }, 'Add your district in ', h('a', { href: '#/account' }, t('nav_account')), ' to see disease alerts for your area.'));
  }
  return root;
}

export async function animals() {
  const list = h('div');
  const tag = h('input', { type: 'text', maxlength: 30, required: true });
  const species = h('select', null, SPECIES.map((s) => option(s, tSpecies(s))));
  const breed = h('input', { type: 'text', maxlength: 60 });
  const age = h('input', { type: 'number', min: 0, max: 600, step: '1', inputmode: 'numeric' });
  const sex = h('select', null, option('unknown', 'Unknown'), option('female', 'Female'), option('male', 'Male'));
  const notes = h('textarea', { maxlength: 300, rows: 2 });
  const f = { tag: field('Tag or name', tag), species: field(t('species'), species), breed: field('Breed', breed), age_months: field('Age in months', age), sex: field('Sex', sex), notes: field('Notes', notes) };
  async function load() {
    mount(list, skeleton());
    const r = await get('/api/animals');
    if (!r.animals.length) { mount(list, empty('No animals yet. Add your first one below.')); return; }
    mount(list, h('div', { class: 'tablewrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Tag'), h('th', null, t('species')), h('th', null, 'Last scan'), h('th', null, ''))),
      h('tbody', null, r.animals.map((a) => h('tr', null,
        h('td', null, h('a', { href: '#/animals/' + a.id }, a.tag)), h('td', null, tSpecies(a.species)),
        h('td', null, a.last_scan ? h('span', null, sevBadge(a.last_scan.severity), ' ', h('span', { class: 'muted' }, fmtDay(a.last_scan.created_at.slice(0, 10)))) : h('span', { class: 'muted' }, t('not_scanned'))),
        h('td', null, h('a', { class: 'btn small', href: '#/scan?animal=' + a.id }, t('nav_scan'))))))))); 
  }
  const form = h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); for (const k of Object.keys(f)) f[k].setError('');
    try { await post('/api/animals', { tag: tag.value, species: species.value, breed: breed.value, age_months: age.value, sex: sex.value, notes: notes.value }); tag.value = ''; breed.value = ''; age.value = ''; notes.value = ''; toast('Animal added'); await load(); }
    catch (err) { if (err instanceof ApiError && err.field && f[err.field]) f[err.field].setError(err.message); else toast(err.message, true); }
  } }, h('h2', null, t('add') + ' ' + t('nav_animals').toLowerCase()), h('div', { class: 'grid2' }, f.tag, f.species), h('div', { class: 'grid2' }, f.breed, f.age_months), f.sex, f.notes, h('button', { class: 'primary', type: 'submit' }, t('add')));
  const root = h('div', { class: 'wrap stack', 'data-title': t('nav_animals') }, h('div', { class: 'pagehead' }, h('h1', null, t('nav_animals'))), list, form);
  await load();
  return root;
}

export async function animalCard({ params }) {
  const r = await get('/api/animals/' + encodeURIComponent(params.id) + '/card');
  const a = r.animal;
  const trendText = { improving: 'Improving compared with the previous scan', worsening: 'Getting worse compared with the previous scan', unchanged: 'About the same as the previous scan', none: 'Run at least two scans to see a trend' }[r.trend];
  const root = h('div', { class: 'wrap stack', 'data-title': a.tag },
    h('div', { class: 'pagehead' }, h('div', null, h('p', { class: 'eyebrow' }, 'Health card'), h('h1', null, a.tag)),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/scan?animal=' + a.id }, t('new_scan')),
        h('button', { class: 'danger', onclick: async () => { if (!confirm('Delete ' + a.tag + ' and all its scans?')) return; try { await del('/api/animals/' + a.id); toast('Deleted'); go('/animals'); } catch (e) { toast(e.message, true); } } }, 'Delete'))),
    h('dl', { class: 'defs' }, h('dt', null, t('species')), h('dd', null, tSpecies(a.species)), h('dt', null, 'Breed'), h('dd', null, a.breed || '-'),
      h('dt', null, 'Age'), h('dd', null, a.age_months === null ? '-' : a.age_months + ' months'), h('dt', null, 'Sex'), h('dd', null, a.sex), h('dt', null, 'Notes'), h('dd', null, a.notes || '-'),
      h('dt', null, 'Trend'), h('dd', null, trendText)));
  const hist = h('div', { class: 'panel' }, h('h2', null, 'Scan history'));
  if (!r.scans.length) hist.append(h('p', { class: 'muted' }, 'No scans yet.'));
  else hist.append(h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'Result'), h('th', null, 'Risk'), h('th', null, 'Score'), h('th', null, 'Vet'))),
    h('tbody', null, r.scans.map((s) => h('tr', null, h('td', null, fmtDate(s.created_at)), h('td', null, h('a', { href: '#/scans/' + s.id }, tLabel(s.label))), h('td', null, sevBadge(s.severity)), h('td', { class: 'num' }, s.score),
      h('td', null, s.vet_status === 'none' ? '-' : s.vet_status === 'pending' ? 'Waiting' : s.vet_status === 'confirmed' ? 'Confirmed' : 'Corrected to ' + tLabel(s.vet_label)))))))); 
  const vac = h('div', { class: 'panel' }, h('h2', null, 'Vaccinations'));
  if (!r.vaccines.length) vac.append(h('p', { class: 'muted' }, 'None recorded. Add them on the ', h('a', { href: '#/vaccines' }, t('nav_vaccines')), ' page.'));
  else vac.append(h('ul', { class: 'plain' }, r.vaccines.map((v) => h('li', null, v.vaccine + ' · ' + fmtDay(v.due_date) + (v.done ? ' · done' : '')))));
  root.append(hist, vac);
  return root;
}

export async function vaccines() {
  const [vr, ar] = await Promise.all([get('/api/vaccinations'), get('/api/animals')]);
  const today = new Date().toISOString().slice(0, 10);
  const list = h('div');
  function draw(items) {
    if (!items.length) { mount(list, empty('No reminders yet.')); return; }
    mount(list, h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Animal'), h('th', null, 'Vaccine'), h('th', null, 'Due'), h('th', null, 'Status'), h('th', null, ''))),
      h('tbody', null, items.map((v) => h('tr', null,
        h('td', null, v.tag), h('td', null, v.vaccine), h('td', null, fmtDay(v.due_date)),
        h('td', null, v.done ? 'Done' : v.due_date < today ? h('strong', null, 'Overdue') : 'Upcoming'),
        h('td', null, h('div', { class: 'row' },
          h('button', { class: 'small', onclick: async () => { try { await patch('/api/vaccinations/' + v.id, { done: !v.done }); v.done = v.done ? 0 : 1; draw(items); } catch (e) { toast(e.message, true); } } }, v.done ? 'Undo' : 'Mark done'),
          h('button', { class: 'small danger', onclick: async () => { try { await del('/api/vaccinations/' + v.id); const i = items.indexOf(v); items.splice(i, 1); draw(items); } catch (e) { toast(e.message, true); } } }, 'Remove'))))))))); 
  }
  const items = vr.vaccinations;
  draw(items);
  const sel = h('select', null, ar.animals.map((a) => option(a.id, a.tag + ' (' + tSpecies(a.species) + ')')));
  const vac = h('input', { type: 'text', maxlength: 60, placeholder: 'For example FMD, HS, Brucellosis' });
  const due = h('input', { type: 'date', min: '2000-01-01', max: '2100-12-31' });
  const f = { animal_id: field(t('nav_animals'), sel), vaccine: field('Vaccine', vac), due_date: field('Due date', due) };
  const form = h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); for (const k of Object.keys(f)) f[k].setError('');
    try { const r = await post('/api/vaccinations', { animal_id: Number(sel.value), vaccine: vac.value, due_date: due.value }); items.push(r.vaccination); items.sort((x, y) => x.done - y.done || x.due_date.localeCompare(y.due_date)); draw(items); vac.value = ''; toast('Reminder added'); }
    catch (err) { if (err instanceof ApiError && err.field && f[err.field]) f[err.field].setError(err.message); else toast(err.message, true); }
  } }, h('h2', null, 'Add a reminder'), ar.animals.length ? h('div', { class: 'grid2' }, f.animal_id, f.vaccine, f.due_date) : h('p', null, 'Add an animal first.'), ar.animals.length ? h('button', { class: 'primary', type: 'submit' }, t('add')) : null);
  return h('div', { class: 'wrap stack', 'data-title': t('nav_vaccines') }, h('div', { class: 'pagehead' }, h('h1', null, t('nav_vaccines'))), h('p', { class: 'muted' }, 'Use the schedule your local veterinarian recommends. This list only reminds you.'), list, form);
}
