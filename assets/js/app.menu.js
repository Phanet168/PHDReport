// assets/js/app.menu.js
import { GAS_BASE } from './config.js';
import { getAuth, isSuper } from './app.auth.js';

/* ------------------ Shared fetch helper ------------------ */
export async function gasList(route, params = {}) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api','1');
  u.searchParams.set('route', route);
  u.searchParams.set('op','list');
  Object.entries(params).forEach(([k,v])=>{
    if(v!==undefined && v!==null && v!=='') u.searchParams.set(k, v);
  });

  const r = await fetch(u, { cache:'no-store' });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (j.error) throw new Error(j.error);
    return Array.isArray(j.rows) ? j.rows : (Array.isArray(j) ? j : []);
  } catch (e) {
    console.error('gasList parse error:', e, 'raw:', txt);
    return [];
  }
}

/* ------------------ Role helpers ------------------ */
function isDataEntry(auth) {
  const role = String(auth?.role || '').toLowerCase();
  if (role==='dataentry' || role==='data_entry') return true;
  if (Array.isArray(auth?.roles)) {
    return auth.roles.map(r=>String(r).toLowerCase()).includes('dataentry');
  }
  return false;
}

/* ------------------ Departments/Units submenu ------------------ */
export async function buildDeptMenu(targetUlId='deptMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  box.innerHTML = `<li><span class="item-name text-muted">កំពុងទាញទិន្នន័យ...</span></li>`;
  const auth = getAuth();

  try {
    let depts = await gasList('departments');
    // Super អាចឃើញទាំងអស់
    if (!isSuper(auth) && auth?.department_id) {
      depts = depts.filter(d => String(d.department_id)===String(auth.department_id));
    }

    if (!depts.length) {
      box.innerHTML = `<li><span class="item-name text-muted">គ្មានទិន្នន័យ</span></li>`;
      return;
    }

    const jobs = depts.map(d =>
      gasList('units',{department_id:d.department_id})
        .then(rows=>({dept:d,units:rows||[]}))
        .catch(()=>({dept:d,units:[]}))
    );
    const results = await Promise.all(jobs);

    box.innerHTML = results.map(({dept,units})=>{
      let html = `
        <li class="nav-item">
          <a href="#"><i class="nav-icon i-Building"></i><span class="item-name">${dept.department_name}</span></a>
        </li>`;
      if (units.length) {
        html += units.map(u=>`
          <li class="nav-item ps-3">
            <a href="pages/departments/${dept.department_id}/units/${u.unit_id}/index.html">
              <i class="nav-icon i-Right"></i><span class="item-name">${u.unit_name}</span>
            </a>
          </li>`).join('');
      }
      return html;
    }).join('');
  } catch (err) {
    box.innerHTML = `<li><span class="item-name text-danger">បរាជ័យ: ${err.message}</span></li>`;
  }
}
/* ------------------ Save (Add/Update) ------------------ */
export async function gasSave(route, data) {
  const u = new URL(GAS_BASE);
  u.searchParams.set('api','1');
  u.searchParams.set('route', route);
  u.searchParams.set('op','save');

  const r = await fetch(u, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type':'application/json' }
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
  u.searchParams.set('api','1');
  u.searchParams.set('route', route);
  u.searchParams.set('op','delete');
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


/* ------------------ Settings submenu (role-aware) ------------------ */
export async function buildSettingsMenu(targetUlId='settingsMenu') {
  const box = document.getElementById(targetUlId);
  if (!box) return;

  const auth = getAuth();

  const itemsAll = [
    { key:'indicators',  label:'សូចនាករ',  icon:'i-Bar-Chart', href:'#/settings/indicators' },
    { key:'departments', label:'នាយកដ្ឋាន', icon:'i-Building',  href:'#/settings/departments' },
    { key:'units',       label:'ផ្នែក',     icon:'i-Right',     href:'#/settings/units' },
    { key:'periods',     label:'រយៈពេល',   icon:'i-Calendar',  href:'#/settings/periods' },
  ];

  let visible = [];
  if (isSuper(auth)) visible = itemsAll;
  else if (isDataEntry(auth)) visible = itemsAll.filter(x=>x.key==='indicators');
  else visible = itemsAll.filter(x=>x.key==='indicators');

  if (!visible.length) {
    box.innerHTML = `<li><span class="item-name text-muted">គ្មានសិទ្ធិ</span></li>`;
    return;
  }

  box.innerHTML = visible.map(it=>`
    <li class="nav-item">
      <a href="${it.href}"><i class="nav-icon ${it.icon}"></i><span class="item-name">${it.label}</span></a>
    </li>
  `).join('');
}

