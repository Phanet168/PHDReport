// ===== Utilities =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function setSrcLabel(url){ $('#srcLabel').textContent = url || '(not set)'; }

// Load/save API URL (Settings)
const API_KEY = 'HC_API_URL';
function getApiUrl(){ return localStorage.getItem(API_KEY) || window.APPSCRIPT_URL; }
function setApiUrl(u){ localStorage.setItem(API_KEY, u); setSrcLabel(u); }

// Mirror desktop/mobile filter selects
function syncFiltersToMobile(){
  $('#per_m').innerHTML = $('#per').innerHTML;
  $('#org_m').innerHTML = $('#org').innerHTML;
  $('#orgType_m').value = $('#orgType').value;
  $('#per_m').value = $('#per').value;
  $('#org_m').value = $('#org').value;
}

// ===== Data + Render =====
let allRows = [];
let barChart;

async function loadJSON(){
  const url = getApiUrl();
  setSrcLabel(url);
  $('#hint').textContent = 'Loading…';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();

  allRows = (data.report_values || []).map(r => ({
    org_unit_id: String(r.org_unit_id||'').trim(),
    org_type: String(r.org_type||'').trim(),
    period_id: String(r.period_id||'').trim(),
    indicator_id: String(r.indicator_id||'').trim(),
    age_group: String(r.age_group||'').trim(),
    sex: String(r.sex||'').trim(),
    icd10_code: String(r.icd10_code||'').trim(),
    value_num: Number(r.value_num ?? r.value ?? 0),
    source_note: String(r.source_note||'').trim()
  }));

  // Build filter lists
  const periods = Array.from(new Set(allRows.map(r=>r.period_id))).filter(Boolean).sort().reverse();
  const orgs = Array.from(new Set(allRows.map(r=>r.org_unit_id))).filter(Boolean).sort();

  $('#per').innerHTML = periods.map(p=>`<option>${p}</option>`).join('');
  $('#org').innerHTML = '<option value="">All</option>' + orgs.map(o=>`<option>${o}</option>`).join('');

  // choose latest
  $('#per').value = periods[0] || '';
  syncFiltersToMobile();

  $('#hint').textContent = `Loaded ${allRows.length} rows`;
  applyFilters();
}

function applyFilters(isMobile=false){
  // read from either desktop or mobile controls
  const per = (isMobile ? $('#per_m') : $('#per')).value;
  const orgType = (isMobile ? $('#orgType_m') : $('#orgType')).value;
  const org = (isMobile ? $('#org_m') : $('#org')).value;

  let rows = allRows;
  if (per) rows = rows.filter(r=>r.period_id===per);
  if (orgType) rows = rows.filter(r=>r.org_type===orgType);
  if (org) rows = rows.filter(r=>r.org_unit_id===org);

  // KPIs
  let deaths=0, disch=0, opd=0, ipd=0;
  const sums = {};
  for(const r of rows){
    const v = r.value_num || 0;
    sums[r.indicator_id] = (sums[r.indicator_id]||0)+v;
    if(r.indicator_id==='IPD_003') deaths+=v;
    if(r.indicator_id==='IPD_002') disch+=v;
    if(r.indicator_id==='OPD_REF') opd+=v;
    if(r.indicator_id==='IPD_REF') ipd+=v;
  }
  const rate = disch ? Math.round(10000*deaths/disch)/100 : 0;
  $('#kpiMort').textContent = `${deaths} / ${disch} → ${rate}%`;
  $('#kpiRef').textContent = `OPD ${opd} • IPD ${ipd}`;
  const top = Object.entries(sums).sort((a,b)=>b[1]-a[1])[0];
  $('#kpiTop').textContent = top ? `${top[0]}: ${top[1]}` : '—';
  $('#hint').textContent = `Showing ${rows.length} rows • ${org||'All'} ${orgType||''} @ ${per||'latest'}`;

  // Chart top 10
  const top10 = Object.entries(sums).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const labels = top10.map(x=>x[0]); const vals = top10.map(x=>x[1]);
  const ctx = document.getElementById('barTop');
  if(!barChart){
    barChart = new Chart(ctx, { type:'bar',
      data:{labels, datasets:[{label:'Total', data:vals}]},
      options:{responsive:true, plugins:{legend:{display:false}}, scales:{x:{ticks:{maxRotation:45}}}}
    });
  } else {
    barChart.data.labels = labels; barChart.data.datasets[0].data = vals; barChart.update();
  }

  // Table preview
  renderTable(rows.slice(0, 500));
}

