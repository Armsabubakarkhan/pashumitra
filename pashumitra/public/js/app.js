import { h, mount, clear, skeleton, toast } from './ui.js';
import { state, get, post, ApiError } from './api.js';
import { t, setLang, getLang, LANGS } from './i18n.js';

import * as landing from './pages/landing.js';
import * as auth from './pages/auth.js';
import * as farm from './pages/farm.js';
import * as scan from './pages/scan.js';
import * as help from './pages/help.js';
import * as staff from './pages/staff.js';
import * as legal from './pages/legal.js';

const ROUTES = [
  { path: '/', page: landing.home },
  { path: '/signin', page: auth.signin },
  { path: '/signup', page: auth.signup },
  { path: '/terms', page: legal.terms },
  { path: '/privacy', page: legal.privacy },
  { path: '/library', page: help.library },
  { path: '/library/:id', page: help.libraryItem },
  { path: '/farm', page: farm.dashboard, roles: ['farmer'] },
  { path: '/animals', page: farm.animals, roles: ['farmer'] },
  { path: '/animals/:id', page: farm.animalCard, roles: ['farmer'] },
  { path: '/scan', page: scan.scanPage, roles: ['farmer'] },
  { path: '/scans/:id', page: scan.scanView, roles: ['farmer'] },
  { path: '/vaccines', page: farm.vaccines, roles: ['farmer'] },
  { path: '/ask', page: help.ask, roles: ['farmer', 'vet', 'admin'] },
  { path: '/help', page: help.nearby, roles: ['farmer', 'vet', 'admin'] },
  { path: '/account', page: auth.account, roles: ['farmer', 'vet', 'admin'] },
  { path: '/cases', page: staff.cases, roles: ['vet'] },
  { path: '/cases/:id', page: staff.caseView, roles: ['vet'] },
  { path: '/admin', page: staff.admin, roles: ['admin'] }
];

const shell = document.getElementById('shell');
let main;
let navHost;
let renderToken = 0;

