// assets/js/app.auth.js
// -------------------------------------------------------------
// Auth helper for PHD Report (JSONP login + localStorage)
// NOTE: អនុមានថា GAS_BASE ត្រូវបានកំណត់នៅ config.js
// -------------------------------------------------------------
import { GAS_BASE } from "./config.js";

const AUTH_KEY = "phd_auth";

/* ======================== Storage ======================== */
export function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw);
    // normalize
    if (a && a.role) a.role = String(a.role).trim().toLowerCase();
    if (a && a.user_type && !a.role) a.role = String(a.user_type).trim().toLowerCase();
    if (a && a.exp) a.exp = Number(a.exp);
    return a;
  } catch {
    return null;
  }
}

export function setAuth(a) {
  if (!a || typeof a !== "object") return;
  const out = { ...a };
  out.role = String(out.role ?? out.user_type ?? "").trim().toLowerCase();
  if (out.exp != null) out.exp = Number(out.exp);
  localStorage.setItem(AUTH_KEY, JSON.stringify(out));
  dispatchAuthChanged();
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  dispatchAuthChanged();
}

/* ===================== State helpers ===================== */
export function isLoggedIn(a = getAuth()) {
  if (!a || !a.token) return false;
  // tolerate clock-skew 60s
  const now = Math.floor(Date.now() / 1000) + 60;
  if (a.exp && Number(a.exp) <= now) return false;
  return true;
}

export function isSuper(a = getAuth()) {
  const r = String(a?.role || a?.user_type || "").toLowerCase();
  return r === "super"; // ✅ strict: តែ "super" ប៉ុណ្ណោះ
}


/* ===================== Router helpers ==================== */
const currentReturn = () =>
  location.pathname + (location.search || "") + (location.hash || "");

export function ensureLoggedIn(loginUrl = "login.html") {
  if (!isLoggedIn()) {
    location.replace(
      `${loginUrl}?return=${encodeURIComponent(currentReturn() || "index.html")}`
    );
  }
}

/* ===================== UI convenience ==================== */
/** ប្ដូរប៊ូតុង Login/Logout (ជាជម្រើស) */
export function applyLoginButton(btn) {
  const el = btn || document.getElementById("btnLogin");
  if (!el) return;

  const apply = () => {
    if (isLoggedIn()) {
      el.classList.remove("btn-outline-primary");
      el.classList.add("btn-outline-danger");
      el.textContent = "ចាកចេញ";
      el.href = "javascript:void(0)";
      el.onclick = (e) => {
        e.preventDefault();
        clearAuth();
        // ត្រឡប់ទៅទំព័រ login (រក្សា return)
        location.replace(`login.html?return=${encodeURIComponent(currentReturn())}`);
      };
    } else {
      el.classList.remove("btn-outline-danger");
      el.classList.add("btn-outline-primary");
      el.textContent = "ចូលប្រើប្រាស់";
      el.href = `login.html?return=${encodeURIComponent(currentReturn())}`;
      el.onclick = null;
    }
  };

  // apply ភ្លាម និង subscribe ប្រែប្រួល
  apply();
  window.addEventListener("auth:changed", apply);
}

/* ======================= JSONP core ====================== */
/** JSONP helper (ចៀស CORS); server ត្រូវឆ្លើយ callback({...}) */
function jsonp(url, params = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cb = "__gs_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ ...params, callback: cb });
    const src = url + (url.includes("?") ? "&" : "?") + qs.toString();

    const s = document.createElement("script");
    let done = false;

    const cleanup = () => {
      try { delete window[cb]; } catch {}
      try { s.remove(); } catch {}
    };

    const t = setTimeout(() => {
      if (!done) { cleanup(); reject(new Error("JSONP timeout")); }
    }, timeoutMs);

    window[cb] = (data) => {
      done = true;
      clearTimeout(t);
      cleanup();
      resolve(data);
    };

    s.onerror = () => {
      clearTimeout(t);
      cleanup();
      reject(new Error("JSONP failed"));
    };

    s.src = src;
    document.head.appendChild(s);
  });
}

/* ================== Public auth actions ================== */
/** 🔐 Login via JSONP → persist token on success */
export async function loginJsonp(username, password) {
  if (!username || !password) {
    throw new Error("សូមបំពេញឈ្មោះ និង ពាក្យសម្ងាត់");
  }
  const res = await jsonp(GAS_BASE, {
    api: 1,
    route: "auth",
    op: "login",
    username,
    password,
  });

  if (!res || res.ok === false) {
    throw new Error(res?.error || "Login failed");
  }
  if (!res.token) {
    throw new Error("Token not returned");
  }

  setAuth(res);
  return res;
}

/** 🚪 Logout (clear + event) */
export function logout() {
  clearAuth();
}

/* =================== Small conveniences ================== */
/** បន្ថែម token ទៅ params ដើម្បីប្រើជាមួយ URLSearchParams */
export function withAuthParams(params = {}) {
  const p = { ...params };
  if (!("api" in p)) p.api = 1;
  const tok = getAuth()?.token;
  if (tok && !("token" in p)) p.token = tok;
  return p;
}

/** បញ្ចេញព្រឹត្តិការណ៍ (internal) */
function dispatchAuthChanged() {
  try {
    window.dispatchEvent(new Event("auth:changed"));
  } catch {}
}
try {
  window.getAuth  = getAuth;
  window.isSuper  = isSuper;
  window.clearAuth = clearAuth;
} catch {}
