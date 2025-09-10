// assets/js/app.menu.js
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* ------------------ Shared fetch helper (list) ------------------ */
/** Fetch rows from GAS route with optional params (returns []) */
export async function gasList(route, params = {}) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'list');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  const r = await fetch(u, { cache: 'no-store' });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (j.error) throw new Error(j.error);
    return Array.isArray(j.rows) ? j.rows : (Array.isArray(j) ? j : []);
  } catch (e) {
    console.error('gasList parse error:', e, 'raw:', txt);
    throw e;
  }
}

/* ------------------ Role helpers ------------------ */
export function isDataEntry(auth) {
  const role = String(auth?.role || '').toLowerCase();
  if (role === 'dataentry' || role === 'data_entry') return true;
  if (Array.isArray(auth?.roles)) {
    return auth.roles.map(r => String(r).toLowerCase()).includes('dataentry');
  }
  return false;
}

/* ------------------ Departments/Units menu ------------------ */
export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  box.innerHTML = `<li class="nav-item"><a href="#"><span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span></a></li>`;

  const auth = getAuth();
  try {
    let depts = await gasList('departments');
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }
    if (!depts.length) {
      box.innerHTML = `<li class="nav-item"><a href="#"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></a></li>`;
      return;
    }

    // Fetch units in parallel
    const jobs = depts.map(d =>
      gasList('units', { department_id: d.department_id })
        .then(rows => ({ dept: d, units: rows || [] }))
        .catch(() => ({ dept: d, units: [] }))
    );
    const results = await Promise.all(jobs);

    const parts = [];
    for (const { dept: d, units } of results) {
      parts.push(`
        <li class="nav-item">
          <a href="#"><i class="nav-icon i-Building"></i>
            <span class="item-name">${d.department_name}</span>
          </a>
        </li>
      `);
      if (!units.length) {
        parts.push(`<li class="nav-item"><a href="#"><span class="item-name text-muted ps-4">— គ្មានផ្នែក</span></a></li>`);
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
    box.innerHTML = parts.join('');
  } catch (err) {
    console.error('buildDeptMenu failed:', err);
    box.innerHTML = `<li class="nav-item"><a href="#"><span class="item-name text-danger">បរាជ័យ៖ ${err.message}</span></a></li>`;
  }
}

/* ------------------ Settings menu by role ------------------ */
export async function buildSettingsMenu(targetUlId='settingsMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  box.innerHTML = `<li class="nav-item">
    <a href="#"><i class="nav-icon i-Gear"></i>
    <span class="item-name text-muted">កំពុងត្រៀម...</span></a>
  </li>`;

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
    box.innerHTML = `<li class="nav-item"><a href="#"><span class="item-name text-danger">បរាជ័យ៖ ${err.message}</span></a></li>`;
  }
}

/* ------------------ One-call init (optional) ------------------ */
export async function initMenus() {
  await Promise.allSettled([
    buildDeptMenu('deptMenu'),
    buildSettingsMenu('settingsMenu')
  ]);
}


