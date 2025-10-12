// assets/js/pages/users.page.js
import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasSave, gasDelete } from '../app.api.firebase.js';

/* ========== Modal helper (cached; Bootstrap compat) ========== */
/* ========== Modal helper (works with many Bootstrap builds) ========== */
function makeModal(id){
  const el = document.getElementById(id);
  if (!el) return null;

  // already cached?
  if (el.__modalApi) return el.__modalApi;

  let api;

  if (window.bootstrap?.Modal){
    const M = window.bootstrap.Modal;
    const opts = { backdrop:true, keyboard:true, focus:true };

    // Reuse same instance across calls to avoid duplicates
    let inst = el.__bsModalInst;

    try {
      if (!inst) {
        if (typeof M.getOrCreateInstance === 'function') {
          inst = M.getOrCreateInstance(el, opts);
        } else if (typeof M.getInstance === 'function') {
          inst = M.getInstance(el) || new M(el, opts);
        } else {
          // very minimal/lite build: constructor only
          inst = new M(el, opts);
        }
        el.__bsModalInst = inst;
      }
    } catch (e) {
      // if anything fails, fallback to manual modal (no Bootstrap APIs)
      inst = null;
    }

    if (inst) {
      // basic a11y guards
      el.addEventListener('show.bs.modal',  ()=> el.removeAttribute('aria-hidden'));
      el.addEventListener('shown.bs.modal', ()=> el.removeAttribute('aria-hidden'));
      el.addEventListener('hidden.bs.modal',()=> el.setAttribute('aria-hidden','true'));

      api = { show:()=>inst.show(), hide:()=>inst.hide() };
    }
  }

  // Fallback (no or incompatible Bootstrap)
  if (!api) {
    api = {
      show(){ el.style.display='block'; el.classList.add('show'); el.removeAttribute('aria-hidden'); },
      hide(){ el.classList.remove('show'); el.style.display='none'; el.setAttribute('aria-hidden','true'); }
    };
  }

  el.__modalApi = api;
  return api;
}


/* ========== Utils ========== */
const STATUS = { ACTIVE:'active', SUSPENDED:'suspended', DISABLED:'disabled' };
const toInt = (v,d=0)=>{ const n=Number(v); return Number.isFinite(n)?n:d; };
const emailNorm = (e)=> String(e||'').trim().toLowerCase();
const roleBadge = r => (String(r).toLowerCase()==='super'
  ? '<span class="badge bg-dark">SUPER</span>'
  : String(r).toLowerCase()==='admin'
    ? '<span class="badge bg-primary">ADMIN</span>'
    : '<span class="badge bg-info text-dark">VIEWER</span>');
const statusBadge = s=>{
  const v=String(s||'').toLowerCase();
  if (v===STATUS.ACTIVE) return '<span class="badge bg-success">ACTIVE</span>';
  if (v===STATUS.SUSPENDED) return '<span class="badge bg-warning text-dark">SUSPENDED</span>';
  if (v===STATUS.DISABLED) return '<span class="badge bg-secondary">DISABLED</span>';
  return '<span class="badge bg-light text-dark">UNKNOWN</span>';
};

