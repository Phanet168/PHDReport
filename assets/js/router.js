// assets/js/router.js
import { hydratePage } from './hydrate.js';

const ROUTES = {
  '':                    'pages/home.html',
  'issues':              'pages/issues/index.html',
  'reports':             'pages/reports/index.html',
  'super-dashboard':     'pages/super/index.html',
  'settings/indicators': 'pages/settings/indicators/index.html',
  'settings/departments':'pages/settings/departments/index.html',
  'settings/units':      'pages/settings/units/index.html',
  'settings/users':      'pages/settings/users/index.html',
  'settings/periods':    'pages/settings/periods/index.html',
  'settings/import-excel': 'pages/settings/import-excel/index.html',
  'data-entry':          'pages/data-entry/index.html',
};

const baseDir = location.pathname.replace(/\/[^/]*$/, '/');
const viewRoot = ()=> document.getElementById('route-outlet');
const keyNow   = ()=> String(location.hash||'#/').replace(/^#\//,'');
const toUrl    = (k)=> baseDir + String(ROUTES[k] || ROUTES['']).replace(/^\/+/,'');

let last=null, inflight=0;
async function renderOnce(){
  const key=keyNow(); if(key===last && !inflight) return; last=key;
  const root=viewRoot(); if(!root) return;
  inflight++;
  try{
    const url=toUrl(key);
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
    root.innerHTML = await res.text();
    if('scrollRestoration' in history) history.scrollRestoration='manual';
    window.scrollTo?.(0,0);
    await hydratePage(root, key);
  }catch(e){
    console.error('[router]', e);
    root.innerHTML=`<div class="container-page"><div class="alert alert-danger mt-3">មិនអាចផ្ទុកទំព័រ<br><small>${e?.message||e}</small></div></div>`;
  }finally{ inflight--; }
}
export async function startRouter(){
  let t=null;
  window.addEventListener('hashchange', ()=>{ clearTimeout(t); t=setTimeout(renderOnce, 10); }, {passive:true});
  await renderOnce();
}