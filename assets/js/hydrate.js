// assets/js/hydrate.js

import { isSuper, isAdmin } from './app.auth.js';

// ---------------- Route table ----------------
const ROUTE_TO_PAGE = {
  '':                     'home',
  'data-entry':           'data-entry',
  'reports':              'reports',
  'issues':               'issues',        // <-- អាចមាន issues.page.js ឬ issues.init.js
  'settings/indicators':  'indicators',
  'settings/departments': 'departments',
  'settings/units':       'units',
  'settings/periods':     'periods',
  'settings/users':       'users',
};

// ---------------- Guards ----------------
const GUARDS = {
  'data-entry':           () => (isAdmin() || isSuper()),
  'settings/indicators':  () => (isAdmin() || isSuper()),
  'settings/departments': () => isSuper(),
  'settings/units':       () => isSuper(),
  'settings/periods':     () => isSuper(),
  'settings/users':       () => isSuper(),
};

// keep cleanup per-root to avoid double hydrate
const CLEANUPS = new WeakMap();
const MODULE_CACHE = new Map();
let NAV_TOKEN = 0;

// -------------- Helpers --------------
function normalizePath(p=''){
  return String(p)
    .replace(/^#\/?/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^\/+/, '')
    || '';
}
function parseHash(raw) {
  const s = String(raw || location.hash || '#/');
  const noHash = s.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = noHash.split('?', 2);
  const path = normalizePath(pathPart);
  const usp = new URLSearchParams(queryPart);
  const params = {};
  for (const [k, v] of usp.entries()) params[k] = v;
  return { path, query: queryPart, params, search: usp };
}

function runInlineScripts(root) {
  const nodes = root.querySelectorAll('script[type="module"], script[data-run]');
  nodes.forEach(old => {
    if (old.dataset.hydrated === '1') return;
    const s = document.createElement('script');
    s.type = 'module';
    if (old.src) s.src = new URL(old.getAttribute('src'), location.href).href;
    else s.textContent = old.textContent || '';
    s.dataset.hydrated = '1';
    document.head.appendChild(s);
    // remove next tick to avoid accumulating tags in <head>
    setTimeout(() => document.head.removeChild(s), 0);
  });
}

function setLoading(root, on) {
  if (!root) return;
  root.classList.toggle('is-loading', !!on);
}

function renderDenied(root) {
  root.innerHTML = `
    <div class="container-page">
      <div class="alert alert-warning mt-3">
        <strong>គ្មានសិទ្ធិចូល</strong> — ទំព័រនេះមានកំណត់តាមតួនាទី។
        <a href="#/" class="ms-2">ត្រឡប់​ទំព័រដើម</a>
      </div>
    </div>`;
}
function renderNotFound(root, path) {
  root.innerHTML = `
    <div class="container-page">
      <div class="alert alert-secondary mt-3">
        <strong>រកមិនឃើញទំព័រ</strong> (<code>#/${path}</code>)
        <a href="#/" class="ms-2">ត្រឡប់​ទំព័រដើម</a>
      </div>
    </div>`;
}

function setTitleFromModule(mod, ctx) {
  try {
    if (typeof mod.getTitle === 'function') {
      const t = mod.getTitle(ctx);
      if (t) document.title = t;
    } else if (typeof mod.title === 'string') {
      document.title = mod.title;
    }
  } catch {}
}

export function navigateTo(hashPath) {
  const h = String(hashPath || '');
  location.hash = h.startsWith('#') ? h : `#/${h.replace(/^\/+/, '')}`;
}

// ---------- Robust dynamic import resolver ----------
async function resolvePageModule(pageName) {
  // Try cache first
  if (MODULE_CACHE.has(pageName)) return MODULE_CACHE.get(pageName);

  const base = `./assets/js/pages/${pageName}`;
  const candidates = [
    `${base}.page.js`,
    `${base}.init.js`,
    // bonus: allow .js directly if you already named it that way
    `${base}.js`,
  ];

  let lastErr = null;
  for (const hrefRel of candidates) {
    try {
      const href = new URL(hrefRel, location.href).href;
      const mod = await import(/* @vite-ignore */ href);
      MODULE_CACHE.set(pageName, mod);
      return mod;
    } catch (e) {
      lastErr = e;
    }
  }
  // throw last error so caller can render a helpful UI
  throw lastErr || new Error(`Cannot import module for page "${pageName}"`);
}

// ---------------- Public API ----------------
export async function hydratePage(root, hash) {
  if (!root) return;

  // run previous cleanup (if any)
  const prevCleanup = CLEANUPS.get(root);
  if (typeof prevCleanup === 'function') {
    try { await prevCleanup(); } catch {}
  }
  CLEANUPS.delete(root);

  const navId = ++NAV_TOKEN;
  const { path, params, search } = parseHash(hash);
  const pageName = ROUTE_TO_PAGE[path];

  // Guard
  if (GUARDS[path] && !GUARDS[path]()) {
    renderDenied(root);
    return;
  }

  setLoading(root, true);

  // 404 if unknown key
  if (!pageName) {
    renderNotFound(root, path);
    setLoading(root, false);
    return;
  }

  let mod = null;
  try {
    mod = await resolvePageModule(pageName);
  } catch (e) {
    console.error('[hydrate] dynamic import failed', e);
    root.innerHTML = `
      <div class="container-page">
        <div class="alert alert-danger mt-3">
          <div class="fw-semibold">មិនអាចផ្ទុក JS module សម្រាប់ <code>${pageName}</code></div>
          <div class="small text-muted">${e?.message || e}</div>
          <div class="mt-2">សូមពិនិត្យថា មានឯកសារ <code>${pageName}.page.js</code> ឬ <code>${pageName}.init.js</code> នៅ <code>assets/js/pages/</code></div>
        </div>
      </div>`;
    setLoading(root, false);
    return;
  }

  // if navigation changed during import, abort
  if (navId !== NAV_TOKEN) return;

  try {
    const fn = mod && (mod.default || mod.hydrate);
    const ctx = { path, params, search };

    if (typeof fn === 'function') {
      const maybeCleanup = await fn(root, ctx);
      if (typeof maybeCleanup === 'function') CLEANUPS.set(root, maybeCleanup);
      setTitleFromModule(mod, ctx);
    } else {
      // No exported hydrate—fallback to execute inline <script type="module"> inside HTML fragment
      runInlineScripts(root);
    }
  } finally {
    setLoading(root, false);
  }
}

// optional: hook internal nav for analytics/prefetch
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a) return;
  // place for analytics/prefetch if needed
});
