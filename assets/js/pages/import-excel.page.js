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

/* ==================== pdfmake loader + Khmer fonts ==================== */
async function ensurePdfMake(){
  if (window.pdfMake && window.pdfMake.createPdf) return true;
  await loadScript('https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js');
  return !!(window.pdfMake && window.pdfMake.createPdf);
}
function arrayBufferToBase64(buf){
  let out='', bytes=new Uint8Array(buf), chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    out += String.fromCharCode(...bytes.subarray(i,i+chunk));
  }
  return btoa(out);
}
async function fetchAsBase64(url){
  const r = await fetch(url + (url.includes('?')?'&':'?') + 'v=' + Date.now(), {cache:'no-store'});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText} @ ${url}`);
  return arrayBufferToBase64(await r.arrayBuffer());
}
async function ensureKhmerFontPdfMake(){
  if (!window.pdfMake || !window.pdfMake.createPdf) {
    const ok = await ensurePdfMake();
    if (!ok) throw new Error('pdfMake not loaded');
  }
  if (window.__kmPdfMakeReady) return true;

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
    let last; for (const u of list){ try{ return await fetchAsBase64(u); }catch(e){ last=e; } }
    throw last || new Error('Cannot load NotoSansKhmer TTF from /assets/fonts');
  }

  const [regB64, boldB64] = await Promise.all([ firstOk(REG), firstOk(BOLD) ]);

  window.pdfMake.vfs = window.pdfMake.vfs || {};
  window.pdfMake.vfs['NotoSansKhmer-Regular.ttf'] = regB64;
  window.pdfMake.vfs['NotoSansKhmer-Bold.ttf']    = boldB64;

  window.pdfMake.fonts = Object.assign({}, window.pdfMake.fonts, {
    NotoSansKhmer: {
      normal: 'NotoSansKhmer-Regular.ttf',
      bold:   'NotoSansKhmer-Bold.ttf',
      italics: 'NotoSansKhmer-Regular.ttf',
      bolditalics: 'NotoSansKhmer-Bold.ttf',
    }
  });

  window.__kmPdfMakeReady = true;
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

/* ==================== Number parsing (Khmer-friendly) ==================== */
function normalizeSpaces(s){ return s.replace(/[\u00A0\u200B\u202F\u2009\u2007]/g,' '); }
function khToAr(s){
  if(s==null) return s;
  const m={'០':'0','១':'1','២':'2','៣':'3','៤':'4','៥':'5','៦':'6','៧':'7','៨':'8','៩':'9'};
  return String(s).replace(/[០-៩]/g,d=>m[d]||d);
}
function stripGroupSeps(str){
  let s=str.replace(/[៖។]/g,' ');
  if (s.includes(',') && s.includes('.')){
    if (/,(\d{1,2})$/.test(s)) s=s.replace(/\./g,'').replace(',', '.');          // 1.234.567,89 → 1234567.89
    else if (/\.(\d{1,2})$/.test(s)) s=s.replace(/,/g,'');                         // 1,234,567.89 → 1234567.89
    else s=s.replace(/,/g,'');
    return s;
  }
  if (s.includes(',')) return s.replace(/,/g,'');
  const partsByDot = s.split('.');
  if (partsByDot.length>2 || /\.\d{3}$/.test(s)) return s.replace(/\./g,'');
  return s;
}
function extractNumberFromText(x){
  if (x==null) return '';
  let s = khToAr(String(x)); s=normalizeSpaces(s).trim();
  const rxGrouped = /-?\d{1,3}(?:[ ,.\u00A0\u202F\u2009\u2007]\d{3})+(?:[.,]\d+)?/;
  const rxPlain   = /-?\d+(?:[.,]\d+)?/;
  let m = s.match(rxGrouped); if(!m) m=s.match(rxPlain); if(!m) return '';
  let numStr = stripGroupSeps(m[0]).replace(/\s+/g,'');
  const n=Number(numStr); return Number.isFinite(n)?n:'';
}
function toNumberIfPossible(x){
  if (x==null) return '';
  if (typeof x==='number' && Number.isFinite(x)) return x;
  let s = normalizeSpaces(khToAr(String(x).trim()));
  const isPct=/%$/.test(s); if (isPct) s=s.slice(0,-1);
  const isPar=/^\(.*\)$/.test(s); if (isPar) s=s.replace(/^\(|\)$/g,'');
  let n = extractNumberFromText(s); if (n==='') return String(x);
  n = Number(n); if (!Number.isFinite(n)) return String(x);
  if (isPct) n = n/100; if (isPar) n=-n; return n;
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
    return any?acc:''; }
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
  for(let R=r.s.r; R<=r.e.r; R++){
    for(let C=r.s.c; C<=r.e.c; C++){
      const {r:mr,c:mc}=mergedMasterRC(ws,R,C); const key=`${mr},${mc}`; if(seen.has(key)) continue; seen.add(key);
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

/* ==================== Cross-file formula evaluator ==================== */
// Split arguments at top-level, honoring nested () and quoted strings
function _splitArgsTopLevel(s){
  const out = [];
  let cur = '', depth = 0, inQuote = null, prev = '';
  for (let i = 0; i < s.length; i++){
    const ch = s[i];
    if (inQuote){
      if (ch === inQuote && prev !== '\\') inQuote = null;
      cur += ch; prev = ch; continue;
    }
    if (ch === '"' || ch === "'"){ inQuote = ch; cur += ch; prev = ch; continue; }
    if (ch === '('){ depth++; cur += ch; prev = ch; continue; }
    if (ch === ')'){ if (depth > 0) depth--; cur += ch; prev = ch; continue; }
    if (ch === ',' && depth === 0){ out.push(cur.trim()); cur=''; prev = ch; continue; }
    cur += ch; prev = ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

function readA1FromWB(WB, a1){
  const [sheet, cell] = String(a1||'').split('!');
  if(!sheet || !cell) return '';
  const got = pickValueMerged(WB, sheet, cell);
  return got ? got.value : '';
}

function _resolveHC_HOSP(expr, HC_WB, HP_WB){
  let out = String(expr||'');

  // HC("Sheet!A1")
  out = out.replace(/HC\s*\(\s*["']([^"']+)["']\s*\)/gi, (_,ref)=>{
    const v = readA1FromWB(HC_WB, ref); const n=toNumberIfPossible(v); return Number.isFinite(n)?String(n):'0';
  });

  // HOSP("Sheet!A1")
  out = out.replace(/HOSP\s*\(\s*["']([^"']+)["']\s*\)/gi, (_,ref)=>{
    const v = readA1FromWB(HP_WB, ref); const n=toNumberIfPossible(v); return Number.isFinite(n)?String(n):'0';
  });

  // NUM("something") or NUM(123)
  out = out.replace(/\bNUM\s*\(\s*([^()]+?)\s*\)/gi, (_,inside)=>{
    const n = toNumberIfPossible(inside); return Number.isFinite(n)?String(n):'0';
  });

  return out;
}

function _evalFuncCall(name, args){
  const num = (v)=>{
    const n = toNumberIfPossible(v);
    return (typeof n === 'number' && Number.isFinite(n)) ? n : 0;
  };
  // evaluate nested expressions in args first
  const evalArg = (s)=> {
    let e = String(s||'');
    e = _reduceFunctions(_resolveHC_HOSP(e, null, null)); // handles nested NUM/ROUND etc if any literal
    const safe = e.replace(/[^0-9+\-*/().\s]/g,'');
    try { const v = Function('"use strict";return ('+ (safe||'0') +');')(); return Number(v)||0; }
    catch { return num(s); }
  };

  // Handle ROUND(x, d)
  const Nraw = args || [];
  if (name === 'ROUND'){
    const x = Nraw.length ? evalArg(Nraw[0]) : 0;
    const d = Nraw.length >= 2 ? Math.max(0, Math.floor(num(Nraw[1]))) : 0;
    const p = Math.pow(10, d);
    return Math.round(x * p) / p;
  }

  const N = Nraw.map(evalArg);

  switch (name) {
    case 'SUM':  return N.reduce((a,b)=>a+b, 0);
    case 'AVG':  return N.length ? N.reduce((a,b)=>a+b, 0) / N.length : 0;
    case 'MIN':  return N.length ? Math.min(...N) : 0;
    case 'MAX':  return N.length ? Math.max(...N) : 0;
    case 'NUM':  return N.length ? N[0] : 0;
    default: return 0;
  }
}

// Reduce function calls with nested parentheses support
function _reduceFunctions(expr){
  const FN = /\b(SUM|AVG|MIN|MAX|NUM|ROUND)\s*\(/i;
  let guard = 0, s = String(expr||'');
  while (guard++ < 1000){
    const m = s.match(FN);
    if (!m) break;

    const fn = m[1].toUpperCase();
    let i = m.index + m[0].length; // after '('
    let depth = 1, inQuote = null, prev = '';
    for (; i < s.length; i++){
      const ch = s[i];
      if (inQuote){
        if (ch === inQuote && prev !== '\\') inQuote = null;
        prev = ch; continue;
      }
      if (ch === '"' || ch === "'"){ inQuote = ch; prev = ch; continue; }
      if (ch === '('){ depth++; prev = ch; continue; }
      if (ch === ')'){ depth--; if (depth === 0) break; prev = ch; continue; }
      prev = ch;
    }
    if (depth !== 0) break; // unbalanced—stop defensively

    const inner = s.slice(m.index + m[0].length, i);
    const args  = _splitArgsTopLevel(inner);
    const val   = _evalFuncCall(fn, args);

    s = s.slice(0, m.index) + String(val) + s.slice(i + 1);
  }
  return s;
}

function evalResultFormula(expr, hcVal, hpVal, HC_WB, HP_WB){
  let raw = String(expr||'').trim();
  const hcNum = toNumberIfPossible(hcVal), hpNum = toNumberIfPossible(hpVal);

  // Default behavior when no formula: sum of HC/HOSP
  if (!raw){
    if (Number.isFinite(hcNum) && Number.isFinite(hpNum)) return hcNum + hpNum;
    if (Number.isFinite(hcNum)) return hcNum;
    if (Number.isFinite(hpNum)) return hpNum;
    return '';
  }

  // Resolve embedded HC("S!A1"), HOSP("S!A1"), NUM(...)
  raw = _resolveHC_HOSP(raw, HC_WB, HP_WB);

  // Allow direct token HC/HOSP (already computed)
  raw = raw.replace(/\bHC\b/g, Number.isFinite(hcNum)?`(${hcNum})`:'0');
  raw = raw.replace(/\bHOSP\b/g, Number.isFinite(hpNum)?`(${hpNum})`:'0');

  // Reduce functions (SUM/AVG/ROUND/…)
  raw = _reduceFunctions(raw);

  // Final safe eval (numbers and ops only)
  const safeExpr = raw.replace(/[^0-9+\-*/().\s]/g,'');
  try{
    const val = Function('"use strict";return ('+ (safeExpr||'0') +');')();
    const n=Number(val);
    return Number.isFinite(n)?n:'';
  }catch{
    return '';
  }
}

/* ==================== PDF helpers (data-entry-like layout) ==================== */
function safe(v){ return (v===null || v===undefined) ? '' : String(v); }
function nowKh(){
  const d=new Date();
  const two=(n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
async function tryLoadLogoBase64(){
  try{
    const r = await fetch('/assets/img/logo.png', {cache:'no-store'});
    if(!r.ok) return null;
    const b = await r.blob();
    return await new Promise((res)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
  }catch{ return null; }
}
function buildPdfDocLikeDataEntry(srcRows, meta){
  const headerRow = [
    {text:'លេខសូចនាករ', style:'th', alignment:'center'},
    {text:'ឈ្មោះសូចនាករ', style:'th', alignment:'left'},
    {text:'HC', style:'th', alignment:'right'},
    {text:'HOSP', style:'th', alignment:'right'},
    {text:'សរុប', style:'th', alignment:'right'},
    {text:'ស្ថានភាព', style:'th', alignment:'left'},
  ];
  const body = [headerRow];
  for (const r of srcRows){
    body.push([
      {text: r.id, style:'td', alignment:'center'},
      {text: r.name, style:'td'},
      {text: r.hc, style:'tdNum', alignment:'right'},
      {text: r.hosp, style:'tdNum', alignment:'right'},
      {text: r.total, style:'tdNumBold', alignment:'right'},
      {text: r.status, style:'td'},
    ]);
  }

  return {
    pageSize:'A4',
    pageOrientation:'landscape',
    pageMargins:[26, 90, 26, 40],
    defaultStyle:{ font:'NotoSansKhmer', fontSize:10, lineHeight:1.15 },
    header: (currentPage, pageCount)=>({
      margin:[26,20,26,10],
      columns:[
        {
          width:'*',
          stack:[
            { text: meta.title || 'PHD Report — Import Preview', style:'title' },
            { text: `ឆ្នាំ: ${meta.year}  •  កំឡុងពេល: ${meta.period}  •  បង្កើតនៅ: ${meta.generated}`, style:'sub' }
          ]
        },
        (meta.logoData ? { width:70, image: meta.logoData, fit:[70,70], alignment:'right', margin:[0,0,0,0] } : '')
      ]
    }),
    footer: (currentPage, pageCount)=>({
      margin:[26, 8, 26, 8],
      columns:[
        { text: meta.org || 'Provincial Health Department — Stung Treng', style:'footLeft' },
        { text: `ទំព័រ ${currentPage}/${pageCount}`, alignment:'right', style:'footRight' }
      ]
    }),
    content:[
      {
        table:{
          headerRows:1,
          widths:[60, '*', 70, 70, 70, 120],
          body
        },
        layout:{
          fillColor:(rowIdx)=> (rowIdx===0? '#f2f4f7' : (rowIdx % 2 ? null : '#fcfcfd')),
          hLineColor: '#e5e7eb',
          vLineColor: '#e5e7eb'
        }
      }
    ],
    styles:{
      title:{ fontSize:16, bold:true, margin:[0,0,0,4] },
      sub:{ color:'#374151' },
      th:{ bold:true, color:'#111827' },
      td:{ color:'#111827' },
      tdNum:{ color:'#111827' },
      tdNumBold:{ bold:true, color:'#111827' },
      footLeft:{ color:'#6b7280' },
      footRight:{ color:'#6b7280' }
    }
  };
}

/* ==================== Dialog helper ==================== */
function ensureDialog(root){
  let dlg=root.querySelector('#sysDialog');
  if(!dlg){
    dlg=document.createElement('dialog'); dlg.id='sysDialog';
    dlg.innerHTML=`
      <form method="dialog" style="min-width:420px;max-width:80vw">
        <h5 id="dlgTitle" class="mb-2"></h5>
        <div id="dlgBody" class="small"></div>
        <div class="text-end mt-3">
          <button class="btn btn-sm btn-primary" value="ok">OK</button>
        </div>
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
    hc_formula:String(r.hc_formula||'').trim(),
    hosp_formula:String(r.hosp_formula||'').trim(),
    result_formula:String(r.result_formula||'').trim(),
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
    catch(e){ setStatus('អាន Excel បរាជ័យ', false); return; }

    const rows=[], warn=[];
    for (const m of MAPPING){
      const id=String(m.indicator_id||'').trim(); if(!id) continue;

      // HC value
      let hcCellVal='', hpCellVal='';
      if (m.hc_sheet && m.hc_cell){
        const r=pickValueMerged(HC_WB, m.hc_sheet, m.hc_cell);
        if(r.error==='SHEET_NOT_FOUND') warn.push(`HC sheet "${r.sheetName}" not found for ${id}`);
        hcCellVal=r.value;
      }
      if (m.hosp_sheet && m.hosp_cell){
        const r=pickValueMerged(HP_WB, m.hosp_sheet, m.hosp_cell);
        if(r.error==='SHEET_NOT_FOUND') warn.push(`HOSP sheet "${r.sheetName}" not found for ${id}`);
        hpCellVal=r.value;
      }

      const hcVal = m.hc_formula ? evalResultFormula(m.hc_formula, '', '', HC_WB, HP_WB) : hcCellVal;
      const hpVal = m.hosp_formula ? evalResultFormula(m.hosp_formula, '', '', HC_WB, HP_WB) : hpCellVal;
      const total = evalResultFormula(m.result_formula, hcVal, hpVal, HC_WB, HP_WB);

      const nHC=Number(hcVal), nHP=Number(hpVal), nT=Number(total);
      const valHC=Number.isFinite(nHC)?nHC:(hcVal===''?'':hcVal);
      const valHP=Number.isFinite(nHP)?nHP:(hpVal===''?'':hpVal);
      const valT = Number.isFinite(nT)
        ? nT
        : (Number.isFinite(nHC)||Number.isFinite(nHP)
            ? (Number.isFinite(nHC)?nHC:0)+(Number.isFinite(nHP)?nHP:0)
            : '');

      const msgs=[]; if(!IND_SET.has(id)) msgs.push('<span class="badge bg-warning text-dark">ID មិនមាន</span>');
      rows.push({ indicator_id:id, name:IND_NAME[id]||'', hc:valHC, hosp:valHP, total:valT, status:msgs.join(' ') });
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
      rows.push({ indicator_id:id, name, hc, hosp, total:tot, status:msgs.join(' ') });
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

    let ok=0, fail=0, errs=[];
    for (const r of PREVIEW){
      if (!IND_SET.has(r.indicator_id)) { fail++; errs.push(`Unknown ID ${r.indicator_id}`); continue; }
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
      try{ await gasSave('reports', payload); ok++; }
      catch(e){ fail++; errs.push(`${r.indicator_id}: ${e?.message||e}`); }
    }
    const okMsg = `Import: OK ${ok} • Fail ${fail}`;
    setStatus(okMsg, fail===0);
    showDialog(root, fail? 'Import finished with errors' : 'Import success',
      `<div>${okMsg}</div>` + (fail? `<div class="small text-danger mt-2">${errs.slice(0,10).map(esc).join('<br>')}${errs.length>10?' …':''}</div>` : '')
    );
  });
  const esc = (s)=> String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  /* ==================== Export → PDF (like data-entry) ==================== */
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
  btnPdf.addEventListener('click', async () => {
    const src = getPreviewRowsFromDOM();
    if (!Array.isArray(src) || !src.length){
      setStatus('គ្មានទិន្នន័យក្នុងតារាង', false); 
      return;
    }

    try{
      await ensureKhmerFontPdfMake();

      const meta = {
        title: 'សង្ខេបលទ្ធផលនាំចូល (Import Preview)',
        year: (yearSel?.value||'').trim(),
        period: (perType?.value||'').trim()==='nine' ? '៩ ខែ'
                : (perType?.value||'').trim()==='year' ? 'ឆ្នាំ'
                : (perValue?.value||'').trim(),
        generated: nowKh(),
        org: 'មន្ទីរសុខាភិបាលខេត្ត ស្ទឹងត្រែង',
        logoData: await tryLoadLogoBase64()
      };

      const tableDoc = buildPdfDocLikeDataEntry(src, meta);

      await new Promise((res, rej)=>{
        try{
          window.pdfMake.createPdf(tableDoc).getBlob(
            blob => blob ? res(true) : rej(new Error('pdf blob null'))
          );
        }catch(e){ rej(e); }
      });

      window.pdfMake.createPdf(tableDoc).download(`preview_${makeFileTag()}.pdf`);
      setStatus('Exported PDF (data-entry style)');
    }catch(err){
      setStatus('PDF export failed: ' + (err?.message || err), false);
    }
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
      const tag = makeFileTag();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Preview');
      XLSX.writeFile(wb, `preview_${tag}.xlsx`);
      setStatus('Exported Excel');
    }catch(e){ setStatus('Excel export failed: ' + (e?.message||e), false); }
  });

  setStatus('Ready');
}

export function getTitle(){ return 'Import Excel | PHD Report'; }
