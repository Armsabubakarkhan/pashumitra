import { h, mount, field } from '../ui.js';
import { post, patch, del, ApiError, state } from '../api.js';
import { t, LANGS, getLang, setLang } from '../i18n.js';
import { setSession, signOut, takeNext, go } from '../app.js';

function applyErrors(fields, e) {
  let shown = false;
  if (e instanceof ApiError && e.field && fields[e.field]) { fields[e.field].setError(e.message); fields[e.field].querySelector('input,select,textarea').focus(); shown = true; }
  return shown;
}

export async function signin() {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, maxlength: 254 });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true, maxlength: 200 });
  const f = { email: field(t('email'), email), password: field(t('password'), pw) };
  const msg = h('p', { class: 'note bad', role: 'alert' }); msg.hidden = true;
  const btn = h('button', { class: 'primary', type: 'submit' }, t('signin'));
  const form = h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.hidden = true; btn.disabled = true;
    try {
      const r = await post('/api/auth/login', { email: email.value, password: pw.value });
      await setSession(r.user, r.csrf);
      const next = takeNext();
      go(next && next !== '/signin' ? next : '/');
    } catch (err) { msg.textContent = err.message; msg.hidden = false; }
    finally { btn.disabled = false; }
  } }, f.email, f.password, msg, btn,
  h('p', { class: 'muted' }, 'New here? ', h('a', { href: '#/signup' }, t('signup'))));
  return h('div', { class: 'narrow', 'data-title': t('signin') }, h('h1', null, t('signin')), form);
}

export async function signup() {
  const name = h('input', { type: 'text', autocomplete: 'name', required: true, maxlength: 80 });
  const email = h('input', { type: 'email', autocomplete: 'email', required: true, maxlength: 254 });
  const pw = h('input', { type: 'password', autocomplete: 'new-password', required: true, maxlength: 128 });
  const role = h('select', null, h('option', { value: 'farmer' }, 'Farmer or animal keeper'), h('option', { value: 'vet' }, 'Veterinarian (needs verification)'));
  const district = h('input', { type: 'text', maxlength: 60, autocomplete: 'address-level2' });
  const phone = h('input', { type: 'tel', maxlength: 30, autocomplete: 'tel' });
  const clinic = h('input', { type: 'text', maxlength: 100 });
  const lang = h('select', null, LANGS.map((l) => h('option', { value: l.code, selected: l.code === getLang() }, l.name)));
  const consent = h('input', { type: 'checkbox' });
  const f = {
    name: field(t('name'), name), email: field(t('email'), email), password: field(t('password'), pw, { hint: '(10 or more characters, with letters and a number)' }),
    role: field('I am a', role), district: field(t('district'), district), phone: field(t('phone'), phone, { hint: '(required for veterinarians)' }),
    clinic: field('Clinic or hospital', clinic, { hint: '(veterinarians)' }), language: field(t('language'), lang), consent: h('div', { class: 'field' })
  };
  const consentErr = h('div', { class: 'err', role: 'alert' }); consentErr.hidden = true;
  f.consent.setError = (m) => { consentErr.textContent = m; consentErr.hidden = !m; };
  f.consent.append(h('label', { class: 'check' }, consent, h('span', null, 'I have read and accept the ', h('a', { href: '#/terms', target: '_blank', rel: 'noopener' }, 'Terms of Service'), ' and the ', h('a', { href: '#/privacy', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), '.')), consentErr);
  f.consent.querySelector = f.consent.querySelector.bind(f.consent);
  const vetOnly = [f.clinic];
  const syncRole = () => { for (const x of vetOnly) x.hidden = role.value !== 'vet'; };
  role.addEventListener('change', syncRole); syncRole();
  const msg = h('p', { class: 'note bad', role: 'alert' }); msg.hidden = true;
  const btn = h('button', { class: 'primary', type: 'submit' }, t('signup'));
  const form = h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.hidden = true; for (const k of Object.keys(f)) if (f[k].setError) f[k].setError('');
    btn.disabled = true;
    try {
      const r = await post('/api/auth/register', { name: name.value, email: email.value, password: pw.value, role: role.value, district: district.value, phone: phone.value, clinic: clinic.value, language: lang.value, consent: consent.checked });
      setLang(lang.value);
      await setSession(r.user, r.csrf);
      go('/');
    } catch (err) {
      if (err instanceof ApiError && err.field === 'consent') { consentErr.textContent = err.message; consentErr.hidden = false; }
      else if (!applyErrors(f, err)) { msg.textContent = err.message; msg.hidden = false; }
    } finally { btn.disabled = false; }
  } }, f.name, f.email, f.password, f.role, f.district, f.phone, f.clinic, f.language, f.consent, msg, btn,
  h('p', { class: 'muted' }, 'Already registered? ', h('a', { href: '#/signin' }, t('signin'))));
  return h('div', { class: 'narrow', 'data-title': t('signup') }, h('h1', null, t('signup')), form);
}

