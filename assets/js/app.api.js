// assets/js/app.api.js
import { getAuth } from './app.auth.js';

// ==== CHANGE THIS if needed (keep your working one) ====
export const GAS_BASE = "https://script.google.com/macros/s/AKfycbwdeEgEMYK8bCZqU0xmOEERIvqbqu21tUwDKDuBb9tUXhOVwb463Hjk2XZsz9T9lBmLZQ/exec";

async function getJson(url){
  const r = await fetch(url, { cache:'no-store' });
  if(!r.ok) throw new Error('HTTP '+r.status+' '+r.statusText);
  return r.json();
}
async function postJson(url, data){
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoid preflight
    body: JSON.stringify(data||{})
  });
  if(!r.ok) throw new Error('HTTP '+r.status+' '+r.statusText);
  return r.json();
}
function tokenParam(){
  const t = getAuth()?.token || '';
  return t ? `&token=${encodeURIComponent(t)}` : '';
}

// ---- Auth
export async function apiLogin(username, password){
  return postJson(`${GAS_BASE}?api=1&route=auth&op=login`, { username, password });
}

// ---- Dictionaries (departments, units, indicators, periods)
export async function listDepartments(params={}){
  const q = new URLSearchParams(params).toString();
  return getJson(`${GAS_BASE}?api=1&route=departments&op=list${q?`&${q}`:''}${tokenParam()}`);
}
export async function listUnits(params={}){
  const q = new URLSearchParams(params).toString();
  return getJson(`${GAS_BASE}?api=1&route=units&op=list${q?`&${q}`:''}${tokenParam()}`);
}
export async function listIndicators(params={}){
  const q = new URLSearchParams(params).toString();
  return getJson(`${GAS_BASE}?api=1&route=indicators&op=list${q?`&${q}`:''}${tokenParam()}`);
}
export async function listPeriods(params={}){
  const q = new URLSearchParams(params).toString();
  return getJson(`${GAS_BASE}?api=1&route=periods&op=list${q?`&${q}`:''}${tokenParam()}`);
}

// ---- Reports
export async function listReports({ year, filter={} } = {}){
  const q = new URLSearchParams({ ...(filter||{}), ...(year?{year:String(year)}:{} ) }).toString();
  return getJson(`${GAS_BASE}?api=1&route=report&op=list${q?`&${q}`:''}${tokenParam()}`);
}
export async function upsertReport(payload){
  // payload should include: department_id, indicator_id, period_id, value, year (optional helps partition)
  return postJson(`${GAS_BASE}?api=1&route=report&op=upsert${tokenParam()}`, payload);
}
export async function deleteReport(report_id, hint={}){
  const q = new URLSearchParams({ report_id, ...hint }).toString();
  return getJson(`${GAS_BASE}?api=1&route=report&op=delete&${q}${tokenParam()}`);
}

// ---- Helpers
export function yFromPeriod(pid){
  const m = /^(\d{4})/.exec(String(pid||''));
  return m? m[1] : String(new Date().getFullYear());
}
export function exportCsv(filename, rows){
  const cols = Object.keys(rows[0]||{});
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv = [cols.join(',')].concat(
    rows.map(r => cols.map(c => esc(r[c])).join(','))
  ).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

