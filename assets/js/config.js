// assets/js/config.js

// ================== GAS Base (បញ្ចប់ដោយ /exec) ==================
export const GAS_BASE =
  'https://script.google.com/macros/s/AKfycbyRdisnEaiOGjzh7EIqjY1Juhory07KJG_8PQ-rYFT5lvfy_ItGQ_pnIuUvjn82ahoZVg/exec';

import { getAuth } from './app.auth.js';

// ជៀស Error បើ URL invalid ឬ មិនមាន window.location (តេស្ត)
const SAME_ORIGIN = (() => {
  try { return new URL(GAS_BASE).origin === window.location.origin; }
  catch { return false; }
})();

// ---- append api=1 + token ទៅ params ----
function withToken(params = {}) {
  const p = { ...params };
  if (!('api' in p)) p.api = '1';
  const tok = getAuth?.()?.token;
  if (tok && !('token' in p)) p.token = tok;
  return p;
}

// ---- បង្កើត URL សម្រាប់ fetch ----
function buildUrl(params = {}) {
  const u = new URL(GAS_BASE);
  const p = withToken(params);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// ================== JSONP helper (ចៀស CORS) ==================
function jsonp(params = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cb = '__jp' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    const u = new URL(GAS_BASE);
    const p = withToken({ ...params, callback: cb });
    Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, String(v)));

    const s = document.createElement('script');
    let done = false;
    const cleanup = () => {
      try { delete window[cb]; } catch {}
      if (s && s.parentNode) s.parentNode.removeChild(s);
    };
    const tmr = setTimeout(() => {
      if (!done) { cleanup(); reject(new Error('JSONP timeout')); }
    }, timeoutMs);

    window[cb] = (data) => { done = true; clearTimeout(tmr); cleanup(); resolve(data); };
    s.onerror = (e) => { clearTimeout(tmr); cleanup(); reject(new Error('JSONP failed')); };
    s.onload  = () => { /* បើ server មិនហៅ callback នឹង timeout */ };

    s.src = u.toString();
    document.head.appendChild(s);

    // debug ប្រសិនបើចង់ពិនិត្យ
    // console.debug('[JSONP] →', s.src);
  });
}

// ================== HTTP adapters ==================
async function httpGet(params) {
  if (SAME_ORIGIN) {
    const r = await fetch(buildUrl(params), { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json().catch(() => ({}));
    if (j && j.ok === false) throw new Error(j.error || 'API error');
    return j;
  }
  const j = await jsonp(params);
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}

async function httpPost(params, body) {
  // Same-origin: POST ដើរតួធម្មតា
  if (SAME_ORIGIN) {
    const r = await fetch(buildUrl(params), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // ជៀស preflight
      body: JSON.stringify(body || {})
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json().catch(() => ({}));
    if (j && j.ok === false) throw new Error(j.error || 'API error');
    return j;
  }
  // Cross-origin: ប្រើ JSONP (បម្លែង POST → GET params)
  const j = await jsonp({ ...params, ...(body || {}) });
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}

// ================== Public API ==================
export async function gasGet(params)  { return httpGet(params); }
export async function gasPost(params, body) { return httpPost(params, body); }

// List rows → always Array
export async function apiList(table, extraParams = {}) {
  const res = await httpGet({ route: table, op: 'list', ...extraParams });
  return Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
}

// Upsert one row
export async function apiUpsert(table, row) {
  return httpPost({ route: table, op: 'upsert' }, row);
}

// Delete by id
export async function apiDelete(table, idField, idValue) {
  return httpPost({ route: table, op: 'delete' }, { [idField]: idValue });
}

// Login → { token, role, exp, ... }
export async function apiLogin(username, password) {
  return httpPost({ route: 'auth', op: 'login' }, { username, password });
}

// Aliases ស្រួលហៅក្នុងគម្រោង
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
