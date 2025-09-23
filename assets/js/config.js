// === Base URL of your deployed Apps Script Web App (must end with /exec) ===
// 👉 ប្តូរ URL ខាងក្រោមជាមួយ URL ពិតរបស់បង (ចុងបញ្ចប់ជា /exec)
export const GAS_BASE =
  'https://script.google.com/macros/s/AKfycbwQXnt94_gGbJd3iZXk8hb-3xbA6oGwXuEcx4xqzu7GBYK9yVTfT_hZOSTBmvz8E_l-tg/exec';

import { getAuth } from './app.auth.js';   // <<< សំខាន់: ដើម្បីយក token

/* ------------------------------------------------------------------ */
/* Core: build URL + ភ្ជាប់ token ជាស្វ័យប្រវត្តិ                     */
/* ------------------------------------------------------------------ */
function makeUrl(params = {}) {
  // កុំប្រើ location.origin ដើម្បីជៀសបញ្ហា cross-origin
  const u = new URL(GAS_BASE);

  // flag សម្រាប់ API
  if (!u.searchParams.has('api')) u.searchParams.set('api', '1');

  // append params
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  }

  // ✅ append token (បើមាន) ទៅជា query param
  const tok = getAuth()?.token;
  if (tok) u.searchParams.set('token', tok);

  return u.toString();
}

/* ------------------------------------------------------------------ */
/* Low-level fetchers                                                 */
/* ------------------------------------------------------------------ */
export async function gasGet(params) {
  const r = await fetch(makeUrl(params), { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}

export async function gasPost(params, body) {
  const r = await fetch(makeUrl(params), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // ជៀស preflight
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}

/* ------------------------------------------------------------------ */
/* High-level wrappers                                                */
/* ------------------------------------------------------------------ */

// List rows → always return Array
export async function apiList(table, extraParams = {}) {
  const res = await gasGet({ route: table, op: 'list', ...extraParams });
  return Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
}

// Insert/update one row
export async function apiUpsert(table, row) {
  // token បានភ្ជាប់ជា query នៅ makeUrl រួចហើយ -> មិនចាំបាច់ដាក់ក្នុង body ទៀត
  return gasPost({ route: table, op: 'upsert' }, row);
}

// Delete by id
export async function apiDelete(table, idField, idValue) {
  return gasPost({ route: table, op: 'delete' }, { [idField]: idValue });
}

// Login → { token, role, exp, ... }
export async function apiLogin(username, password) {
  return gasPost({ route: 'auth', op: 'login' }, { username, password });
}

/* Optional helpers (ស្រាលស្រួល import) */
export const gasList   = apiList;
export const gasSave   = apiUpsert;
export const gasDelete = apiDelete;

// id-field map ប្រើពេល delete/upsert
export const ID_FIELDS = {
  users: 'user_id',
  departments: 'department_id',
  units: 'unit_id',
  periods: 'period_id',
  indicators: 'indicator_id',
  reports: 'report_id',
  issues: 'issue_id',
  actions: 'action_id',
};