function matchRoute(path) {
  for (const r of ROUTES) {
    const names = [];
    const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
    const m = re.exec(path);
    if (m) {
      const params = {};
      names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

export function go(path) { if (location.hash === '#' + path) render(); else location.hash = '#' + path; }

function homeFor(user) {
  if (!user) return '/';
  return user.role === 'vet' ? '/cases' : user.role === 'admin' ? '/admin' : '/farm';
}

function buildNav() {
  const u = state.user;
  const cur = (location.hash.slice(1) || '/').split('?')[0];
  const link = (href, label) => h('a', { href: '#' + href, 'aria-current': cur === href || (href !== '/' && cur.startsWith(href + '/')) ? 'page' : null }, label);
  const items = [];
  if (!u) {
    items.push(link('/library', t('nav_library')), link('/terms', 'Terms'), link('/signin', t('signin')));
  } else if (u.role === 'farmer') {
    items.push(link('/farm', t('nav_farm')), link('/animals', t('nav_animals')), link('/scan', t('nav_scan')), link('/ask', t('nav_ask')),
      link('/help', t('nav_help')), link('/vaccines', t('nav_vaccines')), link('/library', t('nav_library')));
  } else if (u.role === 'vet') {
    items.push(link('/cases', t('nav_cases')), link('/ask', t('nav_ask')), link('/help', t('nav_help')), link('/library', t('nav_library')));
  } else {
    items.push(link('/admin', t('nav_admin')), link('/help', t('nav_help')), link('/library', t('nav_library')));
  }
  if (u) items.push(link('/account', t('nav_account')));
  const sel = h('select', { class: 'langsel', 'aria-label': t('language'), onchange: async (e) => {
    setLang(e.target.value);
    try { localStorage.setItem('pm_lang', e.target.value); } catch { /* storage blocked */ }
    if (state.user) { try { await api_patchLang(e.target.value); } catch { /* keep local choice */ } }
    document.documentElement.lang = e.target.value;
    render();
  } }, LANGS.map((l) => h('option', { value: l.code, selected: l.code === getLang() }, l.name)));
  mount(navHost, ...items, sel);
}

async function api_patchLang(code) {
  const { patch } = await import('./api.js');
  const r = await patch('/api/account', { language: code });
  state.user = r.user;
}

function buildShell() {
  navHost = h('nav', { class: 'nav', 'aria-label': 'Main' });
  main = h('main', { id: 'app', tabindex: '-1' });
  mount(shell,
    h('header', { class: 'bar' }, h('div', { class: 'wrap bar-in' },
      h('a', { class: 'brand', href: '#/' }, 'Pashu', h('b', null, 'Mitra'), ' AI'), navHost)),
    main,
    h('footer', { class: 'foot' }, h('div', { class: 'wrap' },
      h('nav', { 'aria-label': 'Legal' }, h('a', { href: '#/terms' }, 'Terms of Service'), h('a', { href: '#/privacy' }, 'Privacy Policy'), h('a', { href: '#/library' }, t('nav_library'))),
      h('p', null, 'PashuMitra AI gives a risk screening and first-aid guidance. It does not diagnose disease and does not replace a veterinarian. In an emergency call a vet first.'),
      h('p', null, 'Movement and sound are analysed on your device. Raw video and audio are never uploaded.'))));
}

export async function render() {
  const token = ++renderToken;
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const found = matchRoute(path);
  buildNav();
  if (!found) { mount(main, h('div', { class: 'narrow' }, h('h1', null, 'Page not found'), h('p', null, 'That page does not exist.'), h('a', { class: 'btn', href: '#' + homeFor(state.user) }, 'Go home'))); return; }
  const { route, params } = found;
  if (route.roles) {
    if (!state.user) { sessionStorageSet('pm_next', raw); go('/signin'); return; }
    if (!route.roles.includes(state.user.role)) { go(homeFor(state.user)); return; }
  }
  if ((path === '/signin' || path === '/signup') && state.user) { go(homeFor(state.user)); return; }
  if (path === '/' && state.user) { go(homeFor(state.user)); return; }
  mount(main, h('div', { class: 'wrap' }, skeleton()));
  try {
    const node = await route.page({ params, query, go, rerender: render });
    if (token !== renderToken) return;
    mount(main, node);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    document.title = (node.dataset && node.dataset.title ? node.dataset.title + ' | ' : '') + 'PashuMitra AI';
  } catch (e) {
    if (token !== renderToken) return;
    if (e instanceof ApiError && e.status === 401) { state.user = null; go('/signin'); return; }
    mount(main, h('div', { class: 'narrow' }, h('h1', null, 'Something went wrong'), h('p', { class: 'note bad', role: 'alert' }, e instanceof ApiError ? e.message : 'The page could not be shown.'),
      h('button', { onclick: render }, 'Try again')));
    if (!(e instanceof ApiError)) console.error(e);
  }
}

function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
export function takeNext() { try { const v = sessionStorage.getItem('pm_next'); sessionStorage.removeItem('pm_next'); return v; } catch { return null; } }

export async function setSession(user, csrf) {
  state.user = user; state.csrf = csrf;
  if (user) { setLang(user.language); try { localStorage.setItem('pm_lang', user.language); } catch { /* ignore */ } document.documentElement.lang = user.language; }
}

export async function signOut() {
  try { await post('/api/auth/logout'); } catch { /* already signed out */ }
  state.user = null; state.csrf = null;
  go('/');
}

async function boot() {
  let saved = 'en';
  try { saved = localStorage.getItem('pm_lang') || 'en'; } catch { /* ignore */ }
  setLang(saved); document.documentElement.lang = getLang();
  buildShell();
  try {
    const me = await get('/api/auth/me');
    if (me.user) await setSession(me.user, me.csrf);
  } catch { /* shown as signed out */ }
  state.onAuthLost = () => { state.user = null; state.csrf = null; toast('Your session ended. Please sign in again', true); go('/signin'); };
  window.addEventListener('hashchange', render);
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
  await render();
}
boot();
