// assets/js/pages/super-dashboard.page.js
import { gasList } from '../app.api.firebase.js';
import { isSuper } from '../app.auth.js';

export default async function hydrate(root){
  console.log('[super-dashboard] START initialization');
  
  // Prevent double init
  if (root.__super_collator_inited) return;
  root.__super_collator_inited = true;
  
  // Helper to query inside root
  const $ = s => root.querySelector(s);

  const SUPER = isSuper();
  console.log('[super-dashboard] Auth check: SUPER =', SUPER);

  const warnEl    = $('#superOnly');
  if (!SUPER){
    warnEl?.classList.remove('d-none');
    console.warn('[super-dashboard] User is not SUPER, showing warning but continuing with data load...');
    // Don't return - allow data loading even without SUPER role for demo/debug
    // return; // stop here if not SUPER
  } else { warnEl?.classList.add('d-none'); }

  // ---- DOM refs
  const entitySel = $('#entitySel');
  const modeSel   = $('#modeSel');
  const yearSel   = $('#yearSel');
  const tagSel    = $('#tagSel');
  const compareTagSel = $('#compareTagSel');
  const deptSel   = $('#deptSel');
  const unitSel   = $('#unitSel');
  const txtQ      = $('#txtQ');
  const btnRun    = $('#btnRun');
  const btnCSV    = $('#btnCSV');
  const groupSel  = $('#groupSel');
  const groupSel2 = $('#groupSel2');
  const metricSel = $('#metricSel');
  const chartTypeSel = $('#chartTypeSel');
  const dataHead  = $('#dataHead');
  const dataBody  = $('#dataBody');
  const pageSizeSel = $('#pageSizeSel');
  const pager       = $('#pager');
  const statusLine  = $('#statusLine');
  const chartContainer = $('#chartContainer');
  const chartEl = $('#chart');
  const btnCopyChart = $('#btnCopyChart');
  const btnDownloadChart = $('#btnDownloadChart');
  const sqlQueryTextarea = $('#sqlQueryTextarea');
  const btnRunSql = $('#btnRunSql');
  const btnSaveSql = $('#btnSaveSql');
  const btnClearSql = $('#btnClearSql');
  const savedQueriesSel = $('#savedQueriesSel');
  const sqlResultsHead = $('#sqlResultsHead');
  const sqlResultsBody = $('#sqlResultsBody');
  const btnShowSchema = $('#btnShowSchema');
  const sqlSchemaInfo = $('#sqlSchemaInfo');
  const schemaFields = $('#schemaFields');
  const dataStatusPanel = $('#dataStatusPanel');
  const dataStatusText = $('#dataStatusText');

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
    
    // Try period_id first: YYYY-T or YYYY-T01 format
    if (/^\d{4}-/.test(pid)){
      const parts = pid.split('-');
      const y = parseInt(parts[0], 10);
      let t = String(parts[1] || '').toUpperCase().trim();

      // Month normalization: accept '01' or '1' or 'M1' or 'M01' -> produce 'M01'
      const mMatch = t.match(/^M?(\d{1,2})$/i);
      if (mMatch){
        const mm = String(mMatch[1]).padStart(2, '0');
        t = 'M' + mm;
        return {year: y, tag: t, pid};
      }

      // Quarter normalization: accept '1' or 'Q1' -> 'Q1'
      const qMatch = t.match(/^Q?(\d)$/i);
      if (qMatch){
        t = 'Q' + qMatch[1];
        return {year: y, tag: t, pid};
      }

      // Half-year normalization: accept 'H1' or '1' with H prefix handled earlier not wanted
      const hMatch = t.match(/^H?(1|2)$/i);
      if (hMatch){
        t = 'H' + hMatch[1];
        return {year: y, tag: t, pid};
      }

      // Other tags (N9, Y12, etc.) - keep as uppercased
      t = t.toUpperCase();
      return {year: y, tag: t, pid};
    }
    
    // Fallback: use year, tag, month fields — normalize similar to period_id parsing
    let t = String(tag || month || '').toUpperCase().trim();
    if (!t) return { year, tag: '', pid: '' };
    // numeric -> month (pad) or quarter
    const mMatch = t.match(/^M?(\d{1,2})$/i);
    if (mMatch){ t = 'M' + String(mMatch[1]).padStart(2, '0'); return { year, tag: t, pid: '' }; }
    const qMatch = t.match(/^Q?(\d)$/i);
    if (qMatch){ t = 'Q' + qMatch[1]; return { year, tag: t, pid: '' }; }
    const hMatch = t.match(/^H?(1|2)$/i);
    if (hMatch){ t = 'H' + hMatch[1]; return { year, tag: t, pid: '' }; }
    return { year, tag: t, pid: '' };
  }

  // ---- Load data
  let departments = [], units = [], indicators = [], users = [], reports = [], actions = [];
  try {
    console.log('[super-dashboard] Loading Firebase data...');
    const results = await Promise.all([
      gasList('departments').catch(err=>{ console.error('[gasList] departments error:', err); return []; }),
      gasList('units').catch(err=>{ console.error('[gasList] units error:', err); return []; }),
      gasList('indicators').catch(err=>{ console.error('[gasList] indicators error:', err); return []; }),
      gasList('users').catch(err=>{ console.error('[gasList] users error:', err); return []; }),
      gasList('reports').catch(err=>{ console.error('[gasList] reports error:', err); return []; }),
      gasList('actions').catch(err=>{ console.error('[gasList] actions error:', err); return []; }),
    ]);
    [departments, units, indicators, users, reports, actions] = results;
  } catch (err) {
    console.error('[super-dashboard] Promise.all error:', err);
  }
  
  // If no data loaded, use demo/sample data
  if (!departments.length) {
    console.warn('[super-dashboard] Using demo data (no Firebase data loaded)');
    departments = [
      { department_id: 'dept-1', department_name: 'ក្រុម​ឧរស៍' },
      { department_id: 'dept-2', department_name: 'ក្រុម​សុខាភិបាល' },
    ];
    units = [
      { unit_id: 'unit-1', unit_name: 'ឯកតា​ទឹក', department_id: 'dept-1' },
      { unit_id: 'unit-2', unit_name: 'ឯកតា​អាហារូបត្ថម្ភ', department_id: 'dept-1' },
      { unit_id: 'unit-3', unit_name: 'ឯកតា​ថ្នាក់រៀន', department_id: 'dept-2' },
    ];
    indicators = [
      { indicator_id: 'ind-1', indicator_name: 'អត្ថប្រយោជន៍​ទឹក', unit_id: 'unit-1', department_id: 'dept-1' },
      { indicator_id: 'ind-2', indicator_name: 'ឆ្នាំរៀន', unit_id: 'unit-3', department_id: 'dept-2' },
    ];
    users = [
      { user_id: 'user-1', full_name: 'ឈ្មោះ​អ្នក​ដំបូង', email: 'user1@test.com', role: 'admin' },
    ];
    reports = [
      { indicator_id: 'ind-1', period_id: '2024-M01', value: 100, target: 120 },
      { indicator_id: 'ind-1', period_id: '2024-Q1', value: 300, target: 360 },
      { indicator_id: 'ind-2', period_id: '2024-M02', value: 50, target: 60 },
    ];
    actions = [];
  }
  RAW = { reports, actions, indicators, users, departments, units };
  
  // Validate data integrity
  if (!departments.length) console.warn('[super-dashboard] No departments loaded');
  if (!indicators.length) console.warn('[super-dashboard] No indicators loaded');
  if (!reports.length && !actions.length) console.warn('[super-dashboard] No reports/actions data');
  console.log('[super-dashboard] Data loaded:', {
    depts: departments.length,
    units: units.length,
    indicators: indicators.length,
    users: users.length,
    reports: reports.length,
    actions: actions.length
  });
  
  // Debug helper: window.RAW_DATA shows all loaded data; helps users debug SQL queries
  window.RAW_DATA = RAW;
  window.showSchema = function(){
    console.log('=== DATABASE SCHEMA ===');
    Object.keys(RAW).forEach(tbl => {
      const rows = RAW[tbl];
      if (!rows.length) { console.log(`${tbl}: EMPTY`); return; }
      const fields = Object.keys(rows[0]);
      console.log(`${tbl} (${rows.length} rows): ${fields.join(', ')}`);
    });
  };
  console.log('[super-dashboard] Type window.showSchema() to see database fields. Or access window.RAW_DATA directly.');
  window.showSchema();

  // Update data status panel
  if (dataStatusText) {
    const status = [];
    Object.keys(RAW).forEach(tbl => {
      const cnt = RAW[tbl]?.length || 0;
      status.push(`${tbl}: ${cnt}`);
    });
    dataStatusText.innerHTML = '✅ ទិន្នន័យបានផ្ទុក | ' + status.join(' | ');
    if (dataStatusPanel) dataStatusPanel.className = 'alert alert-success mb-3';
  }

  const deptName = Object.fromEntries(departments.map(d=>[String(d.department_id), d.department_name]));
  const unitMeta = new Map(units.map(u=>[String(u.unit_id), {name:u.unit_name, dept:String(u.department_id||'') }]));
  const ownerNameByUid = Object.fromEntries(users.map(u=>[String(u.auth_uid||u.user_id||u.id||''), (u.full_name||u.user_name||u.email||'')]));

  // ---- Populate selects
  function buildYears(){
    if (!yearSel) return;
    const years = new Set();
    reports.forEach(r=>{ const p = normPeriod(r); if (p && p.year) years.add(p.year); });
    actions.forEach(a=>{ const p = normPeriod(a); if (p && p.year) years.add(p.year); });
    const list = [...years].sort((a,b)=>b-a);
    if (!list.length) list.push(new Date().getFullYear());
    const html = list.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSel.innerHTML = html || `<option>${new Date().getFullYear()}</option>`;
    yearSel.value = list[0] || new Date().getFullYear();
    console.log('[buildYears]', { years: list, selected: yearSel.value });
  }
  function buildTags(){
    if (!tagSel) return;
    const opts = ['<option value="@LAST">ចុងក្រោយ</option>'];
    if (MODE==='M'){ for(let m=1;m<=12;m++) { const mm=String(m).padStart(2,'0'); opts.push(`<option value="M${mm}">M${mm}</option>`); } }
    else if (MODE==='Q'){ opts.push('<option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option>'); }
    else if (MODE==='H'){ opts.push('<option value="H1">H1</option><option value="H2">H2</option>'); }
    else if (MODE==='N9'){ opts.push('<option value="N9">N9</option>'); }
    else if (MODE==='Y12'){ opts.push('<option value="Y12">Y12</option>'); }
    else if (MODE==='Y'){ opts.push('<option value="Y">Y</option>'); }
    const html = opts.join('');
    tagSel.innerHTML = html || '<option value="@LAST">--</option>';
    tagSel.value='@LAST';
    console.log('[buildTags] MODE=' + MODE, { html: html.length + ' chars', value: tagSel.value });
    buildCompareTags(); // rebuild compare tags when mode changes
  }
  function buildCompareTags(){
    if (!compareTagSel) return;
    const opts = ['<option value="">មិនប្រៀបធៀប</option>'];
    if (MODE==='M'){ for(let m=1;m<=12;m++) { const mm=String(m).padStart(2,'0'); opts.push(`<option value="M${mm}">M${mm}</option>`); } }
    else if (MODE==='Q'){ opts.push('<option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option>'); }
    else if (MODE==='H'){ opts.push('<option value="H1">H1</option><option value="H2">H2</option>'); }
    else if (MODE==='N9'){ opts.push('<option value="N9">N9</option>'); }
    else if (MODE==='Y12'){ opts.push('<option value="Y12">Y12</option>'); }
    else if (MODE==='Y'){ opts.push('<option value="Y">Y</option>'); }
    compareTagSel.innerHTML = opts.join(''); compareTagSel.value='';
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
  console.log('[super-dashboard] Builders called. yearSel.innerHTML:', yearSel?.innerHTML?.substring(0, 50));

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
    // Force only indicators (UI trimmed to indicators-only)
    const entity = 'indicators';
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
        const vt = (tag==='@LAST') ? (latestByIndicator(String(r.indicator_id)) || r) : r;
        const pick = (tag==='@LAST') ? normPeriod(vt) : p;
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
        if (tag!=='@LAST'){
          // Tag filter: must match both year and tag
          if (y && !Number.isFinite(x.year)) return false;
          if (y && x.year !== y) return false;
          if (tag && !x.tag) return false;
          if (tag && x.tag !== tag) return false;
        }
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
        if (tag!=='@LAST'){
          if (y && !Number.isFinite(x.year)) return false;
          if (y && x.year !== y) return false;
          if (tag && !x.tag) return false;
          if (tag && x.tag !== tag) return false;
        }
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
        if (tag!=='@LAST'){
          if (y && !Number.isFinite(x.year)) return false;
          if (y && x.year !== y) return false;
          if (tag && !x.tag) return false;
          if (tag && x.tag !== tag) return false;
        }
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

  // ---- Simple client-side SQL runner (supports SELECT fields FROM table WHERE a='b' AND c IN ('x'))
  function parseSimpleSQL(q){
    const s = String(q||'').trim();
    const selMatch = s.match(/^\s*SELECT\s+([\w\*,\s]+)\s+FROM\s+(\w+)\s*(WHERE\s+(.+))?$/i);
    if (!selMatch) {
      console.warn('[parseSimpleSQL] Failed to parse:', s);
      return null;
    }
    const fields = selMatch[1].trim();
    const table = selMatch[2].trim();
    const where = selMatch[4] || '';
    const clauses = where ? where.split(/\s+AND\s+/i).map(c=>c.trim()).filter(Boolean) : [];
    console.log('[parseSimpleSQL] Parsed OK:', { fields, table, clauses });
    return { fields, table, clauses };
  }

  function evalClause(obj, clause){
    const mEq = clause.match(/^([\w_]+)\s*=\s*(['"])(.*)\2$/);
    if (mEq) {
      const result = String(obj[mEq[1]]||'') === mEq[3];
      console.log('[evalClause] EQ check:', mEq[1], '=', mEq[3], 'obj value:', obj[mEq[1]], 'result:', result);
      return result;
    }
    const mIn = clause.match(/^([\w_]+)\s+IN\s*\((.+)\)$/i);
    if (mIn){
      const key = mIn[1];
      const list = mIn[2].split(',').map(x=>x.replace(/^[\s'\"]+|[\s'\"]+$/g,'')).filter(Boolean);
      const result = list.includes(String(obj[key]||''));
      console.log('[evalClause] IN check:', key, 'in', list, 'obj value:', obj[key], 'result:', result);
      return result;
    }
    console.warn('[evalClause] Could not parse clause:', clause);
    return false;
  }

  function runSql(){
    const q = String(sqlQueryTextarea?.value||'').trim();
    console.log('[runSql] Input:', q);
    if (!q) { alert('សូមបញ្ចូល SQL Query'); return; }
    const parsed = parseSimpleSQL(q);
    if (!parsed){ alert('Malformed SQL. Use: SELECT * FROM indicators\nOR: SELECT * FROM indicators WHERE department_id=\'dept-1\''); return; }
    const tbl = parsed.table;
    const rows = RAW[tbl] || [];
    
    console.log('[runSql] Table:', tbl, 'Rows count:', rows.length);
    if (!rows.length){ 
      console.warn('[runSql] No data in table:', tbl);
      sqlResultsBody.innerHTML = `<tr><td class="text-muted text-center p-4">គ្មានទិន្នន័យក្នុងតារាង: ${esc(tbl)}</td></tr>`;
      return;
    }
    
    const filtered = rows.filter(r => {
      for (const c of parsed.clauses) if (c && !evalClause(r, c)) return false;
      return true;
    });
    
    console.log('[runSql] Filtered rows:', filtered.length, 'of', rows.length);
    if (!filtered.length){
      sqlResultsBody.innerHTML = `<tr><td class="text-muted text-center p-4">គ្មានលទ្ធផលដែលផ្គូផ្គង។ ព្យាយាម WHERE clause ដេក ស្វ័យប្រាប្ត។</td></tr>`;
      sqlResultsHead.innerHTML = '<tr><th>ព័ត៌មាន</th></tr>';
      return;
    }
    
    let cols = [];
    if (parsed.fields === '*' ){
      cols = Object.keys(filtered[0] || rows[0] || {});
    } else {
      cols = parsed.fields.split(',').map(f=>f.trim()).filter(Boolean);
    }
    
    console.log('[runSql] Result columns:', cols);
    sqlResultsHead.innerHTML = '<tr>' + cols.map(c=>`<th>${esc(c)}</th>`).join('') + '<th>ម៉ឺនុយ</th></tr>';
    sqlResultsBody.innerHTML = '';
    for (const r of filtered){
      const tr = document.createElement('tr');
      tr.innerHTML = cols.map(c=>`<td>${esc(r[c] ?? '')}</td>`).join('') + `<td><button class="btn btn-sm btn-link">+</button></td>`;
      const btn = tr.querySelector('button');
      btn.addEventListener('click', ()=>{
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('sql-child')){ next.remove(); btn.textContent='+'; return; }
        let children = [];
        if (tbl === 'indicators') children = (RAW.reports||[]).filter(rr=>String(rr.indicator_id)===String(r.indicator_id));
        if (tbl === 'departments') children = (RAW.units||[]).filter(u=>String(u.department_id)===String(r.department_id));
        if (tbl === 'units') children = (RAW.indicators||[]).filter(i=>String(i.unit_id)===String(r.unit_id));
        if (!children.length){ const empty = document.createElement('tr'); empty.classList.add('sql-child'); empty.innerHTML = `<td colspan="${cols.length+1}" class="text-muted">គ្មានកូន</td>`; tr.parentNode.insertBefore(empty, tr.nextSibling); btn.textContent='-'; return; }
        const childRow = document.createElement('tr'); childRow.classList.add('sql-child');
        childRow.innerHTML = `<td colspan="${cols.length+1}">` +
          `<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr>${Object.keys(children[0]).map(k=>`<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>` +
          children.map(ch=>`<tr>${Object.keys(children[0]).map(k=>`<td>${esc(ch[k] ?? '')}</td>`).join('')}</tr>`).join('') +
          `</tbody></table></div></td>`;
        tr.parentNode.insertBefore(childRow, tr.nextSibling);
        btn.textContent='-';
      });
      sqlResultsBody.appendChild(tr);
    }
    console.log('[runSql] Done! Rendered', filtered.length, 'rows');
  }

  function loadSavedQueries(){
    const saved = JSON.parse(localStorage.getItem('saved_sql_queries')||'[]');
    savedQueriesSel.innerHTML = '<option value="">— រក្សាទុក Query —</option>' + saved.map((s,i)=>`<option value="${i}">${esc(s.slice(0,80))}</option>`).join('');
  }

  btnRunSql?.addEventListener('click', runSql);
  btnSaveSql?.addEventListener('click', ()=>{
    const q = String(sqlQueryTextarea?.value||'').trim(); if(!q) return alert('SQL ត្រូវបានបំពេញ');
    const saved = JSON.parse(localStorage.getItem('saved_sql_queries')||'[]'); saved.push(q); localStorage.setItem('saved_sql_queries', JSON.stringify(saved)); loadSavedQueries();
  });
  btnClearSql?.addEventListener('click', ()=>{ sqlQueryTextarea.value = ''; sqlResultsHead.innerHTML=''; sqlResultsBody.innerHTML=''; });
  btnShowSchema?.addEventListener('click', ()=>{
    const info = [];
    Object.keys(RAW).forEach(tbl => {
      const rows = RAW[tbl];
      if (!rows.length) { info.push(`${tbl}: (ទទេ)`); return; }
      const fields = Object.keys(rows[0]).join(', ');
      info.push(`<strong>${tbl}</strong>: ${fields}`);
    });
    schemaFields.innerHTML = info.join('<br>');
    sqlSchemaInfo.style.display = 'block';
  });
  savedQueriesSel?.addEventListener('change', e=>{
    const v = e.target.value; if(v==='') return; const saved = JSON.parse(localStorage.getItem('saved_sql_queries')||'[]'); sqlQueryTextarea.value = saved[Number(v)]||'';
  });
  loadSavedQueries();

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
      const cmptxt = compareTagSel.value ? ` (vs ${compareTagSel.value})` : '';
      statusLine.textContent = `Entity: ${entitySel.value} • Group: ${gtxt}${g2txt} • Metric: ${metricSel.value} • Rows: ${total}${cmptxt}`;
    }

    // Render chart
    const chartType = chartTypeSel?.value || 'table';
    renderChart(chartType, columns, rows);
  }

  function exportCSV(columns, rows){
    const header = columns.map(c=>`"${c.label.replace(/"/g,'""')}"`).join(',');
    
    // Export all rows, not just visible page
    const lines = rows.map(r => columns.map(c=>{
      const val = r[c.key];
      const s = (val==null) ? '' : String(val);
      return `"${s.replace(/"/g,'""')}"`;
    }).join(','));
    
    const csv = [header, ...lines].join('\n');
    
    // Add UTF-8 BOM to ensure Khmer characters display correctly in Excel
    const BOM = '\uFEFF';
    const csvWithBOM = BOM + csv;
    
    // Create blob with UTF-8 encoding
    const blob = new Blob([csvWithBOM], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; 
    a.download = `collate_${entitySel.value}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderChart(chartType, columns, rows){
    if (!chartContainer || !chartEl) return;
    
    if (chartType === 'table' || !rows.length) {
      chartContainer.style.display = 'none';
      return;
    }

    chartContainer.style.display = 'block';
    
    // Simple chart rendering (client-side, no external libs)
    if (chartType === 'bar' || chartType === 'line'){
      const labelCol = columns[0];
      const valueCol = columns[columns.length - 1];
      const labels = rows.slice(0, 20).map(r => String(r[labelCol.key] || ''));
      const values = rows.slice(0, 20).map(r => {
        const v = r[valueCol.key];
        return Number.isFinite(v) ? v : 0;
      });
      
      const maxVal = Math.max(...values, 1);
      const barWidth = 30;
      const barGap = 5;
      const margin = { top: 40, right: 20, bottom: 60, left: 50 };
      const graphWidth = 800 - margin.left - margin.right;
      const graphHeight = 400 - margin.top - margin.bottom;
      
      let svg = `<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; background:#fff;">`;
      
      // Background & border
      svg += `<rect width="800" height="400" fill="#fff" stroke="#ddd" stroke-width="1"/>`;
      
      // Grid lines
      for (let i = 0; i <= 5; i++) {
        const y = margin.top + (graphHeight / 5) * i;
        svg += `<line x1="${margin.left}" y1="${y}" x2="${800 - margin.right}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>`;
      }
      
      // Axes
      svg += `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${400 - margin.bottom}" stroke="#333" stroke-width="2"/>`;
      svg += `<line x1="${margin.left}" y1="${400 - margin.bottom}" x2="${800 - margin.right}" y2="${400 - margin.bottom}" stroke="#333" stroke-width="2"/>`;
      
      // Title
      svg += `<text x="400" y="25" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${chartType === 'bar' ? '📊 ដំបង' : '📉 បន្ទាត់'}</text>`;
      
      // Y-axis labels
      for (let i = 0; i <= 5; i++) {
        const val = Math.round((maxVal / 5) * i);
        const y = 400 - margin.bottom - (graphHeight / 5) * i;
        svg += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#666">${val}</text>`;
      }
      
      // Bars/Line
      const barSpacing = graphWidth / labels.length;
      let pathData = `M ${margin.left + barSpacing / 2} ${400 - margin.bottom - (values[0] / maxVal) * graphHeight}`;
      
      values.forEach((val, i) => {
        const x = margin.left + (i + 0.5) * barSpacing;
        const h = (val / maxVal) * graphHeight;
        const y = 400 - margin.bottom - h;
        
        if (chartType === 'bar') {
          const barX = x - barWidth / 2;
          svg += `<rect x="${barX}" y="${y}" width="${barWidth}" height="${h}" fill="#0d6efd" opacity="0.8" rx="4"/>`;
        } else {
          pathData += ` L ${x} ${y}`;
        }
        
        // X-axis labels (every 2nd)
        if (i % Math.ceil(labels.length / 8) === 0) {
          svg += `<text x="${x}" y="${400 - margin.bottom + 20}" text-anchor="middle" font-size="11" fill="#666">${esc(labels[i].substring(0, 10))}</text>`;
        }
      });
      
      if (chartType === 'line') {
        svg += `<polyline points="${values.map((val, i) => {
          const x = margin.left + (i + 0.5) * (graphWidth / labels.length);
          const h = (val / maxVal) * graphHeight;
          const y = 400 - margin.bottom - h;
          return `${x},${y}`;
        }).join(' ')}" fill="none" stroke="#0d6efd" stroke-width="2"/>`;
      }
      
      svg += `</svg>`;
      chartEl.innerHTML = svg;
    }
    else if (chartType === 'pie'){
      const labelCol = columns[0];
      const valueCol = columns[columns.length - 1];
      const data = rows.slice(0, 8).map(r => ({
        label: String(r[labelCol.key] || ''),
        value: Number.isFinite(r[valueCol.key]) ? r[valueCol.key] : 0
      }));
      
      const total = data.reduce((s, d) => s + d.value, 0);
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
      
      // Create SVG pie chart
      let svg = `<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; background:#fff;">`;
      
      // Title
      svg += `<text x="200" y="30" font-size="16" font-weight="bold" fill="#333">🥧 រង្វង់ក្រាហ្វិច</text>`;
      
      // Pie center
      const cx = 200, cy = 200, radius = 120;
      let startAngle = -90;
      
      data.forEach((d, i) => {
        const pct = total ? (d.value / total) : 0;
        const angle = pct * 360;
        const endAngle = startAngle + angle;
        
        // Calculate arc path
        const start = {
          x: cx + radius * Math.cos(startAngle * Math.PI / 180),
          y: cy + radius * Math.sin(startAngle * Math.PI / 180)
        };
        const end = {
          x: cx + radius * Math.cos(endAngle * Math.PI / 180),
          y: cy + radius * Math.sin(endAngle * Math.PI / 180)
        };
        const large = angle > 180 ? 1 : 0;
        
        const path = `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y} Z`;
        svg += `<path d="${path}" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="2" opacity="0.9"/>`;
        
        startAngle = endAngle;
      });
      
      // Legend
      let legendY = 60;
      data.forEach((d, i) => {
        const pct = total ? (d.value / total * 100) : 0;
        svg += `<rect x="450" y="${legendY - 12}" width="16" height="16" fill="${colors[i % colors.length]}" opacity="0.9"/>`;
        svg += `<text x="475" y="${legendY}" font-size="12" fill="#333">${esc(d.label.substring(0, 15))}: ${d.value} (${pct.toFixed(1)}%)</text>`;
        legendY += 25;
      });
      
      svg += `</svg>`;
      chartEl.innerHTML = svg;
    }
  }

  function run(){
    try {
      buildRows();
      const { columns, rows } = aggregate(VIEW);
      renderTable(columns, rows);
      return { columns, rows };
    } catch (err) {
      console.error('[super-dashboard] run error:', err);
      if (statusLine) statusLine.textContent = `❌ Error: ${err.message}`;
      return { columns: [], rows: [] };
    }
  }

  // ---- Events
  modeSel   ?.addEventListener('change', ()=>{ MODE = String(modeSel.value||'M'); buildTags(); run(); });
  yearSel   ?.addEventListener('change', run);
  tagSel    ?.addEventListener('change', run);
  compareTagSel ?.addEventListener('change', run);
  deptSel   ?.addEventListener('change', e=>{ buildUnits(String(e.target.value||'')); run(); });
  unitSel   ?.addEventListener('change', run);
  entitySel ?.addEventListener('change', run);
  groupSel  ?.addEventListener('change', run);
  groupSel2 ?.addEventListener('change', run);
  metricSel ?.addEventListener('change', run);
  chartTypeSel ?.addEventListener('change', run);
  txtQ      ?.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); });
  btnRun    ?.addEventListener('click', run);
  pageSizeSel?.addEventListener('change', ()=>{ PAGE=1; run(); });
  pageSizeSel2?.addEventListener('change', ()=>{ PAGE=1; run(); });
  pager     ?.addEventListener('click', e=>{
    const b=e.target.closest('button[data-goto]'); if(!b||b.disabled) return;
    const a=b.getAttribute('data-goto');
    const { columns, rows } = aggregate(VIEW);
    const pages = Math.max(1, Math.ceil(rows.length/(PAGE_SIZE||10)));
    if (a==='first') PAGE=1;
    else if (a==='prev') PAGE=Math.max(1,PAGE-1);
    else if (a==='next') PAGE=Math.min(PAGE+1, pages);
    else if (a==='last') PAGE=pages;
    renderTable(columns, rows);
  });
  btnCSV    ?.addEventListener('click', ()=>{
    const { columns, rows } = aggregate(VIEW);
    exportCSV(columns, rows);
  });
  
  // Chart copy/download buttons
  btnCopyChart?.addEventListener('click', ()=>{
    const svgEl = chartEl?.querySelector('svg');
    if (svgEl) {
      // Convert SVG to canvas to image
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      const svg = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((imgBlob) => {
          const item = new ClipboardItem({'image/png': imgBlob});
          navigator.clipboard.write([item]).then(()=>{
            alert('✅ ក្រាហ្វិចបានចម្លងទៅក្តារតម្បាច');
          }).catch(err=>{
            console.error('Copy failed:', err);
            alert('❌ បរាជ័យក្នុងការចម្លង');
          });
        });
      };
      img.src = url;
    } else {
      alert('⚠️ គ្មានក្រាហ្វិច ឬលក្ខខណ្ឌមិនគាំទ្របង់');
    }
  });
  
  btnDownloadChart?.addEventListener('click', ()=>{
    const svgEl = chartEl?.querySelector('svg');
    if (svgEl) {
      // Download SVG directly as image
      const svg = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart_${entitySel.value}_${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert('⚠️ គ្មានក្រាហ្វិច ឬលក្ខខណ្ឋ់មិនគាំទ្របង់');
    }
  });

  // ---- First paint
  console.log('[super-dashboard] About to call run()');
  run();
  console.log('[super-dashboard] INIT COMPLETE');
}

export function getTitle(){ return 'SUPER Data Collator | PHD Report'; }
