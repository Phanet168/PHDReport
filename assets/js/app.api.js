// assets/js/app.auth.js
import { auth, db } from "./firebase.client.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
export {
  gasList   as apiList,
  gasSave   as apiSave,
  gasDelete as apiDelete,
  ID_FIELDS
} from "./app.api.firebase.js";
/* ---------------- Consts ---------------- */
const AUTH_KEY = "phd_auth";
const PSEUDO_DOMAIN = "dbreportphd.local";

/* ---------------- Small utils ---------------- */
const nowSec = () => Math.floor(Date.now()/1000);
function b64urlToJson(b64){
  try{
    const pad='='.repeat((4-(b64.length%4))%4);
    const s=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(decodeURIComponent(escape(s)));
  }catch{return {};}
}

/* ---------------- Local storage (auth cache) ---------------- */
function saveAuth(a){
  const out = { ...a };
  if (out.role == null && out.user_type != null) out.role = out.user_type;
  out.role = String(out.role || 'viewer').toLowerCase();
  if (out.exp != null) out.exp = Number(out.exp);
  localStorage.setItem(AUTH_KEY, JSON.stringify(out));
  window.dispatchEvent(new Event('auth:changed'));
}
function loadAuth(){
  try{
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw);
    if (a.exp != null) a.exp = Number(a.exp);
    if (a.role != null) a.role = String(a.role).toLowerCase();
    // 🚫 បើគ្មាន token ឬ exp មិនសូវពេញលេញ → កុំប្រើ
    if (!a.token || typeof a.exp !== 'number') return null;
    return a;
  }catch{ return null; }
}


/* ---------------- Public getters/helpers ---------------- */
export function getAuthLocal(){ return loadAuth(); }
export function getSession(){ return getAuthLocal(); }
export function clearAuth(){
  localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new Event('auth:changed'));
}
export function isLoggedIn(a=getAuthLocal()){
  return !!(a?.token && typeof a.exp === 'number' && a.exp > (nowSec()+60));
}


export const isSuper = (a=getAuthLocal()) => String(a?.role||'') === 'super';
export const isAdmin = (a=getAuthLocal()) => ['admin','super'].includes(String(a?.role||''));

/* Ready promise (resolve once) */
let __resolveReady;
export const authReady = new Promise(res => (__resolveReady = res));
export async function whenAuthReady(){
  if (getAuthLocal()) return; // already have cached auth, let UI proceed
  return authReady;
}

/* ---------------- Router helpers ---------------- */
const currentReturn = () => location.pathname + (location.search||'') + (location.hash||'');
export function ensureLoggedIn(loginUrl='login.html'){
  if (!isLoggedIn()){
    location.replace(`${loginUrl}?return=${encodeURIComponent(currentReturn()||'index.html')}`);
  }
}


/* ---------------- Login button wiring ---------------- */
export function applyLoginButton(el){
  if (!el) return;
  const wire = ()=>{
    if (isLoggedIn()){
      el.classList.remove('btn-outline-primary');
      el.classList.add('btn-outline-danger');
      el.textContent = 'ចាកចេញ';
      el.href = 'javascript:void(0)';
      el.onclick = async (e)=>{
        e.preventDefault();
        try{ await signOut(auth); }catch{}
        clearAuth();
        location.replace(`login.html?return=${encodeURIComponent(currentReturn())}`);
      };
    } else {
      el.classList.remove('btn-outline-danger');
      el.classList.add('btn-outline-primary');
      el.textContent = 'ចូលប្រើប្រាស់';
      el.href = `login.html?return=${encodeURIComponent(currentReturn())}`;
      el.onclick = null;
    }
  };
  wire();
  window.addEventListener('auth:changed', wire);
}

