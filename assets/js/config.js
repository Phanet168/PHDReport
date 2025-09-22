// === Base URL of your deployed Apps Script Web App (must end with /exec) ===
// 👉 ប្តូរ URL ខាងក្រោមជាមួយ URL ពិត
export const GAS_BASE = 'https://script.google.com/macros/s/AKfycbwQXnt94_gGbJd3iZXk8hb-3xbA6oGwXuEcx4xqzu7GBYK9yVTfT_hZOSTBmvz8E_l-tg/exec';

// Helper បង្កើត URL
function makeUrl(params = {}) {
  const u = new URL(GAS_BASE); // ❌ កុំប្រើ location.origin
  if (!u.searchParams.has('api')) u.searchParams.set('api', '1');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      u.searchParams.set(k, v);
    }
  }
  return u.toString();
}

// Base GET
export async function gasGet(params) {
  const r = await fetch(makeUrl(params), { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}

// Base POST
export async function gasPost(params, body) {
  const r = await fetch(makeUrl(params), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}

// === High-level API wrappers ===

// List rows in a table → {rows:[...]}
export async function apiList(table, extraParams = {}) {
  const res = await gasGet({ route: table, op: 'list', ...extraParams });
  return res.rows || [];
}

// Insert/update one row
export async function apiUpsert(table, row, token) {
  const body = token ? { ...row, token } : row;
  return gasPost({ route: table, op: 'upsert' }, body);
}

// Delete by id
export async function apiDelete(table, idField, idValue, token) {
  const body = token ? { [idField]: idValue, token } : { [idField]: idValue };
  return gasPost({ route: table, op: 'delete' }, body);
}

// Login → { token, role, exp, ... }
export async function apiLogin(username, password) {
  return gasPost({ route: 'auth', op: 'login' }, { username, password });
}
