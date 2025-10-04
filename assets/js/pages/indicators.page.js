// /assets/js/pages/indicators.page.js
import { getAuth, isSuper, isAdmin } from '../app.auth.js';
import { gasList, gasSave, gasDelete, ID_FIELDS } from '../app.api.firebase.js';

/* -------------------------- Modal helper (Bootstrap compat + a11y) -------------------------- */
function makeModal(id){
  const el = document.getElementById(id);
  if (!el) return null;

  el.setAttribute('role','dialog');
  el.setAttribute('aria-modal','true');
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex','-1');

  if (window.bootstrap?.Modal){
    const ModalCtor = window.bootstrap.Modal;
    const getOrCreate = (node, opts)=>{
      if (typeof ModalCtor.getOrCreateInstance === 'function') return ModalCtor.getOrCreateInstance(node, opts);
      let inst = (typeof ModalCtor.getInstance === 'function') ? ModalCtor.getInstance(node) : null;
      if (!inst) inst = new ModalCtor(node, opts);
      return inst;
    };
    const inst = getOrCreate(el, { backdrop:true, keyboard:true, focus:true });

    el.addEventListener('show.bs.modal',  ()=> el.removeAttribute('aria-hidden'));
    el.addEventListener('shown.bs.modal', ()=> el.removeAttribute('aria-hidden'));
    el.addEventListener('hide.bs.modal',  ()=>{
      if (el.contains(document.activeElement)) document.body.focus();
    });
    el.addEventListener('hidden.bs.modal', ()=>{
      el.setAttribute('aria-hidden','true');
      document.querySelectorAll('[inert]').forEach(n=>{ try{ n.removeAttribute('inert'); n.inert=false; }catch{} });
      document.body.classList.remove('modal-open');
    });

    return { show:()=>inst.show(), hide:()=>inst.hide() };
  }

  // Fallback (no Bootstrap)
  let lastFocus=null;
  const clearAllInert = ()=>{ document.querySelectorAll('[inert]').forEach(n=>{ try{ n.removeAttribute('inert'); n.inert=false; }catch{} }); };
  const lockOutside = (on)=>{
    for (const n of Array.from(document.body.children)){
      if (n===el || n.contains(el)) continue;
      try{ on ? (n.setAttribute('inert',''), n.inert=true)
              : (n.removeAttribute('inert'), n.inert=false); }catch{}
    }
  };
  const api = {
    show(){
      el.removeAttribute('aria-hidden');
      el.style.display='block';
      el.classList.add('show');
      document.body.classList.add('modal-open');
      lockOutside(true);
      lastFocus = document.activeElement;
      (el.querySelector('[autofocus], .btn-close, input, button, [tabindex]:not([tabindex="-1"])')||el).focus();
    },
    hide(){
      const restore = (lastFocus && document.contains(lastFocus)) ? lastFocus : document.body;
      if (el.contains(document.activeElement)) restore.focus();
      el.classList.remove('show');
      el.style.display='none';
      document.body.classList.remove('modal-open');
      lockOutside(false);
      clearAllInert();
      el.setAttribute('aria-hidden','true');
    }
  };

  if (!el.__wired){
    el.addEventListener('mousedown', ev=>{ el.__maybeBackdrop = (ev.target === el); });
    el.addEventListener('click', ev=>{
      if (el.__maybeBackdrop && ev.target === el){ ev.preventDefault(); ev.stopPropagation(); api.hide(); }
      const x = ev.target.closest('[data-bs-dismiss="modal"], .btn-close, [data-modal-close]');
      if (x){ ev.preventDefault(); api.hide(); }
      el.__maybeBackdrop = false;
    });
    el.addEventListener('keydown', ev=>{ if (ev.key==='Escape'){ ev.preventDefault(); ev.stopPropagation(); api.hide(); } });
    el.__wired = true;
  }
  return api;
}

/* -------------------------- Utils -------------------------- */
const toInt = (v,d=0)=>{ const n=Number(v); return Number.isFinite(n)?n:d; };
const text = v => (v==null?'':String(v));
const safe = s => String(s ?? '').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

