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
  if (isSuper(auth)) {
    visible = itemsAll; // Super admin: all
  } else if (isDataEntry(auth)) {
    visible = itemsAll.filter(x=>x.key==='indicators'); // Data Entry: only indicators
  } else {
    visible = itemsAll.filter(x=>x.key==='indicators'); // others: only indicators
  }

  if (!visible.length) {
    box.innerHTML = `<li><span class="item-name text-muted">គ្មានសិទ្ធិ</span></li>`;
    return;
  }

  box.innerHTML = visible.map(it=>`
    <li class="nav-item">
      <a href="${it.href}">
        <i class="nav-icon ${it.icon}"></i>
        <span class="item-name">${it.label}</span>
      </a>
    </li>
  `).join('');
}
