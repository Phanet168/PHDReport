// assets/js/pages/units.page.js
import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasSave, gasDelete, ID_FIELDS } from '../app.api.firebase.js';

/* ========= Modal helper (Bootstrap first, fallback a11y) ========= */
function makeModal(id){
  const el = document.getElementById(id);
  if (!el) return null;
  el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex','-1');

  if (window.bootstrap?.Modal){
    let inst = bootstrap.Modal.getInstance ? bootstrap.Modal.getInstance(el) : null;
    if (!inst) inst = new bootstrap.Modal(el, { backdrop:true, keyboard:true, focus:true });
    return { show:()=>inst.show(), hide:()=>inst.hide() };
  }

  let lastFocus=null;
  const lockOutside = (on)=>{
    for (const n of Array.from(document.body.children)){
      if (n===el || n.contains(el)) continue;
      try{ on ? (n.setAttribute('inert',''), n.inert=true) : (n.removeAttribute('inert'), n.inert=false); }catch{}
    }
  };
  if (!el.__wired){
    el.addEventListener('mousedown', ev=>{ el.__maybeBackdrop = (ev.target === el); });
    el.addEventListener('click', ev=>{
      if (el.__maybeBackdrop && ev.target === el){ ev.preventDefault(); ev.stopPropagation(); api.hide(); }
      const x = ev.target.closest('[data-bs-dismiss="modal"], .btn-close'); if (x){ ev.preventDefault(); api.hide(); }
      el.__maybeBackdrop = false;
    });
    el.addEventListener('keydown', ev=>{ if (ev.key==='Escape'){ ev.preventDefault(); ev.stopPropagation(); api.hide(); } });
    el.__wired = true;
  }
  const api = {
    show(){
      el.setAttribute('aria-hidden','false');
      el.classList.add('show'); el.style.display='block'; el.style.pointerEvents='auto';
      document.body.classList.add('modal-open'); lockOutside(true);
      lastFocus = document.activeElement;
      (el.querySelector('[autofocus], .btn-close, input, button, [tabindex]:not([tabindex="-1"])') || el)?.focus?.({preventScroll:true});
    },
    hide(){
      el.classList.remove('show'); el.style.display='none';
      document.body.classList.remove('modal-open'); lockOutside(false);
      el.setAttribute('aria-hidden','true');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }
  };
  return api;
}

/* ========= Page entry ========= */
export default async function hydrate(root){
  await initUnits(root);
}

