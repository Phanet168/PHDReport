// assets/js/app.auth.js
import { auth, db } from "./firebase.client.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdToken
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// (ជ្រើសរើស) Export API layer ផ្សេងៗ ប្រសិនបើមានប្រើ
export {
  gasList   as apiList,
  gasSave   as apiSave,
  gasDelete as apiDelete,
  ID_FIELDS
} from "./app.api.firebase.js";

/* ---------------- Consts ---------------- */
const AUTH_KEY = "phd_auth";
const PSEUDO_DOMAIN = "dbreportphd.local";

/* ---------------- Utils ---------------- */
const nowSec = () => Math.floor(Date.now()/1000);
function b64urlToJson(b64){
  try{
    const pad='='.repeat((4-(b64.length%4))%4);
    const s=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(decodeURIComponent(escape(s)));
  }catch{return {};}
}
// Try to resolve real email by username (lowercased) from Firestore
async function resolveEmailByUsername(username){
  const uname = String(username||'').trim().toLowerCase();
  if (!uname) return '';

  try{
    // users where user_name == uname   (ត្រូវមាន index)
    const s = await getDocs(query(collection(db,'users'), where('user_name','==', uname)));
    if (!s.empty) {
      const d = s.docs[0].data() || {};
      const em = String(d.email||'').trim();
      if (em) return em.toLowerCase();
    }
  }catch(e){
    // ignore; rules might block unauth read
  }
  return '';
}

/* ---------------- Auth cache ---------------- */
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
    // require token + exp
    if (!a.token || typeof a.exp !== 'number') return null;
    return a;
  }catch{ return null; }
}

/* ---------------- Public getters/helpers ---------------- */
export function getAuthLocal(){ return loadAuth(); }
export const getAuth = getAuthLocal; // alias សម្រាប់កូដចាស់
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

/* ---------------- Ready gate ---------------- */
let __resolveReady;
export const authReady = new Promise(res => (__resolveReady = res));
export async function whenAuthReady(){
  if (getAuthLocal()) return; // cached auth OK
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
  try{
    const p1 = await getDoc(doc(db,'profiles', uid));
    if (p1.exists()) return { id:uid, ...p1.data() };
  }catch(e){}
  try{
    let q1 = query(collection(db,'users'), where('auth_uid','==', uid));
    let s1 = await getDocs(q1);
    if (!s1.empty) return s1.docs[0].data();
  }catch(e){}
  if (email){
    try{
      const em = String(email).toLowerCase();
      let q2 = query(collection(db,'users'), where('email','==', em));
      let s2 = await getDocs(q2);
      if (!s2.empty) return s2.docs[0].data();
    }catch(e){}
  }
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
    user_type: String(prof.role || 'viewer').toLowerCase(),
    full_name: prof.full_name || user.displayName || user.email,
    department_id: prof.department_id || '',
    unit_id: prof.unit_id || '',
    user_id: prof.user_id || '',
    user_name: prof.user_name || ''
  });
  return getAuthLocal();
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
    window.dispatchEvent(new Event('auth:changed'));
    if (__resolveReady){ __resolveReady(); __resolveReady = null; }
    return;
  }
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

/* ---------------- Username -> pseudo email ---------------- */
export function mapUsernameToEmail(input){
  const raw = String(input||'').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  const uname = raw.toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9._-]/g,'');
  return `${uname}@${PSEUDO_DOMAIN}`;
}
export async function loginUsernamePassword(username, password){
  const raw = String(username||'').trim();
  if (!raw || !password) throw new Error('សូមបំពេញឈ្មោះអ្នកប្រើ និង ពាក្យសម្ងាត់');

  const uname = raw.toLowerCase();
  const pseudoEmail = raw.includes('@') ? raw : `${uname}@${PSEUDO_DOMAIN}`;

  // 1) សាក sign-in ជាមួយ pseudo-domain / ឬអ៊ីមែលពេញ (បើអ្នកវាយមាន @)
  try{
    return await loginEmailPassword(pseudoEmail, password);
  }catch(err){
    const code = String(err?.code||'').toLowerCase();
    // បើជាបញ្ហា "wrong-password" → ចេញភ្លាម (username ត្រឹមត្រូវហើយ)
    if (code.includes('wrong-password')) throw err;
    // បើ username មិនមាន @ ហើយមិនឃើញ user តាម pseudo-domain → សាក resolve ពី Firestore
    if (!raw.includes('@') && (code.includes('user-not-found') || code.includes('invalid-email'))) {
      const resolved = await resolveEmailByUsername(uname);
      if (resolved && resolved !== pseudoEmail) {
        // សាក sign-in ដោយអ៊ីមែលពិត
        return await loginEmailPassword(resolved, password);
      }
    }
    // else: បោះបន្តិចដដែល
    throw err;
  }
}

export async function logout(){
  try{ await signOut(auth); } finally { clearAuth(); }
}
