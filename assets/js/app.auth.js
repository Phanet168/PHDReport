// ============ AUTH CORE (LocalStorage) ============
// Structure AUTH: { user_id, user_name, user_type: 'superuser'|'admin'|'enduser', department_id, user_root }
const LS = window.localStorage;
export const getAuth = () => { try { return JSON.parse(LS.getItem('AUTH')||'null'); } catch { return null; } };
export const setAuth = (obj) => LS.setItem('AUTH', JSON.stringify(obj||null));
export const clearAuth = () => LS.removeItem('AUTH');

export const isSuper = (a) => !!a && (a.user_type === 'superuser' || a.user_root === 'all');
export const isAdmin = (a) => !!a && a.user_type === 'admin';
export const isEnd   = (a) => !!a && a.user_type === 'enduser';

// Guard utility
export function requireRole(roles = []) {
  const auth = getAuth();
  if (!auth) return { ok:false, reason: 'NO_LOGIN' };
  if (roles.length === 0) return { ok:true, auth };
  if (roles.includes('superuser') && isSuper(auth)) return { ok:true, auth };
  if (roles.includes('admin') && isAdmin(auth)) return { ok:true, auth };
  if (roles.includes('enduser') && isEnd(auth)) return { ok:true, auth };
  return { ok:false, reason: 'NO_PERMISSION', auth };
}

// Quick apply on header button (reuseable)
export function applyLoginButton(btnEl) {
  const auth = getAuth();
  if (auth) {
    btnEl.textContent = (auth.user_name||'អ្នកប្រើ') + ' • ចេញ';
    btnEl.classList.remove('btn-outline-primary');
    btnEl.classList.add('btn-outline-danger');
    btnEl.href = '#';
    btnEl.onclick = (e)=>{ e.preventDefault(); clearAuth(); location.href = './login.html'; };
  } else {
    btnEl.textContent = 'ចូលប្រើប្រាស់';
    btnEl.classList.add('btn-outline-primary');
    btnEl.classList.remove('btn-outline-danger');
    btnEl.href = 'login.html';
    btnEl.onclick = null;
  }
}
