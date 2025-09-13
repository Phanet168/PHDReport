// assets/js/app.menu.js
// ------------------------------------------------------------
// Client helpers for GAS API + Menus (role-aware)
// ------------------------------------------------------------
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* ============================================================
 * Constants
 * ========================================================== */
const ID_FIELDS = {
  users: 'user_id',
  departments: 'department_id',
  units: 'unit_id',
  periods: 'period_id',
  indicators: 'indicator_id',
  reports: 'report_id',
  issues: 'issues_id',
  actions: 'action_id',
};

/* ============================================================
 * Shared fetch helpers
 * ========================================================== */
// GET list
export async function gasList(route, params = {}) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'list');

  // append query params
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });

  // include token if available (server will use it for ACL on indicators/reports)
  const auth = getAuth();
  if (auth?.token) u.searchParams.set('token', auth.token);

  const r = await fetch(u, { cache: 'no-store' });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt || '{}');
    if (j.error) throw new Error(j.error);
    // server returns { rows, total, ... } OR []
    if (Array.isArray(j)) return j;
    if (Array.isArray(j.rows)) return j.rows;
    return [];
  } catch (e) {
    console.error('gasList parse error:', e, 'raw:', txt);
     // return empty array to avoid breaking UI
    return [];
  }
}

// UPSERT (Add/Update)
export async function gasSave(route, data) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'upsert');

  // attach token for ACL
  const auth = getAuth();
  const payload = { ...data, token: auth?.token || '' };

  const r = await fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // ok (server accepts json/text)
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt || '{}');
    if (j.error) throw new Error(j.error);
    return j; // { row: {...} }
  } catch (e) {
    console.error('gasSave parse error:', e, 'raw:', txt);
    throw e;
  }
}

// DELETE (id by proper field name)
export async function gasDelete(route, id) {
  const idField = ID_FIELDS[route] || 'id';
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'delete');
  u.searchParams.set(idField, id);

  // include token for ACL
  const auth = getAuth();
  if (auth?.token) u.searchParams.set('token', auth.token);

  const r = await fetch(u, { cache: 'no-store' });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt || '{}');
    if (j.error) throw new Error(j.error);
    return j; // { ok:true }
  } catch (e) {
    console.error('gasDelete parse error:', e, 'raw:', txt);
    throw e;
  }
}

/* ============================================================
 * Role helpers
 * ========================================================== */
function isDataEntry(auth) {
  const role = String(auth?.role || '').toLowerCase();
  if (role === 'dataentry' || role === 'data_entry') return true;
  if (Array.isArray(auth?.roles)) {
    return auth.roles.map(r => String(r).toLowerCase()).includes('dataentry');
  }
  return false;
}

/* ============================================================
 * Menus
 * ========================================================== */
// Departments/Units submenu (role filtered)
export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  box.innerHTML = `
    <li class="nav-item">
      <a href="#"><span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span></a>
    </li>
  `;

  const auth = getAuth();
  try {
    let depts = await gasList('departments');

    // Non-super: restrict to own department (if present)
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }

    if (!depts.length) {
      box.innerHTML = `
        <li class="nav-item">
          <a href="#"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></a>
        </li>`;
      return;
    }

    // fetch units per dept (in parallel)
    const results = await Promise.all(
      depts.map(async d => {
        let units = await gasList('units', { department_id: d.department_id });

        // Non-super: restrict to own unit too (if present)
        if (!isSuper(auth) && auth?.unit_id) {
          units = units.filter(u => String(u.unit_id) === String(auth.unit_id));
        }
        return { dept: d, units };
      })
    );

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
        parts.push(`
          <li class="nav-item">
            <a href="#"><span class="item-name text-muted ps-4">— គ្មានផ្នែក</span></a>
          </li>`);
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
    box.innerHTML = `
      <li class="nav-item">
        <a href="#"><span class="item-name text-danger">បរាជ័យ៖ ${err.message}</span></a>
      </li>`;
  }
}

// Settings submenu (role-aware)
export async function buildSettingsMenu(targetUlId = 'settingsMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  const auth = getAuth();
  const ITEMS = [
    { key: 'indicators',  label: 'សូចនាករ',   icon: 'i-Bar-Chart', href: '#/settings/indicators' },
    { key: 'departments', label: 'នាយកដ្ឋាន',  icon: 'i-Building',  href: '#/settings/departments' },
    { key: 'units',       label: 'ផ្នែក',      icon: 'i-Right',     href: '#/settings/units' },
    { key: 'periods',     label: 'រយៈពេល',    icon: 'i-Calendar',  href: '#/settings/periods' },
  ];

  let visible = [];
  if (isSuper(auth)) {
    visible = ITEMS;                       // Super → all
  } else if (isDataEntry(auth)) {
    visible = ITEMS.filter(x => x.key === 'indicators'); // Data entry → only indicators
  } else {
    visible = ITEMS.filter(x => x.key === 'indicators'); // Default fallback
  }

  if (!visible.length) {
    box.innerHTML = `<li class="nav-item">
      <span class="item-name text-muted">គ្មានសិទ្ធិ</span></li>`;
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