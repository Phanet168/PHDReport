// assets/js/pages/users.page.js
import { getAuth, isSuper, isAdmin } from '../app.auth.js';
import { gasList, gasSave, gasDelete } from '../app.api.firebase.js';

/* =============================== Modal helper (Bootstrap compat + a11y) =============================== */
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
    el.addEventListener('hidden.bs.modal', ()=> el.setAttribute('aria-hidden','true'));

    return { show:()=>inst.show(), hide:()=>inst.hide() };
  }

  // Fallback
  let lastFocus=null;
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

/* =============================== Small utils =============================== */
const STATUS = { ACTIVE:'active', SUSPENDED:'suspended', DISABLED:'disabled' };
const toInt = (v,d=0)=>{ const n=Number(v); return Number.isFinite(n)?n:d; };
const text = v => (v==null?'':String(v));
const emailNorm = (e)=> String(e||'').trim().toLowerCase();

const roleBadge = (r)=>{
  const v = String(r||'').toLowerCase();
  if (v==='super')  return `<span class="badge bg-dark badge-role">SUPER</span>`;
  if (v==='admin')  return `<span class="badge bg-primary badge-role">ADMIN</span>`;
  return `<span class="badge bg-info text-dark badge-role">VIEWER</span>`;
};
const statusBadge = (s)=>{
  const v = String(s||'').toLowerCase();
  if (v===STATUS.ACTIVE)    return `<span class="badge bg-success badge-role">ACTIVE</span>`;
  if (v===STATUS.SUSPENDED) return `<span class="badge bg-warning text-dark badge-role">SUSPENDED</span>`;
  if (v===STATUS.DISABLED)  return `<span class="badge bg-secondary badge-role">DISABLED</span>`;
  return `<span class="badge bg-light text-dark badge-role">UNKNOWN</span>`;
};

/* =============================== Audit helper =============================== */
async function logAudit(event, target, extra={}){
  try{
    await gasSave('audit_logs', {
      event,
      actor_uid: getAuth()?.uid || '',
      target_user_id: (typeof target==='object'? target?.user_id : target) || '',
      at: new Date().toISOString(),
      ...extra
    });
  }catch(e){ console.warn('[audit]', e); }
}

