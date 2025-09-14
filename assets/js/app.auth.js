// assets/js/app.auth.js

// ---- Local storage auth helpers ----
const KEY = 'auth';

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function setAuth(obj) {
  try {
    if (!obj) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    // silent fail if storage is unavailable
  }
}

export function getToken() {
  return getAuth()?.token || '';
}

export function isSuper(auth = getAuth()) {
  return String(auth?.role || '').toLowerCase() === 'super';
}

// token valid if has token and (no exp given OR exp > now)
export function isTokenValid(auth = getAuth()) {
  const has = !!auth?.token;
  const exp = Number(auth?.exp || 0);
  if (!has) return false;
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp > now;
}

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

// ---- Small helpers for pages ----
export function ensureLoggedIn(loginPath = 'login.html') {
  const auth = getAuth();
  if (isTokenValid(auth)) return;

  // avoid redirect loop if already on login page
  const hereFile = (location.pathname.split('/').pop() || '').toLowerCase();
  const loginFile = (loginPath.split('/').pop() || '').toLowerCase();
  if (hereFile === loginFile) return;

  // make login URL robust for subfolders
  const baseDir = location.pathname.replace(/\/[^/]*$/, '/');
  const loginUrl = loginPath.startsWith('http')
    ? loginPath
    : baseDir + loginPath.replace(/^\/+/, '');

  const ret = encodeURIComponent(location.href);
  location.href = `${loginUrl}?return=${ret}`;
}

export function applyLoginButton(btnEl) {
  if (!btnEl) return;
  const auth = getAuth();
  const baseDir = location.pathname.replace(/\/[^/]*$/, '/');

  if (isTokenValid(auth)) {
    btnEl.textContent = 'ចាកចេញ';
    btnEl.classList.remove('btn-outline-primary');
    btnEl.classList.add('btn-outline-danger');
    btnEl.href = '#';
    // use onclick to avoid stacking multiple listeners
    btnEl.onclick = (e) => {
      e.preventDefault();
      setAuth(null);
      // redirect to login and keep a return target back to index
      const ret = encodeURIComponent(baseDir + 'index.html');
      location.href = `${baseDir}login.html?return=${ret}`;
    };
  } else {
    btnEl.textContent = 'ចូលប្រើប្រាស់';
    btnEl.classList.add('btn-outline-primary');
    btnEl.classList.remove('btn-outline-danger');
    btnEl.href = `${baseDir}login.html`;
    btnEl.onclick = null;
  }
}
