// assets/js/app.menu.js
// ----------------------------------------------
// GAS + Menus (role-aware)
// ----------------------------------------------
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* =========================================================
 * GAS helpers
 * =======================================================*/

/**
 * List rows from a route.
 * GET: ?api=1&route=<route>&op=list&...params
 */
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
    if (j?.error) throw new Error(j.error);
    return Array.isArray(j?.rows) ? j.rows : (Array.isArray(j) ? j : []);
  } catch (e) {
    console.error('gasList parse error:', e, 'raw:', txt);
    return [];
  }
}

/**
 * Save (add/update) a record to a route.
 * POST JSON: { ...data }
 * ?api=1&route=<route>&op=save
 */
export async function gasSave(route, data) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'save');

  const r = await fetch(u, {
    method: 'POST',
    body: JSON.stringify(data || {}),
    headers: { 'Content-Type': 'application/json' }
  });

  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (j?.error) throw new Error(j.error);
    return j;
  } catch (e) {
    console.error('gasSave parse error:', e, 'raw:', txt);
    throw e;
  }
}

/**
 * Delete a record by id.
 * GET: ?api=1&route=<route>&op=delete&id=<id>
 */
export async function gasDelete(route, id) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'delete');
  u.searchParams.set('id', id);

  const r = await fetch(u, { cache: 'no-store' });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (j?.error) throw new Error(j.error);
    return j;
  } catch (e) {
    console.error('gasDelete parse error:', e, 'raw:', txt);
    throw e;
  }
}

/* =========================================================
 * Role helpers (internal)
 * =======================================================*/
function isDataEntry(auth) {
  const role = String(auth?.role || '').toLowerCase();
  if (role === 'dataentry' || role === 'data_entry') return true;
  if (Array.isArray(auth?.roles)) {
    return auth.roles.map(r => String(r).toLowerCase()).includes('dataentry');
  }
  return false;
}

/* =========================================================
 * Departments / Units submenu
 *  - Super: see all departments + units
 *  - Non-super: only own department (auth.department_id)
 * =======================================================*/
export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  box.innerHTML = `
    <li class="nav-item">
      <span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span>
    </li>
  `;

  const auth = getAuth();

  try {
    let depts = await gasList('departments');

    // Non-super: filter to own department if defined
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }

    if (!depts.length) {
      box.innerHTML = `
        <li class="nav-item">
          <span class="item-name text-muted">គ្មានទិន្នន័យ</span>
        </li>`;
      return;
    }

    // Fetch units in parallel (avoid N+1 awaits)
    const jobs = depts.map(d =>
      gasList('units', { department_id: d.department_id })
        .then(rows => ({ dept: d, units: rows || [] }))
        .catch(() => ({ dept: d, units: [] }))
    );

    const results = await Promise.all(jobs);

    box.innerHTML = results.map(({ dept, units }) => {
      let s = `
        <li class="nav-item">
          <a href="#">
            <i class="nav-icon i-Building"></i>
            <span class="item-name">${dept.department_name}</span>
          </a>
        </li>
      `;

      if (units.length) {
        s += units.map(u => `
          <li class="nav-item ps-3">
            <a href="pages/departments/${dept.department_id}/units/${u.unit_id}/index.html">
              <i class="nav-icon i-Right"></i>
              <span class="item-name">${u.unit_name}</span>
            </a>
          </li>
        `).join('');
      } else {
        s += `
          <li class="nav-item ps-3">
            <span class="item-name text-muted">— គ្មានផ្នែក</span>
          </li>
        `;
      }
      return s;
    }).join('');

  } catch (err) {
    console.error('buildDeptMenu failed:', err);
    box.innerHTML = `
      <li class="nav-item">
        <span class="item-name text-danger">បរាជ័យ: ${err.message}</span>
      </li>
    `;
  }
}

/* =========================================================
 * Settings submenu (role-aware)
 *  - Super: Indicators, Departments, Units, Periods
 *  - Non-super (incl. DataEntry): Indicators only
 * =======================================================*/
export async function buildSettingsMenu(targetUlId = 'settingsMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  const auth = getAuth();

  const itemsAll = [
    { key: 'indicators',  label: 'សូចនាករ',   icon: 'i-Bar-Chart', href: '#/settings/indicators'  },
    { key: 'departments', label: 'នាយកដ្ឋាន',  icon: 'i-Building',  href: '#/settings/departments' },
    { key: 'units',       label: 'ផ្នែក',      icon: 'i-Right',     href: '#/settings/units'       },
    { key: 'periods',     label: 'រយៈពេល',    icon: 'i-Calendar',  href: '#/settings/periods'     },
  ];

  let visible = [];
  if (isSuper(auth)) {
    visible = itemsAll;                                  // Super: all
  } else if (isDataEntry(auth)) {
    visible = itemsAll.filter(x => x.key === 'indicators'); // DataEntry: indicators only
  } else {
    visible = itemsAll.filter(x => x.key === 'indicators'); // others: indicators only
  }

  if (!visible.length) {
    box.innerHTML = `
      <li class="nav-item">
        <span class="item-name text-muted">គ្មានសិទ្ធិគ្រប់គ្រង</span>
      </li>`;
    return;
  }

  box.innerHTML = visible.map(it => `
    <li class="nav-item">
      <a href="${it.href}">
        <i class="nav-icon ${it.icon}"></i>
        <span class="item-name">${it.label}</span>
      </a>
    </li>
  `).join('');
}

/* =========================================================
 * One-shot initializer (optional helper)
 * =======================================================*/
export async function initMenus() {
  await Promise.allSettled([
    buildDeptMenu('deptMenu'),
    buildSettingsMenu('settingsMenu'),
  ]);
}
