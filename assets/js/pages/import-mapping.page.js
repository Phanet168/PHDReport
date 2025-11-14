// assets/js/pages/import-mapping.page.js
import { gasList, gasSave, gasDelete } from '../app.api.firebase.js';
import { isSuper, isAdmin } from '../app.auth.js';

/* ----------------------- Loader helpers ----------------------- */
async function loadScript(url){
  return new Promise((res, rej)=>{
    const s=document.createElement('script'); s.src=url; s.async=true; s.referrerPolicy='no-referrer';
    s.onload=()=>res(url); s.onerror=()=>rej(new Error('Failed: '+url));
    document.head.appendChild(s);
  });
}
async function ensureXLSX(){
  if (window.XLSX) return true;
  const base = import.meta.url;
  const cands = [
    new URL('../../vendor/xlsx/xlsx.full.min.js', base).href,
    new URL('../../../vendor/xlsx/xlsx.full.min.js', base).href,
    '/PHDReport/assets/vendor/xlsx/xlsx.full.min.js',
    '/assets/vendor/xlsx/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  ];
  let last;
  for (const u of cands){ try{ await loadScript(u); if (window.XLSX) return true; } catch(e){ last=e; } }
  throw last||new Error('XLSX not loaded');
}

/* --------------------- HTML fragment loader -------------------- */
async function fetchFirstOk(urls){
  let last; for (const u of urls){
    try{ const r=await fetch(u,{cache:'no-store'}); if(r.ok) return r.text(); last=new Error(`${r.status} ${r.statusText} @ ${u}`); }
    catch(e){ last=e; }
  }
  throw last||new Error('All HTML paths failed (404)');
}
async function loadHtml(root, relPath){
  const base=import.meta.url;
  const html=await fetchFirstOk([
    new URL(`../../../pages/${relPath}`, base).href,
    new URL(`../pages/${relPath}`, base).href,
    `/PHDReport/assets/pages/${relPath}`,
    `/assets/pages/${relPath}`,
    `/PHDReport/pages/${relPath}`,
    `/pages/${relPath}`,
  ]);
  root.innerHTML=html;
}

/* --------------------- Excel merged helpers -------------------- */
function mergedMasterRC(ws, R, C){
  const merges=ws['!merges']||[];
  for (const m of merges) if (R>=m.s.r && R<=m.e.r && C>=m.s.c && C<=m.e.c) return {r:m.s.r,c:m.s.c};
  return {r:R,c:C};
}
function getCellAny(ws, r, c){
  const row=ws[r]; if(row&&typeof row==='object'){ const cell=row[c]; if(cell) return cell; }
  const addr=XLSX.utils.encode_cell({r,c}); return ws[addr]||null;
}
function khToAr(s){ if(s==null) return s; const m={'០':'0','១':'1','២':'2','៣':'3','៤':'4','៥':'5','៦':'6','៧':'7','៨':'8','៩':'9'}; return String(s).replace(/[០-៩]/g,d=>m[d]||d); }
function toNumberIfPossible(x){
  if (x==null) return '';
  if (typeof x==='number' && Number.isFinite(x)) return x;
  let s=khToAr(String(x).trim()); if(!s) return '';
  s=s.replace(/[\u00A0\u200B]/g,'');
  const pct=/%$/.test(s); if(pct) s=s.slice(0,-1);
  const par=/^\(.*\)$/.test(s); if(par) s=s.replace(/^\(|\)$/g,'');
  const n=Number(s.replace(/[\s,]/g,'')); if(!Number.isFinite(n)) return String(x);
  return pct ? (par?-n:n)/100 : (par?-n:n);
}
function evaluateFormulaWS(ws, f){
  if(!ws||!f) return '';
  const t='='+String(f).replace(/^=/,'').trim();
  const m=t.match(/^=\s*SUM\s*\((.*)\)\s*$/i);
  if(m){
    let total=0, any=false;
    for(const p of m[1].split(/\s*,\s*/)){
      let v=''; if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(p)) v=sumRangeMerged(ws,p);
      else if(/^[A-Z]+\d+$/i.test(p)) v=readCellMerged(ws,p);
      const n=toNumberIfPossible(v); if(typeof n==='number'){ total+=n; any=true; }
    }
    return any? total : '';
  }
  if(/^=\s*([A-Z]+\d+|[A-Z]+\d+:[A-Z]+\d+)(\s*[+\-]\s*([A-Z]+\d+|[A-Z]+\d+:[A-Z]+\d+))*\s*$/i.test(t)){
    const tk=t.slice(1).replace(/\s+/g,'').split(/([+\-])/); let acc=0,sign=1,any=false;
    for(const z of tk){
      if(z==='+'){sign=1;continue;} if(z==='-'){sign=-1;continue;}
      let v=''; if(/^[A-Z]+\d+:[A-Z]+\d+$/i.test(z)) v=sumRangeMerged(ws,z); else if(/^[A-Z]+\d+$/i.test(z)) v=readCellMerged(ws,z);
      const n=toNumberIfPossible(v); if(typeof n==='number'){acc+=sign*n; any=true;}
    }
    return any?acc:'';
  }
  const one=t.match(/^=\s*([A-Z]+\d+)\s*$/i); return one?readCellMerged(ws,one[1]):'';
}
function readCellMerged(ws, a1){
  const ref=XLSX.utils.decode_cell(String(a1).trim());
  const {r,c}=mergedMasterRC(ws, ref.r, ref.c);
  const cell=getCellAny(ws,r,c); if(!cell) return '';
  if(typeof cell.v!=='undefined'){ const p=toNumberIfPossible(cell.v); if(p!=='') return p; }
  if(typeof cell.w!=='undefined'){ const p=toNumberIfPossible(cell.w); if(p!=='') return p; }
  if(typeof cell.f==='string'){ const v=evaluateFormulaWS(ws,cell.f); if(v!=='') return v; }
  return '';
}
function sumRangeMerged(ws, a1){
  const r=XLSX.utils.decode_range(String(a1).trim());
  let sum=0, any=false; const seen=new Set();
  for(let R=r.s.r;R<=r.e.r;R++){
    for(let C=r.s.c;C<=r.e.c;C++){
      const {r:mr,c:mc}=mergedMasterRC(ws,R,C);
      const key=`${mr},${mc}`; if(seen.has(key)) continue; seen.add(key);
      const cell=getCellAny(ws,mr,mc); if(!cell) continue;
      let v=''; if(typeof cell.v!=='undefined') v=toNumberIfPossible(cell.v);
      else if(typeof cell.w!=='undefined') v=toNumberIfPossible(cell.w);
      else if(typeof cell.f==='string') v=toNumberIfPossible(evaluateFormulaWS(ws,cell.f));
      if(typeof v==='number'&&Number.isFinite(v)){ sum+=v; any=true; }
    }
  }
  return any? sum : '';
}
function pickValueMerged(wb, sheet, cellOrRange){
  const want=String(sheet||'').trim().toLowerCase();
  const nm=wb.SheetNames.find(n=>n.toLowerCase()===want);
  if(!nm) return { value:'', error:'SHEET_NOT_FOUND', sheetName:sheet, cell:cellOrRange||'' };
  const ws=wb.Sheets[nm]; const cc=String(cellOrRange||'').trim(); if(!cc) return { value:'', error:'NO_CELL', sheetName:nm, cell:cc };
  if(cc.includes(':')) return { value:sumRangeMerged(ws,cc), error:null, sheetName:nm, cell:cc };
  return { value:readCellMerged(ws,cc), error:null, sheetName:nm, cell:cc };
}

