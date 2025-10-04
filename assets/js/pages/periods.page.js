// assets/js/pages/periods.page.js
import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasSave, gasDelete, ID_FIELDS } from '../app.api.firebase.js';

/* ───────── Modal helper (safe focus + inert) ───────── */
function makeModal(id){
  const el = document.getElementById(id);
  if (!el) return null;

  el.setAttribute('role','dialog');
  el.setAttribute('aria-modal','true');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex','-1');

  let lastFocus = null;
  const lockOutside = (on)=>{
    const nodes = Array.from(document.body.children);
    for (const n of nodes){
      if (n === el || n.contains(el)) continue;
      try{ on ? (n.setAttribute('inert',''), n.inert = true)
              : (n.removeAttribute('inert'),   n.inert = false); }catch{}
    }
  };

  if (!el.__wired){
    el.addEventListener('mousedown', ev => { el.__maybeBackdrop = (ev.target === el); });
    el.addEventListener('click', ev => {
      if (el.__maybeBackdrop && ev.target === el){ ev.preventDefault(); ev.stopPropagation(); api.hide(); }
      el.__maybeBackdrop = false;
    });
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); api.hide(); }
    });
    el.addEventListener('click', ev=>{
      const x = ev.target.closest('[data-bs-dismiss="modal"], .btn-close');
      if (x){ ev.preventDefault(); api.hide(); }
    });
    el.__wired = true;
  }

  const api = {
    show(){
      el.setAttribute('aria-hidden','false');
      el.classList.add('show');
      el.style.display = 'block';
      document.body.classList.add('modal-open');
      lockOutside(true);
      lastFocus = document.activeElement;
      (el.querySelector('[autofocus], .btn-close, input, button, [tabindex]:not([tabindex="-1"])') || el).focus?.({preventScroll:true});
    },
    hide(){
      el.classList.remove('show');
      el.style.display = 'none';
      document.body.classList.remove('modal-open');
      lockOutside(false);
      el.setAttribute('aria-hidden','true');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }
  };
  return api;
}

/* ───────── Utilities ───────── */
const pad2 = n => String(n).padStart(2,'0');
const labelFor = (year, code) => {
  if (/^\d{2}$/.test(code)) return `${year}-${code}`;      // 01..12
  if (/^Q[1-4]$/.test(code)) return `Q${code.slice(1)} ${year}`;
  if (/^H[12]$/.test(code))  return `H${code.slice(1)} ${year}`;
  if (code === '9M')         return `9 Months ${year}`;
  if (code === 'Y')          return `Year ${year}`;
  return `${year}-${code}`;
};

function buildAllPeriodRows(y){
  const months   = Array.from({length:12},(_,i)=>pad2(i+1));
  const quarters = ['Q1','Q2','Q3','Q4'];
  const halves   = ['H1','H2'];
  const special  = ['9M','Y'];
  const codes = [...months, ...quarters, ...halves, ...special];
  return codes.map(code => ({
    period_id:   `${y}-${code}`,
    period_name: labelFor(y, code),
    year:        String(y),
    month:       code
  }));
}

