// assets/js/net/gas_api.js
// Re-export GAS_BASE from config.js so other modules can also import it from here if they prefer.
import { GAS_BASE as _GAS_BASE } from '../config.js';
export const GAS_BASE = _GAS_BASE;

/** =========================
 *  Fetch helpers (retry/timeout)
 *  ========================= */
const DEFAULT_TIMEOUT_MS = 12000;

function abortAfter(ms = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(ms) { return ms + Math.floor(Math.random() * 120); }

async function fetchWithRetry(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const { signal, clear } = abortAfter(opts.timeout || DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal });
      clear();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(jitter(300 * Math.pow(2, i)));
    }
  }
  throw lastErr || new Error('fetch failed');
}

function makeApiUrl(params = {}) {
  const u = new URL(GAS_BASE);
  if (!u.searchParams.has('api')) u.searchParams.set('api', '1');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  return u.toString();
}

/** =========================
 *  Public JSON helpers
 *  ========================= */
export async function getJSON(route, params = {}) {
  const url = makeApiUrl({ route, op: 'list', ...params });
  const res = await fetchWithRetry(url, { cache: 'no-store' });
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

export async function postJSON(route, body = {}, params = {}) {
  const url = makeApiUrl({ route, ...params });
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script friendly
    body: JSON.stringify(body ?? {})
  });
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
