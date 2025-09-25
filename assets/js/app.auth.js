// assets/js/app.auth.js
const AUTH_KEY = 'phd_auth';

export function getAuth(){
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); }
  catch { return null; }
}
export function setAuth(a){ localStorage.setItem(AUTH_KEY, JSON.stringify(a||{})); }
export function clearAuth(){ localStorage.removeItem(AUTH_KEY); }

export function isLoggedIn(){
  const a = getAuth();
  return !!(a && a.token);
}

export function isSuper(a=getAuth()){
  const r = String(a?.role || a?.user_type || '').toLowerCase();
  return r === 'super' || r === 'superuser';
}

/** Redirect to login if not logged in. Keeps current path+hash in ?return= */
export function ensureLoggedIn(loginUrl='login.html'){
  if (!isLoggedIn()){
    const ret = location.pathname + (location.hash || '');
    location.replace(`${loginUrl}?return=${encodeURIComponent(ret || 'index.html')}`);
  }
}

/** Wire the header button to be Login/Logout dynamically */
export function applyLoginButton(btn){
  const el = btn || document.getElementById('btnLogin');
  if (!el) return;

  const ret = location.pathname + (location.hash || '');
  if (isLoggedIn()){
    el.classList.remove('btn-outline-primary');
    el.classList.add('btn-outline-danger');
    el.textContent = 'ចាកចេញ';                  // Logout label
    el.href = 'javascript:void(0)';
    el.onclick = (e)=>{
      e.preventDefault();
      clearAuth();
      // After logout, go to login with return back to current page/hash
      location.replace(`login.html?return=${encodeURIComponent(ret)}`);
    };
  } else {
    el.classList.remove('btn-outline-danger');
    el.classList.add('btn-outline-primary');
    el.textContent = 'ចូលប្រើប្រាស់';
    el.href = `login.html?return=${encodeURIComponent(ret)}`;
    el.onclick = null;
  }
}
