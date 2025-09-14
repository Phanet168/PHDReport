// assets/js/app.api.js
// ===================== GAS API WRAPPER =====================
import { GAS_BASE } from './config.js';
import { getAuth } from './app.auth.js';

/* -------------------- URL helper -------------------- */
function makeApiUrl(params = {}) {
  // GAS_BASE អាចជា ".../exec" ឬ ".../exec?api=1"
  const u = new URL(GAS_BASE, location.origin);
  const sp = u.searchParams;
  if (!sp.has('api')) sp.set('api', '1');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  }
  return u.toString();
}
const withToken = (p = {}) => {
  const t = getAuth()?.token || '';
  return t ? { ...p, token: t } : p;
};

/* -------------------- low-level fetchers -------------------- */
async function getJsonUrl(params = {}, extraFetchInit = {}) {
  const url = makeApiUrl(params);
  const r = await fetch(url, { cache: 'no-store', ...extraFetchInit });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText} — ${text}`);
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON: ' + text); }
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}
async function postJsonUrl(params = {}, bodyObj = {}) {
  const url = makeApiUrl(params);
  // backend អាន token ពី queryParam ឬ body ក៏បាន—យើងបញ្ចូលក្នុង body ស្វ័យប្រវត្តិ
  const token = getAuth()?.token || '';
  const body = token && !('token' in bodyObj) ? { ...bodyObj, token } : bodyObj;

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // ជៀស CORS preflight
    body: JSON.stringify(body || {})
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText} — ${text}`);
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON: ' + text); }
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
}
const unwrapRows = (resp) => Array.isArray(resp?.rows) ? resp.rows
                        : Array.isArray(resp) ? resp
                        : [];

/* -------------------- AUTH -------------------- */
export async function apiLogin(username, password) {
  return postJsonUrl({ route: 'auth', op: 'login' }, { username, password });
}

/* -------------------- MASTER DATA (list) -------------------- */
export async function listDepartments(params = {}) {
  const j = await getJsonUrl(withToken({ route: 'departments', op: 'list', ...params }));
  return unwrapRows(j);
}
export async function listUnits(params = {}) {
  const j = await getJsonUrl(withToken({ route: 'units', op: 'list', ...params }));
  return unwrapRows(j);
}
export async function listIndicators(params = {}) {
  // indicators គឺ scoped => ត្រូវការតែ token
  const j = await getJsonUrl(withToken({ route: 'indicators', op: 'list', ...params }));
  return unwrapRows(j);
}
export async function listPeriods(params = {}) {
  const j = await getJsonUrl(withToken({ route: 'periods', op: 'list', ...params }));
  return unwrapRows(j);
}

/* -------------------- REPORTS CRUD -------------------- */
// សម្គាល់: route ត្រឹមត្រូវគឺ "reports" (ពហុ)
export async function listReports(params = {}) {
  const j = await getJsonUrl(withToken({ route: 'reports', op: 'list', ...params }));
  return unwrapRows(j);
}
export async function upsertReport(payload = {}) {
  // payload: { report_id?, department_id, indicator_id, period_id, value, note?, plan_value? ... }
  return postJsonUrl({ route: 'reports', op: 'upsert' }, payload);
}
export async function deleteReport(report_id) {
  // server អាន id ពី body ឬ query params ក៏បាន—ប្រើ POST សុទ្ធ
  return postJsonUrl({ route: 'reports', op: 'delete' }, { report_id });
}

/* -------------------- ANALYTICS -------------------- */
export async function summary(year, by = 'indicator_id') {
  const j = await getJsonUrl(withToken({ route: 'analytics', op: 'summary', year, by }));
  return unwrapRows(j); // server returns {rows:[{key,value,plan,gap,count}]}
}

/* -------------------- UTILITIES -------------------- */
export function yFromPeriod(pid) {
  const m = /^(\d{4})/.exec(String(pid || ''));
  return m ? m[1] : String(new Date().getFullYear());
}
export function exportCsv(filename, rows) {
  const cols = Object.keys(rows[0] || {});
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
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
