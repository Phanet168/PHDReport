// assets/js/pages/reports.page.js
// Khmer Summary Report — group by Department → Unit, show Value & Target,
// និងបញ្ជូន PDF ទៅ Google Apps Script Web App (ខេត្ត/ក្រសួង)

import { gasList } from '../app.api.firebase.js';
import { isSuper } from '../app.auth.js';       // ✅ ADD: ដើម្បីពិនិត្យ SUPER

export default async function reportsPage(root, ctx){
  /* ===== GAS Web App ===== */
  const GAS_WEBAPP = 'https://script.google.com/macros/s/AKfycbxYy_0Njta5t0lq4LJUFgVPkUsQNVuRCJDGuJmy1jZ6opVS380YoeBLVRTaxblyk1R0/exec';

  const $  = s => root.querySelector(s);
  const $$ = s => Array.from(root.querySelectorAll(s));

  /* ===== DOM ===== */
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

  /* ===== Auth ===== */
  const SUPER = isSuper();       // ✅ បញ្ជាក់តួនាទី

  /* ===== Utils ===== */
  const KH_MONTHS = ['មករា','កុម្ភៈ','មីនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const pretty = (y,t)=>!y||!t?''
    : /^M\d{2}$/.test(t) ? `${KH_MONTHS[+t.slice(1)-1]} ${y}` : (t==='Y12' ? `ឆ្នាំ ${y}` : `${y} ${t}`);

  // Parse {year, tag} (supports period_id "YYYY-MM")
  const normPeriod = (obj = {})=>{
    let {year, month, tag, period_id} = obj;
    if (typeof year === 'string' && /^\d{4}$/.test(year)) year = parseInt(year, 10);
    const pid = String(period_id || '').trim();
    if (/^\d{4}-\d{2}$/.test(pid)) {
      const y = parseInt(pid.slice(0,4), 10);
      const t = 'M' + pid.slice(5,7);
      return { year: y, tag: t, pid };
    }
    const t0 = String(tag || month || '').toUpperCase();
    return { year: year || undefined, tag: t0 || '', pid: '' };
  };

  // Rank for tag when period_id absent
  const tagRank = (t)=>{
    if (!t) return -1;
    if (/^M\d{2}$/.test(t)) return parseInt(t.slice(1),10);       // 1..12
    if (/^Q[1-4]$/.test(t)) return 100 + parseInt(t.slice(1),10);  // 101..104
    if (/^H[12]$/.test(t))  return 200 + parseInt(t.slice(1),10);  // 201..202
    if (t==='N9')  return 300 + 9;
    if (t==='Y12') return 400 + 12;
    return 0;
  };
  // b later than a ?
  const isLater = (a, b)=>{
    if (a?.pid && b?.pid) return b.pid > a.pid;
    if (b?.pid && !a?.pid) return true;
    if (a?.pid && !b?.pid) return false;
    if (a?.year && b?.year && a.year !== b.year) return b.year > a.year;
    const ra = tagRank(a?.tag), rb = tagRank(b?.tag);
    if (rb !== ra) return rb > ra;
    const tsa = +new Date(a?.updated_at || a?.updatedAt || a?.timestamp || 0);
    const tsb = +new Date(b?.updated_at || b?.updatedAt || b?.timestamp || 0);
    return tsb > tsa;
  };

  const keyOf = (indicator_id, year, tag)=> `${indicator_id}|${year}|${tag}`;

  // Base64URL(JSON) for GAS
  const toB64UTF8 = (obj)=>{
    const s = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(s);
    let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };

  /* ===== State ===== */
  let MODE = 'M';                // 'M' | 'Q' | 'H' | 'N9' | 'Y12'
  let REP_MAP  = new Map();      // indicator+period → {value,target,...}
  let YEARS    = new Set();      // years from reports/actions
  let LATEST_BY_IND = new Map(); // indicator → latest {year, tag, ...}
  let BASE_ROWS = [];            // indicator meta rows
  let ACTIONS_IDX = new Map();   // (indicator_id|year|tag) → {issues[], actions[]}

  /* ===== Skeleton ===== */
  (function skel(n=6){
    bodyEl.innerHTML = '';
    for (let i=0;i<n;i++){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5"><div class="skeleton" style="height:18px; width:30%"></div>
                      <div class="skeleton mt-2" style="height:14px; width:80%"></div></td>`;
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

  // Lookups
  const indById  = new Map((indicators||[]).map(i=>[String(i.indicator_id), i]));
  const unitMeta = new Map((units||[]).map(u=>[String(u.unit_id), {name:u.unit_name, dept:String(u.department_id||'')}]));
  const deptName = Object.fromEntries((depts||[]).map(d=>[String(d.department_id), d.department_name]));

  // Build BASE_ROWS
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
    const {year, tag} = normPeriod(a);
    if (!year || !tag) return;
    YEARS.add(year);
    const id = String(a.indicator_id||'');
    const k = keyOf(id, year, tag);
    const cur = ACTIONS_IDX.get(k) || {issues:[], actions:[]};
    if (a.issue_text)  cur.issues.push(a.issue_text);
    if (a.action_text) cur.actions.push(a.action_text);
    ACTIONS_IDX.set(k, cur);
  });

  // REP_MAP + LATEST_BY_IND
  REP_MAP = new Map();
  LATEST_BY_IND = new Map();
  (reports||[]).forEach(r=>{
    const { year, tag, pid } = normPeriod(r);
    if (!year || !tag) return;
    YEARS.add(year);
    const indId = String(r.indicator_id||'');
    const vt = {
      value: Number(r.value ?? r.val ?? r.current ?? NaN),
      target: Number(r.target ?? r.plan ?? NaN),
      department_id: String(r.department_id || ''),
      unit_id: String(r.unit_id || ''),
      year, tag, pid,
      updated_at: r.updated_at || r.updatedAt || r.timestamp || ''
    };
    REP_MAP.set(keyOf(indId, year, tag), vt);
    const cur = LATEST_BY_IND.get(indId);
    if (!cur || isLater(cur, vt)) LATEST_BY_IND.set(indId, vt);
  });

  /* ===== Controls ===== */
  function buildYearOptions(){
    const list = [...YEARS].filter(Boolean).sort((a,b)=>b-a);
    if (!list.length) list.push(new Date().getFullYear());
    yearSel.innerHTML = list.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSel.value = String(list[0]);
  }

  function buildTagOptions(){
    const t = MODE;
    const opts = [];
    opts.push(`<option value="@last">ចុងក្រោយ</option>`);
    if (t==='M'){
      for (let m=1;m<=12;m++){ const mm = 'M'+String(m).padStart(2,'0'); opts.push(`<option value="${mm}">${mm}</option>`); }
    } else if (t==='Q'){ opts.push(...['Q1','Q2','Q3','Q4'].map(x=>`<option value="${x}">${x}</option>`)); }
      else if (t==='H'){ opts.push(...['H1','H2'].map(x=>`<option value="${x}">${x}</option>`)); }
      else if (t==='N9'){ opts.push(`<option value="N9">N9</option>`); }
      else if (t==='Y12'){ opts.push(`<option value="Y12">Y12</option>`); }
    tagSel.innerHTML = opts.join('');
    tagSel.value='@last';
  }

  function bindSeg(){
    segBtns.forEach(b=>{
      b.addEventListener('click', ()=>{
        segBtns.forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        MODE = b.dataset.pt; // M/Q/H/N9/Y12
        buildTagOptions();
        render();
      }, {passive:true});
    });
  }

  /* ===== Value/Target getters ===== */
  const getVT = (indicator_id, year, tag)=>{
    if (tag === '@last') {
      const row = LATEST_BY_IND.get(indicator_id);
      if (!row) return { value:'—', target:'—', year:null, tag:null, isLatest:true };
      return {
        value: Number.isFinite(row.value) ? row.value : '—',
        target: Number.isFinite(row.target) ? row.target : '—',
        year: row.year, tag: row.tag, isLatest:true
      };
    }
    const vt = REP_MAP.get(keyOf(indicator_id, year, tag));
    return {
      value: (vt && Number.isFinite(vt.value)) ? vt.value : '—',
      target: (vt && Number.isFinite(vt.target)) ? vt.target : '—',
      year, tag, isLatest:false
    };
  };
  const getIA = (indicator_id, year, tag)=>{
    const a = ACTIONS_IDX.get(keyOf(indicator_id, year, tag));
    return {
      issues: a?.issues?.length ? [...new Set(a.issues)] : [],
      actions: a?.actions?.length ? [...new Set(a.actions)] : []
    };
  };

  /* ===== Render ===== */
  function render(){
    const ySel = Number(yearSel.value||new Date().getFullYear());
    const tagChosen = String(tagSel.value||'').toUpperCase();
    const q   = String(txtQ?.value||'').trim().toLowerCase();

    const rows = BASE_ROWS.map(b=>{
      const vt = getVT(b.indicator_id, ySel, tagChosen);
      const ia = getIA(b.indicator_id, vt.year || ySel, vt.tag || tagChosen);
      return {
        ...b,
        year: vt.year || ySel,
        tag : vt.tag  || (tagChosen==='@last' ? '' : tagChosen),
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

    // group Dept → Unit → Indicator
    const byDept = new Map();
    rows.forEach(r=>{
      const d = String(r.department_id||'@NA');
      if (!byDept.has(d)) byDept.set(d, []);
      byDept.get(d).push(r);
    });

    const deptIds = [...byDept.keys()].sort((a,b)=> String(deptName[a]||a).localeCompare(String(deptName[b]||b), 'km-KH', {numeric:true}));
    const frag = document.createDocumentFragment();
    let totalRows = 0;

    deptIds.forEach((depId, dIdx)=>{
      const dRows = byDept.get(depId)||[];
      const dName = deptName[depId] || (depId==='@NA' ? '(គ្មានជំពូក)' : depId);

      const trD = document.createElement('tr');
      trD.className = 'row-dept';
      trD.innerHTML = `<td colspan="5">${dIdx+1}. ${esc(dName)}</td>`;
      frag.appendChild(trD);

      const byUnit = new Map();
      dRows.forEach(r=>{
        const u = String(r.unit_id||'@NA');
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

        const list = (byUnit.get(uId)||[]).slice().sort((a,b)=>{
          return String(a.indicator_name||'').localeCompare(String(b.indicator_name||''), 'km-KH', {numeric:true});
        });

        list.forEach(r=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="fw-semibold">${esc(r.indicator_name || '(គ្មានឈ្មោះសូចនាករ)')}</div>
              <div class="small text-muted">${esc(tagChosen==='@last' ? (pretty(r.year, r.tag) || 'ចុងក្រោយ') : pretty(r.year, r.tag))}</div>
            </td>
            <td class="text-center">${Number.isFinite(r.value)? r.value : '—'}</td>
            <td class="text-center">${Number.isFinite(r.target)? r.target : '—'}</td>
            <td>${r.issues.length ? ('• ' + r.issues.join('<br>• ')) : '—'}</td>
            <td>${r.actions.length ? ('• ' + r.actions.join('<br>• ')) : '—'}</td>`;
          frag.appendChild(tr);
          totalRows++;
        });
      });
    });

    bodyEl.replaceChildren(frag);
    statusEl.textContent = `បានជ្រើស៖ ឆ្នាំ ${ySel} • ${tagChosen==='@last'?'(ចុងក្រោយ)':('រយៈពេល '+tagChosen)} • សរុប ${totalRows} ជួរដេក`;
  }

  /* ===== PDF helpers ===== */
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
    const year = Number(yearSel.value||new Date().getFullYear());
    const tag  = String(tagSel.value||'').toUpperCase();
    const mode = MODE;

    const rowsForPdf = [];
    const ySel = year, tagChosen = tag;

    const rows = BASE_ROWS.map(b=>{
      const vt = getVT(b.indicator_id, ySel, tagChosen);
      const ia = getIA(b.indicator_id, vt.year || ySel, vt.tag || tagChosen);
      return {
        ...b,
        year: vt.year || ySel,
        tag : vt.tag  || (tagChosen==='@last' ? '' : tagChosen),
        value : Number.isFinite(vt.value) ? vt.value : '',
        target: Number.isFinite(vt.target) ? vt.target : '',
        issues : ia.issues,
        actions: ia.actions
      };
    });

    rows.sort((a,b)=>{
      const dn=(a.department_name||'').localeCompare(b.department_name||'', 'km-KH', {numeric:true});
      if (dn) return dn;
      const ua=(a.unit_name||'').localeCompare(b.unit_name||'', 'km-KH', {numeric:true});
      if (ua) return ua;
      return (a.indicator_name||'').localeCompare(b.indicator_name||'', 'km-KH', {numeric:true});
    });

    rows.forEach(r=>{
      rowsForPdf.push({
        indicator_id   : r.indicator_id,
        indicator_name : r.indicator_name || '',
        department_name: r.department_name || '',
        unit_name      : r.unit_name || '',
        year: r.year, tag: r.tag,
        value : r.value,
        target: r.target,
        issues : r.issues,
        actions: r.actions
      });
    });

    const meta = {
      year: ySel,
      tag : tagChosen,
      periodText: tagChosen==='@last' ? 'ចុងក្រោយ' : pretty(ySel, tagChosen),
      mode,
      title1: 'របាយការណ៍សង្ខេប',
      title2: 'តម្លៃសូចនាករ • គោលដៅ • បញ្ហា • សកម្មភាព',
      org1: 'មន្ទីរសុខាភិបាលខេត្ត',
      org2: 'ផ្នែកផែនការ និងត្រួតពិនិត្យ'
    };

    return { meta, rows: rowsForPdf };
  }

  function postPdf(kind){
    const form  = ensureHiddenForm();
    const input = document.getElementById('reportPayloadB64');
    const { meta, rows } = gatherReportData();
    const payload = { meta: { ...meta, audience: kind }, rows };
    input.value = toB64UTF8(payload);
    form.submit();
  }

  /* ===== Wire up ===== */
  function onApply(){ render(); }
  function onSearchEnter(e){ if (e.key === 'Enter') render(); }

  bindSeg();
  buildYearOptions();
  buildTagOptions();

  btnApply?.addEventListener('click', onApply);
  txtQ?.addEventListener('keydown', onSearchEnter);
  yearSel?.addEventListener('change', ()=>{ buildTagOptions(); render(); });
  tagSel?.addEventListener('change', render);

  // ✅ PDF buttons: visible & active only for SUPER
  if (!SUPER){
    // លាក់ប៊ូតុង (UI) និងកុំភ្ជាប់ event listeners (logic)
    btnPDFP?.classList.add('d-none');
    btnPDFM?.classList.add('d-none');
  } else {
    if (btnPDFP && !btnPDFP.dataset.bound){
      btnPDFP.dataset.bound = '1';
      btnPDFP.addEventListener('click', ()=>{
        const old = btnPDFP.textContent; btnPDFP.disabled = true; btnPDFP.textContent = 'កំពុងបង្កើត…';
        try { postPdf('province'); } finally { setTimeout(()=>{ btnPDFP.disabled=false; btnPDFP.textContent=old; }, 800); }
      }, {passive:true});
    }
    if (btnPDFM && !btnPDFM.dataset.bound){
      btnPDFM.dataset.bound = '1';
      btnPDFM.addEventListener('click', ()=>{
        const old = btnPDFM.textContent; btnPDFM.disabled = true; btnPDFM.textContent = 'កំពុងបង្កើត…';
        try { postPdf('ministry'); } finally { setTimeout(()=>{ btnPDFM.disabled=false; btnPDFM.textContent=old; }, 800); }
      }, {passive:true});
    }
  }

  // First paint
  render();

  /* ===== Cleanup ===== */
  return ()=> {
    btnApply?.removeEventListener('click', onApply);
    txtQ?.removeEventListener('keydown', onSearchEnter);
    yearSel?.removeEventListener('change', render);
    tagSel?.removeEventListener('change', render);
    if (SUPER){
      btnPDFP?.replaceWith(btnPDFP.cloneNode(true));
      btnPDFM?.replaceWith(btnPDFM.cloneNode(true));
    }
  };
}

export function getTitle(){ return 'សង្ខេបរបាយការណ៍ | PHD Report'; }
