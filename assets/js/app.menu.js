import { getAuth, isSuper } from './app.auth.js';

const GAS_BASE = "https://script.google.com/macros/s/AKfycbwkhRDOYDKb5nqGEhxNKGbHnpoZNGmN4GJlv0-8FTQXNGqJIV1Xfy9XLkXwNfGepC3prQ/exec";

async function gasList(route, params = {}) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'list');
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return Array.isArray(j.rows) ? j.rows : (Array.isArray(j) ? j : []);
}

export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;
  box.innerHTML = '<li class="nav-item"><a href="#"><span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span></a></li>';
  const auth = getAuth();
  try {
    let depts = await gasList('departments');
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }
    if (!depts.length) {
      box.innerHTML = '<li class="nav-item"><a href="#"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></a></li>';
      return;
    }
    const items = [];
    for (const d of depts) {
      items.push(`
        <li class="nav-item">
          <a href="#"><i class="nav-icon i-Building"></i><span class="item-name">${d.department_name}</span></a>
        </li>
      `);
      const units = await gasList('units', { department_id: d.department_id });
      if (!units.length) {
        items.push(`<li class="nav-item"><a href="#"><span class="item-name text-muted ps-4">— គ្មានផ្នែក</span></a></li>`);
      } else {
        for (const u of units) {
          items.push(`
            <li class="nav-item">
              <a href="pages/departments/${d.department_id}/units/${u.unit_id}/index.html">
                <i class="nav-icon i-Right"></i><span class="item-name ps-3">${u.unit_name}</span>
              </a>
            </li>
          `);
        }
      }
    }
    box.innerHTML = items.join('');
  } catch (err) {
    box.innerHTML = `<li class="nav-item"><a href="#"><span class="item-name text-danger">បរាជ័យ: ${err.message}</span></a></li>`;
  }
}



