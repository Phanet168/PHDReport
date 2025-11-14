// assets/js/hydrate.js
import { isSuper, isAdmin } from './app.auth.js';

/* ===== Route table ===== */
const ROUTE_TO_PAGE = {
  '':                       'home',
  'data-entry':             'data-entry',
  'reports':                'reports',
  'issues':                 'issues',
  'super':                  'super-dashboard',

  // Settings
  'settings/indicators':    'indicators',
  'settings/departments':   'departments',
  'settings/units':         'units',
  'settings/periods':       'periods',
  'settings/users':         'users',

  // ⭐ Route HTML នៅ pages/settings/import-excel/
  //    ប៉ុន្តែ JS module ស្ថិតនៅ assets/js/pages/import-excel.page.js
  'settings/import-excel':  'import-excel',

  // Mapper page mapping មានស្ទើរតែដូចគ្នា (បើ JS ស្ថិតក្រៅ /settings/)
  'settings/import-mapping':'import-mapping',
};

/* ===== Guards ===== */
const GUARDS = {
  'data-entry':             () => (isAdmin() || isSuper()),
  'settings/indicators':    () => (isAdmin() || isSuper()),
  'super-dashboard':        () => isSuper(),
  'settings/departments':   () => isSuper(),
  'settings/units':         () => isSuper(),
  'settings/periods':       () => isSuper(),
  'settings/users':         () => isSuper(),
  'settings/import-excel':  () => isSuper(),
  'settings/import-mapping':() => isSuper(),
};

const CLEANUPS = new WeakMap();
const MODULE_CACHE = new Map();
let NAV_TOKEN = 0;

function normalizePath(p=''){
  return String(p).replace(/^#\/?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^\/+/, '') || '';
}
function parseHash(raw) {
  const s = String(raw || location.hash || '#/');
  const noHash = s.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = noHash.split('?', 2);
  const path = normalizePath(pathPart);
  const usp = new URLSearchParams(queryPart);
  const params = {};
  for (const [k,v] of usp.entries()) params[k]=v;
  return { path, query: queryPart, params, search: usp };
}

/* ===== Flexible resolver: ស្វែងរកទាំងគំរោងមាន/គ្មាន 'settings/' ===== */
async function resolvePageModule(pageSlug) {
  if (MODULE_CACHE.has(pageSlug)) return MODULE_CACHE.get(pageSlug);

  const bases = [
    `${location.origin}/PHDReport/assets/js/pages/`,
    `${location.origin}/assets/js/pages/`,
    new URL('./assets/js/pages/', location.href).href,
  ];

  // សាកល្បង 2 រចនាសម្ព័ន្ធ:
  //   1) slug.page.js  (ex: import-excel.page.js)
  //   2) settings/slug.page.js (ex: settings/import-excel.page.js)
  const makeCandidates = (b, s) => ([
    `${b}${s}.page.js`,
    `${b}${s}.init.js`,
    `${b}${s}.js`
  ]);

  let lastErr = null;
  for (const b of bases){
    for (const url of makeCandidates(b, pageSlug)){
      try {
        const mod = await import(/* @vite-ignore */ url);
        MODULE_CACHE.set(pageSlug, mod);
        return mod;
      } catch (e) { lastErr = e; }
    }
    // fallback ស្វែងរកក្រោម settings/ (ករណីអ្នកដាក់ JS ក្នុង folder នោះ)
    for (const url of makeCandidates(b, `settings/${pageSlug}`)){
      try {
        const mod = await import(/* @vite-ignore */ url);
        MODULE_CACHE.set(pageSlug, mod);
        return mod;
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error(`Cannot import module for "${pageSlug}"`);
}

function setLoading(root, on){ root?.classList.toggle('is-loading', !!on); }
function renderDenied(root){
  root.innerHTML = `<div class="container-page"><div class="alert alert-warning mt-3">
    <strong>គ្មានសិទ្ធិចូល</strong> — ទំព័រនេះមានកំណត់តាមតួនាទី។ <a href="#/" class="ms-2">ត្រឡប់​ទំព័រដើម</a>
  </div></div>`;
}
function renderNotFound(root, path){
  root.innerHTML = `<div class="container-page"><div class="alert alert-secondary mt-3">
    <strong>រកមិនឃើញទំព័រ</strong> (<code>#/${path}</code>) <a href="#/" class="ms-2">ត្រឡប់​ទំព័រដើម</a>
  </div></div>`;
}
function setTitleFromModule(mod, ctx){
  try {
    if (typeof mod.getTitle === 'function') {
      const t = mod.getTitle(ctx); if (t) document.title = t;
    } else if (typeof mod.title === 'string') {
      document.title = mod.title;
    }
  } catch {}
}

export async function hydratePage(root, hash){
  if (!root) return;

  const prevCleanup = CLEANUPS.get(root);
  if (typeof prevCleanup === 'function') { try { await prevCleanup(); } catch {} }
  CLEANUPS.delete(root);

  const navId = ++NAV_TOKEN;
  const { path, params, search } = parseHash(hash);
  const pageSlug = ROUTE_TO_PAGE[path];

  if (GUARDS[path] && !GUARDS[path]()){
    renderDenied(root); return;
  }
  setLoading(root, true);

  if (!pageSlug){
    renderNotFound(root, path);
    setLoading(root, false);
    return;
  }

  let mod;
  try{
    mod = await resolvePageModule(pageSlug);
  }catch(e){
    console.error('[hydrate] dynamic import failed', e);
    root.innerHTML = `<div class="container-page"><div class="alert alert-danger mt-3">
      <div class="fw-semibold">មិនអាចផ្ទុក JS module សម្រាប់ <code>${pageSlug}</code></div>
      <div class="small text-muted">${e?.message||e}</div>
      <div class="mt-2">ពិនិត្យថាមាន <code>assets/js/pages/${pageSlug}.page.js</code> ឬ <code>assets/js/pages/settings/${pageSlug}.page.js</code></div>
    </div></div>`;
    setLoading(root, false);
    return;
  }

  if (navId !== NAV_TOKEN) return;

  try{
    const fn = mod?.default || mod?.hydrate;
    const ctx = { path, params, search };
    if (typeof fn === 'function'){
      const cleanup = await fn(root, ctx);
      if (typeof cleanup === 'function') CLEANUPS.set(root, cleanup);
      if (typeof mod.getTitle === 'function') {
        const tt = mod.getTitle(ctx); if (tt) document.title = tt;
      }
    }
  } finally {
    setLoading(root, false);
  }
}
