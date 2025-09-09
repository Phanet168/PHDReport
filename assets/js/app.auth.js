/* ======================================================================
 * PHD Report – Auth helper (ES Module)
 * Path: assets/js/app.auth.js
 * ==================================================================== */

const LS_KEY = 'phd_auth';   // localStorage key we use to store auth

/* ---------- Storage helpers ---------- */
export function setAuth(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj || null)); }
  catch (_) {}
}

export function getAuth() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw);
    // expired token guard (if server sends exp=unix seconds)
    if (a && a.exp && Number(a.exp) < Math.floor(Date.now()/1000)) {
      clearAuth();
      return null;
    }
    return a;
  } catch (_) {
    return null;
  }
}

export function clearAuth() {
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
}

/* ---------- Roles ---------- */
export function isSuper(a = getAuth()) {
  const t = String(a?.user_type || '').toLowerCase();
  return t === 'superuser' || a?.user_root === 'all' || a?.role === 'super';
}
export function isDataEntry(a = getAuth()) {
  const t = String(a?.user_type || '').toLowerCase();
  return t === 'admin' || t === 'dataentry' || a?.role === 'dataentry';
}
export function isViewer(a = getAuth()) {
  const t = String(a?.user_type || '').toLowerCase();
  return t === 'viewer' || (!isSuper(a) && !isDataEntry(a));
}

/* ---------- Post-login redirect ---------- */
export function gotoAfterLogin(auth = getAuth()) {
  // You can adjust paths to match your project
  if (isSuper(auth))       return location.replace('index.html');
  if (isDataEntry(auth))   return location.replace('pages/admin/index.html');
  if (isViewer(auth))      return location.replace('pages/user/index.html');
  return location.replace('index.html');
}

/* ---------- Logout with redirect ---------- */
export function logout(redirect = 'login.html') {
  clearAuth();
  // hard redirect so all modules reload fresh
  location.replace(redirect);
}

/* ---------- Login button wiring ---------- */
/**
 * Turn a <a id="btnLogin"> into login / logout UI.
 * - If not logged in → "ចូលប្រើប្រាស់" and link to login.html
 * - If logged in     → "username • ចេញ" and logout on click
 */
export function applyLoginButton(btn) {
  if (!btn) return;
  const auth = getAuth();

  if (!auth) {
    btn.textContent = 'ចូលប្រើប្រាស់';
    btn.classList.remove('btn-outline-danger');
    btn.classList.add('btn-outline-primary');
    btn.href = 'login.html';
    btn.onclick = null;
    return;
  }

  btn.textContent = `${auth.user_name || 'អ្នកប្រើ'} • ចេញ`;
  btn.classList.remove('btn-outline-primary');
  btn.classList.add('btn-outline-danger');
  btn.href = '#';
  btn.onclick = (e) => {
    e.preventDefault();
    logout('login.html'); // redirect after logout
  };
}

/* ---------- Convenience: add auth header/qs if needed ---------- */
/**
 * Build URL with common api params and token.
 * Usage:
 *   const url = buildApiUrl(BASE, {route:'departments', op:'list', department_id: 1});
 *   const res = await fetch(url);
 */
export function buildApiUrl(base, params = {}) {
  const u = new URL(base);
  u.searchParams.set('api', '1');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  });
  const a = getAuth();
  if (a?.token) u.searchParams.set('token', a.token);
  return u.toString();
}
export function ensureLoggedIn(redirect = 'login.html') {
  const a = getAuth();
  if (!a) location.replace(redirect);
}