async function initUnits(root){
  const auth  = getAuth();
  const SUPER = isSuper(auth);
  const modal = makeModal('mdlUnit');

  // Elements
  const tbl      = root.querySelector('#tblUnits');
  const thead    = tbl?.querySelector('thead');
  const tbody    = tbl?.querySelector('tbody');
  const btnAdd   = root.querySelector('#btnAdd');              // ✅ ត្រូវនឹង index.html
  const frm      = root.querySelector('#frmUnit');
  const idEl     = root.querySelector('#unit_id');
  const nameEl   = root.querySelector('#unit_name');
  const depSelEl = root.querySelector('#department_id');
  const typeEl   = root.querySelector('#unit_type');
  const txtQ     = root.querySelector('#txtSearch');           // optional (មាន/អត់ក៏បាន)
  const statusEl = root.querySelector('#statusLine') || root.querySelector('#statusUnits');
  const pagerEl  = root.querySelector('#unitsPager');
  const sizeEl   = root.querySelector('#unitsPageSize');

  const setStatus = (m)=>{ if (statusEl) statusEl.textContent = m || ''; };
  if (!tbl || !tbody || !frm || !idEl || !nameEl || !depSelEl) return;

  if (!SUPER) btnAdd?.classList.add('d-none');

  // State
  const ID_FIELD = 'unit_id';
  let ROWS = [];
  let DEPTS = [];
  let FILTER_Q = '';

  // Sort state
  let sortBy = ID_FIELD;   // 'unit_id' | 'unit_name' | 'department_name' | 'unit_type'
  let sortDir = 'asc';

  // Pagination state
  let page = 1;
  let pageSize = toInt(sizeEl?.value, 10);

  // skeleton load
  tbody.innerHTML = '';
  for (let i=0;i<4;i++){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="skel"></td>`;
    tbody.appendChild(tr);
  }

  // Initial fetch (add ts to hint no-cache)
  try{
    [DEPTS, ROWS] = await Promise.all([
      gasList('departments', { ts: Date.now() }),
      gasList('units',       { ts: Date.now() }),
    ]);
    fillDeptSelect('');
    render();
    setStatus(`បានផ្ទុក ${ROWS.length} ឯកតា`);
  }catch(err){
    console.error('[units] initial load failed:', err);
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-4">បរាជ័យទាញទិន្នន័យ</td></tr>`;
    setStatus('បរាជ័យទាញទិន្នន័យ');
  }

  /* ----- Helpers ----- */
  function toInt(v, d=0){ const n = Number(v); return Number.isFinite(n) ? n : d; }
  function deptNameById(id){
    const d = DEPTS.find(x=> String(x.department_id) === String(id));
    return d?.department_name || '';
  }
  function fillDeptSelect(selected=''){
    depSelEl.innerHTML = `<option value="">— ជ្រើសជំពូក —</option>`
      + DEPTS.map(d=> `<option value="${d.department_id}">${d.department_name}</option>`).join('');
    if (selected) depSelEl.value = String(selected);
    depSelEl.classList.remove('is-invalid');
  }

  function sortRows(rows){
    const get = (u, key)=>{
      if (key === 'department_name') return (deptNameById(u.department_id)||'').toLowerCase();
      if (key === 'unit_name')       return (u.unit_name||'').toLowerCase();
      if (key === 'unit_type')       return (u.unit_type||'').toLowerCase();
      if (key === ID_FIELD){
        const n = Number(u[ID_FIELD]);
        return Number.isFinite(n) ? n : String(u[ID_FIELD]||'').toLowerCase();
      }
      return (u[key]??'');
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return rows.slice().sort((a,b)=>{
      const va = get(a, sortBy);
      const vb = get(b, sortBy);
      if (va < vb) return -1*dir;
      if (va > vb) return  1*dir;
      return 0;
    });
  }

  function filteredRows(){
    const q = FILTER_Q;
    const rows = !q ? ROWS : ROWS.filter(u=>{
      const hay = `${u[ID_FIELD]||''} ${u.unit_name||''} ${deptNameById(u.department_id)} ${u.unit_type||''}`.toLowerCase();
      return hay.includes(q);
    });
    return sortRows(rows);
  }

  function render(){
    const all = filteredRows();

    // pagination math
    pageSize = sizeEl ? toInt(sizeEl.value, pageSize || 10) : (pageSize || 10);
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / (pageSize || 10)));
    page = Math.min(Math.max(1, page), pages);

    const start = (page-1) * pageSize;
    const rows = all.slice(start, start + pageSize);

    // body
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const u of rows){
        const tr = document.createElement('tr');
        tr.dataset.id = String(u[ID_FIELD] ?? '');
        tr.innerHTML = `
          <td>${u[ID_FIELD]}</td>
          <td>${u.unit_name ?? ''}</td>
          <td>${deptNameById(u.department_id)}</td>
          <td>${u.unit_type ?? ''}</td>
          <td class="td-actions">
            <div class="actions-right d-flex gap-2">
              ${SUPER
                ? `<button type="button" class="btn btn-sm btn-warning" data-act="edit">កែ</button>
                   <button type="button" class="btn btn-sm btn-danger"  data-act="del">លុប</button>`
                : `<span class="text-muted">—</span>`}
            </div>
          </td>`;
        frag.appendChild(tr);
      }
      tbody.innerHTML = ''; tbody.appendChild(frag);
    }

    renderPager({ total, pages, page });
  }

  function renderPager({ total, pages, page }){
    if (!pagerEl) return;
    pagerEl.innerHTML = `
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <div class="small text-muted">សរុប ${total} ឯកតា</div>
        <div class="ms-auto d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="first" ${page<=1?'disabled':''}>&laquo;</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="prev"  ${page<=1?'disabled':''}>&lsaquo;</button>
          <span class="small">ទំព័រ ${page}/${pages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="next"  ${page>=pages?'disabled':''}>&rsaquo;</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="last"  ${page>=pages?'disabled':''}>&raquo;</button>
        </div>
      </div>
    `;
  }

  /* ----- One-time event wiring (ក្រៅ render) ----- */

  // Pager delegation (សម្រាប់ re-render)
  pagerEl?.addEventListener('click', (ev)=>{
    const b = ev.target.closest('button[data-goto]');
    if (!b || b.disabled) return;
    const a = b.getAttribute('data-goto');
    if (a==='first') page = 1;
    else if (a==='prev') page = Math.max(1, page-1);
    else if (a==='next') page = page + 1;
    else if (a==='last') page = 999999; // render() នឹង clamp
    render();
  });

  // Page size
  sizeEl?.addEventListener('change', ()=>{
    page = 1;
    pageSize = toInt(sizeEl.value, 10);
    render();
  });

  // Search
  txtQ?.addEventListener('input', (e)=>{
    FILTER_Q = String(e.target.value || '').trim().toLowerCase();
    page = 1;
    render();
  });

  // Sort (click thead)
  thead?.addEventListener('click', (e)=>{
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const key = th.getAttribute('data-sort');
    if (!key) return;
    if (sortBy === key) sortDir = (sortDir==='asc') ? 'desc' : 'asc';
    else { sortBy = key; sortDir = 'asc'; }
    page = 1;
    render();
  });

  // Add
  btnAdd?.addEventListener('click', ()=>{
    if (!SUPER) return alert('ត្រូវការ SUPER');
    frm.reset();
    idEl.value = ''; // create
    nameEl.classList.remove('is-invalid');
    depSelEl.classList.remove('is-invalid');
    fillDeptSelect('');
    modal?.show();
  });

  // Row actions
  tbody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;

    const id  = btn.closest('tr')?.dataset?.id || '';
    const row = ROWS.find(x => String(x[ID_FIELD]) === String(id));
    if (!row) return;

    if (btn.dataset.act === 'edit'){
      if (!SUPER) return alert('ត្រូវការ SUPER');
      idEl.value           = String(row[ID_FIELD] || '');
      nameEl.value         = row.unit_name || '';
      typeEl.value         = row.unit_type || '';
      nameEl.classList.remove('is-invalid');
      depSelEl.classList.remove('is-invalid');
      fillDeptSelect(row.department_id || '');
      modal?.show();
      return;
    }

    if (btn.dataset.act === 'del'){
      if (!SUPER) return alert('ត្រូវការ SUPER');
      if (!confirm('តើចង់លុបធាតុនេះមែនទេ?')) return;

      try{
        // ✅ ប្រើ signature ត្រឹមត្រូវសម្រាប់ gasDelete
        const idNum = Number(row[ID_FIELD]);
        const idForDelete = Number.isFinite(idNum) ? idNum : row[ID_FIELD];
        await gasDelete('units', ID_FIELDS.units, idForDelete);

        // Refetch from server (គ្មាន cache)
        ROWS = await gasList('units', { ts: Date.now() });
        // កាត់ page បើទំព័របច្ចុប្បន្នគ្មានទិន្នន័យទៀត
        const pages = Math.max(1, Math.ceil(ROWS.length / (pageSize || 10)));
        page = Math.min(page, pages);
        render();
        setStatus('លុបរួចរាល់');
      }catch(err){
        console.error('[units] delete failed:', err);
        alert('បរាជ័យលុប: ' + (err?.message || err));
      }
    }
  });

  // Save (update vs create)
  frm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!SUPER) return alert('ត្រូវការ SUPER');

    const unit_name     = String(nameEl.value || '').trim();
    const unit_type     = String(typeEl.value || '').trim();
    const department_id = String(depSelEl.value || '').trim();

    nameEl.classList.toggle('is-invalid', !unit_name);
    depSelEl.classList.toggle('is-invalid', !department_id);
    if (!unit_name || !department_id) return;

    const idVal = String(idEl.value || '').trim();
    const payload = idVal
      ? { [ID_FIELD]: castId(idVal), unit_name, unit_type, department_id }
      : { unit_name, unit_type, department_id };

    const btn = root.querySelector('#btnSave') || root.querySelector('#btnSaveUnit');
    const old = btn ? btn.innerHTML : '';
    if (btn){ btn.disabled = true; btn.innerHTML = 'កំពុងរក្សាទុក…'; }

    try{
      await gasSave('units', payload);
      ROWS = await gasList('units', { ts: Date.now() });
      page = 1;   // ងាយស្រួល
      render();
      modal?.hide();
      setStatus('រក្សាទុករួចរាល់');
    }catch(err){
      console.error('[units] save failed:', err);
      alert('បរាជ័យរក្សាទុក: ' + (err?.message || err));
    }finally{
      if (btn){ btn.disabled = false; btn.innerHTML = old; }
    }
  });

  function castId(v){ const n = Number(v); return Number.isFinite(n) ? n : v; }
}
