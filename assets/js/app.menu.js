// assets/js/app.menu.js
import { getAuth, isSuper } from './app.auth.js';

// !! ប្រើ URL /exec ដែលអ្នកបាន deploy ចុងក្រោយ
import { GAS_BASE } from './config.js';   // <— ប្រើ URL ដូចគ្នា


async function gasList(route, params = {}) {
  const auth = getAuth();
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'list');
  Object.entries(params).forEach(([k,v])=>{
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  if (auth?.token) u.searchParams.set('token', auth.token);

  console.log('[GAS] GET', u.toString()); // 👈 debug network
  const r = await fetch(u.toString(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  const j = await r.json();
  if (j?.error) throw new Error(j.error);
  return Array.isArray(j.rows) ? j.rows : (Array.isArray(j) ? j : []);
}

export async function buildDeptMenu(targetUlId = 'deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;
  const auth = getAuth();

  box.innerHTML = `
    <li class="nav-item">
      <a href="pages/mgmt/departments.html">
        <i class="nav-icon i-Building"></i>
        <span class="item-name">គ្រប់គ្រងការិយាល័យ</span>
      </a>
    </li>
    <li class="nav-item"><a href="#"><span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span></a></li>
  `;

  try {
    let depts = await gasList('departments');

    // non-super មើលតែក្រុមរបស់ខ្លួន
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }

    const parts = [];
    if (!depts.length) {
      parts.push(`<li class="nav-item"><a href="#"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></a></li>`);
    } else {
      parts.push(`<li class="nav-item"><a href="#"><span class="item-name text-muted">បញ្ជីការិយាល័យ</span></a></li>`);
      for (const d of depts) {
        parts.push(`
          <li class="nav-item">
            <a href="#"><i class="nav-icon i-Building"></i><span class="item-name">${d.department_name}</span></a>
          </li>
        `);
        const units = await gasList('units', { department_id: d.department_id });
        if (!units.length) {
          parts.push(`<li class="nav-item"><a href="#"><span class="item-name text-muted ps-4">— គ្មានផ្នែក</span></a></li>`);
        } else {
          units.forEach(u=>{
            parts.push(`
              <li class="nav-item">
                <a href="pages/departments/${d.department_id}/units/${u.unit_id}/index.html">
                  <i class="nav-icon i-Right"></i><span class="item-name ps-3">${u.unit_name}</span>
                </a>
              </li>
            `);
          });
        }
      }
    }

    // រក្សាទុក link គ្រប់គ្រងជាជួរដំបូង
    const mgmt = box.firstElementChild?.outerHTML || '';
    box.innerHTML = mgmt + parts.join('');
  } catch (err) {
    console.error('Dept menu error:', err);
    box.innerHTML = `
      <li class="nav-item">
        <a href="#"><span class="item-name text-danger">បរាជ័យ៖ ${String(err.message || err)}</span></a>
      </li>
    `;
  }
}