/* -------------------------- Stable index + selection state -------------------------- */
const BY_ID = new Map();     // indicator_id(string) -> raw record
let SELECT_KEY = '';         // row highlight id
const SELECTED = new Set();  // bulk selection ids

/* -------------------------- Styles (small polish for toolbar/input-group) -------------------------- */
function ensureStyles(){
  if (!document.getElementById('indicators-custom-style')){
    const st = document.createElement('style');
    st.id = 'indicators-custom-style';
    st.textContent = `
      tr.row-selected { outline: 2px solid #0d6efd; background: rgba(13,110,253,.08); }
      .toolbar .actions .input-group { gap: .375rem; align-items: stretch; }
      .toolbar .actions .input-group > .form-control { min-width: 220px; }
      .toolbar .actions .btn { display: inline-flex; align-items: center; }
      .btn-icon { width: 2rem; height: 2rem; padding: 0; display:inline-flex; align-items:center; justify-content:center; }
      @media (max-width: 576px){
        .toolbar .actions .input-group { flex-wrap: wrap; }
        .toolbar .actions .input-group > * { flex: 1 1 auto; }
      }
    `;
    document.head.appendChild(st);
  }
}

/* -------------------------- Put Bulk button next to Search (prettier) -------------------------- */
function ensureBulkAssignUI(root, SUPER){
  const actions = root.querySelector('.toolbar .actions');
  const group   = actions?.querySelector('.input-group'); // place inside the same input group
  if (!group) return;

  // find Add button (to keep order: [Search] [Add] [Bulk])
  const btnAdd = group.querySelector('#btnAdd');

  // Create Bulk button once
  let btnBulk = group.querySelector('#btnBulkAssign');
  if (SUPER && !btnBulk){
    btnBulk = document.createElement('button');
    btnBulk.id = 'btnBulkAssign';
    btnBulk.type = 'button';
    btnBulk.className = 'btn btn-outline-secondary btn-sm';
    btnBulk.setAttribute('title','ចាត់តាំងម្ចាស់សម្រាប់សូចនាករច្រើន');
    btnBulk.setAttribute('data-bs-toggle','tooltip');
    btnBulk.innerHTML = `<i class="i-Checked-User me-1"></i> ចាត់ច្រើន`;
    // place right after Add (or at end if Add missing)
    if (btnAdd && btnAdd.parentElement===group){
      btnAdd.insertAdjacentElement('afterend', btnBulk);
    }else{
      group.appendChild(btnBulk);
    }
  }
  if (btnBulk && !SUPER) btnBulk.classList.add('d-none');

  // Build Bulk modal once (re-use from previous version)
  if (!document.getElementById('mdlBulkAssign')){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade" id="mdlBulkAssign" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <form class="modal-content" id="frmBulkAssign" novalidate>
            <div class="modal-header">
              <h5 class="modal-title kh-head">ចាត់តាំងម្ចាស់ សូចនាករ​ច្រើន</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="បិទ"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-info small mb-3">
                បានជ្រើស <strong id="bulkCount">0</strong> សូចនាករ — នឹងកែតែ <u>ម្ចាស់ (Owner)</u> ប៉ុណ្ណោះ។
              </div>
              <div class="mb-3">
                <label class="form-label">ជ្រើសម្ចាស់ (Owner) ថ្មី <span class="text-danger">*</span></label>
                <select id="bulk_owner_id" class="form-select" required>
                  <option value="">— ជ្រើសម្ចាស់ —</option>
                </select>
                <div class="invalid-feedback">សូមជ្រើសម្ចាស់</div>
              </div>
              <details class="mt-2">
                <summary class="small text-muted">មើលបញ្ជីសូចនាករដែលនឹងកែ</summary>
                <ul id="bulkList" class="small mt-2 mb-0"></ul>
              </details>
              <div class="text-muted small mt-3">កំណត់ចំណាំ: department និង unit មិនត្រូវបានបម្លែង។</div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" type="button" data-bs-dismiss="modal">បោះបង់</button>
              <button class="btn btn-primary" type="submit" id="btnBulkDo">រក្សាទុក</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  // Enable Bootstrap tooltip if available
  if (window.bootstrap?.Tooltip){
    const el = group.querySelector('#btnBulkAssign[data-bs-toggle="tooltip"]');
    if (el && !el.__tip){
      el.__tip = new bootstrap.Tooltip(el, { placement: 'bottom' });
    }
  }
}

/* ===========================================================================================
   MAIN
   =========================================================================================== */
async function initIndicators(root){
  ensureStyles();

  // Auth
  const auth  = getAuth();
  const SUPER = isSuper();
  const ADMIN = isAdmin();
  const myUid = String(auth?.uid || '');

  // DOM
  const table   = root.querySelector('#tblIndicators');
  const thead   = table?.querySelector('thead');
  const tbody   = table?.querySelector('tbody');
  const btnAdd  = root.querySelector('#btnAdd');
  const frm     = root.querySelector('#frmIndicator');
  const selDept = root.querySelector('#department_id');
  const selUnit = root.querySelector('#unit_id');
  const selOwner= root.querySelector('#owner_id');
  const btnSave = root.querySelector('#btnSave');
  const statusEl= root.querySelector('#statusLine');
  const qEl     = root.querySelector('#txtSearch');
  const pagerEl = root.querySelector('#indicatorsPager');
  const sizeEl  = root.querySelector('#indicatorsPageSize');

  if (!table || !tbody || !frm || !btnSave) return;

  // Build Bulk UI (now sits next to search)
  ensureBulkAssignUI(root, SUPER);
  const btnBulk = root.querySelector('#btnBulkAssign');
  const mdlIndicator = makeModal('mdlIndicator');
  const mdlBulk      = makeModal('mdlBulkAssign');
  const frmBulk      = document.getElementById('frmBulkAssign');
  const selBulkOwner = document.getElementById('bulk_owner_id');
  const bulkCountEl  = document.getElementById('bulkCount');
  const bulkListEl   = document.getElementById('bulkList');

  const setStatus = (m, ok=true)=>{
    if (statusEl){ statusEl.textContent = m||''; statusEl.classList.toggle('text-danger', !ok); }
  };

  // Caches
  const CACHE = {
    departments: [],
    unitsAll: [],
    indicators: [],
    usersAll: [],
    unitsByDep: new Map()
  };
  const MAPS = { deptName:{}, unitName:{}, ownerLabelByUid:{} };

  // UI State
  let FILTER_Q = '';
  let SORT_BY  = 'indicator_id';
  let SORT_DIR = 'asc';
  let PAGE     = 1;
  let PAGE_SIZE= toInt(sizeEl?.value, 10);

  // Skeleton
  tbody.innerHTML='';
  for (let i=0;i<4;i++){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="7" class="skel"></td>'; tbody.appendChild(tr); }

  /* ---------- Data load ---------- */
  async function safeList(name, params){ try{ return await gasList(name, params||{}); }catch(e){ console.warn('[indicators] list fail', name, e); return []; } }
  let deptsCore = await safeList('departments');
  let unitsCore = await safeList('units');
  const indicators = SUPER ? await safeList('indicators') : await safeList('indicators', { owner_uid: myUid });

  // Users
  let usersCore = [];
  if (SUPER) usersCore = await safeList('users');
  else if (auth){
    usersCore = [{
      auth_uid: myUid,
      full_name: auth.full_name || auth.user_name || 'ខ្លួនឯង',
      user_name: auth.user_name || '',
      user_id:   auth.user_id || '',
      department_id: auth.department_id || '',
      unit_id: auth.unit_id || ''
    }];
  }

  // Scope for non-super
  if (!SUPER){
    const depId = String(auth?.department_id || '');
    deptsCore = deptsCore.filter(d=> String(d.department_id) === depId);
    unitsCore = unitsCore.filter(u=> String(u.department_id) === depId);
  }

  // Fill caches + maps
  CACHE.departments = deptsCore.slice();
  CACHE.unitsAll    = unitsCore.slice();
  CACHE.indicators  = indicators.slice();
  CACHE.usersAll    = usersCore.slice();

  MAPS.deptName = Object.fromEntries(CACHE.departments.map(d=>[String(d.department_id), d.department_name]));
  MAPS.unitName = Object.fromEntries(CACHE.unitsAll.map(u=>[String(u.unit_id), u.unit_name]));

  const ownerSet = new Set();
  for (const u of CACHE.usersAll){
    const uid = String(u.auth_uid || u.user_id || u.uid || '');
    if (!uid || ownerSet.has(uid)) continue;
    const label = u.full_name || u.user_name || u.email || (`User#${u.user_id||''}`);
    MAPS.ownerLabelByUid[uid] = label;
    ownerSet.add(uid);
  }

  // Build index map
  function rebuildIndex(){
    BY_ID.clear();
    for (const r of CACHE.indicators){
      BY_ID.set(String(r.indicator_id ?? ''), r);
    }
  }
  rebuildIndex();

  // Select helpers
  function fillDeptSelect(selected){
    if (!selDept) return;
    selDept.innerHTML = `<option value="">— ជ្រើសជំពូក —</option>` +
      CACHE.departments.map(d=> `<option value="${d.department_id}">${d.department_name}</option>`).join('');
    if (selected) selDept.value = String(selected);
    selDept.disabled = !SUPER;
  }
  async function fillUnitSelect(depId, selected){
    if (!selUnit) return;
    selUnit.innerHTML = `<option value="">— ជ្រើសផ្នែក —</option>`;
    if (!depId){ selUnit.disabled = !SUPER; return; }
    const key = String(depId);
    let units = CACHE.unitsByDep.get(key);
    if (!units){
      units = CACHE.unitsAll.filter(u=> String(u.department_id)===key);
      CACHE.unitsByDep.set(key, units);
      for (const u of units) MAPS.unitName[String(u.unit_id)] = u.unit_name;
    }
    selUnit.innerHTML += units.map(u=> `<option value="${u.unit_id}">${u.unit_name}</option>`).join('');
    if (selected) selUnit.value = String(selected);
    selUnit.disabled = !SUPER;
  }
  function fillOwnerSelect(){
    if (!selOwner) return;
    selOwner.innerHTML = '';
    if (SUPER){
      selOwner.innerHTML = `<option value="">— ជ្រើសម្ចាស់ —</option>` +
        Object.entries(MAPS.ownerLabelByUid).map(([uid,label])=> `<option value="${uid}">${label}</option>`).join('');
      selOwner.disabled = false;
    }else{
      const myLabel = MAPS.ownerLabelByUid[myUid] || 'ខ្លួនឯង';
      selOwner.innerHTML = `<option value="${myUid}">${myLabel}</option>`;
      selOwner.disabled = true;
    }
  }

  // First fill
  fillDeptSelect(SUPER ? '' : String(auth?.department_id||''));
  await fillUnitSelect(SUPER ? (selDept?.value||'') : String(auth?.department_id||''), SUPER ? '' : String(auth?.unit_id||''));
  fillOwnerSelect();

  /* ---------- Filter / Sort ---------- */
  function normalized(ind){
    return {
      indicator_id   : String(ind.indicator_id || ''),
      indicator_name : text(ind.indicator_name),
      indicator_type : text(ind.indicator_type),
      department_name: MAPS.deptName[String(ind.department_id)] || '',
      unit_name      : MAPS.unitName[String(ind.unit_id)] || '',
      owner          : MAPS.ownerLabelByUid[String(ind.owner_uid||'')] || '',
      _raw           : ind
    };
  }
  function filteredSorted(){
    const q = FILTER_Q;
    let rows = CACHE.indicators.map(normalized);
    if (q){
      const qq = q.toLowerCase();
      rows = rows.filter(r =>
        (r.indicator_id   && r.indicator_id.toLowerCase().includes(qq)) ||
        (r.indicator_name && r.indicator_name.toLowerCase().includes(qq)) ||
        (r.indicator_type && r.indicator_type.toLowerCase().includes(qq)) ||
        (r.department_name&& r.department_name.toLowerCase().includes(qq)) ||
        (r.unit_name      && r.unit_name.toLowerCase().includes(qq)) ||
        (r.owner          && r.owner.toLowerCase().includes(qq))
      );
    }
    const dir = (SORT_DIR==='asc') ? 1 : -1;
    const getVal = (r,k)=> (k==='indicator_id'
      ? (Number.isFinite(Number(r.indicator_id)) ? Number(r.indicator_id) : r.indicator_id.toLowerCase())
      : String(r[k]||'').toLowerCase());
    rows.sort((a,b)=>{
      const va=getVal(a,SORT_BY), vb=getVal(b,SORT_BY);
      if (va<vb) return -1*dir;
      if (va>vb) return  1*dir;
      return 0;
    });
    return rows;
  }

  /* ---------- Selection / Highlight ---------- */
  function selectAndReveal(idStr){
    SELECT_KEY = String(idStr || '');
    const all = filteredSorted();
    const idx = all.findIndex(r => String(r._raw?.indicator_id || '') === SELECT_KEY);
    if (idx >= 0){
      PAGE = Math.floor(idx / (PAGE_SIZE || 10)) + 1;
    }
    renderTable(() => {
      const rowEl = document.querySelector(`tr[data-key="${CSS.escape(SELECT_KEY)}"]`);
      if (rowEl){
        rowEl.classList.add('row-selected');
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(()=> rowEl?.classList?.remove('row-selected'), 1800);
      }
    });
  }
  function refreshSelectedStatus(){
    const n = SELECTED.size;
    if (statusEl) statusEl.textContent = n>0 ? `បានជ្រើស ${n} សូចនាករ សម្រាប់ Bulk Assign` : '';
  }

  /* ---------- Render Table (with afterRender callback) ---------- */
  function ensureHeaderCheckbox(){
    if (!thead || !SUPER) return;
    if (!thead.querySelector('th[data-col="sel"]')){
      const tr = thead.querySelector('tr');
      const th = document.createElement('th');
      th.setAttribute('data-col','sel');
      th.style.width = '36px';
      th.innerHTML = `<input id="chkAll" class="form-check-input" type="checkbox" aria-label="ជ្រើសទាំងអស់">`;
      tr.insertBefore(th, tr.firstElementChild); // add before ID col
    }
  }

  function renderTable(afterRender){
    ensureHeaderCheckbox();

    const all   = filteredSorted();
    PAGE_SIZE   = toInt(sizeEl?.value, PAGE_SIZE||10);
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total / (PAGE_SIZE||10)));
    PAGE        = Math.min(Math.max(1, PAGE), pages);

    const start = (PAGE-1) * PAGE_SIZE;
    const view  = all.slice(start, start+PAGE_SIZE);

    if (!view.length){
      tbody.innerHTML = `<tr><td colspan="${SUPER?8:7}" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      renderPager(total, pages);
      if (typeof afterRender === 'function') afterRender();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const r of view){
      const ind = r._raw;
      const canEdit = SUPER || String(ind.owner_uid||'')===myUid;
      const key = String(ind.indicator_id || '');
      const isChecked = SELECTED.has(key);

      const tr = document.createElement('tr');
      tr.setAttribute('data-key', key);
      tr.innerHTML = `
        ${SUPER ? `<td><input class="row-check form-check-input" type="checkbox" data-key="${key}" ${isChecked?'checked':''} aria-label="ជ្រើស"></td>` : ''}
        <td>${String(r.indicator_id || '')}</td>
        <td>${String(r.indicator_name || '')}</td>
        <td>${String(r.indicator_type || '')}</td>
        <td>${String(r.department_name || '')}</td>
        <td>${String(r.unit_name || '')}</td>
        <td>${String(r.owner || '')}</td>
        <td class="text-end">
          ${canEdit
            ? `<button type="button" class="btn btn-sm btn-warning" data-act="edit" data-key="${key}">កែ</button>
               <button type="button" class="btn btn-sm btn-danger"  data-act="del"  data-key="${key}">លុប</button>`
            : `<span class="text-muted">—</span>`
          }
        </td>`;
      frag.appendChild(tr);
    }
    tbody.innerHTML=''; tbody.appendChild(frag);
    renderPager(total, pages);

    // header checkbox state + bulk button state
    if (SUPER){
      const chkAll = root.querySelector('#chkAll');
      if (chkAll){
        const pageKeys = Array.from(tbody.querySelectorAll('tr[data-key]')).map(tr => tr.getAttribute('data-key'));
        chkAll.checked = pageKeys.length>0 && pageKeys.every(k => SELECTED.has(k));
        chkAll.indeterminate = pageKeys.some(k => SELECTED.has(k)) && !chkAll.checked;
      }
      if (btnBulk) btnBulk.disabled = (SELECTED.size===0);
      if (bulkCountEl) bulkCountEl.textContent = String(SELECTED.size || 0);
      refreshSelectedStatus();
    }

    if (typeof afterRender === 'function') afterRender();
  }

  function renderPager(total, pages){
    if (!pagerEl) return;
    pagerEl.innerHTML = `
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <div class="small text-muted">សរុប ${total} សូចនាករ</div>
        <div class="ms-auto d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="first" ${PAGE<=1?'disabled':''}>&laquo;</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="prev"  ${PAGE<=1?'disabled':''}>&lsaquo;</button>
          <span class="small">ទំព័រ ${PAGE}/${pages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="next"  ${PAGE>=pages?'disabled':''}>&rsaquo;</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="last"  ${PAGE>=pages?'disabled':''}>&raquo;</button>
        </div>
      </div>`;
  }

  // First render
  renderTable();
  setStatus(`បានផ្ទុក ${CACHE.indicators.length} សូចនាករ`);

  /* ---------- Events: Sort/Filter/Pager ---------- */
  thead?.addEventListener('click', (e)=>{
    const th = e.target.closest('[data-sort]'); if (!th) return;
    const key = th.getAttribute('data-sort');   if (!key) return;
    if (SORT_BY===key) SORT_DIR = (SORT_DIR==='asc') ? 'desc' : 'asc';
    else { SORT_BY = key; SORT_DIR='asc'; }
    PAGE = 1; renderTable();
  });
  sizeEl?.addEventListener('change', ()=>{ PAGE=1; renderTable(); });
  qEl   ?.addEventListener('input',  ()=>{ FILTER_Q = String(qEl.value||'').trim().toLowerCase(); PAGE=1; renderTable(); });
  pagerEl?.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-goto]'); if(!b||b.disabled) return;
    const a = b.getAttribute('data-goto');
    if (a==='first') PAGE=1;
    else if (a==='prev') PAGE=Math.max(1, PAGE-1);
    else if (a==='next') PAGE=PAGE+1;
    else if (a==='last') PAGE=999999;
    renderTable();
  });

  /* ---------- CRUD with delegation + highlight ---------- */
  const canEditRow = (ind)=> SUPER || String(ind.owner_uid||'')===myUid;

  btnAdd?.addEventListener('click', async ()=>{
    frm.reset();
    const idEl   = root.querySelector('#indicator_id');
    const nameEl = root.querySelector('#indicator_name');
    if (idEl)   idEl.value = '';
    if (nameEl) nameEl.classList.remove('is-invalid');

    if (SUPER){
      selDept && (selDept.disabled=false);
      await fillUnitSelect(selDept?.value||'', '');
      selOwner && (selOwner.disabled=false);
      fillOwnerSelect();
    }else{
      if (selDept){ selDept.value = String(auth?.department_id||''); selDept.disabled=true; }
      await fillUnitSelect(String(auth?.department_id||''), String(auth?.unit_id||''));
      if (selUnit) selUnit.disabled = true;
      fillOwnerSelect();
    }
    mdlIndicator?.show();
  });

  // Row actions (edit/delete) + selection (checkbox + select-all)
  root.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn || !root.contains(btn)) return;
    const act = btn.getAttribute('data-act');
    const key = String(btn.getAttribute('data-key') || '');
    const row = BY_ID.get(key);
    if (!row) return;

    if (!canEditRow(row)) { alert('Permission denied'); return; }

    if (act === 'edit'){
      frm.reset();
      const idEl   = root.querySelector('#indicator_id');
      const nameEl = root.querySelector('#indicator_name');
      const typeEl = root.querySelector('#indicator_type');

      if (idEl)   idEl.value   = String(row.indicator_id || '');
      if (nameEl) nameEl.value = String(row.indicator_name || '');
      if (typeEl) typeEl.value = String(row.indicator_type || '');

      if (selDept){ selDept.value = String(row.department_id || ''); selDept.disabled = !SUPER; }
      await fillUnitSelect(String(row.department_id || ''), String(row.unit_id || ''));
      if (selUnit) selUnit.disabled = !SUPER;

      fillOwnerSelect();
      if (selOwner){
        const v = String(row.owner_uid || myUid);
        selOwner.value = v;
        selOwner.disabled = !SUPER;
      }

      SELECT_KEY = key;
      renderTable(()=>{
        const rowEl = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
        rowEl?.classList?.add('row-selected');
        rowEl?.scrollIntoView({ behavior:'smooth', block:'center' });
        setTimeout(()=> rowEl?.classList?.remove('row-selected'), 1200);
      });
      mdlIndicator?.show();
      return;
    }

    if (act === 'del'){
      if (!confirm('លុបមែនទេ?')) return;
      await gasDelete('indicators', ID_FIELDS.indicators, key);
      CACHE.indicators = CACHE.indicators.filter(x=> String(x.indicator_id)!==key);
      SELECTED.delete(key);
      if (SELECT_KEY === key) SELECT_KEY = '';
      rebuildIndex();
      renderTable();
      return;
    }
  });

  root.addEventListener('change', (e)=>{
    // row checkbox
    const ck = e.target.closest('input.row-check');
    if (ck){
      const key = String(ck.getAttribute('data-key') || '');
      if (ck.checked) SELECTED.add(key); else SELECTED.delete(key);
      if (btnBulk) btnBulk.disabled = (SELECTED.size===0);
      if (bulkCountEl) bulkCountEl.textContent = String(SELECTED.size || 0);
      const chkAll = root.querySelector('#chkAll');
      if (chkAll){
        const pageKeys = Array.from(tbody.querySelectorAll('tr[data-key]')).map(tr => tr.getAttribute('data-key'));
        chkAll.checked = pageKeys.length>0 && pageKeys.every(k => SELECTED.has(k));
        chkAll.indeterminate = pageKeys.some(k => SELECTED.has(k)) && !chkAll.checked;
      }
      refreshSelectedStatus();
      return;
    }
    // select all
    const all = e.target.closest('#chkAll');
    if (all){
      const check = all.checked;
      tbody.querySelectorAll('tr[data-key]').forEach(tr=>{
        const key = String(tr.getAttribute('data-key') || '');
        const rc = tr.querySelector('input.row-check');
        if (rc){ rc.checked = check; }
        if (check) SELECTED.add(key); else SELECTED.delete(key);
      });
      if (btnBulk) btnBulk.disabled = (SELECTED.size===0);
      if (bulkCountEl) bulkCountEl.textContent = String(SELECTED.size || 0);
      refreshSelectedStatus();
      return;
    }
  });

  // Save (create/update)
  frm.addEventListener('submit', async (e)=>{
    e.preventDefault();

    const idEl   = root.querySelector('#indicator_id');
    const nameEl = root.querySelector('#indicator_name');
    const typeEl = root.querySelector('#indicator_type');

    const rawId   = String(idEl?.value || '');
    const ownerUid= SUPER ? String(selOwner?.value || '') : myUid;

    const payload = {
      indicator_id  : rawId || (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : ('ind-'+Math.random().toString(36).slice(2,10))),
      indicator_name: String(nameEl?.value || '').trim(),
      indicator_type: String(typeEl?.value || '').trim(),
      department_id : String(SUPER ? (selDept?.value||'') : (auth?.department_id||'')),
      unit_id       : String(SUPER ? (selUnit?.value||'') : (auth?.unit_id||'')),
      owner_uid     : ownerUid
    };

    if (!payload.indicator_name){ nameEl?.classList.add('is-invalid'); return; }
    if (!payload.owner_uid){ alert('owner_uid គ្មាន'); return; }
    if (!SUPER && payload.owner_uid !== myUid){ alert('Admin អាចរក្សាទុកបានតែសូចនាកររបស់ខ្លួន'); return; }

    const old = btnSave.innerHTML;
    btnSave.disabled = true; btnSave.innerHTML = 'កំពុងរក្សាទុក…';
    try{
      const saved = await gasSave('indicators', payload);
      const idx = CACHE.indicators.findIndex(x=> String(x.indicator_id)===String(saved.indicator_id));
      if (idx>=0) CACHE.indicators[idx] = saved; else CACHE.indicators.push(saved);
      SELECT_KEY = String(saved.indicator_id || '');
      rebuildIndex();
      mdlIndicator?.hide();
      selectAndReveal(saved.indicator_id);
    }catch(err){
      console.error('[indicators] save failed:', err);
      alert('បរាជ័យរក្សាទុក: ' + (err?.message || err));
    }finally{
      btnSave.disabled = false; btnSave.innerHTML = old;
    }
  });

  // Dep change
  selDept?.addEventListener('change', async (e)=>{
    await fillUnitSelect(String(e.target.value||''), '');
    if (SUPER) fillOwnerSelect();
  });

  /* ---------- BULK ASSIGN (SUPER only) ---------- */
  if (btnBulk){
    btnBulk.addEventListener('click', ()=>{
      if (!SUPER) return;
      // fill owner list
      if (selBulkOwner){
        selBulkOwner.innerHTML = `<option value="">— ជ្រើសម្ចាស់ —</option>` +
          Object.entries(MAPS.ownerLabelByUid).map(([uid,label])=> `<option value="${uid}">${label}</option>`).join('');
      }
      if (bulkCountEl) bulkCountEl.textContent = String(SELECTED.size || 0);
      if (bulkListEl){
        const items = [];
        for (const id of SELECTED){
          const row = BY_ID.get(id);
          const label = row?.indicator_name || id;
          items.push(`<li>${safe(String(id))} — ${safe(String(label))}</li>`);
        }
        bulkListEl.innerHTML = items.join('') || '<li class="text-muted">គ្មាន</li>';
      }
      mdlBulk?.show();
    });
  }

  frmBulk?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!SUPER) return;

    const newOwner = String(selBulkOwner?.value || '');
    if (!newOwner){ selBulkOwner?.classList?.add('is-invalid'); return; }
    selBulkOwner?.classList?.remove('is-invalid');

    const ids = Array.from(SELECTED);
    if (!ids.length){ alert('សូមជ្រើសសូចនាករជាមុន'); return; }

    const btnDo = document.getElementById('btnBulkDo');
    const old = btnDo?.innerHTML;
    if (btnDo){ btnDo.disabled = true; btnDo.innerHTML = 'កំពុងកែ…'; }

    let ok=0, fail=0;
    for (const id of ids){
      try{
        const row = BY_ID.get(id);
        if (!row){ fail++; continue; }
        const payload = {
          ...row,
          indicator_id  : String(row.indicator_id || id),
          owner_uid     : newOwner,                        // only owner changes
          department_id : String(row.department_id || ''), // unchanged
          unit_id       : String(row.unit_id || '')        // unchanged
        };
        const saved = await gasSave('indicators', payload);
        const i = CACHE.indicators.findIndex(x=> String(x.indicator_id)===String(saved.indicator_id));
        if (i>=0) CACHE.indicators[i] = saved; else CACHE.indicators.push(saved);
        BY_ID.set(String(saved.indicator_id), saved);
        ok++;
      }catch(err){
        console.warn('[bulk-assign] failed for', id, err);
        fail++;
      }
    }

    mdlBulk?.hide();
    SELECTED.clear();
    if (btnBulk) btnBulk.disabled = true;
    if (bulkCountEl) bulkCountEl.textContent = '0';
    renderTable();

    const msg = `បានកែ ${ok} ហើយបរាជ័យ ${fail}`;
    setStatus(msg, fail===0);

    if (btnDo){ btnDo.disabled = false; btnDo.innerHTML = old; }
  });
}

/* -------------------------- Public entry -------------------------- */
export default async function hydrate(root){
  await initIndicators(root);
}
