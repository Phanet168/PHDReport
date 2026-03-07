// assets/js/pages/reports.page.js
// Khmer Summary Report — group by Department → Unit, show Value & Target,
// and send PDF payload to Google Apps Script Web App.
//
// ✅ For Firestore schema (from screenshot):
// - reports docs contain: period_id: "2025-Y", indicator_id, unit_id, value, target, created_at, updated_at
// - Year is derived from period_id (not from field "year")
// - Periods supported: YYYY-Y, YYYY-N9, YYYY-H1/H2, YYYY-Q1..Q4, YYYY-M01..M12, YYYY-01..12
// - No "@last" (must choose exact period)

import { gasList } from '../app.api.firebase.js';
import { isSuper } from '../app.auth.js';

export default async function reportsPage(root, ctx){
  const GAS_WEBAPP = 'https://script.google.com/macros/s/AKfycbxYy_0Njta5t0lq4LJUFgVPkUsQNVuRCJDGuJmy1jZ6opVS380YoeBLVRTaxblyk1R0/exec';

  const $  = s => root.querySelector(s);
  const $$ = s => Array.from(root.querySelectorAll(s));

  const bodyEl   = $('#tblReportsBody');
  const yearSel  = $('#reportYear');
  const tagSel   = $('#reportTag');
  const txtQ     = $('#reportSearch');
  const btnApply = $('#btnSearchReports');
  const segBtns  = $$('.segbtn');
  const btnPDFP  = $('#btnDownloadProvince');
  const btnPDFM  = $('#btnDownloadMinistry');
  const statusEl = $('#status');
  if (!bodyEl) return;

  const SUPER = isSuper();

  const KH_MONTHS = ['មករា','កុម្ភៈ','មីនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const pretty = (y,t)=>!y||!t?'' : (
    /^M\d{2}$/.test(t) ? `${KH_MONTHS[+t.slice(1)-1]} ${y}` :
    (t==='Y12' ? `ឆ្នាំ ${y}` : (t==='N9' ? `៩ខែ ${y}` : `${y} ${t}`))
  );

  // Parse "period_id" like "2025-Y", "2025-Q1", "2025-M01", "2025-01", ...
  // fallback: id like "2025-Y__591__40"
  const normPeriod = (obj = {})=>{
    let pid = String(obj.period_id || obj.periodId || '').trim();

    if (!pid) {
      const rawId = String(obj.id || obj.doc_id || obj.docId || '').trim();
      if (rawId.includes('__')) pid = rawId.split('__')[0]; // "2025-Y"
    }

    if (pid) {
      let m = pid.match(/^(\d{4})-Y$/i);
      if (m) return { year: +m[1], tag: 'Y12', pid };

      m = pid.match(/^(\d{4})-N9$/i);
      if (m) return { year: +m[1], tag: 'N9', pid };

      m = pid.match(/^(\d{4})-H([12])$/i);
      if (m) return { year: +m[1], tag: `H${m[2]}`, pid };

      m = pid.match(/^(\d{4})-Q([1-4])$/i);
      if (m) return { year: +m[1], tag: `Q${m[2]}`, pid };

      m = pid.match(/^(\d{4})-M(0[1-9]|1[0-2])$/i);
      if (m) return { year: +m[1], tag: `M${m[2]}`, pid };

      m = pid.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
      if (m) return { year: +m[1], tag: `M${m[2]}`, pid };
    }

    // ultimate fallback if your actions have year/tag fields
    let year = obj.year;
    if (typeof year === 'string' && /^\d{4}$/.test(year)) year = parseInt(year, 10);
    if (typeof year !== 'number') year = undefined;

    const t0 = String(obj.tag || obj.month || '').toUpperCase().trim();
    return { year, tag: t0, pid };
  };

  const keyOf = (indicator_id, year, tag)=> `${indicator_id}|${year}|${tag}`;

  const toB64UTF8 = (obj)=>{
    const s = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };

  /* ===== State ===== */
  let MODE = 'M';
  let REP_MAP  = new Map();
  let YEARS    = new Set();
  let BASE_ROWS = [];
  let ACTIONS_IDX = new Map();

  /* ===== Skeleton ===== */
  (function skel(n=6){
    bodyEl.innerHTML = '';
    for (let i=0;i<n;i++){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5">
        <div class="skeleton" style="height:18px; width:30%"></div>
        <div class="skeleton mt-2" style="height:14px; width:80%"></div>
      </td>`;
      bodyEl.appendChild(tr);
    }
  })();

  /* ===== Load data ===== */
  const [indicators, units, depts, actions, reports] = await Promise.all([
    gasList('indicators').catch(()=>[]),
    gasList('units').catch(()=>[]),
    gasList('departments').catch(()=>[]),
    gasList('actions').catch(()=>[]),
    gasList('reports').catch(()=>[]),
  ]);

  const unitMeta = new Map((units||[]).map(u=>[
    String(u.unit_id),
    { name: u.unit_name, dept: String(u.department_id||'') }
  ]));
  const deptName = Object.fromEntries((depts||[]).map(d=>[
    String(d.department_id), d.department_name
  ]));

  BASE_ROWS = (indicators||[]).map(ind=>{
    const id  = String(ind.indicator_id);
    const uid = String(ind.unit_id || '');
    const did = String(ind.department_id || unitMeta.get(uid)?.dept || '');
    return {
      indicator_id   : id,
      indicator_name : ind.indicator_name || '',
      unit_id        : uid,
      unit_name      : unitMeta.get(uid)?.name || '',
      department_id  : did,
      department_name: deptName[did] || ''
    };
  });

  // ACTIONS_IDX
  ACTIONS_IDX = new Map();
  (actions||[]).forEach(a=>{
    const { year, tag } = normPeriod(a);
    if (!year || !tag) return;
    YEARS.add(year);

    const id = String(a.indicator_id||'');
    const k  = keyOf(id, year, tag);
    const cur = ACTIONS_IDX.get(k) || {issues:[], actions:[]};

    if (a.issue_text)  cur.issues.push(a.issue_text);
    if (a.action_text) cur.actions.push(a.action_text);

    ACTIONS_IDX.set(k, cur);
  });

  // REP_MAP
  REP_MAP = new Map();
  (reports||[]).forEach(r=>{
    const { year, tag } = normPeriod(r);
    if (!year || !tag) return;
    YEARS.add(year);

    const indId = String(r.indicator_id||'');
    REP_MAP.set(keyOf(indId, year, tag), {
      value: Number(r.value ?? r.val ?? r.current ?? NaN),
      target: Number(r.target ?? r.plan ?? NaN)
    });
  });

  if (!YEARS.size) YEARS.add(new Date().getFullYear());

  /* ===== Controls ===== */
  function buildYearOptions(){
    const list = [...YEARS].filter(Boolean).sort((a,b)=>b-a);
    yearSel.innerHTML = list.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(list[0]);
  }

  function buildTagOptions(){
    const t = MODE;
    const opts = [];

    if (t==='M'){
      for (let m=1;m<=12;m++){
        const mm = 'M'+String(m).padStart(2,'0');
        opts.push(`<option value="${mm}">${KH_MONTHS[m-1]} (${mm})</option>`);
      }
    } else if (t==='Q'){
      opts.push(...['Q1','Q2','Q3','Q4'].map(x=>`<option value="${x}">${x}</option>`));
    } else if (t==='H'){
      opts.push(...['H1','H2'].map(x=>`<option value="${x}">${x}</option>`));
    } else if (t==='N9'){
      opts.push(`<option value="N9">៩ខែ (N9)</option>`);
    } else if (t==='Y12'){
      opts.push(`<option value="Y12">ឆ្នាំ (Y12)</option>`);
    }

    tagSel.innerHTML = opts.join('');
    if (tagSel.options.length) tagSel.value = tagSel.options[0].value;
  }

  function bindSeg(){
    segBtns.forEach(b=>{
      b.addEventListener('click', ()=>{
        segBtns.forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        MODE = b.dataset.pt;
        buildTagOptions();
        render();
      });
    });
  }

  const getVT = (indicator_id, year, tag)=>{
    const vt = REP_MAP.get(keyOf(indicator_id, year, tag));
    return {
      value: (vt && Number.isFinite(vt.value)) ? vt.value : '—',
      target: (vt && Number.isFinite(vt.target)) ? vt.target : '—',
    };
  };

  const getIA = (indicator_id, year, tag)=>{
    const a = ACTIONS_IDX.get(keyOf(indicator_id, year, tag));
    return {
      issues: a?.issues?.length ? [...new Set(a.issues)] : [],
      actions: a?.actions?.length ? [...new Set(a.actions)] : []
    };
  };

  function render(){
    const ySel = Number(yearSel.value || new Date().getFullYear());
    const tagChosen = String(tagSel.value || '').toUpperCase();
    const q = String(txtQ?.value || '').trim().toLowerCase();

    const rows = BASE_ROWS.map(b=>{
      const vt = getVT(b.indicator_id, ySel, tagChosen);
      const ia = getIA(b.indicator_id, ySel, tagChosen);
      return {
        ...b,
        year: ySel,
        tag : tagChosen,
        value : vt.value,
        target: vt.target,
        issues : ia.issues,
        actions: ia.actions
      };
    }).filter(r=>{
      if (!q) return true;
      const blob = `${r.indicator_name} ${r.department_name} ${r.unit_name} ${r.issues.join(' ')} ${r.actions.join(' ')}`.toLowerCase();
      return blob.includes(q);
    });

    const byDept = new Map();
    rows.forEach(r=>{
      const d = String(r.department_id || '@NA');
      if (!byDept.has(d)) byDept.set(d, []);
      byDept.get(d).push(r);
    });

    const deptIds = [...byDept.keys()].sort((a,b)=>
      String(deptName[a] || a).localeCompare(String(deptName[b] || b), 'km-KH', {numeric:true})
    );

    const frag = document.createDocumentFragment();
    let totalRows = 0;

    deptIds.forEach((depId, dIdx)=>{
      const dRows = byDept.get(depId) || [];
      const dName = deptName[depId] || (depId==='@NA' ? '(គ្មានជំពូក)' : depId);

      const trD = document.createElement('tr');
      trD.className = 'row-dept';
      trD.innerHTML = `<td colspan="5">${dIdx+1}. ${esc(dName)}</td>`;
      frag.appendChild(trD);

      const byUnit = new Map();
      dRows.forEach(r=>{
        const u = String(r.unit_id || '@NA');
        if (!byUnit.has(u)) byUnit.set(u, []);
        byUnit.get(u).push(r);
      });

      const unitIds = [...byUnit.keys()].sort((a,b)=>{
        const an = unitMeta.get(a)?.name || (a==='@NA'?'(គ្មានផ្នែក)':a);
        const bn = unitMeta.get(b)?.name || (b==='@NA'?'(គ្មានផ្នែក)':b);
        return an.localeCompare(bn, 'km-KH', {numeric:true});
      });

      unitIds.forEach((uId, uIdx)=>{
        const uName = unitMeta.get(uId)?.name || (uId==='@NA'?'(គ្មានផ្នែក)':uId);
        const trU = document.createElement('tr');
        trU.className = 'row-unit';
        trU.innerHTML = `<td colspan="5" class="ps-3">${dIdx+1}.${uIdx+1} ${esc(uName)}</td>`;
        frag.appendChild(trU);

        const list = (byUnit.get(uId) || []).slice().sort((a,b)=>
          String(a.indicator_name||'').localeCompare(String(b.indicator_name||''), 'km-KH', {numeric:true})
        );

        list.forEach(r=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="fw-semibold">${esc(r.indicator_name || '(គ្មានឈ្មោះសូចនាករ)')}</div>
              <div class="small text-muted">${esc(pretty(r.year, r.tag))}</div>
            </td>
            <td class="text-center">${Number.isFinite(r.value) ? r.value : '—'}</td>
            <td class="text-center">${Number.isFinite(r.target) ? r.target : '—'}</td>
            <td>${r.issues.length ? ('• ' + r.issues.map(esc).join('<br>• ')) : '—'}</td>
            <td>${r.actions.length ? ('• ' + r.actions.map(esc).join('<br>• ')) : '—'}</td>
          `;
          frag.appendChild(tr);
          totalRows++;
        });
      });
    });

    bodyEl.replaceChildren(frag);
    statusEl.textContent = `បានជ្រើស៖ ឆ្នាំ ${ySel} • ${pretty(ySel, tagChosen)} • សរុប ${totalRows} ជួរដេក`;
  }

  /* ===== PDF ===== */
  function ensureHiddenForm(){
    let form = document.getElementById('reportPdfForm');
    if (!form){
      form = document.createElement('form');
      form.id = 'reportPdfForm';
      form.action = `${GAS_WEBAPP}?route=summaryPdf&dl=1`;
      form.method = 'POST';
      form.target = '_blank';
      form.enctype = 'application/x-www-form-urlencoded';
      form.acceptCharset = 'utf-8';
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.id   = 'reportPayloadB64';
      form.appendChild(input);
      document.body.appendChild(form);
    }
    return form;
  }

  function gatherReportData(){
    const year = Number(yearSel.value || new Date().getFullYear());
    const tagChosen = String(tagSel.value || '').toUpperCase();

    const rows = BASE_ROWS.map(b=>{
      const vt = getVT(b.indicator_id, year, tagChosen);
      const ia = getIA(b.indicator_id, year, tagChosen);
      return {
        indicator_id   : b.indicator_id,
        indicator_name : b.indicator_name || '',
        department_name: b.department_name || '',
        unit_name      : b.unit_name || '',
        year,
        tag: tagChosen,
        value : Number.isFinite(vt.value) ? vt.value : '',
        target: Number.isFinite(vt.target) ? vt.target : '',
        issues : ia.issues,
        actions: ia.actions
      };
    });

    rows.sort((a,b)=>{
      const dn = (a.department_name||'').localeCompare(b.department_name||'', 'km-KH', {numeric:true});
      if (dn) return dn;
      const un = (a.unit_name||'').localeCompare(b.unit_name||'', 'km-KH', {numeric:true});
      if (un) return un;
      return (a.indicator_name||'').localeCompare(b.indicator_name||'', 'km-KH', {numeric:true});
    });

    const meta = {
      year,
      tag: tagChosen,
      periodText: pretty(year, tagChosen),
      mode: MODE,
      title1: 'របាយការណ៍សង្ខេប',
      title2: 'តម្លៃសូចនាករ • គោលដៅ • បញ្ហា • សកម្មភាព',
      org1: 'មន្ទីរសុខាភិបាលខេត្ត',
      org2: 'ផ្នែកផែនការ និងត្រួតពិនិត្យ'
    };

    return { meta, rows };
  }

  function postPdf(kind){
    const form  = ensureHiddenForm();
    const input = document.getElementById('reportPayloadB64');
    const { meta, rows } = gatherReportData();
    input.value = toB64UTF8({ meta: { ...meta, audience: kind }, rows });
    form.submit();
  }

  function onApply(){ render(); }
  function onSearchEnter(e){ if (e.key === 'Enter') render(); }
  function onYearChange(){ render(); }
  function onTagChange(){ render(); }

  bindSeg();
  buildYearOptions();
  buildTagOptions();

  btnApply?.addEventListener('click', onApply);
  txtQ?.addEventListener('keydown', onSearchEnter);
  yearSel?.addEventListener('change', onYearChange);
  tagSel?.addEventListener('change', onTagChange);

  let onPDFP = null, onPDFM = null;
  if (!SUPER){
    btnPDFP?.classList.add('d-none');
    btnPDFM?.classList.add('d-none');
  } else {
    onPDFP = ()=>{
      const old = btnPDFP.textContent;
      btnPDFP.disabled = true; btnPDFP.textContent = 'កំពុងបង្កើត…';
      try { postPdf('province'); }
      finally { setTimeout(()=>{ btnPDFP.disabled=false; btnPDFP.textContent=old; }, 800); }
    };
    onPDFM = ()=>{
      const old = btnPDFM.textContent;
      btnPDFM.disabled = true; btnPDFM.textContent = 'កំពុងបង្កើត…';
      try { postPdf('ministry'); }
      finally { setTimeout(()=>{ btnPDFM.disabled=false; btnPDFM.textContent=old; }, 800); }
    };
    btnPDFP?.addEventListener('click', onPDFP);
    btnPDFM?.addEventListener('click', onPDFM);
  }

  render();

  return ()=> {
    btnApply?.removeEventListener('click', onApply);
    txtQ?.removeEventListener('keydown', onSearchEnter);
    yearSel?.removeEventListener('change', onYearChange);
    tagSel?.removeEventListener('change', onTagChange);
    if (onPDFP) btnPDFP?.removeEventListener('click', onPDFP);
    if (onPDFM) btnPDFM?.removeEventListener('click', onPDFM);
  };
}

export function getTitle(){ return 'សង្ខេបរបាយការណ៍ | PHD Report'; }