/* ========== Main ========== */
async function initUsers(root){
  // 🔒 prevent double init
  if (root.__users_inited) return;
  root.__users_inited = true;

  const SUPER = isSuper();
  if (!SUPER){
    root.querySelector('.page-body')?.insertAdjacentHTML('afterbegin',
      `<div class="alert alert-warning">ត្រូវការ SUPER ដើម្បីគ្រប់គ្រងអ្នកប្រើប្រាស់</div>`);
    return;
  }

  // DOM
  const table   = root.querySelector('#tblUsers');
  const thead   = table?.querySelector('thead');
  const tbody   = table?.querySelector('tbody');
  const btnAdd  = root.querySelector('#btnAdd');
  const frm     = root.querySelector('#frmUser');
  const btnSave = root.querySelector('#btnSave');
  const statusEl= root.querySelector('#statusLine');
  const qEl     = root.querySelector('#txtSearch');
  const pagerEl = root.querySelector('#usersPager');
  const sizeEl  = root.querySelector('#usersPageSize');
  const mdl     = makeModal('mdlUser');
  const mdlEl   = document.getElementById('mdlUser');

  // form fields
  const idEl    = root.querySelector('#user_id');
  const nameEl  = root.querySelector('#full_name');
  const emailEl = root.querySelector('#email');
  const phoneEl = root.querySelector('#phone');
  const roleEl  = root.querySelector('#role');
  const statusSel = root.querySelector('#status');
  const selDept = root.querySelector('#department_id');
  const selUnit = root.querySelector('#unit_id');
  const emailVerifiedEl = root.querySelector('#email_verified');
  const mfaEl  = root.querySelector('#mfa_enabled');
  const authUidEl = root.querySelector('#auth_uid');
  const btnCopyUid = root.querySelector('#btnCopyUid');

  const setStatus = (m, ok=true)=>{ if(statusEl){ statusEl.textContent=m||''; statusEl.classList.toggle('text-danger', !ok);} };

  // Caches
  const CACHE = { users:[], departments:[], units:[], unitsByDep:new Map() };
  const MAPS  = { deptName:{}, unitName:{} };

  // UI state
  let FILTER_Q='', FILTER_ROLE='', FILTER_STATUS='';
  let SORT_BY='user_id', SORT_DIR='asc', PAGE=1, PAGE_SIZE=toInt(sizeEl?.value,10);

  // Skeleton
  if (tbody){
    tbody.innerHTML='';
    for (let i=0;i<4;i++){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="9" class="skel"></td>'; tbody.appendChild(tr); }
  }

  // Load
  async function safeList(name, params){ try{ return await gasList(name, params||{}); }catch{ return []; } }
  CACHE.departments = await safeList('departments');
  CACHE.units       = await safeList('units');
  CACHE.users       = await safeList('users');

  MAPS.deptName = Object.fromEntries(CACHE.departments.map(d=>[String(d.department_id), d.department_name]));
  MAPS.unitName = Object.fromEntries(CACHE.units.map(u=>[String(u.unit_id), u.unit_name]));

  function fillDeptSelect(selected){
    if (!selDept) return;
    selDept.innerHTML = `<option value="">— ជ្រើសជំពូក —</option>` +
      CACHE.departments.map(d=> `<option value="${d.department_id}">${d.department_name}</option>`).join('');
    if (selected) selDept.value = String(selected);
  }
  async function fillUnitSelect(depId, selected){
    if (!selUnit) return;
    selUnit.innerHTML = `<option value="">— ជ្រើសផ្នែក —</option>`;
    if (!depId) return;
    const key = String(depId);
    let units = CACHE.unitsByDep.get(key);
    if (!units){ units = CACHE.units.filter(u=> String(u.department_id)===key); CACHE.unitsByDep.set(key, units); }
    selUnit.innerHTML += units.map(u=> `<option value="${u.unit_id}">${u.unit_name}</option>`).join('');
    if (selected) selUnit.value = String(selected);
  }
  fillDeptSelect('');

  function normalized(u){
    return {
      user_id    : String(u.user_id || u.id || u.auth_uid || ''),
      full_name  : String(u.full_name || u.user_name || ''),
      email      : emailNorm(u.email),
      phone      : String(u.phone || ''),
      role       : String(u.role || 'viewer'),
      department : MAPS.deptName[String(u.department_id)] || '',
      unit       : MAPS.unitName[String(u.unit_id)] || '',
      status     : String(u.status || STATUS.ACTIVE),
      auth_uid   : String(u.auth_uid || ''),
      _raw       : u
    };
  }

  function filteredSorted(){
    let rows = CACHE.users.map(normalized);
    if (FILTER_Q){
      const q = FILTER_Q.toLowerCase();
      rows = rows.filter(r => (
        r.user_id?.toLowerCase().includes(q) ||
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.unit?.toLowerCase().includes(q)
      ));
    }
    if (FILTER_ROLE)   rows = rows.filter(r => String(r.role).toLowerCase() === FILTER_ROLE);
    if (FILTER_STATUS) rows = rows.filter(r => String(r.status).toLowerCase() === FILTER_STATUS);

    const dir = (SORT_DIR==='asc')?1:-1;
    const getVal=(r,k)=> k==='user_id'
      ? (Number.isFinite(Number(r.user_id))?Number(r.user_id):String(r.user_id).toLowerCase())
      : String(r[k]||'').toLowerCase();
    rows.sort((a,b)=> (getVal(a,SORT_BY)<getVal(b,SORT_BY)?-1: getVal(a,SORT_BY)>getVal(b,SORT_BY)?1:0)*dir);
    return rows;
  }

  function renderPager(total, pages){
    if (!pagerEl) return;
    pagerEl.innerHTML = `
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <div class="small text-muted">សរុប ${total} អ្នកប្រើប្រាស់</div>
        <div class="ms-auto d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="first" ${PAGE<=1?'disabled':''}>&laquo;</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="prev"  ${PAGE<=1?'disabled':''}>&lsaquo;</button>
          <span class="small">ទំព័រ ${PAGE}/${pages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="next"  ${PAGE>=pages?'disabled':''}>&rsaquo;</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-goto="last"  ${PAGE>=pages?'disabled':''}>&raquo;</button>
        </div>
      </div>`;
  }

  function render(){
    const all   = filteredSorted();
    PAGE_SIZE   = toInt(sizeEl?.value, PAGE_SIZE||10);
    const total = all.length;
    const pages = Math.max(1, Math.ceil(total/(PAGE_SIZE||10)));
    PAGE        = Math.min(Math.max(1,PAGE), pages);
    const view  = all.slice((PAGE-1)*PAGE_SIZE, (PAGE-1)*PAGE_SIZE + PAGE_SIZE);

    if (!tbody) return;
    if (!view.length){
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      renderPager(total, pages); return;
    }

    const frag = document.createDocumentFragment();
    for (const r of view){
      const hasUid = !!r.auth_uid;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.user_id}</td>
        <td>${r.full_name}</td>
        <td class="text-truncate" title="${r.email}">
          ${r.email || ''} ${hasUid?'<i class="i-Key text-success" title="Has Auth UID"></i>':''}
        </td>
        <td>${r.phone}</td>
        <td>${roleBadge(r.role)}</td>
        <td>${r.department}</td>
        <td>${r.unit}</td>
        <td>${statusBadge(r.status)}</td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-warning" data-act="edit" data-id="${r.user_id}">
              <i class="i-Pen-2"></i> កែ
            </button>
            <button class="btn btn-sm btn-outline-primary" data-act="reset" data-email="${r.email}" ${!r.email?'disabled':''}>
              <i class="i-Repeat-3"></i> Reset
            </button>
            ${r.status===STATUS.ACTIVE
              ? `<button class="btn btn-sm btn-outline-secondary" data-act="suspend" data-id="${r.user_id}">
                   <i class="i-Lock-2"></i> Suspend
                 </button>`
              : `<button class="btn btn-sm btn-outline-success" data-act="reactivate" data-id="${r.user_id}">
                   <i class="i-Yes"></i> Reactivate
                 </button>`}
            <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${r.user_id}">
              <i class="i-Close"></i> លុប
            </button>
          </div>
        </td>`;
      frag.appendChild(tr);
    }
    tbody.innerHTML=''; tbody.appendChild(frag);
    renderPager(total, pages);
    setStatus(`បានផ្ទុក ${CACHE.users.length} អ្នកប្រើប្រាស់`);
  }

  // First render
  render();

  /* ========== Events: sort / filter / pager / search (bound once) ========== */
  thead?.addEventListener('click', (e)=>{
    const th = e.target.closest('[data-sort]'); if (!th) return;
    e.preventDefault(); e.stopPropagation();
    const key = th.getAttribute('data-sort');   if (!key) return;
    if (SORT_BY===key) SORT_DIR = (SORT_DIR==='asc')?'desc':'asc'; else { SORT_BY=key; SORT_DIR='asc'; }
    PAGE=1; render();
  });
  sizeEl?.addEventListener('change', ()=>{ PAGE=1; render(); });
  qEl?.addEventListener('input', ()=>{ FILTER_Q = String(qEl.value||'').trim().toLowerCase(); PAGE=1; render(); });
  root.querySelector('#fltRole')?.addEventListener('change', e=>{ FILTER_ROLE=String(e.target.value||'').toLowerCase(); PAGE=1; render(); });
  root.querySelector('#fltStatus')?.addEventListener('change', e=>{ FILTER_STATUS=String(e.target.value||'').toLowerCase(); PAGE=1; render(); });
  pagerEl?.addEventListener('click', (e)=>{
    const b=e.target.closest('button[data-goto]'); if(!b||b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    const a=b.getAttribute('data-goto');
    if(a==='first')PAGE=1; else if(a==='prev')PAGE=Math.max(1,PAGE-1); else if(a==='next')PAGE=PAGE+1; else if(a==='last')PAGE=999999;
    render();
  });

  // dep -> units
  selDept?.addEventListener('change', async e=>{ await fillUnitSelect(String(e.target.value||''), ''); });

  // copy UID
  btnCopyUid?.addEventListener('click', (e)=>{
    e.preventDefault(); e.stopPropagation();
    const v = String(authUidEl.value||'');
    if (!v) return;
    navigator.clipboard?.writeText(v);
    setStatus('បានចម្លង UID ទៅ Clipboard');
  });

  // Add
  btnAdd?.addEventListener('click', (e)=>{
    e.preventDefault(); e.stopPropagation();
    frm.reset();
    idEl.value='';
    statusSel.value=STATUS.ACTIVE;
    authUidEl.value='';
    fillDeptSelect(''); selUnit.innerHTML = `<option value="">— ជ្រើសផ្នែក —</option>`;
    mdl?.show();
  });

  // ========== ONE root click delegate (bound once) ==========
  if (!root.__users_click_bound){
    root.__users_click_bound = true;
    root.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();

      const act = btn.getAttribute('data-act');
      if (act==='reset'){
        const email = btn.getAttribute('data-email')||'';
        if (!email) return alert('គ្មានអ៊ីមែល');
        alert('សូមចូល Firebase Auth ➜ Users ➜ ជ្រើសគណនី ➜ "Send password reset email".');
        return;
      }

      const id = btn.getAttribute('data-id')||'';
      const row = CACHE.users.find(u => String(u.user_id||u.id||u.auth_uid)===String(id));
      if (!row) return;

      if (act==='edit'){
        frm.reset();
        idEl.value = String(row.user_id || row.id || '');
        nameEl.value = String(row.full_name || row.user_name || '');
        emailEl.value = String(row.email || '');
        phoneEl.value = String(row.phone || '');
        roleEl.value  = String(row.role || 'viewer').toLowerCase();
        statusSel.value = String(row.status || STATUS.ACTIVE).toLowerCase();
        emailVerifiedEl.checked = !!row.email_verified;
        mfaEl.checked = !!row.mfa_enabled;
        authUidEl.value = String(row.auth_uid || '');

        fillDeptSelect(row.department_id || '');
        await fillUnitSelect(row.department_id || '', row.unit_id || '');
        mdl?.show(); // cached instance → មិនបង្ហាញពីរដងទេ
        return;
      }

      if (act==='suspend' || act==='reactivate'){
        const status = (act==='suspend')?STATUS.SUSPENDED:STATUS.ACTIVE;
        if (!confirm(act==='suspend'?'ព្យួរឬ?':'ដំណើរការឡើងវិញ?')) return;
        const payload = { ...row, status };
        await gasSave('users', payload);
        const i = CACHE.users.findIndex(u=>String(u.user_id||u.id)===String(row.user_id||row.id));
        if (i>=0) CACHE.users[i]=payload;
        render();
        return;
      }

      if (act==='del'){
        if (!confirm('លុបមែនទេ?')) return;
        await gasDelete('users', {key:'user_id'}, String(row.user_id||row.id));
        CACHE.users = CACHE.users.filter(u=> String(u.user_id||u.id)!==String(row.user_id||row.id));
        render();
        return;
      }
    });
  }

  // Save
  frm.addEventListener('submit', async (e)=>{
    e.preventDefault(); e.stopPropagation();

    const name = String(nameEl.value||'').trim();
    const email= emailNorm(emailEl.value||'');
    if (!name){ nameEl.classList.add('is-invalid'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ emailEl.classList.add('is-invalid'); return; }
    nameEl.classList.remove('is-invalid'); emailEl.classList.remove('is-invalid');

    const uid = String(idEl.value||'');
    const key = uid || (crypto.randomUUID ? crypto.randomUUID() : ('u-'+Math.random().toString(36).slice(2,10)));

    const payload = {
      id: key,
      user_id: key,
      full_name: name,
      email,
      phone: String(phoneEl.value||'').trim(),
      role: String(roleEl.value||'viewer').toLowerCase(),
      status: String(statusSel.value||STATUS.ACTIVE).toLowerCase(),
      department_id: String(selDept.value||''),
      unit_id: String(selUnit.value||''),
      email_verified: !!emailVerifiedEl.checked,
      mfa_enabled: !!mfaEl.checked,
      auth_uid: String(authUidEl.value||'').trim()
    };

    const old = btnSave.innerHTML;
    btnSave.disabled = true; btnSave.innerHTML='កំពុងរក្សាទុក…';
    try{
      const saved = await gasSave('users', payload);
      const i = CACHE.users.findIndex(u => String(u.user_id||u.id)===String(saved.user_id||saved.id));
      if (i>=0) CACHE.users[i]=saved; else CACHE.users.push(saved);
      mdl?.hide();
      render();
    }catch(err){
      console.error('[users] save failed', err);
      alert('បរាជ័យរក្សាទុក');
    }finally{
      btnSave.disabled=false; btnSave.innerHTML=old;
    }
  });
}

/* Public entry */
export default async function hydrate(root){
  await initUsers(root);
}
