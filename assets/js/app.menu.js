// assets/js/app.menu.js
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* ============================== */
/* Util: API + retry              */
/* ============================== */
function makeApiUrl(extra = {}) {
  const u = new URL(GAS_BASE);
  if (!u.searchParams.has('api')) u.searchParams.set('api', '1');
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function withJitter(ms){ return ms + Math.floor(Math.random()*120); }
async function fetchWithRetry(input, init, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(input, init);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return r;
    } catch (e) {
      err = e;
      if (i < tries - 1) await sleep(withJitter(300 * Math.pow(2, i)));
    }
  }
  throw err;
}

/* ============================== */
/* Shared: List / Save / Delete   */
/* ============================== */
export async function gasList(route, params = {}) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({ route, op: 'list', ...(token ? { token } : {}), ...params });
  const r = await fetchWithRetry(url, { cache: 'no-store' });
  const txt = await r.text();
  let j;
  try { j = txt ? JSON.parse(txt) : {}; }
  catch (e) { console.error('[gasList] invalid JSON:', txt); throw e; }
  if (j && j.ok === false) throw new Error(j.error || 'API error');

  return Array.isArray(j?.rows) ? j.rows
       : Array.isArray(j?.data) ? j.data
       : Array.isArray(j)       ? j
       : [];
}

export const ID_FIELDS = {
  users:       'user_id',
  departments: 'department_id',
  units:       'unit_id',
  indicators:  'indicator_id',
  periods:     'period_id',
  reports:     'report_id',
  issues:      'issue_id',
  actions:     'action_id',
};
export function getIdField(route){ return ID_FIELDS[route] || 'id'; }

async function postJson(url, bodyObj){
  const res = await fetchWithRetry(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(bodyObj ?? {})
  });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch {}
  if (json && json.ok === false) throw new Error(json.error || 'API error');
  return json ?? {};
}

export async function gasSave(route, payload = {}) {
  const token = getAuth()?.token || '';
  const base  = new URL(GAS_BASE);
  base.searchParams.set('api','1');
  base.searchParams.set('route', route);
  if (token) base.searchParams.set('token', token);

  const OPS = ['upsert','save','insert','append','addRow','add'];
  let lastErr;
  for (const op of OPS) {
    const u = new URL(base);
    u.searchParams.set('op', op);
    try {
      const out = await postJson(u, { ...payload, ...(token ? { token } : {}) });
      if (out?.row) return out;
      if (out?.ok)  return out;
      if (out && typeof out === 'object' && !('ok' in out) && !('row' in out)) {
        return { ok:true, row: out };
      }
      return out;
    } catch (e) {
      const msg = String(e?.message || e);
      if (/unknown op/i.test(msg) || /row not found/i.test(msg)) { lastErr = e; continue; }
      lastErr = e; break;
    }
  }
  throw lastErr || new Error('gasSave failed');
}

export async function gasDelete(route, idField, idVal) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({ route, op: 'delete', ...(token ? { token } : {}) });
  const json = await postJson(url, { [idField]: idVal, ...(token ? { token } : {}) });
  if (json?.ok || json?.soft_deleted) return true;
  if (json?.error) throw new Error(json.error);
  return false;
}

/* ============================== */
/* Role helpers                   */
/* ============================== */
export function isDataEntry(auth) {
  const role = String(auth?.role || '').toLowerCase();
  if (role === 'dataentry' || role === 'data_entry') return true;
  if (Array.isArray(auth?.roles)) {
    return auth.roles.map(r => String(r).toLowerCase()).includes('dataentry');
  }
  return false;
}
export function isViewer(auth){
  const role = String(auth?.role || '').toLowerCase();
  return role === 'viewer';
}

/* ============================== */
/* Indicators helper              */
/* ============================== */
export async function listMyIndicators() {
  const auth  = getAuth();
  const SUPER = isSuper(auth);
  let rows = await gasList('indicators').catch(()=>[]);
  if (!SUPER) {
    if (auth?.department_id) rows = rows.filter(r => String(r.department_id) === String(auth.department_id));
    if (auth?.unit_id)       rows = rows.filter(r => String(r.unit_id || '') === String(auth.unit_id));
    if (auth?.user_id)       rows = rows.filter(r => String(r.owner_id || '') === String(auth.user_id));
  }
  return rows;
}

/* ============================== */
/* Menu skeleton helper           */
/* ============================== */
function menuSkeleton(n = 3) {
  return Array.from({ length: n })
    .map(() => `<li class="nav-item"><span class="item-name skeleton skeleton-text"></span></li>`)
    .join('');
}

