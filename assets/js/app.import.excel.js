// assets/js/pages/import-excel.page.js
import { gasList, gasSave } from '../app.api.firebase.js';
import { isSuper, isAdmin } from '../app.auth.js';

export default async function hydrate(root){
  // ---------- Access control ----------
  if (!(isSuper() || isAdmin())){
    root.innerHTML = `
      <div class="container-page">
        <div class="alert alert-warning mt-3">
          <strong>គ្មានសិទ្ធិចូល</strong> — ត្រូវការ Admin ឬ Super User។
          <a href="#/" class="ms-2">ត្រឡប់​ទំព័រដើម</a>
        </div>
      </div>`;
    return;
  }

  // ---------- DOM ----------
  const $ = s => root.querySelector(s);
  const yearSel   = $('#impYear');
  const tagSel    = $('#impTag');
  const fileHC    = $('#fileHC');
  const fileHOSP  = $('#fileHOSP');
  const btnPreview= $('#btnPreview');
  const btnImport = $('#btnImport');
  const statusEl  = $('#statusLine');
  const tbody     = $('#impTbody');

  // ---------- Indicators ----------
  const indicators = await gasList('indicators').catch(()=>[]);
  const IND_SET  = new Set(indicators.map(i => String(i.indicator_id)));
  const IND_NAME = Object.fromEntries(indicators.map(i => [
    String(i.indicator_id), i.indicator_name || ''
  ]));

  // ---------- Year/Tag pickers ----------
  (function initYearTag(){
    const y = new Date().getFullYear();
    const ys=[]; for(let k=y-4;k<=y+1;k++) ys.push(k);
    yearSel.innerHTML = ys.reverse().map(v=>`<option>${v}</option>`).join('');
    yearSel.value = y;
    const opts=[]; for(let m=1;m<=12;m++){ const mm=String(m).padStart(2,'0'); opts.push(`<option value="M${mm}">M${mm}</option>`); }
    tagSel.innerHTML = opts.join('');
    tagSel.value = `M${String(new Date().getMonth()+1).padStart(2,'0')}`;
  })();

  // ---------- Mapping from DB (import_mappings) ----------
  // Accept both hosp_* and hp_* (backward compatibility)
  let MAPPING = { hc:[], hosp:[] };

  function rowsToMapping(rows = []){
    const hc=[], hosp=[];
    for (const r of rows){
      if (r.active === 0 || r.active === false) continue;
      const id = String(r.indicator_id||'').trim();
      if (!id) continue;

      // HC
      const hcSheet = r.hc_sheet ?? r.HC_SHEET ?? r.hcSheet;
      const hcCell  = r.hc_cell  ?? r.HC_CELL  ?? r.hcCell;
      if (hcSheet && hcCell) hc.push({ indicator_id:id, sheet:hcSheet, cell:hcCell });

      // HOSP (accept hosp_* and hp_*)
      const hSheet = r.hosp_sheet ?? r.hp_sheet ?? r.HOSP_SHEET ?? r.hpSheet;
      const hCell  = r.hosp_cell  ?? r.hp_cell  ?? r.HOSP_CELL  ?? r.hpCell;
      if (hSheet && hCell) hosp.push({ indicator_id:id, sheet:hSheet, cell:hCell });
    }
    return { hc, hosp };
  }

  async function loadMappingFromDB(){
    try{
      const rows = await gasList('import_mappings').catch(()=>[]);
      MAPPING = rowsToMapping(rows);
      const total = (MAPPING.hc?.length||0) + (MAPPING.hosp?.length||0);
      setStatus(total ? `Loaded ${total} mappings from DB` : 'No mapping in DB', !!total);
      console.debug('[IMP] Mapping (hc/hosp counts):', MAPPING.hc?.length||0, MAPPING.hosp?.length||0);
    }catch(e){
      setStatus('Load mapping from DB failed', false);
      console.error('[IMP] loadMappingFromDB error:', e);
    }
  }
  await loadMappingFromDB();

  // ---------- XLSX helpers ----------
  function readWB(file){
    return new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = () => {
        try{
          const wb = XLSX.read(fr.result, { type:'array', cellDates:true, dense:true });
          res(wb);
        }catch(e){ rej(e); }
      };
      fr.onerror = rej;
      fr.readAsArrayBuffer(file);
    });
  }

  // Support: number (1-based), "Page 1", "សន្លឹក 1", name (exact/partial)
  function resolveSheet(wb, input){
    if (!wb || !input) return null;
    const s = String(input).trim();

    // 1) pure number
    if (/^\d+$/.test(s)){
      const idx = parseInt(s,10)-1;
      const nm = wb.SheetNames[idx];
      return nm ? wb.Sheets[nm] : null;
    }

    // 2) "Page 1" / "page 2" / "សន្លឹក 3"
    const mNum = s.match(/(?:page|សន្លឹក)\s*(\d+)/i);
    if (mNum){
      const idx = parseInt(mNum[1],10)-1;
      const nm = wb.SheetNames[idx];
      return nm ? wb.Sheets[nm] : null;
    }

    // 3) name
    const want = s.toLowerCase();
    let hit = wb.SheetNames.find(n => n.toLowerCase() === want);
    if (!hit) hit = wb.SheetNames.find(n => n.toLowerCase().includes(want));
    return hit ? wb.Sheets[hit] : null;
  }

  function getCell(ws, addr){
    const c = XLSX.utils.decode_cell(addr);
    const row = ws[c.r] || [];
    const cell = row[c.c];
    return cell?.v ?? '';
  }

  function sumRange(ws, a1range){
    const r = XLSX.utils.decode_range(a1range);
    let s=0, ok=false;
    for (let R=r.s.r; R<=r.e.r; R++){
      for (let C=r.s.c; C<=r.e.c; C++){
        const v = Number((ws[R]||[])[C]?.v);
        if (Number.isFinite(v)){ s+=v; ok=true; }
      }
    }
    return ok ? s : '';
  }

  function pickValue(wb, sheet, cell){
    const ws = resolveSheet(wb, sheet);
    if (!ws) return '';
    const cc = String(cell||'').trim();
    if (!cc) return '';
    if (cc.includes(':')) return sumRange(ws, cc);
    return Number(getCell(ws, cc));
  }

  // ---------- Preview / Import ----------
  let PREVIEW = [];

  function setStatus(m, ok=true){
    if (!statusEl) return;
    statusEl.textContent = m || '';
    statusEl.classList.toggle('text-danger', !ok);
  }

  function renderPreview(){
    if (!PREVIEW.length){
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">—</td></tr>`;
      btnImport.disabled = true;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const r of PREVIEW){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${r.indicator_id}</code></td>
        <td>${r.name}</td>
        <td class="text-end">${r.hc}</td>
        <td class="text-end">${r.hosp}</td>
        <td class="text-end fw-semibold">${r.total}</td>
        <td>${r.valid ? '' : '<span class="badge bg-warning text-dark">ID មិនមាន</span>'}</td>`;
      frag.appendChild(tr);
    }
    tbody.innerHTML=''; tbody.appendChild(frag);
    btnImport.disabled = false;
  }

  btnPreview.addEventListener('click', async ()=>{
    const fHC   = fileHC.files?.[0];
    const fHOSP = fileHOSP.files?.[0];
    if (!fHC || !fHOSP){ setStatus('សូមជ្រើស HC និង HOSP Excel', false); return; }

    if ((!MAPPING.hc?.length) && (!MAPPING.hosp?.length)){
      await loadMappingFromDB();
    }

    setStatus('កំពុងអាន Excel…');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Loading…</td></tr>`;

    let wbHC, wbHP;
    try{
      [wbHC, wbHP] = await Promise.all([readWB(fHC), readWB(fHOSP)]);
      console.debug('[IMP] HC SheetNames:', wbHC.SheetNames);
      console.debug('[IMP] HOSP SheetNames:', wbHP.SheetNames);
    }catch(e){
      setStatus('អាន Excel បរាជ័យ', false);
      console.error('[IMP] readWB error:', e);
      return;
    }

    const mapHC = new Map();
    const mapHP = new Map();

    for (const m of MAPPING.hc || []){
      const id = String(m.indicator_id||'').trim(); if (!id) continue;
      console.debug('[IMP] HC map', id, '→', m.sheet, m.cell);
      const v = pickValue(wbHC, m.sheet, m.cell);
      mapHC.set(id, Number(v) || 0);
    }
    for (const m of MAPPING.hosp || []){
      const id = String(m.indicator_id||'').trim(); if (!id) continue;
      console.debug('[IMP] HOSP map', id, '→', m.sheet, m.cell);
      const v = pickValue(wbHP, m.sheet, m.cell);
      mapHP.set(id, Number(v) || 0);
    }

    const allIds = new Set([...mapHC.keys(), ...mapHP.keys()]);
    PREVIEW = [];
    allIds.forEach(id=>{
      const hc = mapHC.get(id) || 0;
      const hp = mapHP.get(id) || 0;
      const tot = hc + hp;
      PREVIEW.push({
        indicator_id:id,
        name: IND_NAME[id] || '',
        hc, hosp: hp, total: tot,
        valid: IND_SET.has(id)
      });
    });

    PREVIEW.sort((a,b)=> a.indicator_id.localeCompare(b.indicator_id,'en',{numeric:true}));
    setStatus(`Preview (${PREVIEW.length}) — source: DB`);
    renderPreview();
  });

  btnImport.addEventListener('click', async ()=>{
    if (!PREVIEW.length) return;
    const year = Number(yearSel.value||0);
    const tag  = String(tagSel.value||'').toUpperCase();

    setStatus('កំពុង Import ទៅ Firebase…');
    let ok=0, fail=0;

    for (const r of PREVIEW){
      if (!r.valid){ fail++; continue; }
      const payload = {
        indicator_id: r.indicator_id,
        year, tag,
        period_id: `${year}-${tag.replace(/^M/, '')}`,
        value: Number(r.total) || 0,
        updated_at: new Date().toISOString()
      };
      try{
        await gasSave('reports', payload);
        ok++;
      }catch(e){
        fail++;
        console.warn('[IMP] save fail', r.indicator_id, e);
      }
    }
    setStatus(`Import: OK ${ok} • Fail ${fail}`, fail===0);
  });
}

export function getTitle(){ return 'Import Excel | PHD Report'; }
