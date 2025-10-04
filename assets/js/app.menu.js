// assets/js/app.menu.js
import { getAuth, isSuper } from './app.auth.js';
import { gasList, gasSave, gasDelete, ID_FIELDS } from './app.api.firebase.js'; // ✅ ប្តូរទៅ firebase api


/* ============================== */
/* Shared (ID fields passthrough) */
/* ============================== */
export { ID_FIELDS };
export function getIdField(route){ return ID_FIELDS[route] || 'id'; }

/* ============================== */
/* Small helpers                  */
/* ============================== */
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
const withJitter = (ms)=> ms + Math.floor(Math.random()*120);

async function withRetry(fn, tries=3){
  let last;
  for (let i=0;i<tries;i++){
    try { return await fn(); }
    catch(e){ last=e; if (i<tries-1) await sleep(withJitter(300*Math.pow(2,i))); }
  }
  throw last;
}

/* Thin wrappers */
export const gasListSafe   = (route, params={})     => withRetry(()=>gasList(route, params));
export const gasSaveSafe   = (route, payload={})    => withRetry(()=>gasSave(route, payload));
export const gasDeleteSafe = (route, idField, idVal)=> withRetry(()=>gasDelete(route, idField, idVal));

/* ============================== */
/* Role helpers                   */
/* ============================== */
export function isViewer(auth){
  const role = String(auth?.role || '').toLowerCase();
  return role === 'viewer';
}
export function isDataEntry(auth){
  const role = String(auth?.role || '').toLowerCase();
  if (role === 'dataentry' || role === 'data_entry') return true;
  if (Array.isArray(auth?.roles)) {
    return auth.roles.map(r => String(r).toLowerCase()).includes('dataentry');
  }
  return false;
}

/* ============================== */
/* Indicators helper              */
/* ============================== */
export async function listMyIndicators(){
  const auth  = getAuth();
  const SUPER = isSuper(auth);
  let rows = await gasListSafe('indicators').catch(()=>[]);
  if (!SUPER){
    if (auth?.department_id) rows = rows.filter(r => String(r.department_id) === String(auth.department_id));
    if (auth?.unit_id)       rows = rows.filter(r => String(r.unit_id || '') === String(auth.unit_id));
    if (auth?.user_id)       rows = rows.filter(r => String(r.owner_id || '') === String(auth.user_id));
  }
  return rows;
}

/* ============================== */
/* Menu skeleton helper           */
/* ============================== */
const menuSkeleton = (n=3)=>
  Array.from({length:n})
    .map(()=>`<li class="nav-item"><span class="item-name skeleton skeleton-text"></span></li>`)
    .join('');

/* ============================== */
/* Depts submenu → now single link */
/* ============================== */
export async function buildDeptMenu(targetUlId='deptMenu'){
  const box = document.getElementById(targetUlId);
  if (!box) return;
  box.innerHTML = menuSkeleton(1);

  try{
    const auth   = getAuth();
    const viewer = isViewer(auth);

    const link = viewer
      ? { href:'#/reports', icon:'i-Bar-Chart', text:'មើលរបាយការណ៍' }
      : { href:'#/data-entry', icon:'i-File-Clipboard-File--Text', text:'បញ្ចូលរបាយការណ៍' };

    box.innerHTML = `
      <li class="nav-item">
        <a href="${link.href}" data-menu-link>
          <i class="nav-icon ${link.icon}"></i>
          <span class="item-name">${link.text}</span>
        </a>
      </li>`;

    // active state
    const setActive = ()=>{
      const a = box.querySelector('[data-menu-link]');
      if (!a) return;
      a.classList.toggle('active', a.getAttribute('href') === (location.hash || '#/'));
    };
    setActive();
    window.addEventListener('hashchange', setActive);

  }catch(err){
    console.error('buildDeptMenu failed:', err);
    box.innerHTML = `
      <li class="nav-item">
        <a href="#" id="retry-${targetUlId}">
          <span class="item-name text-danger">បរាជ័យក្នុងការទាញម៉ឺនុយ — ចុចដើម្បីសាកម្ដងទៀត</span>
        </a>
      </li>`;
    document.getElementById(`retry-${targetUlId}`)?.addEventListener('click', e=>{
      e.preventDefault(); buildDeptMenu(targetUlId);
    });
  }
}

/* ============================== */
/* Settings submenu (role-based)  */
/* ============================== */
export async function buildSettingsMenu(targetUlId='settingsMenu'){
  const box = document.getElementById(targetUlId);
  if (!box) return;
  box.innerHTML = menuSkeleton(1);

  try{
    const auth   = getAuth();
    const SUPER  = isSuper(auth);
    const viewer = isViewer(auth);

    if (viewer){
      box.innerHTML = '';
      return;
    }

    if (SUPER){
      const items = [
        { label:'អ្នកប្រើប្រាស់',  icon:'i-Administrator', href:'#/settings/users' },
        { label:'សូចនាករ',      icon:'i-Bar-Chart',     href:'#/settings/indicators' },
        { label:'ជំពូក',        icon:'i-Library',       href:'#/settings/departments' },
        { label:'ផ្នែក',        icon:'i-Network',       href:'#/settings/units' },
        { label:'រយៈពេល',      icon:'i-Calendar-4',    href:'#/settings/periods' },
      ];
      box.innerHTML = [
        `<li class="nav-item mt-2 mb-1">
           <span class="text-uppercase text-muted small ps-3">ការកំណត់ (Settings)</span>
         </li>`,
        ...items.map(it=>`
          <li class="nav-item">
            <a href="${it.href}" data-menu-link>
              <i class="nav-icon ${it.icon}"></i>
              <span class="item-name">${it.label}</span>
            </a>
          </li>`),
      ].join('');
    }else{
      box.innerHTML = `
        <li class="nav-item mt-2 mb-1">
          <span class="text-uppercase text-muted small ps-3">ការកំណត់ (Settings)</span>
        </li>
        <li class="nav-item">
          <a href="#/settings/indicators" data-menu-link>
            <i class="nav-icon i-Bar-Chart"></i>
            <span class="item-name">សូចនាករ</span>
          </a>
        </li>`;
    }

    // active state for settings
    const setActive = ()=>{
      box.querySelectorAll('[data-menu-link]').forEach(a=>{
        a.classList.toggle('active', a.getAttribute('href') === (location.hash || '#/'));
      });
    };
    setActive();
    window.addEventListener('hashchange', setActive);

  }catch(err){
    console.error('buildSettingsMenu failed:', err);
    box.innerHTML = `
      <li class="nav-item">
        <a href="#" id="retry-${targetUlId}">
          <span class="item-name text-danger">បរាជ័យក្នុងការទាញម៉ឺនុយ — ចុចដើម្បីសាកម្ដងទៀត</span>
        </a>
      </li>`;
    document.getElementById(`retry-${targetUlId}`)?.addEventListener('click', e=>{
      e.preventDefault(); buildSettingsMenu(targetUlId);
    });
  }
}

/* ============================== */
/* Optional helpers               */
/* ============================== */
export async function initMenus(){
  await Promise.allSettled([
    buildDeptMenu('deptMenu'),
    buildSettingsMenu('settingsMenu'),
  ]);
}
export function clearMenuCache(){ /* no-op */ }
