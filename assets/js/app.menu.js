// assets/js/app.menu.js
// ------------------------------------------------------------
// Client helpers for GAS API + Menus (role-aware)
// ------------------------------------------------------------
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* ============================================================
 * Constants
 * ========================================================== */
export const ID_FIELDS = {
  users: 'user_id',
  departments: 'department_id',
  units: 'unit_id',
  periods: 'period_id',
  indicators: 'indicator_id',
  reports: 'report_id',
  issues: 'issue_id',     // ✅ FIX: server uses issue_id
  actions: 'action_id',
};

/* ============================================================
 * Small guards
 * ========================================================== */
function requireGAS() {
  const base = (typeof window !== 'undefined' && window.GAS_BASE) || GAS_BASE || '';
  if (!base) throw new Error('GAS_BASE not configured');
  return base;
}
function currentToken() {
  try { return getAuth()?.token || ''; } catch { return ''; }
}

/* ============================================================
 * Shared fetch helpers
 * ========================================================== */

/** GET list (auto-attaches token for server-side ACL) */
export async function gasList(route, params = {}) {
  const base = requireGAS();
  const u = new URL(base);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'list');

  // attach filters
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });

  // attach token
  const token = currentToken();
  if (token) u.searchParams.set('token', token);

  const r = await fetch(u.toString(), { cache: 'no-store' });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt || '{}'); } catch {
    console.error('[gasList] JSON parse error. raw:', txt);
    throw new Error('Invalid JSON from server');
  }
  if (!r.ok || j?.error) {
    const msg = j?.error || `HTTP ${r.status}`;
    console.error('[gasList] error =>', msg);
    throw new Error(msg);
  }
  // server: { rows, total, ... } or []
  if (Array.isArray(j)) return j;
  return Array.isArray(j.rows) ? j.rows : [];
}

/** UPSERT (Add/Update) -> op=upsert + token */
export async function gasSave(route, data) {
  const base = requireGAS();
  const u = new URL(base);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'upsert');

  // attach token for ACL
  const token = currentToken();
  const payload = { ...data, token };

  const r = await fetch(u.toString(), {
    method: 'POST',
    // ⚠️ server recommends text/plain to avoid preflight (see safeJson_)
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt || '{}'); } catch {
    console.error('[gasSave] JSON parse error. raw:', txt);
    throw new Error('Invalid JSON from server');
  }
  if (!r.ok || j?.error) {
    const msg = j?.error || `HTTP ${r.status}`;
    console.error('[gasSave] error =>', msg);
    throw new Error(msg);
  }
  // server: { row: {...} }
  return j.row || j;
}

/** DELETE -> you MUST pass the correct idField name (e.g. 'indicator_id') */
export async function gasDelete(route, idField, idVal) {
  const base = requireGAS();
  const key = idField || ID_FIELDS[route] || 'id';

  const u = new URL(base);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'delete');
  u.searchParams.set(key, idVal);

  const token = currentToken();
  if (token) u.searchParams.set('token', token);

  // Use POST to align with server write ops
  const r = await fetch(u.toString(), { method: 'POST', cache: 'no-store' });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt || '{}'); } catch {
    console.error('[gasDelete] JSON parse error. raw:', txt);
    throw new Error('Invalid JSON from server');
  }
  if (!r.ok || j?.error) {
    const msg = j?.error || `HTTP ${r.status}`;
    console.error('[gasDelete] error =>', msg);
    throw new Error(msg);
  }
  return j; // { ok: true }
}

/** Optional: bulk import helper (super/scoped write) */
export async function gasImport(route, records = []) {
  const base = requireGAS();
  const u = new URL(base);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'import');

  const token = currentToken();
  const payload = Array.isArray(records) ? records : [];
  // server will inject department for scoped non-super; include token in body
  const r = await fetch(u.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ token, ...{ records: undefined } }) // token is in body if server reads; but server reads body array directly
  });

  // NOTE: server expects body as pure array; send separately:
  // -> we need a second call that actually sends the array (without wrapper)
  // but since server code checks `Array.isArray(body)` already,
  // we do a proper request here:
  const r2 = await fetch(u.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(records.concat()) // pure array
  });
  const txt = await r2.text();
  let j;
  try { j = JSON.parse(txt || '{}'); } catch {
    console.error('[gasImport] JSON parse error. raw:', txt);
    throw new Error('Invalid JSON from server');
  }
  if (!r2.ok || j?.error) {
    const msg = j?.error || `HTTP ${r2.status}`;
    console.error('[gasImport] error =>', msg);
    throw new Error(msg);
  }
  return j; // { ok:true, count:n }
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

/** Departments/Units submenu (role filtered) */
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

/** Settings submenu (role-aware) */
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
    visible = ITEMS.filter(x => x.key === 'indicators'); // DataEntry → only indicators
  } else {
    visible = ITEMS.filter(x => x.key === 'indicators'); // Viewer → indicators read-only (UI hides create buttons elsewhere)
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
