// assets/js/app.auth.js
const LS = window.localStorage;

export const getAuth = () => { try { return JSON.parse(LS.getItem('AUTH')||'null'); } catch { return null; } };
export const setAuth = (obj) => LS.setItem('AUTH', JSON.stringify(obj||null));
export const clearAuth = () => LS.removeItem('AUTH');

// >>> Core change: ស្វែងយល់តាម user_type
export const isSuper     = a => String(a?.user_type||'').toLowerCase() === 'superuser';
export const isDataEntry = a => ['admin','dataentry'].includes(String(a?.user_type||'').toLowerCase());
export const isViewer    = a => String(a?.user_type||'').toLowerCase() === 'viewer';

export function gotoAfterLogin(auth){
  if (isSuper(auth))      return location.replace('index.html');
  if (isDataEntry(auth))  return location.replace('pages/admin/index.html');
  if (isViewer(auth))     return location.replace('pages/user/index.html');
  location.replace('index.html');
}

export function applyLoginButton(btnEl){
  const auth = getAuth();
  if (auth){
    btnEl.textContent = (auth.display_name||auth.user_name||'អ្នកប្រើ') + ' • ចេញ';
    btnEl.classList.remove('btn-outline-primary');
    btnEl.classList.add('btn-outline-danger');
    btnEl.href = '#';
    btnEl.onclick = (e)=>{ e.preventDefault(); clearAuth(); location.replace('../../login.html'); };
  } else {
    btnEl.textContent = 'ចូលប្រើប្រាស់';
    btnEl.classList.add('btn-outline-primary');
    btnEl.classList.remove('btn-outline-danger');
    btnEl.href = '../../login.html';
    btnEl.onclick = null;
  }
}
