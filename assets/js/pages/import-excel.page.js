// assets/js/pages/settings/import-excel.page.js
import { gasList, gasSave } from '../app.api.firebase.js';
import { isSuper, isAdmin } from '../app.auth.js';

/* ==================== tiny utils ==================== */
async function loadScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.async = true; s.referrerPolicy = 'no-referrer';
    s.onload = () => res(url);
    s.onerror = () => rej(new Error('Failed: ' + url));
    document.head.appendChild(s);
  });
}
const $ = (r, s) => r.querySelector(s);
function isInViewport(el){ if(!el) return true;
  const r = el.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight;
  return r.top >= 0 && r.bottom <= h;
}
function smoothScrollIntoView(el, block='center'){ try{ el?.scrollIntoView({behavior:'smooth', block}); }catch{} }
function toArr(x){ return Array.isArray(x) ? x : (x && (x.rows||x.content||x.data)) ? (x.rows||x.content||x.data) : []; }

/* ==================== XLSX loader (for Excel export & reading) ==================== */
async function ensureXLSX() {
  if (window.XLSX) return true;
  const base = import.meta.url;
  const cands = [
    new URL('../../vendor/xlsx/xlsx.full.min.js', base).href,
    new URL('../vendor/xlsx/xlsx.full.min.js', base).href,
    '/PHDReport/assets/vendor/xlsx/xlsx.full.min.js',
    '/assets/vendor/xlsx/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  ];
  let last;
  for (const u of cands) {
    try { await loadScript(u); if (window.XLSX) return true; }
    catch (e) { last = e; }
  }
  throw last || new Error('XLSX not loaded');
}

/* ==================== jsPDF + autoTable (data-entry style PDF) ==================== */
async function ensureJsPDF() {
  if (window.jspdf?.jsPDF) return true;
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  return !!(window.jspdf?.jsPDF);
}
async function ensureAutoTable() {
  if (window.jspdf?.jsPDF && typeof window.jspdf.jsPDF.prototype.autoTable === 'function') return true;
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
  return (typeof window.jspdf?.jsPDF?.prototype?.autoTable === 'function');
}

/* ----- Khmer font embedding for jsPDF ----- */
async function fetchFontBinary(url){
  const u = url + (url.includes('?')?'&':'?') + 'v=' + Date.now();
  const r = await fetch(u, { cache:'no-store' });
  if(!r.ok) throw new Error(`${r.status} ${r.statusText} @ ${url}`);
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return bin;
}
async function ensureJsPDFKhmerFont(doc){
  if (!doc) return false;
  // if already added once
  if (window.__JS_PDF_NSK_READY) { try{ doc.setFont('NotoSansKhmer','normal'); }catch{} return true; }

  const base = import.meta.url;
  const REG = [
    '/PHDReport/assets/fonts/NotoSansKhmer-Regular.ttf',
    '/assets/fonts/NotoSansKhmer-Regular.ttf',
    new URL('../fonts/NotoSansKhmer-Regular.ttf', base).href,
    new URL('../../fonts/NotoSansKhmer-Regular.ttf', base).href,
  ];
  const BOLD = [
    '/PHDReport/assets/fonts/NotoSansKhmer-Bold.ttf',
    '/assets/fonts/NotoSansKhmer-Bold.ttf',
    new URL('../fonts/NotoSansKhmer-Bold.ttf', base).href,
    new URL('../../fonts/NotoSansKhmer-Bold.ttf', base).href,
  ];
  async function firstOk(list){
    let last;
    for (const u of list){ try{ return await fetchFontBinary(u); }catch(e){ last=e; } }
    throw last || new Error('Cannot load NotoSansKhmer TTF from /assets/fonts');
  }
  const [regBin, boldBin] = await Promise.all([ firstOk(REG), firstOk(BOLD) ]);

  doc.addFileToVFS('NotoSansKhmer-Regular.ttf', regBin);
  doc.addFileToVFS('NotoSansKhmer-Bold.ttf', boldBin);
  doc.addFont('NotoSansKhmer-Regular.ttf','NotoSansKhmer','normal');
  doc.addFont('NotoSansKhmer-Bold.ttf','NotoSansKhmer','bold');

  try{ doc.setFont('NotoSansKhmer','normal'); }catch{}
  window.__JS_PDF_NSK_READY = true;
  return true;
}

/* ==================== HTML fragment loader ==================== */
async function fetchFirstOk(urls) {
  let last;
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache:'no-store' });
      if (r.ok) return r.text();
      last = new Error(`${r.status} ${r.statusText} @ ${u}`);
    } catch(e){ last = e; }
  }
  throw last || new Error('All HTML paths failed');
}
async function loadHtml(root, relPath) {
  const base = import.meta.url;
  const urls = [
    new URL(`../../../pages/${relPath}`, base).href,
    new URL(`../pages/${relPath}`, base).href,
    new URL(`../${relPath}`, base).href,
    '/PHDReport/assets/pages/' + relPath,
    '/assets/pages/' + relPath,
    '/PHDReport/pages/' + relPath,
    '/pages/' + relPath,
  ];
  root.innerHTML = await fetchFirstOk(urls);
}

