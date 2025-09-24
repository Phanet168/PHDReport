// assets/js/app.menu.js
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* ============================== */
/* Util: API + retry + cache      */
/* ============================== */
const LSK = {
  depts: 'phd_cache_depts',
  units: 'phd_cache_units',
};

function makeApiUrl(extra = {}) {
  const u = new URL(GAS_BASE);                 // កុំភ្ជាប់ location.origin
  if (!u.searchParams.has('api')) u.searchParams.set('api', '1');
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

async function fetchWithRetry(input, init, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(input, init);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return r;
    } catch (e) {
      err = e;
      await new Promise(res => setTimeout(res, 300 * Math.pow(2, i))); // 300ms, 600ms, 1200ms
    }
  }
  throw err;
}

function lsGet(key, def = []) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/* ============================== */
/* Shared: List / Save / Delete   */
/* ============================== */
// --- replace your gasList in assets/js/app.menu.js with this version ---
export async function gasList(route, params = {}) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({ route, op: 'list', ...(token ? { token } : {}), ...params });

  console.log('[gasList] GET →', url); // DEBUG

  const r = await fetchWithRetry(url, { cache: 'no-store' });
  const text = await r.text();
  let j;
  try { j = text ? JSON.parse(text) : {}; }
  catch (e) { console.error('[gasList] invalid JSON:', text); throw e; }

  console.log('[gasList] raw ←', j);   // DEBUG

  if (j && j.ok === false) throw new Error(j.error || 'API error');

  // normalize
  const rows =
    Array.isArray(j?.rows) ? j.rows :
    Array.isArray(j?.data) ? j.data :
    Array.isArray(j)       ? j :
    [];

  console.log('[gasList] rows parsed:', rows.length, rows.slice(0,3)); // DEBUG
  return rows;
}


export async function gasSave(route, payload = {}) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({ route, op: 'upsert' });
  const r = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...payload, ...(token ? { token } : {}) }),
  });
  const j = await r.json();
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j; // { row }
}

export async function gasDelete(route, idField, id) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({ route, op: 'delete' });
  const r = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ [idField]: id, ...(token ? { token } : {}) }),
  });
  const j = await r.json();
  if (j && j.ok === false) throw new Error(j.error || 'API error');
  return j;
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

/* ============================== */
/* Menu skeleton helper           */
/* ============================== */
function menuSkeleton(n = 3) {
  return Array.from({ length: n })
    .map(() => `<li class="nav-item"><span class="item-name skeleton skeleton-text"></span></li>`)
    .join('');
}

/* ============================== */
/* Departments/Units menu         */
/* ============================== */
export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  // use cache first (instant)
  const cacheDepts = lsGet(LSK.depts);
  const cacheUnits = lsGet(LSK.units);
  if (cacheDepts.length || cacheUnits.length) {
    try { renderDeptMenu(box, cacheDepts, cacheUnits); } catch {}
  } else {
    box.innerHTML = menuSkeleton(4);
  }

  // live fetch
  const auth = getAuth();
  try {
    let depts = await gasList('departments');
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }
    const units = await gasList('units');

    // save cache
    lsSet(LSK.depts, depts);
    lsSet(LSK.units, units);

    renderDeptMenu(box, depts, units);
  } catch (err) {
    console.error('buildDeptMenu failed:', err);
    if (!box.innerHTML.trim()) box.innerHTML = `
      <li class="nav-item">
        <a href="#" id="retry-${targetUlId}">
          <span class="item-name text-danger">បរាជ័យក្នុងការទាញទិន្នន័យ — ចុចដើម្បីសាកម្ដងទៀត</span>
        </a>
      </li>`;
    document.getElementById(`retry-${targetUlId}`)?.addEventListener('click', e => {
      e.preventDefault(); buildDeptMenu(targetUlId);
    });
  }
}

function renderDeptMenu(box, depts, allUnits) {
  const byDep = new Map();
  (allUnits || []).forEach(u => {
    const k = String(u.department_id ?? '');
    (byDep.get(k) || byDep.set(k, []).get(k)).push(u);
  });

  const parts = [];
  if (!depts?.length) {
    parts.push(`<li class="nav-item"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></li>`);
  } else {
    for (const d of depts) {
      parts.push(`
        <li class="nav-item mt-2 mb-1">
          <span class="item-name text-uppercase small text-muted ps-2">${d.department_name}</span>
        </li>
      `);
      const units = byDep.get(String(d.department_id)) || [];
      if (!units.length) {
        parts.push(`<li class="nav-item"><span class="item-name text-muted ps-4">— គ្មានផ្នែក</span></li>`);
      } else {
        for (const u of units) {
          parts.push(`
            <li class="nav-item">
              <a href="#/settings/units"> <!-- ផ្លូវ hash ទាន់សម័យ -->
                <i class="nav-icon i-Right"></i>
                <span class="item-name ps-3">${u.unit_name}</span>
              </a>
            </li>
          `);
        }
      }
    }
  }

  // Orphan units (no department)
  const orphan = byDep.get('') || [];
  if (orphan.length) {
    parts.push(`
      <li class="nav-item mt-2 mb-1">
        <span class="item-name text-uppercase small text-muted ps-2">មិនបានកំណត់នាយកដ្ឋាន</span>
      </li>`);
    orphan.forEach(u => {
      parts.push(`
        <li class="nav-item">
          <a href="#/settings/units">
            <i class="nav-icon i-Right"></i>
            <span class="item-name ps-3">${u.unit_name}</span>
          </a>
        </li>`);
    });
  }

  box.innerHTML = parts.join('');
}

/* ============================== */
/* Settings menu                  */
/* ============================== */
export async function buildSettingsMenu(targetUlId = 'settingsMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;
  box.innerHTML = menuSkeleton(3);

  const auth = getAuth();
  try {
    const itemsAll = [
      { key: 'indicators',  label: 'សូចនាករ',  icon: 'i-Bar-Chart', href: '#/settings/indicators' },
      { key: 'departments', label: 'នាយកដ្ឋាន', icon: 'i-Building',  href: '#/settings/departments' },
      { key: 'units',       label: 'ផ្នែក',     icon: 'i-Right',     href: '#/settings/units' },
      { key: 'periods',     label: 'រយៈពេល',   icon: 'i-Calendar',  href: '#/settings/periods' },
    ];

    let visible;
    if (isSuper(auth)) visible = itemsAll;
    else if (isDataEntry(auth)) visible = itemsAll.filter(x => x.key === 'indicators');
    else visible = itemsAll.filter(x => x.key === 'indicators');

    const html = [`<li class="nav-item mt-2 mb-1"><span class="text-uppercase text-muted small ps-3">ការកំណត់ (Settings)</span></li>`];
    visible.forEach(it => {
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
  await Promise.allSettled([buildDeptMenu('deptMenu'), buildSettingsMenu('settingsMenu')]);
}
export function clearMenuCache() {
  try { localStorage.removeItem(LSK.depts); localStorage.removeItem(LSK.units); } catch {}
}

/* ============================== */
/* Constants for ID fields        */
/* ============================== */
export const ID_FIELDS = {
  indicators: 'indicator_id',
  departments: 'department_id',
  units: 'unit_id',
  reports: 'report_id',
};
