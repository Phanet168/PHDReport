// assets/js/pages/data-entry.js
import { gasList, gasSave } from '/PHDReport/assets/js/app.api.js';
import { getAuth }          from '/PHDReport/assets/js/app.auth.js';

// ===== mini helpers =====
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const pad2 = n => String(n).padStart(2,'0');
const todayYM = () => {
  const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
};
const setStatus = (t) => { const el = $('#status'); if (el) el.textContent = t||''; };

(async function init(){
  // elements
  const period = $('#period');
  const q      = $('#q');
  const selDept= $('#selDept');
  const selUnit= $('#selUnit');
  const onlyMine = $('#onlyMine');
  const tbody  = $('#grid tbody');
  const btnSave= $('#btnSave');
  const btnCopyPrev = $('#btnCopyPrev');

  // defaults
  if (period && !period.value) period.value = todayYM();

  // state
  let IND = [];     // indicators
  let DEPTS = [];   // departments
  let UNITS = [];   // units
  let MAP_REPORT = new Map(); // key `${indId}` -> existing report row for selected month
  const CHANGES = new Map();  // indId -> payload changed

  const auth = getAuth() || {};
  const isSuper = String(auth?.role||'').toLowerCase()==='super';

  // skeleton
  tbody.innerHTML = `<tr><td colspan="8" class="skel"></td></tr>
                     <tr><td colspan="8" class="skel"></td></tr>
                     <tr><td colspan="8" class="skel"></td></tr>`;

  // load options
  [DEPTS, UNITS] = await Promise.all([
    gasList('departments').catch(()=>[]),
    gasList('units').catch(()=>[]),
  ]);

  // dept select
  selDept.innerHTML = `<option value="">ការិយាល័យទាំងអស់</option>` +
    DEPTS.map(d=>`<option value="${d.department_id}">${d.department_name}</option>`).join('');
  // unit select (depends on dept)
  const rebuildUnits = () => {
    const dep = selDept.value;
    const list = dep ? UNITS.filter(u=>String(u.department_id)===String(dep)) : UNITS;
    selUnit.innerHTML = `<option value="">ផ្នែកទាំងអស់</option>` +
      list.map(u=>`<option value="${u.unit_id}">${u.unit_name}</option>`).join('');
  };
  rebuildUnits();

  // restrict non-super to own scope
  if (!isSuper){
    if (auth?.department_id) selDept.value = auth.department_id;
    rebuildUnits();
    if (auth?.unit_id) selUnit.value = auth.unit_id;
    selDept.disabled = true; selUnit.disabled = true; onlyMine.checked = true;
  }

  // main load
  await loadMonth();

  // events
  period.addEventListener('change', loadMonth);
  selDept.addEventListener('change', ()=>{ rebuildUnits(); render(); });
  selUnit.addEventListener('change', render);
  onlyMine.addEventListener('change', render);
  q.addEventListener('input', ()=>{ render(); });
  btnCopyPrev.addEventListener('click', copyPrevToBlanks);
  btnSave.addEventListener('click', saveAll);
  document.addEventListener('keydown', (e)=>{
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); saveAll(); }
  });

  // ===== loaders & render =====
  async function loadMonth(){
    CHANGES.clear();
    setStatus('កំពុងផ្ទុក…');
    const [yy,mm] = (period.value || todayYM()).split('-').map(Number);

    [IND] = await Promise.all([
      gasList('indicators').catch(()=>[])
    ]);

    // filter by scope for non-super
    if (!isSuper && auth?.department_id){
      IND = IND.filter(r=>String(r.department_id)===String(auth.department_id)
                        && (!auth?.unit_id || String(r.unit_id||'')===String(auth.unit_id)));
    }

    // fetch existing reports for the month and map by indicator_id
    const reports = await gasList('reports', { year: yy, month: mm }).catch(()=>[]);
    MAP_REPORT = new Map(reports.map(r=>[String(r.indicator_id), r]));

    render();
    setStatus(`បានផ្ទុកសូចនាករ ${IND.length} មុខ`);
  }

  function applyFilters(rows){
    const dep = selDept.value, unit = selUnit.value, query = q.value.trim().toLowerCase();
    let out = rows;
    if (dep)  out = out.filter(r=>String(r.department_id)===String(dep));
    if (onlyMine.checked && auth?.unit_id) out = out.filter(r=>String(r.unit_id||'')===String(auth.unit_id));
    if (unit) out = out.filter(r=>String(r.unit_id||'')===String(unit));
    if (query) out = out.filter(r => (r.indicator_name||'').toLowerCase().includes(query));
    return out;
  }

  function render(){
    const [yy,mm] = (period.value || todayYM()).split('-').map(Number);
    const deps = Object.fromEntries(DEPTS.map(d=>[String(d.department_id), d.department_name]));
    const units= Object.fromEntries(UNITS.map(u=>[String(u.unit_id), u.unit_name]));

    const list = applyFilters(IND);
    if (!list.length){ tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`; return; }

    const frag = document.createDocumentFragment();
    for (const ind of list){
      const rep = CHANGES.get(String(ind.indicator_id)) || MAP_REPORT.get(String(ind.indicator_id)) || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ind.indicator_id}</td>
        <td>
          <div class="fw-semibold">${ind.indicator_name||''}</div>
          <div class="small text-muted">${deps[String(ind.department_id)]||''} • ${units[String(ind.unit_id)]||''}</div>
        </td>
        <td class="text-end" data-field="value" contenteditable="true">${rep.value ?? ''}</td>
        <td data-field="issue_text" contenteditable="true">${rep.issue_text ?? ''}</td>
        <td data-field="action_text" contenteditable="true">${rep.action_text ?? ''}</td>
        <td>
          <input class="form-control form-control-sm owner" value="${rep.action_owner||''}" placeholder="ឈ្មោះ/ផ្នែក">
        </td>
        <td>
          <input type="date" class="form-control form-control-sm due" value="${rep.action_due||''}">
        </td>
        <td>
          <select class="form-select form-select-sm status">
            ${['pending','doing','done'].map(s=>`<option value="${s}" ${rep.action_status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>`;
      tr.dataset.id = ind.indicator_id;
      frag.appendChild(tr);
    }
    tbody.innerHTML = ''; tbody.appendChild(frag);

    // attach listeners for contenteditable + inputs
    tbody.querySelectorAll('[contenteditable="true"]').forEach(td=>{
      td.addEventListener('input', onEditCell);
      td.addEventListener('focus', ()=>td.classList.add('edit'));
      td.addEventListener('blur', ()=>td.classList.remove('edit'));
    });
    tbody.querySelectorAll('input.owner,input.due,select.status').forEach(el=>{
      el.addEventListener('change', onEditInput);
    });

    function onEditCell(e){
      const td = e.currentTarget;
      const tr = td.closest('tr'); const id = tr.dataset.id;
      const field = td.getAttribute('data-field');
      const payload = currentPayloadForRow(tr);
      payload[field] = td.textContent.trim();
      CHANGES.set(String(id), payload);
    }
    function onEditInput(e){
      const tr = e.currentTarget.closest('tr'); const id = tr.dataset.id;
      const payload = currentPayloadForRow(tr);
      CHANGES.set(String(id), payload);
    }
    function currentPayloadForRow(tr){
      const id = Number(tr.dataset.id);
      const [yy,mm] = period.value.split('-').map(Number);
      const base = MAP_REPORT.get(String(id)) || {};
      const val = tr.querySelector('[data-field="value"]')?.textContent.trim();
      return {
        report_id     : base.report_id || null,
        indicator_id  : id,
        year: yy, month: mm,
        value         : val==='' ? null : Number(val),
        issue_text    : tr.querySelector('[data-field="issue_text"]')?.textContent.trim() || '',
        action_text   : tr.querySelector('[data-field="action_text"]')?.textContent.trim() || '',
        action_owner  : tr.querySelector('input.owner')?.value || '',
        action_due    : tr.querySelector('input.due')?.value || '',
        action_status : tr.querySelector('select.status')?.value || 'pending'
      };
    }
  }

  // ===== copy previous month blanks
  async function copyPrevToBlanks(){
    const [y,m] = period.value.split('-').map(Number);
    const prevY = m===1 ? y-1 : y;
    const prevM = m===1 ? 12 : m-1;
    setStatus('កំពុងយកតម្លៃខែមុន…');

    const prev = await gasList('reports', { year: prevY, month: prevM }).catch(()=>[]);
    const mapPrev = new Map(prev.map(r=>[String(r.indicator_id), r.value]));
    let filled = 0;

    $('#grid tbody').querySelectorAll('tr').forEach(tr=>{
      const id = tr.dataset.id;
      const tdVal = tr.querySelector('[data-field="value"]');
      if (tdVal && !tdVal.textContent.trim() && mapPrev.has(String(id))){
        tdVal.textContent = mapPrev.get(String(id)) ?? '';
        tdVal.classList.add('edit');
        const payload = {
          ...(CHANGES.get(String(id)) || {}),
          indicator_id: Number(id), year:y, month:m,
          value: mapPrev.get(String(id)) ?? null
        };
        CHANGES.set(String(id), payload);
        filled++;
      }
    });
    setStatus(`បានបំពេញពីខែមុន ${filled} ជួរ (មិនរក្សាទុកទេ រហូតដល់ចុច Save All)`);
  }

  // ===== save all
  async function saveAll(){
    if (CHANGES.size===0){ setStatus('គ្មានអ្វីត្រូវរក្សាទុក'); return; }
    btnSave.disabled = true; setStatus('កំពុងរក្សាទុក…');

    let ok=0, fail=0;
    for (const payload of CHANGES.values()){
      try{
        const res = await gasSave('reports', payload); // backend upsert by report_id OR (indicator_id,year,month)
        const row = res.row || res;
        MAP_REPORT.set(String(row.indicator_id), row);
        ok++;
      }catch(e){
        console.error('save failed', e);
        fail++;
      }
    }
    CHANGES.clear();
    btnSave.disabled = false;
    setStatus(`រក្សាទុករួចរាល់: ${ok} ជួរ ${fail?`• បរាជ័យ ${fail}`:''}`);
  }
})();
