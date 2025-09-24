// assets/js/pages/departments.page.js
import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasSave, gasDelete, ID_FIELDS } from '../app.menu.js';

export async function initDepartmentsPage(root = document) {
  console.log('✅ initDepartmentsPage');

  // ---- element lookup (support old/new markup) ----
  const tbl   = root.querySelector('#tblDepartments') || root.querySelector('table');
  const tbody = (tbl && (tbl.querySelector('tbody') || root.querySelector('#tbody'))) || root.querySelector('#tbody');
  const btnAdd    = root.querySelector('#btnAdd');
  const txtSearch = root.querySelector('#txtSearch');
  const statusEl  = root.querySelector('#statusLine') || root.querySelector('#status');

  const setStatus = (m)=> { if (statusEl) statusEl.textContent = m || ''; };

  if (!tbl || !tbody) {
    console.warn('[departments] table/tbody not found in page');
    setStatus('រកមិនឃើញតារាងក្នុងទំព័រ');
    return;
  }

  // skeleton row
  tbody.innerHTML = '<tr><td colspan="3" class="skel"></td></tr>'.repeat(3);

  const auth  = getAuth();
  const SUPER = isSuper(auth);
  let CACHE   = { rows: [] };
  let FILTER_Q = '';

  async function load() {
    try{
      setStatus('កំពុងផ្ទុកទិន្នន័យ…');
      let rows = await gasList('departments');
      // scope non-super
      if (!SUPER && auth?.department_id) {
        rows = rows.filter(d => String(d.department_id) === String(auth.department_id));
      }
      CACHE.rows = rows;
      render();
      setStatus(`បានផ្ទុក ${rows.length} ការិយាល័យ`);
    }catch(e){
      console.error('[departments] load failed:', e);
      setStatus('បរាជ័យផ្ទុកទិន្នន័យ');
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-4">${e?.message||e}</td></tr>`;
    }
  }

  function render() {
    const rows = CACHE.rows.filter(r =>
      !FILTER_Q || JSON.stringify(r).toLowerCase().includes(FILTER_Q)
    );
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const d of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width:90px">${d.department_id}</td>
        <td>${d.department_name || ''}</td>
        <td class="td-actions" style="text-align:right;width:160px">
          <button class="btn btn-sm btn-warning" data-act="edit" data-id="${d.department_id}">កែ</button>
          <button class="btn btn-sm btn-danger"  data-act="del"  data-id="${d.department_id}">លុប</button>
        </td>`;
      frag.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(frag);
  }

  // search
  txtSearch?.addEventListener('input', (e)=>{
    FILTER_Q = String(e.target.value||'').trim().toLowerCase();
    render();
  });

  // add
  btnAdd?.addEventListener('click', async ()=>{
    const name = prompt('ឈ្មោះការិយាល័យ:');
    if (!name) return;
    await saveDepartment({ department_name: name.trim() });
  });

  // delegate actions
  tbody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id  = btn.getAttribute('data-id');
    const row = CACHE.rows.find(x => String(x.department_id) === String(id));
    if (!row) return;

    if (btn.dataset.act === 'del') {
      if (!confirm('លុបមែនទេ?')) return;
      await gasDelete('departments', ID_FIELDS.departments, row.department_id);
      CACHE.rows = CACHE.rows.filter(x => String(x.department_id) !== String(id));
      render(); setStatus('លុបរួចរាល់');
    }
    if (btn.dataset.act === 'edit') {
      const name = prompt('កែឈ្មោះការិយាល័យ:', row.department_name || '');
      if (!name) return;
      await saveDepartment({ department_id: row.department_id, department_name: name.trim() });
    }
  });

  async function saveDepartment(payload){
    setStatus('កំពុងរក្សាទុក…');
    const saved = await gasSave('departments', payload);
    const row   = saved.row || saved;
    const i     = CACHE.rows.findIndex(x => String(x.department_id) === String(row.department_id));
    if (i>=0) CACHE.rows[i] = row; else CACHE.rows.push(row);
    render(); setStatus('រក្សាទុករួចរាល់');
  }

  await load();
}
