// assets/js/app.menu.js
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* ============================== */
/* Util: compose API URL safely   */
/* ============================== */
function makeApiUrl(extraParams = {}) {
  // GAS_BASE អាចជា ".../exec?api=1" ឬ ".../exec"
  const base = new URL(GAS_BASE, location.origin);
  const sp = base.searchParams;

  if (!sp.has('api')) sp.set('api', '1');
  for (const [k, v] of Object.entries(extraParams)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  }
  return base.toString();
}

/* ============================== */
/* Shared: List / Save / Delete   */
/* ============================== */

/** GET list rows from route (backend will enforce ACL by token) */
export async function gasList(route, params = {}) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({
    route,
    op: 'list',
    token,              // ✅ FIX: remove the leading dot
    ...params,
  });

  const r = await fetch(url, { cache: 'no-store' });
  const text = await r.text();
  if (!r.ok) {
    console.error('gasList http error:', r.status, r.statusText, text);
    throw new Error(`HTTP ${r.status}: ${r.statusText}`);
  }

  try {
    const j = JSON.parse(text);
    if (j && j.ok === false) throw new Error(j.error || 'API error');
    if (Array.isArray(j?.rows)) return j.rows;
    if (Array.isArray(j)) return j; // fallback if server returns raw array
    return [];
  } catch (e) {
    console.error('gasList parse error:', e, 'raw:', text);
    throw e;
  }
}

/** UPSERT row to route (POST) */
export async function gasSave(route, payload = {}) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({ route, op: 'upsert' });

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // avoid CORS preflight
    body: JSON.stringify({ ...payload, token }),
  });

  const text = await r.text();
  if (!r.ok) {
    console.error('gasSave http error:', r.status, r.statusText, text);
    throw new Error(`HTTP ${r.status}: ${r.statusText}`);
  }

  try {
    const j = JSON.parse(text);
    if (j && j.ok === false) throw new Error(j.error || 'API error');
    return j; // { row: {...} } per Code.gs
  } catch (e) {
    console.error('gasSave parse error:', e, 'raw:', text);
    throw e;
  }
}

/** DELETE row by id */
export async function gasDelete(route, idField, id) {
  const token = getAuth()?.token || '';
  const url = makeApiUrl({ route, op: 'delete' });

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ [idField]: id, token }),
  });

  const text = await r.text();
  if (!r.ok) {
    console.error('gasDelete http error:', r.status, r.statusText, text);
    throw new Error(`HTTP ${r.status}: ${r.statusText}`);
  }

  try {
    const j = JSON.parse(text);
    if (j && j.ok === false) throw new Error(j.error || 'API error');
    return j; // { ok:true, ... }
  } catch (e) {
    console.error('gasDelete parse error:', e, 'raw:', text);
    throw e;
  }
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
function menuSkeleton(n=3){
  return Array.from({length:n})
    .map(()=>`<li class="nav-item"><span class="item-name skeleton skeleton-text"></span></li>`)
    .join('');
}

/* ============================== */
/* Departments/Units menu         */
/* ============================== */
export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  // skeleton loading
  box.innerHTML = Array.from({ length: 4 })
    .map(() => `<li class="nav-item"><span class="item-name skeleton skeleton-text"></span></li>`)
    .join('');

  const auth = getAuth();
  try {
    // 1) ទាញនាយកដ្ឋាន (filter តាម role)
    let depts = await gasList('departments');
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }

    // 2) ទាញ units ម្តង ហើយ group តាម department_id
    const allUnits = await gasList('units');
    const byDep = new Map();
    for (const u of allUnits) {
      const key = String(u.department_id ?? '');
      if (!byDep.has(key)) byDep.set(key, []);
      byDep.get(key).push(u);
    }

    // 3) សង់ម៉ឺនុយ: ក្រោមនាយកដ្ឋាននីមួយៗ បង្ហាញ Units របស់វាប៉ុណ្ណោះ
    const parts = [];
    if (!depts.length) {
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
                <a href="pages/departments/${d.department_id}/units/${u.unit_id}/index.html">
                  <i class="nav-icon i-Right"></i>
                  <span class="item-name ps-3">${u.unit_name}</span>
                </a>
              </li>
            `);
          }
        }
      }
    }

    // 4) (ជាជម្រើស) បង្ហាញ Units ដែលគ្មាន department_id ក្រោម “មិនបានកំណត់”
    const orphan = byDep.get('') || byDep.get('undefined') || [];
    if (orphan.length) {
      parts.push(`
        <li class="nav-item mt-2 mb-1">
          <span class="item-name text-uppercase small text-muted ps-2">មិនបានកំណត់នាយកដ្ឋាន</span>
        </li>
      `);
      for (const u of orphan) {
        parts.push(`
          <li class="nav-item">
            <a href="pages/departments/unknown/units/${u.unit_id}/index.html">
              <i class="nav-icon i-Right"></i>
              <span class="item-name ps-3">${u.unit_name}</span>
            </a>
          </li>
        `);
      }
    }

    box.innerHTML = parts.join('');
  } catch (err) {
    console.error('buildDeptMenu failed:', err);
    const rid = `retry-${targetUlId}`;
    box.innerHTML = `
      <li class="nav-item">
        <a href="#" id="${rid}">
          <span class="item-name text-danger">បរាជ័យក្នុងការទាញទិន្នន័យ — ចុចដើម្បីសាកម្ដងទៀត</span>
        </a>
      </li>`;
    const btn = document.getElementById(rid);
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); buildDeptMenu(targetUlId); });
  }
}


/* ============================== */
/* Settings menu                  */
/* ============================== */
export async function buildSettingsMenu(targetUlId='settingsMenu') {
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
    const rid = `retry-${targetUlId}`;
    box.innerHTML = `
      <li class="nav-item">
        <a href="#" id="${rid}">
          <span class="item-name text-danger">បរាជ័យក្នុងការទាញម៉ឺនុយ — ចុចដើម្បីសាកម្ដងទៀត</span>
        </a>
      </li>`;
    const btn = document.getElementById(rid);
    if (btn) btn.addEventListener('click', (e)=>{ e.preventDefault(); buildSettingsMenu(targetUlId); });
  }
}

/* ============================== */
/* Optional: init both menus      */
/* ============================== */
export async function initMenus() {
  await Promise.allSettled([
    buildDeptMenu('deptMenu'),
    buildSettingsMenu('settingsMenu'),
  ]);
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
