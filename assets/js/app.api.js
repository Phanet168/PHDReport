// assets/js/app.api.js
// ===================== GAS API WRAPPER =====================
import { getAuth, authTokenParam } from './app.auth.js';

// !!! CHANGE THIS TO YOUR LATEST DEPLOY URL (keep working one) !!!
export const GAS_BASE = "https://script.google.com/macros/s/AKfycbwuvNrQOG7CoQiEb6LXyz-0KJgir_H5LPjGrcS79Vf9qH-0sU9Mln5N3YvQJn4u_n74HA/exec";

// ---- low-level fetchers
async function getJson(url){
  const r = await fetch(url, { cache:'no-store' });
  if (!r.ok) throw new Error('HTTP '+r.status+' '+r.statusText);
  return r.json();
}
async function postJson(url, data){
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoid preflight
    body: JSON.stringify(data||{})
  });
  if (!r.ok) throw new Error('HTTP '+r.status+' '+r.statusText);
  return r.json();
}
function qp(obj = {}) {
  const s = new URLSearchParams();
  Object.entries(obj).forEach(([k,v])=>{
    if (v !== undefined && v !== null && v !== '') s.set(k, v);
  });
  return s.toString();
}

// ---- AUTH
export async function apiLogin(username, password){
  return postJson(`${GAS_BASE}?api=1&route=auth&op=login`, { username, password });
}

// ---- MASTER DATA
export async function listDepartments(params={}){
  const q = qp(params);
  return getJson(`${GAS_BASE}?api=1&route=departments&op=list${q?`&${q}`:''}${authTokenParam()}`);
}
export async function listUnits(params={}){
  const q = qp(params);
  return getJson(`${GAS_BASE}?api=1&route=units&op=list${q?`&${q}`:''}${authTokenParam()}`);
}
export async function listIndicators(params={}){
  const q = qp(params);
  return getJson(`${GAS_BASE}?api=1&route=indicators&op=list${q?`&${q}`:''}${authTokenParam()}`);
}
export async function listPeriods(params={}){
  const q = qp(params);
  return getJson(`${GAS_BASE}?api=1&route=periods&op=list${q?`&${q}`:''}${authTokenParam()}`);
}

// ---- REPORTS CRUD (year-partitioned on server)
export async function listReports({ year, filter = {} } = {}){
  const q = qp({ ...(filter||{}), ...(year?{year:String(year)}:{} ) });
  return getJson(`${GAS_BASE}?api=1&route=report&op=list${q?`&${q}`:''}${authTokenParam()}`);
}
export async function upsertReport(payload){
  // expected: { department_id, indicator_id, period_id, value, note?, year? }
  // server អាច suy year ពី period_id ក៏បាន; យើងផ្ញើជាមួយក៏ល្អ។
  const t = getAuth()?.token;
  const url = `${GAS_BASE}?api=1&route=report&op=upsert${t?`&token=${encodeURIComponent(t)}`:''}`;
  return postJson(url, payload);
}
export async function deleteReport(report_id, hint = {}){
  const q = qp({ report_id, ...hint });
  return getJson(`${GAS_BASE}?api=1&route=report&op=delete&${q}${authTokenParam()}`);
}

// ---- ANALYTICS
export async function summary(year, by='indicator_id'){
  const q = qp({ year, by });
  return getJson(`${GAS_BASE}?api=1&route=analytics&op=summary&${q}${authTokenParam()}`);
}

// ---- UTILITIES
export function yFromPeriod(pid){
  const m = /^(\d{4})/.exec(String(pid||''));
  return m ? m[1] : String(new Date().getFullYear());
}
export function exportCsv(filename, rows){
  const cols = Object.keys(rows[0]||{});
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv = [cols.join(',')].concat(
    rows.map(r => cols.map(c => esc(r[c])).join(','))
  ).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

