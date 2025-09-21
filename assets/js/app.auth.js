/* ======================================================================
 * PHD Report – Auth helper (ES Module)
 * Path: assets/js/app.auth.js
 * ==================================================================== */

/* 
  NOTE:
  - Still uses localStorage key "auth" (គ្មានការប្រែ key ដើម្បីជៀស-breaking).
  - Adds small clock-skew tolerance to stop login→index→login loops.
  - Robust login redirect that won’t loop when you’re already on login page.
*/

const KEY = 'auth';               // single source of truth in localStorage
const CLOCK_SKEW_SEC = 120;       // tolerate 2 minutes skew

/* ---------- Storage ---------- */
export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw);

    // token validity check with skew tolerance
    const tok = String(a?.token || '');
    const exp = Number(a?.exp || 0);
    if (!tok) return null;

    if (exp) {
      const now = Math.floor(Date.now() / 1000);
      if (exp + CLOCK_SKEW_SEC < now) return null;
    }
    return a;
  } catch {
    return null;
  }
}

export function setAuth(obj) {
  try {
    if (!obj) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    // ignore storage errors (Safari private mode, etc.)
  }
}

export function clearAuth() {
  try { localStorage.removeItem(KEY); } catch {}
}

/* ---------- Token / Roles ---------- */
export function getToken() {
  return getAuth()?.token || '';
}

export function isSuper(auth = getAuth()) {
  return String(auth?.role || '').toLowerCase() === 'super'
      || String(auth?.user_type || '').toLowerCase() === 'superuser'
      || String(auth?.user_root || '').toLowerCase() === 'all';
}

export function isDataEntry(auth = getAuth()) {
  const r = String(auth?.role || auth?.user_type || '').toLowerCase();
  return r === 'dataentry' || r === 'data_entry' || r === 'admin';
}

export function isViewer(auth = getAuth()) {
  return !isSuper(auth) && !isDataEntry(auth);
}

// token valid if has token and (no exp OR exp > now - skew)
export function isTokenValid(auth = getAuth()) {
  if (!auth || !auth.token) return false;
  const exp = Number(auth.exp || 0);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp + CLOCK_SKEW_SEC > now;
}

/* ---------- URL helpers ---------- */
// For backward compatibility: returns "token=..." (NO leading &)
export function tokenQS() {
  const tok = getToken();
  return tok ? `token=${encodeURIComponent(tok)}` : '';
}

// Preferred helper for URLs: returns "&token=..." or "" if missing
export function authTokenParam() {
  const tok = getToken();
  return tok ? `&token=${encodeURIComponent(tok)}` : '';
}

/* ---------- Page guards / wiring ---------- */
function baseDirOf(pathname) {
  // e.g. /PHDReport/pages/foo/bar.html -> /PHDReport/pages/foo/
  return pathname.replace(/\/[^/]*$/, '/');
}

/**
 * Redirect to login if not authenticated.
 * - Avoids redirect loop when already on login page.
 * - Keeps ?return=<current full URL>.
 */
export function ensureLoggedIn(loginPath = 'login.html') {
  const auth = getAuth();
  if (isTokenValid(auth)) return;

  const hereFile  = (location.pathname.split('/').pop() || '').toLowerCase();
  const loginFile = (loginPath.split('/').pop() || '').toLowerCase();
  if (hereFile === loginFile) return; // already at login → don’t redirect

  const baseDir = baseDirOf(location.pathname);
  const loginUrl = loginPath.startsWith('http')
    ? loginPath
    : (loginPath.startsWith('/') ? loginPath : baseDir + loginPath);

  const ret = encodeURIComponent(location.href);
  // use replace() to avoid history back-loop
  location.replace(`${loginUrl}?return=${ret}`);
}

/**
 * Turn a <a id="btnLogin"> into login/logout UI.
 * - If not logged in → “ចូលប្រើប្រាស់” and link to login with return=current page.
 * - If logged in     → shows username (if available) + “ចាកចេញ” and logs out.
 */
export function applyLoginButton(btnEl) {
  if (!btnEl) return;

  const auth = getAuth();
  const baseDir = baseDirOf(location.pathname);

  if (isTokenValid(auth)) {
    btnEl.textContent = `${auth?.user_name || 'អ្នកប្រើ'} • ចាកចេញ`;
    btnEl.classList.remove('btn-outline-primary');
    btnEl.classList.add('btn-outline-danger');
    btnEl.href = '#';
    btnEl.onclick = (e) => {
      e.preventDefault();
      clearAuth();
      // go to login and allow coming back to index
      const ret = encodeURIComponent(baseDir + 'index.html');
      location.replace(`${baseDir}login.html?return=${ret}`);
    };
  } else {
    btnEl.textContent = 'ចូលប្រើប្រាស់';
    btnEl.classList.add('btn-outline-primary');
    btnEl.classList.remove('btn-outline-danger');
    const ret = encodeURIComponent(location.href);
    btnEl.href = `${baseDir}login.html?return=${ret}`;
    btnEl.onclick = null;
  }
}

/**
 * After successful login, call this to go back to the original page (if provided),
 * otherwise to index.html (single entry).
 */
export function gotoAfterLogin() {
  const qp = new URLSearchParams(location.search);
  const ret = qp.get('return');
  if (ret) location.replace(ret);
  else     location.replace('index.html');
}

/* ---------- Optional debugging ---------- */
export function debugAuthToConsole() {
  const a = getAuth();
  const now = Math.floor(Date.now()/1000);
  const exp = Number(a?.exp || 0);
  console.log('[auth]', a);
  if (a?.token) {
    console.log('[auth] now=', now, 'exp=', exp, 'delta=', (exp ? exp - now : 'N/A'));
  } else {
    console.log('[auth] no token');
  }
}
