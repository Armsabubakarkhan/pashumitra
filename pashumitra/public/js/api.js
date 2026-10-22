export const state = { user: null, csrf: null, onAuthLost: null };

export async function api(method, path, body) {
  const headers = {};
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (state.csrf && method !== 'GET') headers['X-CSRF-Token'] = state.csrf;
  let res;
  try { res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' }); }
  catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again'); }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non json */ }
  if (!res.ok) {
    if (res.status === 401 && state.user && state.onAuthLost) state.onAuthLost();
    throw new ApiError(res.status, (data && data.error) || 'Request failed', data && data.field);
  }
  return data;
}
export class ApiError extends Error {
  constructor(status, message, field) { super(message); this.status = status; this.field = field; }
}
export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b === undefined ? {} : b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p, b) => api('DELETE', p, b === undefined ? {} : b);