/* ==================== Excel merged helpers ==================== */
function mergedMasterRC(ws, R, C) {
  const merges = ws['!merges']||[];
  for (const m of merges) if (R>=m.s.r && R<=m.e.r && C>=m.s.c && C<=m.e.c) return {r:m.s.r,c:m.s.c};
  return {r:R,c:C};
}
function getCellAny(ws, r, c){
  const row=ws[r];
  if(row && typeof row==='object'){
    const cell=row[c];
    if(cell) return cell;
  }
  const addr = XLSX.utils.encode_cell({r,c});
  return ws[addr]||null;
}
function khToAr(s){
  if(s==null) return s;
  const m={'០':'0','១':'1','២':'2','៣':'3','៤':'4','៥':'5','៦':'6','៧':'7','៨':'8','៩':'9'};
  return String(s).replace(/[០-៩]/g,d=>m[d]||d);
}
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
function evaluateFormula(ws, f){
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
  const one=t.match(/^=\s*([A-Z]+\d+)\s*$/i);
  return one?readCellMerged(ws,one[1]):'';
}
function readCellMerged(ws, a1){
  const ref=XLSX.utils.decode_cell(String(a1).trim());
  const {r,c}=mergedMasterRC(ws, ref.r, ref.c);
  const cell=getCellAny(ws,r,c); if(!cell) return '';
  if(typeof cell.v!=='undefined'){ const p=toNumberIfPossible(cell.v); if(p!=='') return p; }
  if(typeof cell.w!=='undefined'){ const p=toNumberIfPossible(cell.w); if(p!=='') return p; }
  if(typeof cell.f==='string'){ const v=evaluateFormula(ws,cell.f); if(v!=='') return v; }
  return '';
}
function sumRangeMerged(ws, a1){
  const r=XLSX.utils.decode_range(String(a1).trim());
  let sum=0, any=false; const seen=new Set();
  for(let R=r.s.r; R<=r.e.r; R++){
    for(let C=r.s.c; C<=r.e.c; C++){
      const {r:mr,c:mc}=mergedMasterRC(ws,R,C); const key=`${mr},${mc}`; if(seen.has(key)) continue; seen.add(key);
      const cell=getCellAny(ws,mr,mc); if(!cell) continue;
      let v=''; if(typeof cell.v!=='undefined') v=toNumberIfPossible(cell.v);
      else if(typeof cell.w!=='undefined') v=toNumberIfPossible(cell.w);
      else if(typeof cell.f==='string') v=toNumberIfPossible(evaluateFormula(ws,cell.f));
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

/* ==================== PDF (data-entry style) helpers ==================== */
function safe(v){ return (v===null || v===undefined) ? '' : String(v); }
function nowKh(){
  const d=new Date();
  const two=(n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/* ==================== Main Page ==================== */
export default async function hydrate(root){
  if (!(isSuper() || isAdmin())) {
    root.innerHTML = `<div class="container-page"><div class="alert alert-warning mt-3">
      <strong>គ្មានសិទ្ធិចូល</strong> — ត្រូវការ Admin ឬ Super User។ <a href="#/" class="ms-2">ត្រឡប់​ទំព័រដើម</a>
    </div></div>`;
    return;
  }

  // Load HTML UI
  try { await loadHtml(root, 'settings/import-excel/index.html'); }
  catch(e){
    root.innerHTML = `<div class="container-page"><div class="alert alert-danger mt-3">
      <strong>HTML load failed</strong><div class="small">${e?.message||e}</div></div></div>`;
    return;
  }

  // Refs
  const yearSel   = $(root,'#impYear');
  const perType   = $(root,'#perType');
  const perValue  = $(root,'#perValue');
  const fileHC    = $(root,'#fileHC');
  const fileHOSP  = $(root,'#fileHOSP');
  const fileSummary = $(root,'#fileSummary');
  const btnPreview= $(root,'#btnPreview');
  const btnImport = $(root,'#btnImport');
  const btnPdf    = $(root,'#btnExportPdf');
  const btnXlsx   = $(root,'#btnExportExcel');
  const statusEl  = $(root,'#statusLine');
  const tbody     = $(root,'#impTbody');
  const modeRadios= root.querySelectorAll('input[name="impMode"]');

  [btnPreview, btnImport, btnPdf, btnXlsx].forEach(b=>b?.setAttribute('type','button'));

  let importMode = 'mapping';
  modeRadios.forEach(r=>{
    r.addEventListener('change', ()=>{
      importMode = r.value === 'summary' ? 'summary' : 'mapping';
      setStatus(importMode === 'summary'
        ? 'Mode: Summary Excel (គណនារួចក្នុង Excel)'
        : 'Mode: Mapping HC/HOSP');
    });
  });

  function setStatus(m, ok=true){
    if (!statusEl) return;
    statusEl.textContent = m || '';
    statusEl.classList.toggle('text-danger', !ok);
    if (!isInViewport(statusEl)) smoothScrollIntoView(statusEl, 'end');
  }
  function setExportEnabled(on){ [btnPdf,btnXlsx].forEach(b=>b&&(b.disabled=!on)); }
  setExportEnabled(false);

  // Year & Period select
  (function fillYear(){
    const y=new Date().getFullYear(); const ys=[];
    for(let k=y-4;k<=y+1;k++) ys.push(k);
    yearSel.innerHTML = ys.reverse().map(v=>`<option>${v}</option>`).join('');
    yearSel.value = y;
  })();
  function fillPeriods(){
    const t = perType.value;
    let opts = [];
    if (t==='month'){ for(let m=1;m<=12;m++){ const mm=String(m).padStart(2,'0'); opts.push({v:`M${mm}`,text:`ខែ ${m} (M${mm})`}); } }
    else if (t==='quarter'){ opts = [{v:'Q1',text:'ត្រីមាស 1'},{v:'Q2',text:'ត្រីមាស 2'},{v:'Q3',text:'ត្រីមាស 3'},{v:'Q4',text:'ត្រីមាស 4'}]; }
    else if (t==='semester'){ opts=[{v:'H1',text:'ឆមាស 1'},{v:'H2',text:'ឆមាស 2'}]; }
    else if (t==='nine'){ opts=[{v:'N9',text:'៩ ខែ'}]; }
    else if (t==='year'){ opts=[{v:'Y',text:'ឆ្នាំ'}]; }
    perValue.innerHTML = opts.map(o=>`<option value="${o.v}">${o.text}</option>`).join('');
  }
  perType.addEventListener('change', fillPeriods); fillPeriods();

  // Data sources
  await ensureXLSX().catch(()=>{});
  const indicators = await gasList('indicators').catch(()=>[]);
  const IND_SET  = new Set(indicators.map(i=>String(i.indicator_id)));
  const IND_NAME = Object.fromEntries(indicators.map(i=>[String(i.indicator_id), i.indicator_name||'']));

  const maps = await gasList('import_mappings').catch(()=>[]);
  const MAPPING = (maps||[]).filter(r=>r.active!==0 && r.active!==false).map(r=>({
    indicator_id:String(r.indicator_id||'').trim(),
    hc_sheet:String(r.hc_sheet||'').trim(),   hc_cell:String(r.hc_cell||'').trim(),
    hosp_sheet:String(r.hosp_sheet||'').trim(), hosp_cell:String(r.hosp_cell||'').trim(),
  }));

  // Preview state
  let HC_WB=null, HP_WB=null, PREVIEW=[];

  async function readWB(file){ const buf=await file.arrayBuffer(); return XLSX.read(buf,{type:'array'}); }

  function renderPreview(rows){
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">—</td></tr>`;
      btnImport.disabled=true; setExportEnabled(false); return;
    }
    const frag=document.createDocumentFragment();
    rows.forEach(r=>{
      const tr=document.createElement('tr'); tr.innerHTML=`
        <td><code>${r.indicator_id}</code></td>
        <td>${r.name||''}</td>
        <td class="text-end">${r.hc!==''?r.hc:'—'}</td>
        <td class="text-end">${r.hosp!==''?r.hosp:'—'}</td>
        <td class="text-end fw-semibold">${r.total!==''?r.total:'—'}</td>
        <td>${r.status||''}</td>`;
      frag.appendChild(tr);
    });
    tbody.innerHTML=''; tbody.appendChild(frag);
    btnImport.disabled=false; setExportEnabled(true);
  }

  async function previewMappingMode(){
    if (!window.XLSX) {
      try { await ensureXLSX(); } catch(e){
        return setStatus('XLSX not loaded — សូមពិនិត្យ vendor/xlsx.* ឬ CDN', false);
      }
    }
    const fHC=fileHC?.files?.[0], fHP=fileHOSP?.files?.[0];
    if (!fHC || !fHP) return setStatus('សូមជ្រើស HC និង HOSP Excel ជាមុន', false);

    setStatus('កំពុងអាន Excel (mapping)…');
    tbody.innerHTML=`<tr><td colspan="6" class="text-center text-muted py-4">Loading…</td></tr>`;

    try{ [HC_WB,HP_WB] = await Promise.all([readWB(fHC), readWB(fHP)]); }
    catch(e){ setStatus(' អាន Excel បរាជ័យ', false); return; }

    const rows=[], warn=[];
    for (const m of MAPPING){
      const id=String(m.indicator_id||'').trim(); if(!id) continue;

      let vHC='', vHP='';
      if (m.hc_sheet && m.hc_cell){
        const r=pickValueMerged(HC_WB, m.hc_sheet, m.hc_cell);
        if(r.error==='SHEET_NOT_FOUND') warn.push(`HC sheet "${r.sheetName}" not found for ${id}`);
        vHC=r.value;
      }
      if (m.hosp_sheet && m.hosp_cell){
        const r=pickValueMerged(HP_WB, m.hosp_sheet, m.hosp_cell);
        if(r.error==='SHEET_NOT_FOUND') warn.push(`HOSP sheet "${r.sheetName}" not found for ${id}`);
        vHP=r.value;
      }

      const nHC=Number(vHC), nHP=Number(vHP);
      const valHC=Number.isFinite(nHC)?nHC:(vHC===''?'':vHC);
      const valHP=Number.isFinite(nHP)?nHP:(vHP===''?'':vHP);
      let total='';
      if(Number.isFinite(nHC)||Number.isFinite(nHP)) {
        total=(Number.isFinite(nHC)?nHC:0)+(Number.isFinite(nHP)?nHP:0);
      }

      const msgs=[]; if(!IND_SET.has(id)) msgs.push('<span class="badge bg-warning text-dark">ID មិនមាន</span>');
      rows.push({ indicator_id:id, name:IND_NAME[id]||'', hc:valHC, hosp:valHP, total, status:msgs.join(' ') });
    }
    rows.sort((a,b)=>a.indicator_id.localeCompare(b.indicator_id,'en',{numeric:true}));
    PREVIEW=rows;
    setStatus(warn.length?`⚠️ ${warn.length} warning(s). Example: ${warn[0]}`:`Preview ${rows.length} rows (mapping mode)`);
    renderPreview(rows);
  }

  async function previewSummaryMode(){
    if (!window.XLSX) {
      try { await ensureXLSX(); } catch(e){
        return setStatus('XLSX not loaded — សូមពិនិត្យ vendor/xlsx.* ឬ CDN', false);
      }
    }
    const fSum = fileSummary?.files?.[0];
    if (!fSum) return setStatus('សូមជ្រើស Summary Excel ជាមុន', false);

    setStatus('កំពុងអាន Summary Excel…');
    tbody.innerHTML=`<tr><td colspan="6" class="text-center text-muted py-4">Loading…</td></tr>`;

    let wb;
    try { wb = await readWB(fSum); }
    catch(e){ setStatus('អាន Summary Excel បរាជ័យ', false); return; }

    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, {header:1, blankrows:false});

    if (!aoa.length) {
      setStatus('Summary sheet ទទេ', false);
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">—</td></tr>`;
      return;
    }

    const header = aoa[0].map(h => String(h||'').trim().toLowerCase());
    const body   = aoa.slice(1);

    const idxId    = header.indexOf('indicator_id');
    const idxName  = header.indexOf('name');
    const idxHC    = header.indexOf('hc');
    const idxHOSP  = header.indexOf('hosp');
    const idxTotal = header.indexOf('total');

    if (idxId<0) {
      setStatus('Header មិនមាន "indicator_id" (សូមធ្វើឲ្យជួរឈរ header ត្រឹមត្រូវ)', false);
      return;
    }

    const rows=[];
    for (const r of body){
      if (!r || r.length===0) continue;
      const id   = (r[idxId]   ?? '').toString().trim();
      if (!id) continue;
      const name = (idxName>=0 ? (r[idxName]??'') : '');
      const hc   = (idxHC>=0   ? (r[idxHC]??'')   : '');
      const hosp = (idxHOSP>=0 ? (r[idxHOSP]??'') : '');
      const tot  = (idxTotal>=0? (r[idxTotal]??''): '');
      const msgs=[]; if(!IND_SET.has(id)) msgs.push('<span class="badge bg-warning text-dark">ID មិនមាន</span>');
      rows.push({
        indicator_id:id,
        name: name,
        hc:   hc,
        hosp: hosp,
        total: tot,
        status: msgs.join(' ')
      });
    }

    rows.sort((a,b)=>a.indicator_id.localeCompare(b.indicator_id,'en',{numeric:true}));
    PREVIEW = rows;
    setStatus(`Preview ${rows.length} rows (summary mode) from sheet "${sheetName}"`);
    renderPreview(rows);
  }

  // Preview button
  btnPreview.addEventListener('click', async ()=>{
    if (importMode === 'summary') {
      await previewSummaryMode();
    } else {
      await previewMappingMode();
    }
  });

  // Import to Firebase (uses PREVIEW for both modes)
  function makeTag(type, val){
    if (type==='month' || type==='quarter' || type==='semester') return String(val||'').toUpperCase();
    if (type==='nine') return 'N9'; if (type==='year') return 'Y';
    return String(val||'').toUpperCase();
  }
  async function fetchExistingMap(period_id){
    try{
      const list = await gasList('reports', { period_id });
      const arr = toArr(list);
      const map = new Map();
      for (const r of (arr||[])){
        const rid=String(r.report_id||'').trim();
        const iid=String(r.indicator_id||'').trim();
        if (rid&&iid) map.set(iid, rid);
      }
      return map;
    }catch{ return new Map(); }
  }
  btnImport.addEventListener('click', async ()=>{
    if (!PREVIEW.length) return;
    const year = Number(yearSel.value||0);
    const tag  = makeTag(perType.value, perValue.value);
    const period_id = `${year}-${tag}`;

    setStatus('កំពុង Import ទៅ Firebase…');
    const existingByInd = await fetchExistingMap(period_id);

    let ok=0, fail=0;
    for (const r of PREVIEW){
      if (!IND_SET.has(r.indicator_id)) { fail++; continue; }
      const foundRid = existingByInd.get(r.indicator_id);
      const report_id = foundRid || `${period_id}-${r.indicator_id}`;
      const nHC = Number(r.hc);
      const nHP = Number(r.hosp);
      const nTotal = Number(r.total);
      const payload = {
        report_id, indicator_id:r.indicator_id, year, tag, period_id,
        value_hc:Number.isFinite(nHC)?nHC:0,
        value_hosp:Number.isFinite(nHP)?nHP:0,
        value:Number.isFinite(nTotal)
          ? nTotal
          : (Number.isFinite(nHC)||Number.isFinite(nHP)
              ? (Number.isFinite(nHC)?nHC:0)+(Number.isFinite(nHP)?nHP:0)
              : 0),
        updated_at:new Date().toISOString(),
      };
      try{ await gasSave('reports', payload); ok++; }catch{ fail++; }
    }
    setStatus(`Import: OK ${ok} • Fail ${fail}`, fail===0);
  });

  /* ==================== Export helpers (reuse DOM) ==================== */
  function getPreviewRowsFromDOM(){
    const rows=[];
    const strip = (s)=> String(s||'').replace(/\s+/g,' ').trim();
    tbody.querySelectorAll('tr').forEach(tr=>{
      const tds=tr.querySelectorAll('td');
      if (tds.length<6) return;
      rows.push({
        id:    strip(tds[0].textContent),
        name:  strip(tds[1].textContent || tds[1].innerText),
        hc:    strip(tds[2].textContent),
        hosp:  strip(tds[3].textContent),
        total: strip(tds[4].textContent),
        status:strip(tds[5].textContent || tds[5].innerText),
      });
    });
    return rows;
  }
  function makeFileTag(){
    const y=(yearSel?.value||'').trim();
    const t=(perType?.value||'').trim();
    const v=(perValue?.value||'').trim();
    const tag=(t==='nine')?'N9':(t==='year'?'Y':(v||'P'));
    return `${y}_${tag}`;
  }
  function currentPeriodLabel() {
    const y = (yearSel?.value || '').trim();
    const t = (perType?.value || '').trim();
    const v = (perValue?.value || '').trim();
    const pretty = (t==='nine') ? '៩ ខែ' : (t==='year' ? 'ឆ្នាំ' : v);
    return `${y}-${t==='nine'?'N9':(t==='year'?'Y':v)} (${pretty})`;
  }

  /* ==================== Export → PDF (columns = preview, Khmer font) ==================== */
  async function exportPreviewPdfDataEntryStyle() {
    const rowsDom = getPreviewRowsFromDOM();
    if (!rowsDom.length){
      setStatus('គ្មានទិន្នន័យក្នុងតារាង', false);
      return;
    }

    const oldHtml = btnPdf.innerHTML;
    const oldDisabled = btnPdf.disabled;
    btnPdf.disabled = true;
    btnPdf.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      កំពុងបង្កើត PDF…
    `;

    try {
      const okPDF = await ensureJsPDF();
      const okAT  = await ensureAutoTable();
      if (!(okPDF && okAT)) throw new Error('jsPDF/autoTable not loaded');

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'A4' });

      // Embed Khmer font
      await ensureJsPDFKhmerFont(doc);
      doc.setFont('NotoSansKhmer','normal');

      // Title
      const label = currentPeriodLabel();
      doc.setFontSize(14);
      doc.text(`Import Preview • ${label}`, 40, 40);

      // Head & Body (exactly like preview table order)
      const head = [['លេខសូចនាករ','ឈ្មោះសូចនាករ','HC','HOSP','សរុប','ស្ថានភាព']];
      const body = rowsDom.map(r => [
        r.id || '',
        r.name || '',
        r.hc || '',
        r.hosp || '',
        r.total || '',
        r.status || ''
      ]);

      doc.autoTable({
        startY: 60,
        head,
        body,
        styles: { font: 'NotoSansKhmer', fontSize: 10, cellPadding: 4 },
        headStyles: { font: 'NotoSansKhmer', fontStyle: 'bold', fillColor: [240,240,240] },
        columnStyles: {
          0: { cellWidth: 90, halign: 'left' },   // ID
          1: { cellWidth: 360, halign: 'left' },  // Name
          2: { cellWidth: 90, halign: 'right' },  // HC
          3: { cellWidth: 90, halign: 'right' },  // HOSP
          4: { cellWidth: 110, halign: 'right' }, // Total
          5: { cellWidth: 150, halign: 'left' },  // Status
        }
      });

      doc.save(`preview_${makeFileTag()}.pdf`);
      setStatus('Exported PDF (Khmer font, preview columns)');
    } catch (e) {
      // Fallback to print if anything fails
      console.warn('PDF failed, fallback print:', e);
      const rows = rowsDom;
      const label = currentPeriodLabel();
      const win = window.open('', '_blank');
      const esc = s => String(s ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      win.document.write(`
        <html><head><meta charset="utf-8"><title>Import Preview • ${esc(label)}</title>
        <style>
          @page { size: A4 landscape; margin: 16mm; }
          body{font-family: "Noto Sans Khmer", system-ui, -apple-system, Segoe UI, Roboto, Arial; margin:0}
          table{border-collapse:collapse;width:100%}
          th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}
          th{background:#f5f5f5}
          td.num{text-align:right}
        </style>
        </head><body>
          <h2 style="margin:0 0 8px 0; padding:0 0 8px 0;">Import Preview • ${esc(label)}</h2>
          <table>
            <thead>
              <tr>
                <th style="width:90px">លេខសូចនាករ</th>
                <th style="width:360px">ឈ្មោះសូចនាករ</th>
                <th style="width:90px">HC</th>
                <th style="width:90px">HOSP</th>
                <th style="width:110px">សរុប</th>
                <th style="width:150px">ស្ថានភាព</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.map(r => `
                  <tr>
                    <td>${esc(r.id||'')}</td>
                    <td>${esc(r.name||'')}</td>
                    <td class="num">${esc(r.hc||'')}</td>
                    <td class="num">${esc(r.hosp||'')}</td>
                    <td class="num">${esc(r.total||'')}</td>
                    <td>${esc(r.status||'')}</td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
          <script>window.onload=()=>window.print()</script>
        </body></html>
      `);
      win.document.close();
      setStatus('Opened print view (fallback)');
    } finally {
      btnPdf.innerHTML = oldHtml;
      btnPdf.disabled = oldDisabled;
    }
  }

  // Hook PDF button
  btnPdf.addEventListener('click', async () => {
    await exportPreviewPdfDataEntryStyle();
  });

  /* ==================== Export → Excel ==================== */
  btnXlsx.addEventListener('click', ()=>{
    if (!window.XLSX) return setStatus('XLSX not loaded', false);
    const data=[['ID','Name','HC','HOSP','Total','Status']];

    tbody.querySelectorAll('tr').forEach(tr=>{
      const tds=tr.querySelectorAll('td'); if (tds.length<6) return;
      data.push([...tds].map(td=>td.textContent.trim()));
    });
    try{
      const y=(yearSel?.value||'').trim();
      const t=(perType?.value||'').trim();
      const v=(perValue?.value||'').trim();
      const tag=(t==='nine')?'N9':(t==='year'?'Y':(v||'P'));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Preview');
      XLSX.writeFile(wb, `preview_${y}_${tag}.xlsx`);
      setStatus('Exported Excel');
    }catch(e){ setStatus('Excel export failed: ' + (e?.message||e), false); }
  });

  setStatus('Ready');
}

export function getTitle(){ return 'Import Excel | PHD Report'; }