/* --------------------- New cross-file Formula Evaluator -------------------- */
/* Supports:
   - HC("Sheet!A1"), HOSP("Sheet!B2")
   - bare HC / HOSP (fallback numeric)
   - SUM/AVG/MIN/MAX with comma args
   - + - * / and ( )
*/
function readA1FromWB(WB, a1){
  const [sheet, cell] = String(a1||'').split('!');
  if(!sheet || !cell) return '';
  const got = pickValueMerged(WB, sheet, cell);
  return got ? got.value : '';
}
function _num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function _evalFuncCall(name, args){
  const arr = args.map(_num);
  if (!arr.length) return 0;
  switch(name){
    case 'SUM': return arr.reduce((a,b)=>a+b,0);
    case 'AVG': return arr.reduce((a,b)=>a+b,0)/arr.length;
    case 'MIN': return Math.min(...arr);
    case 'MAX': return Math.max(...arr);
    default: return 0;
  }
}
function _resolveHC_HOSP(expr, HC_WB, HP_WB){
  // HC("S!A1")
  expr = expr.replace(/HC\s*\(\s*["']([^"']+)["']\s*\)/gi, (_,ref)=>{
    const v = readA1FromWB(HC_WB, ref); const n=Number(v); return Number.isFinite(n)?String(n):'0';
  });
  // HOSP("S!A1")
  expr = expr.replace(/HOSP\s*\(\s*["']([^"']+)["']\s*\)/gi, (_,ref)=>{
    const v = readA1FromWB(HP_WB, ref); const n=Number(v); return Number.isFinite(n)?String(n):'0';
  });
  return expr;
}
function _reduceFunctions(expr){
  // Reduce nested functions from inner to outer by repeatedly replacing SUM(...), AVG(...), MIN(...), MAX(...)
  const rx = /\b(SUM|AVG|MIN|MAX)\s*\(([^()]*?)\)/i;
  let guard=0;
  while (rx.test(expr) && guard++<200){
    expr = expr.replace(rx, (_,name,argStr)=>{
      const parts = argStr.split(/\s*,\s*/).filter(s=>s.length);
      // each part may still contain numbers only (after HC/HOSP resolved)
      const val = _evalFuncCall(name.toUpperCase(), parts);
      return String(val);
    });
  }
  return expr;
}
function evalResultFormula(expr, hcVal, hpVal, HC_WB, HP_WB){
  let raw = String(expr||'').trim();
  const hcNum = Number(hcVal), hpNum = Number(hpVal);

  // default fallback (no expression)
  if (!raw){
    if (Number.isFinite(hcNum) && Number.isFinite(hpNum)) return hcNum + hpNum;
    if (Number.isFinite(hcNum)) return hcNum;
    if (Number.isFinite(hpNum)) return hpNum;
    return '';
  }

  // Step 1: substitute cross-file refs
  raw = _resolveHC_HOSP(raw, HC_WB, HP_WB);

  // Step 2: backward-compat HC/HOSP placeholders
  raw = raw.replace(/\bHC\b/gi, Number.isFinite(hcNum)?`(${hcNum})`:'0');
  raw = raw.replace(/\bHOSP\b/gi, Number.isFinite(hpNum)?`(${hpNum})`:'0');

  // Step 3: reduce functions SUM/AVG/MIN/MAX(...)
  raw = _reduceFunctions(raw);

  // Step 4: keep only safe tokens and eval
  const safeExpr = raw.replace(/[^0-9+\-*/().\s]/g,'');
  try{
    // eslint-disable-next-line no-new-func
    const val = Function('"use strict";return ('+safeExpr+');')();
    const n=Number(val); return Number.isFinite(n)?n:'';
  }catch{ return ''; }
}

