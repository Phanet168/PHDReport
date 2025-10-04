// assets/js/pages/issues.page.js
// Page module for "#/issues" — Khmer UI, grouped by Department → Unit,
// sorted by department_id → unit_id → indicator_name → due date.
// ▶️ Added: Top-bar notification hook via window.setIssueAlert(stats) (method #1).
import { getAuth, isSuper } from '../app.auth.js';
import { gasList, gasDelete, ID_FIELDS } from '../app.api.firebase.js';

export default async function issuesPage(root, ctx) {
  /* ====== CONFIG: GAS Web App (Google Docs → PDF) ====== */
  const GAS_WEBAPP = 'https://script.google.com/macros/s/AKfycbwdPlP8f91XpvW7142HUnTRwHVVK4dMWNwMprUVzwIIRxMdIZBPERvxpU6LBoIJStolag/exec';

  /* ====== Role ====== */
  const SUPER = isSuper?.() || (String((getAuth?.()||{}).role||'').toLowerCase()==='super');

  /* ====== DOM (scoped to root) ====== */
  const $  = s => root.querySelector(s);
  const $$ = s => Array.from(root.querySelectorAll(s));

  const tbody   = $("#tblIssues tbody");
  const thead   = $("#tblIssues thead");
  const sumEl   = $("#issuesSummary");
  const segBtns = $$(".segbtn");
  const ySel    = $("#ySel");
  const tagWrap = $("#tagWrap");
  const tagSel  = $("#tagSel");
  const btnApply= $("#btnApply");
  const btnReset= $("#btnReset");
  const btnPdf  = $("#btnDownloadPdf");
  if (!tbody || !thead || !sumEl) return;

  document.documentElement.classList.toggle("is-super", !!SUPER);

  /* ====== Utils ====== */
  const KH_MONTHS=['មករា','កុម្ភៈ','មិនា','មេសា','ឧសភា','មិថុនា','កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtDate=s=>{
    if(!s) return '';
    const d=new Date(s); if (Number.isNaN(+d)) return esc(s);
    const dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0'), yy=d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  const pretty=(y,t)=>!y||!t?''
    : /^M\d{2}$/.test(t) ? `${KH_MONTHS[+t.slice(1)-1]} ${y}`
    : /^Q[1-4]$/.test(t) ? `ត្រីមាស ${t.slice(1)} • ${y}`
    : /^H[12]$/.test(t) ? `ឆមាស ${t.slice(1)} • ${y}`
    : t==='Y12' ? `ឆ្នាំ ${y}` : `${y} ${t}`;
  const khStatusLabel = (s) => {
    const v = String(s||'').toLowerCase();
    if (v === 'planned')  return 'បានគ្រោង';
    if (v === 'ongoing' || v === 'in-progress') return 'កំពុងដំណើរការ';
    if (v === 'done' || v === 'completed') return 'បានបញ្ចប់';
    if (v === 'blocked') return 'មានឧបសគ្គ';
    return 'កំពុងរៀបចំ';
  };
  const statusClass = (s)=>{
    const v = String(s||'').toLowerCase();
    if (v==='done' || v==='completed') return 'status-done';
    if (v==='ongoing' || v==='in-progress') return 'status-progress';
    if (v==='blocked') return 'status-blocked';
    if (v==='planned') return 'status-pending';
    return 'status-pending';
  };
  const periodToSortable=(y,t)=>{t=String(t||'').toUpperCase();
    if(/^M\d{2}$/.test(t))return y*10000+(+t.slice(1));
    if(/^Q[1-4]$/.test(t))return y*10000+(['Q1','Q2','Q3','Q4'].indexOf(t)+1)*100;
    if(/^H[12]$/.test(t))return y*10000+(t==='H1'?10:20)*100;
    if(t==='Y12')return y*10000+9999; return y*10000;};

  // Khmer-friendly code compare (ID/code like 01, 1.1 etc.)
  const cmpCode = (a,b)=>{
    const sa=String(a??''), sb=String(b??'');
    return sa.localeCompare(sb, 'km-KH', {numeric:true, sensitivity:'base'});
  };

  // safe base64url(JSON) for GAS form
  function toB64UTF8(obj) {
    const s = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(s);
    let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }

  /* ====== State ====== */
  let MODE='all', sortBy=null, sortDir=1; // header visual only
  let ALL=[];
  const PERIOD={
    months:['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12'],
    quarters:['Q1','Q2','Q3','Q4'],
    halves:['H1','H2']
  };
  const SORT_KEYS=[ // just for header arrow
    {idx:0,key:'indicator_name',type:'text'},
    {idx:1,key:'period_sort',type:'number'},
    {idx:2,key:'issue_text',type:'text'},
    {idx:3,key:'action_text',type:'text'},
    {idx:4,key:'action_owner',type:'text'},
    {idx:5,key:'action_due',type:'date'},
    {idx:6,key:'action_status',type:'text'},
  ];

  /* ====== Skeleton while loading ====== */
  (function skeleton(n=6){
    tbody.innerHTML='';
    for(let i=0;i<n;i++){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><div class="skel" style="width:70%"></div><div class="skel mt-1" style="width:40%"></div></td>
      <td><div class="skel" style="width:80px"></div></td><td><div class="skel"></div></td>
      <td><div class="skel"></div></td><td><div class="skel" style="width:120px"></div></td>
      <td><div class="skel" style="width:84px"></div></td><td><div class="skel" style="width:160px"></div></td>`;
      tbody.appendChild(tr);
    }
  })();

  /* ====== Lookups & data ====== */
  const [indicators, units, depts] = await Promise.all([
    gasList('indicators').catch(()=>[]),
    gasList('units').catch(()=>[]),
    gasList('departments').catch(()=>[]),
  ]);

  // Meta maps
  const indById  = new Map((indicators||[]).map(i=>[String(i.indicator_id), i]));
  const unitMeta = new Map((units||[]).map(u=>[
    String(u.unit_id),
    { name: u.unit_name, code: u.unit_code || u.code || u.unit_id }
  ]));
  const deptMeta = new Map((depts||[]).map(d=>[
    String(d.department_id),
    { name: d.department_name, code: d.department_code || d.code || d.department_id }
  ]));

  const unitName= Object.fromEntries((units||[]).map(u=>[String(u.unit_id), u.unit_name]));
  const deptName= Object.fromEntries((depts||[]).map(d=>[String(d.department_id), d.department_name]));

  async function loadActionsSmart(){
    const d = new Date();
    const y = d.getFullYear();
    const m = 'M' + String(d.getMonth()+1).padStart(2,'0');
    let rows = await gasList('actions',{year:y,month:m}).catch(()=>[]);
    if (!rows.length) rows = await gasList('actions').catch(()=>[]);
    return rows;
  }

  /* ====== Normalize client-side ====== */
  ALL = (await loadActionsSmart()).map(a => {
    let year = a.year;
    let tag  = a.month || a.tag;
    const pid = String(a.period_id || '').trim();
    if ((!year || !tag) && /^\d{4}-\d{2}$/.test(pid)) {
      year = parseInt(pid.slice(0, 4), 10);
      tag  = 'M' + pid.slice(5, 7);
    }
    const action_id = a.action_id || a.id || a.doc_id || '';
    const ind = indById.get(String(a.indicator_id));
    const indicator_name = a.indicator_name || ind?.indicator_name || '';
    const department_id  = a.department_id ?? ind?.department_id ?? '';
    const unit_id        = a.unit_id ?? ind?.unit_id ?? '';

    return {
      ...a,
      action_id,
      year,
      month: tag,
      indicator_name,
      department_id,
      unit_id,
      department_name: a.department_name || deptName[String(department_id)] || '',
      unit_name      : a.unit_name       || (unit_id ? (unitName[String(unit_id)]||'') : ''),
      period_sort: periodToSortable(year || 0, tag || '')
    };
  });

  /* ====== Filter helpers ====== */
  function buildYearOptions(list){
    const years=[...new Set(list.map(a=>a.year).filter(Boolean))].sort((a,b)=>b-a);
    const opts = ['<option value="">ទាំងអស់</option>'].concat(years.map(y=>`<option value="${y}">${y}</option>`));
    if (ySel) ySel.innerHTML = opts.join('');
  }
  function fillTagOptions(){
    if (!tagSel) return;
    let opts='';
    if (MODE==='month')     opts = PERIOD.months.map(t=>`<option value="${t}">${t}</option>`).join('');
    else if (MODE==='quarter') opts = PERIOD.quarters.map(t=>`<option value="${t}">${t}</option>`).join('');
    else if (MODE==='half')    opts = PERIOD.halves.map(t=>`<option value="${t}">${t}</option>`).join('');
    tagSel.innerHTML = `<option value="">ទាំងអស់</option>` + opts;
    if (tagWrap) tagWrap.style.display = (MODE==='month'||MODE==='quarter'||MODE==='half') ? '' : 'none';
  }
  function setHeaderMark(){
    thead.querySelectorAll('th').forEach(th=>{ th.classList.remove('sorted-asc','sorted-desc'); th.querySelector('.sort-mark')?.remove(); });
    if(sortBy==null) return;
    const conf=SORT_KEYS.find(c=>c.key===sortBy); if(!conf) return;
    const th=thead.querySelectorAll('th')[conf.idx];
    const m=document.createElement('span'); m.className='sort-mark'; m.textContent= sortDir===1?' ▲':' ▼';
    th.appendChild(m); th.classList.add(sortDir===1?'sorted-asc':'sorted-desc');
  }

  // ✅ Filter checker (ឆ្នាំ + ប្រភេទ)
  function matches(a, mode, year, tag){
    const yOk = !year || String(a.year) === String(year);
    const t = String(a.month || a.tag || '').toUpperCase();

    if (mode === 'all') return yOk;
    if (!yOk) return false;

    if (mode === 'year')    return t === 'Y12';
    if (mode === 'month')   return /^M\d{2}$/.test(t) && (!tag || t === tag);
    if (mode === 'quarter') return /^Q[1-4]$/.test(t) && (!tag || t === tag);
    if (mode === 'half')    return /^H[12]$/.test(t) && (!tag || t === tag);
    return true;
  }

  /* ====== Grouped render (Department → Unit) ====== */
  function renderRowsGrouped(rows){
    if(!rows.length){
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">គ្មានទិន្នន័យ</td></tr>`;
      return;
    }

    // ស្រង់ department ids មាននៅក្នុង rows ហើយតម្រៀបតាម department_id (code-friendly)
    const deptIds = [...new Set(rows.map(r => String(r.department_id||'')).map(x=>x||'@NA'))]
      .sort((a,b)=>cmpCode(a,b));

    const frag = document.createDocumentFragment();
    let dIdx = 0;

    for (const depId of deptIds) {
      dIdx++;
      const dMeta = deptMeta.get(depId) || { name: (depId==='@NA'?'(គ្មានជំពូក)':'ការិយាល័យ '+depId), code: depId };
      const depRows = rows.filter(r => String(r.department_id||'@NA') === depId);

      // Header ការិយាល័យ
      const trDep = document.createElement('tr');
      trDep.className = 'table-active';
      trDep.innerHTML = `<td colspan="7" class="fw-semibold">${dIdx}. ${esc(dMeta.name)}</td>`;
      frag.appendChild(trDep);

      // Units (តម្រៀបតាម unit_id)
      const unitIds = [...new Set(depRows.map(r => String(r.unit_id||'')).map(x=>x||'@NA'))]
        .sort((a,b)=>cmpCode(a,b));
      let uIdx = 0;

      for (const uId of unitIds) {
        uIdx++;
        const uMeta = unitMeta.get(uId) || { name: (uId==='@NA'?'(គ្មានផ្នែក)':'ផ្នែក '+uId), code: uId };
        const unitRows = depRows.filter(r => String(r.unit_id||'@NA') === uId);

        // Header ផ្នែក
        const trUnit = document.createElement('tr');
        trUnit.innerHTML = `<td colspan="7" class="ps-3"><span class="fw-semibold">${dIdx}.${uIdx} ${esc(uMeta.name)}</span></td>`;
        frag.appendChild(trUnit);

        // តម្រៀបក្នុងផ្នែកតាមឈ្មោះសូចនាករ (បង្ហាញតែឈ្មោះ), បន្ទាប់មកតាមកាលកំណត់
        const sorted = unitRows.slice().sort((a,b)=>{
          const byName = String(a.indicator_name||'').localeCompare(String(b.indicator_name||''), 'km-KH', {sensitivity:'base'});
          if (byName !== 0) return byName;
          const da = a.action_due?+new Date(a.action_due):0;
          const db = b.action_due?+new Date(b.action_due):0;
          return da - db;
        });

        for (const a of sorted){
          const ind=indById.get(String(a.indicator_id));
          const depLbl= dMeta.name || '';
          const unitLbl= uMeta.name || '';
          const actionId = a.action_id ?? a.actionId ?? a.id ?? '';

          const tr=document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="fw-semibold">${esc(ind?.indicator_name || a.indicator_name || '(គ្មានឈ្មោះសូចនាករ)')}</div>
            </td>
            <td>${esc(pretty(a.year, a.month || a.tag))}</td>
            <td>${esc(a.issue_text || '')}</td>
            <td>${esc(a.action_text || '')}</td>
            <td>${esc(Array.isArray(a.action_owner)?a.action_owner.join(', '):(a.action_owner||''))}</td>
            <td>${fmtDate(a.action_due)}</td>
            <td class="text-end">
              <span class="badge-status ${statusClass(a.action_status)}">${esc(khStatusLabel(a.action_status))}</span>
              ${ (SUPER && actionId) ? `<button class="btn btn-sm btn-outline-danger ms-2 btn-del" data-del="${esc(actionId)}">លុប</button>` : '' }
            </td>`;
          frag.appendChild(tr);
        }
      }
    }
    tbody.replaceChildren(frag);
  }

  /* ====== Summary & Notification Hook ====== */
  function updateSummary(rows){
    const low=v=>String(v||'').toLowerCase();
    const planned=rows.filter(a=>low(a.action_status)==='planned').length;
    const ongoing=rows.filter(a=>low(a.action_status)==='ongoing' || low(a.action_status)==='in-progress').length;
    const done   =rows.filter(a=>low(a.action_status)==='done' || low(a.action_status)==='completed').length;
    const blocked=rows.filter(a=>low(a.action_status)==='blocked').length;
    sumEl.textContent=`សរុប ${rows.length} • បានគ្រោង ${planned} • កំពុងដំណើរការ ${ongoing} • បានបញ្ចប់ ${done} • ឧបសគ្គ ${blocked}`;
  }
  // ▶️ New: stats for top-bar notification
  function calcStats(rows){
    const low=v=>String(v||'').toLowerCase();
    return {
      total  : rows.length,
      planned: rows.filter(a=>low(a.action_status)==='planned').length,
      ongoing: rows.filter(a=>['ongoing','in-progress'].includes(low(a.action_status))).length,
      done   : rows.filter(a=>['done','completed'].includes(low(a.action_status))).length,
      blocked: rows.filter(a=>low(a.action_status)==='blocked').length
    };
  }

  /* ====== First paint ====== */
  buildYearOptions(ALL);
  renderRowsGrouped(ALL);
  updateSummary(ALL);
  if (window.setIssueAlert) window.setIssueAlert(calcStats(ALL)); // ▶️ notify top bar
  setHeaderMark();
  fillTagOptions();

  /* ====== Events ====== */
  const onSegClick = (e)=>{
    const b = e.currentTarget;
    segBtns.forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); MODE=b.dataset.type; fillTagOptions();
  };
  segBtns.forEach(b=>b.addEventListener('click', onSegClick));

  const currentBase = ()=>{
    const year=String(ySel?.value||'');
    const tag = tagSel?String(tagSel.value||'').toUpperCase():'';
    return (MODE==='all') ? ALL : ALL.filter(a=>matches(a, MODE, year, tag));
  };

  const onApply = ()=>{
    const rows=currentBase();
    renderRowsGrouped(rows);
    updateSummary(rows);
    if (window.setIssueAlert) window.setIssueAlert(calcStats(rows)); // ▶️ notify after filter apply
    setHeaderMark();
  };
  btnApply?.addEventListener('click', onApply);

  const onReset = ()=>{
    MODE='all'; segBtns.forEach(x=>x.classList.toggle('active',x.dataset.type==='all')); fillTagOptions();
    if (ySel) ySel.value=''; if (tagSel) tagSel.value='';
    renderRowsGrouped(ALL);
    updateSummary(ALL);
    if (window.setIssueAlert) window.setIssueAlert(calcStats(ALL)); // ▶️ notify after reset
    sortBy=null; sortDir=1; setHeaderMark();
  };
  btnReset?.addEventListener('click', onReset);

  // Header click: visual only
  const onHeadClick = (e)=>{
    const th=e.target.closest('th'); if(!th) return;
    const idx=[...thead.querySelectorAll('th')].indexOf(th);
    const conf=SORT_KEYS.find(c=>c.idx===idx); if(!conf) return;
    if(sortBy===conf.key){ sortDir*=-1; } else { sortBy=conf.key; sortDir=1; }
    setHeaderMark();
  };
  thead.addEventListener('click', onHeadClick);

  /* ====== Delete (SUPER only) ====== */
  const onTbodyClick = async (e)=>{
    const btn = e.target.closest('button[data-del]'); if(!btn) return;
    const id  = btn.getAttribute('data-del'); if(!id) return alert('មិនមាន action_id ដើម្បីលុប');
    if(!confirm('លុបធាតុនេះមែនទេ?')) return;
    try{
      const idField = (window.ID_FIELDS && window.ID_FIELDS.actions) || 'action_id';
      await gasDelete('actions', idField, id);
      ALL = ALL.filter(r => String(r.action_id ?? r.actionId ?? r.id) !== String(id));
      const rows=currentBase();
      renderRowsGrouped(rows);
      updateSummary(rows);
      if (window.setIssueAlert) window.setIssueAlert(calcStats(rows)); // ▶️ notify after delete
    }catch(err){ console.error(err); alert('បរាជ័យលុប: '+(err?.message||err)); }
  };
  if (SUPER) tbody.addEventListener('click', onTbodyClick, { passive:true });

  /* ======================== Google Docs PDF (Form POST → GAS) ======================== */
  function ensureHiddenForm(){
    let form = document.getElementById('pdfForm');
    if (!form){
      form = document.createElement('form');
      form.id = 'pdfForm';
      form.action = `${GAS_WEBAPP}?route=issuesPdf&dl=1`;
      form.method = 'POST';
      form.target = '_blank';
      form.enctype = 'application/x-www-form-urlencoded';
      form.acceptCharset = 'utf-8';
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.id   = 'payloadB64';
      form.appendChild(input);
      document.body.appendChild(form);
    }
    return form;
  }
  function gatherMetaRows(){
    const year = String(ySel?.value || new Date().getFullYear());
    const activeBtn = root.querySelector('.segbtn.active');
    const CUR_MODE = activeBtn ? activeBtn.dataset.type : MODE;
    const tag  = tagSel ? String(tagSel.value || '').toUpperCase() : '';

    const base = (CUR_MODE==='all') ? (ALL||[]) : (ALL||[]).filter(a=>matches(a, CUR_MODE, year, tag));

    const rows = base.slice()
      .sort((a,b)=>{
        // same order as table: dept -> unit -> name -> due
        const c1 = cmpCode(a.department_id, b.department_id); if (c1) return c1;
        const c2 = cmpCode(a.unit_id, b.unit_id); if (c2) return c2;
        const c3 = String(a.indicator_name||'').localeCompare(String(b.indicator_name||''), 'km-KH', {sensitivity:'base'}); if (c3) return c3;
        const da=a.action_due?+new Date(a.action_due):0, db=b.action_due?+new Date(b.action_due):0;
        return da-db;
      })
      .map(a=>({
        indicator_id   : a.indicator_id,
        indicator_name : a.indicator_name,
        department_name: a.department_name,
        unit_name      : a.unit_name,
        year           : a.year,
        month          : a.month || a.tag,
        issue_text     : a.issue_text,
        action_text    : a.action_text,
        action_owner   : Array.isArray(a.action_owner)? a.action_owner.join(', ') : (a.action_owner||''),
        action_due     : a.action_due || '',
        action_status  : a.action_status || ''
      }));

    const meta = {
      year,
      tag : (CUR_MODE==='all') ? '' : (tag || ('M'+String(new Date().getMonth()+1).padStart(2,'0'))),
      summaryText: (sumEl?.textContent || '').trim(),
      org1:'មន្ទីរសុខាភិបាលខេត្ត',
      org2:'ផ្នែកផែនការ និងត្រួតពិនិត្យ',
      title1:'របាយការណ៍បញ្ហាប្រឈម',
      title2:'និង សកម្មភាព ដោះស្រាយ'
    };
    return { meta, rows };
  }
  function triggerDocsPdf(){
    const { meta, rows } = gatherMetaRows();
    if (!Array.isArray(rows) || rows.length === 0) {
      alert('មិនមាន rows ដើម្បីបង្កើត PDF ទេ');
      return;
    }
    const form  = ensureHiddenForm();
    const input = document.getElementById('payloadB64');
    if (!form || !input) { alert('មិនអាចបង្កើតសំណើរ PDF បានទេ'); return; }
    try { input.value = toB64UTF8({ meta, rows }); }
    catch (err) { console.error('Encode payload fail:', err); alert('បរាជ័យ encode ទិន្នន័យ'); return; }
    form.submit();
  }
  const onPdf = ()=>{
    if (!btnPdf) return;
    const label = btnPdf.textContent;
    btnPdf.disabled = true; btnPdf.textContent = 'កំពុងបង្កើត…';
    try { triggerDocsPdf(); }
    finally { setTimeout(()=>{ btnPdf.disabled=false; btnPdf.textContent=label; }, 800); }
  };
  btnPdf?.addEventListener('click', onPdf, { passive:true });

  /* ====== Cleanup ====== */
  return () => {
    segBtns.forEach(b=>b.removeEventListener('click', onSegClick));
    btnApply?.removeEventListener('click', onApply);
    btnReset?.removeEventListener('click', onReset);
    thead.removeEventListener('click', onHeadClick);
    if (SUPER) tbody.removeEventListener('click', onTbodyClick, { passive:true });
    btnPdf?.removeEventListener('click', onPdf);
  };
}

export function getTitle() {
  return 'បញ្ហាប្រឈម & សកម្មភាព | PHD Report';
}