/* ---------------- Profile loader ---------------- */
async function loadProfile(uid, email){
  // 1) profiles/{uid}
  try{
    const p1 = await getDoc(doc(db,'profiles', uid));
    if (p1.exists()) return { id:uid, ...p1.data() };
  }catch(e){ /* ignore; rules may block if not defined */ }

  // 2) users where auth_uid == uid
  try{
    let q1 = query(collection(db,'users'), where('auth_uid','==', uid));
    let s1 = await getDocs(q1);
    if (!s1.empty) return s1.docs[0].data();
  }catch(e){}

  // 3) users where email == email (lowercased)
  if (email){
    try{
      const em = String(email).toLowerCase();
      let q2 = query(collection(db,'users'), where('email','==', em));
      let s2 = await getDocs(q2);
      if (!s2.empty) return s2.docs[0].data();
    }catch(e){}
  }

  // 4) minimal default
  return { full_name: email || uid, role: 'viewer' };
}

/* ---------------- Token with exp ---------------- */
async function tokenWithExp(force=false){
  const tok = await getIdToken(auth.currentUser, !!force);
  const payload = tok.split('.')[1] || '';
  const { exp = 0 } = b64urlToJson(payload);
  return { token: tok, exp: Number(exp||0) };
}

/* ---------------- Email/password login ---------------- */
export async function loginEmailPassword(email, password){
  if (!email || !password) throw new Error('សូមបំពេញអ៊ីមែល និង ពាក្យសម្ងាត់');
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  const { token, exp } = await tokenWithExp(true);
  const prof = await loadProfile(user.uid, user.email || email);

  saveAuth({
    uid: user.uid, email: user.email, token, exp,
    role: String(prof.role || 'viewer').toLowerCase(),
    user_type: String(prof.role || 'viewer').toLowerCase(), // back-compat
    full_name: prof.full_name || user.displayName || user.email,
    department_id: prof.department_id || '',
    unit_id: prof.unit_id || '',
    user_id: prof.user_id || '',
    user_name: prof.user_name || ''
  });
  return getAuthLocal();
}

export async function logout(){
  try{ await signOut(auth); } finally { clearAuth(); }
}

/* ---------------- Keep cache synced with Firebase Auth ---------------- */
onAuthStateChanged(auth, async (user)=>{
  if (!user){
    clearAuth();
    if (__resolveReady){ __resolveReady(); __resolveReady=null; }
    return;
  }

  const cur = getAuthLocal();
  const near = nowSec() + 60;
  if (cur?.uid === user.uid && cur?.exp && cur.exp > near){
    // token still fresh — just notify
    window.dispatchEvent(new Event('auth:changed'));
    if (__resolveReady){ __resolveReady(); __resolveReady = null; }
    return;
  }

  // refresh token & profile silently
  const { token, exp } = await tokenWithExp(false);
  const prof = await loadProfile(user.uid, user.email || '');

  saveAuth({
    ...(cur||{}),
    uid: user.uid,
    email: user.email,
    token, exp,
    role: String(prof.role || cur?.role || 'viewer').toLowerCase(),
    user_type: String(prof.role || cur?.role || 'viewer').toLowerCase(),
    full_name: prof.full_name || cur?.full_name || user.displayName || user.email,
    department_id: prof.department_id ?? cur?.department_id ?? '',
    unit_id: prof.unit_id ?? cur?.unit_id ?? '',
    user_id: prof.user_id ?? cur?.user_id ?? '',
    user_name: prof.user_name ?? cur?.user_name ?? '',
  });

  if (__resolveReady){ __resolveReady(); __resolveReady = null; }
});

/* ---------------- Optional: username -> pseudo email ---------------- */
export function mapUsernameToEmail(input){
  const raw = String(input||'').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  const uname = raw.toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9._-]/g,'');
  return `${uname}@dbreportphd.local`;
}
export async function loginUsernamePassword(username, password){
  const email = mapUsernameToEmail(username);
  // reuse flow loginEmailPassword ដែលមានស្រាប់ (getIdToken, exp, loadProfile, saveAuth)
  return loginEmailPassword(email, password);
}