export async function account() {
  const u = state.user;
  const name = h('input', { type: 'text', value: u.name, maxlength: 80 });
  const district = h('input', { type: 'text', value: u.district, maxlength: 60 });
  const phone = h('input', { type: 'tel', value: u.phone, maxlength: 30 });
  const clinic = h('input', { type: 'text', value: u.clinic, maxlength: 100 });
  const lang = h('select', null, LANGS.map((l) => h('option', { value: l.code, selected: l.code === u.language }, l.name)));
  const f = { name: field(t('name'), name), district: field(t('district'), district), phone: field(t('phone'), phone), clinic: field('Clinic or hospital', clinic), language: field(t('language'), lang) };
  const msg = h('p', { role: 'status', class: 'muted' });
  const profile = h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = '';
    for (const k of Object.keys(f)) f[k].setError('');
    try {
      const r = await patch('/api/account', { name: name.value, district: district.value, phone: phone.value, clinic: clinic.value, language: lang.value });
      state.user = r.user; setLang(r.user.language);
      try { localStorage.setItem('pm_lang', r.user.language); } catch { /* ignore */ }
      document.documentElement.lang = r.user.language;
      msg.textContent = 'Saved'; go('/account');
    } catch (err) { if (!applyErrors(f, err)) msg.textContent = err.message; }
  } }, h('h2', null, 'Your details'), h('p', { class: 'muted' }, u.email + ' · ' + u.role + (u.role === 'vet' ? (u.verified ? ' · verified' : ' · waiting for verification') : '')),
  f.name, f.district, f.phone, u.role === 'vet' ? f.clinic : null, f.language, h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, t('save')), msg));

  const cur = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 200 });
  const nxt = h('input', { type: 'password', autocomplete: 'new-password', maxlength: 128 });
  const pf = { current: field('Current password', cur), password: field('New password', nxt) };
  const pmsg = h('p', { role: 'status', class: 'muted' });
  const pwForm = h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); pmsg.textContent = ''; pf.current.setError(''); pf.password.setError('');
    try { await post('/api/auth/password', { current: cur.value, next: nxt.value }); cur.value = ''; nxt.value = ''; pmsg.textContent = 'Password changed. Other devices were signed out.'; }
    catch (err) { if (!applyErrors(pf, err)) pmsg.textContent = err.message; }
  } }, h('h2', null, 'Change password'), pf.current, pf.password, h('div', { class: 'row' }, h('button', { type: 'submit' }, 'Change password'), pmsg));

  const dp = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 200 });
  const df = field('Password to confirm', dp);
  const delForm = u.role === 'admin' ? null : h('form', { class: 'panel stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); df.setError('');
    if (!confirm('Delete your account and all your animals, scans and reminders? This cannot be undone.')) return;
    try { await del('/api/account', { password: dp.value }); state.user = null; state.csrf = null; go('/'); }
    catch (err) { df.setError(err.message); }
  } }, h('h2', null, 'Delete my account'), h('p', null, 'This removes your account and all your records permanently.'), df, h('button', { class: 'danger', type: 'submit' }, 'Delete my account'));

  return h('div', { class: 'narrow stack', 'data-title': t('nav_account') },
    h('div', { class: 'pagehead' }, h('h1', null, t('nav_account')), h('button', { onclick: signOut }, t('signout'))), profile, pwForm, delForm);
}
