// assets/js/app.auth.js

// ===== LocalStorage keys =====
const LS_KEY = 'AUTH';

// ===== AUTH STATE =====
export function setAuth(obj) {
  if (!obj) {
    localStorage.removeItem(LS_KEY);
  } else {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  }
}
export function getAuth() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
  catch { return null; }
}

// ===== ROLE HELPERS (type comes from users.json: superuser/admin/dataentry/viewer) =====
export const isSuper     = a => String(a?.user_type||'').toLowerCase() === 'superuser';
export const isDataEntry = a => ['admin','dataentry'].includes(String(a?.user_type||'').toLowerCase());
export const isViewer    = a => String(a?.user_type||'').toLowerCase() === 'viewer';

// ===== ROUTING =====
export function gotoAfterLogin(auth){
  // មានតែ index.html ទៅ dashboard; អ្នកអាចកែផ្លូវបាន
  location.replace('index.html');
}

// ===== LOGOUT (with redirect) =====
export function logout(redir = 'login.html') {
  try { localStorage.removeItem(LS_KEY); } catch {}
  // redirect to login
  location.replace(redir);
}

// ===== Apply login button behavior =====
// - បើមិនទាន់ login: បង្ហាញ “ចូលប្រើប្រាស់” href="login.html"
// - បើ login រួច: បង្ហាញ “{user_name} • ចេញ” ហើយចុច → logout + redirect
export function applyLoginButton(btn) {
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
    logout('login.html'); // 👈 ឥឡូវនេះ logout ដំណើរការ
  };
}
export function logout(redirect = 'login.html') {
  try {
    localStorage.removeItem('phd_auth'); // clear auth
  } catch (_) {}
  location.replace(redirect); // redirect ទៅ login.html
}


// ===== Convenience: guard pages =====
export function requireLogin(redirectTo = 'login.html'){
  const a = getAuth();
  if (!a) location.replace(redirectTo);
  return a;
}