/* =============================== MAIN =============================== */
async function initUsers(root){
  const auth  = getAuth();
  const SUPER = isSuper();
  const ADMIN = isAdmin();

  // Gate: only SUPER sees full page (អាចប្ដូរ policy តាមចាំបាច់)
  if (!SUPER){
    const container = root.querySelector('.page-body');
    if (container){
      container.innerHTML = `<div class="alert alert-warning">សូមទោស! ត្រូវការសិទ្ធិ SUPER ដើម្បីគ្រប់គ្រងអ្នកប្រើប្រាស់</div>`;
    }
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

  if (!table || !tbody || !frm || !btnSave) return;

  const setStatus = (m, ok=true)=>{
    if (statusEl){ statusEl.textContent = m||''; statusEl.classList.toggle('text-danger', !ok); }
  };

  // Cache
  const CACHE = { users:[], departments:[], units:[], unitsByDep:new Map() };
  const MAPS  = { deptName:{}, unitName:{} };

  // UI state
  let FILTER_Q = '';
  let FILTER_ROLE = '';
  let FILTER_STATUS = '';
  let SORT_BY  = 'user_id';
  let SORT_DIR = 'asc';
  let PAGE     = 1;
  let PAGE_SIZE= toInt(sizeEl?.value, 10);

  // Skeleton
  tbody.innerHTML='';
  for (let i=0;i<4;i++){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="9" class="skel"></td>'; tbody.appendChild(tr); }

  /* -------- Data load -------- */
  async function safeList(name, params){ try{ return await gasList(name, params||{}); }catch(e){ console.warn('[users] list fail', name, e); return []; } }
  CACHE.departments = await safeList('departments');
  CACHE.units       = await safeList('units');
  CACHE.users       = await safeList('users'); // All users (SUPER)

  MAPS.deptName = Object.fromEntries(CACHE.departments.map(d=>[String(d.department_id), d.department_name]));
  MAPS.unitName = Object.fromEntries(CACHE.units.map(u=>[String(u.unit_id), u.unit_name]));

  // Select helpers
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
    if (!units){
      units = CACHE.units.filter(u=> String(u.department_id)===key);
      CACHE.unitsByDep.set(key, units);
    }
    selUnit.innerHTML += units.map(u=> `<option value="${u.unit_id}">${u.unit_name}</option>`).join('');
    if (selected) selUnit.value = String(selected);
  }
  fillDeptSelect('');

  /* -------- Filter/Sort/Paginate -------- */
  function normalized(u){
    return {
      user_id    : String(u.user_id || u.auth_uid || ''),
      full_name  : text(u.full_name || u.user_name),
      email      : emailNorm(u.email),
      phone      : text(u.phone),
      role       : String(u.role || 'viewer'),
      department : MAPS.deptName[String(u.department_id)] || '',
      unit       : MAPS.unitName[String(u.unit_id)] || '',
      status     : String(u.status || STATUS.ACTIVE),
      _raw       : u
    };
  }

  function filteredSorted(){
    let rows = CACHE.users.map(normalized);
    if (FILTER_Q){
      const q = FILTER_Q.toLowerCase();
      rows = rows.filter(r => (
        (r.user_id    && r.user_id.toLowerCase().includes(q)) ||
        (r.full_name  && r.full_name.toLowerCase().includes(q)) ||
        (r.email      && r.email.toLowerCase().includes(q)) ||
        (r.phone      && r.phone.toLowerCase().includes(q)) ||
        (r.department && r.department.toLowerCase().includes(q)) ||
        (r.unit       && r.unit.toLowerCase().includes(q))
      ));
    }
    if (FILTER_ROLE)   rows = rows.filter(r => String(r.role).toLowerCase() === FILTER_ROLE);
    if (FILTER_STATUS) rows = rows.filter(r => String(r.status).toLowerCase() === FILTER_STATUS);

    const dir = (SORT_DIR==='asc') ? 1 : -1;
    const getVal = (r,k)=>{
      if (k==='user_id'){
        const n = Number(r.user_id);
        return Number.isFinite(n) ? n : r.user_id.toLowerCase();
      }
      return String(r[k]||'').toLowerCase();
    };
    rows.sort((a,b)=>{
      const va=getVal(a,SORT_BY), vb=getVal(b,SORT_BY);
      if (va<vb) return -1*dir;
      if (va>vb) return  1*dir;
      return 0;
    });
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
    const pages = Math.max(1, Math.ceil(total / (PAGE_SIZE||10)));
    PAGE        = Math.min(Math.max(1, PAGE), pages);

    const start = (PAGE-1) * PAGE_SIZE;
    const view  = all.slice(start, start+PAGE_SIZE);

    if (!view.length){
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      renderPager(total, pages);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const r of view){
      const u = r._raw;
      const canEdit = true; // SUPER only page
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.user_id}</td>
        <td>${r.full_name}</td>
        <td class="text-truncate" title="${r.email}">
          ${r.email || ''}
          ${u.email_verified ? ' <i class="i-Yes text-success" title="Email verified"></i>' : ''}
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
            <button class="btn btn-sm btn-outline-primary" data-act="reset" data-email="${r.email}" ${!r.email || r.status===STATUS.DISABLED?'disabled':''}>
              <i class="i-Repeat-3"></i> Reset
            </button>
            ${r.status===STATUS.ACTIVE
              ? `<button class="btn btn-sm btn-outline-secondary" data-act="suspend" data-id="${r.user_id}">
                   <i class="i-Lock-2"></i> Suspend
                 </button>`
              : `<button class="btn btn-sm btn-outline-success" data-act="reactivate" data-id="${r.user_id}">
                   <i class="i-Yes"></i> Reactivate
                 </button>`
            }
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

  /* -------- Events: sort / filter / pager / search -------- */
  thead?.addEventListener('click', (e)=>{
    const th = e.target.closest('[data-sort]'); if (!th) return;
    const key = th.getAttribute('data-sort');   if (!key) return;
    if (SORT_BY===key) SORT_DIR = (SORT_DIR==='asc') ? 'desc' : 'asc';
    else { SORT_BY = key; SORT_DIR='asc'; }
    PAGE = 1; render();
  });
  sizeEl?.addEventListener('change', ()=>{ PAGE=1; render(); });
  qEl   ?.addEventListener('input',  ()=>{ FILTER_Q = String(qEl.value||'').trim().toLowerCase(); PAGE=1; render(); });
  root.querySelector('#fltRole')  ?.addEventListener('change', (e)=>{ FILTER_ROLE = String(e.target.value||'').toLowerCase(); PAGE=1; render(); });
  root.querySelector('#fltStatus')?.addEventListener('change', (e)=>{ FILTER_STATUS = String(e.target.value||'').toLowerCase(); PAGE=1; render(); });
  pagerEl?.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-goto]'); if(!b||b.disabled) return;
    const a = b.getAttribute('data-goto');
    if (a==='first') PAGE=1;
    else if (a==='prev') PAGE=Math.max(1, PAGE-1);
    else if (a==='next') PAGE=PAGE+1;
    else if (a==='last') PAGE=999999;
    render();
  });

  /* -------- CRUD -------- */
  function isSelf(row){ return String(row?.auth_uid || row?.user_id || '') === String(auth?.uid || ''); }
  function isLastSuperDemotion(targetRow, newRole){
    const isTargetSuper = String(targetRow.role||'').toLowerCase()==='super';
    const newIsSuper    = String(newRole||'').toLowerCase()==='super';
    if (isTargetSuper && !newIsSuper){
      const others = CACHE.users.filter(u => String(u.user_id)!==String(targetRow.user_id));
      const remain = others.some(u => String(u.role||'').toLowerCase()==='super');
      return !remain;
    }
    return false;
  }

  btnAdd?.addEventListener('click', ()=>{
    frm.reset();
    idEl.value=''; nameEl.classList.remove('is-invalid'); emailEl.classList.remove('is-invalid');
    statusSel.value = STATUS.ACTIVE;
    emailVerifiedEl.checked = false;
    mfaEl.checked = false;
    fillDeptSelect(''); selUnit.innerHTML = `<option value="">— ជ្រើសផ្នែក —</option>`;
    mdl?.show();
  });

  // dep -> units
  selDept?.addEventListener('change', async (e)=>{
    await fillUnitSelect(String(e.target.value||''), '');
  });

  // Action buttons
  root.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act==='reset'){
      const email = btn.getAttribute('data-email') || '';
      if (!email){ alert('គ្មានអ៊ីមែល'); return; }
      if (!confirm(`ផ្ញើ Reset password ទៅ ${email} ?`)) return;
      try{
        await doResetPassword(email);
        setStatus('បានផ្ញើសារកំណត់ពាក្យសម្ងាត់ឡើងវិញ', true);
        await logAudit('users.reset_password', email, {});
      }catch(err){
        console.error(err); setStatus('បរាជ័យផ្ញើ reset', false);
      }
      return;
    }

    const id = btn.getAttribute('data-id') || '';
    const row = CACHE.users.find(u => String(u.user_id)===String(id));
    if (!row) return;

    if (act==='edit'){
      frm.reset();
      idEl.value = String(row.user_id || '');
      nameEl.value = String(row.full_name || row.user_name || '');
      emailEl.value = String(row.email || '');
      phoneEl.value = String(row.phone || '');
      roleEl.value  = String(row.role || 'viewer').toLowerCase();
      statusSel.value = String(row.status || STATUS.ACTIVE).toLowerCase();
      emailVerifiedEl.checked = !!row.email_verified;
      mfaEl.checked = !!row.mfa_enabled;

      fillDeptSelect(row.department_id || '');
      await fillUnitSelect(row.department_id || '', row.unit_id || '');
      mdl?.show();
      return;
    }

    if (act==='suspend'){
      if (isSelf(row)){ alert('មិនអាចព្យួរខ្លួនឯង'); return; }
      if (!confirm('ព្យួរការប្រើប្រាស់មែនទេ?')) return;
      const payload = { ...row, status: STATUS.SUSPENDED };
      await gasSave('users', payload);
      const i = CACHE.users.findIndex(u=>String(u.user_id)===String(row.user_id));
      if (i>=0) CACHE.users[i] = payload;
      await logAudit('users.suspend', row, {});
      render();
      return;
    }

    if (act==='reactivate'){
      if (!confirm('ដំណើរការឡើងវិញមែនទេ?')) return;
      const payload = { ...row, status: STATUS.ACTIVE };
      await gasSave('users', payload);
      const i = CACHE.users.findIndex(u=>String(u.user_id)===String(row.user_id));
      if (i>=0) CACHE.users[i] = payload;
      await logAudit('users.reactivate', row, {});
      render();
      return;
    }

    if (act==='del'){
      if (isSelf(row)){ alert('មិនអាចលុបខ្លួនឯង'); return; }
      if (String(row.role||'').toLowerCase()==='super'){
        const remain = CACHE.users.filter(u=>String(u.user_id)!==String(row.user_id) && String(u.role||'').toLowerCase()==='super').length;
        if (remain===0){ alert('មិនអាចលុប SUPER ចុងក្រោយ'); return; }
      }
      if (!confirm('លុបមែនទេ?')) return;
      await gasDelete('users', {key:'user_id'}, String(row.user_id));
      CACHE.users = CACHE.users.filter(u=> String(u.user_id)!==String(row.user_id));
      await logAudit('users.delete', row, {});
      render();
      return;
    }
  });

  // Save
  frm.addEventListener('submit', async (e)=>{
    e.preventDefault();

    // validate
    const name = String(nameEl.value||'').trim();
    const email= emailNorm(emailEl.value||'');
    if (!name){ nameEl.classList.add('is-invalid'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ emailEl.classList.add('is-invalid'); return; }
    nameEl.classList.remove('is-invalid'); emailEl.classList.remove('is-invalid');

    const uid   = String(idEl.value||'');
    const role  = String(roleEl.value||'viewer').toLowerCase();
    const status= String(statusSel.value||STATUS.ACTIVE).toLowerCase();

    // unique email
    const dup = CACHE.users.find(u => String(u.user_id)!==uid && emailNorm(u.email)===email);
    if (dup){ alert('អ៊ីមែលនេះត្រូវបានប្រើរួច'); return; }

    // last SUPER guard
    const existing = CACHE.users.find(u => String(u.user_id)===uid);
    if (existing && isLastSuperDemotion(existing, role)){
      alert('មិនអាចប្ដូរ SUPER ចុងក្រោយទៅ role ផ្សេងបានទេ'); return;
    }
    if (existing && isSelf(existing) && String(existing.role).toLowerCase()==='super' && role!=='super'){
      alert('មិនអាចប្ដូរ role ខ្លួនឯងចុះក្រោមពី SUPER'); return;
    }

    const payload = {
      user_id: uid || (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : ('u-'+Math.random().toString(36).slice(2,10))),
      full_name: name,
      email,
      phone: String(phoneEl.value||'').trim(),
      role,
      status,
      department_id: String(selDept.value||''),
      unit_id: String(selUnit.value||''),
      email_verified: !!emailVerifiedEl.checked,
      mfa_enabled: !!mfaEl.checked,
    };

    const old = btnSave.innerHTML;
    btnSave.disabled = true; btnSave.innerHTML='កំពុងរក្សាទុក…';
    try{
      const saved = await gasSave('users', payload);
      const i = CACHE.users.findIndex(u => String(u.user_id)===String(saved.user_id));
      if (i>=0) CACHE.users[i] = saved; else CACHE.users.push(saved);
      await logAudit(existing ? 'users.update':'users.create', saved, {});
      mdl?.hide();
      render();
    }catch(err){
      console.error('[users] save failed', err);
      alert('បរាជ័យរក្សាទុក');
    }finally{
      btnSave.disabled=false; btnSave.innerHTML=old;
    }
  });

  async function doResetPassword(email){
    // សម្រាប់ project ដែលភ្ជាប់ Firebase Client SDK:
    // const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
    // await sendPasswordResetEmail(getAuth(), email);
    // នៅទីនេះ យើងទុកជា placeholder ហើយសម្រួលជាមួយ backend/cloud function បើមាន
    return Promise.resolve();
  }
}

/* =============================== Public entry =============================== */
export default async function hydrate(root){
  await initUsers(root);
}
