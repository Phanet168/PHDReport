// assets/js/app.menu.js
// Build Department submenu (with Units + Indicators) and respect user role

import { getAuth, isSuper } from './app.auth.js';

// ---- GAS endpoint (update if you redeploy)
const GAS_BASE = "https://script.google.com/macros/s/AKfycbwkhRDOYDKb5nqGEhxNKGbHnpoZNGmN4GJlv0-8FTQXNGqJIV1Xfy9XLkXwNfGepC3prQ/exec";

// ---- Small helper to fetch list from GAS (auto-attach token)
async function gasList(route, params = {}) {
  const auth = getAuth();
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'list');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  if (auth?.token) u.searchParams.set('token', auth.token);   // pass token if available

  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return Array.isArray(j.rows) ? j.rows : (Array.isArray(j) ? j : []);
}

/**
 * Render departments + units + indicators in the secondary sidebar.
 * - Super: see all departments
 * - Non-super: filtered by auth.department_id
 * - Each department shows its Units, then Indicators (both filtered by department_id)
 *
 * @param {string} targetUlId  UL element id to render into (default: 'deptMenu')
 */
export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  const auth = getAuth();
  box.innerHTML = '<li class="nav-item"><a href="#"><span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span></a></li>';

  try {
    // 1) Departments
    let depts = await gasList('departments');

    // limit by department for non-super
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }

    if (!depts.length) {
      box.innerHTML = '<li class="nav-item"><a href="#"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></a></li>';
      return;
    }

    const parts = [];
    for (const d of depts) {
      // Department node
      parts.push(`
        <li class="nav-item">
          <a href="pages/departments/${d.department_id}/index.html">
            <i class="nav-icon i-Building"></i>
            <span class="item-name">${d.department_name}</span>
          </a>
        </li>
      `);

      // 2) Units under department
      const units = await gasList('units', { department_id: d.department_id });
      if (units.length) {
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
      } else {
        parts.push(`<li class="nav-item"><a href="#"><span class="item-name text-muted ps-4">— គ្មានផ្នែក</span></a></li>`);
      }

      // 3) Indicators under department
      const indicators = await gasList('indicators', { department_id: d.department_id });
      if (indicators.length) {
        for (const ind of indicators) {
          parts.push(`
            <li class="nav-item">
              <a href="pages/departments/${d.department_id}/indicators/${ind.indicator_id}/index.html">
                <i class="nav-icon i-Right"></i>
                <span class="item-name ps-3">${ind.indicator_name}</span>
              </a>
            </li>
          `);
        }
      } else {
        parts.push(`<li class="nav-item"><a href="#"><span class="item-name text-muted ps-4">— គ្មានសូចនាករ</span></a></li>`);
      }
    }

    box.innerHTML = parts.join('');
  } catch (err) {
    box.innerHTML = `<li class="nav-item"><a href="#"><span class="item-name text-danger">បរាជ័យ: ${err.message}</span></a></li>`;
  }
}
