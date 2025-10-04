// assets/js/pages/departments.page.js
import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasSave, gasDelete, ID_FIELDS } from '../app.api.firebase.js';

/* ───────────────── Modal helper (uses Bootstrap if present, else fallback) ───────────────── */
function makeModal(id){
  const el = document.getElementById(id);
  if (!el) return null;

  if (window.bootstrap?.Modal){
    let inst = bootstrap.Modal.getInstance ? bootstrap.Modal.getInstance(el) : null;
    if (!inst) inst = new bootstrap.Modal(el, { backdrop:true, keyboard:true, focus:true });
    return { show:()=>inst.show(), hide:()=>inst.hide() };
  }
  // Lightweight fallback (no backdrop)
  return {
    show(){ el.classList.add('show'); el.style.display='block'; document.body.classList.add('modal-open'); },
    hide(){ el.classList.remove('show'); el.style.display='none'; document.body.classList.remove('modal-open'); }
  };
}

/* ───────────────── Page init ───────────────── */
async function initDepartments(root){
  const auth  = getAuth();
  const SUPER = isSuper(auth);
  const modal = makeModal('mdlDept');

  // DOM refs (match your HTML ids)
  const tbl    = root.querySelector('#tblDepts');
  const tbody  = tbl?.querySelector('tbody');
  const btnAdd = root.querySelector('#btnAddDept');
  const frm    = root.querySelector('#frmDept');
  const idEl   = root.querySelector('#department_id');
  const nameEl = root.querySelector('#department_name');
  const txtQ   = root.querySelector('#txtSearchDept');
  const statusEl = root.querySelector('#statusDept');
  const setStatus = (m)=>{ if (statusEl) statusEl.textContent = m || ''; };

  if (!tbl || !tbody || !btnAdd || !frm || !idEl || !nameEl) return;

  // State
  let ROWS = [];
  let FILTER_Q = '';
  let SORT = { key: 'department_id', dir: 1 }; // 1=asc, -1=desc

  // Initial skeleton already in HTML

  // Load data
  try{
    ROWS = await gasList('departments');
    render();
    setStatus(`បានផ្ទុក ${ROWS.length} ជំពូក`);
  }catch(err){
    console.error('[departments] load failed:', err);
    tbody.innerHTML = `<tr><td colspan="3" class="text-danger text-center py-4">បរាជ័យទាញទិន្នន័យ</td></tr>`;
    setStatus('បរាជ័យទាញទិន្នន័យ');
  }

  /* ───────────────── Render ───────────────── */
  function render(){
    let list = ROWS.slice();

    // filter
    if (FILTER_Q){
      const q = FILTER_Q;
      list = list.filter(r =>
        String(r.department_id ?? '').toLowerCase().includes(q) ||
        String(r.department_name ?? '').toLowerCase().includes(q)
      );
    }

    // sort
    const k = SORT.key;
    list.sort((a,b)=>{
      const av = (a?.[k] ?? '').toString().toLowerCase();
      const bv = (b?.[k] ?? '').toString().toLowerCase();
      return av.localeCompare(bv, undefined, {numeric:true}) * SORT.dir;
    });

    if (!list.length){
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const r of list){
      const tr = document.createElement('tr');
      tr.dataset.id = String(r.department_id ?? ''); // keep as string
      tr.innerHTML = `
        <td style="width:110px"><span class="badge text-bg-light border">#${r.department_id}</span></td>
        <td>${r.department_name ?? ''}</td>
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

    // update sort icons
    tbl.querySelectorAll('th.th-sort').forEach(th=>{
      th.classList.remove('asc','desc');
      if (th.dataset.sort === SORT.key) th.classList.add(SORT.dir===1?'asc':'desc');
    });
  }

  /* ───────────────── Events ───────────────── */

  // search
  txtQ?.addEventListener('input', (e)=>{
    FILTER_Q = String(e.target.value || '').trim().toLowerCase();
    render();
  });

  // sort
  tbl.querySelectorAll('th.th-sort').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.sort;
      if (!key) return;
      if (SORT.key === key) SORT.dir *= -1;
      else { SORT.key = key; SORT.dir = 1; }
      render();
    });
  });

  // add
  btnAdd.addEventListener('click', ()=>{
    if (!SUPER) return alert('ត្រូវការ SUPER');
    frm.reset();
    idEl.value   = '';           // empty => create
    nameEl.value = '';
    nameEl.classList.remove('is-invalid');
    modal?.show();
  });

  // row actions
  tbody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (!SUPER) return alert('ត្រូវការ SUPER');

    const id  = btn.closest('tr')?.dataset?.id || '';
    const row = ROWS.find(x => String(x.department_id) === String(id));
    if (!row) return;

    if (btn.dataset.act === 'edit'){
      // Fill form for update (keep id as string!)
      idEl.value   = String(row.department_id ?? '');
      nameEl.value = row.department_name ?? '';
      nameEl.classList.remove('is-invalid');
      modal?.show();
      return;
    }

    if (btn.dataset.act === 'del'){
      if (!confirm('តើចង់លុបធាតុនេះមែនទេ?')) return;
      try{
        await gasDelete('departments', ID_FIELDS.departments, row.department_id);
        ROWS = ROWS.filter(x=> String(x.department_id) !== String(id));
        render();
        setStatus('លុបរួចរាល់');
      }catch(err){
        console.error('[departments] delete failed:', err);
        alert('បរាជ័យលុប: ' + (err?.message || err));
      }
    }
  });

  // save (update vs create fixed)
  frm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (!SUPER) return alert('ត្រូវការ SUPER');

    const name = (nameEl.value || '').trim();
    nameEl.classList.toggle('is-invalid', !name);
    if (!name) return;

    const idVal = String(idEl.value || '').trim(); // keep string to ensure update
    const payload = idVal
      ? { department_id: idVal, department_name: name } // update existing
      : { department_name: name };                      // create new

    const btn = root.querySelector('#btnSaveDept');
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'កំពុងរក្សាទុក…';
    try{
      const res = await gasSave('departments', payload);
      const row = res.row || res;

      // merge cache by string id
      const i = ROWS.findIndex(x => String(x.department_id) === String(row.department_id));
      if (i >= 0) ROWS[i] = row; else ROWS.push(row);

      render();
      modal?.hide();
      setStatus('រក្សាទុករួចរាល់');
    }catch(err){
      console.error('[departments] save failed:', err);
      alert('បរាជ័យរក្សាទុក: ' + (err?.message || err));
    }finally{
      btn.disabled = false; btn.innerHTML = old;
    }
  });
}

/* ───────────────── export for router ───────────────── */
export default async function hydrate(root){
  await initDepartments(root);
}
