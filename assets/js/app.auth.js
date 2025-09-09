// assets/js/app.auth.js
// ===================== AUTH UTILITIES (front-end) =====================
// Source of truth = user_type (នៅក្នុង users.json / server response)

const LS = window.localStorage;

/** Get current auth object from localStorage */
export const getAuth = () => {
  try { return JSON.parse(LS.getItem('AUTH') || 'null'); }
  catch { return null; }
};

/** Save auth object (user, token, user_type, etc.) */
export const setAuth = (obj) => LS.setItem('AUTH', JSON.stringify(obj || null));

/** Clear auth */
export const clearAuth = () => LS.removeItem('AUTH');

/** Role helpers powered by user_type */
export const isSuper     = a => String(a?.user_type||'').toLowerCase() === 'superuser';
export const isDataEntry = a => ['admin','dataentry'].includes(String(a?.user_type||'').toLowerCase());
export const isViewer    = a => String(a?.user_type||'').toLowerCase() === 'viewer';

/** Convert user_type → normalized text role (for display/use if needed) */
export function roleOf(a) {
  if (isSuper(a)) return 'super';
  if (isDataEntry(a)) return 'dataentry';
  if (isViewer(a)) return 'viewer';
  return 'viewer';
}

/** After-login redirect by user_type */
export function gotoAfterLogin(auth){
  if (isSuper(auth))      return location.replace('index.html');
  if (isDataEntry(auth))  return location.replace('pages/admin/index.html');
  if (isViewer(auth))     return location.replace('pages/user/index.html');
  location.replace('index.html');
}

/**
 * Guard page: require auth and (optionally) restrict by allowedRoles.
 * Example:
 *   requireAuth({ allowed: ['super','dataentry'] })  // block viewer
 */
export function requireAuth(opts = {}){
  const { allowed = ['super','dataentry','viewer'], redirect = '../../login.html' } = opts;
  const a = getAuth();
  if (!a) { location.replace(redirect); return null; }
  const r = roleOf(a);
  if (!allowed.includes(r)) {
    alert('មិនមានសិទ្ធិចូលទំព័រនេះ');
    // បង្វែរតាម user_type ផ្ទាល់
    gotoAfterLogin(a);
    return null;
  }
  return a;
}

/** Attach token to URL as &token=...  (for GET endpoints) */
export function authTokenParam() {
  const t = getAuth()?.token || '';
  return t ? `&token=${encodeURIComponent(t)}` : '';
}

/** Apply login/logout button behavior on any button/anchor element */
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
export function logout() {
  // Clear token/localStorage
  window.localStorage.removeItem('auth');
  window.localStorage.removeItem('user');

  // Redirect ទៅ login.html
  window.location.replace('login.html');
}


