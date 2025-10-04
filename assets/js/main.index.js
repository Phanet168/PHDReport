// assets/js/main.index.js
// ✅ នាំចូលពី app.auth.js (relative from same folder)
import { getAuth, ensureLoggedIn, applyLoginButton, isSuper, whenAuthReady } from "./app.auth.js";
import { gasList } from "./app.api.firebase.js";

/* Loader */
const AppLoader = (() => {
  let n = 0;
  const el = document.getElementById('appLoading');
  const textEl = document.getElementById('appLoadingText');
  const show = (m) => { n++; if (m && textEl) textEl.textContent = m; el?.classList.remove('hidden'); };
  const hide = () => { n = Math.max(0, n-1); if (!n) el?.classList.add('hidden'); };
  const wrap = async (p, m) => { show(m); try { return await p; } finally { hide(); } };
  return { show, hide, wrap };
})();

/* -------- Auth gate -------- */
await whenAuthReady();
applyLoginButton(document.getElementById('btnLogin'));
await ensureLoggedIn('login.html');
document.body?.removeAttribute('data-auth'); // បើ body[data-auth="checking"]

/* -------- Header / user box -------- */
function refreshHeader(){
  const a = getAuth();
  const nameEl= document.getElementById('userName');
  const roleEl= document.getElementById('userRole');
  const avatar= document.getElementById('userAvatar');

  const displayName = a?.full_name || a?.user_name || a?.username || 'អ្នកប្រើប្រាស់';
  const role = String(a?.role || 'viewer').toLowerCase();

  if (nameEl) nameEl.textContent = displayName;
  if (roleEl){
    roleEl.textContent = role;
    roleEl.className   = 'badge-role ' + (
      role === 'super' ? 'bg-primary text-white' :
      role === 'admin' ? 'bg-success text-white' :
      'bg-light text-secondary'
    );
  }
  if (avatar){
    const letter = (displayName.match(/[A-Za-zក-ហ]/) || ['U'])[0].toUpperCase();
    avatar.textContent = letter;
  }
  document.querySelectorAll('.menu-super-only')
    .forEach(el => { el.style.display = (role === 'super') ? '' : 'none'; });
}

/* -------- Menus -------- */
async function buildDeptMenu(target='deptMenu'){
  const ul = document.getElementById(target);
  if (!ul) return;
  ul.innerHTML = `<li class="nav-item"><span class="item-name skeleton skeleton-text"></span></li>`;
  try{
    const rows = await gasList('departments', {});
    rows.sort((a,b)=> String(a.department_name||'').localeCompare(String(b.department_name||'')));
    ul.innerHTML = rows.length
      ? rows.map(r=>`
        <li class="nav-item">
          <a href="#/depts/${r.department_id}">
            <i class="nav-icon i-Arrow-Right-in-Circle"></i>
            <span class="item-name">${r.department_name || ('Dept '+r.department_id)}</span>
          </a>
        </li>`).join('')
      : `<li class="nav-item text-muted px-3 py-2">គ្មានទិន្នន័យ</li>`;
  }catch(e){
    console.error('departments load failed:', e);
    ul.innerHTML = `<li class="nav-item text-danger px-3 py-2">បរាជ័យក្នុងការផ្ទុកផ្នែក</li>`;
  }
}

function buildSettingsMenu(target='settingsMenu'){
  const ul = document.getElementById(target);
  if (!ul) return;
  const a = getAuth();
  const role = String(a?.role||'viewer').toLowerCase();
  const canAdmin = role==='super' || role==='admin';

  const items = [
    { href:'#/settings/indicators',  icon:'i-Bar-Chart',     text:'សូចនាករ',          show: canAdmin },
    { href:'#/settings/departments', icon:'i-Library',       text:'ជំពូក',             show: canAdmin },
    { href:'#/settings/units',       icon:'i-Network',       text:'ជំពូករង',          show: canAdmin },
    { href:'#/settings/periods',     icon:'i-Calendar-4',    text:'រយៈពេល',          show: canAdmin },
    { href:'#/settings/users',       icon:'i-Administrator', text:'អ្នកប្រើប្រាស់',     show: role==='super' }
  ].filter(x=>x.show);

  ul.innerHTML = items.length
    ? items.map(i=>`<li class="nav-item"><a href="${i.href}"><i class="nav-icon ${i.icon}"></i><span class="item-name">${i.text}</span></a></li>`).join('')
    : `<li class="nav-item text-muted px-3 py-2">គ្មានសិទ្ធិកំណត់</li>`;
}

/* -------- First render -------- */
refreshHeader();
await AppLoader.wrap(Promise.all([ buildDeptMenu(), buildSettingsMenu() ]), 'កំពុងផ្ទុកទិន្នន័យ…');

/* -------- React to auth changes (no full reload) -------- */
window.addEventListener('auth:changed', async ()=>{
  refreshHeader();
  await buildDeptMenu();
  buildSettingsMenu();
});