function renderTable(rows){
  const cols = ['org_unit_id','org_type','period_id','indicator_id','age_group','sex','icd10_code','value_num','source_note'];
  let html = '<table class="table table-sm mb-0"><thead><tr>' + cols.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  for(const r of rows){
    html += '<tr>' + cols.map(c=>`<td>${r[c]??''}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  $('#tblWrap').innerHTML = html;
}

// ===== Nav handling in right menu =====
function showScreen(id){
  $$('.nav-screen').forEach(s=>s.classList.add('d-none'));
  $(id).classList.remove('d-none');
  // close offcanvas on click (mobile)
  const oc = bootstrap.Offcanvas.getOrCreateInstance('#rightMenu');
  oc.hide();
}

function setupNav(){
  $$('#rightMenu [data-nav]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      $$('#rightMenu .list-group-item').forEach(x=>x.classList.remove('active'));
      a.classList.add('active');
      showScreen('#'+a.dataset.nav);
    });
  });
}

// ===== Settings handlers =====
function setupSettings(){
  $('#apiInput').value = getApiUrl();
  $('#saveApi').addEventListener('click', ()=>{
    const u = $('#apiInput').value.trim();
    if(!u){ alert('Provide Apps Script URL'); return; }
    setApiUrl(u);
    loadJSON().catch(err=>$('#hint').textContent = 'ERROR: '+err.message);
  });
}

// ===== Events =====
document.addEventListener('DOMContentLoaded', ()=>{
  // Desktop refresh
  $('#btnRefresh').addEventListener('click', ()=>applyFilters(false));
  // Mobile refresh
  $('#btnRefresh_m').addEventListener('click', ()=>applyFilters(true));

  setupNav();
  setupSettings();
  // initial
  loadJSON().catch(err=>$('#hint').textContent = 'ERROR: ' + err.message);
});
// ===== Import Data (Convert Excel -> JSON -> Upload to Apps Script) =====

// (ជម្រើស) ប្រើ URL ដូច Settings; បើអ្នកចង់បែងចែក read vs upload អ្នកអាចធ្វើ៖
// const UPLOAD_URL = 'https://script.google.com/macros/s/xxxx/exec'; // doPost
function getUploadUrl(){ return getApiUrl().split('?')[0]; } // strip ?mode=latest → post to /exec

async function convertExcelToJson(file){
  // 1) Read as ArrayBuffer
  const buf = await file.arrayBuffer();
  // 2) Parse workbook
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });

  // === RULES ===
  // - ប្រើសន្លឹក: report_values_template, issues_template, actions_template
  // - ជួរឈរ (headers) ត្រូវតាម template: org_unit_id, org_type, period_id, indicator_id, value/value_num, ...
  // - បើមិនមាន org_type/period_id នៅក្នុង sheet, អាចបន្ថែមពី metadata នៅ UI
  const pick = (name) => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name]) : [];

  const rv = pick('report_values_template').map(r => ({
    org_unit_id: String(r.org_unit_id||'').trim(),
    org_type:    String(r.org_type||'').trim(),
    period_id:   String(r.period_id||'').trim(),
    indicator_id:String(r.indicator_id||'').trim(),
    age_group:   String(r.age_group||'').trim(),
    sex:         String(r.sex||'').trim(),
    icd10_code:  String(r.icd10_code||'').trim(),
    value_num:   Number(r.value_num ?? r.value ?? 0),
    source_note: String(r.source_note||'').trim()
  }));

  const issues = pick('issues_template').map(r => ({
    issue_id:    String(r.issue_id||'').trim(),
    org_unit_id: String(r.org_unit_id||'').trim(),
    period_id:   String(r.period_id||'').trim(),
    title:       String(r.title||'').trim(),
    description: String(r.description||'').trim(),
    category:    String(r.category||'').trim(),
    severity:    String(r.severity||'').trim(),
    owner:       String(r.owner||'').trim(),
    due_date:    r.due_date ? new Date(r.due_date).toISOString().slice(0,10) : '',
    status:      String(r.status||'open').trim()
  }));

  const actions = pick('actions_template').map(r => ({
    action_id:    String(r.action_id||'').trim(),
    issue_id:     String(r.issue_id||r.issue_external_ref||'').trim(),
    action_desc:  String(r.action_desc||'').trim(),
    responsible:  String(r.responsible||'').trim(),
    deadline:     r.deadline ? new Date(r.deadline).toISOString().slice(0,10) : '',
    progress_pct: Number(r.progress_pct ?? r.progress ?? 0),
    status:       String(r.status||'ongoing').trim()
  }));

  return { report_values: rv, issues, actions };
}

function setImpProgress(pct){
  const el = document.getElementById('imp_progress');
  if(!el) return;
  el.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function logImp(msg){
  const el = document.getElementById('imp_log');
  if(!el) return;
  el.textContent += (el.textContent ? '\n' : '') + msg;
}

async function handleConvertAndUpload(){
  const f = document.getElementById('imp_file').files[0];
  const period = document.getElementById('imp_period').value.trim();
  const orgType = document.getElementById('imp_orgType').value.trim();
  const uploadUrl = getUploadUrl();

  if(!f){ alert('សូមជ្រើស Excel (.xlsx) ជាមុនសិន'); return; }

  // Reset UI
  document.getElementById('imp_log').textContent = '';
  setImpProgress(5);
  logImp('Reading Excel…');

  try{
    // 1) Convert
    const json = await convertExcelToJson(f);
    setImpProgress(50);
    logImp(`Converted: rv=${json.report_values.length}, issues=${json.issues.length}, actions=${json.actions.length}`);

    // 2) Merge metadata (optional override if sheet lacks them)
    if(period){
      json.report_values = json.report_values.map(r => ({...r, period_id: r.period_id || period}));
      json.issues        = json.issues.map(r => ({...r, period_id: r.period_id || period}));
    }
    if(orgType){
      json.report_values = json.report_values.map(r => ({...r, org_type: r.org_type || orgType}));
    }

    // 3) POST JSON to Apps Script (doPost) → Drive
    setImpProgress(70);
    logImp('Uploading JSON to Google Drive via Apps Script…');

    const resp = await fetch(uploadUrl, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        period_id: period || null,
        org_type: orgType || null,
        filename_hint: f.name,
        ...json
      })
    });

    const out = await resp.json().catch(()=>({ok:false, error:'Cannot parse response'}));
    setImpProgress(100);
    logImp('Server response: ' + JSON.stringify(out, null, 2));

    if(out.ok){
      alert('✅ Import success! JSON stored in Google Drive.\n' + (out.file ? ('File: '+out.file) : ''));
    }else{
      alert('⚠️ Import finished with errors. See log.');
    }
  }catch(e){
    setImpProgress(0);
    logImp('ERROR: ' + e.message);
    alert('បរាជ័យ: ' + e.message);
  }
}

// Bind button
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('btn_convert_upload');
  if(btn) btn.addEventListener('click', handleConvertAndUpload);
});

