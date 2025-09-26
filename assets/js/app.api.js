// assets/js/app.api.js
// ===================== GAS API WRAPPER =====================
import { GAS_BASE } from './config.js';
import { getAuth }   from './app.auth.js';

/* --------------------------------------------------------- */
/* Config / Debug                                            */
/* --------------------------------------------------------- */
const DEFAULT_TIMEOUT_MS = 15000; // 15s

export const ApiDebug = {
  enabled: false,              // turn true if you want noisy logs
  last: null,                  // { url, status, text, json }
};
const log = (...a) => { if (ApiDebug.enabled) console.log('[api]', ...a); };

/* --------------------------------------------------------- */
/* URL helper: compose GAS URL safely                        */
/* - accepts GAS_BASE of ".../exec" OR ".../exec?api=1"      */
/* - adds api=1 if missing                                   */
/* - appends params                                          */
/* - auto-append ?token=... if available                     */
/* --------------------------------------------------------- */
function makeApiUrl(params = {}, { withAuthToken = true } = {}) {
  const u = new URL(GAS_BASE); // do NOT use location.origin
  if (!u.searchParams.has('api')) u.searchParams.set('api', '1');

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      u.searchParams.set(k, v);
    }
  }

  // token in query (server may also accept in body)
  if (withAuthToken) {
    const tok = getAuth?.()?.token;
    if (tok && !u.searchParams.has('token')) u.searchParams.set('token', tok);
  }

  return u.toString();
}

/* --------------------------------------------------------- */
/* Low-level fetchers (timeout)                              */
/* --------------------------------------------------------- */
async function fetchWithTimeout(url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(new Error('Timeout')), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(to);
  }
}

async function getJsonUrl(params = {}, extra = {}) {
  const url = makeApiUrl(params, extra);
  const res = await fetchWithTimeout(url, { cache: 'no-store' });
  const text = await res.text();

  ApiDebug.last = { url, status: res.status, text };

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || '(no body)'}`);

  let json;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error('Invalid JSON: ' + text); }

  ApiDebug.last.json = json;
  if (json && json.ok === false) throw new Error(json.error || 'API error');

  log('GET OK:', url, json);
  return json;
}

async function postJsonUrl(params = {}, bodyObj = {}, extra = {}) {
  const url = makeApiUrl(params, extra);

  // put token in body too (backend may accept either)
  const token = getAuth?.()?.token || '';
  const body  = token && !('token' in bodyObj) ? { ...bodyObj, token } : bodyObj;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoid CORS preflight for GAS
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();

  ApiDebug.last = { url, status: res.status, text };

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${text || '(no body)'}`);

  let json;
  try { json = text ? JSON.parse(text) : {}; }
  catch { throw new Error('Invalid JSON: ' + text); }

  ApiDebug.last.json = json;
  if (json && json.ok === false) throw new Error(json.error || 'API error');

  log('POST OK:', url, json);
  return json;
}

/* --------------------------------------------------------- */
/* Response normalizer                                       */
/*  - Supports: {rows:[...]}, {data:[...]}, or raw arrays     */
/* --------------------------------------------------------- */
function toRows(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp.rows)) return resp.rows;
  if (resp && Array.isArray(resp.data)) return resp.data;
  return [];
}

/* --------------------------------------------------------- */
/* AUTH                                                      */
/* --------------------------------------------------------- */
export async function apiLogin(username, password) {
  return postJsonUrl({ route: 'auth', op: 'login' }, { username, password }, { withAuthToken: false });
}

/* --------------------------------------------------------- */
/* LIST HELPERS (master data + reports)                      */
/*  Notes:
    - departments/units/periods are READ-any (token optional)
    - indicators/reports may be scoped → token required       */
/* --------------------------------------------------------- */
export async function listDepartments(params = {}) {
  const j = await getJsonUrl({ route: 'departments', op: 'list', ...params });
  return toRows(j);
}
export async function listUnits(params = {}) {
  const j = await getJsonUrl({ route: 'units', op: 'list', ...params });
  return toRows(j);
}
export async function listIndicators(params = {}) {
  const j = await getJsonUrl({ route: 'indicators', op: 'list', ...params });
  return toRows(j);
}
export async function listPeriods(params = {}) {
  const j = await getJsonUrl({ route: 'periods', op: 'list', ...params });
  return toRows(j);
}
export async function listReports(params = {}) {
  const j = await getJsonUrl({ route: 'reports', op: 'list', ...params });
  return toRows(j);
}

/* --------------------------------------------------------- */
/* Generic CRUD shortcuts (normalized)                       */
/* --------------------------------------------------------- */
export async function apiList(table, extraParams = {}) {
  const j = await getJsonUrl({ route: table, op: 'list', ...extraParams });
  return toRows(j);
}
export async function apiUpsert(table, row) {
  // returns {row: {...}} or any server format; caller can use .row || the whole response
  return postJsonUrl({ route: table, op: 'upsert' }, row);
}
export async function apiDelete(table, idField, idValue) {
  return postJsonUrl({ route: table, op: 'delete' }, { [idField]: idValue });
}

/* Friendly aliases (backward compat) */
export const gasList   = apiList;
export const gasSave   = apiUpsert;
export const gasDelete = apiDelete;

/* --------------------------------------------------------- */
/* Reports-specific CRUD (examples)                          */
/* --------------------------------------------------------- */
export async function upsertReport(payload = {}) {
  return postJsonUrl({ route: 'reports', op: 'upsert' }, payload);
}
export async function deleteReport(report_id) {
  return postJsonUrl({ route: 'reports', op: 'delete' }, { report_id });
}

/* --------------------------------------------------------- */
/* Analytics                                                 */
/* --------------------------------------------------------- */
export async function summary(year, by = 'indicator_id') {
  const j = await getJsonUrl({ route: 'analytics', op: 'summary', year, by });
  return toRows(j); // -> [{key,value,plan,gap,count}]
}

/* --------------------------------------------------------- */
/* Utilities                                                 */
/* --------------------------------------------------------- */
export function yFromPeriod(pid) {
  const m = /^(\d{4})/.exec(String(pid || ''));
  return m ? m[1] : String(new Date().getFullYear());
}

export function exportCsv(filename, rows) {
  const cols = Object.keys(rows[0] || {});
  const esc  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(',')]
    .concat(rows.map(r => cols.map(c => esc(r[c])).join(',')))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function ping() {
  try {
    const j = await getJsonUrl({ route: 'settings', op: 'get' }, { withAuthToken: false });
    return { ok: true, info: j };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* --------------------------------------------------------- */
/* ID fields map (handy in UI pages)                         */
/* --------------------------------------------------------- */
export const ID_FIELDS = {
  users:        'user_id',
  departments:  'department_id',
  units:        'unit_id',
  periods:      'period_id',
  indicators:   'indicator_id',
  reports:      'report_id',
  issues:       'issue_id',
  actions:      'action_id',
};