/* --------------------- Utils & UI helpers -------------------- */
const $ = (r,s)=>r.querySelector(s);
const toArr = (x)=> Array.isArray(x) ? x : (x && (x.rows||x.content||x.data)) ? (x.rows||x.content||x.data) : [];
const debounce = (fn,ms=200)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
function el(tag, props={}, ...children){
  const node=document.createElement(tag);
  Object.entries(props).forEach(([k,v])=>{
    if (k==='class') node.className=v||'';
    else if (k==='dataset') Object.assign(node.dataset, v||{});
    else if (k==='readonly'||k==='required'||k==='disabled') { v?node.setAttribute(k,''):node.removeAttribute(k); }
    else if (k in node) node[k]=v;
    else node.setAttribute(k, v);
  });
  for (const c of children) node.appendChild(typeof c==='string'?document.createTextNode(c):c);
  return node;
}
function ensureDialog(root){
  let dlg=root.querySelector('#mapModal');
  if(!dlg){
    dlg=document.createElement('dialog'); dlg.id='mapModal';
    dlg.innerHTML=`
      <form method="dialog" style="min-width:460px;max-width:80vw">
        <h5 id="dlgTitle" class="mb-2"></h5>
        <div id="dlgBody" class="small"></div>
        <div class="text-end mt-3"><button class="btn btn-sm btn-primary" value="ok">OK</button></div>
      </form>`;
    root.appendChild(dlg);
  }
  return dlg;
}
function showDialog(root,title,html){
  const dlg=ensureDialog(root);
  dlg.querySelector('#dlgTitle').textContent=title||'Message';
  dlg.querySelector('#dlgBody').innerHTML=html||'';
  if (dlg.showModal) dlg.showModal(); else alert((title?title+'\n':'')+html.replace(/<[^>]+>/g,' '));
}

