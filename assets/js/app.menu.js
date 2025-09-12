// assets/js/app.menu.js
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';
//import { getAuth } from './app.auth.js';

/* Save (Add/Update) via op=upsert */
export async function gasSave(route, data) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'upsert');

  // ផ្ញើ token ទៅ server ដើម្បី backend អាចកំណត់សិទ្ធិ
  const auth = getAuth();
  const payload = { ...data, token: auth?.token || '' };

  const r = await fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // ងាយស្រួល debug
    body: JSON.stringify(payload)
  });
  const txt = await r.text();
  const j = JSON.parse(txt || '{}');
  if (j.error) throw new Error(j.error);
  return j;
}

/* Delete via op=delete — ត្រូវបញ្ជាក់ idField ត្រឹមត្រូវ */
export async function gasDelete(route, idField, id) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'delete');

  // id field តាមតារាង (ឧ. indicator_id)
  u.searchParams.set(idField, id);

  // ផ្ញើ token
  const auth = getAuth();
  if (auth?.token) u.searchParams.set('token', auth.token);

  const r = await fetch(u);
  const txt = await r.text();
  const j = JSON.parse(txt || '{}');
  if (j.error) throw new Error(j.error);
  return j;
}

/* ------------------ Save (Add/Update) ------------------ */
export async function gasSave(route, data) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'save');

  const r = await fetch(u, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' }
  });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (j.error) throw new Error(j.error);
    return j;
  } catch (e) {
    console.error('gasSave parse error:', e, 'raw:', txt);
    throw e;
  }
}

/* ------------------ Delete ------------------ */
export async function gasDelete(route, id) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api', '1');
  u.searchParams.set('route', route);
  u.searchParams.set('op', 'delete');
  u.searchParams.set('id', id);

  const r = await fetch(u);
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (j.error) throw new Error(j.error);
    return j;
  } catch (e) {
    console.error('gasDelete parse error:', e, 'raw:', txt);
    throw e;
  }
}

/* ------------------ Role helpers ------------------ */
function isDataEntry(auth) {
  const role = String(auth?.role || '').toLowerCase();
  if (role === 'dataentry' || role === 'data_entry') return true;
  if (Array.isArray(auth?.roles)) {
    return auth.roles.map(r => String(r).toLowerCase()).includes('dataentry');
  }
  return false;
}

/* ------------------ Departments/Units submenu ------------------ */
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

    // Non-super: មើលតែ department របស់ខ្លួន
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id) === String(auth.department_id));
    }

    if (!depts.length) {
      box.innerHTML = `
        <li class="nav-item">
          <a href="#"><span class="item-name text-muted">គ្មានទិន្នន័យ</span></a>
        </li>
      `;
      return;
    }

    // ទាញ units រួមៗ
    const results = await Promise.all(
      depts.map(async d => {
        let units = await gasList('units', { department_id: d.department_id });

        // Non-super: បើមាន unit_id ក៏ filter units ផង
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
          </li>
        `);
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
      </li>
    `;
  }
}

/* ------------------ Settings submenu (role-aware) ------------------ */
export async function buildSettingsMenu(targetUlId = 'settingsMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  const auth = getAuth();

  const itemsAll = [
    { key: 'indicators',  label: 'សូចនាករ',  icon: 'i-Bar-Chart', href: '#/settings/indicators' },
    { key: 'departments', label: 'នាយកដ្ឋាន', icon: 'i-Building',  href: '#/settings/departments' },
    { key: 'units',       label: 'ផ្នែក',     icon: 'i-Right',     href: '#/settings/units' },
    { key: 'periods',     label: 'រយៈពេល',   icon: 'i-Calendar',  href: '#/settings/periods' },
  ];

  let visible = [];
  if (isSuper(auth)) visible = itemsAll;                         // Super → ទាំងអស់
  else if (isDataEntry(auth)) visible = itemsAll.filter(x => x.key === 'indicators'); // DataEntry → តែ Indicators
  else visible = itemsAll.filter(x => x.key === 'indicators');   // Default → តែ Indicators

  if (!visible.length) {
    box.innerHTML = `<li><span class="item-name text-muted">គ្មានសិទ្ធិ</span></li>`;
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




