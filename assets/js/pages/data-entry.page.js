// assets/js/pages/data-entry.page.js
import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasSave } from '../app.api.firebase.js';

/* ========== Helpers (declare once) ========== */
const toArr = (x)=> Array.isArray(x) ? x : (x && (x.rows||x.content)) ? (x.rows||x.content) : [];
const KH_MONTHS=['មករា','កុម្ភៈ','មិនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
const KH_DIG={'0':'០','1':'១','2':'២','3':'៣','4':'៤','5':'៥','6':'៦','7':'៧','8':'៨','9':'៩'};
const khDigits = s => String(s).replace(/[0-9]/g,d=>KH_DIG[d]);

function parsePid(pid){
  const s=String(pid||'').trim();
  let m=s.match(/^(\d{4})-(\d{1,2})$/);      if(m){ const yy=+m[1], mm=Math.max(1,Math.min(12,+m[2])); return {year:yy, tag:`M${String(mm).padStart(2,'0')}`, type:'month', month:mm}; }
  m=s.match(/^(\d{4})M(\d{1,2})$/i);         if(m){ const yy=+m[1], mm=Math.max(1,Math.min(12,+m[2])); return {year:yy, tag:`M${String(mm).padStart(2,'0')}`, type:'month', month:mm}; }
  m=s.match(/^(\d{4})Q([1-4])$/i);           if(m){ return {year:+m[1], tag:`Q${+m[2]}`, type:'quarter', month:null}; }
  m=s.match(/^(\d{4})H([12])$/i);            if(m){ return {year:+m[1], tag:`H${+m[2]}`, type:'half', month:null}; }
  m=s.match(/^(\d{4})Y12$/i);                if(m){ return {year:+m[1], tag:'Y12', type:'year', month:null}; }
  const year=+s.slice(0,4)||new Date().getFullYear();
  const tag=(s.slice(4)||'Y12').toUpperCase();
  const type = tag.startsWith('M')?'month': tag.startsWith('Q')?'quarter': tag.startsWith('H')?'half':'year';
  const month= type==='month' ? Math.max(1,Math.min(12,+tag.slice(1))) : null;
  return {year, tag: type==='month'?`M${String(month).padStart(2,'0')}`:tag, type, month};
}
function prettyPid(pid){
  const {year,type,month,tag}=parsePid(pid);
  const y=khDigits(year);
  if (type==='month')   return `${KH_MONTHS[month-1]} ${y}`;
  if (type==='quarter') return `ត្រីមាស ${khDigits(tag.slice(1))} • ${y}`;
  if (type==='half')    return `ឆមាស ${khDigits(tag.slice(1))} • ${y}`;
  if (tag==='Y12')      return `១២ខែ • ${y}`;
  return `ឆ្នាំ ${y}`;
}
function prevPid(pid){
  const p=parsePid(pid);
  if (p.type==='month'){ let y=p.year,m=p.month-1; if(m<1){y--;m=12;} return `${y}-${String(m).padStart(2,'0')}`; }
  if (p.type==='quarter'){ let y=p.year,q=+p.tag.slice(1)-1; if(q<1){y--;q=4;} return `${y}Q${q}`; }
  if (p.type==='half'){ let y=p.year,h=(+p.tag.slice(1)===2)?1:2; if(+p.tag.slice(1)===1){y--;h=2;} return `${y}H${h}`; }
  return `${p.year-1}Y12`;
}
function ordTag(t){
  t=String(t||'').toUpperCase();
  let m=t.match(/^M(\d{1,2})$/); if(m) return 100+ +m[1];
  let q=t.match(/^Q([1-4])$/);   if(q) return 200+ +q[1];
  let h=t.match(/^H([12])$/);    if(h) return 300+ +h[1];
  if (t==='Y12') return 500;
  return 999;
}
function naturalCmp(a,b){
  a=String(a); b=String(b);
  const ax=[], bx=[];
  a.replace(/(\d+)|(\D+)/g,(_,n,t)=>ax.push([n||Infinity,t||""]));
  b.replace(/(\d+)|(\D+)/g,(_,n,t)=>bx.push([n||Infinity,t||""]));
  while(ax.length && bx.length){
    const A=ax.shift(), B=bx.shift();
    if (A[1]!==B[1]) return A[1]<B[1] ? -1 : 1;
    const na=+A[0], nb=+B[0];
    if (na!==nb) return na-nb;
  }
  return ax.length-bx.length;
}
const isEmptyVal = (x)=> x==null || String(x).trim()==='';
const nOrNull = (v)=>{ if(v==null) return null; const s=String(v).trim(); if(s==='') return null; const n=Number(s); return Number.isFinite(n)?n:null; };

/* ========== Build Year/Period from DB ========== */
async function buildPeriodSelectorsFromDB(selYear, selPeriod, onChange){
  let rows=[];
  try{ rows = toArr(await gasList('periods', { _ts:Date.now() })); }catch{ rows=[]; }

  rows = rows.map(r=>{
    const period_id = String(r.period_id || (String(r.period_year||'') + String(r.period_month||'')));
    const p = parsePid(period_id);
    return {
      period_id,
      period_year : p.year,
      period_month: p.tag,
      period_name : r.period_name || ''
    };
  });

  const years = Array.from(new Set(rows.map(r=>r.period_year))).sort((a,b)=>a-b);
  selYear.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');

  function fillForYear(y){
    const list = rows.filter(r=>r.period_year===Number(y))
                     .sort((a,b)=>ordTag(a.period_month)-ordTag(b.period_month));
    selPeriod.innerHTML = list.map(r=>{
      const label = r.period_name?.trim() ? r.period_name : prettyPid(r.period_id);
      return `<option value="${r.period_id}">${label}</option>`;
    }).join('');
    const d=new Date(); const prefer = `${y}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if ([...selPeriod.options].some(o=>o.value===prefer)) selPeriod.value = prefer;
    else if (selPeriod.options.length) selPeriod.selectedIndex = selPeriod.options.length-1;
  }

  const nowY=new Date().getFullYear();
  const initY = rows.some(r=>r.period_year===nowY) ? nowY : years.at(-1);
  if (initY!=null){ selYear.value=String(initY); fillForYear(initY); }

  selYear.addEventListener('change', ()=>{ fillForYear(Number(selYear.value)); onChange?.(); });
  selPeriod.addEventListener('change', ()=> onChange?.());
  return rows;
}

/* =========================== Main =========================== */
export default async function hydrate(root){
  const R = root || document;
  const $ = (s)=> R.querySelector(s);

  // DOM
  const selYear=$('#selYear'), selPeriod=$('#selPeriod');
  const selDept=$('#selDept'), selUnit=$('#selUnit'), selOwner=$('#selOwner'); // optional in HTML
  const inpSearch=$('#inpSearch'), swOnlyMy=$('#swOnlyMy'), onlyEmpty=$('#onlyEmpty');
  const tbl=$('#tblReports'), tbody=tbl?.querySelector('tbody');
  const btnCopy=$('#btnCopyPrev'), btnSaveAll=$('#btnSaveAll');
  const statusEl=$('#status'), countInfo=$('#countInfo'), dirtyBadge=$('#dirtyCount');
  const setStatus = m=>{ if(statusEl) statusEl.textContent=m||''; };
  const setDirty  = ()=>{
    const n = DIRTY.size;
    if (dirtyBadge) dirtyBadge.textContent = String(n);
    // show/hide floating dock
    ensureSaveDock();
    if (saveDockBadge) saveDockBadge.textContent = String(n);
    if (saveDock) saveDock.style.display = n>0 ? 'block' : 'none';
  };
  const curPid    = ()=> selPeriod?.value || '';

  // Auth
  const auth=getAuth()||{};
  const SUPER=isSuper(auth);
  const MY_UID  = String(auth.uid||'');
  const MY_UNIT = String(auth.unit_id || auth.token?.unit_id || '');
  const MY_DEPT = String(auth.department_id || auth.token?.department_id || '');

  // State
  let DEPTS=[], UNITS=[], IND_ALL=[], IND=[], USERS=[];
  let ROWS=[];
  const DIRTY=new Map(); // key "indicator_id|unit_id" => pending {indicator_id,unit_id,period_id,value,target,report_id}
  let FILTER_Q='', ONLY_MY=false, SHOW_ONLY_EMPTY=false, MASTERS=false;

  // REPORT index (for UPSERT)
  let REPORT_INDEX = new Map(); // key = `${period_id}|${indicator_id}|${unit_id}` → id

  /* ---------- Fill helpers ---------- */
  function fillDept(){
    if (!selDept) return;
    selDept.innerHTML = `<option value="">ជំពូកទាំងអស់</option>`+
      DEPTS.map(d=>`<option value="${d.department_id}">${d.department_name||''}</option>`).join('');
    if (!SUPER && MY_DEPT) selDept.value = MY_DEPT;
  }
  function fillUnit(depId){
    if (!selUnit) return;
    const list = depId ? UNITS.filter(u=>String(u.department_id)===String(depId)) : UNITS;
    selUnit.innerHTML = `<option value="">ផ្នែកទាំងអស់</option>`+
      list.map(u=>`<option value="${u.unit_id}">${u.unit_name||''}</option>`).join('');
    if (!SUPER && MY_UNIT && (!depId || String(depId)===String(MY_DEPT))) selUnit.value = MY_UNIT;
  }
  function buildOwnerFilter(){
    if (!selOwner) return;
    if (!SUPER){
      selOwner.closest('.col-12, .col-6, .col-sm-auto')?.classList?.add('d-none');
      return;
    }
    const owners = Array.from(new Set(IND_ALL.map(i=>String(i.owner_uid||'').trim()).filter(Boolean)));
    const userByUid = new Map();
    for (const u of USERS){
      if (u.user_id)  userByUid.set(String(u.user_id), u);
      if (u.auth_uid) userByUid.set(String(u.auth_uid), u);
    }
    const opt = (uid)=> {
      const u=userByUid.get(uid)||{};
      const label = u.full_name || u.user_name || uid;
      return `<option value="${uid}">${label}</option>`;
    };
    selOwner.innerHTML = `<option value="">អ្នកទាំងអស់</option>` + owners.map(opt).join('');
  }

  // --- Save Dock (floating, Save + Go-Top buttons) ---
  let saveDock, saveDockBadge, saveDockBtn, saveDockGoTopBtn;
  function scrollToTableHead(){
    const head = document.querySelector('#tblReports thead');
    if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function ensureSaveDock(){
    if (saveDock) return;
    saveDock = document.createElement('div');
    saveDock.id = 'saveDock';
    saveDock.innerHTML = `
      <style>
        #saveDock{position:fixed; right:16px; bottom:16px; z-index:1050; display:none;}
        #saveDock .card{box-shadow:0 10px 30px rgba(0,0,0,.15); border-radius:14px;}
        #saveDock .badge{min-width:22px}
        #saveDock .btn + .btn{ margin-left:.5rem; }
      </style>
      <div class="card p-2 bg-white border">
        <div class="d-flex align-items-center gap-2">
          <span class="text-muted small">ត្រូវរក្សាទុក</span>
          <span id="saveDockBadge" class="badge bg-warning text-dark">0</span>
          <div class="ms-auto d-flex">
            <button id="saveDockBtn" class="btn btn-sm btn-primary">រក្សាទុក</button>
            <button id="saveDockGoTopBtn" class="btn btn-sm btn-outline-secondary" title="ឡើងក្បាលតារាង">ឡើងលើ</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(saveDock);
    saveDockBadge    = document.getElementById('saveDockBadge');
    saveDockBtn      = document.getElementById('saveDockBtn');
    saveDockGoTopBtn = document.getElementById('saveDockGoTopBtn');
    // reuse existing Save All behavior (avoid touching save logic)
    saveDockBtn?.addEventListener('click', ()=> document.querySelector('#btnSaveAll')?.click());
    // go-top button -> scroll to table head
    saveDockGoTopBtn?.addEventListener('click', scrollToTableHead);
  }
  // prepare dock early so it exists before first setDirty()
  ensureSaveDock();

  /* ---------- Filters ---------- */
  function applyFilters(list){
    const dep=selDept?.value||'', unit=selUnit?.value||'';
    const owner=selOwner?.value?.trim()||'';
    let out=list.slice();
    if (dep) out=out.filter(r=>String(r.department_id)===String(dep));
    if (unit) out=out.filter(r=>String(r.unit_id)===String(unit));
    if (SUPER && owner) out=out.filter(r=>String(r.owner_uid||'')===owner);
    if (ONLY_MY) out=out.filter(r=>String(r.unit_id)===MY_UNIT);
    if (FILTER_Q){
      const q=FILTER_Q.toLowerCase();
      out=out.filter(r =>
        String(r.indicator_id).toLowerCase().includes(q) ||
        String(r.indicator_name||'').toLowerCase().includes(q) ||
        String(r.unit_name||'').toLowerCase().includes(q) ||
        String(r.department_name||'').toLowerCase().includes(q)
      );
    }
    if (SHOW_ONLY_EMPTY){
      // “empty” គិតតាម **DB value** ប៉ុណ្ណោះ
      out=out.filter(r=> isEmptyVal(r.value));
    }
    return out;
  }

  /* ---------- Render (with groups & Khmer numbering) ---------- */
  function render(){
    const pid = curPid();
    if (!tbody){
      countInfo && (countInfo.textContent='0');
      return;
    }
    if (!pid){
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">សូមជ្រើសរើសរយៈពេល</td></tr>`;
      countInfo && (countInfo.textContent='0');
      return;
    }

    // Filter & sort (dept → unit → indicator)
    const base = applyFilters(ROWS);
    const rows = base.slice().sort((a,b)=>{
      if (a.department_id!==b.department_id) return naturalCmp(a.department_id,b.department_id);
      if (a.unit_id!==b.unit_id)             return naturalCmp(a.unit_id,b.unit_id);
      return naturalCmp(String(a.indicator_id), String(b.indicator_id));
    });

    // Summary (badge count uses DB only)
    const filled = rows.reduce((n,r)=> n + (isEmptyVal(r.value)?0:1), 0);
    const total  = rows.length;
    countInfo && (countInfo.textContent = String(total));
    $('#completeInfo') && ($('#completeInfo').textContent = `${filled} / ${total}`);

    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      return;
    }

    const frag=document.createDocumentFragment();
    let curDept='', curUnit='';
    let deptIndex=0, unitIndex=0, rowIndex=0;

    for (const r of rows){
      // Group: Department
      if (r.department_id !== curDept){
        curDept = r.department_id; curUnit='';
        deptIndex++; unitIndex=0; rowIndex=0;
        const trD = document.createElement('tr');
        trD.className='group-dept';
        trD.innerHTML = `<td colspan="7">${khDigits(deptIndex)}. ${r.department_name || r.department_id || '—'}</td>`;
        frag.appendChild(trD);
      }
      // Group: Unit
      if (r.unit_id !== curUnit){
        curUnit = r.unit_id; unitIndex++; rowIndex=0;
        const trU = document.createElement('tr');
        trU.className='group-unit';
        trU.innerHTML = `<td colspan="7">${khDigits(deptIndex)}.${khDigits(unitIndex)} ${r.unit_name || r.unit_id || '—'}</td>`;
        frag.appendChild(trU);
      }

      // Row numbering
      rowIndex++;
      const rowNum = `${khDigits(deptIndex)}.${khDigits(unitIndex)}.${khDigits(rowIndex)}`;

      const key = `${r.indicator_id}|${r.unit_id}`;
      const pending = DIRTY.get(key) || null;

      const dbValue   = r.value;
      const dbTarget  = r.target;
      const showValue = pending ? pending.value  : dbValue;
      const showTarget= pending ? pending.target : dbTarget;

      const missingDB = isEmptyVal(dbValue); // badge ពឹងលើ DB-value ប៉ុណ្ណោះ

      const tr = document.createElement('tr');
      if (missingDB) tr.classList.add('row-missing');

      tr.innerHTML = `
        <td style="width:70px">${rowNum}</td>
        <td style="width:90px">${r.indicator_id}</td>
        <td>
          <div class="fw-semibold">${r.indicator_name||''}</div>
          <div class="small mt-1">
            ${missingDB
              ? '<span class="badge badge-missing">មិនទាន់បញ្ចូល</span>'
              : '<span class="badge badge-done">បានបញ្ចូលរួច</span>'}
          </div>
        </td>
        <td style="width:140px">${prettyPid(pid)}</td>
        <td style="width:150px">
          ${r.can_edit ? `
            <input type="text" inputmode="decimal" class="form-control form-control-sm inp-val"
                   data-key="${key}" data-field="value"
                   value="${showValue==null?'':showValue}" placeholder="0" />
          ` : `<div class="form-control-plaintext">${isEmptyVal(dbValue)?'<span class="text-muted">—</span>':dbValue}</div>`}
        </td>
        <td style="width:150px">
          ${r.can_edit ? `
            <input type="text" inputmode="decimal" class="form-control form-control-sm inp-val"
                   data-key="${key}" data-field="target"
                   value="${showTarget==null?'':showTarget}" placeholder="0" />
          ` : `<div class="form-control-plaintext">${isEmptyVal(dbTarget)?'<span class="text-muted">—</span>':dbTarget}</div>`}
        </td>
        <td class="text-end" style="width:170px">
          <button class="btn btn-sm btn-outline-primary" data-act="issue" data-key="${key}">Issue / Action</button>
        </td>
      `;
      frag.appendChild(tr);
    }

    tbody.innerHTML=''; tbody.appendChild(frag);
  }

  /* ---------- Reload by PID (STRICT) ---------- */
  async function reloadPeriod(){
    const period_id = curPid();
    if (!period_id){ setStatus('សូមជ្រើសរើសរយៈពេល'); ROWS=[]; render(); return; }
    setStatus('កំពុងផ្ទុកទិន្នន័យ…');

    let vals=[], acts=[];
    try{ vals = toArr(await gasList('reports', { period_id, _ts:Date.now() })); }catch{}
    try{ acts = toArr(await gasList('actions', { period_id, _ts:Date.now() })); }catch{}

    vals = vals.filter(v=>String(v.period_id)===String(period_id));
    acts = acts.filter(a=>String(a.period_id)===String(period_id));

    // rebuild REPORT_INDEX (latest doc per key)
    REPORT_INDEX.clear();
    const latest = new Map();
    for (const v of vals){
      const k = `${String(v.period_id)}|${String(v.indicator_id)}|${String(v.unit_id)}`;
      const cur = latest.get(k);
      const tNew = Date.parse(v.updated_at||0);
      const tCur = cur ? Date.parse(cur.updated_at||0) : -1;
      if (!cur || tNew>=tCur) latest.set(k, v);
    }
    for (const [k,v] of latest){
      REPORT_INDEX.set(k, String(v.id || v.report_id || ''));
    }

    const depName=Object.fromEntries(DEPTS.map(d=>[String(d.department_id), d.department_name]));
    const unitName=Object.fromEntries(UNITS.map(u=>[String(u.unit_id), u.unit_name]));
    const vMap=new Map(vals.map(v=>[`${String(v.indicator_id)}|${String(v.unit_id)}`, v]));
    const aMap=new Map(acts.map(a=>[`${String(a.indicator_id)}|${String(a.unit_id)}`, a]));

    ROWS = IND.map(ind=>{
      const key=`${String(ind.indicator_id)}|${String(ind.unit_id)}`;
      const v=vMap.get(key)||{}, a=aMap.get(key)||{};
      const can_edit = SUPER || String(ind.owner_uid||'')===MY_UID || String(ind.unit_id||'')===MY_UNIT;

      return {
        period_id,
        indicator_id   : String(ind.indicator_id),
        indicator_name : ind.indicator_name,
        department_id  : String(ind.department_id),
        department_name: depName[String(ind.department_id)]||'',
        unit_id        : String(ind.unit_id),
        unit_name      : unitName[String(ind.unit_id)]||'',
        owner_uid      : String(ind.owner_uid||''),
        can_edit,
        value   : (v.value!=null)?v.value:null,
        target  : (v.target!=null)?v.target:null,
        report_id: String(v.id || v.report_id || REPORT_INDEX.get(`${period_id}|${key}`) || '') || null,
        action_id    : a.action_id || null,
        issue_text   : a.issue_text || '',
        action_text  : a.action_text || '',
        action_owner : a.action_owner || '',
        action_due   : a.action_due || '',
        action_status: a.action_status || '',
      };
    });

    // keep only DIRTY of current pid
    for (const [k,row] of Array.from(DIRTY.entries())){
      if (row.period_id!==period_id) DIRTY.delete(k);
    }
    setDirty(); setStatus(''); render();
  }

  /* ---------- Init sequence ---------- */
  await buildPeriodSelectorsFromDB(selYear, selPeriod, ()=>{ if(MASTERS) reloadPeriod(); });

  try{
    const [deps, units, inds, users] = await Promise.all([
      gasList('departments', { _ts:Date.now() }),
      gasList('units',       { _ts:Date.now() }),
      gasList('indicators',  { _ts:Date.now() }),
      gasList('users',       { _ts:Date.now() })
    ]);
    DEPTS=toArr(deps); UNITS=toArr(units); IND_ALL=toArr(inds); USERS=toArr(users);
    IND = SUPER
      ? IND_ALL.filter(i => (i?.active??true))
      : IND_ALL.filter(i => (i?.active??true) && (String(i.owner_uid||'')===MY_UID || String(i.unit_id||'')===MY_UNIT));

    fillDept(); fillUnit(selDept?.value||'');
    buildOwnerFilter();

    await reloadPeriod();
    MASTERS=true;
  }catch(e){
    console.error(e);
    setStatus('បរាជ័យផ្ទុកទិន្នន័យ');
    if (tbody) tbody.innerHTML=`<tr><td colspan="7" class="text-danger text-center py-4">មិនអាចទាញទិន្នន័យបាន</td></tr>`;
  }

  /* ---------- Input typing (no rerender, no autosave) ---------- */
  const cleanDecimalFree = s=>{
    s=String(s||'').replace(/[^\d.]/g,'');
    const i=s.indexOf('.'); if(i!==-1) s=s.slice(0,i+1)+s.slice(i+1).replace(/\./g,'');
    return s;
  };
  function markDirtyFromInput(inp){
    const key   = inp.dataset.key;
    const field = inp.dataset.field; if(!field) return;
    const [indicator_id, unit_id] = key.split('|');
    const period_id = curPid(); if(!period_id) return;
    const base = ROWS.find(r=>r.indicator_id===indicator_id && r.unit_id===unit_id) || {};
    const prev = DIRTY.get(key) || {
      indicator_id, unit_id, period_id,
      value: base.value ?? null, target: base.target ?? null,
      report_id: base.report_id || null
    };
    prev[field] = inp.value; // keep raw; convert at SAVE
    DIRTY.set(key, prev); setDirty();
  }
  if (tbody){
    tbody.addEventListener('input', e=>{
      const inp = e.target?.closest?.('.inp-val') ? e.target : (e.target?.classList?.contains('inp-val')?e.target:null);
      if (!inp) return;
      const cleaned = cleanDecimalFree(inp.value);
      if (inp.value!==cleaned) inp.value=cleaned;
      markDirtyFromInput(inp);
    });
  }

  /* ---------- UPSERT (update if exists else add) ---------- */
  async function saveOrUpdate(key){
    const row = DIRTY.get(key);
    if (!row) return;

    const period_id    = String(row.period_id);
    const indicator_id = String(row.indicator_id);
    const unit_id      = String(row.unit_id);
    const indexKey     = `${period_id}|${indicator_id}|${unit_id}`;

    // 1) try from REPORT_INDEX
    let docId = REPORT_INDEX.get(indexKey) || null;

    // 2) fallback query (strict)
    if (!docId){
      try{
        const res = await gasList('reports', { period_id, indicator_id, unit_id, _ts: Date.now() });
        const arr = toArr(res).filter(r =>
          String(r.period_id)===period_id &&
          String(r.indicator_id)===indicator_id &&
          String(r.unit_id)===unit_id
        );
        if (arr.length){
          arr.sort((a,b)=> Date.parse(b.updated_at||0) - Date.parse(a.updated_at||0));
          docId = String(arr[0].id || arr[0].report_id || '');
        }
      }catch{}
    }

    // 3) payload
    const payload = {
      period_id, indicator_id, unit_id,
      value : nOrNull(row.value),
      target: nOrNull(row.target),
      updated_at: new Date().toISOString()
    };
    if (docId) payload.id = docId; // UPDATE when present

    const res   = await gasSave('reports', payload);
    const saved = res?.row || res || {};
    const savedId = String(saved.id || saved.report_id || docId || '');

    // 4) reflect to client state
    const i = ROWS.findIndex(r => `${r.indicator_id}|${r.unit_id}`===key);
    if (i>=0){
      ROWS[i].value     = payload.value;
      ROWS[i].target    = payload.target;
      ROWS[i].report_id = savedId || ROWS[i].report_id || null;
    }
    REPORT_INDEX.set(indexKey, savedId);
    DIRTY.delete(key); setDirty();
  }

  /* ---------- Save All ---------- */
  btnSaveAll?.addEventListener('click', async ()=>{
    const keys = Array.from(DIRTY.keys());
    if (!keys.length){ setStatus('គ្មានអ្វីត្រូវរក្សាទុក'); return; }
    setStatus('កំពុងរក្សាទុកទាំងអស់…');
    for (const k of keys){ /* eslint-disable no-await-in-loop */ await saveOrUpdate(k); }
    await reloadPeriod(); // badge sync with DB
    setStatus('រក្សាទុករួចរាល់');
  });

  /* ---------- Copy previous (fill only DB-empties; keep badge) ---------- */
  btnCopy?.addEventListener('click', async ()=>{
    const pid = curPid(); if(!pid){ setStatus('សូមជ្រើសរើសរយៈពេល'); return; }
    const prev = prevPid(pid);
    setStatus('កំពុងយកតម្លៃរយៈពេលមុន…');
    try{
      const prevRows = toArr(await gasList('reports', { period_id: prev, _ts:Date.now() }))
                        .filter(r=>String(r.period_id)===String(prev));
      const mapPrev = new Map(prevRows.map(r=>[`${String(r.indicator_id)}|${String(r.unit_id)}`, r]));
      let changed=0;
      for (const r of ROWS){
        const key=`${r.indicator_id}|${r.unit_id}`;
        const pv=mapPrev.get(key); if(!pv) continue;
        const dbEmptyVal    = isEmptyVal(r.value);
        const dbEmptyTarget = isEmptyVal(r.target);
        if (dbEmptyVal || dbEmptyTarget){
          const pending = DIRTY.get(key) || {
            indicator_id:r.indicator_id, unit_id:r.unit_id, period_id:pid,
            value:r.value ?? null, target:r.target ?? null, report_id:r.report_id||null
          };
          if (dbEmptyVal)    pending.value  = pv.value;
          if (dbEmptyTarget) pending.target = pv.target;
          DIRTY.set(key, pending); changed++;
        }
      }
      setDirty(); render(); // badge still DB-based → remains “មិនទាន់បញ្ចូល”
      setStatus(`បានយកពីរយៈពេលមុន ${changed} ជួរ (សូមចុច "រក្សាទុកទាំងអស់")`);
    }catch(e){ console.error(e); setStatus('បរាជ័យយករយៈពេលមុន'); }
  });

  /* ---------- Issue/Action modal (indicator_id as string) ---------- */
  const mdlEl = R.querySelector('#mdlIssue');
  const frm   = R.querySelector('#frmIssue');
  const Modal = window.bootstrap?.Modal;
  const mdl   = (Modal && mdlEl) ? new Modal(mdlEl) : null;
  const f = {
    aid : R.querySelector('#f_action_id'),
    iid : R.querySelector('#f_indicator_id'),
    uid : R.querySelector('#f_unit_id'),
    iname: R.querySelector('#f_indicator_name'),
    plbl : R.querySelector('#f_period_label'),
    issue: R.querySelector('#f_issue_text'),
    act  : R.querySelector('#f_action_text'),
    owner: R.querySelector('#f_action_owner'),
    due  : R.querySelector('#f_action_due'),
    stat : R.querySelector('#f_action_status'),
    est  : R.querySelector('#editStatus')
  };
  tbody?.addEventListener('click', e=>{
    const btn=e.target.closest?.('button[data-act="issue"]'); if(!btn) return;
    const key=btn.dataset.key;
    const row=ROWS.find(r=>`${r.indicator_id}|${r.unit_id}`===key); if(!row) return;
    const pid=curPid();
    f.aid&&(f.aid.value=row.action_id||'');
    f.iid&&(f.iid.value=row.indicator_id);  // string
    f.uid&&(f.uid.value=row.unit_id);
    f.iname&&(f.iname.textContent=row.indicator_name||'');
    f.plbl&&(f.plbl.textContent=prettyPid(pid));
    f.issue&&(f.issue.value=row.issue_text||'');
    f.act&&(f.act.value=row.action_text||'');
    f.owner&&(f.owner.value=row.action_owner||'');
    f.due&&(f.due.value=row.action_due||'');
    f.stat&&(f.stat.value=row.action_status||'');
    f.est&&(f.est.textContent='');
    mdl?.show();
  });
  frm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const pid = curPid();
    const payload = {
      action_id   : (R.querySelector('#f_action_id')?.value || null),
      indicator_id: String(R.querySelector('#f_indicator_id')?.value || ''),
      unit_id     : String(R.querySelector('#f_unit_id')?.value || ''),
      period_id   : String(pid),
      issue_text  : (R.querySelector('#f_issue_text')?.value || '').trim(),
      action_text : (R.querySelector('#f_action_text')?.value || '').trim(),
      action_owner: (R.querySelector('#f_action_owner')?.value || '').trim(),
      action_due  : (R.querySelector('#f_action_due')?.value || ''),
      action_status: (R.querySelector('#f_action_status')?.value || '')
    };
    const btn = R.querySelector('#btnSaveIssue'); const old=btn?.innerHTML;
    if (btn){ btn.disabled=true; btn.innerHTML='កំពុងរក្សាទុក…'; }
    try{
      const res=await gasSave('actions', payload);
      const saved=res?.row||res||{};
      const idx=ROWS.findIndex(r=>r.indicator_id===payload.indicator_id && r.unit_id===payload.unit_id);
      if (idx>=0){
        ROWS[idx]={...ROWS[idx],
          action_id    : saved.action_id || ROWS[idx].action_id || null,
          issue_text   : payload.issue_text,
          action_text  : payload.action_text,
          action_owner : payload.action_owner,
          action_due   : payload.action_due,
          action_status: payload.action_status
        };
      }
      setStatus('រក្សាទុក Issue/Action រួចរាល់');
      mdl?.hide();
    }catch(err){
      console.error(err); f.est&&(f.est.textContent='បរាជ័យរក្សាទុក: '+(err?.message||err));
    }finally{ if (btn){ btn.disabled=false; btn.innerHTML=old||'រក្សាទុក'; } }
  });

  /* ---------- Filter events (re-render) ---------- */
  selDept?.addEventListener('change', ()=>{ fillUnit(selDept.value); render(); });
  selUnit?.addEventListener('change', ()=> render());
  selOwner?.addEventListener('change', ()=> render());
  inpSearch?.addEventListener('input', e=>{ FILTER_Q=(e.target.value||'').trim().toLowerCase(); render(); });
  swOnlyMy?.addEventListener('change', e=>{ ONLY_MY=!!e.target.checked; render(); });
  onlyEmpty?.addEventListener('change', e=>{ SHOW_ONLY_EMPTY=!!e.target.checked; render(); });

  /* ---------- Export (XLSX/PDF with fallback) ---------- */
  function getCurrentViewRows(){ try{ return applyFilters(ROWS); }catch{ return ROWS.slice(); } }
  function rowsForExport(rows, periodLabel){
    return rows.map(r=>({
      period: periodLabel || r.period_id || '',
      indicator_id: r.indicator_id||'',
      indicator_name: r.indicator_name||'',
      department: r.department_name||'',
      unit: r.unit_name||'',
      value: r.value==null?'':r.value,
      target: r.target==null?'':r.target,
      status: isEmptyVal(r.value)?'UNFILLED':'FILLED'
    }));
  }
  function rowsToCSV(rows){
    const header=['period','indicator_id','indicator_name','department','unit','value','target','status'];
    const lines=[header.join(',')];
    const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    for (const r of rows) lines.push([esc(r.period),esc(r.indicator_id),esc(r.indicator_name),esc(r.department),esc(r.unit),r.value??'',r.target??'',r.status].join(','));
    return lines.join('\n');
  }
  function exportExcel(){
    const pid=curPid(); const label=pid?prettyPid(pid):'period';
    const data=rowsForExport(getCurrentViewRows(), label);
    if (window.XLSX?.utils?.writeFile){
      const ws=XLSX.utils.json_to_sheet(data);
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reports');
      const cols=Object.keys(data[0]||{});
      ws['!cols']=cols.map(k=>({ wch: Math.min(Math.max(k.length, ...data.map(r=>String(r[k]??'').length))+2, 50) }));
      XLSX.writeFile(wb, `reports_${pid||'period'}.xlsx`);
      return;
    }
    const csv=rowsToCSV(data);
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`reports_${pid||'period'}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  function exportPdf(){
    const pid=curPid(); const label=pid?prettyPid(pid):'period';
    const rows=getCurrentViewRows();
    const hasJsPDF = window.jspdf?.jsPDF;
    const canAuto  = hasJsPDF && typeof window.jspdf.jsPDF.prototype.autoTable==='function';
    if (hasJsPDF && canAuto){
      const { jsPDF } = window.jspdf;
      const doc=new jsPDF({orientation:'landscape', unit:'pt', format:'A4'});
      doc.setFontSize(14); doc.text(`Reports • ${label}`,40,40);
      const body = rows.map(r=>[
        r.indicator_id||'', r.indicator_name||'', r.department_name||'', r.unit_name||'',
        r.value==null?'':r.value, r.target==null?'':r.target, isEmptyVal(r.value)?'UNFILLED':'FILLED'
      ]);
      doc.autoTable({
        startY:60,
        head:[['ID','Indicator','Department','Unit','Value','Target','Status']],
        body, styles:{fontSize:9, cellPadding:4}, headStyles:{fillColor:[240,240,240]},
        columnStyles:{0:{cellWidth:90},1:{cellWidth:260},2:{cellWidth:160},3:{cellWidth:140},4:{cellWidth:90,halign:'right'},5:{cellWidth:90,halign:'right'},6:{cellWidth:110}}
      });
      doc.save(`reports_${pid||'period'}.pdf`); return;
    }
    const win=window.open('','_blank'); const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    win.document.write(`
      <html><head><meta charset="utf-8"><title>Reports • ${esc(label)}</title>
      <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}
      th{background:#f5f5f5}.num{text-align:right}
      .status-FILLED{color:#155724;background:#e7f7e7;border:1px solid #b7e4c7;padding:2px 6px;border-radius:4px}
      .status-UNFILLED{color:#7a5d00;background:#fff3cd;border:1px solid #ffe69c;padding:2px 6px;border-radius:4px}</style>
      </head><body><h2>Reports • ${esc(label)}</h2>
      <table><thead><tr><th style="width:90px">ID</th><th style="width:360px">Indicator</th><th style="width:200px">Department</th><th style="width:160px">Unit</th><th style="width:110px">Value</th><th style="width:110px">Target</th><th style="width:120px">Status</th></tr></thead>
      <tbody>${
        rows.map(r=>`<tr><td>${esc(r.indicator_id)}</td><td>${esc(r.indicator_name)}</td><td>${esc(r.department_name)}</td><td>${esc(r.unit_name)}</td><td class="num">${esc(r.value==null?'':r.value)}</td><td class="num">${esc(r.target==null?'':r.target)}</td><td><span class="status-${isEmptyVal(r.value)?'UNFILLED':'FILLED'}">${isEmptyVal(r.value)?'UNFILLED':'FILLED'}</span></td></tr>`).join('')
      }</tbody></table><script>window.onload=()=>window.print()</script></body></html>
    `);
    win.document.close();
  }
  $('#btnExportXlsx')?.addEventListener('click', exportExcel);
  $('#btnExportPdf')?.addEventListener('click', exportPdf);
}
