// assets/js/router.js
import { hydratePage } from './hydrate.js';

const ROUTES = {
  '':                          'pages/home.html',
  'settings/indicators':       'pages/settings/indicators/index.html',
  'settings/departments':      'pages/settings/departments/index.html',
  'settings/units':            'pages/settings/units/index.html',
  'settings/periods':          'pages/settings/periods/index.html',


};
const baseDir = location.pathname.replace(/\/[^/]*$/, '/');

function getViewRoot(){
  let el = document.getElementById('route-outlet')
        || document.querySelector('.main-content-wrap #route-outlet')
        || document.getElementById('app')
        || document.getElementById('view')
        || document.querySelector('#content, .content-body, .content, .main-content');
  if(!el){
    el = document.createElement('div');
    el.id = 'route-outlet';
    (document.querySelector('.main-content-wrap') || document.querySelector('main') || document.body)
      .appendChild(el);
    console.warn('[router] #route-outlet not found — created automatically.');
  }
  return el;
}
async function render(path){
  const conf = routes[path] || routes[''];
  const res  = await fetch(conf.view, { cache:'no-store' });
  const html = await res.text();
  document.getElementById('route-outlet').innerHTML = html;

  // call init if provided
  if (conf.load) {
    const initFn = await conf.load();    // dynamic import
    if (typeof initFn === 'function') await initFn();
  } else if (typeof conf.init === 'function') {
    await conf.init();
  }
}

function resolveRoute(hash){
  const key  = String(hash || '#/').replace(/^#\//,'');     // '' | 'settings/periods' | ...
  const file = ROUTES[key] || ROUTES[''];
  return baseDir + file.replace(/^\/+/, '');
}

let lastHash = null;

async function renderOnce(){
  const view = getViewRoot();
  const hash = location.hash || '#/';
  if (hash === lastHash) return;          // ✅ មិនបើកឡើងវិញពេលដដែល
  lastHash = hash;

  const url  = resolveRoute(hash);
  const res  = await fetch(url, { cache:'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);

  const html = await res.text();
  view.innerHTML = html;

  // កុំអោយស្ក្រូលចោលពីកំពូលក្រោយ render
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  view.scrollTo?.(0,0); window.scrollTo?.(0,0);

  await hydratePage(view, hash);
}

export async function startRouter(){
  const render = async () => {
    try { await renderOnce(); }
    catch (e) {
      console.error('[router] render failed:', e);
      const root = getViewRoot();
      root.innerHTML = `
        <div class="container-page">
          <div class="alert alert-danger mt-3">
            មិនអាចផ្ទុកទំព័រ<br><small>${e?.message || e}</small>
          </div>
        </div>`;
    }
  };
  window.addEventListener('hashchange', render);
  await render();   // initial
}
