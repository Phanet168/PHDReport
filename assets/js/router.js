// assets/js/router.js
import { hydratePage } from './hydrate.js';

const ROUTES = {
  '#/settings/departments': '/pages/settings/departments/index.html',
  '#/settings/indicators' : '/pages/settings/indicators/index.html',
  '#/': '/pages/home.html',
};
const resolveRoute = (hash)=> ROUTES[hash] || ROUTES['#/'];

function getViewRoot(){
  let el = document.getElementById('app')
        || document.getElementById('view')
        || document.querySelector('#content, .content-body, .content, .main-content');
  if(!el){
    el = document.createElement('div');
    el.id = 'app';
    (document.querySelector('main') || document.body).appendChild(el);
    console.warn('[router] #app container not found — created one automatically.');
  }
  return el;
}

async function renderOnce(){
  const view = getViewRoot();
  const hash = location.hash || '#/';
  const url  = resolveRoute(hash);
  const html = await fetch(url, { cache:'no-store' }).then(r=>r.text());
  view.innerHTML = html;
  await hydratePage(view, hash); // ✅ run page JS
}

export async function startRouter(){
  const render = async()=> {
    try { await renderOnce(); }
    catch(e){
      console.error('[router] render failed:', e);
      getViewRoot().innerHTML = `<div class="alert alert-danger m-3">
        បរាជ័យផ្ទុកទំព័រ<br><small>${e?.message||e}</small></div>`;
    }
  };
  window.addEventListener('hashchange', render);
  await render();
}