/* ============================== */
/* "Depts" submenu → role-based   */
/* ============================== */
export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;
  box.innerHTML = menuSkeleton(1);

  try {
    const auth   = getAuth();
    const viewer = isViewer(auth);

    const items = [];
    if (viewer) {
      // Viewer: view reports only
      items.push(`
        <li class="nav-item">
          <a href="#/reports">
            <i class="nav-icon i-Bar-Chart"></i>
            <span class="item-name">មើលរបាយការណ៍</span>
          </a>
        </li>
      `);
    } else {
      // Non-viewer: data entry
      items.push(`
        <li class="nav-item">
          <a href="#/data-entry">
            <i class="nav-icon i-File-Clipboard-File--Text"></i>
            <span class="item-name">បញ្ចូលរបាយការណ៍</span>
          </a>
        </li>
      `);
    }

    box.innerHTML = items.join('');
  } catch (err) {
    console.error('buildDeptMenu failed:', err);
    box.innerHTML = `
      <li class="nav-item">
        <a href="#" id="retry-${targetUlId}">
          <span class="item-name text-danger">បរាជ័យក្នុងការទាញម៉ឺនុយ — ចុចដើម្បីសាកម្ដងទៀត</span>
        </a>
      </li>`;
    document.getElementById(`retry-${targetUlId}`)?.addEventListener('click', e => {
      e.preventDefault(); buildDeptMenu(targetUlId);
    });
  }
}

/* ============================== */
/* Settings submenu (role-based)  */
/* - Super: show ALL              */
/* - Viewer: show NONE            */
/* - Others: Indicators only      */
/* ============================== */
export async function buildSettingsMenu(targetUlId = 'settingsMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;
  box.innerHTML = menuSkeleton(1);

  try {
    const auth   = getAuth();
    const SUPER  = isSuper(auth);
    const viewer = isViewer(auth);

    if (viewer) {
      // Hide settings completely for viewers
      box.innerHTML = '';
      return;
    }

    if (SUPER) {
      const itemsAll = [
        { key: 'users',       label: 'អ្នកប្រើប្រាស់', icon: 'i-Male',      href: '#/settings/users' },
        { key: 'indicators',  label: 'សូចនាករ',       icon: 'i-Bar-Chart', href: '#/settings/indicators' },
        { key: 'departments', label: 'នាយកដ្ឋាន',     icon: 'i-Building',  href: '#/settings/departments' },
        { key: 'units',       label: 'ផ្នែក',         icon: 'i-Right',     href: '#/settings/units' },
        { key: 'periods',     label: 'រយៈពេល',       icon: 'i-Calendar',  href: '#/settings/periods' },
      ];
      const html = [`<li class="nav-item mt-2 mb-1"><span class="text-uppercase text-muted small ps-3">ការកំណត់ (Settings)</span></li>`];
      itemsAll.forEach(it=>{
        html.push(`
          <li class="nav-item">
            <a href="${it.href}">
              <i class="nav-icon ${it.icon}"></i>
              <span class="item-name">${it.label}</span>
            </a>
          </li>
        `);
      });
      box.innerHTML = html.join('');
      return;
    }

    // Non-viewer but not Super → Indicators only
    box.innerHTML = [
      `<li class="nav-item mt-2 mb-1"><span class="text-uppercase text-muted small ps-3">ការកំណត់ (Settings)</span></li>`,
      `<li class="nav-item">
         <a href="#/settings/indicators">
           <i class="nav-icon i-Bar-Chart"></i>
           <span class="item-name">សូចនាករ</span>
         </a>
       </li>`
    ].join('');

  } catch (err) {
    console.error('buildSettingsMenu failed:', err);
    box.innerHTML = `
      <li class="nav-item">
        <a href="#" id="retry-${targetUlId}">
          <span class="item-name text-danger">បរាជ័យក្នុងការទាញម៉ឺនុយ — ចុចដើម្បីសាកម្ដងទៀត</span>
        </a>
      </li>`;
    document.getElementById(`retry-${targetUlId}`)?.addEventListener('click', e => {
      e.preventDefault(); buildSettingsMenu(targetUlId);
    });
  }
}

/* ============================== */
/* Optional helpers               */
/* ============================== */
export async function initMenus() {
  await Promise.allSettled([
    buildDeptMenu('deptMenu'),
    buildSettingsMenu('settingsMenu')
  ]);
}
export function clearMenuCache() {
  // no cache entries in this version
}
