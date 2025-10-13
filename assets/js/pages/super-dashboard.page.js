// assets/js/pages/super-dashboard.page.js
import { gasList } from '../app.api.firebase.js';
import { isSuper } from '../app.auth.js';

export default async function hydrate(root){
  // Prevent double init
  if (root.__super_collator_inited) return;
  root.__super_collator_inited = true;

  // Render base shell first (avoid null refs)
  root.innerHTML = `
  <div class="settings-page">
    <div class="container-page">
      <div class="page-head">
        <div class="d-flex align-items-center gap-2">
          <h1 class="kh-head h4 m-0">SUPER Data Collator</h1>
          <nav aria-label="breadcrumb" class="small">
            <ol class="breadcrumb m-0">
              <li class="breadcrumb-item"><a href="#/">Dashboard</a></li>
              <li class="breadcrumb-item active" aria-current="page">Super</li>
            </ol>
          </nav>
        </div>
        <div class="separator-breadcrumb border-top"></div>
      </div>

      <div id="superOnly" class="alert alert-warning d-none">
        <strong>សកម្មភាពនេះសម្រាប់ SUPER ប៉ុណ្ណោះ</strong>
      </div>

      <div class="page-body">
        <div class="card shadow-sm centered-card w-100">
          <div class="card-body">
            <!-- Toolbar -->
            <div class="toolbar mb-3 d-flex align-items-center gap-2 flex-wrap">
              <div class="row gx-2 gy-2 w-100">
                <div class="col-6 col-md-3 col-lg-2">
                  <label class="form-label small m-0">Entity</label>
                  <select id="entitySel" class="form-select form-select-sm">
                    <option value="reports">Reports</option>
                    <option value="actions">Actions</option>
                    <option value="indicators">Indicators</option>
                    <option value="users">Users</option>
                  </select>
                </div>
                <div class="col-6 col-md-3 col-lg-2">
                  <label class="form-label small m-0">Mode</label>
                  <select id="modeSel" class="form-select form-select-sm">
                    <option value="M">Monthly</option>
                    <option value="Q">Quarterly</option>
                    <option value="H">Half-year</option>
                    <option value="N9">N9</option>
                    <option value="Y12">Yearly</option>
                  </select>
                </div>
                <div class="col-6 col-md-2 col-lg-2">
                  <label class="form-label small m-0">Year</label>
                  <select id="yearSel" class="form-select form-select-sm"></select>
                </div>
                <div class="col-6 col-md-2 col-lg-2">
                  <label class="form-label small m-0">Tag</label>
                  <select id="tagSel" class="form-select form-select-sm"></select>
                </div>
                <div class="col-6 col-md-2 col-lg-2">
                  <label class="form-label small m-0">Department</label>
                  <select id="deptSel" class="form-select form-select-sm">
                    <option value="">ជំពូក—ទាំងអស់</option>
                  </select>
                </div>
                <div class="col-6 col-md-2 col-lg-2">
                  <label class="form-label small m-0">Unit</label>
                  <select id="unitSel" class="form-select form-select-sm">
                    <option value="">ផ្នែក—ទាំងអស់</option>
                  </select>
                </div>

                <div class="col-12 col-lg-6">
                  <label class="form-label small m-0">Group by</label>
                  <div class="d-flex gap-2">
                    <select id="groupSel" class="form-select form-select-sm">
                      <option value="">(None)</option>
                      <option value="department_name">Department</option>
                      <option value="unit_name">Unit</option>
                      <option value="indicator_name">Indicator</option>
                      <option value="owner_name">Owner</option>
                      <option value="role">Role (Users)</option>
                      <option value="status">Status (Users)</option>
                    </select>
                    <select id="groupSel2" class="form-select form-select-sm">
                      <option value="">(None)</option>
                      <option value="department_name">Department</option>
                      <option value="unit_name">Unit</option>
                      <option value="indicator_name">Indicator</option>
                      <option value="owner_name">Owner</option>
                      <option value="role">Role (Users)</option>
                      <option value="status">Status (Users)</option>
                    </select>
                    <select id="metricSel" class="form-select form-select-sm" style="max-width:120px">
                      <option value="count">COUNT</option>
                      <option value="sum">SUM</option>
                      <option value="avg">AVG</option>
                      <option value="min">MIN</option>
                      <option value="max">MAX</option>
                    </select>
                  </div>
                </div>

                <div class="col-12 col-lg-6">
                  <label class="form-label small m-0">ស្វែងរក</label>
                  <div class="input-group input-group-sm">
                    <input id="txtQ" class="form-control" placeholder="ស្វែងរក... (Enter)">
                    <button id="btnRun" class="btn btn-outline-secondary">រត់</button>
                    <button id="btnCSV" class="btn btn-primary"><i class="i-Download"></i> CSV</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Table -->
            <div class="table-responsive">
              <table class="table table-striped table-hover align-middle mb-0">
                <thead><tr id="dataHead"></tr></thead>
                <tbody id="dataBody">
                  <tr><td class="skel" colspan="8"></td></tr>
                  <tr><td class="skel" colspan="8"></td></tr>
                </tbody>
              </table>
            </div>

            <!-- Pager -->
            <div class="d-flex align-items-center gap-2 mt-2">
              <select id="pageSizeSel" class="form-select form-select-sm" style="width:auto">
                <option>10</option><option>20</option><option>50</option>
              </select>
              <div id="pager" class="ms-auto"></div>
            </div>

            <div class="small text-muted mt-2" id="statusLine"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <style>
    .centered-card{max-width:1200px; border:1px solid #eef0f4; border-radius:14px;}
    .skel{position:relative; overflow:hidden; background:#f3f4f6; height:44px;}
    .skel::after{content:""; position:absolute; inset:0; transform:translateX(-100%);
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);
      animation:shimmer 1.1s infinite}
    @keyframes shimmer{100%{transform:translateX(100%)}}
    .toolbar .form-label{opacity:.75}
  </style>
  `;

  const SUPER = isSuper();
  const $  = s => root.querySelector(s);

  const warnEl    = $('#superOnly');
  if (!SUPER){
    warnEl?.classList.remove('d-none');
    return; // stop here if not SUPER
  } else { warnEl?.classList.add('d-none'); }

  // ---- DOM refs
  const entitySel = $('#entitySel');
  const modeSel   = $('#modeSel');
  const yearSel   = $('#yearSel');
  const tagSel    = $('#tagSel');
  const deptSel   = $('#deptSel');
  const unitSel   = $('#unitSel');
  const txtQ      = $('#txtQ');
  const btnRun    = $('#btnRun');
  const btnCSV    = $('#btnCSV');
  const groupSel  = $('#groupSel');
  const groupSel2 = $('#groupSel2');
  const metricSel = $('#metricSel');
  const dataHead  = $('#dataHead');
  const dataBody  = $('#dataBody');
  const pageSizeSel = $('#pageSizeSel');
  const pager       = $('#pager');
  const statusLine  = $('#statusLine');

  // ---- State
  let MODE = 'M';
  let RAW = { reports:[], actions:[], indicators:[], users:[], departments:[], units:[] };
  let VIEW = [];
  let PAGE = 1, PAGE_SIZE = toInt(pageSizeSel?.value, 10);

  // ---- Utils
  function toInt(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&gt;','>':'&gt;','"':'&quot;'}[m] || m));
  function normPeriod(obj={}){
    let {year, tag, month, period_id} = obj;
    if (typeof year === 'string' && /^\d{4}$/.test(year)) year=parseInt(year,10);
    const pid = String(period_id||'').trim();
    if (/^\d{4}-\d{2}$/.test(pid)){ return {year: parseInt(pid.slice(0,4),10), tag:'M'+pid.slice(5,7), pid}; }
    return {year, tag:String(tag||month||'').toUpperCase(), pid:''};
  }

  // ---- Load data
  const [departments, units, indicators, users, reports, actions] = await Promise.all([
    gasList('departments').catch(()=>[]),
    gasList('units').catch(()=>[]),
    gasList('indicators').catch(()=>[]),
    gasList('users').catch(()=>[]),
    gasList('reports').catch(()=>[]),
    gasList('actions').catch(()=>[]),
  ]);
  RAW = { reports, actions, indicators, users, departments, units };

  const deptName = Object.fromEntries(departments.map(d=>[String(d.department_id), d.department_name]));
  const unitMeta = new Map(units.map(u=>[String(u.unit_id), {name:u.unit_name, dept:String(u.department_id||'') }]));
  const ownerNameByUid = Object.fromEntries(users.map(u=>[String(u.auth_uid||u.user_id||u.id||''), (u.full_name||u.user_name||u.email||'')]));

  // ---- Populate selects
  function buildYears(){
    if (!yearSel) return;
    const years = new Set();
    reports.forEach(r=>{ const {year} = normPeriod(r); if (year) years.add(year); });
    actions.forEach(a=>{ const {year} = normPeriod(a); if (year) years.add(year); });
    const list = [...years].sort((a,b)=>b-a);
    if (!list.length) list.push(new Date().getFullYear());
    yearSel.innerHTML = list.map(y=>`<option>${y}</option>`).join('');
    yearSel.value = list[0];
  }
  function buildTags(){
    if (!tagSel) return;
    const opts = ['<option value="@last">ចុងក្រោយ</option>'];
    if (MODE==='M'){ for(let m=1;m<=12;m++) { const mm=String(m).padStart(2,'0'); opts.push(`<option value="M${mm}">M${mm}</option>`); } }
    else if (MODE==='Q'){ opts.push('<option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option>'); }
    else if (MODE==='H'){ opts.push('<option>H1</option><option>H2</option>'); }
    else if (MODE==='N9'){ opts.push('<option>N9</option>'); }
    else if (MODE==='Y12'){ opts.push('<option>Y12</option>'); }
    tagSel.innerHTML = opts.join(''); tagSel.value='@last';
  }
  function buildDeps(){
    if (!deptSel) return;
    deptSel.innerHTML = `<option value="">ជំពូក—ទាំងអស់</option>` +
      departments.map(d=>`<option value="${d.department_id}">${d.department_name}</option>`).join('');
  }
  function buildUnits(depId=''){
    if (!unitSel) return;
    const list = depId ? units.filter(u=>String(u.department_id)===String(depId)) : units;
    unitSel.innerHTML = `<option value="">ផ្នែក—ទាំងអស់</option>` +
      list.map(u=>`<option value="${u.unit_id}">${u.unit_name}</option>`).join('');
  }
  buildYears(); buildTags(); buildDeps(); buildUnits('');

  // ---- Helpers
  function latestByIndicator(indId){
    const rows = reports.filter(r=>String(r.indicator_id)===String(indId))
      .map(r=>({ ...r, ...normPeriod(r) }))
      .filter(r=>r.year && r.tag);
    rows.sort((a,b)=>{
      if (a.pid && b.pid) return a.pid < b.pid ? 1:-1;
      if (a.year!==b.year) return b.year - a.year;
      return b.tag.localeCompare(a.tag, 'en', {numeric:true});
    });
    return rows[0];
  }

  function buildRows(){
    const entity = entitySel.value;
    const y = Number(yearSel?.value||0);
    const tag = String(tagSel?.value||'').toUpperCase();
    const depId = String(deptSel?.value||'');
    const unitId= String(unitSel?.value||'');
    const q = String(txtQ?.value||'').trim().toLowerCase();

    let rows = [];

    if (entity==='reports'){
      rows = reports.map(r=>{
        const p = normPeriod(r);
        const ind = indicators.find(i=>String(i.indicator_id)===String(r.indicator_id)) || {};
        const u   = unitMeta.get(String(ind.unit_id||'')) || {};
        const did = String(ind.department_id || u.dept || '');
        const vt = (tag==='@last') ? (latestByIndicator(String(r.indicator_id)) || r) : r;
        const pick = (tag==='@last') ? normPeriod(vt) : p;
        return {
          type:'report',
          indicator_id: String(ind.indicator_id||r.indicator_id||''),
          indicator_name: ind.indicator_name||'',
          value: Number(vt.value ?? r.value ?? NaN),
          target: Number(vt.target ?? r.target ?? NaN),
          year: pick.year, tag: pick.tag,
          department_id: did, department_name: deptName[did] || '',
          unit_id: String(ind.unit_id||''), unit_name: u.name || '',
          owner_uid: String(ind.owner_uid||''), owner_name: ownerNameByUid[String(ind.owner_uid||'')] || '',
        };
      }).filter(x=>{
        if (depId && String(x.department_id)!==depId) return false;
        if (unitId && String(x.unit_id)!==unitId) return false;
        if (tag!=='@last'){ if (x.year!==y || x.tag!==tag) return false; }
        if (!q) return true;
        const blob = `${x.indicator_name} ${x.department_name} ${x.unit_name} ${x.owner_name}`.toLowerCase();
        return blob.includes(q);
      });
    }

    if (entity==='actions'){
      rows = actions.map(a=>{
        const p = normPeriod(a);
        const ind = indicators.find(i=>String(i.indicator_id)===String(a.indicator_id)) || {};
        const u   = unitMeta.get(String(ind.unit_id||'')) || {};
        const did = String(ind.department_id || u.dept || '');
        return {
          type:'action',
          indicator_id: String(ind.indicator_id||a.indicator_id||''),
          indicator_name: ind.indicator_name||'',
          issues: a.issue_text||'',
          actions: a.action_text||'',
          year: p.year, tag: p.tag,
          department_id: did, department_name: deptName[did] || '',
          unit_id: String(ind.unit_id||''), unit_name: u.name || '',
          owner_uid: String(ind.owner_uid||''), owner_name: ownerNameByUid[String(ind.owner_uid||'')] || '',
        };
      }).filter(x=>{
        if (depId && String(x.department_id)!==depId) return false;
        if (unitId && String(x.unit_id)!==unitId) return false;
        if (tag!=='@last'){ if (x.year!==y || x.tag!==tag) return false; }
        if (!q) return true;
        const blob = `${x.indicator_name} ${x.department_name} ${x.unit_name} ${x.issues} ${x.actions}`.toLowerCase();
        return blob.includes(q);
      });
    }

    if (entity==='indicators'){
      rows = indicators.map(ind=>{
        const u   = unitMeta.get(String(ind.unit_id||'')) || {};
        const did = String(ind.department_id || u.dept || '');
        const latest = latestByIndicator(String(ind.indicator_id));
        const lp = normPeriod(latest||{});
        return {
          type:'indicator',
          indicator_id: String(ind.indicator_id||''),
          indicator_name: ind.indicator_name||'',
          year: lp.year||'', tag: lp.tag||'',
          value: Number(latest?.value ?? NaN), target: Number(latest?.target ?? NaN),
          department_id: did, department_name: deptName[did] || '',
          unit_id: String(ind.unit_id||''), unit_name: u.name || '',
          owner_uid: String(ind.owner_uid||''), owner_name: ownerNameByUid[String(ind.owner_uid||'')] || '',
        };
      }).filter(x=>{
        if (depId && String(x.department_id)!==depId) return false;
        if (unitId && String(x.unit_id)!==unitId) return false;
        if (!q) return true;
        const blob = `${x.indicator_name} ${x.department_name} ${x.unit_name} ${x.owner_name}`.toLowerCase();
        return blob.includes(q);
      });
    }

    if (entity==='users'){
      rows = users.map(u=>{
        const uMeta = unitMeta.get(String(u.unit_id||'')) || {};
        const did = String(u.department_id || uMeta.dept || '');
        return {
          type:'user',
          user_id: String(u.user_id||u.id||''),
          full_name: u.full_name || u.user_name || '',
          email: String(u.email||'').toLowerCase(),
          role: String(u.role||'viewer').toLowerCase(),
          status: String(u.status||'active').toLowerCase(),
          department_id: did, department_name: deptName[did] || '',
          unit_id: String(u.unit_id||''), unit_name: uMeta.name || '',
        };
      }).filter(x=>{
        if (depId && String(x.department_id)!==depId) return false;
        if (unitId && String(x.unit_id)!==unitId) return false;
        if (!q) return true;
        const blob = `${x.full_name} ${x.email} ${x.role} ${x.status} ${x.department_name} ${x.unit_name}`.toLowerCase();
        return blob.includes(q);
      });
    }

    VIEW = rows;
  }

  function titleOf(k){
    const dict = {
      department_name:'Department',
      unit_name:'Unit',
      indicator_name:'Indicator',
      owner_name:'Owner',
      role:'Role',
      status:'Status',
      metric:'Metric',
      count:'Count'
    };
    return dict[k] || k;
  }

  function inferColumns(entity){
    if (entity==='reports'){
      return [
        {key:'indicator_id',label:'ID',w:'90px'},
        {key:'indicator_name',label:'Indicator'},
        {key:'department_name',label:'Department'},
        {key:'unit_name',label:'Unit'},
        {key:'owner_name',label:'Owner',w:'160px'},
        {key:'year',label:'Year',w:'80px'},
        {key:'tag',label:'Tag',w:'80px'},
        {key:'value',label:'Value',w:'100px'},
        {key:'target',label:'Target',w:'100px'},
      ];
    }
    if (entity==='actions'){
      return [
        {key:'indicator_id',label:'ID',w:'90px'},
        {key:'indicator_name',label:'Indicator'},
        {key:'department_name',label:'Department'},
        {key:'unit_name',label:'Unit'},
        {key:'issues',label:'Issues'},
        {key:'actions',label:'Actions'},
        {key:'year',label:'Year',w:'80px'},
        {key:'tag',label:'Tag',w:'80px'},
      ];
    }
    if (entity==='indicators'){
      return [
        {key:'indicator_id',label:'ID',w:'90px'},
        {key:'indicator_name',label:'Indicator'},
        {key:'department_name',label:'Department'},
        {key:'unit_name',label:'Unit'},
        {key:'owner_name',label:'Owner',w:'160px'},
        {key:'year',label:'Last Year',w:'100px'},
        {key:'tag',label:'Last Tag',w:'90px'},
        {key:'value',label:'Last Value',w:'100px'},
        {key:'target',label:'Last Target',w:'100px'},
      ];
    }
    return [
      {key:'user_id',label:'ID',w:'90px'},
      {key:'full_name',label:'Full name'},
      {key:'email',label:'Email',w:'220px'},
      {key:'role',label:'Role',w:'90px'},
      {key:'status',label:'Status',w:'110px'},
      {key:'department_name',label:'Department'},
      {key:'unit_name',label:'Unit'},
    ];
  }

  function aggregate(rows){
    const g1 = String(groupSel?.value||'');
    const g2 = String(groupSel2?.value||'');
    const metric = String(metricSel?.value||'count');
    const entity = entitySel?.value;

    if (!g1){
      return { columns: inferColumns(entity), rows };
    }

    const pickNum = (r)=> Number.isFinite(r.value) ? r.value
                       : Number.isFinite(r.target) ? r.target : NaN;

    const key = (r)=> g2 ? `${r[g1]||''}|${r[g2]||''}` : `${r[g1]||''}`;
    const map = new Map();

    for (const r of rows){
      const k = key(r);
      let acc = map.get(k);
      if (!acc){
        acc = { __k1: r[g1]||'', __k2: g2 ? (r[g2]||'') : '', count:0, sum:0, min:Infinity, max:-Infinity };
        map.set(k, acc);
      }
      acc.count++;
      const v = pickNum(r);
      if (Number.isFinite(v)){
        acc.sum += v;
        acc.min = Math.min(acc.min, v);
        acc.max = Math.max(acc.max, v);
      }
    }

    const out = [];
    for (const [,a] of map.entries()){
      const avg = a.count ? (a.sum/a.count) : NaN;
      let metricValue = a.count;
      if (metric==='sum') metricValue = a.sum;
      if (metric==='avg') metricValue = avg;
      if (metric==='min') metricValue = Number.isFinite(a.min)?a.min:'';
      if (metric==='max') metricValue = Number.isFinite(a.max)?a.max:'';
      out.push({
        [g1]: a.__k1,
        ...(g2 ? { [g2]: a.__k2 } : {}),
        metric: metricValue,
        count: a.count,
      });
    }

    const cols = g2
      ? [{key:g1,label:titleOf(g1)}, {key:g2,label:titleOf(g2)}, {key:'metric',label:metric.toUpperCase()}, {key:'count',label:'COUNT'}]
      : [{key:g1,label:titleOf(g1)}, {key:'metric',label:metric.toUpperCase()}, {key:'count',label:'COUNT'}];

    return { columns: cols, rows: out };
  }

  function formatCell(_key, v){
    if (typeof v==='number' && Number.isFinite(v)) return String(v);
    return esc(String(v ?? ''));
  }

  function renderTable(columns, rows){
    if (!dataHead || !dataBody) return;
    dataHead.innerHTML = columns.map(c=>`<th ${c.w?`style="width:${c.w}"`:''}>${esc(c.label)}</th>`).join('');

    PAGE_SIZE = toInt(pageSizeSel?.value, PAGE_SIZE||10);
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total/(PAGE_SIZE||10)));
    PAGE = Math.min(Math.max(1,PAGE), pages);
    const slice = rows.slice((PAGE-1)*PAGE_SIZE, (PAGE-1)*PAGE_SIZE + PAGE_SIZE);

    if (!slice.length){
      dataBody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
    }else{
      const frag = document.createDocumentFragment();
      for (const r of slice){
        const tr = document.createElement('tr');
        tr.innerHTML = columns.map(c=>`<td>${formatCell(c.key, r[c.key])}</td>`).join('');
        frag.appendChild(tr);
      }
      dataBody.innerHTML=''; dataBody.appendChild(frag);
    }

    pager.innerHTML = `
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <div class="small text-muted">សរុប ${total}</div>
        <div class="ms-auto d-flex align-items-center gap-2">
          <button class="btn btn-sm btn-outline-secondary" data-goto="first" ${PAGE<=1?'disabled':''}>&laquo;</button>
          <button class="btn btn-sm btn-outline-secondary" data-goto="prev"  ${PAGE<=1?'disabled':''}>&lsaquo;</button>
          <span class="small">ទំព័រ ${PAGE}/${pages}</span>
          <button class="btn btn-sm btn-outline-secondary" data-goto="next"  ${PAGE>=pages?'disabled':''}>&rsaquo;</button>
          <button class="btn btn-sm btn-outline-secondary" data-goto="last"  ${PAGE>=pages?'disabled':''}>&raquo;</button>
        </div>
      </div>`;

    if (statusLine){
      const gtxt = groupSel.value || '(None)';
      const g2txt= groupSel2.value ? ` → ${groupSel2.value}` : '';
      statusLine.textContent = `Entity: ${entitySel.value} • Group: ${gtxt}${g2txt} • Metric: ${metricSel.value} • Rows: ${total}`;
    }
  }

  function exportCSV(columns, rows){
    const header = columns.map(c=>`"${c.label.replace(/"/g,'""')}"`).join(',');
    const lines = rows.map(r => columns.map(c=>{
      const val = r[c.key];
      const s = (val==null) ? '' : String(val);
      return `"${s.replace(/"/g,'""')}"`;
    }).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `collate_${entitySel.value}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function run(){
    buildRows();
    const { columns, rows } = aggregate(VIEW);
    renderTable(columns, rows);
    return { columns, rows };
  }

  // ---- Events
  modeSel   ?.addEventListener('change', ()=>{ MODE = String(modeSel.value||'M'); buildTags(); run(); });
  yearSel   ?.addEventListener('change', run);
  tagSel    ?.addEventListener('change', run);
  deptSel   ?.addEventListener('change', e=>{ buildUnits(String(e.target.value||'')); run(); });
  unitSel   ?.addEventListener('change', run);
  entitySel ?.addEventListener('change', run);
  groupSel  ?.addEventListener('change', run);
  groupSel2 ?.addEventListener('change', run);
  metricSel ?.addEventListener('change', run);
  txtQ      ?.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); });
  btnRun    ?.addEventListener('click', run);
  pageSizeSel?.addEventListener('change', ()=>{ PAGE=1; run(); });
  pager     ?.addEventListener('click', e=>{
    const b=e.target.closest('button[data-goto]'); if(!b||b.disabled) return;
    const a=b.getAttribute('data-goto');
    if (a==='first') PAGE=1;
    else if (a==='prev') PAGE=Math.max(1,PAGE-1);
    else if (a==='next') PAGE=PAGE+1;
    else if (a==='last') PAGE=999999;
    const { columns, rows } = aggregate(VIEW);
    renderTable(columns, rows);
  });
  btnCSV    ?.addEventListener('click', ()=>{
    const { columns, rows } = aggregate(VIEW);
    exportCSV(columns, rows);
  });

  // ---- First paint
  run();
}

export function getTitle(){ return 'SUPER Data Collator | PHD Report'; }
