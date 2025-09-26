// assets/js/app.auth.js
// Auth helper for PHD Report (JSONP login + localStorage)
import { GAS_BASE } from "./config.js";

const AUTH_KEY = "phd_auth";

/* ---------- Storage ---------- */
export function getAuth(){
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
  catch { return null; }
}
export function setAuth(a){ if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); }
export function clearAuth(){ localStorage.removeItem(AUTH_KEY); }

/* ---------- State helpers ---------- */
export function isLoggedIn(a=getAuth()){
  if (!a || !a.token) return false;
  const now = Math.floor(Date.now()/1000);
  // មាន exp នៅ token response រួចហើយ
  if (a.exp && Number(a.exp) <= now) return false;
  return true;
}
export function isSuper(a=getAuth()){
  const r = String(a?.role || a?.user_type || "").toLowerCase();
  return r === "super" || r === "superuser";
}

/* ---------- Router helpers ---------- */
const currentReturn = () => location.pathname + (location.search||"") + (location.hash||"");

export function ensureLoggedIn(loginUrl="login.html"){
  if (!isLoggedIn()){
    location.replace(`${loginUrl}?return=${encodeURIComponent(currentReturn() || "index.html")}`);
  }
}

/** Header button: toggle Login/Logout automatically */
export function applyLoginButton(btn){
  const el = btn || document.getElementById("btnLogin");
  if (!el) return;

  if (isLoggedIn()){
    el.classList.remove("btn-outline-primary");
    el.classList.add("btn-outline-danger");
    el.textContent = "ចាកចេញ";
    el.href = "javascript:void(0)";
    el.onclick = (e)=>{
      e.preventDefault();
      clearAuth();
      location.replace(`login.html?return=${encodeURIComponent(currentReturn())}`);
    };
  } else {
    el.classList.remove("btn-outline-danger");
    el.classList.add("btn-outline-primary");
    el.textContent = "ចូលប្រើប្រាស់";
    el.href = `login.html?return=${encodeURIComponent(currentReturn())}`;
    el.onclick = null;
  }
}

/* ---------- JSONP core (avoid CORS) ---------- */
function jsonp(url, params={}){
  return new Promise((resolve, reject)=>{
    const cb = "__gs_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ ...params, callback: cb });
    const src = url + (url.includes("?") ? "&" : "?") + qs.toString();
    const s = document.createElement("script");

    const cleanup = ()=>{ try{ delete window[cb]; }catch{} s.remove(); };
    window[cb] = (data)=>{ cleanup(); resolve(data); };
    s.onerror = ()=>{ cleanup(); reject(new Error("JSONP failed")); };

    s.src = src;
    document.body.appendChild(s);
  });
}

/* ---------- Login via JSONP ---------- */
/** Call GAS /auth?op=login with username/password; persists token on success. */
export async function loginJsonp(username, password){
  if (!username || !password) throw new Error("សូមបំពេញឈ្មោះ និង ពាក្យសម្ងាត់");
  const res = await jsonp(GAS_BASE, {
    api: 1,
    route: "auth",
    op: "login",
    username,
    password
  });
  if (!res || res.ok === false) throw new Error(res?.error || "Login failed");
  if (!res.token) throw new Error("Token not returned");
  setAuth(res);
  return res;
}