/* ───────── Main ───────── */
async function initPeriods(root){
  const auth  = getAuth();
  const SUPER = isSuper(auth);

  // Refs
  const tbl      = root.querySelector('#tblPeriods');
  const tbody    = tbl?.querySelector('tbody');
  const selYear  = root.querySelector('#selYear');
  const btnGen   = root.querySelector('#btnGenYear');
  const statusEl = root.querySelector('#statusPeriods');

  const frm      = root.querySelector('#frmPeriod');
  const mdl      = makeModal('mdlPeriod');
  const idEl     = root.querySelector('#period_id');
  const nameEl   = root.querySelector('#period_name');
  const yearEl   = root.querySelector('#period_year');
  const monthEl  = root.querySelector('#period_month');
  const setStatus = m => { if (statusEl) statusEl.textContent = m || ''; };

  if (!tbl || !tbody || !selYear || !btnGen || !frm || !idEl || !nameEl || !yearEl || !monthEl) return;

  // State
  let ROWS = [];      // all periods
  let FILTER_YEAR = ''; // UI filter by selected year

  // Years dropdown (dynamic: current-3 .. current+3)
  (function fillYears(){
    const nowY = new Date().getFullYear();
    const years = [];
    for (let y = nowY - 3; y <= nowY + 3; y++) years.push(y);
    selYear.innerHTML = years.map(y=>`<option value="${y}" ${y===nowY?'selected':''}>${y}</option>`).join('');
    FILTER_YEAR = String(selYear.value || nowY);
  })();

  // Initial skeleton
  tbody.innerHTML = `<tr><td colspan="5" class="skel"></td></tr>`;

  // Load data
  try{
    ROWS = await gasList('periods'); // expect fields: period_id, period_name, year, month
    render();
    setStatus(`បានផ្ទុក ${ROWS.length} រយៈពេល`);
  }catch(err){
    console.error('[periods] load failed:', err);
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-4">បរាជ័យទាញទិន្នន័យ</td></tr>`;
    setStatus('បរាជ័យទាញទិន្នន័យ');
  }

  /* ───────── Render ───────── */
  function render(){
    // filter by year if selected
    let list = ROWS.slice();
    if (FILTER_YEAR) list = list.filter(r => String(r.year) === String(FILTER_YEAR));

    // sort: month (code) in designed order
    const orderIndex = (code)=>{
      if (/^\d{2}$/.test(code)) return parseInt(code,10); // 01..12 => 1..12
      if (code==='Q1') return 13;
      if (code==='Q2') return 14;
      if (code==='Q3') return 15;
      if (code==='Q4') return 16;
      if (code==='H1') return 17;
      if (code==='H2') return 18;
      if (code==='9M') return 19;
      if (code==='Y')  return 20;
      return 99;
    };
    list.sort((a,b)=>{
      const ya = Number(a.year||0), yb = Number(b.year||0);
      if (ya!==yb) return ya - yb;
      return orderIndex(a.month||'') - orderIndex(b.month||'');
    });

    if (!list.length){
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const r of list){
      const tr = document.createElement('tr');
      tr.dataset.id = r.period_id;
      tr.innerHTML = `
        <td>${r.period_id}</td>
        <td>${r.period_name || ''}</td>
        <td>${r.year || ''}</td>
        <td>${r.month || ''}</td>
        <td class="td-actions">
          <div class="actions-right">
            ${SUPER
              ? `<button class="btn btn-sm btn-warning" data-act="edit">កែ</button>
                 <button class="btn btn-sm btn-danger"  data-act="del">លុប</button>`
              : `<span class="text-muted">—</span>`}
          </div>
        </td>`;
      frag.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(frag);
  }

  /* ───────── Events ───────── */

  // Year filter & generation base
  selYear.addEventListener('change', ()=>{
    FILTER_YEAR = String(selYear.value || '');
    render();
  });

  // Generate ALL for selected year (Month + Quarter + Half + 9M + Year)
  btnGen.addEventListener('click', async ()=>{
    if (!SUPER) return alert('ត្រូវការ SUPER');
    const y = String(selYear.value || new Date().getFullYear());

    const allRowsForYear = buildAllPeriodRows(y);
    const existIds = new Set(ROWS.filter(r => String(r.year)===y).map(r => String(r.period_id)));
    const toCreate = allRowsForYear.filter(p => !existIds.has(p.period_id));
    if (!toCreate.length){
      alert(`ឆ្នាំ ${y} មានទាំងអស់រួចហើយ`);
      return;
    }

    const old = btnGen.innerHTML; btnGen.disabled = true; btnGen.innerHTML = 'កំពុងបង្កើត…';
    try{
      for (const p of toCreate){
        const saved = await gasSave('periods', p);
        const row = saved.row || saved;
        const i = ROWS.findIndex(x => String(x.period_id) === String(row.period_id));
        if (i >= 0) ROWS[i] = row; else ROWS.push(row);
      }
      render();
      setStatus(`បានបង្កើត ${toCreate.length} ធាតុ សម្រាប់ឆ្នាំ ${y}`);
    }catch(err){
      console.error('[periods] generate failed:', err);
      alert('បរាជ័យបង្កើត: ' + (err?.message || err));
    }finally{
      btnGen.disabled = false; btnGen.innerHTML = old;
    }
  });

  // Row actions
  tbody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;

    const id = btn.closest('tr')?.dataset?.id;
    const row = ROWS.find(r => String(r.period_id) === String(id));
    if (!row) return;

    if (btn.dataset.act === 'edit'){
      if (!SUPER) return alert('ត្រូវការ SUPER');
      idEl.value    = row.period_id || '';
      nameEl.value  = row.period_name || '';
      yearEl.value  = row.year || '';
      monthEl.value = row.month || '';
      nameEl.classList.remove('is-invalid');
      mdl?.show();
      return;
    }

    if (btn.dataset.act === 'del'){
      if (!SUPER) return alert('ត្រូវការ SUPER');
      if (!confirm('តើចង់លុបធាតុនេះមែនទេ?')) return;
      try{
        await gasDelete('periods', ID_FIELDS.periods, row.period_id);
        ROWS = ROWS.filter(x => String(x.period_id)!==String(id));
        render();
        setStatus('លុបរួចរាល់');
      }catch(err){
        console.error('[periods] delete failed:', err);
        alert('បរាជ័យលុប: ' + (err?.message || err));
      }
      return;
    }
  });

  // Save (update name only; keep id/year/month as is)
  frm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!SUPER) return alert('ត្រូវការ SUPER');

    const period_id = String(idEl.value || '').trim();
    const period_name = String(nameEl.value || '').trim();
    const year = String(yearEl.value || '').trim();
    const month = String(monthEl.value || '').trim();

    nameEl.classList.toggle('is-invalid', !period_name);
    if (!period_id || !period_name) return;

    const payload = { period_id, period_name, year, month };

    const btn = root.querySelector('#btnSavePeriod');
    const old = btn ? btn.innerHTML : '';
    if (btn){ btn.disabled = true; btn.innerHTML = 'កំពុងរក្សាទុក…'; }

    try{
      const saved = await gasSave('periods', payload);
      const row = saved.row || saved;
      const i = ROWS.findIndex(x => String(x.period_id) === String(row.period_id));
      if (i >= 0) ROWS[i] = row; else ROWS.push(row); // (edge: if not found, add)
      render();
      mdl?.hide();
      setStatus('រក្សាទុករួចរាល់');
    }catch(err){
      console.error('[periods] save failed:', err);
      alert('បរាជ័យរក្សាទុក: ' + (err?.message || err));
    }finally{
      if (btn){ btn.disabled = false; btn.innerHTML = old; }
    }
  });
}

export default async function hydrate(root){
  await initPeriods(root);
}