/* -------------- page state --------------- */
let HC_WB=null, HP_WB=null;
let HC_SHEETS=[], HP_SHEETS=[];
const canonicalName=(names,input)=>names.find(n=>n.toLowerCase()===String(input||'').trim().toLowerCase())||'';

/* ===================== Main Page ===================== */
export default async function hydrate(root){
  if (!(isSuper() || isAdmin())){
    root.innerHTML = `<div class="container-page"><div class="alert alert-warning mt-3">
      <strong>Access Denied</strong> — Admin/Super only. <a href="#/" class="ms-2">Back</a></div></div>`;
    return;
  }

  try{ await loadHtml(root, 'settings/import-mapping/index.html'); }
  catch(e){
    root.innerHTML=`<div class="container-page"><div class="alert alert-danger mt-3">
      <strong>HTML load failed</strong><div class="small">${e?.message||e}</div></div></div>`;
    return;
  }

  let xlsxReady=false;
  try{ xlsxReady = await ensureXLSX(); }catch{ xlsxReady=false; }

  // refs
  const tbody      = root.querySelector('#mapTbody');
  const filterTxt  = root.querySelector('#filterTxt');
  const btnSaveAll = root.querySelector('#btnSaveAll');
  const btnNewRow  = root.querySelector('#btnNewRow');
  const btnReload  = root.querySelector('#btnReload');
  const btnDeleteAll= root.querySelector('#btnDeleteAll');
  const statusEl   = root.querySelector('#statusLine');
  const testHC     = root.querySelector('#testFileHC');
  const testHOSP   = root.querySelector('#testFileHOSP');
  const hcSheetGlobal   = root.querySelector('#hcSheetGlobal');
  const hospSheetGlobal = root.querySelector('#hospSheetGlobal');
  const btnShowHelp = root.querySelector('#btnShowHelp');
  const helpBody    = root.querySelector('#helpBody');

  btnShowHelp?.addEventListener('click', ()=>{ helpBody.hidden = !helpBody.hidden; });

  [btnSaveAll,btnNewRow,btnReload,btnDeleteAll].forEach(b=>b?.setAttribute('type','button'));
  root.querySelectorAll('button:not([type])').forEach(b=>b.setAttribute('type','button'));

  function setStatus(msg, ok=true){
    if(!statusEl) return; statusEl.textContent=msg||''; statusEl.classList.toggle('text-danger', !ok);
  }
  function refreshTestButtons(){
    const enabled = !!(xlsxReady && testHC?.files?.length && testHOSP?.files?.length);
    root.querySelectorAll('button[data-action="test"]').forEach(btn=>{
      btn.disabled=!enabled; btn.title=enabled?'Test mapping with selected Excel files':'Select HC & HOSP Excel first';
    });
  }

  // load indicators + mappings
  const indicators = toArr(await gasList('indicators')).filter(Boolean);
  const IND_NAME = Object.fromEntries(indicators.map(i=>[String(i.indicator_id), i.indicator_name||'']));
  const IND_IDS  = new Set(indicators.map(i=>String(i.indicator_id)));
  let MAP_ROWS   = toArr(await gasList('import_mappings'))||[];

  // Add new fields if not exist in existing rows
  MAP_ROWS = MAP_ROWS.map(r=>({
    indicator_id:String(r.indicator_id),
    hc_sheet:r.hc_sheet||'',
    hc_cell:r.hc_cell||'',
    hc_formula:r.hc_formula||'',
    hosp_sheet:r.hosp_sheet||'',
    hosp_cell:r.hosp_cell||'',
    hosp_formula:r.hosp_formula||'',
    result_formula:r.result_formula||'',
    active:r.active?1:0
  }));

  // file load
  async function readWB(file){ const buf=await file.arrayBuffer(); return XLSX.read(buf,{type:'array'}); }
  function fillSelect(sel, names){ if(!sel) return; sel.innerHTML=''; names.forEach(n=>sel.appendChild(el('option',{value:n},n))); sel.disabled=!names.length; }
  function ensureRowDatalist(rootEl, id, names){
    let dl=rootEl.querySelector(`#${id}`); if(!dl){ dl=el('datalist',{id}); rootEl.appendChild(dl); }
    dl.innerHTML=''; names.forEach(n=>dl.appendChild(el('option',{value:n})));
  }
  async function onHCFileChange(){
    if(!testHC?.files?.[0]) return;
    HC_WB = await readWB(testHC.files[0]); HC_SHEETS = HC_WB.SheetNames.slice();
    fillSelect(hcSheetGlobal, HC_SHEETS);
    ensureRowDatalist(root,'hcSheetNames',HC_SHEETS);
    setStatus(`HC sheets: ${HC_SHEETS.join(', ')}`);
    refreshTestButtons();
  }
  async function onHPFileChange(){
    if(!testHOSP?.files?.[0]) return;
    HP_WB = await readWB(testHOSP.files[0]); HP_SHEETS = HP_WB.SheetNames.slice();
    fillSelect(hospSheetGlobal, HP_SHEETS);
    ensureRowDatalist(root,'hpSheetNames',HP_SHEETS);
    setStatus(`HOSP sheets: ${HP_SHEETS.join(', ')}`);
    refreshTestButtons();
  }
  testHC?.addEventListener('change', onHCFileChange);
  testHOSP?.addEventListener('change', onHPFileChange);

  function getRowSheet(tr, kind){
    const names  = kind==='hc'? HC_SHEETS : HP_SHEETS;
    const global = kind==='hc'? hcSheetGlobal?.value : hospSheetGlobal?.value;
    const input  = tr.querySelector(`[data-f="${kind==='hc'?'hc_sheet':'hosp_sheet'}"]`)?.value || '';
    const cand   = (input || global || '').trim();
    const canon  = canonicalName(names, cand);
    return { value:canon, source: input ? 'row':'global' };
  }

  /* ---------- build row with 3 Formula textboxes ---------- */
// ⬇️ ជំនួស function buildRow(r) ដាច់ខាត
function buildRow(r){
  const id = String(r.indicator_id);
  const name = IND_NAME[id] || '';

  const tr = document.createElement('tr');

  // កម្លាំងជួយបង្កើត input មិនមាន value attribute ក្នុង HTML
  const mkInp = (dataF, placeholder='', listId) => {
    const inp = document.createElement('input');
    inp.className = 'form-control form-control-sm';
    inp.setAttribute('data-f', dataF);
    if (placeholder) inp.placeholder = placeholder;
    if (listId) inp.setAttribute('list', listId);
    return inp;
  };

  // បង្កើត cell helper
  const td = (content) => {
    const el = document.createElement('td');
    if (content instanceof Element) el.appendChild(content);
    else el.innerHTML = content;
    return el;
  };

  // Cells: ID + Name
  tr.appendChild(td(`<code>${id}</code>`));
  tr.appendChild(td(`${name}`));

  // HC cells
  const inpHcSheet   = mkInp('hc_sheet','HC sheet','hcSheetNames');
  const inpHcCell    = mkInp('hc_cell','e.g. O8');
  const inpHcFormula = mkInp('hc_formula',`HC("S!A1")+HC("S!A2")`);

  // HOSP cells
  const inpHpSheet   = mkInp('hosp_sheet','HOSP sheet','hpSheetNames');
  const inpHpCell    = mkInp('hosp_cell','e.g. O9');
  const inpHpFormula = mkInp('hosp_formula',`HOSP("S!B1")+HOSP("S!B2")`);

  // Result formula
  const inpResult    = mkInp('result_formula',`(HC("S!C1")+HOSP("S!D1"))/2`);

  // Active
  const tdActive = document.createElement('td');
  tdActive.className = 'text-center';
  const chkActive = document.createElement('input');
  chkActive.type = 'checkbox';
  chkActive.setAttribute('data-f','active');
  tdActive.appendChild(chkActive);

  // Actions
  const tdActions = document.createElement('td');
  tdActions.className = 'text-center';
  tdActions.innerHTML = `
    <div class="d-flex flex-wrap justify-content-center gap-1">
      <button type="button" class="btn btn-sm btn-outline-secondary" data-action="useGlobal">Use Global</button>
      <button type="button" class="btn btn-sm btn-outline-dark"      data-action="test">Test</button>
      <button type="button" class="btn btn-sm btn-primary"           data-action="save">Save</button>
      <button type="button" class="btn btn-sm btn-outline-danger"    data-action="del">Delete</button>
    </div>
  `;

  // ដាក់ចូលជួរទៅតារាង
  tr.appendChild(td(inpHcSheet));
  tr.appendChild(td(inpHcCell));
  tr.appendChild(td(inpHcFormula));

  tr.appendChild(td(inpHpSheet));
  tr.appendChild(td(inpHpCell));
  tr.appendChild(td(inpHpFormula));

  tr.appendChild(td(inpResult));
  tr.appendChild(tdActive);
  tr.appendChild(tdActions);

  // ⬇️ កំណត់តម្លៃដោយ .value (មិនកាត់ដោយ HTML parser ទៀត)
  inpHcSheet.value   = r.hc_sheet || '';
  inpHcCell.value    = r.hc_cell || '';
  inpHcFormula.value = r.hc_formula || '';

  inpHpSheet.value   = r.hosp_sheet || '';
  inpHpCell.value    = r.hosp_cell || '';
  inpHpFormula.value = r.hosp_formula || '';

  inpResult.value    = r.result_formula || '';
  chkActive.checked  = !!r.active;

  // ភ្ជាប់ event ដូចដើម
  attachRowEvents(tr, r);
  return tr;
}


  function renderMappingTable(){
    const q=(filterTxt?.value||'').toLowerCase();
    let rows=MAP_ROWS.slice();
    if(q) rows = rows.filter(r=> String(r.indicator_id).toLowerCase().includes(q) || (IND_NAME[r.indicator_id]||'').toLowerCase().includes(q));
    if(!rows.length){ tbody.innerHTML=`<tr><td colspan="11" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`; return; }
    rows.sort((a,b)=> String(a.indicator_id).localeCompare(String(b.indicator_id),'en',{numeric:true}));
    const frag=document.createDocumentFragment(); rows.forEach(r=>frag.appendChild(buildRow(r)));
    tbody.innerHTML=''; tbody.appendChild(frag); refreshTestButtons();
  }

  function renderIndicators(){
    const indTbody=root.querySelector('#indTbody');
    const indFilter=root.querySelector('#indFilter');
    const indScope=root.querySelector('#indScope');
    const indStats=root.querySelector('#indStats');

    const scope = indScope?.value || 'unmapped';
    const q = (indFilter?.value || '').toLowerCase();
    const mapped = new Set(MAP_ROWS.map(r=>String(r.indicator_id)));

    let list = indicators.slice();
    if(scope==='unmapped') list = list.filter(i=>!mapped.has(String(i.indicator_id)));
    if(q) list=list.filter(i=> String(i.indicator_id).toLowerCase().includes(q) || String(i.indicator_name||'').toLowerCase().includes(q));

    if(indStats){
      const total=indicators.length;
      const unm=indicators.filter(i=>!mapped.has(String(i.indicator_id))).length;
      indStats.textContent = `Showing ${list.length} • Unmapped ${unm} / Total ${total}`;
    }

    if(!list.length){
      indTbody.innerHTML=`<tr><td colspan="3" class="text-center text-muted py-4">គ្មានសូចនាករ</td></tr>`;
      return;
    }
    list.sort((a,b)=> String(a.indicator_id).localeCompare(String(b.indicator_id),'en',{numeric:true}));

    const frag=document.createDocumentFragment();
    for (const it of list){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><code>${it.indicator_id}</code></td><td>${it.indicator_name||''}</td>
        <td class="text-center"><button class="btn btn-sm btn-outline-primary" data-action="addMap" data-id="${it.indicator_id}">Add</button></td>`;
      tr.querySelector('[data-action="addMap"]')?.addEventListener('click', ()=>{
        const id=String(it.indicator_id);
        if (MAP_ROWS.some(r=>String(r.indicator_id)===id)) return setStatus(`Already mapped: ${id}`);
        MAP_ROWS.push({
          indicator_id:id,
          hc_sheet:'', hc_cell:'', hc_formula:'',
          hosp_sheet:'', hosp_cell:'', hosp_formula:'',
          result_formula:'', active:1
        });
        renderMappingTable(); renderIndicators(); setStatus(`✅ Added ${id}`);
      });
      frag.appendChild(tr);
    }
    indTbody.innerHTML=''; indTbody.appendChild(frag);
  }

  function attachRowEvents(tr, entry){
    const id=String(entry.indicator_id);

    tr.querySelector('[data-action="useGlobal"]')?.addEventListener('click', ()=>{
      tr.querySelector('[data-f="hc_sheet"]').value   = hcSheetGlobal?.value||'';
      tr.querySelector('[data-f="hosp_sheet"]').value = hospSheetGlobal?.value||'';
      setStatus(`↪️ Applied Global sheets to ${id}`);
    });

    tr.querySelector('[data-action="test"]')?.addEventListener('click', async (ev)=>{
      ev.preventDefault(); const btn=ev.currentTarget;
      if(!window.XLSX){ setStatus('XLSX not loaded', false); return; }
      if(!testHC?.files?.[0] || !testHOSP?.files?.[0]){
        setStatus('សូមជ្រើស HC និង HOSP Excel ជាមុន', false);
        showDialog(root,'Test','សូមជ្រើស HC និង HOSP Excel ជាមុន');
        return;
      }
      try{
        btn.disabled=true; setStatus(`🔍 Testing ${id}…`);
        if(!HC_WB) HC_WB=await readWB(testHC.files[0]); if(!HP_WB) HP_WB=await readWB(testHOSP.files[0]);

        // resolve sheets (cell mode)
        const hcSheet=getRowSheet(tr,'hc').value;
        const hpSheet=getRowSheet(tr,'hosp').value;

        const hcCell = tr.querySelector('[data-f="hc_cell"]').value.trim();
        const hpCell = tr.querySelector('[data-f="hosp_cell"]').value.trim();
        const hcCellVal = (hcSheet && hcCell)? pickValueMerged(HC_WB, hcSheet, hcCell).value : '';
        const hpCellVal = (hpSheet && hpCell)? pickValueMerged(HP_WB, hpSheet, hpCell).value : '';

        // resolve formula (formula mode)
        const hcFormula = tr.querySelector('[data-f="hc_formula"]').value.trim();
        const hpFormula = tr.querySelector('[data-f="hosp_formula"]').value.trim();
        const rsFormula = tr.querySelector('[data-f="result_formula"]').value.trim();

        const hcVal = hcFormula ? evalResultFormula(hcFormula, '', '', HC_WB, HP_WB) : hcCellVal;
        const hpVal = hpFormula ? evalResultFormula(hpFormula, '', '', HC_WB, HP_WB) : hpCellVal;

        const resultVal = evalResultFormula(rsFormula, hcVal, hpVal, HC_WB, HP_WB);

        const msgHtml = `
          <div>Indicator: <code>${id}</code></div>
          <div class="mt-2"><b>HC</b> = ${hcVal!==''?hcVal:'—'} <span class="text-muted">(${hcFormula? 'HC Formula' : `${hcSheet||'-'}:${hcCell||'-'}`})</span></div>
          <div><b>HOSP</b> = ${hpVal!==''?hpVal:'—'} <span class="text-muted">(${hpFormula? 'HOSP Formula' : `${hpSheet||'-'}:${hpCell||'-'}`})</span></div>
          <div class="mt-1"><b>Result</b> = ${resultVal!==''?resultVal:'—'} <span class="text-muted">(${rsFormula||'default HC+HOSP'})</span></div>
          <hr class="my-2"/>
          <div class="small text-muted">💡 Syntax: HC("Sheet!A1"), HOSP("Sheet!B2"), SUM(...), AVG(...), MIN(...), MAX(...), + - * / ( ).</div>`;
        setStatus(`✅ TEST ${id}: HC=${hcVal!==''?hcVal:'—'} • HOSP=${hpVal!==''?hpVal:'—'} • RESULT=${resultVal!==''?resultVal:'—'}`);
        showDialog(root, `Test ${id}`, msgHtml);
      }catch(err){
        setStatus('Test failed: '+(err?.message||err), false);
        showDialog(root, `Test ${id}`, 'Error: ' + (err?.message||err));
      }finally{
        btn.disabled=false; refreshTestButtons();
      }
    });

    tr.querySelector('[data-action="save"]')?.addEventListener('click', async ()=>{
      const hcSheet=getRowSheet(tr,'hc').value;
      const hpSheet=getRowSheet(tr,'hosp').value;

      const payload={
        indicator_id:id,
        hc_sheet:hcSheet,
        hc_cell:tr.querySelector('[data-f="hc_cell"]').value.trim(),
        hc_formula:tr.querySelector('[data-f="hc_formula"]').value.trim(),
        hosp_sheet:hpSheet,
        hosp_cell:tr.querySelector('[data-f="hosp_cell"]').value.trim(),
        hosp_formula:tr.querySelector('[data-f="hosp_formula"]').value.trim(),
        result_formula:tr.querySelector('[data-f="result_formula"]').value.trim(),
        active: tr.querySelector('[data-f="active"]').checked ? 1 : 0,
      };
      try{ await gasSave('import_mappings', payload); setStatus(`✅ Updated ${id}`); }
      catch(e){ setStatus('Save failed: '+(e?.message||e), false); }
    });

    tr.querySelector('[data-action="del"]')?.addEventListener('click', async ()=>{
      if(!confirm(`Delete mapping ${id}?`)) return;
      try{
        setStatus(`🗑️ Deleting ${id}…`);
        await gasDelete('import_mappings', 'indicator_id', id);
        MAP_ROWS = MAP_ROWS.filter(r=>String(r.indicator_id)!==id);
        renderMappingTable();
        setStatus(`✅ Deleted ${id}`);
      }catch(err){ setStatus('Delete failed', false); }
    });
  }

  const renderMappingTableDebounced = debounce(renderMappingTable,150);
  filterTxt?.addEventListener('input', renderMappingTableDebounced);

  btnNewRow?.addEventListener('click', ()=>{
    const id=prompt('Indicator ID?'); if(!id) return;
    if(!IND_IDS.has(String(id)) && !confirm(`ID "${id}" not in indicators. Add anyway?`)) return;
    MAP_ROWS.push({
      indicator_id:String(id),
      hc_sheet:'', hc_cell:'', hc_formula:'',
      hosp_sheet:'', hosp_cell:'', hosp_formula:'',
      result_formula:'', active:1
    });
    renderMappingTable(); setStatus(`✅ Added ${id}`);
  });

  btnSaveAll?.addEventListener('click', async ()=>{
    try{
      btnSaveAll.disabled=true;
      const payloads = Array.from(tbody.querySelectorAll('tr')).map(tr=>{
        const id = tr.querySelector('td')?.textContent?.trim(); if(!id) return null;
        const hcSheet=getRowSheet(tr,'hc').value;
        const hpSheet=getRowSheet(tr,'hosp').value;
        return {
          indicator_id:id,
          hc_sheet:hcSheet,
          hc_cell:tr.querySelector('[data-f="hc_cell"]').value.trim(),
          hc_formula:tr.querySelector('[data-f="hc_formula"]').value.trim(),
          hosp_sheet:hpSheet,
          hosp_cell:tr.querySelector('[data-f="hosp_cell"]').value.trim(),
          hosp_formula:tr.querySelector('[data-f="hosp_formula"]').value.trim(),
          result_formula:tr.querySelector('[data-f="result_formula"]').value.trim(),
          active: tr.querySelector('[data-f="active"]').checked ? 1 : 0,
        };
      }).filter(Boolean);
      await Promise.all(payloads.map(p=>gasSave('import_mappings', p)));
      setStatus('✅ All saved');
    }catch(e){ setStatus('Save All error: ' + (e?.message||e), false); }
    finally{ btnSaveAll.disabled=false; }
  });

  btnReload?.addEventListener('click', async ()=>{
    try{
      btnReload.disabled=true;
      MAP_ROWS = toArr(await gasList('import_mappings'))||[];
      MAP_ROWS = MAP_ROWS.map(r=>({
        indicator_id:String(r.indicator_id),
        hc_sheet:r.hc_sheet||'',
        hc_cell:r.hc_cell||'',
        hc_formula:r.hc_formula||'',
        hosp_sheet:r.hosp_sheet||'',
        hosp_cell:r.hosp_cell||'',
        hosp_formula:r.hosp_formula||'',
        result_formula:r.result_formula||'',
        active:r.active?1:0
      }));
      renderMappingTable();
      setStatus('🔄 Reloaded');
    }finally{ btnReload.disabled=false; }
  });

  btnDeleteAll?.addEventListener('click', async ()=>{
    if(!confirm('Delete ALL mappings? This cannot be undone.')) return;
    try{
      btnDeleteAll.disabled=true; setStatus('🗑️ Deleting all mappings…');
      const rows = toArr(await gasList('import_mappings'))||[];
      for (const r of rows){ const id=String(r.indicator_id||'').trim(); if(!id) continue;
        try{ await gasDelete('import_mappings', 'indicator_id', id); }catch{}
      }
      MAP_ROWS=[]; renderMappingTable(); setStatus('✅ All mappings deleted');
    }catch(e){ setStatus('Delete All failed', false); }
    finally{ btnDeleteAll.disabled=false; }
  });

  // initial render
  renderMappingTable(); renderIndicators(); refreshTestButtons();
  setStatus('Ready');
}

export function getTitle(){ return 'Import Mapping | PHD Report'; }
